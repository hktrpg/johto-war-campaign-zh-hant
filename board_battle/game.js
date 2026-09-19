/**
 * Johto War ZA board battle — d6 attack rolls, per-Pokemon initiative,
 * random terrain, trainer abilities, flexible match modes.
 */

const BOARD_SIZE = 8;
const MAX_STAMINA = 6;
const MOVE_STAMINA_COST = 1;
const RECHARGE_STAMINA_COST = 2;
const MAX_TRAINERS = 6;
const D6_HIT_MIN = 4;

const TYPE_CHART = {
  normal: { rock: -2, ghost: -4, steel: -2 },
  fire: { fire: -2, water: 2, grass: -2, ice: -2, bug: -2, rock: 2, dragon: -2, steel: 2 },
  water: { fire: -2, water: -2, grass: 2, ground: -2, rock: -2, dragon: -2 },
  grass: { fire: 2, water: -2, grass: -2, poison: 2, ground: -2, flying: 2, bug: -2, rock: 2, dragon: -2, steel: 2 },
  electric: { water: -2, electric: -2, grass: 2, ground: 2, flying: -2, dragon: -2 },
  ice: { fire: 2, water: -2, grass: 2, ice: -2, ground: -2, flying: -2, dragon: 2, steel: -2 },
  fighting: { normal: -2, ice: -2, poison: 2, flying: 2, psychic: 2, bug: -2, rock: 2, ghost: -4, dark: 2, steel: 2, fairy: 2 },
  poison: { grass: -2, poison: -2, ground: 2, rock: -2, ghost: -2, steel: 2, fairy: -2 },
  ground: { fire: -2, electric: -4, grass: 2, poison: -2, flying: -4, bug: -2, rock: 2, steel: 2 },
  flying: { electric: 2, grass: -2, fighting: -2, bug: -2, rock: 2, steel: -2 },
  psychic: { fighting: -2, poison: -2, psychic: -2, dark: 2, steel: -2 },
  bug: { fire: 2, grass: -2, fighting: -2, poison: -2, flying: 2, psychic: 2, ghost: 2, dark: 2, steel: 2, fairy: 2 },
  rock: { fire: -2, ice: -2, fighting: 2, ground: 2, flying: -2, bug: 2, steel: 2 },
  ghost: { normal: -4, psychic: -2, ghost: 2, dark: -2 },
  dragon: { dragon: 2, steel: 2, fairy: 2 },
  dark: { fighting: 2, psychic: -2, ghost: -2, dark: -2, fairy: 2 },
  steel: { fire: 2, water: -2, electric: -2, ice: -2, rock: 2, steel: -2, fairy: 2 },
  fairy: { fire: 2, fighting: -2, poison: 2, dragon: -2, dark: 2, steel: 2 },
  shadow: { psychic: 2, ghost: -2, dark: 2 },
};

const FACTION_COLORS = ['#4ecdc4', '#ff6b6b', '#a78bfa', '#fbbf24', '#60a5fa', '#f472b6'];

const TERRAIN_DEFS = {
  plain: { id: 'plain', name: '平地', css: 'terrain-plain' },
  forest: { id: 'forest', name: '森林', css: 'terrain-forest', cover: 1 },
  water: { id: 'water', name: '水域', css: 'terrain-water', typesOnly: ['water', 'flying'] },
  rock: { id: 'rock', name: '岩石', css: 'terrain-rock', blocked: true },
  sand: { id: 'sand', name: '沙地', css: 'terrain-sand', moveCost: 2 },
  ice: { id: 'ice', name: '冰面', css: 'terrain-ice', powerBonusTypes: { ice: 1 } },
  electric: { id: 'electric', name: '電磁', css: 'terrain-electric', powerBonusTypes: { electric: 1, steel: 1 } },
  cave: { id: 'cave', name: '洞穴', css: 'terrain-cave', powerBonusTypes: { ghost: 1, dark: 1 } },
};

let trainersData = { trainers: [], default_match: [], terrain_types: [] };
let matchConfig = {
  mode: 'team',
  trainerIds: [],
  partySize: 3,
  randomTerrain: true,
};
let matchTrainers = [];
let terrain = [];
let units = [];
let initiativeQueue = [];
let currentUnitId = null;
let roundNumber = 1;
let phase = 'select';
let selectedId = null;
let selectedMoveIndex = 0;
let gameStarted = false;
let trainerAbilityUses = {};
let roundAttackFlags = {};
let delayedAttacks = [];

