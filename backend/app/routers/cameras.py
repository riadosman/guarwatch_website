import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel

from app.core.deps import DbSession, require_device_auth
from app.core.auth import require_auth
from app.models.camera import Camera

router = APIRouter(prefix="/api", tags=["cameras"])


class CameraDiscoveryItem(BaseModel):
    name: str
    rtsp_url: str


class CameraOut(BaseModel):
    id: uuid.UUID
    name: str
    rtsp_url: str
    device_id: uuid.UUID
    group_id: int | None
    is_online: bool
    last_seen_at: datetime | None
    model_config = {"from_attributes": True}


class CameraPatchIn(BaseModel):
    name: str | None = None
    group_id: int | None = None


@router.post("/devices/{device_id}/cameras", status_code=200)
def report_cameras(
    device_id: Annotated[str, Path()],
    body: list[CameraDiscoveryItem],
    db: DbSession,
    _dev: Annotated[str, Depends(require_device_auth)],
) -> dict:
    """Jetson tarafindan cagrilir — bulunan kameralari bildirir."""
    dev_uuid = uuid.UUID(device_id)
    now = datetime.utcnow()

    # Mevcut kameralarin URL'lerini al
    existing: dict[str, Camera] = {
        c.rtsp_url: c
        for c in db.query(Camera).filter(Camera.device_id == dev_uuid).all()
    }
    reported_urls = {item.rtsp_url for item in body}

    # Yeni kameralari ekle, mevcut olanlari guncelle
    for item in body:
        if item.rtsp_url in existing:
            cam = existing[item.rtsp_url]
            cam.is_online = True
            cam.last_seen_at = now
        else:
            cam = Camera(
                name=item.name,
                rtsp_url=item.rtsp_url,
                device_id=dev_uuid,
                is_online=True,
                last_seen_at=now,
            )
            db.add(cam)

    # Bu raporda bulunmayan eski kameralari offline yap
    for url, cam in existing.items():
        if url not in reported_urls:
            cam.is_online = False

    db.commit()

    # Cihaza ait tum kameralari dondur (agent icin cam_id -> rtsp_url eslemesi)
    all_cams = db.query(Camera).filter(Camera.device_id == dev_uuid).all()
    return {
        "updated": len(body),
        "cameras": [{"id": str(c.id), "rtsp_url": c.rtsp_url} for c in all_cams],
    }


@router.get("/devices/{device_id}/cameras", response_model=list[CameraOut])
def get_device_cameras(
    device_id: Annotated[str, Path()],
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
):
    dev_uuid = uuid.UUID(device_id)
    return db.query(Camera).filter(Camera.device_id == dev_uuid).all()


@router.patch("/cameras/{cam_id}", response_model=CameraOut)
def patch_camera(
    cam_id: uuid.UUID,
    body: CameraPatchIn,
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
):
    cam = db.query(Camera).filter(Camera.id == cam_id).first()
    if cam is None:
        raise HTTPException(status_code=404, detail="Kamera bulunamadi")
    if body.name is not None:
        cam.name = body.name
    if body.group_id is not None:
        cam.group_id = body.group_id
    db.commit()
    db.refresh(cam)
    return cam


@router.delete("/cameras/{cam_id}", status_code=204)
def delete_camera(
    cam_id: uuid.UUID,
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
):
    cam = db.query(Camera).filter(Camera.id == cam_id).first()
    if cam is None:
        raise HTTPException(status_code=404, detail="Kamera bulunamadi")
    db.delete(cam)
    db.commit()
