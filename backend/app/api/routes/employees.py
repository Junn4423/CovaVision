from __future__ import annotations

import base64
import codecs
import csv
from datetime import datetime
import io
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile

from app.api.deps import get_current_user, get_recognition_service, get_repository
from app.api.image_input import read_image_request
from app.billing.quotas import quota_error
from app.api.routes.accounts import require_admin
from app.db.repository import Repository
from app.recognition.service import RecognitionService, RecognitionUnavailable

router = APIRouter(prefix="/api/v1/employees", tags=["employees"])


def _organization_id(user: dict[str, Any]) -> str:
    organization_id = str(user.get("organization_id") or "").strip()
    if not organization_id:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập thiếu tổ chức")
    return organization_id


def public_employee(employee: dict[str, Any]) -> dict[str, Any]:
    hidden = {"image_base64", "embedding", "password", "password_hash"}
    return {key: value for key, value in employee.items() if key not in hidden}


@router.get("")
async def list_employees(
    query: str = "",
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    employees = await repository.list_employees(query, _organization_id(current_user))
    return {"success": True, "employees": [public_employee(item) for item in employees]}


@router.get("/export")
async def export_employees(
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> Response:
    organization_id = _organization_id(current_user)
    employees = await repository.list_employees("", organization_id)

    output = io.StringIO()
    writer = csv.writer(output, delimiter=",", quoting=csv.QUOTE_MINIMAL)
    writer.writerow([
        "Mã NV",
        "Họ và tên",
        "Phòng ban",
        "Chức vụ",
        "Email",
        "Số điện thoại",
        "Đã đăng ký mặt",
        "Trạng thái",
    ])

    for emp in employees:
        writer.writerow([
            emp.get("employee_id") or emp.get("employee_code") or emp.get("id") or "",
            emp.get("name") or "",
            emp.get("department") or "",
            emp.get("position") or "",
            emp.get("email") or "",
            emp.get("phone") or "",
            "Đã đăng ký" if emp.get("has_face") else "Chưa đăng ký",
            emp.get("status") or "ACTIVE",
        ])

    csv_bytes = codecs.BOM_UTF8 + output.getvalue().encode("utf-8")
    filename = f"danh_sach_nhan_vien_{datetime.now().strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import")
async def import_employees(
    request: Request,
    file: Optional[UploadFile] = File(None),
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    organization_id = _organization_id(current_user)

    raw_content = ""
    rows: list[dict[str, Any]] = []

    content_type = request.headers.get("content-type", "").lower()
    if "application/json" in content_type:
        try:
            body = await request.json()
            if isinstance(body, list):
                rows = body
            elif isinstance(body, dict) and "employees" in body:
                rows = body["employees"]
        except Exception as exc:
            raise HTTPException(status_code=422, detail="Dữ liệu JSON không hợp lệ") from exc
    elif file is not None:
        file_bytes = await file.read()
        try:
            raw_content = file_bytes.decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                raw_content = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                raw_content = file_bytes.decode("latin1")
    else:
        try:
            form = await request.form()
            upload_item = form.get("file")
            if upload_item and hasattr(upload_item, "read"):
                file_bytes = await upload_item.read()
                try:
                    raw_content = file_bytes.decode("utf-8-sig")
                except UnicodeDecodeError:
                    raw_content = file_bytes.decode("latin1")
        except Exception:
            pass

    if raw_content:
        first_line = raw_content.splitlines()[0] if raw_content.splitlines() else ""
        delimiter = ";" if (";" in first_line and first_line.count(";") > first_line.count(",")) else ("\t" if "\t" in first_line else ",")

        reader = csv.DictReader(io.StringIO(raw_content), delimiter=delimiter)
        for row in reader:
            normalized_row: dict[str, Any] = {}
            for k, v in row.items():
                if not k:
                    continue
                k_clean = str(k).strip().lower()
                v_clean = str(v).strip() if v is not None else ""

                if k_clean in ("họ và tên", "họ tên", "tên", "name", "full_name", "fullname"):
                    normalized_row["name"] = v_clean
                elif k_clean in ("mã nv", "mã nhân viên", "mã", "code", "id", "employee_id", "employee_code"):
                    normalized_row["employee_id"] = v_clean
                elif k_clean in ("phòng ban", "phòng", "bộ phận", "department", "dept"):
                    normalized_row["department"] = v_clean
                elif k_clean in ("chức vụ", "vị trí", "position", "title", "role"):
                    normalized_row["position"] = v_clean
                elif k_clean in ("email", "thư điện tử", "mail"):
                    normalized_row["email"] = v_clean
                elif k_clean in ("số điện thoại", "điện thoại", "phone", "sđt", "mobile"):
                    normalized_row["phone"] = v_clean
                elif k_clean in ("trạng thái", "status"):
                    normalized_row["status"] = v_clean or "ACTIVE"

            if normalized_row.get("name"):
                rows.append(normalized_row)

    if not rows:
        raise HTTPException(
            status_code=422,
            detail="Không tìm thấy dữ liệu nhân viên hợp lệ để nhập. Vui lòng kiểm tra lại file CSV/Excel.",
        )

    imported_count = 0
    updated_count = 0
    errors: list[str] = []

    billing = await repository.get_billing_summary(organization_id)

    for idx, emp_data in enumerate(rows, start=1):
        name = str(emp_data.get("name") or "").strip()
        if not name:
            errors.append(f"Dòng {idx}: Thiếu tên nhân viên")
            continue

        emp_code = str(emp_data.get("employee_id") or emp_data.get("code") or "").strip()
        existing = await repository.get_employee(emp_code, organization_id) if emp_code else None

        if existing is None:
            q_err = quota_error(billing, adding_employee=True)
            if q_err:
                errors.append(f"Dòng {idx} ({name}): {q_err}")
                continue

            await repository.save_employee({
                **emp_data,
                "name": name,
                "employee_id": emp_code or f"EMP-{int(time.time() * 1000) % 100000:05d}",
                "organization_id": organization_id,
            })
            imported_count += 1
        else:
            await repository.save_employee({
                **existing,
                **emp_data,
                "name": name,
                "organization_id": organization_id,
            })
            updated_count += 1

    return {
        "success": True,
        "total": len(rows),
        "imported": imported_count,
        "updated": updated_count,
        "errors": errors,
        "message": f"Đã nhập thành công {imported_count} nhân viên mới, cập nhật {updated_count} nhân viên.",
    }


@router.get("/{employee_id}")
async def get_employee(
    employee_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    employee = await repository.get_employee(employee_id, _organization_id(current_user))
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"success": True, "employee": public_employee(employee)}


@router.post("")
async def save_employee(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    organization_id = _organization_id(current_user)
    employee_ref = str(payload.get("employee_id") or payload.get("employeeCode") or payload.get("id") or "").strip()
    existing = await repository.get_employee(employee_ref, organization_id) if employee_ref else None
    if existing is None:
        error = quota_error(await repository.get_billing_summary(organization_id), adding_employee=True)
        if error:
            raise HTTPException(status_code=402, detail=error)
    employee = await repository.save_employee({**payload, "organization_id": organization_id})
    return {"success": True, "employee": public_employee(employee)}


@router.patch("/{employee_id}")
async def update_employee(
    employee_id: str,
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    organization_id = _organization_id(current_user)
    employee = await repository.get_employee(employee_id, organization_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    updated = await repository.save_employee({**employee, **payload, "employee_id": employee_id, "organization_id": organization_id})
    return {"success": True, "employee": public_employee(updated)}


@router.post("/face")
async def register_face(
    request: Request,
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
    recognition: RecognitionService = Depends(get_recognition_service),
) -> dict[str, Any]:
    try:
        payload, image_bytes = await read_image_request(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    organization_id = _organization_id(current_user)
    if not payload.get("employee_id"):
        raise HTTPException(status_code=422, detail="employee_id is required")
    try:
        embedding, error = await recognition.encode_face(image_bytes)
    except RecognitionUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if embedding is None:
        raise HTTPException(status_code=422, detail=error or "Không tạo được face template")
    employee_id = str(payload.get("employee_id") or "").strip()
    # BIZ-07: Only save the face template. Do not call save_employee with
    # the partial form payload — that can overwrite existing employee data.
    existing = await repository.get_employee(employee_id, organization_id)
    if existing is None:
        name = str(payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=404, detail="Employee not found")
        billing = await repository.get_billing_summary(organization_id)
        error = quota_error(billing, adding_employee=True, adding_face=True)
        if error:
            raise HTTPException(status_code=402, detail=error)
        existing = await repository.save_employee({
            "employee_id": employee_id,
            "name": name,
            "department": str(payload.get("department") or "").strip(),
            "position": str(payload.get("position") or "").strip(),
            "organization_id": organization_id,
        })
    elif not existing.get("has_face"):
        error = quota_error(await repository.get_billing_summary(organization_id), adding_face=True)
        if error:
            raise HTTPException(status_code=402, detail=error)
    try:
        employee = await repository.save_employee_face(
            str(existing.get("id") or employee_id),
            embedding,
            image_bytes,
            organization_id,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Employee not found") from exc
    return {"success": True, "message": "Face template registered", "employee": public_employee(employee)}


@router.get("/{employee_id}/image")
async def employee_image(
    employee_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    organization_id = _organization_id(current_user)
    employee = await repository.get_employee(employee_id, organization_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    image = await repository.get_employee_image(employee_id, organization_id)
    return {"success": True, "employee_id": employee_id, **(image or {})}


@router.get("/{employee_id}/avatar")
async def get_employee_avatar(
    employee_id: str,
    repository: Repository = Depends(get_repository),
) -> Response:
    image = await repository.get_employee_image(employee_id)
    if not image or not image.get("image_base64"):
        raise HTTPException(status_code=404, detail="Employee avatar not found")
    raw_b64 = str(image["image_base64"] or "")
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]
    try:
        image_bytes = base64.b64decode(raw_b64)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Invalid avatar data") from exc
    return Response(
        content=image_bytes,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.delete("/{employee_id}/face")
async def clear_face(
    employee_id: str,
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    organization_id = _organization_id(current_user)
    employee = await repository.get_employee(employee_id, organization_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    try:
        updated = await repository.clear_employee_face(employee_id, organization_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Employee not found") from exc
    return {"success": True, "employee": public_employee(updated)}


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: str,
    current_user: dict[str, Any] = Depends(require_admin),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    organization_id = _organization_id(current_user)
    employee = await repository.get_employee(employee_id, organization_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    await repository.save_employee({**employee, "status": "INACTIVE", "organization_id": organization_id})
    return {"success": True}