const boardEl = document.getElementById('board');
const turnLabel = document.getElementById('turn-label');
const phaseLabel = document.getElementById('phase-label');
const initiativeTrack = document.getElementById('initiative-track');
const trainersPanel = document.getElementById('trainers-panel');
const unitInfo = document.getElementById('unit-info');
const unitPortrait = document.getElementById('unit-portrait');
const statBars = document.getElementById('stat-bars');
const hpFill = document.getElementById('hp-fill');
const hpText = document.getElementById('hp-text');
const staminaFill = document.getElementById('stamina-fill');
const staminaText = document.getElementById('stamina-text');
const moveSlotsEl = document.getElementById('move-slots');
const moveDetail = document.getElementById('move-detail');
const learnPanel = document.getElementById('learn-panel');
const learnOptions = document.getElementById('learn-options');
const logEl = document.getElementById('log');
const diceLogEl = document.getElementById('dice-log');
const btnMove = document.getElementById('btn-move');
const btnAttack = document.getElementById('btn-attack');
const btnRecharge = document.getElementById('btn-recharge');
const btnLearn = document.getElementById('btn-learn');
const btnAbility = document.getElementById('btn-ability');
const btnEnd = document.getElementById('btn-end');
const btnRestart = document.getElementById('btn-restart');
const setupOverlay = document.getElementById('setup-overlay');
const setupMode = document.getElementById('setup-mode');
const setupTrainers = document.getElementById('setup-trainers');
const setupPartySize = document.getElementById('setup-party-size');
const setupTerrain = document.getElementById('setup-terrain');
const btnStartBattle = document.getElementById('btn-start-battle');

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function inBounds(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

function terrainAt(x, y) {
  return terrain[y]?.[x] || TERRAIN_DEFS.plain;
}

function unitAt(x, y) {
  return units.find((u) => u.hp > 0 && u.x === x && u.y === y);
}

function log(msg) {
  const li = document.createElement('li');
  li.textContent = msg;
  logEl.prepend(li);
}

function logDice(msg) {
  if (!diceLogEl) return;
  const li = document.createElement('li');
  li.textContent = msg;
  diceLogEl.prepend(li);
}

function spriteUrl(sprite) {
  return `assets/pokemon/${sprite}`;
}

function trainerSpriteUrl(sprite) {
  return `assets/trainers/${sprite}`;
}

function typeMultiplier(atkType, defTypes) {
  let mult = 1;
  for (const def of defTypes) {
    const row = TYPE_CHART[atkType] || {};
    const mod = row[def] ?? 0;
    if (mod === -4) return 0;
    if (mod === 2) mult *= 1.5;
    if (mod === -2) mult *= 0.67;
  }
  return mult;
}

function rollD6() {
  return Math.floor(Math.random() * 6) + 1;
}

function rollAttackDice(count) {
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(rollD6());
  return rolls;
}

function countSuccesses(rolls, unit, move) {
  const trainer = getTrainer(unit.trainerId);
  const terrainCell = terrainAt(unit.x, unit.y);
  let successes = 0;
  rolls.forEach((r) => {
    let val = r;
    if (
      trainer?.ability?.passive === 'electric_terrain_low_success_boost'
      && terrainCell.id === 'electric'
      && unit.types.some((t) => trainer.ability.types?.includes(t))
      && val === 4
    ) {
      val = 5;
    }
    if (val >= D6_HIT_MIN) successes += 1;
  });
  return successes;
}

function getTrainer(id) {
  return matchTrainers.find((t) => t.id === id);
}

function currentUnit() {
  return units.find((u) => u.id === currentUnitId && u.hp > 0);
}

function isEnemy(a, b) {
  if (matchConfig.mode === 'ffa') return a.trainerId !== b.trainerId;
  if (matchConfig.mode === 'dm') {
    const ta = getTrainer(a.trainerId);
    const tb = getTrainer(b.trainerId);
    return ta?.isDm !== tb?.isDm;
  }
  return a.faction !== b.faction;
}

function livingUnits(trainerId) {
  return units.filter((u) => u.trainerId === trainerId && u.hp > 0);
}

function livingTrainers() {
  return matchTrainers.filter((t) => livingUnits(t.id).length > 0);
}

function canEnterTerrain(unit, cell) {
  if (cell.blocked) return false;
  if (cell.typesOnly?.length) {
    const canTerrainIgnore = unit.trainerAbilityFlags?.terrainIgnore;
    if (canTerrainIgnore) return true;
    return unit.types.some((t) => cell.typesOnly.includes(t));
  }
  return true;
}

function effectiveInitiative(unit) {
  let init = unit.initiative || 5;
  const trainer = getTrainer(unit.trainerId);
  const ability = trainer?.ability;
  if (!ability) return init;

  if (ability.passive === 'initiative_bonus_all') init += ability.value || 0;
  if (ability.passive === 'initiative_bonus_types' && unit.types.some((t) => ability.types?.includes(t))) {
    init += ability.value || 0;
  }
  if (ability.passive === 'priority_type_bonus' && unit.types.some((t) => ability.types?.includes(t))) {
    init += ability.value || 0;
  }
  if (unit.protecting) init += 0;
  return init;
}

function buildInitiativeQueue() {
  const living = units.filter((u) => u.hp > 0);
  living.sort((a, b) => {
    const diff = effectiveInitiative(b) - effectiveInitiative(a);
    if (diff !== 0) return diff;
    return a.id - b.id;
  });
  initiativeQueue = living.map((u) => u.id);
}

function advanceToNextUnit() {
  removeDeadUnits();
  buildInitiativeQueue();
  if (!initiativeQueue.length) {
    currentUnitId = null;
    return;
  }

  const currentIdx = initiativeQueue.indexOf(currentUnitId);
  let nextIdx = currentIdx + 1;
  if (nextIdx >= initiativeQueue.length) {
    roundNumber += 1;
    roundAttackFlags = {};
    units.forEach((u) => {
      u.protecting = false;
      u.usedProtectLastTurn = u.usedProtectThisTurn;
      u.usedProtectThisTurn = false;
    });
    resolveDelayedAttacks();
    buildInitiativeQueue();
    nextIdx = 0;
    log(`—— 第 ${roundNumber} 回合 ——`);
  }
  currentUnitId = initiativeQueue[nextIdx] ?? initiativeQueue[0] ?? null;
  selectedId = currentUnitId;
  phase = 'select';
  const u = currentUnit();
  if (u) {
    const t = getTrainer(u.trainerId);
    log(`${t?.name_zh || ''} 的 ${u.name} 行動（先攻 ${effectiveInitiative(u)}）`);
  }
}

function removeDeadUnits() {
  const before = units.length;
  units = units.filter((u) => u.hp > 0);
  if (units.length < before) {
    buildInitiativeQueue();
  }
}

function generateTerrain(seedRandom = Math.random) {
  const weights = trainersData.terrain_types?.length
    ? trainersData.terrain_types
    : Object.values(TERRAIN_DEFS).map((t) => ({ id: t.id, weight: 10 }));

  const totalWeight = weights.reduce((s, w) => s + (w.weight || 1), 0);
  const pick = () => {
    let r = seedRandom() * totalWeight;
    for (const w of weights) {
      r -= w.weight || 1;
      if (r <= 0) return w.id;
    }
    return 'plain';
  };

  terrain = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    const row = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      const edge = x === 0 || y === 0 || x === BOARD_SIZE - 1 || y === BOARD_SIZE - 1;
      const id = edge ? 'plain' : pick();
      const def = TERRAIN_DEFS[id] || TERRAIN_DEFS.plain;
      const extra = weights.find((w) => w.id === id) || {};
      row.push({
        ...def,
        cover: extra.cover ?? def.cover ?? 0,
        blocked: extra.blocked ?? def.blocked ?? false,
        typesOnly: extra.types_only ?? def.typesOnly,
        moveCost: extra.move_cost ?? def.moveCost ?? 1,
        powerBonusTypes: extra.power_bonus_types ?? def.powerBonusTypes,
      });
    }
    terrain.push(row);
  }
}

