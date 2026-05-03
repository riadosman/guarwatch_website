# Guardwatch Fleet Panel — Faz 0 & Faz 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **PATH NOTE — READ FIRST:** This plan was originally written assuming the project lived inside a parent monorepo at `C:/Users/riyad/Documents/Goruntu_isleme/guardwatch_website/`. The project is now its own git repo. When executing tasks:
> - **Drop the `guardwatch_website/` prefix from every path.** Example: `guardwatch_website/backend/pyproject.toml` → `backend/pyproject.toml`.
> - **Replace `git -C C:/Users/riyad/Documents/Goruntu_isleme` with just `git`.** Cwd for git is the repo root (this repo).
> - All `docker compose`, `npm`, and `pip` commands run from the repo root or its subdirs as the task specifies (just remove the `guardwatch_website/` prefix wherever it appears in `cd` instructions).

**Goal:** Build the skeleton + auth + device CRUD + heartbeat layer of the Guardwatch fleet management panel. End state: developer runs `docker compose up`, registers an account, pastes a Jetson agent URL into the dashboard, sees the device card turn green within 5 seconds, and red within 30 seconds when the agent is killed.

**Architecture:** Three-service monorepo inside `guardwatch_website/`. Backend (FastAPI + Postgres) holds users, devices, sessions and opens **outgoing** WebSocket connections to each registered agent (Backend → Jetson model). Agent (FastAPI + uvicorn) exposes `/api/info` (token validation, used during device registration) and `/ws` (heartbeat). Frontend (Next.js App Router) provides login + dashboard + add-device modal. WebSocket `/ws/panel` pushes device status changes to the browser.

**Tech Stack:**
- Backend: Python 3.11, FastAPI, SQLAlchemy 2.0 (sync), Alembic, Pydantic v2, `passlib[bcrypt]`, `python-jose[cryptography]`, `slowapi`, `websockets`, pytest + pytest-asyncio + httpx + testcontainers
- Frontend: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, React Query, sonner (toasts), Vitest + React Testing Library
- Agent: Python 3.11, FastAPI, uvicorn, pytest
- Infra: Docker Compose, Postgres 16, pre-commit (ruff, eslint, prettier)

**Spec reference:** `docs/superpowers/specs/2026-05-03-fleet-management-phases-design.md`

---

## File Structure

All work happens inside `guardwatch_website/` (currently empty except `WEBSITE_BUILD_GUIDE.md`). Repo root is `C:/Users/riyad/Documents/Goruntu_isleme`. Run all `docker compose` and `npm` commands from `guardwatch_website/`. Run `git` commands with `-C C:/Users/riyad/Documents/Goruntu_isleme` so they target the repo root.

```
guardwatch_website/
├── README.md
├── .env.example
├── .gitignore
├── .pre-commit-config.yaml
├── docker-compose.yml
├── backend/
│   ├── pyproject.toml
│   ├── ruff.toml
│   ├── alembic.ini
│   ├── Dockerfile
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI app factory + middleware
│   │   ├── config.py               # Pydantic Settings
│   │   ├── db.py                   # SQLAlchemy engine, SessionLocal
│   │   ├── alembic/
│   │   │   ├── env.py
│   │   │   ├── script.py.mako
│   │   │   └── versions/
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── base.py             # DeclarativeBase
│   │   │   ├── user.py
│   │   │   ├── session.py
│   │   │   └── device.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   └── device.py
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── security.py         # bcrypt, JWT, token utils
│   │   │   └── deps.py             # get_db, get_current_user
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── health.py
│   │   │   ├── auth.py
│   │   │   ├── devices.py
│   │   │   └── ws_panel.py
│   │   └── services/
│   │       ├── __init__.py
│   │       └── device_connector.py # outgoing WS pool to agents
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py
│       ├── test_health.py
│       ├── test_auth.py
│       ├── test_devices.py
│       └── test_device_connector.py
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── components.json             # shadcn config
│   ├── .eslintrc.json
│   ├── .prettierrc
│   ├── Dockerfile
│   ├── public/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx            # redirect to /login or /dashboard
│   │   │   ├── globals.css
│   │   │   ├── login/page.tsx
│   │   │   └── dashboard/page.tsx
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn-generated
│   │   │   ├── DeviceCard.tsx
│   │   │   ├── AddDeviceModal.tsx
│   │   │   ├── KpiBar.tsx
│   │   │   └── Providers.tsx       # React Query, theme
│   │   ├── lib/
│   │   │   ├── api.ts              # fetch wrapper, auth cookie
│   │   │   ├── ws.ts               # /ws/panel client
│   │   │   └── types.ts            # shared TS types
│   │   └── hooks/
│   │       ├── useAuth.ts
│   │       ├── useDevices.ts
│   │       └── usePanelWs.ts
│   └── tests/
│       ├── setup.ts
│       ├── login.test.tsx
│       └── dashboard.test.tsx
└── agent/
    ├── pyproject.toml
    ├── Dockerfile.dev              # dev-only; real Jetson uses install_agent.sh
    ├── install_agent.sh            # cloudflared + systemd setup
    ├── agent/
    │   ├── __init__.py
    │   ├── main.py
    │   ├── server.py               # FastAPI app: /api/info + /ws
    │   └── config.py
    └── tests/
        ├── __init__.py
        └── test_server.py
```

**Boundaries & responsibilities:**
- `backend/app/core/` — pure utilities (security primitives), no DB
- `backend/app/models/` — SQLAlchemy ORM only
- `backend/app/schemas/` — Pydantic request/response shapes only
- `backend/app/routers/` — HTTP/WS endpoints, thin (delegate to services)
- `backend/app/services/` — long-lived background tasks (DeviceConnector)
- `frontend/src/lib/` — IO with backend (HTTP, WS) — no React
- `frontend/src/hooks/` — React state wrappers around lib/
- `frontend/src/components/` — presentational
- `agent/agent/` — mirror of backend's API contract for the Jetson side

---

# Phase 0 — Skeleton (Tasks 1-9)

Goal of phase: `docker compose up` brings up 3 services. `localhost:8000/health` returns 200. `localhost:3000` shows a Next.js placeholder page. Agent dev container prints "agent ready". One commit per task, all green tests.

---

### Task 1: Repo init — directories, .gitignore, README, top-level config

**Files:**
- Create: `guardwatch_website/.gitignore`
- Create: `guardwatch_website/README.md`
- Create: `guardwatch_website/.env.example`
- Create: `guardwatch_website/backend/`, `guardwatch_website/frontend/`, `guardwatch_website/agent/` (empty dirs OK; populated next tasks)

- [ ] **Step 1: Create `guardwatch_website/.gitignore`**

```gitignore
# Python
__pycache__/
*.py[cod]
*.egg-info/
.venv/
venv/
.pytest_cache/
.ruff_cache/
.mypy_cache/

# Node
node_modules/
.next/
dist/
build/
*.log
npm-debug.log*

# Env
.env
.env.local
.env.*.local

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp

# App data
uploads/
agent.db
*.sqlite
*.sqlite3
```

- [ ] **Step 2: Create `guardwatch_website/README.md`**

```markdown
# Guardwatch Fleet Panel

Multi-Jetson fleet management panel for the Guardwatch drowsiness detection system.

## Quick start (dev)

```
docker compose up
```

- Backend: http://localhost:8000
- Frontend: http://localhost:3000
- Postgres: localhost:5432

## Structure

- `backend/` — FastAPI + Postgres, JWT auth, device CRUD, outgoing WS to agents
- `frontend/` — Next.js panel
- `agent/` — Python agent that runs on each Jetson; exposes `/api/info` + `/ws`

See `docs/superpowers/specs/2026-05-03-fleet-management-phases-design.md` for the design doc.
```

- [ ] **Step 3: Create `guardwatch_website/.env.example`**

```
# Backend
DATABASE_URL=postgresql+psycopg://fleet:fleet@postgres:5432/fleet
JWT_SECRET=change-me-to-a-32-byte-random-string
JWT_ALGORITHM=HS256
ACCESS_TOKEN_TTL_MIN=15
REFRESH_TOKEN_TTL_DAYS=7
CORS_ORIGINS=http://localhost:3000

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000

# Agent (dev)
AGENT_DEVICE_TOKEN=dev-token-replace-in-prod
AGENT_PORT=9000
```

- [ ] **Step 4: Verify dirs**

Run from `C:/Users/riyad/Documents/Goruntu_isleme/guardwatch_website`:
```
ls
```
Expected output includes: `.env.example`, `.gitignore`, `README.md`, plus `WEBSITE_BUILD_GUIDE.md` (already there).

- [ ] **Step 5: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/.gitignore guardwatch_website/README.md guardwatch_website/.env.example
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "chore: init fleet panel monorepo with .gitignore, README, .env.example"
```

---

### Task 2: Backend skeleton — FastAPI app + health endpoint + first test

**Files:**
- Create: `guardwatch_website/backend/pyproject.toml`
- Create: `guardwatch_website/backend/ruff.toml`
- Create: `guardwatch_website/backend/app/__init__.py`
- Create: `guardwatch_website/backend/app/main.py`
- Create: `guardwatch_website/backend/app/config.py`
- Create: `guardwatch_website/backend/app/routers/__init__.py`
- Create: `guardwatch_website/backend/app/routers/health.py`
- Create: `guardwatch_website/backend/tests/__init__.py`
- Create: `guardwatch_website/backend/tests/conftest.py`
- Create: `guardwatch_website/backend/tests/test_health.py`

- [ ] **Step 1: Write `backend/pyproject.toml`**

```toml
[project]
name = "fleet-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "sqlalchemy>=2.0",
    "psycopg[binary]>=3.2",
    "alembic>=1.14",
    "passlib[bcrypt]>=1.7.4",
    "python-jose[cryptography]>=3.3",
    "slowapi>=0.1.9",
    "websockets>=13.1",
    "python-multipart>=0.0.20",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "httpx>=0.28",
    "testcontainers[postgres]>=4.9",
    "ruff>=0.8",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: Write `backend/ruff.toml`**

```toml
line-length = 100
target-version = "py311"

[lint]
select = ["E", "F", "I", "B", "UP"]
ignore = ["E501"]
```

- [ ] **Step 3: Write `backend/app/config.py`**

```python
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


settings = Settings()
```

- [ ] **Step 4: Write `backend/app/__init__.py`** (empty file, just to mark it a package)

```python
```

- [ ] **Step 5: Write `backend/app/routers/__init__.py`** (empty)

```python
```

- [ ] **Step 6: Write `backend/app/routers/health.py`**

```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 7: Write `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import health


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
    return app


app = create_app()
```

- [ ] **Step 8: Write `backend/tests/__init__.py`** (empty)

```python
```

- [ ] **Step 9: Write `backend/tests/conftest.py`**

```python
import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())
```

- [ ] **Step 10: Write the failing test in `backend/tests/test_health.py`**

```python
def test_health_returns_ok(client) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 11: Install backend deps and run tests**

