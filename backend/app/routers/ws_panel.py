from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.panel_hub import hub

router = APIRouter()


@router.websocket("/ws/panel")
async def ws_panel(ws: WebSocket) -> None:
    await ws.accept()
    queue = hub.subscribe()
    try:
        while True:
            message = await queue.get()
            await ws.send_json(message)
    except WebSocketDisconnect:
        pass
    finally:
        hub.unsubscribe(queue)
