import asyncio

from app.db.repository import InMemoryRepository


def test_face_embedding_is_encrypted_at_rest_and_decrypted_for_matching() -> None:
    async def scenario() -> None:
        repository = InMemoryRepository()
        await repository.save_employee({
            "employee_id": "EMP-BIOMETRIC",
            "name": "Biometric User",
        })
        await repository.save_employee_face("EMP-BIOMETRIC", [1.0, 0.0, 0.25])

        stored = repository.employees["EMP-BIOMETRIC"]
        assert stored["embedding"] != [1.0, 0.0, 0.25]
        assert stored["embedding"].startswith("emb:v1:")

        candidates = await repository.list_face_candidates(repository.organization_id)
        assert candidates[0]["embedding"] == [1.0, 0.0, 0.25]

    asyncio.run(scenario())
