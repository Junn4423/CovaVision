from fastapi.testclient import TestClient

from app.db.repository import InMemoryRepository
from app.main import create_app


def _token(client: TestClient, username: str) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "test-password"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_logout_revokes_the_access_token() -> None:
    repository = InMemoryRepository()
    repository.seed_user("session-user", "test-password", role="ADMIN")
    client = TestClient(create_app(repository=repository))
    token = _token(client, "session-user")
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401


def test_locking_an_account_revokes_existing_sessions() -> None:
    repository = InMemoryRepository()
    repository.seed_user("target-user", "test-password", role="STAFF")
    repository.seed_user("admin-user", "test-password", role="ADMIN")
    client = TestClient(create_app(repository=repository))

    target_token = _token(client, "target-user")
    admin_token = _token(client, "admin-user")
    account = next(item for item in repository.users.values() if item["username"] == "target-user")

    lock_response = client.post(
        f"/api/v1/accounts/{account['id']}/lock",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"is_locked": True},
    )
    assert lock_response.status_code == 200

    assert client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {target_token}"},
    ).status_code == 401
