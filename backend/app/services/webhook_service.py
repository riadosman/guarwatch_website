# backend/app/services/webhook_service.py
from __future__ import annotations

import hashlib
import hmac
import json
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.webhook import WebhookConfig
from app.schemas.event import EventOut

_log = logging.getLogger(__name__)


def _signature(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def dispatch(db: Session, event: EventOut) -> None:
    """Fire webhooks for an event. Called as a BackgroundTask — must not raise."""
    try:
        configs = (
            db.execute(
                select(WebhookConfig).where(WebhookConfig.enabled == True)  # noqa: E712
            )
            .scalars()
            .all()
        )
    except Exception as exc:
        _log.error("webhooks: failed to query configs: %s", exc)
        return

    for cfg in configs:
        if cfg.event_types and event.type not in cfg.event_types:
            continue
        _fire(cfg, event)


def _fire(cfg: WebhookConfig, event: EventOut) -> None:
    payload = {
        "event": "violation",
        "id": event.id,
        "device_id": str(event.device_id),
        "type": event.type,
        "track_id": event.track_id,
        "occurred_at": event.occurred_at.isoformat() if event.occurred_at else None,
        "perclos": event.metadata.get("perclos") if event.metadata else None,
        "pitch": event.metadata.get("pitch") if event.metadata else None,
        "screenshot_url": event.screenshot_url,
    }
    body = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if cfg.secret:
        headers["X-GuardWatch-Signature"] = _signature(cfg.secret, body)
    try:
        resp = httpx.post(cfg.url, content=body, headers=headers, timeout=5)
        resp.raise_for_status()
    except Exception as exc:
        _log.error("webhooks: delivery failed to %s: %s", cfg.url, exc)
