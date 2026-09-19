"""Low-latency camera reader used by the authenticated backend proxy.

The old desktop client used FFmpeg for RTSP and an HTTP snapshot fallback. The
same approach lives here now so the browser never opens RTSP directly and the
backend can recover when an EZVIZ/Hikvision stream stops delivering frames.

Only the newest JPEG is retained. There is deliberately no unbounded queue:
slow clients skip frames instead of building seconds of latency.
"""

from __future__ import annotations

import base64
import hashlib
import http.client
import os
import platform
import re
import selectors
import shutil
import ssl
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import unquote, urlsplit


DEFAULT_SNAPSHOT_PATHS = (
    "/ISAPI/Streaming/channels/102/picture",
    "/ISAPI/Streaming/channels/101/picture",
    "/onvif/snapshot?Profile_2",
    "/onvif/snapshot?Profile_1",
    "/Streaming/channels/1/picture",
    "/cgi-bin/snapshot.cgi?channel=1",
    "/cgi-bin/snapshot.cgi",
)
DEFAULT_FFMPEG_WIDTH = 768
MAX_FFMPEG_WIDTH = 960
MAX_SNAPSHOT_WORKERS = 4
JPEG_START = b"\xff\xd8"
JPEG_END = b"\xff\xd9"


@dataclass
class _StreamState:
    camera_id: str
    max_fps: float = 30.0
    jpeg_quality: int = 75
    preview_width: int = 0
    preview_height: int = 0
    stream_options: dict[str, Any] = field(default_factory=dict)
    credentials: dict[str, str] = field(default_factory=dict)
    frame: bytes | None = None
    sequence: int = 0
    fps: float = 0.0
    error: str = ""
    mode: str = ""
    source: str = ""
    running: bool = False
    stop_event: threading.Event = field(default_factory=threading.Event)
    first_frame_event: threading.Event = field(default_factory=threading.Event)
    condition: threading.Condition = field(default_factory=threading.Condition)
    thread: threading.Thread | None = None
    process: subprocess.Popen[bytes] | None = None
    process_lock: threading.Lock = field(default_factory=threading.Lock)
    request_lock: threading.Lock = field(default_factory=threading.Lock)
    auth_lock: threading.Lock = field(default_factory=threading.Lock)
    auth_state: dict[str, Any] = field(default_factory=dict)
    request_sequence: int = 0
    last_delivered_sequence: int = 0
    frame_count: int = 0
    fps_started_at: float = field(default_factory=time.monotonic)
    last_frame_at: float = 0.0


