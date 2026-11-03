import { WEATHERS, WEATHER_ORDER } from './weather.js';

const $ = (id) => document.getElementById(id);

export function createUI(world, actions) {
  const toasts = $('toasts');
  function toast(title, body = '', kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `<div class="t">${title}</div>${body ? `<div class="b">${body}</div>` : ''}<span class="tx">×</span>`;
    el.onclick = () => el.remove();
    toasts.prepend(el);
    while (toasts.children.length > 3) toasts.lastChild.remove();
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4100);
  }
  // compact = side card that doesn't cover the road while driving
  function card(emoji, title, body, foot, compact = false) {
    const el = $('card');
    el.innerHTML = `<div class="e">${emoji}</div><div class="k">PEAK BENGALURU MOMENT</div><div class="t">${title}</div><div class="b">${body}</div><div class="f">${foot} · click or <kbd>X</kbd> to close</div>`;
    el.classList.toggle('compact', compact);
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    el.onclick = () => el.classList.remove('show');
    clearTimeout(card._t); card._t = setTimeout(() => el.classList.remove('show'), compact ? 4500 : 6000);
  }
  function dismissAll() { $('card').classList.remove('show'); toasts.innerHTML = ''; $('dialogue').classList.remove('show'); }
  function dialogue(text) {
    const el = $('dialogue');
    el.textContent = text; el.classList.add('show');
    clearTimeout(dialogue._t); dialogue._t = setTimeout(() => el.classList.remove('show'), 4500);
  }
  let lastPrompt = null;
  function prompt(html) {
    if (html === lastPrompt) return; lastPrompt = html;
    const el = $('prompt'); el.innerHTML = html || ''; el.classList.toggle('show', !!html);
  }
  let lastZone = null;
  function setZone(z) {
    if (z === lastZone) return; lastZone = z;
    $('locName').textContent = z.name; $('locKn').textContent = z.kn || '';
    const b = $('banner');
    b.innerHTML = `<div class="n">${z.name}</div><div class="kn">${z.kn || ''}</div>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  // ---------- menu modal (cafés, carts, metro) ----------
  let menuOpen = false;
  function menu({ title, kn, items, foot = '' }) {
    const el = $('menu');
    el.innerHTML = `<div class="mh"><div><div class="mt">${title}</div><div class="mk kn">${kn || ''}</div></div><button class="mx" aria-label="Close">×</button></div>
      <div class="mi">${items.map((it, i) => `<button data-i="${i}"><span class="n"><kbd>${i + 1}</kbd> ${it.name}</span><span class="p">₹${it.price}</span><span class="d">${it.desc || ''}</span></button>`).join('')}</div>
      <div class="mf">${foot} · <kbd>Esc</kbd> to close</div>`;
    el.classList.add('open'); menuOpen = true;
    el.querySelector('.mx').onclick = closeMenu;
    el.querySelectorAll('.mi button').forEach((b) => (b.onclick = () => { const it = items[+b.dataset.i]; closeMenu(); it.onPick(); }));
    menu.items = items;
  }
  function closeMenu() { $('menu').classList.remove('open'); menuOpen = false; }
  function menuKey(code) {
    if (!menuOpen) return false;
    if (code === 'Escape' || code === 'KeyE') { closeMenu(); return true; }
    const n = parseInt(code.replace('Digit', ''), 10);
    if (n >= 1 && menu.items && menu.items[n - 1]) { const it = menu.items[n - 1]; closeMenu(); it.onPick(); }
    return true;
  }
  async function fade(fn, text = '') {
    fade.onStart && fade.onStart();
    const el = $('fade'); el.textContent = text; el.classList.add('on');
    await new Promise((r) => setTimeout(r, 450)); fn(); await new Promise((r) => setTimeout(r, 350)); el.classList.remove('on');
  }

  // ---------- minimap: centred on you, north up ----------
  const mm = $('minimap'), mctx = mm.getContext('2d');
  const B = world.bounds, K = 0.5;
  const bg = document.createElement('canvas'); bg.width = (B.x2 - B.x1) * K; bg.height = (B.z2 - B.z1) * K;
  {
    const c = bg.getContext('2d');
    const X = (x) => (x - B.x1) * K, Z = (z) => (z - B.z1) * K;
    c.fillStyle = '#23262b'; c.fillRect(0, 0, bg.width, bg.height);
    const poly = (pts) => { c.beginPath(); pts.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z)))); c.closePath(); c.fill(); };
    c.fillStyle = '#2d4a2a'; for (const a of world.parks) poly(a.pts);
    c.fillStyle = '#3c4048'; for (const b of world.buildings) poly(b.pts);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const draw = (filter, col, wk) => {
      c.strokeStyle = col;
      for (const r of world.roads) {
        if (!filter(r)) continue;
        c.lineWidth = Math.max(1, r.w * K * wk); c.beginPath();
        r.pts.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z)))); c.stroke();
      }
    };
    draw((r) => ['footway', 'path'].includes(r.k), '#5b5a4c', 1);
    draw((r) => r.drive && !['primary', 'secondary', 'trunk'].includes(r.k), '#9aa0a8', 1.2);
    draw((r) => ['primary', 'secondary', 'trunk'].includes(r.k), '#e8c96a', 1.2);
    c.strokeStyle = '#a873c9'; c.lineWidth = 2;
    for (const l of world.tracks) { c.beginPath(); l.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z)))); c.stroke(); }
    if (world.stadium) { c.fillStyle = '#4a7a3f'; c.beginPath(); c.arc(X(world.stadium.x), Z(world.stadium.z), world.stadium.r * K, 0, 7); c.fill(); c.strokeStyle = '#ddd'; c.stroke(); }
    if (world.vidhana) { c.fillStyle = '#cfc1a0'; c.beginPath(); c.arc(X(world.vidhana.x), Z(world.vidhana.z), 36 * K, 0, 7); c.fill(); }
  }
  const R = 260; // metres shown from centre to edge
  function drawMinimap(focus, heading, markers, vehicles, route) {
    const W = mm.width, S = W / (R * 2);
    const sx = (focus.x - R - B.x1) * K, sz = (focus.z - R - B.z1) * K;
    mctx.fillStyle = '#1b1d21'; mctx.fillRect(0, 0, W, W);
    mctx.drawImage(bg, sx, sz, R * 2 * K, R * 2 * K, 0, 0, W, W);
    const P = (x, z) => [(x - focus.x + R) * S, (z - focus.z + R) * S];
    if (route) {
      // the GPS line, like Google Maps
      mctx.strokeStyle = '#2f9bff'; mctx.lineWidth = 5; mctx.lineCap = mctx.lineJoin = 'round'; mctx.beginPath();
      let started = false;
      for (let i = 0; i < route.pts.length; i++) {
        if (route.cum[i + 1] !== undefined && route.cum[i + 1] < route.progress) continue;
        const [x, y] = P(route.pts[i][0], route.pts[i][1]);
        if (!started) { mctx.moveTo(x, y); started = true; } else mctx.lineTo(x, y);
      }
      mctx.stroke(); mctx.strokeStyle = '#bfe3ff'; mctx.lineWidth = 1.5; mctx.stroke();
    }
    mctx.fillStyle = '#e8c547';
    for (const v of vehicles) { const [x, y] = P(v.x, v.z); if (x > 0 && y > 0 && x < W && y < W) mctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    for (const m of markers) {
      let [x, y] = P(m.x, m.z);
      const out = x < 6 || y < 6 || x > W - 6 || y > W - 6;
      if (out && !m.big) continue;
      x = Math.max(7, Math.min(W - 7, x)); y = Math.max(7, Math.min(W - 7, y));
      mctx.fillStyle = m.c; mctx.beginPath(); mctx.arc(x, y, m.big ? 7 : m.icon ? 6 : 4, 0, 7); mctx.fill();
      if (m.icon) { mctx.fillStyle = '#fff'; mctx.font = '700 9px "Space Grotesk"'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle'; mctx.fillText(m.icon, x, y + 0.5); }
      if (m.big) { mctx.strokeStyle = '#000'; mctx.lineWidth = 2; mctx.stroke(); }
    }
    mctx.save(); mctx.translate(W / 2, W / 2); mctx.rotate(-heading + Math.PI);
    mctx.fillStyle = '#ffffff'; mctx.strokeStyle = '#000'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.moveTo(0, -10); mctx.lineTo(7, 7); mctx.lineTo(0, 3.5); mctx.lineTo(-7, 7); mctx.closePath(); mctx.fill(); mctx.stroke();
    mctx.restore();
    mctx.fillStyle = 'rgba(255,255,255,0.8)'; mctx.font = '700 11px "Space Grotesk"'; mctx.textAlign = 'center'; mctx.fillText('N', W / 2, 13);
  }

  // ---------- HUD ----------
  function fmtTime(h) {
    const hh = Math.floor(h) % 24, mm2 = Math.floor((h % 1) * 60);
    const ap = hh >= 12 ? 'PM' : 'AM', h12 = ((hh + 11) % 12) + 1;
    return `${h12}:${String(mm2).padStart(2, '0')} <small>${ap}</small>`;
  }
  let fpsN = 0, fpsT = 0;
  function frame(rawDt) {
    fpsN++; fpsT += rawDt;
    if (fpsT > 0.5) { $('fps').textContent = `${Math.round(fpsN / fpsT)} fps`; fpsN = 0; fpsT = 0; }
  }
  function update(d) {
    $('clock').innerHTML = `<small>${d.dayName || ''}</small> ${fmtTime(d.hours)}`;
    const w = WEATHERS[d.weather];
    $('wx').textContent = `${w.icon} ${w.label}${d.temp != null ? ` · ${d.temp}°C` : ''}`;
    $('live').classList.toggle('on', d.live);
    $('speed').textContent = Math.round(Math.abs(d.speed) * 3.6);
    $('vname').textContent = d.vehicle;
    const r = d.ride;
    $('meter').classList.toggle('on', r.state === 'riding');
    $('meter').style.display = d.mode === 'drive' && d.vehicleType === 'auto' ? '' : 'none';
    $('speedo').style.display = d.mode === 'drive' ? '' : 'none';
    $('fare').textContent = `₹${Math.round(r.fare)}`;
    $('rating').textContent = '★'.repeat(Math.round(r.rating)) + '☆'.repeat(5 - Math.round(r.rating));
    $('earned').textContent = `₹${r.earned} earned · ${r.rides} ride${r.rides === 1 ? '' : 's'}`;
    $('collect').textContent = `${d.collected}/${d.totalCollect}`;
    $('money').textContent = `₹${Math.round(d.wallet.money)}`;
    $('respect').textContent = `🙏 ${Math.round(d.wallet.respect)}`; $('respect').className = d.wallet.respect < 30 ? 'low' : '';
    $('vhealth').style.width = `${d.health}%`; $('vhealth').style.background = d.health < 30 ? '#ff5252' : d.health < 60 ? '#ffb300' : '#3ddc84';
    $('energyBar').style.width = `${d.wallet.energy}%`;
    $('energyBar').style.background = d.wallet.energy < 20 ? '#ff5252' : d.wallet.energy < 45 ? '#ffb300' : '#3ddc84';
    if (document.activeElement !== $('timeSlider')) $('timeSlider').value = d.hours;
    $('timeVal').textContent = fmtTime(d.hours).replace(/<[^>]+>/g, '');
  }

  // ---------- settings ----------
  const panel = $('settings');
  function togglePanel(force) { panel.classList.toggle('open', force ?? !panel.classList.contains('open')); }
  $('gear').onclick = () => togglePanel();
  $('closeSettings').onclick = () => togglePanel(false);
  $('timeSlider').oninput = (e) => actions.setTime(parseFloat(e.target.value));
  const seg = (id, values, on) => {
    const el = $(id);
    el.innerHTML = values.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('button'); if (b) on(b.dataset.v); };
    return (v) => el.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.v === String(v)));
  };
  const selSpeed = seg('speedSeg', [['0', 'Pause'], ['1', '1×'], ['60', '60×'], ['360', '360×']], (v) => actions.setTimeSpeed(+v));
  const selWx = seg('wxSeg', WEATHER_ORDER.map((k) => [k, `${WEATHERS[k].icon} ${WEATHERS[k].label}`]), (v) => actions.setWeather(v));
  const selVeh = seg('vehSeg', [['auto', '🛺 Auto'], ['scooter', '🛵 Scooter'], ['car', '🚗 Car']], (v) => actions.setVehicle(v));
  const selCam = seg('camSeg', [['chase', 'Chase'], ['first', 'First person'], ['cine', 'Cinematic']], (v) => actions.setCamera(v));
  $('liveBtn').onclick = () => actions.toggleLive();
  const selQ = seg('qSeg', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], (v) => actions.setQuality(v));
  const selLive = seg('liveSeg', [['calm', 'Calm'], ['normal', 'Normal'], ['busy', 'Busy'], ['packed', 'Packed']], (v) => actions.setLiveliness(v));
  // individual graphics options (changing any of them makes the preset "Custom")
  const GFX = {
    gRes: ['res', [[0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.25, '125%'], [1.5, '150%'], [2, '200% (supersampled)']]],
    gShadows: ['shadows', [[0, 'Off'], [1024, 'Low'], [2048, 'High'], [4096, 'Ultra (wider, sharper)']]],
    gAO: ['ao', [['off', 'Off'], ['half', 'Half resolution'], ['full', 'Full resolution']]],
    gBloom: ['bloom', [['off', 'Off'], ['half', 'Half resolution'], ['full', 'Full resolution']]],
    gAA: ['aa', [['off', 'Off'], ['fxaa', 'FXAA'], ['msaa2', 'MSAA 2×'], ['msaa4', 'MSAA 4×'], ['smaa', 'MSAA 4× + SMAA']]],
    gView: ['view', [['near', 'Near'], ['medium', 'Medium'], ['far', 'Far'], ['max', 'Max']]],
    gRain: ['rain', [[0.45, 'Light'], [0.75, 'Medium'], [1, 'Heavy'], [1.25, 'Ultra']]],
  };
  for (const [id, [key, opts]] of Object.entries(GFX)) {
    const el = $(id);
    el.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    el.onchange = () => actions.setGfx(key, typeof opts[0][0] === 'number' ? +el.value : el.value);
  }
  $('gDyn').onchange = (e) => actions.toggleDynRes(e.target.checked);
  $('stats').onchange = (e) => actions.toggleStats(e.target.checked);
  function sync(s) {
    const q = s.quality;
    selSpeed(s.timeSpeed); selQ(q.mode); $('stats').checked = q.stats; selLive(q.cfg.live); $('gDyn').checked = q.dynRes;
    for (const [id, [key]] of Object.entries(GFX)) $(id).value = String(q.cfg[key]);
    $('qNow').textContent = q.mode === 'auto' ? `Auto picked ${q.d.label}` : q.mode === 'custom' ? 'Custom settings' : ''; selWx(s.weather); selVeh(s.vehicle); selCam(s.camera);
    $('liveBtn').classList.toggle('sel', s.live);
    $('liveBtn').textContent = s.live ? '● LIVE: synced to real Bengaluru' : 'Sync to real Bengaluru time + weather';
  }
  function toggleHelp(force) { $('help').classList.toggle('open', force ?? !$('help').classList.contains('open')); }
  $('helpBtn').onclick = () => toggleHelp();

  // ---------- turn-by-turn panel ----------
  const ARROW = { left: '↰', right: '↱', arrive: '⚑', sharpleft: '⤺', sharpright: '⤻' };
  let navKey = '';
  function nav(info) {
    const el = $('nav');
    if (!info) { if (navKey) { el.classList.remove('on'); navKey = ''; } return; }
    let html;
    if (info.rerouting || info.lost) html = '<div class="na">⟳</div><div><div class="nd">Rerouting…</div><div class="ns">Finding a way on the roads</div></div>';
    else {
      const tr = info.turn, d = tr.dist < 1000 ? `${Math.max(10, Math.round(tr.dist / 10) * 10)} m` : `${(tr.dist / 1000).toFixed(1)} km`;
      const what = tr.dir === 'arrive' ? `Arrive at ${info.name}` : `Turn ${tr.dir}${tr.road ? ` onto <b>${tr.road}</b>` : ''}`;
      html = `<div class="na">${ARROW[(tr.sharp ? 'sharp' : '') + tr.dir] || ARROW[tr.dir]}</div><div><div class="nd">${d}</div><div class="ns">${what}</div><div class="ne">${info.name} · ${(info.left / 1000).toFixed(1)} km · ${Math.max(1, Math.round(info.eta))} min</div></div>`;
    }
    if (html !== navKey) { el.innerHTML = html; navKey = html; }
    el.classList.add('on');
  }

  // ---------- full map: pan, zoom, drop a pin ----------
  let mapOpen = false;
  function openMap({ focus, markers, route, places, search = [], onPick, onClear }) {
    const el = $('bigmap'), cv = $('bigmapCanvas'), ctx = cv.getContext('2d');
    mapOpen = true; el.classList.add('open');
    const st = { cx: focus.x, cz: focus.z, zoom: 1.1, drag: null, moved: false };
    const dpr = devicePixelRatio;
    const draw = () => {
      cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
      const W = cv.width, H = cv.height, k = st.zoom * dpr;
      const X = (x) => (x - st.cx) * k + W / 2, Z = (z) => (z - st.cz) * k + H / 2;
      ctx.fillStyle = '#17191d'; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(bg, X(B.x1), Z(B.z1), (B.x2 - B.x1) * k, (B.z2 - B.z1) * k);
      if (route) { ctx.strokeStyle = '#2f9bff'; ctx.lineWidth = 5 * dpr; ctx.lineJoin = ctx.lineCap = 'round'; ctx.beginPath(); route.pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)))); ctx.stroke(); }
      ctx.font = `600 ${11 * dpr}px "Space Grotesk"`; ctx.textAlign = 'center';
      for (const p of places) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), 3.5 * dpr, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(p.name, X(p.x), Z(p.z) - 8 * dpr); }
      for (const m of markers) { ctx.fillStyle = m.c; ctx.beginPath(); ctx.arc(X(m.x), Z(m.z), (m.big ? 7 : 4.5) * dpr, 0, 7); ctx.fill(); }
      ctx.save(); ctx.translate(X(focus.x), Z(focus.z)); ctx.rotate(-focus.heading + Math.PI); ctx.scale(dpr * 1.4, dpr * 1.4);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    };
    const toWorld = (e) => { const r = cv.getBoundingClientRect(); return { x: st.cx + (e.clientX - r.left - r.width / 2) / st.zoom, z: st.cz + (e.clientY - r.top - r.height / 2) / st.zoom }; };
    cv.onpointerdown = (e) => { if (e.button !== 0) return; st.drag = { x: e.clientX, y: e.clientY, cx: st.cx, cz: st.cz }; st.moved = false; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = (e) => { if (!st.drag) return; const dx = e.clientX - st.drag.x, dy = e.clientY - st.drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) st.moved = true; st.cx = st.drag.cx - dx / st.zoom; st.cz = st.drag.cz - dy / st.zoom; draw(); };
    cv.onpointerup = (e) => { const was = st.drag; st.drag = null; if (was && !st.moved) { const w = toWorld(e); closeMap(); onPick({ ...w, name: 'Dropped pin' }); } };
    cv.onwheel = (e) => { e.preventDefault(); st.zoom = Math.max(0.25, Math.min(4, st.zoom * (e.deltaY > 0 ? 0.87 : 1.15))); draw(); };
    cv.oncontextmenu = (e) => { e.preventDefault(); closeMap(); onClear(); };
    // search any road, café, restaurant, station or landmark; empty search shows the quick list
    let shown = places;
    const list = (items) => { shown = items; $('bigmapResults').innerHTML = items.slice(0, 40).map((p, i) => `<button data-i="${i}">${p.icon || '📍'} ${p.name}${p.kind ? `<small>${p.kind}</small>` : ''}</button>`).join('') || '<div class="none">No matches</div>'; };
    const q = $('bigmapSearch'); q.value = '';
    q.oninput = () => {
      const t = q.value.trim().toLowerCase();
      if (!t) return list(places);
      const hits = search.filter((p) => p.name.toLowerCase().includes(t)).sort((a, b) => a.name.toLowerCase().indexOf(t) - b.name.toLowerCase().indexOf(t) || a.name.length - b.name.length);
      list(hits);
    };
    q.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && shown[0]) { closeMap(); onPick(shown[0]); } if (e.key === 'Escape') closeMap(); };
    list(places);
    $('bigmapResults').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; closeMap(); onPick(shown[+b.dataset.i]); };
    $('bigmapClear').onclick = () => { closeMap(); onClear(); };
    setTimeout(() => q.focus(), 50);
    $('bigmapClose').onclick = closeMap;
    draw();
  }
  function closeMap() { mapOpen = false; $('bigmap').classList.remove('open'); }

  // ---------- job offer card (rides, deliveries) ----------
  let offerSecs = 20;
  function offer(o) {
    const el = $('offer');
    if (!o) { el.classList.remove('on'); return; }
    offerSecs = o.secs;
    el.innerHTML = `<div class="oh">${o.icon} ${o.app}</div><div class="ot">${o.title}</div><div class="os">${o.sub}</div><div class="obar"><span id="offerBar"></span></div><div class="ob"><button class="ok"><kbd>Y</kbd> Accept</button><button class="no"><kbd>N</kbd> Decline</button></div>`;
    el.querySelector('.ok').onclick = () => o.onAccept(); el.querySelector('.no').onclick = () => o.onDecline();
    el.classList.add('on');
  }
  function offerTick(t) { const b = $('offerBar'); if (b) b.style.width = `${Math.max(0, t / offerSecs) * 100}%`; }

  return { offer, offerTick, nav, openMap, closeMap, get mapOpen() { return mapOpen; }, toast, card, dialogue, prompt, setZone, drawMinimap, update, sync, togglePanel, toggleHelp, fmtTime, menu, closeMenu, frame, dismissAll, menuKey, fade, get menuOpen() { return menuOpen; } };
}
