import json
import os
import asyncio
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .connection_mgr import ConnectionManager
from .pairing import PairingService
from .terminal_hub import TerminalHub

manager = ConnectionManager()
pairing = PairingService()
terminal_hub = TerminalHub()

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


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
                device_id = msg["device_id"]
                await manager.register(device_id, ws)
                code = pairing.generate_code(device_id)
                await ws.send_json({"ch": 0, "type": "code", "code": code})

            elif mtype == "heartbeat" and device_id:
                await _notify_backend(device_id, "heartbeat", {})

            elif ch == 1 and device_id:
                await _notify_backend(device_id, mtype, msg.get("data", {}))

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


# ── Pairing HTTP ──────────────────────────────────────────────────────────────

class PairRequest(BaseModel):
    code: str
    name: str


@app.post("/pair")
async def pair_device(req: PairRequest):
    device_id = pairing.validate_and_consume(req.code)
    if device_id is None:
        raise HTTPException(status_code=400, detail="Invalid or expired pairing code")
    token = await _register_device_in_backend(device_id, req.name)
    await manager.send(device_id, {"ch": 0, "type": "paired", "token": token})
    return {"device_id": device_id, "token": token}


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _register_device_in_backend(device_id: str, name: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BACKEND_URL}/devices",
            json={"device_id": device_id, "name": name},
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
                timeout=2.0,
            )
    except Exception:
        pass  # best-effort
