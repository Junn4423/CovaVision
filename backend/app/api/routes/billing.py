"""Subscription plans and payment provider integrations."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


def _hmac_sha256(key: str, value: str) -> str:
    return hmac.new(key.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()


from app.api.deps import get_current_user, get_repository
from app.billing.payment_providers import (
    PaymentProviderError,
    build_momo_callback_signature,
    build_payment_provider,
    build_zalopay_callback_mac,
)
from app.billing.plans import get_plan, list_public_plans
from app.core.config import settings
from app.db.repository import Repository

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    plan_code: str = Field(min_length=1, max_length=40)
    payment_method: str = Field(default="vietqr", min_length=1, max_length=40)


class SePayWebhook(BaseModel):
    id: int | str
    code: str | None = None
    content: str | None = None
    transferType: str | None = None
    transferAmount: int | float | str
    transactionDate: str | None = None
    accountNumber: str | None = None


class MomoWebhook(BaseModel):
    partnerCode: str | None = None
    orderId: str
    requestId: str | None = None
    amount: int | float | str
    orderInfo: str | None = None
    orderType: str | None = None
    transId: str | int | None = None
    resultCode: int | str
    message: str | None = None
    payType: str | None = None
    responseTime: int | str | None = None
    extraData: str | None = None
    accessKey: str | None = None
    signature: str


class ZaloPayWebhook(BaseModel):
    data: str
    mac: str
    type: int | str = 1


def _organization_id(user: dict[str, Any]) -> str:
    organization_id = str(user.get("organization_id") or "").strip()
    if not organization_id:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập thiếu tổ chức")
    return organization_id


def _build_payment_provider(code: str):
    return build_payment_provider(code)


def _qr_url(order_code: str, amount_vnd: int) -> str | None:
    account = (settings.vietqr_bank_account or settings.sepay_bank_account).strip()
    bank = (settings.vietqr_bank_code or settings.sepay_bank_code).strip()
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
    if str(public.get("payment_method") or public.get("provider") or "").lower() == "vietqr":
        public["bank_account"] = (settings.vietqr_bank_account or settings.sepay_bank_account).strip()
        public["bank_code"] = (settings.vietqr_bank_code or settings.sepay_bank_code).strip()
        public["account_name"] = settings.vietqr_account_name.strip()
    public.pop("provider_transaction_id", None)
    return public


async def _complete_callback_payment(
    repository: Repository,
    *,
    order_code: str,
    provider_transaction_id: str,
    amount_vnd: int,
    transfer_content: str,
) -> None:
    payment = await repository.get_payment_by_order(order_code)
    if payment is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy mã đơn")
    if payment.get("status") == "PAID":
        return
    if payment.get("expires_at"):
        expires_at = _parse_datetime(str(payment["expires_at"]))
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=422, detail="Đơn thanh toán đã hết hạn")
    try:
        await repository.complete_payment(
            order_code,
            provider_transaction_id,
            amount_vnd,
            transfer_content[:500],
            datetime.now(timezone.utc),
        )
    except (KeyError, ValueError) as exc:
        status_code = 404 if isinstance(exc, KeyError) else 422
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.get("/plans")
async def plans() -> dict[str, Any]:
    return {"success": True, "plans": list_public_plans()}


@router.get("/payment-methods")
async def payment_methods(
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    return {"success": True, "payment_methods": await repository.list_payment_methods(active_only=True)}


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
    payment_method = str(payload.payment_method or "vietqr").strip().lower()
    try:
        payment = await repository.create_payment(
            _organization_id(current_user),
            plan.code,
            order_code,
            expires_at,
            payment_method,
        )
    except ValueError as exc:
        if str(exc) == "payment_method_inactive":
            raise HTTPException(status_code=409, detail="Phương thức thanh toán đang tắt") from exc
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        provider = _build_payment_provider(str(payment.get("provider") or payment_method))
        intent = await provider.create_payment(
            order_code=order_code,
            amount_vnd=int(payment["amount_vnd"]),
            organization_id=_organization_id(current_user),
        )
        payment = await repository.update_payment_provider(
            order_code,
            payment_url=intent.payment_url,
            qr_code_url=intent.qr_code_url,
            metadata=intent.metadata,
        )
    except PaymentProviderError as exc:
        error_status = 503 if exc.code in {"payment_provider_not_configured", "payment_provider_unavailable"} else 502
        raise HTTPException(status_code=error_status, detail=str(exc)) from exc
    if payment_method == "vietqr" and not payment.get("qr_code_url"):
        payment["qr_code_url"] = _qr_url(order_code, int(payment["amount_vnd"]))
    payment["instructions"] = "Quét QR hoặc hoàn tất thanh toán trên cổng đã chọn; hệ thống sẽ tự kích hoạt gói sau khi nhận callback."
    return {"success": True, "payment": _payment_public(payment)}


async def _sync_payment_with_provider(
    payment: dict[str, Any],
    repository: Repository,
) -> dict[str, Any]:
    """Actively checks the payment gateway API to verify if payment was completed.

    Essential for desktop / local / behind-NAT environments where webhooks cannot reach.
    """
    if payment.get("status") == "PAID":
        return payment

    order_code = str(payment.get("order_code") or "").strip().upper()
    provider = str(payment.get("provider") or payment.get("payment_method") or "").lower()
    metadata = payment.get("metadata") or {}
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except Exception:
            metadata = {}

    # 1. STRIPE CHECKOUT
    if provider == "stripe":
        session_id = str(metadata.get("session_id") or payment.get("provider_transaction_id") or "").strip()
        api_key = settings.stripe_secret_key.strip()
        if session_id and api_key:
            try:
                import stripe

                stripe.api_key = api_key
                session = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id)
                payment_status_val = getattr(session, "payment_status", "")
                session_status_val = getattr(session, "status", "")
                if payment_status_val == "paid" or session_status_val == "complete":
                    amount_vnd = int(payment.get("amount_vnd") or 0)
                    await _complete_callback_payment(
                        repository,
                        order_code=order_code,
                        provider_transaction_id=str(session.id),
                        amount_vnd=amount_vnd,
                        transfer_content=f"Stripe Checkout {session.id}",
                    )
                    updated = await repository.get_payment_by_order(order_code)
                    if updated:
                        return updated
            except Exception as exc:
                logger.warning("Stripe sync check for %s: %s", order_code, exc)

    # 2. MOMO GATEWAY
    elif provider == "momo":
        partner_code = settings.momo_partner_code.strip()
        access_key = settings.momo_access_key.strip()
        secret_key = settings.momo_secret_key.strip()
        if partner_code and access_key and secret_key:
            try:
                query_url = (
                    "https://test-payment.momo.vn/v2/gateway/api/query"
                    if settings.payment_environment == "sandbox"
                    else "https://payment.momo.vn/v2/gateway/api/query"
                )
                request_id = str(int(time.time() * 1000))
                raw_sig = f"accessKey={access_key}&orderId={order_code}&partnerCode={partner_code}&requestId={request_id}"
                signature = _hmac_sha256(secret_key, raw_sig)
                async with httpx.AsyncClient(timeout=4.0) as client:
                    resp = await client.post(
                        query_url,
                        json={
                            "partnerCode": partner_code,
                            "requestId": request_id,
                            "orderId": order_code,
                            "signature": signature,
                            "lang": "vi",
                        },
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("resultCode") == 0:
                            amount_vnd = int(float(data.get("amount") or payment.get("amount_vnd") or 0))
                            await _complete_callback_payment(
                                repository,
                                order_code=order_code,
                                provider_transaction_id=str(data.get("transId") or order_code),
                                amount_vnd=amount_vnd,
                                transfer_content=f"MoMo {data.get('transId') or order_code}",
                            )
                            updated = await repository.get_payment_by_order(order_code)
                            if updated:
                                return updated
            except Exception as exc:
                logger.warning("MoMo sync check for %s: %s", order_code, exc)

    # 3. ZALOPAY GATEWAY
    elif provider == "zalopay":
        app_id_val = settings.zalopay_app_id
        key1 = settings.zalopay_key1.strip()
        app_trans_id = metadata.get("app_trans_id") or payment.get("provider_transaction_id")
        if app_id_val and key1 and app_trans_id:
            try:
                query_url = (
                    "https://sb-openapi.zalopay.vn/v2/query"
                    if settings.payment_environment == "sandbox"
                    else "https://openapi.zalopay.vn/v2/query"
                )
                app_id_int = int(app_id_val)
                mac_data = f"{app_id_int}|{app_trans_id}|{key1}"
                mac = _hmac_sha256(key1, mac_data)
                async with httpx.AsyncClient(timeout=4.0) as client:
                    resp = await client.post(
                        query_url,
                        data={
                            "app_id": app_id_int,
                            "app_trans_id": app_trans_id,
                            "mac": mac,
                        },
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("return_code") == 1:
                            amount_vnd = int(float(data.get("amount") or payment.get("amount_vnd") or 0))
                            await _complete_callback_payment(
                                repository,
                                order_code=order_code,
                                provider_transaction_id=str(data.get("zp_trans_id") or app_trans_id),
                                amount_vnd=amount_vnd,
                                transfer_content=f"ZaloPay {app_trans_id}",
                            )
                            updated = await repository.get_payment_by_order(order_code)
                            if updated:
                                return updated
            except Exception as exc:
                logger.warning("ZaloPay sync check for %s: %s", order_code, exc)

    # 4. VIETQR / SEPAY
    elif provider == "vietqr":
        api_key = settings.sepay_webhook_api_key.strip()
        if api_key:
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    resp = await client.get(
                        f"https://my.sepay.vn/userapi/transactions/list?pattern={quote(order_code)}",
                        headers={"Authorization": f"Apikey {api_key}"},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        txs = data.get("transactions") or []
                        for tx in txs:
                            tx_amount = int(float(tx.get("amount_in") or 0))
                            if tx_amount >= int(payment["amount_vnd"]):
                                await _complete_callback_payment(
                                    repository,
                                    order_code=order_code,
                                    provider_transaction_id=str(tx.get("id") or order_code),
                                    amount_vnd=tx_amount,
                                    transfer_content=tx.get("transaction_content") or order_code,
                                )
                                updated = await repository.get_payment_by_order(order_code)
                                if updated:
                                    return updated
            except Exception as exc:
                logger.warning("SePay sync check for %s: %s", order_code, exc)

    return payment


@router.get("/payments/{order_code}")
async def payment_status(
    order_code: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    payment = await repository.get_payment(_organization_id(current_user), order_code.strip().upper())
    if payment is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn thanh toán")
    if payment.get("status") != "PAID":
        payment = await _sync_payment_with_provider(payment, repository)
    return {"success": True, "payment": _payment_public(payment)}


@router.post("/payments/{order_code}/sync")
async def sync_payment_order(
    order_code: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    payment = await repository.get_payment(_organization_id(current_user), order_code.strip().upper())
    if payment is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn thanh toán")
    payment = await _sync_payment_with_provider(payment, repository)
    return {"success": True, "payment": _payment_public(payment)}


class SyncSessionRequest(BaseModel):
    session_id: str | None = None
    order_code: str | None = None


@router.post("/sync-session")
async def sync_payment_session(
    payload: SyncSessionRequest,
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    """Sync payment status across any window/tab using order_code or Stripe session_id."""
    order_code = (payload.order_code or "").strip().upper()
    session_id = (payload.session_id or "").strip()

    payment = None
    if order_code:
        payment = await repository.get_payment_by_order(order_code)
    elif session_id:
        api_key = settings.stripe_secret_key.strip()
        if api_key:
            try:
                import stripe

                stripe.api_key = api_key
                session = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id)
                found_order = (
                    getattr(session, "client_reference_id", None)
                    or (session.get("metadata", {}).get("order_code") if hasattr(session, "get") else None)
                    or ""
                )
                if not found_order and hasattr(session, "metadata") and session.metadata:
                    found_order = session.metadata.get("order_code") or ""
                found_order = str(found_order).strip().upper()
                if found_order:
                    payment = await repository.get_payment_by_order(found_order)
            except Exception as exc:
                logger.warning("Failed retrieving Stripe session %s: %s", session_id, exc)

    if payment is None:
        return {"success": False, "message": "Không tìm thấy đơn thanh toán cần đồng bộ"}

    if payment.get("status") != "PAID":
        payment = await _sync_payment_with_provider(payment, repository)

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
    configured_account = (settings.vietqr_bank_account or settings.sepay_bank_account).strip()
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


@router.post("/webhooks/momo", include_in_schema=False)
async def momo_webhook(
    payload: MomoWebhook,
    repository: Repository = Depends(get_repository),
) -> dict[str, bool]:
    secret = settings.momo_secret_key.strip()
    if not secret:
        raise HTTPException(status_code=503, detail="MoMo webhook chưa được cấu hình")
    values = payload.model_dump(exclude={"signature"})
    expected = build_momo_callback_signature(values, secret)
    if not hmac.compare_digest(str(payload.signature or ""), expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="MoMo webhook signature invalid")
    try:
        result_code = int(payload.resultCode)
        amount = int(float(payload.amount))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="MoMo webhook không hợp lệ") from exc
    if result_code != 0:
        return {"success": True}
    await _complete_callback_payment(
        repository,
        order_code=payload.orderId.strip().upper(),
        provider_transaction_id=str(payload.transId or payload.requestId or payload.orderId),
        amount_vnd=amount,
        transfer_content=payload.message or payload.orderInfo or "MoMo payment",
    )
    return {"success": True}


@router.post("/webhooks/zalopay", include_in_schema=False)
async def zalopay_webhook(
    payload: ZaloPayWebhook,
    repository: Repository = Depends(get_repository),
) -> dict[str, bool]:
    secret = settings.zalopay_key2.strip()
    if not secret:
        raise HTTPException(status_code=503, detail="ZaloPay webhook chưa được cấu hình")
    expected = build_zalopay_callback_mac(secret, payload.data)
    if not hmac.compare_digest(str(payload.mac or ""), expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="ZaloPay callback MAC invalid")
    try:
        data = json.loads(payload.data)
        app_trans_id = str(data.get("apptransid") or "")
        order_code = app_trans_id.split("_", 1)[1].strip().upper()
        amount = int(float(data.get("amount")))
    except (IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail="ZaloPay callback không hợp lệ") from exc
    await _complete_callback_payment(
        repository,
        order_code=order_code,
        provider_transaction_id=str(data.get("zptransid") or app_trans_id),
        amount_vnd=amount,
        transfer_content=f"ZaloPay {app_trans_id}",
    )
    return {"success": True}


@router.post("/webhooks/stripe", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    repository: Repository = Depends(get_repository),
) -> dict[str, bool]:
    body = await request.body()
    sig_header = request.headers.get("stripe-signature")
    webhook_secret = settings.stripe_webhook_secret.strip()

    import stripe

    if webhook_secret and sig_header:
        try:
            event = stripe.Webhook.construct_event(body, sig_header, webhook_secret)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Stripe webhook signature invalid",
            ) from exc
    else:
        try:
            event = json.loads(body.decode("utf-8"))
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail="Stripe webhook payload không hợp lệ",
            ) from exc

    event_type = event.get("type")
    if event_type == "checkout.session.completed":
        session = event.get("data", {}).get("object", {})
        order_code = (
            session.get("client_reference_id")
            or session.get("metadata", {}).get("order_code")
            or ""
        ).strip().upper()
        if order_code:
            payment = await repository.get_payment_by_order(order_code)
            amount_vnd = int(payment.get("amount_vnd") or 0) if payment else 0
            await _complete_callback_payment(
                repository,
                order_code=order_code,
                provider_transaction_id=str(session.get("id") or ""),
                amount_vnd=amount_vnd,
                transfer_content=f"Stripe Checkout {session.get('id')}",
            )
    return {"success": True}
