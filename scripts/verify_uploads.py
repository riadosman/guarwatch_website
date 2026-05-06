"""Verify all JPEGs currently in the backend uploads volume.

Usage:
    # In-container (recommended):
    docker compose exec backend python /app/../scripts/verify_uploads.py /uploads
    # …or copy in & run:
    docker compose cp scripts/verify_uploads.py backend:/tmp/verify_uploads.py
    docker compose exec backend python /tmp/verify_uploads.py /uploads

    # On host (if /uploads is mounted):
    py -3.12 scripts/verify_uploads.py ./uploads

Output: one row per JPEG with bytes, dimensions, sha256[:8], issues.
Exit 0 if every file decodes & meets min-resolution; non-zero otherwise.
"""

from __future__ import annotations

import argparse
import hashlib
import struct
import sys
from pathlib import Path


_SOF_MARKERS = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def parse_jpeg(data: bytes):
    if not data.startswith(b"\xff\xd8\xff"):
        return (None, None, None, False, hashlib.sha256(data).hexdigest())
    has_eoi = data.endswith(b"\xff\xd9")
    i = 2
    n = len(data)
    width = height = sof = None
    while i + 4 <= n:
        if data[i] != 0xFF:
            break
        marker = data[i + 1]
        i += 2
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            continue
        if i + 2 > n:
            break
        seg_len = struct.unpack(">H", data[i : i + 2])[0]
        if marker in _SOF_MARKERS and i + 7 <= n:
            height, width = struct.unpack(">HH", data[i + 3 : i + 7])
            sof = marker
            break
        i += seg_len
    sha = hashlib.sha256(data).hexdigest()
    return (width, height, sof, has_eoi, sha)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("path", help="Directory holding device subfolders with .jpg files")
    p.add_argument("--min-width", type=int, default=1280)
    p.add_argument("--min-height", type=int, default=720)
    p.add_argument("--max-bytes", type=int, default=2 * 1024 * 1024)
    args = p.parse_args()

    root = Path(args.path)
    if not root.exists():
        print(f"path not found: {root}", file=sys.stderr)
        return 2

    files = sorted(root.rglob("*.jpg"))
    if not files:
        print(f"no .jpg files under {root}")
        return 0

    print(f"{'file':<60} {'bytes':>9} {'wxh':>11} {'sha8':>8}  issues")
    print("-" * 110)
    bad = 0
    for f in files:
        data = f.read_bytes()
        w, h, sof, has_eoi, sha = parse_jpeg(data)
        issues = []
        if not data.startswith(b"\xff\xd8\xff"):
            issues.append("not_jpeg")
        if not has_eoi:
            issues.append("no_eoi")
        if w is None or h is None:
            issues.append("no_sof")
        else:
            if w < args.min_width or h < args.min_height:
                issues.append(f"low_res({w}x{h})")
        if len(data) > args.max_bytes:
            issues.append(f"too_large({len(data)})")
        rel = str(f.relative_to(root))
        wxh = f"{w}x{h}" if w and h else "?"
        marker = "OK" if not issues else " ".join(issues)
        print(f"{rel:<60} {len(data):>9,} {wxh:>11} {sha[:8]}  {marker}")
        if issues:
            bad += 1

    print("-" * 110)
    print(f"{len(files)} files, {bad} with issues")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
