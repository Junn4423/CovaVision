from __future__ import annotations

from fastapi.testclient import TestClient

from app.api.routes.billing import _build_payment_provider
from app.billing.payment_providers import (
    build_momo_signature,
    build_zalopay_mac,
)
from app.core.config import settings
from app.db.repository import InMemoryRepository
from app.main import create_app


def _admin_client(repository: InMemoryRepository) -> TestClient:
    repository.seed_user("owner@example.com", "strong-password", role="ADMIN")
    client = TestClient(create_app(repository=repository))
    token = client.post(
        "/api/v1/auth/login",
        json={"identifier": "owner@example.com", "password": "strong-password"},
    ).json()["access_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


def test_payment_methods_are_database_driven_and_active_flag_controls_visibility() -> None:
    repository = InMemoryRepository()
    client = _admin_client(repository)

    methods = client.get("/api/v1/billing/payment-methods")
    assert methods.status_code == 200
    assert {item["code"] for item in methods.json()["payment_methods"]} == {
        "momo",
        "zalopay",
        "vietqr",
    }

    repository.payment_methods["momo"]["active"] = 0
    methods = client.get("/api/v1/billing/payment-methods")
    assert {item["code"] for item in methods.json()["payment_methods"]} == {"zalopay", "vietqr"}

    checkout = client.post(
        "/api/v1/billing/checkout",
        json={"plan_code": "standard", "payment_method": "momo"},
    )
    assert checkout.status_code == 409


def test_vietqr_checkout_uses_sandbox_catalog_without_exposing_secrets(monkeypatch) -> None:
    monkeypatch.setattr(settings, "payment_environment", "sandbox")
    monkeypatch.setattr(settings, "vietqr_bank_code", "VCB")
    monkeypatch.setattr(settings, "vietqr_bank_account", "0123456789")
    monkeypatch.setattr(settings, "vietqr_account_name", "COVAVISION")

    repository = InMemoryRepository()
    client = _admin_client(repository)
    response = client.post(
        "/api/v1/billing/checkout",
        json={"plan_code": "standard", "payment_method": "vietqr"},
    )

    assert response.status_code == 200
    payment = response.json()["payment"]
    assert payment["provider"] == "vietqr"
    assert "vietqr.io" in payment["qr_code_url"]
    assert "secret" not in str(payment).lower()


def test_provider_signatures_are_deterministic() -> None:
    assert build_momo_signature(
        {
            "accessKey": "access",
            "amount": 550000,
            "extraData": "",
            "ipnUrl": "https://example.test/momo",
            "orderId": "CV123",
            "orderInfo": "CovaVision CV123",
            "partnerCode": "MOMO",
            "redirectUrl": "https://example.test/return",
            "requestId": "REQ123",
            "requestType": "captureWallet",
        },
        "secret",
    ) == "dc200afa254353a3dad616217d4ed20d317119b373faab2d9d31c8407771a1c1"
    assert build_zalopay_mac(
        "key1",
        app_id=2554,
        app_trans_id="260920_CV123",
        app_user="org-default",
        amount=550000,
        app_time=1727000000000,
        embed_data="{}",
        item="[]",
    ) == "b06d0d24ca8bb62d05130dab1d5f42c5f01725b5fa4324056cc1b95a322b2cf4"


def test_payment_provider_environment_selects_sandbox_endpoint(monkeypatch) -> None:
    monkeypatch.setattr(settings, "payment_environment", "sandbox")
    provider = _build_payment_provider("momo")
    assert provider.environment == "sandbox"
    assert "test-payment.momo.vn" in provider.endpoint

    monkeypatch.setattr(settings, "payment_environment", "production")
    provider = _build_payment_provider("momo")
    assert provider.environment == "production"
    assert "payment.momo.vn" in provider.endpoint