class CameraStreamManager:
    def __init__(self, *, max_fps: float = 30.0, jpeg_quality: int = 75) -> None:
        self.max_fps = max(1.0, float(max_fps))
        self.jpeg_quality = max(40, min(95, int(jpeg_quality)))
        self._states: dict[str, _StreamState] = {}
        self._lock = threading.Lock()

    async def start(self, camera_id: str, camera: dict[str, Any]) -> dict[str, Any]:
        source = str(camera.get("connection_url") or "").strip()
        if not source:
            return {"success": False, "message": "Camera chưa có nguồn RTSP ở backend."}
        try:
            parsed = urlsplit(source)
        except ValueError:
            parsed = None
        if parsed is None or parsed.scheme.lower() not in {"rtsp", "rtsps"} or not parsed.hostname:
            return {"success": False, "message": "Địa chỉ RTSP của camera không hợp lệ."}

        self.stop(camera_id)
        options = self._resolve_stream_options(camera)
        state = _StreamState(
            camera_id=camera_id,
            max_fps=min(
                self._option_float(options.get("target_fps"), self.max_fps, minimum=5.0, maximum=30.0),
                self._option_float(options.get("fps_limit"), self.max_fps, minimum=5.0, maximum=30.0),
            ),
            jpeg_quality=self._option_int(
                options.get("stream_jpeg_quality"),
                self.jpeg_quality,
                minimum=40,
                maximum=95,
            ),
            preview_width=self._option_int(options.get("frame_width"), 0, minimum=0, maximum=3840),
            preview_height=self._option_int(options.get("frame_height"), 0, minimum=0, maximum=2160),
            stream_options=options,
            credentials=self._resolve_credentials(source, camera),
            source=source,
            running=True,
        )
        with self._lock:
            self._states[camera_id] = state

        state.thread = threading.Thread(
            target=self._worker,
            args=(state,),
            name=f"covavision-camera-{camera_id}",
            daemon=True,
        )
        state.thread.start()

        # Do not tell the UI that the camera is ready while it has no frame.
        # This also avoids the old "one frame then frozen" state looking healthy.
        startup_timeout = self._option_float(
            options.get("startup_timeout_ms"),
            15000.0,
            minimum=8000.0,
            maximum=30000.0,
        ) / 1000.0
        await _wait_for_event(state.first_frame_event, startup_timeout)
        if state.first_frame_event.is_set():
            return {
                "success": True,
                "camera_id": camera_id,
                "status": "running",
                "mode": state.mode,
                "stream_url": "/api/v1/cameras/stream",
            }

        message = state.error or "Không nhận được khung hình đầu tiên từ camera."
        self.stop(camera_id)
        return {"success": False, "message": message}

    def stop(self, camera_id: str | None = None) -> dict[str, Any]:
        with self._lock:
            states = list(self._states.values()) if camera_id is None else [self._states.get(camera_id)]

        stopped = 0
        for state in states:
            if state is None:
                continue
            state.stop_event.set()
            with state.condition:
                state.running = False
                state.condition.notify_all()
            self._terminate_process(state.process)
            if state.thread and state.thread.is_alive() and state.thread is not threading.current_thread():
                state.thread.join(timeout=2.0)
            with self._lock:
                self._states.pop(state.camera_id, None)
            stopped += 1
        return {"success": True, "stopped": stopped}

    def is_running(self, camera_id: str | None = None) -> bool:
        if camera_id:
            state = self._states.get(camera_id)
            return bool(state and state.running)
        return any(state.running for state in self._states.values())

    def status(self, camera_id: str | None = None) -> dict[str, Any]:
        with self._lock:
            states = list(self._states.values())
        active = (
            next((state for state in states if state.camera_id == camera_id and state.running), None)
            if camera_id
            else next((state for state in states if state.running), None)
        )
        if active is None:
            return {"running": False, "camera_id": None, "fps": 0, "error": ""}
        with active.condition:
            return {
                "running": True,
                "camera_id": active.camera_id,
                "fps": round(active.fps, 1),
                "has_frame": active.frame is not None,
                "error": active.error,
                "mode": active.mode,
            }

    def snapshot(self, camera_id: str | None = None) -> bytes | None:
        state = self._get_state(camera_id)
        if state is None:
            return None
        with state.condition:
            return bytes(state.frame) if state.frame else None

    def iter_mjpeg(self, camera_id: str | None = None) -> Iterator[bytes]:
        state = self._get_state(camera_id)
        if state is None:
            return
        last_sequence = -1
        while state.running and not state.stop_event.is_set():
            with state.condition:
                state.condition.wait_for(
                    lambda: state.sequence != last_sequence or not state.running,
                    timeout=1.0,
                )
                frame = state.frame
                sequence = state.sequence
            if not frame or sequence == last_sequence:
                continue
            last_sequence = sequence
            yield (
                b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                + str(len(frame)).encode()
                + b"\r\n\r\n"
                + frame
                + b"\r\n"
            )

    def _get_state(self, camera_id: str | None) -> _StreamState | None:
        with self._lock:
            if camera_id:
                return self._states.get(camera_id)
            return next((state for state in self._states.values() if state.running), None)

    def _worker(self, state: _StreamState) -> None:
        try:
            ffmpeg_path = self._resolve_ffmpeg_path()
            if ffmpeg_path:
                self._run_ffmpeg(state, ffmpeg_path)
            if not state.stop_event.is_set():
                self._run_snapshot_fallback(state)
        finally:
            with state.condition:
                state.running = False
                state.condition.notify_all()

    def _run_ffmpeg(self, state: _StreamState, ffmpeg_path: str) -> bool:
        options = state.stream_options
        transport = str(options.get("rtsp_transport") or "tcp").lower()
        if transport not in {"tcp", "udp", "http", "https"}:
            transport = "tcp"
        width = min(MAX_FFMPEG_WIDTH, max(320, state.preview_width or DEFAULT_FFMPEG_WIDTH))
        timeout_ms = self._option_float(options.get("open_timeout_ms"), 3000.0, minimum=1000.0, maximum=10000.0)
        timeout_us = int(timeout_ms * 1000)
        args = [
            ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "error",
            "-rtsp_transport",
            transport,
            "-stimeout",
            str(timeout_us),
            "-i",
            state.source,
            "-an",
            "-vf",
            f"scale={width}:-2",
            "-q:v",
            "5",
            "-f",
            "mjpeg",
            "pipe:1",
        ]

        try:
            process = subprocess.Popen(
                args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                bufsize=0,
            )
        except (OSError, ValueError):
            self._set_error(state, "Không khởi động được bộ đọc RTSP.")
            return False

        with state.process_lock:
            state.process = process

        had_frame = False
        frame_buffer = bytearray()
        started_at = time.monotonic()
        last_frame_at = started_at
        startup_timeout = max(8.0, timeout_ms / 1000.0 * 2.0)
        stall_timeout = max(
            5.0,
            self._option_float(options.get("read_timeout_ms"), 5000.0, minimum=1000.0, maximum=15000.0) / 1000.0,
        )
        selector = selectors.DefaultSelector()
        try:
            if process.stdout is None:
                return False
            selector.register(process.stdout, selectors.EVENT_READ)
            while not state.stop_event.is_set():
                events = selector.select(timeout=0.5)
                if not events:
                    if process.poll() is not None:
                        break
                    now = time.monotonic()
                    if (not had_frame and now - started_at > startup_timeout) or (
                        had_frame and now - last_frame_at > stall_timeout
                    ):
                        self._set_error(state, "Luồng RTSP mất tín hiệu, đang kết nối lại.")
                        break
                    continue

                chunk = process.stdout.read1(65536) if hasattr(process.stdout, "read1") else process.stdout.read(65536)
                if not chunk:
                    break
                frame_buffer.extend(chunk)
                frame = self._extract_latest_jpeg(frame_buffer)
                if frame is None:
                    continue
                had_frame = True
                last_frame_at = time.monotonic()
                state.mode = "ffmpeg"
                self._publish_frame(state, frame)
        finally:
            try:
                if process.stdout is not None:
                    selector.unregister(process.stdout)
            except (KeyError, ValueError):
                pass
            selector.close()
            self._terminate_process(process)
            with state.process_lock:
                if state.process is process:
                    state.process = None
        return had_frame

    def _run_snapshot_fallback(self, state: _StreamState) -> None:
        targets = self._resolve_snapshot_targets(state.source, state.stream_options)
        if not targets:
            self._set_error(state, "Camera không có địa chỉ snapshot HTTP hợp lệ.")
            return

        timeout_ms = min(
            self._option_float(state.stream_options.get("snapshot_timeout_ms"), 500.0, minimum=250.0, maximum=2000.0),
            2000.0,
        )
        open_timeout_ms = min(
            self._option_float(state.stream_options.get("open_timeout_ms"), 5000.0, minimum=1000.0, maximum=5000.0),
            5000.0,
        )

        while not state.stop_event.is_set():
            target, auth_state, response = self._probe_snapshot_targets(state, targets, open_timeout_ms)
            if target is None or response is None:
                self._set_error(state, "Không đọc được RTSP hoặc snapshot từ camera.")
                state.stop_event.wait(1.0)
                continue

            with state.auth_lock:
                state.auth_state = dict(auth_state)
            state.mode = "snapshot"
            self._publish_frame(state, response["body"])
            local_stop = threading.Event()
            workers = [
                threading.Thread(
                    target=self._snapshot_worker,
                    args=(state, target, timeout_ms, local_stop, index),
                    name=f"covavision-snapshot-{state.camera_id}-{index}",
                    daemon=True,
                )
                for index in range(MAX_SNAPSHOT_WORKERS)
            ]
            for worker in workers:
                worker.start()

            stale_after = max(8.0, timeout_ms / 1000.0 * 8.0)
            while not state.stop_event.is_set():
                if state.last_frame_at and time.monotonic() - state.last_frame_at > stale_after:
                    self._set_error(state, "Snapshot camera mất tín hiệu, đang kết nối lại.")
                    break
                state.stop_event.wait(0.5)
            local_stop.set()
            for worker in workers:
                if worker.is_alive():
                    worker.join(timeout=1.0)
            if state.stop_event.is_set():
                return

    def _probe_snapshot_targets(
        self,
        state: _StreamState,
        targets: list[str],
        open_timeout_ms: float,
    ) -> tuple[str | None, dict[str, Any], dict[str, Any] | None]:
        deadline = time.monotonic() + min(open_timeout_ms * len(targets) / 1000.0, 6.0)
        for target in targets:
            if state.stop_event.is_set():
                return None, {}, None
            remaining_ms = (deadline - time.monotonic()) * 1000.0
            if remaining_ms <= 0:
                break
            auth_state: dict[str, Any] = {}
            try:
                response = _request_authenticated_image(
                    target,
                    state.credentials,
                    min(open_timeout_ms, max(500.0, remaining_ms)),
                    auth_state,
                )
            except (OSError, ValueError, TimeoutError):
                continue
            if _is_jpeg(response):
                return target, auth_state, response
        return None, {}, None

    def _snapshot_worker(
        self,
        state: _StreamState,
        target: str,
        timeout_ms: float,
        local_stop: threading.Event,
        worker_index: int,
    ) -> None:
        # Stagger initial requests to avoid making the camera's snapshot
        # encoder receive a burst of four requests at exactly the same time.
        local_stop.wait((worker_index * 80) / 1000.0)
        auth_state: dict[str, Any] = {}
        while not state.stop_event.is_set() and not local_stop.is_set():
            with state.auth_lock:
                if not auth_state:
                    auth_state = _clone_auth_state(state.auth_state)
            with state.request_lock:
                state.request_sequence += 1
                sequence = state.request_sequence
            got_frame = False
            try:
                response = _request_authenticated_image(
                    target,
                    state.credentials,
                    timeout_ms,
                    auth_state,
                )
                if _is_jpeg(response) and not state.stop_event.is_set() and not local_stop.is_set():
                    with state.request_lock:
                        if sequence > state.last_delivered_sequence:
                            state.last_delivered_sequence = sequence
                            should_publish = True
                        else:
                            should_publish = False
                    if should_publish:
                        with state.auth_lock:
                            state.auth_state = _clone_auth_state(auth_state)
                        self._publish_frame(state, response["body"])
                        got_frame = True
            except (OSError, ValueError, TimeoutError):
                pass
            local_stop.wait(0.0 if got_frame else 0.05)

    def _publish_frame(self, state: _StreamState, frame: bytes) -> None:
        if not _looks_like_jpeg(frame):
            return
        now = time.monotonic()
        with state.condition:
            state.frame = bytes(frame)
            state.sequence += 1
            state.error = ""
            state.frame_count += 1
            elapsed = now - state.fps_started_at
            if elapsed >= 1.0:
                state.fps = state.frame_count / elapsed
                state.frame_count = 0
                state.fps_started_at = now
            state.last_frame_at = now
            state.first_frame_event.set()
            state.condition.notify_all()

    @staticmethod
    def _set_error(state: _StreamState, message: str) -> None:
        with state.condition:
            state.error = message
            state.condition.notify_all()

    @staticmethod
    def _extract_latest_jpeg(buffer: bytearray) -> bytes | None:
        newest: bytes | None = None
        while buffer:
            start = buffer.find(JPEG_START)
            if start < 0:
                del buffer[:-1]
                break
            end = buffer.find(JPEG_END, start + len(JPEG_START))
            if end < 0:
                if start:
                    del buffer[:start]
                break
            newest = bytes(buffer[start : end + len(JPEG_END)])
            del buffer[: end + len(JPEG_END)]
        return newest

    @staticmethod
    def _resolve_ffmpeg_path() -> str:
        configured = os.environ.get("COVAVISION_FFMPEG_PATH", "").strip()
        candidates = [configured] if configured else []
        system_ffmpeg = shutil.which("ffmpeg")
        if system_ffmpeg:
            candidates.append(system_ffmpeg)

        machine = platform.machine().lower()
        system = platform.system().lower()
        if system == "darwin":
            package = "darwin-arm64" if "arm" in machine or "aarch64" in machine else "darwin-x64"
        elif system == "windows":
            package = "win32-x64"
        else:
            package = "linux-arm64" if "arm" in machine or "aarch64" in machine else "linux-x64"
        repository_root = Path(__file__).resolve().parents[3]
        candidates.append(
            str(repository_root / "apps" / "desktop" / "node_modules" / "@ffmpeg-installer" / package / "ffmpeg")
        )
        if system == "windows":
            candidates.append(candidates[-1] + ".exe")
        for candidate in candidates:
            if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
                return candidate
        return ""

    @staticmethod
    def _resolve_credentials(source: str, camera: dict[str, Any]) -> dict[str, str]:
        try:
            parsed = urlsplit(source)
            username = unquote(parsed.username or "")
            password = unquote(parsed.password or "")
        except ValueError:
            username = ""
            password = ""
        return {
            "username": username or str(camera.get("username") or ""),
            "password": password or str(camera.get("password_secret") or camera.get("password") or ""),
        }

    @staticmethod
    def _resolve_snapshot_targets(source: str, options: dict[str, Any]) -> list[str]:
        try:
            parsed = urlsplit(source)
            hostname = parsed.hostname
        except ValueError:
            return []
        if not hostname:
            return []
        custom_path = str(options.get("snapshot_path") or "").strip()
        raw_paths = [custom_path, *DEFAULT_SNAPSHOT_PATHS] if custom_path else list(DEFAULT_SNAPSHOT_PATHS)
        protocol = str(options.get("snapshot_protocol") or "http").lower()
        protocol = "https" if protocol == "https" else "http"
        try:
            port = int(float(options.get("snapshot_http_port") or (443 if protocol == "https" else 80)))
        except (TypeError, ValueError):
            port = 443 if protocol == "https" else 80
        if not 1 <= port <= 65535:
            port = 443 if protocol == "https" else 80
        host = f"[{hostname}]" if ":" in hostname else hostname
        port_suffix = "" if (protocol == "http" and port == 80) or (protocol == "https" and port == 443) else f":{port}"
        targets: list[str] = []
        for path in raw_paths:
            normalized = path if path.startswith("/") else f"/{path}"
            target = f"{protocol}://{host}{port_suffix}{normalized}"
            if target not in targets:
                targets.append(target)
        return targets

    @staticmethod
    def _resolve_stream_options(camera: dict[str, Any]) -> dict[str, Any]:
        options: dict[str, Any] = {}
        for key in ("options", "camera_options", "processing_options"):
            value = camera.get(key)
            if isinstance(value, dict):
                options.update(value)
        return options

    @staticmethod
    def _open_capture(cv2: Any, source: str, options: dict[str, Any]) -> Any:
        """Compatibility helper for integrations that still import this method."""
        backend = getattr(cv2, "CAP_FFMPEG", getattr(cv2, "CAP_ANY", 0))
        is_rtsp = source.lower().startswith(("rtsp://", "rtsps://"))
        capture = cv2.VideoCapture(source, backend) if is_rtsp else cv2.VideoCapture(source)
        if is_rtsp and not capture.isOpened() and backend != getattr(cv2, "CAP_ANY", 0):
            capture.release()
            capture = cv2.VideoCapture(source)
        for option_name, property_name in (
            ("open_timeout_ms", "CAP_PROP_OPEN_TIMEOUT_MSEC"),
            ("read_timeout_ms", "CAP_PROP_READ_TIMEOUT_MSEC"),
        ):
            property_id = getattr(cv2, property_name, None)
            if property_id is None:
                continue
            try:
                capture.set(property_id, float(options.get(option_name) or 5000))
            except (AttributeError, TypeError, ValueError):
                continue
        return capture

    @staticmethod
    def _resize_preview(cv2: Any, frame: Any, target_width: int, target_height: int) -> Any:
        if not target_width and not target_height:
            return frame
        height, width = frame.shape[:2]
        scale = 1.0
        if target_width:
            scale = min(scale, target_width / max(width, 1))
        if target_height:
            scale = min(scale, target_height / max(height, 1))
        if scale >= 0.999:
            return frame
        return cv2.resize(
            frame,
            (max(1, round(width * scale)), max(1, round(height * scale))),
            interpolation=cv2.INTER_AREA,
        )

    @staticmethod
    def _option_float(value: Any, fallback: float, *, minimum: float, maximum: float) -> float:
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            parsed = fallback
        return max(minimum, min(maximum, parsed))

    @staticmethod
    def _option_int(value: Any, fallback: int, *, minimum: int, maximum: int) -> int:
        try:
            parsed = int(float(value))
        except (TypeError, ValueError):
            parsed = fallback
        return max(minimum, min(maximum, parsed))

    @staticmethod
    def _terminate_process(process: subprocess.Popen[bytes] | None) -> None:
        if process is None:
            return
        try:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=0.8)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=0.8)
        except (OSError, subprocess.TimeoutExpired):
            pass


