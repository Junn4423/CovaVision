from __future__ import annotations

import json
from typing import Any

from fastapi import Request

from app.core.config import settings
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
                # SEC-08: Enforce upload size limit early.
                if len(image_bytes) > settings.max_image_upload_bytes:
                    raise ValueError(
                        f"Ảnh vượt quá giới hạn {settings.max_image_upload_bytes // (1024 * 1024)} MB"
                    )
                break
    elif "application/json" in content_type:
        try:
            body = await request.json()
        except json.JSONDecodeError as exc:
            raise ValueError("JSON request không hợp lệ") from exc
        payload = body if isinstance(body, dict) else {}
    else:
        image_bytes = await request.body()
        if len(image_bytes) > settings.max_image_upload_bytes:
            raise ValueError(
                f"Ảnh vượt quá giới hạn {settings.max_image_upload_bytes // (1024 * 1024)} MB"
            )

    if not image_bytes:
        encoded = payload.get("image_base64") or payload.get("imageBase64") or payload.get("base64")
        if encoded:
            image_bytes = decode_image_base64(str(encoded))
            if len(image_bytes) > settings.max_image_upload_bytes:
                raise ValueError(
                    f"Ảnh giải mã vượt quá giới hạn {settings.max_image_upload_bytes // (1024 * 1024)} MB"
                )

    if not image_bytes:
        raise ValueError("Cần gửi image_base64 hoặc file ảnh")
    return payload, image_bytes


def similarity_threshold(payload: dict[str, Any]) -> float | None:
    """Extract and validate similarity threshold from the request payload.

    API-01: Ensures the returned value is clamped to the valid [0.0, 1.0] range.
    """
    explicit = payload.get("similarity_threshold")
    if explicit is not None:
        try:
            value = float(explicit)
        except (TypeError, ValueError):
            raise ValueError("similarity_threshold phải là số thực trong khoảng 0.0 – 1.0")
        return max(0.0, min(1.0, value))
    tolerance = payload.get("tolerance")
    if tolerance is not None:
        try:
            value = float(tolerance)
        except (TypeError, ValueError):
            raise ValueError("tolerance phải là số thực trong khoảng 0.0 – 1.0")
        return max(0.0, min(1.0, 1.0 - value))
    return None
