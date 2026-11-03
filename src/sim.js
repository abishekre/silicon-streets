// Traffic and people simulated in the map worker (src/world-worker.js) instead of on the page.
// Both sides create the same traffic, people, parked cars and signals (same seeds, same map), so the page's objects
// are mirrors: each frame the worker sends back one packed buffer (instance matrices for every traffic and people
// mesh, plus a small state block per vehicle and person) and the page sends what only it knows: you, the tow truck,
// knocks and tumbles from physics, and flood depths. Buffers go back and forth without being copied.
// If the worker isn't available, everything runs here as before.

const VS = 9, PS = 4; // floats per vehicle (x, z, yaw, fx, fz, speed, flags, steer, y) and per person (x, z, yaw, down)

// where each piece lives in the packed buffer; the same on both sides because the meshes are made the same way
export function simLayout(meshes, colored, nV, nP) {
  let o = meshes.length; // first: the instance count of each mesh
  const mat = meshes.map((m) => { const at = o; o += m.instanceMatrix.count * 16; return at; });
  const col = colored.map((m) => { const at = o; o += m.instanceMatrix.count * 3; return at; });
  const veh = o; o += nV * VS;
  const ped = o; o += nP * PS;
  return { mat, col, veh, ped, size: o };
}
export const meshesOf = (trafficGroup, peopleGroup) => {
  const meshes = [...trafficGroup.children, ...peopleGroup.children].filter((o) => o.isInstancedMesh);
  return { meshes, colored: trafficGroup.children.filter((o) => o.isInstancedMesh && o.instanceColor) };
};

// worker side: write the current state into a buffer
export function packSim(buf, L, meshes, colored, vehicles, peds) {
  meshes.forEach((m, k) => { buf[k] = m.count; buf.set(m.instanceMatrix.array.subarray(0, m.count * 16), L.mat[k]); });
  colored.forEach((m, k) => buf.set(m.instanceColor.array.subarray(0, m.count * 3), L.col[k]));
  let o = L.veh;
  for (const v of vehicles) { buf[o] = v.x; buf[o + 1] = v.z; buf[o + 2] = v.yaw; buf[o + 3] = v.fx; buf[o + 4] = v.fz; buf[o + 5] = v.speed; buf[o + 6] = (v.off ? 1 : 0) | (v.hidden ? 2 : 0); buf[o + 7] = v.steer; buf[o + 8] = v.y; o += VS; }
  o = L.ped;
  for (const p of peds) { buf[o] = p.x; buf[o + 1] = p.z; buf[o + 2] = p.yaw; buf[o + 3] = p.down; o += PS; }
}

// page side
// a copy of a vehicle's or pedestrian's state that can go to the worker: numbers, flags, number arrays and plain
// objects of those. References into the page's own objects (colours, signals, hash cells, neighbours) stay behind.
const SKIP_V = new Set(['col', 'hl', 'hk']), SKIP_P = new Set(['sig', 'at', 'risk', 'obs', 'tumble']);
// (five levels deep at most: anything deeper is a link into shared map data, not state)
function plain(x, d = 0) {
  if (x === null || typeof x !== 'object') return typeof x === 'function' ? undefined : x;
  if (d > 5) return undefined;
  if (ArrayBuffer.isView(x)) return x.slice();
  if (Array.isArray(x)) { const a = x.map((y) => plain(y, d + 1)); return a.includes(undefined) ? undefined : a; }
  if (Object.getPrototypeOf(x) !== Object.prototype) return undefined;
  const o = {}; for (const k in x) { const v = plain(x[k], d + 1); if (v === undefined) return undefined; o[k] = v; } return o;
}
function snap(o, skip) { const out = {}; for (const k in o) if (!skip.has(k)) { const v = plain(o[k]); if (v !== undefined) out[k] = v; } return out; }

