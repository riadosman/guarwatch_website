import asyncio
from typing import Optional
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def register(self, device_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._connections[device_id] = ws

    async def unregister(self, device_id: str) -> None:
        async with self._lock:
            self._connections.pop(device_id, None)

    async def send(self, device_id: str, message: dict) -> bool:
        ws = self._connections.get(device_id)
        if ws is None:
            return False
        try:
            await ws.send_json(message)
            return True
        except Exception:
            await self.unregister(device_id)
            return False

    def is_online(self, device_id: str) -> bool:
        return device_id in self._connections

    def online_devices(self) -> list[str]:
        return list(self._connections.keys())
