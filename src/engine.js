// Combat engine: state, physics, hitboxes, damage.
import { SFX } from './audio.js';
import { getWeightClass, getSpecialty } from './fighters.js';

export const ARENA = {
  width: 1280,
  height: 640,
  groundY: 540,
  wallPad: 80,
  gravity: 0.85,
};

// Duration (frames @60fps) for each intro-ceremony phase. Round 1 uses the full
// sequence; rounds 2+ jump straight to the short countdown.
export const INTRO_PHASE_DURATIONS = {
  pan: 90,           // sweeping spotlight + "LADIES AND GENTLEMEN"
  blue_corner: 100,  // introduce P1 at blue corner
  red_corner: 100,   // introduce P2 at red corner
  ref_walk_in: 60,   // referee walks to center
  ref_call: 90,      // referee raises arm, "LET'S GET IT ON!"
  ref_walk_out: 40,  // referee exits frame
  countdown: 60,     // 3-2-1
  fight: 30,         // "FIGHT!" before handoff to live combat
};

const INTRO_PHASE_ORDER_R1 = [
  'pan', 'blue_corner', 'red_corner', 'ref_walk_in', 'ref_call', 'ref_walk_out', 'countdown', 'fight',
];
const INTRO_PHASE_ORDER_RN = ['countdown', 'fight'];

export const ATTACK_DATA = {
  jab:       { startup: 4,  active: 3, recovery: 8,  damage: 5,  reach: 95,  height: 'high', stam: 5,  pushback: 4,  meter: 5,  height_y: 35 },
  cross:     { startup: 7,  active: 4, recovery: 14, damage: 11, reach: 110, height: 'high', stam: 9,  pushback: 7,  meter: 8,  height_y: 35 },
  uppercut:  { startup: 8,  active: 5, recovery: 16, damage: 13, reach: 75,  height: 'mid',  stam: 11, pushback: 6,  meter: 10, height_y: 25, launch: true },
  kick:      { startup: 9,  active: 5, recovery: 18, damage: 12, reach: 135, height: 'mid',  stam: 10, pushback: 9,  meter: 9,  height_y: 50 },
  low_kick:  { startup: 7,  active: 4, recovery: 14, damage: 7,  reach: 115, height: 'low',  stam: 7,  pushback: 5,  meter: 6,  height_y: 100, drain: 8 },
  head_kick: { startup: 13, active: 5, recovery: 22, damage: 17, reach: 145, height: 'high', stam: 15, pushback: 11, meter: 12, height_y: 20 },
  special:   { startup: 14, active: 8, recovery: 22, damage: 28, reach: 165, height: 'all',  stam: 0,  pushback: 14, meter: 0,  height_y: 35, unblockable: true, launch: true },
  // ----- Grappling / clinch (no projectile hitbox; resolved by clinch logic) -----
  clinch_knee:  { startup: 6,  active: 3, recovery: 10, damage: 8,  reach: 0,   height: 'mid',  stam: 7,  pushback: 0, meter: 6, height_y: 60,  clinch: true },
  clinch_elbow: { startup: 5,  active: 3, recovery: 10, damage: 9,  reach: 0,   height: 'high', stam: 7,  pushback: 0, meter: 6, height_y: 35,  clinch: true },
  dirty_punch:  { startup: 4,  active: 3, recovery: 8,  damage: 5,  reach: 0,   height: 'high', stam: 5,  pushback: 0, meter: 4, height_y: 35,  clinch: true },
  // Ground & pound (top mount only)
  ground_punch: { startup: 4,  active: 3, recovery: 8,  damage: 6,  reach: 0,   height: 'all',  stam: 4,  pushback: 0, meter: 5, height_y: 35,  ground: true },
  ground_elbow: { startup: 6,  active: 3, recovery: 10, damage: 10, reach: 0,   height: 'all',  stam: 6,  pushback: 0, meter: 7, height_y: 35,  ground: true },
};

// Submission catalogue. `escapeBase` = base taps needed to escape (modified by defender stats).
export const SUBMISSIONS = {
  guillotine:        { name: 'GUILLOTINE',      escapeBase: 60, dps: 0.30, fromPos: ['front_headlock', 'clinch'] },
  rear_naked_choke:  { name: 'REAR-NAKED CHOKE',escapeBase: 75, dps: 0.40, fromPos: ['back_mount'] },
  armbar:            { name: 'ARMBAR',          escapeBase: 65, dps: 0.30, fromPos: ['mount', 'guard'] },
  triangle:          { name: 'TRIANGLE',        escapeBase: 70, dps: 0.32, fromPos: ['guard'] },
  kimura:            { name: 'KIMURA',          escapeBase: 60, dps: 0.28, fromPos: ['side_control', 'guard'] },
};

export class FighterState {
  constructor(data, side) {
    this.data = data;
    this.side = side; // 'p1' | 'p2'
    this.facing = side === 'p1' ? 1 : -1;
    this.x = side === 'p1' ? 340 : 940;
    this.y = ARENA.groundY;
    this.vx = 0;
    this.vy = 0;

    const wc = getWeightClass(data);
    this.weightClass = wc;
    this.specialty = getSpecialty(data);
    this.maxHp = Math.round((100 + (data.stats.stamina - 5) * 4) * wc.hpMul);
    this.hp = this.maxHp;

    this.maxStamina = Math.round((80 + data.stats.stamina * 4) * (0.9 + wc.hpMul * 0.1));
    this.stamina = this.maxStamina;

    this.maxSpecial = 100;
    this.special = 0;

    this.state = 'idle';
    this.animTime = 0;          // total frames in current state
    this.attack = null;
    this.attackFrame = 0;
    this.hitConfirm = false;

    this.stunFrames = 0;
    this.dodgeFrames = 0;
    this.dodgeIFrames = 0;
    this.downTime = 0;
    this.getupTime = 0;
    this.cooldown = 0;          // generic post-action lockout

    this.crouching = false;
    this.blocking = false;

    this.combo = 0;
    this.comboTimer = 0;
    this.lastDamageDealt = 0;

    // Animation interpolation data
    this.pose = 'idle';
    this.poseT = 0;

    // Grappling / ground state
    // grapple-related state lives on Match.grapple but each fighter
    // may store role hints + tap-counter for sub defense.
    this.grappleRole = null;       // 'top' | 'bottom' | 'clinch_a' | 'clinch_b'
    this.taps = 0;                  // taps accumulated when defending a sub
    this.movingDirection = 0;       // -1 retreat / +1 advance vs opponent (for walk anim)
  }

