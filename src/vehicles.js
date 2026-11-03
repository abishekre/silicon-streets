import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { part, box, merge, clamp, damp, angleLerp, makeRng } from './util.js';
import { sideExtrude, crossExtrude } from './geom.js';

const K = '#141414';
const HEAD = '#fff3d6', TAIL = '#ff2a1a', AMBER = '#ffb300';
const C0 = [0.002, 0.002];

const P = (g, c) => part(g, c, C0);
function cyl(r1, r2, h, seg, x, y, z, color, rot = null) {
  const g = new THREE.CylinderGeometry(r1, r2, h, seg);
  if (rot === 'x') g.rotateX(Math.PI / 2); if (rot === 'z') g.rotateZ(Math.PI / 2);
  g.translate(x, y, z); return P(g, color);
}
function sph(r, x, y, z, color, sx = 1, sy = 1, sz = 1) { const g = new THREE.SphereGeometry(r, 8, 6); g.scale(sx, sy, sz); g.translate(x, y, z); return P(g, color); }
function rbox(w, h, d, x, y, z, color, r = 0.06) { const g = new RoundedBoxGeometry(w, h, d, 1, r); g.translate(x, y, z); return P(g, color); }
function tilt(w, h, d, a, x, y, z, color) { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(a); g.translate(x, y, z); return P(g, color); }
function wheelGeo(r, w) {
  return merge([
    P(new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2), '#1a1a1a'),
    P(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 8).rotateZ(Math.PI / 2), '#9a9a9a'),
  ]);
}

// seated rider / driver, arms forward to the handlebar
function seated(x, y, z, shirt, skin = '#8d5a3b', helmet = null) {
  const parts = [
    rbox(0.4, 0.5, 0.24, x, y + 0.25, z, shirt, 0.08),
    // thighs along the seat, shins down from the knee
    P(new THREE.CapsuleGeometry(0.08, 0.3, 1, 5).rotateX(Math.PI / 2).translate(x - 0.12, y + 0.02, z + 0.22), '#2b2b33'),
    P(new THREE.CapsuleGeometry(0.08, 0.3, 1, 5).rotateX(Math.PI / 2).translate(x + 0.12, y + 0.02, z + 0.22), '#2b2b33'),
    P(new THREE.CapsuleGeometry(0.07, 0.3, 1, 5).rotateX(-0.25).translate(x - 0.12, y - 0.22, z + 0.44), '#2b2b33'),
    P(new THREE.CapsuleGeometry(0.07, 0.3, 1, 5).rotateX(-0.25).translate(x + 0.12, y - 0.22, z + 0.44), '#2b2b33'),
    P(new THREE.CapsuleGeometry(0.055, 0.4, 1, 5).rotateX(Math.PI / 2.6).translate(x - 0.24, y + 0.33, z + 0.2), shirt),
    P(new THREE.CapsuleGeometry(0.055, 0.4, 1, 5).rotateX(Math.PI / 2.6).translate(x + 0.24, y + 0.33, z + 0.2), shirt),
    cyl(0.05, 0.05, 0.1, 8, x, y + 0.55, z, skin),
  ];
  if (helmet) parts.push(sph(0.17, x, y + 0.72, z, helmet), box(0.26, 0.08, 0.04, x, y + 0.7, z + 0.15, '#20262c'));
  else parts.push(sph(0.12, x, y + 0.7, z, skin, 1, 1.1, 1), sph(0.125, x, y + 0.76, z - 0.02, '#151515', 1, 0.7, 1));
  return parts;
}

