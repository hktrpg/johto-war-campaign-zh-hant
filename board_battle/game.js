/**
 * Johto War ZA board battle — up to 6 trainers, 1–4 Pokemon each.
 * HP = card health; 體力 = 6-point move resource.
 */

const BOARD_SIZE = 8;
const MAX_STAMINA = 6;
const MOVE_STAMINA_COST = 1;
const RECHARGE_STAMINA_COST = 2;
const MAX_TRAINERS = 6;

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

const FACTION_COLORS = ['#4ecdc4', '#ff6b6b', '#a78bfa', '#fbbf24', '#60a5fa', '#f472b6'];

let trainersData = { trainers: [], default_match: [] };
let matchTrainers = [];
let units = [];
let currentTrainerId = null;
let trainerTurnOrder = [];
let turnIndex = 0;
let phase = 'select';
let selectedId = null;
let selectedMoveIndex = 0;
let actedThisTurn = new Set();

const boardEl = document.getElementById('board');
const turnLabel = document.getElementById('turn-label');
const phaseLabel = document.getElementById('phase-label');
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

function getTrainer(id) {
  return matchTrainers.find((t) => t.id === id);
}

function currentTrainer() {
  return getTrainer(currentTrainerId);
}

function trainerAvgInitiative(trainer) {
  if (!trainer.party.length) return 0;
  return trainer.party.reduce((s, p) => s + (p.initiative || 5), 0) / trainer.party.length;
}

function spawnPositions(trainerSlot, partySize, faction) {
  const local = trainerSlot % 3;
  const col = faction === 0 ? local : 5 + local;
  const startRow = faction === 0 ? 0 : Math.max(0, 8 - partySize);
  return Array.from({ length: partySize }, (_, i) => ({ x: col, y: startRow + i }));
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
    maxHp: template.health || 5,
    hp: template.health || 5,
    maxStamina: MAX_STAMINA,
    stamina: MAX_STAMINA,
    moves: buildMovesFromTemplate(template),
    moveUsed: [false, false, false, false],
    x: pos.x,
    y: pos.y,
  };
}

function livingUnits(trainerId) {
  return units.filter((u) => u.trainerId === trainerId && u.hp > 0);
}

function livingFaction(faction) {
  return units.filter((u) => u.faction === faction && u.hp > 0);
}

function isEnemy(a, b) {
  return a.faction !== b.faction;
}

function partyMates(unit) {
  const trainer = getTrainer(unit.trainerId);
  if (!trainer) return [];
  return trainer.party.filter((p) => p.name !== unit.name);
}

function setupGame() {
  units = [];
  phase = 'select';
  selectedId = null;
  selectedMoveIndex = 0;
  actedThisTurn = new Set();

  matchTrainers = trainersData.default_match
    .slice(0, MAX_TRAINERS)
    .map((id, slot) => {
      const t = trainersData.trainers.find((x) => x.id === id);
      if (!t) return null;
      return { ...t, slot };
    })
    .filter(Boolean);

  if (matchTrainers.length < 2) {
    log('訓練家資料不足，無法開始。');
    return;
  }

  trainerTurnOrder = [...matchTrainers]
    .sort((a, b) => trainerAvgInitiative(b) - trainerAvgInitiative(a))
    .map((t) => t.id);

  let unitId = 0;
  matchTrainers.forEach((trainer) => {
    const positions = spawnPositions(trainer.slot, trainer.party.length, trainer.faction);
    trainer.party.forEach((mon, i) => {
      units.push(buildUnit(mon, trainer, positions[i], unitId++));
    });
  });

  turnIndex = 0;
  currentTrainerId = nextActiveTrainerId(0);
  log(`對戰開始！${matchTrainers.length} 位訓練家，每人 ${matchTrainers[0]?.party?.length || '?'} 隻寶可夢。`);
  log(`先攻：${getTrainer(currentTrainerId)?.name_zh || ''}`);
  render();
}