  isActionable() {
    return ['idle', 'walk', 'crouch', 'jump', 'block', 'dodge'].includes(this.state) && this.cooldown <= 0;
  }
  isOnGround() { return this.y >= ARENA.groundY - 0.1; }
  // weight-class aware modifiers
  speedMul() { return (0.7 + this.data.stats.speed * 0.05) * this.weightClass.speedMul; }
  powerMul() { return (0.7 + this.data.stats.power * 0.05) * this.weightClass.powerMul; }
  defenseMul() { return 0.7 + this.data.stats.defense * 0.04; }
  techMul() { return 0.85 + this.data.stats.technique * 0.03; }
  wrestlingMul() { return 0.6 + ((this.data.grappling && this.data.grappling.wrestling) || 5) * 0.06; }
  submissionMul() { return 0.6 + ((this.data.grappling && this.data.grappling.submissions) || 5) * 0.06; }
  takedownDefMul() { return 0.6 + ((this.data.grappling && this.data.grappling.takedownDef) || 5) * 0.06; }
  clinchMul() { return 0.6 + ((this.data.grappling && this.data.grappling.clinch) || 5) * 0.06; }

  isGrappling() {
    return ['clinch', 'ground_top', 'ground_bottom', 'sub_offense', 'sub_defense', 'takedown', 'sprawl'].includes(this.state);
  }

  faceTarget(targetX) {
    if (!this.isActionable()) return;
    this.facing = targetX > this.x ? 1 : -1;
  }

  startAttack(kind) {
    const a = ATTACK_DATA[kind];
    if (!a) return false;
    // Clinch attacks: only valid when in clinch state.
    if (a.clinch) {
      if (this.state !== 'clinch') return false;
      if (this.stamina < a.stam) return false;
      this.stamina -= a.stam;
      this.attack = { kind, ...a };
      this.attackFrame = 0;
      this.hitConfirm = false;
      // We don't change state out of 'clinch' — animations are sub-played via attackFrame.
      return true;
    }
    // Ground attacks: only valid when in mount/top.
    if (a.ground) {
      if (this.state !== 'ground_top') return false;
      if (this.stamina < a.stam) return false;
      this.stamina -= a.stam;
      this.attack = { kind, ...a };
      this.attackFrame = 0;
      this.hitConfirm = false;
      return true;
    }
    if (!this.isActionable()) return false;
    if (this.state === 'jump' && kind !== 'kick' && kind !== 'special') return false;
    if (kind === 'special') {
      if (this.special < this.maxSpecial) return false;
      this.special = 0;
    } else {
      if (this.stamina < a.stam) return false;
      this.stamina -= a.stam;
    }
    this.state = 'attack';
    this.attack = { kind, ...a };
    this.attackFrame = 0;
    this.hitConfirm = false;
    this.vx *= 0.4;
    return true;
  }

  startBlock() {
    if (!this.isActionable()) return;
    this.state = 'block';
    this.blocking = true;
    this.vx = 0;
  }
  endBlock() {
    if (this.state === 'block') {
      this.state = 'idle';
      this.blocking = false;
    }
  }

  startCrouch() {
    if (!this.isActionable()) return;
    this.state = 'crouch';
    this.crouching = true;
    this.vx = 0;
  }
  endCrouch() {
    if (this.state === 'crouch') {
      this.state = 'idle';
      this.crouching = false;
    }
  }

  startDodge() {
    if (!this.isActionable() || this.stamina < 18) return;
    if (!this.isOnGround()) return;
    this.stamina -= 18;
    this.state = 'dodge';
    this.dodgeFrames = 18;
    this.dodgeIFrames = 9;
    this.vx = -this.facing * 7;
  }

  startJump() {
    if (!this.isActionable() || !this.isOnGround()) return;
    this.state = 'jump';
    this.vy = -16;
  }

  takeHit(dmg, attacker, attack, blockedFlag) {
    let blocked = false;
    let actualDmg = dmg;
    let stun = 14;
    if (this.dodgeIFrames > 0 && !attack.unblockable) {
      // perfect dodge
      this.special = Math.min(this.maxSpecial, this.special + 6);
      return { blocked: false, dodged: true, dmg: 0 };
    }
    if (blockedFlag && !attack.unblockable) {
      blocked = true;
      actualDmg = Math.round(dmg * (0.18 + (1 - this.defenseMul() * 0.3)));
      actualDmg = Math.max(1, Math.min(actualDmg, dmg));
      this.stamina = Math.max(0, this.stamina - 6 - dmg * 0.4);
      stun = 6;
    } else {
      actualDmg = Math.round(dmg * (1.6 - this.defenseMul() * 0.45));
      stun = attack.launch ? 24 : 14 + Math.min(8, dmg / 2);
    }
    if (attack.drain) {
      this.stamina = Math.max(0, this.stamina - attack.drain);
    }
    this.hp = Math.max(0, this.hp - actualDmg);
    this.special = Math.min(this.maxSpecial, this.special + (blocked ? 2 : 4));

    // knockback
    const dir = attacker.x < this.x ? 1 : -1;
    this.vx = dir * (attack.pushback || 5) * (blocked ? 0.4 : 1);
    if (attack.launch && !blocked) {
      this.vy = -10;
    }

    if (this.hp <= 0) {
      this.state = 'down';
      this.downTime = 90;
      this.vy = -8;
      this.vx = dir * 8;
      SFX.ko();
    } else {
      if (blocked) {
        // remain blocking briefly
        this.state = 'block';
        this.stunFrames = stun;
      } else {
        this.state = 'hit';
        this.stunFrames = stun;
      }
      if (blocked) SFX.block(); else if (dmg >= 12) SFX.hitHard(); else SFX.hit();
    }
    return { blocked, dodged: false, dmg: actualDmg };
  }

