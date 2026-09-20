from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user, get_repository
from app.db.repository import Repository

departments_router = APIRouter(prefix="/api/v1/departments", tags=["departments"])
positions_router = APIRouter(prefix="/api/v1/positions", tags=["positions"])


def organization_id(user: dict[str, Any]) -> str:
    value = str(user.get("organization_id") or "").strip()
    if not value:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập thiếu tổ chức")
    return value


def require_admin(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") not in {"ADMIN", "HR_MANAGER"}:
        raise HTTPException(status_code=403, detail="Administrator permission required")
    return user


# --- DEPARTMENTS ---

@departments_router.get("")
async def list_departments(
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    departments = await repository.list_departments(organization_id(current_user))
    return {"success": True, "departments": departments}


@departments_router.post("")
async def save_department(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    try:
        department = await repository.save_department({
            **payload,
            "organization_id": organization_id(current_user),
        })
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    await repository.create_audit_log({
        "organization_id": organization_id(current_user),
        "user_account_id": current_user.get("uid"),
        "action": "department.save",
        "entity_type": "department",
        "entity_id": department.get("id"),
        "details": {"name": department.get("name"), "code": department.get("code")},
    })
    return {"success": True, "department": department}


@departments_router.delete("/{department_id}")
async def delete_department(
    department_id: str,
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    try:
        await repository.delete_department(department_id, organization_id(current_user))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Department not found") from exc

    await repository.create_audit_log({
        "organization_id": organization_id(current_user),
        "user_account_id": current_user.get("uid"),
        "action": "department.delete",
        "entity_type": "department",
        "entity_id": department_id,
        "details": {},
    })
    return {"success": True, "message": "Department deleted successfully"}


# --- POSITIONS ---

@positions_router.get("")
async def list_positions(
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    positions = await repository.list_positions(organization_id(current_user))
    return {"success": True, "positions": positions}


@positions_router.post("")
async def save_position(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    try:
        position = await repository.save_position({
            **payload,
            "organization_id": organization_id(current_user),
        })
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    await repository.create_audit_log({
        "organization_id": organization_id(current_user),
        "user_account_id": current_user.get("uid"),
        "action": "position.save",
        "entity_type": "position",
        "entity_id": position.get("id"),
        "details": {"name": position.get("name") or position.get("title"), "code": position.get("code")},
    })
    return {"success": True, "position": position}


@positions_router.delete("/{position_id}")
async def delete_position(
    position_id: str,
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    try:
        await repository.delete_position(position_id, organization_id(current_user))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Position not found") from exc

    await repository.create_audit_log({
        "organization_id": organization_id(current_user),
        "user_account_id": current_user.get("uid"),
        "action": "position.delete",
        "entity_type": "position",
        "entity_id": position_id,
        "details": {},
    })
    return {"success": True, "message": "Position deleted successfully"}
