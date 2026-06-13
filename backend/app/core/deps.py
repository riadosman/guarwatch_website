import uuid as _uuid
from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.core.security import verify_token_hash
from app.db import SessionLocal
from app.models.device import Device


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbSession = Annotated[Session, Depends(get_db)]


def require_device_auth(
    device_id: Annotated[str, Path()],
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        device = db.get(Device, _uuid.UUID(device_id))
    except Exception:
        device = None
    if device is None or not verify_token_hash(device.token_hash, token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid device token")
    return device_id
