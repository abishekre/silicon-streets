import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { part, box, merge, makeRng } from './util.js';
import { createCharacter } from './people.js';

export const MENUS = {
  darshini: { kn: 'ದರ್ಶಿನಿ', items: [
    ['Filter Kaapi', 25, 20, 'Poured from a height. Frothy. Perfect.'], ['Masala Dosa', 70, 35, 'Crisp, golden, with chutney you will dream about.'],
    ['Idli Vada', 50, 30, 'Two idlis, one vada, unlimited sambar.'], ['Kesari Bath', 40, 15, 'Sweet, orange, dripping ghee.'], ['Mysore Bonda', 35, 15, 'Fluffy fried happiness.']] },
  restaurant: { kn: 'ಹೋಟೆಲ್', items: [
    ['South Indian Meals', 180, 60, 'Banana leaf, rice, rasam, sambar, payasa. Refills forever.'], ['Bisi Bele Bath', 120, 40, 'Hot, spicy, with boondi on top.'],
    ['Ragi Mudde & Saaru', 110, 45, 'The real Karnataka power meal.'], ['Neer Dosa', 90, 25, 'Soft as a cloud.'], ['Filter Kaapi', 30, 15, 'To finish, obviously.']] },
  cafe: { kn: 'ಕೆಫೆ', items: [
    ['Cappuccino', 220, 15, 'Latte art shaped like a startup logo.'], ['Cold Brew', 260, 18, 'Brewed for 18 hours. Like your last meeting.'],
    ['Chikmagalur Pour-over', 320, 22, 'Single origin. The barista explains it for 4 minutes.'], ['Croissant', 180, 20, 'Flaky. Buttery. Overpriced. Worth it.'], ['Avocado Toast', 420, 30, 'Peak Indiranagar energy, on MG Road.']] },
  bakery: { kn: 'ಬೇಕರಿ', items: [
    ['Egg Puff', 30, 20, 'Hot from the oven, half an egg inside.'], ['Honey Cake', 40, 15, 'Sticky, coconut-topped, nostalgic.'],
    ['Dil Pasand', 35, 18, 'Tutti-frutti in a puff. Classic Iyengar bakery.'], ['Benne Biscuit', 60, 12, 'Melts in your mouth.'], ['Tea', 15, 10, 'Strong, sweet, in a tiny glass.']] },
  pub: { kn: 'ಪಬ್', items: [
    ['Craft Beer', 350, 8, 'Brewed in Bengaluru, pub capital of India.'], ['Masala Peanuts', 180, 12, 'The real reason you came.'],
    ['Nachos', 290, 20, 'Loaded. Shared. Gone in 4 minutes.'], ['Fresh Lime Soda', 120, 10, 'Sweet or salt? Both.']] },
};

function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const checker = (a, b) => canvasTex(128, 128, (x) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? a : b; x.fillRect(i * 32, j * 32, 32, 32); } x.strokeStyle = 'rgba(0,0,0,0.15)'; for (let i = 0; i <= 4; i++) { x.strokeRect(0, i * 32, 128, 0); x.strokeRect(i * 32, 0, 0, 128); } }, [6, 5]);
const wood = (c1, c2) => canvasTex(256, 256, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? c1 : c2; x.fillRect(0, i * 32, 256, 32); x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, i * 32, 256, 2); for (let k = 0; k < 30; k++) { x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(Math.random() * 256, i * 32 + Math.random() * 30, 40, 1); } } }, [3, 3]);
const brick = () => canvasTex(256, 256, (x) => { x.fillStyle = '#d9cfc4'; x.fillRect(0, 0, 256, 256); for (let j = 0; j < 16; j++) for (let i = 0; i < 9; i++) { x.fillStyle = ['#a0503a', '#9a4a35', '#b05b42', '#8e4532'][(i * 7 + j * 3) % 4]; x.fillRect(i * 32 - (j % 2) * 16 + 1, j * 16 + 1, 30, 14); } }, [3, 1.5]);
const plain = (c) => canvasTex(64, 64, (x) => { x.fillStyle = c; x.fillRect(0, 0, 64, 64); for (let k = 0; k < 300; k++) { x.fillStyle = 'rgba(0,0,0,0.03)'; x.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); } }, [4, 2]);

