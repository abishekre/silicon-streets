import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { part, box, merge, makeRng, damp, clamp } from './util.js';

const SHIRTS = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fafafa', '#8e24aa', '#ff7043', '#00897b', '#5d4037', '#f06292', '#3949ab', '#b59b6a', '#26a69a', '#ffb74d'];
const PANTS = ['#1f2a44', '#222222', '#6d5a3f', '#37474f', '#4e342e', '#1a237e', '#455a64'];
const SKIN = ['#8d5a3b', '#a8714a', '#6e4429', '#c18a5e', '#7a4b2f'];
const UMB = ['#111111', '#111111', '#1a237e', '#c62828', '#f9a825', '#6a1b9a'];
const C0 = [0.002, 0.002];
const hyp = (x, z) => Math.sqrt(x * x + z * z);

// Body parts are built around their joint so they can swing: legs hang from the hip, arms from the shoulder.
export function personGeos() {
  const leg = merge([part(new THREE.CapsuleGeometry(0.08, 0.66, 1, 6).translate(0, -0.42, 0), '#fff'), box(0.13, 0.08, 0.24, 0, -0.85, 0.05, '#2a2a2a')]);
  const arm = part(new THREE.CapsuleGeometry(0.058, 0.5, 1, 5).translate(0, -0.31, 0), '#fff');
  const torsoG = new RoundedBoxGeometry(0.44, 0.62, 0.26, 1, 0.09); torsoG.translate(0, 1.2, 0);
  const torso = merge([part(torsoG, '#fff'), box(0.38, 0.16, 0.24, 0, 0.88, 0, '#555')]);
  const headG = new THREE.SphereGeometry(0.125, 10, 7); headG.scale(1, 1.1, 1); headG.translate(0, 1.66, 0);
  const hairG = new THREE.SphereGeometry(0.132, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.55); hairG.translate(0, 1.68, -0.01);
  const neckG = new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8); neckG.translate(0, 1.53, 0);
  const head = merge([part(headG, '#fff'), part(hairG, '#141414'), part(neckG, '#fff')]);
  const umb = merge([part(new THREE.ConeGeometry(0.75, 0.35, 8).translate(0, 2.25, 0), '#fff'), part(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 4).translate(0.12, 1.75, 0), '#999')]);
  // jointed legs for characters that sit or walk up close: thigh hangs from the hip, shin from the knee
  const thigh = part(new THREE.CapsuleGeometry(0.085, 0.3, 1, 6).translate(0, -0.22, 0), '#fff');
  const shin = merge([part(new THREE.CapsuleGeometry(0.075, 0.32, 1, 6).translate(0, -0.2, 0), '#fff'), box(0.13, 0.08, 0.25, 0, -0.43, 0.05, '#2a2a2a')]);
  return { leg, arm, torso, head, umb, thigh, shin };
}

// A posable character (used for the player on foot)
export function createCharacter(scene, { shirt = '#b59b6a', pants = '#2b2b33', skin = '#8d5a3b' } = {}) {
  const g = personGeos();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, vertexColors: true });
  const root = new THREE.Group();
  const mk = (geo, c, x = 0, y = 0) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, 0); m.castShadow = true; root.add(m); return m; };
  const parts = {
    torso: mk(g.torso, shirt), head: mk(g.head, skin),
    legL: mk(g.thigh, pants, -0.1, 0.92), legR: mk(g.thigh, pants, 0.1, 0.92),
    armL: mk(g.arm, shirt, -0.28, 1.45), armR: mk(g.arm, shirt, 0.28, 1.45),
  };
  for (const k of ['legL', 'legR']) {
    const knee = new THREE.Mesh(g.shin, parts[k].material); knee.position.y = -0.44; knee.castShadow = true;
    parts[k].add(knee); parts[k + 'Knee'] = knee;
  }
  scene.add(root);
  let phase = 0;
  function animate(dt, speed, sitting = false) {
    phase += dt * (2 + speed * 2.2);
    const amp = Math.min(0.75, speed * 0.28);
    const s = Math.sin(phase) * amp;
    if (sitting) {
      // thighs forward on the seat, shins hanging down from bent knees
      parts.legL.rotation.x = parts.legR.rotation.x = -1.5; parts.legLKnee.rotation.x = parts.legRKnee.rotation.x = 1.5;
      parts.armL.rotation.x = parts.armR.rotation.x = -0.55;
      return;
    }
    parts.legL.rotation.x = s; parts.legR.rotation.x = -s;
    parts.legLKnee.rotation.x = 0.08 + Math.max(0, Math.sin(phase + 1.3)) * amp * 1.3;
    parts.legRKnee.rotation.x = 0.08 + Math.max(0, Math.sin(phase + 1.3 + Math.PI)) * amp * 1.3;
    parts.armL.rotation.x = -s * 0.8; parts.armR.rotation.x = s * 0.8;
    const bob = Math.abs(Math.cos(phase)) * amp * 0.06;
    for (const k of ['torso', 'head']) parts[k].position.y = bob;
    parts.legL.position.y = parts.legR.position.y = 0.92 + bob;
    parts.armL.position.y = parts.armR.position.y = 1.45 + bob;
  }
  return { root, parts, animate };
}

