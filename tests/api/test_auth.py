from __future__ import annotations

from fastapi.testclient import TestClient


def test_register_creates_trial_session_and_public_user(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "owner@example.com",
            "password": "secure-password",
            "full_name": "Owner",
            "organization_name": "Acme",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["user"]["username"] == "owner@example.com"
    assert "password_hash" not in body["user"]
    assert body["access_token"]

    billing = client.get(
        "/api/v1/billing/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert billing.status_code == 200
    assert billing.json()["subscription"]["status"] == "TRIALING"


def test_register_rejects_invalid_and_duplicate_email(client: TestClient) -> None:
    first = client.post(
        "/api/v1/auth/register",
        json={"email": "duplicate@example.com", "password": "secure-password"},
    )
    assert first.status_code == 200

    duplicate = client.post(
        "/api/v1/auth/register",
        json={"email": "DUPLICATE@example.com", "password": "secure-password"},
    )
    assert duplicate.status_code == 409

    invalid = client.post(
        "/api/v1/auth/register",
        json={"email": "not-an-email", "password": "secure-password"},
    )
    assert invalid.status_code == 422


def test_login_accepts_identifier_and_rejects_wrong_credentials(
    client: TestClient,
) -> None:
    by_identifier = client.post(
        "/api/v1/auth/login",
        json={"identifier": "admin.test", "password": "test-password"},
    )
    assert by_identifier.status_code == 200

    wrong_password = client.post(
        "/api/v1/auth/login",
        json={"username": "admin.test", "password": "wrong-password"},
    )
    assert wrong_password.status_code == 401

    missing_identifier = client.post(
        "/api/v1/auth/login",
        json={"password": "test-password"},
    )
    assert missing_identifier.status_code == 422


def test_google_login_issues_a_normal_session(monkeypatch, client: TestClient) -> None:
    monkeypatch.setattr(
        "app.api.routes.auth._verify_google_id_token",
        lambda _token: {
            "email": "google@example.com",
            "subject": "google-subject",
            "name": "Google User",
        },
    )

    response = client.post(
        "/api/v1/auth/google",
        json={"id_token": "x" * 20},
    )

    assert response.status_code == 200
    assert response.json()["user"]["username"] == "google@example.com"


def test_me_requires_a_live_bearer_session_and_logout_revokes_it(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    me = client.get("/api/v1/auth/me", headers=admin_headers)
    assert me.status_code == 200
    assert me.json()["authenticated"] is True
    assert me.json()["is_admin"] is True

    logout = client.post("/api/v1/auth/logout", headers=admin_headers)
    assert logout.status_code == 200
    assert client.get("/api/v1/auth/me", headers=admin_headers).status_code == 401
    assert client.get("/api/v1/auth/me").status_code == 401