// Each venue gets a cuisine from its name, which decides its menu and base look.
export const CUISINES = {
  tea: { look: 'darshini', kn: 'ಟೀ ಅಂಗಡಿ', tag: 'Chai, Bun & Gossip', icon: '🍵', items: [
    ['Masala Chai', 20, 10, 'Strong, milky, cardamom and ginger.'], ['Irani Chai', 30, 12, 'Thick, sweet, served with a tiny saucer.'],
    ['Ginger Lemon Tea', 25, 10, 'For the throat after a day in traffic.'], ['Bun Maska', 30, 15, 'Soft bun, absurd amount of butter.'],
    ['Osmania Biscuit', 10, 5, 'Dip it. Do not let it sink.'], ['Samosa', 20, 15, 'Hot, crisp, with green chutney.']] },
  sandwich: { look: 'cafe', kn: 'ಸ್ಯಾಂಡ್‌ವಿಚ್', tag: 'Pressed & Toasted', icon: '🥪', items: [
    ['Paneer Tikka Panini', 240, 30, 'Smoky paneer, mint mayo, pressed crisp.'], ['Chicken Pesto Panini', 290, 32, 'Basil pesto, sun-dried tomato, mozzarella.'],
    ['Bombay Masala Toast', 120, 22, 'Potato masala, beetroot, cheese, green chutney.'], ['Grilled Veg Sandwich', 180, 25, 'Peppers, zucchini, hummus.'],
    ['Iced Lemon Tea', 140, 8, 'Cold, sweet, very needed.']] },
  pizza: { look: 'cafe', kn: 'ಪಿಜ್ಜಾ', tag: 'Wood-fired since Tuesday', icon: '🍕', items: [
    ['Margherita', 299, 35, 'Tomato, basil, mozzarella. Classic.'], ['Paneer Makhani Pizza', 399, 40, 'Bengaluru fusion at its finest.'],
    ['Garlic Bread', 149, 15, 'Buttery, garlicky, gone in seconds.'], ['Cold Coffee', 129, 10, 'Thick, with a scoop of ice cream.']] },
  burger: { look: 'fastfood', kn: 'ಬರ್ಗರ್', tag: 'Fast, Hot, Messy', icon: '🍔', items: [
    ['Aloo Tikki Burger', 99, 25, 'The Indian classic.'], ['Crispy Chicken Burger', 179, 30, 'Crunchy, saucy, huge.'],
    ['Peri Peri Fries', 129, 15, 'Spicy dust on everything.'], ['Thick Shake', 149, 18, 'Spoon required.']] },
  biryani: { look: 'restaurant', kn: 'ಬಿರಿಯಾನಿ', tag: 'Dum Biryani · Kebabs', icon: '🍛', items: [
    ['Chicken Biryani', 280, 55, 'Fragrant rice, tender chicken, the egg on top.'], ['Mutton Biryani', 380, 60, 'Worth every rupee.'],
    ['Veg Biryani', 220, 45, 'Yes, vegetarians, it counts.'], ['Chicken Kebab', 260, 35, 'Charred, juicy, with onion rings.'], ['Raita', 40, 5, 'Cools everything down.']] },
  chinese: { look: 'restaurant', kn: 'ಚೈನೀಸ್', tag: 'Indo-Chinese', icon: '🥡', items: [
    ['Gobi Manchurian', 180, 25, 'The most Indian Chinese dish ever.'], ['Hakka Noodles', 200, 30, 'Wok-tossed, smoky.'],
    ['Chilli Chicken', 260, 32, 'Dry, spicy, with spring onions.'], ['Veg Momos', 150, 20, 'Steamed, with fiery red chutney.']] },
  northindian: { look: 'restaurant', kn: 'ಉತ್ತರ ಭಾರತೀಯ', tag: 'Tandoor & Curries', icon: '🫓', items: [
    ['Butter Chicken', 320, 45, 'Rich, creamy, unapologetic.'], ['Paneer Butter Masala', 280, 40, 'The vegetarian answer.'],
    ['Dal Makhani', 240, 35, 'Slow-cooked overnight.'], ['Butter Naan', 60, 15, 'Tear, dip, repeat.'], ['Sweet Lassi', 90, 15, 'Thick enough to stand a spoon in.']] },
  icecream: { look: 'bakery', kn: 'ಐಸ್ ಕ್ರೀಂ', tag: 'Sundaes & Scoops', icon: '🍨', items: [
    ['Death by Chocolate', 210, 20, 'A Bengaluru legend in a glass.'], ['Hot Chocolate Fudge', 170, 18, 'Hot fudge on cold ice cream.'],
    ['Malai Kulfi', 80, 10, 'Dense, nutty, on a stick.'], ['Belgian Waffle', 190, 22, 'Crisp edges, soft middle.']] },
  fine: { look: 'fine', kn: 'ಫೈನ್ ಡೈನಿಂಗ್', tag: 'Fine Dining · Reservations Only', icon: '🥂', items: [
    ["Chef's Tasting Menu (7 courses)", 4500, 80, 'Seven tiny plates, each explained by a waiter in a bow tie.'], ['Coorg Pandi Curry', 1250, 45, 'Kodava pork curry with kachampuli, plated like art.'],
    ['Mangalorean Ghee Roast Prawns', 1450, 45, 'Fiery, buttery, with neer dosa on the side.'], ['Filter Coffee Tiramisu', 720, 22, 'Chikmagalur coffee meets Italy.'],
    ['Tender Coconut Panna Cotta', 650, 20, 'Wobbles beautifully.'], ['Glass of Nashik Sauvignon Blanc', 950, 5, 'The sommelier nods approvingly.']] },
  coffee: { look: 'cafe' }, bakery: { look: 'bakery' }, pub: { look: 'pub' }, darshini: { look: 'darshini' }, restaurant: { look: 'restaurant' },
};
const RULES = [
  [/hotel|taj|oberoi|ritz|leela|itc|marriott|jw |fine|lounge|bistro|toscano|karavalli|olive|smoke house|caperberry|grill room|rooftop|skyye|ultra|caf[eé] noir|sheraton|conrad/, 'fine'],
  [/chai|tea|chaayos|irani/, 'tea'], [/panini|sandwich|sub\b|subway|deli|toast/, 'sandwich'], [/pizza|domino|pizzeria/, 'pizza'],
  [/burger|fries|kfc|mcdonald|wrap/, 'burger'], [/biryani|meghana|empire|nagarjuna|kebab|bbq|grill/, 'biryani'],
  [/chinese|wok|momo|noodle|mainland|chung|chang|szechuan|dragon/, 'chinese'], [/punjab|dhaba|tandoor|naan|delhi|paratha/, 'northindian'],
  [/ice ?cream|gelato|corner house|dessert|waffle|kulfi|cream/, 'icecream'], [/bakery|bake|cake|iyengar/, 'bakery'],
  [/pub|bar\b|brew|tap|social|beer/, 'pub'], [/darshini|tiffin|udupi|bhavan|sagar|idli|dosa|kaapi|vidyarthi|mtr/, 'darshini'],
  [/coffee|cafe|café|roast|starbucks|tokai|third wave|fourth wave|ctrl/, 'coffee'],
];
export function cuisineFor(name, theme, upscale = false) {
  const n = name.toLowerCase();
  // restaurants in the luxury district (UB City) are fine dining
  if (upscale && (theme === 'restaurant' || theme === 'cafe' || theme === 'pub')) return 'fine';
  for (const [re, c] of RULES) if (re.test(n)) return c;
  return theme === 'cafe' ? 'coffee' : theme;
}
export function menuFor(name, theme, upscale = false) {
  const c = cuisineFor(name, theme, upscale), cu = CUISINES[c];
  return cu.items ? cu : MENUS[cu.look === 'cafe' ? 'cafe' : c] || MENUS[cu.look] || MENUS.cafe;
}
const hashStr = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const WALLS = {
  darshini: ['#f3e7b3', '#e8f0d8', '#fde2c4', '#dfeef0', '#f6d4d4'], restaurant: ['#f6d7a7', '#e9c9a0', '#f1e0c5', '#d9b38c', '#c8d8c0'],
  cafe: ['brick', '#2f3e46', '#e7dccb', 'brick', '#3d405b'], bakery: ['#fce4ec', '#fff1d6', '#e3f2fd', '#f3e5f5'], pub: ['wood', 'wood', '#22313f'], fine: ['wood', 'wood', '#1d2b24', '#2a1f2d'], fastfood: ['#ffe082', '#ffccbc', '#c8e6c9'],
};
const DADO = { darshini: ['#2e7d32', '#1565c0', '#b71c1c', '#00695c'], restaurant: ['#8d4f2a', '#5d4037', '#33691e'], bakery: ['#f8bbd0', '#ffcc80', '#b3e5fc'], fastfood: ['#d32f2f', '#f57c00'] };
const THEMES = {
  darshini: { wall: () => plain('#f3e7b3'), dado: '#2e7d32', floor: () => checker('#e8e2d0', '#3c6e47'), light: '#f4f8ff', lightI: 2.2, counter: '#b0b7bf', board: ['#1b5e20', '#fff59d'] },
  restaurant: { wall: () => plain('#f6d7a7'), dado: '#8d4f2a', floor: () => checker('#e9dcc6', '#b5835a'), light: '#ffe7c4', lightI: 1.9, counter: '#6d4c41', board: ['#5d1f12', '#ffe082'] },
  cafe: { wall: () => brick(), dado: null, floor: () => wood('#7a5534', '#6b4a2c'), light: '#ffc98a', lightI: 1.5, counter: '#3e2c22', board: ['#222', '#f5f5f5'] },
  bakery: { wall: () => plain('#fce4ec'), dado: '#f8bbd0', floor: () => checker('#ffffff', '#f3d6c4'), light: '#fff3e0', lightI: 2.0, counter: '#d7ccc8', board: ['#4e342e', '#ffe0b2'] },
  pub: { wall: () => wood('#3b2a20', '#33241b'), dado: null, floor: () => wood('#2a1d15', '#241810'), light: '#ffb060', lightI: 1.1, counter: '#2a1b12', board: ['#111', '#ffb300'] },
  fine: { wall: () => wood('#2a1a12', '#24160f'), dado: null, floor: () => checker('#ece9e2', '#262626'), light: '#ffd29a', lightI: 1.2, counter: '#141414', board: ['#0f0f0f', '#d4af37'] },
  fastfood: { wall: () => plain('#ffe082'), dado: '#d32f2f', floor: () => checker('#fafafa', '#e53935'), light: '#ffffff', lightI: 2.3, counter: '#c62828', board: ['#b71c1c', '#ffffff'] },
};

