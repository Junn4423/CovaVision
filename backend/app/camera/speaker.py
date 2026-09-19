"""ONVIF RTSP backchannel speaker support.

The browser never receives camera credentials. This module runs inside the
backend and ports the desktop client's AAC/RTP backchannel flow:
DESCRIBE (backchannel) -> SETUP -> PLAY -> RTP AAC -> TEARDOWN.
"""

from __future__ import annotations

import hashlib
import math
import os
import re
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
import wave
from pathlib import Path
from typing import Any

from app.camera.stream_manager import CameraStreamManager


def _md5(value: str) -> str:
    return hashlib.md5(value.encode("utf-8")).hexdigest()


def _digest_challenge(value: str) -> dict[str, str]:
    match = re.search(r"Digest\s+(.+)$", value or "", re.IGNORECASE)
    if not match:
        return {}
    result: dict[str, str] = {}
    for item in re.finditer(r'([a-z]+)=(?:"([^"]*)"|([^,\s]+))', match.group(1), re.IGNORECASE):
        result[item.group(1).lower()] = item.group(2) if item.group(2) is not None else item.group(3)
    return result


def _digest_authorization(
    challenge: dict[str, str],
    username: str,
    password: str,
    method: str,
    uri: str,
    nonce_count: int,
) -> str:
    realm = challenge.get("realm", "")
    nonce = challenge.get("nonce", "")
    algorithm = challenge.get("algorithm", "MD5").upper()
    ha1 = _md5(f"{username}:{realm}:{password}")
    qop_values = [part.strip().lower() for part in challenge.get("qop", "").split(",") if part.strip()]
    qop = "auth" if "auth" in qop_values else ""
    if algorithm == "MD5-SESS":
        cnonce = hashlib.md5(os.urandom(16)).hexdigest()
        ha1 = _md5(f"{ha1}:{nonce}:{cnonce}")
    else:
        cnonce = hashlib.md5(os.urandom(16)).hexdigest()
    ha2 = _md5(f"{method}:{uri}")
    if qop:
        nc = f"{nonce_count:08x}"
        response = _md5(f"{ha1}:{nonce}:{nc}:{cnonce}:{qop}:{ha2}")
    else:
        nc = ""
        response = _md5(f"{ha1}:{nonce}:{ha2}")
    parts = [
        f'username="{username}"',
        f'realm="{realm}"',
        f'nonce="{nonce}"',
        f'uri="{uri}"',
        f'response="{response}"',
    ]
    if algorithm:
        parts.append(f"algorithm={algorithm}")
    if qop:
        parts.extend([f"qop={qop}", f"nc={nc}", f'cnonce="{cnonce}"'])
    return "Digest " + ", ".join(parts)


def _safe_text(text: Any) -> str:
    return " ".join(str(text or "").split())[:160]


def _write_pcm_wav(path: Path, volume: int) -> None:
    sample_rate = 16000
    lead = int(sample_rate * 0.25)
    tone_one = int(sample_rate * 0.22)
    pause = int(sample_rate * 0.05)
    tone_two = int(sample_rate * 0.35)
    tail = int(sample_rate * 0.30)
    samples = [0] * (lead + tone_one + pause + tone_two + tail)
    scale = max(0.1, min(1.0, volume / 100.0 * 0.95))
    for offset, length, frequency in ((lead, tone_one, 880.0), (lead + tone_one + pause, tone_two, 1320.0)):
        for index in range(length):
            envelope = 1.0
            if index < sample_rate * 0.02:
                envelope = index / (sample_rate * 0.02)
            elif index > length - sample_rate * 0.04:
                envelope = (length - index) / (sample_rate * 0.04)
            samples[offset + index] = int(math.sin(2 * math.pi * frequency * index / sample_rate) * envelope * 24000 * scale)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(b"".join(int(sample).to_bytes(2, "little", signed=True) for sample in samples))


