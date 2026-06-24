from app.models.base import Base
from app.models.device import Device
from app.models.event import Event
from app.models.webhook import WebhookConfig  # noqa: F401
from app.models.location import Il, Ilce, Mahalle
from app.models.camera import Camera

__all__ = ["Base", "Device", "Event", "WebhookConfig", "Il", "Ilce", "Mahalle", "Camera"]
