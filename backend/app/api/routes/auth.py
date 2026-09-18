from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_user, get_repository
from app.core.security import create_access_token
from app.db.repository import Repository

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=255)


@router.post("/login")
async def login(payload: LoginRequest, repository: Repository = Depends(get_repository)) -> dict[str, Any]:
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
    return {"success": True}


@router.get("/me")
async def me(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "success": True,
        "authenticated": True,
        "is_admin": current_user.get("role") in {"ADMIN", "HR_MANAGER"},
        "user": {"username": current_user.get("sub"), "role": current_user.get("role")},
    }

