#!/usr/bin/env python3
"""Build ZA move lookup JSON and board-battle data exports."""

from __future__ import annotations

import json
import re
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
BOARD_DATA = ROOT / 'board_battle' / 'data'
SPRITE_SRC = ROOT / 'Card Generator' / 'generator_assets' / 'pokemon'
SPRITE_DST = ROOT / 'board_battle' / 'assets' / 'pokemon'
TRAINER_SPRITE_SRC = ROOT / 'Card Generator' / 'generator_assets' / 'trainers'
TRAINER_SPRITE_DST = ROOT / 'board_battle' / 'assets' / 'trainers'

TRAINER_ZH = {
    'Falkner': '阿速', 'Bugsy': '阿筆', 'Whitney': '小茜', 'Morty': '松葉',
    'Chuck': '阿四', 'Jasmine': '阿蜜', 'Pryce': '柳伯', 'Clair': '小椿',
    'Cyrus': '赤日', 'Lance': '阿渡', 'Colress': '阿庫羅瑪',
}

DEFAULT_MATCH_TRAINERS = ['Falkner', 'Bugsy', 'Whitney', 'Morty', 'Chuck', 'Jasmine']
PARTY_SIZE_PER_TRAINER = 3  # 1–4 allowed per trainer in export


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


def format_pokedex_number(value) -> str:
    parts = str(value).split('-')
    if parts[0].isdigit():
        parts[0] = f'{int(parts[0]):03}'
    return '-'.join(parts)


