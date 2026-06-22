from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.deps import get_db
from app.core.security import hash_token
from app.models.user import User
from app.models.role import Role
from app.services.rbac import require_permission

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    username: str
    password: str
    role_id: Optional[int] = None
    group_ids: List[int] = []


class UserOut(BaseModel):
    id: int
    username: str
    role_id: Optional[int]
    group_ids: List[int]

    model_config = {"from_attributes": True}


@router.get("", response_model=List[UserOut])
async def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("users", "read")),
):
    return db.query(User).all()


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("users", "create")),
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(400, "Username already exists")
    if body.role_id and not db.get(Role, body.role_id):
        raise HTTPException(400, "Role not found")
    user = User(
        username=body.username,
        password_hash=hash_token(body.password),
        role_id=body.role_id,
        group_ids=body.group_ids,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("users", "delete")),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
