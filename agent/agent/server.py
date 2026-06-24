import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import settings
from .tunnel import Tunnel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    tunnel = Tunnel(
        relay_url=settings.relay_ws_url,
        device_id=settings.device_id,
        device_token=settings.device_token,
        agent_secret=settings.secret,
    )
    task = asyncio.create_task(tunnel.run())
    logger.info(
        "Tunnel başlatıldı — relay=%s device=%s",
        settings.relay_ws_url,
        settings.device_id,
    )
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


def create_app() -> FastAPI:
    app = FastAPI(title="Fleet Agent", version="0.1.0", lifespan=lifespan)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
