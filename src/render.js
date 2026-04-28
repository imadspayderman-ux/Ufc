// Canvas rendering: arena, fighters, effects.
import { ARENA, easeOutCubic, easeInOutCubic } from './engine.js';

// ===== Color helpers =====
function parseHex(c) {
  let s = String(c).trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function toHex(n) { return Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0'); }
function shadeColor(c, pct) {
  // pct in [-1..1]: negative darkens, positive lightens.
  const { r, g, b } = parseHex(c);
  if (pct >= 0) {
    return '#' + toHex(r + (255 - r) * pct) + toHex(g + (255 - g) * pct) + toHex(b + (255 - b) * pct);
  } else {
    const p = 1 + pct;
    return '#' + toHex(r * p) + toHex(g * p) + toHex(b * p);
  }
}
function withAlpha(c, a) {
  if (typeof c === 'string' && c.startsWith('rgb')) return c;
  const { r, g, b } = parseHex(c);
  return `rgba(${r},${g},${b},${a})`;
}

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
    const tick = match.tick || 0;
    // ---------- Sky / dark backdrop ----------
    const g = ctx.createLinearGradient(0, 0, 0, ARENA.height);
    g.addColorStop(0, '#0b0710');
    g.addColorStop(0.35, '#14101c');
    g.addColorStop(0.7, '#0a0810');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);

    // ---------- Overhead spotlights with lens flare ----------
    for (let i = 0; i < 5; i++) {
      const cx = 140 + i * 260;
      const cy = 40;
      // Cone of light
      const cone = ctx.createLinearGradient(cx, cy, cx, 520);
      cone.addColorStop(0, 'rgba(255,235,190,0.22)');
      cone.addColorStop(0.5, 'rgba(255,215,160,0.06)');
      cone.addColorStop(1, 'rgba(255,215,160,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy);
      ctx.lineTo(cx + 18, cy);
      ctx.lineTo(cx + 180, 520);
      ctx.lineTo(cx - 180, 520);
      ctx.closePath();
      ctx.fill();
      // Light head glow
      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 60);
      grad.addColorStop(0, 'rgba(255,250,220,0.95)');
      grad.addColorStop(0.4, 'rgba(255,220,140,0.5)');
      grad.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - 70, cy - 30, 140, 90);
      // Fixture dot
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - 8, cy - 6, 16, 6);
    }

    // ---------- Crowd (dense, with face highlights & phone flashes) ----------
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 300, ARENA.width, 180);
    // Phone-light specks (twinkle)
    for (let i = 0; i < 35; i++) {
      const x = ((i * 71) + (tick * 0.3 | 0)) % ARENA.width;
      const y = 310 + ((i * 47) % 120);
      const tw = (Math.sin(tick * 0.05 + i) + 1) * 0.5;
      ctx.fillStyle = `rgba(255,255,${180 + (i*3) % 60},${0.25 + tw * 0.7})`;
      ctx.fillRect(x, y, 2, 2);
    }
    // Head silhouettes (front row brighter)
    for (let row = 0; row < 4; row++) {
      const rowY = 320 + row * 28;
      const rowBright = 40 - row * 8;
      const spacing = 16;
      for (let i = 0; i < ARENA.width / spacing; i++) {
        const x = i * spacing + ((row * 5) % spacing);
        const n = (i * 13 + row * 7);
        const dx = ((n * 17) % 5) - 2;
        const rH = 7 + (n % 3);
        // shoulder
        ctx.fillStyle = `rgba(${15 + rowBright}, ${10 + rowBright}, ${25 + rowBright}, 0.95)`;
        ctx.fillRect(x - 6, rowY + 5, 12, 14);
        // head
        ctx.fillStyle = `rgba(${25 + rowBright}, ${18 + rowBright}, ${35 + rowBright}, 0.98)`;
        ctx.beginPath();
        ctx.arc(x + dx, rowY, rH, 0, Math.PI * 2);
        ctx.fill();
        // face glint for front row
        if (row === 0 && (i % 5) === 0) {
          ctx.fillStyle = 'rgba(240,200,160,0.55)';
          ctx.beginPath();
          ctx.arc(x + dx, rowY + 1, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ---------- Octagon fence — chain-link diamonds ----------
    const fenceTop = 180, fenceBottom = 505;
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = '#9aa0b0';
    ctx.lineWidth = 1;
    const cell = 22;
    for (let y = fenceTop; y < fenceBottom; y += cell) {
      for (let x = -cell; x < ARENA.width + cell; x += cell) {
        const ox = ((y / cell) | 0) % 2 === 0 ? 0 : cell / 2;
        ctx.beginPath();
        ctx.moveTo(x + ox, y);
        ctx.lineTo(x + ox + cell / 2, y + cell / 2);
        ctx.lineTo(x + ox, y + cell);
        ctx.moveTo(x + ox + cell / 2, y + cell / 2);
        ctx.lineTo(x + ox + cell, y);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Top and bottom fence rails
    ctx.fillStyle = '#2a2a32';
    ctx.fillRect(0, fenceTop - 4, ARENA.width, 6);
    ctx.fillRect(0, fenceBottom - 2, ARENA.width, 6);

    // ---------- Octagon mat (perspective trapezoid) ----------
    const matTop = 500, matBot = ARENA.height;
    // Darker base
    const matGrad = ctx.createLinearGradient(0, matTop, 0, matBot);
    matGrad.addColorStop(0, '#4e3418');
    matGrad.addColorStop(1, '#271608');
    ctx.fillStyle = matGrad;
    ctx.fillRect(0, matTop, ARENA.width, matBot - matTop);
    // Perspective lines (vanishing point center-top)
    ctx.strokeStyle = 'rgba(120,80,40,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 20; i++) {
      const x = (i / 20) * ARENA.width;
      ctx.beginPath();
      ctx.moveTo(x, matTop);
      const vp = ARENA.width / 2;
      ctx.lineTo(x + (x - vp) * 0.25, matBot);
      ctx.stroke();
    }
    // Octagon ring-logo painted on the mat (ellipse perspective)
    ctx.save();
    ctx.translate(ARENA.width / 2, matTop + 28);
    ctx.strokeStyle = 'rgba(255,204,51,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, ARENA.width * 0.4, 26, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,204,51,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, ARENA.width * 0.32, 20, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,204,51,0.12)';
    ctx.font = 'bold 48px Impact, Arial Black, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OCTAGON FURY', 0, 12);
    ctx.restore();

    // ---------- Floor reflection beneath fighters ----------
    const reflectGrad = ctx.createLinearGradient(0, ARENA.groundY, 0, ARENA.height);
    reflectGrad.addColorStop(0, 'rgba(255,200,120,0.05)');
    reflectGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = reflectGrad;
    ctx.fillRect(0, ARENA.groundY, ARENA.width, ARENA.height - ARENA.groundY);
  }

  drawFighter(ctx, f, match) {
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

    let pose = computePose(f, t);
    // During the intro ceremony, override idle pose with corner-stance / arm-raise
    // so the fighter "presents" themselves when announced.
    if (match && match.state === 'intro') {
      pose = applyIntroPose(pose, f, match, t);
    }
    // Smooth limbs with IK-style elbow/knee offsets to avoid stiff straight lines.
    smoothJoints(pose, f, t);

    // legs: behind body
    drawLeg(ctx, pose.legR, p, bd);
    drawLeg(ctx, pose.legL, p, bd);

    // pelvis / FIGHT SHORTS — UFC-style with waistband, logo, side stripe
    ctx.save();
    ctx.translate(pose.pelvis.x, pose.pelvis.y);
    const trunks = p.trunks;
    const trunksDark = shadeColor(trunks, -0.3);
    const trunksLight = shadeColor(trunks, 0.18);
    const accent = p.accent || '#ffd34a';

    // Main shorts body with a subtle vertical gradient
    const sg = ctx.createLinearGradient(0, -4, 0, 34);
    sg.addColorStop(0, trunksLight);
    sg.addColorStop(1, trunksDark);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(-28 * bd, -6);
    ctx.lineTo(-30 * bd, 28);
    ctx.quadraticCurveTo(-26 * bd, 34, -8, 34);
    ctx.lineTo(-6, 28);
    ctx.lineTo(6, 28);
    ctx.lineTo(8, 34);
    ctx.quadraticCurveTo(26 * bd, 34, 30 * bd, 28);
    ctx.lineTo(28 * bd, -6);
    ctx.closePath();
    ctx.fill();

    // Side stripe (accent color, both sides)
    ctx.fillStyle = accent;
    ctx.fillRect(-28 * bd, 4, 3, 24);
    ctx.fillRect(25 * bd, 4, 3, 24);
    // Secondary contrast stripe
    ctx.fillStyle = p.shorts2 || '#0f0f0f';
    ctx.fillRect(-25 * bd, 4, 1.5, 24);
    ctx.fillRect(23 * bd, 4, 1.5, 24);

    // Logo plate (fake brand badge in center-front)
    ctx.fillStyle = withAlpha(accent, 0.9);
    ctx.beginPath();
    ctx.ellipse(0, 12, 10 * bd, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0a0a';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('UFN', 0, 13);

    // WAISTBAND — thick belt with fighter accent trim
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(-28 * bd, -10, 56 * bd, 8);
    ctx.fillStyle = accent;
    ctx.fillRect(-28 * bd, -10, 56 * bd, 2);
    ctx.fillStyle = shadeColor(accent, 0.2);
    ctx.fillRect(-28 * bd, -9, 56 * bd, 1);
    // Name tag on waistband (simple gold rectangle)
    ctx.fillStyle = accent;
    ctx.fillRect(-10, -8, 20, 4);
    ctx.fillStyle = '#0a0a0a';
    ctx.font = 'bold 5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(((f.data && (f.data.shortName || f.data.name)) || '').toUpperCase().slice(0, 6), 0, -5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Inseam shadow (cleft between thighs)
    ctx.fillStyle = withAlpha(trunksDark, 0.6);
    ctx.fillRect(-1, 22, 2, 12);

    ctx.restore();

    // back arm (drawn FIRST so it sits behind torso for proper depth)
    drawArm(ctx, pose.armBack, p, bd, true);

    // torso
    drawTorso(ctx, pose, p, bd, ht, f.data);

    // head (sits on top of torso neck)
    drawHead(ctx, pose, p, ht, f);

    // front arm (closest to camera — drawn last so it overlaps torso)
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
    // Intro: apply a subtle camera pan/zoom during the "pan" phase.
    if (match.state === 'intro' && match.introPhase === 'pan') {
      const k = match.introPhaseTime / match.introPhaseDuration;
      const zoom = 1.12 - 0.12 * easeOutCubic(k);
      const dx = (1 - zoom) * ARENA.width / 2;
      const dy = (1 - zoom) * ARENA.height / 2;
      ctx.translate(dx, dy);
      ctx.scale(zoom, zoom);
    }
    this.drawArena(ctx, match);
    // Intro spotlights and corner highlights.
    if (match.state === 'intro') {
      drawIntroSpotlights(ctx, match);
    }
    // Grapple-aware fighter draw ordering
    if (match.grapple && match.grapple.position !== 'clinch') {
      // Ground: draw the bottom fighter first (beneath), then top overlay
      const bottomF = match.grapple.bottom;
      const topF = match.grapple.top;
      if (bottomF) this.drawFighter(ctx, bottomF, match);
      if (topF) this.drawFighter(ctx, topF, match);
      // Submission visual overlay
      this.drawGrappleOverlay(ctx, match);
    } else {
      // depth: draw fighter further-from-camera first; we use side P2 as background
      if (match.p1.x < match.p2.x) {
        this.drawFighter(ctx, match.p2, match);
        this.drawFighter(ctx, match.p1, match);
      } else {
        this.drawFighter(ctx, match.p1, match);
        this.drawFighter(ctx, match.p2, match);
      }
      if (match.grapple && match.grapple.position === 'clinch') {
        this.drawGrappleOverlay(ctx, match);
      }
    }
    // Referee on top of fighters (he's the focal point during intro).
    if (match.state === 'intro' && match.ref && match.ref.x < ARENA.width + 100) {
      drawReferee(ctx, match.ref);
    }
    this.drawEffects(ctx);
    if (match.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${match.flash * 0.07})`;
      ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    }
    ctx.restore();
    // Intro banner text (drawn in screen space, outside shake+zoom transform).
    if (match.state === 'intro') {
      drawIntroBanner(ctx, match);
    }
    // Grapple state banner (position + submission progress)
    if (match.grapple) {
      drawGrappleHUD(ctx, match);
    }
  }

  // Draw wrapping arms / submission locks between grapple participants.
  drawGrappleOverlay(ctx, match) {
    const g = match.grapple;
    if (!g) return;
    ctx.save();
    if (g.position === 'clinch' && g.a && g.b) {
      // Draw interlocked arms as semi-opaque curves
      const ay = g.a.y - 180;
      const by = g.b.y - 180;
      const midX = (g.a.x + g.b.x) / 2;
      ctx.strokeStyle = 'rgba(30,30,30,0.55)';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(g.a.x + 28 * g.a.facing, ay);
      ctx.quadraticCurveTo(midX, ay - 22, g.b.x + 28 * g.b.facing, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(g.a.x + 28 * g.a.facing, ay + 14);
      ctx.quadraticCurveTo(midX, ay + 6, g.b.x + 28 * g.b.facing, by + 14);
      ctx.stroke();
    }
    // Ground submission lock visual
    if (g.submission && g.top && g.bottom) {
      const s = g.submission;
      const cx = g.centerX;
      const cy = ARENA.groundY - 60;
      ctx.strokeStyle = 'rgba(240,60,60,0.8)';
      ctx.lineWidth = 5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Submission name text (subtle)
      ctx.fillStyle = 'rgba(255,240,240,0.9)';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(s.kind.toUpperCase().replace(/_/g, ' '), cx, cy - 52);
    }
    ctx.restore();
  }
}

function drawGrappleHUD(ctx, match) {
  const g = match.grapple;
  if (!g) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px system-ui';
  ctx.fillStyle = '#ffcc44';
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 3;
  const label = g.position.toUpperCase().replace(/_/g, ' ');
  const x = ARENA.width / 2;
  ctx.strokeText(label, x, 130);
  ctx.fillText(label, x, 130);
  if (g.submission) {
    const s = g.submission;
    // Progress bar (attacker's sub lock progress)
    const bw = 260, bh = 14;
    const bx = x - bw / 2, by = 142;
    ctx.fillStyle = 'rgba(20,0,0,0.85)';
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = '#2a0a0a';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#ff3344';
    ctx.fillRect(bx, by, bw * (s.progress / 100), bh);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui';
    ctx.fillText(s.kind.toUpperCase().replace(/_/g, ' '), x, by - 4);
    // Tap bar (defender escape)
    const taps = s.defender.taps || 0;
    const tpct = Math.min(1, taps / s.escapeRequired);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(bx, by + bh + 4, bw, 8);
    ctx.fillStyle = '#44aaff';
    ctx.fillRect(bx, by + bh + 4, bw * tpct, 8);
    ctx.fillStyle = '#88ccff';
    ctx.font = 'bold 10px system-ui';
    ctx.fillText(`TAP TO ESCAPE (${taps}/${s.escapeRequired})`, x, by + bh + 22);
  }
  ctx.restore();
}

// Compute pose: positions for all body parts in fighter-local coords (origin = feet, +y down? we use +y down).
function computePose(f, t) {
  const a = f.attack;
  const af = f.attackFrame;
  const bd = (f.data && f.data.build) || 1.0;
  const ht = (f.data && f.data.height) || 1.0;
  // Torso silhouette goes from pelvis y=0 to neck y=-72*ht, shoulder edge at ±30*bd (male) / ±26*bd (female).
  // Place joint shoulders just inside that edge so the deltoid cap hugs the torso.
  const shoulderEdgeX = 26 * bd;
  const shoulderWorldY = -68 * ht - 82;  // pelvis.y + shoulderY in torso local coords
  // Defaults: proper boxing guard — elbows bent out, gloves up in front of jaw.
  const pose = {
    pelvis: { x: 0, y: -82 },
    torsoAngle: 0,
    headOffset: { x: -2, y: -152 * ht },
    legL: { hipX: -12 * bd, hipY: -78, kneeX: -16 * bd, kneeY: -42, footX: -22 * bd, footY: 0 }, // back leg
    legR: { hipX: 12 * bd,  hipY: -78, kneeX: 20 * bd,  kneeY: -42, footX: 28 * bd,  footY: 0 }, // lead leg (wider stance)
    armBack: {
      shoulderX: -shoulderEdgeX, shoulderY: shoulderWorldY,
      elbowX: -18 * bd, elbowY: -118,
      handX: -2, handY: -138,
    },
    armFront: {
      shoulderX: shoulderEdgeX, shoulderY: shoulderWorldY,
      elbowX: 30 * bd, elbowY: -118,
      handX: 20 * bd, handY: -140,
    },
  };

  // Weight-class + specialty aware breathing/walk cadence.
  const cadence = (f.data && f.specialty && f.specialty.walkCadence) || 1.0;
  const bobAmp = (f.weightClass && f.weightClass.footstepBob) || 1.0;
  // Idle breathing — subtle sine sway on chest and head.
  if (f.state === 'idle' || f.state === 'walk') {
    const breath = Math.sin(t * 0.11) * 1.8;
    const bob = Math.sin(t * 0.2) * 1.2 * bobAmp;
    pose.pelvis.y -= bob + breath * 0.3;
    pose.headOffset.y -= bob + breath * 0.2;
    // Shoulder sway for back-and-forth of breathing.
    pose.armBack.shoulderY += breath * 0.3;
    pose.armFront.shoulderY += breath * 0.3;
  }
  if (f.state === 'walk') {
    // Direction-aware walk: forward = confident stride; backward = shuffle step w/ hands high.
    const dir = typeof f.movingDirection === 'number' ? f.movingDirection : 1;
    const retreat = dir < 0;
    const strideFreq = 0.32 * cadence * (retreat ? 0.7 : 1.0);
    const strideMag = retreat ? 0.6 : 1.0;
    const stride = Math.sin(t * strideFreq) * strideMag;
    const strideAbs = Math.abs(stride);
    const liftR = Math.max(0, stride);        // lead leg lifts on positive phase
    const liftL = Math.max(0, -stride);       // back leg lifts on negative phase
    // Foot plant — lifted foot tilts on toe/heel via footY offset
    pose.legR.footX = 24 * bd + stride * (retreat ? 10 : 16);
    pose.legR.footY = -liftR * 16 * bobAmp;
    pose.legR.kneeX = 16 * bd + stride * 6;
    pose.legR.kneeY = -42 - liftR * 14 * bobAmp;   // higher knee lift for lighter fighters
    pose.legL.footX = -20 * bd + stride * (retreat ? 10 : 16);
    pose.legL.footY = -liftL * 16 * bobAmp;
    pose.legL.kneeX = -14 * bd + stride * 6;
    pose.legL.kneeY = -42 - liftL * 14 * bobAmp;
    // Pelvis rise-fall (mid-step = low, step-plant = high), slight twist.
    pose.pelvis.y = -82 + strideAbs * 2 * bobAmp - 2;
    pose.pelvis.x = stride * (retreat ? 1 : 2);
    // Heavier fighters lean forward slightly; retreat tilts torso back.
    const lean = (1 - bobAmp) * 0.12 + (retreat ? -0.03 : 0.02);
    pose.torsoAngle = -stride * 0.05 + lean;
    // Retreat = hands stay in higher guard; advance = natural arm swing (counter-phase).
    if (retreat) {
      pose.armFront.handX = 16; pose.armFront.handY = -152;
      pose.armFront.elbowX = 14 * bd; pose.armFront.elbowY = -140;
      pose.armBack.handX = 8;  pose.armBack.handY = -150;
      pose.armBack.elbowX = -10 * bd; pose.armBack.elbowY = -138;
    } else {
      pose.armFront.handX = 26 - stride * 18;
      pose.armFront.handY = -128 + strideAbs * 4;
      pose.armFront.elbowX = 20 * bd - stride * 8;
      pose.armFront.elbowY = -128 + strideAbs * 2;
      pose.armBack.handX = 0 + stride * 18;
      pose.armBack.handY = -128 + strideAbs * 4;
      pose.armBack.elbowX = -14 * bd + stride * 8;
      pose.armBack.elbowY = -125 + strideAbs * 2;
    }
    // Head bobs slightly with stride
    pose.headOffset.y = -152 * ht + strideAbs * 2 * bobAmp - 2;
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
  if (f.state === 'sprawl') {
    // Shot defended — attacker on hands and knees, forehead low, butt up.
    const pulse = (Math.sin(t * 0.25) + 1) * 0.5;
    pose.pelvis.x = 0; pose.pelvis.y = -40;
    pose.headOffset.x = 26; pose.headOffset.y = -30;
    pose.torsoAngle = 0.55;
    pose.legL.kneeX = -14 * bd; pose.legL.kneeY = -14; pose.legL.footX = -20 * bd; pose.legL.footY = 0;
    pose.legR.kneeX =  14 * bd; pose.legR.kneeY = -14; pose.legR.footX =  20 * bd; pose.legR.footY = 0;
    pose.armBack.shoulderY = -50; pose.armBack.elbowY = -22; pose.armBack.elbowX = -8; pose.armBack.handY = -4; pose.armBack.handX = -4;
    pose.armFront.shoulderY = -50; pose.armFront.elbowY = -22; pose.armFront.elbowX = 18; pose.armFront.handY = -4 + pulse * 1; pose.armFront.handX = 24;
  }
  if (f.state === 'clinch') {
    // Both fighters locked up — wide base, forward lean, arms up in collar-tie / under-hook posture.
    const pulse = Math.sin(t * 0.25) * 1.2;
    pose.pelvis.x = 6; pose.pelvis.y = -76 + pulse * 0.5;
    pose.torsoAngle = 0.12;
    // Wide base stance
    pose.legL.footX = -26 * bd; pose.legL.footY = 0; pose.legL.kneeX = -18 * bd; pose.legL.kneeY = -46;
    pose.legR.footX =  30 * bd; pose.legR.footY = 0; pose.legR.kneeX =  22 * bd; pose.legR.kneeY = -46;
    // Both arms raised, reaching across the center line toward the opponent.
    pose.armBack.shoulderX = -24 * bd; pose.armBack.shoulderY = -72 * ht - 82;
    pose.armBack.elbowX = 4;  pose.armBack.elbowY = -156 + pulse;
    pose.armBack.handX  = 34; pose.armBack.handY  = -162 + pulse;
    pose.armFront.shoulderX = 26 * bd; pose.armFront.shoulderY = -72 * ht - 82;
    pose.armFront.elbowX = 20; pose.armFront.elbowY = -148 + pulse;
    pose.armFront.handX  = 48; pose.armFront.handY  = -154 + pulse;
    pose.headOffset.x = 8; pose.headOffset.y = -150 * ht;
    // Clinch attack overlay (knee / elbow / dirty punch) — animated via f.attack progress
    if (f.attack) {
      const ca = f.attack;
      const total = ca.startup + ca.active + ca.recovery;
      const kRaw = Math.max(0, Math.min(1, f.attackFrame / total));
      // Peak around 0.35..0.5 of total (active phase)
      const peak = f.attackFrame < ca.startup ? (f.attackFrame / ca.startup) :
                    f.attackFrame < ca.startup + ca.active ? 1 :
                    1 - (f.attackFrame - ca.startup - ca.active) / ca.recovery;
      const ease = Math.sin(peak * Math.PI);
      if (ca.kind === 'clinch_knee') {
        // Right knee drives up into opponent
        pose.legR.kneeX = 8 * bd + ease * 22;
        pose.legR.kneeY = -46 - ease * 62;
        pose.legR.footX = 16 * bd + ease * 28;
        pose.legR.footY = -ease * 54;
        pose.pelvis.y = -80 - ease * 14;
        pose.torsoAngle = 0.12 + ease * 0.12;
      } else if (ca.kind === 'clinch_elbow') {
        // Front elbow swings down/around
        pose.armFront.elbowX = 12 + ease * 10;
        pose.armFront.elbowY = -176 - ease * 10;
        pose.armFront.handX  = 18 + ease * 8;
        pose.armFront.handY  = -188 - ease * 6;
      } else if (ca.kind === 'dirty_punch') {
        pose.armBack.elbowX = -2 + ease * 8;
        pose.armBack.elbowY = -156 + ease * 6;
        pose.armBack.handX = 34 + ease * 18;
        pose.armBack.handY = -162 + ease * 6;
      }
    }
  }
  if (f.state === 'ground_bottom') {
    // Lying supine with legs in guard (hips up, knees bent to hook opponent).
    const breathe = Math.sin(t * 0.12) * 1;
    pose.pelvis.x = 0; pose.pelvis.y = -14 + breathe * 0.3;
    pose.torsoAngle = 0.0;
    pose.headOffset.x = -56; pose.headOffset.y = -18;
    // Bent legs up in guard (feet behind opponent's hips)
    pose.legL.hipX = 6;  pose.legL.hipY = -14; pose.legL.kneeX = 20; pose.legL.kneeY = -56; pose.legL.footX = 46; pose.legL.footY = -66;
    pose.legR.hipX = 6;  pose.legR.hipY = -12; pose.legR.kneeX = 22; pose.legR.kneeY = -52; pose.legR.footX = 50; pose.legR.footY = -62;
    // Arms up framing or gripping for defense
    pose.armBack.shoulderX = -36;  pose.armBack.shoulderY = -24;  pose.armBack.elbowX = -26; pose.armBack.elbowY = -40;  pose.armBack.handX = -4;  pose.armBack.handY = -44;
    pose.armFront.shoulderX = -32; pose.armFront.shoulderY = -30; pose.armFront.elbowX = -16; pose.armFront.elbowY = -46; pose.armFront.handX = 6;   pose.armFront.handY = -50;
  }
  if (f.state === 'ground_top') {
    // Kneeling astride opponent (mount). Pelvis elevated, torso upright, arms up for GnP.
    const pulse = Math.sin(t * 0.22) * 1.3;
    pose.pelvis.x = 0; pose.pelvis.y = -52 + pulse * 0.6;
    pose.torsoAngle = -0.05;
    // Knees planted on either side (mount position)
    pose.legL.hipX = -10 * bd; pose.legL.hipY = -48; pose.legL.kneeX = -24 * bd; pose.legL.kneeY = -20; pose.legL.footX = -14 * bd; pose.legL.footY = 0;
    pose.legR.hipX =  10 * bd; pose.legR.hipY = -48; pose.legR.kneeX =  24 * bd; pose.legR.kneeY = -20; pose.legR.footX =  14 * bd; pose.legR.footY = 0;
    // Arms raised high, ready to rain strikes
    pose.armBack.shoulderX = -20 * bd;  pose.armBack.shoulderY = -100;
    pose.armBack.elbowX = -12;  pose.armBack.elbowY = -136; pose.armBack.handX = -4;  pose.armBack.handY = -158;
    pose.armFront.shoulderX = 22 * bd;  pose.armFront.shoulderY = -100;
    pose.armFront.elbowX = 14;  pose.armFront.elbowY = -140; pose.armFront.handX = 22; pose.armFront.handY = -162;
    pose.headOffset.x = -2; pose.headOffset.y = -130;
    // Overlay attack animation if mid-GnP strike
    if (f.attack) {
      const ca = f.attack;
      const peak = f.attackFrame < ca.startup ? (f.attackFrame / ca.startup) :
                    f.attackFrame < ca.startup + ca.active ? 1 :
                    1 - (f.attackFrame - ca.startup - ca.active) / ca.recovery;
      const ease = Math.sin(peak * Math.PI);
      if (ca.kind === 'ground_punch') {
        pose.armFront.handX = 22 + ease * 18;
        pose.armFront.handY = -162 + ease * 90;
        pose.armFront.elbowX = 14 + ease * 10;
        pose.armFront.elbowY = -140 + ease * 50;
      } else if (ca.kind === 'ground_elbow') {
        pose.armFront.handX = 12 + ease * 18;
        pose.armFront.handY = -170 + ease * 110;
        pose.armFront.elbowX = 8 + ease * 14;
        pose.armFront.elbowY = -150 + ease * 30;
      }
    }
  }
  if (f.state === 'sub_offense') {
    // Locking in a submission — leaning forward with arms wrapped.
    pose.pelvis.x = 0; pose.pelvis.y = -56;
    pose.torsoAngle = 0.24;
    pose.legL.kneeX = -22 * bd; pose.legL.kneeY = -22; pose.legL.footX = -14 * bd; pose.legL.footY = 0;
    pose.legR.kneeX =  22 * bd; pose.legR.kneeY = -22; pose.legR.footX =  14 * bd; pose.legR.footY = 0;
    // Arms wrapped tight, hands close together (choke / lock grip)
    pose.armBack.shoulderX = -16 * bd; pose.armBack.shoulderY = -96;
    pose.armBack.elbowX = 10; pose.armBack.elbowY = -128; pose.armBack.handX = 28; pose.armBack.handY = -128;
    pose.armFront.shoulderX = 18 * bd; pose.armFront.shoulderY = -96;
    pose.armFront.elbowX = 24; pose.armFront.elbowY = -124; pose.armFront.handX = 32; pose.armFront.handY = -126;
    pose.headOffset.x = 6; pose.headOffset.y = -130;
  }
  if (f.state === 'sub_defense') {
    // Fighter is being submitted — struggling; arms up flailing.
    const flail = Math.sin(t * 0.4) * 6;
    pose.pelvis.x = 0; pose.pelvis.y = -18;
    pose.torsoAngle = 0.08;
    pose.headOffset.x = -42; pose.headOffset.y = -22;
    pose.legL.hipX = 4; pose.legL.hipY = -16; pose.legL.kneeX = 20; pose.legL.kneeY = -44 + flail * 0.5; pose.legL.footX = 50; pose.legL.footY = -40;
    pose.legR.hipX = 4; pose.legR.hipY = -14; pose.legR.kneeX = 22; pose.legR.kneeY = -38 - flail * 0.5; pose.legR.footX = 54; pose.legR.footY = -34;
    pose.armBack.shoulderX = -30; pose.armBack.shoulderY = -26;
    pose.armBack.elbowX = -24 - flail; pose.armBack.elbowY = -44 + flail; pose.armBack.handX = -10; pose.armBack.handY = -56 + flail;
    pose.armFront.shoulderX = -26; pose.armFront.shoulderY = -32;
    pose.armFront.elbowX = -10 + flail; pose.armFront.elbowY = -50 - flail; pose.armFront.handX = 8; pose.armFront.handY = -60 - flail;
  }
  if (f.state === 'attack' && a) {
    const phase = af < a.startup ? 'startup' : af < a.startup + a.active ? 'active' : 'recovery';
    const k = phase === 'startup' ? af / a.startup : phase === 'active' ? 1 : 1 - (af - a.startup - a.active) / a.recovery;
    applyAttackPose(pose, a.kind, k, phase, f);
  }
  return pose;
}

function applyAttackPose(pose, kind, k, phase, f) {
  // Three-phase curve: chamber (startup), extend (active, peaks at 1), retract (recovery).
  // `k` already represents 0..1..0 progression across the whole move. Use easing for snap.
  const easeOut = 1 - (1 - k) * (1 - k);   // fast-out for snap on extension
  const easeIn = k * k;                     // accelerating for chamber
  switch (kind) {
    case 'jab': {
      // lead hand extends forward with a snap, rear hand pulls back as guard
      const reach = easeOut;
      pose.armFront.elbowX = 16 + reach * 34;
      pose.armFront.elbowY = -132 - reach * 2;
      pose.armFront.handX = 24 + reach * 60;
      pose.armFront.handY = -134 - reach * 2;
      pose.armBack.handX = -4; pose.armBack.handY = -144;
      pose.armBack.elbowX = -10; pose.armBack.elbowY = -130;
      pose.torsoAngle = 0.05 * reach;      // slight lean into jab
      pose.pelvis.x = reach * 3;
      break;
    }
    case 'cross': {
      // rear hand drives forward with full hip + shoulder rotation, lead hand protects chin
      const reach = easeOut;
      pose.armBack.elbowX = -6 + reach * 28;
      pose.armBack.elbowY = -134 - reach * 2;
      pose.armBack.handX = -2 + reach * 86;
      pose.armBack.handY = -134 - reach * 2;
      pose.armFront.handX = 14; pose.armFront.handY = -148;
      pose.armFront.elbowX = 14; pose.armFront.elbowY = -135;
      pose.torsoAngle = -0.24 * reach;      // body rotates behind the punch
      pose.pelvis.x = reach * 5;            // hip drive forward
      pose.headOffset.x = -2 + reach * 6;
      // Back foot pivots (toe up)
      pose.legL.footY -= reach * 4;
      break;
    }
    case 'uppercut': {
      // dip + rise: chamber drops body, extension rises with back hand arcing up
      const dip = phase === 'startup' ? easeIn : 1 - easeOut;
      const rise = phase === 'startup' ? 0 : easeOut;
      pose.pelvis.y = -82 + dip * 4 - rise * 10;
      pose.torsoAngle = -0.12 * rise;
      pose.armBack.elbowX = 4 + rise * 16;
      pose.armBack.elbowY = -120 - rise * 18;
      pose.armBack.handX = 6 + rise * 30;
      pose.armBack.handY = -116 - rise * 44;
      pose.armFront.handX = 16; pose.armFront.handY = -146;
      break;
    }
    case 'kick': {
      // Round kick (mid/body): chamber knee up, extend leg horizontally, retract.
      const chamber = phase === 'startup' ? easeIn : 1 - easeOut;
      const extend = phase === 'startup' ? 0 : easeOut;
      // Knee raises during chamber, leg whips out during extend.
      const kneeX = 20 + chamber * 10;
      const kneeY = -70 + chamber * -34 + extend * 20;
      const footX = 20 + chamber * 18 + extend * 70;
      const footY = -70 + chamber * -40 + extend * 30;
      pose.legR.kneeX = kneeX; pose.legR.kneeY = kneeY;
      pose.legR.footX = footX; pose.legR.footY = footY;
      pose.torsoAngle = -0.22 * extend;
      pose.armBack.handX = -18 + extend * 4;
      pose.armBack.handY = -150;
      pose.armFront.handX = 8 - extend * 6;
      pose.armFront.handY = -132 + extend * 6;
      pose.pelvis.x = -extend * 4;
      break;
    }
    case 'low_kick': {
      // Low kick — knee stays low, whips across at shin height
      const chamber = phase === 'startup' ? easeIn : 1 - easeOut;
      const extend = phase === 'startup' ? 0 : easeOut;
      pose.legR.kneeX = 16 + chamber * 10;
      pose.legR.kneeY = -32 - chamber * 10;
      pose.legR.footX = 16 + chamber * 20 + extend * 60;
      pose.legR.footY = -26 + chamber * -6 + extend * 4;
      pose.torsoAngle = -0.12 * extend;
      pose.armFront.handX = 12 - extend * 2; pose.armFront.handY = -130;
      pose.armBack.handX = -14; pose.armBack.handY = -144;
      break;
    }
    case 'head_kick': {
      // High head kick — deep chamber, whip upward, land at head height
      const chamber = phase === 'startup' ? easeIn : 1 - easeOut;
      const extend = phase === 'startup' ? 0 : easeOut;
      pose.legR.kneeX = 14 + chamber * 16;
      pose.legR.kneeY = -90 + chamber * -30 + extend * 20;
      pose.legR.footX = 14 + chamber * 22 + extend * 70;
      pose.legR.footY = -90 + chamber * -50 + extend * -14;
      pose.torsoAngle = -0.34 * extend;
      pose.pelvis.y = -82 + extend * 8;
      pose.armBack.handX = -24; pose.armBack.handY = -130;
      pose.armFront.handX = 12; pose.armFront.handY = -120;
      pose.headOffset.x = -2 - extend * 4;
      // Support leg bends
      pose.legL.kneeY = -36;
      pose.legL.footX = -14;
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
  const skin = p.skin;
  const shadow = shadeColor(skin, -0.22);
  const hilite = shadeColor(skin, 0.18);

  ctx.save();
  ctx.lineCap = 'round';

  // THIGH (quadriceps) — wider, with shadow side for definition
  ctx.strokeStyle = skin;
  ctx.lineWidth = 22 * bd;
  ctx.beginPath();
  ctx.moveTo(leg.hipX, leg.hipY);
  ctx.lineTo(leg.kneeX, leg.kneeY);
  ctx.stroke();
  // inner shadow stroke (slightly offset)
  ctx.strokeStyle = shadow;
  ctx.lineWidth = 8 * bd;
  ctx.beginPath();
  ctx.moveTo(leg.hipX - 4, leg.hipY + 2);
  ctx.lineTo(leg.kneeX - 3, leg.kneeY - 2);
  ctx.stroke();
  // highlight stroke
  ctx.strokeStyle = hilite;
  ctx.lineWidth = 4 * bd;
  ctx.beginPath();
  ctx.moveTo(leg.hipX + 5, leg.hipY + 2);
  ctx.lineTo(leg.kneeX + 4, leg.kneeY - 4);
  ctx.stroke();

  // KNEE (slightly larger joint cap)
  ctx.fillStyle = shadeColor(skin, -0.08);
  ctx.beginPath();
  ctx.arc(leg.kneeX, leg.kneeY, 9 * bd, 0, Math.PI * 2);
  ctx.fill();

  // SHIN (calf) — tapered
  ctx.strokeStyle = skin;
  ctx.lineWidth = 16 * bd;
  ctx.beginPath();
  ctx.moveTo(leg.kneeX, leg.kneeY);
  ctx.lineTo(leg.footX, leg.footY);
  ctx.stroke();
  // calf muscle highlight
  ctx.strokeStyle = hilite;
  ctx.lineWidth = 4 * bd;
  ctx.beginPath();
  ctx.moveTo(leg.kneeX + 4, leg.kneeY + 6);
  ctx.lineTo(leg.footX + 3, leg.footY - 6);
  ctx.stroke();
  // shadow on back of calf
  ctx.strokeStyle = shadow;
  ctx.lineWidth = 3 * bd;
  ctx.beginPath();
  ctx.moveTo(leg.kneeX - 4, leg.kneeY + 6);
  ctx.lineTo(leg.footX - 4, leg.footY - 6);
  ctx.stroke();

  // ANKLE WRAP (athletic tape, white)
  ctx.strokeStyle = '#ececec';
  ctx.lineWidth = 4 * bd;
  ctx.lineCap = 'butt';
  for (let i = 0; i < 3; i++) {
    const tY = leg.footY - 4 + i * 3;
    ctx.beginPath();
    ctx.moveTo(leg.footX - 8, tY);
    ctx.lineTo(leg.footX + 8, tY);
    ctx.stroke();
  }

  // FOOT (barefoot, skin-toned)
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(leg.footX + 6, leg.footY - 2, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(leg.footX + 6, leg.footY + 1, 15, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTorso(ctx, pose, p, bd, ht, data) {
  const skin = p.skin;
  const shadow = shadeColor(skin, -0.20);
  const deepShadow = shadeColor(skin, -0.34);
  const hilite = shadeColor(skin, 0.14);

  const muscle = data && typeof data.muscle === 'number' ? data.muscle : 0.75;
  const belly = data && typeof data.belly === 'number' ? data.belly : 0;
  const female = data && data.sex === 'f';

  // Base silhouette dimensions (natural proportions, not exaggerated)
  // Shoulder width scales with build; waist stays narrower but proportionally.
  const shoulderW = female ? 26 * bd : 30 * bd;
  const waistW = female ? 22 * bd : 22 * bd;
  const neckOffsetY = -72 * ht;
  const shoulderY = -68 * ht;
  const chestY = -52 * ht;
  const waistY = 0;

  ctx.save();
  ctx.translate(pose.pelvis.x, pose.pelvis.y);
  ctx.rotate(pose.torsoAngle);

  // TORSO BASE — softer V-taper with belly bulge if applicable
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-waistW, waistY);
  // left flank
  ctx.bezierCurveTo(
    -(waistW + belly * 8), -14,
    -(shoulderW * 0.95 + belly * 4), -34,
    -shoulderW, shoulderY
  );
  ctx.lineTo(-shoulderW * 0.7, neckOffsetY);
  ctx.lineTo(-5, neckOffsetY - 2);
  ctx.lineTo(5, neckOffsetY - 2);
  ctx.lineTo(shoulderW * 0.7, neckOffsetY);
  ctx.lineTo(shoulderW, shoulderY);
  // right flank
  ctx.bezierCurveTo(
    shoulderW * 0.95 + belly * 4, -34,
    waistW + belly * 8, -14,
    waistW, waistY
  );
  ctx.closePath();
  ctx.fill();

  // Side shading (left in shadow as light comes from right)
  const g1 = ctx.createLinearGradient(-shoulderW, 0, shoulderW * 0.3, 0);
  g1.addColorStop(0, withAlpha(deepShadow, 0.45));
  g1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(-shoulderW - 2, neckOffsetY, shoulderW * 1.3, -waistY + 76);

  // Right-side highlight
  const g2 = ctx.createLinearGradient(-shoulderW * 0.3, 0, shoulderW, 0);
  g2.addColorStop(0, 'rgba(255,255,255,0)');
  g2.addColorStop(1, withAlpha(hilite, 0.32));
  ctx.fillStyle = g2;
  ctx.fillRect(-shoulderW * 0.3, neckOffsetY, shoulderW * 1.3, -waistY + 76);

  // Neck shadow tuck under chin
  ctx.fillStyle = withAlpha(deepShadow, 0.45);
  ctx.beginPath();
  ctx.ellipse(0, neckOffsetY - 1, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (female) {
    // Female chest / collarbone hint (subtle, arcade-appropriate)
    ctx.fillStyle = withAlpha(shadow, 0.5);
    ctx.beginPath();
    ctx.ellipse(-7 * bd, -52 * ht, 8 * bd, 7 * ht, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(7 * bd, -52 * ht, 8 * bd, 7 * ht, 0.12, 0, Math.PI * 2);
    ctx.fill();
    // sports-bra top line
    ctx.strokeStyle = withAlpha(p.accent || '#ffd34a', 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.8, chestY + 2);
    ctx.quadraticCurveTo(0, chestY - 4, shoulderW * 0.8, chestY + 2);
    ctx.stroke();
    // subtle abs line (less defined)
    if (muscle > 0.4) {
      ctx.strokeStyle = withAlpha(deepShadow, 0.35);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, -36 * ht);
      ctx.lineTo(0, -8);
      ctx.stroke();
    }
  } else {
    // Male chest + abs, scaled by muscle
    // PECS
    ctx.fillStyle = withAlpha(shadow, 0.75);
    ctx.beginPath();
    ctx.ellipse(-10 * bd, -56 * ht, 11 * bd, 6 * ht, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10 * bd, -56 * ht, 11 * bd, 6 * ht, 0.18, 0, Math.PI * 2);
    ctx.fill();
    // pec highlight
    ctx.fillStyle = withAlpha(hilite, 0.38);
    ctx.beginPath();
    ctx.ellipse(-8 * bd, -58 * ht, 6 * bd, 3, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(8 * bd, -58 * ht, 6 * bd, 3, 0.25, 0, Math.PI * 2);
    ctx.fill();
    // sternum line
    ctx.strokeStyle = withAlpha(deepShadow, 0.6);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -62 * ht);
    ctx.lineTo(0, -50 * ht);
    ctx.stroke();

    // Abs (muscle-weighted)
    if (muscle > 0.4) {
      const absAlpha = (muscle - 0.3) * 0.9;
      ctx.fillStyle = withAlpha(shadow, absAlpha);
      for (let row = 0; row < 3; row++) {
        const y = -44 * ht + row * 12;
        ctx.fillRect(-9 * bd, y, 3, 9);
        ctx.fillRect(6 * bd, y, 3, 9);
      }
      // center ab line
      ctx.strokeStyle = withAlpha(deepShadow, 0.55);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, -46 * ht);
      ctx.lineTo(0, -4);
      ctx.stroke();
    }

    if (belly > 0.1) {
      // Rounded gut for heavy build
      ctx.fillStyle = withAlpha(shadow, 0.35);
      ctx.beginPath();
      ctx.ellipse(0, -18, (waistW + belly * 6), 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha(hilite, 0.25);
      ctx.beginPath();
      ctx.ellipse(3, -22, 10 * bd, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Obliques (subtle diagonal shading on the sides near waist) — only for athletic bodies
    if (muscle > 0.55 && belly < 0.2) {
      ctx.strokeStyle = withAlpha(deepShadow, 0.4);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-10 * bd, -16);
      ctx.lineTo(-waistW + 2, -2);
      ctx.moveTo(10 * bd, -16);
      ctx.lineTo(waistW - 2, -2);
      ctx.stroke();
    }

    // Collarbones
    ctx.strokeStyle = withAlpha(deepShadow, 0.35);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.7, shoulderY - 4);
    ctx.quadraticCurveTo(-8, neckOffsetY + 2, -2, neckOffsetY);
    ctx.moveTo(shoulderW * 0.7, shoulderY - 4);
    ctx.quadraticCurveTo(8, neckOffsetY + 2, 2, neckOffsetY);
    ctx.stroke();
  }

  ctx.restore();
}

function drawArm(ctx, arm, p, bd, isBack) {
  const skin = isBack ? shadeColor(p.skin, -0.12) : p.skin;
  const shadow = shadeColor(skin, -0.22);
  const hilite = shadeColor(skin, 0.18);
  const gloveBase = p.gloves;
  const gloveShadow = shadeColor(gloveBase, -0.28);
  const gloveHilite = shadeColor(gloveBase, 0.25);

  ctx.save();
  ctx.lineCap = 'round';

  // SHOULDER / DELTOID cap
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(arm.shoulderX, arm.shoulderY, 11 * bd, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(arm.shoulderX - 3, arm.shoulderY + 2, 8 * bd, 0, Math.PI * 2);
  ctx.fill();

  // UPPER ARM (bicep/tricep)
  ctx.strokeStyle = skin;
  ctx.lineWidth = 14 * bd;
  ctx.beginPath();
  ctx.moveTo(arm.shoulderX, arm.shoulderY);
  ctx.lineTo(arm.elbowX, arm.elbowY);
  ctx.stroke();
  // bicep highlight
  ctx.strokeStyle = hilite;
  ctx.lineWidth = 4 * bd;
  ctx.beginPath();
  ctx.moveTo(arm.shoulderX + 2, arm.shoulderY + 2);
  ctx.lineTo(arm.elbowX + 2, arm.elbowY - 2);
  ctx.stroke();
  // tricep shadow
  ctx.strokeStyle = shadow;
  ctx.lineWidth = 5 * bd;
  ctx.beginPath();
  ctx.moveTo(arm.shoulderX - 4, arm.shoulderY + 4);
  ctx.lineTo(arm.elbowX - 4, arm.elbowY);
  ctx.stroke();

  // ELBOW joint
  ctx.fillStyle = shadeColor(skin, -0.08);
  ctx.beginPath();
  ctx.arc(arm.elbowX, arm.elbowY, 7 * bd, 0, Math.PI * 2);
  ctx.fill();

  // FOREARM
  ctx.strokeStyle = skin;
  ctx.lineWidth = 11 * bd;
  ctx.beginPath();
  ctx.moveTo(arm.elbowX, arm.elbowY);
  ctx.lineTo(arm.handX, arm.handY);
  ctx.stroke();
  // forearm highlight
  ctx.strokeStyle = hilite;
  ctx.lineWidth = 3 * bd;
  ctx.beginPath();
  ctx.moveTo(arm.elbowX + 2, arm.elbowY + 2);
  ctx.lineTo(arm.handX + 2, arm.handY - 1);
  ctx.stroke();

  // WRIST WRAP (white tape)
  const wristAngle = Math.atan2(arm.handY - arm.elbowY, arm.handX - arm.elbowX);
  const wx = arm.handX - Math.cos(wristAngle) * 11 * bd;
  const wy = arm.handY - Math.sin(wristAngle) * 11 * bd;
  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(wristAngle);
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(-5, -6 * bd, 8, 12 * bd);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  for (let i = -4; i < 4; i += 2) {
    ctx.beginPath();
    ctx.moveTo(i, -6 * bd);
    ctx.lineTo(i + 2, 6 * bd);
    ctx.stroke();
  }
  ctx.restore();

  // GLOVE — egg-shaped with knuckle bumps and thumb
  ctx.save();
  ctx.translate(arm.handX, arm.handY);
  ctx.rotate(wristAngle);
  // main body
  ctx.fillStyle = gloveBase;
  ctx.beginPath();
  ctx.ellipse(3, 0, 14 * bd, 11 * bd, 0, 0, Math.PI * 2);
  ctx.fill();
  // glove shadow underside
  ctx.fillStyle = gloveShadow;
  ctx.beginPath();
  ctx.ellipse(3, 4, 14 * bd, 5 * bd, 0, 0, Math.PI * 2);
  ctx.fill();
  // knuckles (3 small bumps across top)
  ctx.fillStyle = gloveHilite;
  for (let k = -6; k <= 10; k += 6) {
    ctx.beginPath();
    ctx.arc(k, -4 * bd, 3 * bd, 0, Math.PI * 2);
    ctx.fill();
  }
  // thumb
  ctx.fillStyle = gloveBase;
  ctx.beginPath();
  ctx.ellipse(-8, 3, 5 * bd, 4 * bd, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = gloveShadow;
  ctx.beginPath();
  ctx.ellipse(-8, 5, 5 * bd, 2 * bd, 0.4, 0, Math.PI * 2);
  ctx.fill();
  // highlight glint
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-2, -6, 5 * bd, 2 * bd, 0, 0, Math.PI * 2);
  ctx.fill();
  // brand stripe
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(-2, 1, 10, 1);
  ctx.restore();

  ctx.restore();
}

function drawHead(ctx, pose, p, ht, f) {
  const skin = p.skin;
  const shadow = shadeColor(skin, -0.22);
  const deep = shadeColor(skin, -0.38);
  const hilite = shadeColor(skin, 0.18);
  const hair = p.hair;
  const hairShadow = shadeColor(hair, -0.35);
  const hairHilite = shadeColor(hair, 0.25);
  const hairStyle = (p.hairStyle || f.id || 'short');

  ctx.save();
  ctx.translate(pose.headOffset.x, pose.headOffset.y);

  // NECK with trapezius shadow
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-8, 4);
  ctx.lineTo(-10, 14);
  ctx.lineTo(10, 14);
  ctx.lineTo(8, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shadow;
  ctx.fillRect(-10, 12, 20, 3);

  // HEAD — oval with more realistic proportions
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 22 * ht, 0, 0, Math.PI * 2);
  ctx.fill();

  // JAW shading — darker along bottom sides
  ctx.fillStyle = withAlpha(shadow, 0.5);
  ctx.beginPath();
  ctx.moveTo(-17, 2);
  ctx.quadraticCurveTo(-12, 16, 0, 18);
  ctx.quadraticCurveTo(12, 16, 17, 2);
  ctx.lineTo(14, 10);
  ctx.quadraticCurveTo(0, 14, -14, 10);
  ctx.closePath();
  ctx.fill();

  // CHEEKBONE highlight
  ctx.fillStyle = withAlpha(hilite, 0.4);
  ctx.beginPath();
  ctx.ellipse(-10, 2, 4, 2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(10, 2, 4, 2, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // BROW RIDGE
  ctx.fillStyle = withAlpha(deep, 0.35);
  ctx.fillRect(-11, -6, 22, 2);

  // EYEBROWS (darker, thick)
  ctx.fillStyle = hairShadow;
  ctx.fillRect(-11, -6, 7, 2);
  ctx.fillRect(4, -6, 7, 2);

  // EYES — whites + iris + pupil
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(6, -2, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-7, -2, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a4a6a';
  ctx.beginPath(); ctx.arc(6, -2, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-7, -2, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath(); ctx.arc(6, -2, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-7, -2, 1, 0, Math.PI * 2); ctx.fill();

  // NOSE — small triangle with shading
  ctx.fillStyle = withAlpha(shadow, 0.45);
  ctx.beginPath();
  ctx.moveTo(-2, -4);
  ctx.lineTo(-3, 4);
  ctx.lineTo(3, 4);
  ctx.lineTo(2, -4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withAlpha(deep, 0.4);
  ctx.fillRect(-3, 3, 2, 1);
  ctx.fillRect(1, 3, 2, 1);

  // HAIR — per style
  ctx.fillStyle = hair;
  if (hairStyle === 'bald' || hairStyle === 'buzz' || f.id === 'boris') {
    // Buzz/bald cut: just a faint cap
    ctx.beginPath();
    ctx.ellipse(0, -10, 17, 9, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = withAlpha(hairShadow, 0.7);
    ctx.beginPath();
    ctx.ellipse(0, -8, 17, 4, 0, Math.PI, 0);
    ctx.fill();
  } else if (hairStyle === 'mohawk' || f.id === 'jin' || f.id === 'amir') {
    // Short mohawk / short top
    ctx.beginPath();
    ctx.ellipse(0, -12, 17, 10, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = hairHilite;
    ctx.fillRect(-2, -20, 4, 10);
  } else if (hairStyle === 'long' || f.id === 'diana' || f.id === 'rafa') {
    // Long hair — extends down sides
    ctx.beginPath();
    ctx.ellipse(0, -10, 19, 13, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-19, -10, 6, 22);
    ctx.fillRect(13, -10, 6, 22);
    // ponytail on the back side
    ctx.beginPath();
    ctx.ellipse(-16, 2, 4, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Default — short swept
    ctx.beginPath();
    ctx.ellipse(0, -10, 18, 12, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-18, -12, 5, 10);
    ctx.fillRect(13, -12, 5, 10);
    // hair highlight
    ctx.fillStyle = hairHilite;
    ctx.beginPath();
    ctx.ellipse(-4, -18, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // EAR hint (front side only)
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(17, 2, 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // MOUTH
  ctx.fillStyle = '#4a1a18';
  if (f.state === 'attack') {
    ctx.beginPath(); ctx.ellipse(1, 9, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  } else if (f.state === 'hit' || f.state === 'down') {
    ctx.beginPath(); ctx.ellipse(1, 9, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillRect(-3, 9, 8, 1.5);
  }
  // Mouthguard accent (visible when mouth open)
  if (f.state === 'attack' || f.state === 'hit') {
    ctx.fillStyle = p.accent || '#ffd34a';
    ctx.fillRect(-3, 10, 8, 1.5);
  }
  // Lower lip
  ctx.fillStyle = withAlpha(shadow, 0.4);
  ctx.fillRect(-4, 11, 10, 1);

  // Sweat / shine on forehead
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.ellipse(-3, -8, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// === Intro ceremony rendering =====================================

// Override the fighter pose during the pre-fight ceremony so they act like
// fighters waiting at their corner instead of neutral stance:
//   - during their own "corner" phase: arms raised high, pelvis/torso lifted
//   - during the other phases: relaxed stance with small bobbing motion
function applyIntroPose(pose, f, match, t) {
  const phase = match.introPhase;
  const myTurn = (phase === 'blue_corner' && f.side === 'p1') ||
                 (phase === 'red_corner' && f.side === 'p2');
  // Relaxed breathing baseline for everyone during intro.
  const breath = Math.sin(t * 0.12) * 3;
  pose.pelvis.y -= breath * 0.4;
  pose.headOffset.y -= breath * 0.3;

  if (myTurn) {
    // Arms raised in a victory / "here I am" pose.
    const k = Math.min(1, match.introPhaseTime / 24);
    pose.armBack.shoulderY = -148;
    pose.armBack.elbowX  = -10 - 6 * k;
    pose.armBack.elbowY  = -168 - 14 * k;
    pose.armBack.handX   = -22 - 14 * k;
    pose.armBack.handY   = -198 - 24 * k;

    pose.armFront.shoulderY = -150;
    pose.armFront.elbowX  = 10 + 6 * k;
    pose.armFront.elbowY  = -170 - 14 * k;
    pose.armFront.handX   = 22 + 14 * k;
    pose.armFront.handY   = -200 - 24 * k;

    pose.headOffset.y = -154 - 4 * k;
    pose.torsoAngle = 0;
  } else if (phase === 'ref_call' || phase === 'ref_walk_in' || phase === 'ref_walk_out') {
    // Light bob + hands up slightly in anticipation.
    pose.armBack.handY = -150;
    pose.armFront.handY = -150;
    pose.armFront.handX = 26;
  }
  return pose;
}

// Add natural bend to limbs so they look connected with joints rather than
// straight sticks — offsets the elbow/knee slightly toward the "outside" of
// the line between the shoulder/hip and the hand/foot, creating a smooth arc.
function smoothJoints(pose, f, t) {
  // Arm elbow offsets (forearm slight downward curve when hand is extended).
  bendLimb(pose.armBack, /*outward=*/-4);
  bendLimb(pose.armFront, /*outward=*/4);

  // Leg knee offsets (outward curve for natural bend).
  bendLeg(pose.legL, -3);
  bendLeg(pose.legR, 3);

  // Gentle torso lean synced with walk cycle.
  if (f.state === 'walk') {
    pose.torsoAngle += Math.sin(t * 0.3) * 0.035;
  }
}
function bendLimb(limb, outward) {
  const mx = (limb.shoulderX + limb.handX) / 2;
  const my = (limb.shoulderY + limb.handY) / 2;
  // Direction perpendicular to shoulder-hand line (rough).
  const dx = limb.handX - limb.shoulderX;
  const dy = limb.handY - limb.shoulderY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  // Pull elbow a fraction of the way toward the "bent" midpoint.
  const bendAmt = 0.25;
  limb.elbowX = limb.elbowX * (1 - bendAmt) + (mx + nx * outward) * bendAmt;
  limb.elbowY = limb.elbowY * (1 - bendAmt) + (my + ny * outward) * bendAmt;
}
function bendLeg(leg, outward) {
  const mx = (leg.hipX + leg.footX) / 2;
  const my = (leg.hipY + leg.footY) / 2;
  const dx = leg.footX - leg.hipX;
  const dy = leg.footY - leg.hipY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const bendAmt = 0.22;
  leg.kneeX = leg.kneeX * (1 - bendAmt) + (mx + nx * outward) * bendAmt;
  leg.kneeY = leg.kneeY * (1 - bendAmt) + (my + ny * outward) * bendAmt;
}

// === Referee ======================================================

// Simple, striped-shirt referee drawn with the same skeletal rig so joints
// animate naturally during walk & arm-raise.
function drawReferee(ctx, ref) {
  const t = ref.animTime;
  ctx.save();
  ctx.translate(ref.x, ref.y);
  ctx.scale(ref.facing, 1);

  // Shadow
  ctx.save();
  ctx.scale(1 / ref.facing, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 42, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Walk cycle phase (legs + arms swing)
  const walking = ref.state === 'walking' || ref.state === 'walking_out';
  const phase = walking ? Math.sin(t * 0.28) : 0;
  const lift = walking ? Math.max(0, Math.sin(t * 0.28)) * 10 : 0;
  const lift2 = walking ? Math.max(0, -Math.sin(t * 0.28)) * 10 : 0;

  // Legs
  const hipY = -78;
  const legL = {
    hipX: -10, hipY, kneeX: -12 + phase * 6, kneeY: -42,
    footX: -16 + phase * 18, footY: -lift,
  };
  const legR = {
    hipX: 10, hipY, kneeX: 12 - phase * 6, kneeY: -42,
    footX: 14 - phase * 18, footY: -lift2,
  };
  bendLeg(legL, -3);
  bendLeg(legR, 3);
  drawRefLeg(ctx, legL);
  drawRefLeg(ctx, legR);

  // Pants (black)
  ctx.fillStyle = '#111';
  ctx.fillRect(-22, -84, 44, 36);

  // Torso: black-and-white striped shirt
  ctx.save();
  // shirt base
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-28, -84);
  ctx.lineTo(-32, -140);
  ctx.lineTo(-22, -156);
  ctx.lineTo(22, -156);
  ctx.lineTo(32, -140);
  ctx.lineTo(28, -84);
  ctx.closePath();
  ctx.fill();
  // stripes
  ctx.fillStyle = '#111';
  for (let i = 0; i < 5; i++) {
    const y = -150 + i * 15;
    ctx.fillRect(-32, y, 64, 7);
  }
  // collar
  ctx.fillStyle = '#111';
  ctx.fillRect(-10, -156, 20, 4);
  ctx.restore();

  // Arms
  const raise = ref.armRaised || 0;
  // Left (back) arm — if raised, goes straight up high.
  const armL = {
    shoulderX: -22, shoulderY: -148,
    elbowX: -24 - raise * 8, elbowY: -170 - raise * 30,
    handX: -20 - raise * 4,  handY: -190 - raise * 60,
  };
  // Right (front) arm — swings with walk cycle, raises during call.
  const armR = {
    shoulderX: 22, shoulderY: -150,
    elbowX: 24 + raise * 8 + phase * 6,
    elbowY: -170 - raise * 30,
    handX: 20 + raise * 4 + phase * 16,
    handY: -190 - raise * 60,
  };
  if (!walking && !raise) {
    // Hands relaxed near pockets.
    armL.elbowX = -22; armL.elbowY = -122; armL.handX = -20; armL.handY = -96;
    armR.elbowX = 22;  armR.elbowY = -122; armR.handX = 20;  armR.handY = -96;
  }
  bendLimb(armL, -3);
  bendLimb(armR, 3);
  drawRefArm(ctx, armL);
  drawRefArm(ctx, armR);

  // Head
  ctx.save();
  ctx.translate(-1, -166);
  ctx.fillStyle = '#d8a17a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  // Hair (short dark)
  ctx.fillStyle = '#2a1a12';
  ctx.beginPath();
  ctx.ellipse(0, -10, 16, 8, 0, Math.PI, 0);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(3, -2, 5, 4);
  ctx.fillRect(-8, -2, 4, 4);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(5, -1, 2, 2);
  ctx.fillRect(-6, -1, 2, 2);
  // Mouth (speaking shape when calling)
  ctx.fillStyle = '#5a2820';
  if (ref.state === 'calling') {
    const open = (Math.sin(t * 0.45) + 1) * 2;
    ctx.fillRect(-3, 8, 7, 2 + open);
  } else {
    ctx.fillRect(-3, 10, 6, 2);
  }
  ctx.restore();

  ctx.restore();
}
function drawRefLeg(ctx, leg) {
  ctx.save();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(leg.hipX, leg.hipY);
  ctx.lineTo(leg.kneeX, leg.kneeY);
  ctx.stroke();
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(leg.kneeX, leg.kneeY);
  ctx.lineTo(leg.footX, leg.footY);
  ctx.stroke();
  // shoe
  ctx.fillStyle = '#fafafa';
  ctx.beginPath();
  ctx.ellipse(leg.footX + 4, leg.footY - 4, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function drawRefArm(ctx, arm) {
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(arm.shoulderX, arm.shoulderY);
  ctx.lineTo(arm.elbowX, arm.elbowY);
  ctx.stroke();
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(arm.elbowX, arm.elbowY);
  ctx.lineTo(arm.handX, arm.handY);
  ctx.stroke();
  // hand (skin)
  ctx.fillStyle = '#d8a17a';
  ctx.beginPath();
  ctx.arc(arm.handX, arm.handY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Intro spotlights: a sweeping beam during pan, corner lights for blue/red.
function drawIntroSpotlights(ctx, match) {
  const p = match.introPhase;
  if (p === 'pan') {
    const k = match.introPhaseTime / match.introPhaseDuration;
    const sweepX = ARENA.width * (0.1 + k * 0.8);
    const grad = ctx.createRadialGradient(sweepX, 100, 20, sweepX, ARENA.groundY, 520);
    grad.addColorStop(0, 'rgba(255,245,200,0.45)');
    grad.addColorStop(1, 'rgba(255,245,200,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  } else if (p === 'blue_corner') {
    spotlightOn(ctx, match.p1.x, '#3366ff');
  } else if (p === 'red_corner') {
    spotlightOn(ctx, match.p2.x, '#ff3344');
  } else if (p === 'ref_call') {
    spotlightOn(ctx, ARENA.width / 2, '#ffcc33');
  }
}
function spotlightOn(ctx, x, color) {
  const grad = ctx.createRadialGradient(x, 120, 30, x, ARENA.groundY, 420);
  grad.addColorStop(0, withAlpha(color, 0.55));
  grad.addColorStop(0.6, withAlpha(color, 0.12));
  grad.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
}

// Big announce banner overlaid in screen space.
function drawIntroBanner(ctx, match) {
  if (!match.introBanner) return;
  const b = match.introBanner;
  const age = match.tick - b.since;
  const fadeIn = 18, hold = b.hold || 60, fadeOut = 24;
  let alpha = 1;
  if (age < fadeIn) alpha = age / fadeIn;
  else if (age < fadeIn + hold) alpha = 1;
  else if (age < fadeIn + hold + fadeOut) alpha = 1 - (age - fadeIn - hold) / fadeOut;
  else return;
  alpha = Math.max(0, Math.min(1, alpha));

  ctx.save();
  const y = ARENA.height * 0.32;
  ctx.textAlign = 'center';
  ctx.font = `bold ${b.size || 64}px Impact, sans-serif`;
  // Shadow box
  ctx.fillStyle = `rgba(0,0,0,${0.55 * alpha})`;
  ctx.fillRect(0, y - 50, ARENA.width, 80);
  // Gold stroke
  ctx.lineWidth = 4;
  ctx.strokeStyle = `rgba(255,204,51,${alpha})`;
  ctx.strokeText(b.text, ARENA.width / 2, y + 8);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.fillText(b.text, ARENA.width / 2, y + 8);
  ctx.restore();
}

// === Portrait ======================================================

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
  drawArm(ctx, pose.armBack, p, bd, true);
  drawTorso(ctx, pose, p, bd, ht, fighter);
  drawHead(ctx, pose, p, ht, fs);
  drawArm(ctx, pose.armFront, p, bd, false);
  ctx.restore();
}
