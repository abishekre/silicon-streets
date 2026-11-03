import * as THREE from 'three';
import { createCharacter } from './people.js';
import { box, merge } from './util.js';

// City events on top of the daily routine (src/life.js has match nights, Sunday Cubbon and Deepavali):
// - processions: a Ganesha float, a wedding baraat or a political rally walks down a main road at 1 m/s with drums
//   and dancers. Traffic queues behind it for real (it is a blocker in the simulation). Dance along for cash.
// - Rajyotsava (all of November): red and yellow Karnataka flags on the lamp posts.
const KINDS = {
  ganesha: { title: 'Ganesha procession', float: ['#ff8f00', '#ffd54f', '#e65100'], lines: ['Dhol, thamate and fireworks. Traffic has accepted its fate.', '"Ganapati Bappa Morya!" The whole street joins in.', 'A man on a scooter waits patiently. For 40 minutes.'] },
  baraat: { title: 'Wedding baraat', float: ['#f5f5f5', '#f48fb1', '#c2185b'], lines: ['The band plays the same song for the eleventh time.', 'The groom\'s uncle dances like nobody is watching. Everybody is watching.', 'The horse looks at the traffic jam with deep judgement.'] },
  rally: { title: 'Political rally', float: ['#1565c0', '#ffffff', '#2e7d32'], lines: ['Loudspeaker: "Vote for the Swalpa Adjust Party! Free WiFi on every pothole!"', 'Somebody hands you a cap, a flag and ₹0.', 'The candidate promises a metro to your house. Again.'] },
};
const SHIRTS = ['#ff7043', '#fdd835', '#e53935', '#8e24aa', '#43a047', '#1e88e5', '#ffffff', '#f06292'];
const SKIN = ['#8d5a3b', '#a8714a', '#6e4429'];