function nextActiveTrainerId(fromIndex) {
  for (let i = 0; i < trainerTurnOrder.length; i++) {
    const idx = (fromIndex + i) % trainerTurnOrder.length;
    const tid = trainerTurnOrder[idx];
    if (livingUnits(tid).length > 0) return tid;
  }
  return null;
}

function advanceTrainerTurn() {
  const start = (turnIndex + 1) % trainerTurnOrder.length;
  for (let i = 0; i < trainerTurnOrder.length; i++) {
    const idx = (start + i) % trainerTurnOrder.length;
    const tid = trainerTurnOrder[idx];
    if (livingUnits(tid).length > 0) {
      turnIndex = idx;
      currentTrainerId = tid;
      actedThisTurn = new Set();
      const t = getTrainer(tid);
      log(`—— ${t?.name_zh || t?.name} 的回合 ——`);
      return;
    }
  }
}

function checkWinner() {
  const f0 = livingFaction(0).length;
  const f1 = livingFaction(1).length;
  if (f0 === 0 && f1 > 0) return 1;
  if (f1 === 0 && f0 > 0) return 0;
  return null;
}

async function loadData() {
  try {
    const res = await fetch('data/trainers.json');
    if (res.ok) {
      trainersData = await res.json();
      return;
    }
  } catch (_) { /* fallback */ }
  trainersData = { trainers: [], default_match: [] };
}

function selectedUnit() {
  return units.find((u) => u.id === selectedId);
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

function highlightCells() {
  const u = selectedUnit();
  if (!u || u.trainerId !== currentTrainerId || actedThisTurn.has(u.id)) {
    return { move: [], attack: [] };
  }
  if (phase === 'move') return { move: adjacentCells(u.x, u.y), attack: [] };
  if (phase === 'attack') {
    const move = getActiveMove(u);
    if (!move) return { move: [], attack: [] };
    return { move: [], attack: cellsInRange({ x: u.x, y: u.y }, move.range_tiles || 2) };
  }
  return { move: [], attack: [] };
}

function renderTrainersPanel() {
  trainersPanel.innerHTML = '';
  matchTrainers.forEach((trainer) => {
    const card = document.createElement('div');
    card.className = 'trainer-card';
    if (trainer.id === currentTrainerId) card.classList.add('active');
    card.style.borderColor = FACTION_COLORS[trainer.slot] || '#666';
    const alive = livingUnits(trainer.id).length;
    const total = trainer.party.length;
    card.innerHTML = `
      <img src="${trainerSpriteUrl(trainer.sprite)}" alt="" class="trainer-thumb" onerror="this.style.display='none'" />
      <div class="trainer-meta">
        <strong>${trainer.name_zh}</strong>
        <span class="trainer-faction">${trainer.faction === 0 ? 'A 陣' : 'B 陣'}</span>
        <span class="trainer-party">${alive}/${total} 隻</span>
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

  partyMates(unit).forEach((mate) => {
    const sig = mate.signature_move;
    if (!sig) return;
    if (!unit.learnableTypes.includes(sig.type)) return;
    if (unit.moves.some((m) => m && m.name === sig.name)) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'learn-btn';
    btn.textContent = `疊 ${mate.name} 的卡 →「${sig.name}」（${sig.type}）`;
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
        render();
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
    unitInfo.textContent = '點選己方寶可夢';
    statBars.hidden = true;
    return;
  }
  unitPortrait.className = 'portrait-wrap';
  unitPortrait.innerHTML = `<img src="${spriteUrl(unit.sprite)}" alt="${unit.name}" onerror="this.style.display='none'" />`;
  const avail = availableMoveCount(unit);
  unitInfo.innerHTML = `
    <strong>${unit.name}</strong> <span class="badge">${unit.trainerName}</span><br>
    屬性 ${unit.types.join(' / ')}<br>
    可學：${unit.learnableTypes.join('、')}<br>
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
      cell.className = 'cell';
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
        cell.appendChild(token);
        if (u.id === selectedId) cell.style.outline = '2px solid #fff';
      }
      cell.addEventListener('click', () => onCellClick(x, y));
      boardEl.appendChild(cell);
    }
  }

  const ct = currentTrainer();
  const f0 = livingFaction(0).length;
  const f1 = livingFaction(1).length;
  turnLabel.textContent = ct
    ? `回合：${ct.name_zh}（${ct.faction === 0 ? 'A' : 'B'} 陣）· A:${f0} B:${f1}`
    : '對戰結束';
  const phaseNames = {
    select: '選擇寶可夢與招式',
    move: '選擇移動目標',
    attack: '選擇攻擊目標',
    learn: '疊隊友卡學招',
  };
  phaseLabel.textContent = phaseNames[phase] || '';

  renderTrainersPanel();
  const u = selectedUnit();
  renderUnitPanel(u);
  renderMoveSlots(u);
  renderLearnPanel(u);

  const canAct = u && u.trainerId === currentTrainerId && !actedThisTurn.has(u.id) && u.hp > 0;
  const move = u ? getActiveMove(u) : null;
  const exhausted = u ? allMovesExhausted(u) : false;

  btnMove.disabled = !canAct || phase !== 'select';
  btnAttack.disabled = !canAct || phase !== 'select' || !move || u.stamina < MOVE_STAMINA_COST;
  btnRecharge.disabled = !canAct || phase !== 'select' || !exhausted || u.stamina < RECHARGE_STAMINA_COST;
  btnLearn.disabled = !canAct || phase !== 'select' || !u.moves.some((m) => !m);

  const winner = checkWinner();
  if (winner !== null) {
    turnLabel.textContent = `${winner === 0 ? 'A' : 'B'} 陣獲勝！`;
    btnMove.disabled = btnAttack.disabled = btnRecharge.disabled = btnLearn.disabled = true;
  }
}