function spawnPositionsForTrainer(slot, totalTrainers, partySize, mode) {
  const positions = [];
  if (mode === 'team') {
    const half = Math.ceil(totalTrainers / 2);
    const factionSlot = slot < half ? slot : slot - half;
    const col = slot < half ? factionSlot % 2 : BOARD_SIZE - 1 - (factionSlot % 2);
    const startRow = Math.floor((BOARD_SIZE - partySize) / 2);
    for (let i = 0; i < partySize; i++) positions.push({ x: col, y: startRow + i });
    return positions;
  }

  if (mode === 'dm') {
    const col = slot === 0 ? BOARD_SIZE - 1 : Math.min(slot - 1, 2);
    const startRow = Math.floor((BOARD_SIZE - partySize) / 2) + (slot % 2);
    for (let i = 0; i < partySize; i++) positions.push({ x: col, y: (startRow + i) % BOARD_SIZE });
    return positions;
  }

  const corners = [
    { x: 0, y: 0 }, { x: BOARD_SIZE - 1, y: 0 },
    { x: 0, y: BOARD_SIZE - 1 }, { x: BOARD_SIZE - 1, y: BOARD_SIZE - 1 },
    { x: Math.floor(BOARD_SIZE / 2), y: 0 },
    { x: Math.floor(BOARD_SIZE / 2), y: BOARD_SIZE - 1 },
  ];
  const base = corners[slot % corners.length];
  for (let i = 0; i < partySize; i++) {
    positions.push({ x: base.x, y: Math.min(BOARD_SIZE - 1, base.y + i) });
  }
  return positions;
}

function buildMovesFromTemplate(template) {
  const moves = [{ ...template.signature_move, slot: 0, source: '招牌' }];
  for (const learned of template.learned_moves || []) {
    moves.push({
      ...learned,
      slot: moves.length,
      source: learned.slot_label || `來自${learned.learned_from}`,
    });
  }
  while (moves.length < 4) moves.push(null);
  return moves.slice(0, 4);
}

function buildUnit(template, trainer, pos, unitId) {
  const ability = trainer.ability;
  const terrainIgnore = ability?.passive === 'terrain_ignore'
    && template.types?.some((t) => ability.types?.includes(t));
  return {
    id: unitId,
    trainerId: trainer.id,
    trainerName: trainer.name_zh || trainer.name,
    faction: trainer.faction,
    colorIndex: trainer.slot,
    name: template.name,
    sprite: template.sprite,
    types: template.types?.length ? template.types : [template.type_1],
    learnableTypes: template.learnable_types || [],
    initiative: template.initiative || 5,
    maxHp: template.health || 5,
    hp: template.health || 5,
    maxStamina: MAX_STAMINA,
    stamina: MAX_STAMINA,
    moves: buildMovesFromTemplate(template),
    moveUsed: [false, false, false, false],
    rechargePenalty: 0,
    protecting: false,
    usedProtectThisTurn: false,
    usedProtectLastTurn: false,
    trainerAbilityFlags: { terrainIgnore, firstAttackUsed: false },
    x: pos.x,
    y: pos.y,
  };
}

function setupGame() {
  units = [];
  phase = 'select';
  selectedId = null;
  selectedMoveIndex = 0;
  roundNumber = 1;
  trainerAbilityUses = {};
  roundAttackFlags = {};
  delayedAttacks = [];
  gameStarted = true;

  const ids = matchConfig.trainerIds.length
    ? matchConfig.trainerIds
    : trainersData.default_match.slice(0, MAX_TRAINERS);

  matchTrainers = ids.slice(0, MAX_TRAINERS).map((id, slot) => {
    const t = trainersData.trainers.find((x) => x.id === id);
    if (!t) return null;
    let faction = slot;
    let isDm = false;
    if (matchConfig.mode === 'team') {
      faction = slot < Math.ceil(ids.length / 2) ? 0 : 1;
    } else if (matchConfig.mode === 'dm') {
      isDm = slot === 0;
      faction = isDm ? 99 : slot;
    }
    const party = t.party.slice(0, matchConfig.partySize);
    return { ...t, slot, faction, isDm, party };
  }).filter(Boolean);

  if (matchTrainers.length < 2) {
    log('訓練家資料不足，無法開始。');
    return;
  }

  if (matchConfig.randomTerrain) generateTerrain();
  else {
    terrain = Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => ({ ...TERRAIN_DEFS.plain })),
    );
  }

  let unitId = 0;
  matchTrainers.forEach((trainer) => {
    trainerAbilityUses[trainer.id] = 0;
    const positions = spawnPositionsForTrainer(
      trainer.slot,
      matchTrainers.length,
      trainer.party.length,
      matchConfig.mode,
    );
    trainer.party.forEach((mon, i) => {
      const pos = positions[i] || { x: 1, y: 1 };
      let px = pos.x;
      let py = pos.y;
      while (unitAt(px, py) || terrainAt(px, py).blocked) {
        py = (py + 1) % BOARD_SIZE;
      }
      units.push(buildUnit(mon, trainer, { x: px, y: py }, unitId++));
    });
  });

  buildInitiativeQueue();
  currentUnitId = initiativeQueue[0] ?? null;
  selectedId = currentUnitId;

  const modeNames = { team: '團戰', ffa: '自由混戰', dm: 'DM + 玩家' };
  log(`對戰開始！【${modeNames[matchConfig.mode] || matchConfig.mode}】${matchTrainers.length} 位訓練家`);
  if (matchConfig.randomTerrain) log('戰場已隨機生成地形。');
  const first = currentUnit();
  if (first) log(`先攻：${first.name}（${getTrainer(first.trainerId)?.name_zh || ''}）`);
  render();
}

