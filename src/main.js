import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorld } from './world.js';
import { createSky, atmosphere } from './sky.js';
import { createWeather, WEATHER_ORDER, istHours } from './weather.js';
import { Player, createTraffic, createMetro, createParked, VEHICLE_STATS } from './vehicles.js';
import { createPeople, createCharacter } from './people.js';
import { createGame } from './game.js';
import { createInterior, MENUS } from './interior.js';
import { createMetroRide } from './metro-ride.js';
import { createNav } from './nav.js';
import { GAME } from './config.js';
import { createFlood } from './flood.js';
import { createEdges } from './edges.js';
import { createSignals } from './signals.js';
import { createLife } from './life.js';
import { createFx } from './fx.js';
import { createTow } from './tow.js';
import { createBeam } from './people.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { gpuInfo, createGpuTimer, instrumentPasses, createBenchmark } from './perf.js';
import { createInput } from './input.js';
import { createOverlays } from './overlay.js';
import { damp, clamp, angleLerp } from './util.js';
import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);
const WELCOME = {
  darshini: '"Yen beku saar?" The cashier is already writing your token.',
  restaurant: 'Banana leaves are being laid out. Meals are ready.',
  cafe: 'Lo-fi beats, fourteen MacBooks and one very serious barista.',
  bakery: 'Fresh egg puffs just came out of the oven.',
  pub: 'Bengaluru, pub capital of India. Kannada rap on the speakers.',
};

async function loadFonts() {
  const fonts = ['700 48px "Space Grotesk"', '500 24px "Space Grotesk"', '600 28px "Noto Sans Kannada"', '700 60px "Noto Sans Kannada"'];
  await Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f, 'Aಕನ್ನಡ'))), new Promise((r) => setTimeout(r, 3000))]).catch(() => {});
}

// the map is an index (roads, parks, metro, landmarks) plus one file per 220 m tile (buildings, places), from tools/tile_map.py
async function loadMap() {
  const get = (f) => fetch('data/map/' + f).then((r) => { if (!r.ok) throw new Error(`map ${f}: ${r.status}`); return r.json(); });
  const index = await get('index.json');
  const tiles = await Promise.all(Object.keys(index.tiles).map((k) => get(k + '.json')));
  return { ...index, buildings: tiles.flatMap((t) => t.buildings), pois: tiles.flatMap((t) => t.pois) };
}

