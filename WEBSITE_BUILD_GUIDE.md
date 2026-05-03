# Guardwatch — Website Build Guide

A complete, single-file reference for building a web dashboard around the Guardwatch
DeepStream pipeline. Covers what the system does, what data it produces, how to expose
that data to a browser (the project currently has no HTTP layer), and a suggested
website architecture.

---

## 1. What Guardwatch Is

A real-time **drowsiness + inactivity detection** system for guard / driver
monitoring. It ingests an RTSP camera stream, detects people, tracks them with
persistent IDs, then per-person decides whether they are NORMAL, HAREKETSIZ
(stillness), GOZ_KAPALI (eyes closed), or UYUYOR (sleeping). Violations log to
disk and trigger a sound alarm. A snapshot of the moment the violation began is
written as a JPEG.

Hardware target: NVIDIA Jetson Nano + Hikvision IP camera over a single
Ethernet cable (no router required — see `DEGISIKLIKLER.md` §10).

---

## 2. Process Architecture (what the website is connecting to)

Single Python process (`guardwatch_ds.py`) running a GStreamer/DeepStream
pipeline:

```
RTSP camera ─▶ uridecodebin ─▶ nvstreammux ─▶ nvinfer (YOLO TRT engine)
                                  │
                                  ▼
                            nvtracker (NvDCF, persistent IDs)
                                  │
                                  ▼
                       pad-probe (Python) ─▶ MpWorker (face landmarks, EAR, head pose)
                                  │      ─▶ PoseWorker (YOLO-pose failsafe)
                                  ▼
                      nvvideoconvert ▶ nvdsosd ▶ EGL display
```

The probe is the only Python code that runs per-frame. Everything the website
needs comes from the probe’s state — so any HTTP/WebSocket layer must be
spawned **inside `guardwatch_ds.py`** and read from the same `takip_listesi`
dict the probe writes to.

---

## 3. Data the Website Will Display

There are **four distinct data sources**. The website must consume all four.

### 3.1 Live per-track state (in-memory, not currently exposed)

The probe maintains a global `takip_listesi: dict[int, state]` updated every
frame. Each value is the state dict from `init_track_state()`:

| Field              | Type            | Meaning                                                      |
|--------------------|-----------------|--------------------------------------------------------------|
| `durum`            | str             | Current state: `NORMAL` / `HAREKETSIZ` / `GOZ_KAPALI` / `UYUYOR` |
| `durum_renk`       | (R,G,B)         | OSD overlay color matching the state                          |
| `prev_durum`       | str             | State on previous frame (for change-detection)                |
| `eye_closed_start` | float \| None   | UNIX ts when eye-closure timer started (None = open)         |
| `not_moving_start` | float \| None   | UNIX ts when stillness timer started                          |
| `prev_center`      | (cx, cy)        | Last bbox center for motion delta                             |
| `perclos`          | float (0–100)   | % of last 60 s with eyes closed (PERCLOS metric)              |
| `pitch`            | float (deg)     | Head pitch angle; >15° = head-down                           |
| `signal_src`       | str             | `MP` (face landmarks) / `POSE` (YOLO-pose failsafe) / `---`   |
| `eye_closed_frame` | numpy or None   | Captured 1080p BGR frame at the moment the eye-closure timer started (binary, large — DO NOT serialize) |
| `not_moving_frame` | numpy or None   | Same idea for stillness timer                                 |
| `perclos_buffer`   | PerclosBuffer   | Internal — DO NOT serialize                                   |

The website should serialize **only** the public fields above (drop the numpy
frames and the buffer object).

A track ID is assigned by `nvtracker` and persists through brief occlusions.
When a track is lost the probe logs `TAKIP KAYBEDILDI`. The current log shows
the tracker frequently re-assigning the same ID after losses; the dashboard
should not assume a new ID = new person.

### 3.2 Pipeline-wide metrics (in-memory)

| Field         | Source                    | Meaning                          |
|---------------|---------------------------|----------------------------------|
| `_fps`        | global in `guardwatch_ds.py` | Smoothed pipeline FPS         |
| `person_sayisi` | per-frame local           | YOLO detections this frame      |
| `len(takip_listesi)` | global               | Number of active tracks         |