  // Returns hitbox in world coordinates if currently in active frames, else null
  currentHitbox() {
    if (this.state !== 'attack' || !this.attack) return null;
    const a = this.attack;
    if (this.attackFrame < a.startup || this.attackFrame >= a.startup + a.active) return null;
    const cx = this.x + this.facing * (40 + a.reach * 0.5);
    const halfW = a.reach * 0.5 + 20;
    const cy = this.y - 130 + (a.height_y - 35);
    const halfH = 35;
    return { x: cx - halfW, y: cy - halfH, w: halfW * 2, h: halfH * 2, kind: a.height };
  }

  // Hurtbox depending on state
  hurtbox() {
    if (this.state === 'down') return null;
    let topY = this.y - 180;
    let halfW = 36;
    let halfH = 90;
    let cy = this.y - 90;
    if (this.state === 'crouch') {
      topY = this.y - 110;
      halfH = 55;
      cy = this.y - 55;
    }
    if (this.state === 'jump') {
      cy = this.y - 90;
    }
    return { x: this.x - halfW, y: cy - halfH, w: halfW * 2, h: halfH * 2 };
  }
}

export class Match {
  constructor(p1Data, p2Data, opts = {}) {
    this.p1 = new FighterState(p1Data, 'p1');
    this.p2 = new FighterState(p2Data, 'p2');
    this.round = 1;
    this.maxRounds = opts.rounds || 3;
    this.roundsToWin = Math.ceil(this.maxRounds / 2);
    this.p1Rounds = 0;
    this.p2Rounds = 0;
    this.timer = opts.roundTime || 60;
    this.subTime = 0;
    this.state = 'intro'; // intro | fight | round_end | match_end | paused
    this.subTimer = 60; // generic countdown for transitions
    this.shake = 0;
    this.flash = 0;
    this.hitstop = 0;
    this.events = [];
    this.lastWinner = null;
    this.totalRounds = this.maxRounds;
    this.tick = 0;

    // Intro sequence phases (full ceremony only on round 1).
    // First step() advances from '' -> 'pan' and fires the initial announce/SFX.
    this.introPhase = '';
    this.introPhaseTime = 0;
    this.introPhaseDuration = 0;
    // Referee state (used during intro only).
    this.ref = { x: ARENA.width + 80, y: ARENA.groundY, facing: -1, state: 'walking', armRaised: 0, animTime: 0 };

    // Active grapple session — null when both fighters are striking on their feet.
    // {
    //   top, bottom,           // FighterState refs (for ground positions)
    //   a, b,                  // FighterState refs (for clinch — symmetric)
    //   position: 'clinch'|'mount'|'guard'|'back_mount'|'side_control'|'front_headlock',
    //   centerX,               // anchor point
    //   timer,                 // frames in current position
    //   submission: null | { kind, attacker, defender, progress, escapeRequired }
    // }
    this.grapple = null;
  }

  pushEvent(type, payload = {}) {
    this.events.push({ type, ...payload, t: this.tick });
  }
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  resetForRound() {
    this.p1.hp = this.p1.maxHp;
    this.p2.hp = this.p2.maxHp;
    this.p1.stamina = this.p1.maxStamina;
    this.p2.stamina = this.p2.maxStamina;
    this.p1.x = 380; this.p1.y = ARENA.groundY; this.p1.vx = 0; this.p1.vy = 0;
    this.p1.state = 'idle'; this.p1.facing = 1; this.p1.attack = null; this.p1.attackFrame = 0; this.p1.stunFrames = 0;
    this.p2.x = 900; this.p2.y = ARENA.groundY; this.p2.vx = 0; this.p2.vy = 0;
    this.p2.state = 'idle'; this.p2.facing = -1; this.p2.attack = null; this.p2.attackFrame = 0; this.p2.stunFrames = 0;
    this.timer = 60;
    this.state = 'intro';
    // Rounds 2+: short countdown-only intro.
    this.introPhase = 'countdown';
    this.introPhaseTime = 0;
    this.introPhaseDuration = INTRO_PHASE_DURATIONS.countdown;
    this.ref.x = ARENA.width + 80;
    this.ref.state = 'idle';
    this.ref.armRaised = 0;
    // Clear grapple state from any prior round.
    this.grapple = null;
    this.p1.grappleRole = null; this.p2.grappleRole = null;
    this.p1.taps = 0; this.p2.taps = 0;
  }

