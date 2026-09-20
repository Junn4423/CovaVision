from __future__ import annotations

import pytest

from app.billing.plans import get_plan, list_public_plans, quota_exceeded
from app.billing.quotas import quota_error


def test_plan_catalog_is_publicly_serializable_and_case_insensitive() -> None:
    plans = list_public_plans()
    assert plans[0]["code"] == "trial"
    assert get_plan(" STANDARD ").monthly_price_vnd == 550_000
    assert get_plan("pro").anti_spoofing is True
    assert get_plan("business").contact_only is True
    with pytest.raises(ValueError):
        get_plan("unknown")


def test_plan_and_subscription_quota_edges() -> None:
    trial = get_plan("trial")
    assert quota_exceeded(trial, employee_count=2, face_count=2) is None
    assert quota_exceeded(trial, employee_count=3, face_count=0)
    assert quota_exceeded(trial, employee_count=0, face_count=3)
    assert quota_exceeded(get_plan("business"), employee_count=999, face_count=999) is None

    active = {
        "subscription": {"status": "ACTIVE"},
        "plan": {"name": "Trial", "max_employees": 3, "max_face_templates": 3},
        "usage": {"employees": 3, "face_templates": 0},
    }
    assert quota_error(active, adding_employee=True)
    assert quota_error(active, adding_face=True) is None
    assert quota_error({**active, "subscription": {"status": "EXPIRED"}}, adding_employee=True)
