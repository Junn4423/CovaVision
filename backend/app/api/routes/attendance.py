from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import get_current_user, get_recognition_service, get_repository
from app.api.image_input import read_image_request
from app.db.repository import Repository
from app.recognition.service import RecognitionService, RecognitionUnavailable

router = APIRouter(prefix="/api/v1/attendance", tags=["attendance"])
VIETNAM_TZ = timezone(timedelta(hours=7))


def _organization_id(user: dict[str, Any]) -> str:
    organization_id = str(user.get("organization_id") or "").strip()
    if not organization_id:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập thiếu tổ chức")
    return organization_id


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_start_utc() -> str:
    """Return the start of today (UTC midnight) as ISO string."""
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def _is_today(captured_at: Any) -> bool:
    """Check if a captured_at timestamp is from today (Vietnam local time UTC+7)."""
    if not captured_at:
        return False
    try:
        if isinstance(captured_at, str):
            ts = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
        elif isinstance(captured_at, datetime):
            ts = captured_at if captured_at.tzinfo else captured_at.replace(tzinfo=timezone.utc)
        else:
            return False
        today_vn = datetime.now(VIETNAM_TZ).date()
        ts_vn = ts.astimezone(VIETNAM_TZ)
        return ts_vn.date() == today_vn
    except Exception:
        return False


async def _manual_record(payload: dict[str, Any], repository: Repository) -> dict[str, Any]:
    employee_id = str(payload.get("employee_id") or payload.get("user_id") or "").strip()
    if employee_id and await repository.get_employee(employee_id) is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    record = await repository.create_attendance({
        "employee_id": employee_id or None,
        "camera_id": payload.get("camera_id"),
        "attendance_type": "auto",
        "status": "accepted",
        "captured_at": payload.get("captured_at") or _now(),
        "confidence": payload.get("confidence"),
        "location": payload.get("location"),
    })
    return {"success": True, "record": record, **record}


@router.post("")
async def create_attendance(
    payload: dict[str, Any],
    _: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    raise HTTPException(status_code=405, detail="Chấm công chỉ được ghi nhận từ ảnh nhận diện khuôn mặt")


@router.post("/recognize")
async def recognize_attendance(
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
    recognition: RecognitionService = Depends(get_recognition_service),
) -> dict[str, Any]:
    # API-02: Wrap read_image_request to return 422 instead of 500 on invalid input.
    try:
        payload, image_bytes = await read_image_request(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        return await recognition.recognize(
            image_bytes,
            attendance_type="auto",
            camera_id=str(payload.get("camera_id") or "").strip() or None,
            location=payload.get("location"),
            include_preview=bool(payload.get("include_preview", False)),
            client_event_id=str(payload.get("client_event_id") or payload.get("clientEventId") or "").strip() or None,
            organization_id=_organization_id(current_user),
        )
    except RecognitionUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/detect")
async def detect_faces(
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
    recognition: RecognitionService = Depends(get_recognition_service),
) -> dict[str, Any]:
    try:
        payload, image_bytes = await read_image_request(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        return await recognition.detect(
            image_bytes,
            max_faces=int(payload.get("max_faces") or 3),
            organization_id=_organization_id(current_user),
        )
    except RecognitionUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/records")
async def attendance_records(
    employee_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    limit: Optional[int] = 200,
    offset: Optional[int] = 0,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    filters: dict[str, Any] = {"employee_id": employee_id}
    if start_date:
        filters["start_date"] = start_date
    if end_date:
        filters["end_date"] = end_date
    if status:
        filters["status"] = status
    if limit is not None:
        filters["limit"] = limit
    if offset is not None:
        filters["offset"] = offset
    records = await repository.list_attendance(filters, _organization_id(current_user))
    return {"success": True, "records": records, "attendance": records}


@router.get("/today")
async def today_attendance(
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    # BIZ-02: Filter records to today only.
    records = await repository.list_attendance({}, _organization_id(current_user))
    today_records = [r for r in records if _is_today(r.get("captured_at"))]
    return {"success": True, "records": today_records[:100], "attendance": today_records[:100]}


@router.get("/recent")
async def recent_attendance(
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    records = await repository.list_attendance({}, _organization_id(current_user))
    return {"success": True, "records": records[:20]}


@router.get("/stats")
async def attendance_stats(
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    # BIZ-01: Compute stats correctly — today only counts today's records,
    # accepted only counts accepted records.
    records = await repository.list_attendance({}, _organization_id(current_user))
    today_records = [r for r in records if _is_today(r.get("captured_at"))]
    accepted_records = [r for r in records if str(r.get("status", "")).lower() == "accepted"]
    today_late = sum(1 for r in today_records if r.get("is_late") or r.get("shift_status") == "late")
    today_early = sum(1 for r in today_records if r.get("is_early_departure") or r.get("shift_status") == "early_departure")
    return {
        "success": True,
        "total": len(records),
        "today": len(today_records),
        "accepted": len(accepted_records),
        "late_today": today_late,
        "early_today": today_early,
    }


@router.get("/{attendance_id}")
async def attendance_status(
    attendance_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    # BIZ-08: Query the actual record from the database instead of hardcoding.
    records = await repository.list_attendance({}, _organization_id(current_user))
    record = next((r for r in records if str(r.get("id", "")) == attendance_id), None)
    if record is None:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    return {"success": True, **record}
