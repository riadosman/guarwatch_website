# backend/app/routers/devices.py
from __future__ import annotations

import hmac
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel

from app.config import settings
from app.core.auth import require_auth
from app.core.deps import DbSession
from app.models.device import Device
from app.services.device_store import create_device, delete_device, list_devices, rename_device

router = APIRouter(prefix="/api", tags=["devices"])

_ONLINE_THRESHOLD_SECONDS = 120


def _status(device: Device) -> str:
    if device.last_seen_at is None:
        return "offline"
    last_seen = device.last_seen_at
    # Normalise: if DB returns a naive datetime, compare with utcnow(); otherwise with now(utc)
    if last_seen.tzinfo is None:
        age = (datetime.utcnow() - last_seen).total_seconds()
    else:
        age = (datetime.now(timezone.utc) - last_seen).total_seconds()
    return "online" if age <= _ONLINE_THRESHOLD_SECONDS else "offline"


class DeviceOut(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    last_seen_at: datetime | None
    created_at: datetime


class DeviceCreateIn(BaseModel):
    name: str


class DeviceCreateOut(DeviceOut):
    token: str


class DeviceRenameIn(BaseModel):
    name: str


@router.get("/devices")
def get_devices(db: DbSession, _: Annotated[str, Depends(require_auth)]) -> list[DeviceOut]:
    return [
        DeviceOut(
            id=d.id,
            name=d.name,
            status=_status(d),
            last_seen_at=d.last_seen_at,
            created_at=d.created_at,
        )
        for d in list_devices(db)
    ]


@router.post("/devices", status_code=status.HTTP_201_CREATED)
def post_device(
    body: DeviceCreateIn,
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
) -> DeviceCreateOut:
    device, token = create_device(db, body.name)
    db.commit()
    return DeviceCreateOut(
        id=device.id,
        name=device.name,
        status=_status(device),
        last_seen_at=device.last_seen_at,
        created_at=device.created_at,
        token=token,
    )


@router.patch("/devices/{device_id}")
def patch_device(
    device_id: uuid.UUID,
    body: DeviceRenameIn,
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
) -> DeviceOut:
    device = rename_device(db, device_id, body.name)
    if device is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    db.commit()
    return DeviceOut(
        id=device.id,
        name=device.name,
        status=_status(device),
        last_seen_at=device.last_seen_at,
        created_at=device.created_at,
    )


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_device(
    device_id: uuid.UUID,
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
) -> None:
    if not delete_device(db, device_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    db.commit()


class BootstrapIn(BaseModel):
    name: str


class BootstrapOut(BaseModel):
    device_id: str
    token: str
    name: str


@router.post("/devices/bootstrap", response_model=BootstrapOut, status_code=201)
def bootstrap_device(
    body: BootstrapIn,
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> BootstrapOut:
    """Zero-touch device registration for Jetson units.

    Requires the ``Authorization: Bearer <BOOTSTRAP_SECRET>`` header.
    Returns 403 when bootstrap is disabled (empty secret), 401 on wrong secret.
    """
    if not settings.bootstrap_secret:
        raise HTTPException(status_code=403, detail="Bootstrap kaydi devre disi")

    presented = (authorization or "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(presented.encode(), settings.bootstrap_secret.encode()):
        raise HTTPException(status_code=401, detail="Gecersiz bootstrap secret")

    device, token = create_device(db, body.name)
    device.registered_via_bootstrap = True
    db.commit()
    return BootstrapOut(device_id=str(device.id), token=token, name=device.name)
