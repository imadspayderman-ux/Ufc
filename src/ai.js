// CPU opponent. Difficulty 0..3
// Extended to understand clinch & ground positions and use fighter specialty.
import { ATTACK_DATA } from './engine.js';

export class AI {
  constructor(diff = 1) {
    this.diff = diff;
    this.thinkTimer = 0;
    this.intent = 'neutral'; // neutral | approach | retreat | attack | block | dodge | clinch | takedown | ground_strike | sub | escape
    this.intentDur = 0;
    this.attackQueue = null;
    this.lastDist = 999;
    this.subTapCooldown = 0;
  }

  decide(self, opp, match) {
    const dist = Math.abs(self.x - opp.x);
    this.lastDist = dist;
    const aggression = [0.25, 0.45, 0.65, 0.85][this.diff] || 0.5;
    const reactSpeed = [40, 22, 12, 6][this.diff] || 20;
    const blockChance = [0.15, 0.4, 0.6, 0.8][this.diff] || 0.4;
    const dodgeChance = [0.05, 0.12, 0.2, 0.3][this.diff] || 0.15;

    if (this.thinkTimer > 0) this.thinkTimer--;

    // ---- Grappling contexts ----
    if (self.state === 'sub_defense') {
      this.intent = 'escape';
      this.intentDur = 4;
      return;
    }
    if (self.state === 'sub_offense') {
      this.intent = 'hold_sub';
      this.intentDur = 4;
      return;
    }
    if (self.state === 'clinch') {
      const clinchBias = self.specialty.clinchAffinity;
      // High-clinch fighters attack elbows/knees, then shoot TD
      if (Math.random() < 0.25 + 0.3 * this.diff) {
        if (Math.random() < clinchBias && self.data.grappling.wrestling >= 6) {
          this.intent = 'takedown';
          this.intentDur = 4;
          return;
        }
        this.attackQueue = pickClinchAttack(self);
        this.intent = 'clinch_attack';
        this.intentDur = 12;
        return;
      }
      // Low clinch affinity → try to break out
      if (clinchBias < 0.4 && Math.random() < 0.25) {
        this.intent = 'break_clinch';
        this.intentDur = 8;
        return;
      }
      this.intent = 'clinch_hold';
      this.intentDur = 6;
      return;
    }
    if (self.state === 'ground_top') {
      // Attempt sub based on submission skill, else ground-and-pound
      if (self.data.grappling.submissions >= 7 && Math.random() < 0.35 + 0.1 * this.diff) {
        this.intent = 'sub';
        this.intentDur = 8;
        return;
      }
      this.attackQueue = 'ground_punch';
      this.intent = 'ground_strike';
      this.intentDur = 10;
      return;
    }
    if (self.state === 'ground_bottom') {
      // BJJ tries submissions from guard; wrestlers try to stand
      if (self.data.grappling.submissions >= 7 && Math.random() < 0.25 + 0.1 * this.diff) {
        this.intent = 'sub_from_guard';
        this.intentDur = 10;
        return;
      }
      this.intent = 'stand_up';
      this.intentDur = 10;
      return;
    }
    if (self.state === 'sprawl') {
      this.intent = 'neutral';
      this.intentDur = 10;
      return;
    }

    // React to incoming attack
    if (opp.state === 'attack' && opp.attack) {
      const a = opp.attack;
      const inRange = dist < (a.reach + 80);
      if (inRange && opp.attackFrame < a.startup + 1) {
        if (Math.random() < dodgeChance) {
          this.intent = 'dodge';
          this.intentDur = 14;
          return;
        }
        if (Math.random() < blockChance) {
          this.intent = 'block';
          this.intentDur = a.startup + a.active + 4;
          return;
        }
      }
    }

    // If opponent is stunned/down, pursue & attack
    if ((opp.state === 'hit' || opp.state === 'down') && self.combo < 4) {
      this.intent = 'approach';
      this.intentDur = 6;
      if (dist < 140) this.intent = 'attack';
      return;
    }

    // Use special when meter full
    if (self.special >= self.maxSpecial && Math.random() < 0.4 + 0.15 * this.diff) {
      if (dist < 200) {
        this.attackQueue = 'special';
        this.intent = 'attack';
        this.intentDur = 6;
        return;
      }
    }

    if (this.thinkTimer > 0) return;
    this.thinkTimer = reactSpeed + Math.random() * 20;

    // Specialty-aware range & grappling preferences
    const clinchBias = self.specialty.clinchAffinity;
    const groundBias = self.specialty.groundAffinity;
    const wantsClinchRange = clinchBias > 0.5;
    const idealRange = wantsClinchRange
      ? (80 + Math.random() * 40)
      : (120 + Math.random() * 30);

    // From neutral range, wrestlers/judokas/bjj bias toward clinch/shot when close
    if (dist <= 110 && (clinchBias > 0.55 && Math.random() < 0.35 + 0.1 * this.diff)) {
      this.intent = 'clinch';
      this.intentDur = 6;
      return;
    }
    if (dist <= 150 && (self.data.grappling.wrestling >= 8 && groundBias > 0.6 && Math.random() < 0.2 + 0.05 * this.diff)) {
      this.intent = 'takedown_shot';
      this.intentDur = 6;
      return;
    }

    if (dist > idealRange + 60) {
      this.intent = Math.random() < aggression ? 'approach' : 'neutral';
      this.intentDur = 24 + Math.random() * 30;
    } else if (dist < idealRange - 50) {
      if (Math.random() < aggression) {
        this.attackQueue = pickShortAttack(self);
        this.intent = 'attack';
        this.intentDur = 12;
      } else {
        this.intent = 'retreat';
        this.intentDur = 14 + Math.random() * 20;
      }
    } else {
      if (Math.random() < aggression) {
        this.attackQueue = pickAttack(self, dist);
        this.intent = 'attack';
        this.intentDur = 14;
      } else {
        this.intent = Math.random() < 0.3 ? 'retreat' : 'neutral';
        this.intentDur = 14 + Math.random() * 18;
      }
    }
  }

