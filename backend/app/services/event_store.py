from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Device, Event
from app.schemas.event import EventIn


class EventAlreadyExists(Exception):
    """Raised when (device_id, agent_event_id) is already persisted."""


def create_event(
    session: Session,
    device_id: uuid.UUID,
    payload: EventIn,
    screenshot: bytes,
) -> Event:
    existing = session.execute(
        select(Event).where(
            Event.device_id == device_id,
            Event.agent_event_id == payload.agent_event_id,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise EventAlreadyExists(payload.agent_event_id)

    event = Event(
        device_id=device_id,
        agent_event_id=payload.agent_event_id,
        type=payload.type,
        track_id=payload.track_id,
        occurred_at=payload.occurred_at,
        metadata_json=payload.metadata,
    )
    session.add(event)
    session.flush()  # populate event.id

    rel_path = f"{device_id}/{event.id}.jpg"
    abs_path = settings.uploads_dir / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(screenshot)
    event.screenshot_path = rel_path

    device = session.get(Device, device_id)
    if device is not None:
        device.last_seen_at = datetime.now(tz=timezone.utc)

    return event