export const MODELS = {
  auto(rider = true) {
    const G = '#1f8a42', Y = '#f2c230';
    const b = [
      P(sideExtrude([[-1.25, 0.38], [0.5, 0.38], [0.5, 1.0], [-1.1, 1.0], [-1.25, 1.0, -1.25, 0.85]], 1.34, 0.04), G),
      P(sideExtrude([[0.35, 0.4], [1.18, 0.4], [1.38, 0.42, 1.36, 0.75], [1.22, 1.28], [1.15, 1.38, 1.0, 1.38], [0.4, 1.38]], 0.8, 0.03), G),
      box(1.2, 0.12, 2.4, 0, 0.32, 0, '#2a2a2a'),
      box(1.4, 0.06, 1.72, 0, 1.0, -0.4, K),
      box(1.42, 0.85, 0.06, 0, 1.43, -1.25, Y), box(0.6, 0.24, 0.07, 0, 1.55, -1.255, '#26323a'),
      box(1.4, 0.1, 0.08, 0, 0.98, -1.27, K), box(0.42, 0.14, 0.02, 0, 0.62, -1.27, '#f5f5f5'),
      box(0.8, 0.46, 0.03, 0, 1.62, 0.86, '#3a4a55'),
      box(1.18, 0.16, 0.55, 0, 0.95, -0.78, '#5d4037'), box(1.18, 0.48, 0.12, 0, 1.22, -1.12, '#4e342e'),
      box(0.45, 0.12, 0.4, 0, 1.12, 0.3, '#3e2723'),
      cyl(0.025, 0.025, 0.78, 6, 0, 1.45, 0.78, K, 'z'),
      box(0.22, 0.08, 0.5, 0, 0.64, 1.05, G),
      cyl(0.12, 0.12, 0.06, 14, 0, 1.08, 1.37, '#c9c9c9', 'x'),
      box(0.32, 0.1, 0.02, 0, 0.55, 1.37, '#f5f5f5'),
      ...(rider ? seated(0, 0.95, 0.3, '#b59b6a') : []),
    ];
    for (const [x, z] of [[-0.68, 0.72], [0.68, 0.72], [-0.68, -1.18], [0.68, -1.18]]) b.push(box(0.04, 0.46, 0.04, x, 1.22, z, K));
    const can = crossExtrude([[-0.72, 0], [-0.72, 0.16], [-0.7, 0.42, -0.4, 0.44], [0.4, 0.44], [0.7, 0.42, 0.72, 0.16], [0.72, 0], [0.67, 0], [0.67, 0.15], [0.65, 0.37, 0.38, 0.39], [-0.38, 0.39], [-0.65, 0.37, -0.67, 0.15], [-0.67, 0]], 2.15);
    can.translate(0, 1.42, -1.27); b.push(P(can, Y));
    const l = [cyl(0.08, 0.08, 0.03, 12, 0, 1.08, 1.41, HEAD, 'x'), box(0.12, 0.08, 0.03, -0.55, 0.72, -1.27, TAIL), box(0.12, 0.08, 0.03, 0.55, 0.72, -1.27, TAIL),
      box(0.07, 0.05, 0.03, -0.3, 1.25, 1.3, AMBER), box(0.07, 0.05, 0.03, 0.3, 1.25, 1.3, AMBER), box(0.08, 0.05, 0.02, 0.45, 1.5, 0.77, '#ff3b3b')];
    return { body: merge(b), lights: merge(l), wheels: [[0, 0.27, 1.05, 0.27, 0.16, true], [-0.64, 0.27, -0.82, 0.27, 0.16], [0.64, 0.27, -0.82, 0.27, 0.16]], radius: 1.1 };
  },
  scooter(c = '#ffffff', shirt = '#ffffff', helmet = '#c62828', rider = true) {
    const b = [
      P(sideExtrude([[-0.82, 0.4], [-0.86, 0.72, -0.55, 0.84], [0.0, 0.84], [0.08, 0.5], [0.2, 0.38]], 0.42, 0.05), c),
      P(sideExtrude([[0.35, 0.32], [0.58, 0.32], [0.74, 0.62, 0.62, 1.1], [0.5, 1.12], [0.5, 0.62, 0.35, 0.42]], 0.42, 0.04), c),
      P(sideExtrude([[-0.7, 0.84], [-0.72, 0.98, -0.5, 0.98], [0.0, 0.96], [0.05, 0.84]], 0.32, 0.03), K),
      box(0.34, 0.07, 0.5, 0, 0.36, 0.1, '#333'),
      box(0.68, 0.05, 0.05, 0, 1.12, 0.55, K), rbox(0.24, 0.13, 0.14, 0, 1.13, 0.6, c, 0.04),
      cyl(0.03, 0.03, 0.75, 6, 0, 0.62, 0.62, '#777'),
      box(0.12, 0.06, 0.3, 0, 0.5, 0.62, c),
      ...(rider ? seated(0, 0.92, -0.18, shirt, '#8d5a3b', helmet) : []),
    ];
    const l = [cyl(0.07, 0.07, 0.03, 12, 0, 1.13, 0.68, HEAD, 'x'), box(0.14, 0.06, 0.03, 0, 0.7, -0.86, TAIL)];
    return { body: merge(b), lights: merge(l), wheels: [[0, 0.24, 0.62, 0.24, 0.1, true], [0, 0.24, -0.6, 0.24, 0.1]], radius: 0.75 };
  },
  car(paint = '#ffffff', plate = '#f5f5f5', suv = false) {
    const s = suv ? 1.12 : 1, W = suv ? 1.86 : 1.68, hy = suv ? 0.18 : 0;
    const prof = suv
      ? [[-2.2, 0.4], [2.15, 0.4], [2.25, 0.42, 2.25, 0.7], [2.2, 1.0], [1.9, 1.1, 1.3, 1.12], [0.9, 1.72], [0.8, 1.82, 0.5, 1.82], [-2.05, 1.8], [-2.2, 1.78, -2.22, 1.5], [-2.25, 0.6], [-2.25, 0.4, -2.2, 0.4]]
      : [[-1.9, 0.32], [1.88, 0.32], [2.0, 0.33, 2.0, 0.55], [1.96, 0.78], [1.6, 0.9, 1.0, 0.94], [0.58, 1.36], [0.45, 1.48, 0.1, 1.48], [-1.3, 1.46], [-1.72, 1.42, -1.86, 1.1], [-1.95, 0.62], [-1.96, 0.33, -1.9, 0.32]];
    const L = suv ? 2.25 : 2.0;
    const ws = suv ? [1.1, 1.42, 0.62] : [0.79, 1.15, 0.6];
    const b = [
      P(sideExtrude(prof, W, 0.05), paint),
      tilt(W - 0.22, ws[2], 0.02, -Math.PI / 4, 0, ws[1] + 0.05, ws[0] + 0.05, '#1c2630'),
      tilt(W - 0.24, suv ? 0.42 : 0.36, 0.02, -2.62, 0, suv ? 1.62 : 1.27, suv ? -2.22 : -1.82, '#1c2630'),
      box(0.02, 0.38, suv ? 2.6 : 2.0, -W / 2 - 0.01, (suv ? 1.5 : 1.2), suv ? -0.6 : -0.35, '#1c2630'),
      box(0.02, 0.38, suv ? 2.6 : 2.0, W / 2 + 0.01, (suv ? 1.5 : 1.2), suv ? -0.6 : -0.35, '#1c2630'),
      box(0.03, 0.4, 0.12, -W / 2 - 0.015, (suv ? 1.5 : 1.2), -0.3, paint), box(0.03, 0.4, 0.12, W / 2 + 0.015, (suv ? 1.5 : 1.2), -0.3, paint),
      rbox(W + 0.02, 0.22, 0.14, 0, 0.42 + hy, L, '#1e1e1e', 0.05), rbox(W + 0.02, 0.22, 0.14, 0, 0.42 + hy, -L, '#1e1e1e', 0.05),
      box(0.9, 0.14, 0.02, 0, 0.64 + hy, L + 0.01, '#222'),
      box(0.42, 0.13, 0.02, 0, 0.45 + hy, L + 0.08, plate), box(0.42, 0.13, 0.02, 0, 0.62 + hy, -L - 0.01, plate),
      box(0.12, 0.08, 0.14, -W / 2 - 0.06, ws[1] - 0.1, ws[0] - 0.3, paint), box(0.12, 0.08, 0.14, W / 2 + 0.06, ws[1] - 0.1, ws[0] - 0.3, paint),
    ];
    const l = [box(0.34, 0.12, 0.04, -0.55, 0.76 + hy, L - 0.04, HEAD), box(0.34, 0.12, 0.04, 0.55, 0.76 + hy, L - 0.04, HEAD),
      box(0.3, 0.12, 0.04, -0.6, 0.82 + hy, -L + 0.04, TAIL), box(0.3, 0.12, 0.04, 0.6, 0.82 + hy, -L + 0.04, TAIL)];
    const r = 0.32 * s, wx = W / 2 - 0.08, wz = suv ? 1.45 : 1.25;
    return { body: merge(b), lights: merge(l), wheels: [[-wx, r, wz, r, 0.22, true], [wx, r, wz, r, 0.22, true], [-wx, r, -wz, r, 0.22], [wx, r, -wz, r, 0.22]], radius: suv ? 1.7 : 1.5 };
  },
  bus() {
    const b = [
      rbox(2.5, 1.35, 11, 0, 1.12, 0, '#1d4fa3', 0.12),
      box(2.52, 1.0, 10.5, 0, 2.28, -0.1, '#1a232c'),
      rbox(2.5, 0.5, 11, 0, 3.0, 0, '#e8eef5', 0.16),
      box(2.54, 0.12, 11.02, 0, 1.78, 0, '#7ec8ff'),
      box(2.1, 1.0, 0.05, 0, 2.25, 5.5, '#2a3a46'),
      box(0.04, 2.1, 1.1, -1.27, 1.55, 3.6, '#20272e'), box(0.04, 2.1, 1.1, -1.27, 1.55, -2.6, '#20272e'),
      box(0.1, 0.35, 0.1, -1.35, 2.3, 5.4, K), box(0.1, 0.35, 0.1, 1.35, 2.3, 5.4, K),
    ];
    for (let z = -4.6; z <= 4.6; z += 1.3) for (const x of [-1.265, 1.265]) b.push(box(0.03, 1.0, 0.08, x, 2.28, z, '#cfd8dc'));
    for (const [x, z] of [[-1.1, 3.6], [1.1, 3.6], [-1.1, -3.4], [1.1, -3.4]]) b.push(cyl(0.5, 0.5, 0.3, 14, x, 0.5, z, '#1a1a1a', 'z'), cyl(0.28, 0.28, 0.32, 10, x, 0.5, z, '#888', 'z'));
    const l = [box(1.6, 0.28, 0.04, 0, 2.92, 5.52, AMBER), box(0.3, 0.15, 0.04, -0.95, 0.8, 5.51, HEAD), box(0.3, 0.15, 0.04, 0.95, 0.8, 5.51, HEAD),
      box(0.25, 0.2, 0.04, -1.05, 0.9, -5.51, TAIL), box(0.25, 0.2, 0.04, 1.05, 0.9, -5.51, TAIL)];
    return { body: merge(b), lights: merge(l), wheels: [], radius: 1.4, long: 4 };
  },
};

