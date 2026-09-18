from fastapi.testclient import TestClient

from app.db.repository import InMemoryRepository
from app.main import app


repository = InMemoryRepository()
repository.seed_user("admin.test", "test-password", role="ADMIN")
app.state.repository = repository
client = TestClient(app)


def test_login_and_me_use_bearer_token() -> None:
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "admin.test", "password": "test-password"},
    )

    assert login.status_code == 200
    token = login.json()["access_token"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert me.status_code == 200
    assert me.json()["user"]["username"] == "admin.test"


def test_camera_public_contract_never_returns_rtsp_secret() -> None:
    headers = {"Authorization": f"Bearer {client.post('/api/v1/auth/login', json={'username': 'admin.test', 'password': 'test-password'}).json()['access_token']}"}
    saved = client.post(
        "/api/v1/cameras",
        headers=headers,
        json={
            "name": "Front camera",
            "camera_type": "rtsp",
            "connection_url": "rtsp://internal.example/live",
            "username": "camera-user",
            "password": "camera-secret",
        },
    )

    assert saved.status_code == 200
    public_camera = saved.json()["camera"]
    assert "connection_url" not in public_camera
    assert "password" not in public_camera
    assert "username" not in public_camera

