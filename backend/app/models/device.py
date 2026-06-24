from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    device_token: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")
    is_online: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    camera_health: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    registered_via_bootstrap: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    location: Mapped[str | None] = mapped_column(Text, nullable=True)
