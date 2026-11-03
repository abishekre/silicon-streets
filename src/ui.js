import { WEATHERS, WEATHER_ORDER } from './weather.js';
import { icon } from './icons.js';
import { ACTIONS, FIXED, keyName } from './input.js';

const $ = (id) => document.getElementById(id);

export function createUI(world, actions, input) {
  const kbd = (a) => input.kbd(a);
  // layers call this when they close themselves (picked a map pin, bought from a menu) so the overlay stack can pop them
  const closed = (name) => api.onClosed && api.onClosed(name);

  // ---------- accessibility prefs: UI scale, text size, reduce motion, HUD detail ----------
  const prefs = { scale: 1, text: 1, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, hud: 'full' };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem('blr.ui') || '{}')); } catch (e) { /* storage blocked */ }
  function applyPrefs(save = true) {
    const r = document.documentElement.style; r.setProperty('--ui', prefs.scale); r.setProperty('--tk', prefs.text);
    document.body.classList.toggle('reduce-motion', !!prefs.reduce);
    document.body.classList.toggle('hud-min', prefs.hud === 'min'); document.body.classList.toggle('hud-off', prefs.hud === 'off');
    if (save) try { localStorage.setItem('blr.ui', JSON.stringify(prefs)); } catch (e) { /* private mode */ }
  }
  applyPrefs(false);

  const toasts = $('toasts');
  function toast(title, body = '', ic = 'info', kind = '') {
    if (api.onToast && api.onToast(title, body, ic, kind)) return; // gig news goes to the phone instead
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `${icon(ic)}<div class="t">${title}</div>${body ? `<div class="b">${body}</div>` : ''}<span class="tx">${icon('close')}</span>`;
    el.onclick = () => el.remove();
    toasts.prepend(el);
    while (toasts.children.length > 3) toasts.lastChild.remove();
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4700);
  }

  // ---------- right-middle slot: one job offer or one compact card at a time ----------
  const side = { offer: false, queue: [] };
  const cardEl = $('card');
  const compactShown = () => cardEl.classList.contains('show') && cardEl.classList.contains('compact');
  function hideCard() { cardEl.classList.remove('show'); clearTimeout(card._t); setTimeout(fitRight, 0); if (!side.offer && side.queue.length) setTimeout(() => card(...side.queue.shift()), 400); }
  // compact = side card that doesn't cover the road while driving
  // the compact card lives in the bottom-right column (above the speedometer); the full card in the middle of the screen
  const hudEl = $('hud'), brEl = $('bottomRight'), speedoEl = $('speedo');
  function placeCard(compact) { if (compact) brEl.insertBefore(cardEl, speedoEl); else if (cardEl.parentNode !== hudEl) hudEl.insertBefore(cardEl, $('banner')); }
  // short screens: if the bottom-right column would reach the top-right panels, shrink the minimap (then hide it)
  function fitRight() {
    document.body.classList.remove('tight', 'cramped');
    const busy = $('offer').classList.contains('on') || compactShown();
    if (!busy || getComputedStyle(brEl).display === 'contents') return;
    const hits = () => { const t = $('topRight').getBoundingClientRect(), b = brEl.getBoundingClientRect(); return b.top < t.bottom + 8; };
    if (hits()) { document.body.classList.add('tight'); if (hits()) document.body.classList.add('cramped'); }
  }
  addEventListener('resize', fitRight);
  function card(ic, title, body, foot, compact = false) {
    if (compact && side.offer) { side.queue.push([ic, title, body, foot, compact]); return; }
    placeCard(compact);
    cardEl.innerHTML = `<div class="e">${icon(ic)}</div><div class="k">PEAK BENGALURU MOMENT</div><div class="t">${title}</div><div class="b">${body}</div><div class="f">${foot} · click or ${kbd('dismiss')} to close</div>`;
    cardEl.classList.toggle('compact', compact);
    cardEl.classList.remove('show'); void cardEl.offsetWidth; cardEl.classList.add('show'); fitRight();
    cardEl.onclick = hideCard;
    clearTimeout(card._t); card._t = setTimeout(hideCard, compact ? 4500 : 6000);
  }
  function dismissAll() { cardEl.classList.remove('show'); side.queue.length = 0; toasts.innerHTML = ''; $('dialogue').classList.remove('show'); }
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
    el.innerHTML = `<div class="mh"><div><div class="mt">${title}</div><div class="mk kn">${kn || ''}</div></div><button class="xbtn" aria-label="Close">${icon('close')}</button></div>
      <div class="mi">${items.map((it, i) => `<button data-i="${i}"><span class="n"><kbd>${i + 1}</kbd> ${it.name}</span><span class="p">${it.price != null ? `₹${it.price}` : ''}</span><span class="d">${it.desc || ''}</span></button>`).join('')}</div>
      <div class="mf">${foot} · <kbd>Esc</kbd> to close</div>`;
    $('menuWrap').classList.add('open'); menuOpen = true;
    api.onOpened && api.onOpened('menu');
    el.querySelector('.xbtn').onclick = () => { closeMenu(); closed('menu'); };
    el.querySelectorAll('.mi button').forEach((b) => (b.onclick = () => { const it = items[+b.dataset.i]; closeMenu(); closed('menu'); it.onPick(); }));
    $('menuWrap').onclick = (e) => { if (e.target === $('menuWrap')) { closeMenu(); closed('menu'); } };
    menu.items = items;
  }
  function closeMenu() { $('menuWrap').classList.remove('open'); menuOpen = false; }
  function menuKey(e) {
    if (!menuOpen) return false;
    if (input.is(e.code, 'interact')) { closeMenu(); closed('menu'); return true; }
    const n = parseInt(e.code.replace('Digit', ''), 10);
    if (n >= 1 && menu.items && menu.items[n - 1]) { const it = menu.items[n - 1]; closeMenu(); closed('menu'); it.onPick(); }
    return e.code !== 'Escape';
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
    mctx.fillStyle = 'rgba(255,255,255,0.85)'; mctx.font = '700 11px "Space Grotesk"'; mctx.textAlign = 'center'; mctx.fillText('N', W / 2, 13);
  }

  // ---------- HUD ----------
  function fmtTime(h) {
    const hh = Math.floor(h) % 24, mm2 = Math.floor((h % 1) * 60);
    const ap = hh >= 12 ? 'PM' : 'AM', h12 = ((hh + 11) % 12) + 1;
    return `${h12}:${String(mm2).padStart(2, '0')} <small>${ap}</small>`;
  }
  let fpsN = 0, fpsT = 0, fps = 0;
  function frame(rawDt) { fpsN++; fpsT += rawDt; if (fpsT > 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; } }
  const cache = {};
  const put = (id, html) => { if (cache[id] !== html) { cache[id] = html; $(id).innerHTML = html; } };
  $('collectBox').insertAdjacentHTML('afterbegin', icon('star', 'fill'));
  // while driving, the wallet and the collect count fade out after 3 s without a change
  const idle = { wallet: '', walletT: 0, col: '', colT: 0 };
  function update(d) {
    const now = performance.now();
    put('clock', `<small>${d.dayName || ''}</small> ${fmtTime(d.hours)}`);
    const w = WEATHERS[d.weather];
    put('wx', `${icon(w.icon)}<span>${w.label}${d.temp != null ? ` · ${d.temp}°C` : ''}</span>`);
    $('live').classList.toggle('on', d.live);
    $('speed').textContent = Math.round(Math.abs(d.speed) * 3.6);
    $('vname').textContent = d.vehicle;
    const r = d.ride;
    $('meter').classList.toggle('on', r.state === 'riding');
    $('meter').style.display = d.vehicleType === 'auto' ? '' : 'none';
    $('speedo').style.display = d.mode === 'drive' ? '' : 'none';
    $('fare').textContent = `₹${Math.round(r.fare)}`;
    const st = Math.round(r.rating);
    put('rating', Array.from({ length: 5 }, (_, i) => icon('star', i < st ? 'fill' : 'off')).join(''));
    $('rating').title = `Rating ${st} of 5`;
    $('earned').textContent = `₹${r.earned} earned · ${r.rides} ride${r.rides === 1 ? '' : 's'}`;
    $('collect').textContent = `${d.collected}/${d.totalCollect}`;
    // what you owe (fines you couldn't pay, the garage loan) sits next to what you have
    const owed = Math.round((d.wallet.debt || 0) + (d.wallet.loan || 0));
    $('money').innerHTML = `₹${Math.round(d.wallet.money)}${owed ? `<span class="owed" title="Owed: Traffic Police dues ₹${Math.round(d.wallet.debt || 0)}, garage loan ₹${Math.round(d.wallet.loan || 0)}">−₹${owed}</span>` : ''}`;
    put('respect', `${icon('respect')}${Math.round(d.wallet.respect)}`); $('respect').className = d.wallet.respect < 30 ? 'low' : '';
    if (!cache.energy) { cache.energy = 1; $('energy').insertAdjacentHTML('afterbegin', icon('bolt')); }
    $('vhealth').style.width = `${d.health}%`; $('vhealth').style.background = d.health < 30 ? '#ff5252' : d.health < 60 ? '#ffb300' : '#3ddc84';
    $('energyBar').style.width = `${d.wallet.energy}%`;
    $('energyBar').style.background = d.wallet.energy < 20 ? '#ff5252' : d.wallet.energy < 45 ? '#ffb300' : '#3ddc84';
    const wk = `${Math.round(d.wallet.money)}|${Math.round(d.wallet.respect)}|${Math.round(d.wallet.energy / 10)}`;
    if (wk !== idle.wallet) { idle.wallet = wk; idle.walletT = now; }
    if (d.collected !== idle.col) { idle.col = d.collected; idle.colT = now; }
    const driving = d.mode === 'drive';
    $('walletBox').classList.toggle('idle', driving && now - idle.walletT > 3000);
    $('collectBox').classList.toggle('idle', driving && now - idle.colT > 3000);
    if (document.activeElement !== $('timeSlider')) $('timeSlider').value = d.hours;
    $('timeVal').textContent = fmtTime(d.hours).replace(/<[^>]+>/g, '');
  }

  // ---------- pause menu ----------
  const PAUSE = [
    ['resume', 'play', 'Resume', () => '<kbd>Esc</kbd>'], ['map', 'map', 'Map', () => kbd('map')], ['settings', 'sliders', 'Settings', () => ''],
    ['controls', 'keyboard', 'Controls', () => kbd('controls')], ['save', 'save', 'Save game', () => ''], ['quit', 'exit', 'Quit to title', () => ''],
  ];
  function showPause(sub = '') {
    $('pauseSub').textContent = sub;
    const pm = $('pause').querySelector('.pm');
    pm.innerHTML = PAUSE.map(([a, ic, l, k], i) => `<button data-a="${a}"${i ? '' : ' class="first"'}>${icon(ic)}${l}${k()}</button>`).join('');
    pm.onclick = (e) => { const b = e.target.closest('button'); if (b) actions.pauseAction(b.dataset.a); };
    $('pause').classList.add('open');
    pm.querySelector('button').focus();
  }
  const hidePause = () => $('pause').classList.remove('open');
  // arrow keys walk the focused buttons in any modal
  function focusStep(root, e) {
    if (e.code !== 'ArrowDown' && e.code !== 'ArrowUp') return false;
    const bs = [...root.querySelectorAll('button')].filter((b) => b.offsetParent), i = bs.indexOf(document.activeElement);
    bs[(i + (e.code === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus(); e.preventDefault(); return true;
  }
  const pauseKey = (e) => focusStep($('pause'), e);

  // ---------- settings: a centred modal with tabs ----------
  const TABS = [['graphics', 'gear', 'Graphics'], ['gameplay', 'auto', 'Gameplay'], ['audio', 'sound', 'Audio'], ['controls', 'keyboard', 'Controls'], ['access', 'eye', 'Accessibility']];
  $('sTabs').innerHTML = TABS.map(([t, ic, l]) => `<button role="tab" data-t="${t}">${icon(ic)}${l}</button>`).join('');
  function tab(t) {
    for (const b of $('sTabs').children) { b.classList.toggle('sel', b.dataset.t === t); b.setAttribute('aria-selected', b.dataset.t === t); }
    for (const s of document.querySelectorAll('.sbody section')) s.classList.toggle('sel', s.dataset.t === t);
    if (t === 'controls') renderKeys();
  }
  $('sTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) tab(b.dataset.t); };
  $('closeSettings').innerHTML = icon('close');
  $('closeSettings').onclick = () => { hideSettings(); closed('settings'); };
  function showSettings(t = 'graphics') { $('settings').classList.add('open'); tab(t); $('statsKey').innerHTML = kbd('stats'); }
  function hideSettings() { cancelBind(); $('settings').classList.remove('open'); }
  $('timeSlider').oninput = (e) => actions.setTime(parseFloat(e.target.value));
  const seg = (id, values, on) => {
    const el = $(id);
    el.innerHTML = values.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('button'); if (b) on(b.dataset.v); };
    return (v) => el.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.v === String(v)));
  };
  const selSpeed = seg('speedSeg', [['0', 'Pause'], ['1', '1×'], ['60', '60×'], ['360', '360×']], (v) => actions.setTimeSpeed(+v));
  const selWx = seg('wxSeg', WEATHER_ORDER.map((k) => [k, `${icon(WEATHERS[k].icon)} ${WEATHERS[k].label}`]), (v) => actions.setWeather(v));
  const selVeh = seg('vehSeg', [['auto', `${icon('auto')} Auto`], ['scooter', `${icon('scooter')} Scooter`], ['car', `${icon('car')} Car`]], (v) => actions.setVehicle(v));
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
    gAA: ['aa', [['off', 'Off'], ['fxaa', 'FXAA'], ['smaa', 'SMAA'], ['msaa2', 'MSAA 2×'], ['msaa4', 'MSAA 4×'], ['msaa4smaa', 'MSAA 4× + SMAA']]],
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
  $('benchBtn').onclick = () => actions.runBenchmark();
  // audio: one slider per mixer bus
  const VOL = [['master', 'Master'], ['radio', 'Radio'], ['traffic', 'Traffic'], ['ambience', 'Ambience (rain, crowds, birds)'], ['horn', 'Your horn']];
  const vol = actions.volume();
  $('volList').innerHTML = VOL.map(([b, l]) => `<div class="row"><span>${l}</span><input type="range" min="0" max="1" step="0.05" data-b="${b}" value="${vol[b]}" aria-label="${l} volume"><span class="v">${Math.round(vol[b] * 100)}%</span></div>`).join('');
  $('volList').oninput = (e) => { const b = e.target.dataset.b; if (!b) return; actions.setVolume(b, +e.target.value); e.target.nextElementSibling.textContent = `${Math.round(e.target.value * 100)}%`; };
  // accessibility
  $('uiScale').value = prefs.scale; $('uiScaleV').textContent = `${Math.round(prefs.scale * 100)}%`;
  $('uiScale').oninput = (e) => { prefs.scale = +e.target.value; $('uiScaleV').textContent = `${Math.round(prefs.scale * 100)}%`; applyPrefs(); };
  const selText = seg('textSeg', [['0.875', 'Small'], ['1', 'Normal'], ['1.125', 'Large'], ['1.25', 'Extra large']], (v) => { prefs.text = +v; applyPrefs(); selText(v); });
  const selHud = seg('hudSeg', [['full', 'Full'], ['min', 'Minimal'], ['off', 'Off']], (v) => { prefs.hud = v; applyPrefs(); selHud(v); });
  selText(prefs.text); selHud(prefs.hud);
  $('reduceMotion').checked = !!prefs.reduce; $('reduceMotion').onchange = (e) => { prefs.reduce = e.target.checked; applyPrefs(); };

  // ---------- controls: click a slot, press a key; conflicts offer a swap ----------
  let waiting = null; // { action, slot }
  const LABEL = Object.fromEntries(ACTIONS.map(([a, l]) => [a, l]));
  function renderKeys() {
    let g = '', html = '';
    for (const [a, l, grp] of ACTIONS) {
      if (grp !== g) { g = grp; html += `<div class="kg">${grp}</div>`; }
      const ks = input.keys(a);
      html += `<div class="kr"><span>${l}</span>${[0, 1].map((s) => {
        const w = waiting && waiting.action === a && waiting.slot === s;
        return `<button data-a="${a}" data-s="${s}" class="${w ? 'wait' : ks[s] ? '' : 'empty'}" aria-label="${l}, ${s ? 'secondary' : 'primary'} key">${w ? 'Press a key' : keyName(ks[s]) || 'Add'}</button>`;
      }).join('')}</div>`;
    }
    $('keyList').innerHTML = html;
  }
  const msg = (html) => { $('keyMsg').innerHTML = html; };
  function cancelBind() { if (waiting) { waiting = null; renderKeys(); } }
  $('keyList').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; waiting = { action: b.dataset.a, slot: +b.dataset.s }; msg(`Press a key for <b>${LABEL[waiting.action]}</b>. Esc cancels, Delete clears the slot.`); renderKeys(); };
  $('keysReset').onclick = () => { input.reset(); waiting = null; msg('All keys are back to their defaults.'); renderKeys(); api.onKeysChanged && api.onKeysChanged(); };
  function settingsKey(e) {
    if (!waiting) return false;
    e.preventDefault();
    const { action, slot } = waiting;
    if (e.code === 'Escape') { waiting = null; msg(''); renderKeys(); return true; }
    if (e.code === 'Delete' || e.code === 'Backspace') { input.bind(action, slot, null); waiting = null; msg(`Cleared.`); renderKeys(); api.onKeysChanged && api.onKeysChanged(); return true; }
    if (FIXED.includes(e.code)) { msg(`<b>${keyName(e.code)}</b> is reserved (Esc pauses and closes, 1-9 pick menu items). Try another key.`); return true; }
    const c = input.conflict(action, e.code);
    waiting = null;
    if (c) {
      msg(`<b>${keyName(e.code)}</b> is already used by <b>${LABEL[c.action]}</b>. <button id="kSwap">Swap them</button><button id="kCancel">Cancel</button>`);
      $('kSwap').onclick = () => { input.bind(action, slot, e.code, c); msg(`Swapped: ${LABEL[action]} is now <b>${keyName(e.code)}</b>.`); renderKeys(); api.onKeysChanged && api.onKeysChanged(); };
      $('kCancel').onclick = () => msg('');
    } else { input.bind(action, slot, e.code); msg(`${LABEL[action]} is now <b>${keyName(e.code)}</b>.`); api.onKeysChanged && api.onKeysChanged(); }
    renderKeys();
    return true;
  }

  function sync(s) {
    const q = s.quality;
    selSpeed(s.timeSpeed); selQ(q.mode); $('stats').checked = q.stats; selLive(q.cfg.live); $('gDyn').checked = q.dynRes;
    for (const [id, [key]] of Object.entries(GFX)) $(id).value = String(q.cfg[key]);
    $('qNow').textContent = q.mode === 'auto' ? `Auto picked ${q.d.label}` : q.mode === 'custom' ? 'Custom settings' : ''; selWx(s.weather); selVeh(s.vehicle); selCam(s.camera);
    $('liveBtn').classList.toggle('sel', s.live);
    $('liveBtn').textContent = s.live ? 'LIVE: synced to real Bengaluru' : 'Sync to real Bengaluru time + weather';
  }
  // bottom-left: one button into the pause menu (settings live there now)
  $('menuBtn').innerHTML = `${icon('menu')}Menu <kbd>Esc</kbd>`;
  $('menuBtn').onclick = () => actions.pauseAction('open');

  // ---------- turn-by-turn panel ----------
  const ARROW = { left: 'turn-left', right: 'turn-right', arrive: 'flag', sharpleft: 'sharp-left', sharpright: 'sharp-right', straight: 'straight' };
  let navKey = '';
  function nav(info) {
    const el = $('nav');
    if (!info) { if (navKey) { el.classList.remove('on'); navKey = ''; } return; }
    let html;
    if (info.rerouting || info.lost) html = `<div class="na">${icon('reroute')}</div><div><div class="nd">Rerouting…</div><div class="ns">Finding a way on the roads</div></div>`;
    else {
      const tr = info.turn, d = tr.dist < 1000 ? `${Math.max(10, Math.round(tr.dist / 10) * 10)} m` : `${(tr.dist / 1000).toFixed(1)} km`;
      const what = tr.dir === 'arrive' ? `Arrive at ${info.name}` : `Turn ${tr.dir}${tr.road ? ` onto <b>${tr.road}</b>` : ''}`;
      html = `<div class="na">${icon(ARROW[(tr.sharp ? 'sharp' : '') + tr.dir] || ARROW[tr.dir] || 'straight')}</div><div><div class="nd">${d}</div><div class="ns">${what}</div><div class="ne">${info.name} · ${(info.left / 1000).toFixed(1)} km · ${Math.max(1, Math.round(info.eta))} min</div></div>`;
    }
    if (html !== navKey) { el.innerHTML = html; navKey = html; }
    el.classList.add('on');
  }

  // ---------- full map: pan, zoom, drop a pin ----------
  let mapOpen = false;
  $('bigmapClose').innerHTML = icon('close'); $('bigmapClear').innerHTML = `${icon('close')} Clear route`;
  $('bigmapSearch').insertAdjacentHTML('beforebegin', icon('search'));
  function openMap({ focus, markers, route, places, search = [], onPick, onClear }) {
    const el = $('bigmap'), cv = $('bigmapCanvas'), ctx = cv.getContext('2d');
    mapOpen = true; el.classList.add('open');
    const st = { cx: focus.x, cz: focus.z, zoom: 1.1, drag: null, moved: false };
    const dpr = devicePixelRatio;
    const pick = (p) => { closeMap(); closed('map'); onPick(p); };
    const clear = () => { closeMap(); closed('map'); onClear(); };
    const draw = () => {
      cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
      const W = cv.width, H = cv.height, k = st.zoom * dpr;
      const X = (x) => (x - st.cx) * k + W / 2, Z = (z) => (z - st.cz) * k + H / 2;
      ctx.fillStyle = '#17191d'; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(bg, X(B.x1), Z(B.z1), (B.x2 - B.x1) * k, (B.z2 - B.z1) * k);
      if (route) { ctx.strokeStyle = '#2f9bff'; ctx.lineWidth = 5 * dpr; ctx.lineJoin = ctx.lineCap = 'round'; ctx.beginPath(); route.pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)))); ctx.stroke(); }
      ctx.font = `600 ${12 * dpr}px "Space Grotesk"`; ctx.textAlign = 'center';
      for (const p of places) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), 3.5 * dpr, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillText(p.name, X(p.x), Z(p.z) - 8 * dpr); }
      for (const m of markers) { ctx.fillStyle = m.c; ctx.beginPath(); ctx.arc(X(m.x), Z(m.z), (m.big ? 7 : 4.5) * dpr, 0, 7); ctx.fill(); }
      ctx.save(); ctx.translate(X(focus.x), Z(focus.z)); ctx.rotate(-focus.heading + Math.PI); ctx.scale(dpr * 1.4, dpr * 1.4);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    };
    const toWorld = (e) => { const r = cv.getBoundingClientRect(); return { x: st.cx + (e.clientX - r.left - r.width / 2) / st.zoom, z: st.cz + (e.clientY - r.top - r.height / 2) / st.zoom }; };
    cv.onpointerdown = (e) => { if (e.button !== 0) return; st.drag = { x: e.clientX, y: e.clientY, cx: st.cx, cz: st.cz }; st.moved = false; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = (e) => { if (!st.drag) return; const dx = e.clientX - st.drag.x, dy = e.clientY - st.drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) st.moved = true; st.cx = st.drag.cx - dx / st.zoom; st.cz = st.drag.cz - dy / st.zoom; draw(); };
    cv.onpointerup = (e) => { const was = st.drag; st.drag = null; if (was && !st.moved) pick({ ...toWorld(e), name: 'Dropped pin' }); };
    cv.onwheel = (e) => { e.preventDefault(); st.zoom = Math.max(0.25, Math.min(4, st.zoom * (e.deltaY > 0 ? 0.87 : 1.15))); draw(); };
    cv.oncontextmenu = (e) => { e.preventDefault(); clear(); };
    // search any road, café, restaurant, station or landmark; empty search shows the quick list
    let shown = places;
    const list = (items) => { shown = items; $('bigmapResults').innerHTML = items.slice(0, 40).map((p, i) => `<button data-i="${i}">${icon(p.icon || 'pin')}<span>${p.name}</span>${p.kind ? `<small>${p.kind}</small>` : ''}</button>`).join('') || '<div class="none">No matches</div>'; };
    const q = $('bigmapSearch'); q.value = '';
    q.oninput = () => {
      const t = q.value.trim().toLowerCase();
      if (!t) return list(places);
      const hits = search.filter((p) => p.name.toLowerCase().includes(t)).sort((a, b) => a.name.toLowerCase().indexOf(t) - b.name.toLowerCase().indexOf(t) || a.name.length - b.name.length);
      list(hits);
    };
    // typing in the search box stays in the box; Esc closes, Enter takes the first hit
    q.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && shown[0]) pick(shown[0]); if (e.key === 'Escape') { closeMap(); closed('map'); } };
    list(places);
    $('bigmapResults').onclick = (e) => { const b = e.target.closest('button'); if (b) pick(shown[+b.dataset.i]); };
    $('bigmapClear').onclick = clear;
    if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => q.focus(), 50);
    $('bigmapClose').onclick = () => { closeMap(); closed('map'); };
    draw();
  }
  function closeMap() { mapOpen = false; $('bigmap').classList.remove('open'); $('bigmapSearch').blur(); }

  // ---------- job offer card (rides, deliveries) ----------
  let offerSecs = 20;
  function offer(o) {
    const el = $('offer');
    if (!o) { el.classList.remove('on'); side.offer = false; setTimeout(fitRight, 0); if (side.queue.length && !compactShown()) setTimeout(() => !side.offer && side.queue.length && card(...side.queue.shift()), 350); return; }
    // a compact card in the slot goes back in the queue and returns after the offer
    if (api.onOffer) api.onOffer(o);
    if (compactShown() && card._last) { side.queue.unshift(card._last); cardEl.classList.remove('show'); clearTimeout(card._t); }
    side.offer = true; offerSecs = o.secs;
    el.innerHTML = `<div class="oh">${icon(o.icon)} ${o.app}</div><div class="ot">${o.title}</div><div class="os">${o.sub}</div><div class="obar"><span id="offerBar"></span></div><div class="ob"><button class="ok">${kbd('accept')} Accept</button><button class="no">${kbd('decline')} Decline</button></div>`;
    el.querySelector('.ok').onclick = () => o.onAccept(); el.querySelector('.no').onclick = () => o.onDecline();
    el.classList.add('on'); fitRight();
  }
  const cardShow = card;
  function cardTracked(...a) { if (a[4]) card._last = a; cardShow(...a); }
  function offerTick(t) { const b = $('offerBar'); if (b) b.style.width = `${Math.max(0, t / offerSecs) * 100}%`; }

  const api = {
    offer, offerTick, nav, openMap, closeMap, get mapOpen() { return mapOpen; }, toast, card: cardTracked, dialogue, prompt, setZone, drawMinimap, update, sync,
    showSettings, hideSettings, settingsKey, showPause, hidePause, pauseKey, fmtTime, menu, closeMenu, frame, dismissAll, menuKey, fade, kbd, prefs,
    get menuOpen() { return menuOpen; }, get fps() { return fps; }, onClosed: null, onOpened: null, onKeysChanged: null, onToast: null, onOffer: null,
  };
  return api;
}
