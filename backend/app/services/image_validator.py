from __future__ import annotations

import hashlib
import struct
from dataclasses import dataclass


JPEG_SOI = b"\xff\xd8\xff"
JPEG_EOI = b"\xff\xd9"

_SOF_MARKERS = {
    0xC0, 0xC1, 0xC2, 0xC3,
    0xC5, 0xC6, 0xC7,
    0xC9, 0xCA, 0xCB,
    0xCD, 0xCE, 0xCF,
}


@dataclass(frozen=True)
class JpegInfo:
    bytes_total: int
    width: int | None
    height: int | None
    precision: int | None
    sof_marker: int | None
    has_eoi: bool
    sha256_hex: str

    @property
    def megapixels(self) -> float:
        if self.width and self.height:
            return (self.width * self.height) / 1_000_000
        return 0.0

    def is_decodable(self) -> bool:
        return self.width is not None and self.height is not None and self.has_eoi


def parse_jpeg(data: bytes) -> JpegInfo:
    sha = hashlib.sha256(data).hexdigest()
    width: int | None = None
    height: int | None = None
    precision: int | None = None
    sof: int | None = None
    has_eoi = data.endswith(JPEG_EOI)

    if not data.startswith(JPEG_SOI):
        return JpegInfo(len(data), None, None, None, None, has_eoi, sha)

    i = 2
    n = len(data)
    while i + 4 <= n:
        if data[i] != 0xFF:
            break
        marker = data[i + 1]
        i += 2
        if marker == 0xD8 or marker == 0xD9:
            continue
        if 0xD0 <= marker <= 0xD7:
            continue
        if i + 2 > n:
            break
        seg_len = struct.unpack(">H", data[i : i + 2])[0]
        if marker in _SOF_MARKERS and i + 7 <= n:
            precision = data[i + 2]
            height, width = struct.unpack(">HH", data[i + 3 : i + 7])
            sof = marker
            break
        i += seg_len
    return JpegInfo(len(data), width, height, precision, sof, has_eoi, sha)


@dataclass(frozen=True)
class ValidationResult:
    info: JpegInfo
    issues: list[str]

    @property
    def ok(self) -> bool:
        return not self.issues


def validate_screenshot(
    data: bytes,
    *,
    max_bytes: int,
    min_width: int = 1280,
    min_height: int = 720,
) -> ValidationResult:
    """Inspect an incoming screenshot blob.

    Returns a ValidationResult with a list of human-readable issue strings.
    Empty list means OK. Issues are *warnings* the caller decides what to do
    with — hard rejects (size, magic) are returned the same way so the caller
    can choose strict vs lenient mode.
    """
    info = parse_jpeg(data)
    issues: list[str] = []

    if not data.startswith(JPEG_SOI):
        issues.append("not_jpeg_magic")
    if not info.has_eoi:
        issues.append("no_eoi_marker")
    if info.bytes_total > max_bytes:
        issues.append(f"too_large:{info.bytes_total}>{max_bytes}")
    if info.width is None or info.height is None:
        issues.append("no_sof_marker")
    else:
        if info.width < min_width or info.height < min_height:
            issues.append(
                f"low_resolution:{info.width}x{info.height}<{min_width}x{min_height}"
            )

    return ValidationResult(info=info, issues=issues)
