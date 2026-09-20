from __future__ import annotations

import asyncio
import base64
import re
import socket
import time
from typing import Any, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user, get_repository
from app.api.routes.accounts import require_admin
from app.camera.discovery import public_discovery_candidate
from app.camera.speaker import speak_to_camera
from app.db.repository import Repository

router = APIRouter(prefix="/api/v1/cameras", tags=["cameras"])


def _organization_id(user: dict[str, Any]) -> str:
    organization_id = str(user.get("organization_id") or "").strip()
    if not organization_id:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập thiếu tổ chức")
    return organization_id


_HIDDEN_CAMERA_KEYS = {
    "connection_url",
    "source",
    "rtsp_url",
    "stream_url",
    "url",
    "uri",
    "username",
    "password",
    "password_secret",
    "secret",
    "ip",
    "host",
    "port",
    "camera_ip",
    "connectionurl",
    "rtspurl",
    "streamurl",
    "passwordsecret",
    "cameraip",
}
_HIDDEN_CAMERA_VALUE = object()
_PRIVATE_ENDPOINT_PATTERN = re.compile(
    r"(?i)(?:rtsp|rtsps|rtmp|http|https|tcp)://"
    r"|(?<!\d)(?:10|127)(?:\.\d{1,3}){3}(?!\d)"
    r"|(?<!\d)192\.168(?:\.\d{1,3}){2}(?!\d)"
    r"|(?<!\d)172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}(?!\d)",
)


def _camera_key_is_hidden(key: Any) -> bool:
    normalized = "".join(character for character in str(key).lower() if character.isalnum())
    return str(key).lower() in _HIDDEN_CAMERA_KEYS or normalized in _HIDDEN_CAMERA_KEYS


def _safe_camera_value(value: Any) -> Any:
    """Remove nested connection details before returning camera metadata."""
    if isinstance(value, dict):
        safe: dict[str, Any] = {}
        for key, item in value.items():
            if _camera_key_is_hidden(key):
                continue
            sanitized = _safe_camera_value(item)
            if sanitized is not _HIDDEN_CAMERA_VALUE:
                safe[key] = sanitized
        return safe if safe or not value else _HIDDEN_CAMERA_VALUE
    if isinstance(value, list):
        safe_items = [item for item in (_safe_camera_value(item) for item in value) if item is not _HIDDEN_CAMERA_VALUE]
        return safe_items if safe_items or not value else _HIDDEN_CAMERA_VALUE
    if isinstance(value, str) and _PRIVATE_ENDPOINT_PATTERN.search(value):
        return _HIDDEN_CAMERA_VALUE
    return value


def public_camera(camera: dict[str, Any]) -> dict[str, Any]:
    # Camera connection details never cross the API boundary. The browser/mobile
    # client receives only an opaque id and operational metadata; the backend is
    # the sole component that opens RTSP and stores credentials.
    result = _safe_camera_value(camera)
    if not isinstance(result, dict):
        result = {"id": camera.get("id"), "name": camera.get("name") or "Camera"}
    result = {
        key: value
        for key, value in result.items()
        if value is not _HIDDEN_CAMERA_VALUE and not _camera_key_is_hidden(key)
    }
    camera_type = str(result.get("camera_type") or result.get("type") or "rtsp").lower()
    result["camera_type"] = {
        "rtsp": "rtsp",
        "webcam": "browser",
        "mobile": "mobile",
    }.get(camera_type, camera_type)
    return result


def get_manager(request: Request) -> Any:
    return request.app.state.camera_manager


def get_discovery(request: Request) -> Any:
    return request.app.state.camera_discovery


