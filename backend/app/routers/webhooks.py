# backend/app/routers/webhooks.py
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.auth import require_auth
from app.core.deps import DbSession
from app.models.webhook import WebhookConfig
from app.schemas.webhook import WebhookConfigIn, WebhookConfigOut, WebhookConfigPatch

router = APIRouter(prefix="/api", tags=["webhooks"])


@router.get("/webhooks")
def list_webhooks(
    db: DbSession, _: Annotated[str, Depends(require_auth)]
) -> list[WebhookConfigOut]:
    rows = (
        db.execute(select(WebhookConfig).order_by(WebhookConfig.created_at.desc()))
        .scalars()
        .all()
    )
    return [_to_out(r) for r in rows]


@router.post("/webhooks", status_code=status.HTTP_201_CREATED)
def create_webhook(
    body: WebhookConfigIn,
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
) -> WebhookConfigOut:
    cfg = WebhookConfig(
        id=uuid.uuid4(),
        name=body.name,
        url=body.url,
        enabled=body.enabled,
        event_types=body.event_types,
        secret=body.secret,
    )
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return _to_out(cfg)


@router.patch("/webhooks/{webhook_id}")
def update_webhook(
    webhook_id: uuid.UUID,
    body: WebhookConfigPatch,
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
) -> WebhookConfigOut:
    cfg = db.get(WebhookConfig, webhook_id)
    if cfg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "webhook not found")
    if body.name is not None:
        cfg.name = body.name
    if body.url is not None:
        cfg.url = body.url
    if body.enabled is not None:
        cfg.enabled = body.enabled
    if body.event_types is not None:
        cfg.event_types = body.event_types
    if body.secret is not None:
        cfg.secret = body.secret
    db.commit()
    db.refresh(cfg)
    return _to_out(cfg)


@router.delete("/webhooks/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_webhook(
    webhook_id: uuid.UUID,
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
) -> None:
    cfg = db.get(WebhookConfig, webhook_id)
    if cfg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "webhook not found")
    db.delete(cfg)
    db.commit()


def _to_out(cfg: WebhookConfig) -> WebhookConfigOut:
    return WebhookConfigOut(
        id=cfg.id,
        name=cfg.name,
        url=cfg.url,
        enabled=cfg.enabled,
        event_types=cfg.event_types or [],
        secret=cfg.secret,
        created_at=cfg.created_at,
    )
