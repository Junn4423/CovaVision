from fastapi.testclient import TestClient

from app.db.repository import InMemoryRepository
from app.main import create_app


def _login(client: TestClient, username: str) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "test-password"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_account_lock_is_audited_and_admin_can_read_the_tenant_log() -> None:
    repository = InMemoryRepository()
    repository.seed_user("audit-admin", "test-password", role="ADMIN")
    repository.seed_user("audit-staff", "test-password", role="STAFF")
    client = TestClient(create_app(repository=repository))
    admin_headers = {"Authorization": f"Bearer {_login(client, 'audit-admin')}"}
    staff_headers = {"Authorization": f"Bearer {_login(client, 'audit-staff')}"}
    target = next(item for item in repository.users.values() if item["username"] == "audit-staff")

    assert client.get("/api/v1/audit/logs", headers=staff_headers).status_code == 403

    response = client.post(
        f"/api/v1/accounts/{target['id']}/lock",
        headers=admin_headers,
        json={"is_locked": True},
    )
    assert response.status_code == 200

    logs = client.get("/api/v1/audit/logs", headers=admin_headers)
    assert logs.status_code == 200
    assert logs.json()["logs"][0]["action"] == "account.locked"
    assert logs.json()["logs"][0]["entity_id"] == target["id"]
