from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Response, status
from jose import JWTError
from pydantic import BaseModel

from app.config import settings
from app.core.auth import (
    clear_auth_cookies,
    create_token,
    decode_token,
    set_auth_cookies,
    verify_admin_credentials,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(body: LoginRequest, response: Response) -> dict:
    if not verify_admin_credentials(body.username, body.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    access = create_token("admin", timedelta(minutes=settings.access_token_ttl_min), settings.jwt_secret, settings.jwt_algorithm)
    refresh = create_token("admin", timedelta(days=settings.refresh_token_ttl_days), settings.jwt_secret, settings.jwt_algorithm)
    set_auth_cookies(response, access, refresh)
    return {"ok": True}


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
        sub = payload.get("sub", "admin")
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid refresh token")
    access = create_token(sub, timedelta(minutes=settings.access_token_ttl_min), settings.jwt_secret, settings.jwt_algorithm)
    new_refresh = create_token(sub, timedelta(days=settings.refresh_token_ttl_days), settings.jwt_secret, settings.jwt_algorithm)
    set_auth_cookies(response, access, new_refresh)
    return {"ok": True}
