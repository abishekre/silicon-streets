import * as THREE from 'three';
import { segDist } from './geom.js';

// A* for traffic: route(fromEdge, toNode, out, cost) fills `out` with the edges to drive after fromEdge.
// Driving only (one-ways respected), no U-turn at the first node. Arrays are reused between calls.
export function createRouter(graph, maxIter = 5000) {
  const { nodes, edges } = graph, N = nodes.length;
  const g = new Float64Array(N), cameE = new Int32Array(N), seen = new Uint32Array(N), shut = new Uint32Array(N);
  const hf = [], hn = [];
  let gen = 0;
  const push = (n, f) => {
    let i = hf.length; hf.push(f); hn.push(n);
    while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hn[i] = hn[p]; i = p; }
    hf[i] = f; hn[i] = n;
  };
  const pop = () => {
    const top = hn[0], lf = hf.pop(), ln = hn.pop(), L = hf.length;
    if (L) {
      let i = 0;
      for (;;) { const l = i * 2 + 1, r = l + 1; let m = -1, mf = lf; if (l < L && hf[l] < mf) { m = l; mf = hf[l]; } if (r < L && hf[r] < mf) m = r; if (m < 0) break; hf[i] = hf[m]; hn[i] = hn[m]; i = m; }
      hf[i] = lf; hn[i] = ln;
    }
    return top;
  };
  return function route(fromEdge, goal, out, cost) {
    out.length = 0;
    const e0 = edges[fromEdge], start = e0.b;
    if (start === goal) return true;
    gen++; hf.length = hn.length = 0;
    const gx = nodes[goal].x, gz = nodes[goal].z;
    g[start] = 0; seen[start] = gen; cameE[start] = -1; push(start, Math.hypot(nodes[start].x - gx, nodes[start].z - gz));
    let iter = 0, found = false;
    while (hf.length && iter++ < maxIter) {
      const n = pop(); if (shut[n] === gen) continue; shut[n] = gen;
      if (n === goal) { found = true; break; }
      for (const ei of nodes[n].out) {
        const e = edges[ei], to = e.b;
        if (n === start && to === e0.a && nodes[n].out.length > 1) continue;
        const k = cost ? cost(e, ei) : 1; if (k === Infinity) continue;
        const ng = g[n] + e.len * k;
        if (seen[to] !== gen || ng < g[to]) { seen[to] = gen; g[to] = ng; cameE[to] = ei; push(to, ng + Math.hypot(nodes[to].x - gx, nodes[to].z - gz)); }
      }
    }
    if (!found) return false;
    for (let n = goal; n !== start; n = edges[cameE[n]].a) out.push(cameE[n]);
    out.reverse();
    return true;
  };
}

