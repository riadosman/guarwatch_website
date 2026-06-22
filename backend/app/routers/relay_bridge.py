import os
from datetime import datetime
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.deps import get_db
from app.models.device import Device

router = APIRouter(prefix="/relay", tags=["relay"])

RELAY_API_KEY = os.getenv("RELAY_API_KEY", "changeme")


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
