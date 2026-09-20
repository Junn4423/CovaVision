import asyncio
from datetime import datetime, timezone

from app.core.config import settings
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


def test_recognition_can_store_a_retained_snapshot_without_exposing_raw_bytes(monkeypatch) -> None:
    async def scenario() -> None:
        repository = InMemoryRepository()
        await repository.save_employee({
            "employee_id": "EMP-SNAPSHOT",
            "name": "Snapshot User",
            "embedding": [1.0, 0.0],
        })
        service = RecognitionService(repository, recognizer_factory=_FakeRecognizer)

        result = await service.recognize(
            b"fake-jpeg",
            organization_id=repository.organization_id,
        )

        assert result["success"] is True
        assert repository.attendance_snapshots == []

        monkeypatch.setattr(settings, "attendance_snapshot_enabled", True)
        monkeypatch.setattr(settings, "attendance_snapshot_retention_days", 30)
        result = await service.recognize(
            b"fake-jpeg-2",
            cooldown_seconds=0,
            organization_id=repository.organization_id,
        )

        assert result["success"] is True
        snapshot = repository.attendance_snapshots[-1]
        assert snapshot["attendance_id"] == result["record"]["id"]
        assert snapshot["sha256"]
        assert snapshot["storage_path"].startswith("memory://")
        assert "image_bytes" not in snapshot

    asyncio.run(scenario())


def test_snapshot_retention_purges_only_the_requested_tenant() -> None:
    async def scenario() -> None:
        repository = InMemoryRepository()
        await repository.create_attendance({"id": "ATT-OLD", "status": "accepted"})
        new = await repository.create_attendance({"id": "ATT-NEW", "status": "accepted"})
        await repository.save_attendance_snapshot("ATT-OLD", b"old")
        await repository.save_attendance_snapshot("ATT-NEW", b"new")
        repository.attendance_snapshots[0]["created_at"] = "2020-01-01T00:00:00+00:00"

        removed = await repository.purge_attendance_snapshots(
            datetime(2021, 1, 1, tzinfo=timezone.utc),
            repository.organization_id,
        )

        assert removed == 1
        assert [item["attendance_id"] for item in repository.attendance_snapshots] == [new["id"]]

    asyncio.run(scenario())
