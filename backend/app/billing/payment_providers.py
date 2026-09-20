"""Payment provider adapters.

The database controls whether a method is offered. Credentials and sandbox/
production endpoints stay in server-side environment settings.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import settings


PAYMENT_METHOD_CATALOG: tuple[dict[str, Any], ...] = (
    {"code": "momo", "name": "MoMo", "provider": "momo", "display_order": 10},
    {"code": "zalopay", "name": "ZaloPay", "provider": "zalopay", "display_order": 20},
    {"code": "vietqr", "name": "VietQR", "provider": "vietqr", "display_order": 30},
)


class PaymentProviderError(RuntimeError):
    """A provider could not create a payment intent."""

    def __init__(self, message: str, *, code: str = "payment_provider_error") -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class PaymentIntent:
    provider: str
    payment_url: str | None = None
    qr_code_url: str | None = None
    provider_transaction_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def _hmac_sha256(key: str, value: str) -> str:
    return hmac.new(key.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()


def build_momo_signature(values: dict[str, Any], secret_key: str) -> str:
    """Build MoMo's HMAC signature using the documented field order."""
    fields = (
        "accessKey",
        "amount",
        "extraData",
        "ipnUrl",
        "orderId",
        "orderInfo",
        "partnerCode",
        "redirectUrl",
        "requestId",
        "requestType",
    )
    raw = "&".join(f"{field}={values.get(field, '')}" for field in fields)
    return _hmac_sha256(secret_key, raw)


def build_zalopay_mac(
    key1: str,
    *,
    app_id: int,
    app_trans_id: str,
    app_user: str,
    amount: int,
    app_time: int,
    embed_data: str,
    item: str,
) -> str:
    raw = "|".join(
        str(value)
        for value in (app_id, app_trans_id, app_user, amount, app_time, embed_data, item)
    )
    return _hmac_sha256(key1, raw)


