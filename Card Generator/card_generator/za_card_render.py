"""ZA range / AOE markers on move strips (corner icons)."""

from __future__ import annotations

from config import ZA_BADGE_STYLE
from za_board_icons import render_aoe_icon, render_range_icon
from za_move_data import resolve_za_for_card
from utils import xy


def add_za_badge(img, stats, style: str | None = None) -> bool:
    """Bottom-left = range band + tiles; bottom-right = AOE type + radius."""
    badge_style = style or ZA_BADGE_STYLE
    za = resolve_za_for_card(stats)
    band = za.get('za_distance_band', 'SHORT')
    tiles = int(za.get('za_board_range', 2) or 2)
    aoe = za.get('za_aoe_type', 'MELEE')
    radius = int(za.get('za_aoe_radius', 0) or 0)

    size = 1.85 if badge_style == 'minimal' else 2.0
    range_icon = render_range_icon(band, tiles, badge_style, size_units=size)
    aoe_icon = render_aoe_icon(aoe, radius, badge_style, size_units=size)

    # Move strip coords (14.5 × 7.5): sit above archetype strip, flush to corners.
    y = 6.2
    img.paste(range_icon, xy(0.15, y), range_icon)
    img.paste(aoe_icon, xy(14.5 - size - 0.15, y), aoe_icon)
    return True
