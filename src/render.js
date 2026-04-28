// Canvas rendering: arena, fighters, effects.
import { ARENA } from './engine.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.popups = [];
  }

  spawnParticles(x, y, n, palette = ['#ffcc33', '#ff5566', '#fff'], opts = {}) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * (opts.spread || 8),
        vy: (Math.random() - 0.5) * 6 - 2,
        life: 18 + Math.random() * 12,
        maxLife: 30,
        color: palette[Math.floor(Math.random() * palette.length)],
        size: 3 + Math.random() * 3,
      });
    }
  }
  spawnPopup(x, y, text, color = '#fff', size = 28) {
    this.popups.push({ x, y, text, color, size, life: 40, vy: -1.4 });
  }

  drawArena(ctx, match) {
    // Background gradient sky/crowd
    const g = ctx.createLinearGradient(0, 0, 0, ARENA.height);
    g.addColorStop(0, '#1a1018');
    g.addColorStop(0.4, '#221820');
    g.addColorStop(0.85, '#0c0810');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);

    // spotlights
    for (let i = 0; i < 4; i++) {
      const cx = 200 + i * 320;
      const grad = ctx.createRadialGradient(cx, 60, 20, cx, 60, 280);
      grad.addColorStop(0, 'rgba(255,220,160,0.18)');
      grad.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    }

    // Crowd silhouettes
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 320, ARENA.width, 160);
    for (let i = 0; i < 80; i++) {
      const x = (i * 17) % ARENA.width;
      const y = 320 + ((i * 31) % 100);
      ctx.fillStyle = `rgba(${20 + (i * 7) % 40}, ${15 + (i * 11) % 30}, ${30 + (i * 13) % 40}, 0.9)`;
      ctx.beginPath();
      ctx.arc(x, y, 8 + (i % 3) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Octagon mat
    const matY = 480;
    ctx.fillStyle = '#3a2818';
    ctx.fillRect(0, matY, ARENA.width, 60);
    // mat lines
    ctx.strokeStyle = '#5a3828';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const x = (i * 80) % ARENA.width;
      ctx.beginPath();
      ctx.moveTo(x, matY);
      ctx.lineTo(x - 30, matY + 60);
      ctx.stroke();
    }

    // Octagon fence (horizontal lines)
    ctx.strokeStyle = 'rgba(180,180,200,0.18)';
    ctx.lineWidth = 1;
    for (let y = 100; y < 500; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA.width, y);
      ctx.stroke();
    }
    // Vertical fence lines
    for (let x = 0; x < ARENA.width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 100);
      ctx.lineTo(x, 500);
      ctx.stroke();
    }

    // Foreground floor with logo
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(0, ARENA.groundY, ARENA.width, ARENA.height - ARENA.groundY);
    ctx.fillStyle = 'rgba(255,204,51,0.12)';
    ctx.font = 'bold 84px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OCTAGON FURY', ARENA.width / 2, ARENA.groundY + 80);
  }

  drawFighter(ctx, f) {
    const t = f.animTime;
    ctx.save();
    ctx.translate(f.x, f.y);
    // facing flip
    ctx.scale(f.facing, 1);

    const p = f.data.palette;
    const bd = f.data.build || 1.0;
    const ht = f.data.height || 1.0;

    // shadow
    ctx.save();
    ctx.scale(1 / f.facing, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 50 * bd, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const pose = computePose(f, t);

    // legs: behind body
    drawLeg(ctx, pose.legR, p, bd);
    drawLeg(ctx, pose.legL, p, bd);

    // pelvis / trunks
    ctx.save();
    ctx.translate(pose.pelvis.x, pose.pelvis.y);
    ctx.fillStyle = p.trunks;
    ctx.fillRect(-26 * bd, -6, 52 * bd, 36);
    ctx.fillStyle = p.shorts2 || p.trunks;
    ctx.fillRect(-26 * bd, 22, 52 * bd, 8);
    // belt
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-26 * bd, -10, 52 * bd, 6);
    ctx.fillStyle = p.accent;
    ctx.fillRect(-6, -10, 12, 6);
    ctx.restore();

    // torso
    drawTorso(ctx, pose, p, bd, ht);

    // back arm (further from camera) — facing right means we view P1's left side; back arm = P1's left arm
    drawArm(ctx, pose.armBack, p, bd, true);

    // head
    drawHead(ctx, pose, p, ht, f);

    // front arm
    drawArm(ctx, pose.armFront, p, bd, false);

    // attack effect: motion lines
    if (f.state === 'attack' && f.attack) {
      const a = f.attack;
      if (f.attackFrame >= a.startup && f.attackFrame < a.startup + a.active) {
        ctx.strokeStyle = a.unblockable ? 'rgba(255,200,40,0.85)' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 3;
        const tx = 40 + a.reach * 0.5;
        const ty = -130 + (a.height_y - 35);
        ctx.beginPath();
        ctx.arc(tx * 0.4, ty, a.reach * 0.4, -0.6, 0.6);
        ctx.stroke();
      }
    }

    // KO/down state
    if (f.state === 'down') {
      // already handled by computePose
    }
    ctx.restore();

    // Special move flash overlay
    if (f.state === 'attack' && f.attack && f.attack.unblockable && f.attackFrame >= f.attack.startup) {
      ctx.save();
      const cx = f.x;
      const cy = f.y - 100;
      const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, 200);
      grd.addColorStop(0, 'rgba(255,200,50,0.6)');
      grd.addColorStop(1, 'rgba(255,200,50,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(cx - 220, cy - 220, 440, 440);
      ctx.restore();
    }
  }

  drawHitbox(ctx, hb, color = 'rgba(255,80,80,0.4)') {
    if (!hb) return;
    ctx.fillStyle = color;
    ctx.fillRect(hb.x, hb.y, hb.w, hb.h);
  }

  drawEffects(ctx) {
    // particles
    this.particles = this.particles.filter((p) => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.4;
      p.life--;
      const a = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = withAlpha(p.color, a);
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      return p.life > 0;
    });
    // popups
    this.popups = this.popups.filter((p) => {
      p.y += p.vy;
      p.life--;
      const a = Math.max(0, p.life / 40);
      ctx.font = `bold ${p.size}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = withAlpha('#000', a);
      ctx.fillText(p.text, p.x + 2, p.y + 2);
      ctx.fillStyle = withAlpha(p.color, a);
      ctx.fillText(p.text, p.x, p.y);
      return p.life > 0;
    });
  }

  draw(match) {
    const ctx = this.ctx;
    ctx.save();
    if (match.shake > 0) {
      const s = match.shake * 0.6;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    this.drawArena(ctx, match);
    // depth: draw fighter further-from-camera first; we use side P2 as background
    if (match.p1.x < match.p2.x) {
      this.drawFighter(ctx, match.p2);
      this.drawFighter(ctx, match.p1);
    } else {
      this.drawFighter(ctx, match.p1);
      this.drawFighter(ctx, match.p2);
    }
    this.drawEffects(ctx);
    if (match.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${match.flash * 0.07})`;
      ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    }
    ctx.restore();
  }
}

