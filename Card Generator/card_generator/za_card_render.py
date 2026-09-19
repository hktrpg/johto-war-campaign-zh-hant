"""Render ZA distance / AOE on move strips (once per card; attack dice count is separate)."""

from PIL import ImageDraw

from config import DARK_COLOUR, WHITE_COLOUR
from utils import text_font, xy, wrapped_text
from za_move_data import resolve_za_for_card


def _format_range_aoe_label(za: dict) -> str:
    aoe = za.get('za_aoe_zh', '—')
    radius = int(za.get('za_aoe_radius') or 0)
    if radius > 0:
        aoe = f'{aoe}·半徑{radius}'
    dist = za.get('za_distance_zh', '近距')
    tiles = za.get('za_board_range', 2)
    return f'{dist} {tiles}格 · {aoe}'


def _draw_range_bar(d, label: str, center_xy, width_units: float, height_units: float, fallback: bool = False):
    cx, cy = center_xy
    bw, bh = xy(width_units, height_units)
    left = int(cx - bw / 2)
    top = int(cy - bh / 2)
    outline = (120, 128, 160) if fallback else DARK_COLOUR
    d.rounded_rectangle(
        (left, top, left + bw, top + bh),
        radius=10,
        fill=(28, 36, 58, 235),
        outline=outline,
        width=2,
    )
    wrapped_text(
        d,
        label,
        text_font(17, label),
        boundaries=(width_units - 0.8, height_units - 0.15),
        xy=(cx, cy),
        fill=WHITE_COLOUR,
        anchor='mm',
        align='center',
    )


def add_za_badge(img, stats) -> bool:
    """Draw range + AOE once under move name on the move strip."""
    za = resolve_za_for_card(stats)
    label = _format_range_aoe_label(za)
    if za.get('za_fallback'):
        label = f'（估）{label}'
    d = ImageDraw.Draw(img)
    _draw_range_bar(
        d,
        label,
        center_xy=xy(7.25, 2.42),
        width_units=13.8,
        height_units=0.62,
        fallback=bool(za.get('za_fallback')),
    )
    return True
