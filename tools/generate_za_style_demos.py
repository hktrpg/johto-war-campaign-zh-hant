#!/usr/bin/env python3
"""Export ZA taxonomy + render move-strip style comparison demos."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / 'Card Generator' / 'card_generator'
sys.path.insert(0, str(GEN))

from config import POKEMON_MOVES_OUTPUT_DIR  # noqa: E402
from za_move_data import (  # noqa: E402
    AOE_TYPE_ZH,
    DISTANCE_BAND_ZH,
    LOOKUP_PATH,
)
import generate_pokemon_moves  # noqa: E402
from za_card_render import add_za_badge  # noqa: E402

STYLES = ['orb']
OUT_DIR = ROOT / 'demo_cards' / 'za_badge_styles'
TAXONOMY_PATH = ROOT / 'Card Generator' / 'data' / 'za_board_taxonomy.json'

# One move per major AOE family (Chinese names from cube)
SAMPLE_MOVE_NAMES = [
    '藤鞭',      # MELEE short
    '噴射火焰',    # RANGED long
    '污泥炸彈',    # RANGED + status
    '終極衝擊',    # SELF_ORIGIN + RECHARGE
    '地震',       # AOE_CENTER
]


def build_taxonomy() -> dict:
    lookup = json.loads(LOOKUP_PATH.read_text(encoding='utf-8'))
    combos: Counter = Counter()
    for v in lookup.values():
        combos[(v['za_distance_band'], v['za_board_range'], v['za_aoe_type'], v.get('za_aoe_radius', 0))] += 1

    aoe_types = sorted({v['za_aoe_type'] for v in lookup.values()})
    bands = sorted({v['za_distance_band'] for v in lookup.values()})
    ranges = sorted({v['za_board_range'] for v in lookup.values()})
    radii = sorted({v.get('za_aoe_radius', 0) for v in lookup.values()})

    return {
        'lookup_entries': len(lookup),
        'unique_combos': len(combos),
        'distance_bands': [{'id': b, 'zh': DISTANCE_BAND_ZH.get(b, b)} for b in bands],
        'board_range_tiles': ranges,
        'aoe_types': [{'id': t, 'zh': AOE_TYPE_ZH.get(t, t)} for t in aoe_types],
        'aoe_radius_values': radii,
        'combo_count_top': [
            {
                'distance_band': k[0],
                'board_range': k[1],
                'aoe_type': k[2],
                'aoe_radius': k[3],
                'count': c,
                'range_icon': f"{DISTANCE_BAND_ZH.get(k[0], k[0])}{k[1]}",
                'aoe_icon': f"{AOE_TYPE_ZH.get(k[2], k[2])}" + (f"·半徑{k[3]}" if k[3] else ''),
            }
            for k, c in combos.most_common(24)
        ],
        'badge_styles': STYLES,
        'placement': {
            'range': 'move_strip_bottom_left',
            'aoe': 'move_strip_bottom_right',
        },
    }


def render_move_strip(stats, style: str, out_path: Path) -> None:
    img = generate_pokemon_moves.get_base()
    generate_pokemon_moves.add_header(img, stats)
    generate_pokemon_moves.add_description(img, stats)
    generate_pokemon_moves.add_archetype_strip(img, stats)
    add_za_badge(img, stats, style=style)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)


def main() -> None:
    if not LOOKUP_PATH.is_file():
        print('Run: python tools/build_za_move_data.py')
        sys.exit(1)

    tax = build_taxonomy()
    TAXONOMY_PATH.parent.mkdir(parents=True, exist_ok=True)
    TAXONOMY_PATH.write_text(json.dumps(tax, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Taxonomy: {tax["unique_combos"]} combos -> {TAXONOMY_PATH}')

    moves_df = pd.read_excel(ROOT / 'Card Generator' / 'johto_cube.xlsx', sheet_name='moves')
    by_name = {str(r.move_name).strip(): r for _, r in moves_df.iterrows()}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for style in STYLES:
        style_dir = OUT_DIR / style
        style_dir.mkdir(parents=True, exist_ok=True)
        for name in SAMPLE_MOVE_NAMES:
            row = by_name.get(name)
            if row is None:
                continue
            safe = name.replace('/', '_')
            render_move_strip(row, style, style_dir / f'{safe}.png')
            # Also refresh canonical move output for default style
            if style == 'corner':
                render_move_strip(row, style, POKEMON_MOVES_OUTPUT_DIR / f'{name}.png')

    index = {
        'styles': STYLES,
        'samples': SAMPLE_MOVE_NAMES,
        'taxonomy': str(TAXONOMY_PATH.relative_to(ROOT)),
        'notes': 'Left icon = distance band + tiles; right icon = AOE shape + radius',
    }
    (OUT_DIR / 'README.json').write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Style demos -> {OUT_DIR}')


if __name__ == '__main__':
    main()
