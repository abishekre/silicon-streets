import * as THREE from 'three';
import { createPassengerMesh, createBeam } from './people.js';
import { emojiTexture, glow } from './textures.js';

const PICKUP_LINES = [
  'Anna, {d} hogthira? Meter haaki please.',
  'Bhaiya… I mean anna! {d}, quickly. Meeting ide.',
  '{d} barthira? Extra 20 kodthini, swalpa fast.',
  'Guru, {d}. Google Maps says 7 min, you say?',
];
const RIDE_LINES = [
  'Swalpa fast aagi hogi, anna!', 'Ee traffic… yen guru, every day same.', 'Google Maps says left, but you know better, anna.',
  'Bro, are you also building a startup?', 'Last week rent hike aaytu. 40% guru!', 'Silk Board is worse, trust me. This is heaven.',
  'Anna, AC ide? …Oh wait, this is an auto.', 'Weather nodi, it will rain at 4 PM sharp.',
];
const CRASH_LINES = ['Anna, nidhaana! Slowly!', 'Ayyo! My laptop!', 'Swalpa nodkondu hogi, anna!'];
const DROP_LINES = ['Thank you anna, keep the change!', 'Super ride guru. 5 stars!', 'Done anna. Nim number save maadkothini.'];

// One job loop, three gig apps (parody brands). Each vehicle gets its own app.
const GIGS = {
  auto: {
    apps: ['Namma Auto'], icon: '🛺', who: 'Passenger', word: 'ride', pickLabel: 'pick up passenger', dropLabel: 'drop off',
    fare: (m) => 30 + m * 0.06, pickup: PICKUP_LINES, ride: RIDE_LINES, crash: CRASH_LINES, drop: DROP_LINES, bad: 'Next time Namma Metro, anna.',
  },
  scooter: {
    apps: ['Swiggly', 'Zoomato'], icon: '🛵', who: 'Customer', word: 'order', pickLabel: 'collect the order', dropLabel: 'hand over the order', delivery: true,
    fare: (m) => 35 + m * 0.035,
    pickup: ['Order for {app}? Packing done, saar. Hot hot!', 'Extra chutney inside, don\'t tilt the bag!', 'Biryani parcel, handle with love.'],
    ride: ['📱 Customer: "Where are you? I can see you on the map going the wrong way."', '📱 Customer: "Please don\'t ring the bell, baby is sleeping."', '📱 Customer: "Ask security for Block C, not Block B!"', '📱 Customer: "Add one Coke? …Never mind."'],
    crash: ['📱 Customer: "Is my biryani okay??"', '📱 Customer: "Why is the tracker shaking?"', 'The dal is now everywhere. Oops.'],
    drop: ['Customer: "Thank you! Leave it… oh you\'re here. Okay."', 'Customer: "Super fast! 5 stars."', 'Customer: "Here, keep ₹20 for the rain."'],
    bad: 'Customer: "The biryani is now a smoothie. 1 star."',
  },
  car: {
    apps: ['Oober'], icon: '🚗', who: 'Rider', word: 'trip', pickLabel: 'pick up rider', dropLabel: 'end trip', surge: true,
    fare: (m) => 60 + m * 0.1,
    pickup: ['Hi, {d}? Please take the fastest route, I have a 2 pm standup.', 'Are you Oober for Priya? Cool. {d}, please.', 'Bro, {d}. And can you increase the AC?'],
    ride: ['Rider: "Bro, which startup do you work for?"', 'Rider: "Can you avoid Outer Ring Road? Actually, everything is ORR now."', 'Rider: "My cab last week had a karaoke system."', 'Rider: "Is this the Hebbal flyover? No? Okay."'],
    crash: ['Rider: "Bro! My cold brew!"', 'Rider: "I am giving you 3 stars for that."', 'Rider: "Easy, easy!"'],
    drop: ['Rider: "Five stars, bro."', 'Rider: "Thanks! Adding a tip in the app."', 'Rider: "Smooth ride. Rare in this city."'],
    bad: 'Rider: "Reporting this trip. Bye."',
  },
};

