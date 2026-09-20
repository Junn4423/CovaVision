from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from app.db.repository import InMemoryRepository, _compute_shift_info


def test_shift_classifier_handles_check_in_late_and_check_out_early() -> None:
    late = _compute_shift_info(
        datetime(2026, 9, 20, 1, 30, tzinfo=timezone.utc),
        [],
        {"shift_start_time": "08:00", "shift_end_time": "17:30", "late_tolerance_minutes": 15},
    )
    assert late == {
        "attendance_type": "CHECK_IN",
        "is_late": True,
        "late_minutes": 30,
        "is_early_departure": False,
        "early_minutes": 0,
        "shift_status": "late",
    }

    early_checkout = _compute_shift_info(
        datetime(2026, 9, 20, 9, 0, tzinfo=timezone.utc),
        [{"status": "ACCEPTED"}],
        {"shift_start_time": "08:00", "shift_end_time": "17:30"},
    )
    assert early_checkout["attendance_type"] == "CHECK_OUT"
    assert early_checkout["is_early_departure"] is True
    assert early_checkout["early_minutes"] == 90


def test_shift_classifier_is_defensive_for_invalid_settings() -> None:
    result = _compute_shift_info(
        datetime(2026, 9, 20, 1, 0, tzinfo=timezone.utc),
        [],
        {"shift_start_time": "invalid", "shift_end_time": "also-invalid", "late_tolerance_minutes": "x"},
    )
    assert result["attendance_type"] == "CHECK_IN"
    assert result["shift_status"] == "on_time"


def test_inmemory_shift_metadata_is_tenant_scoped_and_ignores_rejected_records() -> None:
    async def scenario() -> None:
        repository = InMemoryRepository()
        captured_at = datetime(2026, 9, 20, 1, 0, tzinfo=timezone.utc)
        await repository.create_attendance({
            "employee_id": "EMP-1",
            "status": "REJECTED",
            "captured_at": captured_at.isoformat(),
        }, repository.organization_id)
        result = await repository.get_employee_shift_metadata("EMP-1", captured_at, repository.organization_id)
        assert result["attendance_type"] == "CHECK_IN"

        await repository.create_attendance({
            "employee_id": "EMP-1",
            "status": "ACCEPTED",
            "captured_at": captured_at.isoformat(),
        }, repository.organization_id)
        checkout = await repository.get_employee_shift_metadata("EMP-1", captured_at, repository.organization_id)
        assert checkout["attendance_type"] == "CHECK_OUT"

        other_tenant = await repository.get_employee_shift_metadata("EMP-1", captured_at, "other-org")
        assert other_tenant["attendance_type"] == "CHECK_IN"

    asyncio.run(scenario())
