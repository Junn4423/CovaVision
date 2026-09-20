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


def test_timesheet_report_and_export(
    client: TestClient,
    repository,
    admin_headers: dict[str, str],
) -> None:
    # Seed attendance records for timesheet
    asyncio.run(repository.create_attendance({
        "employee_id": "EMP-TS-1",
        "employee_name": "Nguyen Van A",
        "status": "accepted",
        "captured_at": "2026-09-20T08:05:00+07:00",
    }, repository.organization_id))
    asyncio.run(repository.create_attendance({
        "employee_id": "EMP-TS-1",
        "employee_name": "Nguyen Van A",
        "status": "accepted",
        "captured_at": "2026-09-20T17:35:00+07:00",
    }, repository.organization_id))

    # Test timesheet JSON endpoint
    resp = client.get("/api/v1/reports/timesheet", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert len(data["timesheet"]) >= 1
    row = next(r for r in data["timesheet"] if r["employee_id"] == "EMP-TS-1")
    assert row["work_hours"] > 0
    assert row["check_in"] is not None
    assert row["check_out"] is not None
    assert "summary" in data
    assert "stats" in data

    # Test timesheet export endpoint
    export_resp = client.get("/api/v1/reports/timesheet/export", headers=admin_headers)
    assert export_resp.status_code == 200
    assert "attachment" in export_resp.headers["content-disposition"]
    assert "covavision-timesheet.csv" in export_resp.headers["content-disposition"]
    assert "EMP-TS-1" in export_resp.text

