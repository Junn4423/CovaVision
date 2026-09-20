from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.billing.payment_providers import (
    build_momo_callback_signature,
    build_zalopay_callback_mac,
)
from app.core.config import settings
from app.db.repository import InMemoryRepository
from app.main import create_app


def test_momo_callback_verifies_signature_and_activates_subscription(monkeypatch) -> None:
    monkeypatch.setattr(settings, "momo_secret_key", "momo-secret")
    repository = InMemoryRepository()
    payment = asyncio.run(
        repository.create_payment(
            repository.organization_id,
            "standard",
            "CVMOMOCALLBACK",
            datetime.now(timezone.utc) + timedelta(minutes=10),
            "momo",
        )
    )
    payload = {
        "partnerCode": "MOMO",
        "orderId": payment["order_code"],
        "requestId": "REQ-MOMO-1",
        "amount": payment["amount_vnd"],
        "orderInfo": "CovaVision",
        "orderType": "momo_wallet",
        "transId": "TRANS-MOMO-1",
        "resultCode": 0,
        "message": "Successful.",
        "payType": "qr",
        "responseTime": 1727000000000,
        "extraData": "",
    }
    payload["signature"] = build_momo_callback_signature(payload, settings.momo_secret_key)

    client = TestClient(create_app(repository=repository))
    response = client.post("/api/v1/billing/webhooks/momo", json=payload)

    assert response.status_code == 200
    assert response.json() == {"success": True}
    assert repository.payments[payment["order_code"]]["status"] == "PAID"
    assert repository.subscriptions[-1]["provider"] == "momo"


def test_zalopay_callback_rejects_tampered_mac(monkeypatch) -> None:
    monkeypatch.setattr(settings, "zalopay_key2", "zalo-key2")
    repository = InMemoryRepository()
    payment = asyncio.run(
        repository.create_payment(
            repository.organization_id,
            "standard",
            "CVZALOCALLBACK",
            datetime.now(timezone.utc) + timedelta(minutes=10),
            "zalopay",
        )
    )
    data = json.dumps(
        {
            "apptransid": f"260920_{payment['order_code']}",
            "zptransid": "ZP-1",
            "amount": payment["amount_vnd"],
        },
        separators=(",", ":"),
    )
    payload = {"data": data, "mac": "tampered", "type": 1}

    client = TestClient(create_app(repository=repository))
    response = client.post("/api/v1/billing/webhooks/zalopay", json=payload)

    assert response.status_code == 401
    assert repository.payments[payment["order_code"]]["status"] == "PENDING"


def test_zalopay_callback_is_idempotent(monkeypatch) -> None:
    monkeypatch.setattr(settings, "zalopay_key2", "zalo-key2")
    repository = InMemoryRepository()
    payment = asyncio.run(
        repository.create_payment(
            repository.organization_id,
            "standard",
            "CVZALOIDEMPOTENT",
            datetime.now(timezone.utc) + timedelta(minutes=10),
            "zalopay",
        )
    )
    data = json.dumps(
        {
            "apptransid": f"260920_{payment['order_code']}",
            "zptransid": "ZP-IDEMPOTENT",
            "amount": payment["amount_vnd"],
        },
        separators=(",", ":"),
    )
    payload = {
        "data": data,
        "mac": build_zalopay_callback_mac(settings.zalopay_key2, data),
        "type": 1,
    }

    client = TestClient(create_app(repository=repository))
    assert client.post("/api/v1/billing/webhooks/zalopay", json=payload).status_code == 200
    assert client.post("/api/v1/billing/webhooks/zalopay", json=payload).status_code == 200
    assert len(repository.subscriptions) == 1
