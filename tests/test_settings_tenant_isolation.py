from fastapi.testclient import TestClient

from app.db.repository import InMemoryRepository
from app.main import create_app


def _login(client: TestClient, username: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "test-password"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_settings_are_isolated_between_organizations() -> None:
    repository = InMemoryRepository()
    repository.seed_user(
        "tenant-a",
        "test-password",
        role="ADMIN",
        organization_id="org-a",
    )
    repository.seed_user(
        "tenant-b",
        "test-password",
        role="ADMIN",
        organization_id="org-b",
    )
    client = TestClient(create_app(repository=repository))

    headers_a = _login(client, "tenant-a")
    headers_b = _login(client, "tenant-b")

    assert client.post(
        "/api/v1/settings",
        headers=headers_a,
        json={"attendance_settings": {"shift_start_time": "08:00"}},
    ).status_code == 200
    assert client.post(
        "/api/v1/settings",
        headers=headers_b,
        json={"attendance_settings": {"shift_start_time": "09:00"}},
    ).status_code == 200

    settings_a = client.get("/api/v1/settings", headers=headers_a)
    settings_b = client.get("/api/v1/settings", headers=headers_b)

    assert settings_a.status_code == 200
    assert settings_b.status_code == 200
    assert settings_a.json()["settings"]["attendance_settings"]["shift_start_time"] == "08:00"
    assert settings_b.json()["settings"]["attendance_settings"]["shift_start_time"] == "09:00"