export function bakeWheels(model) {
  const parts = [model.body];
  for (const [x, y, z, r, w] of model.wheels) { const g = wheelGeo(r, w); g.translate(x, y, z); parts.push(g); }
  return merge(parts);
}

export const VEHICLE_STATS = {
  auto: { label: 'Auto', max: 15.5, accel: 5.5, brake: 13, turn: 2.0, grip: 7, rev: 4 },
  scooter: { label: 'Scooter', max: 19, accel: 7.5, brake: 15, turn: 2.5, grip: 9, rev: 2 },
  car: { label: 'Car', max: 30, accel: 8, brake: 17, turn: 1.6, grip: 6, rev: 6 },
};

// ------------------------------------------------------------------ player vehicle
export class Player {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.bodyPivot = new THREE.Group();
    this.group.add(this.bodyPivot);
    scene.add(this.group);
    this.bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 });
    this.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.wheels = [];
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.vel = new THREE.Vector2();
    this.speed = 0; this.steer = 0; this.spin = 0; this.bump = 0; this.lean = 0;
    this.spot = new THREE.SpotLight('#fff1d0', 0, 60, 0.6, 0.6, 1.2);
    this.spot.target.position.set(0, 0, 14);
    this.group.add(this.spot, this.spot.target);
    this.odometer = 0;
    this.health = 100; this.broken = false; this.dentX = 0; this.dentZ = 0;
    this.setType('auto');
  }
  setType(type, occupied = true) {
    this.type = type; this.stats = VEHICLE_STATS[type];
    // wheels live outside bodyPivot, so the old vehicle's wheels must be removed too
    this.bodyPivot.clear(); for (const w of this.wheels) this.group.remove(w.pivot); this.wheels = [];
    // the player's own vehicle is built without a rider; the rider is a separate mesh hidden when you get out
    const model = type === 'auto' ? MODELS.auto(false) : type === 'scooter' ? MODELS.scooter('#e53935', '#3949ab', '#fafafa', false) : MODELS.car('#c62828');
    const riderParts = type === 'auto' ? seated(0, 0.95, 0.3, '#b59b6a') : type === 'scooter' ? seated(0, 0.92, -0.18, '#b59b6a', '#8d5a3b', '#fafafa') : seated(-0.38, 0.72, -0.1, '#b59b6a');
    this.radius = model.radius;
    const body = new THREE.Mesh(model.body, this.bodyMat); body.castShadow = true;
    const lights = new THREE.Mesh(model.lights, this.lightMat);
    this.rider = new THREE.Mesh(merge(riderParts.filter(Boolean)), this.bodyMat); this.rider.castShadow = true; this.rider.visible = this.occupied !== false;
    this.bodyPivot.add(body, lights, this.rider);
    for (const [x, y, z, r, w, front] of model.wheels) {
      const pivot = new THREE.Group(); pivot.position.set(x, y, z);
      const m = new THREE.Mesh(wheelGeo(r, w), this.bodyMat); m.castShadow = true;
      pivot.add(m); this.group.add(pivot);
      this.wheels.push({ pivot, mesh: m, r, front });
    }
    this.spot.position.set(0, 1.1, type === 'car' ? 2 : 1.3);
    void occupied;
  }
  get forward() { return new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading)); }

  update(dt, input, world, traffic, ev, phys) {
    const st = this.stats;
    const sinH = Math.sin(this.heading), cosH = Math.cos(this.heading);
    let fs = this.vel.x * sinH + this.vel.y * cosH;
    let ls = this.vel.x * -cosH + this.vel.y * sinH;
    const surface = world.surfaceAt(this.pos.x, this.pos.z);
    // grass slows you down, flood water a lot more
    const max = st.max * (this.health < 35 ? 0.65 : 1) * (surface === 'grass' ? 0.55 : 1) * (1 - Math.min(0.75, (this.waterDepth || 0) * 2.2));
    this.steer = damp(this.steer, input.steer, 8, dt);
    // a battered vehicle pulls to one side and wobbles; a broken one won't go
    if (this.health < 35) this.steer += Math.sin(performance.now() * 0.006) * 0.12 + 0.05;
    if (this.broken) input = { ...input, throttle: Math.min(0, input.throttle) * 0.3 };
    if (input.throttle > 0) {
      if (fs < -0.3) fs += st.brake * dt;
      else fs += st.accel * dt * Math.max(0, 1 - fs / max);
    } else if (input.throttle < 0) {
      if (fs > 0.3) fs -= st.brake * dt;
      else fs = Math.max(-st.rev, fs - st.accel * 0.6 * dt);
    } else {
      fs -= Math.sign(fs) * Math.min(Math.abs(fs), (1.2 + Math.abs(fs) * 0.08) * dt);
    }
    if (fs > max) fs = damp(fs, max, 2, dt);
    let grip = st.grip;
    if (input.handbrake) { fs -= Math.sign(fs) * Math.min(Math.abs(fs), 7 * dt); grip = 1.6; }
    if (surface === 'grass') grip *= 0.7;
    const steerScale = clamp(fs / 4, -1, 1) / (1 + Math.abs(fs) / 28);
    this.heading -= this.steer * st.turn * steerScale * (input.handbrake ? 1.35 : 1) * dt;
    ls *= Math.exp(-grip * dt);
    const s2 = Math.sin(this.heading), c2 = Math.cos(this.heading);
    this.vel.set(s2 * fs + -c2 * ls, c2 * fs + s2 * ls);

    this.odometer += Math.hypot(this.vel.x, this.vel.y) * dt;
    // with Rapier the rigid body moves us after this (main.js); otherwise push out of whatever we hit here
    const p = phys ? { x: this.pos.x, z: this.pos.z } : { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.y * dt };
    let hit = phys ? null : world.collide(p, this.radius);
    const nh = phys ? null : traffic.collidePlayer(p, this.radius);
    if (nh && (!hit || nh.depth > hit.depth)) hit = nh;
    if (hit) {
      const vn = this.vel.x * hit.nx + this.vel.y * hit.nz;
      if (vn < 0) {
        this.vel.x -= hit.nx * vn * 1.25; this.vel.y -= hit.nz * vn * 1.25;
        this.vel.multiplyScalar(0.8);
        if (-vn > 3.5) ev.crash(-vn, hit.tag, hit);
      }
    }
    this.pos.x = p.x; this.pos.z = p.z;
    for (const ph of world.potholes) {
      if (Math.abs(ph.x - p.x) < 2 && Math.abs(ph.z - p.z) < 2 && Math.hypot(ph.x - p.x, ph.z - p.z) < ph.r + 0.4 && Math.abs(fs) > 3 && this.bump < 0.3) {
        this.bump = 1; ev.pothole(Math.abs(fs), ph);
      }
    }
    this.speed = fs; this.surface = surface;
    this.bump = Math.max(0, this.bump - dt * 2.2);
    const roll = clamp(this.steer * fs * (this.type === 'scooter' ? -0.035 : 0.012), -0.4, 0.4);
    this.lean = damp(this.lean, roll, 6, dt);
    this.syncMesh(surface, fs);
    this.spin += fs / 0.3 * dt;
    for (const w of this.wheels) { w.mesh.rotation.x = this.spin; if (w.front) w.pivot.rotation.y = -this.steer * 0.45; }
  }
  syncMesh(surface = 'road', fs = 0) {
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.heading;
    this.bodyPivot.rotation.z = this.lean + this.dentZ; this.bodyPivot.rotation.x = this.dentX;
    this.bodyPivot.position.y = Math.abs(Math.sin(this.bump * 18)) * 0.12 * this.bump + (surface === 'grass' ? Math.sin(performance.now() * 0.03) * 0.015 * Math.min(1, Math.abs(fs) / 5) : 0);
  }
  damage(d) {
    this.health = Math.max(0, this.health - d);
    // each knock leaves the body a little crooked
    this.dentX = Math.max(-0.06, Math.min(0.06, this.dentX + (Math.random() - 0.5) * d * 0.004));
    this.dentZ = Math.max(-0.07, Math.min(0.07, this.dentZ + (Math.random() - 0.5) * d * 0.005));
    if (this.health <= 0) this.broken = true;
    this.bodyMat.color.setScalar(0.55 + 0.45 * (this.health / 100));
  }
  repair() { this.health = 100; this.broken = false; this.dentX = this.dentZ = 0; this.bodyMat.color.setScalar(1); }
  setOccupied(on) { this.occupied = on; if (this.rider) this.rider.visible = on; }
  park() { this.vel.set(0, 0); this.speed = 0; this.steer = 0; this.lean = 0; this.syncMesh(); }
  setNight(lights, occupied = true) {
    // smashed lights flicker
    const flick = this.health < 30 && Math.random() < 0.15 ? 0.2 : 1;
    this.lightMat.color.setScalar((0.8 + lights * 3 * (occupied ? 1 : 0.15)) * flick);
    this.spot.intensity = occupied ? lights * 45 : 0;
  }
}