function checkWinner() {
  const alive = livingTrainers();
  if (matchConfig.mode === 'team') {
    const factions = new Set(alive.map((t) => t.faction));
    if (factions.size <= 1 && alive.length > 0) {
      return alive[0];
    }
    return null;
  }
  if (matchConfig.mode === 'dm') {
    const players = alive.filter((t) => !t.isDm);
    const dm = alive.filter((t) => t.isDm);
    if (players.length === 0 && dm.length > 0) return dm[0];
    if (dm.length === 0 && players.length > 0) return players[0];
    return null;
  }
  if (alive.length === 1) return alive[0];
  return null;
}

async function loadData() {
  try {
    const res = await fetch('data/trainers.json');
    if (res.ok) trainersData = await res.json();
  } catch (_) {
    trainersData = { trainers: [], default_match: [] };
  }
}

function selectedUnit() {
  return units.find((u) => u.id === selectedId);
}

function adjacentCells(x, y, unit) {
  const out = [];
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny)) continue;
    const cell = terrainAt(nx, ny);
    if (cell.blocked || unitAt(nx, ny)) continue;
    if (!canEnterTerrain(unit, cell)) continue;
    out.push({ x: nx, y: ny, cost: cell.moveCost || 1 });
  }
  return out;
}

function cellsInRange(origin, range) {
  const cells = [];
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      const d = manhattan(origin, { x, y });
      if (d > 0 && d <= range) cells.push({ x, y });
    }
  }
  return cells;
}

function aoeCells(attacker, move, target) {
  const origin = { x: attacker.x, y: attacker.y };
  const range = move.range_tiles || 2;
  const aoeType = move.aoe_type || 'MELEE';
  const aoeRadius = move.aoe_radius || 0;
  const arches = move.archetypes || [];

  if (arches.some((a) => a === 'MULTI' || a === 'MULTI ALL')) {
    return units.filter((u) => u.hp > 0 && isEnemy(attacker, u)).map((u) => ({ x: u.x, y: u.y }));
  }

  if (aoeType === 'MELEE') return manhattan(origin, target) === 1 ? [target] : [];
  if (aoeType === 'RANGED') {
    const d = manhattan(origin, target);
    return d > 0 && d <= range ? [target] : [];
  }
  if (aoeType === 'AOE_CENTER' || aoeType === 'AOE_OVERHEAD') {
    const hit = [];
    for (let x = target.x - aoeRadius; x <= target.x + aoeRadius; x++) {
      for (let y = target.y - aoeRadius; y <= target.y + aoeRadius; y++) {
        if (inBounds(x, y) && manhattan(target, { x, y }) <= aoeRadius) hit.push({ x, y });
      }
    }
    return hit;
  }
  if (aoeType === 'SELF_ORIGIN') {
    const r = Math.max(aoeRadius, 1);
    const hit = [];
    for (let x = origin.x - r; x <= origin.x + r; x++) {
      for (let y = origin.y - r; y <= origin.y + r; y++) {
        if (inBounds(x, y) && manhattan(origin, { x, y }) <= r) hit.push({ x, y });
      }
    }
    return hit;
  }
  if (aoeType === 'AOE_LINE') {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const stepX = dx === 0 ? 0 : dx / Math.abs(dx);
    const stepY = dy === 0 ? 0 : dy / Math.abs(dy);
    const hit = [];
    let cx = origin.x + stepX;
    let cy = origin.y + stepY;
    while (inBounds(cx, cy) && manhattan(origin, { x: cx, y: cy }) <= range) {
      hit.push({ x: cx, y: cy });
      cx += stepX;
      cy += stepY;
    }
    return hit;
  }
  const d = manhattan(origin, target);
  return d > 0 && d <= range ? [target] : [];
}

function availableMoveCount(unit) {
  return unit.moves.filter((m, i) => m && !unit.moveUsed[i]).length;
}

function allMovesExhausted(unit) {
  return unit.moves.every((m, i) => !m || unit.moveUsed[i]);
}

function getActiveMove(unit) {
  const move = unit.moves[selectedMoveIndex];
  if (!move || unit.moveUsed[selectedMoveIndex]) return null;
  return move;
}

function hasArchetype(move, prefix) {
  return (move.archetypes || []).some((a) => a === prefix || a.startsWith(prefix));
}

