# Violation Flow (Demo-First) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the end-to-end violation flow demo: agent simulates a violation → multipart POST to backend → DB row + JPEG on disk → broadcast over `/ws/panel` → browser dashboard shows live toast + thumbnail in list + lightbox on click.

**Architecture:** Three independent services already scaffolded. This plan adds: (a) backend DB layer (SQLAlchemy + Alembic) with `devices` and `events` tables, multipart event ingest endpoint with idempotency, `/ws/panel` browser broadcast, static `/uploads` mount; (b) agent CLI that POSTs a fixture violation; (c) frontend dashboard (no auth) with live event stream, toast, list, and lightbox.

**Tech Stack:** Python 3.11 + FastAPI + SQLAlchemy 2.0 (sync) + Alembic + Postgres 16 + psycopg3 + pytest + testcontainers; Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui (already installed) + sonner + Vitest + React Testing Library; agent uses httpx for multipart upload.

**Spec reference:** `docs/specs/2026-05-05-violation-flow-demo-first-design.md`

---

## File Structure

All paths are relative to repo root `C:/Users/riyad/Documents/Goruntu_isleme/guardwatch_website/`. Run all commands from this directory unless otherwise stated.

```
backend/
├── alembic.ini                            # NEW
├── pyproject.toml                         # MODIFY: add itsdangerous (multipart), bump deps
├── app/
│   ├── alembic/
│   │   ├── env.py                         # NEW
│   │   ├── script.py.mako                 # NEW (copied from alembic init template)
│   │   └── versions/
│   │       └── 0001_devices_and_events.py # NEW (auto-generated then trimmed)
│   ├── db.py                              # NEW: engine + SessionLocal + Base
│   ├── config.py                          # MODIFY: add device_tokens, uploads_dir
│   ├── main.py                            # MODIFY: include routers, mount /uploads, lifespan
│   ├── core/
│   │   ├── __init__.py                    # NEW
│   │   ├── deps.py                        # NEW: get_db, verify_device_token dep
│   │   └── security.py                    # NEW: token equality check
│   ├── models/
│   │   ├── __init__.py                    # NEW
│   │   ├── base.py                        # NEW: DeclarativeBase
│   │   ├── device.py                      # NEW: Device model
│   │   └── event.py                       # NEW: Event model
│   ├── schemas/
│   │   ├── __init__.py                    # NEW
│   │   └── event.py                       # NEW: EventIn, EventOut, EventBroadcast
│   ├── services/
│   │   ├── __init__.py                    # NEW
│   │   ├── panel_hub.py                   # NEW: in-memory pub/sub for /ws/panel
│   │   └── event_store.py                 # NEW: insert + disk write + broadcast
│   └── routers/
│       ├── events.py                      # NEW: POST + GET event endpoints
│       └── ws_panel.py                    # NEW: /ws/panel WebSocket
├── tests/
│   ├── conftest.py                        # MODIFY: add postgres testcontainer fixture
│   ├── test_security.py                   # NEW
│   ├── test_event_store.py                # NEW
│   ├── test_events_router.py              # NEW
│   └── test_panel_hub.py                  # NEW

agent/
├── pyproject.toml                         # MODIFY: add httpx
├── fixtures/
│   └── sample_violation.jpg               # NEW: small example JPEG (~10 KB)
├── agent/
│   ├── config.py                          # MODIFY: add backend_url, device_id, device_token
│   ├── uploader.py                        # NEW: send_event() with retry + idempotent 409
│   └── simulate_event.py                  # NEW: CLI wrapper around uploader
└── tests/
    └── test_uploader.py                   # NEW

frontend/
├── package.json                           # MODIFY: add vitest + @testing-library/react
├── vitest.config.ts                       # NEW
├── src/
│   ├── app/
│   │   ├── layout.tsx                     # MODIFY: mount Toaster + ThemeProvider
│   │   └── page.tsx                       # MODIFY: dashboard with EventList
│   ├── lib/
│   │   ├── types.ts                       # NEW: EventPayload type
│   │   ├── api.ts                         # NEW: getEvents()
│   │   └── ws.ts                          # NEW: openPanelWs()
│   ├── hooks/
│   │   └── useEventStream.ts              # NEW
│   └── components/
│       ├── EventList.tsx                  # NEW
│       ├── EventLightbox.tsx              # NEW
│       └── ViolationToast.tsx             # NEW
└── tests/
    ├── setup.ts                           # NEW
    ├── EventList.test.tsx                 # NEW
    └── useEventStream.test.tsx            # NEW

docker-compose.yml                         # MODIFY: add uploads volume, BACKEND env to agent
.env.example                               # MODIFY: add new keys
```

**Boundaries:**
- `backend/app/db.py` — engine + session, no models.
- `backend/app/models/` — SQLAlchemy ORM only, no I/O.
- `backend/app/schemas/` — Pydantic only, no DB.
- `backend/app/core/` — pure helpers + FastAPI deps.
- `backend/app/services/` — orchestration (DB + disk + broadcast).
- `backend/app/routers/` — thin HTTP/WS shells; delegate to services.
- `agent/agent/uploader.py` — pure HTTP client, no CLI.
- `agent/agent/simulate_event.py` — CLI only, calls uploader.
- `frontend/src/lib/` — pure I/O (fetch, WebSocket), no React.
- `frontend/src/hooks/` — React state wrapping lib/.
- `frontend/src/components/` — presentational, no fetch logic.

---

# Phase A — Backend DB foundation (Tasks 1-6)

Goal of phase: SQLAlchemy + Alembic in place, `devices` and `events` tables migrated, settings extended with `DEVICE_TOKENS` and `UPLOADS_DIR`. Backend still has only `/health` exposed; everything else is a green test.

---

### Task 1: Add SQLAlchemy engine, session, and Base

**Files:**
- Create: `backend/app/db.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/base.py`

- [ ] **Step 1: Create `backend/app/models/base.py`**

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

- [ ] **Step 2: Create `backend/app/models/__init__.py`**

```python
from app.models.base import Base

__all__ = ["Base"]
```

- [ ] **Step 3: Create `backend/app/db.py`**

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_session() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/db.py backend/app/models/__init__.py backend/app/models/base.py
git commit -m "feat(backend): add sqlalchemy engine, sessionmaker, declarative base"
```

---

### Task 2: Add Device and Event ORM models

**Files:**
- Create: `backend/app/models/device.py`
- Create: `backend/app/models/event.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Create `backend/app/models/device.py`**

```python
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    device_token: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 2: Create `backend/app/models/event.py`**

```python
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        UniqueConstraint("device_id", "agent_event_id", name="uq_events_device_agent_event"),
        Index("ix_events_occurred_at_desc", "occurred_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False
    )
    agent_event_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    track_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    screenshot_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
```

Note: Python attribute is `metadata_json` because SQLAlchemy reserves `metadata` on Base. The DB column name remains `metadata`.

- [ ] **Step 3: Replace `backend/app/models/__init__.py`**

```python
from app.models.base import Base
from app.models.device import Device
from app.models.event import Event

