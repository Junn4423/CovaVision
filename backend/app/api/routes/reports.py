from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.api.deps import get_current_user, get_repository
from app.db.repository import Repository

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


def _organization_id(user: dict[str, Any]) -> str:
    organization_id = str(user.get("organization_id") or "").strip()
    if not organization_id:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập thiếu tổ chức")
    return organization_id


def _build_filters(
    start_date: str | None = None,
    end_date: str | None = None,
    employee_id: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if start_date:
        filters["start_date"] = start_date
    if end_date:
        filters["end_date"] = end_date
    if employee_id:
        filters["employee_id"] = employee_id
    if status:
        filters["status"] = status
    return filters


def _page_values(limit: int | None, offset: int) -> tuple[int, int]:
    if offset < 0:
        raise HTTPException(status_code=422, detail="offset phải lớn hơn hoặc bằng 0")
    if limit is not None and limit < 1:
        raise HTTPException(status_code=422, detail="limit phải lớn hơn 0")
    return min(limit or 200, 100), offset


async def _attendance_page(
    repository: Repository,
    filters: dict[str, Any],
    organization_id: str,
    limit: int | None,
    offset: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    page_limit, page_offset = _page_values(limit, offset)
    records = await repository.list_attendance(
        {**filters, "limit": page_limit + 1, "offset": page_offset},
        organization_id,
    )
    has_more = len(records) > page_limit
    return records[:page_limit], {"limit": page_limit, "offset": page_offset, "has_more": has_more}


@router.get("/attendance")
async def attendance_report(
    start_date: str | None = None,
    end_date: str | None = None,
    employee_id: str | None = None,
    status: str | None = None,
    limit: int | None = None,
    offset: int = 0,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    filters = _build_filters(start_date, end_date, employee_id, status)
    records, pagination = await _attendance_page(
        repository,
        filters,
        _organization_id(current_user),
        limit,
        offset,
    )
    return {"success": True, "records": records, "attendance": records, "pagination": pagination}


@router.get("/attendance/online")
async def online_attendance_report(
    start_date: str | None = None,
    end_date: str | None = None,
    employee_id: str | None = None,
    status: str | None = None,
    limit: int | None = None,
    offset: int = 0,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    filters = _build_filters(start_date, end_date, employee_id, status)
    records, pagination = await _attendance_page(
        repository,
        filters,
        _organization_id(current_user),
        limit,
        offset,
    )
    return {"success": True, "records": records, "pagination": pagination}


@router.get("/attendance/export")
async def export_attendance(
    start_date: str | None = None,
    end_date: str | None = None,
    employee_id: str | None = None,
    status: str | None = None,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> Response:
    filters = _build_filters(start_date, end_date, employee_id, status)
    records = await repository.list_attendance(filters, _organization_id(current_user))
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
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": "attachment; filename=covavision-attendance.csv"},
    )
