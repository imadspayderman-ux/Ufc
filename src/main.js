// Entry point: screen routing, game loop wiring.
import { ROSTER, getFighter } from './fighters.js';
import { Match, ARENA } from './engine.js';
import { Renderer, drawPortrait } from './render.js';
import { AI } from './ai.js';
import * as Input from './input.js';
import { SFX } from './audio.js';

const screens = {
  menu: document.getElementById('menu'),
  difficulty: document.getElementById('difficulty'),
  select: document.getElementById('select'),
  fight: document.getElementById('fight'),
  result: document.getElementById('result'),
  howto: document.getElementById('howto'),
  credits: document.getElementById('credits'),
};

const state = {
  screen: 'menu',
  difficulty: 1,
  p1Id: null,
  p2Id: null,
  match: null,
  ai: null,
  loopId: null,
  paused: false,
  rosterIdx: 0,
};

function show(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
  state.screen = name;
}

// ===== Menu =====
document.querySelectorAll('#menu .btn').forEach((b) => {
  b.addEventListener('click', () => {
    SFX.click();
    const a = b.dataset.action;
    if (a === 'play') show('difficulty');
    else if (a === 'howto') show('howto');
    else if (a === 'credits') show('credits');
  });
});

// ===== Difficulty =====
document.querySelectorAll('.diff-btn').forEach((b) => {
  b.addEventListener('click', () => {
    SFX.click();
    state.difficulty = parseInt(b.dataset.diff);
    buildRoster();
    show('select');
  });
});

// ===== Universal back/quit/etc handlers =====
document.querySelectorAll('[data-action]').forEach((b) => {
  b.addEventListener('click', () => {
    SFX.click();
    const a = b.dataset.action;
    if (a === 'back-menu') {
      stopMatch();
      show('menu');
    } else if (a === 'back-diff') show('difficulty');
    else if (a === 'back-select') show('select');
    else if (a === 'rematch') {
      startMatch();
    } else if (a === 'resume') {
      togglePause(false);
    } else if (a === 'quit') {
      stopMatch();
      show('menu');
    }
  });
});

// ===== Fighter Roster =====
const rosterEl = document.getElementById('roster');
function buildRoster() {
  rosterEl.innerHTML = '';
  state.p1Id = null;
  state.p2Id = null;
  document.getElementById('start-fight').disabled = true;
  ROSTER.forEach((f) => {
    const card = document.createElement('div');
    card.className = 'fighter-card';
    card.dataset.id = f.id;
    const flag = document.createElement('div');
    flag.className = 'card-flag';
    flag.textContent = f.flag;
    card.appendChild(flag);
    const cv = document.createElement('canvas');
    cv.width = 110; cv.height = 110;
    card.appendChild(cv);
    const nm = document.createElement('div');
    nm.className = 'card-name';
    nm.textContent = f.name;
    card.appendChild(nm);
    drawPortrait(cv.getContext('2d'), f, 110, 110);
    card.addEventListener('click', () => selectFighter(f.id));
    card.addEventListener('mouseenter', () => SFX.hover());
    rosterEl.appendChild(card);
  });
  updatePreviews();
}

function selectFighter(id) {
  SFX.click();
  if (!state.p1Id) {
    state.p1Id = id;
  } else if (!state.p2Id) {
    state.p2Id = id;
  } else {
    // re-pick p2
    state.p2Id = id;
  }
  // Auto-pick CPU if user clicks same fighter twice (allow mirrors)
  document.querySelectorAll('.fighter-card').forEach((c) => {
    c.classList.remove('selected-p1');
    c.classList.remove('selected-p2');
    if (c.dataset.id === state.p1Id) c.classList.add('selected-p1');
    if (c.dataset.id === state.p2Id) c.classList.add('selected-p2');
  });
  if (state.p1Id && !state.p2Id) {
    // Auto choose AI opponent (random other fighter for variety)
    const others = ROSTER.filter((f) => f.id !== state.p1Id);
    const pick = others[Math.floor(Math.random() * others.length)];
    state.p2Id = pick.id;
    document.querySelector(`.fighter-card[data-id="${pick.id}"]`).classList.add('selected-p2');
  }
  document.getElementById('start-fight').disabled = !(state.p1Id && state.p2Id);
  updatePreviews();
}

