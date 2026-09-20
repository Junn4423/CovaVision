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


def test_manual_attendance_cannot_forge_a_record_without_an_image() -> None:
    headers = {"Authorization": f"Bearer {client.post('/api/v1/auth/login', json={'username': 'admin.test', 'password': 'test-password'}).json()['access_token']}"}
    response = client.post(
        "/api/v1/attendance",
        headers=headers,
        json={"employee_id": "EMP-001"},
    )

    assert response.status_code == 405


def test_camera_speaker_route_uses_backend_adapter(monkeypatch) -> None:
    import asyncio

    local_repository = InMemoryRepository()
    local_repository.seed_user("speaker.test", "test-password", role="ADMIN")
    camera = asyncio.run(local_repository.save_camera({
        "id": "speaker-camera",
        "name": "Speaker camera",
        "camera_type": "rtsp",
        "connection_url": "rtsp://internal.example/live",
    }))
    local_app = create_app(repository=local_repository)
    local_client = TestClient(local_app)
    token = local_client.post(
        "/api/v1/auth/login",
        json={"username": "speaker.test", "password": "test-password"},
    ).json()["access_token"]

    monkeypatch.setattr(
        "app.api.routes.cameras.speak_to_camera",
        lambda _camera, _payload: {"success": True, "message": "speaker-ok"},
    )
    response = local_client.post(
        f"/api/v1/cameras/{camera['id']}/speak",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "test", "volume": 50},
    )

    assert response.status_code == 200
    assert response.json() == {"success": True, "message": "speaker-ok"}


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
        "connection_url": "",
        "camera_options": {"target_fps": 20},
    }))

    assert updated["connection_url"] == "rtsp://internal.example/live"
    assert updated["camera_options"] == {"target_fps": 20}


def test_prisma_attendance_payload_uses_scalar_relations_and_json_metadata() -> None:
    import asyncio
    from datetime import datetime, timezone
    from types import SimpleNamespace

    from app.db.repository import PrismaRepository

    class FakeEmployeeActions:
        async def find_first(self, **_kwargs):
            return SimpleNamespace(id="employee-db-id")

    class FakeCameraActions:
        async def find_unique(self, **_kwargs):
            return SimpleNamespace(id="camera-db-id")

    class FakeAttendanceActions:
        def __init__(self):
            self.data = None

        async def create(self, *, data, include):
            self.data = data
            return SimpleNamespace(
                id="attendance-db-id",
                employeeId="employee-db-id",
                cameraId="camera-db-id",
                type="AUTO",
                status="ACCEPTED",
                capturedAt=datetime.now(timezone.utc),
                confidence=None,
                employee=SimpleNamespace(employeeCode="EMP-001", fullName="Test User"),
                camera=SimpleNamespace(id="camera-db-id", name="Test camera"),
            )

    class FakeClient:
        def __init__(self):
            self.employee = FakeEmployeeActions()
            self.camera = FakeCameraActions()
            self.attendancerecord = FakeAttendanceActions()

    repository = PrismaRepository.__new__(PrismaRepository)
    repository.client = FakeClient()
    repository._connected = True

    async def default_organization():
        return SimpleNamespace(id="organization-db-id")

    repository._default_organization = default_organization
    result = asyncio.run(repository.create_attendance({
        "employee_id": "EMP-001",
        "camera_id": "camera-1",
        "captured_at": "2026-09-19T00:00:00+00:00",
        "confidence": 0.95,
    }))

    data = repository.client.attendancerecord.data
    assert data["organizationId"] == "organization-db-id"
    assert data["employeeId"] == "employee-db-id"
    assert data["cameraId"] == "camera-db-id"
    assert "organization" not in data
    assert "employee" not in data
    assert "camera" not in data
    assert data["metadata"] is not None
    assert result["attendance_type"] == "auto"


