from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
from pathlib import Path

import httpx

from agent.config import settings
from agent.uploader import EventPayload, send_event

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "sample_violation.jpg"


async def main_async(args: argparse.Namespace) -> int:
    payload = EventPayload(
        agent_event_id=args.agent_event_id,
        type=args.type,
        track_id=args.track_id,
        occurred_at_iso=datetime.now(tz=timezone.utc).isoformat(),
        metadata={"perclos": args.perclos, "pitch": args.pitch, "signal_src": "MP"},
    )
    image = FIXTURE.read_bytes()
    async with httpx.AsyncClient() as client:
        event_id = await send_event(
            client,
            backend_url=settings.backend_url,
            device_id=settings.device_id,
            device_token=settings.device_token,
            payload=payload,
            screenshot=image,
        )
    if event_id is None:
        print(f"already recorded (409): agent_event_id={args.agent_event_id}")
    else:
        print(f"created event id={event_id}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Simulate a Guardwatch violation event")
    parser.add_argument(
        "--type",
        choices=["GOZ_KAPALI", "HAREKETSIZ", "UYUYOR", "TAKIP_KAYBEDILDI"],
        default="UYUYOR",
    )
    parser.add_argument("--agent-event-id", type=int, default=int(datetime.now().timestamp()))
    parser.add_argument("--track-id", type=int, default=1)
    parser.add_argument("--perclos", type=float, default=85.0)
    parser.add_argument("--pitch", type=float, default=22.5)
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
