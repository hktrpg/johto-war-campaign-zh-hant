"""Render ZA distance / AOE badge on move card images."""

from PIL import ImageDraw

from config import DARK_COLOUR, WHITE_COLOUR
from utils import text_font, xy, wrapped_text
from za_move_data import get_za_stats, has_za_data


def add_za_badge(img, stats) -> bool:
    """Draw ZA range + AOE line under move name. Returns True if drawn."""
    if not has_za_data():
        return False

    move_name_en = getattr(stats, 'move_name_en', None)
    za = get_za_stats(str(stats.move_name), move_name_en)
    if not za:
        return False

    d = ImageDraw.Draw(img)
    label = f"{za['za_distance_zh']} {za['za_board_range']}格 · {za['za_aoe_zh']}"
    # Subtle badge background
    bx, by = xy(7.25, 2.35)
    bw, bh = xy(12.5, 0.55)
    left = int(bx - bw / 2)
    top = int(by - bh / 2)
    d.rounded_rectangle(
        (left, top, left + bw, top + bh),
        radius=8,
        fill=(230, 235, 245, 220),
        outline=DARK_COLOUR,
        width=2,
    )
    wrapped_text(
        d,
        label,
        text_font(18, label),
        boundaries=(12.0, 0.5),
        xy=(bx, by),
        fill=DARK_COLOUR,
        anchor='mm',
        align='center',
    )
    return True
