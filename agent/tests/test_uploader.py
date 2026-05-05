import json

import httpx
import pytest

from agent.uploader import EventPayload, send_event


def _transport(handler):
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_send_event_posts_multipart_and_returns_event_id():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("Authorization")
        captured["body"] = request.content
        return httpx.Response(201, json={"id": 7, "screenshot_url": "/uploads/x.jpg"})

    payload = EventPayload(
        agent_event_id=1,
        type="UYUYOR",
        track_id=2,
        occurred_at_iso="2026-05-05T12:00:00+00:00",
        metadata={"perclos": 88.0},
    )
    async with httpx.AsyncClient(transport=_transport(handler)) as client:
        result = await send_event(
            client,
            backend_url="http://test",
            device_id="dev-1",
            device_token="tok",
            payload=payload,
            screenshot=b"\xff\xd8\xff\xe0img",
        )
    assert result == 7
    assert captured["url"] == "http://test/api/devices/dev-1/events"
    assert captured["auth"] == "Bearer tok"
    assert b'"agent_event_id":1' in captured["body"].replace(b" ", b"")


@pytest.mark.asyncio
async def test_send_event_treats_409_as_success():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(409, json={"detail": "dup"})

    payload = EventPayload(
        agent_event_id=1,
        type="UYUYOR",
        track_id=None,
        occurred_at_iso="2026-05-05T12:00:00+00:00",
        metadata={},
    )
    async with httpx.AsyncClient(transport=_transport(handler)) as client:
        result = await send_event(
            client,
            backend_url="http://test",
            device_id="dev-1",
            device_token="tok",
            payload=payload,
            screenshot=b"\xff\xd8\xff\xe0",
        )
    assert result is None  # already on server, treat as success


@pytest.mark.asyncio
async def test_send_event_raises_on_401():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "bad token"})

    payload = EventPayload(
        agent_event_id=1,
        type="UYUYOR",
        track_id=None,
        occurred_at_iso="2026-05-05T12:00:00+00:00",
        metadata={},
    )
    async with httpx.AsyncClient(transport=_transport(handler)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            await send_event(
                client,
                backend_url="http://test",
                device_id="dev-1",
                device_token="tok",
                payload=payload,
                screenshot=b"\xff\xd8\xff\xe0",
            )