  _updateReferee() {
    const r = this.ref;
    r.animTime++;
    const centerX = ARENA.width / 2;
    if (this.introPhase === 'ref_walk_in') {
      // Walk from right side to center.
      const k = Math.min(1, this.introPhaseTime / this.introPhaseDuration);
      r.x = ARENA.width + 60 + (centerX - (ARENA.width + 60)) * easeOutCubic(k);
      r.facing = -1;
      r.state = 'walking';
      r.armRaised = 0;
    } else if (this.introPhase === 'ref_call') {
      r.x = centerX;
      r.state = 'calling';
      // Raise arm during first half, hold second half.
      const k = Math.min(1, this.introPhaseTime / (this.introPhaseDuration * 0.5));
      r.armRaised = easeOutCubic(k);
    } else if (this.introPhase === 'ref_walk_out') {
      const k = Math.min(1, this.introPhaseTime / this.introPhaseDuration);
      r.x = centerX + (ARENA.width + 80 - centerX) * easeInCubic(k);
      r.facing = 1;
      r.state = 'walking';
      r.armRaised = Math.max(0, 1 - k * 2);
    } else {
      // Off-screen otherwise.
      if (this.introPhase === 'countdown' || this.introPhase === 'fight') {
        r.x = ARENA.width + 200;
      }
    }
  }

  _advanceIntroPhase() {
    const order = this.round === 1 ? INTRO_PHASE_ORDER_R1 : INTRO_PHASE_ORDER_RN;
    let nextIdx;
    if (!this.introPhase || this.introPhase === '') {
      nextIdx = 0;
    } else {
      const idx = order.indexOf(this.introPhase);
      nextIdx = idx + 1;
    }
    if (nextIdx >= order.length) {
      // Final phase complete -> start real fight.
      this.state = 'fight';
      this.introPhase = 'done';
      this.introPhaseTime = 0;
      this.pushEvent('fight_start');
      SFX.fight();
      return;
    }
    const next = order[nextIdx];
    this.introPhase = next;
    this.introPhaseTime = 0;
    this.introPhaseDuration = INTRO_PHASE_DURATIONS[next] || 60;
    // Per-phase events and SFX hooks.
    if (next === 'pan') {
      this.pushEvent('intro_announce', { text: 'LADIES AND GENTLEMEN!' });
      SFX.bell();
    } else if (next === 'blue_corner') {
      const f = this.p1.data;
      this.pushEvent('intro_announce', { text: `BLUE CORNER — ${f.name} "${f.nickname.toUpperCase()}"` });
      SFX.countdown();
    } else if (next === 'red_corner') {
      const f = this.p2.data;
      this.pushEvent('intro_announce', { text: `RED CORNER — ${f.name} "${f.nickname.toUpperCase()}"` });
      SFX.countdown();
    } else if (next === 'ref_walk_in') {
      this.ref.x = ARENA.width + 60;
      this.ref.facing = -1;
      this.ref.state = 'walking';
      this.ref.armRaised = 0;
    } else if (next === 'ref_call') {
      this.pushEvent('intro_announce', { text: "LET'S GET IT ON!" });
      this.ref.state = 'calling';
      SFX.bell();
    } else if (next === 'ref_walk_out') {
      this.ref.state = 'walking_out';
      this.ref.facing = 1;
    } else if (next === 'countdown') {
      this.pushEvent('intro_announce', { text: `ROUND ${this.round}` });
      SFX.bell();
    } else if (next === 'fight') {
      // the "FIGHT!" banner will be emitted when the next phase starts (handled in step when done)
    }
  }

  // -------------- Grappling API --------------

  // Attempt to initiate a clinch between a (attacker) and b (opponent).
  // Succeeds when close enough and neither is mid-action.
  tryClinch(a, b) {
    if (this.grapple) return false;
    if (!a.isActionable() || !b.isActionable()) return false;
    if (b.state === 'attack' || a.state === 'attack') return false;
    const dist = Math.abs(a.x - b.x);
    if (dist > 110) return false;
    if (a.stamina < 10) return false;
    a.stamina -= 8;
    // Opponent can deny with high clinch resistance + takedown defense
    const resist = (b.clinchMul() + b.takedownDefMul()) * 0.5 * (b.stamina > 0 ? 1 : 0.5);
    const push = a.clinchMul() * 1.1;
    if (Math.random() * (push + resist) > push) {
      // Failed — briefly stumble
      a.state = 'idle';
      a.cooldown = 12;
      return false;
    }
    const centerX = (a.x + b.x) / 2;
    a.state = 'clinch'; b.state = 'clinch';
    a.x = centerX - 28 * a.facing; b.x = centerX - 28 * b.facing;
    a.vx = 0; b.vx = 0;
    a.facing = b.x > a.x ? 1 : -1; b.facing = a.x > b.x ? 1 : -1;
    a.grappleRole = 'clinch_a'; b.grappleRole = 'clinch_b';
    a.attack = null; a.attackFrame = 0;
    b.attack = null; b.attackFrame = 0;
    this.grapple = { a, b, position: 'clinch', centerX, timer: 0, submission: null };
    this.pushEvent('clinch_start', { x: centerX });
    SFX.block();
    return true;
  }

  // Break out of clinch (must have stamina; success tied to clinch defense)
  tryBreakClinch(f) {
    const g = this.grapple;
    if (!g || g.position !== 'clinch') return false;
    const other = g.a === f ? g.b : g.a;
    if (f.stamina < 8) return false;
    f.stamina -= 8;
    const push = f.clinchMul();
    const hold = other.clinchMul() * 1.05;
    if (Math.random() * (push + hold) > push) return false;
    this._endClinch('break');
    return true;
  }

  _endClinch(reason, except = null) {
    const g = this.grapple;
    if (!g) return;
    // Determine separation: who is on which side?
    if (g.a && g.a !== except) { g.a.state = 'idle'; g.a.grappleRole = null; g.a.attack = null; g.a.attackFrame = 0; g.a.cooldown = 10; }
    else if (g.a === except) { g.a.grappleRole = null; g.a.attack = null; g.a.attackFrame = 0; }
    if (g.b && g.b !== except) { g.b.state = 'idle'; g.b.grappleRole = null; g.b.attack = null; g.b.attackFrame = 0; g.b.cooldown = 10; }
    else if (g.b === except) { g.b.grappleRole = null; g.b.attack = null; g.b.attackFrame = 0; }
    // Push them apart slightly
    if (g.a && g.b) {
      const dir = g.a.x < g.b.x ? -1 : 1;
      g.a.vx = dir * 3; g.b.vx = -dir * 3;
    }
    this.grapple = null;
    this.pushEvent('clinch_end', { reason });
  }

