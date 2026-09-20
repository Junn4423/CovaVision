from __future__ import annotations

from fastapi.testclient import TestClient


def test_settings_location_mobile_storage_and_attendance_contracts(
    client: TestClient,
    admin_headers: dict[str, str],
    staff_headers: dict[str, str],
) -> None:
    initial = client.get("/api/v1/settings", headers=staff_headers)
    assert initial.status_code == 200
    assert initial.json()["settings"] == {}

    saved = client.post(
        "/api/v1/settings",
        headers=admin_headers,
        json={"attendance_settings": {"cooldown_seconds": 30}, "theme": "dark"},
    )
    assert saved.status_code == 200
    assert saved.json()["settings"]["theme"] == "dark"
    assert client.post(
        "/api/v1/settings",
        headers=staff_headers,
        json={"theme": "light"},
    ).status_code == 403

    attendance = client.get("/api/v1/settings/attendance", headers=staff_headers)
    assert attendance.status_code == 200
    assert attendance.json()["settings"]["attendance_settings"] == {"cooldown_seconds": 30}

    mobile_payload = {"camera_id": "camera-1", "detect_fps": 12}
    mobile_saved = client.post(
        "/api/v1/settings/mobile",
        headers=admin_headers,
        json=mobile_payload,
    )
    assert mobile_saved.status_code == 200
    assert mobile_saved.json()["settings"]["mobile_config"] == mobile_payload
    assert client.get("/api/v1/settings/mobile", headers=staff_headers).json()["settings"]["mobile_config"] == mobile_payload
    assert client.post(
        "/api/v1/settings/mobile",
        headers=staff_headers,
        json=mobile_payload,
    ).status_code == 403

    location = {"name": "Head office", "latitude": 10.1, "longitude": 106.2}
    saved_location = client.post("/api/v1/location", headers=admin_headers, json=location)
    assert saved_location.status_code == 200
    assert saved_location.json()["location"] == location
    assert client.get("/api/v1/location", headers=staff_headers).json()["location"] == location
    assert client.post("/api/v1/location", headers=staff_headers, json=location).status_code == 403

    storage = client.get("/api/v1/system/storage", headers=staff_headers)
    assert storage.status_code == 200
    assert storage.json()["storage"] == {"backend": "mysql", "runtime": "covavision"}


def test_settings_routes_require_authentication(client: TestClient) -> None:
    for method, path in (
        ("get", "/api/v1/settings"),
        ("post", "/api/v1/settings"),
        ("get", "/api/v1/settings/attendance"),
        ("get", "/api/v1/settings/mobile"),
        ("post", "/api/v1/settings/mobile"),
        ("get", "/api/v1/location"),
        ("post", "/api/v1/location"),
        ("get", "/api/v1/system/storage"),
    ):
        response = client.post(path, json={}) if method == "post" else client.get(path)
        assert response.status_code == 401, (method, path, response.text)