// ------------------------------------------------------------------ traffic on the OSM road graph
export function createTraffic(scene, world, audio) {
  const rng = makeRng(99);
  const { nodes, edges, grid } = world.graph;
  const types = {
    auto: MODELS.auto(), car: MODELS.car('#ffffff'), suv: MODELS.car('#ffffff', '#f5f5f5', true), taxi: MODELS.car('#ffffff', '#f5d200'),
    scooter: MODELS.scooter('#ffffff', '#ffffff', '#ffffff'), bus: MODELS.bus(),
  };
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 });
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const MIX = [['auto', 0.3], ['car', 0.22], ['scooter', 0.24], ['taxi', 0.07], ['suv', 0.09], ['bus', 0.08]];
  const N = 200;
  const inst = {};
  const counts = {};
  for (const [k, p] of MIX) counts[k] = Math.round(N * p);
  for (const k of Object.keys(types)) {
    const body = new THREE.InstancedMesh(bakeWheels(types[k]), bodyMat, counts[k]);
    const lights = new THREE.InstancedMesh(types[k].lights, lightMat, counts[k]);
    body.castShadow = true;
    scene.add(body, lights);
    inst[k] = { body, lights };
  }
  const carCols = ['#f5f5f5', '#f5f5f5', '#b0b4b8', '#c62828', '#263238', '#1e88e5', '#f2f2f2', '#8d6e63', '#9e9e9e'];
  const scootCols = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fafafa', '#212121', '#ff7043'];
  // soft headlight pools on the road ahead of every vehicle at night
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 40, 2, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const beamMat = new THREE.MeshBasicMaterial({ map: glowTex, color: '#fff1d0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const beams = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.4, 8).rotateX(-Math.PI / 2), beamMat, N);
  beams.frustumCulled = false; beams.renderOrder = 3; scene.add(beams);
  const vehicles = [];
  // collision shape as circles along the body: cars and SUVs are two circles (front and back), buses three, two-wheelers and autos one.
  // A single big circle let a car's nose sit inside the next car's boot while the circles never touched.
  const SHAPE = (k) => k === 'bus' ? { r: types[k].radius, long: types[k].long } : k === 'car' || k === 'taxi' ? { r: 1.0, long: 1.1 } : k === 'suv' ? { r: 1.05, long: 1.2 } : { r: types[k].radius, long: 0 };
  for (const k of Object.keys(counts)) for (let i = 0; i < counts[k]; i++) {
    const col = new THREE.Color(k === 'car' || k === 'suv' ? rng.pick(carCols) : k === 'scooter' ? rng.pick(scootCols) : '#ffffff');
    inst[k].body.setColorAt(i, col);
    const max = k === 'bus' ? rng.range(8, 9.5) : k === 'auto' ? rng.range(8.5, 11) : k === 'scooter' ? rng.range(11, 14.5) : rng.range(10.5, 14);
    vehicles.push({ type: k, idx: i, e: 0, s: 0, speed: 0, max, x: 0, z: 0, fx: 1, fz: 0, yaw: 0, honkCd: rng.range(2, 8), ...SHAPE(k) });
  }
  for (const k of Object.keys(inst)) if (inst[k].body.instanceColor) inst[k].body.instanceColor.needsUpdate = true;
  // mixed order, so thinning traffic out (night, Calm liveliness) removes every type evenly
  for (let i = vehicles.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [vehicles[i], vehicles[j]] = [vehicles[j], vehicles[i]]; }

  const MAJOR = new Set(['primary', 'secondary', 'tertiary', 'trunk']);
  const B = world.bounds, EDGE_M = 45;
  const nearEdge = (x, z) => x < B.x1 + EDGE_M || x > B.x2 - EDGE_M || z < B.z1 + EDGE_M || z > B.z2 - EDGE_M;
  // edges that lead into a dead end or off the map are never used for spawning
  const usable = edges.map((e) => nodes[e.b].out.length > 0 && !nearEdge(e.bx, e.bz) && !nearEdge(e.ax, e.az));
  const cand = [];
  let fwdX = 0, fwdZ = 1, now = 0;
  function spawn(v, px, pz, rMin, rMax, behind = false) {
    for (let tries = 0; tries < 30; tries++) {
      // respawns happen behind the camera so nobody pops into view
      const a = behind ? Math.atan2(-fwdZ, -fwdX) + (Math.random() - 0.5) * 3.2 : Math.random() * Math.PI * 2;
      const d = rMin + Math.random() * (rMax - rMin);
      grid.query(px + Math.cos(a) * d, pz + Math.sin(a) * d, 60, cand);
      if (!cand.length) continue;
      const c = cand[Math.floor(Math.random() * cand.length)], e = edges[c.i];
      if (!usable[c.i]) continue;
      if (v.type === 'bus' && !MAJOR.has(e.k)) continue;
      // busy main roads get most of the traffic; side streets a trickle
      if (!MAJOR.has(e.k) && Math.random() < 0.55) continue;
      if (e.len < 4) continue;
      const s = Math.random() * e.len, sx = e.ax + e.dx * s, sz = e.az + e.dz * s;
      if (Math.hypot(sx - px, sz - pz) < 30) continue;
      const sy = Math.atan2(e.dx, e.dz);
      if (neighbours(sx, sz, spawnNb).some((o) => o !== v && !o.off && gap(sx, sz, sy, v.long, v.r, o) < 3)) continue;
      v.e = c.i; v.s = s; v.speed = v.max * 0.6;
      place(v, true); v.hidden = false; v.retry = 0;
      { const k = hkey(v.x, v.z); let l = hash.get(k); if (!l) hash.set(k, l = []); l.push(v); } // visible to the next spawn this frame
      return;
    }
    // no free spot right now: wait a moment before trying again instead of retrying every frame
    v.retry = 0.5;
  }
  const spawnNb = [];
  const offOf = (e) => e.oneway ? Math.max(0, e.w / 2 - 1.8) : Math.min(e.w / 4, 3.3);
  function place(v, snap) {
    const e = edges[v.e], o = offOf(e);
    const tx = e.ax + e.dx * v.s + e.dz * o, tz = e.az + e.dz * v.s - e.dx * o;
    if (snap) { v.x = tx; v.z = tz; v.yaw = Math.atan2(e.dx, e.dz); }
    else { v.x = damp(v.x, tx, 8, place.dt); v.z = damp(v.z, tz, 8, place.dt); }
    v.fx = e.dx; v.fz = e.dz;
  }
  function nextEdge(v) {
    const e = edges[v.e], n = nodes[e.b];
    let opts = n.out.filter((i) => edges[i].b !== e.a && usable[i]);
    if (!opts.length) opts = n.out.filter((i) => usable[i]);
    if (!opts.length) return false;
    let tot = 0; const w = opts.map((i) => { const o = edges[i]; const s = o.dx * e.dx + o.dz * e.dz; const ww = (0.4 + Math.max(0, s) * 2) * (MAJOR.has(o.k) ? 1.6 : 1) * (v.type === 'bus' && !MAJOR.has(o.k) ? 0.1 : 1); tot += ww; return ww; });
    let r = Math.random() * tot, pick = opts[0];
    for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) { pick = opts[i]; break; } }
    v.s -= e.len; v.e = pick; return true;
  }

  let started = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  let honkTimer = 1, frameN = 0;
  const zero = new THREE.Vector3(0, 0, 0);
  vehicles.forEach((v, i) => { v.id = i; });
  // never ghost through the player or a red light
  const blockedHard = (v, focus) => focus.blockers.some((b) => { const dx = b.x - v.x, dz = b.z - v.z; return dx * v.fx + dz * v.fz > 0 && Math.hypot(dx, dz) < 14; }) || (nodes[edges[v.e].b].signal && !nodes[edges[v.e].b].signal.canGo(Math.atan2(v.fx, v.fz)));
  // ---- spatial hash: neighbours in O(1) instead of checking every vehicle against every other
  const CELL = 12, hash = new Map(), nb = [];
  const hkey = (x, z) => (Math.floor(x / CELL) * 73856093) ^ (Math.floor(z / CELL) * 19349663);
  function rebuildHash() {
    hash.clear();
    for (const v of vehicles) { if (v.off) continue; const k = hkey(v.x, v.z); let l = hash.get(k); if (!l) hash.set(k, l = []); l.push(v); }
  }
  function neighbours(x, z, out) {
    out.length = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = hash.get(hkey(x + i * CELL, z + j * CELL)); if (l) for (const o of l) out.push(o); }
    return out;
  }
  // smallest distance between two vehicles, each a row of circles along its length
  function gap(ax, az, ay, al, ar, b) {
    let best = Infinity;
    // long bodies get more circles so nothing slips into the gaps between them (buses: 5)
    const an = al > 2 ? 5 : al ? 3 : 1, bn = b.long > 2 ? 5 : b.long ? 3 : 1;
    for (let i = 0; i < an; i++) {
      const oa = an > 1 ? (i / (an - 1) * 2 - 1) * al : 0, px = ax + Math.sin(ay) * oa, pz = az + Math.cos(ay) * oa;
      for (let j = 0; j < bn; j++) {
        const ob = bn > 1 ? (j / (bn - 1) * 2 - 1) * b.long : 0, qx = b.x + Math.sin(b.yaw) * ob, qz = b.z + Math.cos(b.yaw) * ob;
        best = Math.min(best, Math.hypot(px - qx, pz - qz) - ar - b.r);
      }
    }
    return best;
  }
  function update(dt, focus, ev) {
    place.dt = dt; now += dt;
    rebuildHash();
    if (focus.fx !== undefined) { fwdX = focus.fx; fwdZ = focus.fz; }
    if (!started) { started = true; for (const v of vehicles) spawn(v, focus.x, focus.z, 15, 220); }
    // rush hour fills the roads, late night empties them
    const active = Math.round(vehicles.length * (focus.density ?? 0.75) * (focus.live ? focus.live.traffic : 0.7));
    vehicles.forEach((v, i) => { v.off = i >= active; });
    const dtF = dt; frameN++;
    for (const v of vehicles) {
      const I0 = inst[v.type];
      if (v.off) { m.compose(pv.set(0, -50, 0), q, zero); I0.body.setMatrixAt(v.idx, m); I0.lights.setMatrixAt(v.idx, m); beams.setMatrixAt(v.id, m); v.x = v.z = 1e6; continue; }
      if (v.knockT > 0) {
        v.knockT -= dtF; v.dazed = Math.max(v.dazed || 0, 3); v.speed = 0;
        if (v.knockT <= 0) { place(v, false); v.ox = v.kx - v.x; v.oz = v.kz - v.z; }
        v.x = v.kx; v.z = v.kz; v.yaw = v.kyaw;
        const I = inst[v.type]; q.setFromAxisAngle(up, v.yaw); m.compose(pv.set(v.x, 0, v.z), q, one);
        I.body.setMatrixAt(v.idx, m); I.lights.setMatrixAt(v.idx, m); beams.setMatrixAt(v.id, m.compose(pv.set(0, -50, 0), q, zero));
        continue;
      }
      if (Math.hypot(v.x - focus.x, v.z - focus.z) > 270) { if ((v.retry -= dtF) > 0) continue; spawn(v, focus.x, focus.z, 120, 230, true); continue; }
      // distant traffic thinks every other frame (twice the step), close traffic every frame
      const far = Math.abs(v.x - focus.x) > 110 || Math.abs(v.z - focus.z) > 110;
      if (far && ((frameN + v.id) & 1)) continue;
      const dt = far ? dtF * 2 : dtF; place.dt = dt;
      const e0 = edges[v.e];
      let target = v.max * (MAJOR.has(e0.k) ? 1 : 0.75) * (focus.drag ? focus.drag(v.x, v.z) : 1);
      // just got hit by you: the driver stops, gets out of the mood, honks a lot
      if (v.dazed > 0) { v.dazed -= dt; target = 0; v.honkCd -= dt; if (v.honkCd <= 0) { v.honkCd = 0.5 + Math.random(); audio && audio.hornAt(v.type, v.x, v.z, 1.4); } }
      // junctions: one direction at a time (signals, when present, decide who goes)
      const remain = e0.len - v.s, jn = nodes[e0.b];
      if (jn.out.length >= 2 && remain < 10) {
        const hd = Math.atan2(e0.dx, e0.dz);
        if (jn.signal && !jn.signal.canGo(hd) && remain > 1.5) target = Math.min(target, remain > 5 ? 3 : 0);
        else if (!jn.signal) {
          const same = jn.own && Math.abs(Math.atan2(Math.sin(jn.yaw - hd), Math.cos(jn.yaw - hd))) < 0.5;
          // a stopped owner doesn't hold the junction, and anyone who has waited 3.5 s just goes (very Bengaluru)
          if (!jn.own || jn.until < now || jn.own === v || same || v.wait > 3.5) { v.wait = 0; if (remain < 6 && v.speed > 0.8) { jn.own = v; jn.until = now + 1.2; jn.yaw = hd; } }
          else { target = Math.min(target, remain > 4 ? 2 : 0); v.wait = (v.wait || 0) + dt; }
        }
      }
      const look = 7 + v.speed * 0.7 + v.long;
      // a vehicle stuck for a while squeezes through (ghosts past) instead of waiting forever
      neighbours(v.x, v.z, nb);
      if (v.ghost > 0) v.ghost -= dt;
      else for (const o of nb) {
        if (o === v || o.off) continue;
        const dx = o.x - v.x, dz = o.z - v.z;
        if (Math.abs(dx) > look + 6 || Math.abs(dz) > look + 6) continue;
        const along = dx * v.fx + dz * v.fz;
        if (along <= 0 || along > look + o.long) continue;
        if (o.fx * v.fx + o.fz * v.fz < 0.3) continue;
        if (Math.abs(dx * -v.fz + dz * v.fx) >= 1.9) continue;
        // merging lanes: if each sees the other ahead, the lower id goes first
        if (-dx * o.fx - dz * o.fz > 0 && v.id < o.id) continue;
        target = Math.min(target, along - o.long - v.long < 4.5 ? 0 : o.speed * 0.95);
      }
      let blocked = false;
      for (const b of focus.blockers) {
        const dx = b.x - v.x, dz = b.z - v.z, along = dx * v.fx + dz * v.fz, lat = Math.abs(dx * -v.fz + dz * v.fx);
        if (along > 0 && along < look + 2 && lat < 2.4) { target = along - v.long < 5 ? 0 : Math.min(target, 3); blocked = true; if (v.speed < 0.5) b.hits = (b.hits || 0) + 1; }
      }
      v.speed = damp(v.speed, target, target < v.speed ? 5 : 1.2, dt);
      v.stuckT = v.speed < 0.3 ? (v.stuckT || 0) + dt : 0;
      // squeezing past is only allowed when nobody is right in front
      // jammed for ages far from you (two drivers nose to nose): quietly send one elsewhere
      if (v.stuckT > 12 && Math.hypot(v.x - focus.x, v.z - focus.z) > 70) { v.stuckT = 0; spawn(v, focus.x, focus.z, 120, 230, true); continue; }
      if (v.stuckT > 6 && !blockedHard(v, focus) && !nb.some((o) => o !== v && !o.off && (o.x - v.x) * v.fx + (o.z - v.z) * v.fz > 0 && gap(v.x, v.z, v.yaw, v.long, v.r, o) < 3)) { v.ghost = 2.5; v.stuckT = 0; }
      if (blocked && v.speed < 1) {
        v.honkCd -= dt;
        if (v.honkCd <= 0) { v.honkCd = 1.5 + Math.random() * 3; audio && audio.hornAt(v.type, v.x, v.z); ev && ev.honked(v); }
      }
      // hard rule: never move into another vehicle. Look where we'd be next and yield if that spot is taken.
      if (v.speed > 0.05) {
        const nx = v.x + v.fx * v.speed * dt * 4, nz = v.z + v.fz * v.speed * dt * 4;
        for (const o of nb) {
          if (o === v || o.off) continue;
          // cheap box test first: most neighbours are nowhere near touching
          const reach = v.r + o.r + v.long + o.long + 0.5;
          if (Math.abs(o.x - nx) > reach || Math.abs(o.z - nz) > reach) continue;
          // on the same stretch of road the queue order is simply who is further along (so a pile can always unwind)
          const ahead = o.e === v.e ? o.s > v.s || (o.s === v.s && o.id < v.id) : (o.x - v.x) * v.fx + (o.z - v.z) * v.fz > -0.5;
          if (!ahead) continue;
          const gNext = gap(nx, nz, v.yaw, v.long, v.r * 0.9, o);
          if (gNext < 0.35) {
            const gNow = gap(v.x, v.z, v.yaw, v.long, v.r * 0.9, o);
            // moving apart is always allowed: that's how a tangle unwinds
            if (gNext > gNow + 0.01) continue;
            // crossing paths and each waiting for the other: the lower id creeps through, but never into the other's body
            const mutual = o.e !== v.e && (v.x - o.x) * o.fx + (v.z - o.z) * o.fz > -0.5;
            if (mutual && v.id < o.id && gNext > -0.1) continue;
            v.speed = 0; break;
          }
        }
      }
      v.s += v.speed * dt;
      let guard = 0;
      let lost = false;
      while (v.s > edges[v.e].len && guard++ < 5) if (!nextEdge(v)) { lost = true; break; }
      // dead end or heading off the map: vanish behind the barricade and reappear elsewhere
      if (lost || nearEdge(v.x, v.z)) { spawn(v, focus.x, focus.z, 120, 230, true); continue; }
      place(v, false);
      if (v.ox) { const k = Math.exp(-1.2 * dt); v.ox *= k; v.oz *= k; if (Math.abs(v.ox) + Math.abs(v.oz) < 0.05) v.ox = v.oz = 0; v.x += v.ox; v.z += v.oz; }
      v.yaw = angleLerp(v.yaw, Math.atan2(v.fx, v.fz), 1 - Math.exp(-(v.ox ? 2 : 7) * dt));
      const I = inst[v.type];
      q.setFromAxisAngle(up, v.yaw);
      m.compose(pv.set(v.x, 0, v.z), q, one);
      I.body.setMatrixAt(v.idx, m); I.lights.setMatrixAt(v.idx, m);
      m.compose(pv.set(v.x + Math.sin(v.yaw) * (5.5 + v.long), 0.1, v.z + Math.cos(v.yaw) * (5.5 + v.long)), q, one); beams.setMatrixAt(v.id, m);
    }
    beams.instanceMatrix.needsUpdate = true;
    // refresh bounds so off-screen vehicles get frustum-culled
    for (const k of Object.keys(inst)) { const I = inst[k]; I.body.instanceMatrix.needsUpdate = I.lights.instanceMatrix.needsUpdate = true; I.body.computeBoundingSphere(); I.lights.boundingSphere = I.body.boundingSphere; }
    honkTimer -= dt;
    if (honkTimer <= 0 && audio) {
      honkTimer = 0.6 + Math.random() * 2.4;
      const v = vehicles[Math.floor(Math.random() * vehicles.length)];
      if (Math.hypot(v.x - focus.x, v.z - focus.z) < 120) audio.hornAt(v.type, v.x, v.z, 0.5);
    }
  }

  function collidePlayer(p, r) {
    let hit = null;
    for (const v of vehicles) {
      if (Math.abs(v.x - p.x) > 10 || Math.abs(v.z - p.z) > 10) continue;
      const n = v.long ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const off = v.long ? (k - 1) * v.long : 0;
        const cx = v.x + Math.sin(v.yaw) * off, cz = v.z + Math.cos(v.yaw) * off;
        const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), rr = r + v.r;
        if (d < rr && d > 1e-5) {
          const depth = rr - d; p.x += dx / d * depth; p.z += dz / d * depth;
          if (!hit || depth > hit.depth) hit = { nx: dx / d, nz: dz / d, depth, tag: 'vehicle', v };
        }
      }
    }
    return hit;
  }
  function setNight(lights) { lightMat.color.setScalar(0.7 + lights * 3); beamMat.opacity = lights * 0.32; beams.visible = lights > 0.05; }
  return { update, collidePlayer, setNight, vehicles };
}