export function createSim({ traffic, people, trafficGroup, peopleGroup, ev, audio, flood }) {
  const { meshes, colored } = meshesOf(trafficGroup, peopleGroup);
  const V = traffic.vehicles, P = people.peds;
  const L = simLayout(meshes, colored, V.length, P.length);
  // these are positioned by the worker; it keeps them near you, so no need to cull them here
  for (const m of meshes) m.frustumCulled = false;
  let w = null, mode = 'local', busy = false, pend = null, spare = null, hits = 0, stats = null;
  const dts = [], tumbling = new Set();

  function apply(msg) {
    const b = msg.buf;
    meshes.forEach((m, k) => {
      const n = b[k]; m.count = n;
      m.instanceMatrix.array.set(b.subarray(L.mat[k], L.mat[k] + n * 16));
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, n * 16); m.instanceMatrix.needsUpdate = true;
    });
    colored.forEach((m, k) => {
      m.instanceColor.array.set(b.subarray(L.col[k], L.col[k] + m.count * 3));
      m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, m.count * 3); m.instanceColor.needsUpdate = true;
    });
    let o = L.veh;
    for (const v of V) { v.x = b[o]; v.z = b[o + 1]; v.yaw = b[o + 2]; v.fx = b[o + 3]; v.fz = b[o + 4]; v.speed = b[o + 5]; v.off = (b[o + 6] & 1) > 0; v.hidden = (b[o + 6] & 2) > 0; v.steer = b[o + 7]; v.y = b[o + 8]; v.up = v.y > 2.2; o += VS; }
    o = L.ped;
    for (const p of P) { if (!p.tumble) { p.x = b[o]; p.z = b[o + 1]; p.yaw = b[o + 2]; } p.down = b[o + 3]; o += PS; }
    hits = msg.hits; if (msg.stats) stats = msg.stats;
    for (const e of msg.events) {
      if (e[0] === 'horn') audio.hornAt(e[1], e[2], e[3], e[4] ?? undefined);
      else if (e[0] === 'honked') ev.honked && ev.honked(V[e[1]]);
      else if (e[0] === 'hitPed') ev.hitPed && ev.hitPed(P[e[1]], e[2]);
      else if (e[0] === 'tumble') ev.tumble && ev.tumble(P[e[1]], e[2], e[3]);
      else if (e[0] === 'pedestrian') ev.pedestrian && ev.pedestrian();
    }
    spare = b.buffer;
  }
  function send(t, focus, rain) {
    const knocks = [], ox = [], tum = [];
    for (const v of V) {
      if (v.knockT > 0) knocks.push([v.id, v.knockT, v.kx, v.kz, v.kyaw]);
      // the tow truck nudges oncoming traffic aside by setting these each frame
      if (v.ox || v.oz) { ox.push([v.id, v.ox, v.oz]); v.ox = v.oz = 0; }
    }
    P.forEach((p, i) => {
      const T = p.tumble;
      if (T) { tum.push([i, T.x, T.y, T.z, T.q.x, T.q.y, T.q.z, T.q.w]); tumbling.add(i); }
      else if (tumbling.has(i)) { tum.push([i, -1, p.x, p.z, p.downYaw]); tumbling.delete(i); }
    });
    const zones = flood.zones.filter((z) => z.level > 0.01).map((z) => [z.x, z.z, z.r, z.level, z.max]);
    const blockers = focus.blockers.map((b) => ({ x: b.x, z: b.z, speed: b.speed, r: b.r, isPlayer: b.isPlayer, vx: b.vx, vz: b.vz }));
    const msg = { type: 'step', dts: dts.splice(0), t, rain, zones, knocks, ox, tum, focus: { x: focus.x, z: focus.z, fx: focus.fx, fz: focus.fz, density: focus.density, pdens: focus.pdens, live: focus.live, blockers } };
    if (spare) { msg.ret = spare; w.postMessage(msg, [spare]); spare = null; } else w.postMessage(msg);
    busy = true;
  }
  function onMessage(e) {
    const m = e.data;
    if (m.type === 'simReady') {
      // hand the worker where everything is now, so traffic carries on instead of jumping to the worker's own start
      w.postMessage({ type: 'simSync', V: V.map((v) => snap(v, SKIP_V)), P: P.map((p) => snap(p, SKIP_P)) });
      mode = 'remote'; console.info('[silicon-streets] traffic and people now run in the worker');
    }
    else if (m.type === 'state') { if (pend) spare = pend.buf.buffer; pend = m; busy = false; }
    else if (m.type === 'simError') { console.warn('[silicon-streets] simulation worker failed, running it here', m.message); mode = 'local'; }
  }
  return {
    get mode() { return mode; }, get stats() { return stats; },
    attach(worker) { w = worker; w.addEventListener('message', onMessage); w.postMessage({ type: 'simInit' }); },
    // one simulation step, in place of traffic.update + people.update
    step(dt, t, focus, rain) {
      if (mode !== 'remote') { traffic.update(dt, focus, ev); people.update(dt, t, focus, rain, ev); return; }
      if (pend) { apply(pend); pend = null; }
      // knocked vehicles count down here too, so physics hands them back at the same moment the worker does
      for (const v of V) if (v.knockT > 0) v.knockT -= dt;
      focus.blockers[0].hits = hits;
      people.animateCows(t);
      dts.push(dt);
      // one step in flight at a time; frames that pass meanwhile are simulated together in the next one
      if (!busy) send(t, focus, rain);
    },
  };
}