  // Attempt a takedown — initiator must be in clinch (or within 130px for shot).
  tryTakedown(attacker, defender) {
    const g = this.grapple;
    const inClinch = g && (g.a === attacker || g.b === attacker);
    if (!inClinch) {
      // level change / shot: needs stamina + proximity
      const dist = Math.abs(attacker.x - defender.x);
      if (dist > 150) return false;
      if (!attacker.isActionable()) return false;
      if (attacker.stamina < 22) return false;
      attacker.stamina -= 18;
    } else {
      if (attacker.stamina < 18) return false;
      attacker.stamina -= 14;
    }
    const skill = attacker.wrestlingMul() * 1.1 + (attacker.specialty.clinchAffinity * 0.4);
    const def = defender.takedownDefMul() + (defender.specialty.groundAffinity * 0.2);
    const success = Math.random() * (skill + def) < skill;
    if (!success) {
      // sprawled — attacker briefly on knees, defender gains momentum
      if (inClinch) this._endClinch('sprawl');
      attacker.state = 'sprawl';
      attacker.cooldown = 40;
      attacker.stunFrames = 30;
      defender.special = Math.min(defender.maxSpecial, defender.special + 8);
      this.pushEvent('takedown_failed', { attacker: attacker.side });
      SFX.block();
      return false;
    }
    // Success — ground position determined by attacker vs. defender ground skill.
    // If the defender is a strong BJJ/guard player they pull guard on the way down,
    // giving the bottom fighter real submission threats (triangle / armbar / kimura).
    let pos;
    if (defender.specialty.groundAffinity >= 0.75 && defender.specialty.groundAffinity >= attacker.specialty.groundAffinity) {
      pos = 'guard';
    } else if (attacker.specialty.groundAffinity > 0.7) {
      pos = 'mount';
    } else {
      pos = 'side_control';
    }
    if (inClinch) this.grapple = null;
    this._startGround(attacker, defender, pos);
    this.pushEvent('takedown_success', { attacker: attacker.side, position: pos });
    SFX.hitHard();
    return true;
  }

  _startGround(top, bottom, position) {
    const centerX = (top.x + bottom.x) / 2;
    top.x = centerX; bottom.x = centerX;
    top.state = 'ground_top'; bottom.state = 'ground_bottom';
    top.grappleRole = 'top'; bottom.grappleRole = 'bottom';
    top.attack = null; top.attackFrame = 0;
    bottom.attack = null; bottom.attackFrame = 0;
    top.vx = 0; top.vy = 0; bottom.vx = 0; bottom.vy = 0;
    this.grapple = { top, bottom, position, centerX, timer: 0, submission: null };
  }

  // Bottom attempts to get back to feet / sweep.
  tryStandUp(f) {
    const g = this.grapple;
    if (!g || !g.top || !g.bottom) return false;
    if (g.submission) return false;
    const bottom = g.bottom;
    if (f !== bottom) return false;
    if (bottom.stamina < 12) return false;
    bottom.stamina -= 10;
    const esc = bottom.wrestlingMul() + bottom.takedownDefMul();
    const hold = g.top.wrestlingMul() * 1.2 + (g.timer > 180 ? -0.3 : 0); // harder if they're tired/pinned long
    if (Math.random() * (esc + hold) > esc) return false;
    // Stand up
    this._endGround('standup');
    return true;
  }

  // Top attempts to pass guard / advance position; reserved for future.
  tryPositionAdvance(f) {
    const g = this.grapple;
    if (!g || !g.top || !g.bottom) return false;
    if (f !== g.top) return false;
    if (g.position === 'mount') {
      // Spin to back mount if attacker rolls under
      const chance = f.wrestlingMul() * 0.7 - g.bottom.takedownDefMul() * 0.4;
      if (Math.random() < 0.2 + chance * 0.2) {
        g.position = 'back_mount';
        this.pushEvent('position_advance', { position: 'back_mount' });
        return true;
      }
    } else if (g.position === 'side_control') {
      if (f.stamina < 8) return false;
      f.stamina -= 6;
      g.position = 'mount';
      this.pushEvent('position_advance', { position: 'mount' });
      return true;
    } else if (g.position === 'guard') {
      // Pass guard → side control. Success depends on top's wrestling vs. bottom's BJJ.
      if (f.stamina < 10) return false;
      f.stamina -= 8;
      const pass = f.wrestlingMul() * 1.1;
      const hold = g.bottom.submissionMul() * 1.0 + g.bottom.specialty.groundAffinity * 0.3;
      if (Math.random() * (pass + hold) < pass) {
        g.position = 'side_control';
        this.pushEvent('position_advance', { position: 'side_control' });
        return true;
      }
      return false;
    }
    return false;
  }

