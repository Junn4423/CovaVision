from __future__ import annotations

import pytest

from app.billing.payment_providers import (
    MomoProvider,
    PaymentProviderError,
    VietQrProvider,
    ZaloPayProvider,
    build_payment_provider,
)
from app.core.config import settings


@pytest.mark.asyncio
async def test_momo_provider_builds_signed_sandbox_intent(monkeypatch) -> None:
    for name, value in {
        "momo_partner_code": "MOMO",
        "momo_access_key": "access",
        "momo_secret_key": "secret",
        "momo_redirect_url": "https://example.test/return",
        "momo_ipn_url": "https://example.test/ipn",
    }.items():
        monkeypatch.setattr(settings, name, value)
    provider = MomoProvider(environment="sandbox", timeout=2)
    captured = {}

    async def fake_post(payload):
        captured.update(payload)
        return {"resultCode": 0, "payUrl": "https://momo.test/pay", "requestId": "provider-1"}

    monkeypatch.setattr(provider, "_post_json", fake_post)
    intent = await provider.create_payment(
        order_code="CVORDER123",
        amount_vnd=550000,
        organization_id="org-1",
    )

    assert provider.endpoint == settings.momo_endpoint_sandbox
    assert intent.payment_url == "https://momo.test/pay"
    assert captured["amount"] == 550000
    assert captured["signature"]
    assert intent.metadata["environment"] == "sandbox"


@pytest.mark.asyncio
async def test_zalopay_provider_builds_mac_and_rejects_provider_error(monkeypatch) -> None:
    monkeypatch.setattr(settings, "zalopay_app_id", 1234)
    monkeypatch.setattr(settings, "zalopay_key1", "key-one")
    monkeypatch.setattr(settings, "zalopay_redirect_url", "https://example.test/return")
    monkeypatch.setattr(settings, "zalopay_callback_url", "https://example.test/callback")
    provider = ZaloPayProvider(environment="production", timeout=2)
    captured = {}

    async def fake_rejected(payload):
        captured.update(payload)
        return {"return_code": 2, "return_message": "rejected"}

    monkeypatch.setattr(provider, "_post_json", fake_rejected)
    with pytest.raises(PaymentProviderError, match="rejected"):
        await provider.create_payment(
            order_code="CVORDER123",
            amount_vnd=100000,
            organization_id="org-1",
        )
    assert provider.endpoint == settings.zalopay_endpoint_production
    assert captured["mac"]


@pytest.mark.asyncio
async def test_vietqr_without_bank_configuration_is_safe_and_factory_rejects_unknown(monkeypatch) -> None:
    monkeypatch.setattr(settings, "vietqr_bank_code", "")
    monkeypatch.setattr(settings, "vietqr_bank_account", "")
    monkeypatch.setattr(settings, "sepay_bank_code", "")
    monkeypatch.setattr(settings, "sepay_bank_account", "")
    intent = await VietQrProvider(environment="sandbox", timeout=2).create_payment(
        order_code="CVORDER123",
        amount_vnd=100000,
        organization_id="org-1",
    )
    assert intent.payment_url is None
    assert intent.qr_code_url is None

    with pytest.raises(PaymentProviderError, match="không được hỗ trợ"):
        build_payment_provider("not-a-provider")
