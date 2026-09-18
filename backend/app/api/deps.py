from __future__ import annotations

from typing import Any, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token
from app.db.repository import Repository
from app.recognition.service import RecognitionService

bearer_scheme = HTTPBearer(auto_error=False)


def get_repository(request: Request) -> Repository:
    return request.app.state.repository


def get_recognition_service(request: Request, repository: Repository = Depends(get_repository)) -> RecognitionService:
    service = getattr(request.app.state, "recognition_service", None)
    if service is None or service.repository is not repository:
        service = RecognitionService(repository)
        request.app.state.recognition_service = service
    return service


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict[str, Any]:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        return decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token") from exc
