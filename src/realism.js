import * as THREE from 'three';
import { box, merge, part, makeRng } from './util.js';
import { textTexture } from './textures.js';

// Everyday Bengaluru on the road: fuel (petrol for scooters and cars, CNG for autos, with the CNG queue),
// speed breakers (some painted, most not), speed cameras that send you an e-challan, and BESCOM power cuts at night.
const TANK = { auto: { unit: 'kg CNG', size: 8, price: 92, perKm: 2.4 }, scooter: { unit: 'L petrol', size: 5, price: 103, perKm: 1.4 }, car: { unit: 'L petrol', size: 40, price: 103, perKm: 2.8 } };
const MAJOR = new Set(['primary', 'secondary', 'tertiary', 'trunk']);
const LIMIT = 50 / 3.6; // speed cameras flash above 50 km/h

export function createRealism({ world, ui, audio, player, game, hooks }) {
  const rng = makeRng(2024);
  const W = game.wallet;
  const fuel = { auto: 70, scooter: 80, car: 60 };
  let lastOdo = player.odometer, warned = 0;

  // ---------- fuel stations along the main roads ----------
  const bunks = [];
  const roads = world.roads.filter((r) => r.drive && MAJOR.has(r.k) && r.pts.length > 1);
  for (let tries = 0; tries < 400 && bunks.length < 7; tries++) {
    const r = roads[Math.floor(rng() * roads.length)], i = Math.floor(rng() * (r.pts.length - 1));
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], len = Math.hypot(bx - ax, bz - az); if (len < 30) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len, t = 0.5, side = rng() < 0.5 ? 1 : -1;
    const nx = dz * side, nz = -dx * side, off = r.hw + 6;
    const x = ax + dx * len * t + nx * off, z = az + dz * len * t + nz * off;
    if (!world.inMap(x, z, 150) || world.insideBuilding(x, z, 6) || bunks.some((b) => Math.hypot(b.x - x, b.z - z) < 450)) continue;
    const cng = bunks.filter((b) => b.cng).length < 3 && (bunks.length % 2 === 0);
    bunks.push({ x, z, cng, road: r.n || 'the main road', name: cng ? `Namma CNG Station${r.n ? `, ${r.n}` : ''}` : `Namma Petrol Bunk${r.n ? `, ${r.n}` : ''}`, yaw: Math.atan2(dx, dz) });
  }
  const signTex = { cng: textTexture(['NAMMA CNG', 'autos only · queue here'], { w: 512, h: 160, bg: '#00796b', fg: '#fff', font: '700 44px "Space Grotesk"' }), pet: textTexture(['NAMMA PETROL', 'petrol · diesel · air'], { w: 512, h: 160, bg: '#e65100', fg: '#fff', font: '700 44px "Space Grotesk"' }) };
  for (const k of ['cng', 'pet']) world.addStatic('bunk_' + k, [], { material: new THREE.MeshStandardMaterial({ map: signTex[k], emissive: '#ffffff', emissiveMap: signTex[k], emissiveIntensity: 0.3, side: THREE.DoubleSide }) });
  for (const b of bunks) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(b.x, 0, b.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw), new THREE.Vector3(1, 1, 1));
    const col = b.cng ? '#00897b' : '#ef6c00';
    const g = merge([
      box(11, 0.5, 8, 0, 5.2, 0, '#f5f5f5'), box(11.1, 0.3, 8.1, 0, 4.85, 0, col), // canopy
      ...[[-4.8, -3.4], [4.8, -3.4], [-4.8, 3.4], [4.8, 3.4]].map(([x, z]) => box(0.35, 4.8, 0.35, x, 2.4, z, '#e0e0e0')),
      ...[-2, 2].map((x) => box(0.8, 1.7, 0.5, x, 0.85, 0, col)), ...[-2, 2].map((x) => box(1.2, 0.2, 0.9, x, 0.1, 0, '#9e9e9e')),
      box(0.25, 6, 0.25, 6.5, 3, -3.5, '#555'),
    ]);
    g.applyMatrix4(m); world.addStatic('concrete', [g]);
    const s = part(new THREE.PlaneGeometry(2.6, 0.8).translate(6.5, 6.4, -3.35), '#ffffff'); s.applyMatrix4(m);
    world.addStatic(b.cng ? 'bunk_cng' : 'bunk_pet', [s]);
    for (const [x, z] of [[-4.8, -3.4], [4.8, -3.4], [-4.8, 3.4], [4.8, 3.4]]) { const v = new THREE.Vector3(x, 0, z).applyMatrix4(m); world.addCircle(v.x, v.z, 0.3, 'pole', 5); }
  }

  // ---------- speed breakers near junctions (about a third painted) ----------
  const breakers = [], bgrid = new Map(), BC = 40, key = (x, z) => Math.floor(x / BC) + ',' + Math.floor(z / BC);
  const humps = { painted: [], plain: [] };
  for (const r of world.roads) {
    if (!r.drive || MAJOR.has(r.k) || r.pts.length < 2) continue;
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

  // E at a bunk while driving (game.addDriveAction)
  function fillAction(p) {
    for (const b of bunks) {
      const d = Math.hypot(p.x - b.x, p.z - b.z); if (d > 9) continue;
      const T = TANK[player.type], wantsCng = player.type === 'auto';
      if (wantsCng !== b.cng) return { d, label: b.cng ? 'ask for petrol (this is a CNG station)' : 'ask for CNG (petrol bunk)', run: () => ui.toast(b.cng ? 'CNG only' : 'No CNG here', b.cng ? 'Petrol bunks are elsewhere on the map.' : 'Autos fill CNG at the green stations (on the map).', 'warning') };
      const need = Math.max(0, 100 - fuel[player.type]), qty = need / 100 * T.size, cost = Math.ceil(qty * T.price);
      if (need < 2) return { d, label: 'tank is full', run: () => ui.toast('Already full', '"Full tank, saar. Want air in the tyres?"', 'info') };
      return { d, label: `fill up (${qty.toFixed(1)} ${T.unit}, ₹${cost})`, run: () => fill(b, qty, cost) };
    }
    return null;
  }
  function fill(b, qty, cost) {
    if (Math.abs(player.speed) > 1) return ui.toast('Stop first', 'Switch off and stop at the pump.', 'warning');
    let paid = cost, part = 1;
    if (W.money < cost) { part = W.money / cost; paid = Math.floor(W.money); }
    if (paid <= 0) return ui.toast('No money', 'Earn some first, or take a garage loan.', 'cash');
    W.spend(paid, b.cng ? 'CNG fill-up' : 'Petrol fill-up');
    fuel[player.type] = Math.min(100, fuel[player.type] + (100 - fuel[player.type]) * part); player.dry = false;
    audio.cash && audio.cash();
    // the CNG queue is a Bengaluru institution
    if (b.cng) hooks.rest(0.4, 2, part < 1 ? `₹${paid} worth of CNG after a 25-minute queue. Half a tank of patience.` : '25 minutes in the CNG queue. Twelve autos, one nozzle, one man on a plastic chair running it all.');
    else ui.toast('Tank filled', `₹${paid} · ${part < 1 ? 'as much as your money allows' : '"Zero check maadi, saar."'}`, 'cash');
  }

  const near = [];
  function update(dt, s) {
    const type = player.type, T = TANK[type];
    // ---- fuel use while driving
    const km = Math.max(0, player.odometer - lastOdo) / 1000; lastOdo = player.odometer;
    if (s.mode === 'drive' && km > 0) {
      fuel[type] = Math.max(0, fuel[type] - km * T.perKm * (Math.abs(player.speed) > 12 ? 1.25 : 1));
      if (fuel[type] < 15 && warned < 1) { warned = 1; ui.toast(type === 'auto' ? 'Low on CNG' : 'Low on fuel', `${Math.round(fuel[type])}% left. ${type === 'auto' ? 'CNG stations' : 'Petrol bunks'} are on the map.`, 'warning'); }
      if (fuel[type] <= 0 && !player.dry) { player.dry = true; ui.toast(type === 'auto' ? 'Out of CNG' : 'Out of fuel', `The engine coughs and stops. Press ${ui.kbd('call')} for Mechanic Anna to bring a can.`, 'warning'); }
      if (fuel[type] > 20) warned = 0;
    }
    // ---- speed breakers: hit one fast and you'll know
    if (s.mode === 'drive') {
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
          const hurt = (v - 4) * 1.0 * (player.stats.susp ?? 1); player.damage(hurt);
          audio.bump && audio.bump(Math.min(1, v / 10)); game.onPothole && game.onPothole();
          if (v > 7) ui.toast(b.painted ? 'Speed breaker!' : 'Unmarked speed breaker!', b.painted ? 'It was painted. You just didn\'t look.' : 'No paint, no sign, no mercy. Classic.', 'warning');
        }
      }
      // ---- speed cameras
      for (const c of cams) {
        c.cd -= dt;
        if (c.cd > 0 || Math.hypot(p.x - c.x, p.z - c.z) > 14) continue;
        const kmh = Math.abs(player.speed) * 3.6;
        if (Math.abs(player.speed) > LIMIT) {
          c.cd = 30; const amt = kmh > 70 ? 100 : 50; // satire, not a tax: small enough to laugh at
          W.fine(amt, `e-challan: ${Math.round(kmh)} km/h on ${c.road}`); s.flash && s.flash();
          (s.notify || ui.toast)('Speed camera', `Flash! ${Math.round(kmh)} km/h in a 50 zone on ${c.road}. e-challan ₹${amt}. It will reach you by post in 2031.`, 'camera');
        }
      }
    }
    // ---- BESCOM power cuts: at night, now and then, the whole area goes dark for a while
    if (s.lights > 0.5) {
      if (!power.out && (power.next -= dt) <= 0) { power.out = true; power.t = 45 + rng() * 60; ui.toast('Power cut', 'BESCOM strikes again. Streetlights out, generators coughing to life.', 'bulb'); audio.hum && audio.hum(); }
      if (power.out && (power.t -= dt) <= 0) { power.out = false; power.next = 300 + rng() * 400; ui.toast('Power is back', 'Everyone cheers from their balconies.', 'bulb'); }
    } else if (power.out) { power.out = false; power.next = 300; }
  }
  return {
    bunks, cams, breakers, fillAction, update,
    // street lighting multiplier for the world (power cuts)
    get lightsK() { return power.out ? 0.08 : 1; },
    get fuel() { return fuel[player.type]; },
    // fast travel: the drive you skipped still uses fuel
    burn(km) { fuel[player.type] = Math.max(0, fuel[player.type] - km * TANK[player.type].perKm); lastOdo = player.odometer; },
    refuel(pct, cost, label) { W.fine(cost, label); fuel[player.type] = Math.min(100, fuel[player.type] + pct); player.dry = false; },
    markers() { return bunks.map((b) => ({ x: b.x, z: b.z, c: b.cng ? '#26a69a' : '#ff9800', icon: 'F' })); },
    places() { return bunks.map((b) => ({ name: b.name, x: b.x, z: b.z, icon: 'drop' })); },
    save: () => ({ fuel: { ...fuel } }),
    load(s) { if (s && s.fuel) Object.assign(fuel, s.fuel); player.dry = fuel[player.type] <= 0; },
  };
}
