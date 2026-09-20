"""Persistence boundary.

Routes depend on this small interface, which keeps API tests deterministic while
the production adapter remains backed by Prisma/MySQL.
"""

from __future__ import annotations

import asyncio
import base64
import os
import struct
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Protocol
from uuid import uuid4

from app.billing.plans import get_plan
from app.core.security import hash_access_token, hash_password, verify_password
from app.db.billing_repository import PrismaBillingMixin


class Repository(Protocol):
    async def authenticate(self, identifier: str, password: str) -> dict[str, Any] | None: ...

    async def create_access_session(self, user_id: str, token: str, expires_at: datetime) -> None: ...

    async def revoke_access_session(self, token: str) -> None: ...

    async def revoke_access_sessions_for_user(self, user_id: str) -> None: ...

    async def is_access_session_active(self, user_id: str, token: str) -> bool: ...

    async def create_audit_log(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    async def list_audit_logs(self, organization_id: str, limit: int = 100) -> list[dict[str, Any]]: ...

    async def register_account(
        self, email: str, password: str, full_name: str, organization_name: str
    ) -> dict[str, Any]: ...

    async def authenticate_google(self, email: str, google_subject: str, full_name: str) -> dict[str, Any]: ...

    async def create_trial_subscription(self, organization_id: str) -> dict[str, Any]: ...

    async def get_billing_summary(self, organization_id: str) -> dict[str, Any]: ...

    async def create_payment(self, organization_id: str, plan_code: str, order_code: str, expires_at: datetime) -> dict[str, Any]: ...

    async def get_payment(self, organization_id: str, order_code: str) -> dict[str, Any] | None: ...

    async def get_payment_by_order(self, order_code: str) -> dict[str, Any] | None: ...

    async def complete_payment(
        self,
        order_code: str,
        provider_transaction_id: str,
        amount_vnd: int,
        transfer_content: str,
        paid_at: datetime,
    ) -> dict[str, Any]: ...

    async def get_employee(self, employee_id: str, organization_id: str | None = None) -> dict[str, Any] | None: ...

    async def list_employees(self, query: str = "", organization_id: str | None = None) -> list[dict[str, Any]]: ...

    async def save_employee(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    async def list_face_candidates(self, organization_id: str | None = None) -> list[dict[str, Any]]: ...

    async def save_employee_face(self, employee_id: str, embedding: Any, image_bytes: bytes | None = None, organization_id: str | None = None) -> dict[str, Any]: ...

    async def clear_employee_face(self, employee_id: str, organization_id: str | None = None) -> dict[str, Any]: ...

    async def get_employee_image(self, employee_id: str, organization_id: str | None = None) -> dict[str, Any] | None: ...

    async def list_accounts(self, organization_id: str | None = None) -> list[dict[str, Any]]: ...

    async def save_account(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    async def reset_account_password(self, account_id: str, password: str, organization_id: str | None = None) -> dict[str, Any]: ...

    async def set_account_lock(self, account_id: str, is_locked: bool, organization_id: str | None = None) -> dict[str, Any]: ...

    async def list_cameras(self, organization_id: str | None = None) -> list[dict[str, Any]]: ...

    async def get_camera(self, camera_id: str, organization_id: str | None = None) -> dict[str, Any] | None: ...

    async def save_camera(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    async def delete_camera(self, camera_id: str, organization_id: str | None = None) -> bool: ...

    async def create_attendance(self, payload: dict[str, Any], organization_id: str | None = None) -> dict[str, Any]: ...

    async def find_recent_attendance(
        self,
        employee_id: str,
        since: datetime,
        organization_id: str | None = None,
    ) -> dict[str, Any] | None: ...

    async def list_attendance(self, filters: dict[str, Any], organization_id: str | None = None) -> list[dict[str, Any]]: ...

    async def get_settings(
        self,
        key: str | None = None,
        organization_id: str | None = None,
    ) -> dict[str, Any]: ...

    async def save_settings(
        self,
        payload: dict[str, Any],
        organization_id: str | None = None,
    ) -> dict[str, Any]: ...


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _subscription_expired(value: Any) -> bool:
    if not value:
        return False
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00")) if isinstance(value, str) else value
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed <= _now()
    except (TypeError, ValueError):
        return False


def _parse_filter_datetime(val: Any, is_end: bool = False) -> datetime | None:
    if not val:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo is not None else val.replace(tzinfo=timezone.utc)
    val_str = str(val).strip()
    if not val_str:
        return None
    try:
        if len(val_str) == 10:  # YYYY-MM-DD
            time_part = "23:59:59.999999" if is_end else "00:00:00"
            return datetime.fromisoformat(f"{val_str}T{time_part}").replace(tzinfo=timezone.utc)
        clean = val_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        return None


class InMemoryRepository:
    """Small repository used by contract tests and explicit demo mode."""

    def __init__(self) -> None:
        organization_id = "org-default"
        self.users: dict[str, dict[str, Any]] = {}
        self.employees: dict[str, dict[str, Any]] = {}
        self.cameras: dict[str, dict[str, Any]] = {}
        self.attendance: list[dict[str, Any]] = []
        self.organization_id = organization_id
        self.settings_by_organization: dict[str, dict[str, Any]] = {organization_id: {}}
        # Keep the legacy attribute available for tests and demo integrations.
        self.settings = self.settings_by_organization[organization_id]
        self.organization = {
            "id": organization_id,
            "code": "DEFAULT",
            "name": "CovaVision",
        }
        self.subscriptions: list[dict[str, Any]] = []
        self.payments: dict[str, dict[str, Any]] = {}
        self.access_sessions: dict[str, dict[str, Any]] = {}
        self.audit_logs: list[dict[str, Any]] = []

    def seed_user(
        self,
        username: str,
        password: str,
        *,
        role: str = "STAFF",
        organization_id: str | None = None,
    ) -> None:
        user_id = str(uuid4())
        scoped_organization_id = str(organization_id or self.organization_id).strip()
        self.settings_by_organization.setdefault(scoped_organization_id, {})
        self.users[username] = {
            "id": user_id,
            "username": username,
            "password_hash": hash_password(password),
            "role": role,
            "organization_id": scoped_organization_id,
            "is_active": True,
        }

    async def authenticate(self, identifier: str, password: str) -> dict[str, Any] | None:
        normalized = identifier.strip().lower()
        user = next(
            (
                item
                for item in self.users.values()
                if str(item.get("username", "")).lower() == normalized
                or str(item.get("email", "")).lower() == normalized
            ),
            None,
        )
        if not user or not user["is_active"] or not verify_password(password, user["password_hash"]):
            return None
        return {key: value for key, value in user.items() if key != "password_hash"}

    async def create_access_session(self, user_id: str, token: str, expires_at: datetime) -> None:
        self.access_sessions[hash_access_token(token)] = {
            "user_id": str(user_id),
            "expires_at": expires_at,
            "revoked_at": None,
        }

    async def revoke_access_session(self, token: str) -> None:
        session = self.access_sessions.get(hash_access_token(token))
        if session is not None:
            session["revoked_at"] = _now()

    async def revoke_access_sessions_for_user(self, user_id: str) -> None:
        for session in self.access_sessions.values():
            if str(session.get("user_id")) == str(user_id) and session.get("revoked_at") is None:
                session["revoked_at"] = _now()

    async def is_access_session_active(self, user_id: str, token: str) -> bool:
        session = self.access_sessions.get(hash_access_token(token))
        if session is None or session.get("revoked_at") is not None:
            return False
        expires_at = session.get("expires_at")
        if isinstance(expires_at, datetime):
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at <= _now():
                return False
        if str(session.get("user_id")) != str(user_id):
            return False
        user = next((item for item in self.users.values() if str(item.get("id")) == str(user_id)), None)
        return bool(user and user.get("is_active", False))

    async def create_audit_log(self, payload: dict[str, Any]) -> dict[str, Any]:
        record = {
            "id": str(uuid4()),
            "created_at": _now().isoformat(),
            **payload,
        }
        self.audit_logs.append(record)
        return record

    async def list_audit_logs(self, organization_id: str, limit: int = 100) -> list[dict[str, Any]]:
        normalized_organization_id = str(organization_id).strip()
        return [
            dict(item)
            for item in reversed(self.audit_logs)
            if str(item.get("organization_id") or "") == normalized_organization_id
        ][: max(1, min(int(limit), 200))]

    async def register_account(self, email: str, password: str, full_name: str, organization_name: str) -> dict[str, Any]:
        normalized = email.strip().lower()
        if any(str(item.get("email", "")).lower() == normalized for item in self.users.values()):
            raise ValueError("email_already_registered")
        username = normalized
        account = {
            "id": str(uuid4()),
            "username": username,
            "email": normalized,
            "full_name": full_name.strip() or normalized.split("@", 1)[0],
            "password_hash": hash_password(password),
            "role": "ADMIN",
            "organization_id": self.organization_id,
            "is_active": True,
            "email_verified": False,
        }
        self.organization["name"] = organization_name.strip() or self.organization["name"]
        self.users[username] = account
        await self.create_trial_subscription(self.organization_id)
        return {key: value for key, value in account.items() if key != "password_hash"}

    async def authenticate_google(self, email: str, google_subject: str, full_name: str) -> dict[str, Any]:
        normalized = email.strip().lower()
        user = next(
            (
                item
                for item in self.users.values()
                if item.get("google_subject") == google_subject or str(item.get("email", "")).lower() == normalized
            ),
            None,
        )
        if user is None:
            user = {
                "id": str(uuid4()),
                "username": normalized,
                "email": normalized,
                "full_name": full_name.strip() or normalized.split("@", 1)[0],
                "password_hash": hash_password(str(uuid4())),
                "role": "ADMIN",
                "organization_id": self.organization_id,
                "is_active": True,
                "email_verified": True,
            }
            self.users[normalized] = user
        user["google_subject"] = google_subject
        user["email_verified"] = True
        await self.create_trial_subscription(self.organization_id)
        return {key: value for key, value in user.items() if key != "password_hash"}

    async def create_trial_subscription(self, organization_id: str) -> dict[str, Any]:
        existing = next((item for item in reversed(self.subscriptions) if item["organization_id"] == organization_id), None)
        if existing:
            if existing["status"] in {"TRIALING", "ACTIVE"} and _subscription_expired(existing.get("ends_at")):
                existing["status"] = "EXPIRED"
            return existing
        plan = get_plan("trial")
        now = _now()
        subscription = {
            "id": str(uuid4()),
            "organization_id": organization_id,
            "plan_code": plan.code,
            "status": "TRIALING",
            "starts_at": now.isoformat(),
            "ends_at": (now + timedelta(days=plan.duration_days or 14)).isoformat(),
        }
        self.subscriptions.append(subscription)
        return subscription

    async def get_billing_summary(self, organization_id: str) -> dict[str, Any]:
        subscription = next(
            (item for item in reversed(self.subscriptions) if item["organization_id"] == organization_id),
            None,
        ) or await self.create_trial_subscription(organization_id)
        if subscription["status"] in {"TRIALING", "ACTIVE"} and _subscription_expired(subscription.get("ends_at")):
            subscription["status"] = "EXPIRED"
        plan = get_plan(subscription["plan_code"])
        employee_count = sum(1 for item in self.employees.values() if item.get("status", "ACTIVE") == "ACTIVE")
        face_count = sum(1 for item in self.employees.values() if item.get("has_face") or item.get("embedding") is not None)
        return {"subscription": subscription, "plan": plan.public_dict(), "usage": {"employees": employee_count, "face_templates": face_count}}

    async def create_payment(self, organization_id: str, plan_code: str, order_code: str, expires_at: datetime) -> dict[str, Any]:
        plan = get_plan(plan_code)
        if plan.contact_only:
            raise ValueError("contact_required")
        payment = {
            "id": str(uuid4()),
            "organization_id": organization_id,
            "order_code": order_code,
            "plan_code": plan.code,
            "amount_vnd": plan.monthly_price_vnd,
            "status": "PENDING",
            "provider": "sepay",
            "expires_at": expires_at.isoformat(),
            "created_at": _now().isoformat(),
        }
        self.payments[order_code] = payment
        return payment

    async def get_payment(self, organization_id: str, order_code: str) -> dict[str, Any] | None:
        payment = self.payments.get(order_code)
        return payment if payment and payment["organization_id"] == organization_id else None

    async def get_payment_by_order(self, order_code: str) -> dict[str, Any] | None:
        return self.payments.get(order_code)

    async def complete_payment(self, order_code: str, provider_transaction_id: str, amount_vnd: int, transfer_content: str, paid_at: datetime) -> dict[str, Any]:
        payment = self.payments.get(order_code)
        if payment is None:
            raise KeyError(order_code)
        if payment["status"] == "PAID":
            return payment
        if payment["amount_vnd"] != amount_vnd:
            raise ValueError("payment_amount_mismatch")
        payment.update({
            "status": "PAID",
            "provider_transaction_id": provider_transaction_id,
            "transfer_content": transfer_content,
            "paid_at": paid_at.isoformat(),
        })
        plan = get_plan(payment["plan_code"])
        now = paid_at
        subscription = {
            "id": str(uuid4()),
            "organization_id": payment["organization_id"],
            "plan_code": plan.code,
            "status": "ACTIVE",
            "starts_at": now.isoformat(),
            "ends_at": (now + timedelta(days=plan.duration_days or 30)).isoformat(),
            "provider": "sepay",
            "provider_reference": order_code,
        }
        self.subscriptions.append(subscription)
        payment["subscription"] = subscription
        return payment

    async def get_employee(self, employee_id: str, organization_id: str | None = None) -> dict[str, Any] | None:
        employee = self.employees.get(employee_id)
        if employee is None:
            return None
        if organization_id and str(employee.get("organization_id") or "") != str(organization_id):
            return None
        return employee

    async def list_employees(self, query: str = "", organization_id: str | None = None) -> list[dict[str, Any]]:
        normalized = query.strip().lower()
        items = list(self.employees.values())
        if organization_id:
            items = [item for item in items if str(item.get("organization_id") or "") == str(organization_id)]
        if normalized:
            items = [
                item for item in items
                if normalized in str(item.get("employee_id", "")).lower()
                or normalized in str(item.get("name", "")).lower()
            ]
        return items

    async def save_employee(self, payload: dict[str, Any]) -> dict[str, Any]:
        employee_id = str(payload.get("employee_id") or payload.get("id") or uuid4()).strip()
        current = self.employees.get(employee_id, {})
        employee = {
            **current,
            **payload,
            "id": employee_id,
            "employee_id": employee_id,
            "organization_id": str(payload.get("organization_id") or self.organization_id),
            "updated_at": _now().isoformat(),
        }
        employee.setdefault("name", employee_id)
        employee.setdefault("registered", False)
        self.employees[employee_id] = employee
        return employee

    async def list_face_candidates(self, organization_id: str | None = None) -> list[dict[str, Any]]:
        return [
            {
                "id": item.get("id") or item.get("employee_id"),
                "employee_id": item.get("employee_id") or item.get("id"),
                "name": item.get("name") or item.get("employee_id") or item.get("id"),
                "department": item.get("department"),
                "position": item.get("position"),
                "embedding": item.get("embedding") if item.get("embedding") is not None else item.get("face_encoding"),
            }
            for item in self.employees.values()
            if not organization_id or str(item.get("organization_id") or "") == str(organization_id)
            and item.get("status", "ACTIVE") == "ACTIVE"
            and (item.get("embedding") is not None or item.get("face_encoding") is not None)
        ]

    async def save_employee_face(self, employee_id: str, embedding: Any, image_bytes: bytes | None = None, organization_id: str | None = None) -> dict[str, Any]:
        employee = self.employees.get(employee_id)
        if employee is None or (organization_id and str(employee.get("organization_id") or "") != str(organization_id)):
            raise KeyError(employee_id)
        employee["embedding"] = embedding.tolist() if hasattr(embedding, "tolist") else embedding
        employee["registered"] = True
        employee["has_face"] = True
        employee["face_count"] = 1
        if image_bytes:
            employee["image_base64"] = "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode("ascii")
            employee["image_url"] = f"/api/v1/employees/{employee_id}/avatar"
            employee["local_image_url"] = f"/api/v1/employees/{employee_id}/avatar"
        employee["updated_at"] = _now().isoformat()
        return employee

    async def clear_employee_face(self, employee_id: str, organization_id: str | None = None) -> dict[str, Any]:
        employee = self.employees.get(employee_id)
        if employee is None or (organization_id and str(employee.get("organization_id") or "") != str(organization_id)):
            raise KeyError(employee_id)
        employee.pop("embedding", None)
        employee.pop("face_encoding", None)
        employee.pop("image_base64", None)
        employee.pop("image_url", None)
        employee.pop("local_image_url", None)
        employee["registered"] = False
        employee["has_face"] = False
        employee["face_count"] = 0
        employee["updated_at"] = _now().isoformat()
        return employee

    async def get_employee_image(self, employee_id: str, organization_id: str | None = None) -> dict[str, Any] | None:
        employee = self.employees.get(employee_id)
        if employee is None or (organization_id and str(employee.get("organization_id") or "") != str(organization_id)):
            return None
        return {
            "image_base64": employee.get("image_base64"),
            "image_url": employee.get("image_url", ""),
        }

    async def list_accounts(self, organization_id: str | None = None) -> list[dict[str, Any]]:
        return [
            {
                key: value
                for key, value in user.items()
                if key not in {"password_hash", "passwordHash"}
            }
            for user in self.users.values()
            if not organization_id or str(user.get("organization_id") or "") == str(organization_id)
        ]

    async def save_account(self, payload: dict[str, Any]) -> dict[str, Any]:
        username = str(payload.get("username") or "").strip()
        if not username:
            raise ValueError("username is required")
        current = self.users.get(username, {})
        password = str(payload.get("password") or "").strip()
        account = {
            **current,
            "id": current.get("id") or str(uuid4()),
            "username": username,
            "role": str(payload.get("role") or current.get("role") or "STAFF").upper(),
            "organization_id": str(payload.get("organization_id") or self.organization_id),
            "is_active": payload.get("is_active", payload.get("isActive", current.get("is_active", True))) is not False,
        }
        if password:
            account["password_hash"] = hash_password(password)
        elif not account.get("password_hash"):
            raise ValueError("password is required for a new account")
        self.users[username] = account
        return {key: value for key, value in account.items() if key != "password_hash"}

    async def reset_account_password(self, account_id: str, password: str, organization_id: str | None = None) -> dict[str, Any]:
        user = next((item for item in self.users.values() if item.get("id") == account_id or item.get("username") == account_id), None)
        if user is None or (organization_id and str(user.get("organization_id") or "") != str(organization_id)):
            raise KeyError(account_id)
        user["password_hash"] = hash_password(password)
        return {key: value for key, value in user.items() if key != "password_hash"}

    async def set_account_lock(self, account_id: str, is_locked: bool, organization_id: str | None = None) -> dict[str, Any]:
        user = next((item for item in self.users.values() if item.get("id") == account_id or item.get("username") == account_id), None)
        if user is None or (organization_id and str(user.get("organization_id") or "") != str(organization_id)):
            raise KeyError(account_id)
        user["is_active"] = not is_locked
        return {key: value for key, value in user.items() if key != "password_hash"}

    async def list_cameras(self, organization_id: str | None = None) -> list[dict[str, Any]]:
        return [
            item for item in self.cameras.values()
            if not organization_id or str(item.get("organization_id") or "") == str(organization_id)
        ]

    async def get_camera(self, camera_id: str, organization_id: str | None = None) -> dict[str, Any] | None:
        camera = self.cameras.get(camera_id)
        if camera is None:
            return None
        if organization_id and str(camera.get("organization_id") or "") != str(organization_id):
            return None
        return camera

    async def save_camera(self, payload: dict[str, Any]) -> dict[str, Any]:
        camera_id = str(payload.get("id") or uuid4())
        internal_payload = dict(payload)
        current = self.cameras.get(camera_id, {})
        if not internal_payload.get("connection_url") and current.get("connection_url"):
            internal_payload.pop("connection_url", None)
        elif not internal_payload.get("connection_url"):
            internal_payload["connection_url"] = (
                internal_payload.get("source")
                or internal_payload.get("rtsp_url")
                or ""
            )
        camera = {
            **current,
            **internal_payload,
            "id": camera_id,
            "organization_id": str(payload.get("organization_id") or self.organization_id),
            "updated_at": _now().isoformat(),
        }
        self.cameras[camera_id] = camera
        return camera

    async def delete_camera(self, camera_id: str, organization_id: str | None = None) -> bool:
        camera = await self.get_camera(camera_id, organization_id)
        if camera is None:
            return False
        self.cameras.pop(camera_id, None)
        return True

    async def create_attendance(self, payload: dict[str, Any], organization_id: str | None = None) -> dict[str, Any]:
        record = {
            "id": str(uuid4()),
            "created_at": _now().isoformat(),
            **payload,
            "organization_id": str(organization_id or payload.get("organization_id") or self.organization_id),
            "attendance_type": "auto",
        }
        self.attendance.append(record)
        return record

    async def find_recent_attendance(
        self,
        employee_id: str,
        since: datetime,
        organization_id: str | None = None,
    ) -> dict[str, Any] | None:
        target_employee_id = str(employee_id).strip()
        target_organization_id = str(organization_id or "").strip()
        for record in reversed(self.attendance):
            if str(record.get("employee_id") or "") != target_employee_id:
                continue
            if target_organization_id and str(record.get("organization_id") or "") != target_organization_id:
                continue
            if str(record.get("status") or "").upper() != "ACCEPTED":
                continue
            captured_at = _parse_filter_datetime(record.get("captured_at"))
            if captured_at is not None and captured_at >= since:
                return record
        return None

    async def list_attendance(self, filters: dict[str, Any], organization_id: str | None = None) -> list[dict[str, Any]]:
        items = list(reversed(self.attendance))
        if organization_id:
            items = [item for item in items if str(item.get("organization_id") or "") == str(organization_id)]
        employee_id = str(filters.get("employee_id") or "").strip()
        if employee_id:
            items = [item for item in items if item.get("employee_id") == employee_id]
        start_date = filters.get("start_date")
        if start_date:
            start_str = str(start_date)[:10]
            items = [item for item in items if str(item.get("captured_at", ""))[:10] >= start_str]
        end_date = filters.get("end_date")
        if end_date:
            end_limit = str(end_date)
            if len(end_limit) == 10:
                end_limit += "T23:59:59.999999"
            items = [item for item in items if str(item.get("captured_at", "")) <= end_limit]
        status = filters.get("status")
        if status and status != "ALL":
            status_norm = str(status).strip().upper()
            items = [item for item in items if str(item.get("status", "")).upper() == status_norm]
        return items

    async def get_settings(
        self,
        key: str | None = None,
        organization_id: str | None = None,
    ) -> dict[str, Any]:
        values = self.settings_by_organization.setdefault(
            str(organization_id or self.organization_id),
            {},
        )
        if key:
            return {key: values.get(key)}
        return dict(values)

    async def save_settings(
        self,
        payload: dict[str, Any],
        organization_id: str | None = None,
    ) -> dict[str, Any]:
        values = self.settings_by_organization.setdefault(
            str(organization_id or self.organization_id),
            {},
        )
        values.update(payload)
        return dict(values)


class PrismaRepository(PrismaBillingMixin):
    """Production repository. It opens Prisma lazily on first API operation."""

    def __init__(self) -> None:
        from prisma import Prisma

        self.client = Prisma()
        self._connected = False
        # The repository is created while importing the FastAPI app, before
        # Uvicorn has selected its event loop. Create the lock lazily on the
        # loop that performs the first request instead of binding it at import.
        self._connection_lock: asyncio.Lock | None = None
        self._connection_lock_loop: asyncio.AbstractEventLoop | None = None

    async def _ensure_connected(self) -> None:
        if self._connected:
            return
        loop = asyncio.get_running_loop()
        if self._connection_lock is None or self._connection_lock_loop is not loop:
            self._connection_lock = asyncio.Lock()
            self._connection_lock_loop = loop
        connection_lock = self._connection_lock
        async with connection_lock:
            if self._connected:
                return
            await self.client.connect()
            self._connected = True

    async def authenticate(self, identifier: str, password: str) -> dict[str, Any] | None:
        await self._ensure_connected()
        normalized = identifier.strip().lower()
        user = await self.client.useraccount.find_first(
            where={"OR": [{"username": normalized}, {"email": normalized}]},
        )
        if not user or not user.isActive or not verify_password(password, user.passwordHash):
            return None
        return {
            "id": user.id,
            "username": user.username,
            "role": str(user.role),
            "organization_id": user.organizationId,
            "is_active": user.isActive,
        }

    async def create_access_session(self, user_id: str, token: str, expires_at: datetime) -> None:
        await self._ensure_connected()
        await self.client.refreshtoken.create(
            data={
                "userAccountId": str(user_id),
                "tokenHash": hash_access_token(token),
                "expiresAt": expires_at,
            },
        )

    async def revoke_access_session(self, token: str) -> None:
        await self._ensure_connected()
        session = await self.client.refreshtoken.find_unique(
            where={"tokenHash": hash_access_token(token)},
        )
        if session is not None and session.revokedAt is None:
            await self.client.refreshtoken.update(
                where={"id": session.id},
                data={"revokedAt": _now()},
            )

    async def revoke_access_sessions_for_user(self, user_id: str) -> None:
        await self._ensure_connected()
        await self.client.refreshtoken.update_many(
            where={"userAccountId": str(user_id), "revokedAt": None},
            data={"revokedAt": _now()},
        )

    async def is_access_session_active(self, user_id: str, token: str) -> bool:
        await self._ensure_connected()
        session = await self.client.refreshtoken.find_unique(
            where={"tokenHash": hash_access_token(token)},
        )
        if session is None or session.userAccountId != str(user_id) or session.revokedAt is not None:
            return False
        expires_at = session.expiresAt
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= _now():
            return False
        user = await self.client.useraccount.find_unique(where={"id": str(user_id)})
        return bool(user and user.isActive)

    async def create_audit_log(self, payload: dict[str, Any]) -> dict[str, Any]:
        await self._ensure_connected()
        from prisma import fields

        organization_id = str(payload.get("organization_id") or payload.get("organizationId") or "").strip()
        if not organization_id:
            raise ValueError("organization_id is required")
        data: dict[str, Any] = {
            "organizationId": organization_id,
            "action": str(payload.get("action") or "system.event")[:120],
            "details": fields.Json(payload.get("details") or {}),
        }
        user_id = str(payload.get("user_account_id") or payload.get("userAccountId") or "").strip()
        entity_type = str(payload.get("entity_type") or payload.get("entityType") or "").strip()
        entity_id = str(payload.get("entity_id") or payload.get("entityId") or "").strip()
        if user_id:
            data["userAccountId"] = user_id
        if entity_type:
            data["entityType"] = entity_type[:120]
        if entity_id:
            data["entityId"] = entity_id
        record = await self.client.auditlog.create(data=data)
        return self._audit_log_to_dict(record)

    async def list_audit_logs(self, organization_id: str, limit: int = 100) -> list[dict[str, Any]]:
        await self._ensure_connected()
        records = await self.client.auditlog.find_many(
            where={"organizationId": str(organization_id)},
            order={"createdAt": "desc"},
            take=max(1, min(int(limit), 200)),
        )
        return [self._audit_log_to_dict(record) for record in records]

    async def list_accounts(self, organization_id: str | None = None) -> list[dict[str, Any]]:
        await self._ensure_connected()
        where = {"organizationId": organization_id} if organization_id else None
        accounts = await self.client.useraccount.find_many(where=where, order={"username": "asc"})
        return [self._account_to_dict(account) for account in accounts]

    async def save_account(self, payload: dict[str, Any]) -> dict[str, Any]:
        await self._ensure_connected()
        requested_organization_id = str(payload.get("organization_id") or payload.get("organizationId") or "").strip()
        organization = (
            await self.client.organization.find_unique(where={"id": requested_organization_id})
            if requested_organization_id
            else await self._default_organization()
        )
        if organization is None:
            raise KeyError(requested_organization_id or "organization")
        username = str(payload.get("username") or "").strip()
        if not username:
            raise ValueError("username is required")
        current = await self.client.useraccount.find_unique(where={"username": username})
        if current is not None and current.organizationId != organization.id:
            raise ValueError("username_already_registered")
        role = str(payload.get("role") or (str(current.role) if current else "STAFF")).upper()
        if role not in {"ADMIN", "HR_MANAGER", "SUPERVISOR", "STAFF"}:
            role = "STAFF"
        password = str(payload.get("password") or "").strip()
        data: dict[str, Any] = {
            "username": username,
            "role": role,
            "isActive": payload.get("is_active", payload.get("isActive", True)) is not False,
        }
        if password:
            data["passwordHash"] = hash_password(password)
        if current:
            account = await self.client.useraccount.update(where={"id": current.id}, data=data)
        else:
            if not password:
                raise ValueError("password is required for a new account")
            data["passwordHash"] = hash_password(password)
            data["organization"] = {"connect": {"id": organization.id}}
            account = await self.client.useraccount.create(data=data)
        return self._account_to_dict(account)

    async def reset_account_password(self, account_id: str, password: str, organization_id: str | None = None) -> dict[str, Any]:
        await self._ensure_connected()
        account = await self._find_account(account_id, organization_id)
        if account is None:
            raise KeyError(account_id)
        updated = await self.client.useraccount.update(
            where={"id": account.id},
            data={"passwordHash": hash_password(password)},
        )
        return self._account_to_dict(updated)

    async def set_account_lock(self, account_id: str, is_locked: bool, organization_id: str | None = None) -> dict[str, Any]:
        await self._ensure_connected()
        account = await self._find_account(account_id, organization_id)
        if account is None:
            raise KeyError(account_id)
        updated = await self.client.useraccount.update(
            where={"id": account.id},
            data={"isActive": not is_locked},
        )
        return self._account_to_dict(updated)

    async def get_employee(self, employee_id: str, organization_id: str | None = None) -> dict[str, Any] | None:
        await self._ensure_connected()
        where: dict[str, Any] = {"OR": [{"id": employee_id}, {"employeeCode": employee_id}]}
        if organization_id:
            where = {"AND": [{"organizationId": organization_id}, where]}
        employee = await self.client.employee.find_first(
            where=where,
            include=self._employee_include(),
        )
        return self._employee_to_dict(employee) if employee else None

    async def list_employees(self, query: str = "", organization_id: str | None = None) -> list[dict[str, Any]]:
        await self._ensure_connected()
        conditions: list[dict[str, Any]] = [{"status": "ACTIVE"}]
        if organization_id:
            conditions.append({"organizationId": organization_id})
        if query.strip():
            conditions.append({"OR": [{"employeeCode": {"contains": query.strip()}}, {"fullName": {"contains": query.strip()}}]})
        where: dict[str, Any] = {"AND": conditions}
        employees = await self.client.employee.find_many(
            where=where,
            order={"fullName": "asc"},
            include=self._employee_include(),
        )
        return [self._employee_to_dict(employee) for employee in employees]

    async def save_employee(self, payload: dict[str, Any]) -> dict[str, Any]:
        await self._ensure_connected()
        requested_organization_id = str(payload.get("organization_id") or payload.get("organizationId") or "").strip()
        organization = (
            await self.client.organization.find_unique(where={"id": requested_organization_id})
            if requested_organization_id
            else await self._default_organization()
        )
        if organization is None:
            raise KeyError(requested_organization_id or "organization")
        from prisma import fields

        employee_ref = str(
            payload.get("employee_id")
            or payload.get("employee_code")
            or payload.get("employeeCode")
            or payload.get("id")
            or ""
        ).strip()
        employee_code = employee_ref or str(uuid4())
        employee_where: dict[str, Any] = {"OR": [{"id": employee_code}, {"employeeCode": employee_code}]}
        if requested_organization_id:
            employee_where = {"AND": [{"organizationId": requested_organization_id}, employee_where]}
        current = await self.client.employee.find_first(where=employee_where)
        status = str(payload.get("status") or "ACTIVE").upper()
        if status not in {"ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED"}:
            status = "ACTIVE"
        metadata = payload.get("metadata")
        if metadata is None and current is not None:
            metadata = getattr(current, "metadata", None)
        if metadata is None:
            metadata = {}
        data = {
            "employeeCode": employee_code,
            "fullName": str(payload.get("name") or payload.get("full_name") or employee_code).strip(),
            "email": str(payload.get("email") or "").strip() or None,
            "phone": str(payload.get("phone") or "").strip() or None,
            "avatarPath": str(payload.get("avatar_path") or "").strip() or None,
            "status": status,
            # Prisma Client Python requires an explicit Json value here even
            # though the database column is nullable.
            "metadata": fields.Json(metadata),
        }
        for field_name, payload_keys in (
            ("dateOfBirth", ("date_of_birth", "dateOfBirth")),
            ("hireDate", ("hire_date", "hireDate")),
            ("terminationDate", ("termination_date", "terminationDate")),
        ):
            present, value = self._first_payload_value(payload, payload_keys)
            if present:
                data[field_name] = self._parse_optional_date(value)

        organization_id = organization.id if current is None else current.organizationId
        for relation_name, relation_keys in (
            ("department", ("department_id", "departmentId", "department_code", "departmentCode", "department")),
            ("position", ("position_id", "positionId", "position_code", "positionCode", "position")),
        ):
            present, raw_value = self._first_payload_value(payload, relation_keys)
            if not present:
                continue
            relation = await self._resolve_or_create_relation(
                relation_name,
                organization_id,
                raw_value,
            )
            # Use scalar foreign keys so the create branch can use Prisma's
            # unchecked input together with organizationId. Nested relation
            # keys make the generated Python client choose the checked input,
            # which then requires an organization relation object as well.
            data[f"{relation_name}Id"] = relation.id if relation else None
        if current:
            employee = await self.client.employee.update(where={"id": current.id}, data=data)
        else:
            # Supplying the scalar FK avoids Prisma choosing its unchecked
            # input branch with a missing organizationId.
            data["organizationId"] = organization.id
            employee = await self.client.employee.create(data=data)
        refreshed = await self.client.employee.find_unique(
            where={"id": employee.id},
            include=self._employee_include(),
        )
        return self._employee_to_dict(refreshed or employee)

    async def list_face_candidates(self, organization_id: str | None = None) -> list[dict[str, Any]]:
        await self._ensure_connected()
        face_where: dict[str, Any] = {"isActive": True}
        if organization_id:
            face_where["employee"] = {
                "organizationId": organization_id,
                "status": "ACTIVE",
            }
        else:
            face_where["employee"] = {"status": "ACTIVE"}
        faces = await self.client.employeeface.find_many(
            where=face_where,
            include={
                "employee": {
                    "include": {
                        "department": True,
                        "position": True,
                    },
                },
            },
        )
        candidates = []
        for face in faces:
            employee = getattr(face, "employee", None)
            if employee is None:
                continue
            raw_embedding = face.embedding
            if not isinstance(raw_embedding, (bytes, bytearray)) and hasattr(raw_embedding, "decode"):
                raw_embedding = raw_embedding.decode()
            if isinstance(raw_embedding, str):
                from prisma import fields

                raw_embedding = fields.Base64.fromb64(raw_embedding).decode()
            if not isinstance(raw_embedding, (bytes, bytearray)):
                continue
            size = int(getattr(face, "embeddingSize", 0) or 0)
            if size <= 0 or len(raw_embedding) < size * 4:
                continue
            embedding = list(struct.unpack(f"<{size}f", bytes(raw_embedding[: size * 4])))
            candidates.append({
                "id": employee.id,
                "employee_id": employee.employeeCode,
                "name": employee.fullName,
                "department": getattr(getattr(employee, "department", None), "name", None),
                "position": getattr(getattr(employee, "position", None), "name", None),
                "embedding": embedding,
            })
        return candidates

    async def save_employee_face(self, employee_id: str, embedding: Any, image_bytes: bytes | None = None, organization_id: str | None = None) -> dict[str, Any]:
        await self._ensure_connected()
        where: dict[str, Any] = {"OR": [{"id": employee_id}, {"employeeCode": employee_id}]}
        if organization_id:
            where = {"AND": [{"organizationId": organization_id}, where]}
        employee = await self.client.employee.find_first(
            where=where,
            include=self._employee_include(),
        )
        if employee is None:
            raise KeyError(employee_id)
        values = self._embedding_values(embedding)
        if not values:
            raise ValueError("Face embedding is empty")
        raw_embedding = struct.pack(f"<{len(values)}f", *values)
        from prisma import fields

        await self.client.employeeface.update_many(
            where={"employeeId": employee.id, "isActive": True},
            data={"isActive": False},
        )
        image_path = self._store_employee_image(employee.id, image_bytes)
        await self.client.employeeface.create(
            data={
                "employeeId": employee.id,
                "embedding": fields.Base64.encode(raw_embedding),
                "embeddingModel": "insightface-buffalo_s",
                "embeddingSize": len(values),
                "imagePath": str(image_path) if image_path else None,
                "isActive": True,
            },
        )
        refreshed = await self.client.employee.find_unique(
            where={"id": employee.id},
            include=self._employee_include(),
        )
        return self._employee_to_dict(refreshed or employee, registered=True)

    async def clear_employee_face(self, employee_id: str, organization_id: str | None = None) -> dict[str, Any]:
        await self._ensure_connected()
        where: dict[str, Any] = {"OR": [{"id": employee_id}, {"employeeCode": employee_id}]}
        if organization_id:
            where = {"AND": [{"organizationId": organization_id}, where]}
        employee = await self.client.employee.find_first(
            where=where,
            include=self._employee_include(),
        )
        if employee is None:
            raise KeyError(employee_id)
        await self.client.employeeface.update_many(
            where={"employeeId": employee.id, "isActive": True},
            data={"isActive": False},
        )
        return self._employee_to_dict(employee, registered=False)

    async def get_employee_image(self, employee_id: str, organization_id: str | None = None) -> dict[str, Any] | None:
        await self._ensure_connected()
        where: dict[str, Any] = {"OR": [{"id": employee_id}, {"employeeCode": employee_id}]}
        if organization_id:
            where = {"AND": [{"organizationId": organization_id}, where]}
        employee = await self.client.employee.find_first(
            where=where,
            include={"faces": {"where": {"isActive": True}}},
        )
        if employee is None:
            return None
        faces = getattr(employee, "faces", None) or []
        image_path = next((getattr(face, "imagePath", None) for face in faces if getattr(face, "imagePath", None)), None)
        if not image_path:
            return {"image_base64": None, "image_url": ""}
        path = Path(str(image_path))
        if not path.is_absolute():
            path = Path.cwd() / path
        try:
            raw = path.read_bytes()
        except OSError:
            return {"image_base64": None, "image_url": ""}
        return {
            "image_base64": "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii"),
            "image_url": f"/api/v1/employees/{employee.employeeCode}/avatar",
        }

    async def list_cameras(self, organization_id: str | None = None) -> list[dict[str, Any]]:
        await self._ensure_connected()
        where: dict[str, Any] = {"isActive": True}
        if organization_id:
            where["organizationId"] = organization_id
        cameras = await self.client.camera.find_many(where=where, order={"name": "asc"})
        return [self._camera_to_dict(camera) for camera in cameras]

    async def get_camera(self, camera_id: str, organization_id: str | None = None) -> dict[str, Any] | None:
        await self._ensure_connected()
        camera = await self.client.camera.find_unique(where={"id": camera_id})
        if camera is not None and organization_id and camera.organizationId != organization_id:
            camera = None
        return self._camera_to_dict(camera) if camera else None

    async def save_camera(self, payload: dict[str, Any]) -> dict[str, Any]:
        await self._ensure_connected()
        requested_organization_id = str(payload.get("organization_id") or payload.get("organizationId") or "").strip()
        organization = (
            await self.client.organization.find_unique(where={"id": requested_organization_id})
            if requested_organization_id
            else await self._default_organization()
        )
        if organization is None:
            raise KeyError(requested_organization_id or "organization")
        from prisma import fields

        requested_id = str(payload.get("id") or "").strip()
        camera_id = requested_id if len(requested_id) == 36 else str(uuid4())
        current = await self.client.camera.find_unique(where={"id": camera_id})
        if current is not None and requested_organization_id and current.organizationId != organization.id:
            current = None
        connection_url = str(
            payload.get("connection_url")
            or payload.get("source")
            or payload.get("rtsp_url")
            or (getattr(current, "connectionUrl", "") if current else "")
            or ""
        ).strip()
        requested_camera_type = str(payload.get("camera_type") or payload.get("type") or "rtsp").upper()
        camera_type = {
            "RTSP": "RTSP",
            "DEVICE": "WEBCAM",
            "BROWSER": "WEBCAM",
            "WEBCAM": "WEBCAM",
            "MOBILE": "MOBILE",
        }.get(requested_camera_type, "RTSP")
        current_options = getattr(current, "options", None) if current else None
        options = dict(current_options) if isinstance(current_options, dict) else {}
        for key in ("options", "camera_options", "processing_options"):
            value = payload.get(key)
            if isinstance(value, dict):
                options.update(value)
        data = {
            "name": str(payload.get("name") or camera_id).strip(),
            "type": camera_type,
            "connectionUrl": connection_url or None,
            "username": str(payload.get("username") or "").strip() or None,
            "passwordSecret": str(payload.get("password_secret") or payload.get("password") or "").strip() or None,
            # Prisma Python requires fields.Json for JSON input. Passing a raw
            # dict can make the checked create branch fail and obscure the real
            # error as a missing organizationId in the unchecked branch.
            "options": fields.Json(options),
            "isDefault": bool(payload.get("is_default", payload.get("isDefault", False))),
            "isActive": payload.get("enabled", payload.get("is_active", True)) is not False,
            "organization": {"connect": {"id": organization.id}},
        }
        if current:
            data.pop("organization")
            camera = await self.client.camera.update(where={"id": camera_id}, data=data)
        else:
            data.pop("organization", None)
            data["organizationId"] = organization.id
            data["id"] = camera_id
            camera = await self.client.camera.create(data=data)
        return self._camera_to_dict(camera)

    async def delete_camera(self, camera_id: str, organization_id: str | None = None) -> bool:
        await self._ensure_connected()
        camera = await self.client.camera.find_unique(where={"id": camera_id})
        if camera is None or (organization_id and camera.organizationId != organization_id):
            return False
        result = await self.client.camera.update(where={"id": camera_id}, data={"isActive": False})
        return bool(result)

    async def create_attendance(self, payload: dict[str, Any], organization_id: str | None = None) -> dict[str, Any]:
        await self._ensure_connected()
        requested_organization_id = str(organization_id or payload.get("organization_id") or payload.get("organizationId") or "").strip()
        organization = (
            await self.client.organization.find_unique(where={"id": requested_organization_id})
            if requested_organization_id
            else await self._default_organization()
        )
        if organization is None:
            raise KeyError(requested_organization_id or "organization")
        from prisma import fields

        employee_id = str(payload.get("employee_id") or payload.get("user_id") or "").strip()
        employee = None
        if employee_id:
            employee_where: dict[str, Any] = {"OR": [{"id": employee_id}, {"employeeCode": employee_id}]}
            employee_where = {"AND": [{"organizationId": organization.id}, employee_where]}
            employee = await self.client.employee.find_first(where=employee_where)
        camera_id = str(payload.get("camera_id") or "").strip()
        camera = await self.client.camera.find_unique(where={"id": camera_id}) if camera_id else None
        if camera is not None and getattr(camera, "organizationId", organization.id) != organization.id:
            camera = None
        attendance_type = "AUTO"
        status = str(payload.get("status") or "ACCEPTED").upper()
        if status not in {"ACCEPTED", "REJECTED", "PENDING"}:
            status = "ACCEPTED"
        captured_at = self._parse_datetime(payload.get("captured_at"))
        location = payload.get("location")
        data: dict[str, Any] = {
            # Use scalar foreign keys so Prisma selects the unchecked input
            # consistently. The checked input otherwise requires an
            # organization relation object and fails with organizationId
            # missing when metadata is nullable.
            "organizationId": organization.id,
            "type": attendance_type,
            "status": status,
            "capturedAt": captured_at,
            "confidence": self._decimal_or_none(payload.get("confidence")),
            # Prisma Client Python requires an explicit Json value even when
            # the application has no GPS/location payload.
            "metadata": fields.Json({"location": location} if location is not None else {}),
        }
        if employee:
            data["employeeId"] = employee.id
        if camera:
            data["cameraId"] = camera.id
        record = await self.client.attendancerecord.create(
            data=data,
            include={"employee": True, "camera": True},
        )
        return self._attendance_to_dict(record)

    async def find_recent_attendance(
        self,
        employee_id: str,
        since: datetime,
        organization_id: str | None = None,
    ) -> dict[str, Any] | None:
        await self._ensure_connected()
        requested_organization_id = str(organization_id or "").strip()
        employee_where: dict[str, Any] = {"OR": [{"id": str(employee_id)}, {"employeeCode": str(employee_id)}]}
        if requested_organization_id:
            employee_where = {"AND": [{"organizationId": requested_organization_id}, employee_where]}
        employee = await self.client.employee.find_first(where=employee_where)
        if employee is None:
            return None
        where: dict[str, Any] = {
            "employeeId": employee.id,
            "status": "ACCEPTED",
            "capturedAt": {"gte": since},
        }
        if requested_organization_id:
            where["organizationId"] = requested_organization_id
        record = await self.client.attendancerecord.find_first(
            where=where,
            order={"capturedAt": "desc"},
            include={"employee": True, "camera": True},
        )
        return self._attendance_to_dict(record) if record else None

    async def list_attendance(self, filters: dict[str, Any], organization_id: str | None = None) -> list[dict[str, Any]]:
        await self._ensure_connected()
        where: dict[str, Any] = {}
        if organization_id:
            where["organizationId"] = organization_id
        employee_id = str(filters.get("employee_id") or "").strip()
        if employee_id:
            employee_where: dict[str, Any] = {"OR": [{"id": employee_id}, {"employeeCode": employee_id}]}
            if organization_id:
                employee_where = {"AND": [{"organizationId": organization_id}, employee_where]}
            employee = await self.client.employee.find_first(where=employee_where)
            where["employeeId"] = employee.id if employee else "__not_found__"

        start_date = filters.get("start_date")
        end_date = filters.get("end_date")
        start_dt = _parse_filter_datetime(start_date, is_end=False)
        end_dt = _parse_filter_datetime(end_date, is_end=True)
        if start_dt or end_dt:
            captured_at_filter: dict[str, Any] = {}
            if start_dt:
                captured_at_filter["gte"] = start_dt
            if end_dt:
                captured_at_filter["lte"] = end_dt
            where["capturedAt"] = captured_at_filter

        status = filters.get("status")
        if status and status != "ALL":
            status_norm = str(status).strip().upper()
            if status_norm in {"ACCEPTED", "REJECTED", "PENDING"}:
                where["status"] = status_norm
        records = await self.client.attendancerecord.find_many(
            where=where,
            order={"capturedAt": "desc"},
            take=200,
            include={"employee": True, "camera": True},
        )
        return [self._attendance_to_dict(record) for record in records]

    async def get_settings(
        self,
        key: str | None = None,
        organization_id: str | None = None,
    ) -> dict[str, Any]:
        await self._ensure_connected()
        organization = await self._organization_for_settings(organization_id)
        where: dict[str, Any] = {"organizationId": organization.id}
        if key:
            where["settingKey"] = key
        rows = await self.client.systemsetting.find_many(where=where)
        return {row.settingKey: row.settingValue for row in rows}

    async def save_settings(
        self,
        payload: dict[str, Any],
        organization_id: str | None = None,
    ) -> dict[str, Any]:
        await self._ensure_connected()
        organization = await self._organization_for_settings(organization_id)
        for key, value in payload.items():
            setting_key = str(key).strip()
            if not setting_key:
                continue
            await self.client.systemsetting.upsert(
                where={"organizationId_settingKey": {
                    "organizationId": organization.id,
                    "settingKey": setting_key,
                }},
                data={
                    "create": {
                        "organization": {"connect": {"id": organization.id}},
                        "settingKey": setting_key,
                        "settingValue": value,
                    },
                    "update": {"settingValue": value},
                },
            )
        return await self.get_settings(organization_id=organization.id)

    async def _organization_for_settings(self, organization_id: str | None) -> Any:
        if organization_id:
            organization = await self.client.organization.find_unique(
                where={"id": organization_id},
            )
            if organization is None:
                raise KeyError(organization_id)
            return organization
        return await self._default_organization()

    async def _default_organization(self) -> Any:
        organization = await self.client.organization.find_first(order={"createdAt": "asc"})
        if organization is None:
            organization = await self.client.organization.create(
                data={"code": "DEFAULT", "name": "CovaVision"},
            )
        return organization

    @staticmethod
    def _embedding_values(embedding: Any) -> list[float]:
        if hasattr(embedding, "tolist"):
            embedding = embedding.tolist()
        if embedding is None:
            return []
        return [float(value) for value in embedding]

    @staticmethod
    def _employee_include() -> dict[str, Any]:
        return {
            "faces": {"where": {"isActive": True}},
            "department": True,
            "position": True,
        }

    @staticmethod
    def _first_payload_value(payload: dict[str, Any], keys: tuple[str, ...]) -> tuple[bool, Any]:
        for key in keys:
            if key in payload:
                return True, payload.get(key)
        return False, None

    @staticmethod
    def _parse_optional_date(value: Any) -> datetime | None:
        if value is None or str(value).strip() == "":
            return None
        if isinstance(value, datetime):
            return value
        normalized = str(value).strip().replace("Z", "+00:00")
        if len(normalized) == 10:
            normalized = f"{normalized}T00:00:00"
        return datetime.fromisoformat(normalized)

    async def _resolve_or_create_relation(self, relation_name: str, organization_id: str, value: Any) -> Any | None:
        if isinstance(value, dict):
            value = value.get("id") or value.get("code") or value.get("name")
        text = str(value or "").strip()
        if not text:
            return None
        if relation_name == "department":
            model = self.client.department
            prefix = "DEPT"
        else:
            model = self.client.jobposition
            prefix = "POS"
        relation = await model.find_first(
            where={
                "organizationId": organization_id,
                "OR": [{"id": text}, {"code": text}, {"name": text}],
            },
        )
        if relation is not None:
            return relation
        code = self._relation_code(prefix, text)
        existing_code = await model.find_first(
            where={"organizationId": organization_id, "code": code},
        )
        if existing_code is not None:
            return existing_code
        return await model.create(
            data={
                "organization": {"connect": {"id": organization_id}},
                "code": code,
                "name": text[:255],
            },
        )

    @staticmethod
    def _relation_code(prefix: str, value: str) -> str:
        ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
        normalized = re.sub(r"[^A-Za-z0-9]+", "_", ascii_value).strip("_").upper()
        return f"{prefix}_{normalized or uuid4().hex[:12]}"[:50]

    @staticmethod
    def _store_employee_image(employee_id: str, image_bytes: bytes | None) -> Path | None:
        if not image_bytes:
            return None
        root = Path(os.getenv("COVAVISION_DATA_DIR", "data")) / "employee_faces"
        root.mkdir(parents=True, exist_ok=True)
        image_path = root / f"{employee_id}.jpg"
        image_path.write_bytes(image_bytes)
        return image_path

    @staticmethod
    def _decimal_or_none(value: Any) -> Decimal | None:
        if value is None or value == "":
            return None
        return Decimal(str(value))

    @staticmethod
    def _parse_datetime(value: Any) -> datetime:
        if isinstance(value, datetime):
            return value
        if value:
            normalized = str(value).replace("Z", "+00:00")
            return datetime.fromisoformat(normalized)
        return _now()

    @staticmethod
    def _employee_to_dict(employee: Any, *, registered: bool | None = None) -> dict[str, Any]:
        faces = getattr(employee, "faces", None) or []
        department = getattr(employee, "department", None)
        position = getattr(employee, "position", None)
        status = str(employee.status)

        def date_value(value: Any) -> str | None:
            return value.isoformat() if value is not None and hasattr(value, "isoformat") else None

        has_face = bool(faces) if registered is None else registered
        active_face = next((f for f in faces if getattr(f, "isActive", True)), None) or (faces[0] if faces else None)
        image_path = getattr(active_face, "imagePath", None) if active_face else getattr(employee, "avatarPath", None)
        face_updated = getattr(active_face, "updatedAt", None) or getattr(employee, "updatedAt", None)
        ts = int(face_updated.timestamp()) if (face_updated and hasattr(face_updated, "timestamp")) else ""
        avatar_query = f"?t={ts}" if ts else ""
        avatar_url = f"/api/v1/employees/{employee.employeeCode}/avatar{avatar_query}" if (has_face and image_path) else ""

        return {
            "id": employee.id,
            "employee_id": employee.employeeCode,
            "name": employee.fullName,
            "email": employee.email,
            "phone": employee.phone,
            "department_id": employee.departmentId,
            "department": department.name if department else None,
            "position_id": employee.positionId,
            "position": position.name if position else None,
            "avatar_path": employee.avatarPath or (str(image_path) if image_path else None),
            "image_url": avatar_url,
            "local_image_url": avatar_url,
            "date_of_birth": date_value(employee.dateOfBirth),
            "hire_date": date_value(employee.hireDate),
            "termination_date": date_value(employee.terminationDate),
            "status": status,
            "status_code": status.lower(),
            "metadata": employee.metadata,
            "registered": has_face,
            "has_face": has_face,
            "face_count": len(faces) if registered is None else (1 if registered else 0),
        }

    async def _find_account(self, account_id: str, organization_id: str | None = None) -> Any:
        where: dict[str, Any] = {"OR": [{"id": account_id}, {"username": account_id}]}
        if organization_id:
            where = {"AND": [{"organizationId": organization_id}, where]}
        return await self.client.useraccount.find_first(where=where)

    @staticmethod
    def _account_to_dict(account: Any) -> dict[str, Any]:
        return {
            "id": account.id,
            "username": account.username,
            "email": getattr(account, "email", None),
            "role": str(account.role),
            "organization_id": account.organizationId,
            "is_active": account.isActive,
            "email_verified": getattr(account, "emailVerifiedAt", None) is not None,
        }

    @staticmethod
    def _subscription_to_dict(subscription: Any) -> dict[str, Any]:
        if isinstance(subscription, dict):
            return dict(subscription)
        return {
            "id": subscription.id,
            "organization_id": subscription.organizationId,
            "plan_code": subscription.planCode,
            "status": str(subscription.status),
            "starts_at": subscription.startsAt.isoformat(),
            "ends_at": subscription.endsAt.isoformat() if subscription.endsAt else None,
            "provider": getattr(subscription, "provider", None),
            "provider_reference": getattr(subscription, "providerReference", None),
        }

    @staticmethod
    def _payment_to_dict(payment: Any) -> dict[str, Any]:
        if isinstance(payment, dict):
            return dict(payment)
        return {
            "id": payment.id,
            "organization_id": payment.organizationId,
            "order_code": payment.orderCode,
            "plan_code": payment.planCode,
            "amount_vnd": payment.amountVnd,
            "status": str(payment.status),
            "provider": payment.provider,
            "provider_transaction_id": getattr(payment, "providerTransactionId", None),
            "transfer_content": getattr(payment, "transferContent", None),
            "payment_url": getattr(payment, "paymentUrl", None),
            "qr_code_url": getattr(payment, "qrCodeUrl", None),
            "expires_at": payment.expiresAt.isoformat() if payment.expiresAt else None,
            "paid_at": payment.paidAt.isoformat() if payment.paidAt else None,
        }

    @staticmethod
    def _camera_to_dict(camera: Any) -> dict[str, Any]:
        return {
            "id": camera.id,
            "name": camera.name,
            "camera_type": str(camera.type).lower(),
            "connection_url": camera.connectionUrl,
            "username": camera.username,
            "password_secret": camera.passwordSecret,
            "camera_options": {
                key: value
                for key, value in (camera.options or {}).items()
                if key not in {"fps_limit", "stream_jpeg_quality", "skip_ai_frames", "no_motion_delay"}
            },
            "processing_options": {
                key: value
                for key, value in (camera.options or {}).items()
                if key in {"fps_limit", "stream_jpeg_quality", "skip_ai_frames", "no_motion_delay"}
            },
            "is_default": camera.isDefault,
            "is_active": camera.isActive,
        }

    @staticmethod
    def _attendance_to_dict(record: Any) -> dict[str, Any]:
        attendance_type = "auto"
        employee = getattr(record, "employee", None)
        camera = getattr(record, "camera", None)
        return {
            "id": record.id,
            "employee_id": employee.employeeCode if employee else record.employeeId,
            "employee_name": employee.fullName if employee else None,
            "camera_id": camera.id if camera else record.cameraId,
            "camera_name": camera.name if camera else None,
            "attendance_type": attendance_type,
            "status": str(record.status).lower(),
            "captured_at": record.capturedAt.isoformat(),
            "confidence": float(record.confidence) if record.confidence is not None else None,
        }

    @staticmethod
    def _audit_log_to_dict(record: Any) -> dict[str, Any]:
        return {
            "id": record.id,
            "organization_id": record.organizationId,
            "user_account_id": record.userAccountId,
            "action": record.action,
            "entity_type": record.entityType,
            "entity_id": record.entityId,
            "details": record.details or {},
            "created_at": record.createdAt.isoformat(),
        }
