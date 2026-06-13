# GuardWatch Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Auth, Device Management, Event History, and Webhook Alerts to GuardWatch in four sequential phases, each independently deployable.

**Architecture:** Cookie-based JWT auth (HTTP-only, SameSite=Lax) guards all dashboard routes. Devices are managed in the DB with hashed tokens. History enhances the existing events query with filters and CSV export. Webhooks fire asynchronously via BackgroundTasks on event creation.

**Tech Stack:** FastAPI, python-jose, SQLAlchemy, Alembic, Next.js 14 (App Router), jose (npm), Tailwind, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-06-13-guardwatch-enhancements-design.md`

---

## Phase 1 — Auth

### File map
- Create: `backend/app/core/auth.py` — JWT helpers + `require_auth` dependency
- Create: `backend/app/routers/auth.py` — login / logout / refresh endpoints
- Modify: `backend/app/config.py` — add `admin_username`, `admin_password`, `cookie_secure`
- Modify: `backend/app/main.py` — register auth router
- Modify: `backend/app/routers/ws_panel.py` — verify JWT before accepting WS
- Modify: `backend/app/routers/events.py` — protect list/delete routes
- Modify: `backend/app/.env` + `.env.example` — add admin creds + `COOKIE_SECURE`
- Create: `backend/tests/test_auth.py`
- Create: `frontend/src/middleware.ts` — protect `/dashboard/*`
- Create: `frontend/src/app/login/page.tsx`
- Modify: `frontend/src/lib/api.ts` — add `credentials: 'include'`, handle 401
- Modify: `frontend/src/components/Navbar.tsx` — add logout button on app variant
- Modify: `frontend/package.json` — add `jose` npm dependency
- Modify: `docker-compose.yml` — pass `JWT_SECRET` to frontend service

---

### Task 1: Add auth config

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/.env` (and `.env.example`)

- [ ] **Step 1: Add fields to Settings**

```python
# backend/app/config.py — add inside class Settings:
admin_username: str = Field(default="admin")
admin_password: str = Field(default="changeme")
cookie_secure: bool = Field(default=False)
```

- [ ] **Step 2: Add to .env and .env.example**

```bash
# append to backend/.env  (and .env.example)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
COOKIE_SECURE=false
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py backend/.env backend/.env.example
git commit -m "feat(auth): add admin credentials + cookie_secure to config"
```

---

### Task 2: JWT helpers

**Files:**
- Create: `backend/app/core/auth.py`

- [ ] **Step 1: Write the test**

```python
# backend/tests/test_auth.py
from datetime import timedelta
from app.core.auth import create_token, decode_token, require_auth
from app.config import settings
from fastapi import HTTPException
import pytest

def test_create_and_decode_token():
    token = create_token("admin", timedelta(minutes=15), settings.jwt_secret, settings.jwt_algorithm)
    payload = decode_token(token, settings.jwt_secret, settings.jwt_algorithm)
    assert payload["sub"] == "admin"

def test_decode_invalid_token():
    with pytest.raises(Exception):
        decode_token("not.a.token", settings.jwt_secret, settings.jwt_algorithm)
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && python -m pytest tests/test_auth.py -v
# Expected: ModuleNotFoundError (auth.py not yet created)
```

- [ ] **Step 3: Create auth.py**

```python
# backend/app/core/auth.py
from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Cookie, HTTPException, Response, status
from jose import JWTError, jwt

from app.config import settings

_ACCESS_COOKIE = "access_token"
_REFRESH_COOKIE = "refresh_token"


def create_token(sub: str, ttl: timedelta, secret: str, algorithm: str) -> str:
    expire = datetime.now(timezone.utc) + ttl
    return jwt.encode({"sub": sub, "exp": expire}, secret, algorithm=algorithm)


def decode_token(token: str, secret: str, algorithm: str) -> dict:
    return jwt.decode(token, secret, algorithms=[algorithm])


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    opts = dict(httponly=True, samesite="lax", secure=settings.cookie_secure)
    response.set_cookie(_ACCESS_COOKIE, access_token, max_age=settings.access_token_ttl_min * 60, **opts)
    response.set_cookie(_REFRESH_COOKIE, refresh_token, max_age=settings.refresh_token_ttl_days * 86400, **opts)


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(_ACCESS_COOKIE)
    response.delete_cookie(_REFRESH_COOKIE)


def _verify_jwt(token: str | None) -> str | None:
    if not token:
        return None
    try:
        payload = decode_token(token, settings.jwt_secret, settings.jwt_algorithm)
        return payload.get("sub")
    except JWTError:
        return None


async def require_auth(
    access_token: Annotated[str | None, Cookie()] = None,
) -> str:
    sub = _verify_jwt(access_token)
    if sub is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not authenticated")
    return sub


def verify_admin_credentials(username: str, password: str) -> bool:
    return (
        hmac.compare_digest(username, settings.admin_username)
        and hmac.compare_digest(password, settings.admin_password)
    )
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd backend && python -m pytest tests/test_auth.py::test_create_and_decode_token tests/test_auth.py::test_decode_invalid_token -v
# Expected: 2 passed
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/auth.py backend/tests/test_auth.py
git commit -m "feat(auth): JWT helpers + require_auth dependency"
```

---

### Task 3: Auth router (login / logout / refresh)

**Files:**
- Create: `backend/app/routers/auth.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write tests**

```python
# backend/tests/test_auth.py — append these tests

from fastapi.testclient import TestClient
from app.main import create_app

@pytest.fixture
def auth_client():
    return TestClient(create_app())

def test_login_success(auth_client):
    res = auth_client.post("/auth/login", json={"username": "admin", "password": "changeme"})
    assert res.status_code == 200
    assert "access_token" in res.cookies

def test_login_wrong_password(auth_client):
    res = auth_client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert res.status_code == 401

def test_logout_clears_cookies(auth_client):
    auth_client.post("/auth/login", json={"username": "admin", "password": "changeme"})
    res = auth_client.post("/auth/logout")
    assert res.status_code == 200

def test_refresh_rotates_token(auth_client):
    auth_client.post("/auth/login", json={"username": "admin", "password": "changeme"})
    res = auth_client.post("/auth/refresh")
    assert res.status_code == 200
    assert "access_token" in res.cookies
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd backend && python -m pytest tests/test_auth.py::test_login_success -v
# Expected: 404 (route not registered yet)
```

- [ ] **Step 3: Create auth router**

```python
# backend/app/routers/auth.py
from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel

from app.config import settings
from app.core.auth import (
    clear_auth_cookies,
    create_token,
    decode_token,
    set_auth_cookies,
    verify_admin_credentials,
)
from jose import JWTError

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(body: LoginRequest, response: Response) -> dict:
    if not verify_admin_credentials(body.username, body.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    access = create_token("admin", timedelta(minutes=settings.access_token_ttl_min), settings.jwt_secret, settings.jwt_algorithm)
    refresh = create_token("admin", timedelta(days=settings.refresh_token_ttl_days), settings.jwt_secret, settings.jwt_algorithm)
    set_auth_cookies(response, access, refresh)
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response) -> dict:
    clear_auth_cookies(response)
    return {"ok": True}


@router.post("/refresh")
async def refresh(response: Response, refresh_token: Annotated[str | None, Cookie()] = None) -> dict:
    if not refresh_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no refresh token")
    try:
        payload = decode_token(refresh_token, settings.jwt_secret, settings.jwt_algorithm)
        sub = payload.get("sub", "admin")
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid refresh token")
    access = create_token(sub, timedelta(minutes=settings.access_token_ttl_min), settings.jwt_secret, settings.jwt_algorithm)
    new_refresh = create_token(sub, timedelta(days=settings.refresh_token_ttl_days), settings.jwt_secret, settings.jwt_algorithm)
    set_auth_cookies(response, access, new_refresh)
    return {"ok": True}
```

- [ ] **Step 4: Register router in main.py**

```python
# backend/app/main.py — add to imports and create_app:
from app.routers import auth  # add to imports line

# inside create_app(), after existing include_router calls:
app.include_router(auth.router)
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd backend && python -m pytest tests/test_auth.py -v
# Expected: all auth tests pass
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/auth.py backend/app/main.py
git commit -m "feat(auth): login/logout/refresh endpoints"
```

---

### Task 4: Protect events routes + WS

**Files:**
- Modify: `backend/app/routers/events.py`
- Modify: `backend/app/routers/ws_panel.py`

- [ ] **Step 1: Write tests**

```python
# backend/tests/test_auth.py — append

def test_list_events_requires_auth(auth_client):
    res = auth_client.get("/api/events")
    assert res.status_code == 401

def test_list_events_with_auth(auth_client):
    auth_client.post("/auth/login", json={"username": "admin", "password": "changeme"})
    res = auth_client.get("/api/events")
    assert res.status_code == 200
```

- [ ] **Step 2: Add require_auth to events.py**

```python
# backend/app/routers/events.py — add import:
from app.core.auth import require_auth
from typing import Annotated

# Change list_events signature:
@router.get("/events")
def list_events(db: DbSession, _: Annotated[str, Depends(require_auth)], limit: int = 50) -> list[EventOut]:
    # body unchanged

# Change delete_event signature:
@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: int, db: DbSession, _: Annotated[str, Depends(require_auth)]) -> None:
    # body unchanged

# Change clear_all_events signature:
@router.delete("/events", status_code=status.HTTP_204_NO_CONTENT)
async def clear_all_events(db: DbSession, _: Annotated[str, Depends(require_auth)]) -> None:
    # body unchanged
```

- [ ] **Step 3: Add JWT check to ws_panel.py**

```python
# backend/app/routers/ws_panel.py — full replacement:
from jose import JWTError, jwt as _jwt

from app.config import settings
from app.services.panel_hub import hub
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws/panel")
async def ws_panel(ws: WebSocket) -> None:
    token = ws.cookies.get("access_token")
    if token:
        try:
            _jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        except JWTError:
            token = None
    if not token:
        # Returning without accept() causes Starlette to send HTTP 403
        return
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

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd backend && python -m pytest tests/test_auth.py -v
# Expected: all tests pass
```

- [ ] **Step 5: Run full backend test suite — ensure no regressions**

```bash
cd backend && python -m pytest -v
# Expected: all existing tests still pass (device upload uses Bearer token, unaffected)
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/events.py backend/app/routers/ws_panel.py
git commit -m "feat(auth): protect events routes and WS panel with JWT"
```

---

### Task 5: Frontend — middleware + login page

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/middleware.ts`
- Create: `frontend/src/app/login/page.tsx`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Install jose**

```bash
cd frontend && npm install jose
```

- [ ] **Step 2: Add JWT_SECRET to docker-compose frontend environment**

```yaml
# docker-compose.yml — under frontend service environment:
environment:
  - JWT_SECRET=${JWT_SECRET:-change-me}
```

Also add to `.env`:
```bash
JWT_SECRET=change-me
```

- [ ] **Step 3: Create middleware.ts**

```typescript
// frontend/src/middleware.ts
import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("access_token")?.value;
  if (!token) return NextResponse.redirect(new URL("/login", request.url));
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "change-me");
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

- [ ] **Step 4: Create login page**

```tsx
// frontend/src/app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }),
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        setError("Kullanıcı adı veya şifre hatalı.");
      }
    } catch {
      setError("Sunucuya bağlanılamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm space-y-4"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-red-100 ring-1 ring-red-300">
            <Eye className="h-4 w-4 text-red-600" />
          </span>
          <span className="text-sm font-semibold text-zinc-900">GuardWatch</span>
        </div>
        <h1 className="text-lg font-semibold text-zinc-900">Yönetici Girişi</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-700">Kullanıcı Adı</label>
          <input
            name="username"
            autoComplete="username"
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-700">Şifre</label>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/middleware.ts frontend/src/app/login/page.tsx frontend/package.json frontend/package-lock.json docker-compose.yml
git commit -m "feat(auth): Next.js middleware + login page"
```

---

### Task 6: Frontend — credentials + logout

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/components/Navbar.tsx`

- [ ] **Step 1: Add credentials + 401 redirect to api.ts**

Replace every `fetch(` call to the backend in `api.ts` with `credentials: "include"` and 401 handling:

```typescript
// frontend/src/lib/api.ts — full replacement
import type { ViolationEvent, ViolationType } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function absoluteUrl(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}

function handle401(res: Response) {
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
    throw new Error("401");
  }
}

export async function getEvents(limit = 50): Promise<ViolationEvent[]> {
  const res = await fetch(`${API_URL}/api/events?limit=${limit}`, {
    cache: "no-store",
    credentials: "include",
  });
  handle401(res);
  if (!res.ok) throw new Error(`getEvents failed: ${res.status}`);
  return res.json();
}

export async function deleteEvent(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/events/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  handle401(res);
  if (!res.ok && res.status !== 404) throw new Error(`deleteEvent failed: ${res.status}`);
}

export async function clearAllEvents(): Promise<void> {
  const res = await fetch(`${API_URL}/api/events`, { method: "DELETE", credentials: "include" });
  handle401(res);
  if (!res.ok) throw new Error(`clearAllEvents failed: ${res.status}`);
}

export async function simulateEvent(type: ViolationType): Promise<ViolationEvent> {
  const res = await fetch(`${API_URL}/api/dev/simulate-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
    credentials: "include",
  });
  handle401(res);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`simulateEvent failed: ${res.status} ${text}`);
  }
  return res.json();
}
```

- [ ] **Step 2: Add logout button to Navbar app variant**

```tsx
// frontend/src/components/Navbar.tsx — replace the app variant nav block:
) : (
  <div className="flex items-center gap-2">
    <Button asChild variant="ghost" size="sm">
      <Link href="/dashboard/devices">Cihazlar</Link>
    </Button>
    <Button asChild variant="ghost" size="sm">
      <Link href="/dashboard/history">Geçmiş</Link>
    </Button>
    <Button asChild variant="ghost" size="sm">
      <Link href="/">← Anasayfa</Link>
    </Button>
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
        window.location.href = "/login";
      }}
    >
      Çıkış
    </Button>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/components/Navbar.tsx
git commit -m "feat(auth): add credentials to API calls + logout button"
```

---

### Phase 1 smoke test

- [ ] Rebuild containers: `docker compose up -d --build`
- [ ] Visit `http://localhost:3000/dashboard` — should redirect to `/login`
- [ ] Login with admin/changeme — should reach dashboard
- [ ] Click Çıkış — should redirect to `/login`
- [ ] Simulate an event: `docker compose exec agent python -m agent.simulate_event --type UYUYOR` — should appear on dashboard

---

## Phase 2 — Device Management

### File map
- Modify: `backend/app/models/device.py` — add `token_hash` field
- Create: `backend/app/alembic/versions/0002_device_token_hash.py`
- Modify: `backend/app/core/security.py` + `deps.py` — validate via DB token_hash
- Create: `backend/app/services/device_store.py` — create/list/rename/delete
- Create: `backend/app/routers/devices.py` — CRUD endpoints
- Modify: `backend/app/main.py` — register devices router
- Create: `backend/tests/test_devices_router.py`
- Create: `frontend/src/lib/devices.ts`
- Create: `frontend/src/app/dashboard/devices/page.tsx`
- Modify: `frontend/src/components/StatsBar.tsx` — device count card
- Create: `new_guardwatch/uploader.py`
- Modify: `new_guardwatch/guardwatch.py` — integrate uploader on violation

---

### Task 7: Migration + Device model update

**Files:**
- Modify: `backend/app/models/device.py`
- Create: `backend/app/alembic/versions/0002_device_token_hash.py`

- [ ] **Step 1: Add token_hash to Device model**

```python
# backend/app/models/device.py — add field inside Device class:
token_hash: Mapped[str] = mapped_column(String(64), nullable=False, server_default="")
```

- [ ] **Step 2: Create migration**

```python
# backend/app/alembic/versions/0002_device_token_hash.py
"""add token_hash to devices

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-13
"""
from typing import Sequence, Union
import hashlib, os
import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def upgrade() -> None:
    op.add_column("devices", sa.Column("token_hash", sa.String(64), nullable=False, server_default=""))
    # backfill existing devices from DEVICE_TOKENS env var
    conn = op.get_bind()
    device_tokens = os.environ.get("DEVICE_TOKENS", "")
    for pair in device_tokens.split(","):
        pair = pair.strip()
        if ":" not in pair:
            continue
        device_id, token = pair.split(":", 1)
        conn.execute(
            sa.text("UPDATE devices SET token_hash = :h WHERE id = :id"),
            {"h": _hash(token.strip()), "id": device_id.strip()},
        )


def downgrade() -> None:
    op.drop_column("devices", "token_hash")
```

- [ ] **Step 3: Run migration**

```bash
docker compose exec backend alembic upgrade head
# Expected: "Running upgrade 0001 -> 0002"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/device.py backend/app/alembic/versions/0002_device_token_hash.py
git commit -m "feat(devices): add token_hash column + migration 0002"
```

---

### Task 8: Update device auth to use token_hash

**Files:**
- Modify: `backend/app/core/security.py`
- Modify: `backend/app/core/deps.py`

- [ ] **Step 1: Write test**

```python
# backend/tests/test_security.py — append
import hashlib
from app.core.security import hash_token, verify_token_hash

def test_hash_token_is_deterministic():
    assert hash_token("abc") == hashlib.sha256(b"abc").hexdigest()

def test_verify_token_hash_correct():
    assert verify_token_hash(hash_token("secret"), "secret") is True

def test_verify_token_hash_wrong():
    assert verify_token_hash(hash_token("secret"), "wrong") is False
```

- [ ] **Step 2: Update security.py**

```python
# backend/app/core/security.py — full replacement
import hashlib
import hmac


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_token_hash(stored_hash: str, presented: str) -> bool:
    presented_hash = hash_token(presented)
    return hmac.compare_digest(stored_hash.encode(), presented_hash.encode())


# kept for backward compat during transition
def verify_device_token(token_map: dict[str, str], device_id: str, presented: str) -> bool:
    expected = token_map.get(device_id)
    if expected is None:
        return False
    return hmac.compare_digest(expected.encode(), presented.encode())
```

- [ ] **Step 3: Update require_device_auth in deps.py to query DB**

```python
# backend/app/core/deps.py — replace require_device_auth:
from app.core.security import verify_token_hash
from app.models import Device

def require_device_auth(
    device_id: Annotated[str, Path()],
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        import uuid as _uuid
        device = db.get(Device, _uuid.UUID(device_id))
    except Exception:
        device = None
    if device is None or not verify_token_hash(device.token_hash, token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid device token")
    return device_id
```

- [ ] **Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_security.py tests/test_events_router.py -v
# Expected: all pass
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/security.py backend/app/core/deps.py
git commit -m "feat(devices): device auth now validates against DB token_hash"
```

---

### Task 9: Device store + router

**Files:**
- Create: `backend/app/services/device_store.py`
- Create: `backend/app/routers/devices.py`
- Create: `backend/tests/test_devices_router.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write tests**

```python
# backend/tests/test_devices_router.py
import pytest
from fastapi.testclient import TestClient
from app.main import create_app

@pytest.fixture
def client(uploads_tmp):
    c = TestClient(create_app())
    c.post("/auth/login", json={"username": "admin", "password": "changeme"})
    return c

def test_list_devices_empty(client):
    res = client.get("/api/devices")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

def test_create_and_delete_device(client):
    res = client.post("/api/devices", json={"name": "Kule-1"})
    assert res.status_code == 201
    data = res.json()
    assert "token" in data
    assert len(data["token"]) == 64

    device_id = data["id"]
    res2 = client.get("/api/devices")
    assert any(d["id"] == device_id for d in res2.json())

    res3 = client.delete(f"/api/devices/{device_id}")
    assert res3.status_code == 204

def test_rename_device(client):
    res = client.post("/api/devices", json={"name": "OldName"})
    device_id = res.json()["id"]
    res2 = client.patch(f"/api/devices/{device_id}", json={"name": "NewName"})
    assert res2.status_code == 200
    assert res2.json()["name"] == "NewName"
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd backend && python -m pytest tests/test_devices_router.py -v
# Expected: 404 (routes not registered)
```

- [ ] **Step 3: Create device_store.py**

```python
# backend/app/services/device_store.py
from __future__ import annotations

import secrets
import uuid

from sqlalchemy.orm import Session

from app.core.security import hash_token
from app.models.device import Device


def create_device(db: Session, name: str) -> tuple[Device, str]:
    token = secrets.token_hex(32)  # 64-char hex
    device = Device(
        id=uuid.uuid4(),
        name=name,
        device_token="",
        token_hash=hash_token(token),
    )
    db.add(device)
    db.flush()
    return device, token


def list_devices(db: Session) -> list[Device]:
    from sqlalchemy import select
    return list(db.execute(select(Device).order_by(Device.created_at.desc())).scalars())


def rename_device(db: Session, device_id: uuid.UUID, name: str) -> Device | None:
    device = db.get(Device, device_id)
    if device is None:
        return None
    device.name = name
    db.flush()
    return device


def delete_device(db: Session, device_id: uuid.UUID) -> bool:
    device = db.get(Device, device_id)
    if device is None:
        return False
    db.delete(device)
    db.flush()
    return True
```

- [ ] **Step 4: Create devices router**

```python
# backend/app/routers/devices.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.auth import require_auth
from app.core.deps import DbSession
from app.models.device import Device
from app.services.device_store import create_device, delete_device, list_devices, rename_device

router = APIRouter(prefix="/api", tags=["devices"])

_ONLINE_THRESHOLD_SECONDS = 120


def _status(device: Device) -> str:
    if device.last_seen_at is None:
        return "offline"
    age = (datetime.now(timezone.utc) - device.last_seen_at).total_seconds()
    return "online" if age <= _ONLINE_THRESHOLD_SECONDS else "offline"


class DeviceOut(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    last_seen_at: datetime | None
    created_at: datetime


class DeviceCreateIn(BaseModel):
    name: str


class DeviceCreateOut(DeviceOut):
    token: str


class DeviceRenameIn(BaseModel):
    name: str


@router.get("/devices")
def get_devices(db: DbSession, _: Annotated[str, Depends(require_auth)]) -> list[DeviceOut]:
    return [DeviceOut(id=d.id, name=d.name, status=_status(d), last_seen_at=d.last_seen_at, created_at=d.created_at) for d in list_devices(db)]


@router.post("/devices", status_code=status.HTTP_201_CREATED)
def post_device(body: DeviceCreateIn, db: DbSession, _: Annotated[str, Depends(require_auth)]) -> DeviceCreateOut:
    device, token = create_device(db, body.name)
    db.commit()
    return DeviceCreateOut(id=device.id, name=device.name, status=_status(device), last_seen_at=device.last_seen_at, created_at=device.created_at, token=token)


@router.patch("/devices/{device_id}")
def patch_device(device_id: uuid.UUID, body: DeviceRenameIn, db: DbSession, _: Annotated[str, Depends(require_auth)]) -> DeviceOut:
    device = rename_device(db, device_id, body.name)
    if device is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    db.commit()
    return DeviceOut(id=device.id, name=device.name, status=_status(device), last_seen_at=device.last_seen_at, created_at=device.created_at)


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_device(device_id: uuid.UUID, db: DbSession, _: Annotated[str, Depends(require_auth)]) -> None:
    if not delete_device(db, device_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    db.commit()
```

- [ ] **Step 5: Register in main.py**

```python
# backend/app/main.py — add to imports:
from app.routers import auth, devices  # update existing line

# inside create_app():
app.include_router(devices.router)
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd backend && python -m pytest tests/test_devices_router.py -v
# Expected: all 4 tests pass
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/device_store.py backend/app/routers/devices.py backend/tests/test_devices_router.py backend/app/main.py
git commit -m "feat(devices): CRUD endpoints + device_store service"
```

---

### Task 10: Frontend — devices page

**Files:**
- Create: `frontend/src/lib/devices.ts`
- Create: `frontend/src/app/dashboard/devices/page.tsx`
- Modify: `frontend/src/components/StatsBar.tsx`

- [ ] **Step 1: Create devices.ts**

```typescript
// frontend/src/lib/devices.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Device {
  id: string;
  name: string;
  status: "online" | "offline";
  last_seen_at: string | null;
  created_at: string;
}

export interface DeviceCreateResult extends Device {
  token: string;
}

function creds(): RequestInit {
  return { credentials: "include" };
}

export async function getDevices(): Promise<Device[]> {
  const res = await fetch(`${API_URL}/api/devices`, creds());
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function createDevice(name: string): Promise<DeviceCreateResult> {
  const res = await fetch(`${API_URL}/api/devices`, {
    ...creds(),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function renameDevice(id: string, name: string): Promise<Device> {
  const res = await fetch(`${API_URL}/api/devices/${id}`, {
    ...creds(),
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function deleteDevice(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/devices/${id}`, { ...creds(), method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`${res.status}`);
}
```

- [ ] **Step 2: Create devices page**

```tsx
// frontend/src/app/dashboard/devices/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, Trash2, PenLine, Plus, Copy, Check } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { type Device, type DeviceCreateResult, createDevice, deleteDevice, getDevices, renameDevice } from "@/lib/devices";

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDevice, setNewDevice] = useState<DeviceCreateResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  useEffect(() => { getDevices().then(setDevices).catch(() => {}); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const result = await createDevice(newName);
    setNewDevice(result);
    setDevices((prev) => [result, ...prev]);
    setNewName("");
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu cihazı silmek istediğinizden emin misiniz?")) return;
    await deleteDevice(id);
    setDevices((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleRename(id: string) {
    const updated = await renameDevice(id, renameVal);
    setDevices((prev) => prev.map((d) => (d.id === id ? updated : d)));
    setRenamingId(null);
  }

  function copySnippet(device: DeviceCreateResult) {
    const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const snippet = `echo "DEVICE_ID=${device.id}" >> .env\necho "DEVICE_TOKEN=${device.token}" >> .env\necho "BACKEND_URL=${BACKEND_URL}" >> .env`;
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar variant="app" />
      <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900">Cihazlar</h1>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            <Plus className="h-4 w-4" /> Cihaz Ekle
          </button>
        </div>

        {addOpen && (
          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            {newDevice ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-zinc-700">Cihaz oluşturuldu. Token yalnızca bir kez gösterilir:</p>
                <pre className="rounded bg-zinc-100 p-3 text-xs overflow-x-auto">
                  {`echo "DEVICE_ID=${newDevice.id}" >> .env\necho "DEVICE_TOKEN=${newDevice.token}" >> .env\necho "BACKEND_URL=${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}" >> .env`}
                </pre>
                <div className="flex gap-2">
                  <button onClick={() => copySnippet(newDevice)} className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs hover:bg-zinc-50">
                    {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />} Kopyala
                  </button>
                  <button onClick={() => { setAddOpen(false); setNewDevice(null); }} className="rounded border px-3 py-1.5 text-xs hover:bg-zinc-50">Kapat</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Cihaz adı (örn: Kule-1)"
                  required
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400"
                />
                <button type="submit" className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600">Oluştur</button>
                <button type="button" onClick={() => setAddOpen(false)} className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-50">İptal</button>
              </form>
            )}
          </div>
        )}

        <div className="space-y-3">
          {devices.length === 0 && <p className="text-sm text-zinc-500">Henüz cihaz yok.</p>}
          {devices.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${d.status === "online" ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"}`}>
                {d.status === "online" ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              </span>
              <div className="flex-1 min-w-0">
                {renamingId === d.id ? (
                  <div className="flex gap-2">
                    <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} className="rounded border px-2 py-1 text-sm" />
                    <button onClick={() => handleRename(d.id)} className="rounded bg-red-500 px-2 py-1 text-xs text-white">Kaydet</button>
                    <button onClick={() => setRenamingId(null)} className="rounded border px-2 py-1 text-xs">İptal</button>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-zinc-900">{d.name}</p>
                )}
                <p className="text-xs text-zinc-400 truncate">{d.id}</p>
                {d.last_seen_at && <p className="text-xs text-zinc-400">Son görülme: {new Date(d.last_seen_at).toLocaleString("tr-TR")}</p>}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.status === "online" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                {d.status === "online" ? "Çevrimiçi" : "Çevrimdışı"}
              </span>
              <button onClick={() => { setRenamingId(d.id); setRenameVal(d.name); }} className="rounded p-1.5 hover:bg-zinc-100">
                <PenLine className="h-4 w-4 text-zinc-400" />
              </button>
              <button onClick={() => handleDelete(d.id)} className="rounded p-1.5 hover:bg-red-50">
                <Trash2 className="h-4 w-4 text-red-400" />
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/devices.ts frontend/src/app/dashboard/devices/
git commit -m "feat(devices): devices page with add/rename/delete"
```

---

### Task 11: new_guardwatch uploader

**Files:**
- Create: `C:\Users\riyad\Documents\Goruntu_isleme\new_guardwatch\uploader.py`
- Create: `C:\Users\riyad\Documents\Goruntu_isleme\new_guardwatch\.env.example`
- Modify: `C:\Users\riyad\Documents\Goruntu_isleme\new_guardwatch\guardwatch.py`

- [ ] **Step 1: Create .env.example for new_guardwatch**

```bash
# new_guardwatch/.env.example
DEVICE_ID=00000000-0000-0000-0000-000000000001
DEVICE_TOKEN=your-64-char-token-here
BACKEND_URL=http://localhost:8000
```

- [ ] **Step 2: Create uploader.py**

```python
# new_guardwatch/uploader.py
"""Sync HTTP uploader for guardwatch → backend integration."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass  # python-dotenv optional; set env vars manually if not installed

import requests

DEVICE_ID = os.environ.get("DEVICE_ID", "")
DEVICE_TOKEN = os.environ.get("DEVICE_TOKEN", "")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")

_counter = 0
_log = logging.getLogger(__name__)


def _next_id() -> int:
    global _counter
    _counter += 1
    return _counter


def send_violation(
    violation_type: str,
    track_id: int | None,
    occurred_at_iso: str,
    perclos: float,
    pitch: float,
    signal_src: str,
    screenshot_bytes: bytes,
) -> bool:
    """POST one violation event to the backend. Returns True on success or duplicate."""
    if not DEVICE_ID or not DEVICE_TOKEN:
        _log.warning("uploader: DEVICE_ID/DEVICE_TOKEN not configured, skipping upload")
        return False

    payload = {
        "agent_event_id": _next_id(),
        "type": violation_type,
        "track_id": track_id,
        "occurred_at": occurred_at_iso,
        "metadata": {"perclos": perclos, "pitch": pitch, "signal_src": signal_src},
    }

    try:
        resp = requests.post(
            f"{BACKEND_URL}/api/devices/{DEVICE_ID}/events",
            headers={"Authorization": f"Bearer {DEVICE_TOKEN}"},
            files={
                "payload": ("payload.json", json.dumps(payload).encode(), "application/json"),
                "screenshot": ("screenshot.jpg", screenshot_bytes, "image/jpeg"),
            },
            timeout=5,
        )
        if resp.status_code == 409:
            return True  # already recorded — idempotent
        resp.raise_for_status()
        return True
    except Exception as exc:
        _log.error("uploader: upload failed: %s", exc)
        return False
```

- [ ] **Step 3: Wire into guardwatch.py on state entry**

Find the section in `new_guardwatch/guardwatch.py` where violation state changes are logged (look for `app.log` writes or state transition comments) and add:

```python
# new_guardwatch/guardwatch.py — add at top of file:
from uploader import send_violation
import datetime as _dt

# In the state machine block where UYUYOR / GOZ_KAPALI / HAREKETSIZ first fires,
# after saving the ROI screenshot to disk, add:
if new_state in ("UYUYOR", "GOZ_KAPALI", "HAREKETSIZ"):
    screenshot_path = ...  # the path already saved by guardwatch
    try:
        img_bytes = open(screenshot_path, "rb").read()
    except Exception:
        img_bytes = b""
    send_violation(
        violation_type=new_state,
        track_id=track_id,
        occurred_at_iso=_dt.datetime.now(_dt.timezone.utc).isoformat(),
        perclos=float(perclos_value),
        pitch=float(pitch_value),
        signal_src=signal_source,   # "MP" or "POSE"
        screenshot_bytes=img_bytes,
    )
```

- [ ] **Step 4: Install python-dotenv in new_guardwatch venv**

```bash
cd C:\Users\riyad\Documents\Goruntu_isleme\new_guardwatch
pip install python-dotenv
# or: py -3.12 -m pip install python-dotenv
```

- [ ] **Step 5: Commit**

```bash
cd C:\Users\riyad\Documents\Goruntu_isleme\new_guardwatch
git add uploader.py .env.example guardwatch.py
git commit -m "feat: add backend uploader integration"
```

---

## Phase 3 — Event History & Search

### File map
- Modify: `backend/app/schemas/event.py` — add `PaginatedEventsOut`
- Modify: `backend/app/routers/events.py` — enhance list + add /export
- Create: `backend/app/alembic/versions/0003_event_history_index.py`
- Create: `frontend/src/lib/history.ts`
- Create: `frontend/src/components/EventTable.tsx`
- Create: `frontend/src/app/dashboard/history/page.tsx`

---

### Task 12: Backend — paginated list + CSV export

**Files:**
- Modify: `backend/app/schemas/event.py`
- Modify: `backend/app/routers/events.py`
- Create: `backend/app/alembic/versions/0003_event_history_index.py`
- Modify: `backend/tests/test_events_router.py`

- [ ] **Step 1: Add PaginatedEventsOut schema**

```python
# backend/app/schemas/event.py — append after EventBroadcast:
class PaginatedEventsOut(BaseModel):
    items: list[EventOut]
    total: int
    page: int
    pages: int
```

- [ ] **Step 2: Write tests**

```python
# backend/tests/test_events_router.py — append

def test_list_events_paginated(client):
    # client fixture from conftest already has a seeded device
    res = client.get("/api/events?page=1&page_size=10")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data

def test_export_csv(client):
    res = client.get("/api/events/export")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "id" in res.text  # CSV header
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
cd backend && python -m pytest tests/test_events_router.py::test_list_events_paginated -v
# Expected: FAIL (schema mismatch or 422)
```

- [ ] **Step 4: Update list_events in events.py**

```python
# backend/app/routers/events.py — replace list_events:
import math
from datetime import date
from app.schemas.event import PaginatedEventsOut

@router.get("/events")
def list_events(
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
    limit: int = 50,          # legacy param, kept for backward compat
    page: int = 1,
    page_size: int = 50,
    device_id: str | None = None,
    type: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> PaginatedEventsOut:
    from sqlalchemy import select, func as sqlfunc
    page_size = max(1, min(page_size, 200))
    page = max(1, page)

    q = select(Event).order_by(Event.occurred_at.desc())
    if device_id:
        import uuid as _uuid
        try:
            q = q.where(Event.device_id == _uuid.UUID(device_id))
        except ValueError:
            pass
    if type:
        q = q.where(Event.type == type)
    if from_date:
        q = q.where(Event.occurred_at >= from_date)
    if to_date:
        from datetime import datetime, timezone, timedelta
        q = q.where(Event.occurred_at < datetime(to_date.year, to_date.month, to_date.day, tzinfo=timezone.utc) + timedelta(days=1))

    total = db.execute(select(sqlfunc.count()).select_from(q.subquery())).scalar_one()
    rows = db.execute(q.offset((page - 1) * page_size).limit(page_size)).scalars().all()
    return PaginatedEventsOut(
        items=[_to_out(r) for r in rows],
        total=total,
        page=page,
        pages=max(1, math.ceil(total / page_size)),
    )
```

- [ ] **Step 5: Add /events/export endpoint**

```python
# backend/app/routers/events.py — add after list_events:
import csv, io
from fastapi.responses import StreamingResponse
from sqlalchemy import select as _sel

@router.get("/events/export")
def export_events_csv(
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
    device_id: str | None = None,
    type: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> StreamingResponse:
    from app.models import Device as _Device
    q = _sel(Event, _Device.name.label("device_name")).join(_Device, Event.device_id == _Device.id).order_by(Event.occurred_at.desc())
    if device_id:
        import uuid as _uuid
        try: q = q.where(Event.device_id == _uuid.UUID(device_id))
        except ValueError: pass
    if type:
        q = q.where(Event.type == type)
    if from_date:
        q = q.where(Event.occurred_at >= from_date)
    if to_date:
        from datetime import datetime, timezone, timedelta
        q = q.where(Event.occurred_at < datetime(to_date.year, to_date.month, to_date.day, tzinfo=timezone.utc) + timedelta(days=1))

    rows = db.execute(q).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "device_name", "type", "track_id", "occurred_at", "received_at", "perclos", "pitch", "signal_src"])
    for row in rows:
        event, device_name = row.Event, row.device_name
        meta = event.metadata_json or {}
        writer.writerow([event.id, device_name, event.type, event.track_id, event.occurred_at, event.received_at, meta.get("perclos"), meta.get("pitch"), meta.get("signal_src")])

    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=events.csv"})
```

- [ ] **Step 6: Add compound index migration**

```python
# backend/app/alembic/versions/0003_event_history_index.py
"""add compound event history index

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-13
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_events_device_occurred", "events", ["device_id", sa.text("occurred_at DESC")])


def downgrade() -> None:
    op.drop_index("ix_events_device_occurred", table_name="events")
```

- [ ] **Step 7: Run migration + tests**

```bash
docker compose exec backend alembic upgrade head
cd backend && python -m pytest tests/test_events_router.py -v
# Expected: all pass
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/event.py backend/app/routers/events.py backend/app/alembic/versions/0003_event_history_index.py
git commit -m "feat(history): paginated events list + CSV export + index migration"
```

---

### Task 13: Frontend — history page

**Files:**
- Create: `frontend/src/lib/history.ts`
- Create: `frontend/src/components/EventTable.tsx`
- Create: `frontend/src/app/dashboard/history/page.tsx`

- [ ] **Step 1: Create history.ts**

```typescript
// frontend/src/lib/history.ts
import type { ViolationType } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface HistoryFilters {
  device_id?: string;
  type?: ViolationType | "";
  from_date?: string;   // YYYY-MM-DD
  to_date?: string;     // YYYY-MM-DD
  page?: number;
  page_size?: number;
}

export interface PaginatedEvents {
  items: import("./types").ViolationEvent[];
  total: number;
  page: number;
  pages: number;
}

export async function getEventHistory(filters: HistoryFilters = {}): Promise<PaginatedEvents> {
  const params = new URLSearchParams();
  if (filters.device_id) params.set("device_id", filters.device_id);
  if (filters.type) params.set("type", filters.type);
  if (filters.from_date) params.set("from_date", filters.from_date);
  if (filters.to_date) params.set("to_date", filters.to_date);
  params.set("page", String(filters.page ?? 1));
  params.set("page_size", String(filters.page_size ?? 50));
  const res = await fetch(`${API_URL}/api/events?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function buildExportUrl(filters: HistoryFilters): string {
  const params = new URLSearchParams();
  if (filters.device_id) params.set("device_id", filters.device_id);
  if (filters.type) params.set("type", filters.type);
  if (filters.from_date) params.set("from_date", filters.from_date);
  if (filters.to_date) params.set("to_date", filters.to_date);
  return `${API_URL}/api/events/export?${params}`;
}
```

- [ ] **Step 2: Create EventTable.tsx**

```tsx
// frontend/src/components/EventTable.tsx
"use client";

import type { ViolationEvent } from "@/lib/types";
import { VIOLATION_LABEL, VIOLATION_TONE } from "@/lib/format";

interface Props {
  events: ViolationEvent[];
  onSelect: (event: ViolationEvent) => void;
}

export function EventTable({ events, onSelect }: Props) {
  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-400">Mevcut filtrelerle ihlal bulunamadı.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b bg-zinc-50 text-xs text-zinc-500">
          <tr>
            <th className="px-4 py-3 text-left">Cihaz</th>
            <th className="px-4 py-3 text-left">Tür</th>
            <th className="px-4 py-3 text-left">Takip #</th>
            <th className="px-4 py-3 text-left">Oluştu</th>
            <th className="px-4 py-3 text-left">PERCLOS</th>
            <th className="px-4 py-3 text-left">Pitch</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {events.map((e) => (
            <tr
              key={e.id}
              onClick={() => onSelect(e)}
              className="cursor-pointer hover:bg-zinc-50 transition-colors"
            >
              <td className="px-4 py-3 font-mono text-xs text-zinc-500">{String(e.device_id).slice(0, 8)}…</td>
              <td className="px-4 py-3">
                {/* Use VIOLATION_TONE[type].chip — pre-built Tailwind class string, no dynamic interpolation */}
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${VIOLATION_TONE[e.type].chip}`}>
                  {VIOLATION_LABEL[e.type]}
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-600">{e.track_id ?? "—"}</td>
              <td className="px-4 py-3 text-zinc-600">{new Date(e.occurred_at).toLocaleString("tr-TR")}</td>
              <td className="px-4 py-3 text-zinc-600">{e.metadata?.perclos != null ? `${e.metadata.perclos}%` : "—"}</td>
              <td className="px-4 py-3 text-zinc-600">{e.metadata?.pitch != null ? `${e.metadata.pitch}°` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create history page**

```tsx
// frontend/src/app/dashboard/history/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { EventTable } from "@/components/EventTable";
import { EventLightbox } from "@/components/EventLightbox";
import { type HistoryFilters, buildExportUrl, getEventHistory, type PaginatedEvents } from "@/lib/history";
import { getDevices, type Device } from "@/lib/devices";
import type { ViolationEvent, ViolationType } from "@/lib/types";
import { VIOLATION_LABEL } from "@/lib/format";