Already printed to stdout once per second as
`FPS=X.X KISI=N TAKIP=M`. The dashboard wants the same data on a chart.

### 3.3 Append-only log file: `app.log`

The system already persists every state transition. Format:

```
2026-05-03 13:55:36,820 | HAREKETSIZ IHLALI BASLADI | ID: 2
2026-05-03 13:55:13,396 | IHLAL BITTI | ID: 2
2026-05-03 13:55:18,710 | TAKIP KAYBEDILDI | ID: 2
2026-05-03 13:55:29,388 | YENI TAKIP BASLADI | ID: 2
2026-05-03 13:55:57,276 | Kalibrasyon tamamlandi: baseline=0.101, threshold=0.073 (n=356 ornek)
2026-05-03 13:55:52,401 | Pipeline hatasi: gst-resource-error-quark: ...
```

Schema: `<ISO timestamp with comma-ms> | <event message>`.
Encoding: UTF-8. Path: `app.log` at project root. Each write is `os.fsync`ed so
the dashboard can `tail -F` safely.

Event types (for filtering / charting):

| Substring matched     | Event class                         |
|-----------------------|-------------------------------------|
| `IHLALI BASLADI`      | violation start (HAREKETSIZ/GOZ_KAPALI/UYUYOR) |
| `IHLAL BITTI`         | violation end                        |
| `YENI TAKIP BASLADI`  | new track                            |
| `TAKIP KAYBEDILDI`    | track lost                           |
| `Kalibrasyon`         | EAR calibration finished             |
| `Pipeline hatasi`     | GStreamer error                      |
| `Program basladi`     | startup                              |

### 3.4 Snapshot directory: `kayitlar/`

Layout:
```
kayitlar/
  YYYY-MM-DD/
    ihlal_<track_id>_<DURUM>.jpg
```
Examples:
```
kayitlar/2026-05-03/ihlal_1_HAREKETSIZ.jpg
kayitlar/2026-05-03/ihlal_1_GOZ_KAPALI.jpg
kayitlar/2026-05-03/ihlal_1_UYUYOR.jpg
```

- Filename pattern is **fixed**: same `(date, id, durum)` tuple is overwritten
  on each repeat violation. This is intentional but limits historical
  replay — see §8 “Open issues” for a recommended fix the website should
  request.
- Image format: JPEG, **1920×1080**, ~600 KB.
- Captured at the *moment the violation timer began* (recent fix), not at the
  moment the threshold was crossed — so the snapshot shows the actual onset
  with full environment context.

### 3.5 Configuration: `config.json`

A flat JSON file the website may want to expose for admin tuning. Important
fields (full list in `config.json`):

| Field                    | Default | Meaning                                       |
|--------------------------|---------|-----------------------------------------------|
| `kamera_id`              | RTSP URL | Camera to ingest                             |
| `goz_kapali_limit_sn`    | 2.0     | Eye-closure seconds before GOZ_KAPALI         |
| `hareketsizlik_limit_sn` | 2.0     | Stillness seconds before HAREKETSIZ           |
| `hareket_piksel_esigi`   | 20      | px movement threshold for stillness           |
| `ear_threshold`          | 0.21    | Fallback EAR threshold (used until calibration) |
| `head_pitch_drowsy`      | 20      | Pitch deg → head-down                         |
| `perclos_window_sec`     | 60      | PERCLOS rolling window                        |
| `mediapipe_every_n`      | 3       | Run face landmarks every Nth frame            |
| `pose_enabled`           | true    | YOLO-pose failsafe on/off                     |
| `eye_smooth_window`      | 5       | K-of-N smoothing window                       |
| `eye_smooth_min_closed`  | 3       | K-of-N: min "closed" detections to flip       |
| `face_min_pixels`        | 45      | Reject face landmarks smaller than this       |
| `roi_padding_ratio`      | 0.12    | Adaptive padding around person bbox           |

Changing `config.json` requires restarting the pipeline — the website should
either show this caveat or implement a `restart` action.

---

## 4. How to Expose This to a Website (the missing piece)

The pipeline currently has **no HTTP server**. Pick one of three integration
patterns:

### Pattern A — In-process Flask/FastAPI server (simplest, recommended)

