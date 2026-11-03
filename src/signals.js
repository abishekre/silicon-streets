import * as THREE from 'three';
import { box, merge, part, makeRng } from './util.js';
import { createCharacter } from './people.js';

const MAJOR = new Set(['primary', 'secondary', 'trunk']);
const GREEN = 13, AMBER = 3, ALLRED = 1.5, CYCLE = (GREEN + AMBER + ALLRED) * 2;

// Traffic signals at big junctions on the real road graph, and a few traffic police at the busiest ones.
export function createSignals(scene, world) {
  const rng = makeRng(8);
  const { nodes, edges } = world.graph;
  const B = world.bounds;
  const inEdges = nodes.map(() => []);
  edges.forEach((e, i) => inEdges[e.b].push(i));
  const list = [];
  nodes.forEach((n, ni) => {
    if (n.x < B.x1 + 80 || n.x > B.x2 - 80 || n.z < B.z1 + 80 || n.z > B.z2 - 80) return;
    const ins = inEdges[ni].map((i) => edges[i]).filter((e) => e.len > 8);
    const majors = ins.filter((e) => MAJOR.has(e.k));
    if (ins.length < 3 || Math.max(...ins.map((e) => e.w)) < 7) return;
    // skip clusters: one signal per ~60 m
    if (list.some((s) => Math.hypot(s.x - n.x, s.z - n.z) < 60)) return;
    const main = majors[0] || ins.reduce((a, b) => (b.w > a.w ? b : a)); const axis = Math.atan2(main.dx, main.dz);
    const w = Math.max(...ins.map((e) => e.w));
    list.push({ ni, x: n.x, z: n.z, axis, r: w / 2 + 3, ins, offset: rng() * CYCLE });
  });

  // which approach group a heading belongs to: along the main axis (0) or across it (1)
  const group = (s, hd) => { const d = Math.abs(Math.atan2(Math.sin(2 * (hd - s.axis)), Math.cos(2 * (hd - s.axis)))) / 2; return d < Math.PI / 4 ? 0 : 1; };
  let t = 0;
  const phaseOf = (s) => {
    const c = ((t + s.offset) % CYCLE + CYCLE) % CYCLE, half = GREEN + AMBER + ALLRED;
    const g = c < half ? 0 : 1, k = c % half;
    return { g, light: k < GREEN ? 'green' : k < GREEN + AMBER ? 'amber' : 'red' };
  };
  for (const s of list) {
    s.signal = { canGo: (hd) => { const p = phaseOf(s); return group(s, hd) === p.g && p.light === 'green'; } };
    nodes[s.ni].signal = s.signal;
  }

  // poles + lamp heads at the kerb before each approach
  const poleParts = [], lamps = [];
  const vY = new THREE.Vector3(0, 1, 0);
  for (const s of list) for (const e of s.ins) {
    const back = s.r + 1.5, lat = e.w / 2 + 0.8;
    const x = s.x - e.dx * back + e.dz * lat, z = s.z - e.dz * back - e.dx * lat;
    if (world.insideBuilding(x, z, 0.3)) continue;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(vY, Math.atan2(-e.dx, -e.dz)), new THREE.Vector3(1, 1, 1));
    const g = merge([part(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 6).translate(0, 1.7, 0), '#2b2b2b'), box(0.38, 1.05, 0.28, 0, 3.6, 0, '#1a1a1a'),
      box(0.03, 3.4, 0.03, 0, 1.7, 0.09, '#f2c230')]);
    g.applyMatrix4(m); poleParts.push(g);
    for (let k = 0; k < 3; k++) lamps.push({ s, e, k, pos: new THREE.Vector3(0, 3.95 - k * 0.32, 0.15).applyMatrix4(m), hd: Math.atan2(e.dx, e.dz) });
  }
  if (poleParts.length) { const pm = new THREE.Mesh(merge(poleParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })); pm.castShadow = true; scene.add(pm); }
  const lampMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial(), Math.max(1, lamps.length));
  const m4 = new THREE.Matrix4();
  lamps.forEach((l, i) => { m4.makeTranslation(l.pos.x, l.pos.y, l.pos.z); lampMesh.setMatrixAt(i, m4); lampMesh.setColorAt(i, new THREE.Color(0.1, 0.1, 0.1)); });
  lampMesh.count = lamps.length; scene.add(lampMesh);

  // traffic police at the busiest junctions, on a little umbrella podium
  const cops = [];
  const busiest = [...list].sort((a, b) => b.ins.length - a.ins.length).slice(0, 6);
  for (const s of busiest) {
    const pod = merge([part(new THREE.CylinderGeometry(0.7, 0.8, 0.35, 12).translate(0, 0.17, 0), '#f2c230'), part(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5).translate(0.5, 1.5, 0), '#777'),
      part(new THREE.ConeGeometry(1.1, 0.45, 10).translate(0.5, 2.8, 0), '#e53935')]);
    const pm = new THREE.Mesh(pod, new THREE.MeshStandardMaterial({ vertexColors: true })); pm.position.set(s.x, 0, s.z); pm.castShadow = true; scene.add(pm);
    const ch = createCharacter(scene, { shirt: '#f5f5f5', pants: '#1f2a44', skin: '#7a4b2f' });
    ch.root.position.set(s.x, 0.35, s.z);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.08, 10), new THREE.MeshStandardMaterial({ color: '#f5f5f5' })); cap.position.y = 1.8; ch.root.add(cap);
    s.cop = ch; cops.push(s);
    world.addPoly([[s.x - 0.8, s.z - 0.8], [s.x + 0.8, s.z - 0.8], [s.x + 0.8, s.z + 0.8], [s.x - 0.8, s.z + 0.8]], 3, 'prop');
  }

  const RED = new THREE.Color(3, 0.15, 0.1), AMB = new THREE.Color(3, 1.8, 0.1), GRN = new THREE.Color(0.2, 3, 0.6), OFF = new THREE.Color(0.08, 0.08, 0.08), c = new THREE.Color();
  let lampT = 0;
  const last = new Map();
  function update(dt, player, ui, wallet) {
    t += dt; lampT -= dt;
    if (lampT <= 0) {
      lampT = 0.2;
      lamps.forEach((l, i) => {
        const p = phaseOf(l.s), mine = group(l.s, l.hd) === p.g;
        const want = !mine ? 'red' : p.light;
        c.copy(l.k === 0 ? (want === 'red' ? RED : OFF) : l.k === 1 ? (want === 'amber' ? AMB : OFF) : (want === 'green' ? GRN : OFF));
        lampMesh.setColorAt(i, c);
      });
      if (lampMesh.instanceColor) lampMesh.instanceColor.needsUpdate = true;
    }
    // cops turn to wave the moving direction through
    for (const s of cops) {
      const p = phaseOf(s); s.cop.root.rotation.y = s.axis + (p.g ? Math.PI / 2 : 0);
      s.cop.parts.armR.rotation.z = -1.4; s.cop.parts.armR.rotation.x = Math.sin(t * 4) * 0.6;
      s.cop.parts.armL.rotation.x = 0;
    }
    // did the player run a red?
    if (!player) return;
    for (const s of list) {
      const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
      const inside = d < s.r, was = last.get(s) || false;
      if (inside && !was && Math.abs(player.speed) > 5) {
        const hd = Math.atan2(player.vel.x, player.vel.y);
        if (!s.signal.canGo(hd)) {
          const copNear = cops.some((k) => Math.hypot(k.x - s.x, k.z - s.z) < 5);
          if (copNear) { wallet.money = Math.max(0, wallet.money - 100); ui.toast('👮 ₹100 fine', 'Traffic police: "Signal jump, saar! Next time licence seize."'); }
          else ui.toast('🚦 You jumped a red', 'Nobody saw. This time.');
        }
      }
      last.set(s, inside);
    }
  }
  return { update, list };
}
