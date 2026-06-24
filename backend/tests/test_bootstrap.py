"""Tests for POST /api/devices/bootstrap.

Uses the project's real-Postgres testcontainers fixture (see conftest.py).
Docker must be available for these tests to pass; without it they will error
at session setup with a Docker connection failure.
"""
import pytest
from fastapi.testclient import TestClient


def test_bootstrap_disabled_when_secret_empty(client: TestClient, monkeypatch):
    monkeypatch.setattr("app.routers.devices.settings", type("S", (), {"bootstrap_secret": ""})())
    res = client.post(
        "/api/devices/bootstrap",
        json={"name": "J1"},
        headers={"Authorization": "Bearer anything"},
    )
    assert res.status_code == 403


def test_bootstrap_rejects_wrong_secret(client: TestClient, monkeypatch):
    monkeypatch.setattr("app.routers.devices.settings", type("S", (), {"bootstrap_secret": "correct"})())
    res = client.post(
        "/api/devices/bootstrap",
        json={"name": "J1"},
        headers={"Authorization": "Bearer wrong"},
    )
    assert res.status_code == 401


def test_bootstrap_creates_device(client: TestClient, monkeypatch):
    monkeypatch.setattr(
        "app.routers.devices.settings",
        type("S", (), {"bootstrap_secret": "test-secret"})(),
    )
    res = client.post(
        "/api/devices/bootstrap",
        json={"name": "Jetson-1"},
        headers={"Authorization": "Bearer test-secret"},
    )
    assert res.status_code == 201
    data = res.json()
    assert "device_id" in data
    assert "token" in data
    assert data["name"] == "Jetson-1"
    assert len(data["token"]) == 64  # secrets.token_hex(32) produces 64 hex chars


def test_bootstrap_missing_auth_header(client: TestClient, monkeypatch):
    monkeypatch.setattr(
        "app.routers.devices.settings",
        type("S", (), {"bootstrap_secret": "test-secret"})(),
    )
    res = client.post("/api/devices/bootstrap", json={"name": "Jetson-2"})
    # No Authorization header → presented token is "" → compare_digest fails
    assert res.status_code == 401
