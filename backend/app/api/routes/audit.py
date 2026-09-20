from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user, get_repository
from app.db.repository import Repository

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


def require_admin(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") not in {"ADMIN", "HR_MANAGER"}:
        raise HTTPException(status_code=403, detail="Administrator permission required")
    return user


def organization_id(user: dict[str, Any]) -> str:
    value = str(user.get("organization_id") or "").strip()
    if not value:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập thiếu tổ chức")
    return value


@router.get("/logs")
async def audit_logs(
    limit: int = 100,
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    logs = await repository.list_audit_logs(organization_id(current_user), limit)
    return {"success": True, "logs": logs, "audit_logs": logs}