function computeDiceCount(attacker, move) {
  let dice = Math.max(1, move.power || 1);
  const trainer = getTrainer(attacker.trainerId);
  const ability = trainer?.ability;
  const cell = terrainAt(attacker.x, attacker.y);
  const targetCellBonus = cell.powerBonusTypes?.[move.type] || 0;
  dice += targetCellBonus;

  if (ability?.passive === 'terrain_power_bonus' && cell.id === ability.terrain
      && attacker.types.some((t) => ability.types?.includes(t))) {
    dice += ability.value || 0;
  }

  if (ability?.passive === 'first_attack_extra_die'
      && attacker.types.some((t) => ability.types?.includes(t))
      && !attacker.trainerAbilityFlags.firstAttackUsed) {
    dice += ability.value || 1;
  }

  const roundKey = `${attacker.trainerId}-${roundNumber}`;
  if (ability?.passive === 'first_attack_each_round_extra_die' && !roundAttackFlags[roundKey]) {
    dice += ability.value || 1;
  }

  const multiTargets = units.filter((u) => u.hp > 0 && isEnemy(attacker, u));
  if (hasArchetype(move, 'MULTI') && multiTargets.length === 1) dice += 1;

  dice = Math.max(1, dice - (attacker.rechargePenalty || 0));
  return dice;
}

function applyDamage(attacker, target, move, successes) {
  if (target.protecting || successes <= 0) {
    log(`${target.name} 受到保護，免傷！`);
    return 0;
  }

  const mult = typeMultiplier(move.type, target.types);
  if (mult === 0) {
    log(`${target.name} 免疫 ${move.type} 屬性！`);
    return 0;
  }

  let dmg = successes;
  if (mult > 1) dmg = Math.max(1, Math.round(dmg * mult));
  if (mult < 1) dmg = Math.max(1, Math.floor(dmg * mult));

  const cover = terrainAt(target.x, target.y).cover || 0;
  dmg = Math.max(0, dmg - cover);

  const trainer = getTrainer(target.trainerId);
  if (trainer?.ability?.passive === 'damage_reduction_types'
      && target.types.some((t) => trainer.ability.types?.includes(t))) {
    dmg = Math.max(1, dmg - (trainer.ability.value || 0));
  }

  const atkTrainer = getTrainer(attacker.trainerId);
  if (atkTrainer?.ability?.passive === 'melee_success_bonus' && (move.aoe_type || 'MELEE') === 'MELEE') {
    dmg += (atkTrainer.ability.value || 0) * successes;
  }

  target.hp = Math.max(0, target.hp - dmg);
  const eff = mult === 0 ? '無效' : mult > 1 ? '效果絕佳' : mult < 1 ? '效果不好' : '普通';
  log(`${attacker.name}「${move.name}」→ ${target.name}，${dmg} HP（${successes} 成功 · ${eff}）`);
  if (target.hp <= 0) {
    log(`${target.name} 倒地退場！（無法復活）`);
    removeDeadUnits();
  }
  return dmg;
}

function executeAttack(attacker, move, targetCoord) {
  if (attacker.stamina < MOVE_STAMINA_COST) return;

  if (hasArchetype(move, 'PROTECT') && attacker.usedProtectLastTurn) {
    log(`${attacker.name} 上回合已使用保護，本回合無法再保護。`);
    return;
  }

  const delayMatch = (move.archetypes || []).find((a) => a.startsWith('DELAY'));
  if (delayMatch) {
    const turns = parseInt(delayMatch.split(' ').pop(), 10) || 1;
    delayedAttacks.push({
      resolveRound: roundNumber + turns,
      attackerId: attacker.id,
      move: { ...move },
      target: { ...targetCoord },
      slot: selectedMoveIndex,
    });
    attacker.stamina -= MOVE_STAMINA_COST;
    attacker.moveUsed[selectedMoveIndex] = true;
    log(`${attacker.name} 蓄力「${move.name}」，${turns} 回合後擲骰！`);
    endUnitTurn();
    return;
  }

  const hits = aoeCells(attacker, move, targetCoord);
  if (!hits.length) return;

  attacker.stamina -= MOVE_STAMINA_COST;
  attacker.moveUsed[selectedMoveIndex] = true;
  attacker.rechargePenalty = 0;

  const rechargeArch = (move.archetypes || []).find((a) => a.startsWith('RECHARGE'));
  if (rechargeArch) {
    attacker.rechargePenalty = parseInt(rechargeArch.split(' ').pop(), 10) || 1;
  }

  if (hasArchetype(move, 'PROTECT')) {
    attacker.protecting = true;
    attacker.usedProtectThisTurn = true;
    log(`${attacker.name} 進入保護狀態！`);
  }

  let diceCount = computeDiceCount(attacker, move);
  let rolls = rollAttackDice(diceCount);
  let successes = countSuccesses(rolls, attacker, move);

  const trainer = getTrainer(attacker.trainerId);
  if (trainer?.ability?.passive === 'once_reroll_failed' && (trainerAbilityUses[attacker.trainerId] || 0) < 1) {
    const failed = rolls.filter((r) => r < D6_HIT_MIN).length;
    if (failed > 0) {
      trainerAbilityUses[attacker.trainerId] = 1;
      const rerolls = rollAttackDice(failed);
      rolls = rolls.map((r) => (r < D6_HIT_MIN ? rerolls.shift() : r));
      successes = countSuccesses(rolls, attacker, move);
      log(`【${trainer.ability.name}】重投 ${failed} 顆失敗骰！`);
    }
  }

  attacker.trainerAbilityFlags.firstAttackUsed = true;
  roundAttackFlags[`${attacker.trainerId}-${roundNumber}`] = true;

  logDice(`${attacker.name} 擲 ${diceCount}d6：[${rolls.join(', ')}] → ${successes} 成功`);

  const victims = units.filter(
    (t) => t.hp > 0 && isEnemy(attacker, t) && hits.some((h) => h.x === t.x && h.y === t.y),
  );

  if (!victims.length) {
    log(`${attacker.name} 使用「${move.name}」，未命中敵人。`);
  } else {
    victims.forEach((t) => applyDamage(attacker, t, move, successes));
  }

  if (hasArchetype(move, 'SWITCH')) {
    const ally = units.find((u) => u.hp > 0 && u.trainerId === attacker.trainerId && u.id !== attacker.id
      && manhattan(attacker, u) <= 3);
    if (ally) {
      const ax = attacker.x; const ay = attacker.y;
      attacker.x = ally.x; attacker.y = ally.y;
      ally.x = ax; ally.y = ay;
      log(`${attacker.name} 與 ${ally.name} 換位！`);
    }
  }

  endUnitTurn();
}

