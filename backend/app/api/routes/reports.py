from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import Response

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


@router.get("/attendance/export")
async def export_attendance(
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> Response:
    records = await repository.list_attendance({})
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "employee_id", "employee_name", "camera_id", "camera_name", "attendance_type", "status", "captured_at", "confidence"])
    for record in records:
        writer.writerow([
            record.get("id", ""),
            record.get("employee_id", ""),
            record.get("employee_name", ""),
            record.get("camera_id", ""),
            record.get("camera_name", ""),
            record.get("attendance_type", ""),
            record.get("status", ""),
            record.get("captured_at", ""),
            record.get("confidence", ""),
        ])
    return Response(
        content=output.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=covavision-attendance.csv"},
    )
