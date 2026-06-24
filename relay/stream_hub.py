from fastapi import WebSocket


class StreamHub:
    def __init__(self):
        # key: (device_id, cam_id) -> browser WebSocket
        self._streams: dict[tuple[str, str], WebSocket] = {}

    def register_browser(self, device_id: str, cam_id: str, ws: WebSocket) -> None:
        self._streams[(device_id, cam_id)] = ws

    def unregister_browser(self, device_id: str, cam_id: str) -> None:
        self._streams.pop((device_id, cam_id), None)

    def has_viewer(self, device_id: str, cam_id: str) -> bool:
        return (device_id, cam_id) in self._streams

    async def forward_to_browser(self, device_id: str, cam_id: str, data: str) -> None:
        ws = self._streams.get((device_id, cam_id))
        if ws is None:
            return
        try:
            await ws.send_text(data)
        except Exception:
            self.unregister_browser(device_id, cam_id)