Add a thread inside `guardwatch_ds.py` that runs `uvicorn` on e.g. `:8080`.
Endpoints read `takip_listesi`, `_fps`, `app.log`, `kayitlar/`. No IPC needed.

Suggested endpoints:

| Method | Path                              | Purpose                                  |
|--------|-----------------------------------|------------------------------------------|
| GET    | `/api/status`                     | Pipeline FPS, person count, uptime       |
| GET    | `/api/tracks`                     | Snapshot of all live tracks (state dict, sanitized) |
| GET    | `/api/tracks/{id}`                | One track's full state                   |
| GET    | `/api/events?since=<ts>&limit=N`  | Tail of `app.log` parsed into JSON       |
| GET    | `/api/snapshots?date=YYYY-MM-DD`  | List JPEG filenames                      |
| GET    | `/api/snapshots/{date}/{file}`    | Serve a JPEG                             |
| GET    | `/api/config`                     | Current `config.json`                    |
| PUT    | `/api/config`                     | Write `config.json` (returns "restart needed") |
| WS     | `/ws/live`                        | Stream `{fps, tracks[]}` 2–5 Hz          |
| WS     | `/ws/events`                      | Stream new log lines as they're appended  |
| GET    | `/api/preview.mjpeg`              | Optional MJPEG stream (see §5)            |

State must be read under the same Python GIL the probe uses; the probe is the
only writer, so a simple `threading.Lock` around `takip_listesi` reads is
enough.

### Pattern B — File-based polling (zero code change to the pipeline)

The website backend `tail`s `app.log` and lists `kayitlar/`. Live track state
is **not** available — the dashboard becomes "what happened" rather than "what
is happening now". Cheapest if you only need an audit trail.

### Pattern C — Detached metrics writer

Add a 1 Hz dump in the probe that writes
`/tmp/guardwatch_state.json` with the sanitized `takip_listesi`. A separate
Node/Python web server reads that file. Decouples pipeline crashes from
website crashes but adds disk churn.

**Recommendation: Pattern A** — the pipeline is already a single long-running
Python process with a frame-rate budget that easily absorbs an HTTP thread.

---

## 5. Showing the Live Camera Feed

DeepStream sends video to an EGL window only (`nveglglessink`). The website
cannot read that.

Two options:

**Option 1 — Tee MJPEG branch into the GStreamer pipeline.** Add an `tee` after
`nvvideoconvert` whose other branch goes to
`nvjpegenc ! multipartmux ! tcpserversink port=8081`. Browser consumes
`http://jetson:8081/`. ~5 ms extra GPU per frame.

**Option 2 — Snapshot endpoint at 1–2 Hz.** Probe writes the latest frame to
`/tmp/latest.jpg`; HTTP endpoint serves it. Dashboard polls. Lower fidelity but
trivial.

If you want bbox/state overlays on the live preview (you do), use Option 1
*after* `nvdsosd` so the OSD text and boxes are baked in.

---

## 6. Suggested Website Pages

Based on what the data supports:

### 6.1 Dashboard (default page)
- Big number: current FPS, active person count
- Live camera preview (MJPEG)
- Per-track cards: ID, state badge (color-coded), PERCLOS gauge, pitch
  indicator, signal source, time-in-state
- Today's violation count by type

### 6.2 Live Tracks (table)
Sortable table of `takip_listesi`: ID, state, PCL, pitch, signal_src, last seen.
Auto-updates from `/ws/live`.

### 6.3 Events / Audit Log
Filterable timeline from `app.log`: date range, event type, track ID. Click an
event row to jump to its snapshot.

### 6.4 Snapshots Gallery
Calendar picker → grid of JPEGs from `kayitlar/<date>/`. Filter by `DURUM`.
Click for full-screen.

### 6.5 Configuration
Form-rendered `config.json`. Field-level validation (numerics with min/max,
toggle for `pose_enabled`, RTSP URL format). Save → confirm → trigger restart
endpoint.

### 6.6 Health
Last `Pipeline hatasi` lines, current calibration state
(`Kalibrasyon tamamlandi: ...`), camera reachability ping, free disk in
`kayitlar/`.

---

## 7. Backend Stack Recommendation

