// Keyboard input - tracks held keys and edge-triggered presses.
const held = new Set();
const pressed = new Set(); // edge-triggered (consumed each frame after read)
const listeners = [];

const KEY_MAP = {
  // Movement
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  // Strikes
  KeyJ: 'jab',
  KeyK: 'cross',
  KeyU: 'uppercut',
  KeyL: 'kick',        // mid / body round kick
  KeyO: 'low_kick',    // low (leg) kick
  Semicolon: 'head_kick', // high head kick
  // Defense / special
  KeyI: 'block',
  ShiftLeft: 'dodge', ShiftRight: 'dodge',
  Space: 'special',
  // Grappling
  KeyG: 'grapple',     // initiate clinch / shoot takedown
  KeyT: 'break',       // break clinch / stand up from ground
  KeyF: 'submit',      // attempt submission (context-sensitive)
  KeyE: 'tap_escape',  // (defender) tap to escape submission
  KeyR: 'advance',     // (top) advance ground position
  // System
  KeyP: 'pause', Escape: 'pause',
  Enter: 'enter',
};

window.addEventListener('keydown', (e) => {
  const action = KEY_MAP[e.code];
  if (action) {
    if (!held.has(action)) pressed.add(action);
    held.add(action);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    listeners.forEach((l) => l('down', action));
  }
});

window.addEventListener('keyup', (e) => {
  const action = KEY_MAP[e.code];
  if (action) {
    held.delete(action);
    listeners.forEach((l) => l('up', action));
  }
});

window.addEventListener('blur', () => { held.clear(); pressed.clear(); });

export function isHeld(action) { return held.has(action); }
export function consumePressed(action) {
  if (pressed.has(action)) { pressed.delete(action); return true; }
  return false;
}
export function clearPressed() { pressed.clear(); }
export function clearAll() { held.clear(); pressed.clear(); }
export function onKey(cb) { listeners.push(cb); }

// Programmatic input — used by on-screen touch buttons.
// pressDown/pressUp drive `held` (for movement / block). triggerPress fires a
// single edge-pressed event (for attacks / submissions / etc).
export function pressDown(action) {
  if (!action) return;
  if (!held.has(action)) pressed.add(action);
  held.add(action);
  listeners.forEach((l) => l('down', action));
}
export function pressUp(action) {
  if (!action) return;
  held.delete(action);
  listeners.forEach((l) => l('up', action));
}
export function triggerPress(action) {
  if (!action) return;
  pressed.add(action);
  listeners.forEach((l) => l('down', action));
  // Auto-release on next frame so it acts like a tap.
  setTimeout(() => listeners.forEach((l) => l('up', action)), 0);
}
