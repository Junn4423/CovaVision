from __future__ import annotations

import base64

from fastapi.testclient import TestClient

from app.recognition.service import RecognitionService


class _Frame:
    shape = (120, 160, 3)


class _Engine:
    @staticmethod
    def detect_and_encode(_frame):
        return [{"bbox": [1, 2, 40, 50], "embedding": [1.0, 0.0], "det_score": 0.9}]


class _Recognizer:
    engine = _Engine()

    @staticmethod
    def _decode_image_bytes(_image_bytes):
        return _Frame()


def _image_payload(**extra: object) -> dict[str, object]:
    return {"image_base64": base64.b64encode(b"fake-image").decode("ascii"), **extra}


def test_attendance_recognition_and_read_routes(
    test_app,
    client: TestClient,
    repository,
    admin_headers: dict[str, str],
) -> None:
    import asyncio

    asyncio.run(repository.save_employee({
        "employee_id": "EMP-ATT",
        "name": "Attendance User",
        "embedding": [1.0, 0.0],
    }))
    test_app.state.recognition_service = RecognitionService(
        repository,
        recognizer_factory=_Recognizer,
    )

    recognized = client.post(
        "/api/v1/attendance/recognize",
        headers=admin_headers,
        json=_image_payload(
            camera_id="camera-1",
            location={"lat": 10.1, "lng": 106.2},
            include_preview=True,
            client_event_id="event-1",
        ),
    )
    assert recognized.status_code == 200
    record = recognized.json()["record"]
    assert recognized.json()["success"] is True
    assert recognized.json()["matched"] is True
    assert recognized.json()["preview_image_base64"].startswith("data:image/jpeg;base64,")
    assert record["employee_id"] == "EMP-ATT"
    assert record["camera_id"] == "camera-1"

    duplicate = client.post(
        "/api/v1/attendance/recognize",
        headers=admin_headers,
        json=_image_payload(client_event_id="event-1"),
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["duplicate"] is True

    detected = client.post(
        "/api/v1/attendance/detect",
        headers=admin_headers,
        json=_image_payload(max_faces=1),
    )
    assert detected.status_code == 200
    assert detected.json()["detected_count"] == 1

    records = client.get("/api/v1/attendance/records?employee_id=EMP-ATT", headers=admin_headers)
    assert records.status_code == 200
    assert len(records.json()["records"]) == 1
    assert client.get("/api/v1/attendance/today", headers=admin_headers).status_code == 200
    assert len(client.get("/api/v1/attendance/recent", headers=admin_headers).json()["records"]) == 1

    stats = client.get("/api/v1/attendance/stats", headers=admin_headers)
    assert stats.status_code == 200
    assert stats.json()["total"] == 1
    assert stats.json()["accepted"] == 1
    status = client.get(f"/api/v1/attendance/{record['id']}", headers=admin_headers)
    assert status.status_code == 200
    assert status.json()["id"] == record["id"]


def test_attendance_validation_and_not_found_paths(
    test_app,
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    test_app.state.recognition_service = RecognitionService(test_app.state.repository)

    assert client.post(
        "/api/v1/attendance",
        headers=admin_headers,
        json={"employee_id": "EMP-ATT"},
    ).status_code == 405
    assert client.post(
        "/api/v1/attendance/recognize",
        headers=admin_headers,
        json={"image_base64": "not-base64"},
    ).status_code == 422
    assert client.post(
        "/api/v1/attendance/detect",
        headers=admin_headers,
        json={"image_base64": "not-base64"},
    ).status_code == 422
    assert client.get("/api/v1/attendance/missing", headers=admin_headers).status_code == 404
    assert client.get("/api/v1/attendance/records").status_code == 401
