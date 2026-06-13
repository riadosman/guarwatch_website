from __future__ import annotations

import csv
import io
import json
import math
import random
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func as sqlfunc, select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth import require_auth
from app.core.deps import DbSession, require_device_auth
from app.models import Device, Event
from app.schemas.event import EventIn, EventOut, PaginatedEventsOut
from app.services.event_store import EventAlreadyExists, create_event
from app.services.image_validator import validate_screenshot
from app.services.panel_hub import hub
from app.services.upload_log import log_upload, timer

router = APIRouter(prefix="/api", tags=["events"])

SAMPLE_IMAGE_PATH = Path(__file__).resolve().parent.parent / "assets" / "sample_violation.jpg"


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
def list_events(
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
    limit: int = 50,
    page: int = 1,
    page_size: int = 50,
    device_id: str | None = None,
    type: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> PaginatedEventsOut:
    page_size = max(1, min(page_size, 200))
    page = max(1, page)

    q = select(Event).order_by(Event.occurred_at.desc())
    if device_id:
        try:
            q = q.where(Event.device_id == uuid.UUID(device_id))
        except ValueError:
            pass
    if type:
        q = q.where(Event.type == type)
    if from_date:
        q = q.where(Event.occurred_at >= from_date)
    if to_date:
        q = q.where(
            Event.occurred_at
            < datetime(to_date.year, to_date.month, to_date.day, tzinfo=timezone.utc)
            + timedelta(days=1)
        )

    total = db.execute(select(sqlfunc.count()).select_from(q.subquery())).scalar_one()
    rows = db.execute(q.offset((page - 1) * page_size).limit(page_size)).scalars().all()
    return PaginatedEventsOut(
        items=[_to_out(r) for r in rows],
        total=total,
        page=page,
        pages=max(1, math.ceil(total / page_size)),
    )


@router.get("/events/export")
def export_events_csv(
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
    device_id: str | None = None,
    type: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> StreamingResponse:
    from app.models.device import Device as _Device

    q = (
        select(Event, _Device.name.label("device_name"))
        .join(_Device, Event.device_id == _Device.id)
        .order_by(Event.occurred_at.desc())
    )
    if device_id:
        try:
            q = q.where(Event.device_id == uuid.UUID(device_id))
        except ValueError:
            pass
    if type:
        q = q.where(Event.type == type)
    if from_date:
        q = q.where(Event.occurred_at >= from_date)
    if to_date:
        q = q.where(
            Event.occurred_at
            < datetime(to_date.year, to_date.month, to_date.day, tzinfo=timezone.utc)
            + timedelta(days=1)
        )

    rows = db.execute(q).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "device_name", "type", "track_id", "occurred_at", "received_at", "perclos", "pitch", "signal_src"])
    for row in rows:
        event, device_name = row.Event, row.device_name
        meta = event.metadata_json or {}
        writer.writerow([
            event.id,
            device_name,
            event.type,
            event.track_id,
            event.occurred_at,
            event.received_at,
            meta.get("perclos"),
            meta.get("pitch"),
            meta.get("signal_src"),
        ])

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=events.csv"},
    )


def _delete_screenshot(rel_path: str | None) -> None:
    if not rel_path:
        return
    abs_path = settings.uploads_dir / rel_path
    try:
        abs_path.unlink(missing_ok=True)
    except OSError:
        pass


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: int, db: DbSession, _: Annotated[str, Depends(require_auth)]) -> None:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")
    _delete_screenshot(event.screenshot_path)
    db.delete(event)
    db.commit()
    await hub.broadcast({"type": "event_deleted", "payload": {"id": event_id}})


@router.delete("/events", status_code=status.HTTP_204_NO_CONTENT)
async def clear_all_events(db: DbSession, _: Annotated[str, Depends(require_auth)]) -> None:
    rows = db.execute(select(Event)).scalars().all()
    deleted_ids = [ev.id for ev in rows]
    for ev in rows:
        _delete_screenshot(ev.screenshot_path)
        db.delete(ev)
    db.commit()
    await hub.broadcast({"type": "events_cleared", "payload": {"ids": deleted_ids}})


class SimulateEventIn(BaseModel):
    type: Literal["GOZ_KAPALI", "HAREKETSIZ", "UYUYOR", "TAKIP_KAYBEDILDI"]


@router.post("/dev/simulate-event", status_code=status.HTTP_201_CREATED)
async def simulate_event(payload: SimulateEventIn, db: DbSession) -> EventOut:
    device = db.execute(select(Device).limit(1)).scalar_one_or_none()
    if device is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no devices seeded")

    if not SAMPLE_IMAGE_PATH.exists():
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "sample image missing on backend")

    metadata: dict[str, float | str | bool] = {
        "perclos": round(random.uniform(55, 95), 1),
        "pitch": round(random.uniform(-25, 30), 1),
        "signal_src": random.choice(["MP", "POSE"]),
        "simulated": True,
    }

    event_in = EventIn(
        agent_event_id=int(time.time() * 1000) % (2**31),
        type=payload.type,  # type: ignore[arg-type]
        track_id=random.randint(1, 99),
        occurred_at=datetime.now(tz=timezone.utc),
        metadata=metadata,
    )

    event = create_event(db, device.id, event_in, SAMPLE_IMAGE_PATH.read_bytes())
    db.commit()
    db.refresh(event)
    out = _to_out(event)
    await hub.broadcast({"type": "event_created", "payload": out.model_dump(mode="json")})
    return out
