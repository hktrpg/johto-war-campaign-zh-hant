#!/usr/bin/env python3
"""Build ZA move lookup JSON from johto cubes + projectpokemon waza_param_array."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'Card Generator' / 'card_generator'))

from za_move_data import (  # noqa: E402
    LOOKUP_PATH,
    WAZA_PARAM_PATH,
    _params_by_waza_id,
    build_entry_from_param,
)

POKEAPI_CACHE = ROOT / 'Card Generator' / 'data' / 'pokeapi_moves.json'


def load_pokeapi_names() -> dict[int, str]:
    if POKEAPI_CACHE.is_file():
        raw = json.loads(POKEAPI_CACHE.read_text(encoding='utf-8'))
        return {int(k): v for k, v in raw.items()}

    import requests

    moves: dict[int, str] = {}
    for i in range(1, 921):
        try:
            r = requests.get(f'https://pokeapi.co/api/v2/move/{i}/', timeout=8)
            if r.ok:
                moves[i] = r.json()['name'].replace('-', ' ').title()
        except Exception:
            pass
    POKEAPI_CACHE.parent.mkdir(parents=True, exist_ok=True)
    POKEAPI_CACHE.write_text(json.dumps(moves), encoding='utf-8')
    return moves


def main() -> None:
    if not WAZA_PARAM_PATH.is_file():
        print(f'Missing {WAZA_PARAM_PATH}. Run from repo root after downloading ZA data.')
        sys.exit(1)

    params = _params_by_waza_id()
    poke_names = load_pokeapi_names()
    name_to_id = {v: k for k, v in poke_names.items()}

    eng = pd.read_excel(ROOT / 'Card Generator' / 'johto_cube_ENG.xlsx', sheet_name='moves')
    zh = pd.read_excel(ROOT / 'Card Generator' / 'johto_cube.xlsx', sheet_name='moves')

    lookup: dict[str, dict] = {}
    matched = 0
    for _, row in eng.iterrows():
        en_name = str(row['move_name']).strip()
        waza_id = name_to_id.get(en_name)
        if waza_id is None or waza_id not in params:
            continue
        entry = build_entry_from_param(params[waza_id], en_name)
        lookup[en_name] = entry
        matched += 1

    # Mirror Chinese names from aligned rows.
    for i in range(min(len(eng), len(zh))):
        en_name = str(eng.iloc[i]['move_name']).strip()
        zh_name = str(zh.iloc[i]['move_name']).strip()
        if en_name in lookup and zh_name:
            lookup[zh_name] = {**lookup[en_name], 'move_name_zh': zh_name}

    LOOKUP_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOOKUP_PATH.write_text(json.dumps(lookup, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {len(lookup)} entries ({matched} EN matches) -> {LOOKUP_PATH}')

    # Optional: write board-battle export.
    board_path = ROOT / 'board_battle' / 'data' / 'moves.json'
    board_path.parent.mkdir(parents=True, exist_ok=True)
    board_export = []
    for i in range(min(len(eng), len(zh))):
        en_name = str(eng.iloc[i]['move_name']).strip()
        zh_name = str(zh.iloc[i]['move_name']).strip()
        if zh_name not in lookup:
            continue
        za = lookup[zh_name]
        board_export.append({
            'name': zh_name,
            'name_en': en_name,
            'type': str(zh.iloc[i]['move_type']),
            'power': zh.iloc[i]['move_attack_strength'],
            'distance_band': za['za_distance_band'],
            'range_tiles': za['za_board_range'],
            'aoe_type': za['za_aoe_type'],
            'aoe_radius': za['za_aoe_radius'],
            'distance_zh': za['za_distance_zh'],
            'aoe_zh': za['za_aoe_zh'],
        })
    board_path.write_text(json.dumps(board_export, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Board battle export: {len(board_export)} moves -> {board_path}')

    # Starter roster: one row per unique pokedex + move combo with ZA data.
    moves_by_name = {m['name']: m for m in board_export}
    poke = pd.read_excel(ROOT / 'Card Generator' / 'johto_cube.xlsx', sheet_name='pokemon')
    roster = []
    seen = set()
    for _, row in poke.iterrows():
        move_name = str(row.get('move_name', '')).strip()
        if not move_name or move_name not in moves_by_name:
            continue
        key = (str(row['pokedex_name']).strip(), move_name)
        if key in seen:
            continue
        seen.add(key)
        move = moves_by_name[move_name]
        roster.append({
            'name': key[0],
            'move': move_name,
            'move_en': move['name_en'],
            'type': str(row.get('type_1', move['type'])),
            'health': int(row['health']) if str(row['health']).isdigit() else 5,
            'initiative': int(row['initiative']) if str(row['initiative']).isdigit() else 5,
            'power': move['power'],
            'distance_band': move['distance_band'],
            'range_tiles': move['range_tiles'],
            'aoe_type': move['aoe_type'],
            'aoe_radius': move['aoe_radius'],
            'distance_zh': move['distance_zh'],
            'aoe_zh': move['aoe_zh'],
        })
        if len(roster) >= 48:
            break

    roster_path = ROOT / 'board_battle' / 'data' / 'pokemon_roster.json'
    roster_path.write_text(json.dumps(roster, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Board roster: {len(roster)} pokemon -> {roster_path}')


if __name__ == '__main__':
    main()
