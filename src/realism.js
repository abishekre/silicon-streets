import { box, merge, makeRng } from './util.js';

// Everyday Bengaluru on the road, as satire rather than chores: speed breakers (some painted, most not) that bump
// you, speed cameras that flash and send a joke e-challan, and BESCOM power cuts at night.
const MAJOR = new Set(['primary', 'secondary', 'tertiary', 'trunk']);
const LIMIT = 50 / 3.6; // speed cameras flash above 50 km/h

export function createRealism({ world, ui, audio, player, game }) {
  const rng = makeRng(2024);
  const W = game.wallet;
  const roads = world.roads.filter((r) => r.drive && !r.l && MAJOR.has(r.k) && r.pts.length > 1);

  // ---------- speed breakers near junctions (about a third painted) ----------
  const breakers = [], bgrid = new Map(), BC = 40, key = (x, z) => Math.floor(x / BC) + ',' + Math.floor(z / BC);
  const humps = { painted: [], plain: [] };
  for (const r of world.roads) {
    if (!r.drive || r.l || MAJOR.has(r.k) || r.pts.length < 2) continue;
    for (const end of [0, 1]) {
      const p = end ? r.pts[r.pts.length - 1] : r.pts[0], q = end ? r.pts[r.pts.length - 2] : r.pts[1];
      if (!world.junctionR(p) || rng() > 0.35) continue;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]); if (len < 30) continue;
      const dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len, s = 16, x = p[0] + dx * s, z = p[1] + dz * s;
      if (!world.inMap(x, z, 100)) continue;
      const painted = rng() < 0.35, b = { x, z, dx, dz, hw: r.hw, painted, armed: true };
      breakers.push(b); const k = key(x, z); (bgrid.get(k) || bgrid.set(k, []).get(k)).push(b);
      const yaw = Math.atan2(dx, dz), w = r.w;
      const parts = painted ? Array.from({ length: Math.ceil(w / 0.6) }, (_, i) => box(0.6, 0.12, 0.9, -w / 2 + 0.3 + i * 0.6, 0.11, 0, i % 2 ? '#fdd835' : '#212121')) : [box(w, 0.12, 0.9, 0, 0.11, 0, '#4a4a4a')];
      const g = merge(parts); g.rotateY(yaw); g.translate(x, 0, z); (painted ? humps.painted : humps.plain).push(g);
    }
  }
  world.addStatic('prop', humps.painted); world.addStatic('prop', humps.plain);

  // ---------- speed cameras on main roads ----------
  const cams = [];
  for (let tries = 0; tries < 300 && cams.length < 6; tries++) {
    const r = roads[Math.floor(rng() * roads.length)], i = Math.floor(rng() * (r.pts.length - 1));
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], len = Math.hypot(bx - ax, bz - az); if (len < 40) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len, x = (ax + bx) / 2, z = (az + bz) / 2;
    if (cams.some((c) => Math.hypot(c.x - x, c.z - z) < 300) || !world.inMap(x, z, 150)) continue;
    const px = x + dz * (r.hw + 1), pz = z - dx * (r.hw + 1);
    if (world.insideBuilding(px, pz, 0.5)) continue;
    cams.push({ x, z, road: r.n || 'a main road', cd: 0 });
    world.addStatic('concrete', [merge([box(0.18, 6.5, 0.18, px, 3.25, pz, '#616161'), box(0.6, 0.4, 0.4, px - dz * 0.4, 6.4, pz + dx * 0.4, '#212121'), box(0.12, 0.12, 0.05, px - dz * 0.4, 6.4, pz + dx * 0.4 - 0.21, '#e53935')])]);
    world.addCircle(px, pz, 0.25, 'pole', 6);
  }

  // ---------- power cuts ----------
  const power = { out: false, t: 0, next: 120 + rng() * 240 };

  const near = [];
  function update(dt, s) {
    if (s.mode === 'drive') {
      // ---- speed breakers: a jolt, never damage
      const p = player.pos;
      near.length = 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = bgrid.get((Math.floor(p.x / BC) + i) + ',' + (Math.floor(p.z / BC) + j)); if (l) near.push(...l); }
      for (const b of near) {
        const rx = p.x - b.x, rz = p.z - b.z, along = rx * b.dx + rz * b.dz, lat = Math.abs(rx * b.dz - rz * b.dx);
        if (Math.abs(along) > 2.5 || lat > b.hw + 1) { b.armed = true; continue; }
        if (!b.armed || Math.abs(along) > 0.5) continue;
        b.armed = false;
        const v = Math.abs(player.speed);
        if (v > 4) {
          player.bump = 1; s.shake && s.shake(Math.min(1, v / 12));
          audio.bump && audio.bump(Math.min(1, v / 10));
          if (v > 9) (s.flavour || ui.dialogue)(b.painted ? 'Speed breaker! It was painted. You just didn\'t look.' : 'Unmarked speed breaker. No paint, no sign, no mercy.');
        }
      }
      // ---- speed cameras: a flash and a joke
      for (const c of cams) {
        c.cd -= dt;
        if (c.cd > 0 || Math.hypot(p.x - c.x, p.z - c.z) > 14) continue;
        const kmh = Math.abs(player.speed) * 3.6;
        if (Math.abs(player.speed) > LIMIT) {
          c.cd = 30; const amt = 50;
          W.fine(amt, `e-challan: ${Math.round(kmh)} km/h on ${c.road}`); s.flash && s.flash();
          (s.notify || ui.toast)('Speed camera', `Flash! ${Math.round(kmh)} km/h on ${c.road}. e-challan ₹${amt}, arriving by post in 2031.`, 'camera');
        }
      }
    }
    // ---- BESCOM power cuts: at night, now and then, the whole area goes dark for a while
    if (s.lights > 0.5) {
      if (!power.out && (power.next -= dt) <= 0) { power.out = true; power.t = 45 + rng() * 60; (s.flavour || ui.dialogue)('Power cut! BESCOM strikes again. Generators cough to life.'); audio.hum && audio.hum(); }
      if (power.out && (power.t -= dt) <= 0) { power.out = false; power.next = 300 + rng() * 400; }
    } else if (power.out) { power.out = false; power.next = 300; }
  }
  return {
    cams, breakers, update,
    // street lighting multiplier for the world (power cuts)
    get lightsK() { return power.out ? 0.08 : 1; },
  };
}
