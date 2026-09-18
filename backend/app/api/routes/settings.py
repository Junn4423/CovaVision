from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_repository
from app.db.repository import Repository

router = APIRouter(prefix="/api/v1", tags=["settings"])


@router.get("/settings")
async def get_settings(
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {"success": True, "settings": await repository.get_settings()}


@router.post("/settings")
async def save_settings(
    payload: dict[str, Any],
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {"success": True, "settings": await repository.save_settings(payload)}


@router.get("/settings/attendance")
async def attendance_settings(
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {"success": True, "settings": await repository.get_settings("attendance_settings")}


@router.get("/settings/mobile")
async def mobile_settings(
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {"success": True, "settings": await repository.get_settings("mobile_config")}


@router.post("/settings/mobile")
async def save_mobile_settings(
    payload: dict[str, Any],
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    await repository.save_settings({"mobile_config": payload})
    return {"success": True, "settings": {"mobile_config": payload}}


@router.get("/location")
async def get_location(
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {"success": True, "location": (await repository.get_settings("location")).get("location")}


@router.post("/location")
async def save_location(
    payload: dict[str, Any],
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    await repository.save_settings({"location": payload})
    return {"success": True, "location": payload}


@router.get("/system/storage")
async def system_storage(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {"success": True, "storage": {"backend": "mysql", "runtime": "covavision"}}