function withAlpha(color, a) {
  if (color.startsWith('rgb')) return color;
  // hex
  let r = 255, g = 255, b = 255;
  const c = color.replace('#', '');
  if (c.length === 6) { r = parseInt(c.slice(0,2),16); g = parseInt(c.slice(2,4),16); b = parseInt(c.slice(4,6),16); }
  else if (c.length === 3) { r = parseInt(c[0]+c[0],16); g = parseInt(c[1]+c[1],16); b = parseInt(c[2]+c[2],16); }
  return `rgba(${r},${g},${b},${a})`;
}

// Compute pose: positions for all body parts in fighter-local coords (origin = feet, +y down? we use +y down).
function computePose(f, t) {
  const a = f.attack;
  const af = f.attackFrame;
  // Defaults (boxing stance, facing right) - back arm is the rear hand
  const pose = {
    pelvis: { x: 0, y: -82 },
    torsoAngle: 0,
    headOffset: { x: -2, y: -150 },
    legL: { hipX: -14, hipY: -78, kneeX: -16, kneeY: -42, footX: -22, footY: 0 }, // back leg
    legR: { hipX: 14,  hipY: -78, kneeX: 22,  kneeY: -42, footX: 28,  footY: 0 }, // lead leg
    armBack: { shoulderX: -16, shoulderY: -148, elbowX: -8, elbowY: -125, handX: 4, handY: -130 },
    armFront:{ shoulderX: 14,  shoulderY: -150, elbowX: 22, elbowY: -132, handX: 32, handY: -132 },
  };

  // Idle bob
  if (f.state === 'idle' || f.state === 'walk') {
    const bob = Math.sin(t * 0.2) * 2;
    pose.pelvis.y -= bob;
    pose.headOffset.y -= bob;
  }
  if (f.state === 'walk') {
    const phase = Math.sin(t * 0.3);
    pose.legL.kneeY = -42 + phase * 8;
    pose.legR.kneeY = -42 - phase * 8;
    pose.legL.footY = phase > 0 ? -phase * 8 : 0;
    pose.legR.footY = phase < 0 ? phase * 8 : 0;
  }
  if (f.state === 'crouch') {
    pose.pelvis.y = -52;
    pose.headOffset.y = -120;
    pose.legL.kneeX = -28; pose.legL.kneeY = -28; pose.legL.hipY = -50; pose.legL.footX = -24;
    pose.legR.kneeX = 28;  pose.legR.kneeY = -28; pose.legR.hipY = -50; pose.legR.footX = 24;
    pose.armBack.elbowY = -100; pose.armBack.handY = -100; pose.armBack.handX = 0;
    pose.armFront.elbowY = -110; pose.armFront.handY = -110; pose.armFront.handX = 18;
  }
  if (f.state === 'block') {
    // both arms up in front of face
    pose.armBack.elbowX = 4; pose.armBack.elbowY = -150; pose.armBack.handX = 14; pose.armBack.handY = -160;
    pose.armFront.elbowX = 8; pose.armFront.elbowY = -148; pose.armFront.handX = 16; pose.armFront.handY = -158;
    pose.headOffset.y = -148;
  }
  if (f.state === 'dodge') {
    const k = f.dodgeFrames / 18;
    const lean = -10 * Math.sin((1 - k) * Math.PI);
    pose.pelvis.x = lean;
    pose.headOffset.x = lean - 4;
    pose.headOffset.y = -148;
  }
  if (f.state === 'jump') {
    pose.pelvis.y = -82 - Math.max(0, ARENA.groundY - f.y) * 0.05;
    // tuck legs
    pose.legL.kneeY = -36; pose.legL.footY = -20;
    pose.legR.kneeY = -36; pose.legR.footY = -20;
  }
  if (f.state === 'hit') {
    const k = f.stunFrames / 14;
    pose.headOffset.x = -10 - 4 * (1 - k);
    pose.headOffset.y = -148 + 4;
    pose.armBack.handY = -110; pose.armBack.handX = -10;
    pose.armFront.handY = -110; pose.armFront.handX = 26;
    pose.torsoAngle = -0.18;
  }
  if (f.state === 'down') {
    // Lying flat
    pose.pelvis.x = 30; pose.pelvis.y = -10;
    pose.headOffset.x = -40; pose.headOffset.y = -25;
    pose.legL.hipX = 30; pose.legL.hipY = -8; pose.legL.kneeX = 60; pose.legL.kneeY = -10; pose.legL.footX = 90; pose.legL.footY = -4;
    pose.legR.hipX = 30; pose.legR.hipY = -10; pose.legR.kneeX = 60; pose.legR.kneeY = -16; pose.legR.footX = 90; pose.legR.footY = -10;
    pose.armBack.shoulderX = 10; pose.armBack.shoulderY = -22; pose.armBack.elbowX = -16; pose.armBack.elbowY = -16; pose.armBack.handX = -38; pose.armBack.handY = -10;
    pose.armFront.shoulderX = 12; pose.armFront.shoulderY = -28; pose.armFront.elbowX = -10; pose.armFront.elbowY = -22; pose.armFront.handX = -32; pose.armFront.handY = -16;
  }
  if (f.state === 'attack' && a) {
    const phase = af < a.startup ? 'startup' : af < a.startup + a.active ? 'active' : 'recovery';
    const k = phase === 'startup' ? af / a.startup : phase === 'active' ? 1 : 1 - (af - a.startup - a.active) / a.recovery;
    applyAttackPose(pose, a.kind, k, phase, f);
  }
  return pose;
}

