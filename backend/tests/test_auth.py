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


from fastapi.testclient import TestClient


@pytest.fixture
def auth_client():
    from app.main import create_app
    return TestClient(create_app())


def test_login_success(auth_client):
    res = auth_client.post("/auth/login", json={"username": "admin", "password": "changeme"})
    assert res.status_code == 200
    assert "access_token" in res.cookies


def test_login_wrong_password(auth_client):
    res = auth_client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert res.status_code == 401


def test_logout_clears_cookies(auth_client):
    auth_client.post("/auth/login", json={"username": "admin", "password": "changeme"})
    res = auth_client.post("/auth/logout")
    assert res.status_code == 200


def test_refresh_rotates_token(auth_client):
    auth_client.post("/auth/login", json={"username": "admin", "password": "changeme"})
    res = auth_client.post("/auth/refresh")
    assert res.status_code == 200
    assert "access_token" in res.cookies


def test_list_events_requires_auth(auth_client):
    res = auth_client.get("/api/events")
    assert res.status_code == 401


def test_list_events_with_auth(auth_client):
    auth_client.post("/auth/login", json={"username": "admin", "password": "changeme"})
    res = auth_client.get("/api/events")
    assert res.status_code == 200
