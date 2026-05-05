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

See `docs/specs/2026-05-03-fleet-management-phases-design.md` for the design doc.
