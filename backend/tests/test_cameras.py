"""
Camera discovery + CRUD endpoint tests.

NOTE: These tests require Docker (testcontainers/postgres:16-alpine).
      If Docker is not running, the session-scoped pg_url fixture in conftest.py
      will fail at collection time. Run with:
          cd backend && pytest tests/test_cameras.py -v
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.camera import Camera
from app.models.device import Device
from app.core.security import hash_token


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_device(session: Session) -> tuple[Device, str]:
    """Insert a Device row and return (device, plain_token)."""
    plain_token = "a" * 64
    device = Device(
        name="TestDevice",
        device_token=plain_token,
        token_hash=hash_token(plain_token),
    )
    session.add(device)
    session.commit()
    session.refresh(device)
    return device, plain_token


# ---------------------------------------------------------------------------
# POST /api/devices/{device_id}/cameras  — discovery
# ---------------------------------------------------------------------------

def test_report_cameras_creates_new(client: TestClient, session: Session):
    device, token = _create_device(session)
    device_id = str(device.id)

    payload = [
        {"name": "Kamera 1", "rtsp_url": "rtsp://192.168.1.100:554/ch1"},
        {"name": "Kamera 2", "rtsp_url": "rtsp://192.168.1.101:554/ch1"},
    ]
    res = client.post(
        f"/api/devices/{device_id}/cameras",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["updated"] == 2
    assert len(data["cameras"]) == 2
    # Each entry must have id + rtsp_url
    for entry in data["cameras"]:
        assert "id" in entry
        assert "rtsp_url" in entry


def test_report_cameras_updates_existing(client: TestClient, session: Session):
    device, token = _create_device(session)
    device_id = str(device.id)

    rtsp = "rtsp://192.168.1.200:554/stream"
    # Insert an existing camera
    cam = Camera(name="Old Name", rtsp_url=rtsp, device_id=device.id, is_online=False)
    session.add(cam)
    session.commit()
    cam_id = cam.id

    # Report the same URL — should update, not create a duplicate
    res = client.post(
        f"/api/devices/{device_id}/cameras",
        json=[{"name": "New Name", "rtsp_url": rtsp}],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json()["updated"] == 1

    session.expire_all()
    updated = session.query(Camera).filter(Camera.id == cam_id).first()
    assert updated is not None
    assert updated.is_online is True


def test_report_cameras_marks_missing_offline(client: TestClient, session: Session):
    device, token = _create_device(session)
    device_id = str(device.id)

    rtsp_kept = "rtsp://10.0.0.1:554/kept"
    rtsp_gone = "rtsp://10.0.0.2:554/gone"

    cam_kept = Camera(name="Kept", rtsp_url=rtsp_kept, device_id=device.id, is_online=True)
    cam_gone = Camera(name="Gone", rtsp_url=rtsp_gone, device_id=device.id, is_online=True)
    session.add_all([cam_kept, cam_gone])
    session.commit()
    gone_id = cam_gone.id

    # Report only the kept camera
    res = client.post(
        f"/api/devices/{device_id}/cameras",
        json=[{"name": "Kept", "rtsp_url": rtsp_kept}],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200

    session.expire_all()
    offline_cam = session.query(Camera).filter(Camera.id == gone_id).first()
    assert offline_cam is not None
    assert offline_cam.is_online is False


def test_report_cameras_requires_device_token(client: TestClient, session: Session):
    device, _token = _create_device(session)
    res = client.post(
        f"/api/devices/{device.id}/cameras",
        json=[{"name": "X", "rtsp_url": "rtsp://x:554/s"}],
        headers={"Authorization": "Bearer wrongtoken"},
    )
    assert res.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/devices/{device_id}/cameras
# ---------------------------------------------------------------------------

def test_get_device_cameras(client: TestClient, session: Session):
    device, _token = _create_device(session)
    cam = Camera(name="CamA", rtsp_url="rtsp://cam-a:554/0", device_id=device.id, is_online=True)
    session.add(cam)
    session.commit()

    res = client.get(f"/api/devices/{device.id}/cameras")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert any(c["rtsp_url"] == "rtsp://cam-a:554/0" for c in data)


def test_get_device_cameras_requires_auth(client: TestClient, session: Session):
    """A fresh client (no login cookie) should get 401."""
    from app.main import create_app
    anon = TestClient(create_app())
    device, _token = _create_device(session)
    res = anon.get(f"/api/devices/{device.id}/cameras")
    assert res.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /api/cameras/{cam_id}
# ---------------------------------------------------------------------------

def test_patch_camera_name(client: TestClient, session: Session):
    device, _token = _create_device(session)
    cam = Camera(name="Before", rtsp_url="rtsp://cam-p:554/0", device_id=device.id, is_online=True)
    session.add(cam)
    session.commit()
    cam_id = str(cam.id)

    res = client.patch(f"/api/cameras/{cam_id}", json={"name": "After"})
    assert res.status_code == 200
    assert res.json()["name"] == "After"


def test_patch_camera_not_found(client: TestClient):
    res = client.patch(f"/api/cameras/{uuid.uuid4()}", json={"name": "X"})
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/cameras/{cam_id}
# ---------------------------------------------------------------------------

def test_delete_camera(client: TestClient, session: Session):
    device, _token = _create_device(session)
    cam = Camera(name="ToDelete", rtsp_url="rtsp://cam-d:554/0", device_id=device.id, is_online=True)
    session.add(cam)
    session.commit()
    cam_id = str(cam.id)

    res = client.delete(f"/api/cameras/{cam_id}")
    assert res.status_code == 204

    session.expire_all()
    assert session.query(Camera).filter(Camera.id == cam.id).first() is None


def test_delete_camera_not_found(client: TestClient):
    res = client.delete(f"/api/cameras/{uuid.uuid4()}")
    assert res.status_code == 404