function updatePreviews() {
  ['p1', 'p2'].forEach((side) => {
    const el = document.getElementById('preview-' + side);
    const id = side === 'p1' ? state.p1Id : state.p2Id;
    const cv = el.querySelector('canvas');
    const info = el.querySelector('.info');
    if (!id) {
      cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
      info.querySelector('.name').textContent = '—';
      info.querySelector('.nick').textContent = '—';
      info.querySelector('.style').textContent = '—';
      info.querySelector('.stats').innerHTML = '';
      return;
    }
    const f = getFighter(id);
    drawPortrait(cv.getContext('2d'), f, cv.width, cv.height);
    info.querySelector('.name').textContent = f.name;
    info.querySelector('.nick').textContent = '"' + f.nickname + '"';
    info.querySelector('.style').textContent = f.style + ' • ' + f.weight;
    const statsHtml = Object.entries(f.stats).map(([k, v]) =>
      `<div class="stat-row"><div class="stat-label">${k.toUpperCase()}</div><div class="stat-bar"><div class="stat-fill" style="width:${v * 10}%"></div></div></div>`
    ).join('');
    info.querySelector('.stats').innerHTML = statsHtml;
  });
}

document.getElementById('start-fight').addEventListener('click', () => {
  SFX.click();
  if (!state.p1Id || !state.p2Id) return;
  startMatch();
});

// ===== Match =====
let renderer = null;

function startMatch() {
  const p1 = getFighter(state.p1Id);
  const p2 = getFighter(state.p2Id);
  if (!p1 || !p2) return;
  state.match = new Match(p1, p2, { rounds: 3, roundTime: 60 });
  state.ai = new AI(state.difficulty);
  state.paused = false;
  Input.clearAll();
  if (!renderer) {
    const cv = document.getElementById('arena');
    renderer = new Renderer(cv);
  }
  document.getElementById('hud-name-p1').textContent = `${p1.name} "${p1.nickname}"`;
  document.getElementById('hud-name-p2').textContent = `${p2.name} "${p2.nickname}"`;
  show('fight');
  if (!state.loopId) loop();
}

function stopMatch() {
  state.match = null;
  state.paused = false;
  if (state.loopId) cancelAnimationFrame(state.loopId);
  state.loopId = null;
  document.getElementById('pause-overlay').classList.add('hidden');
}

function togglePause(forceState) {
  const newState = forceState !== undefined ? forceState : !state.paused;
  state.paused = newState;
  document.getElementById('pause-overlay').classList.toggle('hidden', !state.paused);
}

function applyP1Input(match) {
  const p = match.p1;
  if (p.state === 'down' || p.state === 'ko' || p.state === 'hit') return;
  const speed = 3.2 * p.speedMul();

  // Block (hold I)
  if (Input.isHeld('block')) {
    if (p.isActionable() && p.state !== 'block') p.startBlock();
  } else if (p.state === 'block' && p.stunFrames === 0) {
    p.endBlock();
  }
  // Crouch (hold S/down)
  if (Input.isHeld('down') && p.isOnGround()) {
    if (p.isActionable() && p.state !== 'crouch' && p.state !== 'block') p.startCrouch();
  } else if (p.state === 'crouch') {
    p.endCrouch();
  }
  // Movement
  if (p.isActionable() && p.state !== 'block' && p.state !== 'crouch') {
    let walking = false;
    if (Input.isHeld('left')) { p.vx -= 0.6; walking = true; }
    if (Input.isHeld('right')) { p.vx += 0.6; walking = true; }
    p.vx = Math.max(-speed, Math.min(speed, p.vx));
    if (p.isOnGround()) {
      p.state = walking ? 'walk' : 'idle';
    }
  }
  // Jump
  if (Input.consumePressed('up')) p.startJump();
  // Dodge
  if (Input.consumePressed('dodge')) p.startDodge();
  // Attacks
  if (Input.consumePressed('jab')) tryAttack(p, 'jab');
  if (Input.consumePressed('cross')) tryAttack(p, 'cross');
  if (Input.consumePressed('uppercut')) tryAttack(p, 'uppercut');
  if (Input.consumePressed('kick')) {
    // smart: if holding down, low_kick; if up, head_kick; else kick
    if (Input.isHeld('down')) tryAttack(p, 'low_kick');
    else if (Input.isHeld('up')) tryAttack(p, 'head_kick');
    else tryAttack(p, 'kick');
  }
  if (Input.consumePressed('clinch')) tryAttack(p, 'low_kick'); // O = low kick combo button
  if (Input.consumePressed('special')) tryAttack(p, 'special');
  // Pause
  if (Input.consumePressed('pause')) togglePause();
}

function tryAttack(p, kind) {
  const ok = p.startAttack(kind);
  if (ok) {
    if (kind === 'special') SFX.special();
    else if (kind.includes('kick')) SFX.kick();
    else if (kind === 'jab') SFX.jab();
    else SFX.cross();
  }
}

function applyP2Input(match) {
  const p = match.p2;
  const opp = match.p1;
  const ai = state.ai;
  const decision = ai.step(p, opp, match);
  if (!decision) return;
  const speed = 3.0 * p.speedMul();
  const cmd = decision.cmd;

  if (cmd.block && p.isActionable() && p.state !== 'block') p.startBlock();
  else if (!cmd.block && p.state === 'block' && p.stunFrames === 0) p.endBlock();

  if (p.isActionable() && p.state !== 'block') {
    let walking = false;
    if (cmd.left) { p.vx -= 0.55; walking = true; }
    if (cmd.right) { p.vx += 0.55; walking = true; }
    p.vx = Math.max(-speed, Math.min(speed, p.vx));
    if (p.isOnGround()) p.state = walking ? 'walk' : 'idle';
  }
  if (decision.action === 'dodge') p.startDodge();
  else if (decision.action) tryAttack(p, decision.action);
}

