from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import ARRAY
from app.models.base import Base


class CameraGroup(Base):
    __tablename__ = "camera_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    device_id = Column(String(64), nullable=False)
    camera_uris = Column(ARRAY(String), nullable=False, server_default="{}")
    il_id = Column(Integer, ForeignKey("iller.id"), nullable=True)
    ilce_id = Column(Integer, ForeignKey("ilceler.id"), nullable=True)
    mahalle_id = Column(Integer, ForeignKey("mahalleler.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
