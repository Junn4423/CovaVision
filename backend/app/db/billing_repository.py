"""Prisma persistence for subscriptions and SePay payment orders."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from app.billing.plans import get_plan
from app.core.security import hash_password


class PrismaBillingMixin:
    """Mixin kept separate so the legacy HR repository stays readable."""

    async def _ensure_prisma_plan(self, plan_code: str) -> Any:
        plan = get_plan(plan_code)
        return await self.client.subscriptionplan.upsert(
            where={"code": plan.code},
            data={
                "update": {
                    "name": plan.name,
                    "maxEmployees": plan.max_employees,
                    "maxFaceTemplates": plan.max_face_templates,
                    "monthlyPriceVnd": plan.monthly_price_vnd,
                    "durationDays": plan.duration_days,
                    "contactOnly": plan.contact_only,
                    "isActive": True,
                },
                "create": {
                    "code": plan.code,
                    "name": plan.name,
                    "maxEmployees": plan.max_employees,
                    "maxFaceTemplates": plan.max_face_templates,
                    "monthlyPriceVnd": plan.monthly_price_vnd,
                    "durationDays": plan.duration_days,
                    "contactOnly": plan.contact_only,
                    "isActive": True,
                },
            },
        )

    async def register_account(self, email: str, password: str, full_name: str, organization_name: str) -> dict[str, Any]:
        await self._ensure_connected()
        email = email.strip().lower()
        if await self.client.useraccount.find_unique(where={"email": email}):
            raise ValueError("email_already_registered")
        organization = await self.client.organization.create(
            data={
                "code": f"ORG-{uuid4().hex[:10].upper()}",
                "name": organization_name.strip() or f"Tổ chức của {full_name.strip() or email}",
                "timezone": "Asia/Ho_Chi_Minh",
            }
        )
        account = await self.client.useraccount.create(
            data={
                "username": email,
                "email": email,
                "passwordHash": hash_password(password),
                "role": "ADMIN",
                "isActive": True,
                "organizationId": organization.id,
            }
        )
        await self.create_trial_subscription(organization.id)
        return self._account_to_dict(account)

    async def authenticate_google(self, email: str, google_subject: str, full_name: str) -> dict[str, Any]:
        await self._ensure_connected()
        email = email.strip().lower()
        account = await self.client.useraccount.find_first(
            where={"OR": [{"googleSubject": google_subject}, {"email": email}]},
        )
        if account is None:
            organization = await self.client.organization.create(
                data={
                    "code": f"ORG-{uuid4().hex[:10].upper()}",
                    "name": f"Tổ chức của {full_name.strip() or email}",
                    "timezone": "Asia/Ho_Chi_Minh",
                }
            )
            account = await self.client.useraccount.create(
                data={
                    "username": email,
                    "email": email,
                    "emailVerifiedAt": datetime.now().astimezone(),
                    "googleSubject": google_subject,
                    "passwordHash": hash_password(uuid4().hex),
                    "role": "ADMIN",
                    "isActive": True,
                    "organizationId": organization.id,
                }
            )
            await self.create_trial_subscription(organization.id)
        else:
            account = await self.client.useraccount.update(
                where={"id": account.id},
                data={"googleSubject": google_subject, "emailVerifiedAt": datetime.now().astimezone(), "isActive": True},
            )
        return self._account_to_dict(account)

    async def create_trial_subscription(self, organization_id: str) -> dict[str, Any]:
        await self._ensure_connected()
        existing = await self.client.organizationsubscription.find_first(
            where={"organizationId": organization_id},
            order={"createdAt": "desc"},
        )
        if existing:
            ends_at = existing.endsAt
            if str(existing.status) in {"TRIALING", "ACTIVE"} and ends_at and ends_at <= datetime.now(timezone.utc):
                existing = await self.client.organizationsubscription.update(
                    where={"id": existing.id},
                    data={"status": "EXPIRED"},
                )
            return self._subscription_to_dict(existing)
        plan = get_plan("trial")
        await self._ensure_prisma_plan(plan.code)
        now = datetime.now().astimezone()
        subscription = await self.client.organizationsubscription.create(
            data={
                "organizationId": organization_id,
                "planCode": plan.code,
                "status": "TRIALING",
                "startsAt": now,
                "endsAt": now + timedelta(days=plan.duration_days or 14),
                "autoRenew": False,
            }
        )
        return self._subscription_to_dict(subscription)

    async def get_billing_summary(self, organization_id: str) -> dict[str, Any]:
        await self._ensure_connected()
        subscription = await self.client.organizationsubscription.find_first(
            where={"organizationId": organization_id},
            order={"createdAt": "desc"},
        )
        if subscription is None:
            subscription = await self.create_trial_subscription(organization_id)
            plan = get_plan(subscription["plan_code"])
        else:
            if str(subscription.status) in {"TRIALING", "ACTIVE"} and subscription.endsAt and subscription.endsAt <= datetime.now(timezone.utc):
                subscription = await self.client.organizationsubscription.update(
                    where={"id": subscription.id},
                    data={"status": "EXPIRED"},
                )
            plan = get_plan(subscription.planCode)
            subscription = self._subscription_to_dict(subscription)
        employees = await self.client.employee.find_many(where={"organizationId": organization_id, "status": "ACTIVE"})
        faces = await self.client.employeeface.find_many(
            where={"isActive": True, "employee": {"organizationId": organization_id}},
        )
        return {
            "subscription": subscription,
            "plan": plan.public_dict(),
            "usage": {"employees": len(employees), "face_templates": len(faces)},
        }

    async def create_payment(self, organization_id: str, plan_code: str, order_code: str, expires_at: datetime) -> dict[str, Any]:
        await self._ensure_connected()
        plan = get_plan(plan_code)
        if plan.contact_only:
            raise ValueError("contact_required")
        await self._ensure_prisma_plan(plan.code)
        payment = await self.client.paymenttransaction.create(
            data={
                "organizationId": organization_id,
                "orderCode": order_code,
                "planCode": plan.code,
                "amountVnd": plan.monthly_price_vnd,
                "status": "PENDING",
                "provider": "sepay",
                "expiresAt": expires_at,
            }
        )
        return self._payment_to_dict(payment)

    async def get_payment(self, organization_id: str, order_code: str) -> dict[str, Any] | None:
        await self._ensure_connected()
        payment = await self.client.paymenttransaction.find_first(
            where={"organizationId": organization_id, "orderCode": order_code},
        )
        return self._payment_to_dict(payment) if payment else None

    async def get_payment_by_order(self, order_code: str) -> dict[str, Any] | None:
        await self._ensure_connected()
        payment = await self.client.paymenttransaction.find_unique(where={"orderCode": order_code})
        return self._payment_to_dict(payment) if payment else None

    async def complete_payment(self, order_code: str, provider_transaction_id: str, amount_vnd: int, transfer_content: str, paid_at: datetime) -> dict[str, Any]:
        await self._ensure_connected()
        payment = await self.client.paymenttransaction.find_unique(where={"orderCode": order_code})
        if payment is None:
            raise KeyError(order_code)
        if str(payment.status) == "PAID":
            return self._payment_to_dict(payment)
        if int(payment.amountVnd) != int(amount_vnd):
            raise ValueError("payment_amount_mismatch")
        duplicate = await self.client.paymenttransaction.find_first(
            where={"providerTransactionId": provider_transaction_id, "orderCode": {"not": order_code}},
        )
        if duplicate:
            raise ValueError("duplicate_provider_transaction")
        plan = get_plan(payment.planCode)
        updated = await self.client.paymenttransaction.update(
            where={"id": payment.id},
            data={
                "status": "PAID",
                "providerTransactionId": provider_transaction_id,
                "transferContent": transfer_content[:500],
                "paidAt": paid_at,
            },
        )
        await self.client.organizationsubscription.create(
            data={
                "organizationId": payment.organizationId,
                "planCode": plan.code,
                "status": "ACTIVE",
                "startsAt": paid_at,
                "endsAt": paid_at + timedelta(days=plan.duration_days or 30),
                "provider": "sepay",
                "providerReference": order_code,
                "autoRenew": False,
            }
        )
        return self._payment_to_dict(updated)
