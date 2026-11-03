import * as THREE from 'three';
import { makeRng, part, box, merge, clamp } from './util.js';
import { Batch, WHITE, toPts, polyArea, centroid, bbox, pip, segDist, triangulate, Grid } from './geom.js';
import * as T from './textures.js';

// Built from OpenStreetMap data (© OpenStreetMap contributors, ODbL) via tools/osm2game.py
export const BOUNDS = { x1: -1400, x2: 1400, z1: -960, z2: 960 };
const CH = 220;
const DRIVE = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'trunk', 'residential', 'unclassified', 'living_street']);
const MAJOR = new Set(['primary', 'secondary', 'tertiary', 'trunk']);
const WALK = new Set(['footway', 'path', 'cycleway', 'pedestrian', 'steps']);

export const KN = {
  'Mahatma Gandhi Road': 'ಮಹಾತ್ಮ ಗಾಂಧಿ ರಸ್ತೆ', 'Brigade Road': 'ಬ್ರಿಗೇಡ್ ರಸ್ತೆ', 'Church Street': 'ಚರ್ಚ್ ಸ್ಟ್ರೀಟ್',
  "Saint Mark's Road": 'ಸೇಂಟ್ ಮಾರ್ಕ್ಸ್ ರಸ್ತೆ', 'Residency Road': 'ರೆಸಿಡೆನ್ಸಿ ರಸ್ತೆ', 'Kasturba Road': 'ಕಸ್ತೂರಬಾ ರಸ್ತೆ',
  'Cubbon Road': 'ಕಬ್ಬನ್ ರಸ್ತೆ', 'Dickenson Road': 'ಡಿಕೆನ್ಸನ್ ರಸ್ತೆ', 'Museum Road': 'ಮ್ಯೂಸಿಯಂ ರಸ್ತೆ',
  'Vittal Mallya Road': 'ವಿಠ್ಠಲ್ ಮಲ್ಯ ರಸ್ತೆ', 'Lavelle Road': 'ಲ್ಯಾವೆಲ್ಲೆ ರಸ್ತೆ', 'Richmond Road': 'ರಿಚ್ಮಂಡ್ ರಸ್ತೆ',
  "Queen's Road": 'ಕ್ವೀನ್ಸ್ ರಸ್ತೆ', 'Infantry Road': 'ಇನ್ಫೆಂಟ್ರಿ ರಸ್ತೆ', 'Raj Bhavan Road': 'ರಾಜಭವನ ರಸ್ತೆ',
  'Doctor B R Ambedkar Veedhi': 'ಡಾ. ಬಿ.ಆರ್. ಅಂಬೇಡ್ಕರ್ ವೀಧಿ', 'Field Marshal Cariappa Road': 'ಫೀಲ್ಡ್ ಮಾರ್ಷಲ್ ಕಾರ್ಯಪ್ಪ ರಸ್ತೆ',
  'Kamaraj Road': 'ಕಾಮರಾಜ್ ರಸ್ತೆ', 'Hudson Circle': 'ಹಡ್ಸನ್ ವೃತ್ತ', 'Commissariat Road': 'ಕಮಿಸರಿಯೆಟ್ ರಸ್ತೆ',
  'Magrath Road': 'ಮ್ಯಾಗ್ರಾತ್ ರಸ್ತೆ', 'Victoria Road': 'ವಿಕ್ಟೋರಿಯಾ ರಸ್ತೆ', 'Cubbon Park': 'ಕಬ್ಬನ್ ಉದ್ಯಾನವನ',
  'Rajaram Mohan Roy Road': 'ರಾಜಾರಾಮ್ ಮೋಹನ್ ರಾಯ್ ರಸ್ತೆ', 'Musical Fountain Road': 'ಮ್ಯೂಸಿಕಲ್ ಫೌಂಟೇನ್ ರಸ್ತೆ',
  'Lady Curzon Road': 'ಲೇಡಿ ಕರ್ಜನ್ ರಸ್ತೆ', 'Convent Road': 'ಕಾನ್ವೆಂಟ್ ರಸ್ತೆ', 'Museum Cross Road': 'ಮ್ಯೂಸಿಯಂ ಕ್ರಾಸ್ ರಸ್ತೆ',
};
export const ZONES = {
  stadium: { name: 'M. Chinnaswamy Stadium', kn: 'ಚಿನ್ನಸ್ವಾಮಿ ಕ್ರೀಡಾಂಗಣ' },
  vidhana: { name: 'Vidhana Soudha', kn: 'ವಿಧಾನ ಸೌಧ' },
  ubc: { name: 'UB City', kn: 'ಯುಬಿ ಸಿಟಿ' },
  cubbon: { name: 'Cubbon Park', kn: 'ಕಬ್ಬನ್ ಉದ್ಯಾನವನ' },
  central: { name: 'Central Bengaluru', kn: 'ಬೆಂಗಳೂರು' },
};

const ENTER_SIGNS = { 0: 'darshini', 1: 'darshini', 2: 'cafe', 3: 'bakery', 6: 'darshini', 7: 'darshini', 8: 'pub', 10: 'darshini', 12: 'cafe' };
function themeFor(p) {
  const n = p.n.toLowerCase();
  if (p.a === 'pub' || p.a === 'bar') return 'pub';
  if (/bakery|bake|iyengar/.test(n)) return 'bakery';
  if (/darshini|tiffin|bhavan|sagar|udupi|upahar|idli|dosa|mtr|kamat|vidyarthi/.test(n)) return 'darshini';
  if (p.a === 'restaurant') return 'restaurant';
  return 'cafe';
}
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s+])\S/g, (m) => m.toUpperCase());