export function createInterior() {
  const scene = new THREE.Scene();
  const W = 12, D = 10, H = 3.6;
  const hemi = new THREE.HemisphereLight('#ffffff', '#6b5a48', 0.9); scene.add(hemi);
  const l1 = new THREE.PointLight('#ffffff', 12, 14, 1.4); l1.position.set(-2.5, 3.2, 0); scene.add(l1);
  const l2 = new THREE.PointLight('#ffffff', 12, 14, 1.4); l2.position.set(2.5, 3.2, -1); scene.add(l2);
  const dyn = new THREE.Group(); scene.add(dyn);
  let fan = null, windowMat = null, colliders = [], interactables = [], theme = 'cafe';

  let menu = MENUS.cafe;
  function enter(th, name, upscale = false) {
    // the venue's name picks its cuisine (menu + base look); a hash of the name varies colours and layout
    const cu = CUISINES[cuisineFor(name, th, upscale)] || CUISINES.coffee;
    theme = THEMES[cu.look] ? cu.look : 'cafe'; menu = menuFor(name, th, upscale);
    const rng = makeRng(hashStr(name));
    const base = THEMES[theme], wv = rng.pick(WALLS[theme] || ['#eeeeee']);
    const T = { ...base,
      wall: wv === 'brick' ? brick : wv === 'wood' ? () => wood(rng.pick(['#3b2a20', '#4a2f22', '#2e2a26']), '#33241b') : () => plain(wv),
      dado: base.dado ? rng.pick(DADO[theme] || [base.dado]) : null,
      counter: rng.pick([base.counter, base.counter, rng.pick(['#5d4037', '#455a64', '#b0b7bf', '#8d6e63', '#263238'])]),
      light: new THREE.Color(base.light).lerp(new THREE.Color(rng() < 0.5 ? '#ffd9a8' : '#e8f1ff'), 0.4).getStyle(),
    };
    dyn.clear(); colliders = []; interactables = [];
    scene.background = new THREE.Color('#1a1410');
    l1.color.set(T.light); l2.color.set(T.light); l1.intensity = l2.intensity = T.lightI * 6;
    hemi.intensity = theme === 'pub' ? 0.35 : theme === 'fine' ? 0.45 : 0.8;
    const wallMat = new THREE.MeshStandardMaterial({ map: T.wall(), roughness: 0.9 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: T.floor(), roughness: 0.6 }));
    floor.receiveShadow = true; dyn.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: theme === 'pub' || theme === 'fine' ? '#1c140f' : '#f2efe8' })); ceil.position.y = H; dyn.add(ceil);
    const wall = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat); m.position.set(x, H / 2, z); m.rotation.y = ry; dyn.add(m); };
    wall(W, 0, -D / 2, 0); wall(D, -W / 2, 0, Math.PI / 2); wall(D, W / 2, 0, -Math.PI / 2);
    wall(W / 2 - 1, -(W / 4 + 0.5), D / 2, Math.PI); wall(W / 2 - 1, W / 4 + 0.5, D / 2, Math.PI);
    const lintel = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.0), wallMat); lintel.position.set(0, H - 0.5, D / 2); lintel.rotation.y = Math.PI; dyn.add(lintel);
    // the street outside, seen through the doorway
    windowMat = new THREE.MeshBasicMaterial({ color: '#9ec3e6' });
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(2, H - 1), windowMat); outside.position.set(0, (H - 1) / 2, D / 2 + 0.3); outside.rotation.y = Math.PI; dyn.add(outside);
    if (T.dado) {
      const dm = new THREE.MeshStandardMaterial({ color: T.dado, roughness: 0.35 });
      for (const [w, x, z, ry] of [[W, 0, -D / 2 + 0.01, 0], [D, -W / 2 + 0.01, 0, Math.PI / 2], [D, W / 2 - 0.01, 0, -Math.PI / 2], [W / 2 - 1, -(W / 4 + 0.5), D / 2 - 0.01, Math.PI], [W / 2 - 1, W / 4 + 0.5, D / 2 - 0.01, Math.PI]]) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.1), dm); d.position.set(x, 0.55, z); d.rotation.y = ry; dyn.add(d);
      }
    }
    // counter + menu board on the back wall
    const counter = new THREE.Mesh(new RoundedBoxGeometry(6, 1.05, 0.8, 2, 0.05), new THREE.MeshStandardMaterial({ color: T.counter, roughness: 0.35, metalness: theme === 'darshini' ? 0.8 : 0.1 }));
    counter.position.set(0, 0.525, -3.4); counter.castShadow = true; dyn.add(counter);
    colliders.push({ x1: -3, x2: 3, z1: -3.8, z2: -3.0 });
    interactables.push({ type: 'counter', x: 0, z: -2.5, label: `Order at the counter` });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.9), new THREE.MeshStandardMaterial({ map: menuTex(name, menu, T.board), emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.8 }));
    board.position.set(0, 2.45, -D / 2 + 0.02); dyn.add(board);
    // staff behind the counter
    const staff = createCharacter(dyn, { shirt: theme === 'darshini' || theme === 'fine' ? '#ffffff' : theme === 'pub' ? '#111111' : '#4e342e', pants: '#222', skin: '#8d5a3b' });
    staff.root.position.set(0.8, 0, -4.3); staff.root.rotation.y = 0;
    // props on the counter
    const P = [];
    if (theme === 'darshini' || theme === 'restaurant') for (let i = 0; i < 7; i++) P.push(part(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 10).translate(-2.4 + i * 0.4, 1.12, -3.3), '#c0c7cf'));
    if (theme === 'cafe') { P.push(box(0.5, 0.55, 0.45, -2.2, 1.33, -3.4, '#9e9e9e'), box(0.35, 0.25, 0.35, 2.2, 1.18, -3.3, '#111')); }
    if (theme === 'bakery') for (let i = 0; i < 12; i++) P.push(part(new RoundedBoxGeometry(0.28, 0.12, 0.22, 2, 0.04).translate(-2.4 + (i % 6) * 0.9, 1.11 + Math.floor(i / 6) * 0.01, -3.2 - Math.floor(i / 6) * 0.3), rng.pick(['#d4a056', '#f2c48d', '#a0522d', '#fff3e0'])));
    if (theme === 'pub') for (let i = 0; i < 8; i++) P.push(part(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 10).translate(-2.6 + i * 0.7, 1.2, -3.35), rng.pick(['#2e7d32', '#6d4c41', '#ffb300'])));
    // tables
    const seats = theme === 'darshini' || theme === 'fine' ? [] : [[-3.5, 0.5], [3.5, 0.5], [-3.5, 3], [3.5, 3], [0, 1.4]];
    // fine dining: white tablecloths, velvet chairs, candles, wine glasses, gold trim, chandeliers, a pianist
    const fineTables = theme === 'fine' ? [[-3.6, -0.6], [3.6, -0.6], [-3.6, 2.6], [3.6, 2.6], [0, 1.2]] : [];
    for (const [x, z] of fineTables) {
      P.push(part(new THREE.CylinderGeometry(0.66, 0.74, 0.76, 22).translate(x, 0.38, z), '#f7f5f0'));
      for (const a of [0, Math.PI]) {
        const cx = x + Math.cos(a) * 1.0;
        P.push(box(0.5, 0.08, 0.5, cx, 0.48, z, '#6d1420'), box(0.5, 0.95, 0.08, cx + Math.cos(a) * 0.24, 0.95, z, '#6d1420'), box(0.06, 0.46, 0.06, cx, 0.23, z, '#c9a227'));
        P.push(part(new THREE.CylinderGeometry(0.16, 0.16, 0.01, 16).translate(x + Math.cos(a) * 0.38, 0.77, z), '#ffffff'));
        P.push(part(new THREE.ConeGeometry(0.04, 0.09, 10).rotateX(Math.PI).translate(x + Math.cos(a) * 0.3, 0.9, z + 0.2), '#e6eef2'), part(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 4).translate(x + Math.cos(a) * 0.3, 0.81, z + 0.2), '#e6eef2'));
      }
      colliders.push({ c: true, x, z, r: 0.8 });
      interactables.push({ type: 'seat', x, z: z + 0.95, label: 'Take your reserved table' });
    }
    if (theme === 'fine') {
      for (const y of [1.1, 3.3]) for (const [w, x, z, ry] of [[W, 0, -D / 2 + 0.03, 0], [D, -W / 2 + 0.03, 0, 1], [D, W / 2 - 0.03, 0, 1]]) P.push(ry ? box(0.03, 0.05, w, x, y, z, '#c9a227') : box(w, 0.05, 0.03, x, y, z, '#c9a227'));
      P.push(box(1.6, 1.0, 0.7, -4.6, 0.5, -3.9, '#0d0d0d'), box(1.5, 0.06, 0.3, -4.6, 1.02, -3.6, '#f2f2f2'));
      for (const [x, z] of [[-5.5, -1.5], [5.5, -1.5], [5.5, 4.4], [-5.5, 4.4]]) P.push(part(new THREE.CylinderGeometry(0.22, 0.3, 0.9, 12).translate(x, 0.45, z), '#d8d0c0'), part(new THREE.IcosahedronGeometry(0.45, 1).translate(x, 1.25, z), '#2e5b2a'));
      const candleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.2, 1.0) });
      for (const [x, z] of fineTables) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), candleMat); c.position.set(x, 0.84, z); dyn.add(c); }
      const gold = new THREE.MeshStandardMaterial({ color: '#c9a227', metalness: 0.9, roughness: 0.25 });
      const crystal = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 2.4, 1.8) });
      for (const [x, z] of [[-2.6, 1], [2.6, 1]]) {
        const ch = new THREE.Group(); ch.position.set(x, H - 0.75, z);
        ch.add(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 6, 24).rotateX(Math.PI / 2), gold));
        for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), crystal); const a = i / 10 * Math.PI * 2; b.position.set(Math.cos(a) * 0.55, -0.08, Math.sin(a) * 0.55); ch.add(b); }
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.75, 5), gold); stem.position.y = 0.37; ch.add(stem);
        dyn.add(ch);
      }
      const pianist = createCharacter(dyn, { shirt: '#111111', pants: '#111', skin: '#8d5a3b' });
      pianist.root.position.set(-4.6, -0.42, -3.0); pianist.root.rotation.y = Math.PI; pianist.animate(0, 0, true);
    }
    const stands = theme === 'darshini' ? [[-3.3, 0.3], [3.3, 0.3], [-1.5, 2.2], [1.5, 2.2], [-3.3, 3.2], [3.3, 3.2]] : [];
    const woodC = theme === 'pub' ? '#3e2723' : theme === 'cafe' ? '#8d6e63' : '#a1887f';
    for (const [x, z] of seats) {
      P.push(part(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 18).translate(x, 0.76, z), woodC), part(new THREE.CylinderGeometry(0.06, 0.08, 0.74, 8).translate(x, 0.37, z), '#333'));
      for (const a of [0, Math.PI]) { const cx = x + Math.cos(a) * 0.95, cz = z + Math.sin(a) * 0.15; P.push(box(0.45, 0.06, 0.45, cx, 0.46, cz, woodC), box(0.45, 0.5, 0.06, cx + Math.cos(a) * 0.2, 0.72, cz, woodC), box(0.05, 0.46, 0.05, cx, 0.23, cz, '#333')); }
      if (theme === 'cafe' && rng() < 0.6) P.push(box(0.34, 0.02, 0.24, x - 0.1, 0.8, z, '#cfd8dc'), part(new THREE.BoxGeometry(0.34, 0.22, 0.01).rotateX(-0.3).translate(x - 0.1, 0.92, z - 0.13), '#263238'));
      colliders.push({ c: true, x, z, r: 0.75 });
      interactables.push({ type: 'seat', x, z: z + 0.9, label: 'Sit down' });
    }
    for (const [x, z] of stands) {
      P.push(part(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 18).translate(x, 1.05, z), '#c0c7cf'), part(new THREE.CylinderGeometry(0.05, 0.06, 1.04, 8).translate(x, 0.52, z), '#9aa1a8'));
      P.push(part(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 10).translate(x + 0.15, 1.14, z), '#c0c7cf'));
      colliders.push({ c: true, x, z, r: 0.5 });
      interactables.push({ type: 'seat', x, z: z + 0.8, label: 'Stand and sip' });
    }
    if (theme === 'cafe' || theme === 'bakery') for (const [x, z] of [[-5.4, -4.4], [5.4, -4.4], [-5.4, 4.3]]) P.push(part(new THREE.CylinderGeometry(0.25, 0.2, 0.5, 10).translate(x, 0.25, z), '#8d6e63'), part(new THREE.IcosahedronGeometry(0.5, 0).translate(x, 0.85, z), '#2e7d32'));
    if (P.length) { const m = new THREE.Mesh(merge(P), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 })); m.castShadow = true; dyn.add(m); }
    // ceiling fan (darshinis and restaurants) or pendants
    fan = null;
    if (theme === 'fine') { /* chandeliers instead */ } else if (theme === 'darshini' || theme === 'restaurant') {
      fan = new THREE.Group(); fan.position.set(0, H - 0.35, 1);
      fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 12), new THREE.MeshStandardMaterial({ color: '#795548' })));
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.16), new THREE.MeshStandardMaterial({ color: '#8d6e63' })); b.position.x = 0.6; const p = new THREE.Group(); p.rotation.y = i * 2.094; p.add(b); fan.add(p); }
      dyn.add(fan);
      const tube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) })); tube.position.set(0, 2.9, -D / 2 + 0.05); dyn.add(tube);
    } else {
      for (const [x, z] of [[-3.5, 0.5], [3.5, 0.5], [0, 1.4], [-3.5, 3], [3.5, 3]]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.2) })); b.position.set(x, 2.3, z); dyn.add(b);
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, H - 2.3, 4), new THREE.MeshBasicMaterial({ color: '#111' })); w.position.set(x, 2.3 + (H - 2.3) / 2, z); dyn.add(w);
      }
    }
    if (theme === 'pub') {
      const neon = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.7), new THREE.MeshBasicMaterial({ map: neonTex(name), transparent: true })); neon.position.set(-W / 2 + 0.02, 2.4, 0); neon.rotation.y = Math.PI / 2; dyn.add(neon);
      const tv = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshBasicMaterial({ map: cricketTex() })); tv.position.set(W / 2 - 0.02, 2.2, -1); tv.rotation.y = -Math.PI / 2; dyn.add(tv);
    }
    // customers
    const shirts = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fafafa', '#8e24aa', '#ff7043'];
    // seated customers face their table from both chairs and sit with bent knees
    const fineShirts = ['#1b1b1b', '#2c3e50', '#4a148c', '#f5f5f5', '#7b1fa2', '#263238'];
    const spotsC = theme === 'darshini' ? stands.map(([x, z]) => [x - 0.6, z, Math.PI / 2, false])
      : (theme === 'fine' ? fineTables : seats).flatMap(([x, z]) => { const off = theme === 'fine' ? 1.0 : 0.95; return [[x - off, z, Math.PI / 2, true], [x + off, z, -Math.PI / 2, true]]; });
    for (const [x, z, yaw, sit] of spotsC) {
      if (rng() < 0.45) continue;
      const ch = createCharacter(dyn, { shirt: rng.pick(theme === 'fine' ? fineShirts : shirts), pants: theme === 'fine' ? '#111' : '#263238', skin: rng.pick(['#8d5a3b', '#a8714a', '#6e4429']) });
      ch.root.position.set(x, sit ? -0.42 : 0, z); ch.root.rotation.y = yaw;
      if (sit) ch.animate(0, 0, true);
    }
    interactables.push({ type: 'door', x: 0, z: D / 2 - 0.6, label: 'Step outside' });
    return { x: 0, z: D / 2 - 1.2, yaw: Math.PI };
  }

  function collide(p, r) {
    p.x = Math.max(-W / 2 + r, Math.min(W / 2 - r, p.x));
    p.z = Math.max(-D / 2 + r + 0.9, Math.min(D / 2 - r - 0.1, p.z));
    for (const c of colliders) {
      if (c.c) { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), rr = r + c.r; if (d < rr && d > 1e-5) { p.x += dx / d * (rr - d); p.z += dz / d * (rr - d); } }
      else if (p.x > c.x1 - r && p.x < c.x2 + r && p.z > c.z1 - r && p.z < c.z2 + r) p.z = Math.max(p.z, c.z2 + r);
    }
  }
  function clampCam(v) { v.x = Math.max(-W / 2 + 0.3, Math.min(W / 2 - 0.3, v.x)); v.z = Math.max(-D / 2 + 0.3, Math.min(D / 2 - 0.3, v.z)); v.y = Math.max(0.5, Math.min(H - 0.3, v.y)); }
  function update(dt, skyColor) { if (fan) fan.rotation.y += dt * 9; if (windowMat && skyColor) windowMat.color.copy(skyColor); }
  return { scene, enter, collide, clampCam, update, get interactables() { return interactables; }, get theme() { return theme; }, get menu() { return menu; } };
}

