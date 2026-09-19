#!/usr/bin/env python3
"""Generate a small set of Pokémon card fronts for D&D combat field demo."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / 'Card Generator' / 'card_generator'
sys.path.insert(0, str(GEN))

from config import POKEMON_CARD_FRONTS_OUTPUT_DIR, POKEMON_MOVES_OUTPUT_DIR  # noqa: E402
import generate_pokemon_moves  # noqa: E402
import generate_pokemon_front  # noqa: E402

# Cube row indices — diverse types / attack strengths / ZA coverage
DEMO_ROW_INDICES = [0, 20, 24, 32, 44, 92, 224, 308, 477, 498]

DEMO_OUTPUT_DIR = GEN / 'output' / 'pokemon' / 'demo'
REPO_DEMO_DIR = ROOT / 'demo_cards' / 'dnd_pokemon'


def generate_demo(overwrite: bool = True) -> list[Path]:
    moves_df = pd.read_excel(ROOT / 'Card Generator' / 'johto_cube.xlsx', sheet_name='moves')
    poke_df = pd.read_excel(ROOT / 'Card Generator' / 'johto_cube.xlsx', sheet_name='pokemon')

    move_names = set()
    for idx in DEMO_ROW_INDICES:
        move_names.add(str(poke_df.iloc[idx]['move_name']).strip())

    POKEMON_MOVES_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for _, stats in moves_df.iterrows():
        name = str(stats.move_name).strip()
        if name not in move_names:
            continue
        out = POKEMON_MOVES_OUTPUT_DIR / f'{name}.png'
        if out.is_file() and not overwrite:
            continue
        img = generate_pokemon_moves.get_base()
        generate_pokemon_moves.add_header(img, stats)
        generate_pokemon_moves.add_za_badge(img, stats)
        generate_pokemon_moves.add_description(img, stats)
        img.save(out)

    POKEMON_CARD_FRONTS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    DEMO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest = []
    written: list[Path] = []

    for idx in DEMO_ROW_INDICES:
        stats = poke_df.iloc[idx]
        front_name = f'{idx}_{str(stats.pokedex_name).lower()}.png'
        front_path = POKEMON_CARD_FRONTS_OUTPUT_DIR / front_name

        img = generate_pokemon_front.compose_base(stats)
        generate_pokemon_front.add_frame(img)
        generate_pokemon_front.add_pokemon_img(img, stats)
        generate_pokemon_front.add_trainer(img, stats)
        generate_pokemon_front.add_all_bases(img, stats)
        generate_pokemon_front.add_all_icons(img, stats)
        generate_pokemon_front.add_text(img, stats)
        generate_pokemon_front.add_move(img, stats)
        generate_pokemon_front.add_emblem(img)
        img.save(front_path)

        demo_name = f'demo_{idx:04d}_{stats.pokedex_name}.png'
        demo_path = DEMO_OUTPUT_DIR / demo_name
        shutil.copy2(front_path, demo_path)
        written.append(demo_path)
        manifest.append({
            'row': int(idx),
            'name': str(stats.pokedex_name),
            'move': str(stats.move_name),
            'attack_dice': str(stats.move_attack_strength),
            'file': demo_name,
        })

    manifest_path = DEMO_OUTPUT_DIR / 'manifest.json'
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    REPO_DEMO_DIR.mkdir(parents=True, exist_ok=True)
    for p in written:
        shutil.copy2(p, REPO_DEMO_DIR / p.name)
    shutil.copy2(manifest_path, REPO_DEMO_DIR / 'manifest.json')

    return written


def main() -> None:
    paths = generate_demo(overwrite=True)
    print(f'Wrote {len(paths)} demo cards -> {DEMO_OUTPUT_DIR}')
    for p in paths:
        print(f'  {p.name}')


if __name__ == '__main__':
    main()
