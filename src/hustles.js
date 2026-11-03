import * as THREE from 'three';

// Side hustles: quick, well-paid odd jobs that pop up near you, so the city's prices don't grind you down.
// A lost wallet, a film shoot that needs extras, a wedding procession short of dancers, a survey, gully cricket,
// a car that won't start, tourists who want a photo, a shopkeeper with boxes. Gold coin on the street and the minimap.
const KINDS = [
  { id: 'wallet', title: 'A wallet on the footpath', label: 'pick up the wallet', choice: true },
  { id: 'shoot', title: 'Film shoot needs extras', label: 'join the film shoot', hold: 18, pay: 1500, lines: ['Director: "Walk past like you have a 9 o\'clock standup. ACTION!"', 'Director: "Cut! One more, with more Bengaluru attitude."', 'Director: "Perfect! You\'re a natural. Next film, you are the auto driver."'] },
  { id: 'baraat', title: 'Wedding procession needs dancers', label: 'dance in the procession', hold: 15, pay: 1000, lines: ['The band plays the same song for the eleventh time. You dance harder.', 'An uncle pins a ₹10 note to your shirt.', 'The groom\'s horse looks at you with deep judgement.'] },
  { id: 'survey', title: 'Market research survey', label: 'answer the survey (10 min)', instant: 400, text: 'Twenty questions about which of eleven grocery apps you prefer. ₹400, and you now own a branded pen.' },
  { id: 'cricket', title: 'Gully cricket: they need a batter', label: 'take the bat', cricket: true },
  { id: 'push', title: 'A car won\'t start', label: 'push the car', hold: 8, pay: 600, lines: ['"Thalli! Thalli! Push!"', 'It coughs. It splutters. It starts!'] },
  { id: 'photo', title: 'Tourists want a photo', label: 'take their photo', instant: 300, text: 'Thirty photos later, one was good. They tip ₹300 and follow you on Instagram.' },
  { id: 'boxes', title: 'Shopkeeper needs boxes carried', label: 'carry the boxes', hold: 12, pay: 700, lines: ['Box one: rice. Box two: also rice. Box three: definitely rice.', 'Shopkeeper: "Careful, careful! That one is fragile." (It is rice.)'] },
];

