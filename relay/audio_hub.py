from fastapi import WebSocket


class AudioHub:
    """Jetson'dan gelen ses akışını dinleyen tarayıcılara iletir.

    Bir Jetson → birden fazla tarayıcı (broadcast).
    """

    def __init__(self):
        # device_id -> set of browser WebSockets
        self._listeners: dict[str, set[WebSocket]] = {}

    def register_browser(self, device_id: str, ws: WebSocket) -> None:
        self._listeners.setdefault(device_id, set()).add(ws)

    def unregister_browser(self, device_id: str, ws: WebSocket) -> None:
        listeners = self._listeners.get(device_id, set())
        listeners.discard(ws)
        if not listeners:
            self._listeners.pop(device_id, None)

    def has_listeners(self, device_id: str) -> bool:
        return bool(self._listeners.get(device_id))

    async def broadcast(self, device_id: str, data: str) -> None:
        """Ses chunk'ını (JSON string) tüm dinleyen tarayıcılara gönder."""
        listeners = list(self._listeners.get(device_id, set()))
        dead: list[WebSocket] = []
        for ws in listeners:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unregister_browser(device_id, ws)
