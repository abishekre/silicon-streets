// Overlay stack: pause | settings | map | menu | photo | phone. Every keydown goes through key() first.
// Esc closes the top layer; Esc with nothing open shows the pause menu. state.paused is true while pause, settings
// or map is open: tick() then skips the simulation and the clock, and the world is dimmed and blurred behind.
// A layer registered with `pass: true` (the phone) only keeps the keys it handles; the rest reach gameplay.
const PAUSES = new Set(['pause', 'settings', 'map']);

export function createOverlays(state, onChange) {
  const layers = {}, stack = [];
  const sync = () => {
    state.paused = stack.some((n) => PAUSES.has(n));
    document.body.classList.toggle('paused', state.paused);
    document.body.dataset.overlay = stack[stack.length - 1] || '';
    onChange && onChange(stack[stack.length - 1] || null);
  };
  const top = () => stack[stack.length - 1] || null;
  function open(name, ...args) {
    if (!layers[name]) return;
    const i = stack.indexOf(name); if (i >= 0) stack.splice(i, 1);
    stack.push(name); sync(); layers[name].show && layers[name].show(...args);
  }
  // close the named layer (default: top). `self` = the layer already hid itself (e.g. picked a map pin)
  function close(name = top(), self = false) {
    const i = stack.indexOf(name); if (i < 0) return;
    stack.splice(i, 1); sync();
    if (!self && layers[name].hide) layers[name].hide();
  }
  function key(e) {
    const t = top();
    if (!t) {
      if (e.code === 'Escape' && state.started) { e.preventDefault(); open('pause'); return true; }
      return false;
    }
    if (layers[t].key && layers[t].key(e)) return true;
    if (e.code === 'Escape') { e.preventDefault(); close(t); return true; }
    return !layers[t].pass; // an open layer swallows everything else
  }
  return {
    register: (name, l) => { layers[name] = l; }, open, close, key, top,
    has: (n) => stack.includes(n), clear: () => { while (stack.length) close(); },
    get stack() { return [...stack]; },
  };
}