async def _wait_for_event(event: threading.Event, timeout: float) -> None:
    """Wait without blocking FastAPI's event loop."""
    import asyncio

    await asyncio.to_thread(event.wait, timeout)


def _looks_like_jpeg(body: bytes) -> bool:
    return len(body) >= 4 and body.startswith(JPEG_START) and JPEG_END in body[2:]


def _is_jpeg(response: dict[str, Any]) -> bool:
    return response.get("status") == 200 and _looks_like_jpeg(response.get("body") or b"")


def _parse_digest_challenge(header: str) -> dict[str, str] | None:
    match = re.match(r"^Digest\s+(.+)$", str(header or ""), re.IGNORECASE)
    if not match:
        return None
    values: dict[str, str] = {}
    for item in re.finditer(r'([a-z]+)=(?:"([^"]*)"|([^,\s]+))', match.group(1), re.IGNORECASE):
        values[item.group(1).lower()] = item.group(2) if item.group(2) is not None else item.group(3)
    return values if values.get("realm") and values.get("nonce") else None


def _build_digest_authorization(
    challenge: dict[str, Any],
    username: str,
    password: str,
    method: str,
    uri: str,
) -> str:
    qop_values = [value.strip() for value in str(challenge.get("qop") or "").split(",") if value.strip()]
    qop = "auth" if "auth" in qop_values else ""
    challenge["nc"] = int(challenge.get("nc") or 0) + 1
    nc = f"{challenge['nc']:08x}"
    cnonce = str(challenge.get("cnonce") or os.urandom(12).hex())
    challenge["cnonce"] = cnonce
    ha1 = hashlib.md5(f"{username}:{challenge['realm']}:{password}".encode()).hexdigest()
    ha2 = hashlib.md5(f"{method}:{uri}".encode()).hexdigest()
    if qop:
        response = hashlib.md5(f"{ha1}:{challenge['nonce']}:{nc}:{cnonce}:{qop}:{ha2}".encode()).hexdigest()
    else:
        response = hashlib.md5(f"{ha1}:{challenge['nonce']}:{ha2}".encode()).hexdigest()
    fields = [
        f'username="{username}"',
        f'realm="{challenge["realm"]}"',
        f'nonce="{challenge["nonce"]}"',
        f'uri="{uri}"',
        f'response="{response}"',
    ]
    if challenge.get("algorithm"):
        fields.append(f'algorithm={challenge["algorithm"]}')
    if qop:
        fields.extend([f"qop={qop}", f"nc={nc}", f'cnonce="{cnonce}"'])
    if challenge.get("opaque"):
        fields.append(f'opaque="{challenge["opaque"]}"')
    return "Digest " + ", ".join(fields)


