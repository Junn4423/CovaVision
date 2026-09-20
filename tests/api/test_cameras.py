from __future__ import annotations

from fastapi.testclient import TestClient


class FakeCameraManager:
    def __init__(self) -> None:
        self.started: list[str] = []
        self.stopped: list[str | None] = []

    async def start(self, camera_id: str, _camera: dict) -> dict:
        self.started.append(camera_id)
        return {"success": True, "camera_id": camera_id, "status": "running"}

    def stop(self, camera_id: str | None = None) -> dict:
        self.stopped.append(camera_id)
        return {"success": True, "stopped": 1 if camera_id else 0}

    def status(self, camera_id: str | None = None) -> dict:
        return {
            "running": bool(camera_id and camera_id in self.started),
            "camera_id": camera_id,
            "fps": 15,
            "has_frame": True,
            "error": "",
            "mode": "test",
        }

    def snapshot(self, _camera_id: str | None = None) -> bytes:
        return b"\xff\xd8fake\xff\xd9"

    def is_running(self, camera_id: str | None = None) -> bool:
        return bool(camera_id and camera_id in self.started)

    def iter_mjpeg(self, _camera_id: str | None = None):
        yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\nframe\r\n"


class FakeDiscovery:
    def discover(self, *_args, **_kwargs):
        return [{
            "id": "candidate-1",
            "ip": "192.168.1.20",
            "port": 80,
            "name": "Warehouse",
            "brand": "TestCam",
            "manufacturer": "TestCam",
            "discovery_method": "onvif",
        }]

    def resolve_candidate(self, candidate_id, **kwargs):
        assert candidate_id == "candidate-1"
        assert kwargs["username"] == "admin"
        return {
            "connection_url": "rtsp://admin:secret@192.168.1.20/live",
            "username": "admin",
            "password": "secret",
            "camera_type": "rtsp",
            "name": "Warehouse",
        }


def test_camera_lifecycle_routes_are_authenticated_and_sanitized(
    test_app,
    client: TestClient,
    admin_headers: dict[str, str],
    monkeypatch,
) -> None:
    manager = FakeCameraManager()
    test_app.state.camera_manager = manager
    monkeypatch.setattr(
        "app.api.routes.cameras.speak_to_camera",
        lambda _camera, _payload: {"success": True, "message": "spoken"},
    )

    created = client.post(
        "/api/v1/cameras",
        headers=admin_headers,
        json={
            "name": "Front door",
            "camera_type": "rtsp",
            "connection_url": "rtsp://user:password@10.0.0.8/live",
            "username": "user",
            "password": "password",
        },
    )
    assert created.status_code == 200
    camera_id = created.json()["camera"]["id"]
    assert "connection_url" not in created.text
    assert "10.0.0.8" not in created.text

    listed = client.get("/api/v1/cameras", headers=admin_headers)
    assert listed.status_code == 200
    assert listed.json()["cameras"][0]["id"] == camera_id

    started = client.post(
        "/api/v1/cameras/start",
        headers=admin_headers,
        json={"camera_id": camera_id},
    )
    assert started.status_code == 200
    assert manager.started == [camera_id]

    status = client.get(
        f"/api/v1/cameras/status?camera_id={camera_id}",
        headers=admin_headers,
    )
    assert status.status_code == 200
    assert status.json()["running"] is True

    snapshot = client.get(
        f"/api/v1/cameras/snapshot?camera_id={camera_id}",
        headers=admin_headers,
    )
    assert snapshot.status_code == 200
    assert snapshot.json()["image_base64"].startswith("data:image/jpeg;base64,")

    stream = client.get(
        f"/api/v1/cameras/stream?camera_id={camera_id}",
        headers=admin_headers,
    )
    assert stream.status_code == 200
    assert "multipart/x-mixed-replace" in stream.headers["content-type"]

    spoken = client.post(
        f"/api/v1/cameras/{camera_id}/speak",
        headers=admin_headers,
        json={"text": "Xin chao"},
    )
    assert spoken.status_code == 200
    assert spoken.json()["message"] == "spoken"

    stopped = client.post(
        "/api/v1/cameras/stop",
        headers=admin_headers,
        json={"camera_id": camera_id},
    )
    assert stopped.status_code == 200
    deleted = client.delete(f"/api/v1/cameras/{camera_id}", headers=admin_headers)
    assert deleted.status_code == 200
    assert client.get(f"/api/v1/cameras/status?camera_id={camera_id}", headers=admin_headers).status_code == 404


def test_camera_discovery_and_edge_cases(
    test_app,
    client: TestClient,
    admin_headers: dict[str, str],
    staff_headers: dict[str, str],
) -> None:
    test_app.state.camera_discovery = FakeDiscovery()

    assert client.post("/api/v1/cameras/discover", headers=staff_headers, json={}).status_code == 403
    discovered = client.post(
        "/api/v1/cameras/discover",
        headers=admin_headers,
        json={"timeout_ms": 100, "enable_subnet_fallback": True},
    )
    assert discovered.status_code == 200
    assert discovered.json()["cameras"][0]["id"] == "candidate-1"
    assert "192.168.1.20" not in discovered.text

    saved = client.post(
        "/api/v1/cameras",
        headers=admin_headers,
        json={"discovery_id": "candidate-1", "username": "admin", "password": "secret"},
    )
    assert saved.status_code == 200
    assert client.post("/api/v1/cameras", headers=admin_headers, json={}).status_code == 422
    assert client.post(
        "/api/v1/cameras/start",
        headers=admin_headers,
        json={},
    ).status_code == 422
    assert client.post(
        "/api/v1/cameras/start",
        headers=admin_headers,
        json={"camera_id": "missing"},
    ).status_code == 404
