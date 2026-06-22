import os
from datetime import datetime
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import httpx
import secrets as _secrets
import uuid as _uuid

from app.core.deps import get_db
from app.models.device import Device

router = APIRouter(prefix="/relay", tags=["relay"])

RELAY_API_KEY = os.getenv("RELAY_API_KEY", "changeme")
RELAY_URL = os.getenv("RELAY_URL", "http://relay:8765")


class RelayNotify(BaseModel):
    device_id: str
    type: str
    data: Dict[str, Any] = {}


@router.post("/notify", status_code=204)
async def relay_notify(
    body: RelayNotify,
    x_relay_key: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    if x_relay_key != RELAY_API_KEY:
        raise HTTPException(401, "Invalid relay API key")

    device = db.query(Device).filter(Device.id == body.device_id).first()

    if body.type == "heartbeat":
        if device:
            device.last_seen = datetime.utcnow()
            device.is_online = True
            db.commit()

    elif body.type == "offline":
        if device:
            device.is_online = False
            db.commit()

    elif body.type == "cam_health":
        if device:
            cam = body.data.get("cam", "")
            online = body.data.get("online", False)
            health = device.camera_health or {}
            health[cam] = {"online": online, "checked_at": datetime.utcnow().isoformat()}
            device.camera_health = health
            db.commit()


class RelayRegisterDevice(BaseModel):
    device_id: str
    name: str


@router.post("/register", status_code=201)
async def relay_register_device(
    body: RelayRegisterDevice,
    x_relay_key: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    if x_relay_key != RELAY_API_KEY:
        raise HTTPException(401, "Invalid relay API key")
    from app.core.security import hash_token

    device_id = _uuid.UUID(body.device_id)
    device = db.query(Device).filter(Device.id == device_id).first()
    token = _secrets.token_hex(32)
    if device:
        device.name = body.name
        device.token_hash = hash_token(token)
    else:
        device = Device(
            id=device_id,
            name=body.name,
            device_token="",
            token_hash=hash_token(token),
        )
        db.add(device)
    db.commit()
    return {"device_id": str(device_id), "token": token}


class RelayPairRequest(BaseModel):
    code: str
    name: str


@router.post("/pair")
async def relay_pair_device(body: RelayPairRequest):
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{RELAY_URL}/pair",
                json={"code": body.code, "name": body.name},
                timeout=5.0,
            )
        except Exception:
            raise HTTPException(503, "Relay sunucusuna bağlanılamadı")
        if resp.status_code == 400:
            raise HTTPException(400, "Geçersiz veya süresi dolmuş eşleştirme kodu")
        resp.raise_for_status()
        return resp.json()
