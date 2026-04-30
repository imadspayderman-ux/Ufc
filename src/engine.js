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

// Submission catalogue. UFC 5-style two-bar minigame:
//   - lockBuild: how fast attacker fills the FINISH gauge (per frame baseline)
//   - escapeGain: how much the defender's ESCAPE gauge moves per timed tap
//   - decay: how much the attacker's gauge passively decays per frame (defender struggle)
//   - drainAtk / drainDef: stamina cost per second to attacker / defender while held
//   - dps: chip damage applied per frame to defender while locked in
export const SUBMISSIONS = {
  guillotine:        { name: 'GUILLOTINE',       lockBuild: 0.55, escapeGain: 6, decay: 0.18, drainAtk: 0.12, drainDef: 0.18, dps: 0.30, fromPos: ['front_headlock', 'clinch'] },
  rear_naked_choke:  { name: 'REAR-NAKED CHOKE', lockBuild: 0.62, escapeGain: 5, decay: 0.16, drainAtk: 0.14, drainDef: 0.22, dps: 0.40, fromPos: ['back_mount'] },
  armbar:            { name: 'ARMBAR',           lockBuild: 0.58, escapeGain: 6, decay: 0.20, drainAtk: 0.13, drainDef: 0.18, dps: 0.30, fromPos: ['mount', 'guard'] },
  triangle:          { name: 'TRIANGLE',         lockBuild: 0.50, escapeGain: 6, decay: 0.18, drainAtk: 0.10, drainDef: 0.18, dps: 0.32, fromPos: ['guard'] },
  kimura:            { name: 'KIMURA',           lockBuild: 0.55, escapeGain: 7, decay: 0.20, drainAtk: 0.12, drainDef: 0.16, dps: 0.28, fromPos: ['side_control', 'guard'] },
  // ---- New (front-headlock & half-guard) submissions -----------------
  darce:             { name: "D'ARCE CHOKE",     lockBuild: 0.50, escapeGain: 6, decay: 0.18, drainAtk: 0.13, drainDef: 0.20, dps: 0.32, fromPos: ['front_headlock'] },
  anaconda:          { name: 'ANACONDA CHOKE',   lockBuild: 0.55, escapeGain: 5, decay: 0.16, drainAtk: 0.14, drainDef: 0.22, dps: 0.36, fromPos: ['front_headlock'] },
  kneebar:           { name: 'KNEEBAR',          lockBuild: 0.52, escapeGain: 7, decay: 0.20, drainAtk: 0.10, drainDef: 0.18, dps: 0.28, fromPos: ['half_guard', 'side_control'] },
};

// Helpers — UFC 5 outcomes feel earned, not random. Grappling success is driven
// by skill, stamina, position, and strike setups so repeated inputs are readable.
function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function _staminaRatio(f) { return f.maxStamina > 0 ? f.stamina / f.maxStamina : 0; }
function _grappleScore(attackerSkill, defenderSkill, attacker, defender, opts = {}) {
  const skillTotal = attackerSkill + defenderSkill;
  const skillR = skillTotal > 0 ? attackerSkill / skillTotal : 0.5;
  const sa = _staminaRatio(attacker);
  const sd = _staminaRatio(defender);
  const staminaSwing = (sa - sd) * 0.18;
  const bias = (opts.bias || 0);
  return _clamp(skillR + staminaSwing + bias, 0.05, 0.95);
}
function _grappleSuccess(attackerSkill, defenderSkill, attacker, defender, opts = {}) {
  return _grappleScore(attackerSkill, defenderSkill, attacker, defender, opts) >= (opts.threshold || 0.52);
}

export class FighterState {
  constructor(data, side) {
    this.data = data;
    this.side = side; // 'p1' | 'p2'
    this.facing = side === 'p1' ? 1 : -1;
    this.x = side === 'p1' ? 340 : 940;
    this.y = ARENA.groundY;
    this.vx = 0;
    this.vy = 0;
    this.lastX = this.x;
    this.stepBurst = 0;
    this.balanceShift = 0;

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
    // may store role hints + escape-gauge for sub defense.
    this.grappleRole = null;       // 'top' | 'bottom' | 'clinch_a' | 'clinch_b'
    this.taps = 0;                  // legacy counter exposed for renderer/HUD
    this.escapeGauge = 0;           // 0..100 escape progress (UFC5-style)
    this.lastTapFrame = -999;       // frame index of last well-timed tap
    this.escapePulse = 0;           // visual pulse when a submission escape input lands
    this.clinchGuardFrames = 0;     // active clinch framing / punch defense
    this.groundShellFrames = 0;     // active ground shell against ground-and-pound
    this.submissionSetupFrames = 0; // strike-created submission opening
    this.submissionSetupBonus = 0;
    this.submissionSetupKind = null;
    this.movingDirection = 0;       // -1 retreat / +1 advance vs opponent (for walk anim)
    // Position the renderer needs to know to pick correct ground pose:
    // 'mount' / 'back_mount' / 'side_control' lay defender flat,
    // 'guard' keeps the bottom's legs up wrapping the top's hips.
    this.groundPosition = null;
    // Hit reaction stagger (separate from raw stunFrames): tracks how the
    // body whip-reacts to the last clean strike so the renderer can play a
    // brief lean-back / head-snap pose without affecting timing.
    this.hitReact = 0;             // 0..1 intensity, decays every frame
    this.hitReactDir = 0;          // ±1, set when struck
    // Independent head-snap on clean head shots (not just torso whip).
    this.headSnap = 0;             // 0..1 magnitude, decays every frame
    this.headSnapDir = 0;
    // Cumulative leg damage from low kicks. UFC 5-style: a fighter whose
    // leg health bottoms out limps and loses speed/balance.
    this.legHealth = 100;
    this.legCrippled = false;
    // Wobble ("rocked") state: a violent stagger after a heavy clean strike,
    // during which block & dodge are temporarily disabled. Decoupled from
    // stunFrames so we can sustain a longer woozy animation without breaking
    // the standard hitstun timings.
    this.wobbleFrames = 0;
    this.wobbleHelpless = 0;       // first-half window where defense is locked out
    // Submission tap rhythm bookkeeping (UFC 5-style timed-escape minigame).
    this.lastTapEffective = false; // last tap landed in the perfect rhythm window
  }

