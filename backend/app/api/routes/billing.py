"""Subscription plans and SePay QR/webhook integration."""

from __future__ import annotations

import hmac
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_user, get_repository
from app.billing.plans import get_plan, list_public_plans
from app.core.config import settings
from app.db.repository import Repository

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    plan_code: str = Field(min_length=1, max_length=40)


class SePayWebhook(BaseModel):
    id: int | str
    code: str | None = None
    content: str | None = None
    transferType: str | None = None
    transferAmount: int | float | str
    transactionDate: str | None = None
    accountNumber: str | None = None


def _organization_id(user: dict[str, Any]) -> str:
    organization_id = str(user.get("organization_id") or "").strip()
    if not organization_id:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập thiếu tổ chức")
    return organization_id


def _qr_url(order_code: str, amount_vnd: int) -> str | None:
    account = settings.sepay_bank_account.strip()
    bank = settings.sepay_bank_code.strip()
    if not account or not bank:
        return None
    return (
        "https://vietqr.app/img?acc="
        f"{quote(account)}&bank={quote(bank)}&amount={amount_vnd}&des={quote(order_code)}"
    )


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def _payment_public(payment: dict[str, Any]) -> dict[str, Any]:
    public = dict(payment)
    public["qr_code_url"] = public.get("qr_code_url") or _qr_url(
        str(public.get("order_code") or ""),
        int(public.get("amount_vnd") or 0),
    )
    public.pop("provider_transaction_id", None)
    return public


@router.get("/plans")
async def plans() -> dict[str, Any]:
    return {"success": True, "plans": list_public_plans()}


@router.get("/me")
async def billing_me(
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {"success": True, **await repository.get_billing_summary(_organization_id(current_user))}


@router.post("/checkout")
async def checkout(
    payload: CheckoutRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    if str(current_user.get("role") or "").upper() not in {"ADMIN", "HR_MANAGER"}:
        raise HTTPException(status_code=403, detail="Chỉ quản trị viên được mua gói")
    try:
        plan = get_plan(payload.plan_code)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if plan.contact_only:
        raise HTTPException(status_code=409, detail="Gói Business cần liên hệ tư vấn")
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=max(5, settings.payment_order_ttl_minutes))
    order_code = f"{settings.sepay_order_prefix.strip().upper() or 'CV'}{uuid4().hex[:16].upper()}"
    try:
        payment = await repository.create_payment(_organization_id(current_user), plan.code, order_code, expires_at)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    payment["qr_code_url"] = _qr_url(order_code, int(payment["amount_vnd"]))
    payment["instructions"] = "Quét QR và nhập đúng nội dung chuyển khoản; hệ thống sẽ tự kích hoạt sau khi SePay gửi webhook."
    return {"success": True, "payment": _payment_public(payment)}


@router.get("/payments/{order_code}")
async def payment_status(
    order_code: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    payment = await repository.get_payment(_organization_id(current_user), order_code.strip().upper())
    if payment is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn thanh toán")
    return {"success": True, "payment": _payment_public(payment)}


def _authorized_webhook(authorization: str | None, x_api_key: str | None) -> bool:
    expected = settings.sepay_webhook_api_key.strip()
    if not expected:
        return settings.app_env.lower() in {"development", "dev", "test"}
    candidates = [x_api_key or "", authorization or ""]
    return any(
        hmac.compare_digest(candidate, expected)
        or hmac.compare_digest(candidate.removeprefix("Apikey "), expected)
        or hmac.compare_digest(candidate.removeprefix("Bearer "), expected)
        for candidate in candidates
    )


def _order_from_webhook(payload: SePayWebhook) -> str:
    content = f"{payload.code or ''} {payload.content or ''}".upper()
    prefix = re.escape(settings.sepay_order_prefix.strip().upper() or "CV")
    match = re.search(rf"\b({prefix}[A-Z0-9_-]{{8,80}})\b", content)
    if not match:
        raise HTTPException(status_code=422, detail="Webhook không có mã đơn thanh toán")
    return match.group(1)


@router.post("/webhooks/sepay", include_in_schema=False)
async def sepay_webhook(
    payload: SePayWebhook,
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
    repository: Repository = Depends(get_repository),
) -> dict[str, bool]:
    if not _authorized_webhook(authorization, x_api_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Webhook authentication failed")
    if str(payload.transferType or "").lower() != "in":
        raise HTTPException(status_code=422, detail="Chỉ xử lý giao dịch tiền vào")
    order_code = _order_from_webhook(payload)
    payment = await repository.get_payment_by_order(order_code)
    if payment is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy mã đơn")
    if payment.get("status") == "PAID":
        return {"success": True}
    if payment.get("expires_at"):
        expires_at = _parse_datetime(str(payment["expires_at"]))
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=422, detail="Đơn thanh toán đã hết hạn")
    try:
        amount = int(float(payload.transferAmount))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Số tiền webhook không hợp lệ") from exc
    configured_account = settings.sepay_bank_account.strip()
    if configured_account and payload.accountNumber and payload.accountNumber.strip() != configured_account:
        raise HTTPException(status_code=422, detail="Sai tài khoản nhận tiền")
    try:
        await repository.complete_payment(
            order_code,
            str(payload.id),
            amount,
            (payload.content or payload.code or "")[:500],
            _parse_datetime(payload.transactionDate),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Không tìm thấy mã đơn") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"success": True}
