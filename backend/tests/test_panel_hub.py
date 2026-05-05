import asyncio

import pytest

from app.services.panel_hub import PanelHub


@pytest.mark.asyncio
async def test_broadcast_delivers_to_all_subscribers():
    hub = PanelHub()
    a = hub.subscribe()
    b = hub.subscribe()
    await hub.broadcast({"type": "event_created", "payload": {"id": 1}})
    msg_a = await asyncio.wait_for(a.get(), timeout=0.5)
    msg_b = await asyncio.wait_for(b.get(), timeout=0.5)
    assert msg_a == msg_b == {"type": "event_created", "payload": {"id": 1}}


@pytest.mark.asyncio
async def test_unsubscribe_stops_delivery():
    hub = PanelHub()
    q = hub.subscribe()
    hub.unsubscribe(q)
    await hub.broadcast({"type": "x"})
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(q.get(), timeout=0.1)


@pytest.mark.asyncio
async def test_broadcast_with_no_subscribers_is_noop():
    hub = PanelHub()
    await hub.broadcast({"type": "x"})  # should not raise
