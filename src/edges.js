import * as THREE from 'three';
import { box, merge, part, makeRng } from './util.js';
import { textTexture } from './textures.js';
import { createCharacter } from './people.js';

// The map doesn't just stop: roads end at metro-work barricades, open ground at construction hoardings,
// and a hazy skyline ring makes the city look like it keeps going.
export function createEdges(scene, world) {
  const workers = [];
  const rng = makeRng(77);
  const B = world.bounds, IN = 10;
  const R = { x1: B.x1 + IN, x2: B.x2 - IN, z1: B.z1 + IN, z2: B.z2 - IN };
  const inside = (p) => p[0] > R.x1 && p[0] < R.x2 && p[1] > R.z1 && p[1] < R.z2;
  const vY = new THREE.Vector3(0, 1, 0);

  // ---------- barricades where roads leave the map ----------
  const signTex = textTexture(['ROAD CLOSED', 'Namma Metro Phase 3 work · since 2017', 'Inconvenience regretted 🙏'], { w: 512, h: 256, bg: '#f2c230', fg: '#111', font: '700 34px "Space Grotesk"' });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.08 });
  const parts = [], signs = [], crossings = [];
  const clip = (a, b) => {
    // point where segment a→b leaves rectangle R
    let t = 1;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    if (b[0] < R.x1) t = Math.min(t, (R.x1 - a[0]) / dx); if (b[0] > R.x2) t = Math.min(t, (R.x2 - a[0]) / dx);
    if (b[1] < R.z1) t = Math.min(t, (R.z1 - a[1]) / dz); if (b[1] > R.z2) t = Math.min(t, (R.z2 - a[1]) / dz);
    return [a[0] + dx * t, a[1] + dz * t];
  };
  for (const r of world.roads) {
    if (!r.drive && r.k !== 'service') continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      let a = r.pts[i], b = r.pts[i + 1];
      if (inside(a) === inside(b)) continue;
      if (!inside(a)) [a, b] = [b, a];
      const p = clip(a, b), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      const x = p[0] - dx * 4, z = p[1] - dz * 4;
      if (crossings.some((c) => Math.hypot(c.x - x, c.z - z) < r.w + 4)) continue;
      const W = r.w + 5, yaw = Math.atan2(dx, dz);
      crossings.push({ x, z, dx, dz, w: W });
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(vY, yaw), new THREE.Vector3(1, 1, 1));
      const P = [];
      for (let k = -W / 2; k <= W / 2; k += 1.25) {
        P.push(part(new THREE.CylinderGeometry(0.3, 0.33, 0.95, 10).translate(k, 0.48, 0), '#f06b1d'),
          part(new THREE.CylinderGeometry(0.315, 0.315, 0.12, 10).translate(k, 0.62, 0), '#ffffff'), part(new THREE.CylinderGeometry(0.325, 0.325, 0.12, 10).translate(k, 0.32, 0), '#ffffff'));
      }
      P.push(box(W, 0.12, 0.08, 0, 1.15, 0.4, '#e53935'), box(0.1, 1.2, 0.1, -W / 2, 0.6, 0.4, '#9e9e9e'), box(0.1, 1.2, 0.1, W / 2, 0.6, 0.4, '#9e9e9e'));
      // site container + sand pile behind
      P.push(box(5, 2.6, 2.4, W / 2 + 3, 1.3, 4, '#1565c0'), box(5.1, 0.1, 2.5, W / 2 + 3, 2.65, 4, '#e0e0e0'));
      P.push(part(new THREE.ConeGeometry(2.2, 1.4, 10).translate(-W / 2 - 1, 0.7, 5), '#c9a86a'));
      const g = merge(P); g.applyMatrix4(m); parts.push(g);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), signMat); s.position.set(0, 2.2, -0.2); s.rotation.y = Math.PI; s.applyMatrix4(m); signs.push(s);
      const post = box(0.12, 2.2, 0.12, 0, 1.1, -0.15, '#555'); post.applyMatrix4(m); parts.push(post);
      // a worker on a plastic chair, naturally
      if (rng() < 0.5) {
        const ch = createCharacter(scene, { shirt: '#ff6d00', pants: '#37474f', skin: '#7a4b2f' });
        const wp = new THREE.Vector3(W / 2 + 0.5, -0.42, 2).applyMatrix4(m); ch.root.position.copy(wp); ch.root.rotation.y = yaw + Math.PI; ch.animate(0, 0, true); workers.push(ch.root);
      }
      // solid line across the road
      const c = [[-W / 2, -0.7], [W / 2, -0.7], [W / 2, 0.7], [-W / 2, 0.7]].map(([u, v]) => { const q = new THREE.Vector3(u, 0, v).applyMatrix4(m); return [q.x, q.z]; });
      world.addPoly(c, 2, 'barricade');
    }
  }

  // ---------- construction hoardings around the rest of the edge ----------
  const hoard = textTexture(['BUILDING A BETTER BENGALURU', 'since 2006 · please bear with us'], { w: 1024, h: 256, bg: '#2e7d32', fg: '#ffffff', font: '700 64px "Space Grotesk"' });
  hoard.wrapS = THREE.RepeatWrapping;
  const hp = [];
  const edgeSeg = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 6);
    for (let i = 0; i < n; i++) {
      const x0 = ax + (bx - ax) * i / n, z0 = az + (bz - az) * i / n, x1 = ax + (bx - ax) * (i + 1) / n, z1 = az + (bz - az) * (i + 1) / n;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const nr = world.nearestRoad(mx, mz, 14, (r) => r.drive || r.k === 'service');
      if (nr && nr.d < nr.r.hw + 3) continue;
      if (crossings.some((c) => Math.hypot(c.x - mx, c.z - mz) < c.w)) continue;
      const sl = Math.hypot(x1 - x0, z1 - z0);
      const g = new THREE.BoxGeometry(sl, 3, 0.15);
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * sl / 12 + i * 0.5);
      g.rotateY(Math.atan2(z1 - z0, x1 - x0) * -1); g.translate(mx, 1.5, mz);
      hp.push(part(g, '#ffffff'));
    }
  };
  edgeSeg(R.x1, R.z1, R.x2, R.z1); edgeSeg(R.x2, R.z1, R.x2, R.z2); edgeSeg(R.x2, R.z2, R.x1, R.z2); edgeSeg(R.x1, R.z2, R.x1, R.z1);
  if (hp.length) { const hm = new THREE.Mesh(merge(hp), new THREE.MeshStandardMaterial({ map: hoard, roughness: 0.8 })); hm.receiveShadow = true; scene.add(hm); }
  if (parts.length) { const bm = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })); bm.castShadow = true; scene.add(bm); }
  for (const s of signs) scene.add(s);
  // invisible walls along the edge (barricades block roads, hoardings block the rest)
  const T = 1.5;
  world.addPoly([[R.x1 - 50, R.z1 - T], [R.x2 + 50, R.z1 - T], [R.x2 + 50, R.z1 - 60], [R.x1 - 50, R.z1 - 60]].reverse(), 9, 'edge');
  world.addPoly([[R.x1 - 50, R.z2 + T], [R.x1 - 50, R.z2 + 60], [R.x2 + 50, R.z2 + 60], [R.x2 + 50, R.z2 + T]].reverse(), 9, 'edge');
  world.addPoly([[R.x1 - T, R.z1 - 50], [R.x1 - 60, R.z1 - 50], [R.x1 - 60, R.z2 + 50], [R.x1 - T, R.z2 + 50]].reverse(), 9, 'edge');
  world.addPoly([[R.x2 + T, R.z1 - 50], [R.x2 + T, R.z2 + 50], [R.x2 + 60, R.z2 + 50], [R.x2 + 60, R.z1 - 50]].reverse(), 9, 'edge');

  // ---------- distant skyline ring: always on the horizon, never reachable ----------
  const sk = [];
  for (let i = 0; i < 220; i++) {
    const a = i / 220 * Math.PI * 2 + rng() * 0.02, d = 950 + rng() * 120;
    const w = 14 + rng() * 34, h = 18 + Math.pow(rng(), 2) * 120;
    const g = new THREE.BoxGeometry(w, h, w * (0.6 + rng() * 0.6)); g.rotateY(-a); g.translate(Math.cos(a) * d, h / 2 - 4, Math.sin(a) * d);
    sk.push(part(g, '#ffffff'));
    if (rng() < 0.08) { // tower crane
      const cg = merge([box(1.5, h + 30, 1.5, 0, (h + 30) / 2, 0, '#fff'), box(45, 1.5, 1.5, 12, h + 30, 0, '#fff')]); cg.rotateY(-a + rng()); cg.translate(Math.cos(a) * (d - 10), 0, Math.sin(a) * (d - 10)); sk.push(cg);
    }
  }
  const skyMat = new THREE.MeshBasicMaterial({ color: '#8090a0', fog: false });
  const skyline = new THREE.Mesh(merge(sk), skyMat); skyline.frustumCulled = false; skyline.renderOrder = -5; scene.add(skyline);
  const tmp = new THREE.Color();

  let warned = 0;
  function update(dt, cam, horizon, night) {
    // the seated workers are 8 meshes each: only draw the ones near you
    for (const w of workers) w.visible = Math.abs(w.position.x - cam.x) < 220 && Math.abs(w.position.z - cam.z) < 220;
    skyline.position.set(cam.x, 0, cam.z);
    // a touch darker than the horizon, so it reads as far-away buildings in the haze
    skyMat.color.copy(tmp.copy(horizon).multiplyScalar(night > 0.5 ? 0.6 : 0.82));
    warned = Math.max(0, warned - dt);
  }
  function near(p) {
    const d = Math.min(p.x - R.x1, R.x2 - p.x, p.z - R.z1, R.z2 - p.z);
    if (d < 7 && warned <= 0) { warned = 25; return true; }
    return false;
  }
  return { update, near };
}
