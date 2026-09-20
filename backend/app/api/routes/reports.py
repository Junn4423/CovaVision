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
    return min(limit or 500, 1000), offset


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


from datetime import datetime, timedelta, timezone

_VIETNAM_TZ = timezone(timedelta(hours=7))


def _parse_scan_time(ts_val: Any) -> datetime | None:
    if not ts_val:
        return None
    try:
        if isinstance(ts_val, datetime):
            return ts_val.astimezone(_VIETNAM_TZ) if ts_val.tzinfo else ts_val.replace(tzinfo=timezone.utc).astimezone(_VIETNAM_TZ)
        dt = datetime.fromisoformat(str(ts_val).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(_VIETNAM_TZ)
    except Exception:
        return None


async def _generate_timesheet(
    repository: Repository,
    organization_id: str,
    start_date: str | None,
    end_date: str | None,
    employee_id: str | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    # Get shift settings
    settings = await repository.get_settings(organization_id=organization_id)
    shift_start_str = str(settings.get("shift_start_time") or "08:00").strip()
    shift_end_str = str(settings.get("shift_end_time") or "17:30").strip()
    try:
        sh, sm = map(int, shift_start_str.split(":"))
        start_min = sh * 60 + sm
    except Exception:
        start_min = 8 * 60
    try:
        eh, em = map(int, shift_end_str.split(":"))
        end_min = eh * 60 + em
    except Exception:
        end_min = 17 * 60 + 30
    try:
        late_tolerance = int(settings.get("late_tolerance_minutes") or 15)
    except Exception:
        late_tolerance = 15

    # Fetch attendance records
    filters: dict[str, Any] = {"limit": 10000}
    if start_date:
        filters["start_date"] = start_date
    if end_date:
        filters["end_date"] = end_date
    if employee_id:
        filters["employee_id"] = employee_id

    records = await repository.list_attendance(filters, organization_id)
    accepted = [r for r in records if str(r.get("status", "")).lower() == "accepted"]

    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    emp_names: dict[str, str] = {}
    for r in accepted:
        emp_id = str(r.get("employee_id") or "").strip()
        if not emp_id:
            continue
        emp_names[emp_id] = str(r.get("employee_name") or emp_names.get(emp_id) or emp_id)
        dt = _parse_scan_time(r.get("captured_at"))
        if not dt:
            continue
        date_str = dt.strftime("%Y-%m-%d")
        groups.setdefault((emp_id, date_str), []).append({"dt": dt, "record": r})

    timesheet_rows = []
    summary_by_emp: dict[str, dict[str, Any]] = {}

    for (emp_id, date_str), items in sorted(groups.items(), key=lambda x: (x[0][1], x[0][0])):
        items.sort(key=lambda x: x["dt"])
        first_scan = items[0]["dt"]
        last_scan = items[-1]["dt"]

        if len(items) == 1:
            scan_min = first_scan.hour * 60 + first_scan.minute
            if scan_min < 12 * 60:
                check_in_dt = first_scan
                check_out_dt = None
            else:
                check_in_dt = None
                check_out_dt = last_scan
        else:
            check_in_dt = first_scan
            check_out_dt = last_scan

        is_late = False
        late_minutes = 0
        if check_in_dt:
            cin_min = check_in_dt.hour * 60 + check_in_dt.minute
            if cin_min > (start_min + late_tolerance):
                is_late = True
                late_minutes = max(0, cin_min - start_min)

        is_early = False
        early_minutes = 0
        if check_out_dt:
            cout_min = check_out_dt.hour * 60 + check_out_dt.minute
            if cout_min < end_min:
                is_early = True
                early_minutes = max(0, end_min - cout_min)

        if check_in_dt and check_out_dt:
            diff_secs = max(0, (check_out_dt - check_in_dt).total_seconds())
            work_hours = round(diff_secs / 3600.0, 2)
        else:
            work_hours = 0.0

        if is_late and is_early:
            status = "late_and_early"
        elif is_late:
            status = "late"
        elif is_early:
            status = "early_departure"
        elif check_in_dt and check_out_dt:
            status = "completed"
        elif check_in_dt:
            status = "missing_checkout"
        else:
            status = "missing_checkin"

        row = {
            "employee_id": emp_id,
            "employee_name": emp_names.get(emp_id, emp_id),
            "date": date_str,
            "check_in": check_in_dt.strftime("%H:%M:%S") if check_in_dt else None,
            "check_out": check_out_dt.strftime("%H:%M:%S") if check_out_dt else None,
            "work_hours": work_hours,
            "is_late": is_late,
            "late_minutes": late_minutes,
            "is_early_departure": is_early,
            "early_minutes": early_minutes,
            "status": status,
            "scan_count": len(items),
        }
        timesheet_rows.append(row)

        emp_sum = summary_by_emp.setdefault(emp_id, {
            "employee_id": emp_id,
            "employee_name": emp_names.get(emp_id, emp_id),
            "total_days": 0,
            "total_hours": 0.0,
            "total_late_count": 0,
            "total_late_minutes": 0,
            "total_early_count": 0,
            "total_early_minutes": 0,
        })
        emp_sum["total_days"] += 1
        emp_sum["total_hours"] = round(emp_sum["total_hours"] + work_hours, 2)
        if is_late:
            emp_sum["total_late_count"] += 1
            emp_sum["total_late_minutes"] += late_minutes
        if is_early:
            emp_sum["total_early_count"] += 1
            emp_sum["total_early_minutes"] += early_minutes

    stats = {
        "total_records": len(accepted),
        "total_work_days": len(timesheet_rows),
        "total_late_cases": sum(1 for r in timesheet_rows if r["is_late"]),
        "total_early_cases": sum(1 for r in timesheet_rows if r["is_early_departure"]),
        "total_employees": len(summary_by_emp),
    }

    return timesheet_rows, list(summary_by_emp.values()), stats


@router.get("/timesheet")
async def timesheet_report(
    start_date: str | None = None,
    end_date: str | None = None,
    employee_id: str | None = None,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    timesheet, summary, stats = await _generate_timesheet(
        repository=repository,
        organization_id=_organization_id(current_user),
        start_date=start_date,
        end_date=end_date,
        employee_id=employee_id,
    )
    return {
        "success": True,
        "timesheet": timesheet,
        "summary": summary,
        "stats": stats,
    }


@router.get("/timesheet/export")
async def export_timesheet(
    start_date: str | None = None,
    end_date: str | None = None,
    employee_id: str | None = None,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> Response:
    timesheet, _, _ = await _generate_timesheet(
        repository=repository,
        organization_id=_organization_id(current_user),
        start_date=start_date,
        end_date=end_date,
        employee_id=employee_id,
    )
    status_vn_map = {
        "completed": "Đúng giờ",
        "late": "Đi muộn",
        "early_departure": "Về sớm",
        "late_and_early": "Đi muộn & Về sớm",
        "missing_checkout": "Thiếu giờ ra",
        "missing_checkin": "Thiếu giờ vào",
    }
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Mã nhân viên",
        "Họ và tên",
        "Ngày",
        "Giờ vào (Check-in)",
        "Giờ ra (Check-out)",
        "Tổng giờ làm",
        "Trạng thái",
        "Đi muộn (phút)",
        "Về sớm (phút)",
        "Số lần quét",
    ])
    for row in timesheet:
        writer.writerow([
            row.get("employee_id", ""),
            row.get("employee_name", ""),
            row.get("date", ""),
            row.get("check_in") or "--:--:--",
            row.get("check_out") or "--:--:--",
            f"{row.get('work_hours', 0.0):.2f}",
            status_vn_map.get(row.get("status", ""), row.get("status", "")),
            row.get("late_minutes", 0),
            row.get("early_minutes", 0),
            row.get("scan_count", 1),
        ])
    return Response(
        content=output.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": "attachment; filename=covavision-timesheet.csv"},
    )


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
    writer.writerow(["id", "employee_id", "employee_name", "camera_id", "camera_name", "attendance_type", "status", "captured_at", "confidence", "is_late", "late_minutes", "is_early_departure", "early_minutes"])
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
            record.get("is_late", False),
            record.get("late_minutes", 0),
            record.get("is_early_departure", False),
            record.get("early_minutes", 0),
        ])
    return Response(
        content=output.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": "attachment; filename=covavision-attendance.csv"},
    )
