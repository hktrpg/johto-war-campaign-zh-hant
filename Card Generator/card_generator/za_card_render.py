"""ZA range / AOE — unified circular badges on move strips."""

from __future__ import annotations

from config import ZA_BADGE_STYLE
from utils import xy
from za_board_icons import render_aoe_icon, render_range_icon
from za_move_data import resolve_za_for_card

ORB_SIZE = 2.45
ORB_Y = 4.55  # raised above archetype footer so orbs are not clipped by card frame


def add_za_badge(img, stats, style: str | None = None) -> bool:
    """Left = range (teal/orange orb + tiles); right = AOE (violet orb). Drawn last."""
    badge_style = style or ZA_BADGE_STYLE
    za = resolve_za_for_card(stats)
    band = za.get('za_distance_band', 'SHORT')
    tiles = int(za.get('za_board_range', 2) or 2)
    aoe = za.get('za_aoe_type', 'MELEE')
    radius = int(za.get('za_aoe_radius', 0) or 0)

    range_icon = render_range_icon(band, tiles, badge_style, size_units=ORB_SIZE)
    aoe_icon = render_aoe_icon(aoe, radius, badge_style, size_units=ORB_SIZE)

    img.paste(range_icon, xy(0.08, ORB_Y), range_icon)
    img.paste(aoe_icon, xy(14.5 - ORB_SIZE - 0.08, ORB_Y), aoe_icon)
    return True
