from datetime import timedelta
from app.core.auth import create_token, decode_token, require_auth
from app.config import settings
from fastapi import HTTPException
import pytest

def test_create_and_decode_token():
    token = create_token("admin", timedelta(minutes=15), settings.jwt_secret, settings.jwt_algorithm)
    payload = decode_token(token, settings.jwt_secret, settings.jwt_algorithm)
    assert payload["sub"] == "admin"

def test_decode_invalid_token():
    with pytest.raises(Exception):
        decode_token("not.a.token", settings.jwt_secret, settings.jwt_algorithm)