const TYPES: ViolationType[] = ["UYUYOR", "GOZ_KAPALI", "HAREKETSIZ", "TAKIP_KAYBEDILDI"];

export default function HistoryPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [data, setData] = useState<PaginatedEvents>({ items: [], total: 0, page: 1, pages: 1 });
  const [filters, setFilters] = useState<HistoryFilters>({ page: 1, page_size: 50 });
  const [selected, setSelected] = useState<ViolationEvent | null>(null);

  useEffect(() => { getDevices().then(setDevices).catch(() => {}); }, []);
  useEffect(() => { getEventHistory(filters).then(setData).catch(() => {}); }, [filters]);

  function updateFilter(patch: Partial<HistoryFilters>) {
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar variant="app" />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">İhlal Geçmişi</h1>
            <p className="text-sm text-zinc-400">{data.total} kayıt</p>
          </div>
          <a
            href={buildExportUrl(filters)}
            download="events.csv"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50"
          >
            <Download className="h-4 w-4" /> CSV İndir
          </a>
        </div>

        <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-4 shadow-sm">
          <select
            onChange={(e) => updateFilter({ device_id: e.target.value || undefined })}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">Tüm Cihazlar</option>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select
            onChange={(e) => updateFilter({ type: (e.target.value as ViolationType) || undefined })}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">Tüm Türler</option>
            {TYPES.map((t) => <option key={t} value={t}>{VIOLATION_LABEL[t]}</option>)}
          </select>
          <input type="date" onChange={(e) => updateFilter({ from_date: e.target.value || undefined })} className="rounded-lg border px-3 py-2 text-sm" />
          <input type="date" onChange={(e) => updateFilter({ to_date: e.target.value || undefined })} className="rounded-lg border px-3 py-2 text-sm" />
        </div>

        <EventTable events={data.items} onSelect={setSelected} />

        {data.pages > 1 && (
          <div className="flex items-center justify-center gap-4">
            <button disabled={filters.page === 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40 hover:bg-zinc-50">← Önceki</button>
            <span className="text-sm text-zinc-500">Sayfa {data.page} / {data.pages}</span>
            <button disabled={filters.page === data.pages} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40 hover:bg-zinc-50">Sonraki →</button>
          </div>
        )}
      </main>

      {selected && <EventLightbox event={selected} onClose={() => setSelected(null)} onDelete={() => setSelected(null)} />}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/history.ts frontend/src/components/EventTable.tsx frontend/src/app/dashboard/history/
git commit -m "feat(history): history page with filters, pagination, CSV export"
```

---

## Phase 4 — Webhook Alerts

### File map
- Create: `backend/app/models/webhook.py`
- Create: `backend/app/alembic/versions/0004_webhook_configs.py`
- Create: `backend/app/schemas/webhook.py`
- Create: `backend/app/services/webhook_service.py`
- Create: `backend/app/routers/webhooks.py`
- Modify: `backend/app/routers/events.py` — fire webhooks in post_event
- Modify: `backend/app/main.py` — register webhooks router
- Create: `backend/tests/test_webhooks.py`
- Create: `frontend/src/lib/webhooks.ts`
- Modify: `frontend/src/app/dashboard/devices/page.tsx` — add webhooks section

---

### Task 14: Webhook model + migration

**Files:**
- Create: `backend/app/models/webhook.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/alembic/versions/0004_webhook_configs.py`

- [ ] **Step 1: Create webhook model**

```python
# backend/app/models/webhook.py
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WebhookConfig(Base):
    __tablename__ = "webhook_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    event_types: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    secret: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 2: Register in models/__init__.py**

```python
# backend/app/models/__init__.py — add:
from app.models.webhook import WebhookConfig  # noqa: F401
```

- [ ] **Step 3: Create migration**

```python
# backend/app/alembic/versions/0004_webhook_configs.py
"""create webhook_configs table

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-13
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "webhook_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False, default=True),
        sa.Column("event_types", postgresql.ARRAY(sa.String), nullable=False, server_default="{}"),
        sa.Column("secret", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("webhook_configs")
```

- [ ] **Step 4: Run migration**

```bash
docker compose exec backend alembic upgrade head
# Expected: "Running upgrade 0003 -> 0004"
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/webhook.py backend/app/models/__init__.py backend/app/alembic/versions/0004_webhook_configs.py
git commit -m "feat(webhooks): WebhookConfig model + migration 0004"
```

---

### Task 15: Webhook service + router

**Files:**
- Create: `backend/app/schemas/webhook.py`
- Create: `backend/app/services/webhook_service.py`
- Create: `backend/app/routers/webhooks.py`
- Modify: `backend/app/routers/events.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_webhooks.py`

- [ ] **Step 1: Write tests**

```python
# backend/tests/test_webhooks.py
import pytest
from fastapi.testclient import TestClient
from app.main import create_app

@pytest.fixture
def client(uploads_tmp):
    c = TestClient(create_app())
    c.post("/auth/login", json={"username": "admin", "password": "changeme"})
    return c

def test_create_and_list_webhook(client):
    res = client.post("/api/webhooks", json={"name": "Slack", "url": "https://hooks.example.com/x", "event_types": ["UYUYOR"]})
    assert res.status_code == 201
    wid = res.json()["id"]
    res2 = client.get("/api/webhooks")
    assert any(w["id"] == wid for w in res2.json())

def test_toggle_webhook(client):
    res = client.post("/api/webhooks", json={"name": "Test", "url": "https://x.example.com", "event_types": []})
    wid = res.json()["id"]
    res2 = client.patch(f"/api/webhooks/{wid}", json={"enabled": False})
    assert res2.json()["enabled"] is False

def test_delete_webhook(client):
    res = client.post("/api/webhooks", json={"name": "Del", "url": "https://x.example.com", "event_types": []})
    wid = res.json()["id"]
    assert client.delete(f"/api/webhooks/{wid}").status_code == 204
```

- [ ] **Step 2: Create schemas/webhook.py**

```python
# backend/app/schemas/webhook.py
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, HttpUrl


class WebhookIn(BaseModel):
    name: str
    url: str
    event_types: list[str] = []
    secret: str | None = None


class WebhookPatchIn(BaseModel):
    name: str | None = None
    url: str | None = None
    enabled: bool | None = None
    event_types: list[str] | None = None
    secret: str | None = None


class WebhookOut(BaseModel):
    id: uuid.UUID
    name: str
    url: str
    enabled: bool
    event_types: list[str]
    created_at: datetime
```

- [ ] **Step 3: Create webhook_service.py**

```python
# backend/app/services/webhook_service.py
from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.webhook import WebhookConfig

_log = logging.getLogger(__name__)


def _signature(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def dispatch(db: Session, event_payload: dict) -> None:
    event_type = event_payload.get("type", "")
    webhooks = db.execute(
        select(WebhookConfig).where(WebhookConfig.enabled == True)
    ).scalars().all()

    targets = [
        w for w in webhooks
        if not w.event_types or event_type in w.event_types
    ]
    if not targets:
        return

    body = json.dumps({"event": "violation", **event_payload}, default=str).encode()

    async with httpx.AsyncClient(timeout=5.0) as client:
        for webhook in targets:
            headers = {"Content-Type": "application/json"}
            if webhook.secret:
                headers["X-GuardWatch-Signature"] = _signature(webhook.secret, body)
            try:
                await client.post(webhook.url, content=body, headers=headers)
            except Exception as exc:
                _log.error("webhook dispatch failed url=%s err=%s", webhook.url, exc)
```

- [ ] **Step 4: Create webhooks router**

```python
# backend/app/routers/webhooks.py
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.auth import require_auth
from app.core.deps import DbSession
from app.models.webhook import WebhookConfig
from app.schemas.webhook import WebhookIn, WebhookOut, WebhookPatchIn

router = APIRouter(prefix="/api", tags=["webhooks"])


def _out(w: WebhookConfig) -> WebhookOut:
    return WebhookOut(id=w.id, name=w.name, url=w.url, enabled=w.enabled, event_types=w.event_types or [], created_at=w.created_at)


@router.get("/webhooks")
def list_webhooks(db: DbSession, _: Annotated[str, Depends(require_auth)]) -> list[WebhookOut]:
    return [_out(w) for w in db.execute(select(WebhookConfig).order_by(WebhookConfig.created_at.desc())).scalars()]


@router.post("/webhooks", status_code=status.HTTP_201_CREATED)
def create_webhook(body: WebhookIn, db: DbSession, _: Annotated[str, Depends(require_auth)]) -> WebhookOut:
    w = WebhookConfig(id=uuid.uuid4(), name=body.name, url=body.url, event_types=body.event_types, secret=body.secret)
    db.add(w)
    db.commit()
    db.refresh(w)
    return _out(w)


@router.patch("/webhooks/{webhook_id}")
def update_webhook(webhook_id: uuid.UUID, body: WebhookPatchIn, db: DbSession, _: Annotated[str, Depends(require_auth)]) -> WebhookOut:
    w = db.get(WebhookConfig, webhook_id)
    if w is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "webhook not found")
    if body.name is not None: w.name = body.name
    if body.url is not None: w.url = body.url
    if body.enabled is not None: w.enabled = body.enabled
    if body.event_types is not None: w.event_types = body.event_types
    if body.secret is not None: w.secret = body.secret
    db.commit()
    db.refresh(w)
    return _out(w)


@router.delete("/webhooks/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_webhook(webhook_id: uuid.UUID, db: DbSession, _: Annotated[str, Depends(require_auth)]) -> None:
    w = db.get(WebhookConfig, webhook_id)
    if w is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "webhook not found")
    db.delete(w)
    db.commit()
```

- [ ] **Step 5: Wire dispatch into post_event in events.py**

```python
# backend/app/routers/events.py — update post_event, add after hub.broadcast line:
from fastapi import BackgroundTasks
from app.services.webhook_service import dispatch as _dispatch_webhooks

@router.post("/devices/{device_id}/events", status_code=status.HTTP_201_CREATED)
async def post_event(
    device_id: Annotated[str, Depends(require_device_auth)],
    db: DbSession,
    background_tasks: BackgroundTasks,
    payload: Annotated[UploadFile, File()],
    screenshot: Annotated[UploadFile, File()],
) -> EventOut:
    # ... existing body unchanged until the hub.broadcast line, then add:
    await hub.broadcast({"type": "event_created", "payload": out.model_dump(mode="json")})
    background_tasks.add_task(_dispatch_webhooks, db, out.model_dump(mode="json"))
    return out
```

- [ ] **Step 6: Register webhooks router in main.py**

```python
# backend/app/main.py — update imports and create_app:
from app.routers import auth, devices, webhooks  # update import line

# inside create_app():
app.include_router(webhooks.router)
```

- [ ] **Step 7: Run tests — expect PASS**

```bash
cd backend && python -m pytest tests/test_webhooks.py -v
# Expected: all 4 tests pass
```

- [ ] **Step 8: Run full test suite**

```bash
cd backend && python -m pytest -v
# Expected: all tests pass
```

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/webhook.py backend/app/services/webhook_service.py backend/app/routers/webhooks.py backend/app/routers/events.py backend/app/main.py backend/tests/test_webhooks.py
git commit -m "feat(webhooks): webhook CRUD + async dispatch on event creation"
```

---

### Task 16: Frontend — webhooks section

**Files:**
- Create: `frontend/src/lib/webhooks.ts`
- Modify: `frontend/src/app/dashboard/devices/page.tsx`

- [ ] **Step 1: Create webhooks.ts**

```typescript
// frontend/src/lib/webhooks.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Webhook {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  event_types: string[];
  created_at: string;
}

const creds = (): RequestInit => ({ credentials: "include" });

export async function getWebhooks(): Promise<Webhook[]> {
  const res = await fetch(`${API_URL}/api/webhooks`, creds());
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function createWebhook(data: { name: string; url: string; event_types: string[]; secret?: string }): Promise<Webhook> {
  const res = await fetch(`${API_URL}/api/webhooks`, { ...creds(), method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function toggleWebhook(id: string, enabled: boolean): Promise<Webhook> {
  const res = await fetch(`${API_URL}/api/webhooks/${id}`, { ...creds(), method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function deleteWebhook(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/webhooks/${id}`, { ...creds(), method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`${res.status}`);
}

export async function testWebhook(id: string): Promise<void> {
  // Trigger a test by patching then sending a simulated dispatch
  await fetch(`${API_URL}/api/dev/simulate-event`, { ...creds(), method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "UYUYOR" }) });
}
```

- [ ] **Step 2: Add webhooks section to devices page**

At the bottom of `frontend/src/app/dashboard/devices/page.tsx`, after the devices list `</div>`, add a webhooks section:

```tsx
// Import at top of devices/page.tsx:
import { type Webhook, createWebhook, deleteWebhook, getWebhooks, toggleWebhook } from "@/lib/webhooks";
import { Bell, BellOff } from "lucide-react";

// Add state inside DevicesPage component:
const [webhooks, setWebhooks] = useState<Webhook[]>([]);
const [whOpen, setWhOpen] = useState(false);
const [whForm, setWhForm] = useState({ name: "", url: "", event_types: [] as string[], secret: "" });
const VIOLATION_TYPES = ["UYUYOR", "GOZ_KAPALI", "HAREKETSIZ", "TAKIP_KAYBEDILDI"];

// Add to useEffect:
useEffect(() => { getWebhooks().then(setWebhooks).catch(() => {}); }, []);

// Add handlers:
async function handleCreateWebhook(e: React.FormEvent) {
  e.preventDefault();
  const wh = await createWebhook({ name: whForm.name, url: whForm.url, event_types: whForm.event_types, secret: whForm.secret || undefined });
  setWebhooks((prev) => [wh, ...prev]);
  setWhOpen(false);
  setWhForm({ name: "", url: "", event_types: [], secret: "" });
}

async function handleToggleWebhook(id: string, enabled: boolean) {
  const updated = await toggleWebhook(id, enabled);
  setWebhooks((prev) => prev.map((w) => (w.id === id ? updated : w)));
}

async function handleDeleteWebhook(id: string) {
  if (!confirm("Bu webhook'u silmek istediğinizden emin misiniz?")) return;
  await deleteWebhook(id);
  setWebhooks((prev) => prev.filter((w) => w.id !== id));
}

// Add JSX section after devices list closing div:
<div className="space-y-4 pt-4 border-t">
  <div className="flex items-center justify-between">
    <h2 className="text-base font-semibold text-zinc-900">Webhook Bildirimleri</h2>
    <button onClick={() => setWhOpen(true)} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50">
      <Plus className="h-4 w-4" /> Webhook Ekle
    </button>
  </div>

  {whOpen && (
    <form onSubmit={handleCreateWebhook} className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
      <input value={whForm.name} onChange={(e) => setWhForm((f) => ({ ...f, name: e.target.value }))} placeholder="İsim (örn: Slack)" required className="w-full rounded-lg border px-3 py-2 text-sm" />
      <input value={whForm.url} onChange={(e) => setWhForm((f) => ({ ...f, url: e.target.value }))} placeholder="Webhook URL" type="url" required className="w-full rounded-lg border px-3 py-2 text-sm" />
      <div>
        <p className="text-xs text-zinc-500 mb-1">Tetiklenecek türler (boş = hepsi):</p>
        <div className="flex flex-wrap gap-2">
          {VIOLATION_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={whForm.event_types.includes(t)} onChange={(e) => setWhForm((f) => ({ ...f, event_types: e.target.checked ? [...f.event_types, t] : f.event_types.filter((x) => x !== t) }))} />
              {t}
            </label>
          ))}
        </div>
      </div>
      <input value={whForm.secret} onChange={(e) => setWhForm((f) => ({ ...f, secret: e.target.value }))} placeholder="HMAC Secret (opsiyonel)" className="w-full rounded-lg border px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <button type="submit" className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600">Kaydet</button>
        <button type="button" onClick={() => setWhOpen(false)} className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-50">İptal</button>
      </div>
    </form>
  )}

  <div className="space-y-3">
    {webhooks.length === 0 && <p className="text-sm text-zinc-500">Henüz webhook yok.</p>}
    {webhooks.map((w) => (
      <div key={w.id} className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${w.enabled ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"}`}>
          {w.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900">{w.name}</p>
          <p className="text-xs text-zinc-400 truncate">{w.url}</p>
          {w.event_types.length > 0 && <p className="text-xs text-zinc-400">{w.event_types.join(", ")}</p>}
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={w.enabled} onChange={(e) => handleToggleWebhook(w.id, e.target.checked)} className="h-4 w-4 accent-red-500" />
          <span className="text-xs text-zinc-500">{w.enabled ? "Aktif" : "Pasif"}</span>
        </label>
        <button onClick={() => handleDeleteWebhook(w.id)} className="rounded p-1.5 hover:bg-red-50">
          <Trash2 className="h-4 w-4 text-red-400" />
        </button>
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/webhooks.ts frontend/src/app/dashboard/devices/page.tsx
git commit -m "feat(webhooks): webhook management UI on devices page"
```

---

### Phase 4 smoke test

- [ ] Rebuild containers: `docker compose up -d --build`
- [ ] Open `/dashboard/devices`, add a webhook pointing to `https://webhook.site/your-unique-id`
- [ ] Simulate event: `docker compose exec agent python -m agent.simulate_event --type UYUYOR`
- [ ] Verify POST received on webhook.site

---

## Final integration test

- [ ] Run full backend test suite: `cd backend && python -m pytest -v` → all green
- [ ] Rebuild and smoke-test all 4 phases end-to-end in Docker
- [ ] Final commit

```bash
git add .
git commit -m "chore: Phase 1-4 complete — auth, devices, history, webhooks"
```