function applyAttackPose(pose, kind, k, phase, f) {
  switch (kind) {
    case 'jab': {
      // lead hand (front arm) extends forward
      const ex = 14 + k * 64;
      const hx = 22 + k * 84;
      pose.armFront.elbowX = ex; pose.armFront.elbowY = -136;
      pose.armFront.handX = hx; pose.armFront.handY = -138;
      pose.armBack.handX = -8; pose.armBack.handY = -148;
      break;
    }
    case 'cross': {
      // rear hand (back arm) extends with body rotation
      const ex = -8 + k * 30;
      const hx = -2 + k * 86;
      pose.armBack.elbowX = ex; pose.armBack.elbowY = -136;
      pose.armBack.handX = hx; pose.armBack.handY = -136;
      pose.torsoAngle = -0.18 * k;
      pose.headOffset.x = -2 + k * 4;
      break;
    }
    case 'uppercut': {
      // back hand rises diagonally
      const dx = 4 + k * 30;
      const dy = -130 - k * 40;
      pose.armBack.elbowX = 6; pose.armBack.elbowY = -130;
      pose.armBack.handX = dx; pose.armBack.handY = dy;
      pose.pelvis.y = -82 - k * 6;
      break;
    }
    case 'kick': {
      // lead leg lifts and extends forward at hip height
      const dx = 14 + k * 80;
      const dy = -82 - k * 30;
      pose.legR.kneeX = dx * 0.5; pose.legR.kneeY = dy + 6;
      pose.legR.footX = dx; pose.legR.footY = dy;
      pose.armBack.handY = -130; pose.armBack.handX = -16;
      pose.torsoAngle = 0.1 * k;
      break;
    }
    case 'low_kick': {
      const dx = 14 + k * 60;
      const dy = -30 - k * 8;
      pose.legR.kneeX = dx * 0.5; pose.legR.kneeY = -30;
      pose.legR.footX = dx; pose.legR.footY = dy;
      pose.torsoAngle = 0.08 * k;
      break;
    }
    case 'head_kick': {
      const dx = 14 + k * 86;
      const dy = -150 + (1 - k) * 70;
      pose.legR.kneeX = dx * 0.4; pose.legR.kneeY = dy + 30;
      pose.legR.footX = dx; pose.legR.footY = dy;
      pose.torsoAngle = -0.18 * k;
      pose.pelvis.y = -82 + k * 14;
      break;
    }
    case 'special': {
      // big haymaker / leap depending on kind
      const sk = f.data.special.kind;
      if (sk === 'flying_knee' || sk === 'spin_kick') {
        const dx = 14 + k * 96;
        const dy = -120 - k * 30;
        pose.legR.kneeX = dx * 0.55; pose.legR.kneeY = dy + 16;
        pose.legR.footX = dx; pose.legR.footY = dy;
        pose.legL.kneeY = -36; pose.legL.footY = -16;
        pose.pelvis.y = -82 - k * 28;
        pose.torsoAngle = -0.22 * k;
      } else if (sk === 'haymaker' || sk === 'rising_uppercut' || sk === 'spinning_elbow') {
        const dx = -8 + k * 110;
        const dy = -140 - k * 12;
        pose.armBack.elbowX = 12; pose.armBack.elbowY = -136;
        pose.armBack.handX = dx; pose.armBack.handY = dy;
        pose.torsoAngle = -0.28 * k;
      } else if (sk === 'slam' || sk === 'submission') {
        // grapple-like: arms forward, body lunges
        pose.armBack.elbowX = 16; pose.armBack.handX = 50 + k * 30; pose.armBack.handY = -120;
        pose.armFront.elbowX = 18; pose.armFront.handX = 56 + k * 30; pose.armFront.handY = -130;
        pose.pelvis.y = -82 + k * 10;
      } else {
        // rapid combo
        const phase2 = (k * 4) % 1;
        const dx = 14 + phase2 * 80;
        pose.armFront.handX = dx; pose.armFront.handY = -136;
        const dx2 = -8 + (1 - phase2) * 86;
        pose.armBack.handX = dx2; pose.armBack.handY = -132;
      }
      break;
    }
  }
}