@router.get("")
async def list_cameras(
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {"success": True, "cameras": [public_camera(item) for item in await repository.list_cameras(_organization_id(current_user))]}


def _probe_tcp_and_stream(
    url: str,
    timeout_seconds: float = 3.0,
) -> dict[str, Any]:
    """Test TCP socket reachability and optional frame decode for an RTSP/HTTP URL."""
    cleaned_url = url.strip()
    if not cleaned_url:
        return {"success": False, "connected": False, "message": "Địa chỉ URL camera không hợp lệ"}

    parsed = urlparse(cleaned_url)
    scheme = (parsed.scheme or "rtsp").lower()
    host = parsed.hostname
    if not host:
        return {"success": False, "connected": False, "message": "Không tìm thấy địa chỉ host/IP trong URL camera"}

    default_port = 554 if scheme in ("rtsp", "rtsps") else 80
    port = parsed.port or default_port

    start_time = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=timeout_seconds):
            latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
    except socket.timeout:
        return {
            "success": False,
            "connected": False,
            "message": f"Hết thời gian chờ kết nối tới {host}:{port} (Timeout)",
            "latency_ms": None,
        }
    except Exception as exc:
        return {
            "success": False,
            "connected": False,
            "message": f"Không thể kết nối tới {host}:{port} ({exc})",
            "latency_ms": None,
        }

    try:
        import cv2

        capture = cv2.VideoCapture(cleaned_url)
        for prop in ("CAP_PROP_OPEN_TIMEOUT_MSEC", "CAP_PROP_READ_TIMEOUT_MSEC"):
            prop_id = getattr(cv2, prop, None)
            if prop_id is not None:
                capture.set(prop_id, timeout_seconds * 1000)

        opened = capture.isOpened()
        ret = False
        width, height = 0, 0
        if opened:
            ret, frame = capture.read()
            if ret and frame is not None:
                height, width = frame.shape[:2]
        capture.release()

        if ret and width > 0:
            return {
                "success": True,
                "connected": True,
                "stream_readable": True,
                "latency_ms": latency_ms,
                "resolution": f"{width}x{height}",
                "message": f"Kết nối camera thành công! Nhận tín hiệu luồng hình {width}x{height} ({latency_ms}ms).",
            }
        else:
            return {
                "success": True,
                "connected": True,
                "stream_readable": False,
                "latency_ms": latency_ms,
                "message": f"Cổng camera {host}:{port} phản hồi ({latency_ms}ms), nhưng chưa nhận được hình ảnh. Vui lòng kiểm tra tài khoản, mật khẩu hoặc đường dẫn stream.",
            }
    except Exception:
        return {
            "success": True,
            "connected": True,
            "stream_readable": None,
            "latency_ms": latency_ms,
            "message": f"Kết nối cổng camera {host}:{port} thành công ({latency_ms}ms).",
        }


