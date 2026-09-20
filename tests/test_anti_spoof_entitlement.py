import asyncio

from app.db.repository import InMemoryRepository
from app.recognition.service import RecognitionService


class _Frame:
    shape = (120, 160, 3)


class _BaseRecognizer:
    class Engine:
        @staticmethod
        def detect_and_encode(_frame):
            return [{"bbox": [1, 2, 40, 50], "embedding": [1.0, 0.0], "det_score": 0.9}]

    engine = Engine()

    @staticmethod
    def _decode_image_bytes(_image_bytes):
        return _Frame()


class _LivenessRejectingRecognizer(_BaseRecognizer):
    class Engine(_BaseRecognizer.Engine):
        @staticmethod
        def check_anti_spoofing(_frame, _bbox):
            return False, 0.05

    engine = Engine()


class _UnexpectedLivenessRecognizer(_BaseRecognizer):
    class Engine(_BaseRecognizer.Engine):
        @staticmethod
        def check_anti_spoofing(_frame, _bbox):
            raise AssertionError("Standard must not call anti-spoofing")

    engine = Engine()


class _UnavailableLivenessRecognizer(_BaseRecognizer):
    class Engine(_BaseRecognizer.Engine):
        anti_spoofing_available = False

        @staticmethod
        def check_anti_spoofing(_frame, _bbox):
            return True, 1.0

    engine = Engine()


def test_paid_plan_rejects_a_spoof_before_creating_attendance() -> None:
    async def scenario() -> None:
        repository = InMemoryRepository()
        repository.seed_user("pro-user", "test-password", role="ADMIN")
        await repository.save_employee({"employee_id": "EMP-SPOOF", "name": "Spoof User", "embedding": [1.0, 0.0]})
        await repository.create_trial_subscription(repository.organization_id)
        repository.subscriptions[0]["plan_code"] = "pro"
        repository.subscriptions[0]["status"] = "ACTIVE"

        service = RecognitionService(repository, recognizer_factory=_LivenessRejectingRecognizer)
        response = await service.recognize(b"image", organization_id=repository.organization_id)

        assert response["success"] is False
        assert response["spoof_detected"] is True
        assert len(repository.attendance) == 0

    asyncio.run(scenario())


def test_standard_plan_does_not_invoke_paid_anti_spoof_engine() -> None:
    async def scenario() -> None:
        repository = InMemoryRepository()
        repository.seed_user("standard-user", "test-password", role="ADMIN")
        await repository.save_employee({"employee_id": "EMP-STANDARD", "name": "Standard User", "embedding": [1.0, 0.0]})

        service = RecognitionService(repository, recognizer_factory=_UnexpectedLivenessRecognizer)
        response = await service.recognize(b"image", organization_id=repository.organization_id)

        assert response["success"] is True
        assert len(repository.attendance) == 1

    asyncio.run(scenario())


def test_paid_plan_fails_closed_when_anti_spoof_engine_is_unavailable() -> None:
    async def scenario() -> None:
        repository = InMemoryRepository()
        repository.seed_user("unavailable-user", "test-password", role="ADMIN")
        await repository.save_employee({"employee_id": "EMP-UNAVAILABLE", "name": "Unavailable User", "embedding": [1.0, 0.0]})
        await repository.create_trial_subscription(repository.organization_id)
        repository.subscriptions[0]["plan_code"] = "pro"
        repository.subscriptions[0]["status"] = "ACTIVE"

        service = RecognitionService(repository, recognizer_factory=_UnavailableLivenessRecognizer)
        response = await service.recognize(b"image", organization_id=repository.organization_id)

        assert response["success"] is False
        assert response["spoof_detected"] is True
        assert len(repository.attendance) == 0

    asyncio.run(scenario())