__all__ = ["Base", "Device", "Event"]
```

- [ ] **Step 4: Verify import works**

```bash
cd backend && python -c "from app.models import Base, Device, Event; print(Base.metadata.tables.keys())"
```

Expected: `dict_keys(['devices', 'events'])`

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/
git commit -m "feat(backend): add Device and Event ORM models"
```

---

### Task 3: Initialize Alembic and write the first migration

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/app/alembic/env.py`
- Create: `backend/app/alembic/script.py.mako`
- Create: `backend/app/alembic/versions/0001_devices_and_events.py`

- [ ] **Step 1: Create `backend/alembic.ini`**

```ini
[alembic]
script_location = app/alembic
prepend_sys_path = .
file_template = %%(rev)s_%%(slug)s
timezone = UTC
sqlalchemy.url =

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

- [ ] **Step 2: Create `backend/app/alembic/script.py.mako`**

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 3: Create `backend/app/alembic/env.py`**

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import settings
from app.models import Base

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 4: Create empty `backend/app/alembic/versions/` directory**

```bash
mkdir -p backend/app/alembic/versions
```

- [ ] **Step 5: Create `backend/app/alembic/versions/0001_devices_and_events.py`**

```python
"""devices and events

Revision ID: 0001
Revises:
Create Date: 2026-05-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("device_token", sa.String(128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "device_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("devices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("agent_event_id", sa.BigInteger, nullable=False),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("track_id", sa.Integer, nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("screenshot_path", sa.String(255), nullable=True),
        sa.Column("metadata", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.UniqueConstraint("device_id", "agent_event_id", name="uq_events_device_agent_event"),
    )
    op.create_index("ix_events_occurred_at_desc", "events", ["occurred_at"])


def downgrade() -> None:
    op.drop_index("ix_events_occurred_at_desc", table_name="events")
    op.drop_table("events")
    op.drop_table("devices")
```

- [ ] **Step 6: Run migration against the dev Postgres**

```bash
docker compose up -d postgres
cd backend && DATABASE_URL=postgresql+psycopg://fleet:fleet@localhost:5432/fleet alembic upgrade head
```

Expected output: `INFO  [alembic.runtime.migration] Running upgrade  -> 0001, devices and events`

- [ ] **Step 7: Verify tables exist**

```bash
docker compose exec postgres psql -U fleet -d fleet -c "\dt"
```

Expected: lists `alembic_version`, `devices`, `events`.

- [ ] **Step 8: Commit**

```bash
git add backend/alembic.ini backend/app/alembic/
git commit -m "feat(backend): add alembic + initial migration for devices and events"
```

---

### Task 4: Extend backend config with device tokens and uploads dir

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/pyproject.toml` (add `python-multipart` already present, ensure)

- [ ] **Step 1: Replace `backend/app/config.py`**

```python
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(default="postgresql+psycopg://fleet:fleet@localhost:5432/fleet")
    jwt_secret: str = Field(default="change-me")
    jwt_algorithm: str = "HS256"
    access_token_ttl_min: int = 15
    refresh_token_ttl_days: int = 7
    cors_origins: str = "http://localhost:3000"

    # Demo violation flow
    uploads_dir: Path = Field(default=Path("./uploads"))
    device_tokens: str = Field(
        default="",
        description="Comma-separated device_id:token pairs, e.g. 'uuid1:tok1,uuid2:tok2'",
    )
    max_screenshot_bytes: int = 2 * 1024 * 1024  # 2 MB

    def device_token_map(self) -> dict[str, str]:
        out: dict[str, str] = {}
        for pair in self.device_tokens.split(","):
            pair = pair.strip()
            if not pair or ":" not in pair:
                continue
            device_id, token = pair.split(":", 1)
            out[device_id.strip()] = token.strip()
        return out


settings = Settings()
```

- [ ] **Step 2: Verify**

```bash
cd backend && python -c "from app.config import settings; print(settings.device_token_map())"
```

Expected: `{}`

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py
git commit -m "feat(backend): add uploads_dir and device_tokens settings"
```

---

### Task 5: Add core security helper (verify device token)

**Files:**
- Create: `backend/app/core/__init__.py` (empty)
- Create: `backend/app/core/security.py`
- Create: `backend/tests/test_security.py`

- [ ] **Step 1: Create `backend/app/core/__init__.py`** (empty file)

```python
```

- [ ] **Step 2: Create the failing test `backend/tests/test_security.py`**

```python
import pytest

from app.core.security import verify_device_token


def test_verify_device_token_returns_true_for_match():
    token_map = {"abc-123": "secret-tok"}
    assert verify_device_token(token_map, "abc-123", "secret-tok") is True


def test_verify_device_token_returns_false_for_unknown_device():
    assert verify_device_token({}, "abc-123", "secret-tok") is False


def test_verify_device_token_returns_false_for_wrong_token():
    token_map = {"abc-123": "secret-tok"}
    assert verify_device_token(token_map, "abc-123", "wrong") is False


def test_verify_device_token_uses_constant_time_comparison():
    # smoke test that hmac.compare_digest is available — we don't time the call
    token_map = {"abc-123": "secret-tok"}
    assert verify_device_token(token_map, "abc-123", "secret-tok") is True
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd backend && pytest tests/test_security.py -v
```

Expected: ImportError or 4 FAILED.

- [ ] **Step 4: Create `backend/app/core/security.py`**

```python
import hmac


def verify_device_token(token_map: dict[str, str], device_id: str, presented: str) -> bool:
    expected = token_map.get(device_id)
    if expected is None:
        return False
    return hmac.compare_digest(expected.encode(), presented.encode())
```

- [ ] **Step 5: Run tests to verify pass**

```bash
cd backend && pytest tests/test_security.py -v
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/__init__.py backend/app/core/security.py backend/tests/test_security.py
git commit -m "feat(backend): add verify_device_token with constant-time compare"
```

---

### Task 6: Add FastAPI deps (get_db, current device)

**Files:**
- Create: `backend/app/core/deps.py`

- [ ] **Step 1: Create `backend/app/core/deps.py`**

```python
from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import verify_device_token
from app.db import SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbSession = Annotated[Session, Depends(get_db)]


def require_device_auth(
    device_id: Annotated[str, Path()],
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    if not verify_device_token(settings.device_token_map(), device_id, token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid device token")
    return device_id
```

- [ ] **Step 2: Verify import**

```bash
cd backend && python -c "from app.core.deps import get_db, require_device_auth; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/deps.py
git commit -m "feat(backend): add get_db and require_device_auth deps"
```

---

# Phase B — Backend services + tests (Tasks 7-11)

Goal of phase: Postgres testcontainer fixture set up; `event_store.create_event()` and `panel_hub` covered by unit/integration tests; `/api/devices/{id}/events` POST + GET working with idempotency. `/ws/panel` broadcasts new events to connected browsers.

---

### Task 7: Add testcontainer Postgres fixture

**Files:**
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Replace `backend/tests/conftest.py`**

```python
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

    return TestClient(create_app())
```

- [ ] **Step 2: Verify health test still passes against testcontainer**

```bash
cd backend && pytest tests/test_health.py -v
```