export const VENDOR_MENUS = {
  elaneer: { title: 'Tender Coconut Cart', kn: 'ಎಳನೀರು', items: [['Elaneer (tender coconut)', 50, 25, 'Three swings of the machete and a straw. Pure Maddur sweetness.']] },
  chai: { title: 'Chai Cart', kn: 'ಟೀ ಅಂಗಡಿ', items: [['Cutting Chai', 15, 10, 'Ginger, extra sugar, tiny glass.'], ['Bun Maska', 25, 15, 'More butter than bun.']] },
  corn: { title: 'Bhutta Cart', kn: 'ಜೋಳ', items: [['Roasted Bhutta', 40, 18, 'Lime, chilli, salt, smoke.']] },
  panipuri: { title: 'Chaat Cart', kn: 'ಪಾನಿ ಪುರಿ', items: [['Pani Puri (6)', 40, 15, 'The crunch, the spicy water, the sweet chutney.'], ['Masala Puri', 50, 20, 'Bengaluru special, drowned in hot peas gravy.']] },
  jasmine: { title: 'Flower Seller', kn: 'ಮಲ್ಲಿಗೆ', items: [['Mysore Mallige string', 30, 5, 'The whole street smells of jasmine now.']] },
};

export function createGame(scene, world, people, ui, audio, hooks) {
  const pmesh = createPassengerMesh(scene); pmesh.visible = false;
  const pickBeam = createBeam(scene, '#ffd23f'); pickBeam.visible = false;
  const dropBeam = createBeam(scene, '#3dff8b'); dropBeam.visible = false;
  const wallet = { money: 500, energy: 80, respect: 70 };

  // ---------- named spots on the real map ----------
  function curb(x, z) {
    const nr = world.nearestRoad(x, z, 150);
    if (!nr) return { x, z };
    const side = ((x - nr.x) * nr.dz - (z - nr.z) * nr.dx) >= 0 ? 1 : -1;
    const o = nr.r.hw - 0.6;
    return { x: nr.x + nr.dz * o * side, z: nr.z - nr.dx * o * side };
  }
  function roadMid(name) {
    const rs = world.roads.filter((r) => r.n === name && r.drive);
    if (!rs.length) return null;
    const len = (r) => r.pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - r.pts[i - 1][0], p[1] - r.pts[i - 1][1]) : 0, 0);
    const r = rs.sort((a, b) => len(b) - len(a))[0];
    const p = r.pts[Math.floor(r.pts.length / 2)];
    return { x: p[0], z: p[1] };
  }
  const SPOTS = [];
  const addSpot = (name, p) => { if (p) SPOTS.push({ name, ...curb(p.x, p.z) }); };
  for (const n of ['Church Street', 'Brigade Road', 'Residency Road', 'Museum Road', 'Lavelle Road', "Saint Mark's Road", 'Vittal Mallya Road', 'Kasturba Road', 'Dickenson Road', 'Infantry Road', 'Richmond Road', 'Commissariat Road', 'Cubbon Road']) addSpot(n, roadMid(n));
  for (const s of world.stations) addSpot(s.name + ' Metro', { x: s.ex, z: s.ez });
  if (world.vidhana) addSpot('Vidhana Soudha', { x: world.vidhana.fx, z: world.vidhana.fz });
  if (world.stadium) addSpot('Chinnaswamy Stadium', { x: world.stadium.x, z: world.stadium.z + world.stadium.r + 20 });
  if (world.ubc) addSpot('UB City', world.ubc);

  const ride = { state: 'cooldown', timer: 4, from: null, to: null, fare: 0, startOdo: 0, rating: 5, quip: 12, earned: 0, rides: 0 };

  // ---------- Peak Bengaluru collectibles ----------
  const COL = [];
  const churchDoor = world.doors.find((d) => d.road === 'Church Street');
  const cm = roadMid('Church Street'), bm = roadMid('Brigade Road');
  if (churchDoor || cm) COL.push({ ...(churchDoor || curb(cm.x, cm.z)), e: '☕', t: 'Filter Kaapi > Cold Brew', b: 'Every table on Church Street is pitching a startup. Two of them are pitching the same one.' });
  if (bm) COL.push({ ...curb(bm.x, bm.z), e: '💻', t: 'Overheard on Brigade Road', b: '"We\'re pivoting to AI… again."' });
  if (people.cows[0]) COL.push({ x: people.cows[0].x, z: people.cows[0].z + 2.5, e: '🐄', t: 'Traffic Police (Unofficial)', b: 'The cow has right of way. Always has, always will.' });
  const bandstand = world.buildings.find((b) => /band stand/i.test(b.name || ''));
  if (bandstand) COL.push({ x: bandstand.cx + 8, z: bandstand.cz + 8, e: '🎺', t: 'Cubbon Park Bandstand', b: 'Sunday mornings: 400 joggers, 1 dog influencer, 0 parking spots.' });
  if (world.stadium) COL.push({ x: world.stadium.x, z: world.stadium.z + world.stadium.r + 8, e: '🏏', t: 'Ee Sala Cup Namde', b: 'Chinnaswamy says this is the year. (It says that every year.)' });
  const mg = world.stations.find((s) => s.elevated);
  if (mg) COL.push({ x: mg.ex + 2, z: mg.ez + 2, e: '🚇', t: 'Namma Metro', b: 'Beat the traffic. Take the purple line. Stand on the right.' });
  if (world.vidhana) COL.push({ x: world.vidhana.fx, z: world.vidhana.fz, e: '🏛️', t: "Government Work is God's Work", b: 'It is literally carved on the building: ಸರ್ಕಾರದ ಕೆಲಸ ದೇವರ ಕೆಲಸ. Look up!' });
  if (world.ubc) COL.push({ ...curb(world.ubc.x, world.ubc.z), e: '🏙️', t: 'UB City', b: 'Where Bengaluru goes to look at things it cannot afford.' });

  const glowTex = glow();
  const items = COL.map((c) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(c.e), depthWrite: false }));
    s.scale.set(2.2, 2.2, 1); s.position.set(c.x, 2.4, c.z);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffd23f', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(2, 2, 1); s.add(halo); scene.add(s);
    return { ...c, s, got: false };
  });

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const fmt = (s, d) => s.replace('{d}', d);
  const dist = (p, s) => Math.hypot(p.x - s.x, p.z - s.z);

  // restaurants you can pick food up from (real OSM names first) and homes to deliver to
  const KITCHENS = world.doors.filter((d) => /restaurant|darshini|cafe|bakery/.test(d.theme)).map((d) => ({ name: d.name, ...curb(d.x, d.z) }));
  const HOMES = world.buildings.filter((b) => b.style === 'res' && b.h < 30 && b.area > 80).filter((_, i) => i % 7 === 0).map((b, i) => {
    const c = curb(b.cx, b.cz); const nr = world.nearestRoad(c.x, c.z, 30);
    return { name: `${['Flat', 'House', 'Block'][i % 3]} ${1 + (i % 9)}${'ABCD'[i % 4]}${nr && nr.r.n ? ', ' + nr.r.n : ''}`, ...c };
  }).filter((h) => Math.abs(h.x) < 1300 && Math.abs(h.z) < 880);

  // a request is only an offer until you accept it: no passenger, beam or GPS before that
  function newRequest(pos, type, ctx) {
    const G = GIGS[type]; ride.kind = type; ride.app = pick(G.apps);
    const pool = G.delivery ? KITCHENS : SPOTS;
    const choices = pool.filter((s) => dist(pos, s) > 80 && dist(pos, s) < 700);
    ride.from = pick(choices.length ? choices : pool);
    ride.state = 'offer'; ride.offerT = 20;
    ride.surge = G.surge && (ctx.rush || ctx.raining) ? 1.6 : 1;
    const d = dist(pos, ride.from);
    const est = Math.round(G.fare(600) * ride.surge * (0.8 + Math.random() * 0.5));
    ui.offer({ app: ride.app, icon: G.icon, title: G.delivery ? `Pick up from ${ride.from.name}` : `Pickup at ${ride.from.name}`,
      sub: `${(d / 1000).toFixed(1)} km away · est. ₹${est}${ride.surge > 1 ? ' · ⚡ surge 1.6×' : ''}`, secs: 20, onAccept: acceptOffer, onDecline: declineOffer });
    audio.chime();
  }
  function acceptOffer() {
    if (ride.state !== 'offer') return;
    const G = GIGS[ride.kind];
    ride.state = 'waiting'; ui.offer(null);
    pmesh.position.set(ride.from.x, 0, ride.from.z); pmesh.visible = true;
    pickBeam.position.set(ride.from.x, 0, ride.from.z); pickBeam.visible = true;
    ui.toast(`✅ ${ride.app}: ${G.word} accepted`, `${G.delivery ? 'Collect the order at' : 'Pickup at'} <b>${ride.from.name}</b>. Follow the GPS.`, 'ride');
  }
  function declineOffer(expired = false) {
    if (ride.state !== 'offer') return;
    ui.offer(null); ride.state = 'cooldown'; ride.timer = 10 + (100 - wallet.respect) * 0.3;
    if (expired) ui.toast(`⌛ ${ride.app} request expired`, 'Someone else took it.');
  }
  function cancel() {
    ride.state = 'cooldown'; ride.timer = 6;
    pmesh.visible = pickBeam.visible = dropBeam.visible = false;
  }

  function buy(name, price, energy, desc) {
    if (wallet.money < price) { ui.toast('💸 Not enough money', `You need ₹${price}. Drive the auto to earn some.`); return false; }
    wallet.money -= price; wallet.energy = Math.min(100, wallet.energy + energy);
    ui.toast(`😋 ${name} · ₹${price}`, desc); audio.cash();
    return true;
  }
  function menuFor(title, kn, list, foot) {
    ui.menu({ title, kn, foot, items: list.map(([n, p, e, d]) => ({ name: n, price: p, desc: d, onPick: () => buy(n, p, e, d) })) });
  }

  // nearest interactable for the current situation
  function nearestAction(ctx) {
    if (ctx.mode === 'drive') {
      const p = ctx.player.pos;
      const G = GIGS[ride.kind];
      if (G && ctx.player.type === ride.kind && ride.state === 'waiting' && dist(p, ride.from) < 8) return { label: G.pickLabel, run: () => pickup(ctx) };
      if (G && ctx.player.type === ride.kind && ride.state === 'riding' && dist(p, ride.to) < 9) return { label: G.dropLabel, run: () => dropoff(ctx) };
      return null;
    }
    if (ctx.mode === 'interior') {
      const w = ctx.walker.pos;
      let best = null;
      for (const it of ctx.interior.interactables) { const d = Math.hypot(w.x - it.x, w.z - it.z); if (d < 1.6 && (!best || d < best.d)) best = { d, it }; }
      if (!best) return null;
      const it = best.it;
      if (it.type === 'counter') return { label: 'order', run: () => { const m = ctx.menu; menuFor(ctx.place.name, m.kn, m.items, 'Tap an item to order'); } };
      if (it.type === 'seat') return { label: it.label.toLowerCase(), run: () => hooks.rest(0.5, 10, 'You sat for a while and people-watched. Peak Bengaluru.') };
      if (it.type === 'door') return { label: 'step outside', run: () => hooks.exitInterior() };
    }
    if (ctx.mode === 'walk') {
      const w = ctx.walker.pos; let best = null;
      const consider = (d, a) => { if (!best || d < best.d) best = { d, a }; };
      for (const d of world.doors) { const dd = dist(w, d); if (dd < 2.4) consider(dd, { label: `enter ${d.name}`, run: () => hooks.enterInterior(d) }); }
      for (const v of world.vendors) { const dd = dist(w, v); if (dd < 2.6) { const m = VENDOR_MENUS[v.type]; consider(dd, { label: `buy from the ${m.title.toLowerCase()}`, run: () => menuFor(m.title, m.kn, m.items, 'Street food, Bengaluru prices') }); } }
      for (const s of world.stations) { const dd = Math.hypot(w.x - s.ex, w.z - s.ez); if (dd < 4) consider(dd, { label: `take Namma Metro from ${s.name}`, run: () => metroMenu(s) }); }
      for (const b of world.benches) { const dd = dist(w, b); if (dd < 1.8) consider(dd, { label: 'sit on the bench', run: () => hooks.rest(1, 15, 'An hour in Cubbon Park. Joggers, squirrels, and a man doing loud laughter yoga.') }); }
      return best && best.a;
    }
    return null;
  }
  function metroMenu(from) {
    const dests = world.stations.filter((s) => s !== from);
    ui.menu({
      title: `${from.name} Metro`, kn: 'ನಮ್ಮ ಮೆಟ್ರೋ', foot: 'Purple Line · tokens ₹20',
      items: dests.map((s) => ({ name: `Ride to ${s.name}`, price: 20, desc: 'Stand on the right. Mind the gap.', onPick: () => {
        if (wallet.money < 20) { ui.toast('💸 Not enough money'); return; }
        wallet.money -= 20; hooks.travel(s, from);
      } })),
    });
  }

  function pickup(ctx) {
    const p = ctx.player, G = GIGS[ride.kind];
    if (Math.abs(p.speed) > 2.5) { ui.toast('Slow down', 'Stop at the pickup point first.'); return; }
    const pool = G.delivery ? HOMES : SPOTS;
    const lo = ride.kind === 'car' ? 400 : 200, hi = ride.kind === 'car' ? 1300 : 900;
    const choices = pool.filter((s) => s !== ride.from && dist(s, ride.from) > lo && dist(s, ride.from) < hi);
    ride.to = pick(choices.length ? choices : pool.filter((s) => s !== ride.from));
    ride.state = 'riding'; ride.startOdo = p.odometer; ride.rating = 5; ride.quip = 10;
    // deliveries come with a promised time; beat it for a tip
    ride.deadline = G.delivery ? dist(ride.from, ride.to) / 6 + 45 : 0; ride.elapsed = 0;
    pmesh.visible = pickBeam.visible = false;
    dropBeam.position.set(ride.to.x, 0, ride.to.z); dropBeam.visible = true;
    const line = fmt(pick(G.pickup), ride.to.name).replace('{app}', ride.app);
    ui.dialogue(G.delivery ? `Restaurant: "${line}"` : `${G.who}: "${line}"`);
    if (G.delivery) ui.toast(`🕒 Deliver in ${Math.ceil(ride.deadline / 60)} min`, `To <b>${ride.to.name}</b>. Potholes spill food.`);
    audio.chime();
  }
  function dropoff(ctx) {
    const p = ctx.player, G = GIGS[ride.kind];
    if (Math.abs(p.speed) > 2.5) { ui.toast('Slow down', 'Stop first.'); return; }
    const early = G.delivery ? ride.elapsed < ride.deadline : true;
    if (G.delivery && !early) ride.rating = Math.max(1, ride.rating - 1);
    // no tips for drivers with a bad reputation
    const tip = ride.rating >= 4.5 && early && wallet.respect > 40 ? 10 + Math.round(Math.random() * 3) * 5 : 0;
    const total = Math.round(ride.fare) + tip;
    ride.earned += total; ride.rides++; wallet.money += total;
    ui.toast(`💸 ${ride.app} paid ₹${total}`, `${ride.surge > 1 ? 'Surge 1.6× · ' : ''}Fare ₹${Math.round(ride.fare)}${tip ? ` + ₹${tip} tip` : ''}${G.delivery && !early ? ' · late!' : ''} · ${'★'.repeat(Math.round(ride.rating))}${'☆'.repeat(5 - Math.round(ride.rating))}`, 'cash');
    const say = ride.rating >= 4 ? pick(G.drop) : G.bad;
    ui.dialogue(say.includes(':') ? say : `${G.who}: "${say}"`);
    audio.cash();
    // a low reputation means fewer job offers
    ride.state = 'cooldown'; ride.timer = 5 + (100 - wallet.respect) * 0.4; dropBeam.visible = false;
  }

  function interact(ctx) { const a = nearestAction(ctx); if (a) { a.run(); return true; } return false; }
  function onCrash() {
    if (ride.state !== 'riding') return; const G = GIGS[ride.kind];
    ride.rating = Math.max(1, ride.rating - 0.5); const l = pick(G.crash); ui.dialogue(l.includes(':') || l.startsWith('The') ? l : `${G.who}: "${l}"`);
  }
  function onPothole() {
    if (ride.state !== 'riding') return; const G = GIGS[ride.kind];
    ride.rating = Math.max(1, ride.rating - (G.delivery ? 0.3 : 0.15));
    if (Math.random() < 0.5) ui.dialogue(G.delivery ? 'The sambar just leaked into the bag. 😬' : `${G.who}: "Ayyo, pothole! My back."`);
  }

  let lowWarned = false;
  function update(dt, t, ctx, gameHoursDelta) {
    for (const b of [pickBeam, dropBeam]) if (b.visible) { b.children[0].material.opacity = 0.25 + Math.sin(t * 3) * 0.08; b.children[1].scale.setScalar(1 + Math.sin(t * 3) * 0.06); }
    const driving = ctx.mode === 'drive';
    if (ride.state === 'cooldown') { if (driving) { ride.timer -= dt; if (ride.timer <= 0) newRequest(ctx.player.pos, ctx.player.type, ctx); } }
    else if (ride.state === 'offer') { ride.offerT -= dt; ui.offerTick(ride.offerT); if (ride.offerT <= 0 || !driving || ctx.player.type !== ride.kind) declineOffer(ride.offerT <= 0); }
    else if (ctx.mode === 'drive' && ctx.player.type !== ride.kind) { cancel(); ui.toast(`${ride.app} job cancelled`, 'You switched vehicles mid-job.'); }
    else if (ride.state === 'riding' && ctx.mode === 'drive') {
      const G = GIGS[ride.kind];
      ride.fare = G.fare(ctx.player.odometer - ride.startOdo) * (ride.surge || 1);
      ride.elapsed += dt;
      ride.quip -= dt;
      if (ride.quip <= 0) { ride.quip = 14 + Math.random() * 10; const l = pick(G.ride); ui.dialogue(l.includes(':') ? l : `${G.who}: "${l}"`); }
    }
    // energy drains with time, faster when running
    wallet.energy = Math.max(0, wallet.energy - gameHoursDelta * 4 - (ctx.running ? dt * 0.15 : 0));
    if (wallet.energy < 20 && !lowWarned) { lowWarned = true; ui.toast('🥱 Low energy', 'Grab a filter kaapi at a darshini or a tender coconut from a cart.'); }
    if (wallet.energy > 30) lowWarned = false;
    const a = nearestAction(ctx);
    ui.prompt(a ? `Press <kbd>E</kbd> to ${a.label}` : ctx.extraPrompt || null);
    const focus = ctx.mode === 'drive' ? ctx.player.pos : ctx.walker.pos;
    if (ctx.mode !== 'interior') for (const it of items) {
      if (it.got) continue;
      it.s.position.y = 2.4 + Math.sin(t * 2 + it.x) * 0.25;
      if (dist(focus, it) < 4.5) {
        it.got = true; it.s.visible = false;
        ui.card(it.e, it.t, it.b, `Peak Bengaluru ${items.filter((i) => i.got).length}/${items.length}`, ctx.mode === 'drive');
        audio.chime();
      }
    }
  }

  function markers() {
    const m = [];
    if (ride.state === 'waiting') m.push({ x: ride.from.x, z: ride.from.z, c: '#ffd23f', big: true });
    if (ride.state === 'riding') m.push({ x: ride.to.x, z: ride.to.z, c: '#3dff8b', big: true });
    for (const it of items) if (!it.got) m.push({ x: it.x, z: it.z, c: '#ff6ad5' });
    for (const s of world.stations) m.push({ x: s.ex, z: s.ez, c: '#b05bd6', icon: 'M' });
    return m;
  }

  return {
    update, interact, onCrash, onPothole, markers, ride, wallet, cancel, spots: SPOTS, acceptOffer, declineOffer: () => declineOffer(false),
    get collected() { return items.filter((i) => i.got).length; }, totalCollectibles: items.length,
  };
}