export function buildWorld(scene, data) {
  const rng = makeRng(11);
  const cull = [];
  const chunks = new Map();
  // The map is cut into CH-sized chunks (the same tiles tools/tile_map.py writes). Placement, collisions and
  // everything the game logic asks about are worked out up front; the meshes are not. Each chunk keeps a list
  // of build steps (later) that only run when the camera comes near it, and its meshes are thrown away when it leaves.
  const chunkOf = (x, z) => {
    const i = Math.floor(x / CH), j = Math.floor(z / CH), k = i + ',' + j;
    let c = chunks.get(k);
    if (!c) chunks.set(k, c = { i, j, x: (i + 0.5) * CH, z: (j + 0.5) * CH, b: null, ops: [], trees: [], lamps: [], cables: [], bulbs: [], live: null });
    return c;
  };
  // inside a build step: bc = the chunk being built, cr = its own random stream (same result whatever order chunks load in)
  let bc = null, cr = rng;
  const B = (key) => bc.b[key] || (bc.b[key] = new Batch());
  const later = (x, z, fn) => { chunkOf(x, z).ops.push(fn); };
  // one-off pieces (landmarks, carts, kiosks) are made once and copied into the chunk each time it loads
  const keep = (key, x, z, g) => later(x, z, () => B(key).stamp(g, 0, 0, 0));
  const inB = (x, z, m = 0) => x > BOUNDS.x1 - m && x < BOUNDS.x2 + m && z > BOUNDS.z1 - m && z < BOUNDS.z2 + m;

  // ---------- materials ----------
  const fa = T.facade(), fb = T.facadeB(), cur = T.curtain(), glowTex = T.glow();
  const M = {
    ground: new THREE.MeshStandardMaterial({ map: T.dirt(), roughness: 1 }),
    side: new THREE.MeshStandardMaterial({ map: T.pavers(), roughness: 0.95 }),
    road: new THREE.MeshStandardMaterial({ map: T.asphalt(), roughness: 0.92 }),
    path: new THREE.MeshStandardMaterial({ map: T.gravel(), roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ map: T.grass(), roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ map: T.water(), roughness: 0.08, metalness: 0.3 }),
    plaza: new THREE.MeshStandardMaterial({ map: T.cobble(), roughness: 0.9 }),
    marking: new THREE.MeshStandardMaterial({ color: '#e9e6da', roughness: 0.7 }),
    kerb: new THREE.MeshStandardMaterial({ map: T.kerb(), roughness: 0.8 }),
    bldA: new THREE.MeshStandardMaterial({ map: fa.map, emissiveMap: fa.emissive, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true, roughness: 0.88 }),
    bldB: new THREE.MeshStandardMaterial({ map: fb.map, emissiveMap: fb.emissive, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true, roughness: 0.6, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ map: cur.map, emissiveMap: cur.emissive, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true, metalness: 0.55, roughness: 0.12 }),
    landmark: new THREE.MeshStandardMaterial({ map: fa.map, vertexColors: true, roughness: 0.8, emissive: '#ffb36b', emissiveIntensity: 0 }),
    concrete: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    shop: new THREE.MeshStandardMaterial({ color: '#2b3138', emissive: '#ffd59a', emissiveIntensity: 0.05, roughness: 0.25, metalness: 0.2 }),
    sign: new THREE.MeshStandardMaterial({ map: T.signAtlas(), emissive: '#ffffff', emissiveIntensity: 0.1, roughness: 0.6 }),
    poiSign: null,
    billboard: new THREE.MeshStandardMaterial({ map: T.billboardAtlas(), emissive: '#ffffff', emissiveIntensity: 0.1, roughness: 0.6 }),
    lampHead: new THREE.MeshBasicMaterial({ color: '#666' }),
    pool: new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffdcb0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    cable: new THREE.LineBasicMaterial({ color: '#141414' }),
    puddle: new THREE.MeshStandardMaterial({ color: '#1c2228', roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0, depthWrite: false }),
    pothole: new THREE.MeshStandardMaterial({ color: '#232221', roughness: 1 }),
    trunk: new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 1 }),
    canopy: new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
    pole: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }),
    bulb: new THREE.MeshBasicMaterial({ color: '#ffcf7a' }),
    flood: new THREE.MeshBasicMaterial({ color: '#888' }),
    redLight: new THREE.MeshBasicMaterial({ color: '#ff2020' }),
    prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
  };
  M.sign.emissiveMap = M.sign.map; M.billboard.emissiveMap = M.billboard.map;
  M.ground.map.repeat.set(3000 / 9, 2100 / 9);
  M.wetTargets = [M.road, M.side, M.plaza, M.ground];
  for (const m of M.wetTargets) { m.userData.baseRough = m.roughness; m.userData.baseColor = m.color.clone(); }
  M.side.polygonOffset = true; M.side.polygonOffsetFactor = 1; M.side.polygonOffsetUnits = 1;
  M.ground.polygonOffset = true; M.ground.polygonOffsetFactor = 2; M.ground.polygonOffsetUnits = 2;
  M.grass.polygonOffset = true; M.grass.polygonOffsetFactor = 1.5; M.grass.polygonOffsetUnits = 1.5;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 2100).rotateX(-Math.PI / 2), M.ground);
  ground.receiveShadow = true; scene.add(ground);

  // ---------- collision ----------
  const grid = new Grid(24);
  // every collider has a base (y0) and a top (h): you can stand on tops, step up low ones, and walk under raised ones
  const addPoly = (pts, h, tag = 'building', y0 = 0) => { const bb = bbox(pts); const it = { type: 'poly', pts, h, tag, y0, ...bb }; grid.add(it, bb.x1, bb.x2, bb.z1, bb.z2); return it; };
  const addCircle = (x, z, r, tag = 'pole', h = 8, y0 = 0) => { const it = { type: 'circle', x, z, r, h, tag, y0 }; grid.add(it, x - r, x + r, z - r, z + r); return it; };
  const ladders = [];
  // a ladder on a wall: (x,z) at the wall face, n = outward normal, from y0 up to y1
  function addLadder(x, z, nx, nz, y0, y1, color = '#9e9e9e') {
    const len = y1 - y0, yaw = Math.atan2(nx, nz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x + nx * 0.12, y0, z + nz * 0.12), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    const P = () => {
      const P = [box(0.07, len + 1, 0.07, -0.32, (len + 1) / 2, 0, color), box(0.07, len + 1, 0.07, 0.32, (len + 1) / 2, 0, color)];
      for (let y = 0.3; y < len + 0.6; y += 0.35) P.push(box(0.64, 0.05, 0.05, 0, y, 0, color));
      return P;
    };
    later(x, z, () => { const g = merge(P()); g.applyMatrix4(m); B('prop').addGeo(g); });
    ladders.push({ x: x + nx * 0.45, z: z + nz * 0.45, nx, nz, y0, y1 });
  }
  const near = [];
  const insideBuilding = (x, z, m = 0) => {
    grid.query(x, z, m + 0.1, near);
    for (const it of near) if (it.type === 'poly' && it.tag === 'building' && x >= it.x1 - m && x <= it.x2 + m && z >= it.z1 - m && z <= it.z2 + m && pip(x, z, it.pts)) return true;
    return false;
  };

  // ---------- roads: graph, junctions ----------
  const roads = data.roads.map((r) => ({ ...r, pts: toPts(r.p), hw: r.w / 2, drive: DRIVE.has(r.k) })).filter((r) => r.pts.length >= 2);
  const nodes = new Map();
  const nk = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1);
  for (const r of roads) {
    if (!r.drive && r.k !== 'service') continue;
    r.pts.forEach((p, i) => {
      const k = nk(p); let n = nodes.get(k);
      if (!n) nodes.set(k, n = { x: p[0], z: p[1], deg: 0, maxW: 0, roads: [] });
      n.deg += (i === 0 || i === r.pts.length - 1) ? 1 : 2;
      n.maxW = Math.max(n.maxW, r.w); n.roads.push(r);
    });
  }
  const junctionR = (p) => { const n = nodes.get(nk(p)); return n && n.deg >= 3 ? n.maxW / 2 + 1.2 : 0; };

  const segGrid = new Grid(30);
  for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
    segGrid.add({ ax, az, bx, bz, r }, Math.min(ax, bx) - r.hw, Math.max(ax, bx) + r.hw, Math.min(az, bz) - r.hw, Math.max(az, bz) + r.hw);
  }
  const sq = [];
  function nearestRoad(x, z, maxD = 40, filter = (r) => r.drive) {
    segGrid.query(x, z, maxD, sq);
    let best = null;
    for (const s of sq) {
      if (!filter(s.r)) continue;
      const d = segDist(x, z, s.ax, s.az, s.bx, s.bz);
      if (d.d < maxD && (!best || d.d - s.r.hw < best.d - best.r.hw)) {
        const l = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
        best = { d: d.d, x: d.cx, z: d.cz, dx: (s.bx - s.ax) / l, dz: (s.bz - s.az) / l, r: s.r };
      }
    }
    return best;
  }

  // parks (for paths + zones)
  const parks = data.areas.filter((a) => a.k === 'park' || a.k === 'grass' || a.k === 'wood' || a.k === 'pitch').map((a) => ({ ...a, pts: toPts(a.p) }));
  for (const a of parks) Object.assign(a, bbox(a.pts));
  const cubbon = parks.filter((a) => a.n === 'Cubbon Park').sort((a, b) => Math.abs(polyArea(b.pts)) - Math.abs(polyArea(a.pts)))[0];
  const inPark = (x, z) => parks.some((a) => x >= a.x1 && x <= a.x2 && z >= a.z1 && z <= a.z2 && pip(x, z, a.pts));

  // offsets along a polyline with miter joins
  function offsets(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[i - 1], b = pts[i + 1];
      let t1 = null, t2 = null;
      if (a) { const l = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1; t1 = [(p[0] - a[0]) / l, (p[1] - a[1]) / l]; }
      if (b) { const l = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1; t2 = [(b[0] - p[0]) / l, (b[1] - p[1]) / l]; }
      let t = t1 && t2 ? [t1[0] + t2[0], t1[1] + t2[1]] : (t1 || t2);
      const l = Math.hypot(t[0], t[1]) || 1; t = [t[0] / l, t[1] / l];
      let m = 1;
      if (t1 && t2) m = 1 / Math.max(0.4, -t1[1] * -t[1] + t1[0] * t[0]);
      out.push([-t[1] * m, t[0] * m]);
    }
    return out;
  }
  function ribbon(key, pts, hw, y, s) {
    const off = offsets(pts);
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], o = off[i], u = off[i + 1];
      later(p[0], p[1], () => {
        const L0 = [p[0] + o[0] * hw, p[1] + o[1] * hw], R0 = [p[0] - o[0] * hw, p[1] - o[1] * hw];
        const L1 = [q[0] + u[0] * hw, q[1] + u[1] * hw], R1 = [q[0] - u[0] * hw, q[1] - u[1] * hw];
        B(key).quadUp(L0, R0, R1, L1, y, s);
      });
    }
  }
  function disc(key, x, z, r, y, s, seg = 14) {
    later(x, z, () => {
      const b = B(key);
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        b.triUp([x, z], [x + Math.cos(a0) * r, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, z + Math.sin(a1) * r], y, s);
      }
    });
  }
  function strip(key, ax, az, bx, bz, hw, y) {
    later(ax, az, () => {
      const l = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / l * hw, nz = (bx - ax) / l * hw;
      B(key).quadUp([ax + nx, az + nz], [ax - nx, az - nz], [bx - nx, bz - nz], [bx + nx, bz + nz], y, 4);
    });
  }

  // ---------- ground surfaces ----------
  for (const a of data.areas) {
    const pts = toPts(a.p); if (pts.length < 3) continue;
    const [cx, cz] = centroid(pts); if (!inB(cx, cz, 200)) continue;
    const key = a.k === 'water' ? 'water' : a.k === 'plaza' ? 'plaza' : 'grass';
    const y = key === 'water' ? 0.035 : key === 'plaza' ? 0.03 : 0.012;
    const s = key === 'grass' ? 8 : 4;
    // big parks span many chunks: each chunk gets the triangles that start in it
    const byChunk = new Map();
    for (const t of triangulate(pts)) { const c = chunkOf(pts[t[0]][0], pts[t[0]][1]); let l = byChunk.get(c); if (!l) byChunk.set(c, l = []); l.push(t); }
    for (const [c, tris] of byChunk) c.ops.push(() => { const b = B(key); for (const [i, j, k] of tris) b.triUp(pts[i], pts[j], pts[k], y, s); });
  }
  for (const r of roads) {
    const [x0, z0] = r.pts[0]; if (!inB(x0, z0, 150)) continue;
    if (r.drive) {
      ribbon('side', r.pts, r.hw + 2.8, 0.02, 5);
      ribbon('road', r.pts, r.hw, MAJOR.has(r.k) ? 0.06 : 0.05, 10);
      for (const p of [r.pts[0], r.pts[r.pts.length - 1]]) if (junctionR(p)) { disc('road', p[0], p[1], r.hw, MAJOR.has(r.k) ? 0.06 : 0.05, 10); disc('side', p[0], p[1], r.hw + 2.8, 0.02, 5); }
    } else if (r.k === 'service') ribbon('road', r.pts, r.hw, 0.04, 10);
    else if (WALK.has(r.k)) {
      const m = r.pts[Math.floor(r.pts.length / 2)];
      ribbon(r.k === 'pedestrian' ? 'plaza' : inPark(m[0], m[1]) ? 'path' : 'side', r.pts, r.hw, 0.035, 4);
    }
  }

  // ---------- markings, kerbs, zebras ----------
  for (const r of roads) {
    if (!r.drive || !inB(r.pts[0][0], r.pts[0][1], 100)) continue;
    const off = offsets(r.pts);
    const yM = (MAJOR.has(r.k) ? 0.06 : 0.05) + 0.02;
    let acc = 0;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az); if (len < 0.5) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      // trim at every junction vertex, not only at the ends, so kerbs and lines stop at crossings
      const t0 = junctionR(r.pts[i]), t1 = len - junctionR(r.pts[i + 1]);
      if (t1 - t0 < 1) { acc += len; continue; }
      // centre dashes
      if (r.w >= 7.5) {
        for (let s = Math.ceil((acc + t0) / 7) * 7 - acc; s + 3 < t1; s += 7) strip('marking', ax + dx * s, az + dz * s, ax + dx * (s + 3), az + dz * (s + 3), 0.08, yM);
      }
      if (MAJOR.has(r.k) && r.w >= 8) for (const sd of [-1, 1]) {
        const e = r.hw - 0.45; const nx = -dz * e * sd, nz = dx * e * sd;
        strip('marking', ax + dx * t0 + nx, az + dz * t0 + nz, ax + dx * t1 + nx, az + dz * t1 + nz, 0.07, yM);
      }
      // kerbs on both edges
      if (r.k !== 'living_street') for (const sd of [-1, 1]) {
        const e = r.hw + 0.15; const nx = -dz * e * sd, nz = dx * e * sd;
        later(ax, az, () => {
          const kl = t1 - t0, g = new THREE.BoxGeometry(0.3, 0.2, kl);
          const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * kl / 2, uv.getY(k) * kl / 2);
          g.rotateY(Math.atan2(dx, dz)); g.translate(ax + dx * (t0 + kl / 2) + nx, 0.1, az + dz * (t0 + kl / 2) + nz);
          B('kerb').addGeo(part(g, '#fff'));
        });
      }
      acc += len;
      void off;
    }
  }
  for (const [, n] of nodes) {
    if (n.deg < 3 || n.maxW < 8 || !inB(n.x, n.z) || rng() > 0.55) continue;
    for (const r of n.roads) {
      if (!r.drive || r.w < 6.5) continue;
      const i = r.pts.findIndex((p) => Math.abs(p[0] - n.x) < 0.05 && Math.abs(p[1] - n.z) < 0.05);
      for (const j of [i - 1, i + 1]) {
        const q = r.pts[j]; if (!q) continue;
        const l = Math.hypot(q[0] - n.x, q[1] - n.z); const d = n.maxW / 2 + 2.6; if (l < d + 3) continue;
        const dx = (q[0] - n.x) / l, dz = (q[1] - n.z) / l, cx = n.x + dx * d, cz = n.z + dz * d;
        for (let k = -r.hw + 0.5; k < r.hw - 0.5; k += 1.1) {
          const ox = -dz * k, oz = dx * k;
          strip('marking', cx + ox - dx * 1.5, cz + oz - dz * 1.5, cx + ox + dx * 1.5, cz + oz + dz * 1.5, 0.25, (MAJOR.has(r.k) ? 0.06 : 0.05) + 0.021);
        }
      }
    }
  }

  // ---------- buildings ----------
  const TW = T.FACADE_TILE_W, TH = T.FACADE_TILE_H;
  const PAL = {
    res: ['#f3e9d2', '#efe0b9', '#e9d3a8', '#f2c9b8', '#cfe3e8', '#d9ead3', '#f4d6a0', '#e3b48f', '#f6efe3', '#d7c9e6', '#b9d3e8', '#e8c26e', '#f0b9a0', '#e6e0d4'],
    com: ['#e9e7e2', '#d8d4cc', '#c9ccd1', '#e3ddd1', '#cfd8dc', '#f1ede6', '#b7c4cc', '#ded6c6'],
    red: ['#a6402f', '#9c3b2c', '#b14a36'], church: ['#eee8dc', '#e6dfd2'], glass: ['#ffffff', '#e8f1ff', '#dfe8ee'],
  };
  const buildings = [];
  const cA = new THREE.Color(), cTop = new THREE.Color(), cBot = new THREE.Color();
  function extrude(key, pts, h, color, opts = {}) {
    const [cx, cz] = centroid(pts);
    later(cx, cz, () => extrudeNow(B(key), pts, h, color, opts));
  }
  function extrudeNow(b, pts, h, color, opts) {
    const tw = opts.tw || TW, th = opts.th || TH;
    cA.set(color); cTop.copy(cA); cBot.copy(cA).multiplyScalar(0.68);
    let s = opts.off || 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], q = pts[(i + 1) % pts.length];
      const len = Math.hypot(q[0] - a[0], q[1] - a[1]); if (len < 0.01) continue;
      const nx = (q[1] - a[1]) / len, nz = -(q[0] - a[0]) / len;
      const u0 = s / tw, u1 = (s + len) / tw, v1 = h / th, y0 = opts.y0 || 0, v0 = y0 / th;
      const P0 = [a[0], y0, a[1], u0, v0, cBot], P1 = [q[0], y0, q[1], u1, v0, cBot], P2 = [q[0], h, q[1], u1, v1, cTop], P3 = [a[0], h, a[1], u0, v1, cTop];
      for (const P of [P0, P2, P1, P0, P3, P2]) b.v(P[0], P[1], P[2], nx, 0, nz, P[3], P[4], P[5].r, P[5].g, P[5].b);
      s += len;
    }
    const roofC = cA.clone().lerp(new THREE.Color('#9e978c'), opts.glass ? 0.2 : 0.55);
    for (const [i, j, k] of triangulate(pts)) {
      let A = pts[i], Bp = pts[j], C = pts[k];
      if ((Bp[1] - A[1]) * (C[0] - A[0]) - (Bp[0] - A[0]) * (C[1] - A[1]) < 0) { const t = Bp; Bp = C; C = t; }
      for (const p of [A, Bp, C]) b.v(p[0], h, p[1], 0, 1, 0, 0.002, 0.002, roofC.r, roofC.g, roofC.b);
    }
  }
  // rooftop clutter is stamped from these templates (thousands of them: building a geometry each was slow)
  const tankG = part(new THREE.CylinderGeometry(0.7, 0.75, 1.5, 10), '#161616', [0.002, 0.002]);
  const tankBaseG = box(1.5, 0.4, 1.5, 0, 0, 0, '#6b6b6b'), stairG = box(3, 2.6, 3, 0, 0, 0, '#ffffff');
  const shopCands = [];
  for (const d of data.buildings) {
    const pts = toPts(d.p);
    const [cx, cz] = centroid(pts); if (!inB(cx, cz)) continue;
    // footprints that sit over a carriageway are station roofs / skywalks in OSM: skip them
    {
      const bb0 = bbox(pts); let over = false;
      segGrid.query((bb0.x1 + bb0.x2) / 2, (bb0.z1 + bb0.z2) / 2, Math.max(bb0.x2 - bb0.x1, bb0.z2 - bb0.z1) / 2 + 2, sq);
      for (const s of sq) {
        if (!s.r.drive) continue;
        for (const t of [0.25, 0.5, 0.75]) if (pip(s.ax + (s.bx - s.ax) * t, s.az + (s.bz - s.az) * t, pts)) { over = true; break; }
        if (over) break;
      }
      if (over) continue;
    }
    const r = rng();
    const style = d.s;
    const key = style === 'glass' ? 'glass' : style === 'com' ? 'bldB' : 'bldA';
    const color = rng.pick(PAL[style] || PAL.res);
    const h = d.h;
    extrude(key, pts, h, color, style === 'glass' ? { tw: 24, th: 28, off: r, glass: true } : { off: Math.floor(r * 16) / 16 });
    const bb = bbox(pts);
    const bld = { pts, h, style, name: d.n, cx, cz, ...bb, area: Math.abs(polyArea(pts)) };
    buildings.push(bld);
    addPoly(pts, h);
    // roof clutter: black Sintex tanks, stair rooms, church spires
    if (style === 'church') {
      later(cx, cz, () => { const sp = new THREE.ConeGeometry(2.2, 10, 8); sp.translate(cx, h + 5, cz); B('landmark').addGeo(part(sp, '#d9d2c3', [0.002, 0.002])); });
    } else if (style !== 'glass' && bld.area > 50 && h < 45) {
      later(cx, cz, () => {
        const n = cr() < 0.65 ? cr.int(1, 3) : 0;
        for (let i = 0; i < n; i++) {
          const tx = cx + cr.range(-0.25, 0.25) * (bb.x2 - bb.x1), tz = cz + cr.range(-0.25, 0.25) * (bb.z2 - bb.z1);
          if (!pip(tx, tz, pts)) continue;
          B('prop').stamp(tankG, tx, h + 1.15, tz);
          B('prop').stamp(tankBaseG, tx, h + 0.2, tz);
        }
        if (cr() < 0.3 && bld.area > 120 && pip(cx, cz, pts)) B('prop').stamp(stairG, cx, h + 1.3, cz, cA.set(color));
      });
    }
    if (style === 'glass' || h > 60) continue;
    // find a street-facing edge for a shopfront
    let best = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], q = pts[(i + 1) % pts.length];
      const len = Math.hypot(q[0] - a[0], q[1] - a[1]); if (len < 5.5) continue;
      const ex = (q[0] - a[0]) / len, ez = (q[1] - a[1]) / len, nx = ez, nz = -ex;
      const mx = (a[0] + q[0]) / 2, mz = (a[1] + q[1]) / 2;
      const nr = nearestRoad(mx + nx * 6, mz + nz * 6, 14, (rr) => rr.drive || rr.k === 'pedestrian');
      if (!nr) continue;
      const gap = Math.hypot(nr.x - mx, nr.z - mz) - nr.r.hw;
      if (gap < 0 || gap > 11 || Math.abs(nr.dx * ex + nr.dz * ez) < 0.82 || (nr.x - mx) * nx + (nr.z - mz) * nz < 0) continue;
      if (!best || gap < best.gap) best = { gap, a, q, len, ex, ez, nx, nz, mx, mz, road: nr.r };
    }
    if (best) shopCands.push({ ...best, bld });
  }

  // POIs from OSM get real signs and become enterable
  const FOOD = new Set(['cafe', 'restaurant', 'fast_food', 'pub', 'bar', 'ice_cream']);
  const poiList = [];
  const candGrid = new Grid(40);
  shopCands.forEach((c) => candGrid.add(c, c.mx, c.mx, c.mz, c.mz));
  const cq = [];
  for (const p of data.pois) {
    if (!FOOD.has(p.a) || !inB(p.x, p.z) || poiList.length >= 64) continue;
    candGrid.query(p.x, p.z, 30, cq);
    let best = null;
    for (const c of cq) { if (c.poi) continue; const d = Math.hypot(c.mx - p.x, c.mz - p.z); if (d < 30 && (!best || d < best.d)) best = { c, d }; }
    if (best) { best.c.poi = p; best.c.poiIdx = poiList.length; poiList.push(p); }
  }
  M.poiSign = new THREE.MeshStandardMaterial({ map: T.poiSignAtlas(poiList), emissive: '#ffffff', emissiveIntensity: 0.1, roughness: 0.6 });
  M.poiSign.emissiveMap = M.poiSign.map;

  const doors = [];
  const frame = new THREE.Matrix4(), vX = new THREE.Vector3(), vY = new THREE.Vector3(0, 1, 0), vZ = new THREE.Vector3();
  const awningCols = ['#2e7d32', '#1565c0', '#c62828', '#f9a825', '#6a1b9a', '#00838f'];
  let billboards = 0;
  for (const c of shopCands) {
    const { len, ex, ez, nx, nz, mx, mz, bld } = c;
    // decided now (doors are game logic); drawn later by the chunk
    let theme = null, name = null, idx = -1;
    if (c.poi) { theme = themeFor(c.poi); name = c.poi.n; }
    else { idx = rng.int(0, 14); if (ENTER_SIGNS[idx] && rng() < 0.2) { theme = ENTER_SIGNS[idx]; name = titleCase(T.SIGNS[idx][0]); } }
    if (theme) doors.push({ x: mx + nx * 1.2, z: mz + nz * 1.2, nx, nz, name, theme, road: c.road.n });
    const awning = rng() < 0.45 ? rng.pick(awningCols) : null;
    const board = bld.h > 12 && bld.h < 40 && MAJOR.has(c.road.k) && billboards < 40 && rng() < 0.18 ? rng.int(0, 3) : -1;
    if (board >= 0) billboards++;
    later(mx, mz, () => {
      vX.set(-ex, 0, -ez); vZ.set(nx, 0, nz); frame.makeBasis(vX, vY, vZ).setPosition(mx, 0, mz);
      const L = len - 0.8;
      const shop = new THREE.BoxGeometry(L, 3.3, 0.5); shop.translate(0, 1.65, 0.25); shop.applyMatrix4(frame);
      B('shop').addGeo(part(shop, '#fff'));
      const sw = Math.min(len - 1.2, 8);
      const sg = new THREE.PlaneGeometry(sw, 1.5);
      const uv = sg.attributes.uv;
      if (c.poi) {
        const i = c.poiIdx, u0 = (i % 4) * 0.25, v0 = 1 - (Math.floor(i / 4) + 1) / 16;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * 0.25, v0 + uv.getY(k) / 16);
      } else {
        const u0 = (idx % 2) * 0.5, v0 = 1 - (Math.floor(idx / 2) + 1) * 0.125;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * 0.5, v0 + uv.getY(k) * 0.125);
      }
      sg.translate(0, 4.3, 0.53); sg.applyMatrix4(frame);
      B(c.poi ? 'poiSign' : 'sign').addGeo(part(sg, '#fff'));
      if (theme) {
        // door frame + warm doormat glow
        const df = new THREE.BoxGeometry(1.6, 2.6, 0.12); df.translate(0, 1.3, 0.56); df.applyMatrix4(frame);
        B('prop').addGeo(part(df, '#5d4037', [0.002, 0.002]));
      }
      if (awning) {
        const ag = new THREE.BoxGeometry(Math.min(L, 9), 0.1, 1.5); ag.rotateX(0.32); ag.translate(0, 3.35, 0.95); ag.applyMatrix4(frame);
        B('prop').addGeo(part(ag, awning, [0.002, 0.002]));
      }
      if (board >= 0) {
        const bg = new THREE.PlaneGeometry(10, 5);
        const u0 = (board % 2) * 0.5, v0 = board < 2 ? 0.5 : 0; const bu = bg.attributes.uv;
        for (let k = 0; k < bu.count; k++) bu.setXY(k, u0 + bu.getX(k) * 0.5, v0 + bu.getY(k) * 0.5);
        bg.translate(0, bld.h + 4.2, -1.5); bg.applyMatrix4(frame); B('billboard').addGeo(part(bg, '#fff'));
        const back = new THREE.BoxGeometry(10.2, 5.2, 0.15); back.translate(0, bld.h + 4.2, -1.62); back.applyMatrix4(frame); B('prop').addGeo(part(back, '#2a2a2a', [0.002, 0.002]));
        for (const o of [-3.5, 3.5]) { const pg = new THREE.BoxGeometry(0.3, 4, 0.3); pg.translate(o, bld.h + 1.7, -1.8); pg.applyMatrix4(frame); B('prop').addGeo(part(pg, '#3a3a3a', [0.002, 0.002])); }
      }
    });
  }

  // ---------- landmarks ----------
  const L = data.landmarks;
  const lmMat = new THREE.Matrix4();
  let vidhana = null, stadium = null, ubc = null, vidhanaTop = null;
  const floodHeads = [];
  if (L.vidhana) {
    const VX = L.vidhana.x, VZ = L.vidhana.z, S = 1.3, yaw = Math.PI / 2; // front faces east, towards the High Court
    lmMat.compose(new THREE.Vector3(VX, 0, VZ), new THREE.Quaternion().setFromAxisAngle(vY, yaw), new THREE.Vector3(S, S, S));
    const G = '#cfc1a0', G2 = '#bba98a', D = '#dbcfb4', P = [];
    const tb = (x1, x2, z1, z2, y1, y2, col) => { const b = new Batch(); const pts = [[x1, z1], [x2, z1], [x2, z2], [x1, z2]]; return { pts, y1, y2, col }; };
    P.push(box(104, 2.5, 48, 0, 1.25, 0, G2));
    [[1.9, 24, 26], [1.25, 26, 28], [0.6, 28, 30]].forEach(([h, a, b]) => P.push(box(38, h, b - a, 0, h / 2, (a + b) / 2, G2)));
    const facadeBlocks = [tb(-48, 48, -20, 18, 2.5, 16, G), tb(-13, 13, -13, 13, 16, 26, G)];
    for (let i = 0; i < 12; i++) { const c = new THREE.CylinderGeometry(0.7, 0.8, 13.5, 12); c.translate(-16.5 + i * 3, 9.25, 21.5); P.push(part(c, D, [0.002, 0.002])); }
    P.push(box(37, 2, 6, 0, 17, 21, G));
    const ped = new THREE.CylinderGeometry(1, 1, 1, 3); ped.rotateX(-Math.PI / 2); ped.scale(21.5, 4 / 1.5, 6); ped.translate(0, 18 + 0.5 * (4 / 1.5), 21); P.push(part(ped, G, [0.002, 0.002]));
    P.push(box(18, 4, 18, 0, 28, 0, G2));
    const drum = new THREE.CylinderGeometry(7, 7, 3.5, 24); drum.translate(0, 31.75, 0); P.push(part(drum, G, [0.002, 0.002]));
    const dome = new THREE.SphereGeometry(7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); dome.translate(0, 33.5, 0); P.push(part(dome, D, [0.002, 0.002]));
    const fin = new THREE.CylinderGeometry(0.15, 0.4, 3.5, 8); fin.translate(0, 42, 0); P.push(part(fin, '#c9a227', [0.002, 0.002]));
    for (const [dx, dz] of [[-44, -16], [44, -16], [-44, 14], [44, 14]]) {
      P.push(box(8, 5, 8, dx, 18.5, dz, G));
      const sd = new THREE.SphereGeometry(3.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); sd.translate(dx, 21, dz); P.push(part(sd, D, [0.002, 0.002]));
    }
    for (const dx of [-26, 26]) {
      P.push(box(6, 3, 6, dx, 17.5, 15, G));
      const sd = new THREE.SphereGeometry(2.6, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2); sd.translate(dx, 19, 15); P.push(part(sd, D, [0.002, 0.002]));
    }
    const lg = merge(P); lg.applyMatrix4(lmMat); keep('landmark', VX, VZ, lg);
    for (const f of facadeBlocks) {
      const w = f.pts.map(([x, z]) => { const v = new THREE.Vector3(x, 0, z).applyMatrix4(lmMat); return [v.x, v.z]; });
      if (polyArea(w) < 0) w.reverse();
      extrude('landmark', w, f.y2 * S, f.col, { y0: f.y1 * S, off: 0.25 });
    }
    // climbable in tiers: steps → podium → main roof → tower → drum → dome, linked by ladders
    const L2W = (x, z) => { const v = new THREE.Vector3(x, 0, z).applyMatrix4(lmMat); return [v.x, v.z]; };
    const rect = (x1, x2, z1, z2, h) => { const c = [[x1, z1], [x2, z1], [x2, z2], [x1, z2]].map(([x, z]) => L2W(x, z)); if (polyArea(c) < 0) c.reverse(); addPoly(c, h * S, 'landmark'); };
    rect(-52, 52, -24, 24, 2.5); rect(-19, 19, 24, 26, 1.9); rect(-19, 19, 26, 28, 1.25); rect(-19, 19, 28, 30, 0.6);
    rect(-48, 48, -20, 18, 16); rect(-18.5, 18.5, 18, 24, 18); rect(-13, 13, -13, 13, 26); rect(-9, 9, -9, 9, 30);
    for (const [dx, dz] of [[-44, -16], [44, -16], [-44, 14], [44, 14]]) rect(dx - 4, dx + 4, dz - 4, dz + 4, 21);
    const [dcx, dcz] = L2W(0, 0);
    addCircle(dcx, dcz, 7 * S, 'landmark', 33.5 * S); addCircle(dcx, dcz, 4 * S, 'landmark', 40 * S);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(vY, yaw));
    const lad = (x, z, y0, y1) => { const [wx, wz] = L2W(x, z); addLadder(wx, wz, fwd.x, fwd.z, y0 * S, y1 * S, '#c9a227'); };
    lad(-30, 18, 2.5, 16); lad(-6, 13, 16, 26); lad(4, 9, 26, 30); lad(0, 7, 30, 33.5); lad(0, 4, 33.5, 40);
    vidhanaTop = { x: dcx, z: dcz, y: 40 * S };
    // "Government work is God's work" — big enough to read from the steps
    const it = T.textTexture(['ಸರ್ಕಾರದ ಕೆಲಸ ದೇವರ ಕೆಲಸ', "GOVERNMENT WORK IS GOD'S WORK"], { w: 1024, h: 160, bg: '#cfc1a0', fg: '#3f321f', font: '700 56px "Noto Sans Kannada", "Space Grotesk"' });
    const ip = new THREE.Mesh(new THREE.PlaneGeometry(31, 4.8), new THREE.MeshStandardMaterial({ map: it, roughness: 0.8, emissive: '#ffffff', emissiveMap: it, emissiveIntensity: 0 }));
    ip.position.set(0, 17, 24.06); ip.applyMatrix4(lmMat); scene.add(ip); M.inscription = ip.material;
    const front = new THREE.Vector3(0, 0, 40).applyMatrix4(lmMat);
    vidhana = { x: VX, z: VZ, fx: front.x, fz: front.z };
  }
  if (L.stadium) {
    const SX = L.stadium.x, SZ = L.stadium.z, R = Math.min(85, L.stadium.r * 0.72), k = R / 52;
    const prof = [[35, 0], [35, 1.6], [47, 14], [49, 16.5], [52, 16.5], [52, 0]].map(([r, y]) => new THREE.Vector2(r * k, y * k * 0.85));
    const st = part(new THREE.LatheGeometry(prof, 72), '#d6d2c8', [0.002, 0.002]);
    const pos = st.attributes.position, col = st.attributes.color, c = new THREE.Color();
    const bands = ['#b71c1c', '#e0a81c', '#8e1515', '#c9c3b6'];
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i)) / k, y = pos.getY(i) / k;
      if (r > 35.5 && r < 47.5 && y > 1.5) c.set(bands[Math.floor(y / 2.2) % 4]); else c.set('#d6d2c8');
      col.setXYZ(i, c.r, c.g, c.b);
    }
    st.translate(SX, 0, SZ);
    const roof = part(new THREE.LatheGeometry([new THREE.Vector2(53 * k, 18.5 * k * 0.85), new THREE.Vector2(43 * k, 23 * k * 0.85)], 72), '#f1efe9', [0.002, 0.002]); roof.translate(SX, 0, SZ);
    const roof2 = part(new THREE.LatheGeometry([new THREE.Vector2(43 * k, 22.7 * k * 0.85), new THREE.Vector2(53 * k, 18.2 * k * 0.85)], 72), '#cfcac0', [0.002, 0.002]); roof2.translate(SX, 0, SZ);
    const stm = new THREE.Mesh(merge([st, roof, roof2]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
    stm.castShadow = stm.receiveShadow = true; scene.add(stm); cull.push({ m: stm, x: SX, z: SZ, r: R + 50 });
    const fc = document.createElement('canvas'); fc.width = fc.height = 256; const fx = fc.getContext('2d');
    for (let i = 0; i < 16; i++) { fx.fillStyle = i % 2 ? '#3f8f3a' : '#4aa044'; fx.fillRect(i * 16, 0, 16, 256); }
    fx.fillStyle = '#c8a870'; fx.fillRect(122, 98, 12, 60); fx.strokeStyle = '#fff'; fx.lineWidth = 1.5; fx.beginPath(); fx.arc(128, 128, 90, 0, 7); fx.stroke();
    const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
    const field = new THREE.Mesh(new THREE.CircleGeometry(35.5 * k, 48), new THREE.MeshStandardMaterial({ map: ft, roughness: 1 }));
    field.rotation.x = -Math.PI / 2; field.position.set(SX, 0.08, SZ); field.receiveShadow = true; scene.add(field);
    for (const a of [0.25, 0.75, 1.25, 1.75]) {
      const t = a * Math.PI, tx = SX + Math.cos(t) * R * 1.12, tz = SZ + Math.sin(t) * R * 1.12;
      const tg = new THREE.CylinderGeometry(0.5, 1.3, 50, 8); tg.translate(tx, 25, tz); keep('concrete', tx, tz, part(tg, '#9e9e9e', [0.002, 0.002]));
      const head = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 0.6), M.flood); head.position.set(tx, 51, tz); head.lookAt(SX, 10, SZ); scene.add(head); floodHeads.push(head);
      addCircle(tx, tz, 1.4, 'pole', 50);
    }
    addCircle(SX, SZ, R + 0.5, 'landmark', 23);
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(R * 1.8, R * 1.8), M.pool.clone()); fp.rotation.x = -Math.PI / 2; fp.position.set(SX, 0.3, SZ); fp.material.color.set('#e6f0ff'); scene.add(fp);
    const haze = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#cfe0ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    haze.scale.set(R * 3, R * 1.3, 1); haze.position.set(SX, 32, SZ); scene.add(haze);
    M.fieldPool = fp.material; M.haze = haze.material;
    stadium = { x: SX, z: SZ, r: R };
  }
  if (L.ubcity) {
    const near = buildings.filter((b) => b.style === 'glass' && Math.hypot(b.cx - L.ubcity.x, b.cz - L.ubcity.z) < 140).sort((a, b) => b.h - a.h);
    const top = near[0];
    if (top) {
      top.h = Math.max(top.h, 80);
      const cw = Math.min(top.x2 - top.x1, top.z2 - top.z1) * 0.8;
      const P = [box(cw, 3, cw, top.cx, top.h + 1.5, top.cz, '#e9dfc5'), box(cw * 0.7, 3, cw * 0.7, top.cx, top.h + 4.5, top.cz, '#e9dfc5'), box(cw * 0.4, 3, cw * 0.4, top.cx, top.h + 7.5, top.cz, '#e9dfc5')];
      const sp = new THREE.CylinderGeometry(0.15, 0.9, 20, 8); sp.translate(top.cx, top.h + 19, top.cz); P.push(part(sp, '#d9d4c7', [0.002, 0.002]));
      keep('landmark', top.cx, top.cz, merge(P));
      const red = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), M.redLight); red.position.set(top.cx, top.h + 29.5, top.cz); scene.add(red);
    }
    ubc = { x: L.ubcity.x, z: L.ubcity.z };
    // fine-dining entrances along the UB City frontage (invented names)
    const nr = nearestRoad(ubc.x, ubc.z, 250);
    if (nr) {
      const side = ((ubc.x - nr.x) * -nr.dz + (ubc.z - nr.z) * nr.dx) >= 0 ? 1 : -1;
      const nx = -nr.dz * side, nz = nr.dx * side;
      ['The Saffron Room', 'Nimbus Rooftop', 'Kaveri Grand'].forEach((name, i) => {
        for (let k = 0; k < 6; k++) {
          const along = (i - 1) * 16 + k * 3, off = nr.r.hw + 3.2;
          const x = nr.x + nr.dx * along + nx * off, z = nr.z + nr.dz * along + nz * off;
          if (insideBuilding(x, z, 0.8)) continue;
          const yaw = Math.atan2(-nx, -nz);
          const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(vY, yaw), new THREE.Vector3(1, 1, 1));
          const g = merge([box(2.6, 3.2, 0.3, 0, 1.6, -0.6, '#141414'), box(2.9, 0.18, 0.4, 0, 3.3, -0.6, '#c9a227'), box(0.14, 3.2, 0.4, -1.35, 1.6, -0.6, '#c9a227'), box(0.14, 3.2, 0.4, 1.35, 1.6, -0.6, '#c9a227'), box(3.4, 0.05, 2.2, 0, 0.03, 0.4, '#5a1018')]);
          g.applyMatrix4(m); keep('prop', x, z, g);
          const st = T.textTexture([name.toUpperCase()], { w: 512, h: 96, bg: '#0f0f0f', fg: '#d4af37', font: '600 44px "Space Grotesk"' });
          const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshStandardMaterial({ map: st, emissive: '#ffffff', emissiveMap: st, emissiveIntensity: 0.6 }));
          sg.position.set(0, 3.75, -0.38); sg.applyMatrix4(m); scene.add(sg);
          doors.push({ x: x + nx * 0.2, z: z + nz * 0.2, nx: -nx, nz: -nz, name, theme: 'restaurant', road: nr.r.n });
          break;
        }
      });
    }
  }

  // ---------- Namma Metro viaduct + stations ----------
  const tracks = [];
  {
    const lines = data.metro.map((m) => toPts(m.p));
    // stitch the pieces of each track into continuous polylines
    const used = new Set();
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue; used.add(i);
      let line = lines[i].slice(), grown = true;
      while (grown) {
        grown = false;
        for (let j = 0; j < lines.length; j++) {
          if (used.has(j)) continue;
          const l = lines[j], d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (d(line[line.length - 1], l[0]) < 2) line = line.concat(l.slice(1));
          else if (d(line[line.length - 1], l[l.length - 1]) < 2) line = line.concat(l.slice(0, -1).reverse());
          else if (d(line[0], l[l.length - 1]) < 2) line = l.slice(0, -1).concat(line);
          else if (d(line[0], l[0]) < 2) line = l.slice(1).reverse().concat(line);
          else continue;
          used.add(j); grown = true;
        }
      }
      tracks.push(line);
    }
    let acc = 0;
    for (const line of tracks) for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az); if (len < 0.1) continue;
      const yaw = Math.atan2(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const deck = new THREE.BoxGeometry(5, 1.4, len + 0.4); deck.rotateY(yaw); deck.translate(mx, 9.8, mz);
      // the viaduct deck is walkable (you get up there by the ladder at MG Road station)
      { const hx = (bz - az) / len * 2.5, hz = -(bx - ax) / len * 2.5; addPoly([[ax + hx, az + hz], [bx + hx, bz + hz], [bx - hx, bz - hz], [ax - hx, az - hz]], 10.6, 'deck', 9.1); }
      keep('concrete', mx, mz, part(deck, '#c4beb2', [0.002, 0.002]));
      for (const o of [-2.4, 2.4]) {
        const pr = new THREE.BoxGeometry(0.25, 1, len + 0.4); pr.translate(o, 0, 0); pr.rotateY(yaw); pr.translate(mx, 11, mz);
        keep('concrete', mx, mz, part(pr, '#d6d0c4', [0.002, 0.002]));
      }
      for (let s = (30 - acc % 30) % 30; s < len; s += 30) {
        const px = ax + (bx - ax) * s / len, pz = az + (bz - az) * s / len;
        const onLane = nearestRoad(px, pz, 12);
        if (onLane && onLane.d < onLane.r.hw + 0.9) continue; // keep pillars out of the carriageway
        keep('concrete', px, pz, box(1.8, 9, 1.8, px, 4.5, pz, '#bfb9ad'));
        const cap = new THREE.BoxGeometry(5.5, 1.1, 2.4); cap.rotateY(yaw); cap.translate(px, 8.5, pz); keep('concrete', px, pz, part(cap, '#bfb9ad', [0.002, 0.002]));
        addCircle(px, pz, 1.3, 'pillar', 9);
      }
      acc += len;
    }
  }
  const stations = data.stations.map((s) => {
    let best = null;
    for (const line of tracks) for (let i = 0; i < line.length - 1; i++) {
      const d = segDist(s.x, s.z, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
      if (!best || d.d < best.d) best = { ...d, yaw: Math.atan2(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]) };
    }
    const elevated = best && best.d < 40;
    const short = s.n.replace('Dr. B. R. Ambedkar Station, ', '').replace('Mahatma Gandhi Road', 'MG Road');
    return { name: short, full: s.n, x: s.x, z: s.z, elevated, yaw: best ? best.yaw : 0, tx: best && best.cx, tz: best && best.cz };
  });
  const kiosks = [];
  for (const st of stations) if (st.elevated) {
    // maintenance ladder from the footpath up to the viaduct deck, beside the station
    const line = tracks[0]; let best = null;
    for (const l of tracks) for (let i = 0; i < l.length - 1; i++) { const d = segDist(st.tx, st.tz, l[i][0], l[i][1], l[i + 1][0], l[i + 1][1]); if (!best || d.d < best.d) best = { ...d, dx: l[i + 1][0] - l[i][0], dz: l[i + 1][1] - l[i][1] }; }
    void line;
    if (best) {
      const L = Math.hypot(best.dx, best.dz) || 1, nx = best.dz / L, nz = -best.dx / L;
      // find a spot along the viaduct where the deck edge is over the footpath, not a lane
      found: for (let a = 30; a < 260; a += 6) for (const along of [a, -a]) for (const sd of [1, -1]) {
        const x = best.cx + best.dx / L * along + nx * 2.55 * sd, z = best.cz + best.dz / L * along + nz * 2.55 * sd;
        const rd = nearestRoad(x, z, 15, (r) => r.drive || r.k === 'service');
        if ((rd && rd.d < rd.r.hw + 0.6) || insideBuilding(x, z, 0.6)) continue;
        addLadder(x, z, nx * sd, nz * sd, 0, 10.6, '#7b2d8e'); break found;
      }
    }
  }
  for (const st of stations) {
    if (st.elevated) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(st.tx, 0, st.tz), new THREE.Quaternion().setFromAxisAngle(vY, st.yaw), new THREE.Vector3(1, 1, 1));
      const P = [box(16, 6, 0.6, 8.4, 13.5, 0, '#e8e4dc'), box(16, 6, 0.6, -8.4, 13.5, 0, '#e8e4dc'), box(18.4, 0.8, 70, 0, 16.8, 0, '#d0cabe'),
        box(0.7, 1.2, 60, 8.7, 11.2, 0, '#7b2d8e'), box(0.7, 1.2, 60, -8.7, 11.2, 0, '#7b2d8e'), box(16, 1.2, 60, 0, 9.4, 0, '#c4beb2')];
      P[0] = box(0.6, 6, 60, 8.4, 13.5, 0, '#e8e4dc'); P[1] = box(0.6, 6, 60, -8.4, 13.5, 0, '#e8e4dc');
      const g = merge(P); g.applyMatrix4(m); keep('concrete', st.tx, st.tz, g);
    }
    // street-level entrance kiosk beside the nearest road
    const nr = nearestRoad(st.x, st.z, 120);
    let ex = st.x, ez = st.z, yaw = 0;
    if (nr) {
      const pref = ((st.x - nr.x) * -nr.dz + (st.z - nr.z) * nr.dx) >= 0 ? 1 : -1;
      found: for (const m of [2.5, 1]) for (const along of [0, 8, -8, 16, -16, 26, -26, 40, -40]) for (const side of [pref, -pref]) {
        const x = nr.x + nr.dx * along - nr.dz * side * (nr.r.hw + 2.2), z = nr.z + nr.dz * along + nr.dx * side * (nr.r.hw + 2.2);
        const clear = m < 2 || !nearestRoad(x, z, 3, (r) => r.drive && r !== nr.r);
        if (!insideBuilding(x, z, m) && clear) { ex = x; ez = z; yaw = Math.atan2(-nr.dz * side, nr.dx * side); break found; }
      }
    }
    const km = new THREE.Matrix4().compose(new THREE.Vector3(ex, 0, ez), new THREE.Quaternion().setFromAxisAngle(vY, yaw + Math.PI), new THREE.Vector3(1, 1, 1));
    const kg = merge([box(4, 3, 3, 0, 1.5, -1.6, '#d9d4ca'), box(4.6, 0.4, 3.6, 0, 3.2, -1.6, '#7b2d8e'), box(0.25, 4.5, 0.25, 2.6, 2.25, 0.3, '#444'), box(1.2, 1.2, 0.15, 2.6, 4.6, 0.3, '#7b2d8e')]);
    kg.applyMatrix4(km); keep('prop', ex, ez, kg);
    kiosks.push({ ...st, ex, ez });
  }

  // ---------- trees, lamps, cables along streets ----------
  const treeCols = { green: ['#3f7a2e', '#4f8f35', '#2f6b2a', '#5b9a3c', '#447f30'], gulmohar: ['#d9471c', '#e0561e'], jacaranda: ['#8a6bd1', '#9b7ad8'], yellow: ['#e0b52a'] };
  const pickTreeCol = () => { const r = rng(); return rng.pick(r < 0.62 ? treeCols.green : r < 0.78 ? treeCols.gulmohar : r < 0.92 ? treeCols.jacaranda : treeCols.yellow); };
  const lampsAll = [];
  const offRoad = (x, z, selfR, m) => { segGrid.query(x, z, 12, sq); for (const s of sq) { if (s.r === selfR || (!s.r.drive && s.r.k !== 'service')) continue; if (segDist(x, z, s.ax, s.az, s.bx, s.bz).d < s.r.hw + m) return false; } return true; };
  for (const r of roads) {
    if (!r.drive || !inB(r.pts[0][0], r.pts[0][1], 50)) continue;
    const major = MAJOR.has(r.k);
    const tSp = major ? 15 : 21, lSp = major ? 34 : 46;
    for (const sd of [-1, 1]) {
      let acc = rng.range(0, tSp), lacc = sd > 0 ? 6 : 6 + lSp / 2;
      let prevLamp = null;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az); if (len < 0.1) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz * sd, nz = dx * sd;
        const jr0 = i === 0 ? junctionR(r.pts[0]) + 3 : 0, jr1 = i === r.pts.length - 2 ? junctionR(r.pts[r.pts.length - 1]) + 3 : 0;
        for (let s = acc; s < len; s += tSp) {
          if (s < jr0 || s > len - jr1 || rng() > 0.75) continue;
          const x = ax + dx * s + nx * (r.hw + 2.1), z = az + dz * s + nz * (r.hw + 2.1);
          if (!inB(x, z) || insideBuilding(x, z, 1) || !offRoad(x, z, r, 1.5)) continue;
          chunkOf(x, z).trees.push({ x, z, s: rng.range(0.9, 1.45), col: pickTreeCol() });
          addCircle(x, z, 0.45, 'tree', 8);
        }
        acc = ((acc - len) % tSp + tSp) % tSp;
        for (let s = lacc; s < len; s += lSp) {
          if (s < jr0 || s > len - jr1) { prevLamp = null; continue; }
          const x = ax + dx * s + nx * (r.hw + 0.7), z = az + dz * s + nz * (r.hw + 0.7);
          if (!inB(x, z) || insideBuilding(x, z, 0.5) || !offRoad(x, z, r, 1)) { prevLamp = null; continue; }
          const l = { x, z, dx: -nx, dz: -nz, hw: r.hw };
          chunkOf(x, z).lamps.push(l); lampsAll.push(l);
          addCircle(x, z, 0.25, 'pole', 8);
          if (prevLamp && Math.hypot(prevLamp.x - x, prevLamp.z - z) < lSp * 1.6) {
            const c = chunkOf(x, z).cables; const n = rng.int(3, 6);
            for (let k = 0; k < n; k++) sagLine(c, prevLamp.x, rng.range(5.6, 7.3), prevLamp.z, x, rng.range(5.6, 7.3), z, rng.range(0.3, 1.4));
            if (!major && rng() < 0.3) sagLine(c, x, 6.5, z, x - nx * (r.w + 1.4), 6.8, z - nz * (r.w + 1.4), rng.range(0.5, 1.2));
          }
          prevLamp = l;
        }
        lacc = ((lacc - len) % lSp + lSp) % lSp;
      }
    }
  }
  function sagLine(out, ax, ay, az, bx, by, bz, sag, n = 8) {
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      out.push(ax + (bx - ax) * t0, ay + (by - ay) * t0 - sag * 4 * t0 * (1 - t0), az + (bz - az) * t0,
        ax + (bx - ax) * t1, ay + (by - ay) * t1 - sag * 4 * t1 * (1 - t1), az + (bz - az) * t1);
    }
  }
  // park trees: Cubbon is dense with rain trees, bamboo and gulmohar
  let parkTrees = 0;
  for (const a of parks) {
    const area = Math.abs(polyArea(a.pts)); if (area < 200) continue;
    const n = Math.min(2200, Math.floor(area / (a.k === 'wood' ? 70 : a.k === 'pitch' ? 4000 : 160)));
    for (let i = 0; i < n * 2 && parkTrees < 6000; i++) {
      const x = rng.range(a.x1, a.x2), z = rng.range(a.z1, a.z2);
      if (!inB(x, z) || !pip(x, z, a.pts) || insideBuilding(x, z, 2)) continue;
      if (vidhana && Math.hypot(x - vidhana.x, z - vidhana.z) < 110) continue;
      if (stadium && Math.hypot(x - stadium.x, z - stadium.z) < stadium.r + 15) continue;
      if (nearestRoad(x, z, 6, (r) => true)) continue;
      chunkOf(x, z).trees.push({ x, z, s: rng.range(1.3, 2.4), park: true, col: rng() < 0.8 ? rng.pick(treeCols.green) : pickTreeCol() });
      addCircle(x, z, 0.6, 'tree', 10);
      if (++parkTrees % 2 === 0 && i > n * 2) break;
    }
  }

  // Church Street fairy lights + café umbrellas
  for (const r of roads.filter((o) => o.n === 'Church Street')) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], len = Math.hypot(bx - ax, bz - az); if (len < 1) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz, nz = dx, W = r.hw + 3.8;
      for (let s = 0, k = 0; s + 4 < len; s += 4, k++) {
        const sg = k % 2 ? 1 : -1;
        const x0 = ax + dx * s + nx * W * sg, z0 = az + dz * s + nz * W * sg, x1 = ax + dx * (s + 4) - nx * W * sg, z1 = az + dz * (s + 4) - nz * W * sg;
        const c = chunkOf(x0, z0); sagLine(c.cables, x0, 6.4, z0, x1, 6.4, z1, 0.7);
        for (let t = 0.05; t < 1; t += 0.07) c.bulbs.push([x0 + (x1 - x0) * t, 6.4 - 0.7 * 4 * t * (1 - t), z0 + (z1 - z0) * t]);
      }
    }
  }

  // ---------- potholes & puddles ----------
  const potholes = [];
  const driveRoads = roads.filter((r) => r.drive && inB(r.pts[0][0], r.pts[0][1]));
  const blob = (key, x, z, rad, y, sx = 1, seg = 11) => {
    const pts = []; for (let i = 0; i < seg; i++) { const a = i / seg * 6.283, rr = rad * (0.75 + rng() * 0.4); pts.push([x + Math.cos(a) * rr * sx, z + Math.sin(a) * rr]); }
    later(x, z, () => { const bt = B(key); for (let i = 0; i < seg; i++) bt.triUp([x, z], pts[i], pts[(i + 1) % seg], y, 1); });
  };
  for (let i = 0; i < 520; i++) {
    const r = rng.pick(driveRoads), j = rng.int(0, r.pts.length - 2);
    const [ax, az] = r.pts[j], [bx, bz] = r.pts[j + 1], t = rng(), len = Math.hypot(bx - ax, bz - az); if (len < 2) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const edge = i % 3 !== 0;
    const lat = edge ? (r.hw - rng.range(0.8, 1.6)) * (rng() < 0.5 ? -1 : 1) : rng.range(-r.hw + 1.2, r.hw - 1.2);
    const x = ax + dx * len * t - dz * lat, z = az + dz * len * t + dx * lat;
    const y = (MAJOR.has(r.k) ? 0.06 : 0.05);
    if (!edge) { const rad = rng.range(0.5, 1.1); potholes.push({ x, z, r: rad }); blob('pothole', x, z, rad, y + 0.006); blob('puddle', x, z, rad * 0.95, y + 0.012); }
    else blob('puddle', x, z, rng.range(0.8, 2), y + 0.01, rng.range(1, 1.8));
  }

  // ---------- vendors & benches ----------
  const vendors = [], benches = [];
  const VENDOR_TYPES = ['elaneer', 'chai', 'corn', 'panipuri', 'jasmine', 'elaneer', 'chai'];
  const vendorCols = { elaneer: '#2e7d32', chai: '#6d4c41', corn: '#f9a825', panipuri: '#c62828', jasmine: '#f5f5f5' };
  const majors = driveRoads.filter((r) => MAJOR.has(r.k));
  for (let i = 0; i < 400 && vendors.length < 42; i++) {
    const r = rng.pick(majors), j = rng.int(0, r.pts.length - 2);
    const [ax, az] = r.pts[j], [bx, bz] = r.pts[j + 1], len = Math.hypot(bx - ax, bz - az); if (len < 8) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len, sd = rng() < 0.5 ? -1 : 1, t = rng.range(0.2, 0.8);
    const x = ax + dx * len * t - dz * sd * (r.hw + 1.6), z = az + dz * len * t + dx * sd * (r.hw + 1.6);
    if (!inB(x, z) || insideBuilding(x, z, 1) || !offRoad(x, z, r, 1) || vendors.some((v) => Math.hypot(v.x - x, v.z - z) < 60)) continue;
    const type = VENDOR_TYPES[vendors.length % VENDOR_TYPES.length];
    const yaw = Math.atan2(dz * -sd * -1, -dx * sd * -1);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(vY, Math.atan2(dz * sd, -dx * sd) + Math.PI / 2), new THREE.Vector3(1, 1, 1));
    const cg = merge([
      box(1.8, 0.7, 0.9, 0, 0.85, 0, vendorCols[type]), box(1.9, 0.08, 1.0, 0, 1.22, 0, '#8d6e63'),
      part(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12).rotateX(Math.PI / 2).translate(-0.7, 0.32, 0.48), '#222'),
      part(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12).rotateX(Math.PI / 2).translate(0.7, 0.32, 0.48), '#222'),
      part(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5).translate(0, 2, 0), '#888'),
      part(new THREE.ConeGeometry(1.3, 0.5, 10).translate(0, 2.8, 0), rng.pick(['#c62828', '#1565c0', '#f9a825', '#2e7d32'])),
      type === 'elaneer' ? merge([0, 1, 2, 3, 4].map((k) => part(new THREE.SphereGeometry(0.17, 8, 6).translate(-0.6 + k * 0.3, 1.4, 0), '#558b2f'))) : box(0.5, 0.35, 0.4, 0.4, 1.45, 0, '#cfcfcf'),
      // the vendor
      box(0.42, 0.6, 0.26, 0, 1.15, -0.85, rng.pick(['#e53935', '#1e88e5', '#fafafa', '#43a047'])),
      box(0.34, 0.8, 0.24, 0, 0.42, -0.85, '#3e3e3e'),
      part(new THREE.SphereGeometry(0.13, 10, 7).translate(0, 1.62, -0.85), '#8d5a3b'),
    ]);
    cg.applyMatrix4(m); keep('prop', x, z, cg);
    addCircle(x, z, 1.1, 'prop', 3);
    void yaw;
    vendors.push({ x, z, type });
  }
  if (cubbon) {
    for (const r of roads) {
      if (!WALK.has(r.k)) continue;
      const m = r.pts[Math.floor(r.pts.length / 2)];
      if (!pip(m[0], m[1], cubbon.pts) || rng() > 0.5 || benches.length > 40) continue;
      const [ax, az] = r.pts[0], [bx, bz] = r.pts[1] || r.pts[0], len = Math.hypot(bx - ax, bz - az); if (len < 3) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len, x = ax + dx * len / 2 - dz * (r.hw + 0.9), z = az + dz * len / 2 + dx * (r.hw + 0.9);
      const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(vY, Math.atan2(dx, dz) + Math.PI / 2), new THREE.Vector3(1, 1, 1));
      const bg = merge([box(1.8, 0.08, 0.5, 0, 0.48, 0, '#6d4c41'), box(1.8, 0.45, 0.06, 0, 0.78, -0.24, '#6d4c41'), box(0.08, 0.48, 0.45, -0.8, 0.24, 0, '#333'), box(0.08, 0.48, 0.45, 0.8, 0.24, 0, '#333')]);
      bg.applyMatrix4(m4); keep('prop', x, z, bg);
      benches.push({ x, z }); addCircle(x, z, 0.55, 'bench', 0.5);
    }
  }

  // ladders on some street-facing buildings: climb up, then roof-hop
  shopCands.forEach((c, i) => {
    const b = c.bld; if (i % 9 !== 4 || b.h < 6 || b.h > 28 || b.style === 'glass') return;
    const t = 0.18, x = c.a[0] + (c.q[0] - c.a[0]) * t, z = c.a[1] + (c.q[1] - c.a[1]) * t;
    addLadder(x, z, c.nx, c.nz, 0, b.h);
  });

  // ---------- build chunk meshes ----------
  const CAST = new Set(['bldA', 'bldB', 'glass', 'landmark', 'concrete', 'prop']);
  const ORDER = { puddle: 2 };
  const trunkG = new THREE.CylinderGeometry(0.22, 0.38, 1, 6).translate(0, 0.5, 0);
  const canopyG = merge([[0, 0, 0, 1.8], [1.1, -0.3, 0.4, 1.3], [-0.9, -0.2, -0.6, 1.4]].map(([x, y, z, r]) => { const g = new THREE.IcosahedronGeometry(r, 0); g.scale(1.3, 0.75, 1.3); g.translate(x, y, z); return part(g, '#fff'); }));
  // far-away trees swap to a single blob (20 instead of 60 triangles)
  const canopyLo = part(new THREE.IcosahedronGeometry(2.1, 0).scale(1.4, 0.8, 1.4), '#fff');
  const trunkLo = new THREE.CylinderGeometry(0.25, 0.38, 1, 4).translate(0, 0.5, 0);
  const poleG = merge([part(new THREE.CylinderGeometry(0.1, 0.16, 8, 6).translate(0, 4, 0), '#4a4f55'), box(0.12, 0.12, 2.4, 0, 7.8, 1.1, '#4a4f55')]);
  const headG = new THREE.BoxGeometry(0.6, 0.18, 0.9).translate(0, 7.68, 2.2);
  const poolG = new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2);
  const bulbG = new THREE.OctahedronGeometry(0.08, 0);
  // small things only drawn near the camera
  const DETAIL = new Set(['kerb', 'marking', 'prop', 'pothole', 'puddle']);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), cc = new THREE.Color(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  // roads, buildings, kerbs…: one BatchedMesh per material for the whole map (a single multi-draw call each).
  // Each loaded chunk adds its piece; dropping a chunk frees it, and the buffer is compacted or grown as needed.
  const pools = {}, slots = chunks.size + 4, layout = (() => { const t = new Batch(); t.triUp([0, 0], [1, 0], [0, 1], 0, 1); return t.build(); })();
  function pool(key, need) {
    let bm = pools[key];
    if (!bm) {
      bm = pools[key] = new THREE.BatchedMesh(slots, Math.max(need * 2, 1 << 12), 0, M[key]);
      bm.castShadow = CAST.has(key); bm.receiveShadow = !DETAIL.has(key) || key === 'prop'; bm.renderOrder = ORDER[key] || 0;
      bm.sortObjects = !!M[key].transparent; bm.frustumCulled = false;
      bm._initializeGeometry(layout); // set up the attributes now, so an empty pool can still compile its shader
      scene.add(bm);
    }
    if (bm._nextVertexStart + need > bm._maxVertexCount) {
      bm.optimize();
      // three r170's optimize() moves the data but never flags it for upload or refreshes the draw ranges, and doesn't rewind an empty buffer
      for (const k in bm.geometry.attributes) bm.geometry.attributes[k].needsUpdate = true;
      bm._visibilityChanged = true;
      if (!bm._geometryInfo.some((g) => g.active)) bm._nextVertexStart = 0;
      if (bm._nextVertexStart + need > bm._maxVertexCount) { bm.setGeometrySize(Math.ceil((bm._nextVertexStart + need) * 1.5), 0); bm._visibilityChanged = true; }
    }
    return bm;
  }
  const buildMs = [], finMs = []; // recent chunk build times (total, and the last uninterruptible step), for the F3 overlay
  // runs a chunk's build steps until `until` (a performance.now() deadline), and can pick up where it stopped next frame;
  // returns true once the chunk's meshes are in the scene
  function buildChunk(c, until = Infinity) {
    if (!c.b) { c.b = {}; c.opI = 0; c.rng = makeRng((c.i * 73856093) ^ (c.j * 19349663) ^ 11); c.ms = 0; }
    let t0 = performance.now();
    bc = c; cr = c.rng;
    while (c.opI < c.ops.length) { c.ops[c.opI++](); if ((c.opI & 7) === 0 && performance.now() > until) break; }
    bc = null;
    if (c.opI < c.ops.length) { cr = rng; c.ms += performance.now() - t0; return false; }
    c.ms += performance.now() - t0; t0 = performance.now();
    const base = [], det = [], lod = [];
    const entry = { x: c.x, z: c.z, r: CH * 0.72, lod, far: null, bat: [] };
    for (const key in c.b) {
      if (c.b[key].empty) continue;
      const geo = c.b[key].build(), bm = pool(key, geo.attributes.position.count);
      const gid = bm.addGeometry(geo);
      entry.bat.push({ bm, gid, id: bm.addInstance(gid), det: DETAIL.has(key), vis: true }); geo.dispose();
    }
    c.b = null; bc = null;
    if (c.trees.length) {
      const tr = new THREE.InstancedMesh(trunkG, M.trunk, c.trees.length), ca = new THREE.InstancedMesh(canopyG, M.canopy, c.trees.length);
      c.trees.forEach((t, i) => {
        const th = (t.park ? 3.4 : 2.6) * t.s; q.setFromAxisAngle(vY, cr() * 6.28);
        m4.compose(pv.set(t.x, 0, t.z), q, sv.set(t.s, th, t.s)); tr.setMatrixAt(i, m4);
        m4.compose(pv.set(t.x, th + 0.6 * t.s, t.z), q, sv.set(t.s * 1.25, t.s * 1.1, t.s * 1.25)); ca.setMatrixAt(i, m4);
        ca.setColorAt(i, cc.set(t.col));
      });
      tr.castShadow = ca.castShadow = true; ca.receiveShadow = true; tr.computeBoundingSphere(); ca.computeBoundingSphere();
      base.push(tr, ca); lod.push({ m: ca, hi: canopyG, lo: canopyLo }, { m: tr, hi: trunkG, lo: trunkLo });
    }
    cr = rng;
    if (c.lamps.length) {
      const po = new THREE.InstancedMesh(poleG, M.pole, c.lamps.length), he = new THREE.InstancedMesh(headG, M.lampHead, c.lamps.length), pl = new THREE.InstancedMesh(poolG, M.pool, c.lamps.length);
      c.lamps.forEach((l, i) => {
        q.setFromAxisAngle(vY, Math.atan2(l.dx, l.dz));
        m4.compose(pv.set(l.x, 0, l.z), q, one); po.setMatrixAt(i, m4); he.setMatrixAt(i, m4);
        m4.compose(pv.set(l.x + l.dx * 2.6, 0.09, l.z + l.dz * 2.6), q, one); pl.setMatrixAt(i, m4);
      });
      po.castShadow = true; pl.renderOrder = 3; po.computeBoundingSphere(); he.computeBoundingSphere(); pl.computeBoundingSphere();
      det.push(po); base.push(he, pl);
    }
    if (c.cables.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(c.cables, 3)); det.push(new THREE.LineSegments(g, M.cable)); }
    if (c.bulbs.length) {
      const bm = new THREE.InstancedMesh(bulbG, M.bulb, c.bulbs.length);
      c.bulbs.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); bm.setMatrixAt(i, m4); }); bm.computeBoundingSphere(); base.push(bm);
    }
    const grp = new THREE.Group(); if (base.length) grp.add(...base); scene.add(grp);
    const dg = new THREE.Group(); if (det.length) dg.add(...det); scene.add(dg);
    entry.m = grp; entry.det = dg; cull.push(entry); c.live = entry;
    if (view.cam) cullOne(entry, view);
    const fin = performance.now() - t0; buildMs.push(c.ms + fin); finMs.push(fin); if (buildMs.length > 60) { buildMs.shift(); finMs.shift(); }
    return true;
  }
  function dropChunk(c) {
    const e = c.live; c.live = null;
    for (const b of e.bat) b.bm.deleteGeometry(b.gid);
    for (const g of [e.m, e.det]) { scene.remove(g); for (const o of g.children) o.isInstancedMesh ? o.dispose() : o.geometry.dispose(); }
    cull.splice(cull.indexOf(e), 1);
  }
  // ---------- streaming: build the chunks around the camera, drop the ones far behind ----------
  const streamed = [...chunks.values()].filter((c) => c.ops.length || c.trees.length || c.lamps.length || c.cables.length || c.bulbs.length);
  const queue = [];
  let scanT = 0;
  const loadR = (far) => far + 60 + CH * 0.72;
  function stream(cam, far, dt) {
    const R0 = loadR(far);
    if ((scanT -= dt) <= 0) {
      scanT = 0.3; queue.length = 0;
      for (const c of streamed) {
        const d = Math.hypot(c.x - cam.x, c.z - cam.z);
        if (c.live) { if (d > R0 + 160) dropChunk(c); } else if (d < R0) queue.push({ c, d });
      }
      queue.sort((a, b) => a.d - b.d);
    }
    // nearest first, about 3 ms of it per frame; anything right around you (after a teleport) is built at once
    const until = performance.now() + 3;
    while (queue.length) {
      const { c, d } = queue[0];
      if (c.live) { queue.shift(); continue; }
      const urgent = d < 260;
      if (!buildChunk(c, urgent ? Infinity : until)) break;
      queue.shift();
      if (!urgent && performance.now() > until) break;
    }
  }
  // before the first frame: everything in view of the start point, plus an empty mesh of every kind
  // so all shaders compile on the loading screen instead of stuttering when a new kind first comes into view
  function prime(x, z, far) {
    for (const c of streamed) if (!c.live && Math.hypot(c.x - x, c.z - z) < loadR(far)) buildChunk(c);
    for (const key of ['side', 'road', 'path', 'grass', 'water', 'plaza', 'marking', 'kerb', 'bldA', 'bldB', 'glass', 'landmark', 'concrete', 'shop', 'sign', 'poiSign', 'billboard', 'pothole', 'puddle', 'prop']) pool(key, 0);
    const warm = new THREE.Group();
    for (const [g, m] of [[trunkG, M.trunk], [canopyG, M.canopy], [poleG, M.pole], [headG, M.lampHead], [poolG, M.pool], [bulbG, M.bulb]]) { const im = new THREE.InstancedMesh(g, m, 1); im.count = 0; im.frustumCulled = false; warm.add(im); }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, -99, 0, 0, -99, 0], 3)), M.cable); lines.frustumCulled = false; warm.add(lines);
    scene.add(warm);
    scanT = 0;
  }

  // ---------- traffic graph ----------
  const gNodes = [], gEdges = [], gIdx = new Map();
  const gid = (p) => { const k = nk(p); let i = gIdx.get(k); if (i === undefined) { i = gNodes.length; gIdx.set(k, i); gNodes.push({ x: p[0], z: p[1], out: [] }); } return i; };
  for (const r of driveRoads) {
    if (r.k === 'living_street') continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = gid(r.pts[i]), b = gid(r.pts[i + 1]);
      const add = (u, v) => {
        const A = gNodes[u], Bn = gNodes[v], len = Math.hypot(Bn.x - A.x, Bn.z - A.z); if (len < 0.2) return;
        const e = { a: u, b: v, ax: A.x, az: A.z, bx: Bn.x, bz: Bn.z, len, dx: (Bn.x - A.x) / len, dz: (Bn.z - A.z) / len, w: r.w, oneway: !!r.o, k: r.k, n: r.n };
        A.out.push(gEdges.length); gEdges.push(e);
      };
      if (r.o >= 0) add(a, b);
      if (r.o <= 0) add(b, a);
    }
  }
  const edgeGrid = new Grid(80);
  gEdges.forEach((e, i) => { const mx = (e.ax + e.bx) / 2, mz = (e.az + e.bz) / 2; edgeGrid.add({ i, mx, mz }, mx, mx, mz, mz); });

  // ---------- queries ----------
  // y = feet height of whoever is moving (vehicles pass none and stay on the ground)
  function collide(p, r, y = 0) {
    let hit = null;
    grid.query(p.x, p.z, r + 1, near);
    for (const it of near) {
      if (it.h <= y + 0.5 || (it.y0 || 0) >= y + 1.8) continue;
      let nx, nz, depth;
      if (it.type === 'poly') {
        if (p.x < it.x1 - r || p.x > it.x2 + r || p.z < it.z1 - r || p.z > it.z2 + r) continue;
        const ins = pip(p.x, p.z, it.pts);
        let bd = Infinity, bx = 0, bz = 0;
        for (let i = 0, j = it.pts.length - 1; i < it.pts.length; j = i++) {
          const d = segDist(p.x, p.z, it.pts[j][0], it.pts[j][1], it.pts[i][0], it.pts[i][1]);
          if (d.d < bd) { bd = d.d; bx = d.cx; bz = d.cz; }
        }
        if (!ins && bd >= r) continue;
        const dx = p.x - bx, dz = p.z - bz, d = Math.hypot(dx, dz) || 1e-6;
        if (ins) { nx = -dx / d; nz = -dz / d; depth = d + r; } else { nx = dx / d; nz = dz / d; depth = r - d; }
      } else {
        const dx = p.x - it.x, dz = p.z - it.z, d = Math.hypot(dx, dz), rr = r + it.r;
        if (d >= rr || d < 1e-6) continue;
        nx = dx / d; nz = dz / d; depth = rr - d;
      }
      p.x += nx * depth; p.z += nz * depth;
      if (!hit || depth > hit.depth) hit = { nx, nz, depth, tag: it.tag, item: it };
    }
    p.x = clamp(p.x, BOUNDS.x1, BOUNDS.x2); p.z = clamp(p.z, BOUNDS.z1, BOUNDS.z2);
    return hit;
  }
  // highest surface you could be standing on at (x,z) given your feet height y
  function groundAt(x, z, y) {
    grid.query(x, z, 0.4, near);
    let g = 0;
    for (const it of near) {
      if (it.h > y + 0.5 || it.h <= g || it.tag === 'tree' || it.tag === 'pole' || it.tag === 'pillar') continue;
      if (it.type === 'poly' ? (x >= it.x1 && x <= it.x2 && z >= it.z1 && z <= it.z2 && pip(x, z, it.pts)) : Math.hypot(x - it.x, z - it.z) < it.r) g = it.h;
    }
    return g;
  }
  function inside(it, x, z) { return it.type === 'poly' ? pip(x, z, it.pts) : Math.hypot(x - it.x, z - it.z) < it.r; }
  function solidAt(x, z, y) {
    grid.query(x, z, 0.5, near);
    for (const it of near) {
      if (it.h < y || (it.tag !== 'building' && it.tag !== 'landmark')) continue;
      if (it.type === 'poly' ? pip(x, z, it.pts) : Math.hypot(x - it.x, z - it.z) < it.r + 0.4) return true;
    }
    return false;
  }
  function surfaceAt(x, z) { return inPark(x, z) && !nearestRoad(x, z, 8, (r) => r.drive && segDistOk(x, z, r)) ? 'grass' : 'road'; }
  function segDistOk() { return true; }
  let lastZone = ZONES.central, zx = 1e9, zz = 1e9;
  function zoneAt(x, z) {
    if (Math.abs(x - zx) < 4 && Math.abs(z - zz) < 4) return lastZone;
    zx = x; zz = z;
    let zn = null;
    if (stadium && Math.hypot(x - stadium.x, z - stadium.z) < stadium.r + 12) zn = ZONES.stadium;
    else if (vidhana && Math.hypot(x - vidhana.x, z - vidhana.z) < 95) zn = ZONES.vidhana;
    else if (ubc && Math.hypot(x - ubc.x, z - ubc.z) < 90) zn = ZONES.ubc;
    else {
      const nr = nearestRoad(x, z, 30, (r) => !!r.n && (r.drive || r.k === 'pedestrian'));
      if (nr && Math.hypot(nr.x - x, nr.z - z) < nr.r.hw + 7) zn = ZONES[nr.r.n] || (ZONES[nr.r.n] = { name: nr.r.n, kn: KN[nr.r.n] || '' });
      else if (cubbon && pip(x, z, cubbon.pts)) zn = ZONES.cubbon;
    }
    return (lastZone = zn || ZONES.central);
  }

  const offLamp = new THREE.Color('#5a5a5a'), onLamp = new THREE.Color(3.2, 2.6, 1.8);
  let cullT = 0;
  const view = { cam: null, far: 0, detR: 0, lodR: 0 };
  function update(env) {
    const Lt = env.lights, wet = env.wet;
    // most homes go dark after midnight; offices go dark late evening
    const h = env.hours ?? 20, late = h > 0.5 && h < 5 ? 0.4 : 1, office = h > 22 || h < 6 ? 0.45 : 1;
    M.bldA.emissiveIntensity = Lt * 1.1 * late; M.bldB.emissiveIntensity = Lt * 1.0 * office; M.glass.emissiveIntensity = Lt * 0.9 * office;
    M.landmark.emissiveIntensity = Lt * 0.22; if (M.inscription) M.inscription.emissiveIntensity = Lt * 0.35;
    M.shop.emissiveIntensity = 0.06 + Lt * 0.9;
    M.sign.emissiveIntensity = M.poiSign.emissiveIntensity = 0.12 + Lt * 0.75;
    M.billboard.emissiveIntensity = 0.12 + Lt * 0.9;
    M.lampHead.color.copy(offLamp).lerp(onLamp, Lt);
    M.pool.opacity = Lt * (0.28 + wet * 0.2);
    M.bulb.color.setRGB(0.5 + Lt * 2.2, 0.4 + Lt * 1.6, 0.2 + Lt * 0.7);
    M.flood.color.setScalar(0.5 + Lt * 2.6);
    if (M.fieldPool) { M.fieldPool.opacity = Lt * 0.45; M.haze.opacity = Lt * 0.08 * (1 + wet * 0.6); }
    M.redLight.color.setRGB(Math.sin(env.time * 3) > 0.3 ? 4 : 0.3, 0.05, 0.05);
    M.puddle.opacity = wet * 0.92;
    for (const m of M.wetTargets) { m.roughness = m.userData.baseRough * (1 - wet * 0.65); m.color.copy(m.userData.baseColor).multiplyScalar(1 - wet * 0.35); }
    if (env.cam) {
      stream(env.cam, env.far, env.dt || 0.016);
      // the ground plane follows you in whole texture tiles (9 m), so the pattern never slides
      ground.position.set(Math.round(env.cam.x / 9) * 9, 0, Math.round(env.cam.z / 9) * 9);
    }
    cullT -= env.dt || 0.016;
    if (cullT <= 0 && env.cam) {
      cullT = 0.25;
      view.cam = env.cam; view.far = env.far + 60; view.detR = env.detail || 230; view.lodR = env.lod || 170;
      for (const c of cull) cullOne(c, view);
    }
  }
  function cullOne(c, v) {
    const d = Math.hypot(c.x - v.cam.x, c.z - v.cam.z);
    const vis = d < v.far + c.r, dvis = d < v.detR + c.r;
    c.m.visible = vis;
    if (c.det) c.det.visible = dvis;
    if (c.bat) for (const b of c.bat) { const on = b.det ? dvis : vis; if (on !== b.vis) { b.vis = on; b.bm.setVisibleAt(b.id, on); } }
    if (c.lod) { const isFar = d > v.lodR + c.r * 0.5; if (isFar !== c.far) { c.far = isFar; for (const l of c.lod) l.m.geometry = isFar ? l.lo : l.hi; } }
  }

  return {
    items: (x, z, r, out) => grid.query(x, z, r, out), prime,
    get streamInfo() { return { live: streamed.filter((c) => c.live).length, total: streamed.length, queued: queue.length, buildMs, finMs }; },
    collide, solidAt, surfaceAt, zoneAt, update, nearestRoad, insideBuilding, addPoly, addCircle, segGrid, nodes, junctionR, groundAt, inside, ladders, vidhanaTop,
    potholes, buildings, roads, parks, cubbon, vidhana, stadium, ubc, stations: kiosks, doors, vendors, benches, tracks,
    graph: { nodes: gNodes, edges: gEdges, grid: edgeGrid }, materials: M, bounds: BOUNDS,
  };
}
