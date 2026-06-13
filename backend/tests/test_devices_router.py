# backend/tests/test_devices_router.py
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(uploads_tmp):
    from app.main import create_app

    c = TestClient(create_app())
    c.post("/auth/login", json={"username": "admin", "password": "changeme"})
    return c


def test_list_devices_empty(client):
    # The test DB may have the seeded demo device; we just check the response is a list
    res = client.get("/api/devices")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_create_and_delete_device(client):
    res = client.post("/api/devices", json={"name": "Kule-1"})
    assert res.status_code == 201
    data = res.json()
    assert "token" in data
    assert len(data["token"]) == 64

    device_id = data["id"]
    res2 = client.get("/api/devices")
    assert any(d["id"] == device_id for d in res2.json())

    res3 = client.delete(f"/api/devices/{device_id}")
    assert res3.status_code == 204


def test_rename_device(client):
    res = client.post("/api/devices", json={"name": "OldName"})
    device_id = res.json()["id"]
    res2 = client.patch(f"/api/devices/{device_id}", json={"name": "NewName"})
    assert res2.status_code == 200
    assert res2.json()["name"] == "NewName"
