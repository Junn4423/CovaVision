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


def test_tts_provider_cache_and_network_failures(monkeypatch) -> None:
    import app.api.routes.tts as tts

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b"a" * 101

    tts._AUDIO_CACHE.clear()
    calls = []
    monkeypatch.setattr(tts.urllib.request, "urlopen", lambda *_args, **_kwargs: calls.append(1) or Response())
    assert tts._get_google_tts_bytes("hello", "vi") == b"a" * 101
    assert tts._get_google_tts_bytes("hello", "vi") == b"a" * 101
    assert len(calls) == 1

    class ShortResponse(Response):
        def read(self):
            return b"tiny"

    monkeypatch.setattr(tts.urllib.request, "urlopen", lambda *_args, **_kwargs: ShortResponse())
    assert tts._get_google_tts_bytes("short", "vi") is None
    monkeypatch.setattr(tts.urllib.request, "urlopen", lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError()))
    assert tts._get_google_tts_bytes("offline", "vi") is None
