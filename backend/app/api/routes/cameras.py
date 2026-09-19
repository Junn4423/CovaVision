from __future__ import annotations

import asyncio
import base64
import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user, get_repository
from app.camera.discovery import public_discovery_candidate
from app.db.repository import Repository

router = APIRouter(prefix="/api/v1/cameras", tags=["cameras"])


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
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {"success": True, "cameras": [public_camera(item) for item in await repository.list_cameras()]}


@router.post("/discover")
async def discover_cameras(
    payload: dict[str, Any],
    request: Request,
    _: dict[str, Any] = Depends(get_current_user),
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
    _: dict[str, Any] = Depends(get_current_user),
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
        camera_payload.update(resolved)
    if not str(camera_payload.get("name") or "").strip():
        raise HTTPException(status_code=422, detail="Camera name is required")
    camera = await repository.save_camera(camera_payload)
    return {"success": True, "camera": public_camera(camera)}


@router.delete("/{camera_id}")
async def delete_camera(
    camera_id: str,
    request: Request,
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    get_manager(request).stop(camera_id)
    return {"success": await repository.delete_camera(camera_id)}


@router.post("/start")
async def start_camera(
    payload: dict[str, Any],
    request: Request,
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    camera_id = str(payload.get("camera_id") or payload.get("id") or "").strip()
    if not camera_id:
        raise HTTPException(status_code=422, detail="camera_id is required")
    camera = await repository.get_camera(camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return await get_manager(request).start(camera_id, camera)


@router.post("/stop")
async def stop_camera(
    request: Request,
    payload: Optional[dict[str, Any]] = None,
    _: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    camera_id = str((payload or {}).get("camera_id") or "").strip() or None
    return get_manager(request).stop(camera_id)


@router.get("/status")
async def camera_status(
    request: Request,
    camera_id: Optional[str] = None,
    _: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    return {"success": True, **get_manager(request).status(camera_id)}


@router.get("/snapshot")
async def camera_snapshot(
    request: Request,
    camera_id: Optional[str] = None,
    _: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    snapshot = get_manager(request).snapshot(camera_id)
    if snapshot is None:
        return {"success": False, "message": "Camera chưa có frame mới."}
    return {"success": True, "image_base64": f"data:image/jpeg;base64,{base64.b64encode(snapshot).decode('ascii')}"}


@router.get("/stream")
async def camera_stream(
    request: Request,
    camera_id: Optional[str] = None,
    _: dict[str, Any] = Depends(get_current_user),
) -> StreamingResponse:
    manager = get_manager(request)
    if not manager.is_running(camera_id):
        raise HTTPException(status_code=409, detail="Camera is not running")
    return StreamingResponse(manager.iter_mjpeg(camera_id), media_type="multipart/x-mixed-replace; boundary=frame")


@router.post("/{camera_id}/speak")
async def speak_camera(
    camera_id: str,
    payload: dict[str, Any],
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    if await repository.get_camera(camera_id) is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return {"success": False, "message": "Camera speaker adapter chưa được bật trên backend."}