function onCellClick(x, y) {
  const clicked = unitAt(x, y);
  if (phase === 'select') {
    if (
      clicked
      && clicked.trainerId === currentTrainerId
      && !actedThisTurn.has(clicked.id)
      && clicked.hp > 0
    ) {
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
    if (!move || u.stamina < MOVE_STAMINA_COST) return;
    const hits = aoeCells(u, move, { x, y });
    if (!hits.length) return;

    u.stamina -= MOVE_STAMINA_COST;
    u.moveUsed[selectedMoveIndex] = true;

    const victims = units.filter(
      (t) => t.hp > 0 && isEnemy(u, t) && hits.some((h) => h.x === t.x && h.y === t.y),
    );

    if (!victims.length) {
      log(`${u.name} 使用「${move.name}」（−1 體力），未命中。`);
    } else {
      victims.forEach((t) => {
        const mult = typeMultiplier(move.type, t.types);
        const dmg = mult === 0 ? 0 : Math.max(1, Math.round(move.power * mult));
        t.hp = Math.max(0, t.hp - dmg);
        const eff = mult === 0 ? '無效' : mult > 1 ? '效果絕佳' : mult < 1 ? '效果不好' : '普通';
        log(`${u.name}「${move.name}」→ ${t.name}，${dmg} HP（${eff}）`);
      });
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

  if (checkWinner() !== null) {
    render();
    return;
  }

  const myUnits = livingUnits(currentTrainerId);
  const allActed = myUnits.length > 0 && myUnits.every((u) => actedThisTurn.has(u.id));
  if (allActed) advanceTrainerTurn();
  render();
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
  render();
});
btnLearn.addEventListener('click', () => { if (selectedUnit()) { phase = 'learn'; render(); } });
btnEnd.addEventListener('click', () => {
  selectedId = null;
  phase = 'select';
  advanceTrainerTurn();
  render();
});
btnRestart.addEventListener('click', () => { logEl.innerHTML = ''; setupGame(); });

loadData().then(setupGame);
