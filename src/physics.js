import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { box, merge, part, makeRng } from './util.js';

// Rapier rigid-body physics around the player. Everything far away keeps the cheap scripted logic;
// only what is near you gets real bodies: walls, poles, trees and parked vehicles (static, streamed in
// and out as you move), your own vehicle (dynamic), traffic close by (kinematic, dynamic once hit),
// knockable street props and tumbling pedestrians.
const DIMS = {
  auto: [0.68, 0.75, 1.3, 350], scooter: [0.32, 0.6, 0.95, 140], car: [0.88, 0.7, 2.05, 1200], taxi: [0.88, 0.7, 2.05, 1200],
  suv: [0.95, 0.85, 2.2, 1700], bus: [1.3, 1.5, 5.4, 9000],
};
const NEAR_STATIC = 70, FAR_STATIC = 95, NEAR_NPC = 45;
const yawQ = (yaw) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
const qYaw = (r) => Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));

export async function createPhysics(scene, world) {
  await RAPIER.init();
  const W = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  W.timestep = 1 / 60;
  W.createCollider(RAPIER.ColliderDesc.cuboid(4000, 0.5, 4000).setTranslation(0, -0.5, 0).setFriction(0.8));
  const tagOf = new Map(); // collider handle -> { tag, item?, npc?, prop? }
  // collision groups (membership << 16 | filter). Walls, poles, props: everything but group 8, so that while you are up
  // on a flyover (your filter becomes group 8 only) you touch the traffic up there and nothing on the ground below.
  const GROUND = 0xfff7ffff, YOU = 0x0004fffd, YOU_UP = 0x00040008;

  // ---------- static world, streamed around the focus point
  const statics = new Map(), near = [];
  function addStatic(it) {
    const body = W.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const h = it.h, y0 = it.y0 || 0, cols = [];
    if (it.type === 'circle') {
      cols.push(W.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, it.r).setTranslation(it.x, y0 + h / 2, it.z), body));
    } else if (it.pts.length <= 8 && (it.x2 - it.x1) < 30 && (it.z2 - it.z1) < 30) {
      // small solid things: one convex block
      const v = new Float32Array(it.pts.length * 6);
      it.pts.forEach(([x, z], i) => { v.set([x, y0, z, x, y0 + h, z], i * 6); });
      const d = RAPIER.ColliderDesc.convexHull(v); if (d) cols.push(W.createCollider(d, body));
    } else {
      // buildings can be any shape: a thin wall along every edge of the footprint
      for (let i = 0, j = it.pts.length - 1; i < it.pts.length; j = i++) {
        const [ax, az] = it.pts[j], [bx, bz] = it.pts[i], len = Math.hypot(bx - ax, bz - az);
        if (len < 0.05) continue;
        cols.push(W.createCollider(RAPIER.ColliderDesc.cuboid(len / 2 + 0.15, h / 2, 0.3).setTranslation((ax + bx) / 2, y0 + h / 2, (az + bz) / 2).setRotation(yawQ(Math.atan2(bx - ax, bz - az) + Math.PI / 2)), body));
      }
    }
    for (const c of cols) { c.setCollisionGroups(GROUND); tagOf.set(c.handle, { tag: it.tag, item: it }); }
    statics.set(it, { body, cols });
  }
  function dropStatic(it) {
    const s = statics.get(it); if (!s) return;
    for (const c of s.cols) tagOf.delete(c.handle);
    W.removeRigidBody(s.body); statics.delete(it);
  }
  let streamT = 0;
  function stream(fx, fz) {
    world.items(fx, fz, NEAR_STATIC, near);
    for (const it of near) if (!statics.has(it) && !it.knocked && it.h > 0.5 && (it.y0 || 0) < 1.8) addStatic(it);
    for (const it of statics.keys()) {
      const cx = it.type === 'circle' ? it.x : (it.x1 + it.x2) / 2, cz = it.type === 'circle' ? it.z : (it.z1 + it.z2) / 2;
      const ext = it.type === 'circle' ? 0 : Math.max(it.x2 - it.x1, it.z2 - it.z1) / 2;
      if (Math.abs(cx - fx) - ext > FAR_STATIC || Math.abs(cz - fz) - ext > FAR_STATIC) dropStatic(it);
    }
  }

  // ---------- your vehicle
  const P = { body: null, col: null, type: null, mass: 1, yawKick: 0, parked: true, lx: 0, lz: 0 };
  function buildPlayer(player) {
    if (P.body) { tagOf.delete(P.col.handle); W.removeRigidBody(P.body); }
    const [hx, hy, hz, mass] = DIMS[player.type];
    P.body = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(player.pos.x, hy + 0.02, player.pos.z).setRotation(yawQ(player.heading))
      .enabledRotations(false, true, false).enabledTranslations(true, false, true).setAngularDamping(2.5).setLinearDamping(0.05));
    P.col = W.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setMass(mass).setFriction(0.15).setRestitution(0.25)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setCollisionGroups(YOU)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(mass * 30), P.body);
    P.type = player.type; P.mass = mass; P.hy = hy; P.hz = hz;
  }

  // ---------- traffic close to you
  const npcBodies = new Map();
  function syncTraffic(traffic, fx, fz, level = 0) {
    for (const v of traffic.vehicles) {
      // only traffic on your level gets a body: the cars under the flyover are not in your way
      const nearMe = !v.off && Math.abs(v.x - fx) < NEAR_NPC && Math.abs(v.z - fz) < NEAR_NPC && Math.abs((v.y || 0) - level) < 2.5;
      let b = npcBodies.get(v);
      if (!nearMe) {
        if (b && !v.knockT) { tagOf.delete(b.col.handle); W.removeRigidBody(b.body); npcBodies.delete(v); }
        continue;
      }
      const [hx, hy, hz, mass] = DIMS[v.type];
      if (!b) {
        const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(v.x, hy + 0.02, v.z).setRotation(yawQ(v.yaw)));
        const col = W.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setMass(mass).setFriction(0.5).setRestitution(0.2), body);
        b = { body, col, mass }; npcBodies.set(v, b); tagOf.set(col.handle, { tag: 'vehicle', npc: v });
      }
      if (v.knockT > 0) {
        // knocked: physics owns it, traffic reads the result
        const t = b.body.translation(), r = b.body.rotation();
        v.kx = t.x; v.kz = t.z; v.kyaw = qYaw(r);
      } else {
        if (b.body.isDynamic()) { b.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); }
        b.body.setNextKinematicTranslation({ x: v.x, y: hy + 0.02, z: v.z }); b.body.setNextKinematicRotation(yawQ(v.yaw));
      }
    }
  }
  // a hard hit turns the other vehicle into a real body for a few seconds: it gets shoved and spun
  function knock(v, b, nx, nz, dv) {
    const [, hy] = DIMS[v.type];
    b.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    b.body.setEnabledRotations(false, true, false, true); b.body.setEnabledTranslations(true, false, true, true);
    b.body.setLinearDamping(1.4); b.body.setAngularDamping(1.6);
    b.body.setTranslation({ x: v.x, y: hy + 0.02, z: v.z }, true);
    const share = Math.min(1.2, P.mass / b.mass);
    b.body.setLinvel({ x: v.fx * v.speed - nx * dv * share, y: 0, z: v.fz * v.speed - nz * dv * share }, true);
    b.body.setAngvel({ x: 0, y: (Math.random() - 0.5) * dv * share * 0.9, z: 0 }, true);
    v.knockT = 2.6; v.kx = v.x; v.kz = v.z; v.kyaw = v.yaw;
  }

  // ---------- knockable props: plastic chairs and drums at street carts, dustbins outside shops, cones near the metro work
  const rng = makeRng(77);
  const PROP = {
    chair: { geo: merge([box(0.46, 0.05, 0.46, 0, 0.45, 0, '#e53935'), box(0.46, 0.45, 0.05, 0, 0.7, -0.21, '#e53935'), ...[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([x, z]) => box(0.05, 0.45, 0.05, x, 0.22, z, '#c62828'))]), hx: 0.23, hy: 0.46, hz: 0.23, mass: 3 },
    drum: { geo: merge([part(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12).translate(0, 0.45, 0), '#1565c0'), part(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 12).translate(0, 0.86, 0), '#0d47a1')]), cyl: [0.45, 0.3], mass: 18 },
    bin: { geo: merge([part(new THREE.CylinderGeometry(0.28, 0.24, 0.8, 10).translate(0, 0.4, 0), '#2e7d32'), part(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 10).translate(0, 0.82, 0), '#1b5e20')]), cyl: [0.41, 0.28], mass: 10 },
    cone: { geo: merge([part(new THREE.ConeGeometry(0.2, 0.7, 10).translate(0, 0.4, 0), '#ff6d00'), box(0.42, 0.05, 0.42, 0, 0.025, 0, '#212121'), part(new THREE.CylinderGeometry(0.13, 0.155, 0.1, 10).translate(0, 0.4, 0), '#ffffff')]), cyl: [0.37, 0.2], mass: 2 },
  };
  const props = [];
  const free = (x, z, r) => !world.insideBuilding(x, z, r) && !world.solidAt(x, z, 0);
  for (const v of world.vendors) {
    // a couple of plastic chairs and a water drum around every cart
    for (let k = 0; k < 3; k++) {
      const a = rng() * 6.28, d = 1.6 + rng() * 0.8, x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d;
      if (free(x, z, 0.3)) props.push({ kind: k < 2 ? 'chair' : 'drum', x, z, y: 0, q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28) });
    }
  }
  for (const d of world.doors) {
    if (rng() > 0.35) continue;
    const x = d.x + d.nx * 2.2 + d.nz * 1.6, z = d.z + d.nz * 2.2 - d.nx * 1.6;
    if (free(x, z, 0.3)) props.push({ kind: 'bin', x, z, y: 0, q: new THREE.Quaternion() });
  }
  for (const r of world.roads) {
    if (!['primary', 'secondary', 'trunk'].includes(r.k) || r.l || rng() > 0.12 || r.pts.length < 2) continue;
    const [ax, az] = r.pts[0], [bx, bz] = r.pts[1], len = Math.hypot(bx - ax, bz - az); if (len < 20) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len, lat = r.hw - 0.6;
    for (let k = 0; k < 4; k++) { const s = len / 2 + k * 2.5, x = ax + dx * s + dz * lat, z = az + dz * s - dx * lat; if (free(x, z, 0.2)) props.push({ kind: 'cone', x, z, y: 0, q: new THREE.Quaternion() }); }
  }
  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const meshes = {};
  for (const k of Object.keys(PROP)) {
    const list = props.filter((p) => p.kind === k);
    const im = new THREE.InstancedMesh(PROP[k].geo, propMat, Math.max(1, list.length)); im.castShadow = true; im.count = list.length;
    list.forEach((p, i) => { p.mesh = im; p.idx = i; });
    meshes[k] = im; scene.add(im);
  }
  const m4 = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), tv = new THREE.Vector3(), tq = new THREE.Quaternion();
  const drawProp = (p) => { m4.compose(tv.set(p.x, p.y, p.z), p.q, one); p.mesh.setMatrixAt(p.idx, m4); p.mesh.instanceMatrix.needsUpdate = true; };
  props.forEach(drawProp);
  for (const im of Object.values(meshes)) im.computeBoundingSphere();
  const propGrid = new Map(), PC = 40;
  for (const p of props) { const k = Math.floor(p.x / PC) + ',' + Math.floor(p.z / PC); if (!propGrid.has(k)) propGrid.set(k, []); propGrid.get(k).push(p); }
  const live = new Set();
  function streamProps(fx, fz) {
    const cx = Math.floor(fx / PC), cz = Math.floor(fz / PC);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of propGrid.get((cx + i) + ',' + (cz + j)) || []) {
      if (p.body) continue;
      const S = PROP[p.kind];
      p.body = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y + (S.hy || S.cyl[0]), p.z).setRotation(p.q).setCcdEnabled(true).setLinearDamping(0.3).setAngularDamping(0.4).setCanSleep(true));
      const d = S.cyl ? RAPIER.ColliderDesc.cylinder(S.cyl[0], S.cyl[1]) : RAPIER.ColliderDesc.cuboid(S.hx, S.hy, S.hz);
      p.col = W.createCollider(d.setMass(S.mass).setFriction(0.6).setRestitution(0.3), p.body); p.col.setCollisionGroups(GROUND);
      p.body.sleep(); tagOf.set(p.col.handle, { tag: 'prop', prop: p }); live.add(p);
    }
    for (const p of live) {
      if (Math.abs(p.x - fx) < PC * 2 && Math.abs(p.z - fz) < PC * 2) continue;
      tagOf.delete(p.col.handle); W.removeRigidBody(p.body); p.body = p.col = null; live.delete(p);
    }
  }
  function readProps() {
    for (const p of live) {
      if (p.body.isSleeping()) continue;
      const t = p.body.translation(), r = p.body.rotation(), S = PROP[p.kind], hy = S.hy || S.cyl[0];
      // the mesh origin is at its feet: step down along the body's own up axis
      tq.set(r.x, r.y, r.z, r.w); tv.set(0, -hy, 0).applyQuaternion(tq);
      p.x = t.x + tv.x; p.y = t.y + tv.y; p.z = t.z + tv.z; p.q.copy(tq); drawProp(p);
    }
  }

  // ---------- a pedestrian you hit is thrown as one rigid body, then lies where they land
  const tumbles = new Set();
  function tumble(p, vx, vz) {
    const body = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, 0.95, p.z).setRotation(yawQ(p.yaw)).setLinearDamping(0.2).setAngularDamping(0.6).setCcdEnabled(true));
    const col = W.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.25).setMass(70).setFriction(0.9).setRestitution(0.1), body);
    col.setCollisionGroups(0x0002ffff); // group 2: never touches your vehicle (group 4), so nobody gets stuck on the bonnet
    body.setLinvel({ x: vx * 0.75, y: 2 + Math.hypot(vx, vz) * 0.18, z: vz * 0.75 }, true);
    body.setAngvel({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 8 }, true);
    p.tumble = { body, t: 0, x: p.x, y: 0, z: p.z, q: new THREE.Quaternion() };
    tumbles.add(p);
  }
  function readTumbles(dt) {
    for (const p of tumbles) {
      const T = p.tumble; T.t += dt;
      const t = T.body.translation(), r = T.body.rotation();
      T.q.set(r.x, r.y, r.z, r.w); tv.set(0, -0.85, 0).applyQuaternion(T.q);
      T.x = t.x + tv.x; T.y = Math.max(0, t.y + tv.y); T.z = t.z + tv.z;
      if (T.t > 1.6 || (T.t > 0.6 && T.body.isSleeping())) {
        // settle: lying along the direction the head ended up
        tv.set(0, 1, 0).applyQuaternion(T.q);
        p.x = t.x; p.z = t.z; p.downYaw = Math.atan2(-tv.x, -tv.z);
        W.removeRigidBody(T.body); p.tumble = null; tumbles.delete(p);
      }
    }
  }

  // ---------- step: drive your vehicle with the arcade model, let Rapier resolve the contacts
  const events = new RAPIER.EventQueue(true);
  function step(dt, { player, mode, traffic, ev, focus }) {
    const f = focus;
    if ((streamT -= dt) <= 0) { streamT = 0.4; stream(f.x, f.z); streamProps(f.x, f.z); }
    if (P.type !== player.type || !P.body) buildPlayer(player);
    const driving = mode === 'drive';
    if (!driving) {
      // parked (or being towed): pinned where the game puts it
      if (!P.parked) { P.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); P.parked = true; }
      P.body.setNextKinematicTranslation({ x: player.pos.x, y: P.hy + 0.02, z: player.pos.z }); P.body.setNextKinematicRotation(yawQ(player.heading));
    } else {
      // just got in, or the game moved the vehicle (tow yard, mechanic): put the body there
      const moved = Math.abs(player.pos.x - P.lx) + Math.abs(player.pos.z - P.lz) > 0.5;
      if (P.parked || moved) {
        if (P.parked) P.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        P.parked = false;
        P.body.setTranslation({ x: player.pos.x, y: P.hy + 0.02, z: player.pos.z }, true); P.body.setRotation(yawQ(player.heading), true);
      }
      const yaw = qYaw(P.body.rotation());
      let dy = player.heading - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      P.body.setLinvel({ x: player.vel.x, y: 0, z: player.vel.y }, true);
      P.body.setAngvel({ x: 0, y: dy / dt + P.yawKick, z: 0 }, true);
    }
    const up = (player.elev || 0) > 0.3; // (below the embankment walls, which start at 1 m)
    if (P.up !== up) { P.col.setCollisionGroups(up ? YOU_UP : YOU); P.up = up; }
    syncTraffic(traffic, f.x, f.z, player.elev || 0);
    const want = { x: player.vel.x, z: player.vel.y };

    // one step per frame, so the arcade model and the body never disagree for a frame
    W.timestep = Math.min(1 / 30, Math.max(1 / 144, dt));
    W.step(events);

    readProps(); readTumbles(dt);
    P.yawKick *= Math.exp(-3 * dt);
    if (!driving) { events.clear(); return null; }
    const t = P.body.translation(), lv = P.body.linvel();
    player.pos.x = P.lx = t.x; player.pos.z = P.lz = t.z;
    player.heading = qYaw(P.body.rotation());
    player.vel.set(lv.x, lv.z);
    // how much velocity the contacts took away = how hard the hit was
    let dvx = want.x - lv.x, dvz = want.z - lv.z, dv = Math.hypot(dvx, dvz);
    // a contact can show up a frame after the velocity drop: carry a big drop over once
    if (P.pend && P.pend.dv > dv) { dv = P.pend.dv; dvx = P.pend.dvx; dvz = P.pend.dvz; }
    P.pend = null;
    let hit = null;
    // contact-force events fire inside the step, even when the bounce already separated us again
    const me = P.col.handle;
    events.drainContactForceEvents((e) => {
      const c1 = e.collider1(), c2 = e.collider2(); if (c1 !== me && c2 !== me) return;
      const info = tagOf.get(c1 === me ? c2 : c1); if (!info || (hit && !info.npc)) return;
      const n = dv > 1e-3 ? { x: -dvx / dv, z: -dvz / dv } : { x: 0, z: 0 };
      hit = { nx: n.x, nz: n.z, tag: info.tag, item: info.item, v: info.npc, prop: info.prop, px: t.x - n.x * P.hz, pz: t.z - n.z * P.hz };
    });
    if (!hit) W.contactPairsWith(P.col, (other) => {
      const info = tagOf.get(other.handle); if (!info) return;
      W.contactPair(P.col, other, (man, flipped) => {
        if (!man.numSolverContacts()) return;
        const n = man.normal(), s = flipped ? 1 : -1, cp = man.solverContactPoint(0);
        const h = { nx: n.x * s, nz: n.z * s, tag: info.tag, item: info.item, v: info.npc, prop: info.prop, px: cp.x, pz: cp.z };
        if (!hit || info.npc) hit = h;
      });
    });
    events.clear();
    if (!hit && dv > 3.5) P.pend = { dv, dvx, dvz };
    if (hit && dv > 0.6) {
      // off-centre hits spin you
      const rx = hit.px - t.x, rz = hit.pz - t.z;
      P.yawKick += Math.max(-2.5, Math.min(2.5, (rz * dvx - rx * dvz) * 0.12));
      if (hit.v && dv > 2.5) { const b = npcBodies.get(hit.v); if (b && !(hit.v.knockT > 0)) knock(hit.v, b, hit.nx, hit.nz, dv); }
      if (hit.tag === 'parked' && dv > 3.5) unpark(hit.item, hit.nx, hit.nz, dv);
      if (dv > 3.5 && hit.tag !== 'prop') ev.crash(dv, hit.tag, hit);
    }
    return hit;
  }
  // parked vehicles you ram hard come loose and slide
  function unpark(it, nx, nz, dv) {
    if (!it || it.knocked || !it.inst) return;
    dropStatic(it); it.knocked = true;
    const car = it.r > 1, [hx, hy, hz, mass] = car ? [0.85, 0.7, 1.95, 1100] : [0.3, 0.55, 0.6, 110];
    const body = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(it.x, hy + 0.02, it.z).setRotation(yawQ(it.inst.yaw))
      .enabledRotations(false, true, false).enabledTranslations(true, false, true).setLinearDamping(1.6).setAngularDamping(1.8));
    const col = W.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setMass(mass).setFriction(0.5).setRestitution(0.2), body);
    const share = Math.min(1.5, P.mass / mass);
    body.setLinvel({ x: -nx * dv * share, y: 0, z: -nz * dv * share }, true);
    body.setAngvel({ x: 0, y: (Math.random() - 0.5) * dv * share, z: 0 }, true);
    tagOf.set(col.handle, { tag: 'parked', item: it });
    loose.push({ it, body, hy });
  }
  const loose = [];
  function readLoose() {
    for (const L of loose) {
      if (L.body.isSleeping()) continue;
      const t = L.body.translation(), yaw = qYaw(L.body.rotation()); L.it.x = t.x; L.it.z = t.z;
      m4.compose(tv.set(t.x, 0, t.z), tq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), one);
      L.it.inst.im.setMatrixAt(L.it.inst.i, m4); L.it.inst.im.instanceMatrix.needsUpdate = true;
    }
  }
  return {
    step: (dt, o) => { const h = step(dt, o); readLoose(); return h; },
    tumble, props, get bodies() { return W.bodies.len(); }, world: W,
    // put your vehicle somewhere else on the spot (the flyover parapet pushing you back)
    nudge(x, z, vx, vz) { if (!P.body) return; P.body.setTranslation({ x, y: P.hy + 0.02, z }, true); P.body.setLinvel({ x: vx, y: 0, z: vz }, true); P.lx = x; P.lz = z; },
  };
}
