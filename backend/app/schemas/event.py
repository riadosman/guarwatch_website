from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ViolationType = Literal["GOZ_KAPALI", "HAREKETSIZ", "UYUYOR", "TAKIP_KAYBEDILDI"]


class EventIn(BaseModel):
    agent_event_id: int = Field(ge=0)
    type: ViolationType
    track_id: int | None = None
    occurred_at: datetime
    metadata: dict = Field(default_factory=dict)


class EventOut(BaseModel):
    id: int
    device_id: uuid.UUID
    agent_event_id: int
    type: ViolationType
    track_id: int | None
    occurred_at: datetime
    received_at: datetime
    screenshot_url: str | None
    metadata: dict


class EventBroadcast(BaseModel):
    type: Literal["event_created"] = "event_created"
    payload: EventOut
