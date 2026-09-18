from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_repository
from app.db.repository import Repository

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


@router.get("/attendance")
async def attendance_report(
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    records = await repository.list_attendance({})
    return {"success": True, "records": records, "attendance": records}


@router.get("/attendance/online")
async def online_attendance_report(
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    records = await repository.list_attendance({})
    return {"success": True, "records": records}

