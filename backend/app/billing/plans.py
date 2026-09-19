"""The server-owned subscription catalog.

Prices and quotas intentionally live in code first. The database mirrors this
catalog for reporting, but a browser can never change a plan's price or limit.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class SubscriptionPlan:
    code: str
    name: str
    max_employees: int | None
    max_face_templates: int | None
    monthly_price_vnd: int
    duration_days: int | None = 30
    contact_only: bool = False

    def public_dict(self) -> dict[str, Any]:
        return asdict(self)


PLANS: tuple[SubscriptionPlan, ...] = (
    SubscriptionPlan(
        code="trial",
        name="Dùng thử",
        max_employees=3,
        max_face_templates=3,
        monthly_price_vnd=0,
        duration_days=14,
    ),
    SubscriptionPlan(
        code="standard",
        name="Standard",
        max_employees=10,
        max_face_templates=10,
        monthly_price_vnd=550_000,
    ),
    SubscriptionPlan(
        code="pro",
        name="Pro",
        max_employees=50,
        max_face_templates=50,
        monthly_price_vnd=1_950_000,
    ),
    SubscriptionPlan(
        code="vip",
        name="VIP",
        max_employees=150,
        max_face_templates=150,
        monthly_price_vnd=4_990_000,
    ),
    SubscriptionPlan(
        code="business",
        name="Business",
        max_employees=None,
        max_face_templates=None,
        monthly_price_vnd=0,
        duration_days=None,
        contact_only=True,
    ),
)

PLAN_BY_CODE = {plan.code: plan for plan in PLANS}


def get_plan(code: str) -> SubscriptionPlan:
    normalized = str(code or "").strip().lower()
    try:
        return PLAN_BY_CODE[normalized]
    except KeyError as exc:
        raise ValueError(f"Gói không tồn tại: {normalized or 'trống'}") from exc


def list_public_plans() -> list[dict[str, Any]]:
    return [plan.public_dict() for plan in PLANS]


def quota_exceeded(plan: SubscriptionPlan, employee_count: int, face_count: int) -> str | None:
    if plan.max_employees is not None and employee_count >= plan.max_employees:
        return f"Gói {plan.name} giới hạn {plan.max_employees} nhân viên"
    if plan.max_face_templates is not None and face_count >= plan.max_face_templates:
        return f"Gói {plan.name} giới hạn {plan.max_face_templates} khuôn mặt"
    return None
