"""Python 3.6 compatible simulate-event CLI for Jetson Nano.

Usage:
    AGENT_BACKEND_URL=http://192.168.1.136:8000 \
    AGENT_DEVICE_ID=00000000-0000-0000-0000-000000000001 \
    AGENT_DEVICE_TOKEN=dev-token \
    python3 simulate_event.py --type UYUYOR
"""
import argparse
import os
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from uploader import send_event  # noqa: E402


FIXTURE = Path(__file__).resolve().parent / "sample_violation.jpg"


def main():
    parser = argparse.ArgumentParser(description="Simulate a Guardwatch violation event (py36)")
    parser.add_argument(
        "--type",
        choices=["GOZ_KAPALI", "HAREKETSIZ", "UYUYOR", "TAKIP_KAYBEDILDI"],
        default="UYUYOR",
    )
    parser.add_argument("--agent-event-id", type=int, default=int(time.time()))
    parser.add_argument("--track-id", type=int, default=1)
    parser.add_argument("--perclos", type=float, default=85.0)
    parser.add_argument("--pitch", type=float, default=22.5)
    parser.add_argument(
        "--screenshot",
        default=str(FIXTURE),
        help="Path to a JPEG to send (default: bundled fixture)",
    )
    args = parser.parse_args()

    backend_url = os.environ.get("AGENT_BACKEND_URL", "http://localhost:8000")
    device_id = os.environ.get(
        "AGENT_DEVICE_ID", "00000000-0000-0000-0000-000000000001"
    )
    device_token = os.environ.get("AGENT_DEVICE_TOKEN", "dev-token")

    image_path = Path(args.screenshot)
    if not image_path.exists():
        print("Screenshot not found: {}".format(image_path))
        return 1

    with open(str(image_path), "rb") as f:
        image = f.read()

    try:
        result = send_event(
            backend_url=backend_url,
            device_id=device_id,
            device_token=device_token,
            agent_event_id=args.agent_event_id,
            type_=args.type,
            track_id=args.track_id,
            occurred_at_iso=datetime.utcnow().isoformat() + "Z",
            metadata={"perclos": args.perclos, "pitch": args.pitch, "signal_src": "MP"},
            screenshot=image,
        )
    except Exception as exc:
        print("FAILED: {}".format(exc))
        return 2

    if result is None:
        print("already recorded (409): agent_event_id={}".format(args.agent_event_id))
    else:
        print("created event id={}".format(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
