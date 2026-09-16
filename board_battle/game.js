/**
 * Johto War ZA board battle — grid combat using ZA move range & AOE data.
 */

const BOARD_SIZE = 8;
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

const FALLBACK_ROSTER = [
  { name: '皮卡丘', move: '十萬伏特', type: 'electric', health: 5, initiative: 8, power: 4,
    range_tiles: 4, aoe_type: 'RANGED', aoe_radius: 0, distance_zh: '遠距', aoe_zh: '遠程射擊' },
  { name: '噴火龍', move: '噴射火焰', type: 'fire', health: 8, initiative: 7, power: 4,
    range_tiles: 3, aoe_type: 'RANGED', aoe_radius: 0, distance_zh: '遠距', aoe_zh: '遠程射擊' },
  { name: '水箭龜', move: '水炮', type: 'water', health: 8, initiative: 6, power: 5,
    range_tiles: 4, aoe_type: 'RANGED', aoe_radius: 0, distance_zh: '遠距', aoe_zh: '遠程射擊' },
  { name: '妙蛙花', move: '日光束', type: 'grass', health: 9, initiative: 5, power: 6,
    range_tiles: 5, aoe_type: 'RANGED', aoe_radius: 0, distance_zh: '遠距', aoe_zh: '遠程射擊' },
  { name: '卡比獸', move: '泰山壓頂', type: 'normal', health: 12, initiative: 3, power: 5,
    range_tiles: 2, aoe_type: 'MELEE', aoe_radius: 0, distance_zh: '近距', aoe_zh: '單體近戰' },
  { name: '耿鬼', move: '暗影球', type: 'ghost', health: 6, initiative: 9, power: 4,
    range_tiles: 5, aoe_type: 'RANGED', aoe_radius: 0, distance_zh: '遠距', aoe_zh: '遠程射擊' },
];

let roster = [];
let units = [];
let currentPlayer = 1;
let phase = 'select'; // select | move | attack
let selectedId = null;
let actedThisTurn = new Set();

const boardEl = document.getElementById('board');
const turnLabel = document.getElementById('turn-label');
const phaseLabel = document.getElementById('phase-label');
const unitInfo = document.getElementById('unit-info');
const moveInfo = document.getElementById('move-info');
const logEl = document.getElementById('log');
const btnMove = document.getElementById('btn-move');
const btnAttack = document.getElementById('btn-attack');
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

function typeMultiplier(atkType, defType) {
  const row = TYPE_CHART[atkType] || {};
  const mod = row[defType] ?? 0;
  if (mod === -4) return 0;
  if (mod === 2) return 1.5;
  if (mod === -2) return 0.67;
  return 1;
}

function buildUnit(template, player, x, y, id) {
  return {
    id,
    player,
    name: template.name,
    move: template.move,
    type: template.type,
    maxHp: template.health,
    hp: template.health,
    power: Number(template.power) || 3,
    range: template.range_tiles || 2,
    aoeType: template.aoe_type || 'MELEE',
    aoeRadius: template.aoe_radius || 0,
    distanceZh: template.distance_zh || '近距',
    aoeZh: template.aoe_zh || '單體近戰',
    x,
    y,
  };
}

function setupGame() {
  units = [];
  currentPlayer = 1;
  phase = 'select';
  selectedId = null;
  actedThisTurn = new Set();

  const picks = roster.length >= 6 ? roster : FALLBACK_ROSTER;
  const p1Templates = [picks[0], picks[2], picks[4]];
  const p2Templates = [picks[1], picks[3], picks[5]];

  let id = 0;
  [[1, 0], [1, 1], [1, 2]].forEach(([x, y], i) => {
    units.push(buildUnit(p1Templates[i], 1, x, y, id++));
  });
  [[6, 5], [6, 6], [6, 7]].forEach(([x, y], i) => {
    units.push(buildUnit(p2Templates[i], 2, x, y, id++));
  });

  log('對戰開始！玩家 1（青）先手。');
  render();
}

async function loadRoster() {
  try {
    const res = await fetch('data/pokemon_roster.json');
    if (res.ok) {
      roster = await res.json();
      return;
    }
  } catch (_) { /* offline fallback */ }
  roster = FALLBACK_ROSTER;
}

function selectedUnit() {
  return units.find((u) => u.id === selectedId);
}