function resolveDelayedAttacks() {
  const due = delayedAttacks.filter((a) => a.resolveRound <= roundNumber);
  delayedAttacks = delayedAttacks.filter((a) => a.resolveRound > roundNumber);
  due.forEach((pending) => {
    const attacker = units.find((u) => u.id === pending.attackerId && u.hp > 0);
    if (!attacker) return;
    const move = pending.move;
    const hits = aoeCells(attacker, move, pending.target);
    let diceCount = computeDiceCount(attacker, move);
    const rolls = rollAttackDice(diceCount);
    const successes = countSuccesses(rolls, attacker, move);
    logDice(`【延遲】${attacker.name} 擲 ${diceCount}d6：[${rolls.join(', ')}] → ${successes} 成功`);
    const victims = units.filter(
      (t) => t.hp > 0 && isEnemy(attacker, t) && hits.some((h) => h.x === t.x && h.y === t.y),
    );
    victims.forEach((t) => applyDamage(attacker, t, move, successes));
  });
}

function highlightCells() {
  const u = selectedUnit();
  const active = currentUnit();
  if (!u || !active || u.id !== active.id) return { move: [], attack: [] };

  if (phase === 'move') return { move: adjacentCells(u.x, u.y, u).map((c) => ({ x: c.x, y: c.y })), attack: [] };
  if (phase === 'attack') {
    const move = getActiveMove(u);
    if (!move) return { move: [], attack: [] };
    return { move: [], attack: cellsInRange({ x: u.x, y: u.y }, move.range_tiles || 2) };
  }
  return { move: [], attack: [] };
}

function renderInitiativeTrack() {
  if (!initiativeTrack) return;
  initiativeTrack.innerHTML = '';
  initiativeQueue.forEach((uid) => {
    const u = units.find((x) => x.id === uid);
    if (!u) return;
    const chip = document.createElement('div');
    chip.className = 'init-chip';
    if (uid === currentUnitId) chip.classList.add('active');
    chip.style.borderColor = FACTION_COLORS[u.colorIndex] || '#666';
    chip.innerHTML = `<img src="${spriteUrl(u.sprite)}" alt="" onerror="this.remove()" />
      <span>${u.name}</span><small>${effectiveInitiative(u)}</small>`;
    initiativeTrack.appendChild(chip);
  });
}

function renderTrainersPanel() {
  trainersPanel.innerHTML = '';
  matchTrainers.forEach((trainer) => {
    const card = document.createElement('div');
    card.className = 'trainer-card';
    const activeUnit = currentUnit();
    if (activeUnit && activeUnit.trainerId === trainer.id) card.classList.add('active');
    card.style.borderColor = FACTION_COLORS[trainer.slot] || '#666';
    const alive = livingUnits(trainer.id).length;
    const total = trainer.party.length;
    const ability = trainer.ability;
    const factionLabel = matchConfig.mode === 'ffa' ? `P${trainer.slot + 1}`
      : matchConfig.mode === 'dm' ? (trainer.isDm ? 'DM' : `玩家${trainer.slot}`)
        : trainer.faction === 0 ? 'A 陣' : 'B 陣';
    card.innerHTML = `
      <img src="${trainerSpriteUrl(trainer.sprite)}" alt="" class="trainer-thumb" onerror="this.style.display='none'" />
      <div class="trainer-meta">
        <strong>${trainer.name_zh}</strong>
        <span class="trainer-faction">${factionLabel}</span>
        <span class="trainer-party">${alive}/${total} 隻</span>
        ${ability ? `<span class="trainer-ability" title="${ability.description}">⚡ ${ability.name}</span>` : ''}
      </div>`;
    trainersPanel.appendChild(card);
  });
}

function renderMoveSlots(unit) {
  moveSlotsEl.innerHTML = '';
  if (!unit) {
    moveDetail.textContent = '—';
    return;
  }
  unit.moves.forEach((move, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'move-slot';
    if (!move) {
      btn.classList.add('empty');
      btn.innerHTML = `<span class="slot-tag">槽 ${i + 1}</span>空槽（疊隊友卡）`;
    } else {
      if (unit.moveUsed[i]) btn.classList.add('used');
      if (i === selectedMoveIndex) btn.classList.add('selected');
      const tag = i === 0 ? '招牌' : (move.source || '學會');
      const arch = (move.archetypes || []).slice(0, 2).join(' ');
      btn.innerHTML = `<span class="slot-tag">${tag}</span>${move.name}<br>
        <span class="power">${move.power}d6</span>${arch ? ` <span class="arch">${arch}</span>` : ''}`;
      btn.addEventListener('click', () => {
        if (!unit.moveUsed[i] && move) {
          selectedMoveIndex = i;
          render();
        }
      });
    }
    moveSlotsEl.appendChild(btn);
  });

  const move = getActiveMove(unit);
  if (move) {
    const archText = (move.archetypes || []).join(' · ') || '—';
    moveDetail.innerHTML = `
      <strong>${move.name}</strong>
      <span class="badge">${move.distance_zh || '—'}</span>
      <span class="badge">${move.range_tiles || 0} 格</span>
      <span class="badge">${move.aoe_zh || '—'}</span>
      <br>屬性 ${move.type} · <strong>${move.power}d6</strong>（4–6 成功）
      <br>原型：${archText}
      ${move.effect ? `<br><em>${move.effect}</em>` : ''}`;
  } else {
    moveDetail.textContent = allMovesExhausted(unit) ? '四招已用光，需回氣（−2 體力）' : '選擇招式';
  }
}

