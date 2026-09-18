from __future__ import annotations

import base64
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user, get_repository
from app.db.repository import Repository

router = APIRouter(prefix="/api/v1/cameras", tags=["cameras"])


def public_camera(camera: dict[str, Any]) -> dict[str, Any]:
    # Camera connection details never cross the API boundary. The browser/mobile
    # client receives only an opaque id and operational metadata; the backend is
    # the sole component that opens RTSP and stores credentials.
    hidden = {
        "connection_url",
        "source",
        "rtsp_url",
        "stream_url",
        "username",
        "password",
        "password_secret",
        "secret",
        "ip",
        "host",
        "port",
        "camera_ip",
    }
    result = {key: value for key, value in camera.items() if key not in hidden}
    result.setdefault("camera_type", result.get("type", "rtsp"))
    return result


def get_manager(request: Request) -> Any:
    return request.app.state.camera_manager


@router.get("")
async def list_cameras(
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {"success": True, "cameras": [public_camera(item) for item in await repository.list_cameras()]}


@router.post("")
async def save_camera(
    payload: dict[str, Any],
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    if not str(payload.get("name") or "").strip():
        raise HTTPException(status_code=422, detail="Camera name is required")
    camera = await repository.save_camera(payload)
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
