import asyncio

from app.db.repository import InMemoryRepository
from app.recognition.service import RecognitionService


class _FakeFrame:
    shape = (120, 160, 3)


class _FakeRecognizer:
    class Engine:
        @staticmethod
        def detect_and_encode(_frame):
            return [{"bbox": [1, 2, 40, 50], "embedding": [1.0, 0.0], "det_score": 0.9}]

    engine = Engine()

    @staticmethod
    def _decode_image_bytes(_image_bytes):
        return _FakeFrame()


def test_repeated_face_scans_within_cooldown_are_idempotent() -> None:
    async def scenario() -> None:
        repository = InMemoryRepository()
        repository.seed_user("business-rules", "test-password", role="ADMIN")
        await repository.save_employee(
            {
                "employee_id": "EMP-COOLDOWN",
                "name": "Cooldown User",
                "embedding": [1.0, 0.0],
            }
        )
        service = RecognitionService(repository, recognizer_factory=_FakeRecognizer)

        first = await service.recognize(b"image")
        second = await service.recognize(b"image")

        assert first["success"] is True
        assert second["success"] is True
        assert second["duplicate"] is True
        assert second["record"]["id"] == first["record"]["id"]
        assert len(repository.attendance) == 1

    asyncio.run(scenario())
