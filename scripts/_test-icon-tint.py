"""Stamp every launcher PNG passed on the CLI with a red "T" badge in the
bottom-right corner, so the test variant is visually distinguishable on the
home screen. Used by scripts/build-android-test.sh — not invoked directly.
"""

from __future__ import annotations

import sys
from PIL import Image, ImageDraw, ImageFont

BADGE_COLOR = (184, 89, 80, 255)   # brand 'up' direction red, opaque
TEXT_COLOR = (255, 255, 255, 255)


def add_test_badge(path: str) -> None:
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    badge_size = max(int(min(w, h) * 0.45), 24)
    x0 = w - badge_size
    y0 = h - badge_size

    # Draw filled circle for the badge.
    draw.ellipse((x0, y0, w, h), fill=BADGE_COLOR)

    # Place a "T" inside, sized roughly half the badge.
    font = _load_font(int(badge_size * 0.6))
    text = "T"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = x0 + (badge_size - tw) // 2 - bbox[0]
    ty = y0 + (badge_size - th) // 2 - bbox[1]
    draw.text((tx, ty), text, fill=TEXT_COLOR, font=font)

    out = Image.alpha_composite(img, overlay)
    out.save(path)


def _load_font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Avenir.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
    ):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


if __name__ == "__main__":
    for p in sys.argv[1:]:
        add_test_badge(p)
        print(f"badged: {p}")
