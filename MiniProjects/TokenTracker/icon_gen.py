"""Dynamic system tray icon generator for the token tracker.

Generates 32×32 RGBA icons using Pillow that display an abbreviated daily
token count over a dark rounded-rectangle background.  The text color shifts
through a green → yellow → red gradient depending on usage level.

Dependencies: Pillow (PIL)
"""

from __future__ import annotations

from typing import Tuple

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ICON_SIZE: int = 32
"""Width and height of the generated icon in pixels."""

_BG_COLOR_TOP: Tuple[int, int, int, int] = (30, 30, 30, 240)
_BG_COLOR_BOT: Tuple[int, int, int, int] = (50, 50, 50, 240)
"""Top / bottom colours for the background gradient."""

_CORNER_RADIUS: int = 6
"""Radius used when drawing the rounded-rectangle background."""

# Colour bands: (threshold, colour_start, colour_end)
_COLOR_BANDS: list[Tuple[int, Tuple[int, ...], Tuple[int, ...]]] = [
    (50_000, (0, 200, 83), (105, 240, 174)),       # green  < 50 K
    (200_000, (255, 214, 0), (255, 171, 0)),        # amber  50 K – 200 K
    (int(1e18), (255, 109, 0), (255, 23, 68)),      # red    > 200 K
]

# Font candidates (tried in order).  Segoe UI is available on every modern
# Windows installation; the others are common fallbacks.
_FONT_NAMES: list[str] = [
    "segoeuib.ttf",   # Segoe UI Bold
    "segoeui.ttf",    # Segoe UI Regular
    "arialbd.ttf",    # Arial Bold
    "arial.ttf",      # Arial Regular
]


# ---------------------------------------------------------------------------
# Helpers – formatting
# ---------------------------------------------------------------------------


def format_token_count(count: int) -> str:
    """Format a token count into a compact human-readable string.

    Examples
    --------
    >>> format_token_count(0)
    '0'
    >>> format_token_count(542)
    '542'
    >>> format_token_count(1_200)
    '1.2K'
    >>> format_token_count(45_000)
    '45K'
    >>> format_token_count(1_300_000)
    '1.3M'
    >>> format_token_count(12_000_000)
    '12M'
    """
    if count < 0:
        count = 0
    if count < 1_000:
        return str(count)
    if count < 10_000:
        # e.g. 1200 → "1.2K"
        value = count / 1_000
        formatted = f"{value:.1f}".rstrip("0").rstrip(".")
        return f"{formatted}K"
    if count < 1_000_000:
        # e.g. 45000 → "45K"
        value = count / 1_000
        formatted = f"{value:.0f}"
        return f"{formatted}K"
    if count < 10_000_000:
        # e.g. 1300000 → "1.3M"
        value = count / 1_000_000
        formatted = f"{value:.1f}".rstrip("0").rstrip(".")
        return f"{formatted}M"
    # e.g. 12000000 → "12M"
    value = count / 1_000_000
    formatted = f"{value:.0f}"
    return f"{formatted}M"


# ---------------------------------------------------------------------------
# Helpers – drawing
# ---------------------------------------------------------------------------