function living(player) {
  return units.filter((u) => u.player === player && u.hp > 0);
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
      if (manhattan(origin, { x, y }) <= range && manhattan(origin, { x, y }) > 0) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function aoeCells(attacker, target) {
  const { aoeType, aoeRadius, range } = attacker;
  const origin = { x: attacker.x, y: attacker.y };

  if (aoeType === 'MELEE') {
    return manhattan(origin, target) === 1 ? [target] : [];
  }
  if (aoeType === 'RANGED') {
    return manhattan(origin, target) <= range && manhattan(origin, target) > 0 ? [target] : [];
  }
  if (aoeType === 'AOE_CENTER' || aoeType === 'AOE_OVERHEAD') {
    const center = target;
    const hit = [];
    for (let x = center.x - aoeRadius; x <= center.x + aoeRadius; x++) {
      for (let y = center.y - aoeRadius; y <= center.y + aoeRadius; y++) {
        if (inBounds(x, y) && manhattan(center, { x, y }) <= aoeRadius) hit.push({ x, y });
      }
    }
    return hit;
  }
  if (aoeType === 'SELF_ORIGIN') {
    const hit = [];
    const r = Math.max(aoeRadius, 1);
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
  // TRAP / OTHER — treat as ranged single
  return manhattan(origin, target) <= range ? [target] : [];
}

function highlightCells() {
  const u = selectedUnit();
  if (!u || u.player !== currentPlayer || actedThisTurn.has(u.id)) return { move: [], attack: [], aoe: [] };

  if (phase === 'move') {
    return { move: adjacentCells(u.x, u.y), attack: [], aoe: [] };
  }
  if (phase === 'attack') {
    const attack = cellsInRange({ x: u.x, y: u.y }, u.range);
    return { move: [], attack, aoe: [] };
  }
  return { move: [], attack: [], aoe: [] };
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

      const key = `${x},${y}`;
      const isMove = hl.move.some((c) => c.x === x && c.y === y);
      const isAttack = hl.attack.some((c) => c.x === x && c.y === y);
      if (isMove) cell.classList.add('move-range');
      if (isAttack) cell.classList.add('attack-range');

      const u = unitAt(x, y);
      if (u) {
        const token = document.createElement('div');
        token.className = `token p${u.player}`;
        token.textContent = u.name.slice(0, 2);
        token.title = `${u.name} HP ${u.hp}/${u.maxHp}`;
        cell.appendChild(token);
        if (u.id === selectedId) cell.style.outline = '2px solid #fff';
      }

      cell.addEventListener('click', () => onCellClick(x, y));
      boardEl.appendChild(cell);
    }
  }

  const alive1 = living(1).length;
  const alive2 = living(2).length;
  turnLabel.textContent = `玩家 ${currentPlayer} · 剩餘 P1:${alive1} / P2:${alive2}`;
  phaseLabel.textContent = phase === 'select' ? '選擇單位' : phase === 'move' ? '選擇移動目標' : '選擇攻擊目標';

  const u = selectedUnit();
  if (u) {
    unitInfo.innerHTML = `<strong>${u.name}</strong><br>HP ${u.hp}/${u.maxHp}<br>屬性 ${u.type}`;
    moveInfo.innerHTML = `<strong>${u.move}</strong><br>
      <span class="badge">${u.distanceZh}</span>
      <span class="badge">${u.range} 格</span>
      <span class="badge">${u.aoeZh}</span>
      <br>威力 ${u.power}`;
  } else {
    unitInfo.textContent = '點選己方寶可夢';
    moveInfo.textContent = '—';
  }

  const canAct = u && u.player === currentPlayer && !actedThisTurn.has(u.id);
  btnMove.disabled = !canAct || phase !== 'select';
  btnAttack.disabled = !canAct || phase !== 'select';
  btnEnd.disabled = false;

  if (alive1 === 0 || alive2 === 0) {
    const winner = alive1 > 0 ? 1 : 2;
    turnLabel.textContent = `玩家 ${winner} 獲勝！`;
    btnMove.disabled = true;
    btnAttack.disabled = true;
  }
}

function onCellClick(x, y) {
  const clicked = unitAt(x, y);

  if (phase === 'select') {
    if (clicked && clicked.player === currentPlayer && !actedThisTurn.has(clicked.id)) {
      selectedId = clicked.id;
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
    const hits = aoeCells(u, { x, y });
    if (!hits.length) return;

    // Preview AOE on board briefly
    document.querySelectorAll('.cell').forEach((el) => {
      const cx = Number(el.dataset.x);
      const cy = Number(el.dataset.y);
      if (hits.some((h) => h.x === cx && h.y === cy)) el.classList.add('aoe-range');
    });

    const victims = units.filter(
      (t) => t.hp > 0 && t.player !== u.player && hits.some((h) => h.x === t.x && h.y === t.y),
    );

    if (!victims.length) {
      log(`${u.name} 使用 ${u.move}，但沒有命中敵人。`);
    } else {
      victims.forEach((t) => {
        const mult = typeMultiplier(u.type, t.type);
        const dmg = Math.max(1, Math.round(u.power * mult));
        t.hp = Math.max(0, t.hp - dmg);
        const eff = mult > 1 ? '效果絕佳' : mult < 1 ? '效果不好' : '普通';
        log(`${u.name} 的 ${u.move} 命中 ${t.name}，造成 ${dmg} 傷害（${eff}）`);
      });
    }
    endUnitTurn();
  }
}

function endUnitTurn() {
  const u = selectedUnit();
  if (u) actedThisTurn.add(u.id);
  selectedId = null;
  phase = 'select';

  const allActed = living(currentPlayer).every((u) => actedThisTurn.has(u.id));
  if (allActed) {
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
  if (!selectedUnit()) return;
  phase = 'attack';
  render();
});

btnEnd.addEventListener('click', () => {
  actedThisTurn = new Set();
  selectedId = null;
  phase = 'select';
  currentPlayer = currentPlayer === 1 ? 2 : 1;
  log(`玩家 ${currentPlayer} 結束等待，換對手回合。`);
  render();
});

btnRestart.addEventListener('click', () => {
  logEl.innerHTML = '';
  setupGame();
});

loadRoster().then(setupGame);
