import json
import os

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .audio_hub import AudioHub
from .connection_mgr import ConnectionManager
from .pairing import PairingService
from .stream_hub import StreamHub
from .terminal_hub import TerminalHub

manager = ConnectionManager()
pairing = PairingService()
terminal_hub = TerminalHub()
stream_hub = StreamHub()
audio_hub = AudioHub()

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
AGENT_SECRET = os.getenv("AGENT_SECRET", "")  # empty = auth disabled
BACKEND_API_KEY = os.getenv("BACKEND_API_KEY", "changeme")


app = FastAPI(title="GuardWatch Relay", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/devices")
async def list_devices():
    return {"online": manager.online_devices()}


# ── Jetson WebSocket ──────────────────────────────────────────────────────────

@app.websocket("/agent")
async def agent_endpoint(ws: WebSocket):
    await ws.accept()
    device_id = None
    try:
        async for raw in ws.iter_text():
            msg = json.loads(raw)
            ch = msg.get("ch", 0)
            mtype = msg.get("type", "")

            if mtype == "hello":
                # Authentication
                if AGENT_SECRET and msg.get("secret") != AGENT_SECRET:
                    await ws.close(code=4001, reason="Unauthorized")
                    return
                device_id = msg.get("device_id")
                if not device_id:
                    await ws.close(code=4002, reason="device_id required")
                    return
                await manager.register(device_id, ws)
                code = pairing.generate_code(device_id)
                await ws.send_json({"ch": 0, "type": "code", "code": code})

            elif mtype == "heartbeat" and device_id:
                await _notify_backend(device_id, "heartbeat", {})

            elif ch == 1 and device_id:
                await _notify_backend(device_id, mtype, msg.get("data", {}))

            elif ch == 3 and device_id:
                # Stream frames from Jetson → forward to browser
                cam_id = msg.get("cam_id", "")
                if cam_id:
                    await stream_hub.forward_to_browser(device_id, cam_id, json.dumps(msg))
            elif ch == 4 and device_id:
                # Audio chunks from Jetson → forward to listening browsers
                if audio_hub.has_listeners(device_id):
                    await audio_hub.broadcast(device_id, raw)
            elif ch >= 2 and device_id:
                await terminal_hub.forward_to_browser(
                    device_id, ch, json.dumps(msg)
                )

    except WebSocketDisconnect:
        pass
    finally:
        if device_id:
            await manager.unregister(device_id)
            await _notify_backend(device_id, "offline", {})


# ── Browser Terminal WebSocket ────────────────────────────────────────────────

@app.websocket("/terminal/{device_id}")
async def terminal_endpoint(ws: WebSocket, device_id: str):
    await ws.accept()
    ch = terminal_hub.next_channel(device_id)
    terminal_hub.register_browser(device_id, ch, ws)
    try:
        async for raw in ws.iter_text():
            await manager.send(device_id, {
                "ch": ch, "type": "term_input", "data": raw
            })
    except WebSocketDisconnect:
        pass
    finally:
        terminal_hub.unregister_browser(device_id, ch)


# ── Browser Stream WebSocket ──────────────────────────────────────────────────

@app.websocket("/stream/{device_id}/{cam_id}")
async def stream_endpoint(ws: WebSocket, device_id: str, cam_id: str):
    """Browser connects here to receive live camera frames."""
    await ws.accept()
    if not manager.is_online(device_id):
        await ws.close(code=4004, reason="Device offline")
        return

    await stream_hub.register_browser(device_id, cam_id, ws)
    # Tell Jetson to start streaming this camera
    await manager.send(device_id, {
        "ch": 3,
        "type": "stream_start",
        "cam_id": cam_id,
    })
    try:
        async for _ in ws.iter_text():
            pass  # browser doesn't send messages
    except WebSocketDisconnect:
        pass
    finally:
        stream_hub.unregister_browser(device_id, cam_id)
        # Tell Jetson to stop streaming
        try:
            await manager.send(device_id, {
                "ch": 3,
                "type": "stream_stop",
                "cam_id": cam_id,
            })
        except Exception:
            pass


# ── Browser Audio WebSocket ───────────────────────────────────────────────────

@app.websocket("/audio/{device_id}")
async def audio_endpoint(ws: WebSocket, device_id: str):
    """Tarayıcı buraya bağlanarak Jetson mikrofonunu dinler."""
    await ws.accept()
    if not manager.is_online(device_id):
        await ws.close(code=4004, reason="Device offline")
        return

    audio_hub.register_browser(device_id, ws)
    # Jetson'a ses akışını başlatmasını söyle
    await manager.send(device_id, {"ch": 4, "type": "audio_start"})
    try:
        async for _ in ws.iter_text():
            pass  # tarayıcı ses göndermez
    except WebSocketDisconnect:
        pass
    finally:
        audio_hub.unregister_browser(device_id, ws)
        # Başka dinleyen yoksa Jetson'a durdurmasını söyle
        if not audio_hub.has_listeners(device_id):
            try:
                await manager.send(device_id, {"ch": 4, "type": "audio_stop"})
            except Exception:
                pass


# ── Pairing HTTP ──────────────────────────────────────────────────────────────

class PairRequest(BaseModel):
    code: str
    name: str


@app.post("/pair")
async def pair_device(req: PairRequest):
    device_id = pairing.validate(req.code)
    if device_id is None:
        raise HTTPException(status_code=400, detail="Invalid or expired pairing code")
    try:
        token = await _register_device_in_backend(device_id, req.name)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend kaydi basarisiz: {exc}")
    pairing.consume(req.code)
    await manager.send(device_id, {"ch": 0, "type": "paired", "token": token})
    return {"device_id": device_id, "token": token}


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _register_device_in_backend(device_id: str, name: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BACKEND_URL}/relay/register",
            json={"device_id": device_id, "name": name},
            headers={"X-Relay-Key": BACKEND_API_KEY},
            timeout=5.0,
        )
        resp.raise_for_status()
        return resp.json()["token"]


async def _notify_backend(device_id: str, event_type: str, data: dict) -> None:
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{BACKEND_URL}/relay/notify",
                json={"device_id": device_id, "type": event_type, "data": data},
                headers={"X-Relay-Key": BACKEND_API_KEY},
                timeout=2.0,
            )
    except Exception:
        pass  # best-effort