function renderLearnPanel(unit) {
  learnOptions.innerHTML = '';
  if (!unit || phase !== 'learn') {
    learnPanel.hidden = true;
    return;
  }
  learnPanel.hidden = false;
  if (!unit.moves.some((m) => !m)) {
    learnOptions.textContent = '四招已滿';
    return;
  }

  livingUnits(unit.trainerId)
    .filter((m) => m.id !== unit.id)
    .forEach((mate) => {
      const sig = mate.moves[0];
      if (!sig || !unit.learnableTypes.includes(sig.type)) return;
      if (unit.moves.some((m) => m && m.name === sig.name)) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'learn-btn';
      btn.textContent = `疊場上 ${mate.name} →「${sig.name}」`;
      btn.addEventListener('click', () => {
        const idx = unit.moves.findIndex((m) => !m);
        if (idx < 0) return;
        unit.moves[idx] = { ...sig, slot: idx, source: `來自${mate.name}`, learned_from: mate.name };
        log(`${unit.name} 向場上隊友 ${mate.name} 學會「${sig.name}」！`);
        phase = 'select';
        endUnitTurn();
      });
      learnOptions.appendChild(btn);
    });

  if (!learnOptions.children.length) {
    learnOptions.textContent = '沒有可疊的隊友卡（需相同可學屬性）';
  }
}

function renderUnitPanel(unit) {
  if (!unit) {
    unitPortrait.className = 'portrait-wrap empty';
    unitPortrait.textContent = '—';
    unitInfo.textContent = '等待行動';
    statBars.hidden = true;
    return;
  }
  unitPortrait.className = 'portrait-wrap';
  unitPortrait.innerHTML = `<img src="${spriteUrl(unit.sprite)}" alt="${unit.name}" onerror="this.style.display='none'" />`;
  const avail = availableMoveCount(unit);
  const cell = terrainAt(unit.x, unit.y);
  unitInfo.innerHTML = `
    <strong>${unit.name}</strong> <span class="badge">${unit.trainerName}</span><br>
    屬性 ${unit.types.join(' / ')} · 先攻 ${effectiveInitiative(unit)}<br>
    地形：${cell.name} (${unit.x},${unit.y})<br>
    剩餘招式 <strong>${avail}</strong> / ${unit.moves.filter(Boolean).length}`;
  statBars.hidden = false;
  hpFill.style.width = `${(unit.hp / unit.maxHp) * 100}%`;
  hpFill.style.background = unit.hp <= Math.ceil(unit.maxHp / 3) ? 'var(--hp-low)' : 'var(--hp)';
  hpText.textContent = `${unit.hp}/${unit.maxHp}`;
  staminaFill.style.width = `${(unit.stamina / unit.maxStamina) * 100}%`;
  staminaText.textContent = `${unit.stamina}/${unit.maxStamina}`;
}

function render() {
  const hl = highlightCells();
  boardEl.innerHTML = '';

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell = document.createElement('div');
      const t = terrainAt(x, y);
      cell.className = `cell ${t.css || 'terrain-plain'}`;
      if (t.blocked) cell.classList.add('blocked');
      if (hl.move.some((c) => c.x === x && c.y === y)) cell.classList.add('move-range');
      if (hl.attack.some((c) => c.x === x && c.y === y)) cell.classList.add('attack-range');

      const u = unitAt(x, y);
      if (u) {
        const token = document.createElement('div');
        token.className = 'token';
        token.style.borderColor = FACTION_COLORS[u.colorIndex] || '#fff';
        const img = document.createElement('img');
        img.src = spriteUrl(u.sprite);
        img.alt = u.name;
        img.onerror = () => img.remove();
        token.appendChild(img);
        const bar = document.createElement('div');
        bar.className = 'token-hp';
        bar.textContent = `HP${u.hp} 體${u.stamina}`;
        token.appendChild(bar);
        if (u.protecting) {
          const shield = document.createElement('div');
          shield.className = 'token-shield';
          shield.textContent = '🛡';
          token.appendChild(shield);
        }
        cell.appendChild(token);
        if (u.id === selectedId) cell.classList.add('selected-cell');
        if (u.id === currentUnitId) cell.classList.add('active-turn');
      }
      cell.title = t.name;
      cell.addEventListener('click', () => onCellClick(x, y));
      boardEl.appendChild(cell);
    }
  }

  const active = currentUnit();
  const winner = checkWinner();
  if (winner) {
    turnLabel.textContent = `🏆 ${winner.name_zh} 獲勝！`;
  } else if (active) {
    const t = getTrainer(active.trainerId);
    turnLabel.textContent = `第 ${roundNumber} 回合 · ${t?.name_zh || ''} 的 ${active.name}`;
  } else {
    turnLabel.textContent = '對戰結束';
  }

  const phaseNames = {
    select: '選擇行動（移動 / 攻擊 / 學招 / 回氣）',
    move: '選擇移動目標',
    attack: '選擇攻擊目標',
    learn: '疊隊友卡學招',
  };
  phaseLabel.textContent = phaseNames[phase] || '';

  renderInitiativeTrack();
  renderTrainersPanel();
  const u = selectedUnit();
  renderUnitPanel(u);
  renderMoveSlots(u);
  renderLearnPanel(u);

  const canAct = u && active && u.id === active.id && u.hp > 0 && !winner;
  const move = u ? getActiveMove(u) : null;
  const exhausted = u ? allMovesExhausted(u) : false;

  btnMove.disabled = !canAct || phase !== 'select';
  btnAttack.disabled = !canAct || phase !== 'select' || !move || u.stamina < MOVE_STAMINA_COST;
  btnRecharge.disabled = !canAct || phase !== 'select' || !exhausted || u.stamina < RECHARGE_STAMINA_COST;
  btnLearn.disabled = !canAct || phase !== 'select' || !u.moves.some((m) => !m);

  const trainer = u ? getTrainer(u.trainerId) : null;
  const ability = trainer?.ability;
  const abilityAvailable = ability?.passive === 'once_reroll_failed'
    && (trainerAbilityUses[trainer?.id] || 0) < (ability.uses || 1);
  if (btnAbility) {
    btnAbility.disabled = !canAct || !abilityAvailable;
    btnAbility.title = ability?.description || '';
    btnAbility.textContent = ability ? `訓練家：${ability.name}` : '訓練家能力';
  }

  if (winner) {
    btnMove.disabled = btnAttack.disabled = btnRecharge.disabled = btnLearn.disabled = true;
    if (btnAbility) btnAbility.disabled = true;
  }
}

