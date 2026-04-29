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
  document.getElementById('hud-name-p1').textContent = p1.name;
  document.getElementById('hud-name-p2').textContent = p2.name;
  document.getElementById('hud-nick-p1').textContent = `"${p1.nickname}"`;
  document.getElementById('hud-nick-p2').textContent = `"${p2.nickname}"`;
  document.getElementById('hud-style-p1').textContent = `${p1.style} • ${p1.weight || ''}`.trim();
  document.getElementById('hud-style-p2').textContent = `${p2.style} • ${p2.weight || ''}`.trim();
  // Portrait mini-canvases
  drawHudPortrait('portrait-p1', p1);
  drawHudPortrait('portrait-p2', p2);
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
  const opp = match.p2;
  if (p.state === 'down' || p.state === 'ko' || p.state === 'hit') return;

  // Pause (always)
  if (Input.consumePressed('pause')) togglePause();

  // Context: grappling states — different keymap
  if (p.state === 'sub_defense') {
    // Mash any key to escape (E or jab/cross/up/down for accessibility)
    if (Input.consumePressed('tap_escape') || Input.consumePressed('jab') ||
        Input.consumePressed('cross') || Input.consumePressed('up') ||
        Input.consumePressed('down') || Input.consumePressed('left') ||
        Input.consumePressed('right')) {
      match.submissionTap(p);
    }
    return;
  }
  if (p.state === 'sub_offense') {
    // nothing the attacker can input — sub resolves on its own
    return;
  }
  if (p.state === 'clinch') {
    if (Input.consumePressed('break')) { match.tryBreakClinch(p); return; }
    if (Input.consumePressed('grapple')) { match.tryTakedown(p, opp); return; }
    if (Input.consumePressed('submit')) {
      // Front headlock submissions available from clinch
      if (match.attemptSubmission(p, 'guillotine')) return;
    }
    if (Input.consumePressed('jab')) tryAttack(p, 'dirty_punch');
    if (Input.consumePressed('cross')) tryAttack(p, 'dirty_punch');
    if (Input.consumePressed('uppercut')) tryAttack(p, 'clinch_elbow');
    if (Input.consumePressed('kick')) tryAttack(p, 'clinch_knee');
    if (Input.consumePressed('head_kick')) tryAttack(p, 'clinch_elbow');
    return;
  }
  if (p.state === 'ground_top') {
    // Top voluntarily disengages — tryStandUp is bottom-only, so end the ground engagement directly.
    if (Input.consumePressed('break')) { match._endGround('standup'); return; }
    if (Input.consumePressed('advance')) { match.tryPositionAdvance(p); return; }
    if (Input.consumePressed('submit')) {
      const g = match.grapple;
      if (g) {
        if (g.position === 'back_mount') { if (match.attemptSubmission(p, 'rear_naked_choke')) return; }
        else if (g.position === 'mount') { if (match.attemptSubmission(p, 'armbar')) return; }
        else if (g.position === 'side_control') { if (match.attemptSubmission(p, 'kimura')) return; }
      }
    }
    if (Input.consumePressed('jab')) tryAttack(p, 'ground_punch');
    if (Input.consumePressed('cross')) tryAttack(p, 'ground_punch');
    if (Input.consumePressed('uppercut')) tryAttack(p, 'ground_elbow');
    if (Input.consumePressed('kick')) tryAttack(p, 'ground_elbow');
    return;
  }
  if (p.state === 'ground_bottom') {
    if (Input.consumePressed('break') || Input.consumePressed('up')) { match.tryStandUp(p); return; }
    if (Input.consumePressed('submit')) {
      // Bottom can attack submissions from guard
      if (match.attemptSubmission(p, 'triangle')) return;
      if (match.attemptSubmission(p, 'armbar')) return;
    }
    return;
  }
  if (p.state === 'sprawl') return;
  // During the takedown shoot/drive/slam, the fighter is locked in animation —
  // no input is accepted until the slam completes and the player is in
  // ground_top/ground_bottom.
  if (p.state === 'takedown_shoot' || p.state === 'takedown_defend') return;

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
  // Grappling (standing)
  if (Input.consumePressed('grapple')) {
    // G = clinch if close, or takedown shot if within 150
    const dist = Math.abs(p.x - opp.x);
    if (dist <= 110) {
      if (!match.tryClinch(p, opp)) { /* fell through */ }
    } else if (dist <= 150) {
      match.tryTakedown(p, opp);
    }
  }
  // Attacks
  if (Input.consumePressed('jab')) tryAttack(p, 'jab');
  if (Input.consumePressed('cross')) tryAttack(p, 'cross');
  if (Input.consumePressed('uppercut')) tryAttack(p, 'uppercut');
  if (Input.consumePressed('kick')) tryAttack(p, 'kick');
  if (Input.consumePressed('low_kick')) tryAttack(p, 'low_kick');
  if (Input.consumePressed('head_kick')) tryAttack(p, 'head_kick');
  if (Input.consumePressed('special')) tryAttack(p, 'special');
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
  } else if (ev.type === 'intro_announce') {
    // In-canvas banner during the pre-fight ceremony (in addition to the HTML announcer).
    if (state.match) {
      state.match.introBanner = {
        text: ev.text,
        since: state.match.tick,
        hold: 60,
        size: ev.text.length > 24 ? 44 : 60,
      };
    }
    showAnnounce(ev.text, true);
  } else if (ev.type === 'fight_start') {
    showAnnounce('FIGHT!', true);
    if (state.match) {
      state.match.introBanner = { text: 'FIGHT!', since: state.match.tick, hold: 30, size: 96 };
    }
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
  r.textContent = `ROUND ${match.round}`;
  document.getElementById('timer').textContent = match.timer.toString().padStart(2, '0');
  paintRoundDots('round-dots-p1', match.p1Rounds, match.round);
  paintRoundDots('round-dots-p2', match.p2Rounds, match.round);
}

