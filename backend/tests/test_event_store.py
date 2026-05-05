import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.models import Device
from app.schemas.event import EventIn
from app.services.event_store import EventAlreadyExists, create_event


@pytest.fixture
def device(session: Session) -> Device:
    d = Device(id=uuid.uuid4(), name="Test", device_token="t")
    session.add(d)
    session.commit()
    return d


def _payload(idx: int = 1) -> EventIn:
    return EventIn(
        agent_event_id=idx,
        type="UYUYOR",
        track_id=5,
        occurred_at=datetime(2026, 5, 5, 12, 0, 0, tzinfo=timezone.utc),
        metadata={"perclos": 88.0},
    )


def test_create_event_persists_row_and_screenshot(
    session: Session, device: Device, uploads_tmp: Path
):
    image = b"\xff\xd8\xff\xe0fake-jpeg"
    event = create_event(session, device.id, _payload(1), image)
    session.commit()

    assert event.id is not None
    assert event.metadata_json == {"perclos": 88.0}
    assert event.screenshot_path is not None
    saved = uploads_tmp / event.screenshot_path
    assert saved.exists()
    assert saved.read_bytes() == image


def test_create_event_idempotent_on_duplicate_agent_event_id(
    session: Session, device: Device, uploads_tmp: Path
):
    create_event(session, device.id, _payload(7), b"a")
    session.commit()
    with pytest.raises(EventAlreadyExists):
        create_event(session, device.id, _payload(7), b"b")


def test_create_event_updates_device_last_seen(
    session: Session, device: Device, uploads_tmp: Path
):
    assert device.last_seen_at is None
    create_event(session, device.id, _payload(1), b"x")
    session.commit()
    session.refresh(device)
    assert device.last_seen_at is not None
