import * as THREE from 'three';
import { makeRng } from './util.js';
import { drawIcon } from './icons.js';

const rng = makeRng(42);

function cnv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(ctx, w, h, n, colors, size = 2) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    const s = rng() * size + 0.5;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
}

export function asphalt() {
  const [c, x] = cnv(512, 512);
  x.fillStyle = '#5d5b59'; x.fillRect(0, 0, 512, 512);
  speckle(x, 512, 512, 14000, ['#4c4a48', '#686562', '#555350', '#73706c'], 2);
  // repair patches & oil stains
  for (let i = 0; i < 7; i++) {
    x.fillStyle = `rgba(30,30,32,${0.25 + rng() * 0.3})`;
    x.fillRect(rng() * 460, rng() * 460, 30 + rng() * 90, 20 + rng() * 60);
  }
  for (let i = 0; i < 10; i++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, 'rgba(15,15,18,0.35)'); g.addColorStop(1, 'rgba(15,15,18,0)');
    x.save(); x.translate(rng() * 512, rng() * 512); x.fillStyle = g; x.fillRect(-30, -30, 60, 60); x.restore();
  }
  // cracks
  x.strokeStyle = 'rgba(25,25,25,0.5)'; x.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    x.beginPath(); let px = rng() * 512, py = rng() * 512; x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (rng() - 0.5) * 40; py += (rng() - 0.5) * 40; x.lineTo(px, py); }
    x.stroke();
  }
  return tex(c);
}

export function pavers() {
  const [c, x] = cnv(512, 512);
  x.fillStyle = '#8d8780'; x.fillRect(0, 0, 512, 512);
  const cols = ['#a39b92', '#9a8f86', '#b0a79c', '#a0776a', '#93877c'];
  const s = 32;
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const off = (j % 2) * s / 2;
    x.fillStyle = cols[Math.floor(rng() * cols.length)];
    x.fillRect(i * s + off + 1, j * s + 1, s - 2, s - 2);
    x.fillRect(i * s + off + 1 - 512, j * s + 1, s - 2, s - 2);
  }
  speckle(x, 512, 512, 6000, ['rgba(60,55,50,0.35)', 'rgba(200,190,180,0.2)'], 2);
  for (let i = 0; i < 12; i++) {
    x.fillStyle = `rgba(60,50,40,${0.08 + rng() * 0.12})`;
    x.beginPath(); x.arc(rng() * 512, rng() * 512, 10 + rng() * 40, 0, 7); x.fill();
  }
  return tex(c);
}

export function grass() {
  const [c, x] = cnv(512, 512);
  x.fillStyle = '#4d7a30'; x.fillRect(0, 0, 512, 512);
  speckle(x, 512, 512, 30000, ['#3f6a26', '#5a8a38', '#466f2b', '#6a9440', '#3a5f22'], 3);
  for (let i = 0; i < 20; i++) {
    x.fillStyle = `rgba(120,100,50,${0.08 + rng() * 0.1})`;
    x.beginPath(); x.arc(rng() * 512, rng() * 512, 15 + rng() * 40, 0, 7); x.fill();
  }
  return tex(c);
}

export function cobble() {
  const [c, x] = cnv(512, 512);
  x.fillStyle = '#5f5852'; x.fillRect(0, 0, 512, 512);
  const cols = ['#857a70', '#7a6f66', '#8f8479', '#6f655d', '#968a7c'];
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
    const off = (j % 2) * 8;
    x.fillStyle = cols[Math.floor(rng() * cols.length)];
    x.beginPath(); x.roundRect(i * 16 + off + 1 - (off && i === 31 ? 512 : 0), j * 16 + 1, 14, 14, 3); x.fill();
  }
  speckle(x, 512, 512, 5000, ['rgba(40,35,30,0.4)'], 2);
  return tex(c);
}