export function createPeople(scene, world) {
  const rng = makeRng(31);
  const { nodes, edges, grid } = world.graph;
  const N = 180;
  const g = personGeos();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: true });
  const mk = (geo) => { const m = new THREE.InstancedMesh(geo, mat, N); m.castShadow = true; scene.add(m); return m; };
  const I = { legL: mk(g.leg), legR: mk(g.leg), armL: mk(g.arm), armR: mk(g.arm), torso: mk(g.torso), head: mk(g.head), umb: mk(g.umb) };
  const bound = new THREE.Sphere(new THREE.Vector3(), 215);
  for (const k of Object.keys(I)) I[k].boundingSphere = bound;
  const c = new THREE.Color();
  const peds = [];
  for (let i = 0; i < N; i++) {
    const shirt = rng.pick(SHIRTS), pants = rng.pick(PANTS);
    I.legL.setColorAt(i, c.set(pants)); I.legR.setColorAt(i, c); I.torso.setColorAt(i, c.set(shirt)); I.armL.setColorAt(i, c); I.armR.setColorAt(i, c);
    I.head.setColorAt(i, c.set(rng.pick(SKIN))); I.umb.setColorAt(i, c.set(rng.pick(UMB)));
    peds.push({ idleCap: i % 3 === 0, idle: null, e: 0, s: 0, dir: 1, side: 1, lat: 2, lj: rng() * 0.6, v: rng.range(0.9, 1.5), push: 0, ph: rng() * 6, umbrella: rng() < 0.75, jog: false, path: null, x: 1e6, z: 1e6, yaw: 0,
      leg: 0, road: 0, risk: [], vx: 0, vz: 0, wait: 0, pat: rng.range(3, 14), obs: [], dodge: 0, endS: 0, turn: false, cross: false, sig: null, kind: 0, ax: 0, az: 0, bx: 0, bz: 0, cx: 0, cz: 0, ne: 0, nd: 1, ns: 1, n0: 0,
      down: 0, downYaw: 0, angry: 0, at: null, tumble: null });
  }
  // Cubbon Park footpaths for joggers
  const parkPaths = world.roads.filter((r) => ['footway', 'path'].includes(r.k) && world.cubbon && r.pts.length > 1 && r.pts.some((p) => hyp(p[0] - world.cubbon.pts[0][0], 0) >= 0));
  const cubbonPaths = world.cubbon ? parkPaths.filter((r) => { const m = r.pts[Math.floor(r.pts.length / 2)]; return m[0] > world.cubbon.x1 && m[0] < world.cubbon.x2 && m[1] > world.cubbon.z1 && m[1] < world.cubbon.z2; }) : [];

  const cand = [], near = [];
  const stats = { crossings: 0, atSignal: 0, atZebra: 0, midBlock: 0 };
  const inEdges = nodes.map(() => []);
  edges.forEach((e, i) => inEdges[e.b].push(i));
  // the roads meeting at a node, sorted anticlockwise: which way each leaves the node, how wide it is, an edge to walk along it
  const armCache = new Map();
  function armsOf(ni) {
    let a = armCache.get(ni); if (a) return a;
    a = [];
    const add = (ei, ed) => { const e = edges[ei], nb = ed > 0 ? e.b : e.a; if (a.some((o) => o.nb === nb)) return; const ux = e.dx * ed, uz = e.dz * ed; a.push({ ei, ed, nb, ux, uz, w: e.w, len: e.len, ang: Math.atan2(uz, ux) }); };
    for (const ei of nodes[ni].out) add(ei, 1);
    for (const ei of inEdges[ni]) add(ei, -1);
    a.sort((p, q) => p.ang - q.ang);
    a.maxW = 0; for (const o of a) a.maxW = Math.max(a.maxW, o.w);
    armCache.set(ni, a); return a;
  }
  // footpaths run at least 2.2 m out from the edge of the carriageway: clear of the cars parked half on the kerb
  const footLat = (w, p) => w / 2 + 2.2 + p.lj;
  // where the footpaths of two neighbouring roads meet: road A's anticlockwise side, road B's clockwise side
  const C = { x: 0, z: 0 };
  function corner(n, A, Bm, p, out) {
    const la = footLat(A.w, p), lb = footLat(Bm.w, p);
    const ax = n.x - A.uz * la, az = n.z + A.ux * la, bx = n.x + Bm.uz * lb, bz = n.z - Bm.ux * lb;
    const det = A.ux * Bm.uz - A.uz * Bm.ux, t = det > 0.25 ? ((bx - ax) * Bm.uz - (bz - az) * Bm.ux) / det : -99;
    if (t > -2 && t < 18) { out.x = ax + A.ux * t; out.z = az + A.uz * t; } else { out.x = (ax + bx) / 2; out.z = (az + bz) / 2; }
  }
  const STEP_ROUND = { parked: 1, prop: 1, tree: 1, pole: 1 };
  function clearSpot(x, z) {
    world.items(x, z, 2.2, near);
    for (const it of near) if (it.type === 'circle' && STEP_ROUND[it.tag] && hyp(it.x - x, it.z - z) < it.r + 0.6) return false;
    return !world.insideBuilding(x, z, 0.3);
  }
  // not standing on some other road's carriageway (sharp junctions put kerbs close together)
  const offRoad = (x, z) => { const nr = world.nearestRoad(x, z, 12); return !nr || nr.d > nr.r.hw + 0.4; };
  // parked cars, carts' chairs, trees and poles along this stretch of footpath, to step around
  function obstacles(p) {
    const e = edges[p.e], L = footLat(e.w, p); p.obs.length = 0;
    for (let s = 0; s < e.len + 16; s += 16) {
      const t = Math.min(s, e.len);
      world.items(e.ax + e.dx * t + e.dz * L * p.side, e.az + e.dz * t - e.dx * L * p.side, 11, near);
      for (const it of near) {
        if (it.type !== 'circle' || !STEP_ROUND[it.tag] || it.knocked || p.obs.includes(it)) continue;
        // only what actually sits on (or reaches) this footpath line
        const rx = it.x - e.ax, rz = it.z - e.az, along = rx * e.dx + rz * e.dz, lo = (rx * e.dz - rz * e.dx) * p.side;
        if (along > -2 && along < e.len + 2 && Math.abs(lo - L) < it.r + 1.1) p.obs.push(it);
      }
    }
  }
  // decide now what to do at the far end of this stretch: walk round the corner, or cross one of the roads there
  function plan(p) {
    const e = edges[p.e], ni = p.dir > 0 ? e.b : e.a, back = p.dir > 0 ? e.a : e.b, n = nodes[ni], A = armsOf(ni), k = A.length;
    p.cross = false; p.turn = false; p.sig = null;
    if (k < 2) { p.turn = true; p.endS = p.dir > 0 ? Math.max(p.s, e.len - 1) : Math.min(p.s, 1); return; }
    let i = 0; for (let q = 0; q < k; q++) if (A[q].nb === back) { i = q; break; }
    // which side of the road we're on decides which corner we arrive at
    const cr = (A[i].ux * -e.dx - A[i].uz * e.dz) * p.side, c = cr > 0 ? i : (i - 1 + k) % k, j = c === i ? (c + 1) % k : c;
    corner(n, A[c], A[(c + 1) % k], p, C);
    p.endS = clamp((C.x - e.ax) * e.dx + (C.z - e.az) * e.dz, 0, e.len);
    if ((p.endS - p.s) * p.dir < 0) p.endS = p.s;
    const r = Math.random();
    // at junctions: round the corner, across the side road, or back across this one; elsewhere now and then straight across
    let X = k >= 3 ? (r < 0.35 ? -1 : r < 0.8 ? j : i) : r < 0.07 && A[i].w >= 6 && e.len > 20 ? i : -1;
    if (X >= 0) {
      const R = A[X], d0 = k >= 3 ? A.maxW / 2 + 2.6 : 1.5, kb = R.w / 2 + 0.9;
      const nx = c === X ? -R.uz : R.uz, nz = c === X ? R.ux : -R.ux;
      let ok = false;
      // the zebra spot, or a little either side of it if a parked car is in the way
      for (const d of [d0, d0 + 3, d0 - 1.5, d0 + 6]) {
        if (d < 0.5 || d > R.len * 0.6) continue;
        const sx = n.x + R.ux * d + nx * kb, sz = n.z + R.uz * d + nz * kb, ex = n.x + R.ux * d - nx * kb, ez = n.z + R.uz * d - nz * kb;
        if (clearSpot(sx, sz) && clearSpot(ex, ez) && offRoad(sx, sz) && offRoad(ex, ez)) { p.ax = sx; p.az = sz; p.bx = ex; p.bz = ez; ok = true; break; }
      }
      if (!ok) X = -1;
    }
    let cc = c, Y = j;
    if (X >= 0) {
      p.cross = true; p.sig = k >= 3 ? n.signal || null : null; p.kind = k < 3 ? 2 : p.sig ? 0 : 1;
      cc = c === X ? (X - 1 + k) % k : X; Y = cc === X ? (X + 1) % k : cc;
      corner(n, A[cc], A[(cc + 1) % k], p, C);
    }
    // where to pick up the footpath of the road we leave by
    const ar = A[Y], ne = edges[ar.ei];
    p.ne = ar.ei; p.nd = ar.ed; p.ns = cc === Y ? -ar.ed : ar.ed;
    p.n0 = clamp((C.x - ne.ax) * ne.dx + (C.z - ne.az) * ne.dz, 0, ne.len);
    const L = footLat(ne.w, p);
    p.cx = ne.ax + ne.dx * p.n0 + ne.dz * L * p.ns; p.cz = ne.az + ne.dz * p.n0 - ne.dx * L * p.ns;
  }
  // stretches of a footpath that run across another road's carriageway (sharp junctions), as [from, to] pairs along the edge
  const riskCache = new Map();
  function risky(ei, side) {
    const key = ei * 2 + (side > 0 ? 1 : 0); let r = riskCache.get(key);
    if (r) return r;
    r = []; const e = edges[ei], L = e.w / 2 + 2.5;
    for (let s = 0; s <= e.len + 2.9; s += 3) {
      const t = Math.min(s, e.len), nr = world.nearestRoad(e.ax + e.dx * t + e.dz * L * side, e.az + e.dz * t - e.dx * L * side, 14);
      if (!nr || nr.d > nr.r.hw + 1.2) continue;
      if (r.length && r[r.length - 1] >= t - 3.5) r[r.length - 1] = t + 2.5; else r.push(t - 2.5, t + 2.5);
    }
    riskCache.set(key, r); return r;
  }
  function startEdge(p, ei, dir, side, s) {
    const e = edges[ei];
    p.e = ei; p.dir = dir; p.side = side; p.s = s; p.leg = 0; p.road = 0; p.dodge = 0; p.lat = footLat(e.w, p); p.risk = risky(ei, side);
    obstacles(p); plan(p);
  }
  // hangout spots: people chatting at carts and outside cafés, standing in little circles
  const hang = [...world.vendors.map((v) => ({ x: v.x, z: v.z })), ...world.doors.map((d) => ({ x: d.x + d.nx * 1.5, z: d.z + d.nz * 1.5 }))];
  function spawnIdle(p, fx, fz) {
    const near0 = hang.filter((h) => { const d = hyp(h.x - fx, h.z - fz); return d > 20 && d < 170; });
    if (!near0.length) return false;
    const h = near0[Math.floor(Math.random() * near0.length)], a = Math.random() * 6.28, r = 1.1 + Math.random() * 0.8;
    const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
    if (!clearSpot(x, z)) return false;
    // not out on the carriageway
    const nr = world.nearestRoad(x, z, 16); if (nr && nr.d < nr.r.hw + 1) return false;
    p.idle = { x, z, yaw: Math.atan2(h.x - x, h.z - z) }; p.x = x; p.z = z; p.yaw = p.idle.yaw; p.path = null; p.road = 0;
    return true;
  }
  function spawn(p, fx, fz, rMin, rMax) {
    p.road = 0; p.leg = 0; p.wait = 0; p.vx = p.vz = 0;
    if (p.idleCap && spawnIdle(p, fx, fz)) return;
    p.idle = null;
    for (let t = 0; t < 20; t++) {
      const a = Math.random() * 6.283, d = rMin + Math.random() * (rMax - rMin), x = fx + Math.cos(a) * d, z = fz + Math.sin(a) * d;
      if (cubbonPaths.length && Math.random() < 0.18 && world.cubbon && x > world.cubbon.x1 && x < world.cubbon.x2 && z > world.cubbon.z1 && z < world.cubbon.z2) {
        const r = cubbonPaths[Math.floor(Math.random() * cubbonPaths.length)];
        const cum = [0]; for (let i = 1; i < r.pts.length; i++) cum.push(cum[i - 1] + hyp(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
        p.path = { pts: r.pts, cum, L: cum[cum.length - 1] }; p.s = Math.random() * p.path.L; p.jog = Math.random() < 0.6; p.dir = Math.random() < 0.5 ? 1 : -1; pos(p); return;
      }
      grid.query(x, z, 50, cand); if (!cand.length) continue;
      const ei = cand[Math.floor(Math.random() * cand.length)].i, e = edges[ei]; if (e.len < 3) continue;
      p.path = null; p.jog = false;
      const s = Math.random() * e.len, L = footLat(e.w, p);
      let side = Math.random() < 0.5 ? -1 : 1;
      const at = (sd) => world.insideBuilding(e.ax + e.dx * s + e.dz * L * sd, e.az + e.dz * s - e.dx * L * sd, 0.4);
      if (at(side)) { side = -side; if (at(side)) continue; }
      startEdge(p, ei, Math.random() < 0.5 ? 1 : -1, side, s); pos(p);
      if (!clearSpot(p.x, p.z) || (peds.vehAt && peds.vehAt(p.x, p.z, 1))) continue;
      return;
    }
    // nowhere free right now: off stage, try again next frame
    p.x = p.z = 1e6; p.road = 0;
  }
  function pos(p) {
    if (p.path) {
      const L = p.path; let i = 1; while (i < L.cum.length - 1 && L.cum[i] < p.s) i++;
      const a = L.pts[i - 1], b = L.pts[i], t = (p.s - L.cum[i - 1]) / ((L.cum[i] - L.cum[i - 1]) || 1);
      p.x = a[0] + (b[0] - a[0]) * t; p.z = a[1] + (b[1] - a[1]) * t; p.yaw = Math.atan2((b[0] - a[0]) * p.dir, (b[1] - a[1]) * p.dir);
      return;
    }
    const e = edges[p.e], L = p.lat + p.dodge;
    p.x = e.ax + e.dx * p.s + e.dz * L * p.side; p.z = e.az + e.dz * p.s - e.dx * L * p.side;
    p.yaw = Math.atan2(e.dx * p.dir, e.dz * p.dir);
  }
  // the nearest body circle of a vehicle to a point (its centre goes in VC); returns the gap to its edge
  const VC = { x: 0, z: 0 };
  function vgap(o, x, z) {
    const n = o.long > 2 ? 5 : o.long ? 3 : 1; let best = Infinity;
    for (let k = 0; k < n; k++) {
      const off = n > 1 ? (k / (n - 1) * 2 - 1) * o.long : 0, cx = o.x + o.fx * off, cz = o.z + o.fz * off, d = hyp(x - cx, z - cz) - o.r;
      if (d < best) { best = d; VC.x = cx; VC.z = cz; }
    }
    return best;
  }
  // a vehicle is in the way: slide round its nearest corner towards (tx, tz), drifting outwards if it's very close.
  // (Standing still would leave the two waiting on each other.)
  function slide(p, o, tx, tz, step) {
    const g0 = vgap(o, p.x, p.z);
    let rx = p.x - VC.x, rz = p.z - VC.z; const l = hyp(rx, rz) || 1; rx /= l; rz /= l;
    let ux = -rz, uz = rx; if (ux * (tx - p.x) + uz * (tz - p.z) < 0) { ux = -ux; uz = -uz; }
    const out = g0 < 0.45 ? 0.6 : 0.15, sx = p.x + (ux + rx * out) * step, sz = p.z + (uz + rz * out) * step;
    const o2 = peds.vehAt(sx, sz, 0.3);
    if ((o2 && (o2 !== o || vgap(o, sx, sz) < g0)) || world.insideBuilding(sx, sz, 0.2)) return false;
    p.x = sx; p.z = sz; return true;
  }
  // one step along the footpath, round obstacles, and on through corners and crossings
  function walk(p, i, sp, dt) {
    if (p.leg === 0) {
      const e = edges[p.e], s0 = p.s;
      p.s += p.dir * sp * dt;
      // where the footpath cuts across another road, be in traffic's list and don't walk into a vehicle
      p.road = 0;
      for (let k = 0; k < p.risk.length; k += 2) if (p.s > p.risk[k] && p.s < p.risk[k + 1]) { p.road = 1; break; }
      if ((p.s - p.endS) * p.dir >= 0) { p.s = p.endS; if (p.turn) { p.dir = -p.dir; plan(p); } else p.leg = p.cross ? 1 : 4; }
      // step round anything on the footpath (on the inside if there's room, else the outside)
      let want = 0;
      for (const o of p.obs) {
        const rx = o.x - e.ax, rz = o.z - e.az, along = rx * e.dx + rz * e.dz;
        if (Math.abs(along - p.s) > o.r + 1.4) continue;
        const lo = (rx * e.dz - rz * e.dx) * p.side, L = p.lat + want, clr = o.r + 0.5;
        if (Math.abs(lo - L) >= clr) continue;
        const inner = lo - clr - p.lat, outer = lo + clr - p.lat;
        want = p.lat + inner >= e.w / 2 + 2 && -inner < outer ? inner : outer;
      }
      p.dodge += clamp(want - p.dodge, -1.6 * dt, 1.6 * dt);
      pos(p);
      const o = p.road && peds.vehAt && peds.vehAt(p.x, p.z, 0.45);
      if (o) { p.s = s0; pos(p); p.vx = p.vz = 0; return; }
      p.vx = e.dx * p.dir * sp; p.vz = e.dz * p.dir * sp;
      // a building right on the footpath (or a dodge into one): turn back
      if ((i + frameNo) % 12 === 0 && world.insideBuilding(p.x, p.z, 0.3)) { p.dir = -p.dir; p.dodge = 0; plan(p); }
      return;
    }
    if (p.leg === 2) {
      // at the kerb, looking for a gap (or the green man at a signal)
      p.road = 0; p.vx = p.vz = 0; p.yaw = Math.atan2(p.bx - p.ax, p.bz - p.az); p.wait += dt;
      if ((i + frameNo) % 6) return;
      const need = hyp(p.bx - p.ax, p.bz - p.az) / sp + 1.5, cc = peds.crossClear;
      const go = p.sig ? (p.sig.pedGo() && p.sig.pedLeft() > need * 0.6 || p.wait > 75) && (!cc || cc(p.ax, p.az, p.bx, p.bz, 0, true))
        : !cc || cc(p.ax, p.az, p.bx, p.bz, need, p.wait > p.pat);
      if (go) { p.leg = 3; p.road = 1; stats.crossings++; if (p.kind === 0) stats.atSignal++; else if (p.kind === 1) stats.atZebra++; else stats.midBlock++; }
      return;
    }
    // legs 1 (to the kerb), 3 (across) and 4 (on to the next footpath): straight lines
    const tx = p.leg === 1 ? p.ax : p.leg === 3 ? p.bx : p.cx, tz = p.leg === 1 ? p.az : p.leg === 3 ? p.bz : p.cz;
    const dx = tx - p.x, dz = tz - p.z, d = hyp(dx, dz), step = Math.min(sp * dt, d);
    if (d > 1e-4) { p.yaw = Math.atan2(dx, dz); p.vx = dx / d * sp; p.vz = dz / d * sp; }
    const nx = d > 1e-4 ? p.x + dx / d * step : tx, nz = d > 1e-4 ? p.z + dz / d * step : tz;
    // never step into a vehicle: wait for it to stop or pass
    p.road = 1;
    const o = peds.vehAt && peds.vehAt(nx, nz, 0.45);
    if (o) { if (!slide(p, o, tx, tz, sp * dt)) p.vx = p.vz = 0; return; }
    p.x = nx; p.z = nz;
    if (step < d) return;
    if (p.leg === 1) { p.leg = 2; p.wait = 0; p.road = 0; } else if (p.leg === 3) p.leg = 4; else startEdge(p, p.ne, p.nd, p.ns, p.n0);
  }

  // cows: the true owners of the road
  const cowG = merge([
    part(new RoundedBoxGeometry(0.9, 0.85, 2.0, 2, 0.2).translate(0, 1.15, 0), '#f1ece2'),
    part(new RoundedBoxGeometry(0.46, 0.5, 0.66, 2, 0.12).translate(0, 1.45, 1.2), '#f1ece2'),
    box(0.3, 0.26, 0.25, 0, 1.33, 1.6, '#d9b8a0'),
    box(0.05, 0.3, 0.05, -0.2, 1.8, 1.15, '#d8c7a6'), box(0.05, 0.3, 0.05, 0.2, 1.8, 1.15, '#d8c7a6'),
    part(new RoundedBoxGeometry(0.4, 0.3, 0.6, 2, 0.1).translate(0, 1.68, -0.1), '#e8e0d2'),
    ...[[-0.3, 0.7], [0.3, 0.7], [-0.3, -0.7], [0.3, -0.7]].map(([x, z]) => part(new THREE.CylinderGeometry(0.08, 0.07, 0.75, 6).translate(x, 0.37, z), '#e5ddd0')),
    box(0.06, 0.7, 0.06, 0, 1.1, -1.05, '#ccc2b2'),
  ]);
  const cowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const cows = [];
  const res = edges.filter((e) => ['residential', 'unclassified', 'tertiary'].includes(e.k) && e.len > 20 && hyp(e.ax, e.az) < 900);
  for (let i = 0; i < 16 && res.length; i++) {
    const e = res[Math.floor(rng() * res.length)], s = rng.range(5, e.len - 5), lat = e.w / 2 - 0.8;
    const x = e.ax + e.dx * s + e.dz * lat, z = e.az + e.dz * s - e.dx * lat, yaw = Math.atan2(e.dx, e.dz) + rng.range(-0.5, 0.5);
    const m = new THREE.Mesh(cowG, cowMat); m.position.set(x, 0, z); m.rotation.y = yaw; m.castShadow = true; scene.add(m);
    cows.push({ x, z, yaw, m, ph: rng() * 6 });
  }
  // traffic steers round (or stops for) the cows, and gives way to people on the road
  peds.cows = cows; peds.stats = stats;

  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), qs = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(1, 0, 0);
  const sc = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), pv = new THREE.Vector3(), off = new THREE.Vector3();
  let started = false, frameNo = 0;
  function setLimb(mesh, i, x, z, yaw, lx, ly, swing) {
    q.setFromAxisAngle(up, yaw); qs.setFromAxisAngle(ax, swing); q.multiply(qs);
    off.set(lx, 0, 0).applyAxisAngle(up, yaw);
    mtx.compose(pv.set(x + off.x, ly, z + off.z), q, sc); mesh.setMatrixAt(i, mtx);
  }
  // draw a whole person from a base transform (used for knocked-down and angry poses)
  const bq = new THREE.Quaternion(), tq = new THREE.Quaternion(), ov = new THREE.Vector3(), ax2 = new THREE.Vector3(1, 0, 0);
  function pose(i, x, y, z, base, legL, legR, armL, armR) {
    mtx.compose(pv.set(x, y, z), base, sc); I.torso.setMatrixAt(i, mtx); I.head.setMatrixAt(i, mtx);
    mtx.compose(pv, base, zero); I.umb.setMatrixAt(i, mtx);
    for (const [mesh, lx, ly, sw] of [[I.legL, -0.1, 0.92, legL], [I.legR, 0.1, 0.92, legR], [I.armL, -0.28, 1.45, armL], [I.armR, 0.28, 1.45, armR]]) {
      ov.set(lx, ly, 0).applyQuaternion(base); tq.copy(base).multiply(qs.setFromAxisAngle(ax2, sw));
      mtx.compose(pv.set(x + ov.x, y + ov.y, z + ov.z), tq, sc); mesh.setMatrixAt(i, mtx);
    }
  }
  // someone got hit: everyone nearby stops and turns on you
  function alarm(x, z) { for (const p of peds) if (hyp(p.x - x, p.z - z) < 30 && !p.down) { p.angry = 5 + Math.random() * 3; p.at = { x, z }; } }
  function update(dt, t, focus, rain, ev) {
    if (!started) { started = true; for (const p of peds) { spawn(p, focus.x, focus.z, 5, 160); } }
    const um = rain > 0.15;
    frameNo++;
    // liveliness decides how many of the pool are out; the rest aren't drawn or simulated
    // pdens follows the day: office rush, quiet afternoons, evening crowds, near-empty nights
    const active = Math.round(N * (focus.live ? focus.live.people : 0.5) * (focus.pdens ?? 1));
    for (const k of Object.keys(I)) I[k].count = active;
    peds.forEach((p, i) => {
      if (i >= active) { p.x = p.z = 1e6; p.road = 0; return; }
      if (hyp(p.x - focus.x, p.z - focus.z) > 200) spawn(p, focus.x, focus.z, 90, 170);
      if (p.idle) { p.x = p.idle.x; p.z = p.idle.z; }
      // a vehicle driven by you at speed knocks people over (they get up, angry)
      if (!p.down) for (const b of focus.blockers) {
        if (!b.isPlayer || b.speed < 4) continue;
        if (hyp(p.x - b.x, p.z - b.z) < (b.r || 1.1) + 0.3) { p.down = 5; p.downYaw = Math.atan2(p.x - b.x, p.z - b.z); ev && ev.hitPed && ev.hitPed(p, b.speed); ev && ev.tumble && ev.tumble(p, b.vx || 0, b.vz || 0); alarm(p.x, p.z); }
      }
      if (p.down > 0) {
        p.down -= dt;
        // thrown by the hit (physics body), limbs flailing
        if (p.tumble) { const T = p.tumble, w = Math.sin(t * 14); pose(i, T.x, T.y, T.z, T.q, 0.5 * w, -0.5 * w, -2 + w, 2 - w); return; }
        bq.setFromAxisAngle(up, p.downYaw).multiply(qs.setFromAxisAngle(ax2, -Math.PI / 2 * Math.min(1, (5 - p.down) * 3)));
        pose(i, p.x, 0.14 * Math.min(1, (5 - p.down) * 3), p.z, bq, 0.2, -0.3, -1.2, 0.6);
        if (p.down <= 0) { p.angry = 4; p.at = { x: focus.x, z: focus.z }; }
        return;
      }
      if (p.angry > 0) {
        // shouting, arms up, facing whoever did it
        p.angry -= dt; const yaw = Math.atan2(p.at.x - p.x, p.at.z - p.z), wave = Math.sin(t * 9 + p.ph) * 0.4;
        bq.setFromAxisAngle(up, yaw); pose(i, p.x, 0, p.z, bq, 0, 0, -2.4 + wave, -2.6 - wave);
        return;
      }
      if (p.idle) {
        // chatting: stand still, gesture now and then
        const g = Math.sin(t * 1.3 + p.ph) * 0.25;
        q.setFromAxisAngle(up, p.idle.yaw); mtx.compose(pv.set(p.idle.x, 0, p.idle.z), q, sc);
        I.torso.setMatrixAt(i, mtx); I.head.setMatrixAt(i, mtx); mtx.compose(pv.set(p.idle.x, 0, p.idle.z), q, zero); I.umb.setMatrixAt(i, mtx);
        setLimb(I.legL, i, p.idle.x, p.idle.z, p.idle.yaw, -0.1, 0.92, 0); setLimb(I.legR, i, p.idle.x, p.idle.z, p.idle.yaw, 0.1, 0.92, 0);
        setLimb(I.armL, i, p.idle.x, p.idle.z, p.idle.yaw, -0.28, 1.45, 0.1); setLimb(I.armR, i, p.idle.x, p.idle.z, p.idle.yaw, 0.28, 1.45, -0.4 + g);
        return;
      }
      const sp = p.jog ? p.v * 2.2 : p.v;
      if (p.path) {
        // joggers keep to the park paths; where one crosses a road they're in traffic's list and won't run into a vehicle
        if ((i + frameNo) % 8 === 0) { const nr = world.nearestRoad(p.x, p.z, 12); p.road = nr && nr.d < nr.r.hw + 0.5 ? 1 : 0; }
        const s0 = p.s; p.s += p.dir * sp * dt;
        if (p.s > p.path.L) { p.s = p.path.L; p.dir = -1; } else if (p.s < 0) { p.s = 0; p.dir = 1; }
        pos(p);
        if (p.road && peds.vehAt && peds.vehAt(p.x, p.z, 0.45)) { p.s = s0; pos(p); }
        p.vx = Math.sin(p.yaw) * sp; p.vz = Math.cos(p.yaw) * sp;
      } else walk(p, i, sp, dt);
      // people far from you only get their limbs re-posed every other frame
      if ((i + frameNo) & 1 && Math.abs(p.x - focus.x) + Math.abs(p.z - focus.z) > 90) return;
      let x = p.x, z = p.z;
      for (const b of focus.blockers) {
        const dx = x - b.x, dz = z - b.z, d = hyp(dx, dz);
        if (d < 3.2 && b.speed > 2) { p.push = Math.min(p.push + dt * 8, 2.5); if (d < 1.6) ev && ev.pedestrian(); }
      }
      p.push = damp(p.push, 0, 0.6, dt);
      x += Math.cos(p.yaw) * p.push; z -= Math.sin(p.yaw) * p.push;
      const swing = Math.sin(t * sp * 3.4 + p.ph) * (p.jog ? 0.8 : 0.45);
      const bob = Math.abs(Math.cos(t * sp * 3.4 + p.ph)) * 0.04;
      q.setFromAxisAngle(up, p.yaw); mtx.compose(pv.set(x, bob, z), q, sc);
      I.torso.setMatrixAt(i, mtx); I.head.setMatrixAt(i, mtx);
      mtx.compose(pv.set(x, bob, z), q, (um && p.umbrella && !p.jog) ? sc : zero); I.umb.setMatrixAt(i, mtx);
      setLimb(I.legL, i, x, z, p.yaw, -0.1, 0.92 + bob, swing); setLimb(I.legR, i, x, z, p.yaw, 0.1, 0.92 + bob, -swing);
      setLimb(I.armL, i, x, z, p.yaw, -0.28, 1.45 + bob, -swing * 0.8); setLimb(I.armR, i, x, z, p.yaw, 0.28, 1.45 + bob, (um && p.umbrella && !p.jog) ? -1.2 : swing * 0.8);
    });
    for (const k of Object.keys(I)) I[k].instanceMatrix.needsUpdate = true;
    // one shared bound for all body parts: everyone is within 200 m of you
    bound.center.set(focus.x, 1, focus.z);
    animateCows(t);
  }
  // (when the simulation runs in the worker, the page only does this part)
  function animateCows(t) { for (const cw of cows) cw.m.rotation.y = cw.yaw + Math.sin(t * 0.3 + cw.ph) * 0.15; }

  function collideCows(p, r) {
    for (const cw of cows) {
      const dx = p.x - cw.x, dz = p.z - cw.z, d = hyp(dx, dz), rr = r + 1.1;
      if (d < rr && d > 1e-5) { p.x += dx / d * (rr - d); p.z += dz / d * (rr - d); return { nx: dx / d, nz: dz / d, depth: rr - d, tag: 'cow' }; }
    }
    return null;
  }
  return { update, animateCows, collideCows, cows, peds, alarm };
}

export function createPassengerMesh(scene) {
  const ch = createCharacter(scene, { shirt: '#ff7043', pants: '#263238', skin: '#a8714a' });
  return ch.root;
}

export function createBeam(scene, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 40, 24, 1, true), mat);
  m.position.y = 20;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
  ring.position.y = 0.1;
  const grp = new THREE.Group(); grp.add(m, ring); scene.add(grp);
  return grp;
}