def norm_type(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ''
    return str(value).strip().lower()


def parse_power(value) -> int:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return 1
    text = str(value).strip().lower()
    if text in {'', 'blank', 'nan', 'none'}:
        return 1
    try:
        return max(1, int(float(text)))
    except ValueError:
        return 1


def default_za(move_type: str) -> dict:
    return {
        'distance_band': 'SHORT',
        'range_tiles': 2,
        'aoe_type': 'MELEE',
        'aoe_radius': 0,
        'distance_zh': '近距',
        'aoe_zh': '單體近戰',
        'type': move_type,
    }


def move_record(zh_row, en_name: str | None, za: dict | None) -> dict:
    move_type = norm_type(zh_row['move_type'])
    z = za or default_za(move_type)
    return {
        'name': str(zh_row['move_name']).strip(),
        'name_en': en_name or '',
        'type': move_type,
        'power': parse_power(zh_row['move_attack_strength']),
        'effect': str(zh_row['move_effect']).strip() if pd.notna(zh_row.get('move_effect')) else '',
        'distance_band': z.get('za_distance_band', z.get('distance_band', 'SHORT')),
        'range_tiles': z.get('za_board_range', z.get('range_tiles', 2)),
        'aoe_type': z.get('za_aoe_type', z.get('aoe_type', 'MELEE')),
        'aoe_radius': z.get('za_aoe_radius', z.get('aoe_radius', 0)),
        'distance_zh': z.get('za_distance_zh', z.get('distance_zh', '近距')),
        'aoe_zh': z.get('za_aoe_zh', z.get('aoe_zh', '單體近戰')),
    }


def can_learn(learner_types: list[str], teacher_move_type: str) -> bool:
    return teacher_move_type in learner_types


def build_learned_moves(signature: dict, teammates: list[dict], learnable_types: list[str]) -> list[dict]:
    learned: list[dict] = []
    for mate in teammates:
        if mate['id'] == signature['id']:
            continue
        move = mate['signature_move']
        if move['name'] == signature['signature_move']['name']:
            continue
        if not can_learn(learnable_types, move['type']):
            continue
        if any(m['name'] == move['name'] for m in learned):
            continue
        learned.append({
            **move,
            'learned_from': mate['name'],
            'slot_label': f"來自{mate['name']}",
        })
        if len(learned) >= 3:
            break
    return learned


def pokemon_entry_from_row(row, moves_by_name: dict, pid: int) -> dict:
    learnable = [norm_type(row[c]) for c in ('move_1', 'move_2', 'move_3', 'move_4') if norm_type(row[c])]
    name = str(row['move_name']).strip()
    sig = moves_by_name.get(name) or move_record(row, None, None)
    sprite = format_pokedex_number(row['pokedex_number'])
    card_health = int(row['health']) if str(row['health']).isdigit() else 5
    return {
        'id': pid,
        'pokedex_number': str(row['pokedex_number']),
        'sprite': f'{sprite}.png',
        'name': str(row['pokedex_name']).strip(),
        'internal_name': str(row['internal_name']).strip(),
        'type_1': norm_type(row['type_1']),
        'type_2': norm_type(row['type_2']),
        'types': [t for t in (norm_type(row['type_1']), norm_type(row['type_2'])) if t],
        'learnable_types': learnable,
        'initiative': int(row['initiative']) if str(row['initiative']).isdigit() else 5,
        'health': card_health,
        'signature_move': sig,
        'learned_moves': [],
    }


def apply_party_learning(party: list[dict]) -> None:
    for mon in party:
        mon['learned_moves'] = build_learned_moves(mon, party, mon['learnable_types'])


def export_trainer_sprites(trainer_names: list[str]) -> None:
    TRAINER_SPRITE_DST.mkdir(parents=True, exist_ok=True)
    if not TRAINER_SPRITE_SRC.is_dir():
        return
    for name in trainer_names:
        src = TRAINER_SPRITE_SRC / f'{name}.png'
        dst = TRAINER_SPRITE_DST / f'{name}.png'
        if src.is_file() and not dst.exists():
            try:
                dst.symlink_to(src.resolve())
            except OSError:
                import shutil
                shutil.copy2(src, dst)


def export_sprites_used(pokemon_entries: list[dict]) -> None:
    SPRITE_DST.mkdir(parents=True, exist_ok=True)
    if not SPRITE_SRC.is_dir():
        return
    for entry in pokemon_entries:
        sprite = entry['sprite']
        src = SPRITE_SRC / sprite
        dst = SPRITE_DST / sprite
        if src.is_file() and not dst.exists():
            try:
                dst.symlink_to(src.resolve())
            except OSError:
                import shutil
                shutil.copy2(src, dst)


def main() -> None:
    if not WAZA_PARAM_PATH.is_file():
        print(f'Missing {WAZA_PARAM_PATH}.')
        sys.exit(1)

    params = _params_by_waza_id()
    poke_names = load_pokeapi_names()
    name_to_id = {v: k for k, v in poke_names.items()}

    eng_moves = pd.read_excel(ROOT / 'Card Generator' / 'johto_cube_ENG.xlsx', sheet_name='moves')
    zh_moves = pd.read_excel(ROOT / 'Card Generator' / 'johto_cube.xlsx', sheet_name='moves')

    lookup: dict[str, dict] = {}
    matched = 0
    for _, row in eng_moves.iterrows():
        en_name = str(row['move_name']).strip()
        waza_id = name_to_id.get(en_name)
        if waza_id is None or waza_id not in params:
            continue
        entry = build_entry_from_param(params[waza_id], en_name)
        lookup[en_name] = entry
        matched += 1

    for i in range(min(len(eng_moves), len(zh_moves))):
        en_name = str(eng_moves.iloc[i]['move_name']).strip()
        zh_name = str(zh_moves.iloc[i]['move_name']).strip()
        if en_name in lookup and zh_name:
            lookup[zh_name] = {**lookup[en_name], 'move_name_zh': zh_name}

    LOOKUP_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOOKUP_PATH.write_text(json.dumps(lookup, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {len(lookup)} entries ({matched} EN matches) -> {LOOKUP_PATH}')

    # All moves for board battle (ZA when available).
    moves_by_name: dict[str, dict] = {}
    for i in range(min(len(eng_moves), len(zh_moves))):
        zh_row = zh_moves.iloc[i]
        en_name = str(eng_moves.iloc[i]['move_name']).strip()
        zh_name = str(zh_row['move_name']).strip()
        za = lookup.get(zh_name)
        rec = move_record(zh_row, en_name, za)
        moves_by_name[zh_name] = rec

    BOARD_DATA.mkdir(parents=True, exist_ok=True)
    moves_path = BOARD_DATA / 'moves.json'
    moves_path.write_text(
        json.dumps(list(moves_by_name.values()), ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    print(f'Board moves: {len(moves_by_name)} -> {moves_path}')

    def move_from_row(row) -> dict:
        name = str(row['move_name']).strip()
        if name in moves_by_name:
            return moves_by_name[name]
        return move_record(row, None, None)

    poke = pd.read_excel(ROOT / 'Card Generator' / 'johto_cube.xlsx', sheet_name='pokemon')

    # Curated battle pool: starters + iconic lines, deduped by pokedex_name (first row).
    tier_order = {'starter': 0, 'weak': 1, 'moderate': 2, 'strong': 3, 'legendary': 4, 'warp': 5}
    poke = poke.copy()
    poke['_tier_rank'] = poke['encounter_tier'].map(tier_order).fillna(9)
    poke['_starter_bonus'] = poke['encounter_tier'].eq('starter').astype(int) * -1
    poke['_vanilla'] = poke['pokedex_number'].astype(str).str.match(r'^\d+$').astype(int) * -1
    poke = poke.sort_values(['pokedex_name', '_vanilla', '_starter_bonus', '_tier_rank', 'state'])
    pool = poke.drop_duplicates('pokedex_name', keep='first')

    # Prefer well-known pokemon for default teams.
    preferred_names = {
        '妙蛙種子', '小火龍', '傑尼龜', '皮卡丘', '卡比獸', '耿鬼',
        '噴火龍', '水箭龜', '妙蛙花', '快龍', '超夢', '伊布',
    }
    preferred = pool[pool['pokedex_name'].isin(preferred_names)]
    others = pool[~pool['pokedex_name'].isin(preferred_names)]
    pool = pd.concat([preferred, others]).head(120)

    battle_entries: list[dict] = []
    pid = 0
    for _, row in pool.iterrows():
        learnable = [norm_type(row[c]) for c in ('move_1', 'move_2', 'move_3', 'move_4') if norm_type(row[c])]
        sig = move_from_row(row)
        sprite = format_pokedex_number(row['pokedex_number'])
        sprite_file = f'{sprite}.png'
        card_health = int(row['health']) if str(row['health']).isdigit() else 5
        battle_entries.append({
            'id': pid,
            'pokedex_number': str(row['pokedex_number']),
            'sprite': sprite_file,
            'name': str(row['pokedex_name']).strip(),
            'internal_name': str(row['internal_name']).strip(),
            'type_1': norm_type(row['type_1']),
            'type_2': norm_type(row['type_2']),
            'types': [t for t in (norm_type(row['type_1']), norm_type(row['type_2'])) if t],
            'learnable_types': learnable,
            'initiative': int(row['initiative']) if str(row['initiative']).isdigit() else 5,
            'health': card_health,
            'signature_move': sig,
        })
        pid += 1

    # Attach learned moves from pool (simulate card stacking at setup).
    by_name = {e['name']: e for e in battle_entries}
    for entry in battle_entries:
        teammates = [by_name[n] for n in preferred_names if n in by_name]
        entry['learned_moves'] = build_learned_moves(entry, teammates, entry['learnable_types'])

    battle_path = BOARD_DATA / 'pokemon_battle.json'
    battle_path.write_text(json.dumps(battle_entries, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Battle pokemon: {len(battle_entries)} -> {battle_path}')

    export_sprites_used(battle_entries)
    print(f'Sprites linked under {SPRITE_DST}')

    # Legacy roster file (signature only).
    legacy = []
    for e in battle_entries[:48]:
        m = e['signature_move']
        legacy.append({
            'name': e['name'],
            'move': m['name'],
            'move_en': m.get('name_en', ''),
            'type': e['type_1'],
            'health': e['health'],
            'initiative': e['initiative'],
            'power': m['power'],
            'distance_band': m['distance_band'],
            'range_tiles': m['range_tiles'],
            'aoe_type': m['aoe_type'],
            'aoe_radius': m['aoe_radius'],
            'distance_zh': m['distance_zh'],
            'aoe_zh': m['aoe_zh'],
            'sprite': e['sprite'],
            'pokedex_number': e['pokedex_number'],
        })
    (BOARD_DATA / 'pokemon_roster.json').write_text(
        json.dumps(legacy, ensure_ascii=False, indent=2), encoding='utf-8',
    )

    # Trainer squads (1–4 Pokemon each) from cube trainer column.
    poke_all = pd.read_excel(ROOT / 'Card Generator' / 'johto_cube.xlsx', sheet_name='pokemon')
    poke_all = poke_all.copy()
    poke_all['_vanilla'] = poke_all['pokedex_number'].astype(str).str.match(r'^\d+$').astype(int) * -1
    poke_all = poke_all.sort_values(['trainer', 'pokedex_name', '_vanilla', 'state'])

    trainer_records: list[dict] = []
    tid = 0
    pid = 10000
    all_trainer_names: list[str] = []

    for trainer_name, group in poke_all[poke_all['trainer'].notna()].groupby('trainer'):
        trainer_name = str(trainer_name).strip()
        if not trainer_name:
            continue
        party_rows = group.drop_duplicates('pokedex_name', keep='first').head(4)
        if len(party_rows) < 1:
            continue
        party: list[dict] = []
        for _, row in party_rows.iterrows():
            entry = pokemon_entry_from_row(row, moves_by_name, pid)
            pid += 1
            party.append(entry)
        apply_party_learning(party)
        faction = 0 if trainer_name in DEFAULT_MATCH_TRAINERS[:3] else 1
        if trainer_name in DEFAULT_MATCH_TRAINERS:
            faction = 0 if DEFAULT_MATCH_TRAINERS.index(trainer_name) < 3 else 1
        trainer_records.append({
            'id': tid,
            'name': trainer_name,
            'name_zh': TRAINER_ZH.get(trainer_name, trainer_name),
            'sprite': f'{trainer_name}.png',
            'faction': faction,
            'party': party[:PARTY_SIZE_PER_TRAINER],
            'party_min': 1,
            'party_max': min(4, len(party)),
        })
        all_trainer_names.append(trainer_name)
        tid += 1

    default_ids = [
        next(t['id'] for t in trainer_records if t['name'] == n)
        for n in DEFAULT_MATCH_TRAINERS
        if any(t['name'] == n for t in trainer_records)
    ]
    for i, tid_val in enumerate(default_ids):
        trainer_records[tid_val]['faction'] = 0 if i < 3 else 1

    trainers_payload = {
        'max_trainers': 6,
        'party_min': 1,
        'party_max': 4,
        'default_match': default_ids[:6],
        'trainers': trainer_records,
    }
    trainers_path = BOARD_DATA / 'trainers.json'
    trainers_path.write_text(json.dumps(trainers_payload, ensure_ascii=False, indent=2), encoding='utf-8')
    export_trainer_sprites(all_trainer_names)
    print(f'Trainers: {len(trainer_records)} squads -> {trainers_path}')


if __name__ == '__main__':
    main()
