"""Render ZA distance / AOE / d6 combat info on move strips and Pokémon card fronts."""

from PIL import ImageDraw

from config import DARK_COLOUR, WHITE_COLOUR
from utils import text_font, xy, wrapped_text
from za_move_data import parse_attack_dice_count, resolve_za_for_card


def _format_combat_label(za: dict, dice: int) -> str:
    aoe = za.get('za_aoe_zh', '—')
    radius = int(za.get('za_aoe_radius') or 0)
    if radius > 0:
        aoe = f'{aoe}·半徑{radius}'
    dist = za.get('za_distance_zh', '近距')
    tiles = za.get('za_board_range', 2)
    return f'{dist} {tiles}格 · {aoe} · {dice}d6'


def _draw_combat_bar(d, img, label: str, center_xy, width_units: float, height_units: float,
                     fill=(28, 36, 58, 235), accent=(255, 209, 102, 255), fallback: bool = False):
    cx, cy = center_xy
    bw, bh = xy(width_units, height_units)
    left = int(cx - bw / 2)
    top = int(cy - bh / 2)
    outline = (120, 128, 160) if fallback else DARK_COLOUR
    d.rounded_rectangle(
        (left, top, left + bw, top + bh),
        radius=10,
        fill=fill,
        outline=outline,
        width=2,
    )
    # Accent stripe for d6 segment (right side hint)
    stripe_w = int(bw * 0.22)
    d.rounded_rectangle(
        (left + bw - stripe_w, top + 2, left + bw - 2, top + bh - 2),
        radius=8,
        fill=accent,
    )
    text_fill = WHITE_COLOUR
    text_cx = cx - bw * 0.09
    wrapped_text(
        d,
        label,
        text_font(17, label),
        boundaries=(width_units - 3.4, height_units - 0.15),
        xy=(text_cx, cy),
        fill=text_fill,
        anchor='mm',
        align='center',
    )


def add_za_badge(img, stats) -> bool:
    """Draw D&D combat line (range, AOE, d6) under move name on move strip."""
    za = resolve_za_for_card(stats)
    dice = parse_attack_dice_count(stats)
    label = _format_combat_label(za, dice)
    d = ImageDraw.Draw(img)
    _draw_combat_bar(
        d,
        img,
        label,
        center_xy=xy(7.25, 2.42),
        width_units=13.8,
        height_units=0.62,
        fallback=bool(za.get('za_fallback')),
    )
    return True


def add_pokemon_dnd_combat_bar(img, stats) -> bool:
    """Slim combat summary on full Pokémon card front, above the move strip."""
    za = resolve_za_for_card(stats)
    dice = parse_attack_dice_count(stats)
    label = _format_combat_label(za, dice)
    if za.get('za_fallback'):
        label = f'（估）{label}'
    d = ImageDraw.Draw(img)
    _draw_combat_bar(
        d,
        img,
        label,
        center_xy=xy(8.0, 19.55),
        width_units=14.8,
        height_units=0.48,
        fill=(20, 26, 42, 245),
        fallback=bool(za.get('za_fallback')),
    )
    return True
