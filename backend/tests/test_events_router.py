import io
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import hash_token
from app.models import Device


@pytest.fixture
def device(session: Session) -> Device:
    d = Device(id=uuid.uuid4(), name="DemoJetson", device_token="tok-abc", token_hash=hash_token("tok-abc"))
    session.add(d)
    session.commit()
    return d


def _payload(idx: int = 1) -> dict:
    return {
        "agent_event_id": idx,
        "type": "UYUYOR",
        "track_id": 5,
        "occurred_at": datetime(2026, 5, 5, 12, 0, 0, tzinfo=timezone.utc).isoformat(),
        "metadata": {"perclos": 91.2},
    }


def _multipart(payload: dict, image: bytes) -> dict:
    return {
        "files": {
            "payload": ("payload.json", json.dumps(payload), "application/json"),
            "screenshot": ("violation.jpg", io.BytesIO(image), "image/jpeg"),
        }
    }


@pytest.fixture(autouse=True)
def _truncate_events(session: Session):
    yield
    from app.models import Event
    session.execute(__import__("sqlalchemy").delete(Event))
    session.commit()


def test_post_event_creates_row_and_returns_201(client: TestClient, device: Device):
    res = client.post(
        f"/api/devices/{device.id}/events",
        headers={"Authorization": "Bearer tok-abc"},
        **_multipart(_payload(1), b"\xff\xd8\xff\xe0fake"),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["device_id"] == str(device.id)
    assert body["screenshot_url"].endswith(".jpg")


def test_post_event_rejects_bad_token(client: TestClient, device: Device):
    res = client.post(
        f"/api/devices/{device.id}/events",
        headers={"Authorization": "Bearer wrong"},
        **_multipart(_payload(2), b"x"),
    )
    assert res.status_code == 401


def test_post_event_idempotent_returns_409(client: TestClient, device: Device):
    headers = {"Authorization": "Bearer tok-abc"}
    client.post(f"/api/devices/{device.id}/events", headers=headers, **_multipart(_payload(9), b"\xff\xd8\xff\xe0a"))
    res = client.post(
        f"/api/devices/{device.id}/events", headers=headers, **_multipart(_payload(9), b"\xff\xd8\xff\xe0b")
    )
    assert res.status_code == 409


def test_post_event_rejects_oversize_screenshot(
    client: TestClient, device: Device, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "max_screenshot_bytes", 10)
    res = client.post(
        f"/api/devices/{device.id}/events",
        headers={"Authorization": "Bearer tok-abc"},
        **_multipart(_payload(3), b"x" * 50),
    )
    assert res.status_code == 413


def test_get_events_returns_recent_first(client: TestClient, device: Device):
    headers = {"Authorization": "Bearer tok-abc"}
    for i in range(3):
        client.post(
            f"/api/devices/{device.id}/events",
            headers=headers,
            **_multipart(_payload(i), b"\xff\xd8\xff\xe0x"),
        )
    res = client.get("/api/events?limit=10")
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 3
    ids = [e["agent_event_id"] for e in items]
    assert ids == sorted(ids, reverse=True)


def test_post_event_broadcasts_to_ws_panel(client: TestClient, device: Device):
    headers = {"Authorization": "Bearer tok-abc"}
    with client.websocket_connect("/ws/panel") as ws:
        client.post(
            f"/api/devices/{device.id}/events",
            headers=headers,
            **_multipart(_payload(99), b"\xff\xd8\xff\xe0img"),
        )
        msg = ws.receive_json()
        assert msg["type"] == "event_created"
        assert msg["payload"]["agent_event_id"] == 99
        assert msg["payload"]["type"] == "UYUYOR"


def test_list_events_paginated(client: TestClient):
    res = client.get("/api/events?page=1&page_size=10")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data


def test_export_csv(client: TestClient):
    res = client.get("/api/events/export")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "id" in res.text  # CSV header row
