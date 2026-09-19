import time
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_user, get_repository
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
    _login_attempts[client_ip].append(now)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=255)


@router.post("/login")
async def login(
    payload: LoginRequest,
    request: Request,
    repository: Repository = Depends(get_repository),
) -> dict[str, Any]:
    client_ip = request.client.host if request.client else "unknown"
    _check_login_rate_limit(client_ip)
    user = await repository.authenticate(payload.username.strip(), payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    token = create_access_token(user["username"], role=str(user.get("role", "STAFF")))
    public_user = {key: value for key, value in user.items() if key not in {"password_hash", "passwordHash"}}
    return {
        "success": True,
        "access_token": token,
        "token": token,
        "token_type": "bearer",
        "user": public_user,
    }


@router.post("/logout")
async def logout(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    # Note: With stateless JWT the token remains technically valid until it
    # expires. A full server-side blacklist would be the next security
    # improvement, but the frontend already clears the token on logout.
    return {"success": True}


@router.get("/me")
async def me(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "success": True,
        "authenticated": True,
        "is_admin": current_user.get("role") in {"ADMIN", "HR_MANAGER"},
        "user": {"username": current_user.get("sub"), "role": current_user.get("role")},
    }