  isActionable() {
    // Two-phase wobble: hard lockout for the first ~24f (wobbleHelpless),
    // then a soft window where the defender can raise a panicked block.
    // We treat 'wobble' as an actionable starting state during the soft phase.
    if (this.wobbleFrames > 0 && this.wobbleHelpless > 0) return false;
    const ok = ['idle', 'walk', 'crouch', 'jump', 'block', 'dodge'].includes(this.state)
            || (this.state === 'wobble' && this.wobbleHelpless <= 0);
    return ok && this.cooldown <= 0;
  }
  isOnGround() { return this.y >= ARENA.groundY - 0.1; }
  // weight-class aware modifiers. A crippled lead leg shaves ~40% off speed
  // and ~15% off balance/defense, mirroring UFC 5's leg-damage feedback loop.
  speedMul() {
    const base = (0.7 + this.data.stats.speed * 0.05) * this.weightClass.speedMul;
    return this.legCrippled ? base * 0.6 : base;
  }
  powerMul() { return (0.7 + this.data.stats.power * 0.05) * this.weightClass.powerMul; }
  defenseMul() { return 0.7 + this.data.stats.defense * 0.04; }
  techMul() { return 0.85 + this.data.stats.technique * 0.03; }
  wrestlingMul() { return 0.6 + ((this.data.grappling && this.data.grappling.wrestling) || 5) * 0.06; }
  submissionMul() { return 0.6 + ((this.data.grappling && this.data.grappling.submissions) || 5) * 0.06; }
  takedownDefMul() { return 0.6 + ((this.data.grappling && this.data.grappling.takedownDef) || 5) * 0.06; }
  clinchMul() { return 0.6 + ((this.data.grappling && this.data.grappling.clinch) || 5) * 0.06; }

  isGrappling() {
    return [
      'clinch', 'ground_top', 'ground_bottom', 'sub_offense', 'sub_defense',
      'takedown', 'takedown_shoot', 'takedown_defend', 'sprawl',
      'front_headlock_top', 'front_headlock_bottom',
    ].includes(this.state);
  }

  faceTarget(targetX) {
    if (!this.isActionable()) return;
    this.facing = targetX > this.x ? 1 : -1;
  }

