from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import auth, devices, events, health, webhooks, ws_panel
from app.routers.users import router as users_router
from app.routers.roles import router as roles_router
from app.routers.groups import router as groups_router
from app.routers.relay_bridge import router as relay_router
from app.routers.locations import router as locations_router
from app.routers.cameras import router as cameras_router


def create_app() -> FastAPI:
    app = FastAPI(title="Fleet Backend", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(events.router)
    app.include_router(ws_panel.router)
    app.include_router(auth.router)
    app.include_router(devices.router)
    app.include_router(webhooks.router)
    app.include_router(users_router)
    app.include_router(roles_router)
    app.include_router(groups_router)
    app.include_router(relay_router)
    app.include_router(locations_router)
    app.include_router(cameras_router)

    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")

    return app


app = create_app()
