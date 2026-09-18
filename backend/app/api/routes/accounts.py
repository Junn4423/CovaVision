from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user, get_repository
from app.db.repository import Repository

router = APIRouter(prefix="/api/v1/accounts", tags=["accounts"])


def require_admin(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") not in {"ADMIN", "HR_MANAGER"}:
        raise HTTPException(status_code=403, detail="Administrator permission required")
    return user


@router.get("")
async def list_accounts(
    _: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    accounts = await repository.list_accounts()
    return {"success": True, "accounts": accounts}


@router.post("")
async def save_account(
    payload: dict[str, Any],
    _: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    try:
        account = await repository.save_account(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"success": True, "account": account}


@router.post("/import")
async def import_accounts(_: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    return {"success": True, "imported": 0, "message": "Tài khoản được quản lý trực tiếp trong CovaVision."}


@router.post("/{account_id}/password")
async def reset_password(
    account_id: str,
    payload: dict[str, Any],
    _: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    password = str(payload.get("password") or "").strip()
    if not password:
        raise HTTPException(status_code=422, detail="password is required")
    try:
        account = await repository.reset_account_password(account_id, password)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Account not found") from exc
    return {"success": True, "account": account}


@router.post("/{account_id}/lock")
async def set_lock(
    account_id: str,
    payload: dict[str, Any],
    _: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    try:
        account = await repository.set_account_lock(account_id, bool(payload.get("is_locked", False)))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Account not found") from exc
    return {"success": True, "account": account}
