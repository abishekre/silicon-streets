// Measuring tools for the F3 overlay and the benchmark: which GPU the browser is using, GPU time per render pass,
// and a scripted drive that reports average fps, 1% lows and the worst frame.

// the GPU the browser actually renders on (laptops often run the browser on the integrated one)
export function gpuInfo(renderer) {
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  // "ANGLE (Intel, Intel(R) UHD Graphics (0x00009B41) Direct3D11 ...)" -> "Intel(R) UHD Graphics"
  const name = String(raw).replace(/^ANGLE \([^,]*, /, '').replace(/ \(0x[0-9a-f]+\).*$/i, '').replace(/ (Direct3D|vs_|OpenGL|Metal).*$/, '').replace(/,.*$/, '').replace(/\)$/, '').trim();
  const integrated = /intel|uhd|iris|radeon\(tm\) graphics|amd radeon graphics|vega \d|mali|adreno|powervr|apple/i.test(name) && !/arc a|radeon rx|nvidia|geforce|rtx|gtx/i.test(name);
  return { name, raw, integrated };
}

// GPU time per pass, from EXT_disjoint_timer_query_webgl2. Queries resolve a frame or two later, so results are smoothed.
export function createGpuTimer(renderer) {
  const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const ms = {}, frame = {};
  if (!ext) return { ok: false, ms, begin() {}, end() {}, current: () => null, frameEnd() {}, poll() {} };
  const free = [], pending = [];
  let cur = null;
  function begin(label) {
    if (cur) end();
    const q = free.pop() || gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q); cur = { q, label };
  }
  function end() { if (!cur) return; gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(cur); cur = null; }
  function frameEnd() { end(); pending.push({ mark: true }); if (pending.length > 400) pending.splice(0, pending.length - 400); }
  function poll() {
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    while (pending.length) {
      const p = pending[0];
      if (p.mark) {
        pending.shift(); let total = 0;
        for (const k in frame) { ms[k] = (ms[k] ?? frame[k]) * 0.9 + frame[k] * 0.1; total += frame[k]; frame[k] = 0; }
        ms.total = (ms.total ?? total) * 0.9 + total * 0.1;
        continue;
      }
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
      pending.shift();
      if (!disjoint) frame[p.label] = (frame[p.label] || 0) + gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6;
      free.push(p.q);
    }
  }
  return { ok: true, ms, begin, end, current: () => cur && cur.label, frameEnd, poll };
}

// time every composer pass, and split the shadow map out of the scene pass it happens inside
export function instrumentPasses(renderer, composer, timer, enabled) {
  const label = (p) => p.constructor.name.replace(/Pass$/, '').replace(/^Render$/, 'scene').replace(/^GTAO$/, 'ao').replace(/^UnrealBloom$/, 'bloom').replace(/^(SMAA|Shader)$/, 'aa').toLowerCase();
  for (const p of composer.passes) {
    const orig = p.render.bind(p), name = label(p);
    p.render = (...a) => { if (!enabled()) return orig(...a); timer.begin(name); orig(...a); timer.end(); };
  }
  const sm = renderer.shadowMap, orig = sm.render.bind(sm);
  sm.render = (...a) => {
    if (!enabled() || !sm.enabled || (!sm.autoUpdate && !sm.needsUpdate)) return orig(...a);
    const outer = timer.current(); timer.begin('shadows'); orig(...a); timer.end(); if (outer) timer.begin(outer);
  };
}

// a scripted drive along a GPS route, with rain and dusk on the way: the same load every run
export function createBenchmark({ nav, game, player, actions, state, ui }) {
  let B = null;
  const SPEED = 13, LEN = 90;
  function start() {
    const p = player.pos, far = game.spots.filter((s) => Math.hypot(s.x - p.x, s.z - p.z) > 900).sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z));
    const goal = far[0] || game.spots[0];
    nav.setTarget({ ...goal, keep: true }, p, 'drive');
    const r = nav.route; if (!r || r.pts.length < 2) { ui.toast('Benchmark', 'No route found from here. Try again on a main road.', 'gauge'); return false; }
    B = { pts: r.pts.map((q) => [q[0], q[1]]), cum: r.cum.slice(), s: 0, dir: 1, t: 0, dts: [], calls: 0, tris: 0, n: 0, gpu: {}, keep: { hours: state.hours, weather: state.weather, timeSpeed: state.timeSpeed } };
    actions.setTime(11); actions.setWeather('clear'); actions.setTimeSpeed(0);
    return true;
  }
  function at(s) {
    const { pts, cum } = B; let i = 1; while (i < pts.length - 1 && cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i], k = Math.min(1, Math.max(0, (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1)));
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    // keep left, like everyone else in India
    return { x: a[0] + dx * k - dz / l * 1.8 * B.dir, z: a[1] + dz * k + dx / l * 1.8 * B.dir, yaw: Math.atan2(dx * B.dir, dz * B.dir) };
  }
  // moves your vehicle along the route; returns true while running
  function drive(dt) {
    if (!B) return false;
    B.s += SPEED * dt * B.dir; const L = B.cum[B.cum.length - 1];
    if (B.s > L - 2 || B.s < 2) { B.dir *= -1; B.s = Math.max(2, Math.min(L - 2, B.s)); }
    const q = at(B.s);
    player.pos.x = q.x; player.pos.z = q.z; player.heading = q.yaw; player.speed = SPEED;
    player.vel.set(Math.sin(q.yaw) * SPEED, Math.cos(q.yaw) * SPEED);
    return true;
  }
  function sample(rawDt, info, gpu) {
    if (!B) return null;
    B.t += rawDt;
    if (B.t > 2) { B.dts.push(rawDt); B.calls += info.calls; B.tris += info.triangles; B.n++; for (const k in gpu) B.gpu[k] = (B.gpu[k] || 0) + gpu[k]; }
    if (B.t > 30 && state.weather !== 'rain') actions.setWeather('rain');
    if (B.t > 60 && state.hours < 18) actions.setTime(19);
    if (B.t < LEN) return null;
    const d = B.dts.slice().sort((a, b) => a - b), n = d.length, avg = d.reduce((a, b) => a + b, 0) / n;
    const res = {
      fps: 1 / avg, low1: 1 / d[Math.floor(n * 0.99)], worst: d[n - 1] * 1000,
      calls: B.calls / B.n, tris: B.tris / B.n, gpu: Object.fromEntries(Object.entries(B.gpu).map(([k, v]) => [k, v / B.n])),
    };
    actions.setTime(B.keep.hours); actions.setWeather(B.keep.weather); actions.setTimeSpeed(B.keep.timeSpeed);
    nav.clear(); player.speed = 0; player.vel.set(0, 0); B = null;
    return res;
  }
  return { start, drive, sample, get running() { return !!B; }, stop() { if (B) { B.t = LEN; } } };
}