export function createEvents({ scene, world, ui, audio, game, state }) {
  const G = world.graph, MAJOR = /primary|secondary|tertiary|trunk/;
  let P = null, nextT = 0.6, joined = null; // the current procession; in-game hours until the next one
  const W$ = game.wallet;

  // the float: a decorated flatbed with marigold garlands and a canopy
  function floatMesh(cols) {
    const [a, b, c] = cols, g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, emissive: '#ffb74d', emissiveIntensity: 0.15 });
    const parts = [box(2.4, 1, 5, 0, 0.7, 0, '#3e2723'), box(2.2, 0.15, 4.8, 0, 1.25, 0, b), box(1.4, 2.2, 1.4, 0, 2.4, 0.8, a), box(1.8, 0.3, 1.8, 0, 3.6, 0.8, c),
      box(0.12, 2.6, 0.12, -1.05, 2.5, -2.3, '#795548'), box(0.12, 2.6, 0.12, 1.05, 2.5, -2.3, '#795548'), box(2.4, 0.12, 5, 0, 3.85, -0.2, c)];
    for (let i = 0; i < 9; i++) parts.push(box(0.22, 0.22, 0.22, -1.1 + (i % 2) * 2.2, 1.35, -2.2 + i * 0.55, '#ff9800'));
    g.add(new THREE.Mesh(merge(parts), mat));
    return g;
  }
  // a road from a node, as straight as possible, about `len` metres
  function routeFrom(e0, len) {
    const pts = [[G.edges[e0].ax, G.edges[e0].az]]; let e = G.edges[e0], L = 0, guard = 0;
    while (L < len && guard++ < 60) {
      pts.push([e.bx, e.bz]); L += e.len;
      const outs = G.nodes[e.b].out.map((i) => G.edges[i]).filter((o) => o.b !== e.a);
      if (!outs.length) break;
      e = outs.sort((p, q) => (q.dx * e.dx + q.dz * e.dz) - (p.dx * e.dx + p.dz * e.dz))[0];
    }
    return pts;
  }
  function start(focus) {
    const near = [];
    G.grid.query(focus.x, focus.z, 500, near);
    const cands = near.map((n) => n.i).filter((i) => { const e = G.edges[i], d = Math.hypot(e.ax - focus.x, e.az - focus.z); return MAJOR.test(e.k) && !e.l && d > 150 && d < 450 && world.inMap(e.ax, e.az, 100); });
    if (!cands.length) return;
    const e0 = cands[Math.floor(Math.random() * cands.length)], kind = Object.keys(KINDS)[Math.floor(Math.random() * 3)], K = KINDS[kind];
    const path = routeFrom(e0, 500); if (path.length < 3) return;
    const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    const fl = floatMesh(K.float); scene.add(fl);
    const crowd = [];
    for (let i = 0; i < 14; i++) {
      const ch = createCharacter(scene, { shirt: SHIRTS[i % SHIRTS.length], skin: SKIN[i % 3] });
      crowd.push({ ch, back: 3 + (i >> 1) * 1.6 + Math.random(), side: (i % 2 ? 1 : -1) * (0.6 + Math.random() * 1.6), ph: Math.random() * 6 });
    }
    P = { kind, K, path, cum, L: cum[cum.length - 1], s: 0, fl, crowd, drumT: 0, lineT: 4, road: G.edges[e0].n || (world.nearestRoad(path[1][0], path[1][1], 40, (r) => !!r.n) || { r: { n: 'the main road' } }).r.n, x: path[0][0], z: path[0][1] };
    ui.toast(K.title, `On ${P.road}: traffic is going nowhere for a while. Walk up and dance along for cash.`, kind === 'rally' ? 'flag' : 'music');
  }
  function poseAt(s) {
    const { path, cum } = P; let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const a = path[i - 1], b = path[i], l = (cum[i] - cum[i - 1]) || 1, k = Math.max(0, Math.min(1, (s - cum[i - 1]) / l));
    return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l };
  }
  function end() {
    scene.remove(P.fl); for (const c of P.crowd) scene.remove(c.ch.root);
    if (joined) { ui.toast('The procession broke up', 'Everyone went home. Your feet hurt.', 'music'); joined = null; }
    P = null;
  }

  // ---------- Rajyotsava: red and yellow flags on the lamp posts all of November ----------
  let flags = null;
  if (new Date().getMonth() === 10 && world.lamps && world.lamps.length) {
    const pick = world.lamps.filter((l, i) => i % 2 === 0);
    const geo = merge([box(0.9, 0.3, 0.02, 0.5, 5.25, 0, '#fdd835'), box(0.9, 0.3, 0.02, 0.5, 4.95, 0, '#d32f2f')]);
    flags = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), pick.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    pick.forEach((l, i) => { q.setFromAxisAngle(up, Math.atan2(l.dx, l.dz) + Math.PI / 2); flags.setMatrixAt(i, m.compose(v.set(l.x, 0, l.z), q, one)); });
    flags.computeBoundingSphere(); scene.add(flags);
  }

  let lastH = state.hours;
  function update(dt, t, focus) {
    let dh = state.hours - lastH; if (dh < 0) dh += 24; lastH = state.hours;
    if (!P) {
      if (state.hours > 9 && state.hours < 22 && state.mode !== 'interior' && (nextT -= dh) <= 0) { nextT = 1.5 + Math.random() * 2; start(focus); }
    } else {
      P.s += dt * 1.1;
      if (P.s > P.L || Math.hypot(P.x - focus.x, P.z - focus.z) > 900) { end(); return; }
      const h = poseAt(P.s), yaw = Math.atan2(h.dx, h.dz); P.x = h.x; P.z = h.z;
      P.fl.position.set(h.x, 0, h.z); P.fl.rotation.y = yaw;
      for (const c of P.crowd) {
        const b = poseAt(Math.max(0, P.s - c.back)), bounce = Math.abs(Math.sin(t * 5 + c.ph));
        c.ch.root.position.set(b.x + b.dz * c.side, bounce * 0.25, b.z - b.dx * c.side);
        c.ch.root.rotation.y = yaw + Math.sin(t * 2 + c.ph) * 1.2; c.ch.animate(dt, 2.2);
        c.ch.parts.armR && (c.ch.parts.armR.rotation.z = -1.2 - bounce * 1.2); c.ch.parts.armL && (c.ch.parts.armL.rotation.z = 1.2 + bounce * 1.2);
      }
      const d = Math.hypot(h.x - focus.x, h.z - focus.z);
      if ((P.drumT -= dt) <= 0) { P.drumT = 0.32; if (d < 260) audio.drum && audio.drum(Math.max(0.05, 1 - d / 260)); }
      if (d < 60 && (P.lineT -= dt) <= 0) { P.lineT = 14; ui.dialogue(P.K.lines[Math.floor(Math.random() * P.K.lines.length)]); }
      // dancing along: stay close for 20 s
      if (joined) {
        const w = state.mode === 'walk' ? focus : null;
        if (!w || Math.hypot(w.x - h.x, w.z - h.z) > 14) { ui.toast('You left the procession', 'No pay for half a dance.', 'warning'); joined = null; }
        else if ((joined.t -= dt) <= 0) { const pay = P.kind === 'rally' ? 1500 : 1200; W$.earn(pay, `Danced in the ${P.K.title.toLowerCase()}`); audio.cash && audio.cash(); ui.toast(`${P.K.title}: ₹${pay}`, P.kind === 'rally' ? 'The party paid you to cheer. You do not know which party.' : 'Best dancer of the evening. An aunty gives you a sweet and cash.', 'cash'); joined = null; }
      }
    }
  }
  function action(w) {
    if (!P || joined) return null;
    const d = Math.hypot(w.x - P.x, w.z - P.z);
    return d < 10 ? { d, label: `dance in the ${P.K.title.toLowerCase()}`, run: () => { joined = { t: 20 }; ui.dialogue('You join in. The dhol gets louder. Your dignity gets quieter.'); } } : null;
  }
  game.addAction((w) => action(w));
  return {
    update,
    // traffic queues behind the float and the crowd
    get blockers() { if (!P) return []; const b = poseAt(Math.max(0, P.s - 6)); return [{ x: P.x, z: P.z, speed: 0, r: 4 }, { x: b.x, z: b.z, speed: 0, r: 4 }]; },
    markers: () => (P ? [{ x: P.x, z: P.z, c: '#ff9800', icon: '!', big: true }] : []),
    get active() { return P && { kind: P.kind, road: P.road, x: P.x, z: P.z }; },
  };
}
