"""Unified circular ZA board badges (range + AOE)."""

from __future__ import annotations

from PIL import Image, ImageDraw, ImageFont

from config import CARD_ASSETS_DIR
from utils import xy

WHITE = (255, 255, 255)
INK = (32, 36, 52)

RANGE_SHORT = (0, 168, 150)   # teal — matches board UI accent
RANGE_LONG = (255, 140, 66)   # orange
AOE_FILL = (108, 92, 231)     # violet

AOE_ICON_KIND = {
    'MELEE': 'melee',
    'RANGED': 'ranged',
    'AOE_CENTER': 'burst',
    'AOE_LINE': 'line',
    'SELF_ORIGIN': 'aura',
    'AOE_OVERHEAD': 'overhead',
    'TRAP': 'trap',
    'OTHER': 'other',
}


def _font(size: int, bold: bool = True):
    name = 'Barlow-Bold.ttf' if bold else 'barlow.ttf'
    path = CARD_ASSETS_DIR / 'fonts' / name
    if path.is_file():
        return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def _circle_badge(size_units: float) -> tuple[Image.Image, ImageDraw.ImageDraw, int]:
    px = xy(size_units, size_units)[0]
    return Image.new('RGBA', (px, px), (0, 0, 0, 0)), None, px  # draw set after


def _draw_orb(d: ImageDraw.ImageDraw, px: int, fill: tuple[int, int, int]):
    """White double ring + filled circle (Pokémon type-icon style)."""
    margin = max(2, px // 16)
    outer = (margin, margin, px - margin, px - margin)
    d.ellipse(outer, fill=WHITE)
    inset = margin + max(3, px // 18)
    d.ellipse((inset, inset, px - inset, px - inset), fill=fill, outline=INK, width=max(2, px // 32))


def _text_centered(d, xy_pair, text: str, font, fill=WHITE):
    x, y = xy_pair
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((x - tw / 2, y - th / 2), text, font=font, fill=fill)


def render_range_icon(band: str, tiles: int, style: str = 'orb', size_units: float = 2.35) -> Image.Image:
    del style  # single unified style
    img = Image.new('RGBA', (xy(size_units, size_units)[0],) * 2, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    px = img.width
    fill = RANGE_SHORT if band == 'SHORT' else RANGE_LONG
    _draw_orb(d, px, fill)
    cx, cy = px // 2, px // 2
    tiles = max(1, min(6, int(tiles)))
    _text_centered(d, (cx, cy - px // 14), str(tiles), _font(px // 2), WHITE)
    # Mini band marker
    if band == 'LONG':
        d.line((cx - px // 5, cy + px // 6, cx + px // 5, cy + px // 6), fill=WHITE, width=max(2, px // 24))
        d.line((cx, cy + px // 12, cx, cy + px // 4), fill=WHITE, width=max(2, px // 24))
    else:
        d.ellipse((cx - px // 10, cy + px // 8, cx + px // 10, cy + px // 4), fill=WHITE)
    return img


def render_aoe_icon(aoe_type: str, radius: int, style: str = 'orb', size_units: float = 2.35) -> Image.Image:
    del style
    img = Image.new('RGBA', (xy(size_units, size_units)[0],) * 2, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    px = img.width
    _draw_orb(d, px, AOE_FILL)
    cx, cy = px // 2, px // 2
    pad = px // 5
    kind = AOE_ICON_KIND.get(aoe_type, 'other')
    w = max(2, px // 28)

    if kind == 'melee':
        d.polygon([(cx, pad), (px - pad, cy), (cx, px - pad), (pad, cy)], outline=WHITE, width=w)
    elif kind == 'ranged':
        d.line((pad, cy, px - pad - 8, cy), fill=WHITE, width=w + 1)
        d.polygon([(px - pad - 6, cy), (px - pad - 14, cy - 7), (px - pad - 14, cy + 7)], fill=WHITE)
    elif kind == 'burst':
        d.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), outline=WHITE, width=w)
        d.ellipse((cx - 12, cy - 12, cx + 12, cy + 12), outline=WHITE, width=w)
        if radius > 1:
            d.ellipse((cx - 16, cy - 16, cx + 16, cy + 16), outline=WHITE, width=w)
    elif kind == 'aura':
        d.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=WHITE)
        rr = 10 + int(radius) * 4
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=WHITE, width=w)
    elif kind == 'line':
        d.line((pad, cy, px - pad, cy), fill=WHITE, width=w + 1)
        for x in range(pad + 6, px - pad, max(10, px // 5)):
            d.polygon([(x, cy), (x + 7, cy - 5), (x + 7, cy + 5)], fill=WHITE)
    elif kind == 'overhead':
        d.arc((pad, pad, px - pad, cy), 200, 340, fill=WHITE, width=w + 1)
    else:
        d.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), outline=WHITE, width=w)

    if radius > 0 and kind not in ('aura', 'burst'):
        badge_r = px // 7
        bx, by = px - pad - badge_r, pad + badge_r
        d.ellipse((bx - badge_r, by - badge_r, bx + badge_r, by + badge_r), fill=WHITE, outline=INK, width=2)
        _text_centered(d, (bx, by), str(radius), _font(px // 7), INK)
    return img