  startAttack(kind) {
    const a = ATTACK_DATA[kind];
    if (!a) return false;
    // Clinch attacks: only valid when tied up standing.
    if (a.clinch) {
      if (this.state !== 'clinch' && this.state !== 'front_headlock_top') return false;
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
    this.vx = -this.facing * 9.2;
    this.stepBurst = 1.15;
  }

  startJump() {
    if (!this.isActionable() || !this.isOnGround()) return;
    this.state = 'jump';
    this.vy = -16;
    this.stepBurst = 0.65;
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
    // Hit-react: the body whips relative to where the strike came from.
    // High-damage / launcher strikes produce a stronger whip; blocked hits
    // give a lighter shoulder rock.
    const reactDir = (attacker.x < this.x) ? 1 : -1;
    this.hitReactDir = reactDir;
    const whip = blockedFlag ? 0.25 : (attack.launch ? 1.0 : Math.min(1, 0.4 + dmg / 24));
    this.hitReact = Math.max(this.hitReact, whip);
    // Independent head-snap on clean head shots — the head whips harder than
    // the torso, scaling with damage. This decouples cosmetic head movement
    // from the torso whip so cleanly-landed punches snap the head visibly.
    if (!blockedFlag && (attack.height === 'high' || attack.kind === 'cross' ||
        attack.kind === 'jab' || attack.kind === 'uppercut' || attack.kind === 'head_kick')) {
      const snap = attack.launch ? 1.0 : Math.min(1, 0.55 + dmg / 18);
      this.headSnap = Math.max(this.headSnap, snap);
      this.headSnapDir = reactDir;
    }
    if (blockedFlag && !attack.unblockable) {
      blocked = true;
      actualDmg = Math.round(dmg * (0.18 + (1 - this.defenseMul()) * 0.3));
      actualDmg = Math.max(1, Math.min(actualDmg, dmg));
      this.stamina = Math.max(0, this.stamina - 6 - dmg * 0.4);
      stun = 6;
    } else {
      actualDmg = Math.round(dmg * (1.6 - this.defenseMul() * 0.45));
      // Round to an integer so stunFrames-- can hit exactly 0 (otherwise the
      // === 0 check below misfires and the fighter sticks in 'hit' forever).
      stun = attack.launch ? 24 : Math.round(14 + Math.min(8, dmg / 2));
    }
    if (attack.drain) {
      this.stamina = Math.max(0, this.stamina - attack.drain);
    }
    // Cumulative leg damage on low kicks. Once the leg health bottoms out,
    // the fighter limps for the rest of the round (legCrippled = true).
    if (!blocked && attack.height === 'low') {
      this.legHealth = Math.max(0, this.legHealth - actualDmg * 0.9);
      if (!this.legCrippled && this.legHealth <= 30) {
        this.legCrippled = true;
      }
    }
    this.hp = Math.max(0, this.hp - actualDmg);
    this.special = Math.min(this.maxSpecial, this.special + (blocked ? 2 : 4));

    // knockback — scales with raw damage so heavier strikes send opponent
    // flying further. Cleanly-landed bombs briefly lift the opponent (small
    // negative vy) for that classic MMA "rocked" look.
    const dir = attacker.x < this.x ? 1 : -1;
    const dmgKick = blocked ? 0 : Math.min(6, dmg * 0.22);
    this.vx = dir * ((attack.pushback || 5) + dmgKick) * (blocked ? 0.45 : 1.12);
    this.stepBurst = blocked ? 0.32 : Math.min(1.4, 0.45 + actualDmg / 18);
    this.balanceShift = dir * (blocked ? 0.35 : Math.min(1.2, 0.45 + actualDmg / 26));
    if (attack.launch && !blocked) {
      this.vy = -10;
    } else if (!blocked && dmg >= 14) {
      // Heavy non-launcher strike: slight hop to sell the impact.
      this.vy = Math.min(this.vy, -3.3);
    }

    if (this.hp <= 0) {
      this.state = 'down';
      this.downTime = 90;
      this.vy = -8;
      this.vx = dir * 8;
      SFX.ko();
    } else {
      // Wobble/rocked check: a clean heavy strike (or a damaging strike when
      // already gassed and low on HP) puts the defender into a drunken stagger
      // for ~50 frames. The first half locks out block & dodge — a real opening
      // for the attacker to capitalise (UFC 5 "flash KO" feel).
      const lowHp = this.hp <= this.maxHp * 0.30;
      const heavyClean = !blocked && (actualDmg >= 16 || (actualDmg >= 11 && lowHp));
      if (heavyClean) {
        this.wobbleFrames = 50;
        this.wobbleHelpless = 24;
        this.state = 'wobble';
        this.stunFrames = Math.max(stun, 24);
        this.blocking = false;
        this.crouching = false;
        // Slightly bigger knockback when rocked.
        this.vx *= 1.25;
      } else if (blocked) {
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
    if (this.state === 'wobble') {
      // Wobbling fighter is wide-open: a slightly larger hurtbox makes
      // capitalising on the rocked window feel decisive.
      halfW = 42; halfH = 96; cy = this.y - 92;
    }
    void topY;
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
    //   submission: null | { kind, attacker, defender, progress, escape, lockBuild, ... }
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
    // Reset round-only fight-damage state: leg health refreshes between
    // rounds (the ringside doctor / corner work is implied), wobble clears,
    // head-snap residue clears.
    for (const f of [this.p1, this.p2]) {
      f.legHealth = 100; f.legCrippled = false;
      f.wobbleFrames = 0; f.wobbleHelpless = 0;
      f.headSnap = 0; f.headSnapDir = 0;
      f.hitReact = 0; f.hitReactDir = 0;
      f.lastTapEffective = false;
    }
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
    // Stamina-weighted skill curve (UFC 5 feel): tired defender easier to clinch.
    const push = a.clinchMul() * 1.1;
    const resist = (b.clinchMul() + b.takedownDefMul()) * 0.5;
    if (!_grappleSuccess(push, resist, a, b)) {
      // Failed — briefly stumble
      a.state = 'idle';
      a.cooldown = 12;
      return false;
    }
    const centerX = (a.x + b.x) / 2;
    a.state = 'clinch'; b.state = 'clinch';
    // Wider clinch separation so torsos don't merge visually (UFC 5-style spacing).
    a.x = centerX - 42 * a.facing; b.x = centerX - 42 * b.facing;
    a.vx = 0; b.vx = 0;
    a.facing = b.x > a.x ? 1 : -1; b.facing = a.x > b.x ? 1 : -1;
    a.grappleRole = 'clinch_a'; b.grappleRole = 'clinch_b';
    a.groundPosition = 'clinch'; b.groundPosition = 'clinch';
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
    // Defender of break (the holder) gains slight bias.
    if (!_grappleSuccess(push, hold, f, other, { bias: -0.05 })) return false;
    this._endClinch('break');
    return true;
  }

  _endClinch(reason, except = null) {
    const g = this.grapple;
    if (!g) return;
    // Determine separation: who is on which side?
    if (g.a && g.a !== except) { g.a.state = 'idle'; g.a.grappleRole = null; g.a.attack = null; g.a.attackFrame = 0; g.a.cooldown = 10; g.a.groundPosition = null; }
    else if (g.a === except) { g.a.grappleRole = null; g.a.attack = null; g.a.attackFrame = 0; g.a.groundPosition = null; }
    if (g.b && g.b !== except) { g.b.state = 'idle'; g.b.grappleRole = null; g.b.attack = null; g.b.attackFrame = 0; g.b.cooldown = 10; g.b.groundPosition = null; }
    else if (g.b === except) { g.b.grappleRole = null; g.b.attack = null; g.b.attackFrame = 0; g.b.groundPosition = null; }
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
    // Wrestlers / judo: small bonus when shooting from the clinch (already gripped).
    const bias = inClinch ? 0.05 : 0;
    const success = _grappleSuccess(skill, def, attacker, defender, { bias });
    if (!success) {
      // sprawled — attacker briefly on knees, defender gains momentum.
      if (inClinch) this._endClinch('sprawl');
      defender.special = Math.min(defender.maxSpecial, defender.special + 8);
      const subSnap = defender.submissionMul() + defender.specialty.groundAffinity * 0.2;
      const wrestleSnap = defender.wrestlingMul();
      const snapScore = _grappleScore(subSnap + wrestleSnap * 0.5, attacker.wrestlingMul() + attacker.takedownDefMul() * 0.35, defender, attacker, { bias: 0.04 });
      if (snapScore >= 0.56) {
        this._startFrontHeadlock(defender, attacker);
        this.pushEvent('takedown_failed', { attacker: attacker.side, snap: 'front_headlock' });
        SFX.block();
        return false;
      }
      attacker.state = 'sprawl';
      attacker.cooldown = 40;
      attacker.stunFrames = 30;
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
    // Play a takedown shoot/drive/slam animation before settling on the ground.
    // The animation drives both fighters' poses for ~36 frames, then we lock
    // into the proper top/bottom ground state.
    this._startTakedownAnim(attacker, defender, pos);
    this.pushEvent('takedown_success', { attacker: attacker.side, position: pos });
    SFX.hitHard();
    return true;
  }

  // Multi-phase takedown sequence: shoot (low level change) → drive (lift/turn)
  // → slam (crash to mat). The grapple object holds the animation state until
  // it ticks down, at which point we settle into _startGround.
  _startTakedownAnim(attacker, defender, targetPos) {
    const centerX = (attacker.x + defender.x) / 2;
    attacker.x = centerX; defender.x = centerX;
    attacker.state = 'takedown_shoot';
    defender.state = 'takedown_defend';
    attacker.grappleRole = 'top'; defender.grappleRole = 'bottom';
    attacker.attack = null; attacker.attackFrame = 0;
    defender.attack = null; defender.attackFrame = 0;
    attacker.vx = 0; attacker.vy = 0; defender.vx = 0; defender.vy = 0;
    // Total animation length: 12 (shoot) + 14 (drive) + 12 (slam) = 38 frames.
    this.grapple = {
      top: attacker, bottom: defender, position: targetPos, centerX,
      timer: 0, submission: null,
      takedownAnim: { frame: 0, totalFrames: 38, shootEnd: 12, driveEnd: 26 },
    };
  }

  _startGround(top, bottom, position) {
    const centerX = (top.x + bottom.x) / 2;
    top.x = centerX; bottom.x = centerX;
    top.state = 'ground_top'; bottom.state = 'ground_bottom';
    top.grappleRole = 'top'; bottom.grappleRole = 'bottom';
    // Renderer reads groundPosition to pick supine vs. guard pose so the
    // bottom fighter doesn't visually overlap the top fighter.
    top.groundPosition = position; bottom.groundPosition = position;
    top.attack = null; top.attackFrame = 0;
    bottom.attack = null; bottom.attackFrame = 0;
    top.vx = 0; top.vy = 0; bottom.vx = 0; bottom.vy = 0;
    // Scramble: rises while the bottom mashes for an escape, drops when the
    // top lands ground-and-pound or transitions. At 100 the bottom escapes.
    // sinceStrike: frames since the top last landed a strike (used to give
    // a small grace period before the scramble can begin to climb again).
    this.grapple = { top, bottom, position, centerX, timer: 0, submission: null,
                     scramble: 0, sinceStrike: 9999 };
    top.scrambleGauge = 0; bottom.scrambleGauge = 0;
  }

  // Bottom mashes / struggles for an escape. Each call pushes the shared
  // scramble gauge up — at 100 the bottom finally stands up. The top can
  // suppress the gauge by landing ground-and-pound (see _resolveGroundAttack).
  // This makes ground control feel like an active contest instead of a
  // single coin flip on the very first frame.
  tryStandUp(f) {
    const g = this.grapple;
    if (!g || !g.top || !g.bottom) return false;
    if (g.submission) return false;
    const bottom = g.bottom;
    if (f !== bottom) return false;
    if (bottom.stamina < 4) return false;
    bottom.stamina -= 3;
    // Each press contributes a chunk of scramble. Skill differential
    // accelerates / hampers the climb. Mount and back-mount are heavier
    // pins than guard.
    const skillGap = bottom.wrestlingMul() + bottom.takedownDefMul()
                   - g.top.wrestlingMul() * 1.1;
    const posBias = (g.position === 'mount' || g.position === 'back_mount') ? 0.65
                    : g.position === 'side_control' ? 0.85
                    : g.position === 'half_guard' ? 1.0
                    : g.position === 'guard' ? 1.15
                    : 1.0;
    const push = (8 + skillGap * 4) * posBias;
    g.scramble = Math.max(0, Math.min(100, g.scramble + Math.max(2, push)));
    bottom.scrambleGauge = g.scramble;
    g.top.scrambleGauge = g.scramble;
    this.pushEvent('ground_struggle', { defender: bottom.side, scramble: g.scramble });
    if (g.scramble >= 100) {
      this._endGround('standup');
      return true;
    }
    return false;
  }

  // Top attempts to pass guard / advance position; reserved for future.
  tryPositionAdvance(f) {
    const g = this.grapple;
    if (!g || !g.top || !g.bottom) return false;
    if (f !== g.top) return false;
    // Common: defender gets a brief denial window after a transition attempt.
    // If they react in time, the advance fails and they may even reverse.
    if (f.stamina < 8) return false;
    f.stamina -= 6;
    if (g.position === 'mount') {
      // Try to take the back if bottom turns away.
      const adv = f.wrestlingMul() * 0.9 + f.specialty.groundAffinity * 0.2;
      const def = g.bottom.takedownDefMul() * 0.9 + g.bottom.specialty.groundAffinity * 0.2;
      if (_grappleSuccess(adv, def, f, g.bottom, { bias: -0.10 })) {
        g.position = 'back_mount';
        g.bottom.groundPosition = 'back_mount';
        g.top.groundPosition = 'back_mount';
        this.pushEvent('position_advance', { position: 'back_mount' });
        return true;
      }
      return false;
    } else if (g.position === 'side_control') {
      // Step over to mount.
      const adv = f.wrestlingMul() + f.specialty.groundAffinity * 0.2;
      const def = g.bottom.takedownDefMul() * 0.85 + g.bottom.specialty.groundAffinity * 0.25;
      if (_grappleSuccess(adv, def, f, g.bottom, { bias: 0.05 })) {
        g.position = 'mount';
        g.bottom.groundPosition = 'mount';
        g.top.groundPosition = 'mount';
        this.pushEvent('position_advance', { position: 'mount' });
        return true;
      }
      return false;
    } else if (g.position === 'guard') {
      // Pass guard. Two outcomes by skill margin:
      //   - Big margin or BJJ-weak bottom: full pass to side_control.
      //   - Smaller margin: partial pass — settles in HALF GUARD (one leg
      //     trapped). UFC 5-style: passing guard is rarely all-or-nothing.
      if (f.stamina < 10) return false;
      f.stamina -= 4;
      const pass = f.wrestlingMul() * 1.1;
      const hold = g.bottom.submissionMul() * 1.0 + g.bottom.specialty.groundAffinity * 0.4;
      if (_grappleSuccess(pass, hold, f, g.bottom)) {
        // Decisive pass — full side control.
        g.position = 'side_control';
        g.bottom.groundPosition = 'side_control';
        g.top.groundPosition = 'side_control';
        this.pushEvent('position_advance', { position: 'side_control' });
        return true;
      }
      // Partial-pass roll: even a failed full pass can settle in half guard
      // when the top fighter is the more skilled grappler / has an explicit
      // wrestling edge. This rewards persistent passing without being binary.
      const partialScore = _grappleScore(pass, hold, f, g.bottom, { bias: 0.02 });
      const partial = partialScore >= 0.48;
      if (partial) {
        g.position = 'half_guard';
        g.bottom.groundPosition = 'half_guard';
        g.top.groundPosition = 'half_guard';
        this.pushEvent('position_advance', { position: 'half_guard' });
        return true;
      }
      return false;
    } else if (g.position === 'half_guard') {
      // Half guard → mount or side_control depending on which way top works.
      if (f.stamina < 10) return false;
      f.stamina -= 4;
      const pass = f.wrestlingMul() * 1.05 + f.specialty.groundAffinity * 0.15;
      const hold = g.bottom.submissionMul() * 0.9 + g.bottom.specialty.groundAffinity * 0.35;
      if (_grappleSuccess(pass, hold, f, g.bottom, { bias: 0.05 })) {
        // Top picks the better of mount / side_control by their own ground style.
        const target = f.specialty.groundAffinity >= 0.7 ? 'mount' : 'side_control';
        g.position = target;
        g.bottom.groundPosition = target;
        g.top.groundPosition = target;
        this.pushEvent('position_advance', { position: target });
        return true;
      }
      return false;
    }
    return false;
  }

  // Sweep / reversal: bottom fighter (in guard or half-guard) reverses
  // position, ending up on top in side_control. UFC 5-style sweep window —
  // technique + speed + cardio matter; BJJ players sweep most reliably.
  trySweep(f) {
    const g = this.grapple;
    if (!g || !g.top || !g.bottom) return false;
    if (f !== g.bottom) return false;
    if (g.submission) return false;
    if (!['guard', 'half_guard'].includes(g.position)) return false;
    if (f.stamina < 14) return false;
    f.stamina -= 12;
    const sweep = f.wrestlingMul() * 0.9 + f.submissionMul() * 0.4 + f.specialty.groundAffinity * 0.4;
    const baseHold = g.top.wrestlingMul() * 1.05 + g.top.specialty.groundAffinity * 0.2;
    // Half guard sweeps are a bit easier than full guard sweeps because the
    // bottom controls a leg.
    const bias = g.position === 'half_guard' ? 0.06 : -0.04;
    if (!_grappleSuccess(sweep, baseHold, f, g.top, { bias })) {
      this.pushEvent('sweep_failed', { defender: f.side });
      return false;
    }
    // Reverse roles: new top = old bottom, new bottom = old top, ending in side_control.
    const newTop = g.bottom, newBottom = g.top;
    g.top = newTop; g.bottom = newBottom;
    g.position = 'side_control';
    newTop.state = 'ground_top'; newTop.grappleRole = 'top';
    newBottom.state = 'ground_bottom'; newBottom.grappleRole = 'bottom';
    newTop.groundPosition = 'side_control'; newBottom.groundPosition = 'side_control';
    newTop.attack = null; newTop.attackFrame = 0;
    newBottom.attack = null; newBottom.attackFrame = 0;
    // Reset scramble: the old bottom's escape progress shouldn't carry over
    // to the new bottom after a full positional reversal.
    g.scramble = 0; g.sinceStrike = 9999;
    newTop.scrambleGauge = 0; newBottom.scrambleGauge = 0;
    this.pushEvent('sweep_success', { newTop: newTop.side, position: 'side_control' });
    SFX.hitHard();
    return true;
  }

  // Snap-down to FRONT-HEADLOCK off a successful sprawl. Defender becomes
  // top-controller (standing/kneeling), attacker becomes bent-over bottom.
  _startFrontHeadlock(controller, caught) {
    const centerX = (controller.x + caught.x) / 2;
    controller.x = centerX - 18 * controller.facing;
    caught.x = centerX + 12 * controller.facing;
    controller.y = ARENA.groundY; caught.y = ARENA.groundY;
    controller.vx = 0; controller.vy = 0; caught.vx = 0; caught.vy = 0;
    controller.state = 'front_headlock_top';
    caught.state = 'front_headlock_bottom';
    controller.grappleRole = 'top';
    caught.grappleRole = 'bottom';
    controller.groundPosition = 'front_headlock';
    caught.groundPosition = 'front_headlock';
    controller.attack = null; controller.attackFrame = 0;
    caught.attack = null; caught.attackFrame = 0;
    this.grapple = {
      top: controller, bottom: caught, position: 'front_headlock',
      centerX, timer: 0, submission: null,
    };
    this.pushEvent('front_headlock_start', { controller: controller.side });
  }

  _endGround(reason, except = null) {
    const g = this.grapple;
    if (!g) return;
    if (g.top && g.top !== except) { g.top.state = 'idle'; g.top.grappleRole = null; g.top.attack = null; g.top.attackFrame = 0; g.top.cooldown = 14; g.top.groundPosition = null; }
    else if (g.top === except) { g.top.grappleRole = null; g.top.attack = null; g.top.attackFrame = 0; g.top.groundPosition = null; }
    if (g.bottom && g.bottom !== except) { g.bottom.state = 'idle'; g.bottom.grappleRole = null; g.bottom.attack = null; g.bottom.attackFrame = 0; g.bottom.cooldown = 14; g.bottom.groundPosition = null; }
    else if (g.bottom === except) { g.bottom.grappleRole = null; g.bottom.attack = null; g.bottom.attackFrame = 0; g.bottom.groundPosition = null; }
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
    if (pos === 'front_headlock') {
      // Front headlock has top + bottom roles (controller is top).
      if (!isTop) return false;
    } else {
      void isClinchA;
    }
    if ((pos === 'mount' || pos === 'back_mount' || pos === 'side_control' || pos === 'half_guard') && !isTop) return false;
    if (pos === 'guard' && !isBottom) return false;
    const defender = attacker === g.a ? g.b : attacker === g.b ? g.a : attacker === g.top ? g.bottom : g.top;
    if (attacker.stamina < 14) return false;
    attacker.stamina -= 12;
    const skill = attacker.submissionMul() * 1.2;
    const def = defender.submissionMul() * 0.85 + defender.takedownDefMul() * 0.5;
    const setupBonus = attacker.submissionSetupFrames > 0 ? (attacker.submissionSetupBonus || 0) : 0;
    const setupKind = attacker.submissionSetupFrames > 0 ? attacker.submissionSetupKind : null;
    const kindBonus = setupKind === kind ? setupBonus : setupBonus * 0.55;
    // Position bias: dominant positions (back, mount, front_headlock) make
    // lock-in easier; armbars from guard are a real gamble; kneebars from
    // half_guard / side_control are technically harder.
    const posBias = (pos === 'back_mount') ? 0.10
                  : (pos === 'mount') ? 0.05
                  : (pos === 'front_headlock') ? 0.08
                  : (pos === 'half_guard') ? -0.04
                  : (pos === 'guard' && isBottom) ? -0.05
                  : 0;
    if (!_grappleSuccess(skill, def, attacker, defender, { bias: posBias + kindBonus })) {
      // Failed lock-in — costs position for aggressive subs from guard
      if (pos === 'guard' && isBottom) this._endGround('escape_from_guard');
      this.pushEvent('submission_failed', { kind });
      return false;
    }
    attacker.submissionSetupFrames = 0;
    attacker.submissionSetupBonus = 0;
    attacker.submissionSetupKind = null;
    attacker.state = 'sub_offense';
    defender.state = 'sub_defense';
    defender.taps = 0;
    defender.escapeGauge = 0;
    g.submission = {
      kind, attacker, defender,
      progress: 0,            // 0..100 attacker FINISH gauge
      escape: 0,              // 0..100 defender ESCAPE gauge
      hold: 0,                // frames held
      lockBuild: sub.lockBuild,
      escapeGain: sub.escapeGain,
      decay: sub.decay,
      drainAtk: sub.drainAtk,
      drainDef: sub.drainDef,
      dpsDrain: sub.dps,
      // Lock-in animation: 24 frames of "wrapping up the limb" before pressure
      // starts building. The defender can't tap-escape during this window so
      // the attacker visibly secures the hold first.
      lockIn: { frame: 0, totalFrames: 24 },
    };
    this.pushEvent('submission_start', { kind, attacker: attacker.side });
    SFX.special();
    return true;
  }

  // Defender taps escape button — UFC 5-style two-bar minigame:
  //   - each timed tap fills the ESCAPE gauge by escapeGain (skill-scaled)
  //   - PERFECT-RHYTHM taps (~22-32 frames since last tap) get 1.5x boost.
  //   - SPAM taps (<18 frames since last) get a 0.6x penalty + tap-fatigue.
  //   - each tap also nudges the attacker's FINISH gauge backward.
  //   - if the ESCAPE gauge reaches 100, the defender breaks free.
  submissionTap(defender) {
    const g = this.grapple;
    if (!g || !g.submission) return false;
    if (g.submission.defender !== defender) return false;
    // Taps don't count while the attacker is still locking in the hold.
    if (g.submission.lockIn) return false;
    if (defender.stamina < 0.6) return false;
    // Throttle: still ignore truly back-to-back frames (debounce).
    const frame = this.tick || 0;
    if (frame - defender.lastTapFrame < 2) return false;
    const gap = frame - defender.lastTapFrame;
    defender.lastTapFrame = frame;
    // Rhythm scoring window. Wider tolerance band so it doesn't feel punitive.
    let rhythmMul = 1.0;
    if (gap >= 22 && gap <= 32) {
      rhythmMul = 1.5;          // perfectly timed escape pulse
      defender.lastTapEffective = true;
    } else if (gap < 18) {
      rhythmMul = 0.6;          // spam penalty
      defender.lastTapEffective = false;
    } else {
      rhythmMul = 1.1;          // close enough — mild boost
      defender.lastTapEffective = false;
    }
    // Each tap costs a sliver of stamina; spam taps cost more.
    const tapCost = rhythmMul < 1 ? 0.85 : 0.6;
    defender.stamina = Math.max(0, defender.stamina - tapCost);
    defender.taps = (defender.taps || 0) + 1;
    defender.escapePulse = rhythmMul;
    const s = g.submission;
    // Escape progress is skill+stamina weighted: well-conditioned BJJ defender
    // climbs faster, gassed striker climbs slowly even with frantic taps.
    const skillBoost = defender.submissionMul();
    const staminaScale = 0.5 + 0.5 * _staminaRatio(defender);
    s.escape = Math.min(100, s.escape + s.escapeGain * skillBoost * staminaScale * rhythmMul);
    // Each effective tap also pushes the attacker's lock back a touch.
    s.progress = Math.max(0, s.progress - s.escapeGain * 0.4 * rhythmMul);
    if (s.escape >= 100) {
      // Escape! Position usually demotes (mount → guard, back → guard).
      const att = s.attacker, def = s.defender;
      att.state = 'ground_top'; def.state = 'ground_bottom';
      // Demote position to reward the escape.
      if (g.position === 'back_mount' || g.position === 'mount') {
        g.position = 'guard';
        att.groundPosition = 'guard'; def.groundPosition = 'guard';
      }
      // From front_headlock the escape ends the engagement entirely (the
      // attacker shoots back to half-shot or the fighters scramble apart).
      if (g.position === 'front_headlock') {
        g.submission = null;
        att.subLockKind = null; def.subLockKind = null;
        att.subProgress = 0; def.subProgress = 0;
        this.pushEvent('submission_escape', { defender: defender.side });
        SFX.block();
        this._endFrontHeadlock('escape');
        return true;
      }
      g.submission = null;
      // Clear submission visuals so the renderer drops back to neutral pose.
      att.subLockKind = null; def.subLockKind = null;
      att.subProgress = 0; def.subProgress = 0;
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
    for (const f of [g.a, g.b, g.top, g.bottom]) {
      if (!f) continue;
      f.clinchGuardFrames = Math.max(0, (f.clinchGuardFrames || 0) - 1);
      f.groundShellFrames = Math.max(0, (f.groundShellFrames || 0) - 1);
      f.submissionSetupFrames = Math.max(0, (f.submissionSetupFrames || 0) - 1);
      f.escapePulse = Math.max(0, (f.escapePulse || 0) - 0.12);
    }
    // Scramble passively bleeds back down between mash inputs (the top
    // re-establishes posture). Bleeds faster the longer it's been since
    // the last strike landed (i.e. the bottom is fresh to push).
    if (typeof g.scramble === 'number') {
      g.sinceStrike = (g.sinceStrike || 0) + 1;
      const decay = g.sinceStrike < 60 ? 0.45 : 0.18;
      g.scramble = Math.max(0, g.scramble - decay);
      if (g.bottom) g.bottom.scrambleGauge = g.scramble;
      if (g.top) g.top.scrambleGauge = g.scramble;
    }

    // Takedown animation: tick through shoot/drive/slam phases, then lock in ground.
    if (g.takedownAnim) {
      const ta = g.takedownAnim;
      ta.frame++;
      // Lock the participants in place so physics doesn't push them apart.
      // Expose frame on fighters so the renderer can read animation progress.
      if (g.top) {
        g.top.x = g.centerX; g.top.y = ARENA.groundY; g.top.vx = 0; g.top.vy = 0;
        g.top.takedownFrame = ta.frame; g.top.takedownTotal = ta.totalFrames;
        g.top.takedownPhase = ta.frame < ta.shootEnd ? 'shoot' : ta.frame < ta.driveEnd ? 'drive' : 'slam';
      }
      if (g.bottom) {
        g.bottom.x = g.centerX; g.bottom.y = ARENA.groundY; g.bottom.vx = 0; g.bottom.vy = 0;
        g.bottom.takedownFrame = ta.frame; g.bottom.takedownTotal = ta.totalFrames;
        g.bottom.takedownPhase = ta.frame < ta.shootEnd ? 'shoot' : ta.frame < ta.driveEnd ? 'drive' : 'slam';
      }
      // Brief screen shake on impact (slam frame).
      if (ta.frame === ta.driveEnd + 1) {
        this.shake = Math.max(this.shake, 8);
        SFX.hitHard();
      }
      if (ta.frame >= ta.totalFrames) {
        // Settle into final ground position. Clear takedown markers.
        const targetPos = g.position;
        const top = g.top, bottom = g.bottom;
        if (top) { top.takedownFrame = 0; top.takedownPhase = null; }
        if (bottom) { bottom.takedownFrame = 0; bottom.takedownPhase = null; }
        this._startGround(top, bottom, targetPos);
      }
      return;
    }

    // Submission lock-in animation: brief wrap-up phase before submission ticks.
    if (g.submission && g.submission.lockIn) {
      const li = g.submission.lockIn;
      li.frame++;
      // Expose progress on attacker so render can show the wrap-up animation.
      const att = g.submission.attacker;
      const def = g.submission.defender;
      if (att) { att.subLockFrame = li.frame; att.subLockTotal = li.totalFrames; att.subLockKind = g.submission.kind; att.subProgress = 0; }
      if (def) { def.subLockFrame = li.frame; def.subLockTotal = li.totalFrames; def.subLockKind = g.submission.kind; def.subProgress = 0; }
      if (li.frame >= li.totalFrames) {
        g.submission.lockIn = null;
        // Keep subLockKind set so the held pose stays submission-specific
        // (armbar / RNC / triangle / kimura / etc.). Reset only the lock-in
        // frame counter so the renderer knows wrap-up is complete.
        if (att) { att.subLockFrame = 0; att.subLockTotal = 0; }
        if (def) { def.subLockFrame = 0; def.subLockTotal = 0; }
      }
      // Don't tick submission progress / apply damage during lock-in.
      return;
    }

    // Submission tick — UFC 5-style two-bar duel:
    //   FINISH gauge (s.progress) builds at lockBuild * (skill + stamina-weighted)
    //   ESCAPE gauge (s.escape) decays slowly while held; defender taps push it up
    //   The attacker also burns stamina; if they fully gas out, sub auto-fails
    if (g.submission) {
      const s = g.submission;
      s.hold++;
      const att = s.attacker, def = s.defender;
      // Stamina drain on both sides while the lock is active.
      att.stamina = Math.max(0, att.stamina - s.drainAtk);
      def.stamina = Math.max(0, def.stamina - s.drainDef);
      // Attacker FINISH builds based on grip strength, defender BJJ defense, and cardio.
      const skillGap = att.submissionMul() - def.submissionMul() * 0.85;
      const fitnessBoost = (_staminaRatio(att) - _staminaRatio(def)) * 0.6;
      const fatigueBonus = def.stamina <= 0 ? 0.45 : 0;
      const build = Math.max(0.05, s.lockBuild + skillGap * 0.35 + fitnessBoost + fatigueBonus);
      s.progress = Math.min(100, s.progress + build);
      // ESCAPE gauge passively bleeds back down (the hold tightens again between taps).
      s.escape = Math.max(0, s.escape - s.decay);
      // Mirror gauges to fighters for HUD/animation. subProgress lets the
      // renderer scale visual deformation (cinch, tremor, head-bend, spine
      // arch) with how close the lock is to a finish.
      def.escapeGauge = s.escape;
      att.subProgress = s.progress;
      def.subProgress = s.progress;
      // Chip damage representing real submission discomfort.
      def.hp = Math.max(0, def.hp - s.dpsDrain);
      // Attacker burned all cardio without finishing → hold breaks, position resets.
      if (att.stamina <= 0 && s.progress < 100) {
        att.state = 'ground_top'; def.state = 'ground_bottom';
        if (g.position === 'guard') {
          // BJJ pull-from-guard fail — stand-up scramble.
          this._endGround('sub_gassed');
        } else if (g.position === 'front_headlock') {
          this._endFrontHeadlock('sub_gassed');
        } else {
          g.submission = null;
        }
        att.subLockKind = null; def.subLockKind = null;
        att.subProgress = 0; def.subProgress = 0;
        this.pushEvent('submission_gassed', { kind: s.kind, defender: def.side });
        SFX.block();
        return;
      }
      if (def.hp <= 0 || s.progress >= 100) {
        // Tap / finish.
        def.hp = 0;
        def.state = 'down';
        def.downTime = 90;
        att.subLockKind = null; def.subLockKind = null;
        att.subProgress = 100; def.subProgress = 100;
        this.pushEvent('submission_finish', { kind: s.kind, winner: att.side });
        SFX.ko();
        this.grapple = null;
        return;
      }
    }

    // Clinch handling: resolve active attacks (clinch knee/elbow/dirty punch) directly.
    if (g.position === 'clinch' && g.a && g.b) {
      // Keep positions locked within the clinch window
      g.a.x = g.centerX - 42 * g.a.facing;
      g.b.x = g.centerX - 42 * g.b.facing;
      g.a.y = ARENA.groundY; g.b.y = ARENA.groundY;
      // Resolve each side's attack frames
      this._resolveClinchAttack(g.a, g.b);
      this._resolveClinchAttack(g.b, g.a);
      // Ref break if very long and nothing happening (>6s no attacks) — simplify: auto break at 360f
      if (g.timer > 360) this._endClinch('ref_break');
    }

    // Ground top & pound resolution. Half-guard counts as a ground position
    // for HUD / animation but blocks ground-and-pound from the top (the bottom
    // controls a leg, killing the punch base).
    if ((g.position === 'mount' || g.position === 'back_mount' || g.position === 'side_control' || g.position === 'guard' || g.position === 'half_guard') && g.top && g.bottom) {
      g.top.x = g.centerX; g.bottom.x = g.centerX;
      g.top.y = ARENA.groundY; g.bottom.y = ARENA.groundY;
      if (g.position !== 'half_guard') {
        this._resolveGroundAttack(g.top, g.bottom);
      }
    }
    // Front-headlock: keep the controller and the caught fighter snapped to
    // the centre, give the controller a finite holding window before the
    // ref / scramble forces a stand-up. Submission tick handles itself above.
    if (g.position === 'front_headlock' && g.top && g.bottom) {
      g.top.x = g.centerX - 18 * g.top.facing;
      g.bottom.x = g.centerX + 12 * g.top.facing;
      g.top.y = ARENA.groundY; g.bottom.y = ARENA.groundY;
      this._resolveClinchAttack(g.top, g.bottom);
      // 4-second window — long enough to chain a sub attempt, short enough
      // not to stall the action. Submissions in flight don't auto-break.
      if (g.timer > 240 && !g.submission) {
        this._endFrontHeadlock('scramble');
      }
    }
  }

  _endFrontHeadlock(reason) {
    const g = this.grapple;
    if (!g) return;
    if (g.top) {
      g.top.state = 'idle'; g.top.grappleRole = null; g.top.attack = null;
      g.top.attackFrame = 0; g.top.cooldown = 14; g.top.groundPosition = null;
    }
    if (g.bottom) {
      g.bottom.state = 'idle'; g.bottom.grappleRole = null; g.bottom.attack = null;
      g.bottom.attackFrame = 0; g.bottom.cooldown = 18; g.bottom.groundPosition = null;
    }
    if (g.top && g.bottom) {
      const topSide = g.top.side === 'p1' ? -1 : 1;
      g.top.x += topSide * 70; g.bottom.x -= topSide * 70;
    }
    this.grapple = null;
    this.pushEvent('front_headlock_end', { reason });
  }

  _resolveClinchAttack(attacker, defender) {
    if (!attacker.attack) return;
    const a = attacker.attack;
    attacker.attackFrame++;
    if (attacker.attackFrame === a.startup + 1 && !attacker.hitConfirm) {
      // Damage application: roughly halved vs strike (clinch proximity, less hip rotation than full shot)
      const baseDmg = Math.round(a.damage * attacker.powerMul() * 0.95);
      // Defender can't block mid-clinch (both hands tied) but has some defense reduction.
      const guarded = (defender.clinchGuardFrames || 0) > 0;
      const actualDmg = Math.max(1, Math.round(baseDmg * (1.35 - defender.defenseMul() * 0.4) * (guarded ? 0.45 : 1)));
      defender.hp = Math.max(0, defender.hp - actualDmg);
      defender.special = Math.min(defender.maxSpecial, defender.special + 4);
      attacker.special = Math.min(attacker.maxSpecial, attacker.special + (a.meter || 0));
      const setupMap = { dirty_punch: 'guillotine', clinch_elbow: 'guillotine', clinch_knee: 'guillotine' };
      attacker.submissionSetupFrames = guarded ? 30 : 75;
      attacker.submissionSetupBonus = guarded ? 0.03 : (a.kind === 'dirty_punch' ? 0.08 : 0.12);
      attacker.submissionSetupKind = setupMap[a.kind] || 'guillotine';
      this.shake = Math.max(this.shake, 5);
      this.hitstop = 2;
      this.pushEvent('hit', {
        attacker: attacker.side, defender: defender.side,
        dmg: actualDmg, blocked: guarded, kind: a.kind,
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
      const shelled = (defender.groundShellFrames || 0) > 0;
      const actualDmg = Math.max(1, Math.round(baseDmg * (1.4 - defender.defenseMul() * 0.3) * (shelled ? 0.5 : 1)));
      defender.hp = Math.max(0, defender.hp - actualDmg);
      defender.special = Math.min(defender.maxSpecial, defender.special + 3);
      attacker.special = Math.min(attacker.maxSpecial, attacker.special + (a.meter || 0));
      const setupByPosition = this.grapple && this.grapple.position === 'back_mount' ? 'rear_naked_choke'
                          : this.grapple && this.grapple.position === 'side_control' ? 'kimura'
                          : this.grapple && this.grapple.position === 'half_guard' ? 'kneebar'
                          : 'armbar';
      attacker.submissionSetupFrames = shelled ? 35 : 80;
      attacker.submissionSetupBonus = shelled ? 0.03 : (a.kind === 'ground_elbow' ? 0.12 : 0.09);
      attacker.submissionSetupKind = setupByPosition;
      this.shake = Math.max(this.shake, 5);
      this.hitstop = 2;
      // A clean ground strike resets the bottom's scramble — the rocked
      // defender has to re-build their escape from scratch. This is what
      // makes ground-and-pound feel like an actual control mechanic.
      const g = this.grapple;
      if (g) {
        g.scramble = Math.max(0, g.scramble - (a.kind === 'ground_elbow' ? 32 : 22));
        g.sinceStrike = 0;
        if (g.bottom) g.bottom.scrambleGauge = g.scramble;
        if (g.top) g.top.scrambleGauge = g.scramble;
      }
      this.pushEvent('hit', {
        attacker: attacker.side, defender: defender.side,
        dmg: actualDmg, blocked: shelled, kind: a.kind,
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
      // <= 0 (not === 0) so any pre-existing fractional stun still resolves.
      // The integer-rounding above is the real fix; this is belt-and-braces.
      if (f.stunFrames <= 0 && (f.state === 'hit' || f.state === 'block')) {
        f.stunFrames = 0;
        f.state = 'idle';
        f.blocking = false;
      }
    }
    // Hit-react whip decays even after stun ends so the body settles smoothly.
    if (f.hitReact > 0) {
      f.hitReact = Math.max(0, f.hitReact - 0.05);
      if (f.hitReact === 0) f.hitReactDir = 0;
    }
    // Independent head-snap decay — faster than the torso whip so the head
    // snaps and recovers within ~10 frames, before the body settles.
    if (f.headSnap > 0) {
      f.headSnap = Math.max(0, f.headSnap - 0.09);
      if (f.headSnap === 0) f.headSnapDir = 0;
    }
    if (f.cooldown > 0) f.cooldown--;
    if (!this.grapple) {
      f.clinchGuardFrames = 0;
      f.groundShellFrames = 0;
      f.submissionSetupFrames = 0;
      f.submissionSetupBonus = 0;
      f.submissionSetupKind = null;
      f.escapePulse = 0;
    }
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

    // Wobble ("rocked") tick — fighter staggers around drunkenly. The first
    // window is fully helpless (no block / dodge), the back half allows a
    // panicked block to be raised. Wobble naturally exits to 'idle' so the
    // standard recovery logic applies.
    if (f.wobbleFrames > 0) {
      f.wobbleFrames--;
      if (f.wobbleHelpless > 0) f.wobbleHelpless--;
      // Drunken drift: small random sway in the knockback direction so the
      // fighter visibly staggers rather than standing still.
      if (f.wobbleFrames > 4) {
        f.vx += (Math.sin(f.animTime * 0.18) * 0.6 + (Math.random() - 0.5) * 0.4) * (f.wobbleFrames > 25 ? 1 : 0.4);
      }
      if (f.wobbleFrames === 0) {
        if (f.state === 'wobble') f.state = 'idle';
        f.wobbleHelpless = 0;
      }
    }

    const moved = f.x - (typeof f.lastX === 'number' ? f.lastX : f.x);
    f.lastX = f.x;
    f.stepBurst = Math.max(0, (f.stepBurst || 0) - 0.07);
    f.balanceShift *= 0.9;

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
    if (!['clinch', 'ground_top', 'ground_bottom', 'sub_offense', 'sub_defense',
          'front_headlock_top', 'front_headlock_bottom'].includes(f.state)) {
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
    // Counter-strike bonus: if the defender was just starting their own
    // attack (still in startup frames), the attacker's strike beats them to
    // it. Flat 25% damage bonus and a chunkier shake/flash to sell the
    // counter visually.
    const isCounter = !blocked &&
                      defender.state === 'attack' &&
                      defender.attack &&
                      defender.attackFrame < (defender.attack.startup || 0);
    const counterMul = isCounter ? 1.25 : 1;
    const baseDmg = Math.round(attacker.attack.damage * attacker.powerMul() * counterMul * (attacker.combo > 0 ? 0.85 : 1));
    const result = defender.takeHit(baseDmg, attacker, attacker.attack, blocked);
    if (result.dodged) return;
    attacker.hitConfirm = true;
    attacker.special = Math.min(attacker.maxSpecial, attacker.special + (attacker.attack.meter || 0) + (isCounter ? 4 : 0));
    attacker.combo += 1;
    attacker.comboTimer = 50;
    attacker.lastDamageDealt = result.dmg;
    if (isCounter && !result.blocked) {
      // Cancel the defender's about-to-launch attack so the counter feels real.
      defender.attack = null;
      defender.attackFrame = 0;
    }
    // Screen shake scales dramatically with damage so big strikes feel heavy.
    this.shake = result.blocked ? 4 : Math.min(28, 8 + Math.round(result.dmg * 0.75) + (isCounter ? 4 : 0));
    // Brighter white flash on clean hits — more on high-damage strikes.
    this.flash = result.blocked ? 2 : Math.min(10, 4 + Math.round(result.dmg * 0.25) + (isCounter ? 2 : 0));
    // Longer hitstop on heavy / finishing strikes for a weightier connection.
    this.hitstop = result.blocked ? 1 : (attacker.attack.unblockable ? 9 : (result.dmg >= 16 ? 7 : result.dmg >= 10 ? 5 : 3));
    // KO blow: brief slow-mo effect via extra hitstop (6 frames @60fps ≈ 100ms).
    if (!result.blocked && defender.hp <= 0) {
      this.hitstop = Math.max(this.hitstop, 12);
      this.shake = Math.max(this.shake, 22);
    }
    this.pushEvent('hit', {
      attacker: attacker.side,
      defender: defender.side,
      dmg: result.dmg,
      blocked: result.blocked,
      kind: attacker.attack.kind,
      counter: isCounter,
      x: defender.x,
      y: defender.y - 100,
    });
    if (isCounter) {
      this.pushEvent('counter_hit', { attacker: attacker.side, dmg: result.dmg });
      SFX.hitHard();
    }
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
export function easeInCubic(t) { return t * t * t; }
export function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
