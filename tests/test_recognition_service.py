import pytest

from app.db.repository import InMemoryRepository
from app.recognition.service import RecognitionService


class FakeFrame:
    shape = (480, 640, 3)


class FakeEngine:
    def detect_and_encode(self, _frame):
        return [{
            "bbox": [100, 80, 220, 240],
            "embedding": [1.0, 0.0],
            "det_score": 0.98,
        }]


class FakeRecognizer:
    engine = FakeEngine()

    @staticmethod
    def _decode_image_bytes(_image_bytes):
        return FakeFrame()


@pytest.mark.asyncio
async def test_detect_matches_registered_employee_without_returning_embedding() -> None:
    repository = InMemoryRepository()
    await repository.save_employee({
        "employee_id": "EMP-001",
        "name": "Ngọc Chung",
        "embedding": [1.0, 0.0],
    })
    service = RecognitionService(repository, recognizer_factory=FakeRecognizer)

    result = await service.detect(b"fake-image")

    assert result["success"] is True
    assert result["matched"] is True
    assert result["detected_user"]["employee_id"] == "EMP-001"
    assert result["detections"][0]["similarity_percent"] == 100.0
    assert "embedding" not in result["detections"][0]


@pytest.mark.asyncio
async def test_recognize_creates_local_attendance_record_for_match() -> None:
    repository = InMemoryRepository()
    await repository.save_employee({
        "employee_id": "EMP-001",
        "name": "Ngọc Chung",
        "embedding": [1.0, 0.0],
    })
    service = RecognitionService(repository, recognizer_factory=FakeRecognizer)

    result = await service.recognize(
        b"fake-image",
        attendance_type="checkin",
        camera_id="camera-1",
    )

    assert result["success"] is True
    assert result["record"]["employee_id"] == "EMP-001"
    assert result["record"]["camera_id"] == "camera-1"
    assert result["record"]["attendance_type"] == "auto"
    assert len(repository.attendance) == 1


@pytest.mark.asyncio
async def test_recognize_records_each_successful_face_scan() -> None:
    repository = InMemoryRepository()
    await repository.save_employee({
        "employee_id": "EMP-001",
        "name": "Ngọc Chung",
        "embedding": [1.0, 0.0],
    })
    service = RecognitionService(repository, recognizer_factory=FakeRecognizer)

    first = await service.recognize(b"fake-image", attendance_type="checkin")
    second = await service.recognize(
        b"fake-image",
        attendance_type="checkout",
        cooldown_seconds=60,
    )

    assert first["success"] is True
    assert second["success"] is True
    assert first["record"]["attendance_type"] == "auto"
    assert second["record"]["attendance_type"] == "auto"
    assert len(repository.attendance) == 2
