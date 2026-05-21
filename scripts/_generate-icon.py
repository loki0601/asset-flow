"""Regenerate every launcher PNG from the aurora-curve SVG concept.

Run:
    .venv/bin/python scripts/_generate-icon.py

Renders the SVG via cairosvg into each mipmap density's ic_launcher,
ic_launcher_round (with a circular mask), and ic_launcher_foreground
(transparent-bg variant for adaptive icons).
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw
import cairosvg

PROJECT = Path(__file__).resolve().parent.parent
RES_DIR = PROJECT / "android/app/src/main/res"
# Brand-aligned palette. The earlier saturated emerald (#10B981) and gold
# (#D4AF37) clashed with the muted sage/earth tokens used everywhere else
# in the app. These are the brand sage tokens (Tailwind config):
#   brand        #2D4F35  primary deep sage
#   brand-mid    #4A7256
#   brand-sage   #7A8C7E
#   brand-ink    #2D3A30
#   brand-warm   #FDFBF7
BG_HEX = "#2D4F35"     # brand primary as the icon base

TARGETS = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

# Brand-aligned aurora curve.  Same composition as the original SVG concept,
# but each colour swapped to a brand token so the icon harmonises with the
# muted sage/earth palette used in the rest of the UI.
SVG_LAUNCHER = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="0" y="0" width="100" height="100" rx="24" fill="#2D4F35"/>
  <g opacity="0.18" stroke="#7A8C7E" stroke-width="0.25" fill="none">
    <circle cx="50" cy="50" r="42" stroke-dasharray="1,1"/>
    <line x1="50" y1="5" x2="50" y2="95"/>
    <line x1="5" y1="50" x2="95" y2="50"/>
  </g>
  <path d="M 15 75 C 32 80, 44 45, 58 55 C 72 65, 78 30, 85 25"
        fill="none" stroke="#A6B89E" stroke-width="6" stroke-linecap="round" opacity="0.22"/>
  <path d="M 15 75 C 32 80, 44 45, 58 55 C 72 65, 78 30, 85 25"
        fill="none" stroke="url(#auroraGrad)" stroke-width="3" stroke-linecap="round"/>
  <circle cx="58" cy="55" r="2" fill="#F4F7F5"/>
  <circle cx="85" cy="25" r="2.5" fill="#B89968"/>
  <defs>
    <linearGradient id="auroraGrad" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#2D3A30"/>
      <stop offset="50%" stop-color="#A6B89E"/>
      <stop offset="100%" stop-color="#B89968"/>
    </linearGradient>
  </defs>
</svg>
"""

# Foreground variant — no rect background, no rounded corners. Centered in
# a 108-unit canvas so Android's adaptive icon mask crops cleanly. The 66dp
# safe zone keeps the aurora curve visible inside any launcher mask
# (circle, squircle, square).
SVG_FOREGROUND = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <g transform="translate(20, 20) scale(0.68)">
    <g opacity="0.18" stroke="#7A8C7E" stroke-width="0.25" fill="none">
      <circle cx="50" cy="50" r="42" stroke-dasharray="1,1"/>
      <line x1="50" y1="5" x2="50" y2="95"/>
      <line x1="5" y1="50" x2="95" y2="50"/>
    </g>
    <path d="M 15 75 C 32 80, 44 45, 58 55 C 72 65, 78 30, 85 25"
          fill="none" stroke="#A6B89E" stroke-width="6" stroke-linecap="round" opacity="0.22"/>
    <path d="M 15 75 C 32 80, 44 45, 58 55 C 72 65, 78 30, 85 25"
          fill="none" stroke="url(#auroraGrad)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="58" cy="55" r="2" fill="#F4F7F5"/>
    <circle cx="85" cy="25" r="2.5" fill="#B89968"/>
  </g>
  <defs>
    <linearGradient id="auroraGrad" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#2D3A30"/>
      <stop offset="50%" stop-color="#A6B89E"/>
      <stop offset="100%" stop-color="#B89968"/>
    </linearGradient>
  </defs>
</svg>
"""


def render_png(svg: str, size: int) -> Image.Image:
    buf = BytesIO()
    cairosvg.svg2png(
        bytestring=svg.encode(),
        write_to=buf,
        output_width=size,
        output_height=size,
    )
    buf.seek(0)
    return Image.open(buf).convert("RGBA")


def circular_mask(size: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size, size), fill=255)
    return m


def main() -> int:
    if not RES_DIR.exists():
        raise SystemExit(f"missing {RES_DIR}")
    for folder, size in TARGETS.items():
        out_dir = RES_DIR / folder
        if not out_dir.exists():
            print(f"skip {folder} (not present)")
            continue
        launcher = render_png(SVG_LAUNCHER, size)
        launcher.save(out_dir / "ic_launcher.png")
        # Round variant — same render, circular mask applied.
        rounded = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        rounded.paste(launcher, (0, 0), circular_mask(size))
        rounded.save(out_dir / "ic_launcher_round.png")
        # Foreground (transparent) for adaptive icon.
        fg_size = FOREGROUND_SIZES[folder]
        fg = render_png(SVG_FOREGROUND, fg_size)
        fg.save(out_dir / "ic_launcher_foreground.png")
        print(f"wrote {folder}: launcher {size}px, foreground {fg_size}px")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
