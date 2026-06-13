from datetime import timedelta
from app.core.auth import create_token, decode_token, require_auth, verify_admin_credentials
from app.config import settings
from fastapi import HTTPException
from jose import JWTError
import pytest

def test_create_and_decode_token():
    token = create_token("admin", timedelta(minutes=15), settings.jwt_secret, settings.jwt_algorithm)
    payload = decode_token(token, settings.jwt_secret, settings.jwt_algorithm)
    assert payload["sub"] == "admin"

def test_decode_invalid_token():
    with pytest.raises(JWTError):
        decode_token("not.a.token", settings.jwt_secret, settings.jwt_algorithm)

def test_expired_token_raises():
    token = create_token("admin", timedelta(seconds=-1), settings.jwt_secret, settings.jwt_algorithm)
    with pytest.raises(JWTError):
        decode_token(token, settings.jwt_secret, settings.jwt_algorithm)

def test_verify_credentials_correct():
    assert verify_admin_credentials("admin", "changeme") is True

def test_verify_credentials_wrong_password():
    assert verify_admin_credentials("admin", "wrong") is False

def test_verify_credentials_wrong_username():
    assert verify_admin_credentials("wrong", "changeme") is False
