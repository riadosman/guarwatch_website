# backend/app/schemas/webhook.py
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class WebhookConfigOut(BaseModel):
    id: uuid.UUID
    name: str
    url: str
    enabled: bool
    event_types: list[str]
    secret: str | None
    created_at: datetime


class WebhookConfigIn(BaseModel):
    name: str
    url: str
    enabled: bool = True
    event_types: list[str] = []
    secret: str | None = None


class WebhookConfigPatch(BaseModel):
    name: str | None = None
    url: str | None = None
    enabled: bool | None = None
    event_types: list[str] | None = None
    secret: str | None = None