| Layer       | Choice                                | Why                                                |
|-------------|---------------------------------------|----------------------------------------------------|
| HTTP server | FastAPI (in-process, threaded)        | Built-in WS, async, runs in same Python venv      |
| Frontend    | React or SvelteKit                    | Live-update friendly                              |
| State       | WebSocket subscription                | Probe → broadcast → all clients                   |
| Auth        | Single admin password (HTTP Basic)    | LAN-only deployment (Jetson on closed subnet)     |
| Image serve | Static FastAPI mount on `kayitlar/`   | Zero copy from disk                               |

The Jetson Nano CPU has headroom for ~50 RPS of small JSON; do not run heavy
SSR — keep it a thin SPA.

---

## 8. Open Issues the Website Should Either Surface or Have the Backend Fix

These came up while reading the code; treat them as **known limitations** to
document on the dashboard:

1. **Snapshot filename collision** — `kayitlar/<date>/ihlal_<id>_<durum>.jpg`
   gets overwritten on every repeat violation of the same id+state. Multiple
   incidents in one day = only the latest is kept.
   → Fix: add `_<HHMMSS>` to the filename. Easy backend change in
   `guardwatch_ds.py:76`.
2. **Track ID instability under occlusion** — recent log shows the same
   apparent person getting fresh IDs every few seconds when partly occluded.
   The dashboard should not equate "new ID" with "new person"; consider a
   "session" merging heuristic.
3. **Pipeline has no graceful shutdown endpoint** — closing the EGL window
   exits the process. The website cannot currently restart it without a
   systemd unit / supervisor. Plan for systemd.
4. **No camera health probe** — RTSP outages currently surface only as a
   `Pipeline hatasi` log line and process exit. Consider an active
   `ffprobe`/`ping` watchdog from the backend.
5. **Calibration "yetersiz ornek" warning** — happens when no qualifying face
   was seen in the first 30 s; system falls back to default EAR threshold.
   Show this prominently on the dashboard so the operator knows accuracy is
   degraded.
6. **No multi-camera support** — the pipeline ingests one RTSP source. If the
   website is meant for several cameras, plan for one Python process per
   camera and an aggregator backend.

---

## 9. File Layout (what to mount, what to serve)

Project root: `/home/collbrai/guardwatch_f/`

| Path                                | Role                                       | Web exposure |
|-------------------------------------|--------------------------------------------|--------------|
| `guardwatch_ds.py`                  | Main pipeline — embed FastAPI here        | run        |
| `signals.py`                        | EAR / PERCLOS / pose helpers              | —            |
| `config.json`                       | Tunables                                   | GET/PUT     |
| `app.log`                           | Append-only event log                      | tail/stream |
| `kayitlar/<date>/*.jpg`             | Violation snapshots                        | static serve|
| `face_landmarker.task`              | MediaPipe model                            | —            |
| `yolo26n.engine`                    | TensorRT YOLO engine                       | —            |
| `yolo26n-pose.pt`                   | YOLO-pose failsafe model (CPU)             | —            |
| `config_infer_primary_yolo.txt`     | nvinfer config                             | —            |
| `config_tracker.yml`                | NvDCF tracker config                       | —            |
| `libnvdsinfer_custom_impl_Yolo.so`  | Custom YOLO bbox parser                    | —            |
| `run_ds.sh`                         | Launcher with libgomp LD_PRELOAD          | invoked by systemd |
| `sound.mp3`                         | Alarm sound                                | —            |
| `vnev/`                             | Python 3.8 virtualenv                      | —            |
| `DEGISIKLIKLER.md`                  | Project change log (Turkish)              | reference   |

---

## 10. Deployment Model (assumed)

- Single Jetson Nano on a closed LAN with one Hikvision camera.
- Operator opens the dashboard from a laptop on the same LAN
  (`http://jetson.local:8080`).
- No public internet exposure → don't bother with TLS / OAuth in v1; rely on
  network isolation + a single admin password.
- Wrap `run_ds.sh` in a systemd unit so the pipeline auto-restarts on
  EGL-window close or RTSP timeout.

Suggested systemd:
```ini
[Service]
WorkingDirectory=/home/collbrai/guardwatch_f
ExecStart=/home/collbrai/guardwatch_f/run_ds.sh
Restart=always
RestartSec=3
```

