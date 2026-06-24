from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import require_auth
from app.core.deps import DbSession
from app.models.location import Il, Ilce, Mahalle

router = APIRouter(prefix="/api/locations", tags=["locations"])


class IlOut(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class IlceOut(BaseModel):
    id: int
    name: str
    il_id: int
    model_config = {"from_attributes": True}


class MahalleOut(BaseModel):
    id: int
    name: str
    ilce_id: int
    model_config = {"from_attributes": True}


@router.get("/iller", response_model=list[IlOut])
def get_iller(db: DbSession, _: Annotated[str, Depends(require_auth)]):
    return db.query(Il).order_by(Il.name).all()


@router.get("/ilceler", response_model=list[IlceOut])
def get_ilceler(il_id: int, db: DbSession, _: Annotated[str, Depends(require_auth)]):
    return db.query(Ilce).filter(Ilce.il_id == il_id).order_by(Ilce.name).all()


@router.get("/mahalleler", response_model=list[MahalleOut])
def get_mahalleler(ilce_id: int, db: DbSession, _: Annotated[str, Depends(require_auth)]):
    return db.query(Mahalle).filter(Mahalle.ilce_id == ilce_id).order_by(Mahalle.name).all()
