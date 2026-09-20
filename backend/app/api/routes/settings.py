from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user, get_repository
from app.db.repository import Repository

router = APIRouter(prefix="/api/v1", tags=["settings"])


def _organization_id(user: dict[str, Any]) -> str:
    organization_id = str(user.get("organization_id") or "").strip()
    if not organization_id:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập thiếu tổ chức")
    return organization_id


@router.get("/settings")
async def get_settings(
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {
        "success": True,
        "settings": await repository.get_settings(
            organization_id=_organization_id(current_user),
        ),
    }


def _require_admin(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """BIZ-05: Only admins may change system settings."""
    if user.get("role") not in {"ADMIN", "HR_MANAGER"}:
        raise HTTPException(status_code=403, detail="Administrator permission required")
    return user


@router.post("/settings")
async def save_settings(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {
        "success": True,
        "settings": await repository.save_settings(
            payload,
            organization_id=_organization_id(current_user),
        ),
    }


@router.get("/settings/attendance")
async def attendance_settings(
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {"success": True, "settings": await repository.get_settings(
        "attendance_settings",
        _organization_id(current_user),
    )}


@router.get("/settings/mobile")
async def mobile_settings(
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {"success": True, "settings": await repository.get_settings(
        "mobile_config",
        _organization_id(current_user),
    )}


@router.post("/settings/mobile")
async def save_mobile_settings(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    await repository.save_settings(
        {"mobile_config": payload},
        organization_id=_organization_id(current_user),
    )
    return {"success": True, "settings": {"mobile_config": payload}}


@router.get("/location")
async def get_location(
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {"success": True, "location": (await repository.get_settings(
        "location",
        _organization_id(current_user),
    )).get("location")}


@router.post("/location")
async def save_location(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    await repository.save_settings(
        {"location": payload},
        organization_id=_organization_id(current_user),
    )
    return {"success": True, "location": payload}


@router.get("/system/storage")
async def system_storage(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {"success": True, "storage": {"backend": "mysql", "runtime": "covavision"}}
