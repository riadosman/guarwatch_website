from __future__ import annotations

import json
import logging
import time
from contextlib import contextmanager
from typing import Any

from app.services.image_validator import ValidationResult


logger = logging.getLogger("guardwatch.upload")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[%(asctime)s] %(name)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
    logger.propagate = False


def log_upload(
    *,
    device_id: str,
    agent_event_id: int,
    violation_type: str,
    validation: ValidationResult,
    persist_ms: float,
    saved_path: str | None,
    extra: dict[str, Any] | None = None,
) -> None:
    info = validation.info
    record = {
        "event": "upload",
        "device_id": device_id,
        "agent_event_id": agent_event_id,
        "violation_type": violation_type,
        "bytes": info.bytes_total,
        "width": info.width,
        "height": info.height,
        "megapixels": round(info.megapixels, 2),
        "precision": info.precision,
        "sof_marker": hex(info.sof_marker) if info.sof_marker else None,
        "has_eoi": info.has_eoi,
        "sha256_8": info.sha256_hex[:8],
        "issues": validation.issues,
        "persist_ms": round(persist_ms, 1),
        "saved_path": saved_path,
    }
    if extra:
        record.update(extra)
    level = logging.WARNING if validation.issues else logging.INFO
    logger.log(level, json.dumps(record, ensure_ascii=False))


@contextmanager
def timer():
    start = time.perf_counter()
    elapsed = {"ms": 0.0}
    try:
        yield elapsed
    finally:
        elapsed["ms"] = (time.perf_counter() - start) * 1000.0
