from __future__ import annotations

import base64

from fastapi.testclient import TestClient

from app.recognition.service import RecognitionService


def test_employee_crud_and_face_lifecycle(
    test_app,
    client: TestClient,
    admin_headers: dict[str, str],
    staff_headers: dict[str, str],
    monkeypatch,
) -> None:
    service = RecognitionService(test_app.state.repository)

    async def fake_encode_face(_image_bytes: bytes):
        return [0.1] * 512, None

    monkeypatch.setattr(service, "encode_face", fake_encode_face)
    test_app.state.recognition_service = service

    created = client.post(
        "/api/v1/employees",
        headers=admin_headers,
        json={"employee_id": "EMP-100", "name": "Test Employee", "department": "IT"},
    )
    assert created.status_code == 200
    assert created.json()["employee"]["employee_id"] == "EMP-100"
    assert "embedding" not in created.text

    assert client.get("/api/v1/employees", headers=staff_headers).status_code == 200
    search = client.get("/api/v1/employees?query=test", headers=staff_headers)
    assert [item["employee_id"] for item in search.json()["employees"]] == ["EMP-100"]

    updated = client.patch(
        "/api/v1/employees/EMP-100",
        headers=admin_headers,
        json={"department": "Operations", "position": "Operator"},
    )
    assert updated.status_code == 200
    assert updated.json()["employee"]["department"] == "Operations"
    assert client.get("/api/v1/employees/EMP-100", headers=staff_headers).json()["employee"]["position"] == "Operator"

    image = base64.b64encode(b"fake-jpeg").decode("ascii")
    registered = client.post(
        "/api/v1/employees/face",
        headers=admin_headers,
        json={"employee_id": "EMP-100", "image_base64": image},
    )
    assert registered.status_code == 200
    assert registered.json()["employee"]["has_face"] is True

    image_response = client.get("/api/v1/employees/EMP-100/image", headers=staff_headers)
    assert image_response.status_code == 200
    assert image_response.json()["image_base64"].startswith("data:image/jpeg;base64,")

    avatar = client.get("/api/v1/employees/EMP-100/avatar")
    assert avatar.status_code == 200
    assert avatar.headers["content-type"] == "image/jpeg"
    assert avatar.content == b"fake-jpeg"

    cleared = client.delete("/api/v1/employees/EMP-100/face", headers=admin_headers)
    assert cleared.status_code == 200
    assert cleared.json()["employee"]["has_face"] is False
    assert client.get("/api/v1/employees/EMP-100/avatar").status_code == 404

    deleted = client.delete("/api/v1/employees/EMP-100", headers=admin_headers)
    assert deleted.status_code == 200
    assert client.get("/api/v1/employees/EMP-100", headers=staff_headers).status_code == 200
    assert client.get("/api/v1/employees/EMP-100", headers=staff_headers).json()["employee"]["status"] == "INACTIVE"


def test_employee_edge_cases_and_permissions(
    test_app,
    client: TestClient,
    admin_headers: dict[str, str],
    staff_headers: dict[str, str],
) -> None:
    assert client.get("/api/v1/employees/missing", headers=staff_headers).status_code == 404
    assert client.patch(
        "/api/v1/employees/missing",
        headers=admin_headers,
        json={"name": "missing"},
    ).status_code == 404
    assert client.delete("/api/v1/employees/missing", headers=admin_headers).status_code == 404
    assert client.delete("/api/v1/employees/missing/face", headers=admin_headers).status_code == 404
    assert client.get("/api/v1/employees/missing/image", headers=staff_headers).status_code == 404
    assert client.get("/api/v1/employees/missing/avatar").status_code == 404
    assert client.post(
        "/api/v1/employees",
        headers=staff_headers,
        json={"employee_id": "EMP-FORBIDDEN", "name": "Forbidden"},
    ).status_code == 403
    assert client.post(
        "/api/v1/employees/face",
        headers=admin_headers,
        json={"image_base64": "not-an-image"},
    ).status_code == 422


def test_employee_import_export(
    test_app,
    client: TestClient,
    admin_headers: dict[str, str],
    staff_headers: dict[str, str],
) -> None:
    # 1. Export test
    export_res = client.get("/api/v1/employees/export", headers=staff_headers)
    assert export_res.status_code == 200
    assert "text/csv" in export_res.headers.get("content-type", "")
    assert "Mã NV" in export_res.text

    # 2. Non-admin cannot import
    assert client.post("/api/v1/employees/import", headers=staff_headers, json=[]).status_code == 403

    # 3. Import JSON payload
    import_res = client.post(
        "/api/v1/employees/import",
        headers=admin_headers,
        json={
            "employees": [
                {
                    "employee_id": "EMP-IMP-1",
                    "name": "Nguyễn Văn Nhập",
                    "department": "Kế toán",
                    "position": "Chuyên viên",
                },
                {
                    "employee_id": "EMP-IMP-2",
                    "name": "Trần Thị Xuất",
                    "department": "Nhân sự",
                    "position": "Trưởng phòng",
                },
            ]
        },
    )
    assert import_res.status_code == 200
    data = import_res.json()
    assert data["success"] is True
    assert data["imported"] >= 1

    # 4. Import via CSV multipart file
    csv_content = (
        "Mã NV,Họ và tên,Phòng ban,Chức vụ\n"
        "EMP-IMP-3,Lê Văn File,Kỹ thuật,Kỹ sư\n"
    )
    file_upload_res = client.post(
        "/api/v1/employees/import",
        headers=admin_headers,
        files={"file": ("nhan_vien.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert file_upload_res.status_code == 200
    file_data = file_upload_res.json()
    assert file_data["success"] is True
    assert file_data["imported"] >= 1

