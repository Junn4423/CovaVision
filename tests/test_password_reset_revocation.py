from fastapi.testclient import TestClient

from app.db.repository import InMemoryRepository
from app.main import create_app


def _token(client: TestClient, username: str, password = "test-password") -> str:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_password_reset_revokes_existing_sessions_and_is_audited() -> None:
    repository = InMemoryRepository()
    repository.seed_user("reset-admin", "test-password", role="ADMIN")
    repository.seed_user("reset-target", "test-password", role="STAFF")
    client = TestClient(create_app(repository=repository))
    admin_headers = {"Authorization": f"Bearer {_token(client, 'reset-admin')}"}
    target_token = _token(client, "reset-target")
    target_headers = {"Authorization": f"Bearer {target_token}"}
    target = next(item for item in repository.users.values() if item["username"] == "reset-target")

    response = client.post(
        f"/api/v1/accounts/{target['id']}/password",
        headers=admin_headers,
        json={"password": "new-password"},
    )
    assert response.status_code == 200
    assert client.get("/api/v1/auth/me", headers=target_headers).status_code == 401
    assert client.post(
        "/api/v1/auth/login",
        json={"username": "reset-target", "password": "test-password"},
    ).status_code == 401
    assert _token(client, "reset-target", "new-password")
    assert repository.audit_logs[0]["action"] == "account.password_reset"