  step(self, opp, match) {
    if (self.state === 'down' || self.state === 'ko' || self.state === 'hit') return null;
    // Locked in takedown animation — engine drives the pose, AI must wait.
    if (self.state === 'takedown_shoot' || self.state === 'takedown_defend') return null;
    this.decide(self, opp, match);
    if (this.intentDur > 0) this.intentDur--;
    const dir = opp.x > self.x ? 1 : -1;

    const cmd = { left: false, right: false, down: false, up: false, block: false };
    let action = null;

    // Grappling-context actions
    if (self.state === 'sub_defense') {
      if (this.subTapCooldown <= 0) {
        match.submissionTap(self);
        this.subTapCooldown = Math.max(2, 8 - this.diff * 2);
      } else this.subTapCooldown--;
      return { cmd, action };
    }
    if (self.state === 'sub_offense') return { cmd, action };
    if (self.state === 'clinch') {
      if (this.intent === 'break_clinch') { match.tryBreakClinch(self); return { cmd, action }; }
      if (this.intent === 'takedown') { match.tryTakedown(self, opp); return { cmd, action }; }
      if (this.intent === 'clinch_attack' && this.attackQueue) {
        action = this.attackQueue; this.attackQueue = null;
      }
      // clinch_hold: do nothing this frame
      if (action) return { cmd, action };
      return { cmd, action };
    }
    if (self.state === 'ground_top') {
      // intentDur was just decremented in step(); decide() sets it to 8 so we match 7 on the action frame.
      if (this.intent === 'sub' && this.intentDur === 7) {
        const g = match.grapple;
        if (g) {
          if (g.position === 'back_mount') match.attemptSubmission(self, 'rear_naked_choke');
          else if (g.position === 'mount') match.attemptSubmission(self, 'armbar');
          else if (g.position === 'side_control') match.attemptSubmission(self, 'kimura');
          // From guard, top can only pass or strike — advance position instead.
          else if (g.position === 'guard') match.tryPositionAdvance(self);
        }
        return { cmd, action };
      }
      if (this.intent === 'ground_strike' && this.attackQueue) {
        action = this.attackQueue; this.attackQueue = null;
      }
      return { cmd, action };
    }
    if (self.state === 'ground_bottom') {
      if (this.intent === 'sub_from_guard' && this.intentDur === 9) {
        if (!match.attemptSubmission(self, 'triangle')) match.attemptSubmission(self, 'armbar');
        return { cmd, action };
      }
      if (this.intent === 'stand_up' && this.intentDur === 9) {
        match.tryStandUp(self);
        return { cmd, action };
      }
      return { cmd, action };
    }

    if (self.state === 'attack' || self.state === 'sprawl') return null;

    switch (this.intent) {
      case 'approach':
        cmd[dir > 0 ? 'right' : 'left'] = true;
        break;
      case 'retreat':
        cmd[dir > 0 ? 'left' : 'right'] = true;
        break;
      case 'block':
        cmd.block = true;
        break;
      case 'dodge':
        if (this.intentDur === 13) action = 'dodge';
        cmd[dir > 0 ? 'left' : 'right'] = true;
        break;
      case 'clinch':
        // Close distance, then initiate clinch when in range
        if (this.intentDur >= 4) { cmd[dir > 0 ? 'right' : 'left'] = true; }
        else { match.tryClinch(self, opp); }
        break;
      case 'takedown_shot':
        if (this.intentDur >= 4) { cmd[dir > 0 ? 'right' : 'left'] = true; }
        else { match.tryTakedown(self, opp); }
        break;
      case 'attack':
        if (this.attackQueue && self.isActionable()) {
          action = this.attackQueue;
          this.attackQueue = null;
          this.intent = 'neutral';
          this.intentDur = 6;
        }
        break;
      default:
        if (Math.random() < 0.05) cmd[Math.random() < 0.5 ? 'left' : 'right'] = true;
        break;
    }
    return { cmd, action };
  }
}

function pickAttack(self, dist) {
  const opts = [];
  const spec = self.specialty;
  if (dist < 105) opts.push('jab', 'jab', 'cross', 'uppercut');
  if (dist < 130) opts.push('cross', 'low_kick');
  if (dist < 150) opts.push('kick', 'low_kick');
  if (dist < 160) opts.push('head_kick');
  if (spec && spec.label === 'Taekwondo') opts.push('head_kick', 'kick');
  if (spec && spec.label === 'Muay Thai' && dist < 140) opts.push('kick', 'low_kick');
  if (spec && spec.label === 'Boxer' && dist < 120) opts.push('jab', 'cross', 'uppercut');
  if (opts.length === 0) opts.push('kick');
  return opts[Math.floor(Math.random() * opts.length)];
}
function pickShortAttack(self) {
  const base = ['jab', 'uppercut', 'cross'];
  if (self && self.specialty && self.specialty.label === 'Boxer') base.push('cross', 'uppercut');
  return base[Math.floor(Math.random() * base.length)];
}
function pickClinchAttack(self) {
  const opts = ['clinch_knee', 'clinch_elbow', 'dirty_punch'];
  const spec = self.specialty && self.specialty.label;
  if (spec === 'Muay Thai') opts.push('clinch_knee', 'clinch_elbow', 'clinch_knee');
  if (spec === 'Boxer') opts.push('dirty_punch', 'dirty_punch');
  return opts[Math.floor(Math.random() * opts.length)];
}
