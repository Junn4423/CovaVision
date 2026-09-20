from __future__ import annotations

from fastapi.testclient import TestClient


def test_department_and_position_crud_and_employee_counts(
    client: TestClient,
    admin_headers: dict[str, str],
    staff_headers: dict[str, str],
) -> None:
    assert client.get("/api/v1/departments", headers=staff_headers).json() == {
        "success": True,
        "departments": [],
    }
    assert client.get("/api/v1/positions", headers=staff_headers).json() == {
        "success": True,
        "positions": [],
    }

    department = client.post(
        "/api/v1/departments",
        headers=admin_headers,
        json={"name": "Operations", "code": "OPS"},
    )
    assert department.status_code == 200
    department_id = department.json()["department"]["id"]

    position = client.post(
        "/api/v1/positions",
        headers=admin_headers,
        json={"title": "Supervisor", "code": "SUP"},
    )
    assert position.status_code == 200
    position_id = position.json()["position"]["id"]

    employee = client.post(
        "/api/v1/employees",
        headers=admin_headers,
        json={
            "employee_id": "EMP-DIRECTORY-01",
            "name": "Directory Employee",
            "department": "Operations",
            "position": "Supervisor",
        },
    )
    assert employee.status_code == 200

    departments = client.get("/api/v1/departments", headers=staff_headers)
    assert departments.status_code == 200
    assert departments.json()["departments"][0]["employee_count"] == 1

    positions = client.get("/api/v1/positions", headers=staff_headers)
    assert positions.status_code == 200
    assert positions.json()["positions"][0]["employee_count"] == 1

    assert client.delete(
        f"/api/v1/departments/{department_id}", headers=admin_headers
    ).status_code == 200
    assert client.delete(
        f"/api/v1/positions/{position_id}", headers=admin_headers
    ).status_code == 200


def test_department_and_position_validation_permissions_and_not_found(
    client: TestClient,
    admin_headers: dict[str, str],
    staff_headers: dict[str, str],
) -> None:
    assert client.get("/api/v1/departments").status_code == 401
    assert client.post(
        "/api/v1/departments", headers=staff_headers, json={"name": "Forbidden"}
    ).status_code == 403
    assert client.post(
        "/api/v1/positions", headers=staff_headers, json={"title": "Forbidden"}
    ).status_code == 403
    assert client.post(
        "/api/v1/departments", headers=admin_headers, json={"name": ""}
    ).status_code == 422
    assert client.post(
        "/api/v1/positions", headers=admin_headers, json={"title": ""}
    ).status_code == 422
    assert client.delete(
        "/api/v1/departments/missing", headers=admin_headers
    ).status_code == 404
    assert client.delete(
        "/api/v1/positions/missing", headers=admin_headers
    ).status_code == 404
