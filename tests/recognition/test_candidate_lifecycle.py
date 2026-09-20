import asyncio

from app.db.repository import InMemoryRepository


def test_only_active_employees_are_face_candidates() -> None:
    repository = InMemoryRepository()
    asyncio.run(repository.save_employee({"employee_id": "EMP-LEAVE", "name": "On leave"}))
    asyncio.run(repository.save_employee_face("EMP-LEAVE", [0.1] * 512))

    asyncio.run(repository.save_employee({
        "employee_id": "EMP-LEAVE",
        "name": "On leave",
        "status": "ON_LEAVE",
    }))

    candidates = asyncio.run(repository.list_face_candidates("org-default"))

    assert candidates == []


def test_terminated_employees_are_not_face_candidates() -> None:
    repository = InMemoryRepository()
    asyncio.run(repository.save_employee({"employee_id": "EMP-END", "name": "Former employee"}))
    asyncio.run(repository.save_employee_face("EMP-END", [0.1] * 512))

    asyncio.run(repository.save_employee({
        "employee_id": "EMP-END",
        "name": "Former employee",
        "status": "TERMINATED",
    }))

    candidates = asyncio.run(repository.list_face_candidates("org-default"))

    assert candidates == []
