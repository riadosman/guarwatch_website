import pytest
from unittest.mock import AsyncMock, MagicMock
from guardwatch_website.relay.connection_mgr import ConnectionManager


@pytest.fixture
def manager():
    return ConnectionManager()


@pytest.fixture
def mock_ws():
    ws = AsyncMock()
    ws.send_json = AsyncMock()
    return ws


async def test_register_makes_device_online(manager, mock_ws):
    await manager.register("device-1", mock_ws)
    assert manager.is_online("device-1")


async def test_unregister_makes_device_offline(manager, mock_ws):
    await manager.register("device-1", mock_ws)
    await manager.unregister("device-1")
    assert not manager.is_online("device-1")


async def test_send_returns_true_when_online(manager, mock_ws):
    await manager.register("device-1", mock_ws)
    result = await manager.send("device-1", {"type": "test"})
    assert result is True
    mock_ws.send_json.assert_called_once_with({"type": "test"})


async def test_send_returns_false_when_offline(manager):
    result = await manager.send("nonexistent", {"type": "test"})
    assert result is False


async def test_send_unregisters_on_error(manager, mock_ws):
    mock_ws.send_json.side_effect = Exception("connection lost")
    await manager.register("device-1", mock_ws)
    result = await manager.send("device-1", {"type": "test"})
    assert result is False
    assert not manager.is_online("device-1")


async def test_online_devices_lists_all(manager, mock_ws):
    await manager.register("d1", mock_ws)
    await manager.register("d2", mock_ws)
    devices = manager.online_devices()
    assert set(devices) == {"d1", "d2"}
