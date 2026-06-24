import asyncio
import json
import logging

import websockets

from .term_relay import TermRelay

logger = logging.getLogger(__name__)


class Tunnel:
    """Persistent WebSocket connection to the relay server.

    Manages terminal sessions: one TermRelay per channel (ch >= 2).
    """

    def __init__(
        self,
        relay_url: str,
        device_id: str,
        device_token: str,
        agent_secret: str = "",
    ) -> None:
        self._relay_url = relay_url
        self._device_id = device_id
        self._device_token = device_token
        self._agent_secret = agent_secret
        self._ws = None
        self._term_sessions: dict[int, TermRelay] = {}

    async def run(self) -> None:
        """Connect with exponential backoff — runs forever."""
        backoff = 5
        while True:
            try:
                async with websockets.connect(self._relay_url) as ws:
                    self._ws = ws
                    backoff = 5
                    logger.info("Relay'e bağlandı: %s", self._relay_url)
                    await self._send({
                        "ch": 0,
                        "type": "hello",
                        "device_id": self._device_id,
                        "token": self._device_token,
                        "secret": self._agent_secret,
                    })
                    heartbeat_task = asyncio.create_task(self._heartbeat_loop())
                    try:
                        async for raw in ws:
                            await self._handle(raw)
                    finally:
                        heartbeat_task.cancel()
                        try:
                            await heartbeat_task
                        except asyncio.CancelledError:
                            pass
            except Exception as exc:
                logger.warning("Relay bağlantısı koptu: %s — %ds sonra yeniden dene", exc, backoff)
                self._cleanup_sessions()
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60)
            finally:
                self._ws = None

    async def _heartbeat_loop(self) -> None:
        while True:
            await self._send({"ch": 0, "type": "heartbeat"})
            await asyncio.sleep(30)

    async def _handle(self, raw: str) -> None:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return

        ch = msg.get("ch", 0)
        mtype = msg.get("type", "")

        if ch == 0:
            if mtype == "code":
                logger.info("Eşleştirme kodu: %s", msg.get("code"))
            elif mtype == "paired":
                logger.info("Cihaz eşleştirildi")
            return

        if mtype == "term_input" and ch >= 2:
            if ch not in self._term_sessions:
                tr = TermRelay()
                ok = await tr.start(ch, self._send)
                if not ok:
                    return
                self._term_sessions[ch] = tr
            self._term_sessions[ch].write(msg.get("data", ""))

        elif mtype == "term_close" and ch >= 2:
            self._close_session(ch)

    async def _send(self, message: dict) -> None:
        if self._ws is None:
            return
        try:
            await self._ws.send(json.dumps(message))
        except Exception as exc:
            logger.warning("Gönderme hatası: %s", exc)

    def _close_session(self, ch: int) -> None:
        tr = self._term_sessions.pop(ch, None)
        if tr:
            tr.stop()

    def _cleanup_sessions(self) -> None:
        for tr in self._term_sessions.values():
            tr.stop()
        self._term_sessions.clear()