async function init() {
  document.title = GAME.title; $('gameTitle').innerHTML = `${GAME.line1}<br><span>${GAME.line2}</span>`;
  const setLoading = (t) => { const l = $('loading'); if (l) l.textContent = t; };
  setLoading('Loading OpenStreetMap data…');
  const [data] = await Promise.all([loadMap(), loadFonts()]);
  setLoading(`Placing ${data.buildings.length.toLocaleString('en-IN')} buildings…`);
  await new Promise((r) => setTimeout(r, 30));
  const t0 = performance.now();

  const isTouch = matchMedia('(pointer: coarse)').matches;
  // Graphics presets. Every field is also its own setting in Settings; changing one makes it "Custom".
  // 'auto' starts on Medium, uses dynamic resolution first and only then moves between Low / Medium / High.
  const RES = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const snapRes = (v) => RES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const PRESETS = {
    low: { label: 'Low', res: 0.75, shadows: 0, ao: 'off', bloom: 'off', aa: 'fxaa', view: 'near', rain: 0.45, live: 'normal' },
    medium: { label: 'Medium', res: snapRes(Math.min(devicePixelRatio, 1)), shadows: 1024, ao: 'off', bloom: 'half', aa: 'msaa2', view: 'medium', rain: 0.75, live: 'normal' },
    high: { label: 'High', res: snapRes(Math.min(devicePixelRatio, 1.5)), shadows: 2048, ao: 'off', bloom: 'half', aa: 'msaa4', view: 'far', rain: 1, live: 'busy' },
    ultra: { label: 'Ultra', res: snapRes(Math.min(devicePixelRatio * 1.5, 2)), shadows: 4096, ao: 'full', bloom: 'full', aa: 'smaa', view: 'max', rain: 1.25, live: 'busy' },
  };
  const VIEW = { near: { far: 300, detail: 150, lod: 110 }, medium: { far: 420, detail: 200, lod: 160 }, far: { far: 520, detail: 270, lod: 230 }, max: { far: 700, detail: 360, lod: 320 } };
  // liveliness: share of the vehicle pool (200) and pedestrian pool (180) out on the streets
  const LIVE = { calm: { traffic: 0.4, people: 0.35 }, normal: { traffic: 0.7, people: 0.5 }, busy: { traffic: 0.85, people: 0.72 }, packed: { traffic: 1, people: 1 } };
  const derive = (c) => ({ ...c, ...VIEW[c.view], label: c.label || 'Custom', shadowEvery: c.shadows >= 2048 ? 1 : c.shadows ? 2 : 3, msaa: { off: 0, fxaa: 0, msaa2: 2, msaa4: 4, smaa: 4 }[c.aa], bloomScale: c.bloom === 'full' ? 1 : 0.5 });
  const TIER_ORDER = ['low', 'medium', 'high'];
  const quality = { mode: 'auto', tier: isTouch ? 'low' : 'medium', stats: false, dyn: 1, dynRes: true, cfg: null, d: null };
  try {
    const s = JSON.parse(localStorage.getItem('blr.gfx') || 'null');
    if (s && s.cfg && VIEW[s.cfg.view]) Object.assign(quality, { mode: s.mode, tier: s.tier || quality.tier, dynRes: s.dynRes !== false, cfg: s.cfg });
  } catch (e) { /* storage blocked: defaults */ }
  if (!quality.cfg) quality.cfg = { ...PRESETS[quality.tier] };
  quality.d = derive(quality.cfg);
  const tierCfg = () => quality.d;
  const basePR = () => quality.cfg.res * quality.dyn;
  // MSAA happens on the composer's render target, so the canvas itself needs none
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(basePR());
  renderer.info.autoReset = false;
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  $('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#b6d3ea', 60, 400);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.4, 2200);

  const sky = createSky(); scene.add(sky.mesh);
  const hemi = new THREE.HemisphereLight('#ffffff', '#3b342c', 0.8); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2.5);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 460 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5;
  scene.add(sun, sun.target);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, envHours = -99, envCloud = -1;

  const audio = createAudio();
  const world = buildWorld(scene, data);
  const weather = createWeather(scene);
  const traffic = createTraffic(scene, world, audio);
  const metro = createMetro(scene, world);
  const people = createPeople(scene, world);
  traffic.setPeds(people.peds);
  const player = new Player(scene);
  const interior = createInterior();
  const parked = createParked(scene, world);
  const fx = createFx(scene);
  const flood = createFlood(scene, world);
  const edges = createEdges(scene, world);
  const signals = createSignals(scene, world);
  const walker = createCharacter(scene, { shirt: '#b59b6a', pants: '#3b3b3b', skin: '#8d5a3b' });
  console.info(`[silicon-streets] world built in ${Math.round(performance.now() - t0)} ms`);
  const W = { pos: new THREE.Vector3(), yaw: 0, speed: 0, dir: [0, 1], street: null, place: null, y: 0, vy: 0, ground: true, ladder: null, mantle: null, peak: false };
  walker.root.visible = false;

  // spawn on MG Road, near the Brigade Road junction
  {
    const s = world.nearestRoad(600, -40, 400, (r) => r.n === 'Mahatma Gandhi Road') || world.nearestRoad(0, 0, 600);
    const o = s.r.o ? s.r.hw - 1.8 : s.r.w / 4;
    player.pos.set(s.x + s.dz * o, 0, s.z - s.dx * o);
    player.heading = Math.atan2(s.dx, s.dz); player.park();
  }

  const state = { quality, paused: false, hours: 17.5, timeSpeed: 60, weather: 'clear', live: false, vehicle: 'auto', camera: 'chase', mode: 'drive', photo: false, started: false };
  const actions = {
    setTime: (h) => { state.hours = h; if (state.live) setLive(false); },
    setTimeSpeed: (s) => { state.timeSpeed = s; if (state.live) setLive(false); ui.sync(state); },
    setWeather: (w) => { state.weather = w; weather.set(w); if (state.live) setLive(false); ui.sync(state); },
    setVehicle: (v) => {
      if (state.mode !== 'drive') { ui.toast('Get in first', `Walk to your vehicle and press ${K('vehicle')}.`, 'auto'); return; }
      state.vehicle = v; player.setType(v);
      ui.toast(VEHICLE_STATS[v].label, v === 'auto' ? 'Namma Auto ride requests on. Meter haaki!' : v === 'scooter' ? 'Swiggly / Zoomato delivery orders on.' : 'Oober trip requests on. Surge at rush hour and in rain.', v); ui.sync(state);
    },
    setCamera: (c) => { state.camera = c; ui.sync(state); },
    toggleLive: () => setLive(!state.live),
    setQuality: (mode) => {
      quality.mode = mode; quality.dyn = 1;
      applyTier(mode === 'auto' ? quality.tier : mode, false);
      ui.toast('Graphics', mode === 'auto' ? `Auto (now ${tierCfg().label})` : PRESETS[mode].label, 'gear'); ui.sync(state);
    },
    // one graphics option on its own: the preset becomes "Custom"
    setGfx: (key, v) => { quality.cfg = { ...quality.cfg, [key]: v, label: 'Custom' }; quality.mode = 'custom'; applyCfg(); },
    setLiveliness: (v) => { quality.cfg = { ...quality.cfg, live: v }; applyCfg(); ui.toast('Liveliness', ({ calm: 'Calm streets', normal: 'Normal Bengaluru', busy: 'Busy: more traffic and crowds', packed: 'Packed: peak Silk Board energy' })[v], 'signal'); },
    toggleDynRes: (on) => { quality.dynRes = on; if (!on) quality.dyn = 1; applyCfg(); },
    toggleStats: (on) => { quality.stats = on ?? !quality.stats; $('perf').classList.toggle('on', quality.stats); ui.sync(state); },
    volume: () => audio.volume, setVolume: (b, v) => audio.setVolume(b, v),
    pauseAction: (a) => pauseAction(a),
  };
  const input = createInput(), K = (a) => input.kbd(a);
  const ui = createUI(world, actions, input);
  const tow = createTow(scene, world, ui, audio);
  const hooks = {
    enterInterior: (door) => ui.fade(() => {
      W.street = { x: door.x, z: door.z, nx: door.nx, nz: door.nz };
      const sp = interior.enter(door.theme, door.name, !!world.ubc && Math.hypot(door.x - world.ubc.x, door.z - world.ubc.z) < 220);
      W.place = { name: door.name, theme: interior.theme };
      W.pos.set(sp.x, 0, sp.z); W.yaw = sp.yaw; camCtl.walkYaw = sp.yaw;
      interior.scene.add(walker.root); renderPass.scene = interior.scene;
      state.mode = 'interior'; document.body.classList.add('inside');
      ui.setZone({ name: door.name, kn: interior.menu.kn });
      setTimeout(() => ui.dialogue(WELCOME[interior.theme]), 500);
    }),
    exitInterior: () => ui.fade(() => {
      const s = W.street;
      W.pos.set(s.x + s.nx * 0.6, 0, s.z + s.nz * 0.6); W.yaw = Math.atan2(s.nx, s.nz); camCtl.walkYaw = W.yaw;
      scene.add(walker.root); renderPass.scene = scene; state.mode = 'walk'; document.body.classList.remove('inside');
    }),
    rest: (h, e, text) => ui.fade(() => { state.hours = (state.hours + h) % 24; game.wallet.energy = Math.min(100, game.wallet.energy + e); ui.toast(`+${h >= 1 ? h + ' hour' : h * 60 + ' min'}`, text, 'hourglass'); }, 'Time passes…'),
    // a real ride: platform → viaduct/tunnel → arrival, then out onto the street
    travel: (st, from) => ui.fade(() => {
      state.mode = 'metro'; walker.root.visible = false; document.body.classList.add('inside');
      ui.toast('Namma Metro', `${K('camera')} switches the view, ${K('interact')} skips the ride.`, 'metro');
      ride.start(from, st, () => ui.fade(() => {
        renderPass.scene = scene; state.mode = 'walk'; walker.root.visible = true; document.body.classList.remove('inside');
        W.pos.set(st.ex + 1.5, 0, st.ez + 1.5); state.hours = (state.hours + 0.1) % 24;
        ui.toast('Namma Metro', `You got off at <b>${st.name}</b>. Press ${K('call')} to call your vehicle.`, 'metro');
      }));
    }, 'Namma Metro'),
  };
  const game = createGame(scene, world, people, ui, audio, hooks);
  const ride = createMetroRide(scene, world, ui, audio);
  const life = createLife(scene, world, ui, audio);
  state.day = life.startDay;
  // GPS: jobs set the destination automatically, the map (M) lets you drop your own pin
  const nav = createNav(scene, world);
  const pinBeam = createBeam(scene, '#ff4d6d'); pinBeam.visible = false;
  let jobKey = '';
  const places = [
    ...world.stations.map((s) => ({ name: `${s.name} Metro`, x: s.ex, z: s.ez, icon: 'metro' })),
    ...(world.vidhana ? [{ name: 'Vidhana Soudha', x: world.vidhana.fx, z: world.vidhana.fz, icon: 'landmark' }] : []),
    ...(world.stadium ? [{ name: 'Chinnaswamy Stadium', x: world.stadium.x, z: world.stadium.z + world.stadium.r + 15, icon: 'cricket' }] : []),
    ...(world.ubc ? [{ name: 'UB City', x: world.ubc.x, z: world.ubc.z, icon: 'city' }] : []),
    ...game.spots.filter((s) => !/Metro|Vidhana|Chinnaswamy|UB City/.test(s.name)).map((s) => ({ ...s, icon: 'road' })),
    ...world.doors.filter((d) => /cafe|darshini|pub/.test(d.theme) && !/^(Sri Sai|Namma|Fourth|Swalpa|Malleshwaram|Peak|Dosa|Ctrl|Iyengar)/i.test(d.name)).slice(0, 12).map((d) => ({ name: d.name, x: d.x, z: d.z, icon: d.theme === 'pub' ? 'beer' : 'coffee' })),
  ];
  // everything you can search for on the big map
  const searchIndex = (() => {
    const out = [...places.map((p) => ({ ...p, kind: 'Place' }))], seen = new Set(out.map((p) => p.name));
    for (const r of world.roads) {
      if (!r.n || seen.has(r.n) || !(r.drive || r.k === 'pedestrian')) continue;
      seen.add(r.n); const p = r.pts[Math.floor(r.pts.length / 2)];
      out.push({ name: r.n, x: p[0], z: p[1], icon: 'road', kind: 'Road' });
    }
    for (const d of world.doors) { if (seen.has(d.name)) continue; seen.add(d.name); out.push({ name: d.name, x: d.x, z: d.z, icon: d.theme === 'pub' ? 'beer' : d.theme === 'bakery' ? 'bakery' : 'food', kind: d.road ? `on ${d.road}` : 'Food' }); }
    for (const a of world.parks) if (a.n && !seen.has(a.n)) { seen.add(a.n); const [x, z] = a.pts[0]; out.push({ name: a.n, x, z, icon: 'tree', kind: 'Park' }); }
    for (const b of world.buildings) if (b.name && !seen.has(b.name)) { seen.add(b.name); out.push({ name: b.name, x: b.cx, z: b.cz, icon: 'building', kind: 'Building' }); }
    return out;
  })();
  $('minimap').addEventListener('click', () => { if (state.started) openMap(); });
  function navTo(t) { const f = state.mode === 'drive' ? player.pos : W.pos; nav.setTarget(t, f, state.mode === 'drive' ? 'drive' : 'walk'); pinBeam.visible = t.name === 'Dropped pin'; if (pinBeam.visible) pinBeam.position.set(t.x, 0, t.z); }
  function openMap() { if (state.mode !== 'interior' && state.mode !== 'metro') overlays.open('map'); }
  function showMap() {
    const f = state.mode === 'drive' ? player.pos : W.pos;
    ui.openMap({ focus: { x: f.x, z: f.z, heading: state.mode === 'drive' ? player.heading : W.yaw }, markers: game.markers(), route: nav.route, places, search: searchIndex,
      onPick: (p) => { navTo(p); ui.toast('Route set', `Follow the blue arrows to <b>${p.name}</b>.`, 'pin'); },
      onClear: () => { nav.clear(); pinBeam.visible = false; } });
  }
  ui.sync(state);

  // ---------- overlays: pause → settings / map, café menus, photo mode ----------
  const overlays = createOverlays(state);
  ui.onClosed = (n) => overlays.close(n, true);
  ui.onOpened = (n) => overlays.open(n);
  const clockText = () => ui.fmtTime(state.hours).replace(/<[^>]+>/g, '');
  overlays.register('pause', { show: () => ui.showPause(`${$('locName').textContent} · ${clockText()}`), hide: ui.hidePause, key: ui.pauseKey });
  overlays.register('settings', { show: (t) => ui.showSettings(t), hide: ui.hideSettings, key: ui.settingsKey });
  overlays.register('map', { show: showMap, hide: ui.closeMap, key: (e) => input.is(e.code, 'map') && (overlays.close('map'), true) });
  overlays.register('menu', { hide: ui.closeMenu, key: ui.menuKey });
  overlays.register('photo', { show: enterPhoto, hide: exitPhoto, key: (e) => input.is(e.code, 'photo') && (overlays.close('photo'), true) });
  function pauseAction(a) {
    if (a === 'open') overlays.open('pause');
    else if (a === 'resume') overlays.close('pause');
    else if (a === 'map') { overlays.close('pause'); openMap(); }
    else if (a === 'settings') overlays.open('settings', 'graphics');
    else if (a === 'controls') overlays.open('settings', 'controls');
    else if (a === 'save') $('pauseSub').textContent = saveGame() ? `Saved at ${clockText()}. Continue from the title screen next time.` : 'Could not save: browser storage is blocked.';
    else if (a === 'quit') quitToTitle();
  }

  // ---------- save / load: one slot in this browser ----------
  function saveGame() {
    const p = player.pos;
    try { localStorage.setItem('blr.save', JSON.stringify({ v: 1, hours: state.hours, day: state.day, weather: state.weather, vehicle: player.type, pos: [p.x, p.z, player.heading], wallet: { ...game.wallet }, found: game.found })); return true; } catch (e) { return false; }
  }
  function loadGame() {
    let s = null; try { s = JSON.parse(localStorage.getItem('blr.save') || 'null'); } catch (e) { /* storage blocked */ }
    if (!s || s.v !== 1) return false;
    Object.assign(game.wallet, s.wallet); state.hours = s.hours; state.day = s.day; state.weather = s.weather; weather.set(s.weather);
    state.vehicle = s.vehicle; player.setType(s.vehicle); player.pos.set(s.pos[0], 0, s.pos[1]); player.heading = s.pos[2]; player.park(); game.restore(s.found);
    ui.sync(state); return true;
  }
  function quitToTitle() {
    overlays.clear(); state.started = false; document.body.classList.remove('playing');
    $('start').classList.remove('gone'); $('startBtn').innerHTML = `${icon('play')} Resume`; $('newBtn').classList.remove('on');
  }

  let liveTimer = null;
  async function refreshLive() {
    try {
      const kind = await weather.fetchLive();
      state.weather = kind; weather.set(kind); ui.sync(state);
      ui.toast('Live Bengaluru', `It's ${weather.state.temp}°C and ${kind} in Bengaluru right now.`, 'live');
    } catch (e) { ui.toast('Live weather unavailable', 'Using real IST time only.', 'live'); }
  }
  function setLive(on) {
    state.live = on; clearInterval(liveTimer);
    if (on) { state.timeSpeed = 1; refreshLive(); liveTimer = setInterval(refreshLive, 10 * 60 * 1000); }
    ui.sync(state);
  }

  // ---------- post ----------
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: tierCfg().msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(basePR());
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.55, 0.92);
  // bloom is blurry anyway: run its mip chain at reduced resolution
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSetSize(Math.max(1, Math.round(w * tierCfg().bloomScale)), Math.max(1, Math.round(h * tierCfg().bloomScale)));
  // ambient occlusion: soft contact shadows where walls meet roads, under vehicles and awnings
  const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.updateGtaoMaterial({ radius: 3.5, distanceExponent: 1, thickness: 6, scale: 2.6, samples: 16, distanceFallOff: 1 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  gtao.blendIntensity = 0.9;
  const gtaoSetSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w, h) => { const s = tierCfg().ao === 'half' ? 0.5 : 1; gtaoSetSize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))); };
  composer.insertPass(gtao, 1);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // anti-aliasing after tone mapping: FXAA (cheap) on Low, SMAA on top of MSAA on Ultra
  const fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa);
  const smaa = new SMAAPass(innerWidth, innerHeight); composer.addPass(smaa);
  // GPU time per pass, measured only while the F3 overlay or the benchmark is on
  const gpu = gpuInfo(renderer), gpuT = createGpuTimer(renderer);
  let timing = false;
  instrumentPasses(renderer, composer, gpuT, () => timing);
  function onResize() {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
    const pr = renderer.getPixelRatio(); fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
  }
  renderer.shadowMap.autoUpdate = false;
  // pick a preset; auto keeps your liveliness choice when it moves between presets
  function applyTier(name, keepLive = true) {
    if (!PRESETS[name]) return;
    quality.tier = name;
    quality.cfg = { ...PRESETS[name], ...(keepLive ? { live: quality.cfg.live } : {}) };
    applyCfg();
  }
  function applyCfg() {
    const c = quality.d = derive(quality.cfg);
    renderer.setPixelRatio(basePR()); composer.setPixelRatio(basePR());
    for (const t of [composer.renderTarget1, composer.renderTarget2]) { t.samples = c.msaa; t.dispose(); }
    sun.castShadow = c.shadows > 0;
    const size = c.shadows || 1024, ext = size >= 4096 ? 120 : 80;
    if (sun.shadow.mapSize.x !== size || sun.shadow.camera.right !== ext) {
      sun.shadow.mapSize.set(size, size); Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext }); sun.shadow.camera.updateProjectionMatrix();
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    bloom.enabled = c.bloom !== 'off'; gtao.enabled = c.ao !== 'off';
    fxaa.enabled = c.aa === 'fxaa'; smaa.enabled = c.aa === 'smaa';
    weather.state.density = c.rain;
    camera.far = Math.max(c.far + 400, 1250); camera.updateProjectionMatrix();
    onResize(); renderer.shadowMap.needsUpdate = true;
    try { localStorage.setItem('blr.gfx', JSON.stringify({ mode: quality.mode, tier: quality.tier, dynRes: quality.dynRes, cfg: quality.cfg })); } catch (e) { /* private mode */ }
    ui.sync(state);
  }
  function setDyn(v) { if (Math.abs(v - quality.dyn) < 0.01) return; quality.dyn = v; renderer.setPixelRatio(basePR()); composer.setPixelRatio(basePR()); onResize(); }
  // auto quality: judge real frame rate over 2 s windows
  const autoQ = { acc: 0, n: 0, good: 0, ceiling: null, ignore: 5 };
  ui.fade.onStart = () => { autoQ.ignore = 2; };
  function autoQuality(rawDt) {
    if (autoQ.ignore > 0) { autoQ.ignore -= rawDt; autoQ.acc = autoQ.n = 0; return; }
    if ((quality.mode !== 'auto' && !quality.dynRes) || rawDt > 0.25 || document.hidden) return;
    autoQ.acc += rawDt; autoQ.n++;
    if (autoQ.acc < 2) return;
    const fps = autoQ.n / autoQ.acc; autoQ.acc = 0; autoQ.n = 0;
    // dynamic resolution first: trade a few pixels before dropping any effect
    if (quality.dynRes) {
      if (fps < 52 && quality.dyn > 0.6) { setDyn(Math.max(0.6, quality.dyn - 0.1)); return; }
      if (fps > 58 && quality.dyn < 1) { setDyn(Math.min(1, quality.dyn + 0.05)); return; }
    }
    if (quality.mode !== 'auto') return;
    const i = TIER_ORDER.indexOf(quality.tier);
    if (fps < 42 && i > 0) { autoQ.ceiling = quality.tier; autoQ.good = 0; quality.dyn = 1; applyTier(TIER_ORDER[i - 1]); ui.toast('Auto graphics', `Dropped to ${tierCfg().label} (${Math.round(fps)} fps)`, 'gear'); }
    else if (fps > 58 && i >= 0 && i < 2 && TIER_ORDER[i + 1] !== autoQ.ceiling) { if (++autoQ.good >= 3) { autoQ.good = 0; applyTier(TIER_ORDER[i + 1]); } }
    else autoQ.good = 0;
  }
  addEventListener('resize', onResize);

  // ---------- input ----------
  const ctl = { throttle: 0, steer: 0, handbrake: false, fwd: 0, side: 0, run: false };
  const touch = { l: false, r: false, up: false, dn: false };
  const camCtl = { yaw: 0, walkYaw: 0, pitch: 0.2, dragging: false, idle: 0, zoom: 1 };
  function toggleVehicle() {
    if (state.mode === 'drive') {
      if (Math.abs(player.speed) > 3) { ui.toast('Slow down first', 'Stop before you get out.', 'warning'); return; }
      player.park();
      const lx = Math.cos(player.heading), lz = -Math.sin(player.heading);
      const p = { x: player.pos.x + lx * (player.radius + 0.7), z: player.pos.z + lz * (player.radius + 0.7) };
      world.collide(p, 0.35);
      W.pos.set(p.x, 0, p.z); W.yaw = player.heading; W.speed = 0; camCtl.walkYaw = player.heading;
      walker.root.visible = true; state.mode = 'walk'; player.setOccupied(false);
      ui.toast('On foot', `Walk into cafés, buy from carts, take the metro. ${K('vehicle')} near your vehicle to drive, ${K('call')} to call it.`, 'walk');
    } else if (state.mode === 'walk') {
      if (W.y > 1 || W.pos.distanceTo(player.pos) > player.radius + 2.6) { ui.toast('Too far from your vehicle', `Press ${K('call')} to call it to the nearest road.`, 'phone'); return; }
      if (tow.busy) { ui.toast('Too late', 'It is already on the tow truck.', 'truck'); return; }
      if (tow.impounded) { tow.release(); ui.toast('Released from the tow yard', 'Fine already paid. Park properly next time, saar.', 'receipt'); }
      walker.root.visible = false; state.mode = 'drive'; camCtl.yaw = 0; player.setOccupied(true);
    }
  }
  function summon() {
    if (state.mode === 'drive' && player.broken) {
      // roadside mechanic: a fade, a bill, a working vehicle
      ui.fade(() => {
        const cost = Math.min(150, game.wallet.money); game.wallet.money -= cost; player.repair(); state.hours = (state.hours + 0.25) % 24;
        ui.toast('Mechanic anna fixed it', cost >= 150 ? '₹150. "Next time drive slow, saar."' : `₹${cost}. "Pay the rest next time, anna."`, 'wrench');
      }, 'Mechanic anna is fixing it…');
      return;
    }
    if (state.mode !== 'walk' || tow.busy) return;
    if (tow.impounded) {
      if (game.wallet.money < 500) { ui.toast('Need ₹500', 'Delivery from the tow yard costs ₹500. Or walk there and collect it.', 'cash'); return; }
      game.wallet.money -= 500; tow.release(); ui.toast('Delivered from the tow yard', '₹500 paid.', 'truck');
    }
    const nr = world.nearestRoad(W.pos.x, W.pos.z, 80);
    if (!nr) { ui.toast('No road nearby', 'Walk closer to a street.', 'road'); return; }
    const side = ((W.pos.x - nr.x) * nr.dz - (W.pos.z - nr.z) * nr.dx) >= 0 ? 1 : -1, o = nr.r.hw - 1.4;
    player.pos.set(nr.x + nr.dz * o * side, 0, nr.z - nr.dx * o * side); player.heading = Math.atan2(nr.dx * side, nr.dz * side); player.park();
    ui.toast(`${VEHICLE_STATS[player.type].label} called`, `It is waiting by the road. Walk over and press ${K('vehicle')}.`, 'phone');
  }
  // every key goes through the overlay stack first (pause, settings, map, menu, photo); only gameplay keys reach the keymap
  addEventListener('keydown', (e) => {
    if (overlays.key(e)) return;
    if (e.code === 'Tab') { e.preventDefault(); return; } // free: reserved for the in-game phone
    if (!state.started) return;
    if (/^F\d+$/.test(e.code) && input.actionsFor(e.code).length) e.preventDefault();
    if (state.mode === 'metro') { if (!e.repeat && input.is(e.code, 'camera')) ride.toggleView(); else if (!e.repeat && input.is(e.code, 'interact')) ride.skip(); return; }
    input.keydown(e);
  });
  // one-shot actions, read once per frame (keyboard and gamepad alike)
  const cycle = (list, v) => list[(list.indexOf(v) + 1) % list.length];
  const ONE = {
    horn: () => state.mode === 'drive' && audio.horn(player.type),
    camera: () => actions.setCamera(cycle(['chase', 'first', 'cine'], state.camera)),
    switchVehicle: () => actions.setVehicle(cycle(['auto', 'scooter', 'car'], state.vehicle)),
    interact: () => game.interact(ctx()),
    vehicle: () => state.mode !== 'interior' && toggleVehicle(),
    call: () => summon(),
    photo: () => state.mode !== 'interior' && overlays.open('photo'),
    timeSpeed: () => { actions.setTimeSpeed(cycle([0, 1, 60, 360], state.timeSpeed)); ui.toast('Time', state.timeSpeed ? `${state.timeSpeed}× speed` : 'Paused', 'timer'); },
    weather: () => actions.setWeather(cycle(WEATHER_ORDER, state.weather)),
    live: () => actions.toggleLive(),
    map: () => openMap(),
    mute: () => { const m = audio.toggleMute(); ui.toast(m ? 'Muted' : 'Sound on', '', m ? 'mute' : 'sound'); },
    controls: () => overlays.open('settings', 'controls'),
    dismiss: () => ui.dismissAll(),
    radio: () => state.mode === 'drive' && life.radioNext(),
    accept: () => game.acceptOffer(),
    decline: () => game.declineOffer(),
    stats: () => actions.toggleStats(),
  };
  function handlePresses() {
    if (state.started && !state.paused && !overlays.top() && state.mode !== 'metro') for (const a in ONE) if (input.pressed(a)) ONE[a]();
    input.flush();
  }
  // gamepad: Start pauses, B backs out of a layer, A clicks the focused button, the d-pad walks menus
  const esc = { code: 'Escape', preventDefault() {} };
  function padButton(i) {
    if (i === 9) { if (state.started) overlays.key(esc); return true; }
    if (!overlays.top()) return false;
    if (i === 1) overlays.key(esc);
    else if (i === 0) document.activeElement && document.activeElement.click && document.activeElement.click();
    else if (i === 12 || i === 13) overlays.key({ code: i === 12 ? 'ArrowUp' : 'ArrowDown', preventDefault() {} });
    return true;
  }
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', (e) => { if (!state.photo && e.pointerType === 'mouse') { camCtl.dragging = true; cv.setPointerCapture(e.pointerId); } });
  cv.addEventListener('pointerup', () => { camCtl.dragging = false; });
  cv.addEventListener('pointermove', (e) => {
    if (!camCtl.dragging || state.paused) return;
    if (state.mode === 'drive') camCtl.yaw -= e.movementX * 0.006; else camCtl.walkYaw -= e.movementX * 0.006;
    camCtl.pitch = clamp(camCtl.pitch + e.movementY * 0.004, -0.5, 1.25); camCtl.idle = 0;
  });
  cv.addEventListener('wheel', (e) => { camCtl.zoom = clamp(camCtl.zoom + Math.sign(e.deltaY) * 0.12, 0.5, 3.2); }, { passive: true });
  if (isTouch) {
    document.body.classList.add('touch');
    const TAP = { h: () => ONE.horn(), e: () => (state.mode === 'metro' ? ride.skip() : ONE.interact()), f: () => ONE.vehicle(), call: () => summon(), map: () => openMap(), pause: () => overlays.open('pause') };
    for (const b of document.querySelectorAll('#touch [data-k]')) {
      const k = b.dataset.k; b.innerHTML = icon(b.dataset.i);
      const set = (v) => (e) => { e.preventDefault(); if (k in touch) touch[k] = v; else if (v && state.started) TAP[k](); };
      b.addEventListener('pointerdown', set(true)); b.addEventListener('pointerup', set(false)); b.addEventListener('pointerleave', set(false));
    }
  }
  const active = () => state.started && !state.photo && !state.paused && !overlays.top();
  function readInput() {
    const p = input.pad;
    const kf = (input.down('forward') || touch.up ? 1 : 0) - (input.down('back') || touch.dn ? 1 : 0);
    const ks = (input.down('right') || touch.r ? 1 : 0) - (input.down('left') || touch.l ? 1 : 0);
    const on = active() && state.mode === 'drive';
    // driving: left stick steers, right trigger throttle, left trigger brake; on foot the stick walks
    ctl.throttle = on ? clamp(kf + p.rt - p.lt, -1, 1) : 0;
    ctl.steer = on ? clamp(ks + p.x, -1, 1) : 0;
    ctl.handbrake = on && input.down('jump');
    ctl.fwd = clamp(kf - p.y, -1, 1); ctl.side = clamp(ks + p.x, -1, 1);
    ctl.run = input.down('run');
    if (active() && (p.rx || p.ry)) { if (state.mode === 'drive') camCtl.yaw -= p.rx * 0.05; else camCtl.walkYaw -= p.rx * 0.05; camCtl.pitch = clamp(camCtl.pitch + p.ry * 0.03, -0.5, 1.25); camCtl.idle = 0; }
  }
  const ctx = () => ({ rush: (state.hours >= 8.5 && state.hours < 11) || (state.hours >= 17.5 && state.hours < 21), raining: weather.state.rain > 0.3, mode: state.mode, player, walker: W, interior, place: W.place, menu: W.place && interior.menu, running: state.mode !== 'drive' && ctl.run && W.speed > 3, extraPrompt: extraPrompt() });
  function extraPrompt() {
    if (state.mode === 'walk' && W.pos.distanceTo(player.pos) < player.radius + 2.6) return `Press ${K('vehicle')} to get in your ${VEHICLE_STATS[player.type].label.toLowerCase()}`;
    return null;
  }

  // ---------- events ----------
  const cool = {};
  const once = (k, s) => { const n = performance.now(); if ((cool[k] || 0) > n) return false; cool[k] = n + s * 1000; return true; };
  let shake = 0;
  const ev = {
    // every kind of thing you hit feels and costs different
    crash(v, tag, hit) {
      const p = player.pos, k = Math.max(0, v - 3), sx = p.x - (hit ? hit.nx : 0) * player.radius, sz = p.z - (hit ? hit.nz : 0) * player.radius;
      const SPEC = {
        building: [3.2, 'concrete', 'crash'], landmark: [3.2, 'concrete', 'crash'], edge: [3, 'concrete', 'crash'], deck: [3, 'concrete', 'crash'],
        pole: [2.8, 'metal', 'clang'], pillar: [3.4, 'concrete', 'crash'], tree: [2.2, 'leaves', 'thud'], parked: [2, 'glass', 'crash'],
        vehicle: [2.4, 'glass', 'crash'], barricade: [1.4, 'drum', 'thud'], bench: [1.2, 'wood', 'thud'], prop: [1.6, 'wood', 'thud'], cow: [0.8, null, 'thud'],
      };
      const [mul, debris] = SPEC[tag] || [2, 'concrete'];
      const dmg = k * mul * (tag === 'vehicle' && hit && hit.v && hit.v.type === 'bus' ? 1.6 : 1) * (player.type === 'car' ? 0.7 : player.type === 'scooter' ? 1.3 : 1);
      shake = Math.min(1.2, v / 10); audio.crash(Math.min(1, v / 10)); game.onCrash();
      if (debris) fx.burst(debris, sx, 0.8, sz, Math.min(30, 6 + k * 3), { dx: player.vel.x, dz: player.vel.y, spread: 2 + k * 0.4 });
      if (v > 6 && tag !== 'tree' && tag !== 'cow') fx.burst('sparks', sx, 0.6, sz, Math.min(24, k * 3));
      if (tag === 'tree') fx.burst('leaves', p.x, 3.5, p.z, 20, { spread: 4, up: 1 });
      player.damage(dmg);
      if (player.broken && once('broke', 5)) ui.toast('Your vehicle broke down', `Press ${K('call')} to call a roadside mechanic (₹150).`, 'crash');
      else if (player.health < 35 && once('lowhp', 25)) ui.toast('Badly damaged', `Health ${Math.round(player.health)}%. Steering is pulling, engine is smoking.`, 'warning');
      if (tag === 'cow') { audio.moo(); if (once('cow', 8)) ui.toast('The cow does not care.', 'Cows have right of way in Bengaluru. Always.', 'cow'); }
      else if (tag === 'vehicle' && hit && hit.v) {
        hit.v.dazed = 4; hit.v.speed = 0;
        const LINES = ['"Oye! Kannu kaanalva?"', '"Saar! New car, saar! Insurance ide na?"', '"Yen guru, driving school yelli kalitidiya?"', '"Ayyo! My mirror!"'];
        if (once('veh', 4)) ui.toast(`${LINES[Math.floor(Math.random() * LINES.length)]}`, `The ${hit.v.type === 'bus' ? 'BMTC driver' : 'other driver'} is not happy. −${Math.round(dmg)}% vehicle health`, 'chat');
        game.wallet.respect = Math.max(0, game.wallet.respect - Math.min(6, k));
      } else if (tag === 'parked' && once('alarm', 6)) { audio.alarm && audio.alarm(); ui.toast('Car alarm!', 'Owner from the balcony: "YAARU ADU?!"', 'siren'); }
      else if (tag === 'pole' && once('pole', 10)) ui.toast('You hit a lamp post', 'The cables above are swinging. BESCOM will hear about this.', 'bulb');
    },
    // hitting a person: they go down, the street turns on you, and it costs respect (and money if police are near)
    hitPed(p, speed) {
      shake = 0.8; audio.bump(1); fx.burst('concrete', p.x, 0.3, p.z, 8, { spread: 1.5, up: 1 });
      player.damage(3);
      const loss = Math.round(10 + Math.min(15, speed));
      game.wallet.respect = Math.max(0, game.wallet.respect - loss);
      const cop = signals.list.some((s) => s.cop && Math.hypot(s.x - p.x, s.z - p.z) < 160);
      if (cop) { game.wallet.money = Math.max(0, game.wallet.money - 500); ui.toast('Police: ₹500 fine', '"You hit a pedestrian! Licence-u kodi. Next time it\'s the station."', 'police'); }
      const SHOUT = ['"Yenu madtha idiya?! Kannu ilva?!"', '"Somebody call the police!"', '"Hey! Stop the auto! STOP!"', '"Ayyo! Are you okay, saar?"'];
      ui.toast('You knocked someone down', `${SHOUT[Math.floor(Math.random() * SHOUT.length)]} Respect −${loss}`, 'medic');
      if (game.ride.state === 'riding') { game.cancel(); ui.dialogue(`${game.ride.kind === 'scooter' ? 'Customer (on the phone)' : 'Passenger'}: "That's it, I'm reporting you. Stop here!"`); }
      audio.cheer && audio.cheer();
    },
    tumble(p, vx, vz) { if (phys) phys.tumble(p, vx, vz); },
    pothole(v) { shake = 0.5; audio.bump(Math.min(1, v / 10)); game.onPothole(); if (once('pot', 20)) ui.toast('Pothole!', 'Welcome to Bengaluru roads. Your spine says hi.', 'pothole'); },
    pedestrian() { if (once('ped', 6)) ui.toast('"Oi! Nodkond hogi!"', 'Watch where you\'re going.', 'walk'); },
    honked() { if (once('honk', 7)) ui.toast('Honk honk!', '"Move aagi, anna! Signal green aagide!"', 'horn'); },
  };
  // Rapier loads in the background (a 2 MB WebAssembly module); until then the simple collisions are used
  let phys = null;
  import('./physics.js').then((m) => m.createPhysics(scene, world)).then((p) => { phys = p; console.info('[silicon-streets] physics ready'); })
    .catch((e) => console.warn('[silicon-streets] physics unavailable, using simple collisions', e));
  const npcCollide = { collidePlayer: (p, r) => traffic.collidePlayer(p, r) || people.collideCows(p, r) };

  // ---------- photo mode ----------
  let orbit = null;
  function enterPhoto() {
    $('photoHint').innerHTML = `Drag to orbit · scroll to zoom · ${K('photo')} or <kbd>Esc</kbd> to exit`;
    state.photo = true; document.body.classList.add('photo');
    const f = state.mode === 'drive' ? player.pos : W.pos;
    orbit = new OrbitControls(camera, cv); orbit.target.set(f.x, 1.2, f.z); orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI * 0.49; orbit.maxDistance = 80;
    $('pcLoc').textContent = `${world.zoneAt(f.x, f.z).name} · ${ui.fmtTime(state.hours).replace(/<[^>]+>/g, '')}`;
  }
  function exitPhoto() { state.photo = false; document.body.classList.remove('photo'); orbit && orbit.dispose(); orbit = null; }
  $('exitPhoto').onclick = () => overlays.close('photo');
  $('savePhoto').onclick = () => {
    composer.render();
    const src = renderer.domElement, Wd = 1600, H = Math.round(1600 * src.height / src.width);
    const c = document.createElement('canvas'); c.width = Wd + 60; c.height = H + 170;
    const x = c.getContext('2d');
    x.fillStyle = '#fbf7ee'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 30, 30, Wd, H);
    x.fillStyle = '#1a1a1a'; x.font = '700 44px "Space Grotesk"'; x.fillText('Greetings from', 40, H + 95);
    x.fillStyle = '#d4380d'; x.font = '700 52px "Noto Sans Kannada"'; x.fillText('ನಮ್ಮ ಬೆಂಗಳೂರು', 400, H + 98);
    x.fillStyle = '#555'; x.font = '500 26px "Space Grotesk"'; x.fillText($('pcLoc').textContent + '  ·  ' + GAME.title, 40, H + 140);
    const a = document.createElement('a'); a.download = 'silicon-streets-postcard.png'; a.href = c.toDataURL('image/png'); a.click();
  };

  // ---------- start ----------
  $('loading').remove();
  // the key list here comes from the keymap, so it always matches your bindings
  const startKeys = () => { $('startKeys').innerHTML = [[['forward', 'left', 'back', 'right'], 'drive / walk'], [['vehicle'], 'get out / get in'], [['horn'], 'horn (mandatory)'], [['interact'], 'interact'], [['switchVehicle'], 'auto / scooter / car'], [['map'], 'map'], [['photo'], 'postcard photo'], [['controls'], 'all controls']].map(([as, l]) => `<div>${as.map(K).join('')} ${l}</div>`).join('') + '<div><kbd>Esc</kbd> pause · settings</div>'; };
  startKeys(); ui.onKeysChanged = startKeys;
  const hasSave = (() => { try { return !!localStorage.getItem('blr.save'); } catch (e) { return false; } })();
  let begun = false;
  function begin(load) {
    audio.start(); state.started = true; $('start').classList.add('gone'); document.body.classList.add('playing');
    if (begun) return; begun = true;
    if (load && loadGame()) setTimeout(() => ui.toast('Welcome back', 'Your saved game is loaded.', 'save'), 600);
    else setTimeout(() => ui.toast('Namaskara!', `You're an auto driver on MG Road. ${K('vehicle')} to get out and walk, ${K('controls')} for controls, <kbd>Esc</kbd> to pause.`, 'auto'), 600);
  }
  $('startBtn').disabled = false; $('startBtn').innerHTML = hasSave ? `${icon('play')} Continue` : 'Start roaming';
  $('startBtn').onclick = () => begin(hasSave);
  if (hasSave) { $('newBtn').classList.add('on'); $('newBtn').onclick = () => begin(false); }

  // ---------- loop ----------
  const clock = new THREE.Clock();
  let t = 0, lastZoneName = '';
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
  camera.position.set(player.pos.x - 30, 25, player.pos.z + 30);

  function chaseCam(dt, px, pz, yaw, dist, baseH, lookH, clampFn) {
    const p = camCtl.pitch;
    const cosP = Math.cos(Math.max(p, 0)), sinP = Math.sin(p);
    // near walls: first lift the camera, then pull it in, never closer than ~2 m; ease the change
    let k = 1;
    if (!clampFn) for (; k > 0.5; k -= 0.06) {
      const cx = px - Math.sin(yaw) * dist * cosP * k, cz = pz - Math.cos(yaw) * dist * cosP * k;
      if (!world.solidAt(cx, cz, baseH + dist * sinP * k + (1 - k) * 6)) break;
    }
    k = Math.max(k, Math.min(1, 2 / dist));
    camCtl.k = damp(camCtl.k ?? 1, k, k < (camCtl.k ?? 1) ? 12 : 3, dt);
    const kk = camCtl.k, lift = (1 - kk) * 6;
    camPos.set(px - Math.sin(yaw) * dist * cosP * kk, Math.max(0.35, baseH + dist * sinP * kk + lift), pz - Math.cos(yaw) * dist * cosP * kk);
    if (clampFn) clampFn(camPos);
    if (camera.position.distanceTo(camPos) > 30) camera.position.copy(camPos); else camera.position.lerp(camPos, 1 - Math.exp(-9 * dt));
    // pitching below the horizon looks up: handy for tall buildings and the Vidhana Soudha inscription
    camLook.set(px + Math.sin(yaw) * 2, lookH + (p < 0 ? -p * 14 : 0), pz + Math.cos(yaw) * 2);
    camera.lookAt(camLook);
  }
  function firstCam(px, pz, h, yaw) {
    camera.position.set(px + Math.sin(yaw) * 0.25, h, pz + Math.cos(yaw) * 0.25);
    const a = (0.2 - camCtl.pitch) * 1.3;
    camLook.set(camera.position.x + Math.sin(yaw) * Math.cos(a) * 10, h + Math.sin(a) * 10, camera.position.z + Math.cos(yaw) * Math.cos(a) * 10);
    camera.lookAt(camLook);
  }
  function updateCamera(dt) {
    if (state.photo) { orbit.update(); return; }
    if (state.mode === 'metro') { ride.update(dt, camera); if (ride.scene) renderPass.scene = ride.scene; return; }
    if (window.__game && window.__game.debugCam) { const d = window.__game.debugCam; camera.position.set(...d.pos); camera.lookAt(...d.look); camera.updateProjectionMatrix(); return; }
    const f =state.mode === 'drive' ? player.pos : W.pos;
    if (!state.started || (state.camera === 'cine' && state.mode !== 'interior')) {
      const a = t * 0.1, R = state.started ? 26 : 40;
      camPos.set(f.x + Math.sin(a) * R, state.started ? 14 : 22, f.z + Math.cos(a) * R);
      camera.position.lerp(camPos, 1 - Math.exp(-2 * dt)); camera.lookAt(f.x, 3, f.z); return;
    }
    camCtl.idle += dt;
    if (state.mode === 'drive') {
      if (!camCtl.dragging && camCtl.idle > 1.5 && Math.abs(player.speed) > 1) { camCtl.yaw = damp(camCtl.yaw, 0, 2, dt); camCtl.pitch = damp(camCtl.pitch, 0.2, 2, dt); }
      if (state.camera === 'first') firstCam(player.pos.x, player.pos.z, (player.type === 'car' ? 1.3 : player.type === 'scooter' ? 1.85 : 1.62) + player.bodyPivot.position.y, player.heading + camCtl.yaw);
      else chaseCam(dt, player.pos.x, player.pos.z, player.heading + camCtl.yaw, (player.type === 'car' ? 7.5 : player.type === 'scooter' ? 5.2 : 6.2) * camCtl.zoom, 2.2, 1.4);
      camera.fov = damp(camera.fov, 58 + Math.min(14, Math.abs(player.speed) * 0.5), 3, dt);
    } else {
      if (!camCtl.dragging && camCtl.idle > 1.2 && W.speed > 1 && ctl.fwd > 0) camCtl.walkYaw = angleLerp(camCtl.walkYaw, W.yaw, 1 - Math.exp(-1.5 * dt));
      const inside = state.mode === 'interior';
      if (state.camera === 'first') firstCam(W.pos.x, W.pos.z, 1.62 + W.y, camCtl.walkYaw);
      else chaseCam(dt, W.pos.x, W.pos.z, camCtl.walkYaw, (inside ? 2.6 : 3.8) * Math.min(camCtl.zoom, inside ? 1.2 : 3.2), 1.7 + W.y, 1.45 + W.y, inside ? (v) => interior.clampCam(v) : null);
      camera.fov = damp(camera.fov, 60, 3, dt);
    }
    if (ui.prefs.reduce) shake = 0;
    if (shake > 0 && dt > 0) { camera.position.add(tmp.set((Math.random() - 0.5) * shake * 0.4, (Math.random() - 0.5) * shake * 0.3, (Math.random() - 0.5) * shake * 0.4)); shake = Math.max(0, shake - dt * 2.5); }
    camera.updateProjectionMatrix();
  }

  function updateWalker(dt) {
    const cy = camCtl.walkYaw;
    const fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
    const on = active();
    let mx = on ? fx * ctl.fwd + rx * ctl.side : 0, mz = on ? fz * ctl.fwd + rz * ctl.side : 0;
    const l = Math.hypot(mx, mz);
    const tired = game.wallet.energy < 15 ? 0.7 : 1;
    const target = l > 0 ? (ctl.run && game.wallet.energy > 5 ? 4.6 : 1.9) * tired : 0;
    W.speed = damp(W.speed, target, 8, dt);
    if (l > 0) { mx /= l; mz /= l; W.dir = [mx, mz]; W.yaw = angleLerp(W.yaw, Math.atan2(mx, mz), 1 - Math.exp(-12 * dt)); }
    const outside = state.mode !== 'interior';
    // ---- climbing over a ledge: a short scripted move up and in
    if (W.mantle) {
      const m = W.mantle; m.t += dt / 0.45; const k = Math.min(1, m.t), e = k * k * (3 - 2 * k);
      W.pos.set(m.x0 + (m.x1 - m.x0) * e, 0, m.z0 + (m.z1 - m.z0) * e); W.y = m.y0 + (m.y1 - m.y0) * Math.min(1, e * 1.6);
      if (k >= 1) { W.mantle = null; W.vy = 0; W.ground = true; }
      walker.root.position.set(W.pos.x, W.y, W.pos.z); walker.animate(dt, 0.5);
      return;
    }
    // ---- on a ladder: W/S climb, Space jumps off, the top hands you onto the roof
    if (W.ladder) {
      const L = W.ladder;
      W.y += (ctl.fwd || 0) * 2.4 * dt;
      W.yaw = Math.atan2(-L.nx, -L.nz);
      if (W.y >= L.y1 - 0.05) { W.ladder = null; W.mantle = { t: 0, x0: W.pos.x, z0: W.pos.z, x1: L.x - L.nx * 1.4, z1: L.z - L.nz * 1.4, y0: W.y, y1: L.y1 }; }
      else if (W.y <= L.y0) { W.y = L.y0; if ((ctl.fwd || 0) < 0) W.ladder = null; }
      if (input.down('jump')) { W.ladder = null; W.vy = 3; W.pos.x += L.nx * 0.6; W.pos.z += L.nz * 0.6; }
      walker.root.position.set(W.pos.x, W.y, W.pos.z); walker.root.rotation.y = W.yaw; walker.animate(dt, Math.abs(ctl.fwd || 0) * 1.5);
      return;
    }
    const p = { x: W.pos.x + W.dir[0] * W.speed * dt, z: W.pos.z + W.dir[1] * W.speed * dt };
    let hit = null;
    if (!outside) interior.collide(p, 0.35);
    else {
      hit = world.collide(p, 0.35, W.y);
      if (W.y < 1) { traffic.collidePlayer(p, 0.35); people.collideCows(p, 0.35); }
      const dx = p.x - player.pos.x, dz = p.z - player.pos.z, d = Math.hypot(dx, dz), rr = player.radius + 0.35;
      if (W.y < 1.2 && d < rr && d > 1e-5) { p.x += dx / d * (rr - d); p.z += dz / d * (rr - d); }
    }
    W.pos.set(p.x, 0, p.z);
    if (outside) {
      // jump, gravity, landing
      if (active() && W.ground && input.down('jump') && !W.jumpHeld) { W.vy = 6.4; W.ground = false; }
      W.jumpHeld = input.down('jump');
      W.vy -= 20 * dt; W.y += W.vy * dt;
      const g = world.groundAt(W.pos.x, W.pos.z, W.y);
      if (W.y <= g) {
        if (W.vy < -13) { game.wallet.energy = Math.max(0, game.wallet.energy - 8); if (once('ouch', 4)) ui.toast('Ouch!', 'That was a long drop. Your knees disagree.', 'bandage'); shake = 0.6; }
        W.y = g; W.vy = 0; W.ground = true;
      } else if (W.y > g + 0.05) W.ground = false;
      // grab a ledge in reach while pushing into it
      const top = hit && hit.item && !['tree', 'pole', 'pillar', 'edge'].includes(hit.tag) ? hit.item.h : null;
      if (top !== null && (ctl.fwd || 0) > 0 && top - W.y > 0.5 && top - W.y < (W.ground ? 1.35 : 2.4)) {
        const tx = W.pos.x + W.dir[0] * 0.9, tz = W.pos.z + W.dir[1] * 0.9;
        if (world.inside(hit.item, tx, tz)) W.mantle = { t: 0, x0: W.pos.x, z0: W.pos.z, x1: tx, z1: tz, y0: W.y, y1: top };
      }
      // grab a ladder you're facing
      if ((ctl.fwd || 0) > 0) for (const L of world.ladders) {
        if (Math.abs(L.x - W.pos.x) > 1 || Math.abs(L.z - W.pos.z) > 1 || W.y < L.y0 - 0.3 || W.y > L.y1 - 0.3) continue;
        if (Math.hypot(L.x - W.pos.x, L.z - W.pos.z) < 0.85 && W.dir[0] * -L.nx + W.dir[1] * -L.nz > 0.5) { W.ladder = L; W.vy = 0; W.pos.x = L.x; W.pos.z = L.z; break; }
      }
      if (world.vidhanaTop && !W.peak && W.y > world.vidhanaTop.y - 1 && Math.hypot(W.pos.x - world.vidhanaTop.x, W.pos.z - world.vidhanaTop.z) < 8) {
        W.peak = true; ui.card('landmark', 'Top of Vidhana Soudha', 'You climbed the dome. All of Cubbon Park below you. (Security is on its way.)', 'Peak Bengaluru moment');
      }
    } else { W.y = 0; W.vy = 0; W.ground = true; }
    walker.root.position.set(W.pos.x, W.y, W.pos.z); walker.root.rotation.y = W.yaw;
    walker.animate(dt, W.ground ? W.speed : 0.2);
    if (!W.ground) { walker.parts.legL.rotation.x = -0.6; walker.parts.legR.rotation.x = 0.3; walker.parts.legLKnee.rotation.x = walker.parts.legRKnee.rotation.x = 0.8; }
  }

  function frame() { tick(); requestAnimationFrame(frame); }
  let uiT = 0, frameNo = 0, perfT = 0;
  function drawStats() {
    const i = renderer.info.render, P = prof, f = (k) => (P[k] || 0).toFixed(1);
    const cpu = Object.keys(P).filter((k) => k !== 'render').reduce((a, k) => a + P[k], 0);
    $('perf').innerHTML = `<b>${ui.fps} fps</b> · <b>${tierCfg().label}</b>${quality.mode === 'auto' ? ' (auto)' : ''} · ${renderer.getPixelRatio().toFixed(2)}× res${quality.dyn < 1 ? ` (dynamic ${Math.round(quality.dyn * 100)}%)` : ''}<br>` +
      `${i.calls} draw calls · ${(i.triangles / 1e6).toFixed(2)}M tris<br>` +
      `CPU sim ${cpu.toFixed(1)} ms · traffic ${f('traffic')} · people ${f('people')} · ui ${f('ui')}<br>render submit ${f('render')} ms<br>` +
      `GPU: ${gpu.name}${gpu.integrated ? ' <b>(integrated)</b>' : ''}<br>` +
      (gpuT.ok ? `GPU ${(gpuT.ms.total || 0).toFixed(1)} ms · ${['shadows', 'scene', 'ao', 'bloom', 'output', 'aa'].filter((k) => gpuT.ms[k] > 0.05).map((k) => `${k} ${gpuT.ms[k].toFixed(1)}`).join(' · ')}` : 'GPU timing not supported by this browser');
  }
  const bench = createBenchmark({ nav, game, player, actions, state, ui });
  actions.runBenchmark = () => {
    if (bench.running) return;
    if (state.mode !== 'drive') { ui.toast('Benchmark', 'Get in your vehicle first.', 'gauge'); return; }
    overlays.clear();
    if (bench.start()) { $('benchOut').textContent = 'Running: 90 s drive with rain and dusk…'; ui.toast('Benchmark running', '90 seconds. Hands off, it drives itself.', 'gauge'); }
  };
  function benchDone(r) {
    const gpuMs = Object.entries(r.gpu).filter(([k, v]) => k !== 'total' && v > 0.05).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ');
    const txt = `${tierCfg().label}: ${r.fps.toFixed(0)} fps average, ${r.low1.toFixed(0)} fps 1% low, worst frame ${r.worst.toFixed(0)} ms · ${Math.round(r.calls)} draw calls · ${(r.tris / 1e6).toFixed(2)}M tris${r.gpu.total ? ` · GPU ${r.gpu.total.toFixed(1)} ms (${gpuMs})` : ''}`;
    $('benchOut').textContent = txt; console.info('[silicon-streets] benchmark', txt);
    ui.toast('Benchmark done', `${r.fps.toFixed(0)} fps average, ${r.low1.toFixed(0)} fps 1% low. Details in Settings, Graphics.`, 'gauge');
  }
  $('gpuName').textContent = `GPU: ${gpu.name}${gpu.integrated ? ' (integrated graphics. If this computer has a dedicated GPU, set your browser to High performance in Windows Settings, Display, Graphics)' : ''}`;
  // rolling per-system CPU timings (ms), shown in the perf overlay (F3)
  const prof = {}; let pt = 0;
  const mark = (k) => { const n = performance.now(); prof[k] = (prof[k] || 0) * 0.92 + (n - pt) * 0.08; pt = n; };
  function tick(forceDt) {
    pt = performance.now();
    input.poll(padButton); handlePresses();
    // paused: dt is 0, so the clock, traffic and everything else hold still while the frame keeps rendering
    const rawDt = clock.getDelta(), dt = state.paused ? 0 : forceDt ?? Math.min(rawDt, 0.05);
    t += dt;
    readInput();
    const prevHours = state.hours;
    if (state.paused) { /* frozen */ } else if (state.live) state.hours = istHours();
    else if (!state.photo) state.hours = (state.hours + dt * state.timeSpeed / 3600 + 24) % 24;
    const dh = ((state.hours - prevHours) + 24) % 24 < 12 ? ((state.hours - prevHours) + 24) % 24 : 0;
    if (prevHours > 23 && state.hours < 1) state.day = (state.day + 1) % 7;
    const ws = weather.state;
    const atm = atmosphere(state.hours, ws.cloud, ws.rain);
    const u = sky.uniforms;
    u.topColor.value.copy(atm.top); u.horizonColor.value.copy(atm.hor);
    u.sunDir.value.copy(atm.sunDir); u.moonDir.value.copy(atm.moonDir);
    u.sunColor.value.copy(atm.sunColor); u.cloudColor.value.copy(atm.cloudCol);
    u.cloudiness.value = ws.cloud; u.time.value = t; u.stars.value = atm.stars; u.sunVis.value = atm.sunVis; u.night.value = atm.night; u.flash.value = ws.flash * 0.6;
    sky.mesh.position.copy(camera.position);
    const fogFar = Math.min(atm.fogFar, tierCfg().far);
    scene.fog.color.copy(atm.fogColor); scene.fog.near = Math.min(atm.fogNear, fogFar * 0.3); scene.fog.far = fogFar;
    const f = state.mode === 'drive' ? player.pos : state.mode === 'walk' ? W.pos : state.mode === 'metro' ? (ride.focus || W.pos) : W.street;
    sun.color.copy(atm.lightColor); sun.intensity = atm.lightI + ws.flash * 2;
    sun.position.set(f.x + atm.lightDir.x * 180, atm.lightDir.y * 180, f.z + atm.lightDir.z * 180);
    // snap the shadow frustum to whole texels so shadows don't crawl while moving
    const tex = sun.shadow.camera.right * 2 / sun.shadow.mapSize.x, sx = Math.round(f.x / tex) * tex, sz = Math.round(f.z / tex) * tex;
    sun.position.set(sx + atm.lightDir.x * 180, atm.lightDir.y * 180, sz + atm.lightDir.z * 180);
    sun.target.position.set(sx, 0, sz);
    hemi.color.copy(atm.hemiSky); hemi.groundColor.copy(atm.hemiGround); hemi.intensity = atm.hemiI + ws.flash * 1.5;
    scene.environmentIntensity = atm.envI;
    document.body.classList.toggle('driving', state.mode === 'drive');
    renderer.toneMappingExposure = state.mode === 'interior' ? 1 : atm.exposure;
    bloom.strength = state.mode === 'interior' ? 0.35 : atm.bloom;
    // small, frequent env-map refreshes so reflections and ambient light change smoothly
    if (Math.abs(state.hours - envHours) > 0.05 || Math.abs(ws.cloud - envCloud) > 0.05) {
      const old = envRT; envRT = pmrem.fromScene(sky.envScene, 0, 0.1, 100, { size: 64 }); scene.environment = envRT.texture; old && old.dispose();
      envHours = state.hours; envCloud = ws.cloud;
    }
    const L = Math.max(atm.lights, ws.cloud * ws.rain * 0.35);
    mark('atmos');
    world.update({ hours: state.hours, lights: L, wet: ws.wet, time: t, dt, cam: camera.position, far: fogFar, detail: tierCfg().detail, lod: tierCfg().lod });
    player.setNight(L, state.mode === 'drive'); traffic.setNight(L); metro.setNight(L);
    mark('world');

    if (!state.photo && !state.paused) {
      if (state.mode === 'drive') { if (bench.drive(dt)) player.syncMesh(); else player.update(dt, ctl, world, npcCollide, ev, phys); }
      else { player.syncMesh(); if (state.mode !== 'metro') updateWalker(dt); }
      if (phys) {
        // Rapier moves your vehicle, shoves what you hit, and streams colliders around you
        phys.step(dt, { player, mode: state.mode, traffic, ev, focus: f });
        if (state.mode === 'drive') {
          const cow = people.collideCows(player.pos, player.radius);
          if (cow) { const vn = player.vel.x * cow.nx + player.vel.y * cow.nz; if (vn < 0) { player.vel.x -= cow.nx * vn * 1.25; player.vel.y -= cow.nz * vn * 1.25; if (-vn > 3.5) ev.crash(-vn, 'cow', cow); } }
          player.syncMesh(player.surface, player.speed);
        }
        mark('physics');
      }
      const blockers = [{ x: player.pos.x, z: player.pos.z, speed: Math.abs(player.speed), r: player.radius, isPlayer: state.mode === 'drive', vx: player.vel.x, vz: player.vel.y }];
      if (state.mode === 'walk') blockers.push({ x: W.pos.x, z: W.pos.z, speed: 0 });
      blockers.push(...tow.blockers);
      // rush hour fills the roads, late night empties them; floods slow everyone down
      const hr = state.hours, density = (hr >= 8.5 && hr < 11) || (hr >= 17.5 && hr < 21) ? 1 : hr < 5.5 || hr >= 23 ? 0.35 : 0.72;
      const cdir = camera.getWorldDirection(tmp);
      const focus = { x: f.x, z: f.z, blockers, density, live: LIVE[tierCfg().live] || LIVE.normal, fx: cdir.x, fz: cdir.z, drag: (x, z) => 1 - Math.min(0.7, flood.depthAt(x, z) * 2.2) };
      mark('player');
      signals.update(dt, state.mode === 'drive' ? player : null, ui, game.wallet);
      traffic.update(dt, focus, ev); mark('traffic');
      tow.update(dt, { player, mode: state.mode, blockedBehind: blockers[0].hits || 0, wallet: game.wallet, navTo, traffic, walker: state.mode === 'walk' ? W.pos : null });
      metro.update(dt); people.update(dt, t, focus, ws.rain, ev); mark('people');
      game.update(dt, t, ctx(), dh); mark('game');
      // jobs drive the GPS: pickup first, then the drop-off
      const r = game.ride, key = r.state === 'waiting' ? 'p:' + r.from.name : r.state === 'riding' ? 'd:' + r.to.name : '';
      // keep: the route stays (and reroutes) until the job itself says you're done, even if a shortcut fools the GPS
      if (key !== jobKey) { if (jobKey && !key) nav.clear(); jobKey = key; if (key) navTo({ ...(r.state === 'waiting' ? r.from : r.to), keep: true }); }
      if (state.mode === 'drive' || state.mode === 'walk') {
        const info = nav.update(dt, f, state.mode === 'drive' ? 'drive' : 'walk');
        if (info && info.arrived) { pinBeam.visible = false; if (info.name === 'Dropped pin') ui.toast('You have arrived', 'That was your pin.', 'pin'); }
        ui.nav(info && !info.arrived ? info : null);
      } else ui.nav(null);
    }
    interior.update(dt, atm.hor);
    weather.update(dt, t, camera.position, atm, audio);
    // smoke from a damaged engine; respect slowly returns with clean driving
    if (state.mode === 'drive' && player.health < 55 && Math.random() < dt * (player.health < 30 ? 14 : 6)) {
      const fwx = Math.sin(player.heading), fwz = Math.cos(player.heading);
      fx.burst(player.health < 30 ? 'blacksmoke' : 'smoke', player.pos.x + fwx * 0.8, 1.2, player.pos.z + fwz * 0.8, 1, { spread: 0.6, up: 0.6 });
    }
    game.wallet.respect = Math.min(100, game.wallet.respect + dt * 0.03);
    fx.update(dt, camera); parked.update(camera.position);
    // flooding: water depth under your vehicle, spray from the wheels, a Peak Bengaluru moment
    const wd = state.mode === 'drive' ? flood.depthAt(player.pos.x, player.pos.z) : 0;
    player.waterDepth = wd;
    const spraying = wd > 0.05 && Math.abs(player.speed) > 3;
    flood.update(dt, ws.rain, spraying ? { x: player.pos.x, z: player.pos.z, vx: player.vel.x, vz: player.vel.y } : null);
    if (wd > 0.1 && flood.firstFlood()) ui.card('wave', 'Waterlogged!', 'One hour of rain and the junction is a lake. Your auto is now a boat.', 'Peak Bengaluru moment', true);
    if (wd > 0.3 && player.type === 'auto' && once('stall', 30)) ui.toast('Engine sputtering', 'Water is up to the floorboard. Go slow or you will stall.', 'drop');
    edges.update(dt, camera.position, atm.hor, atm.night);
    if (!state.paused && state.mode !== 'interior' && state.mode !== 'metro') life.update(dt, { hours: state.hours, day: state.day, focus: f, mode: state.mode, zone: $('locName').textContent, lights: L, camera, driving: state.mode === 'drive', speed: state.mode === 'drive' ? Math.abs(player.speed) : W.speed });
    if (!state.paused && state.mode !== 'interior' && state.mode !== 'metro' && edges.near(f)) ui.toast('Road closed', 'Namma Metro Phase 3 work since 2017. Diversion ahead (there is no diversion).', 'cone');
    const rainHere = state.mode === 'interior' ? ws.rain * 0.3 : ws.rain;
    audio.update(state.mode === 'drive' ? player.type : 'none', player.speed, ctl.throttle, rainHere, f.x, f.z, state.mode === 'drive' ? player.heading : W.yaw);
    updateCamera(dt); mark('misc');

    if (state.mode !== 'interior') {
      const z = world.zoneAt(f.x, f.z); ui.setZone(z);
      if (z.name !== lastZoneName) { lastZoneName = z.name; if (z.name === 'Vidhana Soudha') ui.toast('Look up!', `Drag the mouse up (or press ${K('camera')} for first person) to read the inscription.`, 'landmark'); }
    }
    uiT -= rawDt;
    if (uiT <= 0) { uiT = 1 / 12; ui.update({ hours: state.hours, weather: state.weather, temp: ws.temp, live: state.live, speed: player.speed, vehicle: VEHICLE_STATS[player.type].label, vehicleType: player.type, mode: state.mode, ride: game.ride, collected: game.collected, totalCollect: game.totalCollectibles, wallet: game.wallet, rawDt: 0, dayName: life.dayName(state.day), health: player.health });
    if (state.mode !== 'interior') ui.drawMinimap(f, state.mode === 'drive' ? player.heading : W.yaw, [...game.markers(), ...(pinBeam.visible ? [{ x: pinBeam.position.x, z: pinBeam.position.z, c: '#ff4d6d', big: true }] : []), ...(state.mode === 'walk' ? [{ x: player.pos.x, z: player.pos.z, c: '#ffcf3f', icon: 'V', big: true }] : [])], traffic.vehicles, nav.route); }
    ui.frame(rawDt);

    mark('ui');
    frameNo++;
    if (sun.castShadow && frameNo % tierCfg().shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
    renderer.info.reset();
    timing = quality.stats || bench.running;
    composer.render(); mark('render');
    if (timing) { gpuT.frameEnd(); gpuT.poll(); }
    const br = bench.sample(rawDt, renderer.info.render, gpuT.ms); if (br) benchDone(br);
    if (!bench.running) autoQuality(rawDt);
    if (quality.stats && (perfT -= rawDt) <= 0) { perfT = 0.5; drawStats(); }
  }
  applyCfg();
  // meshes for the chunks in view of where you start; the rest stream in as you move
  const tp = performance.now();
  world.prime(player.pos.x, player.pos.z, tierCfg().far); // you start next to your vehicle
  console.info(`[silicon-streets] ${world.streamInfo.live}/${world.streamInfo.total} chunks built at start in ${Math.round(performance.now() - tp)} ms`);
  // compile every shader up front so the first headlight / rain / interior doesn't stutter
  renderer.compile(scene, camera);
  frame();
  // debug handle for automated checks: __game.step(n) advances n frames synchronously
  window.__game = { state, player, world, actions, weather, camera, keys: input.held, input, overlays, ui, life, audio, renderer, game, W, hooks, traffic, prof, scene, composer, sun, bloom, gtao, quality, get phys() { return phys; }, flood, edges, nav, people, signals, camCtl, tow, step: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) tick(dt); } };
}

init().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading'); if (l) l.textContent = 'Failed to start: ' + e.message;
});