def _clone_auth_state(auth_state: dict[str, Any]) -> dict[str, Any]:
    cloned = dict(auth_state)
    if isinstance(auth_state.get("challenge"), dict):
        cloned["challenge"] = dict(auth_state["challenge"])
    return cloned


def _request_buffer(target: str, headers: dict[str, str], timeout_ms: float) -> dict[str, Any]:
    parsed = urlsplit(target)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Invalid snapshot target")
    timeout = max(0.25, min(timeout_ms / 1000.0, 15.0))
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    path = parsed.path or "/"
    if parsed.query:
        path += f"?{parsed.query}"
    connection: http.client.HTTPConnection | http.client.HTTPSConnection
    if parsed.scheme == "https":
        context = ssl._create_unverified_context()
        connection = http.client.HTTPSConnection(parsed.hostname, port, timeout=timeout, context=context)
    else:
        connection = http.client.HTTPConnection(parsed.hostname, port, timeout=timeout)
    request_headers = {"Connection": "close", "Accept": "image/jpeg, image/*;q=0.9, */*;q=0.1", **headers}
    try:
        connection.request("GET", path, headers=request_headers)
        response = connection.getresponse()
        body = response.read(8 * 1024 * 1024)
        return {
            "status": int(response.status or 0),
            "headers": {key.lower(): value for key, value in response.getheaders()},
            "body": body,
        }
    finally:
        connection.close()


