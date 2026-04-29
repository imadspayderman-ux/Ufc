// Synthesized SFX via Web Audio API (no copyrighted assets).
let ctx = null;
let muted = false;

function ensure() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function envGain(when, attack, decay, peak = 0.5) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  return g;
}

// Explicitly disconnect a finished node graph so long sessions don't slowly
// accumulate orphaned WebAudio nodes (Chrome won't always GC them quickly,
// and SFX fire dozens of times per second during heavy combat).
function cleanup(node, ...others) {
  node.onended = () => {
    try { node.disconnect(); } catch (_) { /* ignore */ }
    for (const n of others) {
      try { n && n.disconnect(); } catch (_) { /* ignore */ }
    }
  };
}

function tone(freq, dur, type = 'sine', gain = 0.3, when = 0) {
  if (!ensure() || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  const g = envGain(t, 0.005, dur, gain);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
  cleanup(o, g);
}

function sweep(f1, f2, dur, type = 'sawtooth', gain = 0.25) {
  if (!ensure() || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  const g = envGain(t, 0.005, dur, gain);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
  cleanup(o, g);
}

function noise(dur, gain = 0.3, lp = 1500) {
  if (!ensure() || muted) return;
  const t = ctx.currentTime;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(lp, t);
  const g = envGain(t, 0.005, dur, gain);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t);
  cleanup(src, filter, g);
}

export const SFX = {
  click() { tone(800, 0.05, 'square', 0.15); },
  hover() { tone(600, 0.03, 'sine', 0.08); },
  jab() { sweep(700, 200, 0.06, 'sawtooth', 0.18); noise(0.05, 0.15, 800); },
  cross() { sweep(500, 100, 0.1, 'sawtooth', 0.25); noise(0.08, 0.22, 600); },
  kick() { sweep(400, 80, 0.14, 'square', 0.2); noise(0.1, 0.18, 500); },
  block() { tone(180, 0.1, 'square', 0.15); noise(0.05, 0.12, 1200); },
  hit() { sweep(300, 100, 0.12, 'sawtooth', 0.3); noise(0.1, 0.25, 700); },
  hitHard() { sweep(220, 60, 0.18, 'square', 0.4); noise(0.16, 0.32, 500); },
  ko() {
    sweep(300, 60, 0.6, 'sawtooth', 0.35);
    setTimeout(() => sweep(150, 40, 0.4, 'square', 0.3), 200);
    noise(0.4, 0.3, 400);
  },
  bell() {
    tone(880, 0.5, 'triangle', 0.3);
    setTimeout(() => tone(660, 0.4, 'triangle', 0.25), 80);
  },
  countdown() { tone(440, 0.1, 'square', 0.18); },
  fight() {
    tone(1100, 0.12, 'square', 0.3);
    setTimeout(() => tone(1500, 0.18, 'square', 0.3), 120);
  },
  special() {
    sweep(120, 1200, 0.4, 'sawtooth', 0.3);
    setTimeout(() => sweep(1200, 80, 0.6, 'square', 0.35), 200);
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.25), i * 110));
  },
  lose() {
    [440, 330, 220, 165].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sawtooth', 0.22), i * 130));
  },
};

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }
