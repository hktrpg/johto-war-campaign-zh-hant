/**
 * Johto War ZA board battle
 * - 6 HP per Pokemon
 * - 4 moves: signature + up to 3 learned via card stacking (same learnable type)
 * - 1 HP per attack, 2 HP to recharge when all moves exhausted
 */

const BOARD_SIZE = 8;
const MAX_HP = 6;
const MOVE_HP_COST = 1;
const RECHARGE_HP_COST = 2;

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
};

const DEFAULT_TEAMS = {
  p1: ['妙蛙種子', '小火龍', '傑尼龜'],
  p2: ['皮卡丘', '卡比獸', '耿鬼'],
};

let pokemonPool = [];
let units = [];
let currentPlayer = 1;
let phase = 'select'; // select | move | attack | learn
let selectedId = null;
let selectedMoveIndex = 0;
let actedThisTurn = new Set();

const boardEl = document.getElementById('board');
const turnLabel = document.getElementById('turn-label');
const phaseLabel = document.getElementById('phase-label');
const unitInfo = document.getElementById('unit-info');
const unitPortrait = document.getElementById('unit-portrait');
const hpBar = document.getElementById('hp-bar');
const hpFill = document.getElementById('hp-fill');
const moveSlotsEl = document.getElementById('move-slots');
const moveDetail = document.getElementById('move-detail');
const learnPanel = document.getElementById('learn-panel');
const learnOptions = document.getElementById('learn-options');
const logEl = document.getElementById('log');
const btnMove = document.getElementById('btn-move');
const btnAttack = document.getElementById('btn-attack');
const btnRecharge = document.getElementById('btn-recharge');
const btnLearn = document.getElementById('btn-learn');
const btnEnd = document.getElementById('btn-end');
const btnRestart = document.getElementById('btn-restart');

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function inBounds(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

function unitAt(x, y) {
  return units.find((u) => u.hp > 0 && u.x === x && u.y === y);
}

function log(msg) {
  const li = document.createElement('li');
  li.textContent = msg;
  logEl.prepend(li);
}

function spriteUrl(sprite) {
  return `assets/pokemon/${sprite}`;
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

function findPokemon(name) {
  return pokemonPool.find((p) => p.name === name);
}

function buildMovesFromTemplate(template) {
  const moves = [{ ...template.signature_move, slot: 0, source: '招牌' }];
  for (const learned of template.learned_moves || []) {
    moves.push({ ...learned, slot: moves.length, source: learned.slot_label || `來自${learned.learned_from}` });
  }
  while (moves.length < 4) {
    moves.push(null);
  }
  return moves.slice(0, 4);
}

function buildUnit(template, player, x, y, id) {
  const moves = buildMovesFromTemplate(template);
  return {
    id,
    player,
    templateId: template.id,
    name: template.name,
    sprite: template.sprite,
    types: template.types.length ? template.types : [template.type_1],
    learnableTypes: template.learnable_types || [],
    initiative: template.initiative || 5,
    maxHp: MAX_HP,
    hp: MAX_HP,
    moves,
    moveUsed: [false, false, false, false],
    x,
    y,
  };
}

function availableMoveCount(unit) {
  return unit.moves.filter((m, i) => m && !unit.moveUsed[i]).length;
}

function allMovesExhausted(unit) {
  return unit.moves.every((m, i) => !m || unit.moveUsed[i]);
}

function hasAnyMove(unit) {
  return unit.moves.some(Boolean);
}

function getActiveMove(unit) {
  const move = unit.moves[selectedMoveIndex];
  if (!move || unit.moveUsed[selectedMoveIndex]) return null;
  return move;
}

function setupGame() {
  units = [];
  currentPlayer = 1;
  phase = 'select';
  selectedId = null;
  selectedMoveIndex = 0;
  actedThisTurn = new Set();

  const p1Names = DEFAULT_TEAMS.p1;
  const p2Names = DEFAULT_TEAMS.p2;
  const p1Templates = p1Names.map((n) => findPokemon(n)).filter(Boolean);
  const p2Templates = p2Names.map((n) => findPokemon(n)).filter(Boolean);

  if (p1Templates.length < 3 || p2Templates.length < 3) {
    pokemonPool.slice(0, 6).forEach((p, i) => {
      const player = i < 3 ? 1 : 2;
      const positions = player === 1 ? [[1, 0], [1, 1], [1, 2]] : [[6, 5], [6, 6], [6, 7]];
      const idx = i % 3;
      units.push(buildUnit(p, player, positions[idx][0], positions[idx][1], i));
    });
  } else {
    let id = 0;
    [[1, 0], [1, 1], [1, 2]].forEach(([x, y], i) => {
      units.push(buildUnit(p1Templates[i], 1, x, y, id++));
    });
    [[6, 5], [6, 6], [6, 7]].forEach(([x, y], i) => {
      units.push(buildUnit(p2Templates[i], 2, x, y, id++));
    });
  }

  applyTeamLearning();
  log('對戰開始！每隻 6 HP，四招式，出招 −1 HP，用光招需 −2 HP 回氣。');
  render();
}

/** Re-run learning between teammates (simulates stacking cards under unit). */
function applyTeamLearning() {
  for (const player of [1, 2]) {
    const team = units.filter((u) => u.player === player);
    for (const unit of team) {
      for (const mate of team) {
        if (mate.id === unit.id) continue;
        const sig = mate.moves[0];
        if (!sig) continue;
        if (!unit.learnableTypes.includes(sig.type)) continue;
        if (unit.moves.some((m) => m && m.name === sig.name)) continue;
        const emptyIdx = unit.moves.findIndex((m) => !m);
        if (emptyIdx < 0) continue;
        unit.moves[emptyIdx] = {
          ...sig,
          slot: emptyIdx,
          source: `來自${mate.name}`,
          learned_from: mate.name,
        };
      }
    }
  }
}

async function loadData() {
  try {
    const res = await fetch('data/pokemon_battle.json');
    if (res.ok) {
      pokemonPool = await res.json();
      return;
    }
  } catch (_) { /* fallback */ }
  pokemonPool = [];
}

function selectedUnit() {
  return units.find((u) => u.id === selectedId);
}

function living(player) {
  return units.filter((u) => u.player === player && u.hp > 0);
}

function teammates(unit) {
  return units.filter((u) => u.player === unit.player && u.hp > 0 && u.id !== unit.id);
}

function adjacentCells(x, y) {
  const out = [];
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(nx, ny) && !unitAt(nx, ny)) out.push({ x: nx, y: ny });
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

  if (aoeType === 'MELEE') {
    return manhattan(origin, target) === 1 ? [target] : [];
  }
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

function highlightCells() {
  const u = selectedUnit();
  if (!u || u.player !== currentPlayer || actedThisTurn.has(u.id)) {
    return { move: [], attack: [] };
  }
  if (phase === 'move') {
    return { move: adjacentCells(u.x, u.y), attack: [] };
  }
  if (phase === 'attack') {
    const move = getActiveMove(u);
    if (!move) return { move: [], attack: [] };
    return { move: [], attack: cellsInRange({ x: u.x, y: u.y }, move.range_tiles || 2) };
  }
  return { move: [], attack: [] };
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
      btn.innerHTML = `<span class="slot-tag">槽 ${i + 1}</span>空槽（可疊卡）`;
    } else {
      if (unit.moveUsed[i]) btn.classList.add('used');
      if (i === selectedMoveIndex) btn.classList.add('selected');
      const tag = i === 0 ? '招牌' : (move.source || '學會');
      btn.innerHTML = `<span class="slot-tag">${tag}</span>${move.name}<br><span class="power">威力 ${move.power}</span>`;
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
    moveDetail.innerHTML = `
      <strong>${move.name}</strong>
      <span class="badge">${move.distance_zh || '—'}</span>
      <span class="badge">${move.range_tiles || 0} 格</span>
      <span class="badge">${move.aoe_zh || '—'}</span>
      <br>屬性 ${move.type} · 攻擊力 <strong>${move.power}</strong>
      ${move.effect ? `<br><em>${move.effect}</em>` : ''}`;
  } else {
    moveDetail.textContent = allMovesExhausted(unit) ? '四招已用光，需回氣（−2 HP）' : '選擇招式';
  }
}

function renderLearnPanel(unit) {
  learnOptions.innerHTML = '';
  if (!unit || phase !== 'learn') {
    learnPanel.hidden = true;
    return;
  }
  learnPanel.hidden = false;

  const emptySlots = unit.moves.map((m, i) => (m ? -1 : i)).filter((i) => i >= 0);
  if (!emptySlots.length) {
    learnOptions.textContent = '四招已滿';
    return;
  }

  teammates(unit).forEach((mate) => {
    const sig = mate.moves[0];
    if (!sig) return;
    if (!unit.learnableTypes.includes(sig.type)) return;
    if (unit.moves.some((m) => m && m.name === sig.name)) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'learn-btn';
    btn.textContent = `疊 ${mate.name} 的卡 → 學會「${sig.name}」（${sig.type}）`;
    btn.addEventListener('click', () => {
      const idx = unit.moves.findIndex((m) => !m);
      if (idx < 0) return;
      unit.moves[idx] = {
        ...sig,
        slot: idx,
        source: `來自${mate.name}`,
        learned_from: mate.name,
      };
      log(`${unit.name} 疊上 ${mate.name} 的卡片，學會「${sig.name}」！`);
      phase = 'select';
      render();
    });
    learnOptions.appendChild(btn);
  });

  if (!learnOptions.children.length) {
    learnOptions.textContent = '沒有可學的隊友招式（需相同可學屬性）';
  }
}

function renderUnitPanel(unit) {
  if (!unit) {
    unitPortrait.className = 'portrait-wrap empty';
    unitPortrait.textContent = '—';
    unitInfo.textContent = '點選己方寶可夢';
    hpBar.hidden = true;
    return;
  }

  unitPortrait.className = 'portrait-wrap';
  unitPortrait.innerHTML = `<img src="${spriteUrl(unit.sprite)}" alt="${unit.name}" onerror="this.style.display='none'" />`;
  const types = unit.types.join(' / ');
  const avail = availableMoveCount(unit);
  unitInfo.innerHTML = `
    <strong>${unit.name}</strong><br>
    屬性 ${types}<br>
    可學：${unit.learnableTypes.join('、')}<br>
    剩餘招式 <strong>${avail}</strong> / ${unit.moves.filter(Boolean).length}`;
  hpBar.hidden = false;
  const pct = (unit.hp / unit.maxHp) * 100;
  hpFill.style.width = `${pct}%`;
  hpFill.style.background = unit.hp <= 2 ? 'var(--hp-low)' : 'var(--hp)';
}

function render() {
  const hl = highlightCells();
  boardEl.innerHTML = '';

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = x;
      cell.dataset.y = y;

      if (hl.move.some((c) => c.x === x && c.y === y)) cell.classList.add('move-range');
      if (hl.attack.some((c) => c.x === x && c.y === y)) cell.classList.add('attack-range');

      const u = unitAt(x, y);
      if (u) {
        const token = document.createElement('div');
        token.className = `token p${u.player}`;
        const img = document.createElement('img');
        img.src = spriteUrl(u.sprite);
        img.alt = u.name;
        img.onerror = () => { img.remove(); };
        token.appendChild(img);
        const hp = document.createElement('div');
        hp.className = 'token-hp';
        hp.textContent = `${u.hp}/${u.maxHp}`;
        token.appendChild(hp);
        const mc = document.createElement('div');
        mc.className = 'token-moves';
        mc.textContent = `${availableMoveCount(u)}招`;
        token.appendChild(mc);
        cell.appendChild(token);
        if (u.id === selectedId) cell.style.outline = '2px solid #fff';
      }

      cell.addEventListener('click', () => onCellClick(x, y));
      boardEl.appendChild(cell);
    }
  }

  const alive1 = living(1).length;
  const alive2 = living(2).length;
  turnLabel.textContent = `玩家 ${currentPlayer} · 場上 P1:${alive1} / P2:${alive2}`;
  const phaseNames = {
    select: '選擇單位與招式',
    move: '選擇移動目標',
    attack: '選擇攻擊目標',
    learn: '選擇要疊的隊友卡',
  };
  phaseLabel.textContent = phaseNames[phase] || '';

  const u = selectedUnit();
  renderUnitPanel(u);
  renderMoveSlots(u);
  renderLearnPanel(u);

  const canAct = u && u.player === currentPlayer && !actedThisTurn.has(u.id) && u.hp > 0;
  const move = u ? getActiveMove(u) : null;
  const exhausted = u ? allMovesExhausted(u) : false;

  btnMove.disabled = !canAct || phase !== 'select';
  btnAttack.disabled = !canAct || phase !== 'select' || !move || u.hp < MOVE_HP_COST;
  btnRecharge.disabled = !canAct || phase !== 'select' || !exhausted || u.hp < RECHARGE_HP_COST;
  btnLearn.disabled = !canAct || phase !== 'select' || !u.moves.some((m) => !m);

  if (alive1 === 0 || alive2 === 0) {
    const winner = alive1 > 0 ? 1 : 2;
    turnLabel.textContent = `玩家 ${winner} 獲勝！`;
    btnMove.disabled = true;
    btnAttack.disabled = true;
    btnRecharge.disabled = true;
    btnLearn.disabled = true;
  }
}