  _endGround(reason, except = null) {
    const g = this.grapple;
    if (!g) return;
    if (g.top && g.top !== except) { g.top.state = 'idle'; g.top.grappleRole = null; g.top.attack = null; g.top.attackFrame = 0; g.top.cooldown = 14; }
    else if (g.top === except) { g.top.grappleRole = null; g.top.attack = null; g.top.attackFrame = 0; }
    if (g.bottom && g.bottom !== except) { g.bottom.state = 'idle'; g.bottom.grappleRole = null; g.bottom.attack = null; g.bottom.attackFrame = 0; g.bottom.cooldown = 14; }
    else if (g.bottom === except) { g.bottom.grappleRole = null; g.bottom.attack = null; g.bottom.attackFrame = 0; }
    // Push apart so they reset to striking range
    if (g.top && g.bottom) {
      const topSide = g.top.side === 'p1' ? -1 : 1;
      g.top.x += topSide * 80; g.bottom.x -= topSide * 80;
      g.top.facing = g.bottom.x > g.top.x ? 1 : -1;
      g.bottom.facing = g.top.x > g.bottom.x ? 1 : -1;
    }
    this.grapple = null;
    this.pushEvent('ground_end', { reason });
  }

  // Attempt to lock in a submission. Valid kinds depend on current position.
  attemptSubmission(attacker, kind) {
    const g = this.grapple;
    if (!g) return false;
    if (g.submission) return false;
    const sub = SUBMISSIONS[kind];
    if (!sub) return false;
    const pos = g.position;
    if (!sub.fromPos.includes(pos)) return false;
    // Attacker must be the correct role
    const isTop = g.top === attacker;
    const isBottom = g.bottom === attacker;
    const isClinchA = g.a === attacker;
    if (pos === 'front_headlock' && !isClinchA && g.a !== attacker && g.b !== attacker) return false;
    if ((pos === 'mount' || pos === 'back_mount' || pos === 'side_control') && !isTop) return false;
    if (pos === 'guard' && !isBottom) return false;
    const defender = attacker === g.a ? g.b : attacker === g.b ? g.a : attacker === g.top ? g.bottom : g.top;
    if (attacker.stamina < 14) return false;
    attacker.stamina -= 12;
    const skill = attacker.submissionMul() * 1.2;
    const def = defender.submissionMul() * 0.85 + defender.takedownDefMul() * 0.5;
    if (Math.random() * (skill + def) > skill) {
      // Failed lock-in — costs position for aggressive subs from guard
      if (pos === 'guard' && isBottom) this._endGround('escape_from_guard');
      this.pushEvent('submission_failed', { kind });
      return false;
    }
    attacker.state = 'sub_offense';
    defender.state = 'sub_defense';
    defender.taps = 0;
    const escapeRequired = Math.round(sub.escapeBase * (0.6 + Math.random() * 0.4) / defender.submissionMul());
    g.submission = {
      kind, attacker, defender,
      progress: 0,           // builds up while held; if reaches 100 → tap
      escapeRequired,        // taps needed to escape
      hold: 0,               // frames held
      dpsDrain: sub.dps,
    };
    this.pushEvent('submission_start', { kind, attacker: attacker.side });
    SFX.special();
    return true;
  }

  // Defender taps escape button — each tap reduces escapeRequired counter.
  submissionTap(defender) {
    const g = this.grapple;
    if (!g || !g.submission) return false;
    if (g.submission.defender !== defender) return false;
    if (defender.stamina < 1) return false;
    defender.stamina = Math.max(0, defender.stamina - 0.8);
    defender.taps = (defender.taps || 0) + 1;
    if (defender.taps >= g.submission.escapeRequired) {
      // Escape!
      g.submission.attacker.state = 'ground_top';
      g.submission.defender.state = 'ground_bottom';
      g.submission = null;
      this.pushEvent('submission_escape', { defender: defender.side });
      SFX.block();
      return true;
    }
    return false;
  }

  _updateGrapple() {
    const g = this.grapple;
    if (!g) return;
    g.timer++;
    // Gradually tire both fighters while grappling (cardio burn)
    const burn = 0.04;
    if (g.a) g.a.stamina = Math.max(0, g.a.stamina - burn);
    if (g.b) g.b.stamina = Math.max(0, g.b.stamina - burn);
    if (g.top) g.top.stamina = Math.max(0, g.top.stamina - burn * 0.6);
    if (g.bottom) g.bottom.stamina = Math.max(0, g.bottom.stamina - burn * 1.2);

    // Submission tick: progress builds toward 100, applies damage.
    if (g.submission) {
      const s = g.submission;
      s.hold++;
      // Submission pressure builds faster with attacker skill / defender fatigue
      const pressure = 0.35 + (s.attacker.submissionMul() - s.defender.submissionMul()) * 0.25;
      const fatigue = s.defender.stamina <= 0 ? 0.6 : 0;
      s.progress = Math.min(100, s.progress + pressure + fatigue);
      // Chip damage representing real submission discomfort
      s.defender.hp = Math.max(0, s.defender.hp - s.dpsDrain);
      if (s.defender.hp <= 0 || s.progress >= 100) {
        // Tap / finish
        s.defender.hp = 0;
        s.defender.state = 'down';
        s.defender.downTime = 90;
        this.pushEvent('submission_finish', { kind: s.kind, winner: s.attacker.side });
        SFX.ko();
        this.grapple = null;
        return;
      }
    }

    // Clinch handling: resolve active attacks (clinch knee/elbow/dirty punch) directly.
    if (g.position === 'clinch' && g.a && g.b) {
      // Keep positions locked within the clinch window
      g.a.x = g.centerX - 28 * g.a.facing;
      g.b.x = g.centerX - 28 * g.b.facing;
      g.a.y = ARENA.groundY; g.b.y = ARENA.groundY;
      // Resolve each side's attack frames
      this._resolveClinchAttack(g.a, g.b);
      this._resolveClinchAttack(g.b, g.a);
      // Ref break if very long and nothing happening (>6s no attacks) — simplify: auto break at 360f
      if (g.timer > 360) this._endClinch('ref_break');
    }

    // Ground top & pound resolution
    if ((g.position === 'mount' || g.position === 'back_mount' || g.position === 'side_control') && g.top && g.bottom) {
      g.top.x = g.centerX; g.bottom.x = g.centerX;
      g.top.y = ARENA.groundY; g.bottom.y = ARENA.groundY;
      this._resolveGroundAttack(g.top, g.bottom);
    }
  }

