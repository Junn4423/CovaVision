"""Single-reader RTSP manager with a latest-frame buffer.

The worker continuously drops stale frames instead of queueing them. That is
the important latency property for attendance: a slow detector sees the newest
available frame, not a frame captured seconds earlier.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Iterator


@dataclass
class _StreamState:
    camera_id: str
    max_fps: float = 30.0
    jpeg_quality: int = 75
    preview_width: int = 0
    preview_height: int = 0
    frame: bytes | None = None
    sequence: int = 0
    fps: float = 0.0
    error: str = ""
    running: bool = False
    stop_event: threading.Event = field(default_factory=threading.Event)
    condition: threading.Condition = field(default_factory=threading.Condition)
    thread: threading.Thread | None = None


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
            import cv2  # type: ignore
        except ImportError:
            return {"success": False, "message": "Backend chưa cài OpenCV vision."}

        del cv2  # Import check keeps API startup light; worker imports it once.
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
            running=True,
        )
        with self._lock:
            self._states[camera_id] = state
        state.thread = threading.Thread(
            target=self._worker,
            args=(state, source),
            name=f"covavision-camera-{camera_id}",
            daemon=True,
        )
        state.thread.start()
        return {"success": True, "camera_id": camera_id, "status": "starting"}

    def stop(self, camera_id: str | None = None) -> dict[str, Any]:
        with self._lock:
            states = list(self._states.values()) if camera_id is None else [self._states.get(camera_id)]
        stopped = 0
        for state in states:
            if state is None:
                continue
            state.stop_event.set()
            state.running = False
            if state.thread and state.thread.is_alive():
                state.thread.join(timeout=1.5)
            stopped += 1
            with self._lock:
                self._states.pop(state.camera_id, None)
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
        return {
            "running": True,
            "camera_id": active.camera_id,
            "fps": round(active.fps, 1),
            "has_frame": active.frame is not None,
            "error": active.error,
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
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"

    def _get_state(self, camera_id: str | None) -> _StreamState | None:
        with self._lock:
            if camera_id:
                return self._states.get(camera_id)
            return next((state for state in self._states.values() if state.running), None)

    def _worker(self, state: _StreamState, source: str) -> None:
        try:
            import cv2  # type: ignore
        except ImportError:
            state.error = "OpenCV is not installed"
            state.running = False
            return

        capture = None
        frame_count = 0
        fps_started = time.monotonic()
        try:
            while not state.stop_event.is_set():
                if capture is None or not capture.isOpened():
                    if capture is not None:
                        capture.release()
                    capture = self._open_capture(cv2, source, options)
                    capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    if not capture.isOpened():
                        state.error = "Không mở được nguồn camera"
                        state.stop_event.wait(1.0)
                        continue

                started = time.monotonic()
                ok, frame = capture.read()
                if not ok or frame is None:
                    state.error = "Không đọc được frame camera"
                    capture.release()
                    capture = None
                    continue

                frame = self._resize_preview(cv2, frame, state.preview_width, state.preview_height)

                ok, encoded = cv2.imencode(
                    ".jpg",
                    frame,
                    [int(cv2.IMWRITE_JPEG_QUALITY), state.jpeg_quality],
                )
                if not ok:
                    continue

                with state.condition:
                    state.frame = encoded.tobytes()
                    state.sequence += 1
                    state.error = ""
                    state.condition.notify_all()

                frame_count += 1
                elapsed = time.monotonic() - fps_started
                if elapsed >= 1.0:
                    state.fps = frame_count / elapsed
                    frame_count = 0
                    fps_started = time.monotonic()

                remaining = (1.0 / state.max_fps) - (time.monotonic() - started)
                if remaining > 0:
                    state.stop_event.wait(remaining)
        finally:
            if capture is not None:
                capture.release()
            state.running = False
            with state.condition:
                state.condition.notify_all()

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