function onCellClick(x, y) {
  const clicked = unitAt(x, y);

  if (phase === 'select') {
    if (clicked && clicked.player === currentPlayer && !actedThisTurn.has(clicked.id) && clicked.hp > 0) {
      selectedId = clicked.id;
      const firstAvail = clicked.moves.findIndex((m, i) => m && !clicked.moveUsed[i]);
      selectedMoveIndex = firstAvail >= 0 ? firstAvail : 0;
      render();
    }
    return;
  }

  const u = selectedUnit();
  if (!u) return;

  if (phase === 'move') {
    const valid = adjacentCells(u.x, u.y);
    if (!valid.some((c) => c.x === x && c.y === y)) return;
    u.x = x;
    u.y = y;
    log(`${u.name} 移動至 (${x},${y})`);
    endUnitTurn();
    return;
  }

  if (phase === 'attack') {
    const move = getActiveMove(u);
    if (!move || u.hp < MOVE_HP_COST) return;

    const hits = aoeCells(u, move, { x, y });
    if (!hits.length) return;

    u.hp -= MOVE_HP_COST;
    u.moveUsed[selectedMoveIndex] = true;

    const victims = units.filter(
      (t) => t.hp > 0 && t.player !== u.player && hits.some((h) => h.x === t.x && h.y === t.y),
    );

    if (!victims.length) {
      log(`${u.name} 使用「${move.name}」（−1 HP），未命中敵人。`);
    } else {
      victims.forEach((t) => {
        const mult = typeMultiplier(move.type, t.types);
        const dmg = mult === 0 ? 0 : Math.max(1, Math.round(move.power * mult));
        t.hp = Math.max(0, t.hp - dmg);
        const eff = mult === 0 ? '無效' : mult > 1 ? '效果絕佳' : mult < 1 ? '效果不好' : '普通';
        log(`${u.name}「${move.name}」→ ${t.name}，${dmg} 傷害（${eff}，攻擊力 ${move.power}）`);
      });
      log(`${u.name} 消耗 1 HP（剩 ${u.hp}）`);
    }

    if (u.hp <= 0) {
      log(`${u.name} HP 歸零，退場！`);
    }

    endUnitTurn();
  }
}

