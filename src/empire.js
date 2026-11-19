import * as THREE from 'three';
import { textTexture } from './textures.js';

// Getting rich, Bengaluru style. Two big income streams on top of the gigs:
// - Namma Broker: property in every neighbourhood (a "pre-launch plot near the upcoming metro", a PG with "homely
//   food", a lake-view 2BHK with no lake). Rent comes in every few in-game hours, and prices swing with the news
//   (a metro line announced, a flyover cancelled), so you can also buy low and flip.
// - Startup pitches: at any café, pitch an idea to the VC at the corner table, once every few hours. Each funded
//   round is bigger, from Friends & Family to the IPO.
// Satire first: the numbers are generous on purpose.
const PROPS = [
  { id: 'plot', district: 'Kasturi Nagar', name: 'Pre-launch plot "near upcoming metro"', price: 8000, rent: 0, flip: true, blurb: 'Metro coming "soon". Since 2009.' },
  { id: 'studio', district: 'Ejipura', name: '1RK "studio" (a cupboard with a fan)', price: 12000, rent: 3000, blurb: '11 months deposit. Bachelors welcome, cooking not.' },
  { id: 'pg', district: 'Kammanahalli', name: 'PG for freshers, "homely food"', price: 30000, rent: 8000, blurb: 'Homely as in someone\'s home. Not yours.' },
  { id: 'darshini', district: 'Banaswadi', name: 'Darshini franchise', price: 45000, rent: 12000, blurb: 'Standing tables only. Turnover: legendary.' },
  { id: 'lake', district: 'Koramangala', name: '2BHK "lake view" (lake not included)', price: 70000, rent: 19000, blurb: 'The lake is now a mall. The view is of the mall.' },
  { id: 'skybar', district: 'Kalyan Nagar', name: 'Rooftop "skybar" (a terrace with fairy lights)', price: 110000, rent: 30000, blurb: 'Licence pending. Since forever.' },
  { id: 'cowork', district: 'Indiranagar', name: 'Coworking floor "HustleHive"', price: 200000, rent: 55000, blurb: 'Free kombucha. Founders sleep under the desks.' },
  { id: 'parking', district: 'Domlur', name: 'Tech park parking lot', price: 450000, rent: 125000, blurb: 'The most valuable land in the city is where cars wait.' },
  { id: 'penthouse', district: 'MG Road', name: 'Penthouse with a view of the jam', price: 1500000, rent: 420000, blurb: 'You can see Silk Board from here. On a clear day.' },
];
const NEWS = [
  [+0.4, 'Metro line announced near {d}! Brokers are already printing brochures.'], [+0.25, '{d} named "Bengaluru\'s next hotspot" by a blog nobody reads.'],
  [+0.3, 'A famous café opens in {d}. Rents double out of respect.'], [+0.2, 'A unicorn startup leases an office in {d}.'],
  [-0.25, 'Flyover to {d} "postponed" again. Values dip.'], [-0.2, '{d} flooded after 20 minutes of rain. Buyers rethink.'],
  [-0.3, 'Water tankers stop coming to {d}. Panic.'], [+0.35, 'Celebrity cricketer spotted buying coconuts in {d}.'],
];
const ROUNDS = [
  ['Friends & Family', 8000, 25000], ['Angel round', 25000, 70000], ['Seed round', 70000, 220000], ['Series A', 220000, 650000],
  ['Series B', 650000, 1600000], ['IPO', 2000000, 6000000],
];
const IDEAS = [
  'Uber for idli', 'AI that writes horoscopes for your code', 'Blockchain for auto meters', 'Swiggy for filter coffee decoction',
  'LinkedIn but for landlords', 'Dating app that matches by commute time', 'Subscription for potholes (we tell you where they are)',
  'Smart umbrella that predicts 4 PM rain', 'Tinder for PG roommates', 'GPT for Kannada swear words (family-friendly)',
  'Cloud kitchen in an actual cloud', 'Metaverse traffic jam (practice before the real one)', 'NFTs of Silk Board',
  'B2B SaaS for chai stalls', 'Drone delivery of tender coconuts', 'Web3 auto stand', 'An app that tells you which signal is broken',
];
const VC = [
  'VC: "We love it. We don\'t understand it. Even better."', 'VC: "What\'s the TAM? Doesn\'t matter. Here\'s a term sheet."',
  'VC: "Pivot to AI and I\'ll double it." You pivot to AI.', 'VC: "My nephew has a similar idea. Yours has a better logo."',
  'VC: "Revenue? We don\'t believe in revenue here."', 'VC: "Bengaluru needs this. Bengaluru needs everything."',
];
const NO = [
  'VC: "Come back when you have traction." You have a Google Form.', 'VC: "Interesting. Not for us. Have you tried my friend\'s fund?"',
  'The VC left halfway through for another pitch at the next table.', 'VC: "Love the energy. Hate the idea. Keep in touch!" (They won\'t.)',
];
const fmt = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function createEmpire({ scene, world, game, ui, audio, state, player, walker: W, districts }) {
  const W$ = game.wallet;
  const S = { owned: {}, hype: {}, round: 0, pitchAt: -99, rentAcc: 0, hoursAcc: 0, earnedRent: 0, newsT: 2 };
  const at = (name) => districts.find((d) => d.name === name);
  const props = PROPS.map((P) => {
    const d = at(P.district); if (!d) return null;
    // the board stands on the footpath beside the district's main road
    const nr = world.nearestRoad(d.x, d.z, 60); if (!nr) return null;
    const side = ((d.x - nr.x) * nr.dz - (d.z - nr.z) * nr.dx) >= 0 ? 1 : -1, o = nr.r.hw + 2.6;
    const x = nr.x + nr.dz * o * side, z = nr.z - nr.dx * o * side;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(-nr.dz * side, nr.dx * side); // the board faces the road
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), new THREE.MeshStandardMaterial({ color: '#555' })); post.position.y = 1.3;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ emissive: '#ffffff', emissiveIntensity: 0.25, side: THREE.DoubleSide }));
    board.position.y = 2.5; g.add(post, board); scene.add(g);
    return { ...P, x, z, g, board };
  }).filter(Boolean);
  const hype = (p) => S.hype[p.district] || 1;
  const value = (p) => Math.round(p.price * hype(p));
  function paint(p) {
    const own = !!S.owned[p.id];
    const old = p.board.material.map; old && old.dispose();
    p.board.material.map = textTexture(own ? ['YOURS', p.rent ? `rent ${fmt(p.rent)}/day` : `worth ${fmt(value(p))}`] : ['FOR SALE', fmt(value(p)), 'Namma Broker'],
      { w: 512, h: 256, bg: own ? '#1b5e20' : '#c62828', fg: '#ffffff', font: '700 64px "Space Grotesk"' });
    p.board.material.emissiveMap = p.board.material.map; p.board.material.needsUpdate = true;
  }
  props.forEach(paint);

  function deal(p) {
    const v = value(p), own = !!S.owned[p.id];
    const items = own ? [
      { name: `Sell for ${fmt(v * 0.95)}`, price: null, desc: `Market price ${fmt(v)}, less the broker's 5%. You paid ${fmt(S.owned[p.id].paid)}.`, onPick: () => {
        const gain = v * 0.95 - S.owned[p.id].paid; delete S.owned[p.id]; W$.earn(Math.round(v * 0.95), `Sold: ${p.name}`); audio.cash && audio.cash(); paint(p);
        ui.toast(gain >= 0 ? `Sold! Profit ${fmt(gain)}` : `Sold at a loss of ${fmt(-gain)}`, gain >= 0 ? 'The broker hugs you. The buyer looks worried.' : 'The broker blames the monsoon.', 'cash');
      } },
      { name: 'Keep it', price: null, desc: p.rent ? `Earns ${fmt(p.rent)} a day` : 'Wait for the next "metro announcement"', onPick: () => {} },
    ] : [
      { name: `Buy for ${fmt(v)}`, price: null, desc: p.rent ? `Rent ${fmt(p.rent)} a day, paid every 6 hours. ${p.blurb}` : p.blurb, onPick: () => {
        if (!W$.spend(v, `Bought: ${p.name}`)) return ui.toast('Not enough money', `You need ${fmt(v)}. Pitch your startup at a café, or flip a cheaper place first.`, 'cash');
        S.owned[p.id] = { paid: v }; audio.cash && audio.cash(); paint(p);
        ui.toast('Property bought', p.rent ? `${p.name}. Rent starts now: ${fmt(p.rent)} a day.` : `${p.name}. Sell when the news is good.`, 'building');
      } },
      { name: 'Just looking', price: null, desc: 'The broker follows you for two blocks anyway', onPick: () => {} },
    ];
    ui.menu({ title: p.name, kn: `Namma Broker · ${p.district}`, foot: `Market ${hype(p) >= 1 ? '+' : ''}${Math.round((hype(p) - 1) * 100)}% from the news`, items });
  }

  // ---------- startup pitches: sit down in any café or pub, a VC is always at the next table ----------
  function pitch(sit) {
    const R = ROUNDS[Math.min(S.round, ROUNDS.length - 1)], wait = 4 - hoursSince(S.pitchAt);
    if (S.pitchAt > -99 && wait > 0) return (sit(), ui.toast('The VCs are busy', `Every VC in Bengaluru is in a meeting. Try again in ${Math.ceil(wait)} hours.`, 'laptop'));
    const pool = IDEAS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    ui.menu({ title: `Pitch: ${R[0]}`, kn: 'the VC at the next table', foot: 'Pick your idea', items: [...pool.map((idea) => ({ name: idea, price: null, desc: `Raising ${fmt(R[1])}–${fmt(R[2])}`, onPick: () => {
      S.pitchAt = clockAbs();
      const ok = Math.random() < 0.62 + Math.min(0.25, (W$.respect || 0) / 400);
      if (!ok) { ui.dialogue(NO[Math.floor(Math.random() * NO.length)]); return; }
      const amt = Math.round((R[1] + Math.random() * (R[2] - R[1])) / 1000) * 1000;
      W$.earn(amt, `${R[0]}: "${idea}"`); audio.cash && audio.cash();
      ui.dialogue(VC[Math.floor(Math.random() * VC.length)]);
      const val = amt * (8 + Math.floor(Math.random() * 30));
      ui.toast(`${R[0]}: ${fmt(amt)}`, `"${idea}" is now valued at ${fmt(val)}. You have no product. Nobody asked.`, 'cash');
      if (S.round < ROUNDS.length - 1) S.round++;
      else ui.toast('You rang the bell', 'IPO done. From now on every pitch is a keynote fee. Welcome to the crorepati club.', 'star');
    } })), { name: 'Just sit and people-watch', price: null, desc: 'Rest a while', onPick: sit }] });
  }
  // in-game hours as one running number since the game started, for the pitch cooldown
  let wraps = 0, lastH = state.hours;
  const clockAbs = () => wraps * 24 + state.hours, hoursSince = (t) => clockAbs() - t;

  function action(w) {
    for (const p of props) { const d = Math.hypot(w.x - p.x, w.z - p.z); if (d < 3) return { d, label: S.owned[p.id] ? `your ${p.id === 'plot' ? 'plot' : 'property'}: sell or keep` : `talk to the broker (${fmt(value(p))})`, run: () => deal(p) }; }
    return null;
  }
  game.addAction((w) => action(w));
  game.setSeatAction((ctx, sit) => (ctx.place && /cafe|pub|bakery|darshini|restaurant/.test(ctx.place.theme) ? { label: `sit down (a VC is at the next table: ${ROUNDS[S.round][0]})`, run: () => pitch(sit) } : null));
  game.addDriveAction((p) => { for (const q of props) { const d = Math.hypot(p.x - q.x, p.z - q.z); if (d < 6) return { d, label: `talk to the broker about ${q.district}`, run: () => deal(q) }; } return null; });

  function update(dt) {
    // the in-game clock wraps at midnight: count the hours that passed
    let dh = state.hours - lastH; if (dh < -12) { dh += 24; wraps++; } lastH = state.hours;
    if (dh <= 0 || dh > 12) return;
    // rent, paid every 6 in-game hours
    const perHour = props.reduce((a, p) => a + (S.owned[p.id] ? p.rent / 24 : 0), 0);
    S.rentAcc += perHour * dh; S.hoursAcc += dh;
    if (S.hoursAcc >= 6) {
      S.hoursAcc = 0;
      if (S.rentAcc >= 1) { const r = Math.round(S.rentAcc); S.rentAcc = 0; S.earnedRent += r; W$.earn(r, 'Rent from your tenants'); audio.cash && audio.cash(); ui.flavour(`Rent in: ${fmt(r)}. ${['One tenant asked for a "small adjustment".', 'The PG boys want a new geyser.', 'Paid on time. A Bengaluru miracle.'][Math.floor(Math.random() * 3)]}`, 0); }
    }
    // the news moves prices, every few in-game hours
    if ((S.newsT -= dh) <= 0) {
      S.newsT = 2.5 + Math.random() * 3;
      const p = props[Math.floor(Math.random() * props.length)], [k, line] = NEWS[Math.floor(Math.random() * NEWS.length)];
      S.hype[p.district] = Math.max(0.6, Math.min(3, (S.hype[p.district] || 1) * (1 + k)));
      // news only interrupts you about places you own; the rest is a passing line
      const text = line.replace('{d}', p.district);
      if (S.owned[p.id]) ui.toast('Namma Broker news', `${text} Your place there is now worth ${fmt(value(p))}.`, k > 0 ? 'star' : 'warning');
      else ui.flavour(`Broker news: ${text}`, 60000);
      paint(p);
    }
    // and drift back towards normal, slowly
    for (const d in S.hype) S.hype[d] += (1 - S.hype[d]) * Math.min(1, dh * 0.02);
  }
  return {
    update, props,
    places: () => props.map((p) => ({ name: `${p.district}: ${p.name}`, x: p.x, z: p.z, icon: 'building' })),
    markers: () => props.map((p) => ({ x: p.x, z: p.z, c: S.owned[p.id] ? '#43a047' : '#e53935', icon: '₹' })),
    get owned() { return Object.keys(S.owned).length; }, get round() { return S.round; },
    get worth() { return props.reduce((a, p) => a + (S.owned[p.id] ? value(p) : 0), 0); },
    save: () => ({ owned: S.owned, hype: S.hype, round: S.round, earnedRent: S.earnedRent }),
    load(s) { if (!s) return; Object.assign(S, { owned: s.owned || {}, hype: s.hype || {}, round: s.round || 0, earnedRent: s.earnedRent || 0 }); props.forEach(paint); },
  };
}
