from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient


def test_reports_filter_paginate_online_and_export(
    client: TestClient,
    repository,
    admin_headers: dict[str, str],
) -> None:
    for index, employee_id in enumerate(("EMP-1", "EMP-2", "EMP-1")):
        asyncio.run(repository.create_attendance({
            "id": f"ATT-{index}",
            "employee_id": employee_id,
            "employee_name": f"Employee {employee_id}",
            "camera_id": "camera-1",
            "camera_name": "Front",
            "attendance_type": "auto",
            "status": "accepted" if index != 1 else "rejected",
            "captured_at": f"2026-09-20T0{index}:00:00+00:00",
            "confidence": 0.9,
        }, repository.organization_id))

    filtered = client.get(
        "/api/v1/reports/attendance?employee_id=EMP-1&status=accepted&limit=1&offset=0",
        headers=admin_headers,
    )
    assert filtered.status_code == 200
    assert len(filtered.json()["records"]) == 1
    assert filtered.json()["pagination"] == {"limit": 1, "offset": 0, "has_more": True}
    assert filtered.json()["attendance"] == filtered.json()["records"]

    online = client.get(
        "/api/v1/reports/attendance/online?limit=2",
        headers=admin_headers,
    )
    assert online.status_code == 200
    assert len(online.json()["records"]) == 2
    assert "attendance" not in online.json()

    exported = client.get(
        "/api/v1/reports/attendance/export?employee_id=EMP-1",
        headers=admin_headers,
    )
    assert exported.status_code == 200
    assert "attachment" in exported.headers["content-disposition"]
    assert "employee_id" in exported.text
    assert "EMP-1" in exported.text


def test_reports_reject_invalid_page_values_and_require_auth(client: TestClient) -> None:
    assert client.get("/api/v1/reports/attendance?limit=0", headers={}).status_code == 401


def test_reports_pagination_validation(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    assert client.get(
        "/api/v1/reports/attendance?limit=0",
        headers=admin_headers,
    ).status_code == 422
    assert client.get(
        "/api/v1/reports/attendance?offset=-1",
        headers=admin_headers,
    ).status_code == 422