function onCellClick(x, y) {
  const clicked = unitAt(x, y);
  const active = currentUnit();

  if (phase === 'select') {
    if (clicked && active && clicked.id === active.id) {
      selectedId = clicked.id;
      const firstAvail = clicked.moves.findIndex((m, i) => m && !clicked.moveUsed[i]);
      selectedMoveIndex = firstAvail >= 0 ? firstAvail : 0;
      render();
    }
    return;
  }

  const u = selectedUnit();
  if (!u || !active || u.id !== active.id) return;

  if (phase === 'move') {
    const valid = adjacentCells(u.x, u.y, u);
    const target = valid.find((c) => c.x === x && c.y === y);
    if (!target) return;
    u.x = x;
    u.y = y;
    log(`${u.name} 移動至 ${terrainAt(x, y).name} (${x},${y})`);
    endUnitTurn();
    return;
  }

  if (phase === 'attack') {
    executeAttack(u, getActiveMove(u), { x, y });
  }
}

function endUnitTurn() {
  removeDeadUnits();
  if (checkWinner() !== null) {
    render();
    return;
  }
  advanceToNextUnit();
  render();
}

function showSetup() {
  gameStarted = false;
  setupOverlay.hidden = false;
  renderSetupPanel();
}

function renderSetupPanel() {
  if (!setupTrainers) return;
  setupTrainers.innerHTML = '';
  const selected = new Set(matchConfig.trainerIds.length
    ? matchConfig.trainerIds
    : trainersData.default_match.slice(0, 6));

  trainersData.trainers.forEach((t) => {
    const label = document.createElement('label');
    label.className = 'setup-trainer-opt';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = t.id;
    cb.checked = selected.has(t.id);
    cb.addEventListener('change', () => {
      const checked = [...setupTrainers.querySelectorAll('input:checked')].map((el) => parseInt(el.value, 10));
      matchConfig.trainerIds = checked.slice(0, MAX_TRAINERS);
      renderSetupPanel();
    });
    label.appendChild(cb);
    const abilityHint = t.ability ? ` ⚡${t.ability.name}` : '';
    label.appendChild(document.createTextNode(`${t.name_zh}${abilityHint}`));
    setupTrainers.appendChild(label);
  });
}

btnMove.addEventListener('click', () => { if (selectedUnit()) { phase = 'move'; render(); } });
btnAttack.addEventListener('click', () => {
  const u = selectedUnit();
  if (u && getActiveMove(u) && u.stamina >= MOVE_STAMINA_COST) { phase = 'attack'; render(); }
});
btnRecharge.addEventListener('click', () => {
  const u = selectedUnit();
  if (!u || !allMovesExhausted(u) || u.stamina < RECHARGE_STAMINA_COST) return;
  u.stamina -= RECHARGE_STAMINA_COST;
  u.moveUsed = [false, false, false, false];
  log(`${u.name} 回氣（−2 體力，剩 ${u.stamina}）`);
  endUnitTurn();
});
btnLearn.addEventListener('click', () => { if (selectedUnit()) { phase = 'learn'; render(); } });
if (btnAbility) {
  btnAbility.addEventListener('click', () => {
    const u = currentUnit();
    if (!u) return;
    const trainer = getTrainer(u.trainerId);
    if (trainer?.ability?.passive === 'once_reroll_failed') {
      log(`【${trainer.ability.name}】已備妥，下次攻擊失敗骰將自動重投。`);
    }
  });
}
btnEnd.addEventListener('click', () => endUnitTurn());
btnRestart.addEventListener('click', () => { logEl.innerHTML = ''; if (diceLogEl) diceLogEl.innerHTML = ''; showSetup(); });
if (btnStartBattle) {
  btnStartBattle.addEventListener('click', () => {
    matchConfig.mode = setupMode?.value || 'team';
    matchConfig.partySize = parseInt(setupPartySize?.value || '3', 10);
    matchConfig.randomTerrain = setupTerrain?.checked ?? true;
    const checked = [...(setupTrainers?.querySelectorAll('input:checked') || [])]
      .map((el) => parseInt(el.value, 10));
    if (checked.length < 2) {
      alert('請至少選擇 2 位訓練家');
      return;
    }
    matchConfig.trainerIds = checked.slice(0, MAX_TRAINERS);
    setupOverlay.hidden = true;
    logEl.innerHTML = '';
    if (diceLogEl) diceLogEl.innerHTML = '';
    setupGame();
  });
}

loadData().then(() => showSetup());
