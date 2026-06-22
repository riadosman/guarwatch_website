from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.core.deps import get_db
from app.models.user import User
from app.models.camera_group import CameraGroup
from app.services.rbac import require_permission

router = APIRouter(prefix="/groups", tags=["groups"])


class GroupCreate(BaseModel):
    name: str
    device_id: str
    camera_uris: List[str] = []


class GroupOut(BaseModel):
    id: int
    name: str
    device_id: str
    camera_uris: List[str]

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
        device_id=body.device_id,
        camera_uris=body.camera_uris,
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