def _lerp_color(
    c1: Tuple[int, ...],
    c2: Tuple[int, ...],
    t: float,
) -> Tuple[int, ...]:
    """Linearly interpolate between two RGB(A) colour tuples.

    Parameters
    ----------
    c1, c2:
        Start and end colours (3- or 4-element tuples).
    t:
        Interpolation factor clamped to [0, 1].
    """
    t = max(0.0, min(1.0, t))
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def _pick_text_color(daily_tokens: int) -> Tuple[int, int, int]:
    """Return an RGB text colour based on the daily token count.

    The colour is interpolated within the matching band so that the
    transition feels smooth rather than a hard step.
    """
    lo = 0
    for threshold, c_start, c_end in _COLOR_BANDS:
        if daily_tokens < threshold:
            span = max(threshold - lo, 1)
            t = (daily_tokens - lo) / span
            rgb = _lerp_color(c_start, c_end, t)
            return rgb[:3]  # type: ignore[return-value]
        lo = threshold
    # Fallback (should never be reached)
    return _COLOR_BANDS[-1][1][:3]  # type: ignore[return-value]


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Try to load a TrueType font at *size* px; fall back to the default."""
    for name in _FONT_NAMES:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _draw_rounded_rect_gradient(
    draw: ImageDraw.ImageDraw,
    bbox: Tuple[int, int, int, int],
    radius: int,
    color_top: Tuple[int, int, int, int],
    color_bot: Tuple[int, int, int, int],
) -> None:
    """Draw a rounded rectangle filled with a vertical gradient.

    The gradient is approximated by drawing one horizontal line per row
    inside a rounded-rectangle mask.
    """
    x0, y0, x1, y1 = bbox
    height = y1 - y0
    # Create a temporary image for the gradient fill
    grad = Image.new("RGBA", (x1 - x0, height), (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad)

    # Draw the gradient line-by-line
    for y in range(height):
        t = y / max(height - 1, 1)
        color = _lerp_color(color_top, color_bot, t)
        grad_draw.line([(0, y), (x1 - x0, y)], fill=color)

    # Create a rounded-rectangle mask
    mask = Image.new("L", (x1 - x0, height), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(
        (0, 0, x1 - x0 - 1, height - 1),
        radius=radius,
        fill=255,
    )

    # Composite the gradient through the mask onto a transparent canvas
    result = Image.new("RGBA", (x1 - x0, height), (0, 0, 0, 0))
    result.paste(grad, mask=mask)

    # Paste the result onto the target draw's image
    draw._image.paste(result, (x0, y0), result)


def _draw_centred_text(
    img: Image.Image,
    text: str,
    fill: Tuple[int, int, int],
    max_font_size: int = 18,
    min_font_size: int = 8,
) -> None:
    """Draw *text* centred in *img*, shrinking the font until it fits."""
    draw = ImageDraw.Draw(img)
    w, h = img.size

    # Determine padding to keep text inside the rounded rect
    pad_x = 2
    pad_y = 1
    max_w = w - 2 * pad_x
    max_h = h - 2 * pad_y

    chosen_font: ImageFont.FreeTypeFont | ImageFont.ImageFont | None = None
    bbox_text: Tuple[int, int, int, int] | None = None

    for size in range(max_font_size, min_font_size - 1, -1):
        font = _load_font(size)
        bb = draw.textbbox((0, 0), text, font=font)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        if tw <= max_w and th <= max_h:
            chosen_font = font
            bbox_text = bb
            break

    if chosen_font is None or bbox_text is None:
        chosen_font = _load_font(min_font_size)
        bbox_text = draw.textbbox((0, 0), text, font=chosen_font)

    tw = bbox_text[2] - bbox_text[0]
    th = bbox_text[3] - bbox_text[1]
    x = (w - tw) // 2 - bbox_text[0]
    y = (h - th) // 2 - bbox_text[1]

    # Tiny dark shadow for legibility
    draw.text((x + 1, y + 1), text, font=chosen_font, fill=(0, 0, 0))
    draw.text((x, y), text, font=chosen_font, fill=fill)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def create_tray_icon(daily_tokens: int) -> Image.Image:
    """Create a 32×32 PIL Image for the system tray icon.

    The icon displays the abbreviated token count (see
    :func:`format_token_count`) over a dark rounded-rectangle background.
    Text colour reflects the current usage band:

    * **Green** – fewer than 50 000 tokens today
    * **Amber** – 50 000 – 200 000 tokens today
    * **Red** – more than 200 000 tokens today

    Parameters
    ----------
    daily_tokens:
        Total token usage for the current day.

    Returns
    -------
    Image.Image
        A 32×32 RGBA :class:`~PIL.Image.Image`.
    """
    img = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background
    _draw_rounded_rect_gradient(
        draw,
        (0, 0, ICON_SIZE, ICON_SIZE),
        _CORNER_RADIUS,
        _BG_COLOR_TOP,
        _BG_COLOR_BOT,
    )

    # Text
    label = format_token_count(daily_tokens)
    color = _pick_text_color(daily_tokens)
    _draw_centred_text(img, label, color)

    return img


def create_default_icon() -> Image.Image:
    """Create a default icon shown when no usage data is available.

    Displays "..." in a muted grey over the standard dark background.

    Returns
    -------
    Image.Image
        A 32×32 RGBA :class:`~PIL.Image.Image`.
    """
    img = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    _draw_rounded_rect_gradient(
        draw,
        (0, 0, ICON_SIZE, ICON_SIZE),
        _CORNER_RADIUS,
        _BG_COLOR_TOP,
        _BG_COLOR_BOT,
    )

    _draw_centred_text(img, "...", fill=(160, 160, 160))

    return img


# ---------------------------------------------------------------------------
# Quick smoke-test when run directly
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    samples = [0, 542, 1_200, 45_000, 120_000, 1_300_000, 12_000_000]
    for n in samples:
        icon = create_tray_icon(n)
        fname = f"icon_{n}.png"
        icon.save(fname)
        print(f"Saved {fname}  ({format_token_count(n):>5s})")

    default = create_default_icon()
    default.save("icon_default.png")
    print("Saved icon_default.png")