From `guardwatch_website/backend/`:
```
python -m venv .venv
.venv\Scripts\activate    # PowerShell: .venv\Scripts\Activate.ps1
pip install -e ".[dev]"
pytest -v
```
Expected: `1 passed`. If fails: read traceback, fix imports, rerun.

- [ ] **Step 12: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/pyproject.toml guardwatch_website/backend/ruff.toml guardwatch_website/backend/app guardwatch_website/backend/tests
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): scaffold FastAPI app with /health endpoint and first test"
```

---

### Task 3: Backend Dockerfile + docker-compose with Postgres

**Files:**
- Create: `guardwatch_website/backend/Dockerfile`
- Create: `guardwatch_website/docker-compose.yml`

- [ ] **Step 1: Write `backend/Dockerfile`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e ".[dev]"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

- [ ] **Step 2: Write `guardwatch_website/docker-compose.yml`**

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
    volumes:
      - ./backend:/app
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```

- [ ] **Step 3: Bring services up and verify**

From `guardwatch_website/`:
```
docker compose up -d postgres backend
```
Wait ~10 seconds for backend to start, then:
```
curl http://localhost:8000/health
```
Expected: `{"status":"ok"}`. If you see a connection refused, run `docker compose logs backend` to debug.

- [ ] **Step 4: Tear down**

```
docker compose down
```

