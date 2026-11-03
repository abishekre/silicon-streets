import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { part, box, merge, makeRng, damp } from './util.js';

const SHIRTS = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fafafa', '#8e24aa', '#ff7043', '#00897b', '#5d4037', '#f06292', '#3949ab', '#b59b6a', '#26a69a', '#ffb74d'];
const PANTS = ['#1f2a44', '#222222', '#6d5a3f', '#37474f', '#4e342e', '#1a237e', '#455a64'];
const SKIN = ['#8d5a3b', '#a8714a', '#6e4429', '#c18a5e', '#7a4b2f'];
const UMB = ['#111111', '#111111', '#1a237e', '#c62828', '#f9a825', '#6a1b9a'];
const C0 = [0.002, 0.002];

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
  const c = new THREE.Color();
  const peds = [];
  for (let i = 0; i < N; i++) {
    const shirt = rng.pick(SHIRTS), pants = rng.pick(PANTS);
    I.legL.setColorAt(i, c.set(pants)); I.legR.setColorAt(i, c); I.torso.setColorAt(i, c.set(shirt)); I.armL.setColorAt(i, c); I.armR.setColorAt(i, c);
    I.head.setColorAt(i, c.set(rng.pick(SKIN))); I.umb.setColorAt(i, c.set(rng.pick(UMB)));
    peds.push({ idleCap: i % 3 === 0, idle: null, e: 0, s: 0, dir: 1, side: 1, lat: 2, v: rng.range(0.9, 1.5), push: 0, ph: rng() * 6, umbrella: rng() < 0.75, jog: false, path: null, x: 0, z: 0, yaw: 0 });
  }
  // Cubbon Park footpaths for joggers
  const parkPaths = world.roads.filter((r) => ['footway', 'path'].includes(r.k) && world.cubbon && r.pts.length > 1 && r.pts.some((p) => Math.hypot(p[0] - world.cubbon.pts[0][0], 0) >= 0));
  const cubbonPaths = world.cubbon ? parkPaths.filter((r) => { const m = r.pts[Math.floor(r.pts.length / 2)]; return m[0] > world.cubbon.x1 && m[0] < world.cubbon.x2 && m[1] > world.cubbon.z1 && m[1] < world.cubbon.z2; }) : [];

  const cand = [];
  // hangout spots: people chatting at carts and outside cafés, standing in little circles
  const hang = [...world.vendors.map((v) => ({ x: v.x, z: v.z })), ...world.doors.map((d) => ({ x: d.x + d.nx * 1.5, z: d.z + d.nz * 1.5 }))];
  function spawnIdle(p, fx, fz) {
    const near = hang.filter((h) => { const d = Math.hypot(h.x - fx, h.z - fz); return d > 20 && d < 170; });
    if (!near.length) return false;
    const h = near[Math.floor(Math.random() * near.length)], a = Math.random() * 6.28, r = 1.1 + Math.random() * 0.8;
    const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
    if (world.insideBuilding(x, z, 0.3)) return false;
    p.idle = { x, z, yaw: Math.atan2(h.x - x, h.z - z) }; p.x = x; p.z = z; p.yaw = p.idle.yaw; p.path = null;
    return true;
  }
  function spawn(p, fx, fz, rMin, rMax) {
    if (p.idleCap && spawnIdle(p, fx, fz)) return;
    p.idle = null;
    for (let t = 0; t < 20; t++) {
      const a = Math.random() * 6.283, d = rMin + Math.random() * (rMax - rMin), x = fx + Math.cos(a) * d, z = fz + Math.sin(a) * d;
      if (cubbonPaths.length && Math.random() < 0.18 && world.cubbon && x > world.cubbon.x1 && x < world.cubbon.x2 && z > world.cubbon.z1 && z < world.cubbon.z2) {
        const r = cubbonPaths[Math.floor(Math.random() * cubbonPaths.length)];
        const cum = [0]; for (let i = 1; i < r.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
        p.path = { pts: r.pts, cum, L: cum[cum.length - 1] }; p.s = Math.random() * p.path.L; p.jog = Math.random() < 0.6; p.dir = Math.random() < 0.5 ? 1 : -1; return;
      }
      grid.query(x, z, 50, cand); if (!cand.length) continue;
      const ei = cand[Math.floor(Math.random() * cand.length)].i, e = edges[ei]; if (e.len < 3) continue;
      p.path = null; p.jog = false; p.e = ei; p.s = Math.random() * e.len; p.dir = 1;
      p.side = Math.random() < 0.5 ? -1 : 1; p.lat = e.w / 2 + 1.2 + Math.random() * 1.4;
      const tx = e.ax + e.dx * p.s + e.dz * p.lat * p.side, tz = e.az + e.dz * p.s - e.dx * p.lat * p.side;
      if (world.insideBuilding(tx, tz, 0.4)) { p.lat = e.w / 2 + 1.0; if (world.insideBuilding(e.ax + e.dx * p.s + e.dz * p.lat * p.side, e.az + e.dz * p.s - e.dx * p.lat * p.side, 0.3)) continue; }
      return;
    }
  }
  function pos(p) {
    if (p.path) {
      const L = p.path; let i = 1; while (i < L.cum.length - 1 && L.cum[i] < p.s) i++;
      const a = L.pts[i - 1], b = L.pts[i], t = (p.s - L.cum[i - 1]) / ((L.cum[i] - L.cum[i - 1]) || 1);
      p.x = a[0] + (b[0] - a[0]) * t; p.z = a[1] + (b[1] - a[1]) * t; p.yaw = Math.atan2((b[0] - a[0]) * p.dir, (b[1] - a[1]) * p.dir);
      return;
    }
    const e = edges[p.e];
    p.x = e.ax + e.dx * p.s + e.dz * p.lat * p.side; p.z = e.az + e.dz * p.s - e.dx * p.lat * p.side;
    p.yaw = Math.atan2(e.dx * p.dir, e.dz * p.dir);
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
  const res = edges.filter((e) => ['residential', 'unclassified', 'tertiary'].includes(e.k) && e.len > 20 && Math.hypot(e.ax, e.az) < 900);
  for (let i = 0; i < 16 && res.length; i++) {
    const e = res[Math.floor(rng() * res.length)], s = rng.range(5, e.len - 5), lat = e.w / 2 - 0.8;
    const x = e.ax + e.dx * s + e.dz * lat, z = e.az + e.dz * s - e.dx * lat, yaw = Math.atan2(e.dx, e.dz) + rng.range(-0.5, 0.5);
    const m = new THREE.Mesh(cowG, cowMat); m.position.set(x, 0, z); m.rotation.y = yaw; m.castShadow = true; scene.add(m);
    cows.push({ x, z, yaw, m, ph: rng() * 6 });
  }

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
  function alarm(x, z) { for (const p of peds) if (Math.hypot(p.x - x, p.z - z) < 30 && !p.down) { p.angry = 5 + Math.random() * 3; p.at = { x, z }; } }
  function update(dt, t, focus, rain, ev) {
    if (!started) { started = true; for (const p of peds) { spawn(p, focus.x, focus.z, 5, 160); } }
    const um = rain > 0.15;
    frameNo++;
    // liveliness decides how many of the pool are out; the rest aren't drawn or simulated
    const active = Math.round(N * (focus.live ? focus.live.people : 0.5));
    for (const k of Object.keys(I)) I[k].count = active;
    peds.forEach((p, i) => {
      if (i >= active) { p.x = p.z = 1e6; return; }
      if (Math.hypot(p.x - focus.x, p.z - focus.z) > 200) spawn(p, focus.x, focus.z, 90, 170);
      if (p.idle) { p.x = p.idle.x; p.z = p.idle.z; }
      // a vehicle driven by you at speed knocks people over (they get up, angry)
      if (!p.down) for (const b of focus.blockers) {
        if (!b.isPlayer || b.speed < 4) continue;
        if (Math.hypot(p.x - b.x, p.z - b.z) < (b.r || 1.1) + 0.3) { p.down = 5; p.downYaw = Math.atan2(p.x - b.x, p.z - b.z); ev && ev.hitPed && ev.hitPed(p, b.speed); ev && ev.tumble && ev.tumble(p, b.vx || 0, b.vz || 0); alarm(p.x, p.z); }
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
      p.s += p.dir * sp * dt;
      if (p.path) {
        if (p.s > p.path.L) { p.s = p.path.L; p.dir = -1; } else if (p.s < 0) { p.s = 0; p.dir = 1; }
      } else {
        const e = edges[p.e];
        if (p.s > e.len) {
          const n = nodes[e.b]; const opts = n.out.filter((k) => edges[k].b !== e.a);
          if (opts.length && Math.random() < 0.85) { p.e = opts[Math.floor(Math.random() * opts.length)]; p.s = 0; p.lat = edges[p.e].w / 2 + 1.2 + Math.random() * 1.4; const ne = edges[p.e]; if (world.insideBuilding(ne.ax + ne.dz * p.lat * p.side, ne.az - ne.dx * p.lat * p.side, 0.4)) p.lat = ne.w / 2 + 1.0; }
          else { p.s = e.len; p.dir = -1; }
        } else if (p.s < 0) { p.s = 0; p.dir = 1; }
      }
      pos(p);
      // keep walkers out of buildings that sit right on the footpath: hug the kerb, or turn back
      if (!p.path && (i + frameNo) % 12 === 0 && world.insideBuilding(p.x, p.z, 0.35)) {
        const e = edges[p.e];
        if (p.lat > e.w / 2 + 1.1) { p.lat = e.w / 2 + 1.0; pos(p); }
        if (world.insideBuilding(p.x, p.z, 0.2)) { p.dir *= -1; p.s += p.dir * 1.5; pos(p); }
      }
      // people far from you only get their limbs re-posed every other frame
      if ((i + frameNo) & 1 && Math.abs(p.x - focus.x) + Math.abs(p.z - focus.z) > 90) return;
      let x = p.x, z = p.z;
      for (const b of focus.blockers) {
        const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz);
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
    // one shared, padded bound for all body parts (they never stray far from the torso)
    if (frameNo % 15 === 1) { I.torso.computeBoundingSphere(); const bs = I.torso.boundingSphere; bs.radius += 4; for (const k of Object.keys(I)) I[k].boundingSphere = bs; }
    for (const cw of cows) cw.m.rotation.y = cw.yaw + Math.sin(t * 0.3 + cw.ph) * 0.15;
  }

  function collideCows(p, r) {
    for (const cw of cows) {
      const dx = p.x - cw.x, dz = p.z - cw.z, d = Math.hypot(dx, dz), rr = r + 1.1;
      if (d < rr && d > 1e-5) { p.x += dx / d * (rr - d); p.z += dz / d * (rr - d); return { nx: dx / d, nz: dz / d, depth: rr - d, tag: 'cow' }; }
    }
    return null;
  }
  return { update, collideCows, cows, peds, alarm };
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
