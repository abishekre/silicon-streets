import * as THREE from 'three';
import { box, merge, part, makeRng } from './util.js';
import { textTexture } from './textures.js';
import { createCharacter } from './people.js';

// Walk-in places bigger than one room: a Namma Metro station (street entrance, escalator up to the concourse,
// tokens, frisking, ticket gates, platform with screen doors) and the Garden City Mega Mall (three floors round an
// atrium, escalators, food court, cinema, arcade). A venue answers the same questions the street does
// (collide, groundAt), so walking, jumping and falling work indoors with the walker code unchanged.
const SHIRTS = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fafafa', '#8e24aa', '#ff7043', '#263238'];
const SKIN = ['#8d5a3b', '#a8714a', '#6e4429'];
const MALL_NAME = 'Garden City Mega Mall';

export function createVenues({ world, ui, audio, game, hooks }) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#5b5348', 1.6));
  const sun = new THREE.DirectionalLight('#fff4e0', 1.2); sun.position.set(10, 30, -8); scene.add(sun);
  const dyn = new THREE.Group(); scene.add(dyn);
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  let V = null; // the venue you're in

  // ---------- building blocks ----------
  // a solid box you can't walk through (and can stand on if its top is low enough to step onto)
  function solid(x1, x2, z1, z2, y0, y1, color, visible = true) {
    V.solids.push({ x1, x2, z1, z2, y0, y1 });
    if (visible) V.parts.push(box(x2 - x1, y1 - y0, z2 - z1, (x1 + x2) / 2, (y0 + y1) / 2, (z1 + z2) / 2, color));
  }
  const glow = (w, h, d, x, y, z, color) => V.glows.push(box(w, h, d, x, y, z, color));
  // a ramp along z (stairs or escalator): ya at z1, yb at z2; an escalator carries you at `belt` m/s along +z (or -z)
  function ramp(x1, x2, z1, z2, ya, yb, color, belt = 0) {
    V.ramps.push({ x1, x2, z1, z2, ya, yb, belt });
    // geometry always from the low-z end to the high-z end, whichever way you ride it
    const [ha, hb] = z1 < z2 ? [ya, yb] : [yb, ya], zl = Math.min(z1, z2), zh = Math.max(z1, z2);
    const len = Math.hypot(zh - zl, hb - ha), ang = Math.atan2(hb - ha, zh - zl);
    const g = new THREE.BoxGeometry(x2 - x1, 0.25, len); g.rotateX(-ang); g.translate((x1 + x2) / 2, (ya + yb) / 2 - 0.12, (z1 + z2) / 2);
    V.parts.push(part(g, color));
    // side panels and rails, so you can only get on and off at the ends
    for (const x of [x1 - 0.08, x2 + 0.08]) {
      const s = new THREE.BoxGeometry(0.14, 1.0, len); s.rotateX(-ang); s.translate(x, (ya + yb) / 2 + 0.45, (z1 + z2) / 2);
      V.parts.push(part(s, belt ? '#cfd8dc' : '#9e9e9e'));
      V.solids.push({ x1: x - 0.1, x2: x + 0.1, z1: Math.min(z1, z2), z2: Math.max(z1, z2), y0: Math.min(ya, yb) + 0.2, y1: Math.max(ya, yb) + 1.1 });
    }
    if (belt) for (const x of [x1 - 0.08, x2 + 0.08]) { const h = new THREE.BoxGeometry(0.1, 0.08, len); h.rotateX(-ang); h.translate(x, (ya + yb) / 2 + 1.0, (z1 + z2) / 2); V.parts.push(part(h, '#212121')); }
  }
  // a floor slab with its top at y (thin, 0.4 m)
  const slab = (x1, x2, z1, z2, y, color) => solid(x1, x2, z1, z2, y - 0.4, y, color);
  // railing along a slab edge
  const rail = (x1, x2, z1, z2, y) => { solid(x1, x2, z1, z2, y, y + 1.05, '#b0bec5'); };
  const sign = (text, w, h, x, y, z, ry, { bg = '#1a1a1a', fg = '#ffffff', font = '700 54px "Space Grotesk"' } = {}) => {
    const t = textTexture(Array.isArray(text) ? text : [text], { w: 1024, h: Math.round(1024 * h / w), bg, fg, font });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t })); m.position.set(x, y, z); m.rotation.y = ry; V.meshes.push(m);
  };
  // a spot you can use: E within reach on the same floor
  const spot = (x, z, y, label, run, r = 1.8) => V.spots.push({ x, z, y, label, run, r });
  // people standing about, or walking a loop
  function person(x, z, y, yaw, path = null, speed = 1.1) {
    const r = V.rng, ch = createCharacter(dyn, { shirt: r.pick(SHIRTS), pants: r.pick(['#263238', '#3e2723', '#1a237e', '#424242']), skin: r.pick(SKIN) });
    ch.root.position.set(x, y, z); ch.root.rotation.y = yaw;
    V.npcs.push({ ch, path, s: r() * 100, speed, y });
  }
  function begin(kind, name, bounds) {
    dyn.clear();
    V = { kind, name, bounds, solids: [], ramps: [], spots: [], parts: [], glows: [], meshes: [], npcs: [], gates: [], rng: makeRng(kind === 'mall' ? 7 : name.length * 31 + 5), t: 0, said: new Set(), y: 0 };
    scene.background = new THREE.Color(kind === 'mall' ? '#d9d4ca' : '#cfd3d6');
  }
  function finish() {
    if (V.parts.length) { const m = new THREE.Mesh(merge(V.parts), solidMat); dyn.add(m); }
    if (V.glows.length) dyn.add(new THREE.Mesh(merge(V.glows), glowMat));
    for (const m of V.meshes) dyn.add(m);
    V.parts = V.glows = null;
  }

  // ---------- Namma Metro station ----------
  function buildStation(st) {
    const B = { x1: -14, x2: 14, z1: -11, z2: 25 };
    begin('metro', st.name, B);
    const P = '#7b2d8e', WALL = '#e8e4dc', FLOOR = '#d5d0c6';
    // outer shell (ground floor walls, with the street door in the south wall)
    solid(-14.4, -14, -11, 25, 0, 16, WALL); solid(14, 14.4, -11, 25, 0, 16, WALL); solid(-14, 14, 25, 25.4, 0, 16, WALL);
    solid(-14, -1.6, -11.4, -11, 0, 16, WALL); solid(1.6, 14, -11.4, -11, 0, 16, WALL); solid(-1.6, 1.6, -11.4, -11, 3, 16, WALL);
    V.parts.push(box(28, 0.05, 36, 0, 0, 7, FLOOR));
    sign([`${st.name.toUpperCase()} METRO`, 'ನಮ್ಮ ಮೆಟ್ರೋ'], 6, 1.2, 0, 3.8, -10.9, 0, { bg: P });
    spot(0, -10.2, 0, 'leave the station', () => hooks.exitVenue(), 2.2);
    // ground floor: escalator and stairs up to the concourse (y 5)
    ramp(2, 4, -9, 0, 0, 5, '#90a4ae', 0.9); ramp(-4, -2, -9, 0, 0, 5, '#a1887f');
    sign('CONCOURSE · PLATFORMS', 6, 0.7, 0, 3, -4.5, 0, { bg: P });
    // concourse slab, with the stairwell opening over the ground floor kept clear
    slab(-14, 14, 0, 25, 5, FLOOR); slab(-14, -4, -11, 0, 5, FLOOR); slab(4, 14, -11, 0, 5, FLOOR); slab(-2, 2, -11, 0, 5, FLOOR);
    // the ground floor ends at the stairs: no wandering under the concourse
    solid(-14, -4.1, -0.2, 0, 0, 4.6, WALL); solid(-1.9, 1.9, -0.2, 0, 0, 4.6, WALL); solid(4.1, 14, -0.2, 0, 0, 4.6, WALL);
    // ticket counter and token machines on the west side
    solid(-14, -10, 1, 4, 5, 6.1, '#5d4037'); glow(4, 0.5, 0.1, -12, 7.4, 1, '#ffd54f');
    sign('TICKETS · TOKENS ₹20', 4, 0.8, -12, 7.4, 4.05, 0, { bg: P });
    const clerk = createCharacter(dyn, { shirt: P, pants: '#222', skin: '#8d5a3b' }); clerk.root.position.set(-12, 5, 2); clerk.root.rotation.y = 0;
    spot(-12, 4.8, 5, 'buy a token (₹20)', () => buyToken());
    for (const x of [-8.5, -7]) { solid(x - 0.5, x + 0.5, 0.2, 1, 5, 6.8, '#37474f'); glow(0.6, 0.4, 0.05, x, 6.3, 1.03, '#4fc3f7'); spot(x, 1.8, 5, 'use the token machine (₹20)', () => buyToken()); }
    // security: you go through the frisking booth or nowhere
    solid(-14, -1.2, 7, 7.2, 5, 6.2, '#90a4ae'); solid(1.2, 14, 7, 7.2, 5, 6.2, '#90a4ae');
    solid(-1.25, -1.15, 6, 8.2, 5, 7.3, '#455a64'); solid(1.15, 1.25, 6, 8.2, 5, 7.3, '#455a64'); V.parts.push(box(2.5, 0.12, 2.2, 0, 7.3, 7.1, '#455a64'));
    const guard = createCharacter(dyn, { shirt: '#5d6b44', pants: '#37412a', skin: '#6e4429' }); guard.root.position.set(1.8, 5, 7.6); guard.root.rotation.y = -Math.PI / 2;
    V.frisk = { x: 0, z: 7.1, y: 5, done: false };
    // ticket gates: tap a token or a QR from the phone
    solid(-14, -4.2, 11, 11.3, 5, 6.2, '#cfd8dc'); solid(4.2, 14, 11, 11.3, 5, 6.2, '#cfd8dc');
    for (let i = 0; i < 4; i++) {
      const x0 = -4.2 + i * 2.1; solid(x0, x0 + 0.5, 10.5, 11.8, 5, 6.1, '#b0bec5'); // gate cabinet
      const gate = { x1: x0 + 0.5, x2: x0 + 2.1, z1: 11, z2: 11.3, y0: 5, y1: 6, open: 0 };
      V.gates.push(gate); V.solids.push(gate);
      glow(0.3, 0.06, 0.3, x0 + 0.25, 6.12, 11.2, '#69f0ae');
    }
    solid(4.2 - 0.4, 4.2, 10.5, 11.8, 5, 6.1, '#b0bec5');
    sign('TAP TOKEN · SCAN QR', 4, 0.6, 0, 7.8, 11.4, 0, { bg: P });
    // escalator up to the platform (y 10)
    ramp(-1, 1, 12.5, 19, 5, 10, '#90a4ae', 0.9); ramp(2, 3.5, 12.5, 19, 5, 10, '#a1887f');
    slab(-14, 14, 19, 25, 10, '#c9c3b6'); slab(-14, -1.1, 12, 19, 10, '#c9c3b6'); slab(3.6, 14, 12, 19, 10, '#c9c3b6'); slab(1.1, 1.9, 12, 19, 10, '#c9c3b6');
    // platform: screen doors along the track wall, a train beyond, benches, the next-train board
    for (let x = -12; x <= 12; x += 4) { solid(x - 1.9, x + 1.9, 24.4, 24.6, 10, 12.4, '#e0f2f1'); V.parts.push(box(0.15, 2.4, 0.3, x + 1.95, 11.2, 24.5, '#455a64')); glow(1.2, 0.08, 0.05, x, 12.5, 24.35, '#ff5252'); }
    V.parts.push(box(28, 3.2, 0.1, 0, 11.6, 25.6, '#7b2d8e')); // the train waiting behind the doors
    for (let x = -10; x <= 10; x += 5) V.glows.push(box(1.6, 0.9, 0.05, x, 12, 25.5, '#cfe8ff'));
    sign(['Next train: Purple Line', 'Whitefield 2 min · Challaghatta 5 min'], 7, 1.2, 0, 14, 19.2, 0, { bg: '#111', fg: '#ffd54f', font: '700 48px "Space Grotesk"' });
    for (const x of [-9, 9]) { solid(x - 1.2, x + 1.2, 21, 21.6, 10, 10.5, '#8d6e63'); spot(x, 20.4, 10, 'sit and wait', () => hooks.rest(0.25, 6, 'You sat on the platform. Three trains went past. You were people-watching.')); }
    spot(0, 23.4, 10, 'board the train', () => hooks.boardTrain(st), 3.5);
    for (const x of [-6, -3, 5, 8, 11]) person(x, 22.5 + V.rng() * 1.5, 10, Math.PI);
    for (const x of [-11, -9.5, -8]) person(x, 5.6, 5, Math.PI); // queue at the counter
    person(6, 3, 5, 0, [[6, 2], [10, 2], [10, 5], [6, 5]], 0.9);
    // lights: long tube lights under each ceiling
    for (const y of [4.6, 9.6, 15.6]) for (let z = -8; z < 25; z += 6) glow(10, 0.08, 0.25, 0, y, z, '#f5f5f5');
    finish();
    V.lines = ['Announcement: "Please stand on the right. Allow others to walk on the left."', 'Announcement: "Doors will open on the left. Mind the gap."', 'Announcement: "Passengers are requested not to sit on the floor."', 'Someone is on a video call at full volume. Of course.'];
    return { x: 0, z: -9.6, y: 0, yaw: 0 };
  }
  function buyToken() {
    if (!game.wallet.spend(20, `Metro token (${V.name})`)) return ui.toast('Not enough money', 'A token is ₹20.', 'cash');
    V.tokens = (V.tokens || 0) + 1; audio.cash && audio.cash();
    ui.toast('Token bought', 'Tap it at the ticket gates.', 'metro');
  }

  // ---------- Garden City Mega Mall ----------
  const SHOPS = [['ZARO', '#111'], ['H&N', '#c62828'], ['DECATHLAND', '#1565c0'], ['STARBOX COFFEE', '#1b5e20'], ['CHROMA', '#263238'], ['LIFESTYLISH', '#6a1b9a'], ['MAX-ISH', '#e65100'], ['BOOKWORM', '#4e342e']];
  const FOOD = [
    ['Darshini Express', 'darshini', [['Masala dosa', 90, 25, 'Mall prices for a darshini dosa. Still worth it.'], ['Filter coffee', 50, 15, 'In a paper cup. The purists are crying.']]],
    ['Biryani Junction', 'restaurant', [['Donne biryani', 220, 40, 'Leaf bowl, mall air-conditioning. Peak fusion.']]],
    ['Slice of Bengaluru', 'restaurant', [['Ghee roast pizza', 260, 35, 'Somebody had to try it.'], ['Garlic bread', 120, 15, 'Mostly garlic. Some bread.']]],
    ['Momo Mania', 'restaurant', [['Steamed momos', 140, 25, 'Eight momos and a chutney that clears your sinuses.']]],
  ];
  function buildMall() {
    const B = { x1: -24, x2: 24, z1: -18, z2: 18 };
    begin('mall', MALL_NAME, B);
    const FL = '#ece7de', WALL = '#f4f1ea', LV = [0, 5, 10];
    solid(-24.4, -24, -18, 18, 0, 15, WALL); solid(24, 24.4, -18, 18, 0, 15, WALL); solid(-24, 24, 18, 18.4, 0, 15, WALL);
    solid(-24, -2.5, -18.4, -18, 0, 15, WALL); solid(2.5, 24, -18.4, -18, 0, 15, WALL); solid(-2.5, 2.5, -18.4, -18, 3.4, 15, WALL);
    V.parts.push(box(48, 0.05, 36, 0, 0, 0, FL));
    sign([MALL_NAME.toUpperCase(), 'ಗಾರ್ಡನ್ ಸಿಟಿ ಮೆಗಾ ಮಾಲ್'], 8, 1.4, 0, 4.4, -17.9, 0, { bg: '#2e7d32' });
    spot(0, -17.2, 0, 'leave the mall', () => hooks.exitVenue(), 2.4);
    // security at the door: a metal-detector frame you walk through, a bag scanner, two guards
    solid(-1.4, -1.2, -14.5, -13.7, 0, 2.4, '#607d8b'); solid(1.2, 1.4, -14.5, -13.7, 0, 2.4, '#607d8b'); V.parts.push(box(2.8, 0.25, 0.8, 0, 2.5, -14.1, '#607d8b'));
    solid(-24, -1.4, -14.2, -14, 0, 1.1, '#b0bec5'); solid(1.4, 24, -14.2, -14, 0, 1.1, '#b0bec5');
    solid(3, 6, -15, -13.6, 0, 1, '#37474f'); V.parts.push(box(1.2, 0.8, 1.4, 3.6, 1.4, -14.3, '#263238'));
    for (const x of [-2.5, 2.5]) { const g = createCharacter(dyn, { shirt: '#263238', pants: '#1c1c1c', skin: '#6e4429' }); g.root.position.set(x, 0, -13); g.root.rotation.y = Math.PI; }
    V.frisk = { x: 0, z: -14.1, y: 0, done: false, mall: true };
    // floors 1 and 2: a ring round the atrium (x -8..8, z -6..6), joined by escalators across it
    for (const y of [5, 10]) { slab(-24, -8, -18, 18, y, FL); slab(8, 24, -18, 18, y, FL); slab(-8, 8, -18, -6, y, FL); slab(-8, 8, 6, 18, y, FL); }
    ramp(-3, -1, -3, 6, 0, 5, '#b0bec5', 0.8); ramp(1, 3, 6, -3, 5, 0, '#b0bec5', 0.8); // 0 → 1, 1 → 0
    ramp(-7, -5, -6, 3, 5, 10, '#b0bec5', 0.8); ramp(5, 7, 3, -6, 10, 5, '#b0bec5', 0.8); // 1 → 2, 2 → 1
    slab(-7.2, -4.8, 3, 6, 10, FL); slab(4.8, 7.2, 3, 6, 10, FL); // landings at the top on floor 2
    // railings round the atrium, with gaps where the escalators meet the floors
    rail(-8, -3.1, 5.9, 6, 5); rail(-0.9, 0.9, 5.9, 6, 5); rail(3.1, 8, 5.9, 6, 5);
    rail(-8, -7.1, -6, -5.9, 5); rail(-4.9, 4.9, -6, -5.9, 5); rail(7.1, 8, -6, -5.9, 5);
    for (const y of [5, 10]) { rail(-8.1, -8, -6, 6, y); rail(8, 8.1, -6, 6, y); }
    rail(-8, -7.2, 5.9, 6, 10); rail(-4.8, 4.8, 5.9, 6, 10); rail(7.2, 8, 5.9, 6, 10); rail(-8, 8, -6, -5.9, 10);
    rail(-7.3, -7.2, 3, 6, 10); rail(-4.8, -4.7, 3, 6, 10); rail(4.7, 4.8, 3, 6, 10); rail(7.2, 7.3, 3, 6, 10);
    // shop fronts along both long walls on every floor
    let si = 0;
    for (const y of LV) for (const side of [-1, 1]) for (const z of [-11, -2, 7]) {
      if (y === 5 && side === 1) continue; // food court here
      if (y === 10 && z === 7) continue; // cinema / arcade here
      const [name, col] = SHOPS[si++ % SHOPS.length], x = side * 22.5;
      solid(side < 0 ? -24 : 21, side < 0 ? -21 : 24, z - 3.6, z + 3.6, y, y + 4.2, '#fafafa');
      V.glows.push(box(0.05, 2.6, 6, x - side * 1.52, y + 1.6, z, '#dfe9f0'));
      sign(name, 4.5, 0.8, x - side * 1.56, y + 3.5, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, { bg: col });
      spot(x - side * 2.4, z, y, `look around ${name}`, () => ui.dialogue(V.rng.pick([`${name}: "Sale! (on items nobody wanted)"`, `${name}: everything is 70% off a price that was invented this morning.`, `${name}: you touch a jacket. A salesperson materialises.`, `${name}: the trial-room queue is longer than Silk Board.`])));
    }
    // floor 1, east wing: the food court
    FOOD.forEach(([name, , items], i) => {
      const z = -9 + i * 6.5;
      solid(21, 24, z - 2.6, z + 2.6, 5, 6.1, '#6d4c41'); sign(name.toUpperCase(), 4.5, 0.8, 20.9, 8.2, z, -Math.PI / 2, { bg: ['#2e7d32', '#b71c1c', '#e65100', '#5d4037'][i] });
      spot(19.8, z, 5, `order at ${name}`, () => game.menuFor(name, '', items, 'Mall food court'));
    });
    for (const [x, z] of [[14, -8], [14, -2], [14, 4], [14, 10], [11, 13]]) { solid(x - 0.7, x + 0.7, z - 0.7, z + 0.7, 5, 5.76, '#8d6e63'); spot(x, z + 1.2, 5, 'sit and eat', () => hooks.rest(0.5, 8, 'Food court people-watching: three families, two first dates, one startup pitch.')); }
    // floor 2: cinema (east) and arcade (west)
    solid(21, 24, 3, 17, 10, 14.5, '#1a1a1a'); sign('PVS CINEMAS', 6, 1, 20.9, 13.2, 10, -Math.PI / 2, { bg: '#0d47a1' });
    spot(19.8, 10, 10, 'watch a movie (₹250)', () => { if (!game.wallet.spend(250, 'PVS Cinemas ticket')) return ui.toast('Not enough money', 'A ticket is ₹250.', 'cash'); hooks.rest(2.5, 20, V.rng.pick(['A 3-hour epic with an interval, two fight scenes and a song in Switzerland. Paisa vasool.', 'The popcorn cost more than the ticket. The film was fine.', 'Everyone clapped when the hero entered. You clapped too.'])); });
    solid(-24, -21, 3, 17, 10, 14.5, '#311b92'); sign('PLAYZONE ARCADE', 6, 1, -20.9, 13.2, 10, Math.PI / 2, { bg: '#6a1b9a' });
    for (let k = 0; k < 4; k++) glow(0.1, 1.2, 1.5, -21.05, 11.5, 5 + k * 3, ['#e040fb', '#00e5ff', '#ffea00', '#ff1744'][k]);
    spot(-19.8, 10, 10, 'play a game (₹100)', () => {
      if (!game.wallet.spend(100, 'PlayZone tokens')) return ui.toast('Not enough money', '₹100 for tokens.', 'cash');
      const win = V.rng() < 0.3; if (win) { game.wallet.respect = Math.min(100, game.wallet.respect + 3); ui.toast('High score!', 'Your name is on the leaderboard. Three kids are furious.', 'star'); } else ui.toast('So close', 'The claw machine let go at the last second. As designed.', 'star');
    });
    // phone accessories kiosk by the atrium on the ground floor
    solid(-12.5, -10.5, -9.5, -8, 0, 1.1, '#37474f'); sign('PHONE COVERS · ₹199', 2.4, 0.5, -11.5, 2.2, -8.05, 0, { bg: '#00838f' });
    spot(-11.5, -7.2, 0, 'buy a phone cover (₹199)', () => { if (game.wallet.spend(199, 'Phone cover')) ui.toast('New phone cover', 'Transparent, with a Kannada slogan on the back. Respect.', 'phone'); else ui.toast('Not enough money', '₹199.', 'cash'); });
    // skylight and lights
    V.glows.push(box(16, 0.1, 12, 0, 14.95, 0, '#fffde7'));
    for (const y of [4.55, 9.55, 14.5]) for (const z of [-12, 12]) glow(30, 0.06, 0.4, 0, y, z, '#ffffff');
    // shoppers walking loops round each floor, and a few at the railings
    const loop = (h) => [[-h, -h * 0.75], [h, -h * 0.75], [h, h * 0.75], [-h, h * 0.75]];
    for (const y of LV) { for (let k = 0; k < 3; k++) person(0, 0, y, 0, loop(y ? 12 : 11 + k), 0.9 + V.rng() * 0.4); }
    for (const [x, z, y] of [[-6, 6.6, 5], [4, -6.6, 5], [-2, 6.6, 10]]) person(x, z, y, z > 0 ? Math.PI : 0);
    finish();
    V.lines = ['Mall announcement: "The owner of KA-01 swift, your car is blocking three cars."', 'A kid is crying in front of the toy store. Universal.', 'Somebody is filming a reel on the escalator.', 'Mall announcement: "Flat 50% off at Lifestylish. Terms and conditions apply. Mostly conditions."'];
    return { x: 0, z: -16.2, y: 0, yaw: 0 };
  }

  // ---------- the street side: where the mall is ----------
  // the biggest commercial block near Brigade Road gets the mall's entrance on its street side
  const mall = (() => {
    const near = { x: 280, z: 170 };
    const cands = world.buildings.filter((b) => (b.style === 'com' || b.style === 'res') && b.area > 900 && b.h < 45 && Math.hypot(b.cx - near.x, b.cz - near.z) < 700)
      .sort((a, b) => b.area / (1 + Math.hypot(b.cx - near.x, b.cz - near.z) / 200) - a.area / (1 + Math.hypot(a.cx - near.x, a.cz - near.z) / 200));
    for (const b of cands) {
      let best = null;
      for (let i = 0; i < b.pts.length; i++) {
        const a = b.pts[i], q = b.pts[(i + 1) % b.pts.length], len = Math.hypot(q[0] - a[0], q[1] - a[1]); if (len < 10) continue;
        const nx = (q[1] - a[1]) / len, nz = -(q[0] - a[0]) / len, mx = (a[0] + q[0]) / 2, mz = (a[1] + q[1]) / 2;
        const nr = world.nearestRoad(mx + nx * 6, mz + nz * 6, 25); if (!nr) continue;
        const d = Math.hypot(nr.x - mx, nr.z - mz) - nr.r.hw;
        if (d > 0 && (!best || d < best.d)) best = { d, x: mx + nx * 1.4, z: mz + nz * 1.4, nx, nz, mx, mz };
      }
      if (best) return { ...best, name: MALL_NAME, b };
    }
    return null;
  })();
  if (mall) {
    // the entrance: a big glass door, a canopy and the sign, facing the street
    const yaw = Math.atan2(mall.nx, mall.nz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(mall.mx, 0, mall.mz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    const g = merge([box(8, 4, 0.3, 0, 2, 0.2, '#9fc3d6'), box(10, 0.3, 3, 0, 4.4, 1.4, '#2e7d32'), box(0.3, 4.4, 0.3, -4.8, 2.2, 2.7, '#2e7d32'), box(0.3, 4.4, 0.3, 4.8, 2.2, 2.7, '#2e7d32')]);
    g.applyMatrix4(m); world.addStatic('concrete', [g]);
    const t = textTexture([MALL_NAME.toUpperCase()], { w: 1024, h: 128, bg: '#1b5e20', fg: '#ffffff', font: '700 64px "Space Grotesk"' });
    const sg = part(new THREE.PlaneGeometry(9, 1.1).translate(0, 5.2, 0.4), '#ffffff'); sg.applyMatrix4(m);
    world.addStatic('mallSign', [sg], { material: new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.35, side: THREE.DoubleSide }) });
  }

  // ---------- being inside ----------
  function enter(kind, opts = {}) {
    const sp = kind === 'mall' ? buildMall() : buildStation(opts.station);
    V.tokens = V.tokens || 0;
    return sp;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function collide(p, r, y = 0) {
    let hit = null;
    for (const b of V.solids) {
      if (b.open > 0 || b.y1 <= y + 0.5 || b.y0 >= y + 1.8) continue;
      const cx = clamp(p.x, b.x1, b.x2), cz = clamp(p.z, b.z1, b.z2), dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d >= r) continue;
      let nx, nz, depth;
      if (d > 1e-6) { nx = dx / d; nz = dz / d; depth = r - d; }
      else { const o = [[p.x - b.x1, -1, 0], [b.x2 - p.x, 1, 0], [p.z - b.z1, 0, -1], [b.z2 - p.z, 0, 1]].sort((a, c) => a[0] - c[0])[0]; nx = o[1]; nz = o[2]; depth = o[0] + r; }
      p.x += nx * depth; p.z += nz * depth;
      if (!hit || depth > hit.depth) hit = { nx, nz, depth, tag: 'edge', item: b };
    }
    p.x = clamp(p.x, V.bounds.x1 + r, V.bounds.x2 - r); p.z = clamp(p.z, V.bounds.z1 + r, V.bounds.z2 - r);
    return hit;
  }
  function rampAt(x, z) { for (const R of V.ramps) { const zl = Math.min(R.z1, R.z2), zh = Math.max(R.z1, R.z2); if (x >= R.x1 && x <= R.x2 && z >= zl && z <= zh) return R; } return null; }
  const rampH = (R, z) => R.ya + (R.yb - R.ya) * (z - R.z1) / (R.z2 - R.z1);
  function groundAt(x, z, y) {
    let g = 0;
    for (const b of V.solids) if (!(b.open > 0) && x >= b.x1 && x <= b.x2 && z >= b.z1 && z <= b.z2 && b.y1 <= y + 0.5 && b.y1 > g) g = b.y1;
    const R = rampAt(x, z); if (R) { const h = rampH(R, z); if (h <= y + 0.6 && h > g) g = h; }
    return g;
  }
  // an escalator moves you along it while you stand on it
  function conveyor(x, z, y) { const R = rampAt(x, z); if (!R || !R.belt || Math.abs(rampH(R, z) - y) > 0.35) return null; return Math.sign(R.z2 - R.z1) * R.belt; }
  // E: the nearest thing to use on your floor
  function action(w, y) {
    let best = null;
    for (const s of V.spots) { const d = Math.hypot(w.x - s.x, w.z - s.z); if (d < s.r && Math.abs(y - s.y) < 1.2 && (!best || d < best.d)) best = { d, s }; }
    return best ? { label: best.s.label, run: best.s.run } : null;
  }
  const vv = new THREE.Vector3();
  function update(dt, t, W, phone) {
    if (!V) return;
    V.t += dt; V.y = W.y;
    // frisking: walk through the frame or booth once
    if (V.frisk && !V.frisk.done && Math.abs(W.pos.x - V.frisk.x) < 1.1 && Math.abs(W.pos.z - V.frisk.z) < 0.6 && Math.abs(W.y - V.frisk.y) < 1) {
      V.frisk.done = true; audio.chime && audio.chime();
      ui.dialogue(V.frisk.mall ? 'Guard: *beep* "Belt? Keys? Phone? Power bank? Okay, go." (Everything beeps. Nobody checks.)' : 'Security: "Arms up. Bag on the belt. Any sharp objects, liquids, power bank?" A gentle pat-down later: "Okay, saar."');
    }
    // ticket gates open for a token or a phone QR
    for (const g of V.gates) {
      if (g.open > 0) { g.open -= dt; continue; }
      const lane = Math.abs(W.pos.x - (g.x1 + g.x2) / 2) < 0.9 && Math.abs(W.y - g.y0) < 1;
      // going out (from the platform side) is free
      if (lane && W.pos.z > g.z2 && W.pos.z < g.z2 + 1.1) { g.open = 2; continue; }
      const near = lane && W.pos.z > g.z1 - 1.1 && W.pos.z < g.z1;
      if (!near) continue;
      if (V.tokens > 0) { V.tokens--; g.open = 3; audio.chime && audio.chime(); ui.toast('Gate open', 'Token in. Walk through.', 'metro'); }
      else if (phone && phone.S && phone.S.tickets > 0) { phone.S.tickets--; g.open = 3; audio.chime && audio.chime(); ui.toast('QR scanned', 'Gate open. Walk through.', 'metro'); }
      else if (!V.said.has('gate')) { V.said.add('gate'); ui.toast('Gate closed', 'Tap a token (₹20 at the counter or the machines), or scan a QR ticket from your phone.', 'metro'); setTimeout(() => V && V.said.delete('gate'), 6000); }
    }
    for (const n of V.npcs) {
      const { ch, path } = n;
      if (!path) { ch.animate(dt, 0); continue; }
      n.s += dt * n.speed;
      let L = 0; const seg = path.map((p, i) => { const q = path[(i + 1) % path.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); L += l; return l; });
      let s = n.s % L, i = 0; while (s > seg[i]) s -= seg[i++];
      const a = path[i], b = path[(i + 1) % path.length], k = s / seg[i];
      ch.root.position.set(a[0] + (b[0] - a[0]) * k, n.y, a[1] + (b[1] - a[1]) * k); ch.root.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]); ch.animate(dt, n.speed);
    }
    if (V.lines && (V.lineT = (V.lineT ?? 12) - dt) <= 0) { V.lineT = 20 + Math.random() * 15; ui.dialogue(V.lines[Math.floor(Math.random() * V.lines.length)]); }
  }
  // the chase camera stays inside the building and below the floor above you
  function clampCam(v) {
    const B = V.bounds; v.x = clamp(v.x, B.x1 + 0.3, B.x2 - 0.3); v.z = clamp(v.z, B.z1 + 0.3, B.z2 - 0.3);
    v.y = clamp(v.y, V.y + 0.6, V.y + 4.2); vv.copy(v);
  }
  return {
    scene, enter, collide, groundAt, conveyor, action, update, clampCam, inside: () => false, ladders: [], vidhanaTop: null,
    get kind() { return V && V.kind; }, get name() { return V && V.name; }, get tokens() { return V ? V.tokens : 0; },
    mall: mall && { name: MALL_NAME, x: mall.x, z: mall.z, nx: mall.nx, nz: mall.nz },
    leave() { V = null; dyn.clear(); },
  };
}
