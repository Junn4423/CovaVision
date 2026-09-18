import base64

from fastapi.testclient import TestClient

from app.db.repository import InMemoryRepository
from app.main import app, create_app
from app.recognition.service import RecognitionService


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
            "camera_options": {
                "rtspUrl": "rtsp://nested.internal/live",
                "host": "private-camera-host",
                "extra": {
                    "source_hint": "rtsp://192.168.20.15/live",
                    "private_ip": "192.168.20.15",
                },
                "target_fps": 15,
            },
        },
    )

    assert saved.status_code == 200
    public_camera = saved.json()["camera"]
    assert "connection_url" not in public_camera
    assert "password" not in public_camera
    assert "username" not in public_camera
    assert public_camera["camera_options"] == {"target_fps": 15}


def test_camera_stream_contract_requires_authentication() -> None:
    response = client.get("/api/v1/cameras/stream?camera_id=camera-1")
    assert response.status_code == 401


def test_camera_update_without_url_preserves_backend_rtsp_source() -> None:
    import asyncio

    local_repository = InMemoryRepository()
    asyncio.run(local_repository.save_camera({
        "id": "camera-preserve",
        "name": "Front camera",
        "camera_type": "rtsp",
        "connection_url": "rtsp://internal.example/live",
    }))
    updated = asyncio.run(local_repository.save_camera({
        "id": "camera-preserve",
        "name": "Front camera - updated",
        "camera_type": "rtsp",
        "camera_options": {"target_fps": 20},
    }))

    assert updated["connection_url"] == "rtsp://internal.example/live"
    assert updated["camera_options"] == {"target_fps": 20}


def test_recognize_endpoint_accepts_json_base64_and_records_attendance() -> None:
    class FakeFrame:
        shape = (120, 160, 3)

    class FakeRecognizer:
        class Engine:
            @staticmethod
            def detect_and_encode(_frame):
                return [{"bbox": [1, 2, 40, 50], "embedding": [1.0, 0.0], "det_score": 0.9}]

        engine = Engine()

        @staticmethod
        def _decode_image_bytes(_image_bytes):
            return FakeFrame()

    local_repository = InMemoryRepository()
    local_repository.seed_user("api.test", "test-password", role="ADMIN")
    import asyncio

    asyncio.run(local_repository.save_employee({
        "employee_id": "EMP-API",
        "name": "API User",
        "embedding": [1.0, 0.0],
    }))
    local_app = create_app(repository=local_repository)
    local_app.state.recognition_service = RecognitionService(
        local_repository,
        recognizer_factory=FakeRecognizer,
    )
    local_client = TestClient(local_app)
    token = local_client.post(
        "/api/v1/auth/login",
        json={"username": "api.test", "password": "test-password"},
    ).json()["access_token"]

    response = local_client.post(
        "/api/v1/attendance/recognize",
        headers={"Authorization": f"Bearer {token}"},
        json={"image_base64": base64.b64encode(b"fake-image").decode("ascii")},
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["record"]["employee_id"] == "EMP-API"


def test_admin_contracts_cover_accounts_settings_and_report_export() -> None:
    token = client.post(
        "/api/v1/auth/login",
        json={"username": "admin.test", "password": "test-password"},
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    account = client.post(
        "/api/v1/accounts",
        headers=headers,
        json={"username": "staff.contract", "password": "secret", "role": "STAFF"},
    )
    assert account.status_code == 200
    assert "password_hash" not in account.json()["account"]

    mobile_settings = client.post(
        "/api/v1/settings/mobile",
        headers=headers,
        json={"camera_id": "camera-1"},
    )
    assert mobile_settings.status_code == 200
    export = client.get("/api/v1/reports/attendance/export", headers=headers)
    assert export.status_code == 200
    assert "employee_id" in export.text