def _request_authenticated_image(
    target: str,
    credentials: dict[str, str],
    timeout_ms: float,
    auth_state: dict[str, Any],
) -> dict[str, Any]:
    parsed = urlsplit(target)
    uri = f"{parsed.path or '/'}{f'?{parsed.query}' if parsed.query else ''}"
    username = str(credentials.get("username") or "")
    password = str(credentials.get("password") or "")

    authorization = auth_state.get("authorization")
    challenge = auth_state.get("challenge")
    if challenge:
        authorization = _build_digest_authorization(challenge, username, password, "GET", uri)
    if authorization:
        authenticated = _request_buffer(target, {"Authorization": authorization}, timeout_ms)
        if _is_jpeg(authenticated) or authenticated.get("status") != 401:
            return authenticated
        auth_state.pop("authorization", None)
        auth_state.pop("challenge", None)

    first = _request_buffer(target, {}, timeout_ms)
    if _is_jpeg(first) or first.get("status") != 401 or not username:
        return first

    challenge_header = first.get("headers", {}).get("www-authenticate", "")
    digest = _parse_digest_challenge(challenge_header)
    if digest:
        auth_state["challenge"] = digest
        authorization = _build_digest_authorization(digest, username, password, "GET", uri)
    elif re.match(r"^Basic\b", str(challenge_header), re.IGNORECASE):
        authorization = "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode("ascii")
        auth_state["authorization"] = authorization
    else:
        authorization = ""
    if not authorization:
        return first
    return _request_buffer(target, {"Authorization": authorization}, timeout_ms)
