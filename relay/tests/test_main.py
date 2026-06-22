import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock


@pytest.fixture
def client():
    from relay.main import app
    return TestClient(app)


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_devices_empty(client):
    resp = client.get("/devices")
    assert resp.status_code == 200
    assert resp.json() == {"online": []}


def test_pair_invalid_code(client):
    resp = client.post("/pair", json={"code": "ZZZZZZ", "name": "Test"})
    assert resp.status_code == 400
    assert "Invalid" in resp.json()["detail"]


def test_pair_valid_code(client):
    from relay.main import pairing, manager
    # Kodu önceden üret
    code = pairing.generate_code("device-test")

    with patch("relay.main._register_device_in_backend", new_callable=AsyncMock) as mock_reg:
        mock_reg.return_value = "token-abc"
        with patch.object(manager, "send", new_callable=AsyncMock) as mock_send:
            resp = client.post("/pair", json={"code": code, "name": "Fabrika-A"})
            assert resp.status_code == 200
            data = resp.json()
            assert data["device_id"] == "device-test"
            assert data["token"] == "token-abc"
