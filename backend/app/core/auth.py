from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Cookie, HTTPException, Response, status
from jose import JWTError, jwt

from app.config import settings

_ACCESS_COOKIE = "access_token"
_REFRESH_COOKIE = "refresh_token"


def create_token(sub: str, ttl: timedelta, secret: str, algorithm: str) -> str:
    expire = datetime.now(timezone.utc) + ttl
    return jwt.encode({"sub": sub, "exp": expire}, secret, algorithm=algorithm)


def decode_token(token: str, secret: str, algorithm: str) -> dict:
    return jwt.decode(token, secret, algorithms=[algorithm])


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    opts = dict(httponly=True, samesite="lax", secure=settings.cookie_secure)
    response.set_cookie(_ACCESS_COOKIE, access_token, max_age=settings.access_token_ttl_min * 60, **opts)
    response.set_cookie(_REFRESH_COOKIE, refresh_token, max_age=settings.refresh_token_ttl_days * 86400, **opts)


def clear_auth_cookies(response: Response) -> None:
    opts = dict(httponly=True, samesite="lax", secure=settings.cookie_secure)
    response.delete_cookie(_ACCESS_COOKIE, **opts)
    response.delete_cookie(_REFRESH_COOKIE, **opts)


def _verify_jwt(token: str | None) -> str | None:
    if not token:
        return None
    try:
        payload = decode_token(token, settings.jwt_secret, settings.jwt_algorithm)
        return payload.get("sub")
    except JWTError:
        return None


async def require_auth(
    access_token: Annotated[str | None, Cookie()] = None,
) -> str:
    sub = _verify_jwt(access_token)
    if sub is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not authenticated")
    return sub


def verify_admin_credentials(username: str, password: str) -> bool:
    username_ok = hmac.compare_digest(username.encode(), settings.admin_username.encode())
    password_ok = hmac.compare_digest(password.encode(), settings.admin_password.encode())
    return username_ok and password_ok
