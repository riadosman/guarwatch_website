# GuardWatch Enhancement Design
**Date:** 2026-06-13  
**Scope:** Auth, Device Management, Event History & Search, Webhook Alerts  
**Deployment target:** Cloud VPS, multi-site, single admin  
**Approach:** Sequential phases — Auth → Devices → History → Alerts

---

## Overview

Four features added in dependency order. Each phase is independently deployable. Auth is the hard prerequisite for cloud exposure; device management unlocks per-device context for history; history and alerts are additive on top.

---

## Phase 1 — Auth

### Goal
Lock the dashboard behind a single admin login. No user table — credentials in env vars.

### Backend
- `POST /auth/login` — validates `{username, password}` against `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars. On success sets two **HTTP-only cookies**: access token (JWT, 15 min TTL) and refresh token (JWT, 7 days TTL). Uses existing `JWT_SECRET`, `ACCESS_TOKEN_TTL_MIN`, `REFRESH_TOKEN_TTL_DAYS` from `.env`.
- `POST /auth/logout` — clears both cookies.
- `POST /auth/refresh` — validates refresh token, rotates both cookies.
- `require_auth` FastAPI dependency — reads access cookie, verifies JWT, raises 401 on failure. Applied to: `GET /api/events`, `DELETE /api/events`, `WS /ws/panel`, and all new routes in subsequent phases.
- Device upload (`POST /api/devices/{device_id}/events`) keeps Bearer token auth — Jetson devices do not use cookies.

### Frontend
- New `/login` page — username/password form, calls `POST /auth/login`, redirects to `/dashboard` on success. Shows error on 401.
- `middleware.ts` (Next.js) — protects `/dashboard/*`: if no valid session cookie present, redirect to `/login`.
- `useEventStream` — on 401 from WS or REST, redirect to `/login` instead of infinite retry.
- Navbar (app variant) gets a "Logout" button that calls `POST /auth/logout` then redirects to `/login`.

### Data model
No changes. Credentials are env-only.

### New env vars
```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
```

---

## Phase 2 — Device Management

### Goal
Add/remove/rename Jetson devices from the UI, generate tokens, see per-device online status. Retire the `DEVICE_TOKENS` env var approach.

### Backend
- `GET /api/devices` — list all devices. Response includes computed `status` field: `"online"` if `last_seen_at` within last 2 minutes, `"offline"` otherwise.
- `POST /api/devices` — create device. Accepts `{name}`. Generates UUID + cryptographically random token. Stores `sha256(token)` in `token_hash` column. Returns raw token **once** in response — not retrievable after.
- `PATCH /api/devices/{id}` — rename only (name field).
- `DELETE /api/devices/{id}` — hard delete device, cascade-delete its events and uploaded screenshots from disk.
- Token validation updated: `require_device_auth` now queries DB (`token_hash = sha256(incoming_token)`) instead of reading `DEVICE_TOKENS` env var.
- All routes protected by `require_auth`.

### Data model
```sql
ALTER TABLE devices ADD COLUMN token_hash TEXT;
```
Alembic migration backfills `token_hash` for the existing demo device from env var, then env var approach is retired.

### Frontend — `/dashboard/devices` page
- Reachable from Navbar.
- Device card grid: name, truncated UUID, Online/Offline status badge, last seen timestamp, rename button, delete button (confirm dialog).
- "Add Device" modal:
  1. User enters device name.
  2. Backend returns `{id, token}`.
  3. Dialog shows **setup snippet** with copy button:
     ```
     echo "DEVICE_ID=<uuid>" >> .env
     echo "DEVICE_TOKEN=<token>" >> .env
     echo "BACKEND_URL=https://your-vps.com" >> .env
     ```
  4. Warning: "This token won't be shown again."
- StatsBar on main dashboard adds: X devices online / Y total.

### new_guardwatch — add `uploader.py`
- Sync HTTP module using `requests` (Python 3.8 compatible, same pattern as `agent/jetson/uploader.py`).
- Reads `DEVICE_ID`, `DEVICE_TOKEN`, `BACKEND_URL` from `.env` in project root using `python-dotenv` (`pip install python-dotenv`).
- Called from `guardwatch.py` and `guardwatch_ds.py` on violation state entry (UYUYOR / GOZ_KAPALI / HAREKETSIZ).
- Sends multipart POST: JSON payload + ROI JPEG (the file already saved to `kayitlar/`).
- Handles 409 (already recorded) silently. Logs other errors to `app.log`.
- Auto-increments `agent_event_id` per session using an in-memory counter.
- Payload matches existing `EventIn` schema:
  ```json
  {
    "agent_event_id": 5001,
    "type": "UYUYOR",
    "track_id": 3,
    "occurred_at": "2026-06-13T14:30:00+00:00",
    "metadata": { "perclos": 88.5, "pitch": 32.1, "signal_src": "MP" }
  }
  ```

---

## Phase 3 — Event History & Search

### Goal
Browse all past violations with device/type/date filters and CSV export.

### Backend
- Enhance `GET /api/events` with new optional query params:
  - `device_id` (UUID)
  - `type` (violation type string)
  - `from` (ISO date, inclusive)
  - `to` (ISO date, inclusive)
  - `page` (integer, default 1)
  - `page_size` (integer, default 50, max 200)
  - Response shape: `{ items: EventOut[], total: int, page: int, pages: int }`
- New `GET /api/events/export` — same filter params, streams CSV response with header `Content-Disposition: attachment; filename=events.csv`. Columns: id, device_name, type, track_id, occurred_at, received_at, perclos, pitch, signal_src.
- New DB index: `(device_id, occurred_at DESC)` for fast filtered queries (Alembic migration).
- All routes protected by `require_auth`.

### Frontend — `/dashboard/history` page
- Reachable from Navbar.
- Filter bar:
  - Device dropdown: "All Devices" + each registered device by name.
  - Type filter chips: reuse existing `TypeFilter` component.
  - Date range: two `<input type="date">` fields (From / To) using existing shadcn `Input`.
  - "Export CSV" button — calls `/api/events/export` with current filters, triggers browser download.
- Results rendered as a **table** (not card grid): columns are Device, Type badge, Track ID, Occurred At, PERCLOS, Pitch.
- Click any row → opens existing `EventLightbox` component.
- Pagination: Prev / Next buttons + "Page X of Y" text.
- Empty state: "No violations match the current filters."

### Data model
No changes. All required columns already exist on `events` table. Only a new index is added.

---

## Phase 4 — Webhook Alerts

### Goal
POST a JSON payload to a configured URL when a violation fires. Integrates with Slack, Discord, Telegram bots, or any custom HTTP endpoint.

### Backend
- New `webhook_configs` table:
  ```sql
  CREATE TABLE webhook_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    event_types TEXT[] NOT NULL DEFAULT '{}',  -- empty = all types
    secret TEXT,  -- optional HMAC secret
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ```
- Alembic migration creates this table.
- `WebhookService.dispatch(event)` — called inside `event_store.create_event()` via `fastapi.BackgroundTasks` (non-blocking). Queries all enabled webhook configs where `event_types` is empty OR contains the event's type. POSTs to each URL.
- Webhook payload:
  ```json
  {
    "event": "violation",
    "id": 42,
    "device_name": "Kule-1",
    "type": "UYUYOR",
    "track_id": 3,
    "occurred_at": "2026-06-13T14:30:00Z",
    "perclos": 88.5,
    "pitch": 32.1,
    "screenshot_url": "https://your-vps.com/uploads/..."
  }
  ```
- If `secret` is set, adds `X-GuardWatch-Signature: sha256=<hmac(secret, body)>` header.
- Failed deliveries logged to `app.log`. No retry in Phase 1 (keep it simple).
- CRUD routes: `GET /api/webhooks`, `POST /api/webhooks`, `PATCH /api/webhooks/{id}`, `DELETE /api/webhooks/{id}`. All protected by `require_auth`.

### Frontend — Webhooks section (on `/dashboard/devices` page, below device list)
- Webhook card: name, URL (truncated), enabled toggle, event types badges, edit + delete buttons.
- "Add Webhook" modal: name field, URL field, event types multi-select checkboxes, optional secret field.
- "Test" button — sends a synthetic violation payload immediately so the user can verify the receiver before going live.
- Enabled toggle calls `PATCH /api/webhooks/{id}` inline.

### Data model
New `webhook_configs` table (see above). No changes to existing tables.

---

## Routing summary (all new routes)

| Method | Path | Auth | Phase |
|--------|------|------|-------|
| POST | `/auth/login` | None | 1 |
| POST | `/auth/logout` | Cookie | 1 |
| POST | `/auth/refresh` | Cookie | 1 |
| GET | `/api/devices` | Cookie | 2 |
| POST | `/api/devices` | Cookie | 2 |
| PATCH | `/api/devices/{id}` | Cookie | 2 |
| DELETE | `/api/devices/{id}` | Cookie | 2 |
| GET | `/api/events` (enhanced) | Cookie | 3 |
| GET | `/api/events/export` | Cookie | 3 |
| GET | `/api/webhooks` | Cookie | 4 |
| POST | `/api/webhooks` | Cookie | 4 |
| PATCH | `/api/webhooks/{id}` | Cookie | 4 |
| DELETE | `/api/webhooks/{id}` | Cookie | 4 |

## Frontend routes summary

| Path | Purpose | Phase |
|------|---------|-------|
| `/login` | Admin login | 1 |
| `/dashboard` | Live panel (existing, now protected) | 1 |
| `/dashboard/devices` | Device management + webhooks | 2 + 4 |
| `/dashboard/history` | Event history & search | 3 |

---

## Migration sequence

1. `0002_device_token_hash.py` — adds `token_hash TEXT` to `devices`, backfills sha256 hash for demo device, retires `DEVICE_TOKENS` env var
2. `0003_event_history_index.py` — adds `(device_id, occurred_at DESC)` index on `events`
3. `0004_webhook_configs.py` — creates `webhook_configs` table
