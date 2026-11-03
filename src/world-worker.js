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
    for (const m of pending.splice(0)) dispatch(m);
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.stack) || err) });
  }
}
// ---------- traffic and people (see src/sim.js): the same objects as the page's, stepped here ----------
let sim = null;
async function simInit() {
  try {
    const THREE = await import('three');
    const { createTraffic, createParked } = await import('./vehicles.js');
    const { createPeople } = await import('./people.js');
    const { createSignals } = await import('./signals.js');
    const { meshesOf, simLayout, packSim } = await import('./sim.js');
    const gT = new THREE.Group(), gP = new THREE.Group(), gX = new THREE.Group();
    const events = [];
    const audio = { hornAt: (type, x, z, vol) => events.push(['horn', type, x, z, vol ?? null]) };
    const traffic = createTraffic(gT, world, audio), people = createPeople(gP, world);
    createParked(gX, world); // people step round the parked cars, so they need them too
    const signals = createSignals(gX, world);
    traffic.setPeds(people.peds);
    const pedIdx = new Map(people.peds.map((p, i) => [p, i]));
    const ev = {
      honked: (v) => events.push(['honked', v.id]), pedestrian: () => events.push(['pedestrian']),
      hitPed: (p, speed) => events.push(['hitPed', pedIdx.get(p), speed]), tumble: (p, vx, vz) => events.push(['tumble', pedIdx.get(p), vx, vz]),
    };
    const { meshes, colored } = meshesOf(gT, gP);
    const L = simLayout(meshes, colored, traffic.vehicles.length, people.peds.length);
    const noUi = { toast() {} }, noWallet = { money: 0 };
    let zones = [], frame = 0;
    const depthAt = (px, pz) => { let d = 0; for (const [x, z, r, level, max] of zones) { const k = Math.hypot(px - x, pz - z) / (r * (0.35 + 0.65 * level / max)); if (k < 1) d = Math.max(d, level * (1 - k * k)); } return d; };
    sim = { THREE, traffic, people, signals, events, ev, meshes, colored, L, packSim, noUi, noWallet, depthAt, setZones: (z) => { zones = z; }, frame: () => ++frame };
    self.postMessage({ type: 'simReady' });
  } catch (err) {
    self.postMessage({ type: 'simError', message: String((err && err.stack) || err) });
  }
}
function simStep(m) {
  const S = sim, V = S.traffic.vehicles, P = S.people.peds;
  for (const [i, knockT, kx, kz, kyaw] of m.knocks) Object.assign(V[i], { knockT, kx, kz, kyaw });
  for (const [i, ox, oz] of m.ox) { V[i].ox = ox; V[i].oz = oz; }
  for (const [i, x, y, z, qx, qy, qz, qw] of m.tum) {
    const p = P[i];
    if (x === -1) { p.tumble = null; p.x = y; p.z = z; p.downYaw = qx; }
    else { const T = p.tumble || (p.tumble = { q: new S.THREE.Quaternion() }); T.x = x; T.y = y; T.z = z; T.q.set(qx, qy, qz, qw); }
  }
  S.setZones(m.zones);
  const focus = { ...m.focus, drag: (x, z) => 1 - Math.min(0.7, S.depthAt(x, z) * 2.2) };
  let t = m.t - m.dts.reduce((a, b) => a + b, 0);
  for (const dt of m.dts) {
    t += dt;
    S.signals.update(dt, null, S.noUi, S.noWallet);
    S.traffic.update(dt, focus, S.ev);
    S.people.update(dt, t, focus, m.rain, S.ev);
  }
  const buf = m.ret ? new Float32Array(m.ret) : new Float32Array(S.L.size);
  S.packSim(buf, S.L, S.meshes, S.colored, V, P);
  const out = { type: 'state', buf, events: S.events.splice(0), hits: focus.blockers[0] ? focus.blockers[0].hits || 0 : 0 };
  if (S.frame() % 60 === 0) out.stats = { ...S.traffic.stats, overlaps: S.traffic.overlaps() };
  self.postMessage(out, [buf.buffer]);
}
function dispatch(m) {
  if (m.type === 'simInit') simInit();
  // the page's traffic and people at takeover (src/sim.js)
  else if (m.type === 'simSync' && sim) {
    m.V.forEach((v, i) => Object.assign(sim.traffic.vehicles[i], v)); m.P.forEach((p, i) => Object.assign(sim.people.peds[i], p));
    sim.traffic.adopt(); sim.people.adopt();
  }
  else if (m.type === 'step') {
    // a failed step hands the simulation back to the page (src/sim.js runs it there) instead of freezing traffic
    if (sim) try { simStep(m); } catch (err) { sim = null; self.postMessage({ type: 'simError', message: String((err && err.stack) || err) }); }
  }
  else handle(m);
}
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') init(m.base);
  else if (!world) pending.push(m); else dispatch(m);
};
