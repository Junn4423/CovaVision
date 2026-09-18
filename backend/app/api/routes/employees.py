from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import get_current_user, get_recognition_service, get_repository
from app.api.image_input import read_image_request
from app.db.repository import Repository
from app.recognition.service import RecognitionService, RecognitionUnavailable

router = APIRouter(prefix="/api/v1/employees", tags=["employees"])


def public_employee(employee: dict[str, Any]) -> dict[str, Any]:
    hidden = {"image_base64", "embedding", "password", "password_hash"}
    return {key: value for key, value in employee.items() if key not in hidden}


@router.get("")
async def list_employees(
    query: str = "",
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    employees = await repository.list_employees(query)
    return {"success": True, "employees": [public_employee(item) for item in employees]}


@router.post("/import")
async def import_employees(
    payload: Optional[dict[str, Any]] = None,
    _: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    return {"success": True, "imported": 0, "message": "CovaVision quản lý nhân viên nội bộ."}


@router.get("/compare")
async def compare_employees(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {"success": True, "summary": {"total": 0, "matched": 0, "differences": 0}, "items": []}


@router.get("/{employee_id}")
async def get_employee(
    employee_id: str,
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    employee = await repository.get_employee(employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"success": True, "employee": public_employee(employee)}


@router.post("")
async def save_employee(
    payload: dict[str, Any],
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    employee = await repository.save_employee(payload)
    return {"success": True, "employee": public_employee(employee)}


@router.post("/face")
async def register_face(
    request: Request,
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
    recognition: RecognitionService = Depends(get_recognition_service),
) -> dict[str, Any]:
    try:
        payload, image_bytes = await read_image_request(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not payload.get("employee_id"):
        raise HTTPException(status_code=422, detail="employee_id is required")
    try:
        embedding, error = await recognition.encode_face(image_bytes)
    except RecognitionUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if embedding is None:
        raise HTTPException(status_code=422, detail=error or "Không tạo được face template")
    employee = await repository.save_employee(payload)
    try:
        employee = await repository.save_employee_face(
            str(employee.get("id") or payload.get("employee_id")),
            embedding,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Employee not found") from exc
    return {"success": True, "message": "Face template registered", "employee": public_employee(employee)}


@router.get("/{employee_id}/image")
async def employee_image(
    employee_id: str,
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    employee = await repository.get_employee(employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {
        "success": True,
        "employee_id": employee_id,
        "image_base64": employee.get("image_base64"),
        "image_url": employee.get("image_url", ""),
    }


@router.delete("/{employee_id}/face")
async def clear_face(
    employee_id: str,
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    employee = await repository.get_employee(employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    try:
        updated = await repository.clear_employee_face(employee_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Employee not found") from exc
    return {"success": True, "employee": public_employee(updated)}


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: str,
    _: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    employee = await repository.get_employee(employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    await repository.save_employee({**employee, "status": "INACTIVE"})
    return {"success": True}
