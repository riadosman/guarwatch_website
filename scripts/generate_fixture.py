"""Regenerate the synthetic 1920x1080 violation screenshot.

Run via a one-shot Pillow container so we don't add Pillow to backend/agent:

    docker run --rm \
        -v "$PWD/scripts:/scripts" \
        -v "$PWD/agent/fixtures:/out_dev" \
        -v "$PWD/agent/jetson:/out_jetson" \
        python:3.11-slim \
        sh -c "pip install -q Pillow && python /scripts/generate_fixture.py /out_dev/sample_violation.jpg /out_jetson/sample_violation.jpg"
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


W, H = 1920, 1080


def _font(size: int):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render() -> Image.Image:
    img = Image.new("RGB", (W, H), (10, 12, 18))
    base = img.load()
    for y in range(H):
        for x in range(0, W, 8):
            t = (x + y) / (W + H)
            r = int(20 + 40 * t)
            g = int(18 + 12 * t)
            b = int(28 + 50 * t)
            for dx in range(8):
                if x + dx < W:
                    base[x + dx, y] = (r, g, b)

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    cx, cy = W // 2, int(H * 0.46)
    for r, alpha in ((420, 90), (300, 120), (180, 160)):
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(220, 60, 60, alpha))
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=60))

    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)

    grid_color = (255, 255, 255, 18)
    img_rgba = img.convert("RGBA")
    g = ImageDraw.Draw(img_rgba)
    for x in range(0, W, 80):
        g.line([(x, 0), (x, H)], fill=grid_color, width=1)
    for y in range(0, H, 80):
        g.line([(0, y), (W, y)], fill=grid_color, width=1)
    img = img_rgba.convert("RGB")
    draw = ImageDraw.Draw(img)

    box_w, box_h = 460, 540
    box_x = (W - box_w) // 2
    box_y = int(H * 0.22)
    draw.rectangle(
        [box_x, box_y, box_x + box_w, box_y + box_h],
        outline=(240, 80, 80),
        width=4,
    )
    for px, py in [
        (box_x, box_y),
        (box_x + box_w, box_y),
        (box_x, box_y + box_h),
        (box_x + box_w, box_y + box_h),
    ]:
        draw.line([(px - 30, py), (px + 30, py)], fill=(255, 255, 255), width=4)
        draw.line([(px, py - 30), (px, py + 30)], fill=(255, 255, 255), width=4)

    label_font = _font(54)
    sub_font = _font(28)
    badge_font = _font(20)
    mono_font = _font(22)

    draw.rectangle(
        [box_x, box_y - 56, box_x + 280, box_y - 8],
        fill=(220, 50, 50),
    )
    draw.text(
        (box_x + 16, box_y - 50),
        "TRACK #07",
        fill=(255, 255, 255),
        font=label_font.font_variant(size=32) if hasattr(label_font, "font_variant") else _font(32),
    )

    draw.rectangle([0, 0, W, 64], fill=(0, 0, 0, 200))
    draw.text((28, 18), "GUARDWATCH · TEST FIXTURE", fill=(220, 220, 230), font=_font(28))
    draw.text((W - 360, 22), "1920 x 1080  ·  CAM-01", fill=(180, 180, 180), font=mono_font)

    draw.rectangle([0, H - 56, W, H], fill=(0, 0, 0, 200))
    draw.text(
        (28, H - 44),
        "SENTETİK GÖRSEL · GERÇEK KAMERA AKIŞI DEĞİL",
        fill=(200, 200, 210),
        font=sub_font,
    )
    draw.text(
        (W - 320, H - 44),
        "PERCLOS 88%  PITCH 22.5°",
        fill=(255, 200, 100),
        font=sub_font,
    )

    return img


def main(out_paths: list[str]) -> int:
    if not out_paths:
        print("usage: generate_fixture.py <out1.jpg> [<out2.jpg> ...]", file=sys.stderr)
        return 2
    img = render()
    for raw in out_paths:
        p = Path(raw)
        p.parent.mkdir(parents=True, exist_ok=True)
        img.save(p, format="JPEG", quality=88, optimize=True, progressive=True)
        print(f"wrote {p} ({p.stat().st_size:,} bytes, {img.size[0]}x{img.size[1]})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