class PaymentProvider:
    code = ""

    def __init__(self, *, environment: str, endpoint: str, timeout: float) -> None:
        self.environment = environment
        self.endpoint = endpoint
        self.timeout = timeout

    async def create_payment(
        self,
        *,
        order_code: str,
        amount_vnd: int,
        organization_id: str,
    ) -> PaymentIntent:
        raise NotImplementedError

    async def _post_json(self, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(self.endpoint, json=payload)
                response.raise_for_status()
                data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise PaymentProviderError(
                f"Không kết nối được cổng thanh toán {self.code}.",
                code="payment_provider_unavailable",
            ) from exc
        if not isinstance(data, dict):
            raise PaymentProviderError("Cổng thanh toán trả về dữ liệu không hợp lệ.")
        return data


class VietQrProvider(PaymentProvider):
    code = "vietqr"

    def __init__(self, *, environment: str, timeout: float) -> None:
        super().__init__(
            environment=environment,
            endpoint="https://img.vietqr.io/image",
            timeout=timeout,
        )

    async def create_payment(
        self,
        *,
        order_code: str,
        amount_vnd: int,
        organization_id: str,
    ) -> PaymentIntent:
        bank = (settings.vietqr_bank_code or settings.sepay_bank_code).strip()
        account = (settings.vietqr_bank_account or settings.sepay_bank_account).strip()
        if not bank or not account:
            return PaymentIntent(
                provider=self.code,
                metadata={"environment": self.environment, "organization_id": organization_id},
            )
        account_name = settings.vietqr_account_name.strip()
        qr_url = (
            f"{self.endpoint}/{quote(bank)}-{quote(account)}-compact2.png"
            f"?amount={int(amount_vnd)}&addInfo={quote(order_code)}"
        )
        if account_name:
            qr_url += f"&accountName={quote(account_name)}"
        return PaymentIntent(
            provider=self.code,
            payment_url=qr_url,
            qr_code_url=qr_url,
            metadata={"environment": self.environment, "organization_id": organization_id},
        )


class MomoProvider(PaymentProvider):
    code = "momo"

    def __init__(self, *, environment: str, timeout: float) -> None:
        endpoint = (
            settings.momo_endpoint_production
            if environment == "production"
            else settings.momo_endpoint_sandbox
        )
        super().__init__(environment=environment, endpoint=endpoint, timeout=timeout)

    async def create_payment(
        self,
        *,
        order_code: str,
        amount_vnd: int,
        organization_id: str,
    ) -> PaymentIntent:
        required = {
            "partnerCode": settings.momo_partner_code.strip(),
            "accessKey": settings.momo_access_key.strip(),
            "secretKey": settings.momo_secret_key.strip(),
        }
        if not all(required.values()):
            raise PaymentProviderError(
                "Chưa cấu hình đủ key MoMo.",
                code="payment_provider_not_configured",
            )
        request_id = f"{order_code}-{int(time.time() * 1000)}"
        payload: dict[str, Any] = {
            "partnerCode": required["partnerCode"],
            "requestType": "captureWallet",
            "ipnUrl": settings.momo_ipn_url.strip(),
            "redirectUrl": settings.momo_redirect_url.strip(),
            "orderId": order_code,
            "amount": int(amount_vnd),
            "lang": "vi",
            "orderInfo": f"CovaVision {order_code}",
            "requestId": request_id,
            "extraData": "",
            "autoCapture": True,
            "orderGroupId": "",
            "accessKey": required["accessKey"],
        }
        payload["signature"] = build_momo_signature(payload, required["secretKey"])
        response = await self._post_json(payload)
        if int(response.get("resultCode", -1)) != 0:
            raise PaymentProviderError(
                str(response.get("message") or "MoMo không tạo được giao dịch."),
                code="payment_provider_rejected",
            )
        return PaymentIntent(
            provider=self.code,
            payment_url=str(response.get("payUrl") or "") or None,
            qr_code_url=str(response.get("qrCodeUrl") or "") or None,
            provider_transaction_id=str(response.get("requestId") or request_id),
            metadata={"environment": self.environment, "organization_id": organization_id},
        )


class ZaloPayProvider(PaymentProvider):
    code = "zalopay"

    def __init__(self, *, environment: str, timeout: float) -> None:
        endpoint = (
            settings.zalopay_endpoint_production
            if environment == "production"
            else settings.zalopay_endpoint_sandbox
        )
        super().__init__(environment=environment, endpoint=endpoint, timeout=timeout)

    async def create_payment(
        self,
        *,
        order_code: str,
        amount_vnd: int,
        organization_id: str,
    ) -> PaymentIntent:
        if not settings.zalopay_app_id or not settings.zalopay_key1.strip():
            raise PaymentProviderError(
                "Chưa cấu hình đủ key ZaloPay.",
                code="payment_provider_not_configured",
            )
        now = datetime.now(timezone.utc).astimezone()
        app_trans_id = f"{now.strftime('%y%m%d')}_{order_code}"
        app_time = int(time.time() * 1000)
        embed_data = json.dumps(
            {"redirecturl": settings.zalopay_redirect_url.strip()},
            separators=(",", ":"),
        )
        item = "[]"
        payload: dict[str, Any] = {
            "appid": int(settings.zalopay_app_id),
            "appuser": organization_id,
            "apptime": app_time,
            "amount": int(amount_vnd),
            "apptransid": app_trans_id,
            "embeddata": embed_data,
            "item": item,
            "description": f"CovaVision {order_code}",
            "bankcode": "",
            "callback_url": settings.zalopay_callback_url.strip(),
        }
        payload["mac"] = build_zalopay_mac(
            settings.zalopay_key1,
            app_id=payload["appid"],
            app_trans_id=app_trans_id,
            app_user=organization_id,
            amount=payload["amount"],
            app_time=app_time,
            embed_data=embed_data,
            item=item,
        )
        response = await self._post_json(payload)
        if int(response.get("return_code", 0)) != 1:
            raise PaymentProviderError(
                str(response.get("return_message") or "ZaloPay không tạo được giao dịch."),
                code="payment_provider_rejected",
            )
        return PaymentIntent(
            provider=self.code,
            payment_url=str(response.get("order_url") or "") or None,
            qr_code_url=str(response.get("qr_code") or "") or None,
            provider_transaction_id=str(response.get("zp_trans_token") or "") or None,
            metadata={
                "environment": self.environment,
                "organization_id": organization_id,
                "app_trans_id": app_trans_id,
            },
        )


def build_payment_provider(code: str) -> PaymentProvider:
    normalized = str(code or "").strip().lower()
    environment = str(settings.payment_environment or "sandbox").strip().lower()
    if environment not in {"sandbox", "production"}:
        environment = "sandbox"
    timeout = max(1.0, float(settings.payment_request_timeout_seconds))
    if normalized == "vietqr":
        return VietQrProvider(environment=environment, timeout=timeout)
    if normalized == "momo":
        return MomoProvider(environment=environment, timeout=timeout)
    if normalized == "zalopay":
        return ZaloPayProvider(environment=environment, timeout=timeout)
    raise PaymentProviderError("Phương thức thanh toán không được hỗ trợ.", code="unsupported_payment_method")
