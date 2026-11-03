// Builds map-chunk geometry off the main thread. It runs the same world builder as the page (same data, same seeds),
// so every door, sign and shopfront lands exactly where the page's own world logic expects it, then hands each
// chunk's finished vertex arrays back without copying them.

// textures.js draws its textures on canvases; nothing here renders, so they get a do-nothing canvas
const any = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'width' || k === 'height' ? 1 : any),
  set: () => true, apply: () => any, construct: () => any,
});
self.document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => any }) };

let world = null;
const pending = [];
function handle(m) {
  if (m.type !== 'chunk') return;
  const out = world.geometryFor(m.id), buf = [];
  for (const g of out) buf.push(g.pos.buffer, g.nor.buffer, g.uv.buffer, g.col.buffer);
  self.postMessage({ type: 'chunk', id: m.id, geo: out }, buf);
}
async function init(base) {
  try {
    const THREE = await import('three');
    const { buildWorld } = await import('./world.js');
    const { loadMap } = await import('./map-data.js');
    world = buildWorld(new THREE.Scene(), await loadMap(base), { worker: true });
    self.postMessage({ type: 'ready' });
    for (const m of pending.splice(0)) handle(m);
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.stack) || err) });
  }
}
self.onmessage = (e) => {
  if (e.data.type === 'init') init(e.data.base);
  else if (world) handle(e.data); else pending.push(e.data);
};