Expected: 1 passed (Postgres container starts in background; first run takes ~10 s).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/conftest.py
git commit -m "test(backend): add postgres testcontainer + session/uploads fixtures"
```

---

### Task 8: Add panel_hub service + tests

**Files:**
- Create: `backend/app/services/__init__.py` (empty)
- Create: `backend/app/services/panel_hub.py`
- Create: `backend/tests/test_panel_hub.py`

- [ ] **Step 1: Create `backend/app/services/__init__.py`** (empty)

```python
```

- [ ] **Step 2: Create the failing test `backend/tests/test_panel_hub.py`**

```python
import asyncio

import pytest

from app.services.panel_hub import PanelHub


@pytest.mark.asyncio
async def test_broadcast_delivers_to_all_subscribers():
    hub = PanelHub()
    a = hub.subscribe()
    b = hub.subscribe()
    await hub.broadcast({"type": "event_created", "payload": {"id": 1}})
    msg_a = await asyncio.wait_for(a.get(), timeout=0.5)
    msg_b = await asyncio.wait_for(b.get(), timeout=0.5)
    assert msg_a == msg_b == {"type": "event_created", "payload": {"id": 1}}


@pytest.mark.asyncio
async def test_unsubscribe_stops_delivery():
    hub = PanelHub()
    q = hub.subscribe()
    hub.unsubscribe(q)
    await hub.broadcast({"type": "x"})
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(q.get(), timeout=0.1)


@pytest.mark.asyncio
async def test_broadcast_with_no_subscribers_is_noop():
    hub = PanelHub()
    await hub.broadcast({"type": "x"})  # should not raise
```

- [ ] **Step 3: Run test to verify failure**

```bash
cd backend && pytest tests/test_panel_hub.py -v
```

Expected: ImportError.

- [ ] **Step 4: Create `backend/app/services/panel_hub.py`**

```python
from __future__ import annotations

import asyncio
from typing import Any


