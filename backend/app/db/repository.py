"""Persistence boundary.

Routes depend on this small interface, which keeps API tests deterministic while
the production adapter remains backed by Prisma/MySQL.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import uuid4

from app.core.security import hash_password, verify_password


class Repository(Protocol):
    async def authenticate(self, username: str, password: str) -> dict[str, Any] | None: ...

    async def get_employee(self, employee_id: str) -> dict[str, Any] | None: ...

    async def list_employees(self, query: str = "") -> list[dict[str, Any]]: ...

    async def save_employee(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    async def list_cameras(self) -> list[dict[str, Any]]: ...

    async def get_camera(self, camera_id: str) -> dict[str, Any] | None: ...

    async def save_camera(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    async def delete_camera(self, camera_id: str) -> bool: ...

    async def create_attendance(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    async def list_attendance(self, filters: dict[str, Any]) -> list[dict[str, Any]]: ...

    async def get_settings(self, key: str | None = None) -> dict[str, Any]: ...

    async def save_settings(self, payload: dict[str, Any]) -> dict[str, Any]: ...


def _now() -> datetime:
    return datetime.now(timezone.utc)


class InMemoryRepository:
    """Small repository used by contract tests and explicit demo mode."""

    def __init__(self) -> None:
        organization_id = "org-default"
        self.users: dict[str, dict[str, Any]] = {}
        self.employees: dict[str, dict[str, Any]] = {}
        self.cameras: dict[str, dict[str, Any]] = {}
        self.attendance: list[dict[str, Any]] = []
        self.settings: dict[str, Any] = {}
        self.organization_id = organization_id

    def seed_user(self, username: str, password: str, *, role: str = "STAFF") -> None:
        user_id = str(uuid4())
        self.users[username] = {
            "id": user_id,
            "username": username,
            "password_hash": hash_password(password),
            "role": role,
            "organization_id": self.organization_id,
            "is_active": True,
        }

    async def authenticate(self, username: str, password: str) -> dict[str, Any] | None:
        user = self.users.get(username)
        if not user or not user["is_active"] or not verify_password(password, user["password_hash"]):
            return None
        return {key: value for key, value in user.items() if key != "password_hash"}

    async def get_employee(self, employee_id: str) -> dict[str, Any] | None:
        return self.employees.get(employee_id)

    async def list_employees(self, query: str = "") -> list[dict[str, Any]]:
        normalized = query.strip().lower()
        items = list(self.employees.values())
        if normalized:
            items = [
                item for item in items
                if normalized in str(item.get("employee_id", "")).lower()
                or normalized in str(item.get("name", "")).lower()
            ]
        return items

    async def save_employee(self, payload: dict[str, Any]) -> dict[str, Any]:
        employee_id = str(payload.get("employee_id") or payload.get("id") or uuid4()).strip()
        current = self.employees.get(employee_id, {})
        employee = {
            **current,
            **payload,
            "id": employee_id,
            "employee_id": employee_id,
            "organization_id": self.organization_id,
            "updated_at": _now().isoformat(),
        }
        employee.setdefault("name", employee_id)
        employee.setdefault("registered", False)
        self.employees[employee_id] = employee
        return employee

    async def list_cameras(self) -> list[dict[str, Any]]:
        return list(self.cameras.values())

    async def get_camera(self, camera_id: str) -> dict[str, Any] | None:
        return self.cameras.get(camera_id)

    async def save_camera(self, payload: dict[str, Any]) -> dict[str, Any]:
        camera_id = str(payload.get("id") or uuid4())
        camera = {
            **self.cameras.get(camera_id, {}),
            **payload,
            "id": camera_id,
            "organization_id": self.organization_id,
            "updated_at": _now().isoformat(),
        }
        self.cameras[camera_id] = camera
        return camera

    async def delete_camera(self, camera_id: str) -> bool:
        return self.cameras.pop(camera_id, None) is not None

    async def create_attendance(self, payload: dict[str, Any]) -> dict[str, Any]:
        record = {"id": str(uuid4()), "created_at": _now().isoformat(), **payload}
        self.attendance.append(record)
        return record

    async def list_attendance(self, filters: dict[str, Any]) -> list[dict[str, Any]]:
        items = list(reversed(self.attendance))
        employee_id = str(filters.get("employee_id") or "").strip()
        if employee_id:
            items = [item for item in items if item.get("employee_id") == employee_id]
        return items

    async def get_settings(self, key: str | None = None) -> dict[str, Any]:
        if key:
            return {key: self.settings.get(key)}
        return dict(self.settings)

    async def save_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.settings.update(payload)
        return dict(self.settings)


class PrismaRepository:
    """Production repository. It opens Prisma lazily on first API operation."""

    def __init__(self) -> None:
        from prisma import Prisma

        self.client = Prisma()
        self._connected = False

    async def _ensure_connected(self) -> None:
        if not self._connected:
            await self.client.connect()
            self._connected = True

    async def authenticate(self, username: str, password: str) -> dict[str, Any] | None:
        await self._ensure_connected()
        user = await self.client.useraccount.find_unique(where={"username": username})
        if not user or not user.isActive or not verify_password(password, user.passwordHash):
            return None
        return {
            "id": user.id,
            "username": user.username,
            "role": str(user.role),
            "organization_id": user.organizationId,
            "is_active": user.isActive,
        }

    async def get_employee(self, employee_id: str) -> dict[str, Any] | None:
        await self._ensure_connected()
        employee = await self.client.employee.find_first(where={"id": employee_id})
        return self._employee_to_dict(employee) if employee else None

    async def list_employees(self, query: str = "") -> list[dict[str, Any]]:
        await self._ensure_connected()
        where: dict[str, Any] = {"status": "ACTIVE"}
        if query.strip():
            where = {
                "AND": [
                    {"status": "ACTIVE"},
                    {"OR": [{"employeeCode": {"contains": query.strip()}}, {"fullName": {"contains": query.strip()}}]},
                ],
            }
        employees = await self.client.employee.find_many(where=where, order={"fullName": "asc"})
        return [self._employee_to_dict(employee) for employee in employees]

    async def save_employee(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError("Prisma employee write adapter is being completed with face registration")

    async def list_cameras(self) -> list[dict[str, Any]]:
        await self._ensure_connected()
        cameras = await self.client.camera.find_many(where={"isActive": True}, order={"name": "asc"})
        return [self._camera_to_public_dict(camera) for camera in cameras]

    async def get_camera(self, camera_id: str) -> dict[str, Any] | None:
        await self._ensure_connected()
        camera = await self.client.camera.find_unique(where={"id": camera_id})
        return self._camera_to_public_dict(camera) if camera else None

    async def save_camera(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError("Prisma camera write adapter is being completed with encrypted secrets")

    async def delete_camera(self, camera_id: str) -> bool:
        await self._ensure_connected()
        result = await self.client.camera.update(where={"id": camera_id}, data={"isActive": False})
        return bool(result)

    async def create_attendance(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError("Prisma attendance write adapter is being completed with transaction rules")

    async def list_attendance(self, filters: dict[str, Any]) -> list[dict[str, Any]]:
        await self._ensure_connected()
        records = await self.client.attendancerecord.find_many(order={"capturedAt": "desc"}, take=200)
        return [self._attendance_to_dict(record) for record in records]

    async def get_settings(self, key: str | None = None) -> dict[str, Any]:
        raise NotImplementedError("Prisma settings adapter is being completed")

    async def save_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError("Prisma settings adapter is being completed")

    @staticmethod
    def _employee_to_dict(employee: Any) -> dict[str, Any]:
        return {
            "id": employee.id,
            "employee_id": employee.employeeCode,
            "name": employee.fullName,
            "email": employee.email,
            "phone": employee.phone,
            "department": getattr(employee.department, "name", None) if getattr(employee, "department", None) else None,
            "position": getattr(employee.position, "name", None) if getattr(employee, "position", None) else None,
            "registered": False,
        }

    @staticmethod
    def _camera_to_public_dict(camera: Any) -> dict[str, Any]:
        return {
            "id": camera.id,
            "name": camera.name,
            "camera_type": str(camera.type).lower(),
            "is_default": camera.isDefault,
            "is_active": camera.isActive,
        }

    @staticmethod
    def _attendance_to_dict(record: Any) -> dict[str, Any]:
        return {
            "id": record.id,
            "employee_id": record.employeeId,
            "camera_id": record.cameraId,
            "attendance_type": str(record.type).lower(),
            "status": str(record.status).lower(),
            "captured_at": record.capturedAt.isoformat(),
            "confidence": float(record.confidence) if record.confidence is not None else None,
        }
