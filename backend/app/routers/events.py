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
from app.services.image_validator import validate_screenshot
from app.services.panel_hub import hub
from app.services.upload_log import log_upload, timer

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

    validation = validate_screenshot(
        image,
        max_bytes=settings.max_screenshot_bytes,
        min_width=settings.min_screenshot_width,
        min_height=settings.min_screenshot_height,
    )

    hard_fails = [i for i in validation.issues if i.startswith(("not_jpeg_magic", "too_large", "no_sof_marker"))]
    if hard_fails:
        log_upload(
            device_id=device_id,
            agent_event_id=-1,
            violation_type="?",
            validation=validation,
            persist_ms=0.0,
            saved_path=None,
            extra={"rejected": True, "reason": hard_fails},
        )
        if any(i.startswith("too_large") for i in hard_fails):
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "screenshot too large")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"invalid jpeg: {','.join(hard_fails)}")

    if settings.screenshot_strict and any(i.startswith("low_resolution") for i in validation.issues):
        log_upload(
            device_id=device_id,
            agent_event_id=-1,
            violation_type="?",
            validation=validation,
            persist_ms=0.0,
            saved_path=None,
            extra={"rejected": True, "reason": "low_resolution_strict"},
        )
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"low resolution: {validation.info.width}x{validation.info.height}",
        )

    try:
        raw_payload = await payload.read()
        event_in = EventIn.model_validate_json(raw_payload)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"invalid payload: {exc}") from exc

    with timer() as t:
        try:
            event = create_event(db, uuid.UUID(device_id), event_in, image)
        except EventAlreadyExists:
            log_upload(
                device_id=device_id,
                agent_event_id=event_in.agent_event_id,
                violation_type=event_in.type,
                validation=validation,
                persist_ms=0.0,
                saved_path=None,
                extra={"duplicate": True},
            )
            raise HTTPException(status.HTTP_409_CONFLICT, "event already recorded") from None
        db.commit()
        db.refresh(event)

    out = _to_out(event)
    log_upload(
        device_id=device_id,
        agent_event_id=event_in.agent_event_id,
        violation_type=event_in.type,
        validation=validation,
        persist_ms=t["ms"],
        saved_path=event.screenshot_path,
    )
    await hub.broadcast({"type": "event_created", "payload": out.model_dump(mode="json")})
    return out


@router.get("/events")
def list_events(db: DbSession, limit: int = 50) -> list[EventOut]:
    limit = max(1, min(limit, 200))
    rows = (
        db.execute(select(Event).order_by(Event.occurred_at.desc()).limit(limit)).scalars().all()
    )
    return [_to_out(r) for r in rows]
