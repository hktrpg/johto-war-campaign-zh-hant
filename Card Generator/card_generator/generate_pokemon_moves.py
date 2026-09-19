import pandas as pd
from PIL import ImageDraw
from tqdm import tqdm

from config import *
from utils import xy, read_cube, get_img, wrapped_text, text_font, title_font, resolve_move_effect
from za_card_render import add_za_badge
from za_move_data import parse_attack_dice_count


def get_base():
    return get_img(CARD_ASSETS_DIR / 'move_base.png', xy(14.5, 7.5))


def _valid_arch(value) -> bool:
    return pd.notna(value) and str(value).strip() not in {'', 'nan', 'None'}


def _paste_archetype_asset(img, filename: str, pos, size) -> None:
    path = CARD_ASSETS_DIR / 'archetypes' / filename
    if not path.is_file():
        return
    type_img = get_img(path, size)
    img.paste(type_img, pos, type_img)


def add_header(img, stats):
    d = ImageDraw.Draw(img)

    # Move Type
    move_type = str(stats.move_type).strip().lower()
    type_img = get_img(CARD_ASSETS_DIR / 'types' / f'{move_type}.png', xy(2, 2))
    img.paste(type_img, xy(0.25, 0.25), type_img)

    # Move Name
    move_name = str(stats.move_name)
    wrapped_text(
        d, move_name, text_font(32, move_name), boundaries=(9.0, 1.45), xy=xy(7.25, 1.2),
        fill=DARK_COLOUR, anchor='mm', align='center',
    )

    # Move Attack Strength (= number of attack dice; always d6 in rules)
    if stats.move_attack_strength != "blank":
        dice = parse_attack_dice_count(stats)
        d.text(xy(13.25, 1.25), str(dice), fill=DARK_COLOUR, font=title_font(44), anchor='mm')

def add_archetype_strip(img, stats):
    d = ImageDraw.Draw(img)
    if str(stats.archetype_count) == "1" and _valid_arch(stats.archetype_1):
        _paste_archetype_asset(img, f'1_{stats.archetype_1}.png', xy(0, 6.36), xy(14.5, 1.15))
        text_fill = DARK_COLOUR if stats.archetype_1 in {"RECHARGE 1", "RECHARGE 2", "RECHARGE 3", "RECHARGE 4", "RECHARGE 5", "RECHARGE 6", "RECHARGE 7", "RECHARGE 8", "RECHARGE 9", "SONG", "PROTECT"} else WHITE_COLOUR
        d.text(xy(7.25, 6.91), str(stats.archetype_1), font=title_font(26), fill=text_fill, anchor='mm')

    elif str(stats.archetype_count) == "2" and _valid_arch(stats.archetype_1) and _valid_arch(stats.archetype_2):
        _paste_archetype_asset(img, f'21_{stats.archetype_1}.png', xy(0, 6.36), xy(7.2, 1.15))
        _paste_archetype_asset(img, f'22_{stats.archetype_2}.png', xy(7.31, 6.36), xy(7.2, 1.15))
        text_fill = DARK_COLOUR if stats.archetype_1 in {"RECHARGE 1", "RECHARGE 2", "RECHARGE 3", "RECHARGE 4", "RECHARGE 5", "RECHARGE 6", "RECHARGE 7", "RECHARGE 8", "RECHARGE 9", "SONG", "PROTECT"} else WHITE_COLOUR
        d.text(xy(3.87, 6.91), str(stats.archetype_1), font=title_font(23.5), fill=text_fill, anchor='mm')
        text_fill = DARK_COLOUR if stats.archetype_2 in {"RECHARGE 1", "RECHARGE 2", "RECHARGE 3", "RECHARGE 4", "RECHARGE 5", "RECHARGE 6", "RECHARGE 7", "RECHARGE 8", "RECHARGE 9", "SONG", "PROTECT"} else WHITE_COLOUR
        d.text(xy(10.63, 6.91), str(stats.archetype_2), font=title_font(23.5), fill=text_fill, anchor='mm')

    elif str(stats.archetype_count) == "3" and all(_valid_arch(a) for a in (stats.archetype_1, stats.archetype_2, stats.archetype_3)):
        _paste_archetype_asset(img, f'31_{stats.archetype_1}.png', xy(0, 6.36), xy(4.8, 1.15))
        _paste_archetype_asset(img, f'32_{stats.archetype_2}.png', xy(4.8575, 6.36), xy(4.8, 1.15))
        _paste_archetype_asset(img, f'33_{stats.archetype_3}.png', xy(9.71, 6.36), xy(4.8, 1.15))
        archetypes = [stats.archetype_1, stats.archetype_2, stats.archetype_3]
        positions = [(2.58, 6.91), (7.25, 6.91), (11.92, 6.91)]
        for archetype, (x, y) in zip(archetypes, positions):
            text_fill = DARK_COLOUR if archetype in {"RECHARGE 1", "RECHARGE 2", "RECHARGE 3", "RECHARGE 4", "RECHARGE 5", "RECHARGE 6", "RECHARGE 7", "RECHARGE 8", "RECHARGE 9", "SONG", "PROTECT"} else WHITE_COLOUR
            d.text(xy(x, y), str(archetype), font=title_font(17), fill=text_fill, anchor='mm')


def add_description(img, stats):
    d = ImageDraw.Draw(img)

    effect = resolve_move_effect(stats)
    if not effect:
        return
    if str(stats.archetype_count) in {"1", "2", "3"}:
        wrapped_text(d, effect, text_font(28, effect), boundaries=(13.5, 3.6), xy=xy(7.25, 4.27), fill=DARK_COLOUR,
                     anchor='mm', align='center')
    else:
        wrapped_text(d, effect, text_font(28, effect), boundaries=(13.5, 4.5), xy=xy(7.25, 4.75), fill=DARK_COLOUR,
                     anchor='mm', align='center')


def generate_moves(overwrite):
    print('Generating moves:')
    POKEMON_MOVES_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    df = read_cube(sheet_name='moves')
    for _, stats in tqdm(df.iterrows(), total=df.shape[0]):
        output_path = POKEMON_MOVES_OUTPUT_DIR / f'{stats.move_name}.png'
        if output_path.is_file() and not overwrite:
            continue

        img = get_base()
        add_header(img, stats)
        add_description(img, stats)
        add_archetype_strip(img, stats)
        add_za_badge(img, stats)
        img.save(output_path)


def generate_card_backs(overwrite):
    print('Generating card backs:')
    POKEMON_CARD_BACKS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    df = read_cube(sheet_name='moves')
    for _, stats in tqdm(df.iterrows(), total=df.shape[0]):
        output_path = POKEMON_CARD_BACKS_OUTPUT_DIR / f'{stats.move_name}.png'
        if output_path.is_file() and not overwrite:
            continue

        img = get_img(CARD_ASSETS_DIR / 'card_backs' / f'standard.png', xy(16, 28))
        move_img = get_img(POKEMON_MOVES_OUTPUT_DIR / f'{stats.move_name}.png', xy(14.5, 7.5))
        img.paste(move_img, xy(0.75, 19.75), move_img)
        img.save(output_path)


def run(overwrite=True):
    generate_moves(overwrite)
    generate_card_backs(overwrite)


if __name__ == '__main__':
    run(overwrite=True)