@router.post("/test-connection")
async def test_camera_connection(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    camera_id = str(payload.get("camera_id") or payload.get("id") or "").strip()
    rtsp_url = str(
        payload.get("rtsp_url")
        or payload.get("connection_url")
        or payload.get("url")
        or ""
    ).strip()

    if not rtsp_url and camera_id:
        camera = await repository.get_camera(camera_id, _organization_id(current_user))
        if camera is None:
            raise HTTPException(status_code=404, detail="Camera not found")
        rtsp_url = str(
            camera.get("connection_url")
            or camera.get("source")
            or camera.get("rtsp_url")
            or ""
        ).strip()

    if not rtsp_url:
        raise HTTPException(
            status_code=422,
            detail="Vui lòng cung cấp camera_id hoặc rtsp_url để kiểm tra kết nối",
        )

    timeout_seconds = max(1.0, min(float(payload.get("timeout_seconds") or 4.0), 10.0))
    result = await asyncio.to_thread(_probe_tcp_and_stream, rtsp_url, timeout_seconds)
    return result


@router.post("/discover")
async def discover_cameras(
    payload: dict[str, Any],
    request: Request,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    timeout_ms = max(1500, min(int(payload.get("timeout_ms") or 3500), 10000))
    enable_subnet_fallback = bool(payload.get("enable_subnet_fallback"))
    subnet_base = str(payload.get("subnet_base") or "").strip() or None
    try:
        candidates = await asyncio.to_thread(
            get_discovery(request).discover,
            timeout_ms,
            subnet_base,
            enable_subnet_fallback,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "success": True,
        "cameras": [public_discovery_candidate(candidate) for candidate in candidates],
        "message": f"Đã tìm thấy {len(candidates)} camera trong mạng LAN.",
    }


@router.post("")
async def save_camera(
    payload: dict[str, Any],
    request: Request,
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    camera_payload = dict(payload)
    discovery_id = str(
        camera_payload.get("discovery_id") or camera_payload.get("candidate_id") or ""
    ).strip()
    if discovery_id:
        try:
            resolved = get_discovery(request).resolve_candidate(
                discovery_id,
                username=str(camera_payload.get("username") or "admin"),
                password=str(camera_payload.get("password") or ""),
                preset=str(camera_payload.get("stream_preset") or "main"),
                custom_url=str(camera_payload.get("custom_rtsp_url") or ""),
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Camera discovery candidate đã hết hạn") from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        camera_payload.pop("discovery_id", None)
        camera_payload.pop("candidate_id", None)
        camera_payload.pop("stream_preset", None)
        camera_payload.pop("custom_rtsp_url", None)
        requested_name = str(camera_payload.get("name") or "").strip()
        camera_payload.update(resolved)
        if requested_name:
            camera_payload["name"] = requested_name
    if not str(camera_payload.get("name") or "").strip():
        raise HTTPException(status_code=422, detail="Camera name is required")
    camera_payload["organization_id"] = _organization_id(current_user)
    camera = await repository.save_camera(camera_payload)
    return {"success": True, "camera": public_camera(camera)}


@router.delete("/{camera_id}")
async def delete_camera(
    camera_id: str,
    request: Request,
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    organization_id = _organization_id(current_user)
    if await repository.get_camera(camera_id, organization_id) is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    await asyncio.to_thread(get_manager(request).stop, camera_id)
    return {"success": await repository.delete_camera(camera_id, organization_id)}


@router.post("/start")
async def start_camera(
    payload: dict[str, Any],
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    camera_id = str(payload.get("camera_id") or payload.get("id") or "").strip()
    if not camera_id:
        raise HTTPException(status_code=422, detail="camera_id is required")
    camera = await repository.get_camera(camera_id, _organization_id(current_user))
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return await get_manager(request).start(camera_id, camera)


@router.post("/stop")
async def stop_camera(
    request: Request,
    payload: Optional[dict[str, Any]] = None,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    camera_id = str((payload or {}).get("camera_id") or "").strip() or None
    if camera_id and await repository.get_camera(camera_id, _organization_id(current_user)) is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return await asyncio.to_thread(get_manager(request).stop, camera_id)


@router.get("/status")
async def camera_status(
    request: Request,
    camera_id: Optional[str] = None,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    if camera_id and await repository.get_camera(camera_id, _organization_id(current_user)) is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return {"success": True, **get_manager(request).status(camera_id)}


@router.get("/snapshot")
async def camera_snapshot(
    request: Request,
    camera_id: Optional[str] = None,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    if camera_id and await repository.get_camera(camera_id, _organization_id(current_user)) is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    snapshot = get_manager(request).snapshot(camera_id)
    if snapshot is None:
        return {"success": False, "message": "Camera chưa có frame mới."}
    return {"success": True, "image_base64": f"data:image/jpeg;base64,{base64.b64encode(snapshot).decode('ascii')}"}


@router.get("/stream")
async def camera_stream(
    request: Request,
    camera_id: Optional[str] = None,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> StreamingResponse:
    if camera_id and await repository.get_camera(camera_id, _organization_id(current_user)) is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    manager = get_manager(request)
    if not manager.is_running(camera_id):
        raise HTTPException(status_code=409, detail="Camera is not running")
    return StreamingResponse(manager.iter_mjpeg(camera_id), media_type="multipart/x-mixed-replace; boundary=frame")


@router.post("/{camera_id}/speak")
async def speak_camera(
    camera_id: str,
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    camera = await repository.get_camera(camera_id, _organization_id(current_user))
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return await asyncio.to_thread(speak_to_camera, camera, payload)