// Road-network navigation: A* over the OSM graph, glowing arrows on the road, turn-by-turn text.
export function createNav(scene, world) {
  const { nodes, edges, grid } = world.graph;
  const inEdges = nodes.map(() => []);
  edges.forEach((e, i) => inEdges[e.b].push(i));

  const cand = [];
  function snap(x, z) {
    grid.query(x, z, 120, cand);
    let best = null;
    for (const c of cand) {
      const e = edges[c.i], d = segDist(x, z, e.ax, e.az, e.bx, e.bz);
      if (!best || d.d < best.d) best = { d: d.d, e, px: d.cx, pz: d.cz, t: d.t };
    }
    return best;
  }

  // binary-heap A*; walking may use one-way streets in both directions
  function astar(start, goal, walk) {
    const N = nodes.length, g = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), cameE = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [], push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
    const gx = nodes[goal].x, gz = nodes[goal].z, h = (n) => Math.hypot(nodes[n].x - gx, nodes[n].z - gz);
    g[start] = 0; push(start, h(start));
    let iter = 0;
    while (heap.length && iter++ < 60000) {
      const n = pop(); if (closed[n]) continue; closed[n] = 1;
      if (n === goal) break;
      const relax = (ei, to) => {
        const e = edges[ei], cost = e.len * (e.k === 'residential' || e.k === 'living_street' ? 1.25 : 1);
        const ng = g[n] + cost;
        if (ng < g[to]) { g[to] = ng; came[to] = n; cameE[to] = ei; push(to, ng + h(to)); }
      };
      for (const ei of nodes[n].out) relax(ei, edges[ei].b);
      if (walk) for (const ei of inEdges[n]) relax(ei, edges[ei].a);
    }
    if (came[goal] < 0 && start !== goal) return null;
    const path = [], via = [];
    for (let n = goal; n !== -1; n = came[n]) { path.push(n); via.push(cameE[n]); if (n === start) break; }
    return { nodes: path.reverse(), edges: via.reverse().slice(1) };
  }

  const R = { target: null, pts: null, names: null, cum: null, L: 0, progress: 0, mode: 'drive', recheck: 0, arrived: false };
  function plan(from, mode) {
    const a = snap(from.x, from.z), b = snap(R.target.x, R.target.z);
    if (!a || !b) { R.pts = null; return; }
    const walk = mode !== 'drive';
    const sNode = walk || a.t > 0.5 ? a.e.b : a.e.b, gNode = b.t < 0.5 ? b.e.a : b.e.b;
    const res = astar(sNode, gNode, walk) || (walk ? null : astar(sNode, gNode, true));
    if (!res) { R.pts = null; return; }
    const pts = [[a.px, a.pz]], names = [a.e.n || ''];
    res.nodes.forEach((n, i) => { pts.push([nodes[n].x, nodes[n].z]); names.push(i < res.edges.length && res.edges[i] >= 0 ? edges[res.edges[i]].n || '' : b.e.n || ''); });
    pts.push([b.px, b.pz]); names.push(b.e.n || '');
    R.pts = pts; R.names = names;
    R.cum = [0]; for (let i = 1; i < pts.length; i++) R.cum.push(R.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    R.L = R.cum[R.cum.length - 1]; R.progress = 0; R.mode = mode;
  }
  function setTarget(t, from, mode = 'drive') { R.target = t; R.arrived = false; plan(from, mode); }
  function clear() { R.target = null; R.pts = null; arrows.count = 0; }

  // arrows painted on the road
  const shape = new THREE.Shape(); shape.moveTo(0, 0.9); shape.lineTo(0.9, -0.3); shape.lineTo(0.45, -0.3); shape.lineTo(0, 0.25); shape.lineTo(-0.45, -0.3); shape.lineTo(-0.9, -0.3); shape.closePath();
  const ag = new THREE.ShapeGeometry(shape); ag.rotateX(-Math.PI / 2); ag.rotateY(Math.PI); ag.scale(1.7, 1, 1.9);
  const amat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.1, 2.2), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  const MAXA = 48;
  const arrows = new THREE.InstancedMesh(ag, amat, MAXA); arrows.count = 0; arrows.frustumCulled = false; arrows.renderOrder = 4; scene.add(arrows);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sc = new THREE.Vector3();

  function at(s) {
    let i = 1; while (i < R.cum.length - 1 && R.cum[i] < s) i++;
    const a = R.pts[i - 1], b = R.pts[i], t = (s - R.cum[i - 1]) / ((R.cum[i] - R.cum[i - 1]) || 1);
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]), i };
  }
  function nextTurn() {
    // first vertex ahead where the heading changes noticeably
    let i = 1; while (i < R.cum.length - 1 && R.cum[i] <= R.progress + 1) i++;
    for (; i < R.pts.length - 1; i++) {
      const a = R.pts[i - 1], b = R.pts[i], c = R.pts[i + 1];
      const h1 = Math.atan2(b[0] - a[0], b[1] - a[1]), h2 = Math.atan2(c[0] - b[0], c[1] - b[1]);
      const d = Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));
      if (Math.abs(d) > 0.6 && R.cum[i + 1] - R.cum[i] > 6) return { dist: R.cum[i] - R.progress, dir: d < 0 ? 'right' : 'left', sharp: Math.abs(d) > 2.2, road: R.names[i + 1] || R.names[i] };
    }
    return { dist: R.L - R.progress, dir: 'arrive' };
  }

  let t = 0;
  function update(dt, pos, mode) {
    t += dt;
    if (!R.target) return null;
    if (!R.pts) { R.recheck -= dt; if (R.recheck <= 0) { R.recheck = 1; plan(pos, mode); } return { lost: true }; }
    // project onto route; only allow forward progress (so loops don't jump back)
    let best = Infinity, bs = R.progress;
    for (let i = 1; i < R.pts.length; i++) {
      if (R.cum[i] < R.progress - 20) continue;
      if (R.cum[i - 1] > R.progress + 120) break;
      const d = segDist(pos.x, pos.z, R.pts[i - 1][0], R.pts[i - 1][1], R.pts[i][0], R.pts[i][1]);
      if (d.d < best) { best = d.d; bs = R.cum[i - 1] + d.t * (R.cum[i] - R.cum[i - 1]); }
    }
    R.progress = Math.max(R.progress, bs);
    R.recheck -= dt;
    if ((best > 24 || mode !== R.mode) && R.recheck <= 0) { R.recheck = 1.2; plan(pos, mode); return { rerouting: true }; }
    const left = R.L - R.progress;
    const direct = Math.hypot(R.target.x - pos.x, R.target.z - pos.z);
    if (direct < 12 || left < 6) { const name = R.target.name; if (!R.target.keep) clear(); return { arrived: true, name }; }
    // arrows: from 6 m ahead up to ~150 m, closer spacing near you
    let n = 0;
    for (let s = R.progress + 6; s < Math.min(R.L, R.progress + 150) && n < MAXA; s += (s - R.progress) < 40 ? 4.5 : 7) {
      const p = at(s);
      const pulse = 1 + 0.12 * Math.sin(t * 6 - s * 0.3);
      q.setFromAxisAngle(up, p.yaw); m4.compose(pv.set(p.x, 0.13, p.z), q, sc.set(pulse, 1, pulse));
      arrows.setMatrixAt(n++, m4);
    }
    arrows.count = n; arrows.instanceMatrix.needsUpdate = true;
    amat.opacity = mode === 'drive' ? 0.85 : 0.6;
    const turn = nextTurn();
    const speed = mode === 'drive' ? 9 : 1.6;
    return { turn, left, eta: left / speed / 60, name: R.target.name };
  }

  return { setTarget, clear, update, get route() { return R.pts ? { pts: R.pts, progress: R.progress, cum: R.cum } : null; }, get target() { return R.target; } };
}
