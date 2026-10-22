"""
Dynamic System Tray Icon Generator for WifiTracker.

Renders 32x32 RGBA icons with color-coded Wi-Fi status arcs,
real-time numerical speed badges, and active test animations.
"""

from __future__ import annotations

import math
from typing import Tuple, Optional
from PIL import Image, ImageDraw, ImageFont

ICON_SIZE = 32

# Palette
BG_COLOR = (24, 24, 38, 240)
BORDER_COLOR = (45, 53, 72, 255)

COLORS = {
    "HEALTHY": (0, 230, 118, 255),    # Vibrant green
    "WARNING": (255, 214, 0, 255),    # Amber
    "CRITICAL": (255, 23, 68, 255),   # Bright red
    "OFFLINE": (120, 120, 130, 255),  # Slate gray
    "TESTING": (0, 229, 255, 255),    # Neon cyan
}

_FONT_CANDIDATES = [
    "segoeuib.ttf",
    "segoeui.ttf",
    "arialbd.ttf",
    "arial.ttf",
]


def _get_font(size: int) -> ImageFont.ImageFont:
    for name in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(name, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def format_speed_compact(mbps: float) -> str:
    """Format speed for 32x32 badge icon text."""
    if mbps <= 0.0:
        return "0"
    elif mbps < 1.0:
        return f".{int(mbps * 100):02d}"[:3]
    elif mbps < 10.0:
        return f"{mbps:.1f}"
    elif mbps < 100.0:
        return f"{int(round(mbps))}"
    elif mbps < 1000.0:
        return f"{int(round(mbps))}"
    else:
        return f"{mbps/1000:.1f}G"


def create_tray_icon(
    status: str = "HEALTHY",
    download_mbps: Optional[float] = None,
    is_testing: bool = False,
    test_frame: int = 0
) -> Image.Image:
    """
    Generate a 32x32 RGBA system tray icon.
    """
    img = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Dark Rounded Rectangle Container
    draw.rounded_rectangle(
        [(1, 1), (ICON_SIZE - 2, ICON_SIZE - 2)],
        radius=6,
        fill=BG_COLOR,
        outline=BORDER_COLOR,
        width=1
    )

    if is_testing:
        # Animated circular radar spinner
        accent = COLORS["TESTING"]
        cx, cy = ICON_SIZE // 2, ICON_SIZE // 2
        r = 10
        angle = (test_frame * 35) % 360
        # Draw base circle
        draw.ellipse([(cx - r, cy - r), (cx + r, cy + r)], outline=(40, 60, 90, 200), width=2)
        # Draw spinning arc
        draw.arc([(cx - r, cy - r), (cx + r, cy + r)], start=angle, end=angle + 100, fill=accent, width=3)
        # Inner dot
        draw.ellipse([(cx - 2, cy - 2), (cx + 2, cy + 2)], fill=accent)
        return img

    accent_color = COLORS.get(status.upper(), COLORS["HEALTHY"])

    if download_mbps is not None and download_mbps > 0.0:
        # Render numerical speed badge
        text = format_speed_compact(download_mbps)
        font_size = 11 if len(text) <= 2 else (9 if len(text) == 3 else 8)
        font = _get_font(font_size)

        # Draw mini status dot in top right
        dot_r = 3
        draw.ellipse([(ICON_SIZE - 8, 3), (ICON_SIZE - 3, 8)], fill=accent_color)

        # Center the speed number
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        x = (ICON_SIZE - tw) // 2
        y = (ICON_SIZE - th) // 2 + 1
        draw.text((x, y), text, font=font, fill=(240, 240, 245, 255))
    else:
        # Render clean Wi-Fi arcs
        cx, cy = ICON_SIZE // 2, 23
        # Dot
        draw.ellipse([(cx - 2, cy - 2), (cx + 2, cy + 2)], fill=accent_color)

        # Arc 1 (inner)
        draw.arc([(cx - 6, cy - 6), (cx + 6, cy + 6)], start=210, end=330, fill=accent_color, width=2)
        # Arc 2 (middle)
        draw.arc([(cx - 10, cy - 10), (cx + 10, cy + 10)], start=215, end=325, fill=accent_color, width=2)
        # Arc 3 (outer)
        draw.arc([(cx - 14, cy - 14), (cx + 14, cy + 14)], start=220, end=320, fill=accent_color, width=2)

    return img
