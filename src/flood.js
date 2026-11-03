import * as THREE from 'three';
import { makeRng } from './util.js';

// Heavy rain floods low spots (big junctions, roads beside parks). Water rises with rain and drains slowly.
export function createFlood(scene, world) {
  const rng = makeRng(404);
  const zones = [];
  const B = world.bounds;
  const ok = (x, z) => x > B.x1 + 60 && x < B.x2 - 60 && z > B.z1 + 60 && z < B.z2 - 60;
  // big junctions turn into lakes first (like the real underpasses)
  const juncs = [...world.nodes.values()].filter((n) => n.deg >= 3 && n.maxW >= 8 && ok(n.x, n.z));
  for (let i = 0; i < 14 && juncs.length; i++) {
    const n = juncs.splice(Math.floor(rng() * juncs.length), 1)[0];
    if (zones.some((z) => Math.hypot(z.x - n.x, z.z - n.z) < 120)) continue;
    zones.push({ x: n.x, z: n.z, r: 10 + rng() * 10, max: 0.22 + rng() * 0.25, level: 0 });
  }
  // and some stretches of road beside parks
  const parkRoads = world.roads.filter((r) => r.drive && r.pts.length > 1);
  for (let i = 0; i < 200 && zones.length < 22; i++) {
    const r = parkRoads[Math.floor(rng() * parkRoads.length)], p = r.pts[Math.floor(rng() * r.pts.length)];
    if (!ok(p[0], p[1]) || world.surfaceAt(p[0] + r.hw + 6, p[1]) !== 'grass') continue;
    if (zones.some((z) => Math.hypot(z.x - p[0], z.z - p[1]) < 120)) continue;
    zones.push({ x: p[0], z: p[1], r: 8 + rng() * 8, max: 0.15 + rng() * 0.2, level: 0 });
  }

  // muddy water with moving ripples
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const img = x.createImageData(128, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
    const v = Math.sin(i * 0.3 + Math.sin(j * 0.21) * 2) * 0.5 + Math.sin(j * 0.27 + Math.cos(i * 0.17) * 2) * 0.5;
    const k = (j * 128 + i) * 4; img.data[k] = 128 + v * 40; img.data[k + 1] = 128 + Math.cos(v * 3) * 40; img.data[k + 2] = 255; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const normal = new THREE.CanvasTexture(c); normal.wrapS = normal.wrapT = THREE.RepeatWrapping; normal.repeat.set(4, 4);
  const mat = new THREE.MeshStandardMaterial({ color: '#5e5a44', roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.88, normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false });
  for (const z of zones) {
    const g = new THREE.CircleGeometry(1, 30); const pos = g.attributes.position;
    for (let i = 1; i < pos.count; i++) { const s = 0.75 + rng() * 0.4; pos.setXY(i, pos.getX(i) * s * 1.3, pos.getY(i) * s); }
    g.rotateX(-Math.PI / 2); g.rotateY(rng() * Math.PI);
    z.mesh = new THREE.Mesh(g, mat); z.mesh.position.set(z.x, 0.06, z.z); z.mesh.visible = false; z.mesh.renderOrder = 2; scene.add(z.mesh);
  }

  // spray from wheels
  const N = 60;
  const spray = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 4, 3), new THREE.MeshBasicMaterial({ color: '#d6e2e8', transparent: true, opacity: 0.8 }), N);
  spray.frustumCulled = false; scene.add(spray);
  const drops = Array.from({ length: N }, () => ({ x: 0, y: -9, z: 0, vx: 0, vy: 0, vz: 0 }));
  let di = 0;
  const m4 = new THREE.Matrix4();

  function depthAt(px, pz) {
    let d = 0;
    for (const z of zones) {
      if (z.level < 0.01) continue;
      const rr = z.r * (0.35 + 0.65 * z.level / z.max);
      const k = Math.hypot(px - z.x, pz - z.z) / rr;
      if (k < 1) d = Math.max(d, z.level * (1 - k * k));
    }
    return d;
  }
  let t = 0, announced = false;
  function update(dt, rain, splashAt) {
    t += dt;
    // water builds up when it pours and drains away slowly afterwards
    for (const z of zones) {
      z.level = Math.min(z.max, Math.max(0, z.level + (rain > 0.45 ? (rain - 0.35) * 0.02 : -0.004) * dt));
      z.mesh.visible = z.level > 0.01;
      if (z.mesh.visible) { const s = z.r * (0.35 + 0.65 * z.level / z.max); z.mesh.scale.set(s, 1, s); z.mesh.position.y = 0.06 + z.level * 0.6; }
    }
    normal.offset.set(t * 0.02, t * 0.013);
    if (splashAt) for (let k = 0; k < 3; k++) {
      const d = drops[di++ % N]; const a = Math.random() * 6.28;
      Object.assign(d, { x: splashAt.x + Math.cos(a) * 0.8, y: 0.2, z: splashAt.z + Math.sin(a) * 0.8, vx: Math.cos(a) * 2 + splashAt.vx * 0.3, vy: 2.5 + Math.random() * 2, vz: Math.sin(a) * 2 + splashAt.vz * 0.3 });
    }
    drops.forEach((d, i) => {
      if (d.y > -5) { d.vy -= 9.8 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; if (d.y < 0) d.y = -9; }
      m4.makeTranslation(d.x, d.y, d.z); spray.setMatrixAt(i, m4);
    });
    spray.instanceMatrix.needsUpdate = true;
  }
  function firstFlood() { if (announced) return false; announced = true; return true; }
  return { update, depthAt, zones, firstFlood };
}
