# backend/app/services/device_store.py
from __future__ import annotations

import secrets
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_token
from app.models.device import Device


def create_device(db: Session, name: str) -> tuple[Device, str]:
    token = secrets.token_hex(32)  # 64-char hex string
    device = Device(
        id=uuid.uuid4(),
        name=name,
        device_token="",
        token_hash=hash_token(token),
    )
    db.add(device)
    db.flush()
    return device, token


def list_devices(db: Session) -> list[Device]:
    return list(db.execute(select(Device).order_by(Device.created_at.desc())).scalars())


def rename_device(db: Session, device_id: uuid.UUID, name: str) -> Device | None:
    device = db.get(Device, device_id)
    if device is None:
        return None
    device.name = name
    db.flush()
    return device


def delete_device(db: Session, device_id: uuid.UUID) -> bool:
    device = db.get(Device, device_id)
    if device is None:
        return False
    db.delete(device)
    db.flush()
    return True
