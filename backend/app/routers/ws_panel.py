from jose import JWTError
from jose import jwt as _jwt

from app.config import settings
from app.services.panel_hub import hub
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws/panel")
async def ws_panel(ws: WebSocket) -> None:
    token = ws.cookies.get("access_token")
    if token:
        try:
            _jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        except JWTError:
            token = None
    if not token:
        # Returning without ws.accept() causes Starlette to send HTTP 403
        return
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
