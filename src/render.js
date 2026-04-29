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
    this.impactRings = [];
  }

  // Expanding impact ring spawned at strike connect. Gives a visible burst
  // that sells the force of the punch. Ring size/thickness scale with damage.
  spawnImpactRing(x, y, dmg) {
    // Defensive cap so a long, frantic match can't accumulate effect arrays
    // beyond what we'd ever want on screen at once. Older entries are dropped
    // first (FIFO) so the freshest hits remain.
    if (this.impactRings.length > 80) this.impactRings.splice(0, this.impactRings.length - 80);
    const size = dmg >= 16 ? 'heavy' : dmg >= 10 ? 'medium' : 'light';
    this.impactRings.push({
      x, y,
      r0: size === 'heavy' ? 16 : size === 'medium' ? 12 : 8,
      rMax: size === 'heavy' ? 96 : size === 'medium' ? 68 : 46,
      life: size === 'heavy' ? 22 : 16,
      maxLife: size === 'heavy' ? 22 : 16,
      color: size === 'heavy' ? '#ff3040' : '#ffcc44',
      stroke: size === 'heavy' ? 5 : 3,
    });
    // Secondary inner ring for heavier hits.
    if (size !== 'light') {
      this.impactRings.push({
        x, y, r0: 4, rMax: size === 'heavy' ? 50 : 34,
        life: 10, maxLife: 10, color: '#ffffff', stroke: 2,
      });
    }
  }

  spawnParticles(x, y, n, palette = ['#ffcc33', '#ff5566', '#fff'], opts = {}) {
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
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
    if (this.popups.length > 40) this.popups.splice(0, this.popups.length - 40);
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

    // pelvis / FIGHT SHORTS — slightly darker shade of the fighter's body
    // color so the shorts read as clothing without looking like a black hole
    // against the now-vibrant body. Glove-color waistband stripe identifies
    // the fighter.
    ctx.save();
    ctx.translate(pose.pelvis.x, pose.pelvis.y);
    const accent = p.accent || '#ffd34a';
    const shortsCol = shadeColor(p.body || p.skin || '#222', -0.55);

    // shorts silhouette
    ctx.fillStyle = shortsCol;
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

    // signature-color waistband (the fighter's unique color)
    ctx.fillStyle = accent;
    ctx.fillRect(-28 * bd, -8, 56 * bd, 3);

    // thin outline around the shorts so they pop
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-28 * bd, -6);
    ctx.lineTo(-30 * bd, 28);
    ctx.quadraticCurveTo(-26 * bd, 34, -8, 34);
    ctx.lineTo(-6, 28);
    ctx.lineTo(6, 28);
    ctx.lineTo(8, 34);
    ctx.quadraticCurveTo(26 * bd, 34, 30 * bd, 28);
    ctx.lineTo(28 * bd, -6);
    ctx.stroke();

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
    // impact rings (draw first — under particles)
    this.impactRings = this.impactRings.filter((r) => {
      const k = 1 - r.life / r.maxLife;                // 0 -> 1 as it ages
      const radius = r.r0 + (r.rMax - r.r0) * k;
      const a = Math.max(0, r.life / r.maxLife);       // fade out
      ctx.save();
      ctx.lineWidth = r.stroke;
      ctx.strokeStyle = withAlpha(r.color, a);
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      r.life--;
      return r.life > 0;
    });
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
      // Ground / takedown: draw the bottom fighter first (beneath), then top overlay.
      // The bottom fighter is laid out HORIZONTALLY (head far one side, hips at
      // centre, feet on the other side) so the top fighter's kneeling pose
      // doesn't visually merge with the bottom's torso. This matches UFC 5's
      // ground camera where the prone fighter is clearly visible around the
      // mounted fighter.
      const bottomF = match.grapple.bottom;
      const topF = match.grapple.top;
      const pos = match.grapple.position;
      if (bottomF) {
        ctx.save();
        const isFinalGround = bottomF.state === 'ground_bottom' || bottomF.state === 'sub_defense' || bottomF.state === 'down';
        if (isFinalGround) {
          // Slide the bottom fighter horizontally so their torso extends out
          // from under the top fighter. Direction depends on which side the
          // top is facing — head pokes out the BACK side of the top so we see
          // the top's chest, and the bottom's head clearly.
          const topFacing = topF ? topF.facing : 1;
          // For mount/back: laterally offset so torso/head sticks out the back.
          // For guard: minimal offset (top is between bottom's legs, both faces visible).
          // For side_control: medium offset (top is perpendicular).
          const lateral = pos === 'guard' ? 0
                          // half_guard: bottom is on side / partial back, only
                          // a small offset so torso reads as wrapping the
                          // top's leg rather than fully laid out.
                          : pos === 'half_guard' ? -10 * topFacing
                          : pos === 'side_control' ? -34 * topFacing
                          // front_headlock: bottom is bent over but UPRIGHT;
                          // no lateral offset (poses already handle layout).
                          : pos === 'front_headlock' ? 0
                          : -42 * topFacing;
          ctx.translate(lateral, 0);
        }
        this.drawFighter(ctx, bottomF, match);
        ctx.restore();
      }
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
    // Hidden whenever fighters are grappling so he doesn't overlap the clinch/mount poses.
    if (match.state === 'intro' && !match.grapple && match.ref && match.ref.x < ARENA.width + 100) {
      drawReferee(ctx, match.ref);
    }
    this.drawEffects(ctx);
    if (match.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${match.flash * 0.07})`;
      ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    }
    // Near-finish red screen pulse: when an active submission's FINISH gauge
    // crosses 85%, paint a pulsing red vignette over the whole scene to
    // signal "tap or sleep" to the defender. Pulse rate accelerates as the
    // gauge approaches 100. UFC 5 reference: identical to the red iris shrink
    // when a fighter is about to go out.
    if (match.grapple && match.grapple.submission) {
      const sp = (match.grapple.submission.progress || 0) / 100;
      if (sp >= 0.85) {
        const k = (sp - 0.85) / 0.15;             // 0 at 85%, 1 at 100%
        const rate = 0.20 + k * 0.35;             // pulse faster near finish
        const wave = (Math.sin((match.tick || 0) * rate) + 1) * 0.5;
        const alpha = 0.10 + k * 0.18 + wave * (0.06 + k * 0.10);
        ctx.fillStyle = `rgba(180,18,18,${alpha})`;
        ctx.fillRect(0, 0, ARENA.width, ARENA.height);
      }
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
      // Arms reach across the new wider 42px gap.
      ctx.beginPath();
      ctx.moveTo(g.a.x + 38 * g.a.facing, ay);
      ctx.quadraticCurveTo(midX, ay - 22, g.b.x + 38 * g.b.facing, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(g.a.x + 38 * g.a.facing, ay + 14);
      ctx.quadraticCurveTo(midX, ay + 6, g.b.x + 38 * g.b.facing, by + 14);
      ctx.stroke();
    }
    // Ground submission lock visual
    if (g.submission && g.top && g.bottom) {
      const s = g.submission;
      const cx = g.centerX;
      const cy = ARENA.groundY - 60;
      // Tightening ring: shrinks and reddens as progress climbs.
      const prog = Math.max(0, Math.min(1, (s.progress || 0) / 100));
      const radius = 42 - prog * 14;                      // cinches inward
      const ringAlpha = 0.55 + prog * 0.4;
      const t = match.tick || 0;
      ctx.strokeStyle = prog > 0.85
        ? `rgba(255,${60 - prog * 40},${60 - prog * 40},${ringAlpha})`
        : `rgba(240,60,60,${ringAlpha})`;
      ctx.lineWidth = 5 + prog * 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Wrap-arms overlay: draws taut tendons connecting attacker's hands to
      // the defender's controlled limb / neck. Tighter (closer + thicker) the
      // higher the FINISH progress, giving the visceral "cinching" feel.
      const att = s.attacker;
      const def = s.defender;
      if (att && def) {
        const ax = att.x;
        const ay = att.y - 70;
        const dx = def.x;
        const dy = def.y - 80;
        const wave = Math.sin(t * 0.3) * (1 - prog) * 4;
        ctx.strokeStyle = `rgba(20,20,20,${0.55 + prog * 0.30})`;
        ctx.lineWidth = 6 + prog * 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo((ax + dx) / 2, (ay + dy) / 2 - 22 - prog * 6 + wave, dx, dy);
        ctx.stroke();
        // Second strand (figure-four / second hand). On RNC / front-headlock chokes
        // both arms come together into one cinching bundle.
        ctx.lineWidth = 4 + prog * 3;
        ctx.beginPath();
        ctx.moveTo(ax, ay + 10);
        ctx.quadraticCurveTo((ax + dx) / 2, (ay + dy) / 2 - 6 + wave * 0.5, dx, dy + 8);
        ctx.stroke();
        // Tension micro-shake at high progress — overlay shivers rapidly.
        if (prog > 0.7) {
          const sh = (prog - 0.7) * 6;
          ctx.strokeStyle = `rgba(255,80,80,${0.20 + (prog - 0.7) * 1.0})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ax + (Math.random() - 0.5) * sh, ay + (Math.random() - 0.5) * sh);
          ctx.quadraticCurveTo((ax + dx) / 2, (ay + dy) / 2 - 18, dx + (Math.random() - 0.5) * sh, dy + (Math.random() - 0.5) * sh);
          ctx.stroke();
        }
      }
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
  // Scramble gauge — only useful while a submission isn't running.
  // Shows the bottom fighter's progress toward escaping the position.
  if (!g.submission && typeof g.scramble === 'number') {
    const bw = 220, bh = 8;
    const bx = x - bw / 2, by = 142;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = '#0a0e22';
    ctx.fillRect(bx, by, bw, bh);
    const frac = Math.max(0, Math.min(1, g.scramble / 100));
    // Gradient from blue (low) → amber (high) so the player can read the
    // urgency of the bottom's mash at a glance.
    ctx.fillStyle = frac > 0.7 ? '#ffaa44' : frac > 0.4 ? '#ddcc44' : '#44aaff';
    ctx.fillRect(bx, by, bw * frac, bh);
    ctx.fillStyle = '#cce0ff';
    ctx.font = 'bold 10px system-ui';
    ctx.fillText('SCRAMBLE', x, by - 4);
  }
  if (g.submission) {
    const s = g.submission;
    // ----- UFC 5-style two-gauge readout -----
    // Top bar: attacker's FINISH gauge (red, fills toward tap-out).
    // Bottom bar: defender's ESCAPE gauge (blue, fills as they tap out).
    const bw = 280, bh = 14;
    const bx = x - bw / 2, by = 142;
    // Backing plate
    ctx.fillStyle = 'rgba(20,0,0,0.85)';
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = '#2a0a0a';
    ctx.fillRect(bx, by, bw, bh);
    // FINISH fill, with subtle gradient + pulse near 100
    const finishFrac = Math.min(1, (s.progress || 0) / 100);
    const pulse = finishFrac > 0.85 ? 0.6 + Math.abs(Math.sin(((match.tick || 0) * 0.3))) * 0.4 : 1;
    ctx.fillStyle = finishFrac > 0.85 ? `rgba(255,68,68,${pulse})` : '#ff3344';
    ctx.fillRect(bx, by, bw * finishFrac, bh);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui';
    ctx.fillText(s.kind.toUpperCase().replace(/_/g, ' '), x, by - 4);
    // ESCAPE bar
    const epct = Math.min(1, (s.escape || 0) / 100);
    ctx.fillStyle = '#0a0e22';
    ctx.fillRect(bx, by + bh + 4, bw, 8);
    ctx.fillStyle = '#44aaff';
    ctx.fillRect(bx, by + bh + 4, bw * epct, 8);
    ctx.fillStyle = '#88ccff';
    ctx.font = 'bold 10px system-ui';
    ctx.fillText('TAP TO ESCAPE', x, by + bh + 22);
    // Attacker stamina sliver \u2014 if it empties, the sub auto-releases.
    const sa = s.attacker;
    const staminaFrac = sa && sa.maxStamina > 0 ? sa.stamina / sa.maxStamina : 0;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(bx, by + bh + 18, bw, 4);
    ctx.fillStyle = staminaFrac < 0.2 ? '#ff8844' : '#ffcc66';
    ctx.fillRect(bx, by + bh + 18, bw * staminaFrac, 4);
    ctx.fillStyle = '#aaa';
    ctx.font = '9px system-ui';
    ctx.fillText('ATTACKER GAS', x, by + bh + 32);
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
  // Defaults: relaxed stickman standing pose — arms hang free at the sides
  // with a slight bend (NOT permanently glued to the head). The arms only
  // raise into a guard during 'block' or during the chamber/recovery of an
  // attack. This gives the figure a natural, body-free silhouette.
  const pose = {
    pelvis: { x: 0, y: -82 },
    torsoAngle: 0,
    headOffset: { x: -2, y: -152 * ht },
    legL: { hipX: -12 * bd, hipY: -78, kneeX: -16 * bd, kneeY: -42, footX: -22 * bd, footY: 0 }, // back leg
    legR: { hipX: 12 * bd,  hipY: -78, kneeX: 20 * bd,  kneeY: -42, footX: 28 * bd,  footY: 0 }, // lead leg (wider stance)
    armBack: {
      shoulderX: -shoulderEdgeX, shoulderY: shoulderWorldY,
      elbowX: -22 * bd, elbowY: -114,
      handX: -16 * bd, handY: -76,
    },
    armFront: {
      shoulderX: shoulderEdgeX, shoulderY: shoulderWorldY,
      elbowX: 22 * bd, elbowY: -114,
      handX: 16 * bd, handY: -76,
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
    // Realistic gait: counter-rotated hips & shoulders, heel-to-toe foot lift,
    // pronounced arm swing in counter-phase to the legs, head bob with stride.
    const dir = typeof f.movingDirection === 'number' ? f.movingDirection : 1;
    const retreat = dir < 0;
    const strideFreq = 0.34 * cadence * (retreat ? 0.7 : 1.0);
    const strideMag = retreat ? 0.6 : 1.0;
    const stride = Math.sin(t * strideFreq) * strideMag;          // -1..1
    const strideAbs = Math.abs(stride);
    const liftR = Math.max(0, stride);   // R leg lifts on positive phase
    const liftL = Math.max(0, -stride);  // L leg lifts on negative phase

    // FEET — lifted leg pulls forward + up, planted leg pushes back + grips ground.
    // The foot rolls heel-to-toe so on lift the foot tilts forward (footY goes up).
    pose.legR.footX = 24 * bd + stride * (retreat ? 10 : 22);
    pose.legR.footY = -liftR * 22 * bobAmp;
    pose.legR.kneeX = 16 * bd + stride * 10;
    pose.legR.kneeY = -42 - liftR * 22 * bobAmp;
    pose.legL.footX = -20 * bd + stride * (retreat ? 10 : 22);
    pose.legL.footY = -liftL * 22 * bobAmp;
    pose.legL.kneeX = -14 * bd + stride * 10;
    pose.legL.kneeY = -42 - liftL * 22 * bobAmp;
    // Hips raise on each plant, dip mid-step — classic walking sine
    pose.pelvis.y = -82 + strideAbs * 4 * bobAmp - 3;
    pose.pelvis.x = stride * (retreat ? 1 : 3);

    // TORSO COUNTER-ROTATION — shoulders rotate OPPOSITE to hips for proper gait.
    // (When R foot is forward, R hip is forward, but R shoulder is BACK.)
    const lean = (1 - bobAmp) * 0.10 + (retreat ? -0.04 : 0.03);
    pose.torsoAngle = -stride * 0.12 + lean;

    // ARMS — natural pendulum swing at hip level (NOT raised guard).
    // Hand swings forward when same-side leg is back, in counter-phase.
    if (retreat) {
      // Backpedaling: hands stay slightly raised but still relaxed, small swing.
      pose.armFront.handX = 16 * bd - stride * 8; pose.armFront.handY = -90;
      pose.armFront.elbowX = 20 * bd;            pose.armFront.elbowY = -118;
      pose.armBack.handX = -12 * bd + stride * 8;  pose.armBack.handY = -90;
      pose.armBack.elbowX = -18 * bd;             pose.armBack.elbowY = -118;
    } else {
      // Forward walk: pronounced opposite-arm pendulum swing at hip level
      // — like a real walk, NOT a held-up boxing guard.
      // Front arm = lead-side; swings BACKWARD when lead leg moves forward.
      pose.armFront.handX = 16 * bd - stride * 30;
      pose.armFront.handY = -76 + strideAbs * 6;
      pose.armFront.elbowX = 22 * bd - stride * 16;
      pose.armFront.elbowY = -114 + strideAbs * 2;
      // Back arm = rear-side; swings FORWARD when lead leg moves forward.
      pose.armBack.handX = -16 * bd + stride * 30;
      pose.armBack.handY = -76 + strideAbs * 6;
      pose.armBack.elbowX = -22 * bd + stride * 16;
      pose.armBack.elbowY = -114 + strideAbs * 2;
    }

    // HEAD — bobs vertically with stride, sways laterally with shoulder rotation
    pose.headOffset.x = -2 + stride * 3;
    pose.headOffset.y = -152 * ht + strideAbs * 3 * bobAmp - 2;
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
  if (f.state === 'wobble') {
    // Drunken stagger: hands DROP, body sways side-to-side, head lolls,
    // weight shifts unevenly between feet — a clear visual that this fighter
    // is one clean shot from going out.
    const k = Math.max(0, Math.min(1, f.wobbleFrames / 50));   // 1 fresh, 0 recovering
    const sway   = Math.sin(t * 0.16) * 12 * k;
    const sway2  = Math.cos(t * 0.11) * 6  * k;
    const headLoll = Math.sin(t * 0.21 + 1.2) * 8 * k;
    pose.pelvis.x = sway;
    pose.pelvis.y = -82 + 4 * k;
    pose.torsoAngle = (sway / 32) * (0.9 + 0.4 * Math.sin(t * 0.18));
    pose.headOffset.x = -2 + sway + headLoll * 0.6;
    pose.headOffset.y = -148 + 4 * k + Math.abs(headLoll) * 0.5;
    // Hands hang LOW — defense is gone.
    pose.armFront.shoulderX = 12 + sway2 * 0.3;
    pose.armFront.elbowX = 18 - sway2 * 0.3;  pose.armFront.elbowY = -110 + 6 * k;
    pose.armFront.handX = 22 - sway2 * 0.4;   pose.armFront.handY = -84 + 12 * k;
    pose.armBack.shoulderX = -10 + sway2 * 0.3;
    pose.armBack.elbowX = -16 + sway2 * 0.3;  pose.armBack.elbowY = -106 + 6 * k;
    pose.armBack.handX = -22 + sway2 * 0.4;   pose.armBack.handY = -82 + 12 * k;
    // Feet stagger: front foot lifts irregularly so the fighter looks unbalanced.
    pose.legR.footX = 22 * bd + sway * 0.2;
    pose.legR.footY = -Math.max(0, sway * 0.3);
    pose.legL.footX = -22 * bd - sway * 0.2;
  }
  if (f.state === 'hit') {
    // Dramatic UFC-style hit reaction: head whips AWAY from impact,
    // shoulders rock, weight loads onto the back leg, arms briefly drop
    // (defense breaks) then come back to guard. Heavier strikes (more
    // remaining stunFrames) produce stronger whip/recoil.
    const k = Math.max(0, Math.min(1, f.stunFrames / 14));   // 1 at impact -> 0 at recovery
    const dir = f.hitReactDir || 1;
    const localDir = dir * (f.facing || 1);                  // +1 = strike from front
    const whip = k * 18;                                     // bigger head whip
    // Head whips back AND down on impact, then rises.
    pose.headOffset.x = -2 - localDir * whip;
    pose.headOffset.y = -150 + 10 * k;
    // Torso bows away from impact for extra body language.
    pose.torsoAngle = -localDir * 0.34 * k;
    pose.pelvis.x = -localDir * 7 * k;
    pose.pelvis.y = -82 + 4 * k;                              // small dip / stagger
    // Arms drop momentarily (defense compromised) — fronthand drops more
    // for a strike from the front. Hands stay roughly at chest level so
    // they don't reach back up to head.
    pose.armBack.handY  = -90 - 18 * (1 - k); pose.armBack.handX  = -14 - localDir * 6 * k;
    pose.armBack.elbowY = -116 + 4 * k;
    pose.armFront.handY = -88 - 16 * (1 - k); pose.armFront.handX = 18 - localDir * 8 * k;
    pose.armFront.elbowY = -116 + 4 * k;
    // Back leg slides further to absorb. Front leg buckles slightly.
    pose.legL.footX = -22 * bd - localDir * 9 * k;
    pose.legR.kneeY = -42 + 4 * k;
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
  if (f.state === 'takedown_shoot') {
    // Attacker: shoot in low (level change) → drive forward (lift) → slam.
    const phase = f.takedownPhase || 'shoot';
    const totalFrame = f.takedownFrame || 0;
    const total = f.takedownTotal || 38;
    const k = totalFrame / total; // 0..1 across whole takedown
    if (phase === 'shoot') {
      // Level change — pelvis drops hard, head + arms drive forward at hip height.
      const s = totalFrame / 12; // 0..1 within shoot phase
      pose.pelvis.x = 0; pose.pelvis.y = -36 - 16 * (1 - s);
      pose.torsoAngle = 0.55 + 0.15 * s;
      pose.headOffset.x = 26 + 8 * s; pose.headOffset.y = -50 - 6 * s;
      pose.legL.kneeX = -20 * bd; pose.legL.kneeY = -16; pose.legL.footX = -28 * bd; pose.legL.footY = 0;
      pose.legR.kneeX =  18 * bd; pose.legR.kneeY = -28 + 8 * s; pose.legR.footX = 32 * bd + 8 * s; pose.legR.footY = 0;
      pose.armBack.shoulderY = -50; pose.armBack.elbowX = 26; pose.armBack.elbowY = -38; pose.armBack.handX = 44; pose.armBack.handY = -28 - 6 * s;
      pose.armFront.shoulderY = -52; pose.armFront.elbowX = 30; pose.armFront.elbowY = -36; pose.armFront.handX = 50; pose.armFront.handY = -22 - 6 * s;
    } else if (phase === 'drive') {
      // Drive — torso pushing through, arms wrapped around defender's legs/waist.
      const s = (totalFrame - 12) / 14; // 0..1
      pose.pelvis.x = -2 + 4 * s; pose.pelvis.y = -54 - 6 * s;
      pose.torsoAngle = 0.45 - 0.15 * s;
      pose.headOffset.x = 18; pose.headOffset.y = -90 - 18 * s;
      pose.legL.kneeX = -22 * bd; pose.legL.kneeY = -36 - 6 * s; pose.legL.footX = -30 * bd; pose.legL.footY = 0;
      pose.legR.kneeX =  20 * bd; pose.legR.kneeY = -40 - 4 * s; pose.legR.footX =  28 * bd; pose.legR.footY = 0;
      pose.armBack.elbowX = 14;  pose.armBack.elbowY = -100; pose.armBack.handX = 30 + 4 * s; pose.armBack.handY = -94;
      pose.armFront.elbowX = 26; pose.armFront.elbowY = -94; pose.armFront.handX = 36 + 4 * s; pose.armFront.handY = -88;
    } else {
      // Slam — both crashing down, attacker ending kneeling on top.
      const s = (totalFrame - 26) / 12; // 0..1
      pose.pelvis.x = 0; pose.pelvis.y = -54 + 4 * s;
      pose.torsoAngle = 0.10 - 0.15 * s;
      pose.headOffset.x = -2; pose.headOffset.y = -126 - 4 * (1 - s);
      pose.legL.hipX = -10 * bd; pose.legL.hipY = -50; pose.legL.kneeX = -22 * bd; pose.legL.kneeY = -22; pose.legL.footX = -14 * bd; pose.legL.footY = 0;
      pose.legR.hipX =  10 * bd; pose.legR.hipY = -50; pose.legR.kneeX =  22 * bd; pose.legR.kneeY = -22; pose.legR.footX =  14 * bd; pose.legR.footY = 0;
      pose.armBack.shoulderY = -100; pose.armBack.elbowY = -130 + 6 * s; pose.armBack.handY = -150 + 6 * s; pose.armBack.handX = 8;
      pose.armFront.shoulderY = -100; pose.armFront.elbowY = -130 + 6 * s; pose.armFront.handY = -150 + 6 * s; pose.armFront.handX = 22;
    }
    // Mark kRaw used so engine devs see we read frame from f
    void k;
  }
  if (f.state === 'takedown_defend') {
    // Defender: leans back during shoot, lifted during drive, slams to back during slam.
    const phase = f.takedownPhase || 'shoot';
    const totalFrame = f.takedownFrame || 0;
    if (phase === 'shoot') {
      // Hands pushing down on attacker's head, leaning back.
      const s = totalFrame / 12;
      pose.pelvis.x = -2; pose.pelvis.y = -82 + 4 * s;
      pose.torsoAngle = -0.2 - 0.1 * s;
      pose.headOffset.x = -8; pose.headOffset.y = -154;
      pose.legL.footX = -22 * bd; pose.legL.kneeX = -16 * bd; pose.legL.kneeY = -42;
      pose.legR.footX =  24 * bd + 4 * s; pose.legR.kneeX = 18 * bd; pose.legR.kneeY = -42;
      pose.armBack.elbowX = -4; pose.armBack.elbowY = -110; pose.armBack.handX = -8; pose.armBack.handY = -90 - 4 * s;
      pose.armFront.elbowX = 6; pose.armFront.elbowY = -100; pose.armFront.handX = 4; pose.armFront.handY = -82 - 4 * s;
    } else if (phase === 'drive') {
      // Being lifted — feet leave ground, body angled up & back.
      const s = (totalFrame - 12) / 14;
      pose.pelvis.x = 4; pose.pelvis.y = -82 - 24 * s;
      pose.torsoAngle = -0.4 - 0.1 * s;
      pose.headOffset.x = -22; pose.headOffset.y = -136 - 16 * s;
      // Legs trail behind / up
      pose.legL.hipY = -78 - 24 * s; pose.legL.kneeX = -28 * bd; pose.legL.kneeY = -42 - 14 * s; pose.legL.footX = -32 * bd; pose.legL.footY = -12 - 8 * s;
      pose.legR.hipY = -78 - 24 * s; pose.legR.kneeX =  26 * bd; pose.legR.kneeY = -42 - 14 * s; pose.legR.footX =  30 * bd; pose.legR.footY = -8 - 8 * s;
      // Arms flail up
      pose.armBack.elbowY = -130 - 8 * s; pose.armBack.handY = -150 - 8 * s; pose.armBack.handX = -16;
      pose.armFront.elbowY = -120 - 8 * s; pose.armFront.handY = -140 - 8 * s; pose.armFront.handX = -8;
    } else {
      // Slam — landed flat on back. Transition into ground_bottom-like shape.
      pose.pelvis.x = 0; pose.pelvis.y = -14;
      pose.torsoAngle = 0;
      pose.headOffset.x = -56; pose.headOffset.y = -18;
      pose.legL.hipX = 6;  pose.legL.hipY = -14; pose.legL.kneeX = 20; pose.legL.kneeY = -50; pose.legL.footX = 46; pose.legL.footY = -56;
      pose.legR.hipX = 6;  pose.legR.hipY = -12; pose.legR.kneeX = 22; pose.legR.kneeY = -46; pose.legR.footX = 50; pose.legR.footY = -52;
      pose.armBack.shoulderX = -36;  pose.armBack.shoulderY = -24; pose.armBack.elbowX = -28; pose.armBack.elbowY = -38; pose.armBack.handX = -10; pose.armBack.handY = -42;
      pose.armFront.shoulderX = -32; pose.armFront.shoulderY = -30; pose.armFront.elbowX = -18; pose.armFront.elbowY = -44; pose.armFront.handX = 4; pose.armFront.handY = -48;
    }
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
    // Both fighters locked up in MMA clinch — wide athletic base, hips and
    // head pushed forward into the opponent, one arm up in collar-tie
    // (gripping back of neck) and the other deep under-hook (around
    // opponent's shoulder). The whole body tilts forward as if leaning
    // bodyweight onto the opponent.
    const pulse = Math.sin(t * 0.18) * 1.5;        // breathing / push-pull
    const sway  = Math.sin(t * 0.08) * 0.8;        // weight shift between feet
    pose.pelvis.x = 4 + sway; pose.pelvis.y = -74 + pulse * 0.4;
    pose.torsoAngle = 0.22;                         // strong forward lean
    // Wide athletic base — feet planted, knees bent for power & balance.
    pose.legL.footX = -28 * bd;        pose.legL.footY = 0;
    pose.legL.kneeX = -20 * bd;        pose.legL.kneeY = -42;
    pose.legL.hipX  = -10 * bd;        pose.legL.hipY  = -76;
    pose.legR.footX =  34 * bd;        pose.legR.footY = 0;
    pose.legR.kneeX =  24 * bd;        pose.legR.kneeY = -42;
    pose.legR.hipX  =  10 * bd;        pose.legR.hipY  = -76;
    // BACK arm = collar-tie. Reaches OVER the opponent's shoulder, grabs the
    // back of the neck. Hand goes far across center line and slightly up.
    pose.armBack.shoulderX = -22 * bd; pose.armBack.shoulderY = -72 * ht - 76;
    pose.armBack.elbowX = 18;          pose.armBack.elbowY = -148 + pulse;
    pose.armBack.handX  = 70 + pulse;  pose.armBack.handY  = -148 + pulse;
    // FRONT arm = under-hook. Reaches UNDER the opponent's armpit, hand
    // wraps behind the back. Hand goes deep across at chest level.
    pose.armFront.shoulderX = 24 * bd; pose.armFront.shoulderY = -72 * ht - 76;
    pose.armFront.elbowX = 28;         pose.armFront.elbowY = -126 + pulse;
    pose.armFront.handX  = 78 - pulse; pose.armFront.handY  = -120 + pulse;
    // Head pushes forward, slightly tilted — chin tucks into opponent's
    // chest/shoulder for the classic Muay-Thai plumb-clinch posture.
    pose.headOffset.x = 14; pose.headOffset.y = -148 * ht;
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
    // Position-aware supine layout. UFC 5 reference:
    //   guard       → legs UP wrapping the top's hips (hooks active)
    //   mount       → flat on back, legs straight, hands defending head
    //   back_mount  → face-DOWN, hands trying to peel the choke
    //   side_control→ flat on back, legs slightly curled toward attacker
    const pos = f.groundPosition || 'mount';
    const breathe = Math.sin(t * 0.12) * 1;
    pose.pelvis.x = 0; pose.pelvis.y = -14 + breathe * 0.3;
    pose.torsoAngle = 0.0;
    if (pos === 'guard') {
      // Bent legs up in guard (feet behind opponent's hips).
      pose.headOffset.x = -64; pose.headOffset.y = -18;
      pose.legL.hipX = 6;  pose.legL.hipY = -14; pose.legL.kneeX = 22; pose.legL.kneeY = -58; pose.legL.footX = 50; pose.legL.footY = -68;
      pose.legR.hipX = 6;  pose.legR.hipY = -12; pose.legR.kneeX = 24; pose.legR.kneeY = -54; pose.legR.footX = 54; pose.legR.footY = -64;
      pose.armBack.shoulderX = -42;  pose.armBack.shoulderY = -24;  pose.armBack.elbowX = -32; pose.armBack.elbowY = -40;  pose.armBack.handX = -8;  pose.armBack.handY = -44;
      pose.armFront.shoulderX = -38; pose.armFront.shoulderY = -30; pose.armFront.elbowX = -22; pose.armFront.elbowY = -46; pose.armFront.handX = 4;   pose.armFront.handY = -50;
    } else if (pos === 'back_mount') {
      // Face-down, defending the choke. Head far to one side, body straight.
      pose.pelvis.y = -8;
      pose.headOffset.x = -78; pose.headOffset.y = -10;
      // Legs straight back along the mat.
      pose.legL.hipX = 8;  pose.legL.hipY = -10; pose.legL.kneeX = 38; pose.legL.kneeY = -8; pose.legL.footX = 70; pose.legL.footY = -6;
      pose.legR.hipX = 8;  pose.legR.hipY = -8;  pose.legR.kneeX = 40; pose.legR.kneeY = -6; pose.legR.footX = 72; pose.legR.footY = -4;
      // Hands clawing at the arm around the neck.
      pose.armBack.shoulderX = -50;  pose.armBack.shoulderY = -16;  pose.armBack.elbowX = -64; pose.armBack.elbowY = -22;  pose.armBack.handX = -54;  pose.armBack.handY = -34;
      pose.armFront.shoulderX = -46; pose.armFront.shoulderY = -20; pose.armFront.elbowX = -58; pose.armFront.elbowY = -28; pose.armFront.handX = -50;  pose.armFront.handY = -38;
    } else if (pos === 'side_control') {
      // Flat on back, body extended, near-side knee tucked away from attacker.
      pose.headOffset.x = -72; pose.headOffset.y = -16;
      pose.legL.hipX = 6;  pose.legL.hipY = -10; pose.legL.kneeX = 36; pose.legL.kneeY = -22; pose.legL.footX = 68; pose.legL.footY = -8;
      pose.legR.hipX = 6;  pose.legR.hipY = -8;  pose.legR.kneeX = 38; pose.legR.kneeY = -16; pose.legR.footX = 72; pose.legR.footY = -4;
      // Far arm framing the attacker's neck, near arm under-hooked.
      pose.armBack.shoulderX = -44;  pose.armBack.shoulderY = -22;  pose.armBack.elbowX = -36; pose.armBack.elbowY = -36;  pose.armBack.handX = -16;  pose.armBack.handY = -42;
      pose.armFront.shoulderX = -40; pose.armFront.shoulderY = -28; pose.armFront.elbowX = -28; pose.armFront.elbowY = -44; pose.armFront.handX = -8;   pose.armFront.handY = -50;
    } else if (pos === 'half_guard') {
      // HALF GUARD (bottom): on back / side, ONE leg trapping the top's leg.
      // Far leg crossed up & over to control the trapped knee. Hands frame.
      pose.pelvis.y = -16 + breathe * 0.2;
      pose.torsoAngle = 0.08;
      pose.headOffset.x = -68; pose.headOffset.y = -18;
      // Trapped (near) leg: hooked over the top's leg, knee bent, foot tucked.
      pose.legL.hipX = 4;  pose.legL.hipY = -12; pose.legL.kneeX = 24; pose.legL.kneeY = -38; pose.legL.footX = 8; pose.legL.footY = -34;
      // Free (far) leg: posted on the mat for base.
      pose.legR.hipX = 6;  pose.legR.hipY = -10; pose.legR.kneeX = 32; pose.legR.kneeY = -8;  pose.legR.footX = 60; pose.legR.footY = 0;
      // Hands: near hand under-hooks, far hand frames on jaw.
      pose.armBack.shoulderX = -42; pose.armBack.shoulderY = -22; pose.armBack.elbowX = -28; pose.armBack.elbowY = -42; pose.armBack.handX = -8; pose.armBack.handY = -56;
      pose.armFront.shoulderX = -38; pose.armFront.shoulderY = -28; pose.armFront.elbowX = -22; pose.armFront.elbowY = -50; pose.armFront.handX = -2; pose.armFront.handY = -64;
    } else {
      // mount (default): flat on back, legs straight, hands shielding face.
      pose.headOffset.x = -76; pose.headOffset.y = -16;
      // Legs straight — fully extended along the mat away from the mounted fighter.
      pose.legL.hipX = 8;  pose.legL.hipY = -12; pose.legL.kneeX = 36; pose.legL.kneeY = -10; pose.legL.footX = 70; pose.legL.footY = -4;
      pose.legR.hipX = 8;  pose.legR.hipY = -10; pose.legR.kneeX = 38; pose.legR.kneeY = -6;  pose.legR.footX = 72; pose.legR.footY = -2;
      // Hands up shielding face / framing.
      pose.armBack.shoulderX = -46;  pose.armBack.shoulderY = -22;  pose.armBack.elbowX = -34; pose.armBack.elbowY = -36;  pose.armBack.handX = -22;  pose.armBack.handY = -42;
      pose.armFront.shoulderX = -42; pose.armFront.shoulderY = -28; pose.armFront.elbowX = -28; pose.armFront.elbowY = -42; pose.armFront.handX = -16;  pose.armFront.handY = -48;
    }
  }
  if (f.state === 'ground_top') {
    // Position-specific top pose. Each position reads clearly at a glance:
    //   mount         - kneeling astride opponent's torso (knees out wide)
    //   guard         - kneeling UPRIGHT between opponent's legs (postured up)
    //   side_control  - chest on opponent's chest, perpendicular (low, wide)
    //   back_mount    - seated behind with hooks in, arms reaching around
    const pos = f.groundPosition || 'mount';
    const breath = Math.sin(t * 0.18) * 1.6;
    const press  = Math.sin(t * 0.10) * 1;
    if (pos === 'guard') {
      // In opponent's closed guard: kneeling upright, hips back, posture up.
      pose.pelvis.x = 0; pose.pelvis.y = -44 + breath * 0.4;
      pose.torsoAngle = 0.08;                         // posture slightly forward
      // Knees planted on ground, feet tucked under (seiza-like).
      pose.legL.hipX = -10 * bd; pose.legL.hipY = -40; pose.legL.kneeX = -18 * bd; pose.legL.kneeY = -10; pose.legL.footX = -10 * bd; pose.legL.footY = 0;
      pose.legR.hipX =  10 * bd; pose.legR.hipY = -40; pose.legR.kneeX =  18 * bd; pose.legR.kneeY = -10; pose.legR.footX =  10 * bd; pose.legR.footY = 0;
      // Hands posting on opponent's chest/hips for base.
      pose.armBack.shoulderX = -18 * bd;  pose.armBack.shoulderY = -94;
      pose.armBack.elbowX = -8;  pose.armBack.elbowY = -76; pose.armBack.handX = 6;  pose.armBack.handY = -62 + breath;
      pose.armFront.shoulderX = 20 * bd; pose.armFront.shoulderY = -94;
      pose.armFront.elbowX = 14; pose.armFront.elbowY = -76; pose.armFront.handX = 28; pose.armFront.handY = -62 + breath;
      pose.headOffset.x = -2; pose.headOffset.y = -122;
    } else if (pos === 'side_control') {
      // Side control: chest pressed onto opponent, torso PERPENDICULAR to
      // opponent's body. Low and wide — hips sprawled out.
      pose.pelvis.x = press; pose.pelvis.y = -30 + breath * 0.3;
      pose.torsoAngle = 0.42;                         // heavy forward tilt
      // One leg forward (knee up near opponent's hip), other leg sprawled back.
      pose.legL.hipX = -10 * bd; pose.legL.hipY = -26; pose.legL.kneeX = -30 * bd; pose.legL.kneeY = -12; pose.legL.footX = -48 * bd; pose.legL.footY = 0;
      pose.legR.hipX =  12 * bd; pose.legR.hipY = -26; pose.legR.kneeX =  28 * bd; pose.legR.kneeY =  -4; pose.legR.footX =  42 * bd; pose.legR.footY = 0;
      // Arms wrap head + far-side hip (crossface + underhook).
      pose.armBack.shoulderX = -18 * bd;  pose.armBack.shoulderY = -80;
      pose.armBack.elbowX = -2;  pose.armBack.elbowY = -58; pose.armBack.handX = 20;  pose.armBack.handY = -44 + breath;
      pose.armFront.shoulderX = 18 * bd; pose.armFront.shoulderY = -80;
      pose.armFront.elbowX = 28; pose.armFront.elbowY = -56; pose.armFront.handX = 44; pose.armFront.handY = -40 + breath;
      pose.headOffset.x = 18; pose.headOffset.y = -98;
    } else if (pos === 'half_guard') {
      // HALF GUARD (top): low and pressed down, ONE leg captured between the
      // bottom's legs (the trapped leg). Chest heavy on opponent, hips low,
      // hunting to free the trapped knee for a pass to side control / mount.
      pose.pelvis.x = press; pose.pelvis.y = -32 + breath * 0.4;
      pose.torsoAngle = 0.34;                          // chest pressed down
      // Trapped (right) leg: forced low and forward, knee planted near opponent's hip.
      pose.legR.hipX = 12 * bd; pose.legR.hipY = -28; pose.legR.kneeX = 18 * bd; pose.legR.kneeY =  -8; pose.legR.footX = 32 * bd; pose.legR.footY =  0;
      // Free (left) leg: sprawled wide for base.
      pose.legL.hipX = -10 * bd; pose.legL.hipY = -28; pose.legL.kneeX = -28 * bd; pose.legL.kneeY = -10; pose.legL.footX = -46 * bd; pose.legL.footY = 0;
      // Crossface arm + underhook hand framing.
      pose.armBack.shoulderX = -16 * bd; pose.armBack.shoulderY = -82;
      pose.armBack.elbowX = -2;  pose.armBack.elbowY = -64; pose.armBack.handX = 22; pose.armBack.handY = -52 + breath;
      pose.armFront.shoulderX = 16 * bd; pose.armFront.shoulderY = -82;
      pose.armFront.elbowX = 26; pose.armFront.elbowY = -56; pose.armFront.handX = 40; pose.armFront.handY = -42 + breath;
      pose.headOffset.x = 14; pose.headOffset.y = -98;
    } else if (pos === 'back_mount') {
      // Back mount: seated behind with hooks (legs wrapped around opponent's
      // hips from behind). Arms reaching around front to grip.
      pose.pelvis.x = -2; pose.pelvis.y = -46 + breath * 0.4;
      pose.torsoAngle = 0.18;                         // slight forward lean over opponent's back
      // Hooks: legs reach forward/around opponent's hips (from behind).
      pose.legL.hipX = -10 * bd; pose.legL.hipY = -40; pose.legL.kneeX =  6 * bd; pose.legL.kneeY = -20; pose.legL.footX = 22 * bd; pose.legL.footY = -10;
      pose.legR.hipX =  10 * bd; pose.legR.hipY = -40; pose.legR.kneeX = 28 * bd; pose.legR.kneeY = -16; pose.legR.footX = 44 * bd; pose.legR.footY = -6;
      // Arms reach AROUND and forward (hunting the choke).
      pose.armBack.shoulderX = -18 * bd;  pose.armBack.shoulderY = -96;
      pose.armBack.elbowX = 4;  pose.armBack.elbowY = -94; pose.armBack.handX = 28;  pose.armBack.handY = -90 + breath;
      pose.armFront.shoulderX = 20 * bd; pose.armFront.shoulderY = -96;
      pose.armFront.elbowX = 22; pose.armFront.elbowY = -94; pose.armFront.handX = 46; pose.armFront.handY = -90 + breath;
      pose.headOffset.x = 10; pose.headOffset.y = -122;
    } else {
      // FULL MOUNT (default): kneeling astride, knees wide, arms cocked up
      // for ground-and-pound.
      pose.pelvis.x = press; pose.pelvis.y = -50 + breath * 0.5;
      pose.torsoAngle = -0.06;
      pose.legL.hipX = -12 * bd; pose.legL.hipY = -46; pose.legL.kneeX = -28 * bd; pose.legL.kneeY = -18; pose.legL.footX = -16 * bd; pose.legL.footY = 0;
      pose.legR.hipX =  12 * bd; pose.legR.hipY = -46; pose.legR.kneeX =  28 * bd; pose.legR.kneeY = -18; pose.legR.footX =  16 * bd; pose.legR.footY = 0;
      pose.armBack.shoulderX = -22 * bd;  pose.armBack.shoulderY = -100;
      pose.armBack.elbowX = -14;  pose.armBack.elbowY = -134 + breath; pose.armBack.handX = -4;  pose.armBack.handY = -156 + breath;
      pose.armFront.shoulderX = 22 * bd;  pose.armFront.shoulderY = -100;
      pose.armFront.elbowX = 16;  pose.armFront.elbowY = -140 + breath; pose.armFront.handX = 24; pose.armFront.handY = -162 + breath;
      pose.headOffset.x = -2; pose.headOffset.y = -132;
    }
    // Overlay attack animation if mid-GnP strike. Adds chamber-back, then
    // explosive downward arc to opponent's head, and slow recovery.
    if (f.attack) {
      const ca = f.attack;
      const total = ca.startup + ca.active + ca.recovery;
      const af2 = f.attackFrame;
      const cham = af2 < ca.startup ? (af2 / ca.startup) : 1;
      const drop = af2 < ca.startup ? 0
                  : af2 < ca.startup + ca.active ? 1
                  : 1 - (af2 - ca.startup - ca.active) / ca.recovery;
      const easeDrop = drop * drop;          // accelerating downward strike
      void total;
      if (ca.kind === 'ground_punch') {
        // Chamber: arm pulls UP and BACK. Drop: fist arcs DOWN fast onto
        // the opponent's head. Body leans forward into the strike.
        pose.armFront.handX = 24 + cham * 6 + easeDrop * 30;
        pose.armFront.handY = -162 - cham * 16 + easeDrop * 110;
        pose.armFront.elbowX = 16 + cham * 4 + easeDrop * 16;
        pose.armFront.elbowY = -140 - cham * 8 + easeDrop * 60;
        pose.torsoAngle = -0.06 + easeDrop * 0.18;
        pose.pelvis.y = -50 + easeDrop * 6;
      } else if (ca.kind === 'ground_elbow') {
        // Elbow strike: more vertical drop, less arm extension.
        pose.armFront.handX = 14 + easeDrop * 22;
        pose.armFront.handY = -170 - cham * 8 + easeDrop * 130;
        pose.armFront.elbowX = 10 + easeDrop * 18;
        pose.armFront.elbowY = -150 - cham * 6 + easeDrop * 60;
        pose.torsoAngle = -0.06 + easeDrop * 0.24;
        pose.pelvis.y = -50 + easeDrop * 8;
      }
    }
  }
  if (f.state === 'front_headlock_top') {
    // Top of a SNAP-DOWN front headlock — controller is upright/kneeling,
    // their lead arm wrapped under the caught fighter's neck. Free hand grips
    // the wrist or floats by the head looking for a choke entry.
    const breathe = Math.sin(t * 0.16) * 1;
    pose.pelvis.x = 0; pose.pelvis.y = -68 + breathe * 0.5;
    pose.torsoAngle = 0.35;
    pose.legL.hipX = -10 * bd; pose.legL.hipY = -64; pose.legL.kneeX = -16 * bd; pose.legL.kneeY = -20; pose.legL.footX = -10 * bd; pose.legL.footY = 0;
    pose.legR.hipX =  10 * bd; pose.legR.hipY = -64; pose.legR.kneeX =  18 * bd; pose.legR.kneeY = -10; pose.legR.footX =  26 * bd; pose.legR.footY = 0;
    // Choking arm: wraps under the opponent's neck.
    pose.armFront.shoulderX = 18; pose.armFront.shoulderY = -114;
    pose.armFront.elbowX = 38;  pose.armFront.elbowY = -94;
    pose.armFront.handX = 16;   pose.armFront.handY = -70;
    // Free hand: cups opponent's far shoulder for control.
    pose.armBack.shoulderX = -12; pose.armBack.shoulderY = -110;
    pose.armBack.elbowX = 4;   pose.armBack.elbowY = -90;
    pose.armBack.handX = 30;   pose.armBack.handY = -68;
    pose.headOffset.x = 6; pose.headOffset.y = -132;
  }
  if (f.state === 'front_headlock_bottom') {
    // Bottom of a snap-down front headlock — bent forward at the waist, head
    // pulled DOWN under the controller's armpit. Hands posted on opponent's
    // hips for base, trying to drive forward to recover position.
    const struggle = Math.sin(t * 0.22) * 3;
    pose.pelvis.x = -8; pose.pelvis.y = -36 + struggle * 0.3;
    pose.torsoAngle = -0.85;                            // bent way forward
    pose.legL.hipX = -8 * bd; pose.legL.hipY = -32; pose.legL.kneeX = -22 * bd; pose.legL.kneeY = -8 + struggle * 0.4; pose.legL.footX = -36 * bd; pose.legL.footY = 0;
    pose.legR.hipX =  8 * bd; pose.legR.hipY = -32; pose.legR.kneeX =  20 * bd; pose.legR.kneeY = -10 - struggle * 0.4; pose.legR.footX = 32 * bd; pose.legR.footY = 0;
    // Both hands posted on opponent's body trying to drive through.
    pose.armBack.shoulderX = -18; pose.armBack.shoulderY = -64;
    pose.armBack.elbowX = -8 + struggle * 0.4;  pose.armBack.elbowY = -36;
    pose.armBack.handX  = 8 + struggle;  pose.armBack.handY  = -10;
    pose.armFront.shoulderX = 16; pose.armFront.shoulderY = -64;
    pose.armFront.elbowX = 22 - struggle * 0.4; pose.armFront.elbowY = -36;
    pose.armFront.handX  = 38 - struggle; pose.armFront.handY  = -10;
    pose.headOffset.x = 22; pose.headOffset.y = -34 + struggle * 0.5;   // pulled down into armpit
  }
  if (f.state === 'sub_offense') {
    // Locking in a submission. We animate the WRAP-UP from "reaching out"
    // toward "fully cinched" then hold a tight, distinctive pose for each
    // submission type, with a subtle pulling pulse to convey isometric tension.
    const lockFrame = f.subLockFrame || 0;
    const lockTotal = f.subLockTotal || 0;
    const lockK = lockTotal > 0 ? Math.max(0, Math.min(1, lockFrame / lockTotal)) : 1;
    const reach = 1 - lockK; // 1 at start of lock-in, 0 once fully wrapped
    // Normalise submission kind. Engine uses 'rear_naked_choke' but the
    // renderer historically branched on 'rear_naked' — accept both.
    const rawKind = f.subLockKind;
    const subKind = rawKind === 'rear_naked_choke' ? 'rear_naked' : rawKind;
    // Submission FINISH gauge in 0..1 (drives tightening — the higher the
    // progress, the tighter the wrap, the deeper the deformation).
    const prog = Math.max(0, Math.min(1, (f.subProgress || 0) / 100));
    const pull  = Math.sin(t * 0.32) * (2 + prog * 4);            // pull harder as it tightens
    // After lock-in, cinch amplitude scales with progress (0 at lock-in
    // moment, much stronger near finish). This drives the body deformation.
    const cinch = lockTotal === 0 ? pull : 0;

    if (subKind === 'armbar') {
      // ARMBAR: attacker is on his BACK with hips up against opponent's
      // shoulder. Both legs clamped over opponent's chest. Both hands
      // gripping opponent's wrist and pulling it down past the hip.
      // Torso lies BACK toward the floor (big negative angle).
      pose.pelvis.x = 0; pose.pelvis.y = -22 - reach * 4;
      pose.torsoAngle = -1.25;                  // ~ -72° — lying back
      // Legs SCISSORED VERTICALLY on opponent's chest — knees high.
      pose.legL.hipX = -8; pose.legL.hipY = -22; pose.legL.kneeX = -12; pose.legL.kneeY = -82; pose.legL.footX = -8; pose.legL.footY = -120;
      pose.legR.hipX =  8; pose.legR.hipY = -22; pose.legR.kneeX =  20; pose.legR.kneeY = -76; pose.legR.footX =  44; pose.legR.footY = -90;
      // Both hands grip the opponent's wrist (between the attacker's thighs)
      // and pull DOWN toward the hip. Position both hands close together.
      pose.armBack.shoulderX = -28; pose.armBack.shoulderY = -38;
      pose.armBack.elbowX = -6 + reach * 14;  pose.armBack.elbowY = -52 - reach * 4;
      pose.armBack.handX  = 18 + reach * 16 + cinch * 0.4; pose.armBack.handY  = -78 - reach * 8 + cinch * 0.6;
      pose.armFront.shoulderX = -24; pose.armFront.shoulderY = -42;
      pose.armFront.elbowX = -2 + reach * 14;  pose.armFront.elbowY = -56 - reach * 4;
      pose.armFront.handX  = 22 + reach * 16 + cinch * 0.4; pose.armFront.handY  = -82 - reach * 8 + cinch * 0.6;
      pose.headOffset.x = -28; pose.headOffset.y = -42;
    } else if (subKind === 'kimura') {
      // KIMURA: attacker on side controlling opponent's wrist with one hand
      // and the elbow with the other (figure-four). Body twisted on its
      // side — torso rolled hard toward the trapped shoulder.
      pose.pelvis.x = 0; pose.pelvis.y = -32;
      pose.torsoAngle = 0.95 + reach * 0.05;     // rolled onto side
      pose.legL.hipX = -10; pose.legL.kneeX = -10; pose.legL.kneeY = -70; pose.legL.footX = 8; pose.legL.footY = -88;
      pose.legR.hipX =  10; pose.legR.kneeX =  16; pose.legR.kneeY = -52; pose.legR.footX = 30; pose.legR.footY = -50;
      // Figure-four grip: both hands cinched on opponent's wrist with one
      // hand wrapping over the attacker's other forearm.
      pose.armBack.shoulderX = -14; pose.armBack.shoulderY = -80;
      pose.armBack.elbowX = 24 + reach * 12; pose.armBack.elbowY = -98 - reach * 4;
      pose.armBack.handX  = 50 + reach * 14 + cinch * 0.4; pose.armBack.handY  = -86 - reach * 6 - cinch * 0.4;
      pose.armFront.shoulderX = 20; pose.armFront.shoulderY = -80;
      pose.armFront.elbowX = 30 + reach * 12; pose.armFront.elbowY = -86 - reach * 4;
      pose.armFront.handX  = 56 + reach * 14 + cinch * 0.4; pose.armFront.handY  = -82 - reach * 6 - cinch * 0.4;
      pose.headOffset.x = 8; pose.headOffset.y = -118;
    } else if (subKind === 'rear_naked') {
      // REAR-NAKED CHOKE: attacker BEHIND opponent with both hooks in.
      // One arm wraps deep around the throat (bicep slicing the neck); the
      // other hand cups the back of the head pushing forward.
      pose.pelvis.x = -6; pose.pelvis.y = -42;
      pose.torsoAngle = 0.12;
      // Hooks: legs wrap around opponent's hips from behind.
      pose.legL.hipX = -12; pose.legL.hipY = -36; pose.legL.kneeX =  12; pose.legL.kneeY = -42; pose.legL.footX = 38; pose.legL.footY = -22;
      pose.legR.hipX =  12; pose.legR.hipY = -38; pose.legR.kneeX =  32; pose.legR.kneeY = -38; pose.legR.footX = 50; pose.legR.footY = -14;
      // Choking arm: bicep across throat, hand grips opposite bicep.
      pose.armBack.shoulderX = -16; pose.armBack.shoulderY = -100;
      pose.armBack.elbowX = 24 + reach * 18; pose.armBack.elbowY = -110;
      pose.armBack.handX  = 56 + reach * 18 - cinch * 0.5; pose.armBack.handY  = -94 + cinch * 0.3;
      // Top hand: pushes the back of opponent's head forward into the
      // choke. Wraps high above the choking elbow.
      pose.armFront.shoulderX = 14; pose.armFront.shoulderY = -100;
      pose.armFront.elbowX = 30 + reach * 14; pose.armFront.elbowY = -120;
      pose.armFront.handX  = 50 + reach * 14 - cinch * 0.4; pose.armFront.handY  = -132 + cinch * 0.4;
      pose.headOffset.x = -10; pose.headOffset.y = -130;
    } else if (subKind === 'guillotine') {
      // GUILLOTINE: attacker is upright/seated, opponent's head pulled
      // DOWN under attacker's armpit. One arm wraps the neck, other hand
      // grips that wrist and pulls UP. Knees come up high to lock
      // opponent's body in (closed guard) — torso curls forward HARD as
      // the choke is finished.
      pose.pelvis.x = 0; pose.pelvis.y = -56;
      pose.torsoAngle = 0.55 - reach * 0.10;     // curls forward into the choke
      // Closed guard around opponent's torso — legs wrap.
      pose.legL.hipX = -10; pose.legL.hipY = -50; pose.legL.kneeX = 18; pose.legL.kneeY = -70; pose.legL.footX = 50; pose.legL.footY = -52;
      pose.legR.hipX =  10; pose.legR.hipY = -50; pose.legR.kneeX = 24; pose.legR.kneeY = -64; pose.legR.footX = 56; pose.legR.footY = -46;
      // Guillotine arms: front arm crooks the neck, back hand grips wrist.
      pose.armFront.shoulderX = 22; pose.armFront.shoulderY = -110;
      pose.armFront.elbowX = 38 + reach * 12; pose.armFront.elbowY = -98;
      pose.armFront.handX  = 18 + reach * 12 - cinch * 0.5; pose.armFront.handY  = -78 - cinch * 0.4;
      pose.armBack.shoulderX = -18; pose.armBack.shoulderY = -110;
      pose.armBack.elbowX = 6 + reach * 10; pose.armBack.elbowY = -100;
      pose.armBack.handX  = 22 + reach * 12 - cinch * 0.5; pose.armBack.handY  = -84 - cinch * 0.4;
      pose.headOffset.x = 4; pose.headOffset.y = -136;
    } else if (subKind === 'darce') {
      // D'ARCE CHOKE: from front-headlock or scramble. Choking arm DEEP under
      // opponent's near armpit, palm clamped on top of opponent's nape; free
      // hand grips the choking forearm. Body tilted to the FAR side cinching
      // shoulder & neck together.
      pose.pelvis.x = -4; pose.pelvis.y = -52;
      pose.torsoAngle = 0.42 - reach * 0.08;
      pose.legL.hipX = -12; pose.legL.hipY = -46; pose.legL.kneeX = -22; pose.legL.kneeY = -8; pose.legL.footX = -16; pose.legL.footY = 0;
      pose.legR.hipX =  10; pose.legR.hipY = -46; pose.legR.kneeX =  20; pose.legR.kneeY = -10; pose.legR.footX = 30; pose.legR.footY = 0;
      // Choking arm threads under opponent's far armpit and clamps onto own bicep.
      pose.armFront.shoulderX = 18; pose.armFront.shoulderY = -100;
      pose.armFront.elbowX = 38 + reach * 10; pose.armFront.elbowY = -82;
      pose.armFront.handX  = 12 + reach * 12 - cinch * 0.6; pose.armFront.handY  = -64 - cinch * 0.3;
      // Free hand crushes the choking arm tighter (figure-four grip).
      pose.armBack.shoulderX = -14; pose.armBack.shoulderY = -100;
      pose.armBack.elbowX = 6 + reach * 8; pose.armBack.elbowY = -82;
      pose.armBack.handX  = 30 + reach * 10 - cinch * 0.6; pose.armBack.handY  = -68 - cinch * 0.3;
      pose.headOffset.x = 8; pose.headOffset.y = -126;
    } else if (subKind === 'anaconda') {
      // ANACONDA CHOKE: similar to D'arce but the choking arm wraps DEEP
      // around the front of the neck (not under the armpit), other hand
      // squeezes the wrist. Attacker rolls TOWARD the choke (rolling anaconda
      // motion) so torso tilts hard.
      pose.pelvis.x = -8; pose.pelvis.y = -50;
      pose.torsoAngle = 0.62 - reach * 0.10;       // rolled hard onto side
      pose.legL.hipX = -10; pose.legL.hipY = -44; pose.legL.kneeX = -8;  pose.legL.kneeY = -12; pose.legL.footX = 12; pose.legL.footY = -2;
      pose.legR.hipX =  10; pose.legR.hipY = -44; pose.legR.kneeX =  16; pose.legR.kneeY = -16; pose.legR.footX = 28; pose.legR.footY = -8;
      // Choking arm wraps the neck from the front.
      pose.armFront.shoulderX = 16; pose.armFront.shoulderY = -94;
      pose.armFront.elbowX = 34 + reach * 10; pose.armFront.elbowY = -78;
      pose.armFront.handX  = 8 + reach * 12 - cinch * 0.7; pose.armFront.handY  = -56 - cinch * 0.3;
      pose.armBack.shoulderX = -10; pose.armBack.shoulderY = -94;
      pose.armBack.elbowX = 8 + reach * 8; pose.armBack.elbowY = -76;
      pose.armBack.handX  = 26 + reach * 12 - cinch * 0.7; pose.armBack.handY  = -60 - cinch * 0.3;
      pose.headOffset.x = 14; pose.headOffset.y = -118;
    } else if (subKind === 'kneebar') {
      // KNEEBAR: attacker on side / back, opponent's leg trapped between
      // attacker's thighs, attacker's hips driving UP against the back of
      // opponent's knee. Both hands wrap the opponent's ANKLE pulling it
      // toward attacker's chest (hyper-extending the knee).
      pose.pelvis.x = 4; pose.pelvis.y = -28 - reach * 4;
      pose.torsoAngle = 0.45 + reach * 0.05;
      // Attacker's legs clamp opponent's leg.
      pose.legL.hipX = -8; pose.legL.hipY = -22; pose.legL.kneeX = -6; pose.legL.kneeY = -76; pose.legL.footX = 12; pose.legL.footY = -90;
      pose.legR.hipX =  8; pose.legR.hipY = -22; pose.legR.kneeX = 16; pose.legR.kneeY = -70; pose.legR.footX = 30; pose.legR.footY = -86;
      // Both hands cinching the trapped ankle to attacker's chest.
      pose.armBack.shoulderX = -22; pose.armBack.shoulderY = -52;
      pose.armBack.elbowX = -2 + reach * 12; pose.armBack.elbowY = -76;
      pose.armBack.handX  = 14 + reach * 14 + cinch * 0.4; pose.armBack.handY  = -94 - cinch * 0.4;
      pose.armFront.shoulderX = -18; pose.armFront.shoulderY = -56;
      pose.armFront.elbowX = 2 + reach * 12; pose.armFront.elbowY = -78;
      pose.armFront.handX  = 18 + reach * 14 + cinch * 0.4; pose.armFront.handY  = -96 - cinch * 0.4;
      pose.headOffset.x = -22; pose.headOffset.y = -50;
    } else {
      // TRIANGLE (and any other): figure-four with the LEGS around
      // opponent's neck and arm. Attacker on back, hips up, one leg
      // crossed over its own ankle locking the choke. Torso lies FLAT
      // on the canvas as legs scissor up.
      pose.pelvis.x = 0; pose.pelvis.y = -22;
      pose.torsoAngle = -1.35;                   // ~ -77° — flat on back
      // Triangle leg lock — one leg up & across, ankle tucked behind
      // the other knee.
      pose.legL.hipX = -10; pose.legL.hipY = -22; pose.legL.kneeX =  10; pose.legL.kneeY = -84; pose.legL.footX = 38; pose.legL.footY = -78;
      pose.legR.hipX =  10; pose.legR.hipY = -22; pose.legR.kneeX = -14 + reach * 14; pose.legR.kneeY = -88; pose.legR.footX = 18 + reach * 12; pose.legR.footY = -66;
      // One hand grips the trapped arm and pulls down, other braces.
      pose.armBack.shoulderX = -28; pose.armBack.shoulderY = -38;
      pose.armBack.elbowX = 4 + reach * 12; pose.armBack.elbowY = -56;
      pose.armBack.handX  = 30 + reach * 14 + cinch * 0.4; pose.armBack.handY  = -78 + cinch * 0.4;
      pose.armFront.shoulderX = -24; pose.armFront.shoulderY = -42;
      pose.armFront.elbowX = -8; pose.armFront.elbowY = -56;
      pose.armFront.handX  = -30; pose.armFront.handY  = -52;
      pose.headOffset.x = -28; pose.headOffset.y = -42;
    }
  }
  if (f.state === 'sub_defense') {
    // Submission-specific defense pose. The DEFENDER's body shape must match
    // the submission being applied so the viewer instantly understands what's
    // happening (arm extended = armbar, head pulled down = guillotine, etc).
    // Falls back to position-aware generic defense when no lock is active.
    const rawKind = f.subLockKind;
    const subKind = rawKind === 'rear_naked_choke' ? 'rear_naked' : rawKind;
    // Tremor / panic flail amplitude scales with FINISH gauge — the closer
    // the lock is to finishing, the more violently the defender shakes.
    const prog  = Math.max(0, Math.min(1, (f.subProgress || 0) / 100));
    const tremorAmp = 1 + prog * 1.6;
    const flail = Math.sin(t * 0.42) * 6 * tremorAmp;
    const tap   = Math.sin(t * 0.7)  * 3 * tremorAmp;     // rapid tapping motion
    pose.pelvis.x = 0; pose.pelvis.y = -14;
    pose.torsoAngle = 0.06;

    if (subKind === 'armbar') {
      // ARMBAR defense: defender flat on back, trapped arm YANKED straight
      // toward attacker (hyper-extended look). Free hand claws desperately.
      // The trapped arm hyper-extends FURTHER as the lock tightens (progress).
      const ext = prog * 10;                          // extra extension (hyper-extension)
      pose.pelvis.y = -14;
      pose.torsoAngle = 0.02;
      pose.headOffset.x = -80; pose.headOffset.y = -14;
      pose.legL.hipX = 6;  pose.legL.kneeX = 34 + tap * 0.4; pose.legL.kneeY = -10; pose.legL.footX = 68; pose.legL.footY = -2;
      pose.legR.hipX = 6;  pose.legR.kneeX = 38 - tap * 0.4; pose.legR.kneeY = -6;  pose.legR.footX = 72; pose.legR.footY =  0;
      // TRAPPED arm (front): yanked rigidly STRAIGHT away from body
      pose.armFront.shoulderX = -18; pose.armFront.shoulderY = -62;
      pose.armFront.elbowX = 20 + ext * 0.6; pose.armFront.elbowY = -68 - ext * 0.2;
      pose.armFront.handX  = 58 + ext;       pose.armFront.handY  = -70 - ext * 0.3;
      // FREE arm (back): claws / slaps ground in panic
      pose.armBack.shoulderX = -40; pose.armBack.shoulderY = -60;
      pose.armBack.elbowX = -54 + flail; pose.armBack.elbowY = -42;
      pose.armBack.handX  = -66 - flail * 0.6; pose.armBack.handY  = -28 + tap;
    } else if (subKind === 'kimura') {
      // KIMURA defense: defender on side, shoulder wrenched up, trapped arm
      // bent painfully behind the back.
      pose.pelvis.y = -18;
      pose.torsoAngle = 0.35;
      pose.headOffset.x = -66; pose.headOffset.y = -28;
      pose.legL.hipX = 8;  pose.legL.kneeX = 30 + tap * 0.3; pose.legL.kneeY = -14; pose.legL.footX = 62; pose.legL.footY = -6;
      pose.legR.hipX = 10; pose.legR.kneeX = 34 - tap * 0.3; pose.legR.kneeY = -18; pose.legR.footX = 66; pose.legR.footY = -4;
      // Trapped arm bent behind the back (front arm)
      pose.armFront.shoulderX = -16; pose.armFront.shoulderY = -58;
      pose.armFront.elbowX = 14; pose.armFront.elbowY = -38;
      pose.armFront.handX  = 0;  pose.armFront.handY  = -22;  // wrist bent back
      // Free arm (back) tries to push attacker off
      pose.armBack.shoulderX = -44; pose.armBack.shoulderY = -62;
      pose.armBack.elbowX = -22 + flail; pose.armBack.elbowY = -72;
      pose.armBack.handX  = -2 - flail * 0.6; pose.armBack.handY  = -78 + tap;
    } else if (subKind === 'rear_naked') {
      // RNC defense: face-down, head pulled UP as the choking arm crushes the
      // throat. Both hands claw at the choking forearm. The spine ARCHES
      // back further with progress (head pulled higher) — classic RNC visual.
      pose.pelvis.y = -10;
      pose.torsoAngle = -0.10 - prog * 0.18;             // arches back as lock tightens
      pose.headOffset.x = -72;
      pose.headOffset.y = -22 - prog * 6 + tap * 0.5;    // head pulled UP further
      pose.legL.hipX = 6; pose.legL.kneeX = 34; pose.legL.kneeY = -8; pose.legL.footX = 66; pose.legL.footY = -4;
      pose.legR.hipX = 8; pose.legR.kneeX = 38; pose.legR.kneeY = -4; pose.legR.footX = 70; pose.legR.footY = -2;
      // Both hands claw at attacker's choking forearm (up near neck)
      pose.armBack.shoulderX = -44;  pose.armBack.elbowX = -62 + flail * 0.6; pose.armBack.elbowY = -40;
      pose.armBack.handX  = -74 + flail * 0.8; pose.armBack.handY  = -28 + tap;
      pose.armFront.shoulderX = -40; pose.armFront.elbowX = -58 - flail * 0.6; pose.armFront.elbowY = -44;
      pose.armFront.handX  = -72 - flail * 0.8; pose.armFront.handY  = -20 - tap;
    } else if (subKind === 'guillotine') {
      // GUILLOTINE defense: head YANKED down under attacker's armpit, torso
      // curled forward. Hands try to peel the choking arm off. Curl deepens
      // and head bends down further as the choke closes (progress).
      pose.pelvis.y = -40;                        // kneeling / on all fours
      pose.torsoAngle = -0.65 - prog * 0.18;      // curls deeper as choke tightens
      pose.headOffset.x = -28; pose.headOffset.y = -8 + prog * 6 + tap;
      pose.legL.hipX = 0;  pose.legL.hipY = -36; pose.legL.kneeX = -6; pose.legL.kneeY = -14; pose.legL.footX = -2; pose.legL.footY = 0;
      pose.legR.hipX = 6;  pose.legR.hipY = -36; pose.legR.kneeX = 12; pose.legR.kneeY = -12; pose.legR.footX = 14; pose.legR.footY = 0;
      // Both hands claw up at the choking arm (which is overhead from defender's view)
      pose.armBack.shoulderX = -10;  pose.armBack.shoulderY = -64;
      pose.armBack.elbowX = 8 + flail * 0.4;  pose.armBack.elbowY = -44;
      pose.armBack.handX  = 22 + flail * 0.5; pose.armBack.handY  = -24 - tap;
      pose.armFront.shoulderX = 10; pose.armFront.shoulderY = -66;
      pose.armFront.elbowX = 26 - flail * 0.4; pose.armFront.elbowY = -48;
      pose.armFront.handX  = 40 - flail * 0.5; pose.armFront.handY  = -32 - tap;
    } else if (subKind === 'triangle') {
      // TRIANGLE defense: defender kneeling with head trapped between attacker's
      // legs — chin tucked, face reddening, one arm trapped, other hand peels
      // at the squeezing leg.
      pose.pelvis.y = -42;
      pose.torsoAngle = -0.55;
      pose.headOffset.x = -16; pose.headOffset.y = -12 + tap;
      pose.legL.hipX = -2; pose.legL.hipY = -38; pose.legL.kneeX = -10; pose.legL.kneeY = -16; pose.legL.footX = -8; pose.legL.footY = 0;
      pose.legR.hipX =  6; pose.legR.hipY = -38; pose.legR.kneeX =  14; pose.legR.kneeY = -14; pose.legR.footX = 18; pose.legR.footY = 0;
      // Trapped arm (front): stuck in the triangle, extended forward
      pose.armFront.shoulderX = 6; pose.armFront.shoulderY = -64;
      pose.armFront.elbowX = 30; pose.armFront.elbowY = -56;
      pose.armFront.handX  = 52 + tap; pose.armFront.handY  = -52;
      // Free arm (back): tries to pull the squeezing leg off
      pose.armBack.shoulderX = -12;  pose.armBack.shoulderY = -64;
      pose.armBack.elbowX = 6 + flail * 0.4;  pose.armBack.elbowY = -46;
      pose.armBack.handX  = 28 + flail * 0.6; pose.armBack.handY  = -24 - tap;
    } else if (subKind === 'darce' || subKind === 'anaconda') {
      // D'ARCE / ANACONDA defense: defender bent over hard at the waist,
      // head being squeezed inside attacker's wrap. Hands paw at the
      // choking arm in panic. As progress climbs the spine curls harder.
      pose.pelvis.x = -8; pose.pelvis.y = -38 - prog * 6;
      pose.torsoAngle = -0.95 - prog * 0.20;       // bent way forward
      pose.headOffset.x = 6 + tap * 0.4;
      pose.headOffset.y = -22 - prog * 4 + tap * 0.4;
      pose.legL.hipX = -8; pose.legL.hipY = -34; pose.legL.kneeX = -22; pose.legL.kneeY = -8 + flail * 0.3; pose.legL.footX = -32; pose.legL.footY = 0;
      pose.legR.hipX =  8; pose.legR.hipY = -34; pose.legR.kneeX =  22; pose.legR.kneeY = -10 - flail * 0.3; pose.legR.footX = 30; pose.legR.footY = 0;
      pose.armBack.shoulderX = -16;  pose.armBack.elbowX = -2 + flail * 0.4;  pose.armBack.elbowY = -32;
      pose.armBack.handX  = 12 + flail * 0.6; pose.armBack.handY  = -8 - tap;
      pose.armFront.shoulderX = 16; pose.armFront.elbowX = 4 - flail * 0.4; pose.armFront.elbowY = -32;
      pose.armFront.handX  = 18 - flail * 0.6; pose.armFront.handY  = -10 - tap;
    } else if (subKind === 'kneebar') {
      // KNEEBAR defense: defender on back, ONE leg captured & extended into
      // a painful straight line, free leg flailing for sweep / posture, hands
      // grabbing toward the trapped knee. Hips lift with progress (panic
      // bridge). Knee hyper-extends visually as progress climbs.
      pose.pelvis.y = -14 + prog * 6;
      pose.torsoAngle = 0.05;
      pose.headOffset.x = -78; pose.headOffset.y = -14;
      // Trapped leg — RIGHT leg, yanked forward & locked straight out.
      pose.legR.hipX = 4;  pose.legR.hipY = -10; pose.legR.kneeX = 28; pose.legR.kneeY = -8 - prog * 6; pose.legR.footX = 64; pose.legR.footY = -10 - prog * 8;
      // Free leg flails (kicks for posture).
      pose.legL.hipX = 6;  pose.legL.kneeX = 34 + flail * 0.4; pose.legL.kneeY = -22 + flail * 0.3; pose.legL.footX = 60 + flail * 0.6; pose.legL.footY = -28 + flail * 0.5;
      // Both hands reach for the trapped knee.
      pose.armBack.shoulderX = -36; pose.armBack.shoulderY = -50;
      pose.armBack.elbowX = -10 + flail * 0.4;  pose.armBack.elbowY = -42;
      pose.armBack.handX  = 14 + flail * 0.6; pose.armBack.handY  = -38 + tap * 0.4;
      pose.armFront.shoulderX = -32; pose.armFront.shoulderY = -54;
      pose.armFront.elbowX = -6 - flail * 0.4; pose.armFront.elbowY = -46;
      pose.armFront.handX  = 18 - flail * 0.6; pose.armFront.handY  = -40 + tap * 0.4;
    } else {
      // Generic position-based defense (no specific lock info).
      const pos = f.groundPosition || 'mount';
      if (pos === 'guard') {
        pose.headOffset.x = -64; pose.headOffset.y = -18;
        pose.legL.hipX = 6;  pose.legL.kneeX = 22 + flail * 0.4; pose.legL.kneeY = -56; pose.legL.footX = 50; pose.legL.footY = -68;
        pose.legR.hipX = 6;  pose.legR.kneeX = 24 - flail * 0.4; pose.legR.kneeY = -52; pose.legR.footX = 54; pose.legR.footY = -64;
        pose.armBack.shoulderX = -42;  pose.armBack.elbowX = -32 - flail; pose.armBack.elbowY = -40; pose.armBack.handX = -10 + flail; pose.armBack.handY = -50;
        pose.armFront.shoulderX = -38; pose.armFront.elbowX = -22 + flail; pose.armFront.elbowY = -46; pose.armFront.handX = 4 - flail; pose.armFront.handY = -54;
      } else if (pos === 'back_mount') {
        pose.pelvis.y = -8;
        pose.headOffset.x = -78; pose.headOffset.y = -10;
        pose.legL.hipX = 8; pose.legL.kneeX = 38; pose.legL.kneeY = -8; pose.legL.footX = 70; pose.legL.footY = -6;
        pose.legR.hipX = 8; pose.legR.kneeX = 40; pose.legR.kneeY = -6; pose.legR.footX = 72; pose.legR.footY = -4;
        pose.armBack.shoulderX = -50;  pose.armBack.elbowX = -64 + flail * 0.6; pose.armBack.elbowY = -22; pose.armBack.handX = -54 + flail; pose.armBack.handY = -34;
        pose.armFront.shoulderX = -46; pose.armFront.elbowX = -58 - flail * 0.6; pose.armFront.elbowY = -28; pose.armFront.handX = -50 - flail; pose.armFront.handY = -38;
      } else {
        pose.headOffset.x = -76; pose.headOffset.y = -16;
        pose.legL.hipX = 8; pose.legL.kneeX = 36; pose.legL.kneeY = -10 + flail * 0.5; pose.legL.footX = 70; pose.legL.footY = -4;
        pose.legR.hipX = 8; pose.legR.kneeX = 38; pose.legR.kneeY = -6 - flail * 0.5; pose.legR.footX = 72; pose.legR.footY = -2;
        pose.armBack.shoulderX = -46;  pose.armBack.elbowX = -34 + flail; pose.armBack.elbowY = -36; pose.armBack.handX = -22 - flail; pose.armBack.handY = -42;
        pose.armFront.shoulderX = -42; pose.armFront.elbowX = -28 - flail; pose.armFront.elbowY = -42; pose.armFront.handX = -16 + flail; pose.armFront.handY = -48;
      }
    }
  }
  if (f.state === 'attack' && a) {
    const phase = af < a.startup ? 'startup' : af < a.startup + a.active ? 'active' : 'recovery';
    const k = phase === 'startup' ? af / a.startup : phase === 'active' ? 1 : 1 - (af - a.startup - a.active) / a.recovery;
    applyAttackPose(pose, a.kind, k, phase, f);
  }
  // Independent head-snap (UFC 5-style chin whip) — displaces the head
  // *additionally* so it reads as a separate impact reaction from the torso.
  // Decoupled from hitReact so cleanly-landed punches still snap the chin
  // even when the body has begun to recover.
  if (f.headSnap > 0) {
    const localDir = (f.headSnapDir || 1) * (f.facing || 1);
    pose.headOffset.x -= localDir * f.headSnap * 14;
    pose.headOffset.y -= f.headSnap * 4;
  }
  // Limp animation: a fighter with a crippled lead leg drags the front
  // foot during walk / idle, with a slight pelvis-drop to one side. This
  // is purely cosmetic (the engine handles the speed cut).
  if (f.legCrippled && (f.state === 'idle' || f.state === 'walk' || f.state === 'block')) {
    const limpPhase = Math.sin((f.animTime || 0) * 0.16);
    pose.pelvis.y = pose.pelvis.y + 2 + Math.max(0, limpPhase) * 2;
    pose.legR.kneeY = pose.legR.kneeY + 4;
    pose.legR.footY = pose.legR.footY + Math.max(0, -limpPhase) * 3;
  }
  return pose;
}

function applyAttackPose(pose, kind, k, phase, f) {
  // Three-phase curve: chamber (startup), extend (active, peaks at 1), retract (recovery).
  // `k` already represents 0..1..0 progression across the whole move. Use easing for snap.
  const easeOut = 1 - (1 - k) * (1 - k);   // fast-out for snap on extension
  const easeIn = k * k;                     // accelerating for chamber
  const bd = (f && f.data && f.data.build) || 1.0;
  const ht = (f && f.data && f.data.height) || 1.0;
  void ht;
  switch (kind) {
    case 'jab': {
      // Lead-hand jab: snap-extend front fist, rear hand glued to chin guarding
      // the face, small hip drive forward, lead foot stamps. Recovery has the
      // arm pulling back along the same line (no overshoot — jabs snap back
      // to guard fastest of all strikes).
      const reach = phase === 'recovery' ? k * k : easeOut; // sharp snap, soft return
      const overshoot = phase === 'active' ? Math.sin(k * Math.PI) * 0.08 : 0;
      const r = reach + overshoot;
      pose.armFront.elbowX = 18 + r * 38;
      pose.armFront.elbowY = -132 - r * 4;
      pose.armFront.handX = 26 + r * 78;
      pose.armFront.handY = -134 - r * 4;
      // Rear hand stays glued to chin in proper boxing form.
      pose.armBack.handX = 6; pose.armBack.handY = -148;
      pose.armBack.elbowX = -10; pose.armBack.elbowY = -126;
      pose.torsoAngle = 0.12 * reach;
      pose.pelvis.x = reach * 4;
      pose.legR.footX = 28 * 0.86 + reach * 10;  // lead foot stamps forward
      pose.legL.footY = -reach * 3;              // back foot rises on toe
      pose.headOffset.x = -2 + reach * 4;
      pose.headOffset.y = -152 - reach * 2;     // slight head tuck behind shoulder
      break;
    }
    case 'cross': {
      // Rear-hand cross: HUGE hip + shoulder rotation. Rear foot pivots on the
      // toe (heel rotates upward), lead hand glued to chin, the whole body
      // rotates BEHIND the punch. Has slight follow-through at peak (the
      // rear shoulder continues past the strike line) then a heavy recovery
      // back to guard.
      const overshoot = phase === 'active' ? Math.sin(k * Math.PI) * 0.12 : 0;
      const reach = easeOut + overshoot;
      pose.armBack.elbowX = -2 + reach * 38;
      pose.armBack.elbowY = -134 - reach * 4;
      pose.armBack.handX = 0 + reach * 104;
      pose.armBack.handY = -134 - reach * 6;
      // Lead hand pulls back to chin to guard.
      pose.armFront.handX = 14 - reach * 4; pose.armFront.handY = -148 - reach * 2;
      pose.armFront.elbowX = 14; pose.armFront.elbowY = -132;
      pose.torsoAngle = -0.42 * reach;
      pose.pelvis.x = reach * 8;
      pose.headOffset.x = -2 + reach * 10;
      pose.headOffset.y = -152 + reach * 2;
      // Rear foot pivots: heel rotates up, knee twists IN toward target line.
      pose.legL.footY -= reach * 14;
      pose.legL.footX = -20 * bd + reach * 8;
      pose.legL.kneeX = -14 * bd + reach * 8;
      pose.legL.kneeY = -42 - reach * 6;
      // Lead leg straightens & plants firmly to absorb rotation.
      pose.legR.footX = 24 * bd + reach * 6;
      pose.legR.kneeY = -42 + reach * 2;
      break;
    }
    case 'uppercut': {
      // Uppercut = explosive level change. Dip DEEPLY during chamber (knees
      // bend, hips drop, rear fist drops to hip), then explode upward with
      // the rear fist arcing from hip → chin → above-head. Body rotates &
      // rises violently on extension. Recovery: body settles, fist drops
      // back to guard.
      const dip = phase === 'startup' ? easeIn : (phase === 'active' ? 1 : 1 - easeOut);
      const rise = phase === 'startup' ? 0 : easeOut;
      pose.pelvis.y = -82 + dip * 12 - rise * 22;
      pose.torsoAngle = -0.20 * rise + 0.14 * dip;
      // Knees bend deeply during the dip, then drive up
      pose.legR.kneeY = -42 + dip * 16 - rise * 6;
      pose.legL.kneeY = -42 + dip * 16 - rise * 6;
      // Rear fist: starts at hip, arcs up through chin to above shoulder.
      pose.armBack.elbowX = -4 + rise * 24;
      pose.armBack.elbowY = -100 + dip * 14 - rise * 38;
      pose.armBack.handX = 4 + rise * 48;
      pose.armBack.handY = -88 + dip * 18 - rise * 78;
      // Lead hand stays at chin guarding
      pose.armFront.handX = 16; pose.armFront.handY = -150;
      pose.armFront.elbowX = 14; pose.armFront.elbowY = -132;
      // Head rises with body, tilts back as the fist drives up past chin
      pose.headOffset.y = -152 * ht + dip * 4 - rise * 12;
      pose.headOffset.x = -2 + rise * 4;
      break;
    }
    case 'kick': {
      // Round body kick: chamber the knee high & tucked, then PIVOT on the
      // support leg and whip the kicking leg horizontally through the target.
      // Body leans hard away from the kick to balance.
      const chamber = phase === 'startup' ? easeIn : 1 - easeOut;
      const extend = phase === 'startup' ? 0 : easeOut;
      // Kicking leg (right): chambers high & tucked, then snaps out.
      pose.legR.kneeX = 16 + chamber * 16 - extend * 10;
      pose.legR.kneeY = -56 - chamber * 36 + extend * 18;
      pose.legR.footX = 18 + chamber * 26 + extend * 80;
      pose.legR.footY = -60 - chamber * 56 + extend * 28;
      // Support leg (left) PIVOTS — knee straightens, foot turns out.
      pose.legL.kneeX = -10;
      pose.legL.kneeY = -38 + extend * 4;
      pose.legL.footX = -18 + extend * 4;
      pose.legL.footY = 0;
      // Hip + shoulder rotation: chamber pre-loads, extension unwinds violently.
      pose.torsoAngle = -0.36 * extend + 0.12 * chamber;
      pose.pelvis.x = -extend * 8;
      pose.pelvis.y = -82 + chamber * 4;
      // Arms windmill for balance — front arm pulls back, back arm reaches forward.
      pose.armBack.handX = -22 - extend * 8;
      pose.armBack.handY = -150 + extend * 12;
      pose.armBack.elbowX = -16; pose.armBack.elbowY = -136;
      pose.armFront.handX = 10 - extend * 14;
      pose.armFront.handY = -130 + extend * 12;
      pose.armFront.elbowX = 12; pose.armFront.elbowY = -128;
      // Head leans away to balance the kick
      pose.headOffset.x = -4 - extend * 6;
      break;
    }
    case 'low_kick': {
      // Low kick — chops the lead leg / calf with a downward arc. Step in
      // slightly with the support leg, hip rotates, body leans into the kick.
      const chamber = phase === 'startup' ? easeIn : 1 - easeOut;
      const extend = phase === 'startup' ? 0 : easeOut;
      pose.legR.kneeX = 18 + chamber * 14;
      pose.legR.kneeY = -36 - chamber * 16 + extend * 4;
      pose.legR.footX = 18 + chamber * 26 + extend * 78;
      pose.legR.footY = -22 - chamber * 8 + extend * 8;
      // Support leg compresses to drive the rotation.
      pose.legL.kneeY = -42 + extend * 6;
      pose.legL.footX = -18 - extend * 4;
      // Body rotates with the kick.
      pose.torsoAngle = -0.22 * extend + 0.06 * chamber;
      pose.pelvis.x = -extend * 5;
      // Front hand pulls in to chin, rear hand drops for counter-balance.
      pose.armFront.handX = 10 - extend * 4; pose.armFront.handY = -132;
      pose.armFront.elbowX = 14; pose.armFront.elbowY = -130;
      pose.armBack.handX = -16 - extend * 6; pose.armBack.handY = -146 + extend * 4;
      pose.armBack.elbowX = -14; pose.armBack.elbowY = -132;
      pose.headOffset.x = -2 - extend * 3;
      break;
    }
    case 'head_kick': {
      // High head kick — deepest chamber, snap leg up to head height, body
      // leans back massively to fit the leg's arc, support leg pivots fully.
      const chamber = phase === 'startup' ? easeIn : 1 - easeOut;
      const extend = phase === 'startup' ? 0 : easeOut;
      // Knee chambers near the chest, then whips up and out at head height.
      pose.legR.kneeX = 12 + chamber * 22;
      pose.legR.kneeY = -100 - chamber * 40 + extend * 14;
      pose.legR.footX = 12 + chamber * 28 + extend * 86;
      pose.legR.footY = -110 - chamber * 60 - extend * 8;
      // Support leg straightens, pivots so the toe points away from target.
      pose.legL.kneeX = -8;
      pose.legL.kneeY = -36 + extend * 2;
      pose.legL.footX = -16;
      pose.legL.footY = 0;
      // Body leans back hard, hips rotate aggressively.
      pose.torsoAngle = -0.46 * extend + 0.10 * chamber;
      pose.pelvis.x = -extend * 8;
      pose.pelvis.y = -82 + chamber * 6 + extend * 6;
      // Arms drop & windmill for balance.
      pose.armBack.handX = -28 - extend * 4;
      pose.armBack.handY = -126 + extend * 18;
      pose.armBack.elbowX = -18; pose.armBack.elbowY = -114;
      pose.armFront.handX = 14 - extend * 10;
      pose.armFront.handY = -118 + extend * 14;
      pose.armFront.elbowX = 16; pose.armFront.elbowY = -112;
      // Head tilts away to clear the kick.
      pose.headOffset.x = -2 - extend * 8;
      pose.headOffset.y = -152 * ht - extend * 4;
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
  // Pure silhouette leg — solid black thigh + shin + foot. No skin shading,
  // no ankle tape (would break the silhouette aesthetic).
  const body = p.body || p.skin || '#070707';

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = body;

  // THIGH
  ctx.lineWidth = 22 * bd;
  ctx.beginPath();
  ctx.moveTo(leg.hipX, leg.hipY);
  ctx.lineTo(leg.kneeX, leg.kneeY);
  ctx.stroke();

  // SHIN — slightly tapered
  ctx.lineWidth = 16 * bd;
  ctx.beginPath();
  ctx.moveTo(leg.kneeX, leg.kneeY);
  ctx.lineTo(leg.footX, leg.footY);
  ctx.stroke();

  // KNEE blend (filled circle to soften the joint)
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(leg.kneeX, leg.kneeY, 10 * bd, 0, Math.PI * 2);
  ctx.fill();

  // FOOT
  ctx.beginPath();
  ctx.ellipse(leg.footX + 5, leg.footY - 1, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawTorso(ctx, pose, p, bd, ht, data) {
  // Pure silhouette torso — single solid black body shape, no muscle shading,
  // no belly bulge, no sports-bra detail. The fighter's identity comes from
  // hair + signature glove color, not from torso markings.
  const body = p.body || p.skin || '#070707';

  const shoulderW = 30 * bd;
  const waistW = 22 * bd;
  const neckOffsetY = -72 * ht;
  const shoulderY = -68 * ht;
  const waistY = 0;

  ctx.save();
  ctx.translate(pose.pelvis.x, pose.pelvis.y);
  ctx.rotate(pose.torsoAngle);

  // Single solid silhouette body shape (V-taper from waist to shoulders).
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-waistW, waistY);
  ctx.bezierCurveTo(
    -waistW, -14,
    -shoulderW * 0.95, -34,
    -shoulderW, shoulderY
  );
  ctx.lineTo(-shoulderW * 0.7, neckOffsetY);
  ctx.lineTo(-5, neckOffsetY - 2);
  ctx.lineTo(5, neckOffsetY - 2);
  ctx.lineTo(shoulderW * 0.7, neckOffsetY);
  ctx.lineTo(shoulderW, shoulderY);
  ctx.bezierCurveTo(
    shoulderW * 0.95, -34,
    waistW, -14,
    waistW, waistY
  );
  ctx.closePath();
  ctx.fill();

  // Subtle inner shadow on the back-side half so the torso reads as a 3D
  // shape rather than a flat colored cutout. Body color is now vibrant —
  // without this it loses dimensional volume.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(-waistW, waistY);
  ctx.bezierCurveTo(-waistW, -14, -shoulderW * 0.95, -34, -shoulderW, shoulderY);
  ctx.lineTo(-shoulderW * 0.7, neckOffsetY);
  ctx.lineTo(-2, neckOffsetY - 2);
  ctx.lineTo(-2, waistY);
  ctx.closePath();
  ctx.fill();

  // Thin dark outline around the whole silhouette so it pops against the
  // dark background.
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.moveTo(-waistW, waistY);
  ctx.bezierCurveTo(-waistW, -14, -shoulderW * 0.95, -34, -shoulderW, shoulderY);
  ctx.lineTo(-shoulderW * 0.7, neckOffsetY);
  ctx.lineTo(-5, neckOffsetY - 2);
  ctx.lineTo(5, neckOffsetY - 2);
  ctx.lineTo(shoulderW * 0.7, neckOffsetY);
  ctx.lineTo(shoulderW, shoulderY);
  ctx.bezierCurveTo(shoulderW * 0.95, -34, waistW, -14, waistW, waistY);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

function _drawTorsoLegacy_unused(ctx, pose, p, bd, ht, data) {
  // legacy detailed torso (skin/muscle/female chest/etc) — replaced by silhouette.
  const skin = p.skin;
  const shadow = shadeColor(skin, -0.20);
  const deepShadow = shadeColor(skin, -0.34);
  const hilite = shadeColor(skin, 0.14);
  const muscle = data && typeof data.muscle === 'number' ? data.muscle : 0.75;
  const belly = data && typeof data.belly === 'number' ? data.belly : 0;
  const female = data && data.sex === 'f';
  const shoulderW = female ? 26 * bd : 30 * bd;
  const waistW = female ? 22 * bd : 22 * bd;
  const neckOffsetY = -72 * ht;
  const shoulderY = -68 * ht;
  const chestY = -52 * ht;
  const waistY = 0;
  ctx.save();
  ctx.translate(pose.pelvis.x, pose.pelvis.y);
  ctx.rotate(pose.torsoAngle);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-waistW, waistY);
  ctx.bezierCurveTo(-(waistW + belly * 8), -14, -(shoulderW * 0.95 + belly * 4), -34, -shoulderW, shoulderY);
  ctx.lineTo(-shoulderW * 0.7, neckOffsetY);
  ctx.lineTo(-5, neckOffsetY - 2);
  ctx.lineTo(5, neckOffsetY - 2);
  ctx.lineTo(shoulderW * 0.7, neckOffsetY);
  ctx.lineTo(shoulderW, shoulderY);
  ctx.bezierCurveTo(shoulderW * 0.95 + belly * 4, -34, waistW + belly * 8, -14, waistW, waistY);
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
  // Silhouette arm — solid black upper arm + forearm with a colored glove
  // (the fighter's signature color) at the hand. Back arm gets a slightly
  // darker shade so depth is still readable.
  const body = p.body || p.skin || '#070707';
  const armColor = isBack ? shadeColor(body, -0.25) : body;
  const glove = p.gloves || '#ff3a3a';
  const gloveDark = shadeColor(glove, -0.35);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // SHOULDER cap (blends with torso silhouette)
  ctx.fillStyle = armColor;
  ctx.beginPath();
  ctx.arc(arm.shoulderX, arm.shoulderY, 11 * bd, 0, Math.PI * 2);
  ctx.fill();

  // UPPER ARM
  ctx.strokeStyle = armColor;
  ctx.lineWidth = 14 * bd;
  ctx.beginPath();
  ctx.moveTo(arm.shoulderX, arm.shoulderY);
  ctx.lineTo(arm.elbowX, arm.elbowY);
  ctx.stroke();

  // ELBOW joint
  ctx.fillStyle = armColor;
  ctx.beginPath();
  ctx.arc(arm.elbowX, arm.elbowY, 7 * bd, 0, Math.PI * 2);
  ctx.fill();

  // FOREARM
  ctx.lineWidth = 11 * bd;
  ctx.beginPath();
  ctx.moveTo(arm.elbowX, arm.elbowY);
  ctx.lineTo(arm.handX, arm.handY);
  ctx.stroke();

  // GLOVE — fighter's signature color, simple oval boxing-glove shape
  const wristAngle = Math.atan2(arm.handY - arm.elbowY, arm.handX - arm.elbowX);
  ctx.save();
  ctx.translate(arm.handX, arm.handY);
  ctx.rotate(wristAngle);

  // wrist cuff (dark band at the cuff side of the glove)
  ctx.fillStyle = gloveDark;
  ctx.beginPath();
  ctx.ellipse(-9, 0, 5 * bd, 8 * bd, 0, 0, Math.PI * 2);
  ctx.fill();

  // main glove body
  ctx.fillStyle = glove;
  ctx.beginPath();
  ctx.ellipse(3, 0, 13 * bd, 11 * bd, 0, 0, Math.PI * 2);
  ctx.fill();

  // dark outline so the glove reads against the silhouette
  ctx.strokeStyle = gloveDark;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // thumb knot
  ctx.fillStyle = glove;
  ctx.beginPath();
  ctx.ellipse(-7, 4, 5 * bd, 4 * bd, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = gloveDark;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // soft shine on top
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(-1, -5, 6 * bd, 2 * bd, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.restore();
}

function drawHead(ctx, pose, p, ht, f) {
  // Silhouette head — solid black oval, no facial features. The fighter's
  // identity comes from the HAIR (style + color) drawn on top.
  const body = p.body || p.skin || '#070707';
  const hair = p.hair || '#ffffff';
  const hairShadow = shadeColor(hair, -0.30);
  const hairHilite = shadeColor(hair, 0.25);
  const hairStyle = (p.hairStyle || (f && f.data && f.data.hairStyle) || (f && f.hairStyle) || 'short');

  ctx.save();
  ctx.translate(pose.headOffset.x, pose.headOffset.y);

  // NECK
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-8, 4);
  ctx.lineTo(-10, 14);
  ctx.lineTo(10, 14);
  ctx.lineTo(8, 4);
  ctx.closePath();
  ctx.fill();

  // HEAD silhouette
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 22 * ht, 0, 0, Math.PI * 2);
  ctx.fill();

  // Subtle inner shadow on the lower half of the face to give the head a
  // sense of volume now that the body is rendered in a vibrant color
  // (without this the head reads as a flat colored disk).
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 16, 14 * ht, 0, 0, Math.PI * 2);
  ctx.fill();

  // Minimal eye dots — keeps the silhouette aesthetic but lets the head
  // read as a face. Small, dark, slightly offset toward the facing side.
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.beginPath(); ctx.arc(-4, -2, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4, -2, 1.6, 0, Math.PI * 2); ctx.fill();

  // === HAIR (per-fighter unique style + color) ============================
  ctx.fillStyle = hair;
  switch (hairStyle) {
    case 'spiky': {
      // KAI — short hair with sharp upward spikes
      ctx.beginPath();
      ctx.ellipse(0, -10, 18, 11, 0, Math.PI, 0);
      ctx.fill();
      for (let i = -12; i <= 12; i += 6) {
        ctx.beginPath();
        ctx.moveTo(i - 2, -16);
        ctx.lineTo(i + 1, -26);
        ctx.lineTo(i + 4, -16);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'mohawk': {
      // TONY — sides shaved, tall mohawk
      ctx.fillStyle = hairShadow;
      ctx.beginPath();
      ctx.ellipse(0, -8, 17, 6, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.moveTo(-4, -10);
      ctx.lineTo(-3, -28);
      ctx.lineTo(0, -32);
      ctx.lineTo(3, -28);
      ctx.lineTo(4, -10);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'topknot': {
      // HIRO — bald-ish top with samurai topknot
      ctx.fillStyle = hairShadow;
      ctx.beginPath();
      ctx.ellipse(0, -8, 16, 5, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = hair;
      // band
      ctx.fillRect(-4, -16, 8, 4);
      // bun
      ctx.beginPath();
      ctx.arc(0, -22, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'wild': {
      // BORIS — bushy wild hair, lots of tufts
      ctx.beginPath();
      ctx.ellipse(0, -12, 21, 12, 0, Math.PI, 0);
      ctx.fill();
      const tufts = [[-14, -18], [-7, -22], [0, -24], [7, -22], [14, -18]];
      for (const [x, y] of tufts) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // beard hint
      ctx.beginPath();
      ctx.ellipse(0, 12, 14, 7, 0, 0, Math.PI);
      ctx.fill();
      break;
    }
    case 'long_pony': {
      // RAFA — top hair tied back into a long ponytail
      ctx.beginPath();
      ctx.ellipse(0, -10, 19, 12, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-19, -10, 5, 12);
      ctx.fillRect(14, -10, 5, 12);
      // ponytail extending down behind head (back side)
      ctx.beginPath();
      ctx.moveTo(-12, -2);
      ctx.quadraticCurveTo(-22, 8, -18, 24);
      ctx.lineTo(-13, 24);
      ctx.quadraticCurveTo(-15, 10, -8, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'crew': {
      // AMIR — flat-top crew cut
      ctx.beginPath();
      ctx.moveTo(-15, -10);
      ctx.lineTo(-15, -17);
      ctx.lineTo(15, -17);
      ctx.lineTo(15, -10);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, -10, 16, 4, 0, Math.PI, 0);
      ctx.fill();
      break;
    }
    case 'tall_spike': {
      // JIN — single tall sweeping spike
      ctx.beginPath();
      ctx.ellipse(0, -10, 17, 8, 0, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-6, -16);
      ctx.lineTo(2, -34);
      ctx.lineTo(8, -28);
      ctx.lineTo(8, -16);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'long_flame': {
      // DIANA — long flowing hair with side wisps
      ctx.beginPath();
      ctx.ellipse(0, -10, 20, 13, 0, Math.PI, 0);
      ctx.fill();
      // left flow
      ctx.beginPath();
      ctx.moveTo(-19, -8);
      ctx.quadraticCurveTo(-24, 6, -18, 24);
      ctx.lineTo(-12, 24);
      ctx.quadraticCurveTo(-15, 6, -12, -8);
      ctx.closePath();
      ctx.fill();
      // right flow
      ctx.beginPath();
      ctx.moveTo(19, -8);
      ctx.quadraticCurveTo(24, 6, 18, 24);
      ctx.lineTo(12, 24);
      ctx.quadraticCurveTo(15, 6, 12, -8);
      ctx.closePath();
      ctx.fill();
      // top wisp highlight
      ctx.fillStyle = hairHilite;
      ctx.beginPath();
      ctx.ellipse(-4, -18, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'buzz': {
      // VIKTOR — buzz cut (thin cap)
      ctx.beginPath();
      ctx.ellipse(0, -8, 17, 8, 0, Math.PI, 0);
      ctx.fill();
      break;
    }
    case 'high_pony': {
      // ZARA — top hair pulled into a high ponytail
      ctx.beginPath();
      ctx.ellipse(0, -10, 17, 11, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-17, -10, 4, 4);
      ctx.fillRect(13, -10, 4, 4);
      // high ponytail arc behind
      ctx.beginPath();
      ctx.moveTo(-2, -18);
      ctx.quadraticCurveTo(-16, -22, -22, -8);
      ctx.quadraticCurveTo(-26, 6, -20, 18);
      ctx.lineTo(-14, 16);
      ctx.quadraticCurveTo(-18, 4, -14, -6);
      ctx.quadraticCurveTo(-8, -14, 0, -14);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default: {
      // generic short swept hair
      ctx.beginPath();
      ctx.ellipse(0, -10, 18, 12, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-18, -12, 5, 10);
      ctx.fillRect(13, -12, 5, 10);
    }
  }

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
  // Shorts are a darker shade of the body color (matches main drawFighter
  // logic). p.trunks/p.shorts2 are body-colored after fighters.js
  // normalization, so we shade them down here to keep the shorts visible
  // against the body torso.
  const shortsCol = shadeColor(p.body || p.skin || '#222', -0.55);
  ctx.fillStyle = shortsCol;
  ctx.fillRect(-26 * bd, -6, 52 * bd, 36);
  ctx.fillStyle = shortsCol;
  ctx.fillRect(-26 * bd, 22, 52 * bd, 8);
  // Waistband uses the fighter's accent (glove) color so it's distinct
  // from both the body and the shorts.
  ctx.fillStyle = p.accent || '#ffffff';
  ctx.fillRect(-26 * bd, -10, 52 * bd, 4);
  ctx.restore();
  drawArm(ctx, pose.armBack, p, bd, true);
  drawTorso(ctx, pose, p, bd, ht, fighter);
  drawHead(ctx, pose, p, ht, fs);
  drawArm(ctx, pose.armFront, p, bd, false);
  ctx.restore();
}
