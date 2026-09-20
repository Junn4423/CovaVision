import asyncio

from app.db.repository import InMemoryRepository


def test_inmemory_repository_scopes_people_cameras_and_attendance_by_organization() -> None:
    async def scenario() -> None:
        repository = InMemoryRepository()
        await repository.save_employee({
            "employee_id": "EMP-A",
            "name": "Tenant A",
            "embedding": [1.0, 0.0],
            "organization_id": "org-a",
        })
        await repository.save_employee({
            "employee_id": "EMP-B",
            "name": "Tenant B",
            "embedding": [1.0, 0.0],
            "organization_id": "org-b",
        })
        await repository.save_camera({"id": "CAM-A", "name": "Camera A", "organization_id": "org-a"})
        await repository.save_camera({"id": "CAM-B", "name": "Camera B", "organization_id": "org-b"})
        await repository.create_attendance({"employee_id": "EMP-A", "organization_id": "org-a"})
        await repository.create_attendance({"employee_id": "EMP-B", "organization_id": "org-b"})

        assert [item["employee_id"] for item in await repository.list_employees(organization_id="org-a")] == ["EMP-A"]
        assert [item["employee_id"] for item in await repository.list_face_candidates("org-b")] == ["EMP-B"]
        assert await repository.get_employee("EMP-B", "org-a") is None
        assert [item["id"] for item in await repository.list_cameras("org-a")] == ["CAM-A"]
        assert await repository.get_camera("CAM-B", "org-a") is None
        assert [item["employee_id"] for item in await repository.list_attendance({}, "org-a")] == ["EMP-A"]

    asyncio.run(scenario())
