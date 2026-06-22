import pytest
from unittest.mock import AsyncMock
from guardwatch_website.relay.terminal_hub import TerminalHub


@pytest.fixture
def hub():
    return TerminalHub()


@pytest.fixture
def mock_ws():
    ws = AsyncMock()
    ws.send_text = AsyncMock()
    return ws


async def test_next_channel_starts_at_2(hub):
    assert hub.next_channel("device-1") == 2


async def test_next_channel_increments_when_occupied(hub, mock_ws):
    hub.register_browser("device-1", 2, mock_ws)
    assert hub.next_channel("device-1") == 3


async def test_next_channel_independent_per_device(hub, mock_ws):
    hub.register_browser("device-1", 2, mock_ws)
    assert hub.next_channel("device-2") == 2


async def test_forward_sends_to_browser(hub, mock_ws):
    hub.register_browser("device-1", 2, mock_ws)
    await hub.forward_to_browser("device-1", 2, "hello")
    mock_ws.send_text.assert_called_once_with("hello")


async def test_forward_silently_ignores_missing_session(hub):
    # raises nada
    await hub.forward_to_browser("nonexistent", 2, "hello")


async def test_forward_unregisters_on_error(hub, mock_ws):
    mock_ws.send_text.side_effect = Exception("broken pipe")
    hub.register_browser("device-1", 2, mock_ws)
    await hub.forward_to_browser("device-1", 2, "hello")
    assert hub.next_channel("device-1") == 2  # kanal 2 artık serbest
