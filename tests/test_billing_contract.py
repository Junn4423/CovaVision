from __future__ import annotations

from app.api.routes.auth import _verify_google_id_token
from app.billing.plans import list_public_plans
from app.db.repository import InMemoryRepository
from app.main import create_app
from fastapi import HTTPException
from fastapi.testclient import TestClient


def test_plan_catalog_matches_sales_contract() -> None:
    plans = {item["code"]: item for item in list_public_plans()}

    assert plans["trial"]["max_employees"] == 3
    assert plans["trial"]["max_face_templates"] == 3
    assert plans["standard"]["monthly_price_vnd"] == 550_000
    assert plans["pro"]["monthly_price_vnd"] == 1_950_000
    assert plans["vip"]["monthly_price_vnd"] == 4_990_000
    assert plans["business"]["contact_only"] is True


def test_email_registration_creates_trial_and_sepay_webhook_is_idempotent() -> None:
    repository = InMemoryRepository()
    client = TestClient(create_app(repository=repository))

    registered = client.post(
        "/api/v1/auth/register",
        json={
            "email": "owner@example.com",
            "password": "strong-password",
            "full_name": "Owner",
            "organization_name": "Example Co",
        },
    )
    assert registered.status_code == 200
    token = registered.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    billing = client.get("/api/v1/billing/me", headers=headers)
    assert billing.status_code == 200
    assert billing.json()["plan"]["code"] == "trial"

    checkout = client.post("/api/v1/billing/checkout", headers=headers, json={"plan_code": "standard"})
    assert checkout.status_code == 200
    payment = checkout.json()["payment"]
    assert payment["amount_vnd"] == 550_000

    webhook_payload = {
        "id": 12345,
        "code": payment["order_code"],
        "content": f"Thanh toan {payment['order_code']}",
        "transferType": "in",
        "transferAmount": 550000,
        "transactionDate": "2026-09-19T10:00:00+07:00",
    }
    webhook = client.post("/api/v1/billing/webhooks/sepay", json=webhook_payload)
    assert webhook.status_code == 200
    assert webhook.json() == {"success": True}
    retry = client.post("/api/v1/billing/webhooks/sepay", json=webhook_payload)
    assert retry.status_code == 200

    upgraded = client.get("/api/v1/billing/me", headers=headers)
    assert upgraded.json()["plan"]["code"] == "standard"
    assert len(repository.subscriptions) == 2


def test_business_checkout_requires_contact() -> None:
    repository = InMemoryRepository()
    repository.seed_user("owner@example.com", "strong-password", role="ADMIN")
    client = TestClient(create_app(repository=repository))
    token = client.post(
        "/api/v1/auth/login",
        json={"identifier": "owner@example.com", "password": "strong-password"},
    ).json()["access_token"]

    response = client.post(
        "/api/v1/billing/checkout",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan_code": "business"},
    )
    assert response.status_code == 409


def test_google_login_rejects_unconfigured_provider(monkeypatch) -> None:
    from app.api.routes import auth

    monkeypatch.setattr(auth.settings, "google_client_id", "")
    try:
        _verify_google_id_token("a" * 32)
    except HTTPException as exc:
        assert exc.status_code == 503
    else:
        raise AssertionError("unconfigured Google OAuth should not authenticate")
