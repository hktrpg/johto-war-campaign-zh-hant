"""Pokémon Legends Z-A move range / AOE data for card rendering and board battle."""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).parent.parent / 'data'
WAZA_PARAM_PATH = DATA_DIR / 'waza_param_array.json'
LOOKUP_PATH = DATA_DIR / 'za_move_lookup.json'

# Traditional Chinese labels for card / board UI.
DISTANCE_BAND_ZH = {
    'SHORT': '近距',
    'LONG': '遠距',
}

AOE_TYPE_ZH = {
    'MELEE': '單體近戰',
    'RANGED': '遠程射擊',
    'AOE_CENTER': '範圍攻擊',
    'AOE_LINE': '直線攻擊',
    'SELF_ORIGIN': '自身範圍',
    'AOE_OVERHEAD': '頭頂範圍',
    'TRAP': '陷阱設置',
    'OTHER': '其他',
}


def classify_aoe(param: dict[str, Any]) -> str:
    spawn = param.get('SpawnLocator', '')
    if spawn == 'eff_center01':
        return 'AOE_CENTER'
    if spawn == 'eff_directionattack01':
        return 'AOE_LINE'
    if spawn in ('eff_rangeattack01', 'eff_rangeattack02'):
        return 'RANGED'
    if spawn in ('eff_front01', 'eff_frontunder01', 'eff_attack01', 'eff_attack02', 'eff_attack03'):
        return 'MELEE'
    if spawn in ('eff_overhead01', 'eff_headcenter01', 'eff_face01'):
        return 'AOE_OVERHEAD'
    if spawn == 'origin':
        return 'SELF_ORIGIN'
    if spawn == 'feeler_a_01':
        return 'TRAP'
    return 'OTHER'


def classify_distance(param: dict[str, Any]) -> tuple[str, float]:
    """Return (SHORT|LONG, effective range in ZA units)."""
    rmax = float(param.get('WazaRangeMax', 0))
    eff = float(param.get('EffectiveRange', 0))
    if rmax >= 99:
        band = 'LONG'
    else:
        band = 'SHORT'
    if eff < 99:
        range_val = eff
    elif band == 'SHORT':
        range_val = rmax
    else:
        range_val = 99.0
    return band, range_val


def range_to_board_tiles(range_val: float, band: str) -> int:
    """Convert ZA range units to board tiles (1–6 on an 8×8 grid)."""
    if band == 'LONG':
        return min(6, max(3, math.ceil(range_val / 4)))
    if range_val <= 2:
        return 1
    if range_val <= 4:
        return 2
    if range_val <= 6:
        return 3
    if range_val <= 8:
        return 4
    return min(6, math.ceil(range_val / 2))


def aoe_radius(aoe_type: str, board_range: int) -> int:
    """Tiles around impact point that take splash damage."""
    if aoe_type == 'AOE_CENTER':
        return 1
    if aoe_type == 'SELF_ORIGIN':
        return min(2, max(1, board_range // 2))
    if aoe_type == 'AOE_OVERHEAD':
        return 1
    if aoe_type == 'AOE_LINE':
        return 0
    return 0


@lru_cache(maxsize=1)
def _params_by_waza_id() -> dict[int, dict[str, Any]]:
    with WAZA_PARAM_PATH.open(encoding='utf-8') as f:
        raw = json.load(f)
    out: dict[int, dict[str, Any]] = {}
    for table in raw['Table']:
        entry = table['Table'][0]
        out[int(entry['WazaId'])] = entry
    return out


@lru_cache(maxsize=1)
def _lookup_by_move_name() -> dict[str, dict[str, Any]]:
    if not LOOKUP_PATH.is_file():
        return {}
    with LOOKUP_PATH.open(encoding='utf-8') as f:
        return json.load(f)


def build_entry_from_param(param: dict[str, Any], move_name_en: str | None = None) -> dict[str, Any]:
    band, range_val = classify_distance(param)
    aoe = classify_aoe(param)
    tiles = range_to_board_tiles(range_val, band)
    return {
        'move_name_en': move_name_en,
        'waza_id': int(param['WazaId']),
        'za_distance_band': band,
        'za_range': round(range_val, 1),
        'za_board_range': tiles,
        'za_aoe_type': aoe,
        'za_aoe_radius': aoe_radius(aoe, tiles),
        'za_distance_zh': DISTANCE_BAND_ZH[band],
        'za_aoe_zh': AOE_TYPE_ZH[aoe],
        'za_spawn_locator': param.get('SpawnLocator', ''),
        'za_range_min': float(param.get('WazaRangeMin', 0)),
        'za_range_max': float(param.get('WazaRangeMax', 0)),
    }


def get_za_stats(move_name: str, move_name_en: str | None = None) -> dict[str, Any] | None:
    """Look up ZA stats by Chinese or English move name."""
    lookup = _lookup_by_move_name()
    key = (move_name or '').strip()
    if key in lookup:
        return lookup[key]
    if move_name_en and move_name_en.strip() in lookup:
        return lookup[move_name_en.strip()]
    return None


def za_card_label(stats) -> str | None:
    """One-line ZA label for move card header."""
    za = get_za_stats(
        getattr(stats, 'move_name', ''),
        getattr(stats, 'move_name_en', None) if hasattr(stats, 'move_name_en') else None,
    )
    if not za:
        return None
    return f"{za['za_distance_zh']} {za['za_board_range']}格 · {za['za_aoe_zh']}"


def has_za_data() -> bool:
    return LOOKUP_PATH.is_file()


def default_za_for_move_type(move_type: str | None) -> dict[str, Any]:
    """Fallback ZA board fields when lookup has no match (still printable for D&D play)."""
    mt = (move_type or 'normal').strip().lower()
    long_range_types = {'fire', 'water', 'electric', 'psychic', 'dragon', 'fairy'}
    band = 'LONG' if mt in long_range_types else 'SHORT'
    tiles = 4 if band == 'LONG' else 2
    return {
        'move_name_en': None,
        'za_distance_band': band,
        'za_range': float(tiles * 2),
        'za_board_range': tiles,
        'za_aoe_type': 'MELEE',
        'za_aoe_radius': 0,
        'za_distance_zh': DISTANCE_BAND_ZH[band],
        'za_aoe_zh': AOE_TYPE_ZH['MELEE'],
        'za_fallback': True,
        'za_move_type_hint': mt,
    }


def resolve_za_for_card(stats) -> dict[str, Any]:
    """ZA + board combat fields for a move row or Pokémon signature move."""
    move_name = str(getattr(stats, 'move_name', '') or '').strip()
    move_name_en = getattr(stats, 'move_name_en', None)
    if move_name_en is not None and not str(move_name_en).strip():
        move_name_en = None
    za = get_za_stats(move_name, move_name_en)
    if za:
        return {**za, 'za_fallback': False}
    move_type = getattr(stats, 'move_type', None)
    return default_za_for_move_type(str(move_type) if move_type is not None else None)


def parse_attack_dice_count(stats) -> int:
    raw = getattr(stats, 'move_attack_strength', None)
    if raw is None:
        return 1
    text = str(raw).strip().lower()
    if text in {'', 'blank', 'nan', 'none'}:
        return 1
    try:
        return max(1, int(float(text)))
    except ValueError:
        return 1