  _resolveClinchAttack(attacker, defender) {
    if (!attacker.attack) return;
    const a = attacker.attack;
    attacker.attackFrame++;
    if (attacker.attackFrame === a.startup + 1 && !attacker.hitConfirm) {
      // Damage application: roughly halved vs strike (clinch proximity, less hip rotation than full shot)
      const baseDmg = Math.round(a.damage * attacker.powerMul() * 0.95);
      // Defender can't block mid-clinch (both hands tied) but has some defense reduction.
      const actualDmg = Math.round(baseDmg * (1.35 - defender.defenseMul() * 0.4));
      defender.hp = Math.max(0, defender.hp - actualDmg);
      defender.special = Math.min(defender.maxSpecial, defender.special + 4);
      attacker.special = Math.min(attacker.maxSpecial, attacker.special + (a.meter || 0));
      this.shake = Math.max(this.shake, 5);
      this.hitstop = 2;
      this.pushEvent('hit', {
        attacker: attacker.side, defender: defender.side,
        dmg: actualDmg, blocked: false, kind: a.kind,
        x: defender.x, y: defender.y - 100,
      });
      attacker.hitConfirm = true;
      if (a.damage >= 8) SFX.hitHard(); else SFX.hit();
      if (defender.hp <= 0) {
        defender.state = 'down'; defender.downTime = 90; defender.vy = -6; defender.vx = 6 * (attacker.x < defender.x ? 1 : -1);
        SFX.ko();
        if (this.grapple) this._endClinch('ko', defender);
        return;
      }
    }
    if (attacker.attackFrame >= a.startup + a.active + a.recovery) {
      attacker.attack = null; attacker.attackFrame = 0; attacker.hitConfirm = false;
    }
  }

  _resolveGroundAttack(attacker, defender) {
    if (!attacker.attack) return;
    const a = attacker.attack;
    attacker.attackFrame++;
    if (attacker.attackFrame === a.startup + 1 && !attacker.hitConfirm) {
      const baseDmg = Math.round(a.damage * attacker.powerMul() * 1.05);
      const actualDmg = Math.round(baseDmg * (1.4 - defender.defenseMul() * 0.3));
      defender.hp = Math.max(0, defender.hp - actualDmg);
      defender.special = Math.min(defender.maxSpecial, defender.special + 3);
      attacker.special = Math.min(attacker.maxSpecial, attacker.special + (a.meter || 0));
      this.shake = Math.max(this.shake, 5);
      this.hitstop = 2;
      this.pushEvent('hit', {
        attacker: attacker.side, defender: defender.side,
        dmg: actualDmg, blocked: false, kind: a.kind,
        x: defender.x, y: defender.y - 20,
      });
      attacker.hitConfirm = true;
      SFX.hit();
      if (defender.hp <= 0) {
        defender.state = 'down'; defender.downTime = 90;
        SFX.ko();
        this._endGround('ko', defender);
        return;
      }
    }
    if (attacker.attackFrame >= a.startup + a.active + a.recovery) {
      attacker.attack = null; attacker.attackFrame = 0; attacker.hitConfirm = false;
    }
  }

  step(dt) {
    this.tick++;
    if (this.hitstop > 0) { this.hitstop--; return; }

    if (this.state === 'intro') {
      if (!this.introPhase) {
        this._advanceIntroPhase();
      }
      // Update referee position each frame.
      this._updateReferee();
      this.introPhaseTime++;
      if (this.introPhaseTime >= this.introPhaseDuration) {
        this._advanceIntroPhase();
      }
      // Expose subTimer as countdown (3-2-1) when in countdown phase,
      // for compatibility with existing HUD renderer.
      if (this.introPhase === 'countdown') {
        this.subTimer = this.introPhaseDuration - this.introPhaseTime;
      } else if (this.introPhase === 'fight') {
        this.subTimer = 0;
      } else {
        this.subTimer = 999; // hide countdown during ceremony phases
      }
      return;
    }

    if (this.state === 'round_end') {
      this.subTimer--;
      this.applyPhysics(this.p1);
      this.applyPhysics(this.p2);
      if (this.subTimer <= 0) {
        if (this.p1Rounds >= this.roundsToWin || this.p2Rounds >= this.roundsToWin) {
          this.state = 'match_end';
          this.lastWinner = this.p1Rounds > this.p2Rounds ? 'p1' : (this.p2Rounds > this.p1Rounds ? 'p2' : null);
          this.pushEvent('match_end', { winner: this.lastWinner });
        } else {
          this.round++;
          this.resetForRound();
        }
      }
      return;
    }

    if (this.state !== 'fight') return;

    // Subtimer for one second of game time
    this.subTime += dt;
    if (this.subTime >= 1) {
      this.subTime -= 1;
      this.timer = Math.max(0, this.timer - 1);
    }

    this.updateFighter(this.p1, this.p2);
    this.updateFighter(this.p2, this.p1);
    // Grapple resolution (clinch/ground damage + submissions)
    this._updateGrapple();
    // Normal striking hit checks only when not both locked in grapple
    if (!this.grapple) {
      this.checkHits(this.p1, this.p2);
      this.checkHits(this.p2, this.p1);
    }
    this.regenStamina(this.p1);
    this.regenStamina(this.p2);

    // Round end conditions
    let winner = null;
    if (this.p1.hp <= 0) winner = 'p2';
    else if (this.p2.hp <= 0) winner = 'p1';
    else if (this.timer <= 0) winner = this.p1.hp >= this.p2.hp ? (this.p1.hp === this.p2.hp ? 'draw' : 'p1') : 'p2';
    if (winner) {
      this.endRound(winner);
    }

    if (this.shake > 0) this.shake--;
    if (this.flash > 0) this.flash--;
  }