function paintRoundDots(id, wonCount, currentRound) {
  const host = document.getElementById(id);
  if (!host) return;
  const dots = host.children;
  for (let i = 0; i < dots.length; i++) {
    dots[i].classList.remove('won', 'current');
    if (i < wonCount) dots[i].classList.add('won');
    else if (i === currentRound - 1) dots[i].classList.add('current');
  }
}

function drawHudPortrait(id, fighter) {
  const host = document.getElementById(id);
  if (!host) return;
  host.innerHTML = '';
  const c = document.createElement('canvas');
  c.width = 44; c.height = 44;
  host.appendChild(c);
  const ctx = c.getContext('2d');
  const p = fighter.palette || fighter;
  const skin = p.skin || '#d4a574';
  const hair = p.hair || '#2a1a10';
  const trunks = p.trunks || '#cc2233';
  // background
  const bg = ctx.createLinearGradient(0, 0, 0, 44);
  bg.addColorStop(0, '#223048'); bg.addColorStop(1, '#050810');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 44, 44);
  // shoulders
  ctx.fillStyle = skin;
  ctx.fillRect(4, 30, 36, 14);
  // neck
  ctx.fillRect(19, 26, 6, 6);
  // head
  ctx.beginPath(); ctx.arc(22, 20, 10, 0, Math.PI * 2); ctx.fill();
  // hair cap
  ctx.fillStyle = hair;
  ctx.beginPath(); ctx.ellipse(22, 16, 11, 7, 0, Math.PI, 0); ctx.fill();
  // eyes
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(18, 20, 2, 2); ctx.fillRect(24, 20, 2, 2);
  // mouthguard
  ctx.fillStyle = p.accent || '#ffd34a';
  ctx.fillRect(19, 24, 6, 1);
  // shoulder trim
  ctx.fillStyle = trunks;
  ctx.fillRect(4, 40, 36, 4);
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

// Wire on-screen / touch action buttons. Each button has either a data-hold
// (button driven held while pressed — for movement / block) or a data-press
// (single trigger — for attacks / submissions / etc).
function wireTouchButton(btn) {
  const hold = btn.getAttribute('data-hold');
  const trig = btn.getAttribute('data-press');
  let active = false;
  const start = (e) => {
    e.preventDefault();
    btn.classList.add('active');
    if (hold) { Input.pressDown(hold); active = true; }
    else if (trig) Input.triggerPress(trig);
  };
  const end = (e) => {
    e.preventDefault();
    btn.classList.remove('active');
    if (hold && active) { Input.pressUp(hold); active = false; }
  };
  // Use pointer events so a single handler covers mouse + touch + pen.
  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  btn.addEventListener('pointerleave', end);
  // Block context menus / browser drag selection.
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}
document.querySelectorAll('#touch-controls .tc-btn').forEach(wireTouchButton);

// init
buildRoster();
show('menu');

// Expose for debugging when ?debug is in URL
if (location.search.includes('debug')) {
  window.__game = state;
}
