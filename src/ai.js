// CPU opponent. Difficulty 0..3
import { ATTACK_DATA } from './engine.js';

export class AI {
  constructor(diff = 1) {
    this.diff = diff;
    this.thinkTimer = 0;
    this.intent = 'neutral'; // neutral | approach | retreat | attack | block | dodge | special
    this.intentDur = 0;
    this.attackQueue = null;
    this.lastDist = 999;
  }

  decide(self, opp, match) {
    const dist = Math.abs(self.x - opp.x);
    this.lastDist = dist;
    const aggression = [0.25, 0.45, 0.65, 0.85][this.diff] || 0.5;
    const reactSpeed = [40, 22, 12, 6][this.diff] || 20;
    const blockChance = [0.15, 0.4, 0.6, 0.8][this.diff] || 0.4;
    const dodgeChance = [0.05, 0.12, 0.2, 0.3][this.diff] || 0.15;

    if (this.thinkTimer > 0) this.thinkTimer--;

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
      // queue an attack if close
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

    // Distance management
    const idealRange = 120 + Math.random() * 30;
    if (dist > idealRange + 60) {
      this.intent = Math.random() < aggression ? 'approach' : 'neutral';
      this.intentDur = 24 + Math.random() * 30;
    } else if (dist < idealRange - 50) {
      // too close - sometimes attack, sometimes back off
      if (Math.random() < aggression) {
        this.attackQueue = pickShortAttack();
        this.intent = 'attack';
        this.intentDur = 12;
      } else {
        this.intent = 'retreat';
        this.intentDur = 14 + Math.random() * 20;
      }
    } else {
      // sweet spot
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
    this.decide(self, opp, match);
    if (this.intentDur > 0) this.intentDur--;
    const dir = opp.x > self.x ? 1 : -1;

    const cmd = { left: false, right: false, down: false, up: false, block: false };
    let action = null;

    if (self.state === 'attack') return null;

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
      case 'attack':
        if (this.attackQueue && self.isActionable()) {
          action = this.attackQueue;
          this.attackQueue = null;
          this.intent = 'neutral';
          this.intentDur = 6;
        }
        break;
      default:
        // neutral - tiny back-and-forth
        if (Math.random() < 0.05) cmd[Math.random() < 0.5 ? 'left' : 'right'] = true;
        break;
    }
    return { cmd, action };
  }
}

function pickAttack(self, dist) {
  const opts = [];
  if (dist < 105) opts.push('jab', 'jab', 'cross', 'uppercut');
  if (dist < 130) opts.push('cross', 'low_kick');
  if (dist < 150) opts.push('kick', 'low_kick');
  if (dist < 160) opts.push('head_kick');
  if (opts.length === 0) opts.push('kick');
  return opts[Math.floor(Math.random() * opts.length)];
}
function pickShortAttack() {
  return ['jab', 'uppercut', 'cross'][Math.floor(Math.random() * 3)];
}