  endRound(winner) {
    if (winner === 'p1') this.p1Rounds++;
    else if (winner === 'p2') this.p2Rounds++;
    this.lastRoundWinner = winner;
    this.state = 'round_end';
    this.subTimer = 120;
    this.pushEvent('round_end', { winner, round: this.round });
    if (winner === 'p1') SFX.win(); else if (winner === 'p2') SFX.lose();
  }

  regenStamina(f) {
    if (f.state === 'down' || f.state === 'ko') return;
    let rate = 0.18;
    if (f.state === 'idle' || f.state === 'crouch') rate = 0.45;
    else if (f.state === 'walk') rate = 0.3;
    else if (f.state === 'block') rate = -0.25;
    else if (f.isGrappling && f.isGrappling()) rate = -0.05;  // cardio cost
    f.stamina = Math.max(0, Math.min(f.maxStamina, f.stamina + rate));
  }

  updateFighter(f, opp) {
    if (f.dodgeIFrames > 0) f.dodgeIFrames--;
    if (f.dodgeFrames > 0) {
      f.dodgeFrames--;
      if (f.dodgeFrames === 0 && f.state === 'dodge') {
        f.state = 'idle';
      }
    }
    if (f.stunFrames > 0) {
      f.stunFrames--;
      if (f.stunFrames === 0 && (f.state === 'hit' || f.state === 'block')) {
        f.state = 'idle';
        f.blocking = false;
      }
    }
    if (f.cooldown > 0) f.cooldown--;
    if (f.comboTimer > 0) {
      f.comboTimer--;
      if (f.comboTimer === 0) f.combo = 0;
    }

    if (f.state === 'attack') {
      f.attackFrame++;
      const a = f.attack;
      if (f.attackFrame >= a.startup + a.active + a.recovery) {
        f.state = 'idle';
        f.attack = null;
      }
    }

    if (f.state === 'down') {
      if (f.downTime > 0) f.downTime--;
    }

    // Sprawl recovery (failed TD defense from attacker side).
    if (f.state === 'sprawl') {
      if (f.cooldown <= 0 && f.stunFrames <= 0) {
        f.state = 'idle';
      }
    }

    // Always face opponent unless mid-attack/hit/grapple
    if (['idle', 'walk', 'crouch', 'block', 'jump'].includes(f.state)) {
      f.facing = opp.x > f.x ? 1 : -1;
      // Direction-aware walk animation (forward vs back step)
      if (f.state === 'walk') {
        const towardOpp = Math.sign(opp.x - f.x);
        f.movingDirection = Math.sign(f.vx) === towardOpp ? 1 : Math.sign(f.vx) === 0 ? 0 : -1;
      } else {
        f.movingDirection = 0;
      }
    }

    // Skip physics/positioning for grapple-locked states (engine manages them in _updateGrapple)
    if (!['clinch', 'ground_top', 'ground_bottom', 'sub_offense', 'sub_defense'].includes(f.state)) {
      this.applyPhysics(f);
    }
    f.animTime++;
  }

  applyPhysics(f) {
    f.x += f.vx;
    f.vx *= 0.78;
    if (Math.abs(f.vx) < 0.2) f.vx = 0;

    f.y += f.vy;
    if (f.y < ARENA.groundY) {
      f.vy += ARENA.gravity;
    } else {
      f.y = ARENA.groundY;
      f.vy = 0;
      if (f.state === 'jump') f.state = 'idle';
    }
    f.x = Math.max(ARENA.wallPad, Math.min(ARENA.width - ARENA.wallPad, f.x));
  }

  checkHits(attacker, defender) {
    const hb = attacker.currentHitbox();
    if (!hb) return;
    if (attacker.hitConfirm) return;
    const db = defender.hurtbox();
    if (!db) return;
    if (!rectsOverlap(hb, db)) return;
    // Determine block status
    const facingAttacker = (attacker.x < defender.x && defender.facing === -1) || (attacker.x > defender.x && defender.facing === 1);
    const blocked =
      defender.blocking &&
      facingAttacker &&
      hb.kind !== 'low' &&
      defender.stamina > 0 &&
      defender.state !== 'attack';
    // Crouch avoids 'high' attacks unless launcher/special
    if (defender.crouching && hb.kind === 'high' && !attacker.attack.unblockable) {
      attacker.hitConfirm = true;
      return;
    }
    const baseDmg = Math.round(attacker.attack.damage * attacker.powerMul() * (attacker.combo > 0 ? 0.85 : 1));
    const result = defender.takeHit(baseDmg, attacker, attacker.attack, blocked);
    if (result.dodged) return;
    attacker.hitConfirm = true;
    attacker.special = Math.min(attacker.maxSpecial, attacker.special + (attacker.attack.meter || 0));
    attacker.combo += 1;
    attacker.comboTimer = 50;
    attacker.lastDamageDealt = result.dmg;
    this.shake = result.blocked ? 4 : Math.min(14, 6 + Math.round(result.dmg * 0.4));
    this.flash = result.blocked ? 2 : 4;
    this.hitstop = result.blocked ? 1 : (attacker.attack.unblockable ? 7 : (result.dmg >= 12 ? 4 : 2));
    this.pushEvent('hit', {
      attacker: attacker.side,
      defender: defender.side,
      dmg: result.dmg,
      blocked: result.blocked,
      kind: attacker.attack.kind,
      x: defender.x,
      y: defender.y - 100,
    });
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
export function easeInCubic(t) { return t * t * t; }
export function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
