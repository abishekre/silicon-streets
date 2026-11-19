import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { part, box, merge, clamp, damp, makeRng } from './util.js';
import { sideExtrude, crossExtrude } from './geom.js';
import { createRouter } from './nav.js';

const K = '#141414';
const HEAD = '#fff3d6', TAIL = '#ff2a1a', AMBER = '#ffb300';
const C0 = [0.002, 0.002];
// Math.hypot is several times slower than this in V8, and the traffic loop calls it a lot
const hyp = (x, z) => Math.sqrt(x * x + z * z);

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
    this.elev = 0; this.pitch = 0; // up on a flyover: deck height and slope (main.js)
    this.setType('auto');
  }
  setType(type, occupied = true) {
    // tune / paintFor come from the garage (upgrades you've fitted, the colour you picked)
    this.type = type; this.stats = this.tune ? this.tune(type, VEHICLE_STATS[type]) : VEHICLE_STATS[type];
    const paint = this.paintFor && this.paintFor(type);
    // wheels live outside bodyPivot, so the old vehicle's wheels must be removed too
    this.bodyPivot.clear(); for (const w of this.wheels) this.group.remove(w.pivot); this.wheels = [];
    // the player's own vehicle is built without a rider; the rider is a separate mesh hidden when you get out
    const model = type === 'auto' ? MODELS.auto(false) : type === 'scooter' ? MODELS.scooter(paint || '#e53935', '#3949ab', '#fafafa', false) : MODELS.car(paint || '#c62828');
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
    // broken: it won't go
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
        this.bump = 1; ev.pothole(Math.abs(fs) * (st.susp ?? 1), ph);
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
    this.group.position.set(this.pos.x, this.elev, this.pos.z);
    this.group.rotation.set(-this.pitch, this.heading, 0, 'YXZ');
    this.bodyPivot.rotation.z = this.lean + this.dentZ; this.bodyPivot.rotation.x = this.dentX;
    this.bodyPivot.position.y = Math.abs(Math.sin(this.bump * 18)) * 0.12 * this.bump + (surface === 'grass' ? Math.sin(performance.now() * 0.03) * 0.015 * Math.min(1, Math.abs(fs) / 5) : 0);
  }
  damage(d) {
    d *= this.stats.armour ?? 1;
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
// Every NPC drives an A* route to a destination, keeps to a lane (changing lanes with an indicator after a gap check),
// takes junctions one conflicting movement at a time and stops for people crossing. Nothing overlaps: each move is
// checked against the neighbours before it's made, and a correction pass pushes apart whatever still touches.
export function createTraffic(scene, world, audio) {
  const rng = makeRng(99);
  const { nodes, edges, grid } = world.graph;
  const route = createRouter(world.graph);
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
  // two detail levels: the full model within NEAR_D of you, a two-box stand-in (24 triangles instead of ~1000) beyond.
  // Every frame present() packs only the vehicles in view into these, so nothing behind the camera is drawn.
  const NEAR_D = 45;
  const lowModel = (geo) => {
    geo.computeBoundingBox(); const b = geo.boundingBox, w = b.max.x - b.min.x, h = b.max.y - b.min.y, l = b.max.z - b.min.z, cz = (b.max.z + b.min.z) / 2;
    return merge([box(w, h * 0.55, l, 0, b.min.y + h * 0.275, cz, '#ffffff'), box(w * 0.86, h * 0.45, l * 0.55, 0, b.min.y + h * 0.775, cz - l * 0.05, '#3a4048')]);
  };
  for (const k of Object.keys(types)) {
    const g = bakeWheels(types[k]);
    const body = new THREE.InstancedMesh(g, bodyMat, counts[k]), far = new THREE.InstancedMesh(lowModel(g), bodyMat, counts[k]);
    const lights = new THREE.InstancedMesh(types[k].lights, lightMat, counts[k]);
    body.castShadow = far.castShadow = true;
    body.boundingSphere = far.boundingSphere = lights.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 300);
    body.count = far.count = lights.count = 0;
    scene.add(body, far, lights);
    inst[k] = { body, far, lights };
  }
  const carCols = ['#f5f5f5', '#f5f5f5', '#b0b4b8', '#c62828', '#263238', '#1e88e5', '#f2f2f2', '#8d6e63', '#9e9e9e'];
  const scootCols = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fafafa', '#212121', '#ff7043'];
  // soft headlight pools on the road ahead of every vehicle at night
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 40, 2, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const beamMat = new THREE.MeshBasicMaterial({ map: glowTex, color: '#fff1d0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const beams = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.4, 8).rotateX(-Math.PI / 2), beamMat, N);
  beams.frustumCulled = false; beams.renderOrder = 3; scene.add(beams);
  // indicator blinkers, front and back on the side the vehicle is moving to
  const blink = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.7, 0.1) }), N * 2);
  blink.frustumCulled = false; scene.add(blink);
  const vehicles = [];
  // collision shape as circles along the body: cars and SUVs are two circles (front and back), buses three, two-wheelers and autos one.
  // A single big circle let a car's nose sit inside the next car's boot while the circles never touched.
  const SHAPE = (k) => k === 'bus' ? { r: types[k].radius, long: types[k].long } : k === 'car' || k === 'taxi' ? { r: 1.0, long: 1.1 } : k === 'suv' ? { r: 1.05, long: 1.2 } : { r: types[k].radius, long: 0 };
  const MASS = { scooter: 1, auto: 2.5, car: 5, taxi: 5, suv: 6, bus: 14 };
  // half the body width, for fitting into lanes
  const HALF = { scooter: 0.45, auto: 0.72, car: 0.9, taxi: 0.9, suv: 0.95, bus: 1.28 };
  // gap kept to the bumper ahead when stopped: autos and scooters nose right up to it
  const GAP0 = { scooter: 0.8, auto: 1.1, car: 2.2, taxi: 1.9, suv: 2.4, bus: 3 };
  for (const k of Object.keys(counts)) for (let i = 0; i < counts[k]; i++) {
    const col = new THREE.Color(k === 'car' || k === 'suv' ? rng.pick(carCols) : k === 'scooter' ? rng.pick(scootCols) : '#ffffff');
    inst[k].body.setColorAt(i, col); inst[k].far.setColorAt(i, col);
    const max = k === 'bus' ? rng.range(8, 9.5) : k === 'auto' ? rng.range(8.5, 11) : k === 'scooter' ? rng.range(11, 14.5) : rng.range(10.5, 14);
    const sh = SHAPE(k);
    // every field up front, in one order: one hidden class for the whole fleet keeps the hot loop fast
    vehicles.push({ type: k, idx: i, id: 0, off: false, e: 0, s: 0, lat: 0, li: 0, speed: 0, max, x: 1e6, z: 1e6, fx: 1, fz: 0, yaw: 0, steer: 0, honkCd: rng.range(2, 8), r: sh.r, long: sh.long,
      col, hidden: false, mass: MASS[k], hw: HALF[k], pref: Math.floor(rng() * 3), route: [], ri: 0, nx: -1, pe: -1, pl: 0, pr: 0, inJ: -1, jE: -1, jN: -1, jl: 0, turn: 'S', eta: 0,
      mp: new Float64Array(14), ind: 0, indT: 0, filter: 0, park: 0, wait: 0, stuckT: 0, knockT: 0, kx: 0, kz: 0, kyaw: 0, dazed: 0, greenT: 0, red: false,
      y: 0, up: false, pitch: 0, ox: 0, oz: 0, squeeze: 0, blk: -1, ld: -1, backT: 0, blockT: 0, rec: 0, redraw: false, retry: 0, retryRoute: 0, hk: -1, hl: null, needRoute: true, loop: null, stop: 0, dest: -1 });
  }
  for (const k of Object.keys(inst)) if (inst[k].body.instanceColor) inst[k].body.instanceColor.needsUpdate = true;
  // mixed order, so thinning traffic out (night, Calm liveliness) removes every type evenly
  for (let i = vehicles.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [vehicles[i], vehicles[j]] = [vehicles[j], vehicles[i]]; }
  vehicles.forEach((v, i) => { v.id = i; });

  const MAJOR = new Set(['primary', 'secondary', 'tertiary', 'trunk']);
  const B = world.bounds, EDGE_M = 45;
  const nearEdge = (x, z) => x < B.x1 + EDGE_M || x > B.x2 - EDGE_M || z < B.z1 + EDGE_M || z > B.z2 - EDGE_M;
  // edges that lead into a dead end or off the map are never used for spawning or routing
  const usable = edges.map((e) => nodes[e.b].out.length > 0 && !nearEdge(e.bx, e.bz) && !nearEdge(e.ax, e.az));
  const carCost = (e, i) => !usable[i] ? Infinity : e.k === 'residential' || e.k === 'unclassified' ? 1.35 : MAJOR.has(e.k) ? 0.85 : 1;
  const busCost = (e, i) => !usable[i] ? Infinity : MAJOR.has(e.k) ? 1 : 8;

  // ---- graph facts: real junctions (3+ roads), their width, stop lines and turning radii
  const inEdges = nodes.map(() => []);
  edges.forEach((e, i) => inEdges[e.b].push(i));
  const deg = new Uint8Array(nodes.length), nodeW = new Float32Array(nodes.length);
  nodes.forEach((n, i) => {
    const s = new Set();
    for (const k of n.out) { s.add(edges[k].b); nodeW[i] = Math.max(nodeW[i], edges[k].w); }
    for (const k of inEdges[i]) { s.add(edges[k].a); nodeW[i] = Math.max(nodeW[i], edges[k].w); }
    deg[i] = Math.min(255, s.size);
  });
  const isJ = (ni) => deg[ni] >= 3;
  const boxR = (ni) => nodeW[ni] / 2 + 0.6;
  // stop line: behind the zebra, which world.js paints maxW/2 + 2.6 back from the node, 3 m deep
  const stopD = (ni) => nodeW[ni] / 2 + 4.3;
  const turnR = (e, ne) => Math.min(isJ(e.b) ? boxR(e.b) + 1 : 4, e.len * 0.45, ne.len * 0.45);
  // narrow two-way streets are one shared lane: drive near the middle, pull over to the kerb for oncoming traffic
  const narrow = (e) => !e.oneway && e.w < 7;
  const nLanes = (e) => narrow(e) ? 1 : Math.max(1, Math.floor((e.oneway ? e.w : e.w / 2) / 3.2));
  const kerbLat = (e, v) => e.w / 2 - v.hw - 0.45;
  // lateral offset is to the left of the edge's direction (traffic keeps left); lane 0 is the kerb lane
  function laneLat(e, li, v) {
    if (narrow(e)) return Math.min(0.9, kerbLat(e, v));
    const n = nLanes(e), lw = (e.oneway ? e.w : e.w / 2) / n;
    return clamp(e.w / 2 - lw * (Math.min(li, n - 1) + 0.5), -kerbLat(e, v), kerbLat(e, v));
  }
  const nextLat = (v, ne) => laneLat(ne, Math.min(v.li, nLanes(ne) - 1), v);
  const turnOf = (e, ne) => { const c = e.dz * ne.dx - e.dx * ne.dz, d = e.dx * ne.dx + e.dz * ne.dz; return d < -0.7 ? 'U' : c > 0.45 ? 'L' : c < -0.45 ? 'R' : 'S'; };

  // ---- where a vehicle is for a given (s, lat): straight along the edge, or on a smooth curve through the node
  const P = { x: 0, z: 0, fx: 0, fz: 1 };
  function bez(e, l0, ne, l1, R, t, out) {
    const nx = e.bx, nz = e.bz;
    const ax = nx - e.dx * R + e.dz * l0, az = nz - e.dz * R - e.dx * l0;
    const cx = nx + ne.dx * R + ne.dz * l1, cz = nz + ne.dz * R - ne.dx * l1;
    // control point where the two offset lines meet (halfway between them when nearly straight)
    const ox = nx + e.dz * l0, oz = nz - e.dx * l0, px = nx + ne.dz * l1, pz = nz - ne.dx * l1;
    const det = ne.dx * e.dz - e.dx * ne.dz;
    let bx = (ox + px) / 2, bz = (oz + pz) / 2;
    if (Math.abs(det) > 0.15) { const rx = px - ox, rz = pz - oz, k = clamp((ne.dx * rz - ne.dz * rx) / det, -R, R); bx = ox + e.dx * k; bz = oz + e.dz * k; }
    const u = 1 - t;
    out.x = u * u * ax + 2 * u * t * bx + t * t * cx; out.z = u * u * az + 2 * u * t * bz + t * t * cz;
    const tx = u * (bx - ax) + t * (cx - bx), tz = u * (bz - az) + t * (cz - bz), l = hyp(tx, tz);
    if (l > 1e-6) { out.fx = tx / l; out.fz = tz / l; } else { out.fx = e.dx; out.fz = e.dz; }
  }
  function nextOf(v) {
    if (v.ri + 1 < v.route.length) return v.route[v.ri + 1];
    if (v.nx < 0) v.nx = wander(v);
    return v.nx;
  }
  // pose for (s, lat) on the current edge; s past the end continues onto the next edge
  function poseAt(v, s, lat, out) {
    const e = edges[v.e];
    if (s > e.len) {
      const ni = nextOf(v); if (ni < 0) { s = e.len; } else {
        const ne = edges[ni], R = turnR(e, ne), s2 = s - e.len, l1 = nextLat(v, ne);
        if (s2 < R) bez(e, lat, ne, l1, R, 0.5 + s2 / (2 * R), out);
        else { out.x = ne.ax + ne.dx * s2 + ne.dz * l1; out.z = ne.az + ne.dz * s2 - ne.dx * l1; out.fx = ne.dx; out.fz = ne.dz; }
        return;
      }
    }
    if (v.pe >= 0 && s < v.pr) { bez(edges[v.pe], v.pl, e, lat, v.pr, 0.5 + Math.max(0, s) / (2 * v.pr), out); return; }
    const ni = nextOf(v);
    if (ni >= 0) { const ne = edges[ni], R = turnR(e, ne); if (s > e.len - R) { bez(e, lat, ne, nextLat(v, ne), R, (s - (e.len - R)) / (2 * R), out); return; } }
    out.x = e.ax + e.dx * s + e.dz * lat; out.z = e.az + e.dz * s - e.dx * lat; out.fx = e.dx; out.fz = e.dz;
  }
  const inTurn = (v) => { if (v.pe >= 0 && v.s < v.pr + 0.5) return true; const ni = nextOf(v); if (ni < 0) return false; const e = edges[v.e]; return v.s > e.len - turnR(e, edges[ni]) - 6; };
  // onto the next edge: the curve's second half uses the lat the first half aimed for
  function advance(v) {
    const e = edges[v.e], ni = nextOf(v); if (ni < 0) return false;
    const ne = edges[ni];
    v.pl = v.lat; v.pr = turnR(e, ne); v.lat = nextLat(v, ne); v.pe = v.e; v.s -= e.len; v.e = ni;
    v.li = Math.min(v.li, nLanes(ne) - 1);
    if (v.ri + 1 < v.route.length && v.route[v.ri + 1] === ni) v.ri++; else { v.route.length = 0; v.ri = 0; }
    v.nx = -1;
    return true;
  }
  // no route (yet): a plausible turn, weighted towards going straight and onto main roads
  function wander(v) {
    const e = edges[v.e], n = nodes[e.b];
    let tot = 0;
    for (const i of n.out) if (edges[i].b !== e.a && usable[i]) tot += wW(v, e, edges[i]);
    if (tot <= 0) { for (const i of n.out) if (usable[i]) return i; return -1; }
    let r = Math.random() * tot;
    for (const i of n.out) if (edges[i].b !== e.a && usable[i]) { r -= wW(v, e, edges[i]); if (r <= 0) return i; }
    return -1;
  }
  const wW = (v, e, o) => (0.4 + Math.max(0, o.dx * e.dx + o.dz * e.dz) * 2) * (MAJOR.has(o.k) ? 1.6 : 1) * (v.type === 'bus' && !MAJOR.has(o.k) ? 0.1 : 1);

  // ---- spatial hashes: vehicles, people on the carriageway, cows. Arrays are kept and reused frame to frame.
  const CELL = 12, GX = B.x1 - 60, GZ = B.z1 - 60, GW = Math.ceil((B.x2 - B.x1 + 120) / CELL), GH = Math.ceil((B.z2 - B.z1 + 120) / CELL);
  const cellOf = (x, z) => { const i = Math.floor((x - GX) / CELL), j = Math.floor((z - GZ) / CELL); return i < 0 || j < 0 || i >= GW || j >= GH ? -1 : i + j * GW; };
  const mkHash = () => ({ c: new Array(GW * GH), used: [] });
  // vehicles up on a flyover live in their own hash: they never see the traffic, people or cows underneath
  const vh = mkHash(), ph = mkHash(), vu = mkHash(), hashOf = (v) => (v.up ? vu : vh);
  function hput(H, o) { const k = cellOf(o.x, o.z); o.hk = k; if (k < 0) { o.hl = null; return; } let l = H.c[k]; if (!l) H.c[k] = l = []; if (!l.length) H.used.push(l); l.push(o); o.hl = l; }
  function hclear(H) { for (const l of H.used) l.length = 0; H.used.length = 0; }
  function hmove(v) {
    // height on a flyover deck (edges carry the deck height at each end), and the slope for the body
    const e = edges[v.e];
    if (e && e.l) { const t = v.s / e.len; v.y = e.ya + (e.yb - e.ya) * (t < 0 ? 0 : t > 1 ? 1 : t); v.pitch = Math.atan2(e.yb - e.ya, e.len); } else { v.y = 0; v.pitch = 0; }
    const up = v.y > 2.2, k = cellOf(v.x, v.z);
    if (k === v.hk && up === v.up && (v.hl || k < 0)) return;
    if (v.hl) { const l = v.hl, i = l.indexOf(v); if (i >= 0) { l[i] = l[l.length - 1]; l.pop(); } }
    v.up = up; hput(hashOf(v), v);
  }
  function near(H, x, z, out, reach = 1) {
    out.length = 0;
    const ci = Math.floor((x - GX) / CELL), cj = Math.floor((z - GZ) / CELL);
    for (let j = Math.max(0, cj - reach); j <= Math.min(GH - 1, cj + reach); j++) for (let i = Math.max(0, ci - reach); i <= Math.min(GW - 1, ci + reach); i++) {
      const l = H.c[i + j * GW]; if (l) for (let k = 0; k < l.length; k++) out.push(l[k]);
    }
    return out;
  }
  // cows never move and there are only a handful: a plain list
  let cows = [];
  const cowEdge = new Uint8Array(edges.length);
  const nb = [], nb2 = [], pn = [], spawnNb = [];
  // smallest distance between two bodies, each a row of circles along its length
  // headings are passed as their unit vector (fx, fz) = (sin yaw, cos yaw): no trig in here
  function gap2(ax, az, sa, ca, al, ar, bx, bz, sb, cb, bl, br) {
    let best = Infinity;
    // long bodies get more circles so nothing slips into the gaps between them (buses: 5)
    const an = al > 2 ? 5 : al ? 3 : 1, bn = bl > 2 ? 5 : bl ? 3 : 1;
    for (let i = 0; i < an; i++) {
      const oa = an > 1 ? (i / (an - 1) * 2 - 1) * al : 0, px = ax + sa * oa, pz = az + ca * oa;
      for (let j = 0; j < bn; j++) {
        const ob = bn > 1 ? (j / (bn - 1) * 2 - 1) * bl : 0, d = hyp(px - bx - sb * ob, pz - bz - cb * ob) - ar - br;
        if (d < best) best = d;
      }
    }
    return best;
  }
  const gapV = (x, z, fx, fz, v, o) => gap2(x, z, fx, fz, v.long, v.r, o.x, o.z, o.fx, o.fz, o.long, o.r);

  // ---- junction boxes: who is in them, who is about to enter
  const J = new Map(), jUsed = [];
  const jx = (ni) => { let j = J.get(ni); if (!j) J.set(ni, j = { occ: [], app: [] }); return j; };
  // a movement through a junction, sampled along the curve the vehicle will actually drive: from the stop line,
  // through the turn, to a little way down the exit (5 points, plus their bounding box for a quick reject)
  const MP = { x: 0, z: 0, fx: 0, fz: 1 };
  function movement(v, e, ni) {
    const ne = edges[ni], R = turnR(e, ne), l1 = nextLat(v, ne), sd = Math.max(stopD(e.b), R + 1), m = v.mp;
    m[0] = e.bx - e.dx * sd + e.dz * v.lat; m[1] = e.bz - e.dz * sd - e.dx * v.lat;
    for (let k = 0; k < 3; k++) { bez(e, v.lat, ne, l1, R, k / 2, MP); m[2 + k * 2] = MP.x; m[3 + k * 2] = MP.z; }
    m[8] = e.bx + ne.dx * (R + 3) + ne.dz * l1; m[9] = e.bz + ne.dz * (R + 3) - ne.dx * l1;
    let x1 = Infinity, x2 = -Infinity, z1 = Infinity, z2 = -Infinity;
    for (let k = 0; k < 10; k += 2) { x1 = Math.min(x1, m[k]); x2 = Math.max(x2, m[k]); z1 = Math.min(z1, m[k + 1]); z2 = Math.max(z2, m[k + 1]); }
    m[10] = x1; m[11] = x2; m[12] = z1; m[13] = z2;
    v.jE = v.e; v.jN = ni; v.jl = l1; v.turn = turnOf(e, ne);
  }
  const orient = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  function segD(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, t = clamp(((px - ax) * dx + (pz - az) * dz) / l, 0, 1); return hyp(px - ax - dx * t, pz - az - dz * t); }
  // two movements conflict if their paths cross or pass closer than the two bodies need
  function conflict(a, b) {
    if (a.jE === b.jE) return false; // same approach: that's just queueing
    if (a.jN === b.jN) return Math.abs(a.jl - b.jl) < a.hw + b.hw + 0.6; // merging into the same lane
    const A = a.mp, Bp = b.mp, rr = a.hw + b.hw + 0.9;
    if (A[10] > Bp[11] + rr || Bp[10] > A[11] + rr || A[12] > Bp[13] + rr || Bp[12] > A[13] + rr) return false;
    for (let i = 0; i < 8; i += 2) for (let k = 0; k < 8; k += 2) {
      const ax = A[i], az = A[i + 1], bx = A[i + 2], bz = A[i + 3], cx = Bp[k], cz = Bp[k + 1], dx = Bp[k + 2], dz = Bp[k + 3];
      if (orient(ax, az, bx, bz, cx, cz) * orient(ax, az, bx, bz, dx, dz) < 0 && orient(cx, cz, dx, dz, ax, az) * orient(cx, cz, dx, dz, bx, bz) < 0) return true;
      if (segD(cx, cz, ax, az, bx, bz) < rr || segD(dx, dz, ax, az, bx, bz) < rr || segD(ax, az, cx, cz, dx, dz) < rr || segD(bx, bz, cx, cz, dx, dz) < rr) return true;
    }
    return false;
  }
  // who goes first: straight before turns, right turns (across oncoming traffic) last, then whoever is closer;
  // a long wait buys priority, and autos and scooters nose in a little earlier than they should
  const TR = { S: 0, L: 0.6, R: 2, U: 2.6 };
  const key = (v) => TR[v.turn] * 2 + v.eta - Math.min(v.wait, 12) * 0.6 - (v.type === 'auto' || v.type === 'scooter' ? 0.6 : 0);
  const beats = (o, v) => { const a = key(o), b = key(v); return a < b - 0.05 || (a <= b + 0.05 && o.id < v.id); };
  function boxEmpty(j, ni) { for (const o of j.occ) if (o.inJ === ni && !o.off) return false; return true; }

  // ---- routes: a destination a few hundred metres off; buses loop between stops on main roads
  const tmpRoute = [];
  const stats = { arrived: 0, routed: 0, parked: 0, despawned: 0, routeFail: 0 };
  // somewhere a plausible drive ahead: a random run along the network (so it's always reachable, and one-way
  // streets don't turn a 150 m hop into a 1 km loop). A* then finds the best way there.
  // Out past 120 m from you, turns that head back your way are favoured, so traffic keeps circulating where you are.
  const dW = (e, o, n) => { const dx = fX - n.x, dz = fZ - n.z, l = hyp(dx, dz); return wW(DW, e, o) * (l > 120 ? 1 + 2.5 * Math.max(0, (o.dx * dx + o.dz * dz) / l) : 1); };
  function pickDest(fromE, dist, major) {
    let e = edges[fromE], d = 0, ni = e.b;
    for (let k = 0; k < 60 && d < dist; k++) {
      const n = nodes[ni];
      let tot = 0;
      for (const i of n.out) if (edges[i].b !== e.a && usable[i] && (!major || MAJOR.has(edges[i].k))) tot += dW(e, edges[i], n);
      if (tot <= 0) break;
      let r = Math.random() * tot, pick = -1;
      for (const i of n.out) if (edges[i].b !== e.a && usable[i] && (!major || MAJOR.has(edges[i].k))) { r -= dW(e, edges[i], n); if (r <= 0) { pick = i; break; } }
      if (pick < 0) break;
      e = edges[pick]; d += e.len; ni = e.b;
    }
    return d > 40 ? ni : -1;
  }
  const DW = { type: 'car' };
  function plan(v) {
    v.needRoute = false;
    // buses: a loop of stops along the main roads
    if (v.type === 'bus' && !v.loop) { v.loop = []; let e = v.e; for (let k = 0; k < 3; k++) { const n = pickDest(e, 150 + Math.random() * 120, true); if (n < 0) break; v.loop.push(n); e = nodes[n].out.find((i) => usable[i]) ?? e; } v.stop = 0; }
    const dest = v.loop && v.loop.length ? v.loop[v.stop % v.loop.length] : pickDest(v.e, 150 + Math.random() * 250, false);
    if (dest < 0 || !route(v.e, dest, tmpRoute, v.type === 'bus' ? busCost : carCost) || !tmpRoute.length) { stats.routeFail++; v.retryRoute = 2 + Math.random() * 2; if (v.loop) v.stop++; return; }
    v.route.length = 0; v.route.push(v.e); for (const k of tmpRoute) v.route.push(k);
    v.ri = 0; v.nx = -1; v.dest = dest; stats.routed++;
  }
  // got there: a new destination, pull over and park for a bit, or leave the area
  function arrive(v, focus) {
    stats.arrived++; v.route.length = 0; v.ri = 0;
    if (v.loop) { v.stop++; v.park = 5 + Math.random() * 4; stats.parked++; return; }
    const r = Math.random();
    if (r < 0.55) v.needRoute = true;
    else if (r < 0.82) { v.park = 6 + Math.random() * 10; stats.parked++; }
    else { stats.despawned++; spawn(v, focus.x, focus.z, 120, 230, true); }
  }

  const cand = [];
  let fwdX = 0, fwdZ = 1, now = 0, fX = 0, fZ = 0;
  function reset(v) {
    v.knockT = 0; v.dazed = 0; v.stuckT = 0; v.wait = 0; v.inJ = -1; v.pe = -1; v.park = 0; v.ind = 0; v.indT = 0; v.filter = 0; v.greenT = 0; v.red = false;
    v.ox = v.oz = 0; v.blk = -1; v.backT = 0; v.route.length = 0; v.ri = 0; v.nx = -1; v.needRoute = true; v.retryRoute = 0; v.loop = null; v.steer = 0; v.blockT = 0;
  }
  function spawn(v, px, pz, rMin, rMax, behind = false) {
    for (let tries = 0; tries < 30; tries++) {
      // respawns happen behind the camera so nobody pops into view
      const a = behind ? Math.atan2(-fwdZ, -fwdX) + (Math.random() - 0.5) * 3.2 : Math.random() * Math.PI * 2;
      const d = rMin + Math.random() * (rMax - rMin);
      grid.query(px + Math.cos(a) * d, pz + Math.sin(a) * d, 60, cand);
      if (!cand.length) continue;
      const c = cand[Math.floor(Math.random() * cand.length)], e = edges[c.i];
      // the edge grid's cell keys can collide, so a 'nearby' edge may be anywhere: check
      if (!usable[c.i] || Math.abs(c.mx - px - Math.cos(a) * d) > 140 || Math.abs(c.mz - pz - Math.sin(a) * d) > 140) continue;
      if (v.type === 'bus' && !MAJOR.has(e.k)) continue;
      // busy main roads get most of the traffic; side streets a trickle
      if (!MAJOR.has(e.k) && Math.random() < 0.55) continue;
      if (e.len < 14 || e.l) continue; // nobody appears out of thin air on a flyover
      const s = 5 + Math.random() * (e.len - 12), li = Math.floor(Math.random() * nLanes(e)), lat = laneLat(e, li, v);
      const sx = e.ax + e.dx * s + e.dz * lat, sz = e.az + e.dz * s - e.dx * lat;
      if (hyp(sx - px, sz - pz) < 30) continue;
      const sy = Math.atan2(e.dx, e.dz);
      let ok = true;
      for (const o of near(vh, sx, sz, spawnNb)) if (o !== v && !o.off && gap2(sx, sz, e.dx, e.dz, v.long, v.r, o.x, o.z, o.fx, o.fz, o.long, o.r) < 3) { ok = false; break; }
      if (ok) for (const o of near(ph, sx, sz, spawnNb)) if (hyp(o.x - sx, o.z - sz) < 6) { ok = false; break; }
      if (!ok) continue;
      reset(v); v.hidden = false;
      v.e = c.i; v.s = s; v.li = li; v.lat = lat; v.speed = v.max * 0.5;
      v.x = sx; v.z = sz; v.fx = e.dx; v.fz = e.dz; v.yaw = sy; v.retry = 0;
      hmove(v); // visible to the next spawn this frame
      return true;
    }
    // no free spot right now: wait a moment before trying again instead of retrying every frame
    v.retry = 0.5; v.x = v.z = 1e6; hmove(v);
    return false;
  }

  // ---- the hard rule: a move is only made if it keeps clear of every vehicle, person and cow nearby
  const MIN = 0.12;
  let blockerId = -1;
  function clearAt(v, x, z, fx, fz) {
    for (const o of nb) {
      if (o === v || o.off) continue;
      const reach = v.r + o.r + v.long + o.long + MIN, dx = o.x - x, dz = o.z - z;
      if (dx > reach || dx < -reach || dz > reach || dz < -reach || dx * dx + dz * dz > reach * reach) continue;
      const g1 = gapV(x, z, fx, fz, v, o);
      if (g1 >= MIN) continue;
      const g0 = gapV(v.x, v.z, v.fx, v.fz, v, o);
      // closer than the margin is only fine if this move opens the gap, and never while overlapping
      if (g0 >= 0 && g1 > g0 + 1e-4) continue;
      blockerId = o.id; return false;
    }
    for (const p of pn) {
      if (Math.abs(p.x - x) > v.long + 3 || Math.abs(p.z - z) > v.long + 3) continue;
      const g1 = gap2(x, z, fx, fz, v.long, v.r, p.x, p.z, 0, 1, 0, 0.35);
      if (g1 < 0.25 && g1 <= gap2(v.x, v.z, v.fx, v.fz, v.long, v.r, p.x, p.z, 0, 1, 0, 0.35)) return false;
    }
    if (cowEdge[v.e]) for (const c of cows) {
      if (Math.abs(c.x - x) > v.long + 4 || Math.abs(c.z - z) > v.long + 4) continue;
      const g1 = gap2(x, z, fx, fz, v.long, v.r, c.x, c.z, 0, 1, 0, c.r);
      if (g1 < 0.15 && g1 <= gap2(v.x, v.z, v.fx, v.fz, v.long, v.r, c.x, c.z, 0, 1, 0, c.r)) return false;
    }
    return true;
  }
  function tryMove(v, s, lat) {
    poseAt(v, s, lat, P);
    if (!clearAt(v, P.x, P.z, P.fx, P.fz)) return false;
    v.s = s; v.lat = lat; v.x = P.x; v.z = P.z; v.fx = P.fx; v.fz = P.fz; v.yaw = Math.atan2(P.fx, P.fz);
    return true;
  }

  // ---- correction pass: anything that still touches (knocks, the tow truck squeezing past) is pushed apart, the lighter one more
  function nudge(v, dx, dz) {
    if (v.knockT > 0 || v.off) return;
    const e = edges[v.e];
    v.s = clamp(v.s + dx * v.fx + dz * v.fz, 0, e.len);
    v.lat = clamp(v.lat + dx * e.dz - dz * e.dx, -(e.w / 2 - v.hw * 0.5), e.w / 2 - v.hw * 0.5);
    poseAt(v, v.s, v.lat, P); v.x = P.x; v.z = P.z; v.fx = P.fx; v.fz = P.fz; v.yaw = Math.atan2(P.fx, P.fz);
    hmove(v); v.redraw = true;
  }
  const SP = { d: 0, nx: 0, nz: 0 };
  function sep(a, b) {
    // deepest pair of circles and the direction from b to a
    SP.d = Infinity;
    const an = a.long > 2 ? 5 : a.long ? 3 : 1, bn = b.long > 2 ? 5 : b.long ? 3 : 1;
    for (let i = 0; i < an; i++) {
      const oa = an > 1 ? (i / (an - 1) * 2 - 1) * a.long : 0, px = a.x + a.fx * oa, pz = a.z + a.fz * oa;
      for (let j = 0; j < bn; j++) {
        const ob = bn > 1 ? (j / (bn - 1) * 2 - 1) * b.long : 0, qx = b.x + b.fx * ob, qz = b.z + b.fz * ob;
        const dx = px - qx, dz = pz - qz, l = hyp(dx, dz), d = l - a.r - b.r;
        if (d < SP.d) { SP.d = d; if (l > 1e-4) { SP.nx = dx / l; SP.nz = dz / l; } else { SP.nx = a.fz; SP.nz = -a.fx; } }
      }
    }
    return SP.d;
  }
  // a third of the fleet each frame, plus anything that was just knocked, squeezed or moved by the pass itself
  function separate() {
    for (const v of vehicles) {
      if (v.off || v.x > 1e5) continue;
      if ((v.id + frameN) % 3 && !(v.knockT > 0) && !(v.squeeze > 0) && !(v.rec > 0)) continue;
      if (v.rec > 0) v.rec--;
      near(hashOf(v), v.x, v.z, nb2);
      for (const o of nb2) {
        if (o === v || o.off) continue;
        const reach = v.r + o.r + v.long + o.long, dx = o.x - v.x, dz = o.z - v.z;
        if (dx * dx + dz * dz > reach * reach) continue;
        const d = sep(v, o);
        if (d >= 0) continue;
        const fixed = v.knockT > 0, ofixed = o.knockT > 0;
        if (fixed && ofixed) continue;
        const w = fixed ? 0 : ofixed ? 1 : o.mass / (v.mass + o.mass), push = -d + 0.03, nx = SP.nx, nz = SP.nz;
        nudge(v, nx * push * w, nz * push * w); nudge(o, -nx * push * (1 - w), -nz * push * (1 - w));
        v.rec = o.rec = 3;
      }
    }
  }
  function overlaps() {
    let n = 0;
    for (const v of vehicles) {
      if (v.off || v.x > 1e5) continue;
      near(hashOf(v), v.x, v.z, nb2);
      for (const o of nb2) if (o.id > v.id && !o.off && Math.abs(o.x - v.x) < 16 && Math.abs(o.z - v.z) < 16 && sep(v, o) < -0.05) n++;
    }
    return n;
  }

  // ---- for people: is a spot clear of vehicles, and is it safe to step off the kerb here
  function vehAt(x, z, r) {
    near(vh, x, z, nb2);
    for (const o of nb2) {
      if (o.off || Math.abs(o.x - x) > o.long + o.r + r + 1 || Math.abs(o.z - z) > o.long + o.r + r + 1) continue;
      if (gap2(x, z, 0, 1, 0, r, o.x, o.z, o.fx, o.fz, o.long, o.r) < 0) return o;
    }
    return null;
  }
  const cc = [];
  // need: seconds the crossing takes. Patient people want every approaching vehicle that far away;
  // impatient ones step out once everyone coming can still stop comfortably.
  function crossClear(ax, az, bx, bz, need, impatient) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, cx = bx - ax, cz = bz - az, cl = hyp(cx, cz) || 1;
    near(vh, mx, mz, cc, 4);
    for (const o of cc) {
      if (o.off) continue;
      // where along its heading the vehicle meets the crossing line, and how far along the crossing that is
      const det = o.fx * cz - o.fz * cx; if (Math.abs(det) < 0.2) { if (segD(o.x, o.z, ax, az, bx, bz) < o.r + o.long + 1.2) return false; continue; }
      const rx = ax - o.x, rz = az - o.z, t = (rx * cz - rz * cx) / det, u = (rx * o.fz - rz * o.fx) / det;
      if (u < -2.5 / cl || u > 1 + 2.5 / cl) continue;
      const room = t - o.long - o.r - 1.5;
      if (t > -(o.long + o.r + 1.5) && room < 1.5) return false; // on the crossing, or right at it
      if (room < 0 || o.speed < 0.3) continue;
      if (impatient ? room < o.speed * o.speed / 7 + 5 : room / o.speed < need) return false;
    }
    return true;
  }
  let peds = null;
  function setPeds(list) {
    peds = list; list.vehAt = vehAt; list.crossClear = crossClear;
    cows = (list.cows || []).map((c) => ({ x: c.x, z: c.z, r: 1.15 }));
    // only edges within reach of a cow ever look for one
    for (const c of cows) { grid.query(c.x, c.z, 120, cand); for (const k of cand) { const e = edges[k.i]; if (segD(c.x, c.z, e.ax, e.az, e.bx, e.bz) < 32) cowEdge[k.i] = 1; } }
  }

  let started = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), eu = new THREE.Euler();
  let honkTimer = 1, frameN = 0, routeBudget = 0;
  const zero = new THREE.Vector3(0, 0, 0), hide = new THREE.Matrix4().compose(new THREE.Vector3(0, -50, 0), new THREE.Quaternion(), zero);
  const stopProfile = (d) => d <= 0.25 ? 0 : Math.sqrt(9 * (d - 0.25));
  function draw(v) {
    // (the body itself is placed by present(), once per frame)
    q.setFromAxisAngle(up, v.yaw + v.steer);
    m.compose(pv.set(v.x + v.fx * (5.5 + v.long), v.y + 0.1, v.z + v.fz * (5.5 + v.long)), q, one); beams.setMatrixAt(v.id, m);
    if (v.ind && (now * 2.6) % 1 < 0.55) {
      const sx = v.fz * v.ind * v.hw, sz = -v.fx * v.ind * v.hw, f = v.long + v.r * 0.8;
      m.compose(pv.set(v.x + sx + v.fx * f, v.y + 0.78, v.z + sz + v.fz * f), q, one); blink.setMatrixAt(v.id * 2, m);
      m.compose(pv.set(v.x + sx - v.fx * f, v.y + 0.78, v.z + sz - v.fz * f), q, one); blink.setMatrixAt(v.id * 2 + 1, m);
    } else { blink.setMatrixAt(v.id * 2, hide); blink.setMatrixAt(v.id * 2 + 1, hide); }
  }
  function hideV(v) { v.hidden = true; beams.setMatrixAt(v.id, hide); blink.setMatrixAt(v.id * 2, hide); blink.setMatrixAt(v.id * 2 + 1, hide); }

  // pack the vehicles you can see into the instance buffers: full model near, stand-in further out, none behind the camera
  const nN = {}, nF = {}, nL = {};
  function present(focus) {
    for (const k in inst) nN[k] = nF[k] = nL[k] = 0;
    for (const v of vehicles) {
      if (v.off || v.hidden) continue;
      const dx = v.x - focus.x, dz = v.z - focus.z, d = Math.hypot(dx, dz);
      if (d > 25 && dx * (focus.fx || 0) + dz * (focus.fz || 0) < -25) continue;
      const I = inst[v.type], near = d < NEAR_D, mesh = near ? I.body : I.far, i = near ? nN[v.type]++ : nF[v.type]++;
      if (v.pitch) q.setFromEuler(eu.set(-v.pitch, v.yaw + v.steer, 0, 'YXZ')); else q.setFromAxisAngle(up, v.yaw + v.steer);
      m.compose(pv.set(v.x, v.y, v.z), q, one);
      mesh.setMatrixAt(i, m); mesh.setColorAt(i, v.col); I.lights.setMatrixAt(nL[v.type]++, m);
    }
    for (const k in inst) {
      const I = inst[k];
      I.body.count = nN[k]; I.far.count = nF[k]; I.lights.count = nL[k];
      I.body.instanceMatrix.needsUpdate = I.far.instanceMatrix.needsUpdate = I.lights.instanceMatrix.needsUpdate = true;
      I.body.instanceColor.needsUpdate = I.far.instanceColor.needsUpdate = true;
      // one fixed bound around you instead of recomputing it from every instance each frame
      I.body.boundingSphere.center.set(focus.x, 0, focus.z);
    }
  }
  function update(dt, focus, ev) {
    now += dt; frameN++;
    if (focus.fx !== undefined) { fwdX = focus.fx; fwdZ = focus.fz; }
    fX = focus.x; fZ = focus.z;
    // rush hour fills the roads, late night empties them
    const active = Math.round(vehicles.length * (focus.density ?? 0.75) * (focus.live ? focus.live.traffic : 0.7));
    for (let i = 0; i < vehicles.length; i++) vehicles[i].off = i >= active;
    hclear(vh); hclear(vu);
    for (const v of vehicles) { v.hl = null; if (!v.off) hput(hashOf(v), v); }
    hclear(ph);
    if (peds) for (const p of peds) if (p.road && p.x < 1e5) hput(ph, p);
    if (!started) { started = true; for (const v of vehicles) if (!v.off) spawn(v, focus.x, focus.z, 15, 220); }
    // who is lining up at which junction this frame
    for (const j of jUsed) j.app.length = 0;
    jUsed.length = 0;
    for (const v of vehicles) {
      if (v.off || v.knockT > 0 || v.x > 1e5) continue;
      const e = edges[v.e]; if (!isJ(e.b) || v.inJ === e.b) continue;
      const dl = e.len - v.s - v.long - v.r - stopD(e.b); if (dl > 22) continue;
      const ni = nextOf(v); if (ni < 0) continue;
      movement(v, e, ni);
      v.eta = Math.max(0, dl) / Math.max(v.speed, 1.5);
      const sg = nodes[e.b].signal;
      if (sg && sg.state(Math.atan2(e.dx, e.dz), v.turn) === 'stop') continue;
      const j = jx(e.b); if (!j.app.length) jUsed.push(j); j.app.push(v);
    }
    routeBudget = 3;
    const blockers = focus.blockers;
    for (const v of vehicles) {
      if (v.off) { hideV(v); v.x = v.z = 1e6; continue; }
      if (v.knockT > 0) {
        // physics owns it for now; traffic reads where it ended up
        v.knockT -= dt; v.dazed = Math.max(v.dazed, 3); v.speed = 0;
        v.x = v.kx; v.z = v.kz; v.yaw = v.kyaw; v.fx = Math.sin(v.yaw); v.fz = Math.cos(v.yaw); v.steer = 0;
        if (v.knockT <= 0) {
          // back on the road from wherever it came to rest: keep its spot along the edge, ease back into lane
          const e = edges[v.e], rx = v.x - e.ax, rz = v.z - e.az;
          v.pe = -1; v.s = clamp(rx * e.dx + rz * e.dz, 0, e.len); v.lat = clamp(rx * e.dz - rz * e.dx, -(e.w / 2 - v.hw * 0.5), e.w / 2 - v.hw * 0.5);
          v.inJ = -1; v.ind = 0; v.ox = v.oz = 0; v.rec = 3;
          poseAt(v, v.s, v.lat, P); v.x = P.x; v.z = P.z; v.fx = P.fx; v.fz = P.fz; v.yaw = Math.atan2(P.fx, P.fz);
        }
        hmove(v); draw(v);
        continue;
      }
      if (Math.abs(v.x - focus.x) > 270 || Math.abs(v.z - focus.z) > 270 || hyp(v.x - focus.x, v.z - focus.z) > 270) {
        if ((v.retry -= dt) > 0) { hideV(v); continue; }
        if (!spawn(v, focus.x, focus.z, 120, 230, true)) { hideV(v); continue; }
      }
      // distant traffic thinks every 2nd, 4th or 8th frame (with a longer step); close traffic every frame
      const dd = Math.max(Math.abs(v.x - focus.x), Math.abs(v.z - focus.z)), tier = dd > 200 ? 7 : dd > 150 ? 3 : dd > 100 ? 1 : 0;
      if ((frameN + v.id) & tier) continue;
      const dtv = dt * (tier + 1);
      let e0 = edges[v.e];
      // a route as soon as there's budget for the A* (a few per frame)
      if (v.needRoute && (v.retryRoute -= dtv) <= 0 && routeBudget > 0 && !inTurn(v)) { routeBudget--; plan(v); }
      if (v.route.length && v.ri === v.route.length - 1 && v.s > e0.len * 0.5 && !v.park) { arrive(v, focus); if (v.x > 1e5) { hideV(v); continue; } e0 = edges[v.e]; }
      let target = v.max * (MAJOR.has(e0.k) ? 1 : 0.75) * (focus.drag ? focus.drag(v.x, v.z) : 1);
      // just got hit by you: the driver stops, gets out of the mood, honks a lot
      if (v.dazed > 0) { v.dazed -= dtv; target = 0; v.honkCd -= dtv; if (v.honkCd <= 0) { v.honkCd = 0.5 + Math.random(); audio && audio.hornAt(v.type, v.x, v.z, 1.4); } }
      const nxt = nextOf(v), turning = inTurn(v), hd = Math.atan2(e0.dx, e0.dz);
      // ---- where across the road to be
      const nl = nLanes(e0), lw = (e0.oneway ? e0.w : e0.w / 2) / nl;
      let want = v.li;
      if (nl > 1) {
        const tn = nxt >= 0 && isJ(e0.b) && e0.len - v.s < 90 ? turnOf(e0, edges[nxt]) : 'S';
        want = tn === 'R' || tn === 'U' ? nl - 1 : tn === 'L' || v.park > 0 ? 0 : v.type === 'bus' || v.type === 'auto' ? 0 : Math.min(v.pref, nl - 1);
      }
      let latT = v.park > 0 ? kerbLat(e0, v) : laneLat(e0, v.li, v) + v.filter;
      // the tow truck asked us to squeeze over
      if (v.ox || v.oz) { v.squeeze = 1.5; v.ox = v.oz = 0; }
      if (v.squeeze > 0) { v.squeeze -= dtv; latT = kerbLat(e0, v); }
      // ---- look around once: leaders, oncoming traffic on narrow streets, obstacles to pass, the gap in the next lane
      const look = 8 + v.speed * 1.6 + v.long;
      near(hashOf(v), v.x, v.z, nb);
      let lead = null, leadA = Infinity, oncoming = false, passCap = Infinity, laneBlocked = false;
      const tl = want !== v.li ? laneLat(e0, v.li + (want > v.li ? 1 : -1), v) : 0, dLat = latT - v.lat;
      for (const o of nb) {
        if (o === v || o.off) continue;
        const dx = o.x - v.x, dz = o.z - v.z;
        if (Math.abs(dx) > look + 8 || Math.abs(dz) > look + 8) continue;
        const along = dx * v.fx + dz * v.fz, side = dx * v.fz - dz * v.fx, dot = o.fx * v.fx + o.fz * v.fz;
        if (dot < -0.5 && along > 0 && along < 40 && narrow(e0) && Math.abs(side) < e0.w) oncoming = true;
        if (along > 0 && along < look + o.long) {
          const w = v.r + o.r + 0.25;
          if (Math.abs(side) < w || Math.abs(side - dLat) < w) {
            // a parked, broken-down or dazed vehicle gets driven around if there's room
            if ((o.park > 0 && o.speed < 0.3) || o.dazed > 0 || o.knockT > 0) {
              const lo = (o.x - e0.ax) * e0.dz - (o.z - e0.az) * e0.dx;
              if (lo > v.lat - 0.5 && along < 30) passCap = Math.min(passCap, lo - (o.r + v.r + 0.35));
            }
            const a = along - o.long;
            // one that's only stopped because we're in its way isn't a leader to wait for
            if (a < leadA && o.blk !== v.id && !(o.ld === v.id && v.id < o.id)) { leadA = a; lead = o; }
          }
        }
        if (want !== v.li && dot > 0.6) {
          const lo = (o.x - e0.ax) * e0.dz - (o.z - e0.az) * e0.dx;
          const k = v.type === 'auto' || v.type === 'scooter' ? 0.6 : 1;
          if (Math.abs(lo - tl) < v.r + o.r + 0.2 && along > -(5 + o.speed * 1.2) * k - o.long && along < (5 + v.speed * 0.8) * k + o.long + v.long) laneBlocked = true;
        }
      }
      // pass on the right of whatever is stopped at the kerb, if the road leaves room
      const minLat = e0.oneway ? -kerbLat(e0, v) : oncoming ? 0.6 : -0.2;
      if (passCap < Infinity && passCap >= minLat && !turning) { latT = Math.min(latT, passCap); if (lead && (lead.park > 0 || lead.dazed > 0 || lead.knockT > 0)) lead = null; }
      if (oncoming) { latT = Math.max(latT, kerbLat(e0, v) - 0.05); target = Math.min(target, 4.5); }
      if (cowEdge[v.e]) for (const c of cows) {
        // cows don't move: steer round them (they lie at the kerb), or stop
        const dx = c.x - v.x, dz = c.z - v.z;
        if (Math.abs(dx) > 26 || Math.abs(dz) > 26) continue;
        const along = dx * v.fx + dz * v.fz;
        if (along < -2 || along > 25) continue;
        const lo = (c.x - e0.ax) * e0.dz - (c.z - e0.az) * e0.dx;
        if (Math.abs(lo - v.lat) < c.r + v.r + 0.3) latT = Math.min(latT, lo - (c.r + v.r + 0.35));
      }
      latT = clamp(latT, Math.min(minLat, -kerbLat(e0, v) * (e0.oneway ? 1 : 0)), kerbLat(e0, v));
      // following: keep a gap that grows with speed
      const leadG = lead ? gapV(v.x, v.z, v.fx, v.fz, v, lead) : Infinity;
      v.ld = lead ? lead.id : -1;
      if (lead) {
        const vo = Math.max(0, lead.speed * (lead.fx * v.fx + lead.fz * v.fz)), want0 = GAP0[v.type] + v.speed * 0.8;
        target = Math.min(target, Math.max(0, vo + (leadG - want0) * 0.9));
        // scooters filter between lanes when the queue stops
        if (v.type === 'scooter' && (nl > 1 || e0.w >= 9) && vo < 1.5 && leadG < 5) v.filter = v.li < nl - 1 || nl === 1 ? -Math.min(lw / 2, 1.4) : Math.min(lw / 2, 1.4);
      } else if (v.filter && v.speed > 6) v.filter = 0;
      // ---- lane changes: indicate, wait a beat, then move over once the gap is there
      if (want !== v.li && !turning && !v.park) {
        if (!v.ind) { v.ind = want > v.li ? -1 : 1; v.indT = 0.9; }
        else if ((v.indT -= dtv) <= 0 && !laneBlocked) v.li += want > v.li ? 1 : -1;
      } else if (v.ind && Math.abs(v.lat - latT) < 0.2) v.ind = 0;
      // ---- junctions: signals first, then the box rule (only movements that don't cross go together)
      if (isJ(e0.b) && v.inJ !== e0.b && nxt >= 0) {
        const dl = e0.len - v.s - v.long - v.r - stopD(e0.b);
        if (dl < 22) {
          if (v.jE !== v.e || v.jN !== nxt) movement(v, e0, nxt);
          v.eta = Math.max(0, dl) / Math.max(v.speed, 1.5);
          let go = true, sigStop = false;
          const sg = nodes[e0.b].signal, j = jx(e0.b);
          // still inside the last junction's box and already over this one's line (junctions a few metres apart): committed
          if (dl > -0.5 || v.inJ < 0) {
            if (sg) { const st = sg.state(hd, v.turn); if (st === 'stop' || (st === 'amber' && dl > v.speed * v.speed / 8 + 1)) { go = false; sigStop = true; } }
            if (go) for (const o of j.occ) if (o !== v && o.inJ === e0.b && !o.off && conflict(o, v)) { go = false; break; }
            if (go) for (const o of j.app) if (o !== v && !o.off && conflict(o, v) && beats(o, v)) { go = false; break; }
            // keep the box clear: don't go in if there's no room on the far side
            if (go && dl < 8) for (const o of nb) if (o !== v && o.e === nxt && o.s < turnR(e0, edges[nxt]) + v.long * 2 + o.long + 4 && o.speed < 1.5 && !o.off) { go = false; break; }
            // nor if another junction follows too close to wait in between, unless we can get through that one too
            if (go && dl < 8) {
              const ne = edges[nxt], sgB = nodes[ne.b].signal;
              if (sgB && isJ(ne.b) && ne.len - stopD(ne.b) < (v.long + v.r) * 2 + 3) {
                const nn = v.ri + 2 < v.route.length ? v.route[v.ri + 2] : -1;
                if (sgB.state(Math.atan2(ne.dx, ne.dz), nn >= 0 ? turnOf(ne, edges[nn]) : 'S') !== 'go') { go = false; sigStop = true; }
              }
            }
            // waited a long time and the box is empty: go
            if (!go && !sigStop && v.wait > 8 && boxEmpty(j, e0.b)) go = true;
          }
          if (!go) {
            target = Math.min(target, stopProfile(dl));
            if (v.speed < 0.5) v.wait += dtv;
            if (sigStop) v.red = true;
          } else {
            if (v.red) { v.red = false; v.greenT = now; }
            if (dl < 1.2) { v.inJ = e0.b; v.wait = 0; let k = 0; for (const o of j.occ) if (o.inJ === e0.b && !o.off) j.occ[k++] = o; j.occ.length = k; j.occ.push(v); }
          }
        }
      }
      if (v.inJ >= 0 && (v.e !== v.jE && v.e !== v.jN || (v.e === v.jN && v.s > v.pr + v.long + 1))) v.inJ = -1;
      // honk at the one who hasn't noticed the light went green
      if (v.greenT && now - v.greenT > 0.8) { if (v.speed < 0.6 && lead && leadG < 6 && Math.random() < 0.6) { audio && audio.hornAt(v.type, v.x, v.z, 0.8); ev && ev.honked && ev.honked(v); } v.greenT = 0; }
      // ---- people on the road ahead (or about to step into our path): slow, then stop
      if (!v.up && ph.used.length) for (const p of near(ph, v.x, v.z, pn)) {
        const dx = p.x - v.x, dz = p.z - v.z, along = dx * v.fx + dz * v.fz;
        if (along < -1 || along > look + 6) continue;
        const side = dx * v.fz - dz * v.fx, ps = side + ((p.vx || 0) * v.fz - (p.vz || 0) * v.fx) * 1.5, w = v.hw + 1.1;
        if (Math.abs(side - dLat) < w || Math.abs(ps) < w || side * ps < 0) { const room = along - v.long - v.r; target = Math.min(target, room < 3 ? 0 : (room - 3) * 0.9); }
      } else pn.length = 0;
      // you, a walker, the tow truck
      let blocked = false;
      for (const b of blockers) {
        if (Math.abs((b.y || 0) - v.y) > 2.5) continue; // you up on the flyover, them underneath (or the other way round)
        const dx = b.x - v.x, dz = b.z - v.z, along = dx * v.fx + dz * v.fz, lat = Math.abs(dx * -v.fz + dz * v.fx);
        if (along > 0 && along < look + 2 && lat < 2.4) { target = along - v.long < 5 ? 0 : Math.min(target, 3); blocked = true; if (v.speed < 0.5) b.hits = (b.hits || 0) + 1; }
      }
      if (v.park > 0) { v.park -= dtv; target = Math.abs(v.lat - latT) < 0.3 ? 0 : Math.min(target, 3); if (v.park <= 0) { v.park = 0; v.needRoute = true; } }
      v.speed = damp(v.speed, target, target < v.speed ? 6 : 1.4, dtv);
      if (blocked && v.speed < 1) {
        v.honkCd -= dtv;
        if (v.honkCd <= 0) { v.honkCd = 1.5 + Math.random() * 3; audio && audio.hornAt(v.type, v.x, v.z); ev && ev.honked(v); }
      }
      // ---- move: the full step, else forward only, else sideways only, else stay put
      const ds = v.speed * dtv, rate = (v.type === 'scooter' ? 2 : 1.2) * dtv;
      const nlat = turning ? v.lat : v.lat + clamp(latT - v.lat, -rate, rate);
      const x0 = v.x, z0 = v.z;
      blockerId = -1;
      if (tryMove(v, v.s + ds, nlat)) { v.blk = -1; v.backT = 0; } else {
        // remember who is in the way: they won't wait on us as a 'leader' (that's how two drivers stare each other down)
        v.blk = blockerId;
        // straight on without the sideways part, else just the sideways part (and no forward speed)
        if (!(nlat !== v.lat && tryMove(v, v.s + ds, v.lat))) { v.speed = 0; if (nlat !== v.lat) tryMove(v, v.s, nlat); }
        // two vehicles each in the other's way: one edges sideways away from the other (side by side), else backs off a little
        const o = v.blk >= 0 ? vehicles[v.blk] : null;
        if (o && o.blk === v.id) {
          v.backT += dtv;
          if (v.backT > (v.id > o.id ? 1 : 3)) {
            const lo = (o.x - e0.ax) * e0.dz - (o.z - e0.az) * e0.dx, k = kerbLat(e0, v);
            if (!tryMove(v, v.s, clamp(v.lat + (v.lat >= lo ? 0.8 : -0.8) * dtv, -k, k)) && v.s > 0.6) tryMove(v, v.s - 0.8 * dtv, v.lat);
            v.filter = 0;
          }
        }
      }
      const moved = hyp(v.x - x0, v.z - z0);
      v.steer = damp(v.steer, moved > 0.02 ? clamp(((v.x - x0) * v.fz - (v.z - z0) * v.fx) / moved, -0.3, 0.3) : 0, 6, dtv);
      let guard = 0, lost = false;
      while (v.s > edges[v.e].len && guard++ < 5) if (!advance(v)) { lost = true; break; }
      // dead end or heading off the map: vanish behind the barricade and reappear elsewhere
      if (lost || nearEdge(v.x, v.z)) { stats.despawned++; if (!spawn(v, focus.x, focus.z, 120, 230, true)) { hideV(v); continue; } }
      v.stuckT = v.speed < 0.3 && !v.park && !(v.red) ? v.stuckT + dtv : 0;
      // jammed for ages far from you: quietly send it elsewhere
      if (v.stuckT > 12 && hyp(v.x - focus.x, v.z - focus.z) > 70) { stats.despawned++; if (!spawn(v, focus.x, focus.z, 120, 230, true)) { hideV(v); continue; } }
      hmove(v);
      draw(v);
    }
    separate();
    // a pass to redraw anything the correction moved (cheap: matrices only)
    for (const v of vehicles) if (v.redraw) { v.redraw = false; if (!v.off) draw(v); }
    beams.instanceMatrix.needsUpdate = blink.instanceMatrix.needsUpdate = true;
    present(focus);
    honkTimer -= dt;
    if (honkTimer <= 0 && audio) {
      honkTimer = 0.6 + Math.random() * 2.4;
      const v = vehicles[Math.floor(Math.random() * vehicles.length)];
      if (hyp(v.x - focus.x, v.z - focus.z) < 120) audio.hornAt(v.type, v.x, v.z, 0.5);
    }
  }

  function collidePlayer(p, r, y = 0) {
    let hit = null;
    for (const v of vehicles) {
      if (Math.abs(v.x - p.x) > 10 || Math.abs(v.z - p.z) > 10 || Math.abs((v.y || 0) - y) > 2.5) continue;
      const n = v.long ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const off = v.long ? (k - 1) * v.long : 0;
        const cx = v.x + Math.sin(v.yaw) * off, cz = v.z + Math.cos(v.yaw) * off;
        const dx = p.x - cx, dz = p.z - cz, d = hyp(dx, dz), rr = r + v.r;
        if (d < rr && d > 1e-5) {
          const depth = rr - d; p.x += dx / d * depth; p.z += dz / d * depth;
          if (!hit || depth > hit.depth) hit = { nx: dx / d, nz: dz / d, depth, tag: 'vehicle', v };
        }
      }
    }
    return hit;
  }
  function setNight(lights) { lightMat.color.setScalar(0.7 + lights * 3); beamMat.opacity = lights * 0.32; beams.visible = lights > 0.05; }
  // adopt(): the vehicles already have places (the page's state, handed to the worker): skip the first-frame spawn
  return { update, collidePlayer, setNight, setPeds, overlaps, stats, vehicles, adopt() { started = true; } };
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
    if (!['residential', 'unclassified', 'tertiary'].includes(r.k) || r.l) continue; // nobody parks on a flyover
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 25 || rng() > 0.35) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len, side = rng() < 0.5 ? 1 : -1;
      for (let s2 = 10; s2 < len - 10; s2 += 6 + rng() * 14) {
        if (rng() < 0.4) continue;
        const lat = r.hw + 0.5, x = ax + dx * s2 + dz * lat * side, z = az + dz * s2 - dx * lat * side;
        if (!world.inMap(x, z, 100) || world.insideBuilding(x, z, 1.2)) continue;
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