def _download_google_tts(text: str, path: Path) -> bool:
    query = urllib.parse.urlencode({"ie": "UTF-8", "q": text, "tl": "vi", "client": "tw-ob"})
    request = urllib.request.Request(
        f"https://translate.google.com/translate_tts?{query}",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            data = response.read()
        if len(data) <= 100:
            return False
        path.write_bytes(data)
        return True
    except (OSError, ValueError):
        return False


def _prepare_aac(text: str, volume: int, ffmpeg: str) -> list[bytes]:
    with tempfile.TemporaryDirectory(prefix="covavision-speaker-") as temp_dir:
        root = Path(temp_dir)
        source = root / "source.mp3"
        if text and not _download_google_tts(text, source):
            source = root / "source.aiff"
            if shutil.which("say"):
                try:
                    subprocess.run(["say", "-o", str(source), text], check=True, timeout=4, capture_output=True)
                except (OSError, subprocess.SubprocessError):
                    source = root / "source.wav"
            else:
                source = root / "source.wav"
        if not source.exists():
            _write_pcm_wav(source, volume)
        target = root / "audio.aac"
        try:
            subprocess.run(
                [ffmpeg, "-y", "-loglevel", "error", "-i", str(source), "-af", f"volume={volume / 100:.2f}",
                 "-c:a", "aac", "-b:a", "32k", "-ar", "16000", "-ac", "1", "-f", "adts", str(target)],
                check=True,
                timeout=12,
                capture_output=True,
            )
        except (OSError, subprocess.SubprocessError):
            return []
        data = target.read_bytes() if target.exists() else b""
    frames: list[bytes] = []
    pointer = 0
    while pointer + 7 < len(data):
        if data[pointer] == 0xFF and data[pointer + 1] & 0xF0 == 0xF0:
            frame_length = ((data[pointer + 3] & 0x03) << 11) | (data[pointer + 4] << 3) | ((data[pointer + 5] & 0xE0) >> 5)
            if frame_length > 7 and pointer + frame_length <= len(data):
                frames.append(data[pointer + 7:pointer + frame_length])
                pointer += frame_length
                continue
        pointer += 1
    return frames


def _rtsp_uri(source: str) -> tuple[str, str, int]:
    parsed = urllib.parse.urlsplit(source)
    host = parsed.hostname or ""
    port = parsed.port or 554
    path = parsed.path or "/Streaming/Channels/101"
    if not path.startswith("/"):
        path = "/" + path
    uri = urllib.parse.urlunsplit(("rtsp", f"[{host}]" if ":" in host else host + (f":{port}" if port != 554 else ""), path, parsed.query, ""))
    return uri, host, port


def _read_rtsp_response(sock: socket.socket, pending: bytearray) -> tuple[str, dict[str, str], bytes, bytearray]:
    while b"\r\n\r\n" not in pending:
        chunk = sock.recv(8192)
        if not chunk:
            raise ConnectionError("RTSP connection closed")
        pending.extend(chunk)
    header_end = pending.index(b"\r\n\r\n") + 4
    header_bytes = bytes(pending[:header_end])
    del pending[:header_end]
    lines = header_bytes.decode("latin-1", errors="replace").split("\r\n")
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if ":" in line:
            key, value = line.split(":", 1)
            key = key.strip().lower()
            value = value.strip()
            if key == "www-authenticate" and key in headers:
                # EZVIZ sends Basic and Digest challenges as separate headers;
                # keep Digest because RTSP backchannel requires it.
                if "digest" in value.lower() or "digest" not in headers[key].lower():
                    headers[key] = value
            else:
                headers[key] = value
    length = int(headers.get("content-length", "0") or 0)
    while len(pending) < length:
        chunk = sock.recv(8192)
        if not chunk:
            raise ConnectionError("RTSP connection closed")
        pending.extend(chunk)
    body = bytes(pending[:length])
    if length:
        del pending[:length]
    return lines[0] if lines else "", headers, body, pending


def _send_rtsp(sock: socket.socket, method: str, uri: str, cseq: int, headers: dict[str, str] | None = None) -> None:
    lines = [f"{method} {uri} RTSP/1.0", f"CSeq: {cseq}"]
    lines.extend(f"{key}: {value}" for key, value in (headers or {}).items())
    sock.sendall(("\r\n".join(lines) + "\r\n\r\n").encode("latin-1"))


def _status_code(status: str) -> int:
    try:
        return int(status.split()[1])
    except (IndexError, ValueError):
        return 0


def speak_to_camera(camera: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    source = str(camera.get("connection_url") or "").strip()
    if not source:
        return {"success": False, "message": "Camera chưa có nguồn RTSP ở backend."}
    parsed_source = urllib.parse.urlsplit(source)
    username = str(camera.get("username") or "").strip() or urllib.parse.unquote(parsed_source.username or "")
    password = str(camera.get("password_secret") or camera.get("password") or "") or urllib.parse.unquote(parsed_source.password or "")
    try:
        volume = max(5, min(100, int(float(payload.get("volume") or 50))))
    except (TypeError, ValueError):
        volume = 50
    text = _safe_text(payload.get("text") or "Xin chào bạn, quét mặt thành công")
    ffmpeg = CameraStreamManager._resolve_ffmpeg_path()
    if not ffmpeg:
        return {"success": False, "message": "Backend chưa tìm thấy FFmpeg để mã hóa âm thanh."}
    frames = _prepare_aac(text, volume, ffmpeg)
    if not frames:
        return {"success": False, "message": "Không thể tổng hợp âm thanh câu chào."}
    uri, host, port = _rtsp_uri(source)
    if not host:
        return {"success": False, "message": "Địa chỉ RTSP của camera không hợp lệ."}
    track_id = str(payload.get("track_id") or "trackID=4").strip()
    if not track_id.startswith("trackID="):
        track_id = "trackID=" + track_id
    nonce_count = 0
    challenge: dict[str, str] = {}
    session = ""
    try:
        with socket.create_connection((host, port), timeout=6) as sock:
            sock.settimeout(6)
            pending = bytearray()
            _send_rtsp(sock, "DESCRIBE", uri, 1, {"Require": "www.onvif.org/ver20/backchannel", "Accept": "application/sdp"})
            status, headers, body, pending = _read_rtsp_response(sock, pending)
            if _status_code(status) == 401:
                challenge = _digest_challenge(headers.get("www-authenticate", ""))
                if not challenge:
                    return {"success": False, "message": "Camera không hỗ trợ xác thực RTSP cho loa."}
                nonce_count += 1
                _send_rtsp(sock, "DESCRIBE", uri, 2, {
                    "Authorization": _digest_authorization(challenge, username, password, "DESCRIBE", uri, nonce_count),
                    "Require": "www.onvif.org/ver20/backchannel",
                    "Accept": "application/sdp",
                })
                status, headers, body, pending = _read_rtsp_response(sock, pending)
            if _status_code(status) != 200:
                return {"success": False, "message": "Camera từ chối kết nối loa RTSP."}
            sdp = body.decode("latin-1", errors="ignore")
            for block in sdp.split("m="):
                if "sendonly" in block and "trackID=" in block:
                    match = re.search(r"trackID=([0-9]+)", block)
                    if match:
                        track_id = "trackID=" + match.group(1)
                        break
            setup_uri = uri.rstrip("/") + "/" + track_id
            auth = {}
            if challenge:
                nonce_count += 1
                auth["Authorization"] = _digest_authorization(challenge, username, password, "SETUP", setup_uri, nonce_count)
            auth.update({"Require": "www.onvif.org/ver20/backchannel", "Transport": "RTP/AVP/TCP;unicast;interleaved=0-1"})
            _send_rtsp(sock, "SETUP", setup_uri, 3, auth)
            status, headers, body, pending = _read_rtsp_response(sock, pending)
            session = headers.get("session", "").split(";", 1)[0].strip()
            if _status_code(status) != 200 or not session:
                return {"success": False, "message": "Camera từ chối phiên phát loa RTSP."}
            play_uri = uri.rstrip("/") + "/"
            auth = {"Session": session}
            if challenge:
                nonce_count += 1
                auth["Authorization"] = _digest_authorization(challenge, username, password, "PLAY", play_uri, nonce_count)
            _send_rtsp(sock, "PLAY", play_uri, 4, auth)
            status, _, body, pending = _read_rtsp_response(sock, pending)
            if _status_code(status) != 200:
                return {"success": False, "message": "Camera không bắt đầu được kênh loa RTSP."}
            sequence = 1000
            timestamp = 100000
            for frame in frames:
                au_header = (len(frame) & 0x1FFF) << 3
                payload_bytes = b"\x00\x10" + au_header.to_bytes(2, "big") + frame
                rtp = b"\x80\xe8" + sequence.to_bytes(2, "big") + timestamp.to_bytes(4, "big") + b"\x12\x34\x56\x78" + payload_bytes
                sock.sendall(b"$\x00" + len(rtp).to_bytes(2, "big") + rtp)
                sequence = (sequence + 1) & 0xFFFF
                timestamp += 1024
                time.sleep(0.064)
            _send_rtsp(sock, "TEARDOWN", uri, 5, {"Session": session})
        return {"success": True, "message": f"Đã phát câu chào qua loa camera ({volume}%)."}
    except (OSError, ValueError, TimeoutError):
        return {"success": False, "message": "Không thể kết nối hoặc phát âm thanh qua loa camera."}
