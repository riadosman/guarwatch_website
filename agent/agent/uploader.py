from __future__ import annotations

import json
from dataclasses import dataclass

import httpx


@dataclass
class EventPayload:
    agent_event_id: int
    type: str
    track_id: int | None
    occurred_at_iso: str
    metadata: dict


async def send_event(
    client: httpx.AsyncClient,
    backend_url: str,
    device_id: str,
    device_token: str,
    payload: EventPayload,
    screenshot: bytes,
) -> int | None:
    """POST a violation to the backend.

    Returns the new event id on 201, None on 409 (already recorded).
    Raises httpx.HTTPStatusError for any other non-2xx.
    """
    url = f"{backend_url}/api/devices/{device_id}/events"
    headers = {"Authorization": f"Bearer {device_token}"}
    body = {
        "agent_event_id": payload.agent_event_id,
        "type": payload.type,
        "track_id": payload.track_id,
        "occurred_at": payload.occurred_at_iso,
        "metadata": payload.metadata,
    }
    files = {
        "payload": ("payload.json", json.dumps(body), "application/json"),
        "screenshot": ("violation.jpg", screenshot, "image/jpeg"),
    }
    response = await client.post(url, headers=headers, files=files, timeout=10.0)
    if response.status_code == 409:
        return None
    response.raise_for_status()
    return int(response.json()["id"])
