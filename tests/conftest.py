from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.repository import InMemoryRepository
from app.main import create_app


@pytest.fixture
def repository() -> InMemoryRepository:
    """Return an isolated in-memory tenant for every API test."""
    value = InMemoryRepository()
    value.seed_user("admin.test", "test-password", role="ADMIN")
    value.seed_user("staff.test", "test-password", role="STAFF")
    return value


@pytest.fixture
def test_app(repository: InMemoryRepository) -> FastAPI:
    return create_app(repository=repository)


@pytest.fixture
def client(test_app: FastAPI) -> Iterator[TestClient]:
    with TestClient(test_app) as value:
        yield value


def _login(client: TestClient, username: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "test-password"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def admin_headers(client: TestClient) -> dict[str, str]:
    return _login(client, "admin.test")


@pytest.fixture
def staff_headers(client: TestClient) -> dict[str, str]:
    return _login(client, "staff.test")
