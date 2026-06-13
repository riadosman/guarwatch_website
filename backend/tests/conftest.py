from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from testcontainers.postgres import PostgresContainer

from app import db as db_module
from app.config import settings
from app.models import Base


@pytest.fixture(scope="session")
def pg_url() -> Generator[str, None, None]:
    with PostgresContainer("postgres:16-alpine") as pg:
        url = pg.get_connection_url().replace("postgresql+psycopg2", "postgresql+psycopg")
        yield url


@pytest.fixture(scope="session", autouse=True)
def _bind_engine(pg_url: str) -> Generator[None, None, None]:
    engine = create_engine(pg_url, future=True)
    Base.metadata.create_all(engine)
    db_module.engine = engine
    db_module.SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    yield
    engine.dispose()


@pytest.fixture
def session() -> Generator[Session, None, None]:
    db = db_module.SessionLocal()
    try:
        yield db
        db.rollback()
    finally:
        db.close()


@pytest.fixture
def uploads_tmp(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(settings, "uploads_dir", tmp_path)
    return tmp_path


@pytest.fixture
def client(uploads_tmp: Path) -> TestClient:
    from app.main import create_app

    tc = TestClient(create_app())
    tc.post("/auth/login", json={"username": "admin", "password": "changeme"})
    return tc
