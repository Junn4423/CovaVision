from __future__ import annotations

from fastapi.testclient import TestClient


def test_billing_catalog_summary_checkout_and_payment_status(
    client: TestClient,
    repository,
    admin_headers: dict[str, str],
    staff_headers: dict[str, str],
) -> None:
    plans = client.get("/api/v1/billing/plans")
    assert plans.status_code == 200
    assert {item["code"] for item in plans.json()["plans"]} >= {"trial", "standard", "pro", "business"}

    methods = client.get("/api/v1/billing/payment-methods")
    assert methods.status_code == 200
    assert {item["code"] for item in methods.json()["payment_methods"]} == {"momo", "zalopay", "vietqr"}
    assert client.get("/api/v1/billing/me", headers=admin_headers).status_code == 200

    staff_checkout = client.post(
        "/api/v1/billing/checkout",
        headers=staff_headers,
        json={"plan_code": "standard", "payment_method": "vietqr"},
    )
    assert staff_checkout.status_code == 403

    checkout = client.post(
        "/api/v1/billing/checkout",
        headers=admin_headers,
        json={"plan_code": "standard", "payment_method": "vietqr"},
    )
    assert checkout.status_code == 200
    payment = checkout.json()["payment"]
    assert payment["status"] == "PENDING"
    assert "provider_transaction_id" not in payment

    status = client.get(
        f"/api/v1/billing/payments/{payment['order_code'].lower()}",
        headers=admin_headers,
    )
    assert status.status_code == 200
    assert status.json()["payment"]["order_code"] == payment["order_code"]
    assert client.get("/api/v1/billing/payments/missing", headers=admin_headers).status_code == 404

    assert client.post(
        "/api/v1/billing/checkout",
        headers=admin_headers,
        json={"plan_code": "business", "payment_method": "vietqr"},
    ).status_code == 409
    assert client.post(
        "/api/v1/billing/checkout",
        headers=admin_headers,
        json={"plan_code": "does-not-exist", "payment_method": "vietqr"},
    ).status_code == 422

    repository.payment_methods["momo"]["active"] = 0
    assert "momo" not in {
        item["code"] for item in client.get("/api/v1/billing/payment-methods").json()["payment_methods"]
    }
    assert client.post(
        "/api/v1/billing/checkout",
        headers=admin_headers,
        json={"plan_code": "standard", "payment_method": "momo"},
    ).status_code == 409


def test_billing_webhooks_reject_unauthenticated_or_malformed_requests(
    client: TestClient,
) -> None:
    sepay = client.post(
        "/api/v1/billing/webhooks/sepay",
        json={
            "id": 1,
            "transferType": "in",
            "transferAmount": 1,
            "content": "CV12345678",
        },
    )
    assert sepay.status_code in {401, 404}

    momo = client.post(
        "/api/v1/billing/webhooks/momo",
        json={"orderId": "CV12345678", "amount": 1, "resultCode": 0, "signature": "bad"},
    )
    assert momo.status_code in {401, 503}

    zalopay = client.post(
        "/api/v1/billing/webhooks/zalopay",
        json={"data": "{}", "mac": "bad", "type": 1},
    )
    assert zalopay.status_code in {401, 503}
