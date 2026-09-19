from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import get_current_user, get_recognition_service, get_repository
from app.api.image_input import read_image_request, similarity_threshold
from app.db.repository import Repository
from app.recognition.service import RecognitionService, RecognitionUnavailable

router = APIRouter(prefix="/api/v1/attendance", tags=["attendance"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_start_utc() -> str:
    """Return the start of today (UTC midnight) as ISO string."""
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def _is_today(captured_at: Any) -> bool:
    """Check if a captured_at timestamp is from today (UTC)."""
    if not captured_at:
        return False
    try:
        if isinstance(captured_at, str):
            ts = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
        elif isinstance(captured_at, datetime):
            ts = captured_at if captured_at.tzinfo else captured_at.replace(tzinfo=timezone.utc)
        else:
            return False
        today = datetime.now(timezone.utc).date()
        return ts.date() == today
    except (ValueError, TypeError):
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
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return await _manual_record(payload, repository)


@router.post("/recognize")
async def recognize_attendance(
    request: Request,
    _: dict[str, Any] = Depends(get_current_user),
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
            similarity_threshold=similarity_threshold(payload),
        )
    except RecognitionUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/detect")
async def detect_faces(
    request: Request,
    _: dict[str, Any] = Depends(get_current_user),
    recognition: RecognitionService = Depends(get_recognition_service),
) -> dict[str, Any]:
    payload, image_bytes = await read_image_request(request)
    try:
        return await recognition.detect(
            image_bytes,
            max_faces=int(payload.get("max_faces") or 3),
            similarity_threshold=similarity_threshold(payload),
        )
    except RecognitionUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/records")
async def attendance_records(
    employee_id: Optional[str] = None,
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    records = await repository.list_attendance({"employee_id": employee_id})
    return {"success": True, "records": records, "attendance": records}


@router.get("/today")
async def today_attendance(
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    # BIZ-02: Filter records to today only.
    records = await repository.list_attendance({})
    today_records = [r for r in records if _is_today(r.get("captured_at"))]
    return {"success": True, "records": today_records[:100], "attendance": today_records[:100]}


@router.get("/recent")
async def recent_attendance(
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    records = await repository.list_attendance({})
    return {"success": True, "records": records[:20]}


@router.get("/stats")
async def attendance_stats(
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    # BIZ-01: Compute stats correctly — today only counts today's records,
    # accepted only counts accepted records.
    records = await repository.list_attendance({})
    today_records = [r for r in records if _is_today(r.get("captured_at"))]
    accepted_records = [r for r in records if str(r.get("status", "")).lower() == "accepted"]
    return {
        "success": True,
        "total": len(records),
        "today": len(today_records),
        "accepted": len(accepted_records),
    }


@router.get("/{attendance_id}")
async def attendance_status(
    attendance_id: str,
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    # BIZ-08: Query the actual record from the database instead of hardcoding.
    records = await repository.list_attendance({})
    record = next((r for r in records if str(r.get("id", "")) == attendance_id), None)
    if record is None:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    return {"success": True, **record}

