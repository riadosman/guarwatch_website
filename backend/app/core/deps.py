from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import verify_device_token
from app.db import SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbSession = Annotated[Session, Depends(get_db)]


def require_device_auth(
    device_id: Annotated[str, Path()],
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    if not verify_device_token(settings.device_token_map(), device_id, token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid device token")
    return device_id