function drawLeg(ctx, leg, p, bd) {
  // thigh
  ctx.save();
  ctx.strokeStyle = p.skin;
  ctx.lineWidth = 18 * bd;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(leg.hipX, leg.hipY);
  ctx.lineTo(leg.kneeX, leg.kneeY);
  ctx.stroke();
  // shin
  ctx.lineWidth = 14 * bd;
  ctx.beginPath();
  ctx.moveTo(leg.kneeX, leg.kneeY);
  ctx.lineTo(leg.footX, leg.footY);
  ctx.stroke();
  // foot
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.ellipse(leg.footX + 4, leg.footY - 4, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTorso(ctx, pose, p, bd, ht) {
  ctx.save();
  ctx.translate(pose.pelvis.x, pose.pelvis.y);
  ctx.rotate(pose.torsoAngle);
  // torso shape
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.moveTo(-30 * bd, 0);
  ctx.lineTo(-34 * bd, -50 * ht);
  ctx.lineTo(-26 * bd, -68 * ht);
  ctx.lineTo(26 * bd, -68 * ht);
  ctx.lineTo(34 * bd, -50 * ht);
  ctx.lineTo(30 * bd, 0);
  ctx.closePath();
  ctx.fill();
  // chest shading
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(-30 * bd, 0);
  ctx.lineTo(-34 * bd, -50 * ht);
  ctx.lineTo(-26 * bd, -68 * ht);
  ctx.lineTo(0, -64 * ht);
  ctx.lineTo(-2, 0);
  ctx.closePath();
  ctx.fill();
  // ab line
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(0, -50 * ht);
  ctx.stroke();
  ctx.restore();
}

function drawArm(ctx, arm, p, bd, isBack) {
  ctx.save();
  // upper arm
  ctx.strokeStyle = p.skin;
  ctx.lineWidth = 12 * bd;
  ctx.lineCap = 'round';
  if (isBack) {
    ctx.globalAlpha = 0.92;
    ctx.filter = 'brightness(0.85)';
  }
  ctx.beginPath();
  ctx.moveTo(arm.shoulderX, arm.shoulderY);
  ctx.lineTo(arm.elbowX, arm.elbowY);
  ctx.stroke();
  // forearm
  ctx.lineWidth = 10 * bd;
  ctx.beginPath();
  ctx.moveTo(arm.elbowX, arm.elbowY);
  ctx.lineTo(arm.handX, arm.handY);
  ctx.stroke();
  // glove
  ctx.fillStyle = p.gloves;
  ctx.beginPath();
  ctx.arc(arm.handX, arm.handY, 11 * bd, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(arm.handX - 3, arm.handY - 3, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHead(ctx, pose, p, ht, f) {
  ctx.save();
  ctx.translate(pose.headOffset.x, pose.headOffset.y);
  // neck
  ctx.fillStyle = p.skin;
  ctx.fillRect(-6, 4, 12, 8);
  // head ellipse
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 22 * ht, 0, 0, Math.PI * 2);
  ctx.fill();
  // hair top
  ctx.fillStyle = p.hair;
  ctx.beginPath();
  ctx.ellipse(0, -10, 18, 12, 0, Math.PI, 0);
  ctx.fill();
  // sideburn / hair side
  ctx.fillRect(-18, -12, 5, 12);
  // eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(4, -2, 5, 4);
  ctx.fillRect(-9, -2, 4, 4);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(6, -1, 2, 2);
  ctx.fillRect(-7, -1, 2, 2);
  // mouth
  ctx.fillStyle = '#5a2820';
  if (f.state === 'attack') {
    ctx.fillRect(-3, 8, 8, 4);
  } else if (f.state === 'hit' || f.state === 'down') {
    ctx.fillRect(-4, 8, 10, 5);
  } else {
    ctx.fillRect(-3, 9, 8, 2);
  }
  // mouthguard accent
  ctx.fillStyle = p.accent;
  ctx.fillRect(-2, 9, 6, 2);
  ctx.restore();
}

// Draw a portrait (used in roster cards)
export function drawPortrait(ctx, fighter, w, h, opts = {}) {
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  // background ring
  const grd = ctx.createRadialGradient(w/2, h/2, 10, w/2, h/2, w * 0.6);
  grd.addColorStop(0, withAlpha(fighter.palette.trunks, 0.8));
  grd.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h * 0.92);
  const scale = (h / 240) * 0.95;
  ctx.scale(scale, scale);
  const fs = {
    data: fighter,
    side: 'p1',
    facing: 1,
    x: 0, y: 0, vx: 0, vy: 0,
    state: 'idle',
    animTime: opts.t || 0,
    attack: null,
    attackFrame: 0,
    stunFrames: 0,
    dodgeFrames: 0,
    dodgeIFrames: 0,
    downTime: 0,
  };
  // draw fighter (translated to local coords)
  ctx.translate(0, 0);
  // we need the canvas-side translation of fs.x,fs.y in world; but our drawFighter re-translates. Quick patch:
  drawFighterStandalone(ctx, fs, fighter);
  ctx.restore();
}

// Lightweight standalone drawer for portrait so we don't depend on engine state.
function drawFighterStandalone(ctx, fs, fighter) {
  fs.x = 0; fs.y = 0;
  // call same draw but inline to avoid extra translate (we already translated)
  ctx.save();
  ctx.scale(fs.facing, 1);
  const p = fighter.palette;
  const bd = fighter.build || 1;
  const ht = fighter.height || 1;
  const pose = computePose(fs, fs.animTime || 0);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 50 * bd, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  drawLeg(ctx, pose.legR, p, bd);
  drawLeg(ctx, pose.legL, p, bd);
  ctx.save();
  ctx.translate(pose.pelvis.x, pose.pelvis.y);
  ctx.fillStyle = p.trunks;
  ctx.fillRect(-26 * bd, -6, 52 * bd, 36);
  ctx.fillStyle = p.shorts2 || p.trunks;
  ctx.fillRect(-26 * bd, 22, 52 * bd, 8);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-26 * bd, -10, 52 * bd, 6);
  ctx.fillStyle = p.accent;
  ctx.fillRect(-6, -10, 12, 6);
  ctx.restore();
  drawTorso(ctx, pose, p, bd, ht);
  drawArm(ctx, pose.armBack, p, bd, true);
  drawHead(ctx, pose, p, ht, fs);
  drawArm(ctx, pose.armFront, p, bd, false);
  ctx.restore();
}
