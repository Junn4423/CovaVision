from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile

from app.api.deps import get_current_user, get_repository
from app.db.repository import Repository

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
    payload: Optional[dict[str, Any]] = None,
    image: Optional[UploadFile] = None,
    _: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    del payload, image
    raise HTTPException(
        status_code=503,
        detail="Recognition engine chưa được cài model vision trên backend.",
    )


@router.post("/detect")
async def detect_faces(
    payload: Optional[dict[str, Any]] = None,
    image: Optional[UploadFile] = None,
    _: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    del payload, image
    raise HTTPException(status_code=503, detail="Recognition engine chưa sẵn sàng.")


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
