from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.core.deps import get_db
from app.models.user import User
from app.models.role import Role, RolePermission
from app.services.rbac import require_permission

router = APIRouter(prefix="/roles", tags=["roles"])

SERVICES = ["users", "roles", "devices", "camera_groups", "terminal", "events", "live_view"]


class PermissionIn(BaseModel):
    service: str
    can_read: bool = False
    can_create: bool = False
    can_update: bool = False
    can_delete: bool = False


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: List[PermissionIn] = []


class PermissionOut(BaseModel):
    service: str
    can_read: bool
    can_create: bool
    can_update: bool
    can_delete: bool

    model_config = {"from_attributes": True}


class RoleOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime
    permissions: List[PermissionOut]

    model_config = {"from_attributes": True}


@router.get("", response_model=List[RoleOut])
async def list_roles(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("roles", "read")),
):
    return db.query(Role).all()


@router.post("", response_model=RoleOut, status_code=201)
async def create_role(
    body: RoleCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("roles", "create")),
):
    if db.query(Role).filter(Role.name == body.name).first():
        raise HTTPException(400, "Role name already exists")
    role = Role(name=body.name, description=body.description, created_at=datetime.utcnow())
    db.add(role)
    db.flush()
    for p in body.permissions:
        if p.service not in SERVICES:
            raise HTTPException(400, f"Unknown service: {p.service}")
        perm = RolePermission(
            role_id=role.id,
            service=p.service,
            can_read=p.can_read,
            can_create=p.can_create,
            can_update=p.can_update,
            can_delete=p.can_delete,
        )
        db.add(perm)
    db.commit()
    db.refresh(role)
    return role


@router.put("/{role_id}/permissions", response_model=RoleOut)
async def update_role_permissions(
    role_id: int,
    permissions: List[PermissionIn],
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("roles", "update")),
):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    # Replace all permissions
    db.query(RolePermission).filter(RolePermission.role_id == role_id).delete()
    for p in permissions:
        if p.service not in SERVICES:
            raise HTTPException(400, f"Unknown service: {p.service}")
        db.add(RolePermission(
            role_id=role_id,
            service=p.service,
            can_read=p.can_read,
            can_create=p.can_create,
            can_update=p.can_update,
            can_delete=p.can_delete,
        ))
    db.commit()
    db.refresh(role)
    return role


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("roles", "delete")),
):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    db.delete(role)
    db.commit()
