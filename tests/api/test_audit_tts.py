from __future__ import annotations

from fastapi.testclient import TestClient


def test_audit_logs_are_admin_only(
    client: TestClient,
    repository,
    admin_headers: dict[str, str],
    staff_headers: dict[str, str],
) -> None:
    import asyncio

    asyncio.run(repository.create_audit_log({
        "organization_id": repository.organization_id,
        "action": "test.action",
        "entity_type": "test",
        "entity_id": "1",
    }))
    assert client.get("/api/v1/audit/logs", headers=staff_headers).status_code == 403
    logs = client.get("/api/v1/audit/logs?limit=10", headers=admin_headers)
    assert logs.status_code == 200
    assert logs.json()["success"] is True
    assert logs.json()["logs"] == logs.json()["audit_logs"]
    assert any(item["action"] == "test.action" for item in logs.json()["logs"])


def test_tts_get_head_cache_and_failure_paths(monkeypatch, client: TestClient) -> None:
    monkeypatch.setattr("app.api.routes.tts._get_google_tts_bytes", lambda _text, _lang: b"fake-mp3")

    get_response = client.get("/api/v1/tts?text=Xin%20chao&lang=vi")
    assert get_response.status_code == 200
    assert get_response.headers["content-type"] == "audio/mpeg"
    assert get_response.content == b"fake-mp3"

    head_response = client.head("/api/v1/tts?text=Xin%20chao")
    assert head_response.status_code == 200
    assert head_response.headers["content-type"] == "audio/mpeg"

    assert client.get("/api/v1/tts").status_code == 422
    assert client.get("/api/v1/tts?text=%20%20").status_code == 400

    monkeypatch.setattr("app.api.routes.tts._get_google_tts_bytes", lambda _text, _lang: None)
    assert client.get("/api/v1/tts?text=unavailable").status_code == 503
