from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from jose import JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth import (
    _verify_jwt,
    clear_auth_cookies,
    create_token,
    decode_token,
    set_auth_cookies,
    verify_admin_credentials,
)
from app.core.deps import get_db
from app.core.security import hash_token
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)) -> dict:
    db_user = db.query(User).filter(User.username == body.username).first()
    if db_user:
        if hash_token(body.password) != db_user.password_hash:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    else:
        if not verify_admin_credentials(body.username, body.password):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")

    access = create_token(body.username, timedelta(minutes=settings.access_token_ttl_min), settings.jwt_secret, settings.jwt_algorithm)
    refresh = create_token(body.username, timedelta(days=settings.refresh_token_ttl_days), settings.jwt_secret, settings.jwt_algorithm)
    set_auth_cookies(response, access, refresh)
    return {"ok": True}


@router.get("/me")
async def get_me(
    access_token: Annotated[str | None, Cookie()] = None,
    db: Session = Depends(get_db),
) -> dict:
    sub = _verify_jwt(access_token)
    if sub is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not authenticated")

    user = db.query(User).filter(User.username == sub).first()
    if user is None:
        # Config-only admin (no DB row) — treat as super admin
        return {
            "username": sub,
            "role": "SuperAdmin",
            "role_id": None,
            "permissions": {},
            "is_super_admin": True,
        }

    permissions: dict = {}
    role_name: str | None = None
    if user.role:
        role_name = user.role.name
        for perm in user.role.permissions:
            permissions[perm.service] = {
                "read": perm.can_read,
                "create": perm.can_create,
                "update": perm.can_update,
                "delete": perm.can_delete,
            }

    # SuperAdmin role always has full access
    is_super = role_name == "SuperAdmin"

    return {
        "username": user.username,
        "role": role_name,
        "role_id": user.role_id,
        "permissions": permissions,
        "is_super_admin": is_super,
    }


@router.post("/logout")
async def logout(response: Response) -> dict:
    clear_auth_cookies(response)
    return {"ok": True}


@router.post("/refresh")
async def refresh(response: Response, refresh_token: Annotated[str | None, Cookie()] = None) -> dict:
    if not refresh_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no refresh token")
    try:
        payload = decode_token(refresh_token, settings.jwt_secret, settings.jwt_algorithm)
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid refresh token")
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid refresh token")
    access = create_token(sub, timedelta(minutes=settings.access_token_ttl_min), settings.jwt_secret, settings.jwt_algorithm)
    new_refresh = create_token(sub, timedelta(days=settings.refresh_token_ttl_days), settings.jwt_secret, settings.jwt_algorithm)
    set_auth_cookies(response, access, new_refresh)
    return {"ok": True}
