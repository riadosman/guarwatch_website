# Jetson Agent (Python 3.6 compatible)

Slim, standalone variant of the agent for Jetson Nano running JetPack 4.x
(Python 3.6.9). Uses `requests` instead of `httpx`, no `pydantic-settings`,
no `fastapi`, no async — only what's needed to push a violation event to the
backend.

## Install on Jetson

```bash
cd ~/guardwatch_website/agent/jetson
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Copy the fixture JPEG

The bundled `simulate_event.py` looks for `sample_violation.jpg` in this
directory. Copy the one from the main agent:

```bash
cp ../fixtures/sample_violation.jpg .
```

(Or use any other JPEG with `--screenshot /path/to/your.jpg`.)

## Configure (env vars)

Replace `192.168.1.136` with your backend host's LAN IP.

```bash
export AGENT_BACKEND_URL=http://192.168.1.136:8000
export AGENT_DEVICE_ID=00000000-0000-0000-0000-000000000001
export AGENT_DEVICE_TOKEN=dev-token
```

To make permanent: append the three lines to `~/.bashrc`.

## Smoke test

```bash
curl $AGENT_BACKEND_URL/health
```

Expected: `{"status":"ok"}`. If this fails, fix the network/firewall first.

## Fire a violation

```bash
python3 simulate_event.py --type UYUYOR
python3 simulate_event.py --type GOZ_KAPALI
python3 simulate_event.py --type HAREKETSIZ
```

Expected on Jetson: `created event id=<N>`. Expected in the dashboard
(`http://localhost:3000` on the backend host): toast pops + new card.

## Idempotency check

```bash
python3 simulate_event.py --type UYUYOR --agent-event-id 9001
python3 simulate_event.py --type UYUYOR --agent-event-id 9001
```

Second call should print `already recorded (409): agent_event_id=9001`. No
duplicate card appears in the dashboard.

## Custom screenshot

```bash
python3 simulate_event.py --type UYUYOR --screenshot /path/to/your.jpg
```

## Files

- `uploader.py` — single function `send_event(...)` with idempotent 409
  handling. Pure stdlib + `requests`.
- `simulate_event.py` — CLI wrapper. Reads env vars, calls uploader.
- `requirements.txt` — `requests>=2.27,<3`.
- `sample_violation.jpg` — placeholder, you copy it from
  `../fixtures/sample_violation.jpg`.

## Notes

- The main `agent/` package (httpx + FastAPI + pydantic-settings) is for the
  dev box, NOT the Jetson. Don't try to `pip install -e ..` on Jetson — it
  needs Python 3.11.
- Phase 2 will replace `simulate_event.py` with a daemon that tails
  `app.log` from `guardwatch_ds.py` and uploads each violation
  automatically. This standalone CLI is for verifying the network +
  authentication path first.
