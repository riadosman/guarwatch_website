"""Python 3.6 compatible agent uploader using requests.

Standalone — does NOT import the rest of the agent package.
"""
import json

import requests


def send_event(
    backend_url,
    device_id,
    device_token,
    agent_event_id,
    type_,
    track_id,
    occurred_at_iso,
    metadata,
    screenshot,
    timeout=10,
):
    """POST a violation to the backend.

    Returns the new event id on 201, None on 409 (already recorded).
    Raises requests.HTTPError for any other non-2xx.
    """
    url = "{}/api/devices/{}/events".format(backend_url, device_id)
    headers = {"Authorization": "Bearer {}".format(device_token)}
    body = {
        "agent_event_id": agent_event_id,
        "type": type_,
        "track_id": track_id,
        "occurred_at": occurred_at_iso,
        "metadata": metadata,
    }
    files = {
        "payload": ("payload.json", json.dumps(body), "application/json"),
        "screenshot": ("violation.jpg", screenshot, "image/jpeg"),
    }
    resp = requests.post(url, headers=headers, files=files, timeout=timeout)
    if resp.status_code == 409:
        return None
    resp.raise_for_status()
    return int(resp.json()["id"])