---

## 11. State Machine (diagram for the UI)

```
                  ┌──────────┐
                  │  NORMAL  │◀───── any timer reset
                  └────┬─────┘
                       │ stillness ≥ 2 s
                       ▼
                ┌───────────────┐
                │  HAREKETSIZ   │
                └────┬──────────┘
                       │ + eye_closed ≥ 2 s
                       ▼
                ┌───────────────┐
                │  GOZ_KAPALI   │   (also reachable from NORMAL if eye-closure starts before stillness)
                └────┬──────────┘
                       │ + still HAREKETSIZ
                       ▼
                ┌──────────┐
                │  UYUYOR  │ ─▶ alarm_cal() + snapshot
                └──────────┘
```

Priority order (`DURUM_ONCELIK` in `guardwatch_ds.py`):
`NORMAL=0 < HAREKETSIZ=1 < GOZ_KAPALI=2 < UYUYOR=3`. The state can only be
*promoted* during a frame; demotion happens only on the next frame after the
underlying timers reset.

UI implications:
- Use distinct color per state (already defined in `DURUM_RENK`):
  green → orange → red-orange → red.
- A track's "time in current state" is `now - state.eye_closed_start` /
  `now - state.not_moving_start`; both are useful for a live ring/gauge.

---

## 12. Minimal "Hello World" Backend Patch (illustrative)

Conceptual only — actual implementation should go in a follow-up task. The
shape is:

```python
# inside guardwatch_ds.py, after takip_listesi is defined
from fastapi import FastAPI
import uvicorn

api = FastAPI()
_state_lock = threading.Lock()  # wrap probe writes too

@api.get("/api/tracks")
def get_tracks():
    with _state_lock:
        return [
            {
                "id": oid,
                "durum": s["durum"],
                "perclos": round(s["perclos"], 1),
                "pitch": round(s["pitch"], 1),
                "signal_src": s["signal_src"],
                "eye_closed_for": (time.time() - s["eye_closed_start"]) if s["eye_closed_start"] else 0,
                "still_for":      (time.time() - s["not_moving_start"]) if s["not_moving_start"] else 0,
            }
            for oid, s in takip_listesi.items()
        ]

@api.get("/api/status")
def get_status():
    return {"fps": _fps, "tracks": len(takip_listesi)}

threading.Thread(
    target=lambda: uvicorn.run(api, host="0.0.0.0", port=8080, log_level="warning"),
    daemon=True,
).start()
```

That's the entire bridge. Extend with WS for live updates, static file mount
for `kayitlar/`, and a log-tail endpoint.

---

## 13. Quick-Reference Glossary

| Term         | Meaning                                                           |
|--------------|-------------------------------------------------------------------|
| **EAR**      | Eye Aspect Ratio — distance between eye landmarks; ↓ = closing   |
| **PERCLOS**  | % of last N seconds with eyes closed (clinical drowsiness metric)|
| **Pitch**    | Head up/down angle in degrees                                     |
| **HAREKETSIZ** | Stillness violation                                            |
| **GOZ_KAPALI** | Eye-closure violation                                          |
| **UYUYOR**   | Sleep violation (HAREKETSIZ + GOZ_KAPALI together)               |
| **MP**       | MediaPipe Face Landmarker (primary signal source)                 |
| **POSE**     | YOLO26-pose (skeleton failsafe when MP loses the face)           |
| **NvDCF**    | NVIDIA DeepStream Correlation Filter — the GPU tracker           |
| **OSD**      | On-Screen Display (the boxes/text drawn by `nvdsosd`)            |

---

## 14. What to Ask the Backend Author Next

If a different person builds the FastAPI layer, hand them this file plus:

1. Decide: in-process FastAPI (recommended) vs. sidecar?
2. Decide: MJPEG live preview (Option 1 in §5) or polling snapshot?
3. Add `_<HHMMSS>` to snapshot filenames (§8.1) — needs `frame_kaydet`
   change in `guardwatch_ds.py`.
4. Add a `threading.Lock` around `takip_listesi` writes in the probe so the
   API thread can read consistently.
5. Add a structured-event JSON log alongside `app.log` for easier UI parsing
   (or have the API parse the existing pipe-delimited format — both work).