def test_camera_discovery_returns_opaque_candidate_and_resolves_on_backend() -> None:
    class FakeDiscovery:
        def discover(self, *_args, **_kwargs):
            return [{
                "id": "discovery-test-1",
                "ip": "192.168.1.99",
                "port": 80,
                "name": "Warehouse Camera",
                "model": "IPC-A",
                "brand": "Imou",
                "manufacturer": "Imou",
                "discovery_method": "onvif",
            }]

        def resolve_candidate(self, candidate_id, username="admin", password="", preset="main", custom_url=""):
            assert candidate_id == "discovery-test-1"
            assert username == "admin"
            assert password == "camera-secret"
            assert preset == "sub"
            assert not custom_url
            return {
                "connection_url": "rtsp://admin:camera-secret@192.168.1.99:554/cam/realmonitor?channel=1&subtype=1",
                "username": username,
                "password": password,
                "name": "Warehouse Camera",
                "camera_type": "rtsp",
            }

    import asyncio

    local_repository = InMemoryRepository()
    local_repository.seed_user("discovery.test", "test-password", role="ADMIN")
    local_app = create_app(repository=local_repository, camera_discovery=FakeDiscovery())
    local_client = TestClient(local_app)
    token = local_client.post(
        "/api/v1/auth/login",
        json={"username": "discovery.test", "password": "test-password"},
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    discovered = local_client.post(
        "/api/v1/cameras/discover",
        headers=headers,
        json={"timeout_ms": 3500},
    )
    assert discovered.status_code == 200
    public_candidate = discovered.json()["cameras"][0]
    assert public_candidate["id"] == "discovery-test-1"
    assert "ip" not in public_candidate
    assert "192.168.1.99" not in discovered.text

    saved = local_client.post(
        "/api/v1/cameras",
        headers=headers,
        json={
            "discovery_id": "discovery-test-1",
            "username": "admin",
            "password": "camera-secret",
            "stream_preset": "sub",
        },
    )
    assert saved.status_code == 200
    assert "192.168.1.99" not in saved.text
    stored = asyncio.run(local_repository.get_camera(saved.json()["camera"]["id"]))
    assert stored["connection_url"].endswith("subtype=1")


def test_camera_discovery_is_admin_only() -> None:
    local_repository = InMemoryRepository()
    local_repository.seed_user("staff.discovery", "test-password", role="STAFF")
    local_app = create_app(repository=local_repository)
    local_client = TestClient(local_app)
    token = local_client.post(
        "/api/v1/auth/login",
        json={"username": "staff.discovery", "password": "test-password"},
    ).json()["access_token"]

    response = local_client.post(
        "/api/v1/cameras/discover",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert response.status_code == 403


def test_employee_image_is_read_back_through_backend() -> None:
    import asyncio

    local_repository = InMemoryRepository()
    local_repository.seed_user("image.test", "test-password", role="ADMIN")
    asyncio.run(local_repository.save_employee({"employee_id": "EMP-IMAGE", "name": "Image User"}))
    asyncio.run(local_repository.save_employee_face("EMP-IMAGE", [1.0, 0.0], b"fake-jpeg"))
    local_app = create_app(repository=local_repository)
    local_client = TestClient(local_app)
    token = local_client.post(
        "/api/v1/auth/login",
        json={"username": "image.test", "password": "test-password"},
    ).json()["access_token"]

    response = local_client.get(
        "/api/v1/employees/EMP-IMAGE/image",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["image_base64"].startswith("data:image/jpeg;base64,")


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
    assert response.json()["record"]["attendance_type"] == "check_in"


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


def test_attendance_report_supports_bounded_pagination() -> None:
    import asyncio

    local_repository = InMemoryRepository()
    local_repository.seed_user("page.test", "test-password", role="ADMIN")
    for index in range(3):
        asyncio.run(local_repository.create_attendance({
            "id": f"PAGE-{index}",
            "employee_id": f"EMP-{index}",
            "captured_at": f"2026-09-20T00:0{index}:00+00:00",
            "status": "accepted",
        }))
    local_client = TestClient(create_app(repository=local_repository))
    token = local_client.post(
        "/api/v1/auth/login",
        json={"username": "page.test", "password": "test-password"},
    ).json()["access_token"]

    response = local_client.get(
        "/api/v1/reports/attendance?limit=1&offset=1",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["records"]] == ["PAGE-1"]
    assert response.json()["pagination"] == {"limit": 1, "offset": 1, "has_more": True}


def test_register_face_existing_employee() -> None:
    class FakeRecognizer:
        @staticmethod
        def encode_face_from_bytes(_bytes):
            return [0.1] * 512, None

    local_repository = InMemoryRepository()
    local_repository.seed_user("reg.test", "test-password", role="ADMIN")
    import asyncio
    asyncio.run(local_repository.save_employee({"employee_id": "EMP-REG-1", "name": "Test User", "department": "IT"}))
    local_app = create_app(repository=local_repository)
    local_app.state.recognition_service = RecognitionService(
        local_repository,
        recognizer_factory=FakeRecognizer,
    )
    local_client = TestClient(local_app)
    token = local_client.post(
        "/api/v1/auth/login",
        json={"username": "reg.test", "password": "test-password"},
    ).json()["access_token"]

    resp = local_client.post(
        "/api/v1/employees/face",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "employee_id": "EMP-REG-1",
            "image_base64": base64.b64encode(b"fake-face-image").decode("ascii"),
        },
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert resp.json()["employee"]["employee_id"] == "EMP-REG-1"
    assert resp.json()["employee"]["has_face"] is True


def test_register_face_new_employee_auto_creates() -> None:
    class FakeRecognizer:
        @staticmethod
        def encode_face_from_bytes(_bytes):
            return [0.2] * 512, None

    local_repository = InMemoryRepository()
    local_repository.seed_user("newreg.test", "test-password", role="ADMIN")
    local_app = create_app(repository=local_repository)
    local_app.state.recognition_service = RecognitionService(
        local_repository,
        recognizer_factory=FakeRecognizer,
    )
    local_client = TestClient(local_app)
    token = local_client.post(
        "/api/v1/auth/login",
        json={"username": "newreg.test", "password": "test-password"},
    ).json()["access_token"]

    resp = local_client.post(
        "/api/v1/employees/face",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "employee_id": "NV001",
            "name": "Lương Ngọc Chung",
            "department": "IT",
            "position": "nhân viên",
            "image_base64": base64.b64encode(b"fake-face-image").decode("ascii"),
        },
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert resp.json()["employee"]["employee_id"] == "NV001"
    assert resp.json()["employee"]["name"] == "Lương Ngọc Chung"
    assert resp.json()["employee"]["has_face"] is True


def test_tts_audio_endpoint(monkeypatch) -> None:
    monkeypatch.setattr("app.api.routes.tts._get_google_tts_bytes", lambda _text, _lang: b"fake-mp3-bytes")
    resp = client.get("/api/v1/tts?text=Xin+chao")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/mpeg"
    assert resp.content == b"fake-mp3-bytes"


def test_employee_avatar_endpoint() -> None:
    local_repository = InMemoryRepository()
    local_repository.seed_user("avatar.test", "test-password", role="ADMIN")
    local_app = create_app(repository=local_repository)
    local_client = TestClient(local_app)

    # 404 for non-existent employee
    resp = local_client.get("/api/v1/employees/NOT-EXIST/avatar")
    assert resp.status_code == 404

    # Seed employee with face
    import asyncio
    asyncio.run(local_repository.save_employee({"employee_id": "AVATAR-01", "name": "Avatar User"}))
    asyncio.run(local_repository.save_employee_face("AVATAR-01", [0.1] * 512, image_bytes=b"\xff\xd8\xff\xe0testjpeg"))

    # Fetch avatar directly without auth token
    resp2 = local_client.get("/api/v1/employees/AVATAR-01/avatar")
    assert resp2.status_code == 200
    assert resp2.headers["content-type"] == "image/jpeg"
    assert resp2.content == b"\xff\xd8\xff\xe0testjpeg"


def test_attendance_today_endpoint() -> None:
    local_repository = InMemoryRepository()
    local_repository.seed_user("att.today", "test-password", role="ADMIN")
    local_app = create_app(repository=local_repository)
    local_client = TestClient(local_app)
    token = local_client.post(
        "/api/v1/auth/login",
        json={"username": "att.today", "password": "test-password"},
    ).json()["access_token"]

    resp = local_client.get(
        "/api/v1/attendance/today",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert "records" in resp.json()


