# backend/tests/test_webhooks.py
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(uploads_tmp):
    from app.main import create_app as _create_app
    c = TestClient(_create_app())
    c.post("/auth/login", json={"username": "admin", "password": "changeme"})
    return c


def test_create_and_list_webhook(client):
    res = client.post(
        "/api/webhooks",
        json={"name": "Slack", "url": "https://hooks.example.com/x", "event_types": ["UYUYOR"]},
    )
    assert res.status_code == 201
    wid = res.json()["id"]
    res2 = client.get("/api/webhooks")
    assert any(w["id"] == wid for w in res2.json())


def test_toggle_webhook(client):
    res = client.post(
        "/api/webhooks",
        json={"name": "Test", "url": "https://x.example.com", "event_types": []},
    )
    wid = res.json()["id"]
    res2 = client.patch(f"/api/webhooks/{wid}", json={"enabled": False})
    assert res2.status_code == 200
    assert res2.json()["enabled"] is False


def test_delete_webhook(client):
    res = client.post(
        "/api/webhooks",
        json={"name": "ToDelete", "url": "https://y.example.com", "event_types": []},
    )
    wid = res.json()["id"]
    res2 = client.delete(f"/api/webhooks/{wid}")
    assert res2.status_code == 204
