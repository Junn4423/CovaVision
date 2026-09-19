"""Persistence boundary.

Routes depend on this small interface, which keeps API tests deterministic while
the production adapter remains backed by Prisma/MySQL.
"""

from __future__ import annotations

import asyncio
import base64
import os
import struct
import re
import unicodedata
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Protocol
from uuid import uuid4

from app.core.security import hash_password, verify_password


class Repository(Protocol):
    async def authenticate(self, username: str, password: str) -> dict[str, Any] | None: ...

    async def get_employee(self, employee_id: str) -> dict[str, Any] | None: ...

    async def list_employees(self, query: str = "") -> list[dict[str, Any]]: ...

    async def save_employee(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    async def list_face_candidates(self) -> list[dict[str, Any]]: ...

    async def save_employee_face(self, employee_id: str, embedding: Any, image_bytes: bytes | None = None) -> dict[str, Any]: ...

    async def clear_employee_face(self, employee_id: str) -> dict[str, Any]: ...

    async def get_employee_image(self, employee_id: str) -> dict[str, Any] | None: ...

    async def list_accounts(self) -> list[dict[str, Any]]: ...

    async def save_account(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    async def reset_account_password(self, account_id: str, password: str) -> dict[str, Any]: ...

    async def set_account_lock(self, account_id: str, is_locked: bool) -> dict[str, Any]: ...

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

    async def list_face_candidates(self) -> list[dict[str, Any]]:
        return [
            {
                "id": item.get("id") or item.get("employee_id"),
                "employee_id": item.get("employee_id") or item.get("id"),
                "name": item.get("name") or item.get("employee_id") or item.get("id"),
                "department": item.get("department"),
                "position": item.get("position"),
                "embedding": item.get("embedding") if item.get("embedding") is not None else item.get("face_encoding"),
            }
            for item in self.employees.values()
            if item.get("status", "ACTIVE") != "INACTIVE"
            and (item.get("embedding") is not None or item.get("face_encoding") is not None)
        ]

    async def save_employee_face(self, employee_id: str, embedding: Any, image_bytes: bytes | None = None) -> dict[str, Any]:
        employee = self.employees.get(employee_id)
        if employee is None:
            raise KeyError(employee_id)
        employee["embedding"] = embedding.tolist() if hasattr(embedding, "tolist") else embedding
        employee["registered"] = True
        employee["has_face"] = True
        employee["face_count"] = 1
        if image_bytes:
            employee["image_base64"] = "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode("ascii")
        employee["updated_at"] = _now().isoformat()
        return employee

    async def clear_employee_face(self, employee_id: str) -> dict[str, Any]:
        employee = self.employees.get(employee_id)
        if employee is None:
            raise KeyError(employee_id)
        employee.pop("embedding", None)
        employee.pop("face_encoding", None)
        employee["registered"] = False
        employee["has_face"] = False
        employee["face_count"] = 0
        employee["updated_at"] = _now().isoformat()
        return employee

    async def get_employee_image(self, employee_id: str) -> dict[str, Any] | None:
        employee = self.employees.get(employee_id)
        if employee is None:
            return None
        return {
            "image_base64": employee.get("image_base64"),
            "image_url": employee.get("image_url", ""),
        }

    async def list_accounts(self) -> list[dict[str, Any]]:
        return [
            {
                key: value
                for key, value in user.items()
                if key not in {"password_hash", "passwordHash"}
            }
            for user in self.users.values()
        ]

    async def save_account(self, payload: dict[str, Any]) -> dict[str, Any]:
        username = str(payload.get("username") or "").strip()
        if not username:
            raise ValueError("username is required")
        current = self.users.get(username, {})
        password = str(payload.get("password") or "").strip()
        account = {
            **current,
            "id": current.get("id") or str(uuid4()),
            "username": username,
            "role": str(payload.get("role") or current.get("role") or "STAFF").upper(),
            "organization_id": self.organization_id,
            "is_active": payload.get("is_active", payload.get("isActive", current.get("is_active", True))) is not False,
        }
        if password:
            account["password_hash"] = hash_password(password)
        elif not account.get("password_hash"):
            raise ValueError("password is required for a new account")
        self.users[username] = account
        return {key: value for key, value in account.items() if key != "password_hash"}

    async def reset_account_password(self, account_id: str, password: str) -> dict[str, Any]:
        user = next((item for item in self.users.values() if item.get("id") == account_id or item.get("username") == account_id), None)
        if user is None:
            raise KeyError(account_id)
        user["password_hash"] = hash_password(password)
        return {key: value for key, value in user.items() if key != "password_hash"}

    async def set_account_lock(self, account_id: str, is_locked: bool) -> dict[str, Any]:
        user = next((item for item in self.users.values() if item.get("id") == account_id or item.get("username") == account_id), None)
        if user is None:
            raise KeyError(account_id)
        user["is_active"] = not is_locked
        return {key: value for key, value in user.items() if key != "password_hash"}

    async def list_cameras(self) -> list[dict[str, Any]]:
        return list(self.cameras.values())

    async def get_camera(self, camera_id: str) -> dict[str, Any] | None:
        return self.cameras.get(camera_id)

    async def save_camera(self, payload: dict[str, Any]) -> dict[str, Any]:
        camera_id = str(payload.get("id") or uuid4())
        internal_payload = dict(payload)
        current = self.cameras.get(camera_id, {})
        if not internal_payload.get("connection_url") and current.get("connection_url"):
            internal_payload.pop("connection_url", None)
        elif not internal_payload.get("connection_url"):
            internal_payload["connection_url"] = (
                internal_payload.get("source")
                or internal_payload.get("rtsp_url")
                or ""
            )
        camera = {
            **current,
            **internal_payload,
            "id": camera_id,
            "organization_id": self.organization_id,
            "updated_at": _now().isoformat(),
        }
        self.cameras[camera_id] = camera
        return camera

    async def delete_camera(self, camera_id: str) -> bool:
        return self.cameras.pop(camera_id, None) is not None

    async def create_attendance(self, payload: dict[str, Any]) -> dict[str, Any]:
        record = {
            "id": str(uuid4()),
            "created_at": _now().isoformat(),
            **payload,
            "attendance_type": "auto",
        }
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
        # The repository is created while importing the FastAPI app, before
        # Uvicorn has selected its event loop. Create the lock lazily on the
        # loop that performs the first request instead of binding it at import.
        self._connection_lock: asyncio.Lock | None = None
        self._connection_lock_loop: asyncio.AbstractEventLoop | None = None

    async def _ensure_connected(self) -> None:
        if self._connected:
            return
        loop = asyncio.get_running_loop()
        if self._connection_lock is None or self._connection_lock_loop is not loop:
            self._connection_lock = asyncio.Lock()
            self._connection_lock_loop = loop
        connection_lock = self._connection_lock
        async with connection_lock:
            if self._connected:
                return
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

    async def list_accounts(self) -> list[dict[str, Any]]:
        await self._ensure_connected()
        accounts = await self.client.useraccount.find_many(order={"username": "asc"})
        return [self._account_to_dict(account) for account in accounts]

    async def save_account(self, payload: dict[str, Any]) -> dict[str, Any]:
        await self._ensure_connected()
        organization = await self._default_organization()
        username = str(payload.get("username") or "").strip()
        if not username:
            raise ValueError("username is required")
        current = await self.client.useraccount.find_unique(where={"username": username})
        role = str(payload.get("role") or (str(current.role) if current else "STAFF")).upper()
        if role not in {"ADMIN", "HR_MANAGER", "SUPERVISOR", "STAFF"}:
            role = "STAFF"
        password = str(payload.get("password") or "").strip()
        data: dict[str, Any] = {
            "username": username,
            "role": role,
            "isActive": payload.get("is_active", payload.get("isActive", True)) is not False,
        }
        if password:
            data["passwordHash"] = hash_password(password)
        if current:
            account = await self.client.useraccount.update(where={"id": current.id}, data=data)
        else:
            if not password:
                raise ValueError("password is required for a new account")
            data["passwordHash"] = hash_password(password)
            data["organization"] = {"connect": {"id": organization.id}}
            account = await self.client.useraccount.create(data=data)
        return self._account_to_dict(account)

    async def reset_account_password(self, account_id: str, password: str) -> dict[str, Any]:
        await self._ensure_connected()
        account = await self._find_account(account_id)
        if account is None:
            raise KeyError(account_id)
        updated = await self.client.useraccount.update(
            where={"id": account.id},
            data={"passwordHash": hash_password(password)},
        )
        return self._account_to_dict(updated)

    async def set_account_lock(self, account_id: str, is_locked: bool) -> dict[str, Any]:
        await self._ensure_connected()
        account = await self._find_account(account_id)
        if account is None:
            raise KeyError(account_id)
        updated = await self.client.useraccount.update(
            where={"id": account.id},
            data={"isActive": not is_locked},
        )
        return self._account_to_dict(updated)

    async def get_employee(self, employee_id: str) -> dict[str, Any] | None:
        await self._ensure_connected()
        employee = await self.client.employee.find_first(
            where={"OR": [{"id": employee_id}, {"employeeCode": employee_id}]},
            include=self._employee_include(),
        )
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
        employees = await self.client.employee.find_many(
            where=where,
            order={"fullName": "asc"},
            include=self._employee_include(),
        )
        return [self._employee_to_dict(employee) for employee in employees]

    async def save_employee(self, payload: dict[str, Any]) -> dict[str, Any]:
        await self._ensure_connected()
        organization = await self._default_organization()
        from prisma import fields

        employee_ref = str(
            payload.get("employee_id")
            or payload.get("employee_code")
            or payload.get("employeeCode")
            or payload.get("id")
            or ""
        ).strip()
        employee_code = employee_ref or str(uuid4())
        current = await self.client.employee.find_first(
            where={"OR": [{"id": employee_code}, {"employeeCode": employee_code}]},
        )
        status = str(payload.get("status") or "ACTIVE").upper()
        if status not in {"ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED"}:
            status = "ACTIVE"
        metadata = payload.get("metadata")
        if metadata is None and current is not None:
            metadata = getattr(current, "metadata", None)
        if metadata is None:
            metadata = {}
        data = {
            "employeeCode": employee_code,
            "fullName": str(payload.get("name") or payload.get("full_name") or employee_code).strip(),
            "email": str(payload.get("email") or "").strip() or None,
            "phone": str(payload.get("phone") or "").strip() or None,
            "avatarPath": str(payload.get("avatar_path") or "").strip() or None,
            "status": status,
            # Prisma Client Python requires an explicit Json value here even
            # though the database column is nullable.
            "metadata": fields.Json(metadata),
        }
        for field_name, payload_keys in (
            ("dateOfBirth", ("date_of_birth", "dateOfBirth")),
            ("hireDate", ("hire_date", "hireDate")),
            ("terminationDate", ("termination_date", "terminationDate")),
        ):
            present, value = self._first_payload_value(payload, payload_keys)
            if present:
                data[field_name] = self._parse_optional_date(value)

        organization_id = organization.id if current is None else current.organizationId
        for relation_name, relation_keys in (
            ("department", ("department_id", "departmentId", "department_code", "departmentCode", "department")),
            ("position", ("position_id", "positionId", "position_code", "positionCode", "position")),
        ):
            present, raw_value = self._first_payload_value(payload, relation_keys)
            if not present:
                continue
            relation = await self._resolve_or_create_relation(
                relation_name,
                organization_id,
                raw_value,
            )
            # Use scalar foreign keys so the create branch can use Prisma's
            # unchecked input together with organizationId. Nested relation
            # keys make the generated Python client choose the checked input,
            # which then requires an organization relation object as well.
            data[f"{relation_name}Id"] = relation.id if relation else None
        if current:
            employee = await self.client.employee.update(where={"id": current.id}, data=data)
        else:
            # Supplying the scalar FK avoids Prisma choosing its unchecked
            # input branch with a missing organizationId.
            data["organizationId"] = organization.id
            employee = await self.client.employee.create(data=data)
        refreshed = await self.client.employee.find_unique(
            where={"id": employee.id},
            include=self._employee_include(),
        )
        return self._employee_to_dict(refreshed or employee)

    async def list_face_candidates(self) -> list[dict[str, Any]]:
        await self._ensure_connected()
        faces = await self.client.employeeface.find_many(
            where={"isActive": True},
            include={
                "employee": {
                    "include": {
                        "department": True,
                        "position": True,
                    },
                },
            },
        )
        candidates = []
        for face in faces:
            employee = getattr(face, "employee", None)
            if employee is None:
                continue
            raw_embedding = face.embedding
            if not isinstance(raw_embedding, (bytes, bytearray)) and hasattr(raw_embedding, "decode"):
                raw_embedding = raw_embedding.decode()
            if isinstance(raw_embedding, str):
                from prisma import fields

                raw_embedding = fields.Base64.fromb64(raw_embedding).decode()
            if not isinstance(raw_embedding, (bytes, bytearray)):
                continue
            size = int(getattr(face, "embeddingSize", 0) or 0)
            if size <= 0 or len(raw_embedding) < size * 4:
                continue
            embedding = list(struct.unpack(f"<{size}f", bytes(raw_embedding[: size * 4])))
            candidates.append({
                "id": employee.id,
                "employee_id": employee.employeeCode,
                "name": employee.fullName,
                "department": getattr(getattr(employee, "department", None), "name", None),
                "position": getattr(getattr(employee, "position", None), "name", None),
                "embedding": embedding,
            })
        return candidates

    async def save_employee_face(self, employee_id: str, embedding: Any, image_bytes: bytes | None = None) -> dict[str, Any]:
        await self._ensure_connected()
        employee = await self.client.employee.find_first(
            where={"OR": [{"id": employee_id}, {"employeeCode": employee_id}]},
            include=self._employee_include(),
        )
        if employee is None:
            raise KeyError(employee_id)
        values = self._embedding_values(embedding)
        if not values:
            raise ValueError("Face embedding is empty")
        raw_embedding = struct.pack(f"<{len(values)}f", *values)
        from prisma import fields

        await self.client.employeeface.update_many(
            where={"employeeId": employee.id, "isActive": True},
            data={"isActive": False},
        )
        image_path = self._store_employee_image(employee.id, image_bytes)
        await self.client.employeeface.create(
            data={
                "employeeId": employee.id,
                "embedding": fields.Base64.encode(raw_embedding),
                "embeddingModel": "insightface-buffalo_s",
                "embeddingSize": len(values),
                "imagePath": str(image_path) if image_path else None,
                "isActive": True,
            },
        )
        refreshed = await self.client.employee.find_unique(
            where={"id": employee.id},
            include=self._employee_include(),
        )
        return self._employee_to_dict(refreshed or employee, registered=True)

    async def clear_employee_face(self, employee_id: str) -> dict[str, Any]:
        await self._ensure_connected()
        employee = await self.client.employee.find_first(
            where={"OR": [{"id": employee_id}, {"employeeCode": employee_id}]},
            include=self._employee_include(),
        )
        if employee is None:
            raise KeyError(employee_id)
        await self.client.employeeface.update_many(
            where={"employeeId": employee.id, "isActive": True},
            data={"isActive": False},
        )
        return self._employee_to_dict(employee, registered=False)

    async def get_employee_image(self, employee_id: str) -> dict[str, Any] | None:
        await self._ensure_connected()
        employee = await self.client.employee.find_first(
            where={"OR": [{"id": employee_id}, {"employeeCode": employee_id}]},
            include={"faces": {"where": {"isActive": True}}},
        )
        if employee is None:
            return None
        faces = getattr(employee, "faces", None) or []
        image_path = next((getattr(face, "imagePath", None) for face in faces if getattr(face, "imagePath", None)), None)
        if not image_path:
            return {"image_base64": None, "image_url": ""}
        path = Path(str(image_path))
        if not path.is_absolute():
            path = Path.cwd() / path
        try:
            raw = path.read_bytes()
        except OSError:
            return {"image_base64": None, "image_url": ""}
        return {
            "image_base64": "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii"),
            "image_url": "",
        }

    async def list_cameras(self) -> list[dict[str, Any]]:
        await self._ensure_connected()
        cameras = await self.client.camera.find_many(where={"isActive": True}, order={"name": "asc"})
        return [self._camera_to_dict(camera) for camera in cameras]

    async def get_camera(self, camera_id: str) -> dict[str, Any] | None:
        await self._ensure_connected()
        camera = await self.client.camera.find_unique(where={"id": camera_id})
        return self._camera_to_dict(camera) if camera else None

    async def save_camera(self, payload: dict[str, Any]) -> dict[str, Any]:
        await self._ensure_connected()
        organization = await self._default_organization()
        from prisma import fields

        requested_id = str(payload.get("id") or "").strip()
        camera_id = requested_id if len(requested_id) == 36 else str(uuid4())
        current = await self.client.camera.find_unique(where={"id": camera_id})
        connection_url = str(
            payload.get("connection_url")
            or payload.get("source")
            or payload.get("rtsp_url")
            or (getattr(current, "connectionUrl", "") if current else "")
            or ""
        ).strip()
        requested_camera_type = str(payload.get("camera_type") or payload.get("type") or "rtsp").upper()
        camera_type = {
            "RTSP": "RTSP",
            "DEVICE": "WEBCAM",
            "BROWSER": "WEBCAM",
            "WEBCAM": "WEBCAM",
            "MOBILE": "MOBILE",
        }.get(requested_camera_type, "RTSP")
        current_options = getattr(current, "options", None) if current else None
        options = dict(current_options) if isinstance(current_options, dict) else {}
        for key in ("options", "camera_options", "processing_options"):
            value = payload.get(key)
            if isinstance(value, dict):
                options.update(value)
        data = {
            "name": str(payload.get("name") or camera_id).strip(),
            "type": camera_type,
            "connectionUrl": connection_url or None,
            "username": str(payload.get("username") or "").strip() or None,
            "passwordSecret": str(payload.get("password_secret") or payload.get("password") or "").strip() or None,
            # Prisma Python requires fields.Json for JSON input. Passing a raw
            # dict can make the checked create branch fail and obscure the real
            # error as a missing organizationId in the unchecked branch.
            "options": fields.Json(options),
            "isDefault": bool(payload.get("is_default", payload.get("isDefault", False))),
            "isActive": payload.get("enabled", payload.get("is_active", True)) is not False,
            "organization": {"connect": {"id": organization.id}},
        }
        if current:
            data.pop("organization")
            camera = await self.client.camera.update(where={"id": camera_id}, data=data)
        else:
            data.pop("organization", None)
            data["organizationId"] = organization.id
            data["id"] = camera_id
            camera = await self.client.camera.create(data=data)
        return self._camera_to_dict(camera)

    async def delete_camera(self, camera_id: str) -> bool:
        await self._ensure_connected()
        result = await self.client.camera.update(where={"id": camera_id}, data={"isActive": False})
        return bool(result)

    async def create_attendance(self, payload: dict[str, Any]) -> dict[str, Any]:
        await self._ensure_connected()
        organization = await self._default_organization()
        from prisma import fields

        employee_id = str(payload.get("employee_id") or payload.get("user_id") or "").strip()
        employee = None
        if employee_id:
            employee = await self.client.employee.find_first(
                where={"OR": [{"id": employee_id}, {"employeeCode": employee_id}]},
            )
        camera_id = str(payload.get("camera_id") or "").strip()
        camera = await self.client.camera.find_unique(where={"id": camera_id}) if camera_id else None
        attendance_type = "AUTO"
        status = str(payload.get("status") or "ACCEPTED").upper()
        if status not in {"ACCEPTED", "REJECTED", "PENDING"}:
            status = "ACCEPTED"
        captured_at = self._parse_datetime(payload.get("captured_at"))
        location = payload.get("location")
        data: dict[str, Any] = {
            # Use scalar foreign keys so Prisma selects the unchecked input
            # consistently. The checked input otherwise requires an
            # organization relation object and fails with organizationId
            # missing when metadata is nullable.
            "organizationId": organization.id,
            "type": attendance_type,
            "status": status,
            "capturedAt": captured_at,
            "confidence": self._decimal_or_none(payload.get("confidence")),
            # Prisma Client Python requires an explicit Json value even when
            # the application has no GPS/location payload.
            "metadata": fields.Json({"location": location} if location is not None else {}),
        }
        if employee:
            data["employeeId"] = employee.id
        if camera:
            data["cameraId"] = camera.id
        record = await self.client.attendancerecord.create(
            data=data,
            include={"employee": True, "camera": True},
        )
        return self._attendance_to_dict(record)

    async def list_attendance(self, filters: dict[str, Any]) -> list[dict[str, Any]]:
        await self._ensure_connected()
        where: dict[str, Any] = {}
        employee_id = str(filters.get("employee_id") or "").strip()
        if employee_id:
            employee = await self.client.employee.find_first(
                where={"OR": [{"id": employee_id}, {"employeeCode": employee_id}]},
            )
            where["employeeId"] = employee.id if employee else "__not_found__"
        records = await self.client.attendancerecord.find_many(
            where=where,
            order={"capturedAt": "desc"},
            take=200,
            include={"employee": True, "camera": True},
        )
        return [self._attendance_to_dict(record) for record in records]

    async def get_settings(self, key: str | None = None) -> dict[str, Any]:
        await self._ensure_connected()
        organization = await self._default_organization()
        where: dict[str, Any] = {"organizationId": organization.id}
        if key:
            where["settingKey"] = key
        rows = await self.client.systemsetting.find_many(where=where)
        return {row.settingKey: row.settingValue for row in rows}

    async def save_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        await self._ensure_connected()
        organization = await self._default_organization()
        for key, value in payload.items():
            setting_key = str(key).strip()
            if not setting_key:
                continue
            await self.client.systemsetting.upsert(
                where={"organizationId_settingKey": {
                    "organizationId": organization.id,
                    "settingKey": setting_key,
                }},
                data={
                    "create": {
                        "organization": {"connect": {"id": organization.id}},
                        "settingKey": setting_key,
                        "settingValue": value,
                    },
                    "update": {"settingValue": value},
                },
            )
        return await self.get_settings()

    async def _default_organization(self) -> Any:
        organization = await self.client.organization.find_first(order={"createdAt": "asc"})
        if organization is None:
            organization = await self.client.organization.create(
                data={"code": "DEFAULT", "name": "CovaVision"},
            )
        return organization

    @staticmethod
    def _embedding_values(embedding: Any) -> list[float]:
        if hasattr(embedding, "tolist"):
            embedding = embedding.tolist()
        if embedding is None:
            return []
        return [float(value) for value in embedding]

    @staticmethod
    def _employee_include() -> dict[str, Any]:
        return {
            "faces": {"where": {"isActive": True}},
            "department": True,
            "position": True,
        }

    @staticmethod
    def _first_payload_value(payload: dict[str, Any], keys: tuple[str, ...]) -> tuple[bool, Any]:
        for key in keys:
            if key in payload:
                return True, payload.get(key)
        return False, None

    @staticmethod
    def _parse_optional_date(value: Any) -> datetime | None:
        if value is None or str(value).strip() == "":
            return None
        if isinstance(value, datetime):
            return value
        normalized = str(value).strip().replace("Z", "+00:00")
        if len(normalized) == 10:
            normalized = f"{normalized}T00:00:00"
        return datetime.fromisoformat(normalized)

    async def _resolve_or_create_relation(self, relation_name: str, organization_id: str, value: Any) -> Any | None:
        if isinstance(value, dict):
            value = value.get("id") or value.get("code") or value.get("name")
        text = str(value or "").strip()
        if not text:
            return None
        if relation_name == "department":
            model = self.client.department
            prefix = "DEPT"
        else:
            model = self.client.jobposition
            prefix = "POS"
        relation = await model.find_first(
            where={
                "organizationId": organization_id,
                "OR": [{"id": text}, {"code": text}, {"name": text}],
            },
        )
        if relation is not None:
            return relation
        code = self._relation_code(prefix, text)
        existing_code = await model.find_first(
            where={"organizationId": organization_id, "code": code},
        )
        if existing_code is not None:
            return existing_code
        return await model.create(
            data={
                "organization": {"connect": {"id": organization_id}},
                "code": code,
                "name": text[:255],
            },
        )

    @staticmethod
    def _relation_code(prefix: str, value: str) -> str:
        ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
        normalized = re.sub(r"[^A-Za-z0-9]+", "_", ascii_value).strip("_").upper()
        return f"{prefix}_{normalized or uuid4().hex[:12]}"[:50]

    @staticmethod
    def _store_employee_image(employee_id: str, image_bytes: bytes | None) -> Path | None:
        if not image_bytes:
            return None
        root = Path(os.getenv("COVAVISION_DATA_DIR", "data")) / "employee_faces"
        root.mkdir(parents=True, exist_ok=True)
        image_path = root / f"{employee_id}.jpg"
        image_path.write_bytes(image_bytes)
        return image_path

    @staticmethod
    def _decimal_or_none(value: Any) -> Decimal | None:
        if value is None or value == "":
            return None
        return Decimal(str(value))

    @staticmethod
    def _parse_datetime(value: Any) -> datetime:
        if isinstance(value, datetime):
            return value
        if value:
            normalized = str(value).replace("Z", "+00:00")
            return datetime.fromisoformat(normalized)
        return _now()

    @staticmethod
    def _employee_to_dict(employee: Any, *, registered: bool | None = None) -> dict[str, Any]:
        faces = getattr(employee, "faces", None) or []
        department = getattr(employee, "department", None)
        position = getattr(employee, "position", None)
        status = str(employee.status)

        def date_value(value: Any) -> str | None:
            return value.isoformat() if value is not None and hasattr(value, "isoformat") else None

        return {
            "id": employee.id,
            "employee_id": employee.employeeCode,
            "name": employee.fullName,
            "email": employee.email,
            "phone": employee.phone,
            "department_id": employee.departmentId,
            "department": department.name if department else None,
            "position_id": employee.positionId,
            "position": position.name if position else None,
            "avatar_path": employee.avatarPath,
            "date_of_birth": date_value(employee.dateOfBirth),
            "hire_date": date_value(employee.hireDate),
            "termination_date": date_value(employee.terminationDate),
            "status": status,
            "status_code": status.lower(),
            "metadata": employee.metadata,
            "registered": bool(faces) if registered is None else registered,
            "has_face": bool(faces) if registered is None else registered,
            "face_count": len(faces) if registered is None else (1 if registered else 0),
        }

    async def _find_account(self, account_id: str) -> Any:
        return await self.client.useraccount.find_first(
            where={"OR": [{"id": account_id}, {"username": account_id}]},
        )

    @staticmethod
    def _account_to_dict(account: Any) -> dict[str, Any]:
        return {
            "id": account.id,
            "username": account.username,
            "role": str(account.role),
            "organization_id": account.organizationId,
            "is_active": account.isActive,
        }

    @staticmethod
    def _camera_to_dict(camera: Any) -> dict[str, Any]:
        return {
            "id": camera.id,
            "name": camera.name,
            "camera_type": str(camera.type).lower(),
            "connection_url": camera.connectionUrl,
            "username": camera.username,
            "password_secret": camera.passwordSecret,
            "camera_options": {
                key: value
                for key, value in (camera.options or {}).items()
                if key not in {"fps_limit", "stream_jpeg_quality", "skip_ai_frames", "no_motion_delay"}
            },
            "processing_options": {
                key: value
                for key, value in (camera.options or {}).items()
                if key in {"fps_limit", "stream_jpeg_quality", "skip_ai_frames", "no_motion_delay"}
            },
            "is_default": camera.isDefault,
            "is_active": camera.isActive,
        }

    @staticmethod
    def _attendance_to_dict(record: Any) -> dict[str, Any]:
        attendance_type = "auto"
        employee = getattr(record, "employee", None)
        camera = getattr(record, "camera", None)
        return {
            "id": record.id,
            "employee_id": employee.employeeCode if employee else record.employeeId,
            "employee_name": employee.fullName if employee else None,
            "camera_id": camera.id if camera else record.cameraId,
            "camera_name": camera.name if camera else None,
            "attendance_type": attendance_type,
            "status": str(record.status).lower(),
            "captured_at": record.capturedAt.isoformat(),
            "confidence": float(record.confidence) if record.confidence is not None else None,
        }
