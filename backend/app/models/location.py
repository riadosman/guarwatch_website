from sqlalchemy import Column, Integer, String, ForeignKey
from app.models.base import Base


class Il(Base):
    __tablename__ = "iller"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(64), nullable=False)


class Ilce(Base):
    __tablename__ = "ilceler"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(64), nullable=False)
    il_id = Column(Integer, ForeignKey("iller.id", ondelete="CASCADE"), nullable=False)


class Mahalle(Base):
    __tablename__ = "mahalleler"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    ilce_id = Column(Integer, ForeignKey("ilceler.id", ondelete="CASCADE"), nullable=False)
