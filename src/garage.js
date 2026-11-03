import * as THREE from 'three';
import { box, merge, part } from './util.js';
import { textTexture } from './textures.js';
import { createJobMarker } from './marker.js';

// Namma Garage & Impound: where towed vehicles end up, and where you buy vehicles, upgrades and repairs.
// It's at the tow yard (tow.yard), always on the map and minimap. Vehicles are owned: you start with an auto.
export const PRICES = { scooter: 6000, car: 25000 };
const UPG = {
  engine: { label: 'Engine tune', prices: [1500, 3000, 5000], desc: 'Top speed and pickup +8% a level' },
  brakes: { label: 'Brakes', prices: [1200, 2400], desc: 'Stops 20% shorter a level' },
  susp: { label: 'Suspension', prices: [1500, 3000], desc: 'Potholes hurt a quarter less a level' },
  armour: { label: 'Body armour', prices: [2500, 5000], desc: 'Takes 20% less damage a level' },
};
const PAINTS = { scooter: ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#212121', '#fafafa'], car: ['#c62828', '#263238', '#f5f5f5', '#1565c0', '#8d6e63', '#ff7043'] };
const LABEL = { auto: 'Auto', scooter: 'Scooter', car: 'Car' };
export const RELEASE_FEE = 500, FIRST_FEE = 200, LOAN_MAX = 1500;

export function createGarage({ scene, world, tow, player, game, ui, audio, navTo }) {
  const yard = tow.yard, W = game.wallet;
  const S = { owned: ['auto'], up: { auto: {}, scooter: {}, car: {} }, paint: {}, tows: 0 };

  // stats the player's vehicle drives with: the base model plus whatever you've fitted
  player.tune = (type, base) => {
    const u = S.up[type] || {}, e = u.engine || 0, b = u.brakes || 0;
    return { ...base, max: base.max * (1 + 0.08 * e), accel: base.accel * (1 + 0.1 * e), brake: base.brake * (1 + 0.2 * b), susp: 1 - 0.25 * (u.susp || 0), armour: 1 - 0.2 * (u.armour || 0) };
  };
  player.paintFor = (type) => S.paint[type] || null;
  player.setType(player.type); // re-apply with the tune

  // ---------- the place: a workshop shed with a counter, beside the kerb spot where towed vehicles are left ----------
  // the yard is a kerb spot; the shed goes 5 m further back, on whichever side isn't inside a building
  const nx = Math.sin(yard.yaw + Math.PI / 2), nz = Math.cos(yard.yaw + Math.PI / 2);
  let sx = yard.x + nx * 5, sz = yard.z + nz * 5;
  if (world.insideBuilding(sx, sz, 2)) { sx = yard.x - nx * 5; sz = yard.z - nz * 5; }
  const face = Math.atan2(yard.x - sx, yard.z - sz); // the counter faces the yard
  const m = new THREE.Matrix4().compose(new THREE.Vector3(sx, 0, sz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face), new THREE.Vector3(1, 1, 1));
  const shed = merge([
    box(7, 3.2, 3.6, 0, 1.6, -1.2, '#c9c2b2'), box(7.6, 0.18, 4.6, 0, 3.3, -0.9, '#8a8f96'), // walls, tin roof
    box(5.6, 2.6, 0.08, 0, 1.4, 0.62, '#3a3f46'), // rolling shutter, half up
    box(2.4, 1.05, 0.7, -2.2, 0.52, 1.1, '#f2c230'), box(2.5, 0.08, 0.8, -2.2, 1.08, 1.1, '#5d4037'), // counter
    box(0.15, 4.4, 0.15, 3.3, 2.2, 1.2, '#555'), // sign post
    ...[0, 1, 2].map((i) => part(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 12).rotateX(Math.PI / 2).translate(2.6 - i * 0.2, 0.42 + i * 0.3, -2.4), '#1a1a1a')), // tyre stack
  ]);
  shed.applyMatrix4(m);
  world.addStatic('concrete', [shed]);
  const signTex = textTexture(['NAMMA GARAGE', '& IMPOUND · TOWING · REPAIRS'], { w: 512, h: 160, bg: '#f2c230', fg: '#111', font: '700 44px "Space Grotesk"' });
  const sg = part(new THREE.PlaneGeometry(3.2, 1).translate(3.3, 4.6, 1.3), '#ffffff'); sg.applyMatrix4(m);
  world.addStatic('garageSign', [sg], { material: new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.25, side: THREE.DoubleSide }) });
  // solid shed (not the counter area)
  const c = [[-3.5, -3], [3.5, -3], [3.5, 0.6], [-3.5, 0.6]].map(([x, z]) => { const v = new THREE.Vector3(x, 0, z).applyMatrix4(m); return [v.x, v.z]; });
  world.addPoly(c, 3.3, 'building');
  const cv = new THREE.Vector3(-2.2, 0, 2.1).applyMatrix4(m);
  const counter = { x: cv.x, z: cv.z };
  const place = { name: 'Namma Garage & Impound', x: counter.x, z: counter.z, icon: 'truck' };

  // a ring over your vehicle while it's impounded
  const ring = createJobMarker(scene, '#ff9f1c', 'Impounded');

  const owns = (t) => S.owned.includes(t);
  const fee = () => (S.tows <= 1 ? FIRST_FEE : RELEASE_FEE);

  // ---------- the counter ----------
  function release(paidBy) {
    tow.release(); ring.hide(); navTo(null);
    ui.toast('Released', paidBy === 'loan' ? `On a garage loan: repay ₹${Math.round(fee() * 1.1)} out of your earnings.` : '"Park properly next time, saar."', 'receipt');
  }
  function impoundMenu() {
    const f = fee(), items = [];
    items.push({ name: `Pay the release fee and drive out`, price: f, desc: W.money >= f ? 'Your vehicle is right outside.' : `You have ₹${Math.round(W.money)}.`, onPick: () => { if (W.spend(f, 'Impound release fee')) { audio.cash && audio.cash(); release('cash'); } else ui.toast('Not enough money', 'Take a garage loan, or leave it here and earn the fee on foot.', 'cash'); } });
    if (W.loan + f <= LOAN_MAX) items.push({ name: 'Garage loan: take it now, pay later', price: Math.round(f * 1.1), desc: '10% now, 10% more every day you owe. Half of what you earn goes to it.', onPick: () => { W.borrow(f, 'Garage loan'); W.spend(f, 'Impound release fee'); release('loan'); } });
    else items.push({ name: 'Garage loan', price: null, desc: `Not available: you already owe ₹${Math.round(W.loan)}.`, onPick: () => impoundMenu() });
    items.push({ name: 'Leave it here for now', price: null, desc: 'Earn the fee on foot: walking deliveries, tourists, flyers.', onPick: () => { game.walkGigNow && game.walkGigNow(); ui.toast('It stays at the garage', 'Walking gig offers will come to you. Come back with the fee.', 'walk'); } });
    ui.menu({ title: 'Impound counter', kn: 'ವಾಹನ ಬಿಡುಗಡೆ', foot: S.tows <= 1 ? 'First offence: reduced fee' : 'Release fee', items });
  }
  function shopMenu() {
    const items = [];
    for (const t of ['scooter', 'car']) if (!owns(t)) items.push({ name: `Buy a ${LABEL[t].toLowerCase()}`, price: PRICES[t], desc: t === 'scooter' ? 'Swiggly / Zoomato deliveries. Quick, cheap, gets wet.' : 'Oober trips. Surge at rush hour and in rain.', onPick: () => buy(t) });
    for (const t of S.owned) items.push({ name: `Upgrades for your ${LABEL[t].toLowerCase()}`, price: null, desc: Object.keys(UPG).map((k) => `${UPG[k].label} ${S.up[t][k] || 0}/${UPG[k].prices.length}`).join(' · '), onPick: () => upgradeMenu(t) });
    const near = Math.hypot(player.pos.x - yard.x, player.pos.z - yard.z) < 30;
    if (player.health < 100) items.push({ name: 'Repair your vehicle', price: 80, desc: near ? 'Half what the roadside mechanic charges.' : 'Bring it here first (park by the shed).', onPick: () => { if (!near) return ui.toast('Bring it here', 'Park it by the garage, then come to the counter.', 'wrench'); if (W.spend(80, 'Garage repair')) { player.repair(); ui.toast('Good as new', 'Mostly.', 'wrench'); } else ui.toast('Not enough money', '₹80 for a repair.', 'cash'); } });
    ui.menu({ title: 'Namma Garage', kn: 'ನಮ್ಮ ಗ್ಯಾರೇಜ್', foot: W.loan > 0 ? `Clear your ₹${Math.round(W.loan)} loan to buy` : 'Vehicles, upgrades, repairs', items });
  }
  function canBuy(price, what) {
    if (W.loan > 0 || W.debt > 0) { ui.toast('Clear what you owe first', `₹${Math.round(W.loan + W.debt)} in loans and dues.`, 'receipt'); return false; }
    if (!W.spend(price, what)) { ui.toast('Not enough money', `₹${price}. You have ₹${Math.round(W.money)}.`, 'cash'); return false; }
    audio.cash && audio.cash(); return true;
  }
  function buy(t) {
    if (!canBuy(PRICES[t], `Bought a ${LABEL[t].toLowerCase()}`)) return;
    S.owned.push(t);
    if (PAINTS[t]) S.paint[t] = PAINTS[t][0];
    ui.toast(`Your new ${LABEL[t].toLowerCase()}`, `Press V while driving to switch to it.`, t);
  }
  function upgradeMenu(t) {
    const items = Object.entries(UPG).map(([k, U]) => {
      const lv = S.up[t][k] || 0, maxed = lv >= U.prices.length;
      return { name: `${U.label} ${maxed ? '(max)' : `level ${lv + 1}`}`, price: maxed ? null : U.prices[lv], desc: U.desc, onPick: () => { if (maxed) return upgradeMenu(t); if (canBuy(U.prices[lv], `${LABEL[t]}: ${U.label} ${lv + 1}`)) { S.up[t][k] = lv + 1; if (player.type === t) player.setType(t); ui.toast(`${U.label} fitted`, `${LABEL[t]} level ${lv + 1}.`, 'wrench'); } upgradeMenu(t); } };
    });
    if (PAINTS[t]) items.push({ name: 'Repaint', price: 800, desc: 'Next colour in the book.', onPick: () => { if (canBuy(800, `${LABEL[t]}: repaint`)) { const p = PAINTS[t]; S.paint[t] = p[(p.indexOf(S.paint[t]) + 1) % p.length]; if (player.type === t) player.setType(t); } upgradeMenu(t); } });
    else items.push({ name: 'Repaint', price: null, desc: 'Autos stay yellow and green: transport department rules.', onPick: () => upgradeMenu(t) });
    ui.menu({ title: `Upgrades: ${LABEL[t]}`, kn: '', foot: 'Fitted at once', items });
  }

  // walk-mode interaction for game.nearestAction
  function action(w) {
    const d = Math.hypot(w.x - counter.x, w.z - counter.z);
    if (d > 2.6) return null;
    return { d, label: tow.impounded ? 'get your vehicle back' : 'use the garage counter', run: () => (tow.impounded ? impoundMenu() : shopMenu()) };
  }

  // called when the tow truck drops your vehicle here
  function impounded() {
    S.tows++;
    ring.show(yard.x, yard.z);
    navTo({ ...place, keep: true });
    ui.toast('Towed to Namma Garage', `Release fee ₹${fee()}${W.money < fee() ? '. Short on money? A garage loan, or earn it on foot.' : '.'} The route is on your map.`, 'truck');
  }

  return {
    place, yard, counter, action, owns, impounded, impoundMenu, fee,
    get owned() { return S.owned; },
    update(t, from) { ring.update(t, from); },
    markers() { return [{ x: counter.x, z: counter.z, c: '#ff9f1c', icon: 'G', big: tow.impounded }]; },
    save: () => JSON.parse(JSON.stringify(S)),
    load(s) { if (!s) return; Object.assign(S, s); for (const t of ['auto', 'scooter', 'car']) S.up[t] = S.up[t] || {}; player.setType(player.type); if (tow.impounded) ring.show(yard.x, yard.z); },
    route() { navTo({ ...place, keep: true }); },
  };
}