// ------------------------------------------------------------------ metro trains on the real viaduct
// shared by the background trains and the rideable metro sequence
export function metroCoach() {
  const coach = [
    rbox(2.9, 3.0, 19.6, 0, 1.9, 0, '#e9e6f0', 0.25),
    box(2.94, 0.9, 19.4, 0, 1.0, 0, '#7b2d8e'),
    box(2.95, 0.12, 19.4, 0, 1.55, 0, '#f2c230'),
    box(2.6, 0.3, 19, 0, 3.5, 0, '#bdbac4'),
  ];
  const win = []; for (let i = -8; i <= 8; i += 2) win.push(box(2.96, 0.9, 1.4, 0, 2.4, i, '#fff3d0'));
  return { bodyG: merge(coach), winG: merge(win) };
}
export function trackLines(world) {
  return world.tracks.filter((l) => l.length > 1).map((pts) => {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, L: cum[cum.length - 1] };
  }).filter((l) => l.L > 150);
}
export function sampleLine(line, s) {
  s = clamp(s, 0, line.L);
  let i = 1; while (i < line.cum.length - 1 && line.cum[i] < s) i++;
  const a = line.pts[i - 1], b = line.pts[i], t = (s - line.cum[i - 1]) / ((line.cum[i] - line.cum[i - 1]) || 1);
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}
export function nearestS(line, x, z) {
  let best = 0, bd = Infinity;
  for (let s = 0; s < line.L; s += 4) { const p = sampleLine(line, s); const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
}
export function createMetro(scene, world) {
  const { bodyG, winG } = metroCoach();
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 });
  const winMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const lines = trackLines(world);
  const sample = sampleLine;
  const stationS = (line) => { const st = world.stations.find((s) => s.elevated); return st ? nearestS(line, st.tx, st.tz) : line.L / 2; };
  const trains = lines.slice(0, 2).map((line, i) => {
    const coaches = [0, 1, 2].map(() => { const g = new THREE.Group(); const b = new THREE.Mesh(bodyG, bodyMat); b.castShadow = true; g.add(b, new THREE.Mesh(winG, winMat)); scene.add(g); return g; });
    return { line, coaches, s: i ? line.L * 0.7 : line.L * 0.2, dir: i ? -1 : 1, speed: 12, dwell: 0, stopS: stationS(line), stopped: false };
  });
  function update(dt) {
    for (const t of trains) {
      // at the end of the visible line the train slips into the tunnel, waits out of sight, then comes back
      if (t.hold > 0) { t.hold -= dt; if (t.hold <= 0) { t.coaches.forEach((g) => (g.visible = true)); t.speed = 4; } continue; }
      if (t.dwell > 0) { t.dwell -= dt; if (t.dwell <= 0) t.stopped = true; }
      else {
        const to = (t.stopS - t.s) * t.dir;
        let target = 15;
        if (!t.stopped && to > 0 && to < 80) target = Math.max(0.8, to * 0.3);
        if (!t.stopped && to > 0 && to < 0.6) { t.dwell = 10; t.speed = 0; }
        if (to < -10) t.stopped = false;
        t.speed = damp(t.speed, target, 0.8, dt);
        t.s += t.speed * t.dir * dt;
        if (t.s > t.line.L - 31 && t.dir > 0) { t.dir = -1; t.stopped = false; t.hold = 25; t.coaches.forEach((g) => (g.visible = false)); }
        if (t.s < 31 && t.dir < 0) { t.dir = 1; t.stopped = false; t.hold = 25; t.coaches.forEach((g) => (g.visible = false)); }
      }
      t.coaches.forEach((g, k) => {
        const p = sample(t.line, t.s + (k - 1) * 20.3);
        g.position.set(p.x, 10.5, p.z); g.rotation.y = p.yaw;
      });
    }
  }
  function setNight(lights) { winMat.color.setScalar(0.35 + lights * 2.2); }
  return { update, setNight };
}

