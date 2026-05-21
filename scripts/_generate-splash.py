"""Render the in-app SplashOverlay design into a static PNG used as the
Android `windowBackground` drawable.  This is what's shown the instant the
activity is created — before the WebView is even up — so the cold-start
flow goes straight to the landing-looking frame with no green-only gap or
system splash icon flicker.

Output: android/app/src/main/res/drawable-nodpi/landing.png

Run via: .venv/bin/python scripts/_generate-splash.py
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import cairosvg

PROJECT = Path(__file__).resolve().parent.parent

W, H = 1080, 2400          # 9:20 reference covers virtually every phone

# Light variant — brand sage matches the in-app light theme + the launcher
# icon outside the app.
LIGHT_BG = (45, 79, 53, 255)         # #2D4F35
LIGHT_CREAM = (244, 247, 245, 255)
LIGHT_DIM = (244, 247, 245, 178)

# Dark variant — matches the latest in-app dark tokens exactly so the
# native splash aligns with the dashboard the user lands on:
#   --brand-surface = #0C0D0F  (page bg, vocalog deep-espresso)
#   --brand-ink     = #E8E2D6  (ivory text)
#   --brand         = #8C7A6B  (wet-wood, used in the icon below)
DARK_BG = (12, 13, 15, 255)          # #0C0D0F
DARK_CREAM = (232, 226, 214, 255)    # #E8E2D6 ivory
DARK_DIM = (232, 226, 214, 178)

# Output targets.  Android automatically picks the -night variant when the
# system is in dark mode, which usually matches the user's in-app
# preference.
LIGHT_OUT = PROJECT / "android/app/src/main/res/drawable-nodpi/landing.png"
DARK_OUT = PROJECT / "android/app/src/main/res/drawable-night-nodpi/landing.png"
LIGHT_OUT.parent.mkdir(parents=True, exist_ok=True)
DARK_OUT.parent.mkdir(parents=True, exist_ok=True)

ICON_SVG_LIGHT = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="0" y="0" width="100" height="100" rx="22" fill="#2D4F35"/>
  <g opacity="0.18" stroke="#7A8C7E" stroke-width="0.25" fill="none">
    <circle cx="50" cy="50" r="42" stroke-dasharray="1,1"/>
    <line x1="50" y1="5" x2="50" y2="95"/>
    <line x1="5" y1="50" x2="95" y2="50"/>
  </g>
  <path d="M 15 75 C 32 80, 44 45, 58 55 C 72 65, 78 30, 85 25"
        fill="none" stroke="#A6B89E" stroke-width="6" stroke-linecap="round" opacity="0.22"/>
  <path d="M 15 75 C 32 80, 44 45, 58 55 C 72 65, 78 30, 85 25"
        fill="none" stroke="url(#g)" stroke-width="3" stroke-linecap="round"/>
  <circle cx="58" cy="55" r="2" fill="#F4F7F5"/>
  <circle cx="85" cy="25" r="2.5" fill="#B89968"/>
  <defs>
    <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#2D3A30"/>
      <stop offset="50%" stop-color="#A6B89E"/>
      <stop offset="100%" stop-color="#B89968"/>
    </linearGradient>
  </defs>
</svg>
"""

# Dark variant — colour stops aligned to the vocalog-exact dark tokens:
#   bg = #0C0D0F (brand-surface)
#   gradient = #5E5147 → #8C7A6B → #B59E80 (wet-wood family)
#   end dot = #B59E80 (warm wood with slight gold)
#   mid dot = #E8E2D6 (ivory)
ICON_SVG_DARK = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="0" y="0" width="100" height="100" rx="22" fill="#0C0D0F"/>
  <g opacity="0.18" stroke="#5E5147" stroke-width="0.25" fill="none">
    <circle cx="50" cy="50" r="42" stroke-dasharray="1,1"/>
    <line x1="50" y1="5" x2="50" y2="95"/>
    <line x1="5" y1="50" x2="95" y2="50"/>
  </g>
  <path d="M 15 75 C 32 80, 44 45, 58 55 C 72 65, 78 30, 85 25"
        fill="none" stroke="#8C7A6B" stroke-width="6" stroke-linecap="round" opacity="0.2"/>
  <path d="M 15 75 C 32 80, 44 45, 58 55 C 72 65, 78 30, 85 25"
        fill="none" stroke="url(#gDark)" stroke-width="3" stroke-linecap="round"/>
  <circle cx="58" cy="55" r="2" fill="#E8E2D6"/>
  <circle cx="85" cy="25" r="2.5" fill="#B59E80"/>
  <defs>
    <linearGradient id="gDark" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#5E5147"/>
      <stop offset="50%" stop-color="#8C7A6B"/>
      <stop offset="100%" stop-color="#B59E80"/>
    </linearGradient>
  </defs>
</svg>
"""


def _load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = (
        # Korean-capable fonts shipped on macOS
        "/System/Library/Fonts/Supplemental/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/Library/Fonts/AppleSDGothicNeoB.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render(theme: str) -> Image.Image:
    if theme == "dark":
        bg = DARK_BG
        cream = DARK_CREAM
        dim_color = (232, 226, 214, 153)
        icon_svg = ICON_SVG_DARK
        glow_a = (140, 122, 107, 28)   # #8C7A6B wet-wood (matches --brand dark)
        glow_b = (181, 158, 128, 24)   # #B59E80 warm wood with gold lean
    else:
        bg = LIGHT_BG
        cream = LIGHT_CREAM
        dim_color = (244, 247, 245, 153)
        icon_svg = ICON_SVG_LIGHT
        glow_a = (166, 184, 158, 26)   # #A6B89E
        glow_b = (184, 153, 104, 22)   # #B89968
    img = Image.new("RGBA", (W, H), bg)

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-160, H * 0.20, 460, H * 0.20 + 620), fill=glow_a)
    gd.ellipse((W - 460, H * 0.55, W + 160, H * 0.55 + 620), fill=glow_b)
    img = Image.alpha_composite(img, glow)

    icon_size = 360
    icon_buf = BytesIO()
    cairosvg.svg2png(
        bytestring=icon_svg.encode(),
        write_to=icon_buf,
        output_width=icon_size,
        output_height=icon_size,
    )
    icon_buf.seek(0)
    icon = Image.open(icon_buf).convert("RGBA")
    icon_x = (W - icon_size) // 2
    icon_y = int(H * 0.36)
    img.paste(icon, (icon_x, icon_y), icon)

    draw = ImageDraw.Draw(img)
    label_font = _load_font(28)
    title_font = _load_font(72)
    micro_font = _load_font(22)
    micro_dim = _load_font(20)

    def center_text(text, y, font, color):
        w = draw.textlength(text, font=font)
        draw.text(((W - w) / 2, y), text, fill=color, font=font)

    label_color = (cream[0], cream[1], cream[2], 178)
    micro_color = (cream[0], cream[1], cream[2], 153)
    center_text("A S S E T   F L O W", icon_y + icon_size + 56, label_font, label_color)
    center_text("평온한 자산 동반자", icon_y + icon_size + 110, title_font, cream)
    center_text("SAFE  ·  LOCAL  ·  FAMILY", icon_y + icon_size + 210, micro_font, micro_color)
    center_text("화 면 을   터 치 하 여   시 작", H - 220, micro_dim, dim_color)
    _ = dim_color  # noqa — kept for symmetry with original
    return img.convert("RGB")


if __name__ == "__main__":
    render("light").save(LIGHT_OUT, "PNG")
    print(f"wrote {LIGHT_OUT}")
    render("dark").save(DARK_OUT, "PNG")
    print(f"wrote {DARK_OUT}")