class PanelHub:
    """In-memory pub/sub for /ws/panel browser subscribers."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers.discard(q)

    async def broadcast(self, message: dict[str, Any]) -> None:
        dead: list[asyncio.Queue[dict[str, Any]]] = []
        for q in self._subscribers:
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self._subscribers.discard(q)


hub = PanelHub()
```

- [ ] **Step 5: Run test**

```bash
cd backend && pytest tests/test_panel_hub.py -v
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/__init__.py backend/app/services/panel_hub.py backend/tests/test_panel_hub.py
git commit -m "feat(backend): add PanelHub in-memory broadcast for /ws/panel"
```

---

### Task 9: Add Pydantic schemas for events

**Files:**
- Create: `backend/app/schemas/__init__.py` (empty)
- Create: `backend/app/schemas/event.py`

- [ ] **Step 1: Create `backend/app/schemas/__init__.py`** (empty)

```python
```

- [ ] **Step 2: Create `backend/app/schemas/event.py`**

```python
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ViolationType = Literal["GOZ_KAPALI", "HAREKETSIZ", "UYUYOR", "TAKIP_KAYBEDILDI"]


class EventIn(BaseModel):
    agent_event_id: int = Field(ge=0)
    type: ViolationType
    track_id: int | None = None
    occurred_at: datetime
    metadata: dict = Field(default_factory=dict)


class EventOut(BaseModel):
    id: int
    device_id: uuid.UUID
    agent_event_id: int
    type: ViolationType
    track_id: int | None
    occurred_at: datetime
    received_at: datetime
    screenshot_url: str | None
    metadata: dict


class EventBroadcast(BaseModel):
    type: Literal["event_created"] = "event_created"
    payload: EventOut
```

- [ ] **Step 3: Verify import**

```bash
cd backend && python -c "from app.schemas.event import EventIn, EventOut, EventBroadcast; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/
git commit -m "feat(backend): add EventIn/EventOut/EventBroadcast schemas"
```

---

### Task 10: Add event_store service + tests (insert + disk + idempotency)

**Files:**
- Create: `backend/app/services/event_store.py`
- Create: `backend/tests/test_event_store.py`

- [ ] **Step 1: Create the failing test `backend/tests/test_event_store.py`**

```python
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.models import Device
from app.schemas.event import EventIn
from app.services.event_store import EventAlreadyExists, create_event


@pytest.fixture
def device(session: Session) -> Device:
    d = Device(id=uuid.uuid4(), name="Test", device_token="t")
    session.add(d)
    session.commit()
    return d


def _payload(idx: int = 1) -> EventIn:
    return EventIn(
        agent_event_id=idx,
        type="UYUYOR",
        track_id=5,
        occurred_at=datetime(2026, 5, 5, 12, 0, 0, tzinfo=timezone.utc),
        metadata={"perclos": 88.0},
    )


def test_create_event_persists_row_and_screenshot(
    session: Session, device: Device, uploads_tmp: Path
):
    image = b"\xff\xd8\xff\xe0fake-jpeg"
    event = create_event(session, device.id, _payload(1), image)
    session.commit()

    assert event.id is not None
    assert event.metadata_json == {"perclos": 88.0}
    assert event.screenshot_path is not None
    saved = uploads_tmp / event.screenshot_path
    assert saved.exists()
    assert saved.read_bytes() == image


def test_create_event_idempotent_on_duplicate_agent_event_id(
    session: Session, device: Device, uploads_tmp: Path
):
    create_event(session, device.id, _payload(7), b"a")
    session.commit()
    with pytest.raises(EventAlreadyExists):
        create_event(session, device.id, _payload(7), b"b")


def test_create_event_updates_device_last_seen(
    session: Session, device: Device, uploads_tmp: Path
):
    assert device.last_seen_at is None
    create_event(session, device.id, _payload(1), b"x")
    session.commit()
    session.refresh(device)
    assert device.last_seen_at is not None
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd backend && pytest tests/test_event_store.py -v
```

Expected: ImportError.

- [ ] **Step 3: Create `backend/app/services/event_store.py`**

```python
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Device, Event
from app.schemas.event import EventIn


class EventAlreadyExists(Exception):
    """Raised when (device_id, agent_event_id) is already persisted."""


def create_event(
    session: Session,
    device_id: uuid.UUID,
    payload: EventIn,
    screenshot: bytes,
) -> Event:
    existing = session.execute(
        select(Event).where(
            Event.device_id == device_id,
            Event.agent_event_id == payload.agent_event_id,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise EventAlreadyExists(payload.agent_event_id)

    event = Event(
        device_id=device_id,
        agent_event_id=payload.agent_event_id,
        type=payload.type,
        track_id=payload.track_id,
        occurred_at=payload.occurred_at,
        metadata_json=payload.metadata,
    )
    session.add(event)
    session.flush()  # populate event.id

    rel_path = f"{device_id}/{event.id}.jpg"
    abs_path = settings.uploads_dir / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(screenshot)
    event.screenshot_path = rel_path

    device = session.get(Device, device_id)
    if device is not None:
        device.last_seen_at = datetime.now(tz=timezone.utc)

    return event
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_event_store.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/event_store.py backend/tests/test_event_store.py
git commit -m "feat(backend): add event_store with disk write + idempotency"
```

---

### Task 11: Add events router (POST + GET) + tests

**Files:**
- Create: `backend/app/routers/events.py`
- Create: `backend/tests/test_events_router.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create the failing test `backend/tests/test_events_router.py`**

```python
import io
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Device


@pytest.fixture
def device(session: Session, monkeypatch: pytest.MonkeyPatch) -> Device:
    d = Device(id=uuid.uuid4(), name="DemoJetson", device_token="tok-abc")
    session.add(d)
    session.commit()
    monkeypatch.setattr(settings, "device_tokens", f"{d.id}:tok-abc")
    return d


def _payload(idx: int = 1) -> dict:
    return {
        "agent_event_id": idx,
        "type": "UYUYOR",
        "track_id": 5,
        "occurred_at": datetime(2026, 5, 5, 12, 0, 0, tzinfo=timezone.utc).isoformat(),
        "metadata": {"perclos": 91.2},
    }


def _multipart(payload: dict, image: bytes) -> dict:
    return {
        "files": {
            "payload": ("payload.json", json.dumps(payload), "application/json"),
            "screenshot": ("violation.jpg", io.BytesIO(image), "image/jpeg"),
        }
    }


def test_post_event_creates_row_and_returns_201(client: TestClient, device: Device):
    res = client.post(
        f"/api/devices/{device.id}/events",
        headers={"Authorization": "Bearer tok-abc"},
        **_multipart(_payload(1), b"\xff\xd8\xff\xe0fake"),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["device_id"] == str(device.id)
    assert body["screenshot_url"].endswith(".jpg")


def test_post_event_rejects_bad_token(client: TestClient, device: Device):
    res = client.post(
        f"/api/devices/{device.id}/events",
        headers={"Authorization": "Bearer wrong"},
        **_multipart(_payload(2), b"x"),
    )
    assert res.status_code == 401


def test_post_event_idempotent_returns_409(client: TestClient, device: Device):
    headers = {"Authorization": "Bearer tok-abc"}
    client.post(f"/api/devices/{device.id}/events", headers=headers, **_multipart(_payload(9), b"a"))
    res = client.post(
        f"/api/devices/{device.id}/events", headers=headers, **_multipart(_payload(9), b"b")
    )
    assert res.status_code == 409


def test_post_event_rejects_oversize_screenshot(
    client: TestClient, device: Device, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "max_screenshot_bytes", 10)
    res = client.post(
        f"/api/devices/{device.id}/events",
        headers={"Authorization": "Bearer tok-abc"},
        **_multipart(_payload(3), b"x" * 50),
    )
    assert res.status_code == 413


def test_get_events_returns_recent_first(client: TestClient, device: Device):
    headers = {"Authorization": "Bearer tok-abc"}
    for i in range(3):
        client.post(
            f"/api/devices/{device.id}/events",
            headers=headers,
            **_multipart(_payload(i), b"x"),
        )
    res = client.get("/api/events?limit=10")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 3
    ids = [e["agent_event_id"] for e in items]
    assert ids == sorted(ids, reverse=True)
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd backend && pytest tests/test_events_router.py -v
```

Expected: 404 / ImportError.

- [ ] **Step 3: Create `backend/app/routers/events.py`**

```python
from __future__ import annotations

import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import DbSession, require_device_auth
from app.models import Event
from app.schemas.event import EventIn, EventOut
from app.services.event_store import EventAlreadyExists, create_event
from app.services.panel_hub import hub

router = APIRouter(prefix="/api", tags=["events"])


def _to_out(event: Event) -> EventOut:
    return EventOut(
        id=event.id,
        device_id=event.device_id,
        agent_event_id=event.agent_event_id,
        type=event.type,  # type: ignore[arg-type]
        track_id=event.track_id,
        occurred_at=event.occurred_at,
        received_at=event.received_at,
        screenshot_url=f"/uploads/{event.screenshot_path}" if event.screenshot_path else None,
        metadata=event.metadata_json,
    )


@router.post("/devices/{device_id}/events", status_code=status.HTTP_201_CREATED)
async def post_event(
    device_id: Annotated[str, Depends(require_device_auth)],
    db: DbSession,
    payload: Annotated[str, Form()],
    screenshot: Annotated[UploadFile, File()],
) -> EventOut:
    image = await screenshot.read()
    if len(image) > settings.max_screenshot_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "screenshot too large")
    if not image.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "screenshot must be JPEG")

    try:
        event_in = EventIn.model_validate_json(payload)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"invalid payload: {exc}") from exc

    try:
        event = create_event(db, uuid.UUID(device_id), event_in, image)
    except EventAlreadyExists:
        raise HTTPException(status.HTTP_409_CONFLICT, "event already recorded") from None

    db.commit()
    db.refresh(event)
    out = _to_out(event)
    await hub.broadcast({"type": "event_created", "payload": out.model_dump(mode="json")})
    return out


@router.get("/events")
def list_events(db: DbSession, limit: int = 50) -> list[EventOut]:
    limit = max(1, min(limit, 200))
    rows = (
        db.execute(select(Event).order_by(Event.occurred_at.desc()).limit(limit)).scalars().all()
    )
    return [_to_out(r) for r in rows]
```

- [ ] **Step 4: Modify `backend/app/main.py` to include the router and mount uploads**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import events, health


def create_app() -> FastAPI:
    app = FastAPI(title="Fleet Backend", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(events.router)

    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")

    return app


app = create_app()
```

- [ ] **Step 5: Run tests**

```bash
cd backend && pytest tests/test_events_router.py -v
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/events.py backend/app/main.py backend/tests/test_events_router.py
git commit -m "feat(backend): add events router (POST/GET) + multipart ingest"
```

---

# Phase C — WebSocket panel (Tasks 12-13)

Goal of phase: Browser can subscribe to `/ws/panel` and receive live `event_created` messages when a new event is POSTed.

---

### Task 12: Add ws_panel router

**Files:**
- Create: `backend/app/routers/ws_panel.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create `backend/app/routers/ws_panel.py`**

```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.panel_hub import hub

router = APIRouter()


@router.websocket("/ws/panel")
async def ws_panel(ws: WebSocket) -> None:
    await ws.accept()
    queue = hub.subscribe()
    try:
        while True:
            message = await queue.get()
            await ws.send_json(message)
    except WebSocketDisconnect:
        pass
    finally:
        hub.unsubscribe(queue)
```

- [ ] **Step 2: Modify `backend/app/main.py` to include `ws_panel`**

Add `ws_panel` to imports and `include_router` calls. Replace the imports + body inside `create_app`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import events, health, ws_panel


def create_app() -> FastAPI:
    app = FastAPI(title="Fleet Backend", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(events.router)
    app.include_router(ws_panel.router)

    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")

    return app


app = create_app()
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/ws_panel.py backend/app/main.py
git commit -m "feat(backend): add /ws/panel websocket subscriber endpoint"
```

---

### Task 13: E2E test — POST event broadcasts to /ws/panel

**Files:**
- Modify: `backend/tests/test_events_router.py` (add new test)

- [ ] **Step 1: Append the new test to `backend/tests/test_events_router.py`**

```python
def test_post_event_broadcasts_to_ws_panel(client: TestClient, device: Device):
    headers = {"Authorization": "Bearer tok-abc"}
    with client.websocket_connect("/ws/panel") as ws:
        client.post(
            f"/api/devices/{device.id}/events",
            headers=headers,
            **_multipart(_payload(99), b"\xff\xd8\xff\xe0img"),
        )
        msg = ws.receive_json()
        assert msg["type"] == "event_created"
        assert msg["payload"]["agent_event_id"] == 99
        assert msg["payload"]["type"] == "UYUYOR"
```

- [ ] **Step 2: Run test**

```bash
cd backend && pytest tests/test_events_router.py::test_post_event_broadcasts_to_ws_panel -v
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_events_router.py
git commit -m "test(backend): assert ws_panel receives event_created on POST"
```

---

# Phase D — Agent uploader + simulate CLI (Tasks 14-17)

Goal of phase: `python -m agent.simulate_event --type UYUYOR` from the agent dir hits the running backend, posts a fixture JPEG, prints the resulting event id.

---

### Task 14: Add httpx dep + extend agent config

**Files:**
- Modify: `agent/pyproject.toml`
- Modify: `agent/agent/config.py`

- [ ] **Step 1: Replace `agent/pyproject.toml`**

```toml
[project]
name = "fleet-agent"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "websockets>=13.1",
    "httpx>=0.28",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: Replace `agent/agent/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class AgentSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGENT_", env_file=".env", extra="ignore")

    device_token: str = "dev-token"
    device_id: str = "00000000-0000-0000-0000-000000000001"
    backend_url: str = "http://localhost:8000"
    port: int = 9000


settings = AgentSettings()
```

- [ ] **Step 3: Reinstall agent deps**

```bash
cd agent && pip install -e ".[dev]"
```

Expected: httpx + pytest-asyncio installed.

- [ ] **Step 4: Commit**

```bash
git add agent/pyproject.toml agent/agent/config.py
git commit -m "chore(agent): add httpx dep and backend_url/device_id config"
```

---

### Task 15: Add agent uploader + tests

**Files:**
- Create: `agent/agent/uploader.py`
- Create: `agent/tests/test_uploader.py`

- [ ] **Step 1: Create the failing test `agent/tests/test_uploader.py`**

```python
import json

import httpx
import pytest

from agent.uploader import EventPayload, send_event


def _transport(handler):
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_send_event_posts_multipart_and_returns_event_id():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("Authorization")
        captured["body"] = request.content
        return httpx.Response(201, json={"id": 7, "screenshot_url": "/uploads/x.jpg"})

    payload = EventPayload(
        agent_event_id=1,
        type="UYUYOR",
        track_id=2,
        occurred_at_iso="2026-05-05T12:00:00+00:00",
        metadata={"perclos": 88.0},
    )
    async with httpx.AsyncClient(transport=_transport(handler)) as client:
        result = await send_event(
            client,
            backend_url="http://test",
            device_id="dev-1",
            device_token="tok",
            payload=payload,
            screenshot=b"\xff\xd8\xff\xe0img",
        )
    assert result == 7
    assert captured["url"] == "http://test/api/devices/dev-1/events"
    assert captured["auth"] == "Bearer tok"
    assert b'"agent_event_id":1' in captured["body"].replace(b" ", b"")


@pytest.mark.asyncio
async def test_send_event_treats_409_as_success():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(409, json={"detail": "dup"})

    payload = EventPayload(
        agent_event_id=1,
        type="UYUYOR",
        track_id=None,
        occurred_at_iso="2026-05-05T12:00:00+00:00",
        metadata={},
    )
    async with httpx.AsyncClient(transport=_transport(handler)) as client:
        result = await send_event(
            client,
            backend_url="http://test",
            device_id="dev-1",
            device_token="tok",
            payload=payload,
            screenshot=b"\xff\xd8\xff\xe0",
        )
    assert result is None  # already on server, treat as success


@pytest.mark.asyncio
async def test_send_event_raises_on_401():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "bad token"})

    payload = EventPayload(
        agent_event_id=1,
        type="UYUYOR",
        track_id=None,
        occurred_at_iso="2026-05-05T12:00:00+00:00",
        metadata={},
    )
    async with httpx.AsyncClient(transport=_transport(handler)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            await send_event(
                client,
                backend_url="http://test",
                device_id="dev-1",
                device_token="tok",
                payload=payload,
                screenshot=b"\xff\xd8\xff\xe0",
            )
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd agent && pytest tests/test_uploader.py -v
```

Expected: ImportError.

- [ ] **Step 3: Create `agent/agent/uploader.py`**

```python
from __future__ import annotations

import json
from dataclasses import dataclass

import httpx


@dataclass
class EventPayload:
    agent_event_id: int
    type: str
    track_id: int | None
    occurred_at_iso: str
    metadata: dict


async def send_event(
    client: httpx.AsyncClient,
    backend_url: str,
    device_id: str,
    device_token: str,
    payload: EventPayload,
    screenshot: bytes,
) -> int | None:
    """POST a violation to the backend.

    Returns the new event id on 201, None on 409 (already recorded).
    Raises httpx.HTTPStatusError for any other non-2xx.
    """
    url = f"{backend_url}/api/devices/{device_id}/events"
    headers = {"Authorization": f"Bearer {device_token}"}
    body = {
        "agent_event_id": payload.agent_event_id,
        "type": payload.type,
        "track_id": payload.track_id,
        "occurred_at": payload.occurred_at_iso,
        "metadata": payload.metadata,
    }
    files = {
        "payload": ("payload.json", json.dumps(body), "application/json"),
        "screenshot": ("violation.jpg", screenshot, "image/jpeg"),
    }
    response = await client.post(url, headers=headers, files=files, timeout=10.0)
    if response.status_code == 409:
        return None
    response.raise_for_status()
    return int(response.json()["id"])
```

- [ ] **Step 4: Run tests**

```bash
cd agent && pytest tests/test_uploader.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add agent/agent/uploader.py agent/tests/test_uploader.py
git commit -m "feat(agent): add uploader.send_event with idempotent 409 handling"
```

---

### Task 16: Add fixture JPEG + simulate_event CLI

**Files:**
- Create: `agent/fixtures/sample_violation.jpg`
- Create: `agent/agent/simulate_event.py`

- [ ] **Step 1: Generate a small valid JPEG fixture**

Run from `agent/`:

```bash
mkdir -p fixtures
python -c "
from PIL import Image, ImageDraw
img = Image.new('RGB', (640, 360), color='black')
d = ImageDraw.Draw(img)
d.rectangle((20, 20, 620, 340), outline='red', width=4)
d.text((40, 40), 'GUARDWATCH DEMO VIOLATION', fill='red')
img.save('fixtures/sample_violation.jpg', 'JPEG', quality=70)
print('wrote', 'fixtures/sample_violation.jpg')
"
```

If Pillow is not installed, install once: `pip install Pillow`. (Pillow is not added to `pyproject.toml` because it's only needed to regenerate the fixture, not at runtime.)

Verify:

```bash
python -c "open('fixtures/sample_violation.jpg', 'rb').read()[:3]"
```

Expected file size: ~5–15 KB.

- [ ] **Step 2: Create `agent/agent/simulate_event.py`**

```python
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
from pathlib import Path

import httpx

from agent.config import settings
from agent.uploader import EventPayload, send_event

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "sample_violation.jpg"


async def main_async(args: argparse.Namespace) -> int:
    payload = EventPayload(
        agent_event_id=args.agent_event_id,
        type=args.type,
        track_id=args.track_id,
        occurred_at_iso=datetime.now(tz=timezone.utc).isoformat(),
        metadata={"perclos": args.perclos, "pitch": args.pitch, "signal_src": "MP"},
    )
    image = FIXTURE.read_bytes()
    async with httpx.AsyncClient() as client:
        event_id = await send_event(
            client,
            backend_url=settings.backend_url,
            device_id=settings.device_id,
            device_token=settings.device_token,
            payload=payload,
            screenshot=image,
        )
    if event_id is None:
        print(f"already recorded (409): agent_event_id={args.agent_event_id}")
    else:
        print(f"created event id={event_id}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Simulate a Guardwatch violation event")
    parser.add_argument(
        "--type",
        choices=["GOZ_KAPALI", "HAREKETSIZ", "UYUYOR", "TAKIP_KAYBEDILDI"],
        default="UYUYOR",
    )
    parser.add_argument("--agent-event-id", type=int, default=int(datetime.now().timestamp()))
    parser.add_argument("--track-id", type=int, default=1)
    parser.add_argument("--perclos", type=float, default=85.0)
    parser.add_argument("--pitch", type=float, default=22.5)
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 3: Commit**

```bash
git add agent/fixtures/sample_violation.jpg agent/agent/simulate_event.py
git commit -m "feat(agent): add simulate_event CLI + sample violation fixture"
```

---

### Task 17: Update env.example + docker-compose with new env

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Replace `.env.example`**

```
# Backend
DATABASE_URL=postgresql+psycopg://fleet:fleet@postgres:5432/fleet
JWT_SECRET=change-me-to-a-32-byte-random-string
JWT_ALGORITHM=HS256
ACCESS_TOKEN_TTL_MIN=15
REFRESH_TOKEN_TTL_DAYS=7
CORS_ORIGINS=http://localhost:3000

# Demo violation flow
UPLOADS_DIR=./uploads
DEVICE_TOKENS=00000000-0000-0000-0000-000000000001:dev-token

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000

# Agent (dev)
AGENT_DEVICE_ID=00000000-0000-0000-0000-000000000001
AGENT_DEVICE_TOKEN=dev-token
AGENT_BACKEND_URL=http://backend:8000
AGENT_PORT=9000
```

- [ ] **Step 2: Replace `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: fleet
      POSTGRES_PASSWORD: fleet
      POSTGRES_DB: fleet
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fleet -d fleet"]
      interval: 3s
      timeout: 3s
      retries: 5

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+psycopg://fleet:fleet@postgres:5432/fleet
      JWT_SECRET: dev-secret-change-me
      CORS_ORIGINS: http://localhost:3000
      UPLOADS_DIR: /uploads
      DEVICE_TOKENS: 00000000-0000-0000-0000-000000000001:dev-token
    volumes:
      - ./backend:/app
      - backend_uploads:/uploads
    command: >
      sh -c "alembic upgrade head &&
             python -c 'from app.db import SessionLocal; from app.models import Device; import uuid;
             s=SessionLocal();
             did=uuid.UUID(\"00000000-0000-0000-0000-000000000001\");
             d=s.get(Device, did);
             d or s.add(Device(id=did, name=\"Demo Jetson 1\", device_token=\"dev-token\"));
             s.commit(); s.close()' &&
             uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
      NEXT_PUBLIC_WS_URL: ws://localhost:8000
    volumes:
      - ./frontend:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      - backend

  agent:
    build:
      context: ./agent
      dockerfile: Dockerfile.dev
    environment:
      AGENT_DEVICE_ID: 00000000-0000-0000-0000-000000000001
      AGENT_DEVICE_TOKEN: dev-token
      AGENT_BACKEND_URL: http://backend:8000
      AGENT_PORT: 9000
    volumes:
      - ./agent:/app
    depends_on:
      - backend

volumes:
  postgres_data:
  backend_uploads:
```

The backend `command` runs migrations and seeds the demo device on every container start. Idempotent (gets the existing row first; only inserts if missing).

- [ ] **Step 3: Commit**

```bash
git add .env.example docker-compose.yml
git commit -m "feat(infra): add demo device seed, uploads volume, agent backend env"
```

---

# Phase E — Frontend dashboard (Tasks 18-25)

Goal of phase: visiting `http://localhost:3000` shows a dashboard. On page load, last 50 events render as a card list; when a new event arrives over `/ws/panel`, it slides into the top of the list and a sonner toast pops up; clicking a card opens a lightbox with the full-size JPEG.

---

### Task 18: Add vitest + @testing-library to frontend

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/tests/setup.ts`

- [ ] **Step 1: Replace `frontend/package.json`**

```json
{
  "name": "frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-slot": "^1.2.4",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.14.0",
    "next": "14.2.35",
    "next-themes": "^0.4.6",
    "react": "^18",
    "react-dom": "^18",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.5.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^8",
    "eslint-config-next": "14.2.35",
    "jsdom": "^25.0.1",
    "postcss": "^8",
    "prettier": "^3.8.3",
    "prettier-plugin-tailwindcss": "^0.8.0",
    "tailwindcss": "^3.4.1",
    "tailwindcss-animate": "^1.0.7",
    "typescript": "^5",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `frontend/vitest.config.ts`**

```ts
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
  },
});
```

- [ ] **Step 3: Create `frontend/tests/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Install deps + run empty test suite**

```bash
cd frontend && npm install
npm test
```

Expected: vitest finds no tests → exit 0 with "No test files found."

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/tests/setup.ts
git commit -m "test(frontend): add vitest + testing-library setup"
```

---

### Task 19: Add types and api lib

**Files:**
- Create: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/api.ts`

- [ ] **Step 1: Create `frontend/src/lib/types.ts`**

```ts
export type ViolationType =
  | "GOZ_KAPALI"
  | "HAREKETSIZ"
  | "UYUYOR"
  | "TAKIP_KAYBEDILDI";

export interface ViolationEvent {
  id: number;
  device_id: string;
  agent_event_id: number;
  type: ViolationType;
  track_id: number | null;
  occurred_at: string;
  received_at: string;
  screenshot_url: string | null;
  metadata: Record<string, unknown>;
}

export interface PanelMessage {
  type: "event_created";
  payload: ViolationEvent;
}
```

- [ ] **Step 2: Create `frontend/src/lib/api.ts`**

```ts
import type { ViolationEvent } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function absoluteUrl(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}

export async function getEvents(limit = 50): Promise<ViolationEvent[]> {
  const res = await fetch(`${API_URL}/api/events?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`getEvents failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat(frontend): add ViolationEvent types and getEvents api helper"
```

---

### Task 20: Add ws panel client

**Files:**
- Create: `frontend/src/lib/ws.ts`

- [ ] **Step 1: Create `frontend/src/lib/ws.ts`**

```ts
import type { PanelMessage } from "./types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

export interface PanelHandle {
  close(): void;
}

export function openPanelWs(
  onMessage: (msg: PanelMessage) => void,
  onStatusChange?: (status: "open" | "closed") => void,
): PanelHandle {
  let closed = false;
  let ws: WebSocket | null = null;
  let backoffMs = 1000;

  const connect = () => {
    if (closed) return;
    ws = new WebSocket(`${WS_URL}/ws/panel`);
    ws.onopen = () => {
      backoffMs = 1000;
      onStatusChange?.("open");
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as PanelMessage;
        if (data?.type === "event_created") onMessage(data);
      } catch {
        // ignore malformed
      }
    };
    ws.onclose = () => {
      onStatusChange?.("closed");
      if (closed) return;
      setTimeout(connect, backoffMs);
      backoffMs = Math.min(backoffMs * 2, 10000);
    };
    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return {
    close() {
      closed = true;
      ws?.close();
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/ws.ts
git commit -m "feat(frontend): add openPanelWs with auto-reconnect backoff"
```

---

### Task 21: Add useEventStream hook + tests

**Files:**
- Create: `frontend/src/hooks/useEventStream.ts`
- Create: `frontend/tests/useEventStream.test.tsx`

- [ ] **Step 1: Create the failing test `frontend/tests/useEventStream.test.tsx`**

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEventStream } from "@/hooks/useEventStream";
import type { ViolationEvent } from "@/lib/types";

const sample: ViolationEvent = {
  id: 1,
  device_id: "d1",
  agent_event_id: 1,
  type: "UYUYOR",
  track_id: 1,
  occurred_at: "2026-05-05T12:00:00+00:00",
  received_at: "2026-05-05T12:00:01+00:00",
  screenshot_url: "/uploads/d1/1.jpg",
  metadata: { perclos: 88 },
};

const wsHandlers = vi.hoisted(() => ({
  onMessage: null as ((m: { type: "event_created"; payload: ViolationEvent }) => void) | null,
  close: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getEvents: vi.fn(async () => [sample]),
  absoluteUrl: (p: string | null) => p,
}));

vi.mock("@/lib/ws", () => ({
  openPanelWs: (cb: (m: { type: "event_created"; payload: ViolationEvent }) => void) => {
    wsHandlers.onMessage = cb;
    return { close: wsHandlers.close };
  },
}));

describe("useEventStream", () => {
  beforeEach(() => {
    wsHandlers.onMessage = null;
    wsHandlers.close.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads initial events on mount", async () => {
    const { result } = renderHook(() => useEventStream());
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].id).toBe(1);
  });

  it("prepends new events from ws to the list", async () => {
    const { result } = renderHook(() => useEventStream());
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    act(() => {
      wsHandlers.onMessage!({
        type: "event_created",
        payload: { ...sample, id: 2, agent_event_id: 2 },
      });
    });
    expect(result.current.events[0].id).toBe(2);
    expect(result.current.events).toHaveLength(2);
  });

  it("dedupes by id when ws delivers an already-loaded event", async () => {
    const { result } = renderHook(() => useEventStream());
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    act(() => {
      wsHandlers.onMessage!({ type: "event_created", payload: sample });
    });
    expect(result.current.events).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd frontend && npm test
```

Expected: ImportError / cannot resolve `@/hooks/useEventStream`.

- [ ] **Step 3: Create `frontend/src/hooks/useEventStream.ts`**

```ts
"use client";

import { useEffect, useState } from "react";

import { getEvents } from "@/lib/api";
import type { ViolationEvent } from "@/lib/types";
import { openPanelWs } from "@/lib/ws";

export type WsStatus = "open" | "closed";

export function useEventStream() {
  const [events, setEvents] = useState<ViolationEvent[]>([]);
  const [status, setStatus] = useState<WsStatus>("closed");
  const [latest, setLatest] = useState<ViolationEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEvents()
      .then((initial) => {
        if (!cancelled) setEvents(initial);
      })
      .catch(() => {
        // backend down; leave list empty
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handle = openPanelWs(
      (msg) => {
        setEvents((prev) => {
          if (prev.some((e) => e.id === msg.payload.id)) return prev;
          return [msg.payload, ...prev];
        });
        setLatest(msg.payload);
      },
      setStatus,
    );
    return () => handle.close();
  }, []);

  return { events, status, latest };
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useEventStream.ts frontend/tests/useEventStream.test.tsx
git commit -m "feat(frontend): add useEventStream hook with initial load + ws merge"
```

---

### Task 22: Add EventLightbox component

**Files:**
- Create: `frontend/src/components/EventLightbox.tsx`

- [ ] **Step 1: Create `frontend/src/components/EventLightbox.tsx`**

```tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { absoluteUrl } from "@/lib/api";
import type { ViolationEvent } from "@/lib/types";

interface Props {
  event: ViolationEvent | null;
  onClose: () => void;
}

export function EventLightbox({ event, onClose }: Props) {
  const open = event !== null;
  const screenshot = absoluteUrl(event?.screenshot_url ?? null);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogTitle>{event?.type ?? ""}</DialogTitle>
        <DialogDescription>
          {event ? `Track ${event.track_id ?? "?"} · ${event.occurred_at}` : ""}
        </DialogDescription>
        {screenshot && (
          <img
            src={screenshot}
            alt={event?.type ?? ""}
            className="max-h-[70vh] w-full rounded object-contain"
          />
        )}
        {event?.metadata && Object.keys(event.metadata).length > 0 && (
          <pre className="rounded bg-muted p-3 text-xs">
            {JSON.stringify(event.metadata, null, 2)}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/EventLightbox.tsx
git commit -m "feat(frontend): add EventLightbox dialog for full-size violation image"
```

---

### Task 23: Add EventList component + tests

**Files:**
- Create: `frontend/src/components/EventList.tsx`
- Create: `frontend/tests/EventList.test.tsx`

- [ ] **Step 1: Create the failing test `frontend/tests/EventList.test.tsx`**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EventList } from "@/components/EventList";
import type { ViolationEvent } from "@/lib/types";

const items: ViolationEvent[] = [
  {
    id: 1,
    device_id: "d1",
    agent_event_id: 1,
    type: "UYUYOR",
    track_id: 7,
    occurred_at: "2026-05-05T12:00:00+00:00",
    received_at: "2026-05-05T12:00:01+00:00",
    screenshot_url: "/uploads/d1/1.jpg",
    metadata: {},
  },
  {
    id: 2,
    device_id: "d1",
    agent_event_id: 2,
    type: "GOZ_KAPALI",
    track_id: 7,
    occurred_at: "2026-05-05T12:01:00+00:00",
    received_at: "2026-05-05T12:01:01+00:00",
    screenshot_url: null,
    metadata: {},
  },
];

describe("EventList", () => {
  it("renders one card per event with type and track", () => {
    render(<EventList events={items} onSelect={vi.fn()} />);
    expect(screen.getByText("UYUYOR")).toBeInTheDocument();
    expect(screen.getByText("GOZ_KAPALI")).toBeInTheDocument();
    expect(screen.getAllByText(/Track 7/i)).toHaveLength(2);
  });

  it("calls onSelect with event when card clicked", () => {
    const onSelect = vi.fn();
    render(<EventList events={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("UYUYOR").closest("button")!);
    expect(onSelect).toHaveBeenCalledWith(items[0]);
  });

  it("renders empty state when list is empty", () => {
    render(<EventList events={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(/no violations yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd frontend && npm test -- EventList
```

Expected: cannot find module.

- [ ] **Step 3: Create `frontend/src/components/EventList.tsx`**

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { absoluteUrl } from "@/lib/api";
import type { ViolationEvent, ViolationType } from "@/lib/types";

const TYPE_COLOR: Record<ViolationType, string> = {
  UYUYOR: "bg-red-600 text-white",
  GOZ_KAPALI: "bg-orange-500 text-white",
  HAREKETSIZ: "bg-amber-500 text-black",
  TAKIP_KAYBEDILDI: "bg-zinc-500 text-white",
};

interface Props {
  events: ViolationEvent[];
  onSelect: (event: ViolationEvent) => void;
}

export function EventList({ events, onSelect }: Props) {
  if (events.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        No violations yet — waiting for the first event.
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => {
        const url = absoluteUrl(event.screenshot_url);
        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect(event)}
            className="text-left transition hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <Card className="overflow-hidden">
              {url ? (
                <img src={url} alt={event.type} className="aspect-video w-full object-cover" />
              ) : (
                <div className="flex aspect-video items-center justify-center bg-muted text-muted-foreground">
                  no image
                </div>
              )}
              <div className="space-y-1 p-3">
                <div className="flex items-center justify-between">
                  <Badge className={TYPE_COLOR[event.type]}>{event.type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Track {event.track_id ?? "?"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{event.occurred_at}</p>
              </div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test -- EventList
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/EventList.tsx frontend/tests/EventList.test.tsx
git commit -m "feat(frontend): add EventList grid component with tests"
```

---

### Task 24: Wire layout.tsx with Toaster + ThemeProvider

**Files:**
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Replace `frontend/src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "GuardWatch",
  description: "Fleet management and monitoring",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={geistSans.variable} suppressHydrationWarning>
      <body className={`${geistMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <Toaster position="bottom-left" />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/layout.tsx
git commit -m "feat(frontend): mount Toaster + ThemeProvider in root layout"
```

---

### Task 25: Replace home page with dashboard

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Replace `frontend/src/app/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EventLightbox } from "@/components/EventLightbox";
import { EventList } from "@/components/EventList";
import { useEventStream } from "@/hooks/useEventStream";
import { absoluteUrl } from "@/lib/api";
import type { ViolationEvent } from "@/lib/types";

export default function DashboardPage() {
  const { events, status, latest } = useEventStream();
  const [selected, setSelected] = useState<ViolationEvent | null>(null);

  useEffect(() => {
    if (!latest) return;
    const url = absoluteUrl(latest.screenshot_url);
    toast(latest.type, {
      description: `Track ${latest.track_id ?? "?"} · ${latest.occurred_at}`,
      icon: url ? <img src={url} alt="" className="h-10 w-10 rounded object-cover" /> : null,
      action: { label: "Inspect", onClick: () => setSelected(latest) },
    });
  }, [latest]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Guardwatch — Live Violations</h1>
          <p className="text-sm text-muted-foreground">
            {events.length} event{events.length === 1 ? "" : "s"} · ws {status}
          </p>
        </div>
      </header>
      <EventList events={events} onSelect={setSelected} />
      <EventLightbox event={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat(frontend): wire dashboard page with live event stream + toast + lightbox"
```

---

# Phase F — End-to-end demo verification (Task 26)

Goal of phase: confirm the full happy path works in a real browser.

---

### Task 26: Manual E2E demo + smoke test

**Files:** none — this task only verifies behavior.

- [ ] **Step 1: Bring everything up**

```bash
docker compose up --build -d
docker compose logs -f backend
```

Wait for `Application startup complete`. Hit Ctrl-C to detach.

Verify backend running:

```bash
curl http://localhost:8000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 2: Verify the demo device was seeded**

```bash
docker compose exec postgres psql -U fleet -d fleet -c "SELECT id, name FROM devices;"
```

Expected: one row with id `00000000-0000-0000-0000-000000000001` named `Demo Jetson 1`.

- [ ] **Step 3: Open the dashboard**

Open `http://localhost:3000` in a browser. Expected: header "Guardwatch — Live Violations · 0 events · ws open" and the empty-state card "No violations yet — waiting for the first event."

- [ ] **Step 4: Fire a simulated violation from the agent container**

```bash
docker compose exec agent python -m agent.simulate_event --type UYUYOR
```

Expected stdout: `created event id=1`.

Within 2 seconds in the browser:
- A toast slides in at the bottom-left, showing the thumbnail + "UYUYOR" + "Inspect" action.
- A new card appears at the top of the list, with the same fixture image.

- [ ] **Step 5: Click the card; lightbox opens with full image and metadata**

Expected: dialog opens showing the JPEG full-width and a JSON block with `perclos`, `pitch`, `signal_src`.

- [ ] **Step 6: Fire a duplicate (idempotency check)**

```bash
docker compose exec agent python -m agent.simulate_event --type UYUYOR --agent-event-id 1
```

Expected stdout: `already recorded (409): agent_event_id=1`. No new card on the dashboard.

- [ ] **Step 7: Fire a different type**

```bash
docker compose exec agent python -m agent.simulate_event --type GOZ_KAPALI
```

Expected: new orange-badged card on top of the list, new toast.

- [ ] **Step 8: Tear down**

```bash
docker compose down
```

- [ ] **Step 9: Run the full backend + frontend test suites**

```bash
cd backend && pytest
cd ../frontend && npm test
```

Expected: all green.

- [ ] **Step 10: Commit (no code change — but tag the demo readiness)**

If anything had to be tweaked during E2E, commit those tweaks now with a descriptive message. Otherwise no commit needed — the test runs above prove the system is green.

---

## Self-Review Notes

- **Spec coverage:** Every section in the design doc maps to tasks: §3 data model → Tasks 1-3; §4 HTTP/WS endpoints → Tasks 11-13; §5 component boundaries → Tasks 18-25; §6 data flow → Task 26 E2E; §7 error handling → covered in router tests (auth, oversize, idempotency); §8 test strategy → Tasks 5, 8, 10, 11, 13, 15, 21, 23.
- **Type consistency check:** `EventIn`/`EventOut`/`EventBroadcast` Pydantic names line up with TS `ViolationEvent`/`PanelMessage`. Backend column `metadata` is exposed via Python attr `metadata_json` (DB-side) and serialized as `metadata` (HTTP-side) — verified in `_to_out`.
- **Schema/route check:** `POST /api/devices/{device_id}/events` device_id Path matches `require_device_auth`'s Path dependency. `screenshot_url` returned to frontend uses `/uploads/...` path; absoluteUrl prepends `NEXT_PUBLIC_API_URL`.
- **Static mount + StaticFiles:** Mounted after `uploads_dir.mkdir(...)` so first run on a clean checkout doesn't fail.
- **Demo device seed:** docker-compose `command` is idempotent (`s.get(Device, did)` guards insertion); restart doesn't duplicate.

---

Plan complete and saved to `docs/plans/2026-05-05-violation-flow-demo-first.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
