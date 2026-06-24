from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.core.deps import get_db
from app.models.user import User
from app.models.camera_group import CameraGroup
from app.services.rbac import require_permission

router = APIRouter(prefix="/api/groups", tags=["groups"])


class GroupCreate(BaseModel):
    name: str
    device_id: str | None = None
    camera_uris: List[str] = []
    il_id: int
    ilce_id: int
    mahalle_id: int


class GroupOut(BaseModel):
    id: int
    name: str
    device_id: str
    camera_uris: List[str]
    il_id: int | None = None
    ilce_id: int | None = None
    mahalle_id: int | None = None

    model_config = {"from_attributes": True}


@router.get("", response_model=List[GroupOut])
async def list_groups(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("camera_groups", "read")),
):
    return db.query(CameraGroup).all()


@router.post("", response_model=GroupOut, status_code=201)
async def create_group(
    body: GroupCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("camera_groups", "create")),
):
    group = CameraGroup(
        name=body.name,
        device_id=body.device_id or "",
        camera_uris=body.camera_uris,
        il_id=body.il_id,
        ilce_id=body.ilce_id,
        mahalle_id=body.mahalle_id,
        created_at=datetime.utcnow(),
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=204)
async def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("camera_groups", "delete")),
):
    group = db.get(CameraGroup, group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    db.delete(group)
    db.commit()
