import { icon } from './icons.js';
import { VEHICLE_STATS } from './vehicles.js';

// The in-game phone (Tab): a frame bottom-right with the gig apps, Maps, Camera, Messages, NammaPay, Metro, Garage and
// Settings. It's an overlay layer that doesn't pause: the world keeps running and gameplay keys pass through it.
// It only reads the game through public objects (game.ride, game.wallet, tow, world). Its own state (threads, gig
// history, observed payments, tickets) is saved in localStorage 'blr.phone'; photos go to IndexedDB.

const $ = (id) => document.getElementById(id);
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '');
const esc = (s) => strip(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inr = (n) => `${n < 0 ? '−' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
const km = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

// gig apps: kinds and fares as in GIGS (game.js), so the estimate matches what the ride pays
const GIG = {
  'Namma Auto': { kind: 'auto', icon: 'auto', c: '#f2c230', fare: (m) => 50 + m * 0.1, word: 'Ride' },
  Oober: { kind: 'car', icon: 'car', c: '#dfe3e8', fare: (m) => 100 + m * 0.16, word: 'Trip' },
  Swiggly: { kind: 'scooter', icon: 'scooter', c: '#ff8a3d', fare: (m) => 60 + m * 0.06, word: 'Order', delivery: true },
  Zoomato: { kind: 'scooter', icon: 'food', c: '#ff5a6e', fare: (m) => 60 + m * 0.06, word: 'Order', delivery: true },
};
const APPS = [
  ['Namma Auto', 'auto', '#f2c230'], ['Oober', 'car', '#dfe3e8'], ['Swiggly', 'scooter', '#ff8a3d'], ['Zoomato', 'food', '#ff5a6e'],
  ['Maps', 'map', '#4fb3ff'], ['Camera', 'camera', '#b9c2cf'], ['Messages', 'chat', '#3ddc84'], ['NammaPay', 'cash', '#9d8cff'],
  ['Metro', 'metro', '#c27be0'], ['Garage', 'wrench', '#ffb300'], ['Missions', 'flag', '#b388ff'], ['Settings', 'gear', '#9aa2ad'],
];
const CONTACTS = { amma: ['Amma', 'smile'], anna: ['Mechanic Anna', 'wrench'], landlord: ['Landlord', 'building'], police: ['Traffic Police', 'police'], support: ['Gig Support', 'chat'], broker: ['Broker Babu', 'building'], founder: ['Arjun (founder)', 'laptop'], kannada: ['Kannada Meshtru', 'chat'] };

// scripted threads: each step is one message, with optional replies ([label, next step or null]) and an optional
// action: route (a place resolved when it's sent: 'yard', 'darshini') and/or mission (an id started when it's sent)
const SCRIPT = {
  intro: { from: 'anna', text: 'Anna here, your mechanic. Vehicle breaks down, press {call} and I come. ₹150 fixed rate, no bargaining.' },
  firstGig: { from: 'support', text: 'Congratulations on your first gig! Ratings above 4 get tips. Low ratings get fewer requests.', replies: [['Thanks', 'firstGig2'], ['How do I earn more?', 'firstGig3']] },
  firstGig2: { from: 'support', text: 'Happy to help. This chat is now closed. Please rate Gig Support 5 stars.' },
  firstGig3: { from: 'support', text: 'Surge pays more: rush hour (8:30 to 11, 5:30 to 9), rain and late nights. Every app shows its own queue.' },
  towed: { from: 'police', text: 'Your vehicle was towed for obstructing traffic. It is at Namma Garage & Impound: pay the release fee there, take a garage loan, or earn it on foot first.', route: 'yard' },
  lowEnergy: { from: 'amma', text: 'Kanna, did you eat? You sound tired. Go have idli vada at a darshini.', replies: [['Yes Amma', 'lowEnergy2'], ['Not hungry', 'lowEnergy3']] },
  lowEnergy2: { from: 'amma', text: 'Good. Drink water also.' },
  lowEnergy3: { from: 'amma', text: 'Not hungry means hungry. Go and eat.', route: 'darshini' },
  night: { from: 'landlord', text: 'Reminder: gate closes 11 PM sharp. Also rent goes up 15% next month. Market rate.', replies: [['15%?!', 'night2'], ['Okay sir', null]] },
  night2: { from: 'landlord', text: 'Whitefield is 40%. You are lucky.' },
  coffee: { from: 'amma', text: 'Kanna, filter coffee powder is over. Get half a kilo from any darshini on the way. Not that instant nonsense.', replies: [['Okay Amma', 'coffeeGo']] },
  coffeeGo: { from: 'amma', text: 'Nearest darshini is on your map. Walk in and ask for Peaberry.', route: 'darshini', mission: 'coffee' },
  coffeeDone: { from: 'amma', text: 'Got it? Super! The whole house will smell of coffee tomorrow. Come home for dinner.' },
};

// ---------- photos: IndexedDB, or memory only when storage is blocked ----------
let dbP = null;
const db = () => dbP || (dbP = new Promise((res) => {
  try {
    const r = indexedDB.open('blr.phone', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result); r.onerror = r.onblocked = () => res(null);
  } catch (e) { res(null); }
}));
async function store(mode, fn) {
  const d = await db(); if (!d) return undefined;
  return new Promise((res) => {
    try { const t = d.transaction('photos', mode), q = fn(t.objectStore('photos')); t.oncomplete = () => res(q.result); t.onerror = t.onabort = () => res(undefined); } catch (e) { res(undefined); }
  });
}

export function createPhone({ missions, game, tow, navTo, ui, actions, state, world, input, overlays, garage, player, walker: W, weather, renderer, composer, camera, orbit, openMap, home }) {
  const el = $('phone'), scr = $('phScreen'), ban = $('phoneBanner');
  const S = { threads: {}, unread: {}, missions: {}, flags: {}, gig: { day: -1, min: 0, apps: {} }, ratings: [], pay: [], tickets: 0, nightDay: -1, lowDay: -1 };
  try { Object.assign(S, JSON.parse(localStorage.getItem('blr.phone') || '{}')); } catch (e) { /* storage blocked */ }
  let saveT = 0;
  const save = () => { saveT = 0.5; };
  const flush = () => { try { localStorage.setItem('blr.phone', JSON.stringify(S)); } catch (e) { /* private mode */ } };
  const clock = () => ui.fmtTime(state.hours).replace(/<[^>]+>/g, '');
  const focus = () => (state.mode === 'drive' ? player.pos : W.pos);
  const outside = () => state.mode === 'drive' || state.mode === 'walk';
  const L = (k) => VEHICLE_STATS[k].label.toLowerCase();

  // ---------- notifications: a list in the phone, a banner at the top when it's closed ----------
  const N = [];
  const bq = []; let bT = 0;
  function notify(app, ic, title, body = '', banner = true) {
    N.unshift({ app, ic, title: strip(title), body: strip(body), t: clock() }); N.length = Math.min(N.length, 30);
    if (banner && !isOpen()) bq.push({ app, ic, title: strip(title), body: strip(body) });
    dirty = true;
  }
  function nextBanner() {
    const b = bq.shift(); if (!b) return;
    ban.innerHTML = `<span class="pbi">${icon(b.ic)}</span><div><div class="pbt"><b>${esc(b.app)}</b> · now</div><div class="pbh">${esc(b.title)}</div>${b.body ? `<div class="pbb">${esc(b.body)}</div>` : ''}</div>`;
    ban.onclick = () => { ban.classList.remove('on'); bT = 0; openApp(APPS.some((a) => a[0] === b.app) ? b.app : null); };
    ban.classList.remove('on'); void ban.offsetWidth; ban.classList.add('on'); bT = 3.6;
  }
  // gig toasts (titled with the app's name) become phone notifications; the HUD offer card stays for quick Y/N
  ui.onToast = (title, body, ic) => {
    const app = Object.keys(GIG).find((a) => title.startsWith(a));
    if (!app) return false;
    notify(app, ic, title, body); return true;
  };
  ui.onOffer = (o) => notify(o.app, o.icon, `New request: ${strip(o.title)}`, o.sub, false);

  // ---------- gig queues ----------
  let kitchens = null;
  function curb(x, z) {
    const nr = world.nearestRoad(x, z, 150); if (!nr) return { x, z };
    const side = ((x - nr.x) * nr.dz - (z - nr.z) * nr.dx) >= 0 ? 1 : -1, o = nr.r.hw - 0.6;
    return { x: nr.x + nr.dz * o * side, z: nr.z - nr.dx * o * side };
  }
  const pool = (G) => (G.delivery ? (kitchens || (kitchens = world.doors.filter((d) => /restaurant|darshini|cafe|bakery/.test(d.theme)).map((d) => ({ name: d.name, ...curb(d.x, d.z) })))) : game.spots);
  function surge() {
    const h = state.hours, rush = (h >= 8.5 && h < 11) || (h >= 17.5 && h < 21), late = h >= 23 || h < 5, rain = weather.state.rain > 0.3;
    const why = [rush && 'rush hour', rain && 'rain', late && 'late night'].filter(Boolean);
    return { k: Math.min(2.2, Math.round((1 + (rush ? 0.4 : 0) + (rain ? 0.3 : 0) + (late ? 0.5 : 0)) * 10) / 10), why };
  }
  const Q = Object.fromEntries(Object.keys(GIG).map((a) => [a, { list: [], t: 0 }]));
  let uid = 0;
  function refill(app) {
    const G = GIG[app], all = pool(G), p = focus(), s = surge().k;
    const near = all.filter((x) => dist(p, x) > 80 && dist(p, x) < 900);
    const list = [];
    for (let i = 2 + Math.floor(Math.random() * 3); i > 0; i--) {
      const from = pick(near.length ? near : all); if (!from || list.some((o) => o.from === from)) continue;
      list.push({ id: ++uid, app, from, surge: s, d: dist(p, from), est: Math.round(G.fare(500 + Math.random() * 600) * s) });
    }
    Q[app].list = list; Q[app].t = 20 + Math.random() * 20; dirty = true;
  }
  // what stands between you and this gig: null when you can take it
  function gate(kind) {
    const r = game.ride;
    if (r.state === 'waiting' || r.state === 'riding') return { text: 'Finish your current job' };
    if (state.mode === 'drive' && player.type === kind) return null;
    if (state.mode === 'drive') return { text: `Switch to the ${L(kind)}`, a: `switch:${kind}` };
    return { text: `Get in your ${L(kind)}` };
  }
  // the same shape newRequest() leaves in game.ride, then the normal accept: passenger, beam and GPS
  function accept(id) {
    const o = Object.values(Q).flatMap((q) => q.list).find((x) => x.id === id); if (!o) return;
    const G = GIG[o.app]; if (gate(G.kind)) return;
    Object.assign(game.ride, { kind: G.kind, app: o.app, from: o.from, surge: o.surge, state: 'offer', offerT: 20 });
    game.acceptOffer();
    Q[o.app].list = Q[o.app].list.filter((x) => x !== o);
  }

  // ---------- messages ----------
  const nearestDarshini = () => {
    const p = focus(); let best = null;
    for (const d of world.doors) if (d.theme === 'darshini' && (!best || dist(p, d) < dist(p, best))) best = d;
    return best;
  };
  function send(id) {
    const m = SCRIPT[id], th = S.threads[m.from] || (S.threads[m.from] = []);
    const e = { id, t: clock() };
    if (m.route === 'yard') e.route = [tow.yard.x, tow.yard.z, tow.yard.name];
    if (m.route === 'darshini') { const d = nearestDarshini(); if (d) e.route = [d.x, d.z, d.name]; }
    if (m.mission && !S.missions[m.mission]) S.missions[m.mission] = 'active';
    th.push(e); S.unread[m.from] = (S.unread[m.from] || 0) + 1;
    notify('Messages', CONTACTS[m.from][1], CONTACTS[m.from][0], m.text.replace('{call}', input.label('call')));
    save();
  }
  const live = new Map(); let liveId = 0;
  function message(from, text, replies) {
    const th = S.threads[from] || (S.threads[from] = []), e = { dyn: text, t: clock() };
    if (replies) { e.k = ++liveId + '.' + Date.now(); e.labels = replies.map((r) => r[0]); live.set(e.k, replies.map((r) => r[1])); }
    th.push(e); S.unread[from] = (S.unread[from] || 0) + 1;
    notify('Messages', CONTACTS[from] ? CONTACTS[from][1] : 'chat', CONTACTS[from] ? CONTACTS[from][0] : from, text);
    save(); dirty = true;
  }
  function reply(c, i, j) {
    const e = S.threads[c][i];
    if (e.dyn) { const fns = live.get(e.k); e.ans = j; S.threads[c].push({ me: true, text: e.labels[j], t: clock() }); save(); dirty = true; if (fns) { live.delete(e.k); setTimeout(() => fns[j](), 600); } return; }
    const [label, next] = SCRIPT[e.id].replies[j];
    e.ans = j; S.threads[c].push({ me: true, text: label, t: clock() }); save(); dirty = true;
    if (next) setTimeout(() => { send(next); if (view.app === 'Messages' && view.sub === c) S.unread[c] = 0; }, 1200);
  }

  // ---------- camera: photo mode with a shutter that saves a thumbnail ----------
  let photos = null, memOnly = false;
  const loadPhotos = () => store('readonly', (s) => s.getAll()).then((r) => { memOnly = r === undefined; photos = (r || photos || []).reverse(); dirty = true; });
  function startCam() {
    if (!outside()) { notify('Camera', 'camera', 'Step outside first', 'The camera works on the street.'); return; }
    document.body.classList.add('phonecam'); overlays.open('photo');
    $('pcSelfie').style.display = state.mode === 'walk' ? '' : 'none';
    camThumb();
  }
  function camThumb() { const p = photos && photos[0]; $('pcGallery').innerHTML = p ? `<img src="${p.data}" alt="">` : icon('image'); }
  async function shutter() {
    composer.render();
    const src = renderer.domElement, w = Math.min(640, src.width), h = Math.round(w * src.height / src.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(src, 0, 0, w, h);
    const f = focus(), rec = { t: clock(), place: world.zoneAt(f.x, f.z).name, at: Date.now(), data: c.toDataURL('image/jpeg', 0.82) };
    $('phoneCam').classList.remove('flash'); void $('phoneCam').offsetWidth; $('phoneCam').classList.add('flash');
    if (!photos) await loadPhotos();
    const id = await store('readwrite', (s) => s.add(rec));
    if (id === undefined) memOnly = true;
    photos.unshift({ ...rec, id: id ?? 'm' + Date.now() }); camThumb(); dirty = true;
  }
  async function delPhoto(id) {
    if (typeof id === 'number') await store('readwrite', (s) => s.delete(id));
    photos = photos.filter((p) => p.id !== id); view.sub = null; dirty = true;
  }
  // selfie: on foot, the camera swings round in front of you and looks back
  function selfie() {
    const o = orbit(); if (!o || state.mode !== 'walk') return;
    const s = Math.sin(W.yaw), c = Math.cos(W.yaw), y = W.y || 0;
    o.target.set(W.pos.x, 1.45 + y, W.pos.z); camera.position.set(W.pos.x + s * 2.3, 1.75 + y, W.pos.z + c * 2.3); o.update();
  }
  $('pcShutter').innerHTML = '<span></span>'; $('pcSelfie').innerHTML = `${icon('smile')}<span>Selfie</span>`; $('pcClose').innerHTML = icon('close');
  $('pcShutter').onclick = shutter; $('pcSelfie').onclick = selfie; $('pcClose').onclick = () => overlays.close('photo');
  $('pcGallery').onclick = () => { overlays.close('photo'); openApp('Camera'); };

  // ---------- views ----------
  const view = { app: null, sub: null };
  let open = false, dirty = true, drawT = 0;
  const isOpen = () => open;
  const head = (t, c = '') => `<header class="ph-h"><button data-a="back" aria-label="Back">${icon('left')}</button><b${c ? ` style="color:${c}"` : ''}>${t}</b></header>`;
  const sec = (t, body) => `<div class="ph-sec"><h4>${t}</h4>${body}</div>`;
  const btn = (label, a, cls = '') => `<button class="ph-b ${cls}" data-a="${a}">${label}</button>`;
  const routeBtn = (x, z, name) => (outside() ? btn(`${icon('pin')} Route`, `route:${Math.round(x)},${Math.round(z)},${encodeURIComponent(name)}`) : '<span class="ph-m">Step outside</span>');
  const stars = (r) => Array.from({ length: 5 }, (_, i) => icon('star', i < Math.round(r) ? 'fill' : 'off')).join('');
  const shift = () => { const m = Math.round(S.gig.min); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`; };

  function homeView() {
    const badge = (n) => (n ? `<span class="ph-badge">${n}</span>` : '');
    const count = (a) => (a === 'Messages' ? Object.values(S.unread).reduce((x, y) => x + y, 0) : GIG[a] ? Q[a].list.length : 0);
    return `<div class="ph-grid">${APPS.map(([a, ic, c]) => `<button class="ph-app" data-a="app:${a}"><span class="ai" style="background:${c}">${icon(ic)}${badge(count(a))}</span>${a}</button>`).join('')}</div>` +
      sec(`Notifications${N.length ? ` <button class="ph-link" data-a="clearN">Clear</button>` : ''}`, N.length ? N.slice(0, 12).map((n) => `<div class="ph-n">${icon(n.ic)}<div><div class="nt"><b>${esc(n.app)}</b> · ${n.t}</div><div>${esc(n.title)}</div>${n.body ? `<div class="ph-m">${esc(n.body)}</div>` : ''}</div></div>`).join('') : '<div class="ph-m">Nothing new.</div>');
  }
  function gigView(app) {
    const G = GIG[app], r = game.ride, s = surge(), g = gate(G.kind), q = Q[app], today = S.gig.apps[app] || { earned: 0, rides: 0 };
    let h = head(app, G.c);
    h += `<div class="ph-card ${s.k > 1 ? 'surge' : ''}">${icon('bolt')} ${s.k > 1 ? `<b>Surge ${s.k}×</b> · ${s.why.join(', ')}` : 'Normal demand'}</div>`;
    if (r.app === app && (r.state === 'waiting' || r.state === 'riding')) h += `<div class="ph-card on">${icon(G.icon)} <b>${r.state === 'waiting' ? (G.delivery ? 'Collect at' : 'Pick up at') : 'Drop at'}</b> ${esc((r.state === 'waiting' ? r.from : r.to).name)}${r.state === 'riding' ? ` · meter ${inr(r.fare)}` : ''}</div>`;
    if (r.state === 'offer' && r.app === app) h += `<div class="ph-card on">${icon('info')} Incoming: ${esc(r.from.name)} ${btn(`${icon('check')} Accept`, 'hudAccept', 'go')}</div>`;
    h += sec(`Requests near you <span class="ph-m">· new in ${Math.ceil(q.t)} s</span>`, q.list.length ? q.list.map((o) => `<div class="ph-o"><div><b>${G.delivery ? 'Pick up from' : 'Pickup at'} ${esc(o.from.name)}</b><div class="ph-m">${km(o.d)} away · est. ${inr(o.est)}${o.surge > 1 ? ` · ${o.surge}×` : ''}</div></div>${g ? (g.a ? btn(g.text, g.a) : `<span class="ph-gate">${g.text}</span>`) : btn('Accept', `accept:${o.id}`, 'go')}</div>`).join('') : '<div class="ph-m">No requests right now.</div>');
    const wg = typeof game.walkGigs === 'function' ? game.walkGigs() : game.walkGigs;
    if (Array.isArray(wg) && wg.length) h += sec('On foot', wg.map((x) => `<div class="ph-o">${icon(x.icon || 'walk')}<div><b>${esc(x.app)}</b><div class="ph-m">${esc(x.word)}</div></div></div>`).join('') + `<div class="ph-pad">${state.mode === 'walk' ? btn(`${icon('walk')} Ask for an on-foot job`, 'walkNow', 'go wide') : '<span class="ph-gate">Get out and walk to take these</span>'}</div>`);
    const total = Object.values(S.gig.apps).reduce((a, x) => a + x.earned, 0);
    h += sec('Today', `<div class="ph-kv"><span>Shift</span><b>${shift()}</b></div><div class="ph-kv"><span>${app}</span><b>${inr(today.earned)} · ${today.rides} ${G.word.toLowerCase()}${today.rides === 1 ? '' : 's'}</b></div><div class="ph-kv"><span>All apps</span><b>${inr(total)}</b></div>`);
    const rs = S.ratings.filter((x) => x.app === app).slice(0, 8);
    const avg = rs.length ? rs.reduce((a, x) => a + x.r, 0) / rs.length : 0;
    h += sec(`Ratings${rs.length ? ` <span class="ph-m">· ${avg.toFixed(1)} average</span>` : ''}`, rs.length ? rs.map((x) => `<div class="ph-kv"><span class="ph-stars">${stars(x.r)}</span><span class="ph-m">${x.t} · ${inr(x.fare)}</span></div>`).join('') : '<div class="ph-m">Finish a job to get rated.</div>');
    return h;
  }
  function mapsView() {
    const p = focus(), yard = garage && garage.place ? garage.place : tow.yard;
    const row = (ic, name, x, z, note = '') => `<div class="ph-o">${icon(ic)}<div><b>${name}</b><div class="ph-m">${note || km(dist(p, { x, z }))}</div></div>${routeBtn(x, z, name)}</div>`;
    return head('Maps', '#4fb3ff') + `<div class="ph-pad">${btn(`${icon('search')} Search the map`, 'bigmap', 'wide')}</div>` +
      sec('Shortcuts', row('wrench', 'Garage', yard.x, yard.z, tow.impounded ? 'Your vehicle is here' : '') + row('building', 'Home', home.x, home.z) +
        (state.mode === 'drive' ? `<div class="ph-o">${icon(player.type)}<div><b>My vehicle</b><div class="ph-m">You're in it</div></div></div>` : row(player.type, 'My vehicle', player.pos.x, player.pos.z)));
  }
  function camView() {
    if (view.sub != null && photos) {
      const ph = photos.find((x) => String(x.id) === view.sub);
      if (ph) return head('Photo') + `<img class="ph-full" src="${ph.data}" alt="Photo at ${esc(ph.place)}"><div class="ph-pad"><div class="ph-m">${esc(ph.place)} · ${ph.t}</div>${btn(`${icon('trash')} Delete`, `del:${ph.id}`, 'warn wide')}</div>`;
    }
    if (!photos) loadPhotos();
    const g = photos && photos.length ? `<div class="ph-gal">${photos.map((x) => `<button data-a="photo:${x.id}"><img src="${x.data}" alt="${esc(x.place)}"></button>`).join('')}</div>` : '<div class="ph-m">No photos yet.</div>';
    return head('Camera') + `<div class="ph-pad">${btn(`${icon('camera')} Open camera`, 'cam', 'go wide')}<div class="ph-m">${state.mode === 'walk' ? 'Selfie mode works on foot.' : 'Get out to take a selfie.'}</div></div>` +
      sec(`Gallery${photos ? ` <span class="ph-m">· ${photos.length}</span>` : ''}`, g + (memOnly ? '<div class="ph-m">Storage is blocked in this browser: photos last until you reload.</div>' : ''));
  }
  function msgView() {
    const c = view.sub;
    if (c && CONTACTS[c]) {
      S.unread[c] = 0;
      const th = S.threads[c] || [];
      return head(CONTACTS[c][0]) + `<div class="ph-thread">${th.map((e, i) => {
        if (e.me) return `<div class="msg me">${esc(e.text)}</div>`;
        if (e.dyn) return `<div class="msg">${esc(e.dyn)}<span class="mt">${e.t}</span></div>${e.labels && e.ans == null && live.has(e.k) ? `<div class="ph-rep">${e.labels.map((l, j) => btn(esc(l), `reply:${c},${i},${j}`)).join('')}</div>` : ''}`;
        const m = SCRIPT[e.id]; if (!m) return '';
        const rep = m.replies && e.ans == null ? `<div class="ph-rep">${m.replies.map(([l], j) => btn(esc(l), `reply:${c},${i},${j}`)).join('')}</div>` : '';
        return `<div class="msg">${m.text.replace('{call}', ui.kbd('call'))}${e.route ? `<div class="ph-act">${routeBtn(e.route[0], e.route[1], e.route[2])}</div>` : ''}<span class="mt">${e.t}</span></div>${rep}`;
      }).join('') || '<div class="ph-m">No messages.</div>'}</div>`;
    }
    return head('Messages', '#3ddc84') + Object.entries(CONTACTS).map(([k, [n, ic]]) => {
      const th = S.threads[k] || [], last = th[th.length - 1], u = S.unread[k] || 0;
      const prev = last ? (last.me ? 'You: ' + last.text : last.dyn ? strip(last.dyn) : strip(SCRIPT[last.id] ? SCRIPT[last.id].text : '')) : 'No messages';
      return `<button class="ph-c" data-a="thread:${k}">${icon(ic)}<div><b>${n}</b><div class="ph-m">${esc(prev.replace('{call}', input.label('call')))}</div></div>${u ? `<span class="ph-badge">${u}</span>` : ''}</button>`;
    }).join('');
  }
  const amt = (v) => (v && typeof v === 'object' ? v.amount ?? v.left ?? v.owed ?? 0 : v || 0);
  function payView() {
    const w = game.wallet, hist = Array.isArray(w.history) ? w.history.map((x) => ({ ...x, t: x.t ?? x.h })) : S.pay;
    const tm = (t) => (typeof t === 'number' ? (t < 24 ? ui.fmtTime(t).replace(/<[^>]+>/g, '') : new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) : t || '');
    return head('NammaPay', '#9d8cff') + `<div class="ph-bal"><div class="ph-m">Balance</div><div class="bv">${inr(w.money)}</div>` +
      (w.debt != null ? `<div class="ph-kv"><span>Debt</span><b class="neg">${inr(amt(w.debt))}</b></div>` : '') + (w.loan != null ? `<div class="ph-kv"><span>Loan</span><b>${inr(amt(w.loan))}</b></div>` : '') + '</div>' +
      sec('Transactions', hist.length ? hist.slice(0, 40).map((x) => `<div class="ph-kv"><span>${esc(x.label)}<br><small class="ph-m">${tm(x.t)}</small></span><b class="${x.amount < 0 ? 'neg' : 'pos'}">${x.amount > 0 ? '+' : ''}${inr(x.amount)}</b></div>`).join('') : '<div class="ph-m">No payments yet.</div>');
  }
  // a QR made of noise, with three finder squares so it reads as one
  function qr(seed) {
    let s = seed * 9301 + 49297, h = '';
    for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
      const f = [[0, 0], [14, 0], [0, 14]].some(([a, b]) => x >= a && x < a + 7 && y >= b && y < b + 7);
      s = (s * 9301 + 49297) % 233280;
      const on = f ? [[0, 0], [14, 0], [0, 14]].some(([a, b]) => { const u = x - a, v = y - b; return u >= 0 && u < 7 && v >= 0 && v < 7 && (u === 0 || u === 6 || v === 0 || v === 6 || (u > 1 && u < 5 && v > 1 && v < 5)); }) : s / 233280 < 0.5;
      if (on) h += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
    return `<svg class="ph-qr" viewBox="-1 -1 23 23"><rect x="-1" y="-1" width="23" height="23" fill="#fff"/><g fill="#111">${h}</g></svg>`;
  }
  function metroView() {
    const p = focus(), st = [...world.stations].sort((a, b) => a.ex - b.ex);
    return head('Namma Metro', '#c27be0') + sec('Purple Line', `<div class="ph-line">${st.map((s) => `<div class="ph-st"><span class="dot"></span><div><b>${esc(s.name)}</b><div class="ph-m">${km(dist(p, { x: s.ex, z: s.ez }))}${s.elevated ? ' · elevated' : ' · underground'}</div></div>${routeBtn(s.ex, s.ez, s.name + ' Metro')}</div>`).join('')}</div>`) +
      sec('QR ticket', `${S.tickets ? `${qr(S.tickets)}<div class="ph-m">${S.tickets} ticket${S.tickets > 1 ? 's' : ''}. Scanned at the gate on your next ride: the token fare comes back.</div>` : '<div class="ph-m">One ride, any station. Skip the token queue.</div>'}${btn(`${icon('qr')} Buy QR ticket · ₹20`, 'ticket', 'go wide')}`);
  }
  function garageView() {
    const hp = Math.round(player.health), V = VEHICLE_STATS[player.type], yard = garage && garage.place ? garage.place : tow.yard;
    const status = tow.busy && !tow.impounded && tow.state.phase !== 'coming' ? 'On the tow truck' : tow.impounded ? 'Impounded' : player.broken ? 'Broken down' : hp < 35 ? 'Badly damaged' : hp < 70 ? 'Dented' : 'Running fine';
    let h = head('Garage', '#ffb300') + `<div class="ph-card">${icon(player.type)} <b>${V.label}</b> · ${status}<div class="ph-hb"><span style="width:${hp}%;background:${hp < 30 ? '#ff5252' : hp < 60 ? '#ffb300' : '#3ddc84'}"></span></div><div class="ph-m">Health ${hp}%${player.broken ? ` · press ${input.label('call')} for the mechanic` : ''}</div></div>`;
    if (tow.impounded) h += `<div class="ph-card surge">${icon('truck')} At <b>Namma Garage &amp; Impound</b>. Release fee ${inr(garage ? garage.fee() : 500)}: pay at the counter, take a garage loan, or earn it on foot first.<div class="ph-act">${routeBtn(yard.x, yard.z, 'Namma Garage & Impound')}</div></div>`;
    const own = garage && (garage.owned || garage.vehicles || []).map((v) => (typeof v === 'string' ? { type: v, health: v === player.type ? player.health : null } : v));
    h += sec('Your vehicles', Array.isArray(own) && own.length ? own.map((v) => `<div class="ph-kv"><span>${icon(v.type || v.kind || 'auto')} ${esc(v.name || v.label || VEHICLE_STATS[v.type || v.kind]?.label || 'Vehicle')}</span><b>${v.health != null ? Math.round(v.health) + '%' : ''}</b></div>`).join('') : '<div class="ph-m">Visit Namma Garage to buy and upgrade vehicles.</div>');
    return h + `<div class="ph-pad">${outside() ? btn(`${icon('pin')} Route to garage`, `route:${Math.round(yard.x)},${Math.round(yard.z)},${encodeURIComponent(yard.name || 'Garage')}`, 'wide') : ''}</div>`;
  }
  function missionsView() {
    if (!missions) return head('Missions', '#b388ff') + '<div class="ph-m">No missions yet.</div>';
    const L = missions.list(), st = { active: 'In progress', done: 'Done', new: 'Not started' };
    return head('Missions', '#b388ff') + sec('Story', L.map((m) => `<div class="ph-o">${icon(m.status === 'done' ? 'check' : 'flag')}<div><b>${esc(m.title)}</b><div class="ph-m">${CONTACTS[m.from] ? CONTACTS[m.from][0] : ''} · ${st[m.status]}</div></div>${m.status === 'new' && !L.some((x) => x.status === 'active') ? btn('Start', `mstart:${m.id}`, 'go') : m.status === 'active' ? btn('Drop', 'mdrop') : ''}</div>`).join(''));
  }
  const VIEWS = { Missions: missionsView, Maps: mapsView, Camera: camView, Messages: msgView, NammaPay: payView, Metro: metroView, Garage: garageView };

  let last = '';
  function render() {
    const html = !view.app ? homeView() : GIG[view.app] ? gigView(view.app) : VIEWS[view.app]();
    if (html === last) return;
    const top = scr.scrollTop, same = scr.dataset.v === view.app + '/' + view.sub;
    scr.innerHTML = last = html; scr.dataset.v = view.app + '/' + view.sub;
    scr.scrollTop = same ? top : 0;
  }
  function openApp(app, sub = null) {
    if (app === 'Settings') { overlays.open('settings', 'graphics'); return; }
    if (!overlays.has('phone')) overlays.open('phone');
    view.app = app; view.sub = sub; dirty = true; render();
  }
  function back() { if (view.sub != null) view.sub = null; else view.app = null; dirty = true; }

  const ACT = {
    mstart: (id) => missions && missions.start(id), mdrop: () => missions && missions.cancel(),
    app: (a) => openApp(a), back, clearN: () => { N.length = 0; },
    accept: (id) => accept(+id), hudAccept: () => game.acceptOffer(), switch: (k) => actions.setVehicle(k),
    walkNow: () => { game.walkGigNow && game.walkGigNow(); notify('Gigs', 'walk', 'Looking for on-foot jobs', 'An offer will pop up in a moment.', false); },
    route: (v) => { const [x, z, n] = v.split(','); const name = decodeURIComponent(n); navTo({ x: +x, z: +z, name }); notify('Maps', 'pin', 'Route set', `Follow the blue arrows to ${name}.`, false); },
    bigmap: () => openMap(), cam: startCam, photo: (id) => { view.sub = id; }, del: (id) => delPhoto(/^\d+$/.test(id) ? +id : id),
    thread: (c) => { view.sub = c; }, reply: (v) => { const [c, i, j] = v.split(','); reply(c, +i, +j); },
    ticket: () => {
      const w = game.wallet, ok = w.spend ? w.spend(20, 'Namma Metro QR ticket') : w.money >= 20 && ((w.money -= 20), true);
      if (!ok) { notify('Metro', 'metro', 'Not enough money', 'A QR ticket is ₹20.', false); return; }
      payLabel = 'Namma Metro QR ticket'; S.tickets++; save();
    },
  };
  // buttons never take focus, so Space (handbrake, jump) can't press them while you drive with the phone open
  el.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const [a, ...v] = b.dataset.a.split(':'); ACT[a] && ACT[a](v.join(':')); dirty = true; render();
  });
  $('phClose').innerHTML = icon('close'); $('phClose').onclick = () => overlays.close('phone');
  $('phHome').onclick = () => { view.app = null; view.sub = null; dirty = true; render(); };

  overlays.register('phone', {
    pass: true,
    show: () => { open = true; el.classList.add('on'); document.body.classList.add('phone-on'); ban.classList.remove('on'); bq.length = 0; dirty = true; render(); },
    hide: () => { open = false; el.classList.remove('on'); document.body.classList.remove('phone-on'); },
    key: (e) => { if (e.code === 'Backspace' && view.app) { back(); render(); return true; } return false; },
  });

  // ---------- watching the game ----------
  const seen = { rides: game.ride.rides, earned: game.ride.earned, money: game.wallet.money, imp: false, started: false, metro: false, inside: false, h: state.hours };
  let payLabel = '', playT = 0;
  function update(dt, dh, rawDt) {
    if ((saveT -= rawDt) < 0 && saveT > -1) { saveT = -9; flush(); }
    if (bT > 0 && (bT -= rawDt) <= 0) ban.classList.remove('on');
    if (bT <= 0 && bq.length && !open) setTimeout(nextBanner, 250), bT = 0.4;
    if (!state.started) { seen.started = false; return; }
    if (!seen.started) { seen.started = true; seen.money = game.wallet.money; seen.rides = game.ride.rides; seen.earned = game.ride.earned; seen.h = state.hours; if (!S.flags.intro) { S.flags.intro = 1; send('intro'); } }
    const r = game.ride, w = game.wallet;
    // a new day resets the shift and today's earnings
    if (S.gig.day !== state.day) { S.gig = { day: state.day, min: 0, apps: {} }; save(); }
    if (state.mode === 'drive') S.gig.min += dh * 60;
    for (const a in Q) if ((Q[a].t -= dt) <= 0) refill(a);
    // a finished job: what it paid and how it was rated
    if (r.rides > seen.rides) {
      const paid = r.earned - seen.earned, t = S.gig.apps[r.app] || (S.gig.apps[r.app] = { earned: 0, rides: 0 });
      t.earned += paid; t.rides++;
      S.ratings.unshift({ app: r.app, r: Math.round(r.rating), fare: paid, t: clock() }); S.ratings.length = Math.min(S.ratings.length, 40);
      payLabel = `${r.app} payout`;
      if (!S.flags.firstGig) { S.flags.firstGig = 1; setTimeout(() => send('firstGig'), 2500); }
      save();
    }
    seen.rides = r.rides; seen.earned = r.earned;
    // money changes, when the game doesn't keep its own history yet
    if (!Array.isArray(w.history) && Math.abs(w.money - seen.money) >= 1) {
      const d = w.money - seen.money;
      S.pay.unshift({ t: clock(), amount: d, label: payLabel || recent() || (d > 0 ? 'Received' : 'Paid') }); S.pay.length = Math.min(S.pay.length, 60); save();
    }
    seen.money = w.money; payLabel = '';
    // the tow, low energy, nightfall
    if (tow.impounded && !seen.imp) send('towed');
    seen.imp = tow.impounded;
    if (w.energy < 20 && S.lowDay !== state.day) { S.lowDay = state.day; send('lowEnergy'); }
    if (seen.h < 19.5 && state.hours >= 19.5 && S.nightDay !== state.day) { S.nightDay = state.day; send('night'); }
    seen.h = state.hours;
    // the coffee errand: Amma asks a little while in; walking into any darshini finishes it
    if ((playT += dt) > 40 && !S.flags.coffee) { S.flags.coffee = 1; send('coffee'); }
    const inside = state.mode === 'interior';
    if (inside && !seen.inside && S.missions.coffee === 'active') {
      const d = W.street && world.doors.find((x) => Math.hypot(x.x - W.street.x, x.z - W.street.z) < 0.5);
      if (d && d.theme === 'darshini') { S.missions.coffee = 'done'; save(); setTimeout(() => send('coffeeDone'), 3000); }
    }
    seen.inside = inside;
    // a QR ticket pays for the ride the station just charged a token for
    const metro = state.mode === 'metro';
    // (QR tickets are scanned at the station gates, src/venues.js)
    seen.metro = metro;
    if (document.body.classList.contains('phonecam') && !state.photo) document.body.classList.remove('phonecam');
    if (open) {
      $('phTime').textContent = clock();
      $('phStat').innerHTML = `${icon('battery')}${Math.round(w.energy)}%`;
      if ((drawT -= rawDt) <= 0 || dirty) { drawT = 0.25; dirty = false; render(); }
    }
  }
  // the toast that came with a money change names it ("Cutting Chai · ₹15", "Towed! ₹500 fine")
  let lastToast = { t: '', at: 0 };
  const showToast = ui.toast;
  ui.toast = (title, ...rest) => { lastToast = { t: strip(title), at: performance.now() }; showToast(title, ...rest); };
  const recent = () => (performance.now() - lastToast.at < 1500 ? lastToast.t : '');

  return {
    update, openApp, notify, message, get open() { return open; },
    toggle: () => (overlays.has('phone') ? overlays.close('phone') : overlays.open('phone')),
    S, Q,
  };
}
