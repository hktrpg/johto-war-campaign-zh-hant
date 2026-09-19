"""Programmatic ZA board icons for move strips (range bottom-left, AOE bottom-right)."""

from __future__ import annotations

from PIL import Image, ImageDraw, ImageFont

from config import CARD_ASSETS_DIR, DARK_COLOUR
from utils import xy

# Visual vocabulary (7 AOE families used in lookup; OTHER/TRAP rare).
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

STYLE_PALETTES = {
    'corner': {
        'short': (78, 205, 196),
        'long': (255, 159, 67),
        'aoe': (108, 122, 224),
        'bg': (255, 255, 255, 230),
        'border': DARK_COLOUR,
    },
    'chip': {
        'short': (46, 134, 193),
        'long': (211, 84, 0),
        'aoe': (142, 68, 173),
        'bg': (245, 247, 250, 240),
        'border': (55, 65, 81),
    },
    'minimal': {
        'short': (90, 90, 90),
        'long': (90, 90, 90),
        'aoe': (90, 90, 90),
        'bg': (255, 255, 255, 0),
        'border': (60, 60, 60),
    },
    'dual-tone': {
        'short': (39, 174, 96),
        'long': (231, 76, 60),
        'aoe': (52, 73, 94),
        'bg': (28, 36, 58, 220),
        'border': (200, 210, 230),
    },
}


def _font(size: int):
    path = CARD_ASSETS_DIR / 'fonts' / 'Barlow-Bold.ttf'
    if path.is_file():
        return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def _new_icon_canvas(size_units: float = 2.0) -> tuple[Image.Image, ImageDraw.ImageDraw, int]:
    px = xy(size_units, size_units)[0]
    img = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img), px


def _draw_range_glyph(d: ImageDraw.ImageDraw, px: int, band: str, tiles: int, pal: dict, style: str):
    color = pal['short'] if band == 'SHORT' else pal['long']
    pad = px // 8
    if style == 'minimal':
        d.rectangle((pad, pad, px - pad, px - pad), outline=color, width=2)
    else:
        d.rounded_rectangle((pad, pad, px - pad, px - pad), radius=px // 6, fill=pal['bg'], outline=pal['border'], width=2)
    # Crosshair for LONG, bracket for SHORT
    cx, cy = px // 2, px // 2
    if band == 'LONG':
        d.line((pad + 4, cy, px - pad - 4, cy), fill=color, width=2)
        d.line((cx, pad + 4, cx, px - pad - 4), fill=color, width=2)
        d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), outline=color, width=2)
    else:
        d.line((pad + 6, cy + 6, cx - 2, cy - 2), fill=color, width=3)
        d.ellipse((cx - 4, cy - 10, cx + 4, cy - 2), fill=color)

    # Tile count (large); band is color + glyph only (no CJK — survives all fonts).
    d.text((px - pad - (px // 3), px - pad - (px // 3)), str(tiles), fill=color, font=_font(px // 3))


def _draw_aoe_glyph(d: ImageDraw.ImageDraw, px: int, aoe_type: str, radius: int, pal: dict, style: str):
    color = pal['aoe']
    pad = px // 8
    if style != 'minimal':
        d.rounded_rectangle((pad, pad, px - pad, px - pad), radius=px // 6, fill=pal['bg'], outline=pal['border'], width=2)
    cx, cy = px // 2, px // 2
    kind = AOE_ICON_KIND.get(aoe_type, 'other')

    if kind == 'melee':
        d.polygon([(cx, pad + 8), (px - pad - 8, cy), (cx, px - pad - 8), (pad + 8, cy)], outline=color, width=2)
    elif kind == 'ranged':
        d.line((pad + 6, cy, px - pad - 10, cy), fill=color, width=3)
        d.polygon([(px - pad - 10, cy), (px - pad - 18, cy - 6), (px - pad - 18, cy + 6)], fill=color)
    elif kind == 'burst':
        for r in range(1, max(2, radius + 1)):
            rr = 6 + r * 5
            d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=color, width=2)
    elif kind == 'aura':
        d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=color)
        rr = 8 + radius * 4
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=color, width=2)
    elif kind == 'line':
        d.line((pad + 4, cy, px - pad - 4, cy), fill=color, width=3)
        for x in range(pad + 8, px - pad, 12):
            d.polygon([(x, cy), (x + 6, cy - 4), (x + 6, cy + 4)], fill=color)
    elif kind == 'overhead':
        d.arc((pad + 4, pad + 4, px - pad - 4, cy), 180, 0, fill=color, width=3)
        d.ellipse((cx - 4, cy, cx + 4, cy + 8), fill=color)
    elif kind == 'trap':
        d.rectangle((pad + 8, cy, px - pad - 8, cy + 6), outline=color, width=2)
        d.line((pad + 8, cy, px - pad - 8, cy + 6), fill=color, width=2)
        d.line((px - pad - 8, cy, pad + 8, cy + 6), fill=color, width=2)
    else:
        d.text((cx - 4, cy - 6), '?', fill=color, font=_font(px // 3))

    if radius > 0 and kind not in ('burst', 'aura'):
        d.text((px - pad - (px // 4), pad + 2), f'r{radius}', fill=color, font=_font(px // 5))
    elif kind in ('burst', 'aura') and radius > 0:
        d.text((px - pad - (px // 4), pad + 2), str(radius), fill=color, font=_font(px // 5))


def render_range_icon(band: str, tiles: int, style: str = 'corner', size_units: float = 2.0) -> Image.Image:
    pal = STYLE_PALETTES.get(style, STYLE_PALETTES['corner'])
    img, d, px = _new_icon_canvas(size_units)
    _draw_range_glyph(d, px, band, max(1, min(6, int(tiles))), pal, style)
    return img


def render_aoe_icon(aoe_type: str, radius: int, style: str = 'corner', size_units: float = 2.0) -> Image.Image:
    pal = STYLE_PALETTES.get(style, STYLE_PALETTES['corner'])
    img, d, px = _new_icon_canvas(size_units)
    _draw_aoe_glyph(d, px, aoe_type, int(radius or 0), pal, style)
    return img