export function dirt() {
  const [c, x] = cnv(512, 512);
  x.fillStyle = '#9a8a72'; x.fillRect(0, 0, 512, 512);
  speckle(x, 512, 512, 22000, ['#8d7e67', '#a69680', '#94846c', '#ac9d86', '#7f7460'], 3);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(${70 + rng() * 20},${100 + rng() * 30},${40 + rng() * 15},${0.25 + rng() * 0.3})`;
    x.beginPath(); x.arc(rng() * 512, rng() * 512, 8 + rng() * 40, 0, 7); x.fill();
  }
  return tex(c);
}

export function gravel() {
  const [c, x] = cnv(256, 256);
  x.fillStyle = '#b39a78'; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, 9000, ['#a38a68', '#c2aa88', '#9a8262', '#cdb798'], 2);
  return tex(c);
}

export function water() {
  const [c, x] = cnv(256, 256);
  x.fillStyle = '#3d6a72'; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, 3000, ['rgba(255,255,255,0.08)', 'rgba(0,30,40,0.2)'], 4);
  return tex(c);
}

// office/commercial facade: horizontal ribbon windows
export function facadeB() {
  const [c, x] = cnv(512, 512);
  const [e, ex] = cnv(512, 512);
  x.fillStyle = '#ecebe8'; x.fillRect(0, 0, 512, 512);
  speckle(x, 512, 512, 6000, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.25)'], 3);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, 512, 512);
  for (let j = 0; j < 16; j++) {
    const py = j * 32;
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, py + 29, 512, 3);
    const g = x.createLinearGradient(0, py + 6, 0, py + 26);
    g.addColorStop(0, '#5f7c92'); g.addColorStop(1, '#34495a');
    x.fillStyle = g; x.fillRect(0, py + 6, 512, 20);
    x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, py + 6, 512, 4);
    x.fillStyle = '#d7d5cf'; for (let i = 0; i < 16; i++) x.fillRect(i * 32, py + 6, 2, 20);
    for (let i = 0; i < 16; i++) {
      const r = rng();
      if (r < 0.42) { ex.fillStyle = rng() < 0.7 ? '#e6f1ff' : '#ffe0a6'; ex.fillRect(i * 32 + 2, py + 7, 30, 18); }
    }
  }
  return { map: tex(c), emissive: tex(e) };
}

const POI_STYLE = {
  cafe: ['#3e2723', '#ffcc80', 'ಕಾಫಿ · COFFEE'], restaurant: ['#b71c1c', '#fff59d', 'ಹೋಟೆಲ್ · ಊಟ'], fast_food: ['#e65100', '#ffffff', 'ಫಾಸ್ಟ್ ಫುಡ್'],
  pub: ['#1b1b1b', '#ffb300', 'ಪಬ್ · ಬಿಯರ್'], bar: ['#311b92', '#e1bee7', 'ಬಾರ್'], ice_cream: ['#ad1457', '#ffffff', 'ಐಸ್ ಕ್ರೀಂ'],
};
export function poiSignAtlas(pois) {
  const [c, x] = cnv(2048, 2048);
  pois.forEach((p, i) => {
    const cx = (i % 4) * 512, cy = Math.floor(i / 4) * 128;
    const [bg, fg, kn] = POI_STYLE[p.a] || POI_STYLE.restaurant;
    x.fillStyle = bg; x.fillRect(cx, cy, 512, 128);
    x.strokeStyle = fg; x.globalAlpha = 0.45; x.lineWidth = 4; x.strokeRect(cx + 6, cy + 6, 500, 116); x.globalAlpha = 1;
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    const name = p.n.toUpperCase();
    let fs = 50; x.font = `700 ${fs}px "Space Grotesk", sans-serif`;
    while (x.measureText(name).width > 470 && fs > 18) { fs -= 2; x.font = `700 ${fs}px "Space Grotesk", sans-serif`; }
    x.fillText(name, cx + 256, cy + 50);
    x.font = '600 26px "Noto Sans Kannada", sans-serif'; x.fillText(kn, cx + 256, cy + 98);
  });
  return tex(c, { repeat: false });
}

export function kerb() {
  const [c, x] = cnv(64, 8);
  x.fillStyle = '#f0c419'; x.fillRect(0, 0, 32, 8);
  x.fillStyle = '#1b1b1b'; x.fillRect(32, 0, 32, 8);
  return tex(c);
}

// 16x16 windows per tile -> tile = 48m x 56m (3m x 3.5m per cell)
export const FACADE_TILE_W = 48, FACADE_TILE_H = 56;
export function facade() {
  const [c, x] = cnv(512, 512);
  const [e, ex] = cnv(512, 512);
  x.fillStyle = '#efece6'; x.fillRect(0, 0, 512, 512);
  speckle(x, 512, 512, 9000, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.2)'], 3);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, 512, 512);
  const s = 32;
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const px = i * s, py = j * s;
    // floor slab line
    x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(px, py + s - 3, s, 3);
    if (rng() < 0.12) continue; // blank wall
    const wide = rng() < 0.3;
    const wx = px + (wide ? 4 : 8), ww = wide ? 24 : 16, wy = py + 7, wh = 17;
    // grime streak
    const g = x.createLinearGradient(0, wy + wh, 0, wy + wh + 10);
    g.addColorStop(0, 'rgba(70,60,50,0.22)'); g.addColorStop(1, 'rgba(70,60,50,0)');
    x.fillStyle = g; x.fillRect(wx, wy + wh, ww, 10);
    x.fillStyle = '#6b6760'; x.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
    x.fillStyle = rng() < 0.5 ? '#2a3340' : '#33404a'; x.fillRect(wx, wy, ww, wh);
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(wx, wy, ww, 5);
    x.fillStyle = '#5a5650'; x.fillRect(wx + ww / 2 - 0.5, wy, 1, wh);
    if (rng() < 0.25) { // AC unit
      x.fillStyle = '#d9d9d6'; x.fillRect(wx + ww - 10, wy + wh + 1, 10, 5);
      x.fillStyle = '#9a9a96'; x.fillRect(wx + ww - 9, wy + wh + 2, 8, 1);
    }
    if (rng() < 0.12) { // balcony rail
      x.fillStyle = '#4d4a45'; x.fillRect(px + 2, py + 20, s - 4, 1.5);
      for (let k = 0; k < 7; k++) x.fillRect(px + 3 + k * 4, py + 20, 1, 6);
    }
    const r = rng();
    if (r < 0.38) { ex.fillStyle = rng() < 0.8 ? '#ffcf86' : '#d7ecff'; ex.fillRect(wx, wy, ww, wh); }
    else if (r < 0.45) { ex.fillStyle = '#6e5a3a'; ex.fillRect(wx, wy, ww, wh); }
  }
  return { map: tex(c), emissive: tex(e) };
}

export function curtain() {
  const [c, x] = cnv(256, 256);
  const [e, ex] = cnv(256, 256);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const g = x.createLinearGradient(0, j * 32, 0, j * 32 + 32);
    g.addColorStop(0, '#7f9bb3'); g.addColorStop(1, '#4e6a82');
    x.fillStyle = g; x.fillRect(i * 32, j * 32, 32, 32);
  }
  x.fillStyle = '#c9d0d6';
  for (let i = 0; i <= 8; i++) { x.fillRect(i * 32 - 1, 0, 2, 256); x.fillRect(0, i * 32 - 1, 256, 3); }
  for (let j = 0; j < 8; j++) {
    const lit = rng() < 0.55;
    for (let i = 0; i < 8; i++) if (lit && rng() < 0.8) {
      ex.fillStyle = rng() < 0.7 ? '#e9f3ff' : '#ffe2a8'; ex.fillRect(i * 32 + 2, j * 32 + 3, 28, 26);
    }
  }
  return { map: tex(c), emissive: tex(e) };
}

export const SIGNS = [
  ['SRI SAI DARSHINI', 'ಶ್ರೀ ಸಾಯಿ ದರ್ಶಿನಿ', '#c62828', '#fff59d'],
  ['NAMMA FILTER KAAPI', 'ನಮ್ಮ ಫಿಲ್ಟರ್ ಕಾಫಿ', '#3e2723', '#ffcc80'],
  ['FOURTH WAVE COFFEE', 'specialty · since last week', '#111111', '#f5f5f5'],
  ["IYENGAR'S BAKERY", 'ಅಯ್ಯಂಗಾರ್ ಬೇಕರಿ', '#f9a825', '#4e2600'],
  ['MOBILE WORLD', 'ಮೊಬೈಲ್ ಸರ್ವಿಸ್', '#1565c0', '#ffffff'],
  ['BRIGADE SHOE MART', 'ಶೂ ಮಾರ್ಟ್', '#2e7d32', '#ffffff'],
  ['MALLESHWARAM TIFFINS', 'ಮಲ್ಲೇಶ್ವರಂ ತಿಂಡಿ', '#ff7043', '#ffffff'],
  ['SWALPA ADJUST TEA', 'ಟೀ · ಬನ್ · ಸಿಗರೇಟ್ ಇಲ್ಲ', '#ffd600', '#1a1a1a'],
  ['PEAK BENGALURU BREW CO.', 'craft beer · kannada rap', '#263238', '#ffab40'],
  ['SILK BOARD SAREES', 'ರೇಷ್ಮೆ ಸೀರೆ', '#6a1b9a', '#ffd54f'],
  ['DOSA CORNER', 'ದೋಸೆ ಕಾರ್ನರ್', '#00695c', '#ffffff'],
  ['BENGALURU BOOK HOUSE', 'ಪುಸ್ತಕ ಮನೆ', '#5d4037', '#fff3e0'],
  ['CTRL+ALT+CHAI', 'cowork café · wifi 1Gbps*', '#0d47a1', '#80deea'],
  ['MEDICALS 24x7', 'ಮೆಡಿಕಲ್ಸ್', '#00897b', '#ffffff'],
  ['RAJ OPTICALS', 'ಕನ್ನಡಕ ಅಂಗಡಿ', '#ad1457', '#ffffff'],
  ['MG ROAD', 'ಎಂ.ಜಿ. ರಸ್ತೆ  ·  METRO', '#6a1b9a', '#ffffff'],
];
export const METRO_SIGN = 15;

export function signAtlas() {
  const [c, x] = cnv(1024, 1024);
  SIGNS.forEach(([en, kn, bg, fg], i) => {
    const cx = (i % 2) * 512, cy = Math.floor(i / 2) * 128;
    x.fillStyle = bg; x.fillRect(cx, cy, 512, 128);
    x.strokeStyle = fg; x.globalAlpha = 0.5; x.lineWidth = 4; x.strokeRect(cx + 6, cy + 6, 500, 116); x.globalAlpha = 1;
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    let fs = 50; x.font = `700 ${fs}px "Space Grotesk", sans-serif`;
    while (x.measureText(en).width > 470 && fs > 20) { fs -= 2; x.font = `700 ${fs}px "Space Grotesk", sans-serif`; }
    x.fillText(en, cx + 256, cy + 48);
    x.font = `600 28px "Noto Sans Kannada", "Space Grotesk", sans-serif`;
    x.fillText(kn, cx + 256, cy + 96);
  });
  return tex(c, { repeat: false });
}

export const BILLBOARDS = [
  ['FLATS FROM ₹1.9 CR*', '*only 2 hrs from anywhere', '#fafafa', '#c62828'],
  ['WORK FROM CAFÉ', 'WiFi faster than Outer Ring Road', '#1a237e', '#ffffff'],
  ['SWALPA ADJUST MAADI', "Bengaluru's favourite phrase since forever", '#ffd600', '#111111'],
  ['MONSOON SALE', 'Umbrellas ₹199 · you will need it at 4 PM', '#004d40', '#ffffff'],
];
export function billboardAtlas() {
  const [c, x] = cnv(1024, 512);
  BILLBOARDS.forEach(([t, s, bg, fg], i) => {
    const cx = (i % 2) * 512, cy = Math.floor(i / 2) * 256;
    x.fillStyle = bg; x.fillRect(cx, cy, 512, 256);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 54px "Space Grotesk", sans-serif';
    x.fillText(t, cx + 256, cy + 105);
    x.font = '500 24px "Space Grotesk", sans-serif';
    x.fillText(s, cx + 256, cy + 175);
    x.fillRect(cx + 156, cy + 140, 200, 3);
  });
  return tex(c, { repeat: false });
}

export function glow() {
  const [c, x] = cnv(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return tex(c, { repeat: false, srgb: false });
}

export function textTexture(lines, { w = 512, h = 128, bg = '#000', fg = '#fff', font = '700 60px "Space Grotesk"' } = {}) {
  const [c, x] = cnv(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = font;
  lines.forEach((l, i) => x.fillText(l, w / 2, h / (lines.length + 1) * (i + 1)));
  return tex(c, { repeat: false });
}

// a line icon on a dark disc with a gold ring, for floating 3D markers (collectibles)
export function iconTexture(name, { fg = '#ffd23f', bg = '#15171c' } = {}) {
  const [c, x] = cnv(128, 128);
  x.fillStyle = bg; x.beginPath(); x.arc(64, 64, 56, 0, 7); x.fill();
  x.strokeStyle = fg; x.lineWidth = 6; x.stroke();
  drawIcon(x, name, 64, 64, 68, fg, 2.2);
  return tex(c, { repeat: false });
}
