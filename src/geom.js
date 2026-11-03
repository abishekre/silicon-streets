import * as THREE from 'three';

// Raw vertex batch: lets thousands of pieces end up in one draw call per chunk/material.
export class Batch {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; }
  v(x, y, z, nx, ny, nz, u, w, r, g, b) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, w); this.col.push(r, g, b);
  }
  // up-facing triangle on the ground plane, world-space uvs
  triUp(a, b, c, y, s, col = WHITE) {
    if ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) < 0) { const t = b; b = c; c = t; }
    for (const p of [a, b, c]) this.v(p[0], y, p[1], 0, 1, 0, p[0] / s, -p[1] / s, col.r, col.g, col.b);
  }
  quadUp(a, b, c, d, y, s, col) { this.triUp(a, b, c, y, s, col); this.triUp(a, c, d, y, s, col); }
  addGeo(g) {
    const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv.array, c = g.attributes.color.array;
    for (let i = 0; i < p.length; i++) { this.pos.push(p[i]); this.nor.push(n[i]); this.col.push(c[i]); }
    for (let i = 0; i < u.length; i++) this.uv.push(u[i]);
    g.dispose();
  }
  // copy a prebuilt template geometry in at an offset (optionally recoloured) without creating a new geometry
  stamp(g, dx, dy, dz, color = null) {
    const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv.array, c = g.attributes.color.array;
    for (let i = 0; i < p.length; i += 3) { this.pos.push(p[i] + dx, p[i + 1] + dy, p[i + 2] + dz); this.nor.push(n[i], n[i + 1], n[i + 2]); }
    for (let i = 0; i < u.length; i++) this.uv.push(u[i]);
    if (color) for (let i = 0; i < c.length; i += 3) this.col.push(color.r, color.g, color.b);
    else for (let i = 0; i < c.length; i++) this.col.push(c[i]);
  }
  get empty() { return this.pos.length === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}
export const WHITE = new THREE.Color(1, 1, 1);

export function toPts(flat) { const p = []; for (let i = 0; i < flat.length; i += 2) p.push([flat[i], flat[i + 1]]); return p; }
export function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; }
export function centroid(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
export function bbox(p) {
  let x1 = Infinity, x2 = -Infinity, z1 = Infinity, z2 = -Infinity;
  for (const [x, z] of p) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (z < z1) z1 = z; if (z > z2) z2 = z; }
  return { x1, x2, z1, z2 };
}
export function pip(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi) c = !c;
  }
  return c;
}
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cz = az + dz * t;
  return { d: Math.hypot(px - cx, pz - cz), t, cx, cz };
}
export function triangulate(pts) {
  const v = pts.map(([x, z]) => new THREE.Vector2(x, z));
  try { return THREE.ShapeUtils.triangulateShape(v, []); } catch (e) { return []; }
}

// Spatial hash for anything with a bbox
export class Grid {
  constructor(cell = 24) { this.cell = cell; this.map = new Map(); this.stamp = 0; }
  // exact and small (a V8 small integer), so the Map hashes fast and cells never collide; good for ±8192 cells each way
  key(i, j) { return (i + 8192) * 16384 + (j + 8192); }
  add(it, x1, x2, z1, z2) {
    it._s = 0; const c = this.cell;
    for (let i = Math.floor(x1 / c); i <= Math.floor(x2 / c); i++)
      for (let j = Math.floor(z1 / c); j <= Math.floor(z2 / c); j++) {
        const k = this.key(i, j); let l = this.map.get(k); if (!l) this.map.set(k, l = []); l.push(it);
      }
  }
  query(x, z, r, out = []) {
    out.length = 0; const s = ++this.stamp, c = this.cell;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const l = this.map.get(this.key(i, j)); if (!l) continue;
        for (const it of l) if (it._s !== s) { it._s = s; out.push(it); }
      }
    return out;
  }
}

// Shape (in z/y side-profile) extruded across the vehicle width
export function sideExtrude(pts, width, bevel = 0.03) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]); else s.lineTo(p[0], p[1]);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  g.rotateY(-Math.PI / 2); g.translate(width / 2 - bevel, 0, 0);
  return g;
}
// Shape in x/y cross-section extruded along the vehicle length (z)
export function crossExtrude(pts, length, bevel = 0) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]); else s.lineTo(p[0], p[1]);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  return g;
}
