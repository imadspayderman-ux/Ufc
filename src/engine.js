// Combat engine: state, physics, hitboxes, damage.
import { SFX } from './audio.js';

export const ARENA = {
  width: 1280,
  height: 640,
  groundY: 540,
  wallPad: 80,
  gravity: 0.85,
};

export const ATTACK_DATA = {
  jab:       { startup: 4,  active: 3, recovery: 8,  damage: 5,  reach: 95,  height: 'high', stam: 5,  pushback: 4,  meter: 5,  height_y: 35 },
  cross:     { startup: 7,  active: 4, recovery: 14, damage: 11, reach: 110, height: 'high', stam: 9,  pushback: 7,  meter: 8,  height_y: 35 },
  uppercut:  { startup: 8,  active: 5, recovery: 16, damage: 13, reach: 75,  height: 'mid',  stam: 11, pushback: 6,  meter: 10, height_y: 25, launch: true },
  kick:      { startup: 9,  active: 5, recovery: 18, damage: 12, reach: 135, height: 'mid',  stam: 10, pushback: 9,  meter: 9,  height_y: 50 },
  low_kick:  { startup: 7,  active: 4, recovery: 14, damage: 7,  reach: 115, height: 'low',  stam: 7,  pushback: 5,  meter: 6,  height_y: 100, drain: 8 },
  head_kick: { startup: 13, active: 5, recovery: 22, damage: 17, reach: 145, height: 'high', stam: 15, pushback: 11, meter: 12, height_y: 20 },
  special:   { startup: 14, active: 8, recovery: 22, damage: 28, reach: 165, height: 'all',  stam: 0,  pushback: 14, meter: 0,  height_y: 35, unblockable: true, launch: true },
};

export class FighterState {
  constructor(data, side) {
    this.data = data;
    this.side = side; // 'p1' | 'p2'
    this.facing = side === 'p1' ? 1 : -1;
    this.x = side === 'p1' ? 380 : 900;
    this.y = ARENA.groundY;
    this.vx = 0;
    this.vy = 0;

    this.maxHp = 100 + (data.stats.stamina - 5) * 4;
    this.hp = this.maxHp;

    this.maxStamina = 80 + data.stats.stamina * 4;
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
  }

  isActionable() {
    return ['idle', 'walk', 'crouch', 'jump', 'block', 'dodge'].includes(this.state) && this.cooldown <= 0;
  }
  isOnGround() { return this.y >= ARENA.groundY - 0.1; }
  speedMul() { return 0.7 + this.data.stats.speed * 0.05; }
  powerMul() { return 0.7 + this.data.stats.power * 0.05; }
  defenseMul() { return 0.7 + this.data.stats.defense * 0.04; }
  techMul() { return 0.85 + this.data.stats.technique * 0.03; }

  faceTarget(targetX) {
    if (!this.isActionable()) return;
    this.facing = targetX > this.x ? 1 : -1;
  }

  startAttack(kind) {
    if (!this.isActionable()) return false;
    if (this.state === 'jump' && kind !== 'kick' && kind !== 'special') return false;
    const a = ATTACK_DATA[kind];
    if (!a) return false;
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
    this.subTimer = 90;
    this.state = 'intro';
  }

  step(dt) {
    this.tick++;
    if (this.hitstop > 0) { this.hitstop--; return; }

    if (this.state === 'intro') {
      this.subTimer--;
      if (this.subTimer <= 0) {
        this.state = 'fight';
        this.subTimer = 0;
        this.pushEvent('fight_start');
        SFX.fight();
      } else if (this.subTimer === 60) {
        this.pushEvent('announce', { text: 'ROUND ' + this.round });
        SFX.bell();
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
    this.checkHits(this.p1, this.p2);
    this.checkHits(this.p2, this.p1);
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

    // Always face opponent unless mid-attack/hit
    if (['idle', 'walk', 'crouch', 'block', 'jump'].includes(f.state)) {
      f.facing = opp.x > f.x ? 1 : -1;
    }

    this.applyPhysics(f);
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