function menuTex(name, menu, [bg, fg]) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 420; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 1024, 420);
  x.strokeStyle = fg; x.globalAlpha = 0.5; x.lineWidth = 6; x.strokeRect(12, 12, 1000, 396); x.globalAlpha = 1;
  x.fillStyle = fg; x.textAlign = 'center';
  x.font = '700 56px "Space Grotesk"'; x.fillText(name.toUpperCase().slice(0, 28), 512, 80);
  x.font = '600 30px "Noto Sans Kannada"'; x.fillText(menu.kn + ' · MENU', 512, 125);
  x.textAlign = 'left'; x.font = '500 32px "Space Grotesk"';
  menu.items.forEach(([n, p], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    x.fillText(n, 70 + col * 480, 195 + row * 70);
    x.textAlign = 'right'; x.fillText('₹' + p, 470 + col * 480, 195 + row * 70); x.textAlign = 'left';
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function neonTex(name) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  x.shadowColor = '#ff4fd8'; x.shadowBlur = 24; x.fillStyle = '#ffd1f5'; x.font = '700 58px "Space Grotesk"'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(name.slice(0, 16), 256, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function cricketTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 150; const x = c.getContext('2d');
  x.fillStyle = '#3f8f3a'; x.fillRect(0, 0, 256, 150); x.fillStyle = '#c8a870'; x.fillRect(118, 30, 20, 90);
  x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, 122, 256, 28); x.fillStyle = '#fff'; x.font = '700 16px "Space Grotesk"'; x.fillText('BLR 187/3 (18.2)  ·  RRR 9.4', 10, 141);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
