"""Password hashing and signed access tokens for the CovaVision API."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Optional

from app.core.config import settings

_PASSWORD_ALGORITHM = "sha256"
_PASSWORD_ITERATIONS = 310_000


def _urlsafe_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _urlsafe_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    if not password:
        raise ValueError("password must not be empty")
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        _PASSWORD_ALGORITHM,
        password.encode("utf-8"),
        salt,
        _PASSWORD_ITERATIONS,
    )
    return f"pbkdf2_{_PASSWORD_ALGORITHM}${_PASSWORD_ITERATIONS}${_urlsafe_encode(salt)}${_urlsafe_encode(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, digest_text = str(encoded).split("$", 3)
        if algorithm != f"pbkdf2_{_PASSWORD_ALGORITHM}":
            return False
        iterations = int(iterations_text)
        expected = _urlsafe_decode(digest_text)
        actual = hashlib.pbkdf2_hmac(
            _PASSWORD_ALGORITHM,
            password.encode("utf-8"),
            _urlsafe_decode(salt_text),
            iterations,
        )
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


def create_access_token(subject: str, *, role: str, expires_in_seconds: Optional[int] = None) -> str:
    now = int(time.time())
    expires = now + int(expires_in_seconds or settings.access_token_expire_seconds)
    header = _urlsafe_encode(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _urlsafe_encode(json.dumps({"sub": subject, "role": role, "iat": now, "exp": expires}, separators=(",", ":")).encode())
    unsigned = f"{header}.{payload}".encode("ascii")
    signature = hmac.new(settings.jwt_secret.encode("utf-8"), unsigned, hashlib.sha256).digest()
    return f"{header}.{payload}.{_urlsafe_encode(signature)}"


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        header_text, payload_text, signature_text = str(token).split(".", 2)
        unsigned = f"{header_text}.{payload_text}".encode("ascii")
        expected_signature = hmac.new(settings.jwt_secret.encode("utf-8"), unsigned, hashlib.sha256).digest()
        if not hmac.compare_digest(_urlsafe_decode(signature_text), expected_signature):
            raise ValueError("invalid token signature")
        header = json.loads(_urlsafe_decode(header_text))
        payload = json.loads(_urlsafe_decode(payload_text))
        if header.get("alg") != "HS256" or int(payload.get("exp", 0)) <= int(time.time()):
            raise ValueError("expired or invalid token")
        if not payload.get("sub"):
            raise ValueError("token subject is missing")
        return payload
    except (TypeError, ValueError, KeyError, json.JSONDecodeError) as exc:
        raise ValueError("invalid access token") from exc
