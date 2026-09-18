from __future__ import annotations

import json
from typing import Any

from fastapi import Request

from app.recognition.service import decode_image_base64


async def read_image_request(request: Request) -> tuple[dict[str, Any], bytes]:
    content_type = request.headers.get("content-type", "").lower()
    payload: dict[str, Any] = {}
    image_bytes = b""

    if content_type.startswith("multipart/"):
        form = await request.form()
        payload = {key: value for key, value in form.items() if isinstance(value, str)}
        for field_name in ("image", "file", "photo"):
            uploaded = form.get(field_name)
            if uploaded is not None and hasattr(uploaded, "read"):
                image_bytes = await uploaded.read()
                break
    elif "application/json" in content_type:
        try:
            body = await request.json()
        except json.JSONDecodeError as exc:
            raise ValueError("JSON request không hợp lệ") from exc
        payload = body if isinstance(body, dict) else {}
    else:
        image_bytes = await request.body()

    if not image_bytes:
        encoded = payload.get("image_base64") or payload.get("imageBase64") or payload.get("base64")
        if encoded:
            image_bytes = decode_image_base64(str(encoded))

    if not image_bytes:
        raise ValueError("Cần gửi image_base64 hoặc file ảnh")
    return payload, image_bytes


def similarity_threshold(payload: dict[str, Any]) -> float | None:
    explicit = payload.get("similarity_threshold")
    if explicit is not None:
        return float(explicit)
    tolerance = payload.get("tolerance")
    if tolerance is not None:
        return max(0.0, min(1.0, 1.0 - float(tolerance)))
    return None