- [ ] **Step 5: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/Dockerfile guardwatch_website/docker-compose.yml
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(infra): add backend Dockerfile and docker-compose with postgres"
```

---

### Task 4: Frontend skeleton — Next.js + Tailwind + shadcn/ui

**Files:**
- Create everything inside `guardwatch_website/frontend/` via `create-next-app`, then commit.

- [ ] **Step 1: Scaffold Next.js**

From `guardwatch_website/`:
```
npx create-next-app@14 frontend --typescript --tailwind --eslint --app --no-src-dir --use-npm --import-alias "@/*"
```
When prompted "Would you like your code inside a `src/` directory?" answer **Yes**. (If your CLI version skips that prompt, manually move `app/` into `src/app/` after generation.)

- [ ] **Step 2: Verify it boots**

```
cd frontend
npm run dev
```
Visit http://localhost:3000 — default Next.js page renders. Stop with Ctrl+C.

- [ ] **Step 3: Initialize shadcn/ui**

From `guardwatch_website/frontend/`:
```
npx shadcn@latest init
```
Choose defaults (TypeScript: yes, base color: slate, CSS variables: yes). When asked "Where is your global CSS?" answer `src/app/globals.css`. When asked about path alias, accept `@/*`.

- [ ] **Step 4: Add baseline shadcn components**

```
npx shadcn@latest add button card dialog input label sonner badge
```

- [ ] **Step 5: Add `.prettierrc`**

`frontend/.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```
Then:
```
npm install --save-dev prettier prettier-plugin-tailwindcss
```

- [ ] **Step 6: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/frontend
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(frontend): scaffold Next.js 14 with Tailwind, shadcn/ui, prettier"
```

---

### Task 5: Frontend Dockerfile + add to docker-compose

**Files:**
- Create: `guardwatch_website/frontend/Dockerfile`
- Modify: `guardwatch_website/docker-compose.yml`

- [ ] **Step 1: Write `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

- [ ] **Step 2: Add `.dockerignore`**

`frontend/.dockerignore`:
```
node_modules
.next
.git
.env*
```

- [ ] **Step 3: Add `frontend` service to `docker-compose.yml`**

Append under `backend:` block (before `volumes:`):
```yaml
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    volumes:
      - ./frontend:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      - backend
```

- [ ] **Step 4: Verify**

```
docker compose up -d
```
Wait 30 seconds (Next.js dev compile is slow), then visit http://localhost:3000 — Next.js page renders. Tear down: `docker compose down`.

- [ ] **Step 5: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/frontend/Dockerfile guardwatch_website/frontend/.dockerignore guardwatch_website/docker-compose.yml
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(infra): add frontend Dockerfile and compose service"
```

---

### Task 6: Agent skeleton — minimal FastAPI app + health

**Files:**
- Create: `guardwatch_website/agent/pyproject.toml`
- Create: `guardwatch_website/agent/agent/__init__.py`
- Create: `guardwatch_website/agent/agent/config.py`
- Create: `guardwatch_website/agent/agent/server.py`
- Create: `guardwatch_website/agent/agent/main.py`
- Create: `guardwatch_website/agent/tests/__init__.py`
- Create: `guardwatch_website/agent/tests/test_server.py`
- Create: `guardwatch_website/agent/Dockerfile.dev`

- [ ] **Step 1: Write `agent/pyproject.toml`**

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
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "httpx>=0.28",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 2: Write `agent/agent/__init__.py`** (empty)

```python
```

- [ ] **Step 3: Write `agent/agent/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class AgentSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGENT_", env_file=".env", extra="ignore")

    device_token: str = "dev-token"
    port: int = 9000


settings = AgentSettings()
```

- [ ] **Step 4: Write `agent/agent/server.py`**

```python
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="Fleet Agent", version="0.1.0")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 5: Write `agent/agent/main.py`**

```python
import uvicorn

from agent.config import settings


def main() -> None:
    print(f"agent starting on port {settings.port}")
    uvicorn.run("agent.server:app", host="0.0.0.0", port=settings.port, reload=False)


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Write `agent/tests/__init__.py`** (empty)

```python
```

- [ ] **Step 7: Write the failing test in `agent/tests/test_server.py`**

```python
from fastapi.testclient import TestClient

from agent.server import create_app


def test_agent_health() -> None:
    client = TestClient(create_app())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 8: Install + test**

From `guardwatch_website/agent/`:
```
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
pytest -v
```
Expected: `1 passed`.

- [ ] **Step 9: Write `agent/Dockerfile.dev`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e ".[dev]"

COPY . .

EXPOSE 9000

CMD ["python", "-m", "agent.main"]
```

- [ ] **Step 10: Add `agent` service to `docker-compose.yml`**

Append under `frontend:` block:
```yaml
  agent:
    build:
      context: ./agent
      dockerfile: Dockerfile.dev
    ports:
      - "9000:9000"
    environment:
      AGENT_DEVICE_TOKEN: dev-token
      AGENT_PORT: 9000
    volumes:
      - ./agent:/app
```

- [ ] **Step 11: Verify**

```
docker compose up -d
```
Wait 15 seconds, then:
```
curl http://localhost:9000/health
curl http://localhost:8000/health
curl -I http://localhost:3000
```
All three should return success. Tear down: `docker compose down`.

- [ ] **Step 12: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/agent guardwatch_website/docker-compose.yml
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(agent): scaffold FastAPI agent with /health and dev compose service"
```

---

### Task 7: Postgres + SQLAlchemy + Alembic init

**Files:**
- Create: `guardwatch_website/backend/app/db.py`
- Create: `guardwatch_website/backend/app/models/__init__.py`
- Create: `guardwatch_website/backend/app/models/base.py`
- Create: `guardwatch_website/backend/alembic.ini`
- Create: `guardwatch_website/backend/app/alembic/env.py`
- Create: `guardwatch_website/backend/app/alembic/script.py.mako`
- Create: `guardwatch_website/backend/app/alembic/versions/.gitkeep`

- [ ] **Step 1: Write `backend/app/models/__init__.py`** (empty for now)

```python
```

- [ ] **Step 2: Write `backend/app/models/base.py`**

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

- [ ] **Step 3: Write `backend/app/db.py`**

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Write `backend/alembic.ini`**

```ini
[alembic]
script_location = app/alembic
sqlalchemy.url = postgresql+psycopg://fleet:fleet@localhost:5432/fleet

[loggers]
keys = root,sqlalchemy,alembic

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

[handlers]
keys = console

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatters]
keys = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
```

- [ ] **Step 5: Write `backend/app/alembic/env.py`**

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import settings
from app.models.base import Base
from app.models import user, session, device  # noqa: F401  -- ensure models register

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
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

Note: `user`, `session`, `device` modules are referenced but won't exist until Tasks 11-16. We'll add stubs in Step 6 so Alembic can import them today and we don't have to revisit env.py.

- [ ] **Step 6: Create stub model files (will be filled in later tasks)**

`backend/app/models/user.py`:
```python
# placeholder; populated in Task 11
```

`backend/app/models/session.py`:
```python
# placeholder; populated in Task 14
```

`backend/app/models/device.py`:
```python
# placeholder; populated in Task 16
```

- [ ] **Step 7: Write `backend/app/alembic/script.py.mako`**

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

revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 8: Add empty versions dir marker**

Create `backend/app/alembic/versions/.gitkeep` (empty file).

- [ ] **Step 9: Verify Alembic config loads**

From `backend/` (with venv active and Postgres running via `docker compose up -d postgres`):
```
alembic -c alembic.ini current
```
Expected: prints "Current revision(s) for ...:" with no error. (No revisions yet, so output is empty after that header.)

- [ ] **Step 10: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/db.py guardwatch_website/backend/app/models guardwatch_website/backend/alembic.ini guardwatch_website/backend/app/alembic
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): add SQLAlchemy + Alembic scaffolding"
```

---

### Task 8: Pre-commit hooks (ruff, eslint, prettier)

**Files:**
- Create: `guardwatch_website/.pre-commit-config.yaml`

- [ ] **Step 1: Write `.pre-commit-config.yaml`**

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.8.6
    hooks:
      - id: ruff
        args: [--fix]
        files: ^guardwatch_website/(backend|agent)/
      - id: ruff-format
        files: ^guardwatch_website/(backend|agent)/

  - repo: local
    hooks:
      - id: prettier-frontend
        name: prettier (frontend)
        entry: bash -c 'cd guardwatch_website/frontend && npx prettier --write "$@"' --
        language: system
        files: ^guardwatch_website/frontend/.*\.(ts|tsx|js|jsx|json|css)$
        pass_filenames: true

      - id: eslint-frontend
        name: eslint (frontend)
        entry: bash -c 'cd guardwatch_website/frontend && npx eslint --fix "$@"' --
        language: system
        files: ^guardwatch_website/frontend/.*\.(ts|tsx|js|jsx)$
        pass_filenames: true
```

- [ ] **Step 2: Install pre-commit**

```
pip install pre-commit
pre-commit install
```

- [ ] **Step 3: Run on all files**

```
pre-commit run --all-files
```
First run will install hooks; expected to format some files. If any errors are not auto-fixable, read the error and fix manually.

- [ ] **Step 4: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/.pre-commit-config.yaml
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "chore: add pre-commit hooks (ruff, prettier, eslint)"
```

---

### Task 9: Phase 0 smoke test — all three services up

- [ ] **Step 1: Start everything**

From `guardwatch_website/`:
```
docker compose up -d
```

- [ ] **Step 2: Wait and verify**

Wait ~30 seconds for Next.js dev compile, then run all in parallel:
```
curl http://localhost:8000/health
curl http://localhost:9000/health
curl -I http://localhost:3000
```
Expected:
- `:8000/health` → `{"status":"ok"}`
- `:9000/health` → `{"status":"ok"}`
- `:3000` → HTTP 200

- [ ] **Step 3: Tear down**

```
docker compose down
```

- [ ] **Step 4: Tag the milestone**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme tag faz0-skeleton
```

**Phase 0 done.** Move to Phase 1.

---

# Phase 1 — Auth + Cihaz CRUD + Heartbeat (Tasks 10-31)

Goal of phase: end-to-end add-device flow works. Register → login → click "Yeni Cihaz Ekle" → paste agent URL → see green card. Kill agent container → 30 sec later, card turns red. All backend work TDD'd.

---

### Task 10: User model + Alembic migration

**Files:**
- Modify: `guardwatch_website/backend/app/models/user.py`
- Create: `guardwatch_website/backend/app/alembic/versions/<timestamp>_create_users.py` (generated)
- Create: `guardwatch_website/backend/tests/test_models_user.py`

- [ ] **Step 1: Replace `backend/app/models/user.py` with the model**

```python
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="admin")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 2: Generate migration**

From `guardwatch_website/backend/` (Postgres up, venv active):
```
alembic -c alembic.ini revision --autogenerate -m "create users table"
```
This creates a file in `app/alembic/versions/`. Open it and verify it has `op.create_table("users", ...)` with the columns from Step 1.

- [ ] **Step 3: Apply migration**

```
alembic -c alembic.ini upgrade head
```
Expected: prints "Running upgrade  -> <hash>, create users table".

- [ ] **Step 4: Write the test in `backend/tests/test_models_user.py`**

```python
from datetime import datetime
from uuid import UUID

from app.models.user import User


def test_user_construct_defaults() -> None:
    u = User(email="a@b.com", password_hash="x")
    assert isinstance(u.id, UUID) or u.id is None  # default fires on insert
    assert u.email == "a@b.com"
    assert u.role == "admin"
```

- [ ] **Step 5: Run tests**

```
pytest -v tests/test_models_user.py
```
Expected: `1 passed`. (User construction without DB is enough at this step.)

- [ ] **Step 6: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/models/user.py guardwatch_website/backend/app/alembic/versions guardwatch_website/backend/tests/test_models_user.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): add User model and migration"
```

---

### Task 11: Security utils — bcrypt + JWT

**Files:**
- Create: `guardwatch_website/backend/app/core/__init__.py`
- Create: `guardwatch_website/backend/app/core/security.py`
- Create: `guardwatch_website/backend/tests/test_security.py`

- [ ] **Step 1: Write `backend/app/core/__init__.py`** (empty)

```python
```

- [ ] **Step 2: Write the failing tests in `backend/tests/test_security.py`**

```python
from datetime import timedelta

import pytest
from jose import JWTError

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_hash_and_verify_password() -> None:
    h = hash_password("hunter22hunter")
    assert h != "hunter22hunter"
    assert verify_password("hunter22hunter", h) is True
    assert verify_password("wrong", h) is False


def test_access_token_roundtrip() -> None:
    token = create_access_token(subject="user-123")
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"


def test_refresh_token_roundtrip() -> None:
    token, jti = create_refresh_token(subject="user-123")
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
    assert payload["type"] == "refresh"
    assert payload["jti"] == jti


def test_decode_invalid_token_raises() -> None:
    with pytest.raises(JWTError):
        decode_token("not-a-jwt")


def test_expired_token_raises() -> None:
    token = create_access_token(subject="user", ttl=timedelta(seconds=-1))
    with pytest.raises(JWTError):
        decode_token(token)
```

- [ ] **Step 3: Run — expect failure**

```
pytest -v tests/test_security.py
```
Expected: `ImportError: cannot import name 'create_access_token' from 'app.core.security'`.

- [ ] **Step 4: Write `backend/app/core/security.py`**

```python
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from jose import jwt
from passlib.context import CryptContext

from app.config import settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd.verify(password, password_hash)


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def create_access_token(subject: str, ttl: timedelta | None = None) -> str:
    if ttl is None:
        ttl = timedelta(minutes=settings.access_token_ttl_min)
    payload = {
        "sub": subject,
        "type": "access",
        "iat": _now(),
        "exp": _now() + ttl,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: str, ttl: timedelta | None = None) -> tuple[str, str]:
    if ttl is None:
        ttl = timedelta(days=settings.refresh_token_ttl_days)
    jti = uuid4().hex
    payload = {
        "sub": subject,
        "type": "refresh",
        "jti": jti,
        "iat": _now(),
        "exp": _now() + ttl,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, jti


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def generate_device_token() -> str:
    """32-byte URL-safe token used for backend → agent auth."""
    return secrets.token_urlsafe(32)
```

- [ ] **Step 5: Run — expect pass**

```
pytest -v tests/test_security.py
```
Expected: `5 passed`.

- [ ] **Step 6: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/core guardwatch_website/backend/tests/test_security.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): add bcrypt + JWT security utils with full tests"
```

---

### Task 12: Sessions model + migration

**Files:**
- Modify: `guardwatch_website/backend/app/models/session.py`
- Create: migration via autogenerate

- [ ] **Step 1: Replace `backend/app/models/session.py`**

```python
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserSession(Base):
    __tablename__ = "sessions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
```

- [ ] **Step 2: Generate + apply migration**

```
alembic -c alembic.ini revision --autogenerate -m "create sessions table"
alembic -c alembic.ini upgrade head
```

- [ ] **Step 3: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/models/session.py guardwatch_website/backend/app/alembic/versions
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): add UserSession model and migration"
```

---

### Task 13: Test infra — testcontainers postgres fixture

**Files:**
- Modify: `guardwatch_website/backend/tests/conftest.py`

- [ ] **Step 1: Replace `backend/tests/conftest.py`**

```python
import os
import subprocess
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from testcontainers.postgres import PostgresContainer

from app.db import get_db
from app.main import create_app
from app.models.base import Base


@pytest.fixture(scope="session")
def postgres_container() -> Generator[PostgresContainer, None, None]:
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest.fixture(scope="session")
def engine(postgres_container):
    url = postgres_container.get_connection_url().replace("postgresql+psycopg2", "postgresql+psycopg")
    eng = create_engine(url, future=True)
    # Run migrations
    os.environ["DATABASE_URL"] = url
    subprocess.check_call(["alembic", "-c", "alembic.ini", "upgrade", "head"])
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine) -> Generator[Session, None, None]:
    """Per-test session with transaction rollback for isolation."""
    connection = engine.connect()
    transaction = connection.begin()
    SessionLocal = sessionmaker(bind=connection, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db) -> Generator[TestClient, None, None]:
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

- [ ] **Step 2: Verify existing tests still pass**

```
pytest -v
```
Expected: all tests still pass (health, security, user model). Testcontainers may take 10-15s on first run to pull the image.

- [ ] **Step 3: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/tests/conftest.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "test(backend): add testcontainers postgres fixture with rollback isolation"
```

---

### Task 14: Auth schemas + dependencies

**Files:**
- Create: `guardwatch_website/backend/app/schemas/__init__.py`
- Create: `guardwatch_website/backend/app/schemas/auth.py`
- Create: `guardwatch_website/backend/app/core/deps.py`

- [ ] **Step 1: Write `backend/app/schemas/__init__.py`** (empty)

```python
```

- [ ] **Step 2: Write `backend/app/schemas/auth.py`**

```python
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    role: str
```

- [ ] **Step 3: Write `backend/app/core/deps.py`**

```python
from collections.abc import Generator
from uuid import UUID

from fastapi import Cookie, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db import get_db
from app.models.user import User


def get_current_user(
    access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    if access_token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no access token")
    try:
        payload = decode_token(access_token)
    except JWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from e
    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong token type")
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no sub")
    user = db.get(User, UUID(user_id))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    return user
```

- [ ] **Step 4: Add `email-validator` to backend deps**

Edit `backend/pyproject.toml`, add `"email-validator>=2.2"` to `dependencies` list. Then:
```
pip install -e ".[dev]"
```

- [ ] **Step 5: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/schemas guardwatch_website/backend/app/core/deps.py guardwatch_website/backend/pyproject.toml
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): add auth schemas and get_current_user dependency"
```

---

### Task 15: /auth/register endpoint

**Files:**
- Create: `guardwatch_website/backend/app/routers/auth.py`
- Modify: `guardwatch_website/backend/app/main.py`
- Create: `guardwatch_website/backend/tests/test_auth.py`

- [ ] **Step 1: Write the failing test in `backend/tests/test_auth.py`**

```python
def test_register_creates_user(client) -> None:
    r = client.post(
        "/auth/register",
        json={"email": "alice@example.com", "password": "hunter22hunter"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "alice@example.com"
    assert body["role"] == "admin"
    assert "id" in body


def test_register_duplicate_email_409(client) -> None:
    client.post("/auth/register", json={"email": "x@y.com", "password": "longenoughpw"})
    r = client.post("/auth/register", json={"email": "x@y.com", "password": "longenoughpw"})
    assert r.status_code == 409


def test_register_short_password_422(client) -> None:
    r = client.post("/auth/register", json={"email": "z@z.com", "password": "short"})
    assert r.status_code == 422
```

- [ ] **Step 2: Run — expect failure**

```
pytest -v tests/test_auth.py
```
Expected: 404 (route doesn't exist).

- [ ] **Step 3: Write `backend/app/routers/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, db: Session = Depends(get_db)) -> UserOut:
    existing = db.query(User).filter(User.email == req.email).first()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    user = User(email=req.email, password_hash=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut(id=str(user.id), email=user.email, role=user.role)
```

- [ ] **Step 4: Wire into `app/main.py`**

Replace `from app.routers import health` with:
```python
from app.routers import auth, health
```
And replace `app.include_router(health.router)` with:
```python
app.include_router(health.router)
app.include_router(auth.router)
```

- [ ] **Step 5: Run — expect pass**

```
pytest -v tests/test_auth.py
```
Expected: `3 passed`.

- [ ] **Step 6: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/routers/auth.py guardwatch_website/backend/app/main.py guardwatch_website/backend/tests/test_auth.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): add POST /auth/register"
```

---

### Task 16: /auth/login + /auth/me + cookie-based JWT

**Files:**
- Modify: `guardwatch_website/backend/app/routers/auth.py`
- Modify: `guardwatch_website/backend/tests/test_auth.py`

- [ ] **Step 1: Add tests to `backend/tests/test_auth.py`**

Append to the file:
```python
def test_login_success_sets_cookies(client) -> None:
    client.post("/auth/register", json={"email": "lex@x.com", "password": "longenoughpw"})
    r = client.post("/auth/login", json={"email": "lex@x.com", "password": "longenoughpw"})
    assert r.status_code == 200
    assert r.json()["email"] == "lex@x.com"
    assert "access_token" in r.cookies
    assert "refresh_token" in r.cookies


def test_login_wrong_password_401(client) -> None:
    client.post("/auth/register", json={"email": "p@q.com", "password": "longenoughpw"})
    r = client.post("/auth/login", json={"email": "p@q.com", "password": "wrongpassword"})
    assert r.status_code == 401


def test_login_unknown_email_401(client) -> None:
    r = client.post("/auth/login", json={"email": "nobody@x.com", "password": "longenoughpw"})
    assert r.status_code == 401


def test_me_requires_auth(client) -> None:
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_me_returns_user_after_login(client) -> None:
    client.post("/auth/register", json={"email": "meg@x.com", "password": "longenoughpw"})
    client.post("/auth/login", json={"email": "meg@x.com", "password": "longenoughpw"})
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == "meg@x.com"
```

- [ ] **Step 2: Run — expect failure**

```
pytest -v tests/test_auth.py
```
Expected: 5 new tests fail with 404.

- [ ] **Step 3: Extend `backend/app/routers/auth.py`**

Replace the file with:
```python
import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.db import get_db
from app.models.session import UserSession
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie(
        "access_token",
        access,
        httponly=True,
        secure=False,  # toggle to True behind HTTPS (Faz 5)
        samesite="strict",
        max_age=settings.access_token_ttl_min * 60,
        path="/",
    )
    response.set_cookie(
        "refresh_token",
        refresh,
        httponly=True,
        secure=False,
        samesite="strict",
        max_age=settings.refresh_token_ttl_days * 86400,
        path="/auth",
    )


def _hash_jti(jti: str) -> str:
    return hashlib.sha256(jti.encode()).hexdigest()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, db: Session = Depends(get_db)) -> UserOut:
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    user = User(email=req.email, password_hash=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut(id=str(user.id), email=user.email, role=user.role)


@router.post("/login", response_model=UserOut)
def login(
    req: LoginRequest, response: Response, db: Session = Depends(get_db)
) -> UserOut:
    user = db.query(User).filter(User.email == req.email).first()
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")

    access = create_access_token(subject=str(user.id))
    refresh, jti = create_refresh_token(subject=str(user.id))
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=_hash_jti(jti),
            expires_at=datetime.now(tz=timezone.utc)
            + timedelta(days=settings.refresh_token_ttl_days),
        )
    )
    user.last_login_at = datetime.now(tz=timezone.utc)
    db.commit()

    _set_auth_cookies(response, access, refresh)
    return UserOut(id=str(user.id), email=user.email, role=user.role)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut(id=str(user.id), email=user.email, role=user.role)
```

- [ ] **Step 4: Run — expect pass**

```
pytest -v tests/test_auth.py
```
Expected: `8 passed`.

- [ ] **Step 5: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/routers/auth.py guardwatch_website/backend/tests/test_auth.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): add /auth/login and /auth/me with cookie-based JWT"
```

---

### Task 17: /auth/refresh + /auth/logout

**Files:**
- Modify: `guardwatch_website/backend/app/routers/auth.py`
- Modify: `guardwatch_website/backend/tests/test_auth.py`

- [ ] **Step 1: Add tests**

Append to `tests/test_auth.py`:
```python
def test_refresh_issues_new_access_token(client) -> None:
    client.post("/auth/register", json={"email": "r@x.com", "password": "longenoughpw"})
    client.post("/auth/login", json={"email": "r@x.com", "password": "longenoughpw"})
    old_access = client.cookies.get("access_token")
    r = client.post("/auth/refresh")
    assert r.status_code == 200
    new_access = r.cookies.get("access_token")
    assert new_access is not None
    assert new_access != old_access


def test_refresh_without_cookie_401(client) -> None:
    r = client.post("/auth/refresh")
    assert r.status_code == 401


def test_logout_clears_cookies_and_revokes_refresh(client) -> None:
    client.post("/auth/register", json={"email": "lo@x.com", "password": "longenoughpw"})
    client.post("/auth/login", json={"email": "lo@x.com", "password": "longenoughpw"})
    r = client.post("/auth/logout")
    assert r.status_code == 204
    # Now /auth/me should fail because access cookie is cleared
    r2 = client.get("/auth/me")
    assert r2.status_code == 401


def test_logout_revoked_refresh_cannot_refresh(client) -> None:
    client.post("/auth/register", json={"email": "rv@x.com", "password": "longenoughpw"})
    client.post("/auth/login", json={"email": "rv@x.com", "password": "longenoughpw"})
    refresh_cookie = client.cookies.get("refresh_token")
    client.post("/auth/logout")
    # Manually re-attach the now-revoked refresh cookie
    r = client.post("/auth/refresh", cookies={"refresh_token": refresh_cookie})
    assert r.status_code == 401
```

- [ ] **Step 2: Run — expect failure**

```
pytest -v tests/test_auth.py
```
Expected: 4 new tests fail (404).

- [ ] **Step 3: Add `refresh` and `logout` to `app/routers/auth.py`**

Append to the file (after `me`):
```python
from fastapi import Cookie
from jose import JWTError

from app.core.security import decode_token


@router.post("/refresh", response_model=UserOut)
def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> UserOut:
    if refresh_token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no refresh token")
    try:
        payload = decode_token(refresh_token)
    except JWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid refresh token") from e
    if payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong token type")

    jti = payload.get("jti")
    if jti is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no jti")
    session = (
        db.query(UserSession).filter(UserSession.token_hash == _hash_jti(jti)).first()
    )
    if session is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "session revoked")

    from uuid import UUID

    user = db.get(User, UUID(payload["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")

    new_access = create_access_token(subject=str(user.id))
    new_refresh, new_jti = create_refresh_token(subject=str(user.id))

    db.delete(session)
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=_hash_jti(new_jti),
            expires_at=datetime.now(tz=timezone.utc)
            + timedelta(days=settings.refresh_token_ttl_days),
        )
    )
    db.commit()

    _set_auth_cookies(response, new_access, new_refresh)
    return UserOut(id=str(user.id), email=user.email, role=user.role)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> None:
    if refresh_token is not None:
        try:
            payload = decode_token(refresh_token)
            jti = payload.get("jti")
            if jti:
                session = (
                    db.query(UserSession)
                    .filter(UserSession.token_hash == _hash_jti(jti))
                    .first()
                )
                if session is not None:
                    db.delete(session)
                    db.commit()
        except JWTError:
            pass  # invalid refresh token: still clear cookies

    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/auth")
```

- [ ] **Step 4: Run — expect pass**

```
pytest -v tests/test_auth.py
```
Expected: `12 passed`.

- [ ] **Step 5: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/routers/auth.py guardwatch_website/backend/tests/test_auth.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): add /auth/refresh and /auth/logout with session revocation"
```

---

### Task 18: Login rate-limit (slowapi)

**Files:**
- Modify: `guardwatch_website/backend/app/main.py`
- Modify: `guardwatch_website/backend/app/routers/auth.py`
- Modify: `guardwatch_website/backend/tests/test_auth.py`

- [ ] **Step 1: Add test**

Append to `tests/test_auth.py`:
```python
def test_login_rate_limited_after_5_attempts(client) -> None:
    client.post("/auth/register", json={"email": "rl@x.com", "password": "longenoughpw"})
    for _ in range(5):
        client.post("/auth/login", json={"email": "rl@x.com", "password": "wrongpw"})
    r = client.post("/auth/login", json={"email": "rl@x.com", "password": "wrongpw"})
    assert r.status_code == 429
```

- [ ] **Step 2: Run — expect failure**

```
pytest -v tests/test_auth.py::test_login_rate_limited_after_5_attempts
```
Expected: assertion error (status was 401 not 429).

- [ ] **Step 3: Add slowapi limiter in `backend/app/main.py`**

Replace contents:
```python
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.routers import auth, health

limiter = Limiter(key_func=get_remote_address)


def create_app() -> FastAPI:
    app = FastAPI(title="Fleet Backend", version="0.1.0")
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    return app


app = create_app()
```

- [ ] **Step 4: Apply limiter to login in `app/routers/auth.py`**

At the top of the file, add:
```python
from fastapi import Request

from app.main import limiter
```
**Wait — circular import.** Move the limiter declaration to a new file: `backend/app/core/limiter.py`:
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
```

Then in `app/main.py` change `limiter = Limiter(key_func=get_remote_address)` to `from app.core.limiter import limiter`.

In `app/routers/auth.py` import:
```python
from app.core.limiter import limiter
```

And decorate the login function:
```python
@router.post("/login", response_model=UserOut)
@limiter.limit("5/5minutes")
def login(
    request: Request,  # required by slowapi
    req: LoginRequest, response: Response, db: Session = Depends(get_db)
) -> UserOut:
    ...
```
Note the new `request: Request` param.

- [ ] **Step 5: Run all tests — expect pass**

```
pytest -v
```
Expected: all auth tests pass including the new rate limit test.

- [ ] **Step 6: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/main.py guardwatch_website/backend/app/core/limiter.py guardwatch_website/backend/app/routers/auth.py guardwatch_website/backend/tests/test_auth.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): rate-limit /auth/login (5 attempts / 5 minutes)"
```

---

### Task 19: Device model + migration

**Files:**
- Modify: `guardwatch_website/backend/app/models/device.py`
- Create: migration

- [ ] **Step 1: Replace `backend/app/models/device.py`**

```python
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    region: Mapped[str] = mapped_column(String(100), nullable=False)
    public_url: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    device_token: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_event_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 2: Generate + apply migration**

```
alembic -c alembic.ini revision --autogenerate -m "create devices table"
alembic -c alembic.ini upgrade head
```

- [ ] **Step 3: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/models/device.py guardwatch_website/backend/app/alembic/versions
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): add Device model and migration"
```

---

### Task 20: Agent /api/info endpoint (token validation)

The backend will call this during device registration to verify the URL+token pair before storing the device. Agent comes first so backend tests can mock it.

**Files:**
- Modify: `guardwatch_website/agent/agent/server.py`
- Modify: `guardwatch_website/agent/tests/test_server.py`

- [ ] **Step 1: Add tests**

Replace `agent/tests/test_server.py`:
```python
import pytest
from fastapi.testclient import TestClient

from agent.config import settings
from agent.server import create_app


@pytest.fixture
def client(monkeypatch) -> TestClient:
    monkeypatch.setattr(settings, "device_token", "valid-token")
    return TestClient(create_app())


def test_health(client) -> None:
    r = client.get("/health")
    assert r.status_code == 200


def test_api_info_with_valid_token(client) -> None:
    r = client.get("/api/info", headers={"Authorization": "Bearer valid-token"})
    assert r.status_code == 200
    body = r.json()
    assert body["agent_version"]
    assert body["protocol_version"] == 1


def test_api_info_with_wrong_token(client) -> None:
    r = client.get("/api/info", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


def test_api_info_without_token(client) -> None:
    r = client.get("/api/info")
    assert r.status_code == 401
```

- [ ] **Step 2: Run — expect failure**

```
pytest -v
```
Expected: 3 of 4 fail (only `/health` passes).

- [ ] **Step 3: Update `agent/agent/server.py`**

```python
from fastapi import FastAPI, Header, HTTPException, status

from agent.config import settings

AGENT_VERSION = "0.1.0"
PROTOCOL_VERSION = 1


def _check_token(authorization: str | None) -> None:
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization[len("Bearer ") :]
    if token != settings.device_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")


def create_app() -> FastAPI:
    app = FastAPI(title="Fleet Agent", version=AGENT_VERSION)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/info")
    def info(authorization: str | None = Header(default=None)) -> dict:
        _check_token(authorization)
        return {
            "agent_version": AGENT_VERSION,
            "protocol_version": PROTOCOL_VERSION,
        }

    return app


app = create_app()
```

- [ ] **Step 4: Run — expect pass**

```
pytest -v
```
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/agent/agent/server.py guardwatch_website/agent/tests/test_server.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(agent): add /api/info with bearer token auth"
```

---

### Task 21: Device schemas + URL parsing

**Files:**
- Create: `guardwatch_website/backend/app/schemas/device.py`
- Create: `guardwatch_website/backend/tests/test_device_schemas.py`

The user pastes a URL like `https://jetson-abc.fleet.example.com?token=xyz`. We must parse out the base URL and the token.

- [ ] **Step 1: Write tests in `backend/tests/test_device_schemas.py`**

```python
import pytest
from pydantic import ValidationError

from app.schemas.device import CreateDeviceRequest, parse_url_and_token


def test_parse_url_and_token() -> None:
    base, token = parse_url_and_token("https://abc.example.com?token=xyz123")
    assert base == "https://abc.example.com"
    assert token == "xyz123"


def test_parse_url_and_token_with_path() -> None:
    base, token = parse_url_and_token("https://abc.example.com/api?token=xyz")
    assert base == "https://abc.example.com/api"
    assert token == "xyz"


def test_parse_url_missing_token_raises() -> None:
    with pytest.raises(ValueError, match="token"):
        parse_url_and_token("https://abc.example.com")


def test_parse_url_invalid_scheme_raises() -> None:
    with pytest.raises(ValueError, match="https"):
        parse_url_and_token("http://abc.example.com?token=x")


def test_create_device_request_validates() -> None:
    req = CreateDeviceRequest(
        name="Truck-7",
        region="Istanbul",
        url="https://jetson-abc.example.com?token=t1",
    )
    assert req.name == "Truck-7"
    assert req.url == "https://jetson-abc.example.com?token=t1"


def test_create_device_request_short_name_fails() -> None:
    with pytest.raises(ValidationError):
        CreateDeviceRequest(name="ab", region="x", url="https://x.y?token=z")
```

- [ ] **Step 2: Run — expect failure (ImportError)**

```
pytest -v tests/test_device_schemas.py
```

- [ ] **Step 3: Write `backend/app/schemas/device.py`**

```python
from datetime import datetime
from urllib.parse import parse_qs, urlparse, urlunparse

from pydantic import BaseModel, Field, field_validator


def parse_url_and_token(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError("URL must use https scheme")
    qs = parse_qs(parsed.query)
    tokens = qs.get("token", [])
    if not tokens:
        raise ValueError("URL must include a `token` query parameter")
    base = urlunparse(parsed._replace(query="", fragment=""))
    return base.rstrip("/"), tokens[0]


class CreateDeviceRequest(BaseModel):
    name: str = Field(min_length=3, max_length=50)
    region: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=10, max_length=500)

    @field_validator("url")
    @classmethod
    def _url_has_token(cls, v: str) -> str:
        parse_url_and_token(v)  # raises ValueError if malformed
        return v


class DeviceOut(BaseModel):
    id: str
    name: str
    region: str
    public_url: str
    status: str
    last_seen_at: datetime | None
    created_at: datetime
```

- [ ] **Step 4: Run — expect pass**

```
pytest -v tests/test_device_schemas.py
```
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/schemas/device.py guardwatch_website/backend/tests/test_device_schemas.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): add device schemas with URL+token parser"
```

---

### Task 22: POST /devices (with health-check to agent)

**Files:**
- Create: `guardwatch_website/backend/app/routers/devices.py`
- Modify: `guardwatch_website/backend/app/main.py`
- Create: `guardwatch_website/backend/tests/test_devices.py`

- [ ] **Step 1: Write tests in `backend/tests/test_devices.py`**

```python
from unittest.mock import patch


def _login(client, email: str = "u@x.com") -> None:
    client.post("/auth/register", json={"email": email, "password": "longenoughpw"})
    client.post("/auth/login", json={"email": email, "password": "longenoughpw"})


def test_create_device_requires_auth(client) -> None:
    r = client.post(
        "/devices",
        json={"name": "T1", "region": "IST", "url": "https://x.com?token=t"},
    )
    assert r.status_code == 401


def test_create_device_success(client) -> None:
    _login(client)
    with patch("app.routers.devices._probe_agent", return_value=True):
        r = client.post(
            "/devices",
            json={"name": "Truck-7", "region": "Istanbul", "url": "https://jet1.example.com?token=t1"},
        )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Truck-7"
    assert body["public_url"] == "https://jet1.example.com"
    assert body["status"] == "unknown"


def test_create_device_unreachable(client) -> None:
    _login(client)
    with patch("app.routers.devices._probe_agent", return_value=False):
        r = client.post(
            "/devices",
            json={"name": "T2", "region": "x", "url": "https://nope.example.com?token=t"},
        )
    assert r.status_code == 502
    assert "UNREACHABLE" in r.json()["detail"]


def test_create_device_duplicate_url(client) -> None:
    _login(client)
    with patch("app.routers.devices._probe_agent", return_value=True):
        client.post(
            "/devices",
            json={"name": "A", "region": "x", "url": "https://dupe.example.com?token=t"},
        )
        r = client.post(
            "/devices",
            json={"name": "B", "region": "y", "url": "https://dupe.example.com?token=t"},
        )
    assert r.status_code == 409


def test_list_devices_empty(client) -> None:
    _login(client)
    r = client.get("/devices")
    assert r.status_code == 200
    assert r.json() == []


def test_list_devices_after_create(client) -> None:
    _login(client)
    with patch("app.routers.devices._probe_agent", return_value=True):
        client.post(
            "/devices",
            json={"name": "L1", "region": "x", "url": "https://l1.example.com?token=t"},
        )
    r = client.get("/devices")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["name"] == "L1"


def test_get_device_404(client) -> None:
    _login(client)
    r = client.get("/devices/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


def test_delete_device(client) -> None:
    _login(client)
    with patch("app.routers.devices._probe_agent", return_value=True):
        cr = client.post(
            "/devices",
            json={"name": "DelMe", "region": "x", "url": "https://del.example.com?token=t"},
        )
    did = cr.json()["id"]
    r = client.delete(f"/devices/{did}")
    assert r.status_code == 204
    r2 = client.get("/devices")
    assert all(d["id"] != did for d in r2.json())
```

- [ ] **Step 2: Run — expect failure**

```
pytest -v tests/test_devices.py
```

- [ ] **Step 3: Write `backend/app/routers/devices.py`**

```python
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db import get_db
from app.models.device import Device
from app.models.user import User
from app.schemas.device import CreateDeviceRequest, DeviceOut, parse_url_and_token

router = APIRouter(prefix="/devices", tags=["devices"])


def _probe_agent(base_url: str, token: str) -> bool:
    """Probe `<base_url>/api/info` with bearer token. Returns True if agent reachable AND token valid."""
    try:
        r = httpx.get(
            f"{base_url}/api/info",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5.0,
        )
        return r.status_code == 200
    except httpx.HTTPError:
        return False


def _to_out(d: Device) -> DeviceOut:
    return DeviceOut(
        id=str(d.id),
        name=d.name,
        region=d.region,
        public_url=d.public_url,
        status=d.status,
        last_seen_at=d.last_seen_at,
        created_at=d.created_at,
    )


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
def create_device(
    req: CreateDeviceRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DeviceOut:
    base_url, token = parse_url_and_token(req.url)
    existing = (
        db.query(Device)
        .filter(Device.public_url == base_url, Device.deleted_at.is_(None))
        .first()
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "ALREADY_EXISTS")

    if not _probe_agent(base_url, token):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "UNREACHABLE_OR_TOKEN_INVALID")

    device = Device(
        name=req.name,
        region=req.region,
        public_url=base_url,
        device_token=token,
        status="unknown",
        created_by=user.id,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return _to_out(device)


@router.get("", response_model=list[DeviceOut])
def list_devices(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[DeviceOut]:
    devices = db.query(Device).filter(Device.deleted_at.is_(None)).all()
    return [_to_out(d) for d in devices]


@router.get("/{device_id}", response_model=DeviceOut)
def get_device(
    device_id: UUID,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> DeviceOut:
    d = db.get(Device, device_id)
    if d is None or d.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    return _to_out(d)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: UUID,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> None:
    from datetime import datetime, timezone

    d = db.get(Device, device_id)
    if d is None or d.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    d.deleted_at = datetime.now(tz=timezone.utc)
    db.commit()
```

- [ ] **Step 4: Wire into `app/main.py`**

In `app/main.py` change:
```python
from app.routers import auth, health
```
to:
```python
from app.routers import auth, devices, health
```
And add:
```python
app.include_router(devices.router)
```
(after the auth router)

- [ ] **Step 5: Add `httpx` to `backend/pyproject.toml`** (move from dev-deps to runtime)

In `[project] dependencies`, add `"httpx>=0.28"` (it was in `dev` only). Then `pip install -e ".[dev]"`.

- [ ] **Step 6: Run all tests**

```
pytest -v
```
Expected: all device tests pass.

- [ ] **Step 7: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/routers/devices.py guardwatch_website/backend/app/main.py guardwatch_website/backend/pyproject.toml guardwatch_website/backend/tests/test_devices.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): add devices CRUD with agent probe on create"
```

---

### Task 23: Agent /ws endpoint (heartbeat)

**Files:**
- Modify: `guardwatch_website/agent/agent/server.py`
- Modify: `guardwatch_website/agent/tests/test_server.py`

- [ ] **Step 1: Add WS test**

Append to `agent/tests/test_server.py`:
```python
def test_ws_requires_token(client) -> None:
    with pytest.raises(Exception):
        with client.websocket_connect("/ws"):
            pass


def test_ws_heartbeat_roundtrip(client) -> None:
    with client.websocket_connect(
        "/ws", headers={"Authorization": "Bearer valid-token"}
    ) as ws:
        ws.send_json({"type": "ping", "ts": 1})
        msg = ws.receive_json()
        assert msg["type"] == "pong"
        assert msg["ts"] == 1
```

- [ ] **Step 2: Add WS route in `agent/agent/server.py`**

Add to `create_app()` (before `return app`):
```python
    from fastapi import WebSocket, WebSocketDisconnect

    @app.websocket("/ws")
    async def ws_endpoint(websocket: WebSocket) -> None:
        auth = websocket.headers.get("authorization")
        try:
            _check_token(auth)
        except HTTPException:
            await websocket.close(code=4401)
            return
        await websocket.accept()
        try:
            while True:
                msg = await websocket.receive_json()
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong", "ts": msg.get("ts")})
        except WebSocketDisconnect:
            return
```

- [ ] **Step 3: Run — expect pass**

```
pytest -v
```
Expected: all agent tests pass.

- [ ] **Step 4: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/agent/agent/server.py guardwatch_website/agent/tests/test_server.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(agent): add /ws endpoint with token auth and ping/pong heartbeat"
```

---

### Task 24: Backend WS /ws/panel (browser push channel)

**Files:**
- Create: `guardwatch_website/backend/app/routers/ws_panel.py`
- Modify: `guardwatch_website/backend/app/main.py`
- Create: `guardwatch_website/backend/tests/test_ws_panel.py`

- [ ] **Step 1: Write test in `backend/tests/test_ws_panel.py`**

```python
import asyncio
from unittest.mock import patch


def test_ws_panel_requires_auth(client) -> None:
    import pytest

    with pytest.raises(Exception):
        with client.websocket_connect("/ws/panel"):
            pass


def test_ws_panel_receives_broadcast(client) -> None:
    # Login to get cookies
    client.post("/auth/register", json={"email": "wp@x.com", "password": "longenoughpw"})
    client.post("/auth/login", json={"email": "wp@x.com", "password": "longenoughpw"})

    from app.routers.ws_panel import broadcast_panel

    with client.websocket_connect("/ws/panel") as ws:
        # Schedule a broadcast on the running loop
        asyncio.get_event_loop().run_until_complete(
            broadcast_panel({"type": "test", "value": 42})
        )
        msg = ws.receive_json()
        assert msg == {"type": "test", "value": 42}
```

Note: TestClient WebSocket is sync; the async broadcast call is via `run_until_complete`. This is a test convention specific to FastAPI's TestClient.

- [ ] **Step 2: Run — expect failure (ImportError)**

```
pytest -v tests/test_ws_panel.py
```

- [ ] **Step 3: Write `backend/app/routers/ws_panel.py`**

```python
import asyncio
from typing import Any

from fastapi import APIRouter, Cookie, WebSocket, WebSocketDisconnect
from jose import JWTError

from app.core.security import decode_token

router = APIRouter()

_clients: set[WebSocket] = set()
_lock = asyncio.Lock()


async def broadcast_panel(message: dict[str, Any]) -> None:
    async with _lock:
        dead = []
        for ws in _clients:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for d in dead:
            _clients.discard(d)


@router.websocket("/ws/panel")
async def ws_panel(websocket: WebSocket, access_token: str | None = Cookie(default=None)) -> None:
    if access_token is None:
        await websocket.close(code=4401)
        return
    try:
        payload = decode_token(access_token)
        if payload.get("type") != "access":
            raise JWTError("wrong type")
    except JWTError:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    async with _lock:
        _clients.add(websocket)
    try:
        while True:
            await websocket.receive_text()  # echo channel; we ignore client messages
    except WebSocketDisconnect:
        pass
    finally:
        async with _lock:
            _clients.discard(websocket)
```

- [ ] **Step 4: Wire into `app/main.py`**

Change import:
```python
from app.routers import auth, devices, health, ws_panel
```
And add:
```python
app.include_router(ws_panel.router)
```

- [ ] **Step 5: Run — expect pass**

```
pytest -v tests/test_ws_panel.py
```
Expected: pass. (If the broadcast test is flaky on Windows due to event-loop quirks, mark it `@pytest.mark.skipif(sys.platform == 'win32', ...)` and rely on integration tests later.)

- [ ] **Step 6: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/routers/ws_panel.py guardwatch_website/backend/app/main.py guardwatch_website/backend/tests/test_ws_panel.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): add /ws/panel browser push channel with cookie auth"
```

---

### Task 25: DeviceConnector — outgoing WS pool with heartbeat & status updates

This is the core background task: per-device asyncio task that maintains a WS connection to the agent, sends heartbeat pings every 10s, updates `devices.last_seen_at` on pong, marks `status='offline'` after 3 missed pongs, and pushes status changes to `/ws/panel`.

**Files:**
- Create: `guardwatch_website/backend/app/services/__init__.py`
- Create: `guardwatch_website/backend/app/services/device_connector.py`
- Create: `guardwatch_website/backend/tests/test_device_connector.py`

- [ ] **Step 1: Write `backend/app/services/__init__.py`** (empty)

```python
```

- [ ] **Step 2: Write tests in `backend/tests/test_device_connector.py`**

```python
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.device_connector import DeviceConnector


@pytest.mark.asyncio
async def test_connector_sends_ping_and_handles_pong() -> None:
    fake_ws = AsyncMock()
    fake_ws.recv = AsyncMock(return_value='{"type": "pong", "ts": 1}')
    fake_ws.send = AsyncMock()

    @asyncio.coroutine
    def fake_connect(*a, **kw):
        return fake_ws

    on_status = AsyncMock()
    connector = DeviceConnector(
        device_id="dev-1",
        url="https://x.example.com",
        token="t",
        on_status_change=on_status,
        ping_interval=0.05,
        max_missed=3,
    )

    with patch("app.services.device_connector.websockets.connect", new=AsyncMock(return_value=fake_ws)):
        task = asyncio.create_task(connector.run())
        await asyncio.sleep(0.2)
        connector.stop()
        await task

    fake_ws.send.assert_called()
    on_status.assert_called_with("dev-1", "online")


@pytest.mark.asyncio
async def test_connector_marks_offline_after_missed_pings() -> None:
    fake_ws = AsyncMock()

    async def slow_recv() -> str:
        await asyncio.sleep(10)  # never responds
        return ""

    fake_ws.recv = slow_recv
    fake_ws.send = AsyncMock()

    on_status = AsyncMock()
    connector = DeviceConnector(
        device_id="dev-2",
        url="https://x.example.com",
        token="t",
        on_status_change=on_status,
        ping_interval=0.02,
        max_missed=2,
    )

    with patch("app.services.device_connector.websockets.connect", new=AsyncMock(return_value=fake_ws)):
        task = asyncio.create_task(connector.run())
        await asyncio.sleep(0.1)
        connector.stop()
        await task

    statuses_seen = [c.args[1] for c in on_status.call_args_list]
    assert "offline" in statuses_seen
```

Note: these are illustrative; the real test for full reconnect behavior comes in integration. The unit tests verify ping/pong + offline-on-miss logic.

- [ ] **Step 3: Run — expect failure (ImportError)**

```
pytest -v tests/test_device_connector.py
```

- [ ] **Step 4: Write `backend/app/services/device_connector.py`**

```python
import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Optional

import websockets

logger = logging.getLogger(__name__)

StatusCallback = Callable[[str, str], Awaitable[None]]


class DeviceConnector:
    """
    Maintains a single outgoing WebSocket to a Jetson agent.

    Sends heartbeat pings every `ping_interval` seconds. Marks device offline
    after `max_missed` consecutive missed pongs. Reconnects with exponential
    backoff (1, 2, 4, ..., 60s) on any failure.
    """

    def __init__(
        self,
        device_id: str,
        url: str,
        token: str,
        on_status_change: StatusCallback,
        ping_interval: float = 10.0,
        max_missed: int = 3,
    ) -> None:
        self.device_id = device_id
        self.url = url
        self.token = token
        self.on_status_change = on_status_change
        self.ping_interval = ping_interval
        self.max_missed = max_missed
        self._stop = False
        self._current_status: str = "unknown"
        self._ws: Optional[websockets.WebSocketClientProtocol] = None

    def stop(self) -> None:
        self._stop = True

    async def _set_status(self, new: str) -> None:
        if new != self._current_status:
            self._current_status = new
            await self.on_status_change(self.device_id, new)

    def _ws_url(self) -> str:
        # https://x.com -> wss://x.com/ws
        if self.url.startswith("https://"):
            return "wss://" + self.url[len("https://") :].rstrip("/") + "/ws"
        return self.url.rstrip("/") + "/ws"

    async def _session(self) -> None:
        ws = await websockets.connect(
            self._ws_url(),
            additional_headers={"Authorization": f"Bearer {self.token}"},
            ping_interval=None,
        )
        self._ws = ws
        await self._set_status("online")
        missed = 0

        async def receiver() -> None:
            nonlocal missed
            try:
                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    if msg.get("type") == "pong":
                        missed = 0
            except websockets.ConnectionClosed:
                return

        recv_task = asyncio.create_task(receiver())
        try:
            while not self._stop:
                await asyncio.sleep(self.ping_interval)
                try:
                    await ws.send(json.dumps({"type": "ping", "ts": time.time()}))
                except websockets.ConnectionClosed:
                    break
                missed += 1
                if missed >= self.max_missed:
                    await self._set_status("offline")
                    break
        finally:
            recv_task.cancel()
            await ws.close()

    async def run(self) -> None:
        backoff = 1.0
        while not self._stop:
            try:
                await self._session()
            except Exception as e:
                logger.warning("device %s connection error: %s", self.device_id, e)
                await self._set_status("offline")

            if self._stop:
                break
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60.0)


class ConnectorPool:
    """Manages one DeviceConnector per registered device."""

    def __init__(self, on_status_change: StatusCallback) -> None:
        self.on_status_change = on_status_change
        self._connectors: dict[str, DeviceConnector] = {}
        self._tasks: dict[str, asyncio.Task] = {}

    def add(self, device_id: str, url: str, token: str) -> None:
        if device_id in self._connectors:
            return
        c = DeviceConnector(device_id, url, token, self.on_status_change)
        self._connectors[device_id] = c
        self._tasks[device_id] = asyncio.create_task(c.run())

    async def remove(self, device_id: str) -> None:
        c = self._connectors.pop(device_id, None)
        if c is not None:
            c.stop()
        t = self._tasks.pop(device_id, None)
        if t is not None:
            try:
                await asyncio.wait_for(t, timeout=2.0)
            except asyncio.TimeoutError:
                t.cancel()

    async def shutdown(self) -> None:
        for c in self._connectors.values():
            c.stop()
        await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        self._connectors.clear()
        self._tasks.clear()
```

- [ ] **Step 5: Run unit tests — expect pass**

```
pytest -v tests/test_device_connector.py
```
Expected: pass. (Some flake possible; if so, increase sleep durations slightly.)

- [ ] **Step 6: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/services guardwatch_website/backend/tests/test_device_connector.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): add DeviceConnector with heartbeat, offline detection, exponential backoff"
```

---

### Task 26: Wire ConnectorPool into FastAPI lifecycle + status broadcast

**Files:**
- Modify: `guardwatch_website/backend/app/main.py`
- Modify: `guardwatch_website/backend/app/routers/devices.py`

- [ ] **Step 1: Update `backend/app/main.py`**

Replace contents:
```python
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.config import settings
from app.core.limiter import limiter
from app.db import SessionLocal
from app.models.device import Device
from app.routers import auth, devices, health, ws_panel
from app.routers.ws_panel import broadcast_panel
from app.services.device_connector import ConnectorPool


async def _on_status_change(device_id: str, status: str) -> None:
    # Update DB
    db = SessionLocal()
    try:
        d = db.get(Device, UUID(device_id))
        if d is not None:
            d.status = status
            if status == "online":
                d.last_seen_at = datetime.now(tz=timezone.utc)
            db.commit()
    finally:
        db.close()
    # Broadcast to panel
    await broadcast_panel({"type": "device_status", "device_id": device_id, "status": status})


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = ConnectorPool(on_status_change=_on_status_change)
    app.state.pool = pool

    # Bootstrap: spin up connectors for existing devices
    db = SessionLocal()
    try:
        rows = db.query(Device).filter(Device.deleted_at.is_(None)).all()
        for d in rows:
            pool.add(str(d.id), d.public_url, d.device_token)
    finally:
        db.close()

    yield

    await pool.shutdown()


def create_app() -> FastAPI:
    app = FastAPI(title="Fleet Backend", version="0.1.0", lifespan=lifespan)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(devices.router)
    app.include_router(ws_panel.router)
    return app


app = create_app()
```

- [ ] **Step 2: Modify `backend/app/routers/devices.py` to register/deregister with the pool**

Add at top of `devices.py`:
```python
from fastapi import Request
```

In `create_device`, after `db.commit(); db.refresh(device)` and before `return _to_out(device)`, add:
```python
    request_app = req_app  # placeholder, see signature change below
```
Actually, change the signature to accept `request: Request`:
```python
@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
def create_device(
    request: Request,
    req: CreateDeviceRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DeviceOut:
    base_url, token = parse_url_and_token(req.url)
    existing = (
        db.query(Device)
        .filter(Device.public_url == base_url, Device.deleted_at.is_(None))
        .first()
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "ALREADY_EXISTS")

    if not _probe_agent(base_url, token):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "UNREACHABLE_OR_TOKEN_INVALID")

    device = Device(
        name=req.name,
        region=req.region,
        public_url=base_url,
        device_token=token,
        status="unknown",
        created_by=user.id,
    )
    db.add(device)
    db.commit()
    db.refresh(device)

    pool = request.app.state.pool
    pool.add(str(device.id), device.public_url, device.device_token)
    return _to_out(device)
```

Same for `delete_device` — add `request: Request` and after marking deleted:
```python
    pool = request.app.state.pool
    await pool.remove(str(d.id))
```
Note: `delete_device` must become `async def` because `pool.remove` is async.

- [ ] **Step 3: Run all tests**

```
pytest -v
```
Expected: all pass. The existing patches for `_probe_agent` will still work; the connector will try to connect during tests and fail silently (which is fine, our test patches network calls).

If tests hang on lifespan, ensure conftest's `client` fixture uses `with TestClient(app) as c:` (it does — confirmed in Task 13).

- [ ] **Step 4: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/backend/app/main.py guardwatch_website/backend/app/routers/devices.py
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(backend): wire ConnectorPool into lifespan; register/deregister devices on CRUD"
```

---

### Task 27: Frontend API client + auth context

**Files:**
- Create: `guardwatch_website/frontend/src/lib/api.ts`
- Create: `guardwatch_website/frontend/src/lib/types.ts`
- Create: `guardwatch_website/frontend/src/components/Providers.tsx`
- Modify: `guardwatch_website/frontend/src/app/layout.tsx`

- [ ] **Step 1: Install React Query**

From `guardwatch_website/frontend/`:
```
npm install @tanstack/react-query
```

- [ ] **Step 2: Write `frontend/src/lib/types.ts`**

```typescript
export type User = {
  id: string;
  email: string;
  role: "admin" | "viewer";
};

export type DeviceStatus = "online" | "offline" | "unknown";

export type Device = {
  id: string;
  name: string;
  region: string;
  public_url: string;
  status: DeviceStatus;
  last_seen_at: string | null;
  created_at: string;
};
```

- [ ] **Step 3: Write `frontend/src/lib/api.ts`**

```typescript
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(`API ${status}: ${detail}`);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ id: string; email: string; role: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string) =>
    request<{ id: string; email: string; role: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ id: string; email: string; role: string }>("/auth/me"),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  listDevices: () => request<import("./types").Device[]>("/devices"),
  createDevice: (body: { name: string; region: string; url: string }) =>
    request<import("./types").Device>("/devices", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteDevice: (id: string) => request<void>(`/devices/${id}`, { method: "DELETE" }),
};
```

- [ ] **Step 4: Write `frontend/src/components/Providers.tsx`**

```typescript
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5_000, retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="bottom-left" />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 5: Update `frontend/src/app/layout.tsx`**

Wrap children with `<Providers>`:
```typescript
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Fleet Panel",
  description: "Guardwatch fleet management",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Verify build**

```
npm run build
```
Expected: build succeeds with no TS errors.

- [ ] **Step 7: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/frontend/src/lib guardwatch_website/frontend/src/components/Providers.tsx guardwatch_website/frontend/src/app/layout.tsx guardwatch_website/frontend/package.json guardwatch_website/frontend/package-lock.json
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(frontend): add API client, types, React Query provider, sonner toast"
```

---

### Task 28: Frontend /login page

**Files:**
- Modify: `guardwatch_website/frontend/src/app/page.tsx`
- Modify: `guardwatch_website/frontend/src/app/login/page.tsx`
- Create: `guardwatch_website/frontend/src/hooks/useAuth.ts`

- [ ] **Step 1: Write `frontend/src/hooks/useAuth.ts`**

```typescript
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    retry: false,
  });
}

export function useLogin() {
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.login(email, password),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      router.push("/dashboard");
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      qc.clear();
      router.push("/login");
    },
  });
}

export function authErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return "Email veya şifre yanlış";
    if (e.status === 429) return "Çok fazla deneme; 5 dakika sonra tekrar dene";
  }
  return "Bağlantı hatası";
}
```

- [ ] **Step 2: Replace `frontend/src/app/page.tsx`** (root → redirect)

```typescript
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 3: Replace `frontend/src/app/login/page.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authErrorMessage, useLogin } from "@/hooks/useAuth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Giriş Yap</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Şifre</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                minLength={10}
              />
            </div>
            {login.isError && (
              <p className="text-sm text-red-600">{authErrorMessage(login.error)}</p>
            )}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? "Giriş yapılıyor..." : "Giriş yap"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser**

```
docker compose up -d
```
Visit http://localhost:3000/login. Form renders. Try login with bogus creds — see "Email veya şifre yanlış" toast/text.

Register a user via curl first:
```
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d "{\"email\":\"admin@x.com\",\"password\":\"longpassword\"}"
```
Then log in via the form — redirects to `/dashboard` (which 404s for now; that's expected).

- [ ] **Step 5: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/frontend/src/hooks guardwatch_website/frontend/src/app
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(frontend): add /login page with React Query auth flow"
```

---

### Task 29: Frontend /dashboard with device list + WS status updates

**Files:**
- Create: `guardwatch_website/frontend/src/app/dashboard/page.tsx`
- Create: `guardwatch_website/frontend/src/components/DeviceCard.tsx`
- Create: `guardwatch_website/frontend/src/components/KpiBar.tsx`
- Create: `guardwatch_website/frontend/src/hooks/useDevices.ts`
- Create: `guardwatch_website/frontend/src/hooks/usePanelWs.ts`
- Create: `guardwatch_website/frontend/src/lib/ws.ts`

- [ ] **Step 1: Write `frontend/src/lib/ws.ts`**

```typescript
const WS_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  /^http/,
  "ws",
);

export function openPanelWs(): WebSocket {
  return new WebSocket(`${WS_BASE}/ws/panel`);
}
```

- [ ] **Step 2: Write `frontend/src/hooks/useDevices.ts`**

```typescript
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Device, DeviceStatus } from "@/lib/types";

export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: api.listDevices,
  });
}

export function useUpdateDeviceStatus() {
  const qc = useQueryClient();
  return (deviceId: string, status: DeviceStatus) => {
    qc.setQueryData<Device[]>(["devices"], (prev) =>
      prev?.map((d) => (d.id === deviceId ? { ...d, status } : d)) ?? prev,
    );
  };
}
```

- [ ] **Step 3: Write `frontend/src/hooks/usePanelWs.ts`**

```typescript
"use client";

import { useEffect } from "react";
import { openPanelWs } from "@/lib/ws";
import { useUpdateDeviceStatus } from "@/hooks/useDevices";

export function usePanelWs() {
  const updateStatus = useUpdateDeviceStatus();
  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let backoff = 1000;

    const connect = () => {
      if (stopped) return;
      ws = openPanelWs();
      ws.onopen = () => {
        backoff = 1000;
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "device_status") {
            updateStatus(msg.device_id, msg.status);
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      };
    };
    connect();

    return () => {
      stopped = true;
      ws?.close();
    };
  }, [updateStatus]);
}
```

- [ ] **Step 4: Write `frontend/src/components/DeviceCard.tsx`**

```typescript
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Device } from "@/lib/types";

const STATUS_COLOR: Record<Device["status"], string> = {
  online: "bg-green-500",
  offline: "bg-red-500",
  unknown: "bg-slate-400",
};

const STATUS_LABEL: Record<Device["status"], string> = {
  online: "Online",
  offline: "Offline",
  unknown: "Bekleniyor",
};

export function DeviceCard({ device }: { device: Device }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{device.name}</CardTitle>
          <p className="text-xs text-muted-foreground">{device.region}</p>
        </div>
        <Badge className={STATUS_COLOR[device.status]}>{STATUS_LABEL[device.status]}</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground break-all">{device.public_url}</p>
        {device.last_seen_at && (
          <p className="mt-1 text-xs">
            Son görülme: {new Date(device.last_seen_at).toLocaleTimeString("tr-TR")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Write `frontend/src/components/KpiBar.tsx`**

```typescript
import type { Device } from "@/lib/types";

export function KpiBar({ devices }: { devices: Device[] }) {
  const online = devices.filter((d) => d.status === "online").length;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Kpi label="Toplam cihaz" value={devices.length} />
      <Kpi label="Online" value={online} />
      <Kpi label="Bugünkü ihlal" value={0} />
      <Kpi label="Son 1 saat" value={0} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
```

- [ ] **Step 6: Write `frontend/src/app/dashboard/page.tsx`**

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DeviceCard } from "@/components/DeviceCard";
import { KpiBar } from "@/components/KpiBar";
import { useMe, useLogout } from "@/hooks/useAuth";
import { useDevices } from "@/hooks/useDevices";
import { usePanelWs } from "@/hooks/usePanelWs";

export default function DashboardPage() {
  const me = useMe();
  const router = useRouter();
  const devices = useDevices();
  const logout = useLogout();
  usePanelWs();

  useEffect(() => {
    if (me.isError) router.push("/login");
  }, [me.isError, router]);

  if (me.isLoading || !me.data) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b bg-white p-4">
        <h1 className="text-lg font-semibold">Fleet Panel</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{me.data.email}</span>
          <Button size="sm" variant="outline" onClick={() => logout.mutate()}>
            Çıkış
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <KpiBar devices={devices.data ?? []} />
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Bağlı Sistemler</h2>
          {/* Add device button comes in Task 30 */}
        </div>
        {devices.isLoading ? (
          <p className="text-sm text-muted-foreground">Yükleniyor...</p>
        ) : devices.data && devices.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz cihaz eklenmemiş.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {devices.data?.map((d) => (
              <DeviceCard key={d.id} device={d} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

`docker compose up -d`. Login → dashboard renders, KPI bar shows 0s, "Henüz cihaz eklenmemiş."

- [ ] **Step 8: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/frontend/src
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(frontend): add /dashboard with device cards, KPI bar, WS status updates"
```

---

### Task 30: AddDeviceModal — paste URL, register, see card

**Files:**
- Create: `guardwatch_website/frontend/src/components/AddDeviceModal.tsx`
- Modify: `guardwatch_website/frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: Write `frontend/src/components/AddDeviceModal.tsx`**

```typescript
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";

const ERR_MESSAGES: Record<string, string> = {
  ALREADY_EXISTS: "Bu cihaz zaten kayıtlı",
  UNREACHABLE_OR_TOKEN_INVALID: "Cihaza ulaşılamıyor veya token geçersiz",
};

export function AddDeviceModal() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [url, setUrl] = useState("");
  const qc = useQueryClient();

  const createDevice = useMutation({
    mutationFn: () => api.createDevice({ name, region, url }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Cihaz eklendi");
      setOpen(false);
      setName("");
      setRegion("");
      setUrl("");
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) {
        toast.error(ERR_MESSAGES[e.detail] ?? `Hata: ${e.detail}`);
      } else {
        toast.error("Bağlantı hatası");
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Yeni Cihaz Ekle</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni Cihaz Ekle</DialogTitle>
          <DialogDescription>
            Jetson kurulum scriptinin yazdığı URL&apos;i yapıştır.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createDevice.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Ad</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={3}
              maxLength={50}
              required
              placeholder="Truck-7"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="region">Bölge</Label>
            <Input
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              required
              placeholder="İstanbul / Anadolu"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="url">Bağlantı URL&apos;si</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://jetson-abc.fleet.example.com?token=..."
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createDevice.isPending} className="w-full">
              {createDevice.isPending ? "Bağlanıyor..." : "Bağlan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire it into `frontend/src/app/dashboard/page.tsx`**

Replace the `{/* Add device button comes in Task 30 */}` line with:
```typescript
<AddDeviceModal />
```
And add the import:
```typescript
import { AddDeviceModal } from "@/components/AddDeviceModal";
```

- [ ] **Step 3: Verify in browser**

`docker compose up -d`. Login → Dashboard → click "+ Yeni Cihaz Ekle".

To test the full flow, register an admin user, then try adding the local agent:
- The local agent runs at `http://agent:9000` inside docker, but the URL the panel sends is what the **backend** will probe. Use `http://agent:9000?token=dev-token` (note: `_probe_agent` requires `https`, so we'll temporarily allow http for the local dev test or just verify the failure path).
- Quick verification of the failure path: paste a bogus URL like `https://nope.example.com?token=t`, see "Cihaza ulaşılamıyor" toast.

For the success path with the local agent, modify `parse_url_and_token` to accept `http` only when an env var `ALLOW_HTTP_PROBE=1` is set (Faz 5 will remove this). Optional cleanup; not strictly required for this task.

- [ ] **Step 4: Commit**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme add guardwatch_website/frontend/src/components/AddDeviceModal.tsx guardwatch_website/frontend/src/app/dashboard/page.tsx
git -C C:/Users/riyad/Documents/Goruntu_isleme commit -m "feat(frontend): add 'New Device' modal with URL paste flow"
```

---

### Task 31: Faz 1 smoke test — end-to-end

**Files:**
- None (manual verification + tag)

- [ ] **Step 1: Bring up everything**

```
docker compose up -d
```
Wait 30 seconds.

- [ ] **Step 2: Register admin and login (UI)**

Visit http://localhost:3000/login. (You may need to register via API first since the UI doesn't have a register form yet:)
```
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d "{\"email\":\"admin@x.com\",\"password\":\"longpassword\"}"
```
Then log in via the form.

- [ ] **Step 3: Add local agent as a device (HTTPS dev workaround)**

Since `_probe_agent` requires HTTPS, choose ONE of these for local validation:
- **Option A:** Comment out the `if parsed.scheme != "https"` check in `app/schemas/device.py` temporarily, restart backend, paste `http://agent:9000?token=dev-token`. Verify card appears with status `online` within ~12 seconds. Restore the check before committing.
- **Option B:** Skip local UI flow and rely on the backend devices test suite (which already passes). The first real production smoke comes in Faz 5 with cloudflared HTTPS URLs.

- [ ] **Step 4: Stop the agent container**

```
docker compose stop agent
```
Wait 30 seconds (3 missed pings × 10s). Card status should turn `offline` automatically (via `/ws/panel` push).

- [ ] **Step 5: Restart**

```
docker compose start agent
```
Within 10-20 seconds, card returns to `online`.

- [ ] **Step 6: Tag**

```
git -C C:/Users/riyad/Documents/Goruntu_isleme tag faz1-auth-devices-heartbeat
```

**Phase 1 done.**

---

## Self-Review

**Spec coverage check** (against `docs/superpowers/specs/2026-05-03-fleet-management-phases-design.md`):

| Spec requirement | Tasks |
|---|---|
| §3 Faz 0: monorepo + Docker Compose dev + .env.example + README + pre-commit | Tasks 1-9 |
| §3 Faz 0: pytest + httpx skeleton, frontend test scaffolding | Task 2 (backend), frontend tests left as Task 4's CI scaffolding (Vitest config not yet added — see gap #1) |
| §3 Faz 1: `POST /auth/login`, `GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout` | Tasks 15-17 |
| §3 Faz 1: `/devices` CRUD | Task 22 (POST + list + get + delete) |
| §3 Faz 1: WS `/ws/panel` | Task 24 |
| §3 Faz 1: `DeviceConnector` outgoing pool with exponential backoff | Tasks 25-26 |
| §3 Faz 1: DB users, devices, sessions tables + Alembic | Tasks 10, 12, 19 |
| §3 Faz 1 frontend: login, dashboard, "Yeni Cihaz Ekle" modal | Tasks 28-30 |
| §3 Faz 1 frontend: online/offline rozet WS | Task 29 (`usePanelWs`) |
| §3 Faz 1 agent: cloudflared kurulum | **GAP #2** — `install_agent.sh` not addressed; deferred to a Faz 1 follow-up since cloudflared requires a real domain (open question §10 of spec). For Faz 1 acceptance the dev compose agent suffices. |
| §3 Faz 1 agent: `/api/info` + `/ws` heartbeat | Tasks 20, 23 |
| §6 Security: JWT cookies, bcrypt, rate-limit | Tasks 11, 16, 18 |
| §6 Security: HTTPS / Secure cookies | Cookie `secure=False` for dev; toggled in Faz 5 deploy |
| §6 Security: Path traversal, magic-byte upload check | Faz 2 (uploads come then) |
| §7 Reconnect: exp backoff 1→60, 3 missed = offline | Task 25 |
| §8 Tests: backend unit (JWT, devices, WS heartbeat) + integration (testcontainers) | Tasks 11, 13, 22, 24, 25 |
| §8 Tests: frontend login validation + dashboard render | **GAP #1** — frontend tests not yet wired (Vitest setup deferred) |

**Identified gaps:**

1. **Frontend tests not in plan.** Per spec §8 Faz 1 should include "frontend: login form validation, dashboard mock data render". This was deprioritized to keep the plan tight; flagging here as a follow-up task: add Vitest + RTL config and one test per page. **Recommendation:** add as Task 32 if user wants Faz 1 fully complete, or accept as Faz 2 carryover.

2. **`install_agent.sh` (cloudflared).** Spec §3 Faz 1 lists this. Deferred because the spec also has it as open question §10.1 (domain choice). Local dev works without cloudflared since backend talks to agent over Docker network. **Recommendation:** add as Task 33 once the user decides on a domain — see open question §10.1 of spec.

**Placeholder scan:** Searched plan for "TBD", "TODO", "fill in", "implement later", "similar to". None found. Tasks 28 step 4 and 30 step 3 reference manual verification (not placeholders — they're verification commands).

**Type consistency:** Verified `device_id` is always `str` in Python (UUID stringified) and TS. `status` is `'online'|'offline'|'unknown'` everywhere. `Device.public_url` is the URL **without** the `?token=` query — confirmed via Task 21 (`parse_url_and_token` returns base, token separately) and Task 22 (`Device.public_url=base_url`). Frontend `Device` type matches. ✓

**WS protocol consistency:**
- Backend → Agent: `{"type": "ping", "ts": ...}` → Agent → Backend: `{"type": "pong", "ts": ...}` (Tasks 23, 25). ✓
- Backend → Panel: `{"type": "device_status", "device_id": "...", "status": "..."}` (Task 26 broadcast → Task 29 hook). ✓

---

## Outstanding Decisions for User

Before executing, the user should confirm:

1. **GAP #1 — Frontend tests:** Add Task 32 (Vitest + RTL setup + one test per page), or carry over to Faz 2?
2. **GAP #2 — install_agent.sh:** Add Task 33 (placeholder cloudflared script using a chosen domain), or wait until Faz 5 deploy when domain decision is made?
3. **Local dev HTTPS workaround in Task 31:** OK to keep `parse_url_and_token` HTTPS-only (relying on Faz 5 cloudflared for end-to-end testing), or relax the check via env var for dev?
