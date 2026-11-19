// Central keymap: action → [primary, secondary] key codes (KeyboardEvent.code), saved in localStorage 'blr.keys'.
// Gameplay asks input.down(action) for held keys and input.pressed(action) for one-shot presses; every hint uses input.label().
// Esc (pause / close) and 1-9 (menu items) are fixed.
export const ACTIONS = [
  ['forward', 'Drive / walk forward', 'Move', ['KeyW', 'ArrowUp']],
  ['back', 'Brake / reverse / walk back', 'Move', ['KeyS', 'ArrowDown']],
  ['left', 'Steer / walk left', 'Move', ['KeyA', 'ArrowLeft']],
  ['right', 'Steer / walk right', 'Move', ['KeyD', 'ArrowRight']],
  ['jump', 'Handbrake · jump · climb', 'Move', ['Space', null]],
  ['run', 'Run (on foot)', 'Move', ['ShiftLeft', 'ShiftRight']],
  ['interact', 'Interact (cafés, carts, metro, rides)', 'Actions', ['KeyE', null]],
  ['vehicle', 'Get out / get in', 'Actions', ['KeyF', null]],
  ['call', 'Call your vehicle · roadside mechanic', 'Actions', ['KeyG', null]],
  ['horn', 'Horn', 'Actions', ['KeyH', null]],
  ['accept', 'Accept a job', 'Actions', ['KeyY', null]],
  ['decline', 'Decline a job', 'Actions', ['KeyN', null]],
  ['switchVehicle', 'Switch vehicle', 'Actions', ['KeyV', null]],
  ['radio', 'Radio (in a vehicle)', 'Actions', ['KeyK', null]],
  ['phone', 'Phone', 'Interface', ['Tab', null]],
  ['map', 'Map · drop a pin', 'Interface', ['KeyM', null]],
  ['camera', 'Camera mode', 'Interface', ['KeyC', null]],
  ['photo', 'Photo mode', 'Interface', ['KeyP', null]],
  ['controls', 'Controls list', 'Interface', ['KeyI', null]],
  ['mute', 'Mute', 'Interface', ['KeyU', null]],
  ['stats', 'Performance stats', 'Interface', ['F3', null]], // time, weather and live sync: Settings → Gameplay
];
export const FIXED = ['Escape', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
// standard-mapping gamepad buttons: A B X Y, LB RB, back start, L3, d-pad up / down / right
const PAD = { interact: 0, vehicle: 1, horn: 2, camera: 3, call: 4, jump: 5, map: 8, run: 10, accept: 12, decline: 13, phone: 15 };
const PAD_LABEL = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 8: 'Back', 10: 'L3', 12: 'D-pad up', 13: 'D-pad down', 15: 'D-pad right' };

const NAMES = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R Shift', ControlLeft: 'Ctrl', ControlRight: 'R Ctrl', AltLeft: 'Alt', AltRight: 'R Alt', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Enter', Backspace: 'Backspace', Escape: 'Esc', Tab: 'Tab', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' };
export const keyName = (code) => !code ? '' : NAMES[code] || code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ');

export function createInput() {
  const DEF = Object.fromEntries(ACTIONS.map(([a, , , k]) => [a, [...k]]));
  let map = structuredClone(DEF);
  try { const s = JSON.parse(localStorage.getItem('blr.keys') || 'null'); if (s) for (const a in s) if (map[a] && Array.isArray(s[a])) map[a] = [s[a][0] || null, s[a][1] || null]; } catch (e) { /* storage blocked */ }
  const save = () => { try { localStorage.setItem('blr.keys', JSON.stringify(map)); } catch (e) { /* private mode */ } };
  const held = new Set(), fired = new Set();
  const pad = { x: 0, y: 0, rx: 0, ry: 0, rt: 0, lt: 0, on: false, prev: [] };
  const actionsFor = (code) => ACTIONS.filter(([a]) => map[a].includes(code)).map(([a]) => a);

  // keyboard: the overlay stack decides first; only gameplay keys reach here
  function keydown(e) { if (e.repeat) return; held.add(e.code); for (const a of actionsFor(e.code)) fired.add(a); }
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());

  const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
  // gamepad: sticks and triggers are analog, buttons fire actions; Start and B are handed to onButton (pause / back)
  function poll(onButton) {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
    pad.on = !!gp; if (!gp) { pad.x = pad.y = pad.rx = pad.ry = pad.rt = pad.lt = 0; return; }
    const b = gp.buttons.map((x) => x.pressed), was = pad.prev;
    pad.x = dz(gp.axes[0] || 0); pad.y = dz(gp.axes[1] || 0); pad.rx = dz(gp.axes[2] || 0); pad.ry = dz(gp.axes[3] || 0);
    pad.rt = gp.buttons[7] ? gp.buttons[7].value : 0; pad.lt = gp.buttons[6] ? gp.buttons[6].value : 0;
    b.forEach((on, i) => { if (on && !was[i]) { if (onButton && onButton(i)) return; for (const a in PAD) if (PAD[a] === i) fired.add(a); } });
    pad.prev = b;
  }
  const padDown = (a) => pad.on && PAD[a] != null && !!pad.prev[PAD[a]];

  return {
    ACTIONS, pad, keydown, poll, actionsFor,
    down: (a) => map[a].some((k) => k && held.has(k)) || padDown(a),
    pressed: (a) => fired.delete(a),
    flush: () => fired.clear(),
    is: (code, a) => map[a].includes(code),
    keys: (a) => map[a],
    label: (a) => keyName(map[a][0] || map[a][1]) || 'unbound',
    kbd: (a) => `<kbd>${keyName(map[a][0] || map[a][1]) || '?'}</kbd>`,
    padLabel: (a) => PAD_LABEL[PAD[a]] || '',
    // returns the action/slot already using this key (caller may swap), or null after binding it
    conflict(a, code) { for (const [b] of ACTIONS) { const i = map[b].indexOf(code); if (i >= 0 && !(b === a)) return { action: b, slot: i }; } return null; },
    bind(a, slot, code, swapWith) {
      if (swapWith) map[swapWith.action][swapWith.slot] = map[a][slot];
      const j = map[a].indexOf(code); if (j >= 0 && j !== slot) map[a][j] = null;
      map[a][slot] = code; save();
    },
    reset() { map = structuredClone(DEF); save(); },
    get held() { return held; },
  };
}
