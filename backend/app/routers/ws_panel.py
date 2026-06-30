from datetime import timedelta

from jose import JWTError
from jose import jwt as _jwt

from app.config import settings
from app.core.auth import create_token, require_auth
from app.services.panel_hub import hub
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.get("/ws/ticket")
async def get_ws_ticket(sub: str = Depends(require_auth)) -> dict:
    """Cookie ile auth olan kullanıcıya kısa ömürlü WS bileti verir."""
    ticket = create_token(
        sub,
        timedelta(seconds=60),
        settings.jwt_secret,
        settings.jwt_algorithm,
    )
    return {"ticket": ticket}


@router.websocket("/ws/panel")
async def ws_panel(ws: WebSocket) -> None:
    # Cookie veya query param olarak token kabul et
    token = ws.cookies.get("access_token") or ws.query_params.get("token")
    if token:
        try:
            _jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        except JWTError:
            token = None
    if not token:
        await ws.close(code=1008)
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
