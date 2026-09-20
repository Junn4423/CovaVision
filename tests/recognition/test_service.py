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


class BrokenEngine:
    def detect_and_encode(self, _frame):
        raise RuntimeError("simulated inference failure")


class BrokenRecognizer:
    engine = BrokenEngine()

    @staticmethod
    def _decode_image_bytes(_image_bytes):
        return FakeFrame()


class NoisyEngine:
    def detect_and_encode(self, _frame):
        return [
            {"bbox": [1, 2], "embedding": [1.0, 0.0], "det_score": 0.1},
            {"bbox": [100, 80, 220, 240], "embedding": [1.0, 0.0], "det_score": 0.98},
            {"bbox": [500, 400, 100, 200], "embedding": [1.0, 0.0], "det_score": 0.2},
        ]


class NoisyRecognizer:
    engine = NoisyEngine()

    @staticmethod
    def _decode_image_bytes(_image_bytes):
        return FakeFrame()


class CountingRepository(InMemoryRepository):
    def __init__(self) -> None:
        super().__init__()
        self.candidate_calls = 0

    async def list_face_candidates(self, organization_id=None):
        self.candidate_calls += 1
        return await super().list_face_candidates(organization_id)


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
async def test_engine_failure_returns_safe_no_face_response_instead_of_crashing() -> None:
    service = RecognitionService(InMemoryRepository(), recognizer_factory=BrokenRecognizer)

    result = await service.detect(b"fake-image")

    assert result["success"] is True
    assert result["detected"] is False
    assert result["detections"] == []
    assert result["recognition_degraded"] is True


@pytest.mark.asyncio
async def test_malformed_engine_boxes_are_skipped_before_matching() -> None:
    repository = InMemoryRepository()
    await repository.save_employee({
        "employee_id": "EMP-001",
        "name": "Ngá»c Chung",
        "embedding": [1.0, 0.0],
    })
    service = RecognitionService(repository, recognizer_factory=NoisyRecognizer)

    result = await service.detect(b"fake-image")

    assert result["detected_count"] == 1
    assert result["detections"][0]["bbox"] == [100, 80, 220, 240]


@pytest.mark.asyncio
async def test_face_candidates_are_cached_briefly_to_reduce_database_work() -> None:
    repository = CountingRepository()
    await repository.save_employee({
        "employee_id": "EMP-001",
        "name": "Ngá»c Chung",
        "embedding": [1.0, 0.0],
    })
    service = RecognitionService(repository, recognizer_factory=FakeRecognizer)

    await service.detect(b"fake-image")
    await service.detect(b"fake-image")

    assert repository.candidate_calls == 1


@pytest.mark.asyncio
async def test_client_cannot_lower_server_recognition_threshold() -> None:
    repository = InMemoryRepository()
    await repository.save_employee({
        "employee_id": "EMP-001",
        "name": "Ngọc Chung",
        "embedding": [0.0, 1.0],
    })
    service = RecognitionService(repository, recognizer_factory=FakeRecognizer)

    result = await service.detect(b"fake-image", similarity_threshold=0.0)

    assert result["matched"] is False


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
    assert result["record"]["attendance_type"] == "check_in"
    assert len(repository.attendance) == 1


@pytest.mark.asyncio
async def test_recognize_deduplicates_successful_face_scans() -> None:
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
    assert first["record"]["attendance_type"] == "check_in"
    assert second["record"]["attendance_type"] == "check_in"
    assert second["duplicate"] is True
    assert second["record"]["id"] == first["record"]["id"]
    assert len(repository.attendance) == 1