// ------------------------------------------------------------------ parked vehicles
// Rows of scooters outside shops and cars half on the footpath: the street looks lived in.
export function createParked(scene, world) {
  const rng = makeRng(321);
  // parked vehicles never move, so they get cheap low-poly stand-ins (~60 triangles each)
  const wheel = (x, y, z, r) => P(new THREE.CylinderGeometry(r, r, 0.2, 6).rotateZ(Math.PI / 2).translate(x, y, z), '#151515');
  const car = merge([box(1.7, 0.6, 3.9, 0, 0.62, 0, '#ffffff'), box(1.5, 0.5, 2.0, 0, 1.15, -0.2, '#22303a'), box(1.45, 0.06, 1.8, 0, 1.43, -0.2, '#ffffff'),
    wheel(-0.8, 0.32, 1.25, 0.32), wheel(0.8, 0.32, 1.25, 0.32), wheel(-0.8, 0.32, -1.25, 0.32), wheel(0.8, 0.32, -1.25, 0.32)]);
  const scoot = merge([box(0.36, 0.45, 1.0, 0, 0.6, -0.15, '#ffffff'), box(0.36, 0.7, 0.14, 0, 0.66, 0.48, '#ffffff'), box(0.3, 0.1, 0.55, 0, 0.88, -0.3, '#151515'),
    box(0.6, 0.05, 0.05, 0, 1.08, 0.5, '#151515'), wheel(0, 0.24, 0.6, 0.24), wheel(0, 0.24, -0.6, 0.24)]);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 });
  const S = [], C = [];
  for (const d of world.doors) {
    const nr = world.nearestRoad(d.x, d.z, 25); if (!nr) continue;
    const side = ((d.x - nr.x) * nr.dz - (d.z - nr.z) * nr.dx) >= 0 ? 1 : -1;
    const n = 2 + Math.floor(rng() * 5), lat = nr.r.hw + 0.9;
    for (let k = 0; k < n; k++) {
      const along = (k - n / 2) * 0.85 + 2.5;
      const x = nr.x + nr.dx * along + nr.dz * lat * side, z = nr.z + nr.dz * along - nr.dx * lat * side;
      if (world.insideBuilding(x, z, 0.4)) continue;
      // parked nose-in at an angle, like every Bengaluru shopfront
      S.push({ x, z, yaw: Math.atan2(-nr.dz * side, nr.dx * side) + 0.5 + (rng() - 0.5) * 0.3 });
    }
  }
  for (const r of world.roads) {
    if (!['residential', 'unclassified', 'tertiary'].includes(r.k)) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 25 || rng() > 0.35) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len, side = rng() < 0.5 ? 1 : -1;
      for (let s2 = 10; s2 < len - 10; s2 += 6 + rng() * 14) {
        if (rng() < 0.4) continue;
        const lat = r.hw + 0.5, x = ax + dx * s2 + dz * lat * side, z = az + dz * s2 - dx * lat * side;
        if (Math.abs(x) > 1300 || Math.abs(z) > 880 || world.insideBuilding(x, z, 1.2)) continue;
        C.push({ x, z, yaw: Math.atan2(dx, dz) + (rng() < 0.5 ? 0 : Math.PI) });
      }
    }
  }
  const COLS = ['#f5f5f5', '#b0b4b8', '#c62828', '#263238', '#1e88e5', '#fdd835', '#43a047', '#8d6e63', '#212121'];
  // one instanced mesh per area, hidden when far away
  const groups = [];
  const CELL = 200;
  const mkCells = (geo, list, r) => {
    const cells = new Map();
    for (const p of list) { const k = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(p); }
    for (const [k, l] of cells) { const im = mk(geo, l, r); const [i, j] = k.split(',').map(Number); groups.push({ m: im, x: (i + 0.5) * CELL, z: (j + 0.5) * CELL }); }
  };
  const mk = (geo, list, r) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    list.forEach((p, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw); m4.compose(new THREE.Vector3(p.x, 0, p.z), q, one); im.setMatrixAt(i, m4); im.setColorAt(i, c.set(COLS[Math.floor(rng() * COLS.length)])); world.addCircle(p.x, p.z, r, 'parked', 1.4).inst = { im, i, yaw: p.yaw }; });
    im.castShadow = true; im.computeBoundingSphere(); scene.add(im); return im;
  };
  mkCells(scoot, S, 0.55);
  mkCells(car, C.slice(0, 900), 1.35);
  function update(cam) { for (const g of groups) g.m.visible = Math.abs(g.x - cam.x) < 330 && Math.abs(g.z - cam.z) < 330; }
  return { update, scooters: S.length, cars: Math.min(900, C.length) };
}
