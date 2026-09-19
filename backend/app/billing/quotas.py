"""Quota checks shared by HTTP and background workflows."""

from __future__ import annotations

from typing import Any


def quota_error(summary: dict[str, Any], *, adding_employee: bool = False, adding_face: bool = False) -> str | None:
    plan = summary.get("plan") or {}
    usage = summary.get("usage") or {}
    max_employees = plan.get("max_employees")
    max_faces = plan.get("max_face_templates")
    if adding_employee and max_employees is not None and int(usage.get("employees") or 0) >= int(max_employees):
        return f"Gói {plan.get('name', 'hiện tại')} đã đủ {max_employees} nhân viên"
    if adding_face and max_faces is not None and int(usage.get("face_templates") or 0) >= int(max_faces):
        return f"Gói {plan.get('name', 'hiện tại')} đã đủ {max_faces} khuôn mặt"
    return None