function endUnitTurn() {
  const u = selectedUnit();
  if (u && u.hp > 0) actedThisTurn.add(u.id);
  selectedId = null;
  phase = 'select';

  units = units.filter((u) => u.hp > 0);

  const allActed = living(currentPlayer).every((u) => actedThisTurn.has(u.id));
  if (allActed && living(currentPlayer).length) {
    actedThisTurn = new Set();
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    log(`—— 玩家 ${currentPlayer} 的回合 ——`);
  }
  render();
}

btnMove.addEventListener('click', () => {
  if (!selectedUnit()) return;
  phase = 'move';
  render();
});

btnAttack.addEventListener('click', () => {
  const u = selectedUnit();
  if (!u || !getActiveMove(u) || u.hp < MOVE_HP_COST) return;
  phase = 'attack';
  render();
});

btnRecharge.addEventListener('click', () => {
  const u = selectedUnit();
  if (!u || !allMovesExhausted(u) || u.hp < RECHARGE_HP_COST) return;
  u.hp -= RECHARGE_HP_COST;
  u.moveUsed = [false, false, false, false];
  log(`${u.name} 回氣恢復四招（−2 HP，剩 ${u.hp}）`);
  if (u.hp <= 0) {
    log(`${u.name} HP 歸零，退場！`);
    units = units.filter((x) => x.hp > 0);
    endUnitTurn();
    return;
  }
  render();
});

btnLearn.addEventListener('click', () => {
  if (!selectedUnit()) return;
  phase = 'learn';
  render();
});

btnEnd.addEventListener('click', () => {
  actedThisTurn = new Set();
  selectedId = null;
  phase = 'select';
  currentPlayer = currentPlayer === 1 ? 2 : 1;
  log(`玩家 ${currentPlayer} 結束回合。`);
  render();
});

btnRestart.addEventListener('click', () => {
  logEl.innerHTML = '';
  setupGame();
});

loadData().then(setupGame);
