from __future__ import annotations

import base64
import json

import pytest
from starlette.requests import Request

from app.api.image_input import read_image_request, similarity_threshold


def _request(body: bytes, content_type: str = "application/json") -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/test",
        "raw_path": b"/test",
        "query_string": b"",
        "headers": [(b"content-type", content_type.encode())],
        "client": ("test", 1234),
        "server": ("test", 80),
        "scheme": "http",
        "http_version": "1.1",
    }

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(scope, receive)


@pytest.mark.asyncio
async def test_read_image_request_accepts_json_data_uri_and_raw_bytes() -> None:
    encoded = base64.b64encode(b"image-bytes").decode("ascii")
    payload, image = await read_image_request(
        _request(json.dumps({"image_base64": f"data:image/jpeg;base64,{encoded}"}).encode())
    )
    assert payload["image_base64"]
    assert image == b"image-bytes"

    payload, image = await read_image_request(_request(b"raw-image", "application/octet-stream"))
    assert payload == {}
    assert image == b"raw-image"


@pytest.mark.asyncio
async def test_read_image_request_rejects_invalid_json_missing_and_oversized_images(monkeypatch) -> None:
    with pytest.raises(ValueError):
        await read_image_request(_request(b"{"))
    with pytest.raises(ValueError):
        await read_image_request(_request(b"{}"))

    from app.core.config import settings

    monkeypatch.setattr(settings, "max_image_upload_bytes", 2)
    with pytest.raises(ValueError):
        await read_image_request(_request(b"large", "application/octet-stream"))


def test_similarity_threshold_uses_server_safe_bounds() -> None:
    assert similarity_threshold({"similarity_threshold": 2}) == 1.0
    assert similarity_threshold({"similarity_threshold": -1}) == 0.0
    assert similarity_threshold({"tolerance": 0.25}) == 0.75
    assert similarity_threshold({}) is None
    with pytest.raises(ValueError):
        similarity_threshold({"similarity_threshold": "not-a-number"})
