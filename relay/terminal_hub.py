from fastapi import WebSocket


class TerminalHub:
    def __init__(self):
        # (device_id, channel) -> browser WebSocket
        self._sessions: dict[tuple[str, int], WebSocket] = {}

    def register_browser(self, device_id: str, channel: int, ws: WebSocket) -> None:
        self._sessions[(device_id, channel)] = ws

    def unregister_browser(self, device_id: str, channel: int) -> None:
        self._sessions.pop((device_id, channel), None)

    async def forward_to_browser(self, device_id: str, channel: int, data: str) -> None:
        ws = self._sessions.get((device_id, channel))
        if ws is None:
            return
        try:
            await ws.send_text(data)
        except Exception:
            self.unregister_browser(device_id, channel)

    def next_channel(self, device_id: str) -> int:
        used = {ch for (did, ch) in self._sessions if did == device_id}
        ch = 2
        while ch in used:
            ch += 1
        return ch
