// One hand-drawn line-icon set (24×24, 2px round strokes). Each icon is a list of SVG path strings,
// so the same data draws inline <svg> in the HUD and Path2D on canvases (minimap, 3D sprites).
const c = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
const CLOUD = 'M7 18a5 5 0 0 1-.9-9.9A6 6 0 0 1 17.6 9 4.5 4.5 0 0 1 17 18z';
const CLOUD_HI = 'M7 14a4.5 4.5 0 0 1-.8-8.9A5.5 5.5 0 0 1 16.8 6 4 4 0 0 1 16.5 14z';
const SHIELD = 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z';
const STAR = 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z';
const SPEAKER = 'M4 9h4l5-4v14l-5-4H4z';

export const ICONS = {
  // vehicles and transport
  auto: ['M4 17V10a5 5 0 0 1 5-5h6l4 6v6', 'M4 11h15', 'M13 5v6', 'M9 17h6', c(7, 17.5, 2), c(18, 17.5, 2)],
  scooter: [c(6, 17, 2.5), c(18, 17, 2.5), 'M8.5 17H14l2-8h-2', 'M16 9l2 5.5', 'M5 13h6l1.5 4', 'M14 5h3'],
  car: ['M3 16v-3l2.5-5h13l2.5 5v3h-2', 'M3 16h2', 'M10 16h4', 'M3 13h18', c(7.5, 16.5, 2), c(16.5, 16.5, 2)],
  metro: ['M7 3h10a3 3 0 0 1 3 3v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3z', 'M4 10h16', 'M8 13.5v.01', 'M16 13.5v.01', 'M8 17l-2 4', 'M16 17l2 4'],
  truck: ['M2 6h11v11H2z', 'M13 10h4l4 4v3h-8', c(6, 18, 2), c(17, 18, 2)],
  walk: [c(13, 4, 2), 'M10 21l2.5-7', 'M12.5 14l3 7', 'M8 12l3-5 3 3 3 1', 'M11 7l1.5 7'],
  road: ['M8 3L5 21', 'M16 3l3 18', 'M12 4v3', 'M12 10.5v3', 'M12 17v3'],
  signal: ['M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', c(12, 7, 1.5), c(12, 12, 1.5), c(12, 17, 1.5)],
  cone: ['M10 3h4l5 16H5z', 'M8 9h8', 'M6.5 14h11', 'M3 21h18'],
  pothole: ['M3 15c0-2.2 4-4 9-4s9 1.8 9 4-4 4-9 4-9-1.8-9-4z', 'M7 15c1.3-1 3-1.5 5-1.5s3.7.5 5 1.5', 'M12 4v3', 'M6.5 6l1.5 2.5', 'M17.5 6L16 8.5'],
  pin: ['M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z', c(12, 9, 2.5)],
  map: ['M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z', 'M9 3v15', 'M15 6v15'],
  // places
  landmark: ['M3 21h18', 'M5 18h14', 'M4 9h16', 'M12 3l8 6H4z', 'M7 9v9', 'M12 9v9', 'M17 9v9'],
  city: ['M3 21h18', 'M5 21V9h6v12', 'M11 21V3h8v18', 'M14 7h2', 'M14 11h2', 'M14 15h2', 'M7.5 13h1', 'M7.5 17h1'],
  building: ['M3 21h18', 'M5 21V4h11v17', 'M16 9h3v12', 'M8.5 8h1', 'M11.5 8h1', 'M8.5 12h1', 'M11.5 12h1', 'M8.5 16h1', 'M11.5 16h1'],
  tree: [c(12, 9, 6), 'M12 15v7', 'M9 21h6', 'M12 12l2-2'],
  cricket: ['M4 20l2-2', 'M6 18l9.5-9.5 2 2L8 20z', c(7, 7, 2.5)],
  coffee: ['M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z', 'M16 10h2a2 2 0 0 1 0 4h-2', 'M8 3v3', 'M12 3v3', 'M3 21h14'],
  beer: ['M6 8h9v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z', 'M15 11h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2', 'M6 8a3 3 0 0 1 3-5h3a3 3 0 0 1 3 5', 'M9 12v5', 'M12 12v5'],
  food: ['M6 3v7a2 2 0 0 0 4 0V3', 'M8 3v18', 'M17 21V3c-2 1.5-3 4-3 7v3h3'],
  bakery: ['M6 11a3.5 3.5 0 0 1 1-7h10a3.5 3.5 0 0 1 1 7v8a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z', 'M10 9l2 2', 'M14 9l2 2'],
  glass: ['M8 3h8l-1 7a3 3 0 0 1-6 0z', 'M12 13v8', 'M8 21h8'],
  laptop: ['M5 5h14v10H5z', 'M2 19h20l-2-4H4z'],
  music: ['M3 9.5v5', 'M3 12h11', 'M14 8v8l7 3V5z', 'M7 12v3', 'M10 12v3'],
  cow: ['M7 8C4 8 3 6 3 4', 'M17 8c3 0 4-2 4-4', 'M7 7h10v6.5a5 5 0 0 1-10 0z', 'M8.5 15h7a2 2 0 0 1 0 4h-7a2 2 0 0 1 0-4z', 'M10 11v.01', 'M14 11v.01'],
  paw: [c(6.5, 10, 1.5), c(10, 6, 1.5), c(14, 6, 1.5), c(17.5, 10, 1.5), 'M12 11c-3 0-5 4-5 6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2c0-2-2-6-5-6z'],
  // weather
  sun: [c(12, 12, 4), 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  cloud: [CLOUD],
  rain: [CLOUD_HI, 'M8 17l-1 3', 'M12 17l-1 3', 'M16 17l-1 3'],
  storm: [CLOUD_HI, 'M12.5 15L10 19h4l-2.5 4'],
  wave: ['M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2', 'M2 13c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2', 'M2 18c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2'],
  drop: ['M12 3s7 7 7 12a7 7 0 0 1-14 0c0-5 7-12 7-12z'],
  // status and events
  cash: ['M2 6h20v12H2z', c(12, 12, 3), 'M6 9v.01', 'M18 15v.01'],
  respect: [c(12, 9, 5.5), 'M8.5 13.5L7 21l5-3 5 3-1.5-7.5'],
  bolt: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  battery: ['M3 8h15v8H3z', 'M21 11v2', 'M6 11v2'],
  star: [STAR],
  clock: [c(12, 12, 9), 'M12 7v5l3 2'],
  gauge: ['M4.9 18a9 9 0 1 1 14.2 0', 'M12 13l4-5', c(12, 13, 1.5)],
  timer: [c(12, 13, 8), 'M12 9v4l2 2', 'M10 2h4'],
  hourglass: ['M6 2h12', 'M6 22h12', 'M7 2v4l5 6-5 6v4', 'M17 2v4l-5 6 5 6v4'],
  check: [c(12, 12, 9), 'M8 12l3 3 5-6'],
  warning: ['M12 3l10 18H2z', 'M12 10v5', 'M12 18v.01'],
  info: [c(12, 12, 9), 'M12 11v5', 'M12 8v.01'],
  crash: ['M12 2l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3z'],
  wrench: ['M15 4a5 5 0 0 0-5.6 6.6L3 17l4 4 6.4-6.4A5 5 0 0 0 20 9l-3 3-3-1-1-3z'],
  receipt: ['M6 2h12v20l-3-2-3 2-3-2-3 2z', 'M9 7h6', 'M9 11h6', 'M9 15h4'],
  phone: ['M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z', 'M11 18h2'],
  chat: ['M4 5h16v11H9l-5 4z'],
  smile: [c(12, 12, 9), 'M8 14a5 5 0 0 0 8 0', 'M9 9.5v.01', 'M15 9.5v.01'],
  siren: ['M6 18v-6a6 6 0 0 1 12 0v6', 'M4 18h16v3H4z', 'M12 2v2', 'M4.2 6.2l1.4 1.4', 'M19.8 6.2l-1.4 1.4'],
  police: [SHIELD, 'M12 8l1.2 2.5 2.8.4-2 2 .5 2.7-2.5-1.3-2.5 1.3.5-2.7-2-2 2.8-.4z'],
  medic: ['M3 7h18v13H3z', 'M9 7V4h6v3', 'M12 10.5v6', 'M9 13.5h6'],
  bandage: ['M4.5 13.5l9-9a3.5 3.5 0 0 1 5 5l-9 9a3.5 3.5 0 0 1-5-5z', 'M10.5 10.5v.01', 'M13.5 13.5v.01', 'M10.5 13.5v.01', 'M13.5 10.5v.01'],
  bulb: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z'],
  horn: ['M3 10v4h3l9 5V5l-9 5z', 'M18 9a3.5 3.5 0 0 1 0 6', 'M6 14l1 6h3l-1-5'],
  radio: ['M3 9h18v11H3z', 'M7 9l10-5', c(8, 14.5, 2.5), 'M14 13h4', 'M14 16.5h4'],
  live: [c(12, 12, 1.5), 'M8.5 8.5a5 5 0 0 0 0 7', 'M15.5 8.5a5 5 0 0 1 0 7', 'M5.6 5.6a9 9 0 0 0 0 12.8', 'M18.4 5.6a9 9 0 0 1 0 12.8'],
  sound: [SPEAKER, 'M16 9a4 4 0 0 1 0 6', 'M19 6a8 8 0 0 1 0 12'],
  mute: [SPEAKER, 'M17 9l5 6', 'M22 9l-5 6'],
  camera: ['M3 8h4l2-3h6l2 3h4v11H3z', c(12, 13, 3.5)],
  video: ['M3 7h12v10H3z', 'M15 10l6-3v10l-6-3'],
  gear: [c(12, 12, 3), c(12, 12, 7), 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M4.9 4.9L7 7', 'M17 17l2.1 2.1', 'M4.9 19.1L7 17', 'M17 7l2.1-2.1'],
  // navigation arrows
  'turn-left': ['M15 21v-9a4 4 0 0 0-4-4H5', 'M9 4L5 8l4 4'],
  'turn-right': ['M9 21v-9a4 4 0 0 1 4-4h6', 'M15 4l4 4-4 4'],
  'sharp-left': ['M17 21V8L7 16', 'M7 10v6h6'],
  'sharp-right': ['M7 21V8l10 8', 'M17 10v6h-6'],
  straight: ['M12 21V4', 'M6 10l6-6 6 6'],
  flag: ['M5 21V4', 'M5 4h12l-2 4 2 4H5'],
  reroute: ['M20 12a8 8 0 1 1-2.3-5.7', 'M20 3v4h-4'],
  // interface
  up: ['M5 15l7-7 7 7'], down: ['M5 9l7 7 7-7'], left: ['M15 5l-7 7 7 7'], right: ['M9 5l7 7-7 7'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  search: [c(11, 11, 7), 'M16 16l5 5'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  pause: ['M8 5v14', 'M16 5v14'],
  play: ['M7 4l13 8-13 8z'],
  save: ['M4 4h12l4 4v12H4z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
  exit: ['M10 4H5v16h5', 'M14 8l4 4-4 4', 'M18 12H9'],
  sliders: ['M4 6h9', 'M17 6h3', c(15, 6, 2), 'M4 12h3', 'M11 12h9', c(9, 12, 2), 'M4 18h11', 'M19 18h1', c(17, 18, 2)],
  keyboard: ['M2 6h20v12H2z', 'M6 10v.01', 'M10 10v.01', 'M14 10v.01', 'M18 10v.01', 'M7 14h10'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', c(12, 12, 3)],
  reset: ['M4 12a8 8 0 1 0 2.3-5.7', 'M4 3v4h4'],
};

// inline <svg> that takes the text colour; `fill` fills the shape (e.g. a gold star)
export function icon(name, cls = '') {
  const p = ICONS[name] || ICONS.info;
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${p.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
}

// stroke an icon onto a 2D canvas, centred at (x, y), `size` px across
export function drawIcon(ctx, name, x, y, size, color, width = 2) {
  ctx.save(); ctx.translate(x - size / 2, y - size / 2); ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = ctx.lineJoin = 'round';
  for (const d of ICONS[name] || ICONS.info) ctx.stroke(new Path2D(d));
  ctx.restore();
}
