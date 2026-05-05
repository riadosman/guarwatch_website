from __future__ import annotations

import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import DbSession, require_device_auth
from app.models import Event
from app.schemas.event import EventIn, EventOut
from app.services.event_store import EventAlreadyExists, create_event
from app.services.panel_hub import hub

router = APIRouter(prefix="/api", tags=["events"])


def _to_out(event: Event) -> EventOut:
    return EventOut(
        id=event.id,
        device_id=event.device_id,
        agent_event_id=event.agent_event_id,
        type=event.type,  # type: ignore[arg-type]
        track_id=event.track_id,
        occurred_at=event.occurred_at,
        received_at=event.received_at,
        screenshot_url=f"/uploads/{event.screenshot_path}" if event.screenshot_path else None,
        metadata=event.metadata_json,
    )


@router.post("/devices/{device_id}/events", status_code=status.HTTP_201_CREATED)
async def post_event(
    device_id: Annotated[str, Depends(require_device_auth)],
    db: DbSession,
    payload: Annotated[UploadFile, File()],
    screenshot: Annotated[UploadFile, File()],
) -> EventOut:
    image = await screenshot.read()
    if len(image) > settings.max_screenshot_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "screenshot too large")
    if not image.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "screenshot must be JPEG")

    try:
        raw_payload = await payload.read()
        event_in = EventIn.model_validate_json(raw_payload)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"invalid payload: {exc}") from exc

    try:
        event = create_event(db, uuid.UUID(device_id), event_in, image)
    except EventAlreadyExists:
        raise HTTPException(status.HTTP_409_CONFLICT, "event already recorded") from None

    db.commit()
    db.refresh(event)
    out = _to_out(event)
    await hub.broadcast({"type": "event_created", "payload": out.model_dump(mode="json")})
    return out


@router.get("/events")
def list_events(db: DbSession, limit: int = 50) -> list[EventOut]:
    limit = max(1, min(limit, 200))
    rows = (
        db.execute(select(Event).order_by(Event.occurred_at.desc()).limit(limit)).scalars().all()
    )
    return [_to_out(r) for r in rows]
