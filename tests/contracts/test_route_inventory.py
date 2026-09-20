from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import Any

from fastapi import FastAPI

from app.main import app


# This is deliberately explicit.  Adding a route without adding it here makes
# the test fail, so an API cannot silently escape the contract suite.
ROUTE_TEST_MATRIX: dict[tuple[str, str], str] = {
    ("GET", "/health"): "api/test_health.py",
    ("POST", "/api/v1/auth/login"): "api/test_auth.py",
    ("POST", "/api/v1/auth/register"): "api/test_auth.py",
    ("POST", "/api/v1/auth/google"): "api/test_auth.py",
    ("POST", "/api/v1/auth/logout"): "api/test_auth.py",
    ("GET", "/api/v1/auth/me"): "api/test_auth.py",
    ("GET", "/api/v1/billing/plans"): "billing/test_api.py",
    ("GET", "/api/v1/billing/payment-methods"): "billing/test_api.py",
    ("GET", "/api/v1/billing/me"): "billing/test_api.py",
    ("POST", "/api/v1/billing/checkout"): "billing/test_api.py",
    ("GET", "/api/v1/billing/payments/{order_code}"): "billing/test_api.py",
    ("POST", "/api/v1/billing/webhooks/sepay"): "billing/test_api.py",
    ("POST", "/api/v1/billing/webhooks/momo"): "billing/test_api.py",
    ("POST", "/api/v1/billing/webhooks/zalopay"): "billing/test_api.py",
    ("GET", "/api/v1/accounts"): "api/test_accounts.py",
    ("POST", "/api/v1/accounts"): "api/test_accounts.py",
    ("POST", "/api/v1/accounts/{account_id}/password"): "api/test_accounts.py",
    ("POST", "/api/v1/accounts/{account_id}/lock"): "api/test_accounts.py",
    ("POST", "/api/v1/accounts/{account_id}/link-employee"): "api/test_accounts.py",
    ("GET", "/api/v1/audit/logs"): "api/test_audit.py",
    ("GET", "/api/v1/employees"): "api/test_employees.py",
    ("GET", "/api/v1/employees/export"): "api/test_employees.py",
    ("POST", "/api/v1/employees/import"): "api/test_employees.py",
    ("GET", "/api/v1/employees/{employee_id}"): "api/test_employees.py",
    ("POST", "/api/v1/employees"): "api/test_employees.py",
    ("PATCH", "/api/v1/employees/{employee_id}"): "api/test_employees.py",
    ("POST", "/api/v1/employees/face"): "api/test_employees.py",
    ("GET", "/api/v1/employees/{employee_id}/image"): "api/test_employees.py",
    ("GET", "/api/v1/employees/{employee_id}/avatar"): "api/test_employees.py",
    ("DELETE", "/api/v1/employees/{employee_id}/face"): "api/test_employees.py",
    ("DELETE", "/api/v1/employees/{employee_id}"): "api/test_employees.py",
    ("GET", "/api/v1/cameras"): "api/test_cameras.py",
    ("POST", "/api/v1/cameras/test-connection"): "api/test_cameras.py",
    ("POST", "/api/v1/cameras/discover"): "api/test_cameras.py",
    ("POST", "/api/v1/cameras"): "api/test_cameras.py",
    ("DELETE", "/api/v1/cameras/{camera_id}"): "api/test_cameras.py",
    ("POST", "/api/v1/cameras/start"): "api/test_cameras.py",
    ("POST", "/api/v1/cameras/stop"): "api/test_cameras.py",
    ("GET", "/api/v1/cameras/status"): "api/test_cameras.py",
    ("GET", "/api/v1/cameras/snapshot"): "api/test_cameras.py",
    ("GET", "/api/v1/cameras/stream"): "api/test_cameras.py",
    ("POST", "/api/v1/cameras/{camera_id}/speak"): "api/test_cameras.py",
    ("POST", "/api/v1/attendance"): "api/test_attendance.py",
    ("POST", "/api/v1/attendance/recognize"): "api/test_attendance.py",
    ("POST", "/api/v1/attendance/detect"): "api/test_attendance.py",
    ("GET", "/api/v1/attendance/records"): "api/test_attendance.py",
    ("GET", "/api/v1/attendance/today"): "api/test_attendance.py",
    ("GET", "/api/v1/attendance/recent"): "api/test_attendance.py",
    ("GET", "/api/v1/attendance/stats"): "api/test_attendance.py",
    ("GET", "/api/v1/attendance/{attendance_id}"): "api/test_attendance.py",
    ("GET", "/api/v1/settings"): "api/test_settings.py",
    ("POST", "/api/v1/settings"): "api/test_settings.py",
    ("GET", "/api/v1/settings/attendance"): "api/test_settings.py",
    ("GET", "/api/v1/settings/mobile"): "api/test_settings.py",
    ("POST", "/api/v1/settings/mobile"): "api/test_settings.py",
    ("GET", "/api/v1/location"): "api/test_settings.py",
    ("POST", "/api/v1/location"): "api/test_settings.py",
    ("GET", "/api/v1/system/storage"): "api/test_settings.py",
    ("GET", "/api/v1/reports/attendance"): "api/test_reports.py",
    ("GET", "/api/v1/reports/attendance/online"): "api/test_reports.py",
    ("GET", "/api/v1/reports/attendance/export"): "api/test_reports.py",
    ("GET", "/api/v1/reports/timesheet"): "api/test_reports.py",
    ("GET", "/api/v1/reports/timesheet/export"): "api/test_reports.py",
    ("GET", "/api/v1/tts"): "api/test_audit_tts.py",
    ("HEAD", "/api/v1/tts"): "api/test_audit_tts.py",
}


def _iter_routes(router: Any) -> Iterable[Any]:
    for route in getattr(router, "routes", []):
        if hasattr(route, "methods"):
            yield route
        elif hasattr(route, "original_router"):
            yield from _iter_routes(route.original_router)


def _registered_api_routes(application: FastAPI) -> set[tuple[str, str]]:
    result: set[tuple[str, str]] = set()
    for route in _iter_routes(application):
        if route.path == "/health" or route.path.startswith("/api/"):
            for method in route.methods or set():
                result.add((method, route.path))
    return result


def test_every_registered_api_route_has_a_test_owner() -> None:
    registered = _registered_api_routes(app)
    assert registered == set(ROUTE_TEST_MATRIX), (
        f"Route matrix drifted. Missing from matrix: {registered - set(ROUTE_TEST_MATRIX)}; "
        f"stale matrix entries: {set(ROUTE_TEST_MATRIX) - registered}"
    )


def test_every_route_test_owner_exists() -> None:
    for owner in set(ROUTE_TEST_MATRIX.values()):
        assert (Path(__file__).parents[1] / owner).is_file(), owner
