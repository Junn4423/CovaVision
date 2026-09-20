from __future__ import annotations

import re
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from app.api.deps import bearer_scheme, get_current_user, get_repository
from app.core.config import settings
from app.core.security import create_access_token
from app.db.repository import Repository

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# SEC-02: Simple in-memory sliding-window rate limiter for login.
# ---------------------------------------------------------------------------
_login_attempts: dict[str, list[float]] = defaultdict(list)


def _check_login_rate_limit(client_ip: str) -> None:
    """Raise 429 if the IP exceeds the configured login rate limit."""
    now = time.monotonic()
    window = settings.login_rate_limit_window_seconds
    max_attempts = settings.login_rate_limit_max
    timestamps = _login_attempts[client_ip]
    # Purge entries outside the sliding window.
    _login_attempts[client_ip] = [ts for ts in timestamps if now - ts < window]
    if len(_login_attempts[client_ip]) >= max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Quá nhiều lần thử đăng nhập. Vui lòng đợi {window // 60} phút.",
        )


def _record_login_failure(client_ip: str) -> None:
    _login_attempts[client_ip].append(time.monotonic())


class LoginRequest(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=255)
    identifier: str | None = Field(default=None, min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=255)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=6, max_length=255)
    full_name: str = Field(default="", max_length=255)
    organization_name: str = Field(default="", max_length=255)


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(min_length=20, max_length=8192)


_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _normalize_email(value: str) -> str:
    email = value.strip().lower()
    if not _EMAIL_RE.fullmatch(email):
        raise HTTPException(status_code=422, detail="Email không hợp lệ")
    return email


async def _issue_session(user: dict[str, Any], repository: Repository) -> dict[str, Any]:
    token = create_access_token(
        str(user["username"]),
        role=str(user.get("role", "STAFF")),
        organization_id=str(user.get("organization_id") or ""),
        user_id=str(user["id"]),
    )
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.access_token_expire_seconds)
    await repository.create_access_session(str(user["id"]), token, expires_at)
    public_user = {key: value for key, value in user.items() if key not in {"password_hash", "passwordHash"}}
    return {
        "success": True,
        "access_token": token,
        "token": token,
        "token_type": "bearer",
        "user": public_user,
    }


@router.post("/login")
async def login(
    payload: LoginRequest,
    request: Request,
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    client_ip = request.client.host if request.client else "unknown"
    _check_login_rate_limit(client_ip)
    identifier = (payload.identifier or payload.username or "").strip()
    if not identifier:
        raise HTTPException(status_code=422, detail="identifier hoặc username là bắt buộc")
    user = await repository.authenticate(identifier, payload.password)
    if user is None:
        _record_login_failure(client_ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email/tài khoản hoặc mật khẩu không đúng")
    _login_attempts.pop(client_ip, None)
    return await _issue_session(user, repository)


@router.post("/register")
async def register(
    payload: RegisterRequest,
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    email = _normalize_email(payload.email)
    try:
        user = await repository.register_account(
            email,
            payload.password,
            payload.full_name.strip(),
            payload.organization_name.strip(),
        )
    except ValueError as exc:
        if str(exc) == "email_already_registered":
            raise HTTPException(status_code=409, detail="Email đã được đăng ký") from exc
        raise HTTPException(status_code=422, detail="Không thể tạo tài khoản") from exc
    return await _issue_session(user, repository)


def _verify_google_id_token(id_token: str) -> dict[str, Any]:
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google OAuth chưa được cấu hình ở backend")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        claims = google_id_token.verify_oauth2_token(
            id_token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Backend thiếu gói google-auth") from exc
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Google token không hợp lệ hoặc đã hết hạn") from exc
    email = str(claims.get("email") or "").strip().lower()
    if not email or claims.get("email_verified") is not True or not claims.get("sub"):
        raise HTTPException(status_code=401, detail="Tài khoản Google chưa xác thực email")
    hosted_domain = settings.google_allowed_hosted_domain.strip().lower()
    if hosted_domain and str(claims.get("hd") or "").lower() != hosted_domain:
        raise HTTPException(status_code=403, detail="Email Google không thuộc domain được cho phép")
    return {"email": email, "subject": str(claims["sub"]), "name": str(claims.get("name") or email.split("@", 1)[0])}


@router.post("/google")
async def google_login(
    payload: GoogleLoginRequest,
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    claims = _verify_google_id_token(payload.id_token)
    try:
        user = await repository.authenticate_google(claims["email"], claims["subject"], claims["name"])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Không thể tạo phiên Google") from exc
    return await _issue_session(user, repository)


@router.post("/logout")
async def logout(
    _: dict[str, Any] = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    if credentials is not None:
        await repository.revoke_access_session(credentials.credentials)
    return {"success": True}


@router.get("/me")
async def me(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "success": True,
        "authenticated": True,
        "is_admin": current_user.get("role") in {"ADMIN", "HR_MANAGER"},
        "user": {
            "username": current_user.get("sub"),
            "role": current_user.get("role"),
            "organization_id": current_user.get("organization_id"),
        },
    }
