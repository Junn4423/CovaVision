from __future__ import annotations

from fastapi.testclient import TestClient


def test_admin_can_list_create_reset_and_lock_accounts(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    created = client.post(
        "/api/v1/accounts",
        headers=admin_headers,
        json={"username": "operator.test", "password": "old-password", "role": "STAFF"},
    )
    assert created.status_code == 200
    account = created.json()["account"]
    assert account["username"] == "operator.test"
    assert "password_hash" not in account

    listed = client.get("/api/v1/accounts", headers=admin_headers)
    assert listed.status_code == 200
    assert {item["username"] for item in listed.json()["accounts"]} >= {
        "admin.test",
        "operator.test",
    }

    reset = client.post(
        f"/api/v1/accounts/{account['id']}/password",
        headers=admin_headers,
        json={"password": "new-password"},
    )
    assert reset.status_code == 200

    locked = client.post(
        f"/api/v1/accounts/{account['id']}/lock",
        headers=admin_headers,
        json={"is_locked": True},
    )
    assert locked.status_code == 200
    assert locked.json()["account"]["is_active"] is False

    assert client.post(
        "/api/v1/auth/login",
        json={"username": "operator.test", "password": "new-password"},
    ).status_code == 401


def test_account_admin_boundaries_and_validation(
    client: TestClient,
    admin_headers: dict[str, str],
    staff_headers: dict[str, str],
) -> None:
    assert client.get("/api/v1/accounts", headers=staff_headers).status_code == 403
    assert client.post(
        "/api/v1/accounts",
        headers=admin_headers,
        json={"role": "STAFF", "password": "secret"},
    ).status_code == 422

    missing_password = client.post(
        "/api/v1/accounts/missing/password",
        headers=admin_headers,
        json={},
    )
    assert missing_password.status_code == 422

    too_short = client.post(
        "/api/v1/accounts/missing/password",
        headers=admin_headers,
        json={"password": "short"},
    )
    assert too_short.status_code == 422

    assert client.post(
        "/api/v1/accounts/missing/password",
        headers=admin_headers,
        json={"password": "long-enough-password"},
    ).status_code == 404
    assert client.post(
        "/api/v1/accounts/missing/lock",
        headers=admin_headers,
        json={"is_locked": True},
    ).status_code == 404

    assert client.post(
        "/api/v1/accounts",
        headers=staff_headers,
        json={"username": "forbidden", "password": "long-enough-password"},
    ).status_code == 403
