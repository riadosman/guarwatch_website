import asyncio
import base64
import logging
import os
import platform
import signal
from typing import Callable, Coroutine, Optional

logger = logging.getLogger(__name__)

PTY_AVAILABLE = platform.system() != "Windows"


class TermRelay:
    """PTY-backed terminal session for one browser channel."""

    def __init__(self) -> None:
        self._master_fd: Optional[int] = None
        self._pid: Optional[int] = None
        self._channel: int = 2
        self._send_fn: Optional[Callable[[dict], Coroutine]] = None

    async def start(self, channel: int, send_fn: Callable[[dict], Coroutine]) -> bool:
        if not PTY_AVAILABLE:
            logger.warning("Terminal desteği bu platformda yok (pty sadece Linux'ta çalışır)")
            return False
        import pty

        self._channel = channel
        self._send_fn = send_fn
        self._pid, self._master_fd = pty.fork()

        if self._pid == 0:
            os.execvp("bash", ["bash"])

        asyncio.get_event_loop().add_reader(self._master_fd, self._on_pty_data)
        logger.info("Terminal oturumu başladı — ch=%d pid=%d", channel, self._pid)
        return True

    def _on_pty_data(self) -> None:
        try:
            data = os.read(self._master_fd, 4096)
        except OSError:
            self.stop()
            return
        encoded = base64.b64encode(data).decode()
        if self._send_fn:
            asyncio.ensure_future(self._send_fn({
                "ch": self._channel,
                "type": "term_data",
                "data": encoded,
            }))

    def write(self, b64_data: str) -> None:
        if self._master_fd is None:
            return
        try:
            raw = base64.b64decode(b64_data)
            os.write(self._master_fd, raw)
        except Exception as exc:
            logger.warning("PTY yazma hatası: %s", exc)

    def stop(self) -> None:
        if self._master_fd is not None:
            try:
                asyncio.get_event_loop().remove_reader(self._master_fd)
                os.close(self._master_fd)
            except OSError:
                pass
            self._master_fd = None
        if self._pid is not None:
            try:
                os.kill(self._pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            self._pid = None
        logger.info("Terminal oturumu kapatıldı — ch=%d", self._channel)