export function createHustles({ scene, world, game, ui, audio, state, walker: W, player }) {
  const W$ = game.wallet, live = [];
  const coinMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb300', emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 });
  const coinG = new THREE.CylinderGeometry(0.45, 0.45, 0.08, 20).rotateX(Math.PI / 2);
  const ringG = new THREE.RingGeometry(1.4, 1.7, 32).rotateX(-Math.PI / 2), ringMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.8, depthWrite: false });
  let spawnT = 3, doing = null, earnedToday = 0;
  const edges = world.graph.edges.filter((e) => !e.l); // nothing happens up on a flyover

  function spawn(focus) {
    for (let tries = 0; tries < 30; tries++) {
      const e = edges[Math.floor(Math.random() * edges.length)], s = Math.random() * e.len, side = Math.random() < 0.5 ? 1 : -1, lat = e.w / 2 + 2.2;
      const x = e.ax + e.dx * s + e.dz * lat * side, z = e.az + e.dz * s - e.dx * lat * side, d = Math.hypot(x - focus.x, z - focus.z);
      if (d < 60 || d > 380 || !world.inMap(x, z, 150) || world.insideBuilding(x, z, 0.8) || live.some((h) => Math.hypot(h.x - x, h.z - z) < 120)) continue;
      const K = KINDS[Math.floor(Math.random() * KINDS.length)];
      const g = new THREE.Group(), coin = new THREE.Mesh(coinG, coinMat), ring = new THREE.Mesh(ringG, ringMat);
      coin.position.y = 1.6; ring.position.y = 0.08; g.add(coin, ring); g.position.set(x, 0, z); scene.add(g);
      live.push({ K, x, z, g, coin, t: 240 });
      return;
    }
  }
  function remove(h) { scene.remove(h.g); live.splice(live.indexOf(h), 1); }
  function pay(amount, label) { W$.earn(amount, label); earnedToday += amount; audio.cash && audio.cash(); }

  function run(h) {
    const K = h.K;
    if (K.instant) { remove(h); pay(K.instant, K.title); if (K.id === 'survey') state.hours = (state.hours + 0.17) % 24; ui.toast(`${K.title}: ₹${K.instant}`, K.text, 'cash'); return; }
    if (K.choice) {
      return ui.menu({ title: 'A wallet on the footpath', kn: '', foot: 'Your call', items: [
        { name: 'Find the owner and return it', price: null, desc: 'The address is on a card inside', onPick: () => { remove(h); pay(600, 'Reward: returned a wallet'); W$.respect = Math.min(100, W$.respect + 5); ui.toast('Wallet returned: ₹600 reward', 'Owner: "Aiyo, thank you! My Aadhaar was in there!" Respect +5.', 'cash'); } },
        { name: 'Keep the cash', price: null, desc: '₹1,200 inside. Nobody saw. Probably.', onPick: () => { remove(h); pay(1200, 'Kept a lost wallet'); W$.respect = Math.max(0, W$.respect - 10); ui.toast('₹1,200', 'Somebody saw. They always do. Respect −10.', 'warning'); } },
      ] });
    }
    if (K.cricket) {
      remove(h);
      const r = Math.random();
      if (r < 0.55) { pay(800, 'Gully cricket: hit the winning six'); W$.respect = Math.min(100, W$.respect + 3); ui.toast('SIX! ₹800', 'Over the compound wall. The whole lane cheers. Somebody\'s mother is very angry.', 'cricket'); }
      else if (r < 0.85) { pay(300, 'Gully cricket: a solid 30 runs'); ui.toast('30 runs: ₹300', 'Caught at the gate on 31. "One tip one hand!" they all shout.', 'cricket'); }
      else { W$.fine(200, 'Gully cricket: a broken window'); ui.toast('Window: ₹200', 'You hit it straight through Ramesh uncle\'s window. Everyone runs. You pay.', 'cricket'); }
      return;
    }
    // stand-and-do jobs: stay close until it's done
    doing = { h, left: K.hold, line: 0 }; ui.dialogue(K.lines[0]);
  }

  // E near a hustle (game.addAction, on foot)
  function action(w) {
    if (doing) return null;
    let best = null;
    for (const h of live) { const d = Math.hypot(w.x - h.x, w.z - h.z); if (d < 2.6 && (!best || d < best.d)) best = { d, h }; }
    return best ? { d: best.d, label: `${best.h.K.label}`, run: () => run(best.h) } : null;
  }

  function update(dt, t, focus) {
    for (const h of [...live]) {
      h.coin.rotation.y = t * 2; h.coin.position.y = 1.6 + Math.sin(t * 3 + h.x) * 0.12;
      if ((h.t -= dt) <= 0 && (!doing || doing.h !== h)) remove(h);
    }
    if (state.mode !== 'interior' && live.length < 3 && (spawnT -= dt) <= 0) { spawnT = 8 + Math.random() * 10; spawn(focus); }
    if (doing) {
      const { h } = doing, w = state.mode === 'walk' ? W.pos : null;
      if (!w || Math.hypot(w.x - h.x, w.z - h.z) > 4) { ui.toast('You walked off', `${h.K.title}: no pay this time.`, 'warning'); doing = null; return; }
      const before = doing.left; doing.left -= dt;
      const k = h.K.lines.length, step = h.K.hold / k;
      if (Math.floor((h.K.hold - before) / step) !== Math.floor((h.K.hold - doing.left) / step) && doing.left > 0) ui.dialogue(h.K.lines[Math.min(k - 1, Math.floor((h.K.hold - doing.left) / step))]);
      if (doing.left <= 0) { const K = h.K; remove(h); doing = null; pay(K.pay, K.title); ui.toast(`${K.title}: ₹${K.pay}`, 'Easy money. Well, money.', 'cash'); }
    }
  }
  return {
    update, action,
    get doing() { return doing && { title: doing.h.K.title, left: Math.ceil(doing.left) }; },
    markers: () => live.map((h) => ({ x: h.x, z: h.z, c: '#ffd23f', icon: '₹' })),
    get earned() { return earnedToday; },
  };
}