function loop() {
  state.loopId = requestAnimationFrame(loop);
  if (!state.match || state.screen !== 'fight') return;
  if (state.paused) {
    renderer.draw(state.match);
    return;
  }
  if (state.match.state === 'fight') {
    applyP1Input(state.match);
    applyP2Input(state.match);
  }
  state.match.step(1 / 60);
  // process events
  for (const ev of state.match.drainEvents()) {
    handleEvent(ev);
  }
  updateHUD(state.match);
  renderer.draw(state.match);
  drawAnnouncer(state.match);
}

function handleEvent(ev) {
  if (ev.type === 'hit') {
    renderer.spawnParticles(ev.x, ev.y, ev.blocked ? 6 : 14, ev.blocked ? ['#aaa', '#ccc'] : ['#ff5566', '#ffcc33', '#fff']);
    if (!ev.blocked) {
      renderer.spawnPopup(ev.x, ev.y - 30, '-' + ev.dmg, '#ffcc33', ev.dmg >= 15 ? 36 : 24);
    } else {
      renderer.spawnPopup(ev.x, ev.y - 30, 'BLOCK', '#aaccff', 18);
    }
  } else if (ev.type === 'announce') {
    showAnnounce(ev.text, true);
  } else if (ev.type === 'fight_start') {
    showAnnounce('FIGHT!', true);
  } else if (ev.type === 'round_end') {
    if (ev.winner === 'p1') showAnnounce('K.O.!', true);
    else if (ev.winner === 'p2') showAnnounce('K.O.!', true);
    else showAnnounce('TIME!', true);
  } else if (ev.type === 'match_end') {
    setTimeout(() => endMatchToResult(ev.winner), 1400);
  }
}

let announceTimer = 0;
function showAnnounce(text, zoom) {
  const a = document.getElementById('announcer');
  a.textContent = text;
  a.classList.add('show');
  if (zoom) a.classList.add('zoom');
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    a.classList.remove('show');
    a.classList.remove('zoom');
  }, 1300);
}
function drawAnnouncer(match) {
  // could update countdown text here if desired
  if (match.state === 'intro' && match.subTimer > 0 && match.subTimer < 60) {
    const a = document.getElementById('announcer');
    const n = Math.ceil(match.subTimer / 20);
    if (n > 0 && a.textContent !== String(n)) {
      a.textContent = n;
      a.classList.add('show');
      SFX.countdown();
    }
  }
}

function updateHUD(match) {
  document.getElementById('hp-p1').style.width = `${(match.p1.hp / match.p1.maxHp) * 100}%`;
  document.getElementById('hp-p2').style.width = `${(match.p2.hp / match.p2.maxHp) * 100}%`;
  document.getElementById('st-p1').style.width = `${(match.p1.stamina / match.p1.maxStamina) * 100}%`;
  document.getElementById('st-p2').style.width = `${(match.p2.stamina / match.p2.maxStamina) * 100}%`;
  document.getElementById('sp-p1').style.width = `${(match.p1.special / match.p1.maxSpecial) * 100}%`;
  document.getElementById('sp-p2').style.width = `${(match.p2.special / match.p2.maxSpecial) * 100}%`;
  const r = document.getElementById('round-label');
  r.textContent = `ROUND ${match.round} • ${match.p1Rounds}-${match.p2Rounds}`;
  document.getElementById('timer').textContent = match.timer.toString().padStart(2, '0');
}

function endMatchToResult(winner) {
  const title = document.getElementById('result-title');
  const detail = document.getElementById('result-detail');
  title.classList.remove('win', 'lose', 'draw');
  if (winner === 'p1') {
    title.textContent = 'VICTORY';
    title.classList.add('win');
    detail.textContent = `${state.match.p1.data.name} "${state.match.p1.data.nickname}" wins ${state.match.p1Rounds}-${state.match.p2Rounds}`;
  } else if (winner === 'p2') {
    title.textContent = 'DEFEAT';
    title.classList.add('lose');
    detail.textContent = `${state.match.p2.data.name} "${state.match.p2.data.nickname}" wins ${state.match.p2Rounds}-${state.match.p1Rounds}`;
  } else {
    title.textContent = 'DRAW';
    title.classList.add('draw');
    detail.textContent = 'No winner declared.';
  }
  show('result');
}

// init
buildRoster();
show('menu');

// Expose for debugging when ?debug is in URL
if (location.search.includes('debug')) {
  window.__game = state;
}
