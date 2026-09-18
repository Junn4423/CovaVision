from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import get_current_user, get_recognition_service, get_repository
from app.api.image_input import read_image_request, similarity_threshold
from app.db.repository import Repository
from app.recognition.service import RecognitionService, RecognitionUnavailable

router = APIRouter(prefix="/api/v1/attendance", tags=["attendance"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _manual_record(payload: dict[str, Any], repository: Repository) -> dict[str, Any]:
    employee_id = str(payload.get("employee_id") or payload.get("user_id") or "").strip()
    if employee_id and await repository.get_employee(employee_id) is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    record = await repository.create_attendance({
        "employee_id": employee_id or None,
        "camera_id": payload.get("camera_id"),
        "attendance_type": payload.get("attendance_type", "auto"),
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
    payload, image_bytes = await read_image_request(request)
    try:
        return await recognition.recognize(
            image_bytes,
            attendance_type=str(payload.get("attendance_type") or "auto"),
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
    records = await repository.list_attendance({})
    return {"success": True, "records": records[:100], "attendance": records[:100]}


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
    records = await repository.list_attendance({})
    return {"success": True, "total": len(records), "today": len(records), "accepted": len(records)}


@router.get("/{attendance_id}")
async def attendance_status(attendance_id: str, _: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {"success": True, "id": attendance_id, "status": "accepted"}


@router.post("/sync")
async def sync_attendance(
    payload: dict[str, Any],
    _: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    return {"success": True, "synced": True, "external_sync": False, "payload": payload}
