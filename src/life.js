import * as THREE from 'three';
import { box, merge, part, makeRng } from './util.js';
import { createCharacter } from './people.js';
import { glow } from './textures.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DJ = {
  'Namma 93.FM': [
    'RJ Anna: "Good evening Bengaluru! Silk Board is red, Outer Ring Road is redder."',
    'RJ Anna: "Next song is for all the auto anna-s. Meter haaki, mood haaki!"',
    'RJ Anna: "Traffic update: Hebbal flyover is a parking lot. As usual."',
    'RJ Anna: "Ee sala cup namde! Okay, okay, I say it every year."',
    'RJ Anna: "Weather update: if you see clouds, it is already raining in Koramangala."',
  ],
  'Lo-fi Koramangala 101': [
    'Lo-fi DJ: "Beats to code, commute and cry over rent to."',
    'Lo-fi DJ: "Shout-out to everyone in a standup that could have been an email."',
    'Lo-fi DJ: "Filter coffee in one hand, laptop in the other. You got this."',
  ],
};

// Things that make the city feel alive: the calendar (Sunday Cubbon, RCB nights, Deepavali), dogs, bus stops,
// birds and bells, fireworks, and the FM radio.
export function createLife(scene, world, ui, audio) {
  const rng = makeRng(2026);
  const today = new Date();
  const ev = { day: today.getDay() };
  // Deepavali week (real calendar: 2026-11-08). Also on for the week before/after.
  const deepavali = Math.abs(today - new Date(2026, 10, 8)) < 9 * 864e5;

  // ---------- street dogs: sleeping on the footpath, a few wandering ----------
  const dogG = merge([
    part(new THREE.CapsuleGeometry(0.17, 0.55, 2, 6).rotateX(Math.PI / 2).translate(0, 0.35, 0), '#fff'),
    part(new THREE.SphereGeometry(0.14, 8, 6).translate(0, 0.48, 0.42), '#fff'), box(0.09, 0.08, 0.14, 0, 0.44, 0.58, '#3a2a1a'),
    box(0.05, 0.12, 0.05, -0.08, 0.6, 0.38, '#fff'), box(0.05, 0.12, 0.05, 0.08, 0.6, 0.38, '#fff'),
    ...[[-0.1, 0.25], [0.1, 0.25], [-0.1, -0.25], [0.1, -0.25]].map(([x, z]) => part(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 5).translate(x, 0.15, z), '#fff')),
    part(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 4).rotateX(-0.8).translate(0, 0.48, -0.4), '#fff'),
  ]);
  const DOGC = ['#c8a165', '#8d6e4a', '#3b2f2a', '#e8dcc6', '#a0522d'];
  const edges = world.graph.edges.filter((e) => e.len > 30 && Math.abs(e.ax) < 1200 && Math.abs(e.az) < 800);
  const dogs = [];
  for (let i = 0; i < 26 && edges.length; i++) {
    const e = edges[Math.floor(rng() * edges.length)], s = rng() * e.len, lat = e.w / 2 + 1.8;
    const x = e.ax + e.dx * s + e.dz * lat, z = e.az + e.dz * s - e.dx * lat;
    if (world.insideBuilding(x, z, 0.5)) continue;
    const m = new THREE.Mesh(dogG, new THREE.MeshStandardMaterial({ color: rng.pick(DOGC), roughness: 0.9, vertexColors: true }));
    const sleeping = rng() < 0.65;
    m.position.set(x, 0, z); m.rotation.y = rng() * 6.28; if (sleeping) { m.rotation.z = Math.PI / 2 * 0.95; m.position.y = 0.17; }
    m.castShadow = true; scene.add(m);
    dogs.push({ m, x, z, sleeping, e, s, lat, dir: rng() < 0.5 ? 1 : -1, barkCd: 0 });
  }

  // ---------- BMTC bus stops with people waiting ----------
  const stops = [];
  const major = world.roads.filter((r) => r.drive && ['primary', 'secondary'].includes(r.k));
  const shelterParts = [];
  for (let i = 0; i < 300 && stops.length < 16; i++) {
    const r = major[Math.floor(rng() * major.length)], j = Math.floor(rng() * (r.pts.length - 1));
    const [ax, az] = r.pts[j], [bx, bz] = r.pts[j + 1], len = Math.hypot(bx - ax, bz - az); if (len < 20) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len, x = ax + dx * len / 2 + dz * (r.hw + 2.2), z = az + dz * len / 2 - dx * (r.hw + 2.2);
    if (Math.abs(x) > 1250 || Math.abs(z) > 850 || world.insideBuilding(x, z, 1.5) || stops.some((s) => Math.hypot(s.x - x, s.z - z) < 250)) continue;
    const yaw = Math.atan2(-dz, dx);
    const mm = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    const g = merge([box(4.2, 0.12, 1.8, 0, 2.6, 0, '#1d4fa3'), box(0.1, 2.6, 0.1, -2, 1.3, -0.8, '#888'), box(0.1, 2.6, 0.1, 2, 1.3, -0.8, '#888'),
      box(4, 1.8, 0.06, 0, 1.4, -0.85, '#9fb8cc'), box(3.4, 0.08, 0.45, 0, 0.5, -0.55, '#777'), box(1.6, 0.4, 0.08, 1.2, 2.3, 0.9, '#ffb300')]);
    g.applyMatrix4(mm); shelterParts.push(g);
    // people waiting for the bus (static, merged into the shelter mesh, facing the road)
    for (let k = 0; k < 5; k++) {
      if (rng() < 0.3) continue;
      const px = -1.6 + k * 0.8, pz = 0.2 + rng() * 0.5, shirt = rng.pick(['#e53935', '#1e88e5', '#fafafa', '#43a047', '#8e24aa', '#ffb74d']), skin = rng.pick(['#8d5a3b', '#a8714a', '#6e4429']);
      const pg = merge([box(0.38, 0.85, 0.24, px - 0, 0.43, pz, '#263238'), box(0.44, 0.62, 0.26, px, 1.2, pz, shirt), box(0.1, 0.55, 0.12, px - 0.28, 1.17, pz, shirt), box(0.1, 0.55, 0.12, px + 0.28, 1.17, pz, shirt),
        part(new THREE.SphereGeometry(0.125, 8, 6).translate(px, 1.66, pz), skin), part(new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5).translate(px, 1.69, pz - 0.01), '#151515')]);
      pg.applyMatrix4(mm); shelterParts.push(pg);
    }
    stops.push({ x, z }); void yaw;
  }
  if (shelterParts.length) { const sm = new THREE.Mesh(merge(shelterParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })); sm.castShadow = true; scene.add(sm); }

  // ---------- RCB match night crowd in the stands ----------
  let crowd = null;
  if (world.stadium) {
    const S = world.stadium, k = S.r / 52, N = 1400;
    crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.7, 0.45), new THREE.MeshBasicMaterial(), N);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = rng() * Math.PI * 2, rr = 36 + rng() * 11, y = (rr - 35) / 12 * 12.4 * 0.85;
      m4.makeTranslation(S.x + Math.cos(a) * rr * k, y * k + 0.5, S.z + Math.sin(a) * rr * k); crowd.setMatrixAt(i, m4);
      crowd.setColorAt(i, c.set(rng() < 0.55 ? '#d32f2f' : rng() < 0.6 ? '#f2c230' : '#1a1a1a'));
    }
    crowd.visible = false; scene.add(crowd);
  }

  // ---------- Deepavali: diyas on buildings, fireworks over the city ----------
  let diyas = null;
  if (deepavali) {
    const pts = [];
    for (const b of world.buildings) {
      if (b.style !== 'res' || b.h > 25 || rng() > 0.18 || Math.abs(b.cx) > 1300) continue;
      const p = b.pts;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], q = p[(i + 1) % p.length], len = Math.hypot(q[0] - a[0], q[1] - a[1]);
        for (let t = 0.5; t < len; t += 0.9) pts.push([a[0] + (q[0] - a[0]) * t / len, b.h + 0.15, a[1] + (q[1] - a[1]) * t / len]);
      }
      if (pts.length > 9000) break;
    }
    diyas = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.4) }), pts.length);
    const m4 = new THREE.Matrix4(); pts.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); diyas.setMatrixAt(i, m4); });
    diyas.visible = false; scene.add(diyas);
  }
  const FW = 260;
  const fwMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: glow(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), FW);
  fwMesh.frustumCulled = false; fwMesh.count = 0; scene.add(fwMesh);
  const sparks = [];
  let fwT = 3;
  function burst(cx, cy, cz) {
    const col = new THREE.Color().setHSL(Math.random(), 1, 0.6).multiplyScalar(4);
    for (let i = 0; i < 40; i++) {
      const th = Math.random() * 6.28, ph = Math.acos(2 * Math.random() - 1), sp = 14 + Math.random() * 6;
      sparks.push({ x: cx, y: cy, z: cz, vx: Math.sin(ph) * Math.cos(th) * sp, vy: Math.cos(ph) * sp, vz: Math.sin(ph) * Math.sin(th) * sp, life: 1.6 + Math.random() * 0.6, col });
    }
    if (sparks.length > FW) sparks.splice(0, sparks.length - FW);
  }

  // ---------- radio ----------
  let djT = 20;
  function radioNext() { const name = audio.setStation((['Off', 'Namma 93.FM', 'Lo-fi Koramangala 101'].indexOf(audio.station) + 1)); ui.toast('📻 Radio', name === 'Off' ? 'Radio off.' : `Tuned to <b>${name}</b>.`); djT = 6; }

  let birdT = 4, bellT = 10, hawkT = 15, lastMatch = null, lastSunday = null, dogToast = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  const HAWK = ['Hawker: "Kadlekai! Kadlekai! Bisi bisi kadlekai!"', 'Hawker: "Soppu! Fresh soppu, amma!"', 'Hawker: "Hoovu! Mallige hoovu!"', 'Hawker: "Old newspaper, old bottle!"'];
  function update(dt, s) {
    // s: { hours, day, focus, mode, zone, lights, camera, driving, speed }
    const hr = s.hours, day = s.day;
    // ---- RCB match nights: Wednesday and Saturday 7–11 PM
    const match = (day === 3 || day === 6) && hr >= 19 && hr < 23;
    if (crowd) crowd.visible = match;
    if (match !== lastMatch) { lastMatch = match; if (match) ui.toast('🏏 RCB match night!', 'Chinnaswamy is packed. Expect traffic and very loud horns. Ee sala cup namde!'); }
    if (match && world.stadium) {
      const d = Math.hypot(s.focus.x - world.stadium.x, s.focus.z - world.stadium.z);
      audio.setCrowd(Math.max(0, 1 - d / 400) * 1.5);
      if (Math.random() < dt * 0.15 && d < 400) audio.cheer();
    } else audio.setCrowd(s.zone && /Road|Street/.test(s.zone) ? 0.35 : 0.1);
    // ---- Sunday morning: Cubbon Park is car-free
    const sunday = day === 0 && hr >= 6 && hr < 10;
    if (sunday !== lastSunday) { lastSunday = sunday; if (sunday) ui.toast('🌳 Sunday in Cubbon Park', 'Car-free till 10 AM. Joggers, dogs, and cycling groups everywhere.'); }
    // ---- birds in the park in the morning, bells near churches
    birdT -= dt; bellT -= dt; hawkT -= dt;
    if (birdT <= 0) { birdT = 5 + Math.random() * 8; if (hr > 5.5 && hr < 18.5 && s.zone === 'Cubbon Park') audio.koel(Math.random() * 2 - 1); }
    if (bellT <= 0) {
      bellT = 25 + Math.random() * 20;
      if (world.buildings.some((b) => b.style === 'church' && Math.hypot(b.cx - s.focus.x, b.cz - s.focus.z) < 120)) audio.bell();
    }
    if (hawkT <= 0) { hawkT = 30 + Math.random() * 40; if (s.mode === 'walk' && hr > 7 && hr < 21) ui.dialogue(HAWK[Math.floor(Math.random() * HAWK.length)]); }
    // ---- dogs: wanderers stroll, everyone barks at fast vehicles
    dogToast -= dt;
    for (const d of dogs) {
      const dd = Math.hypot(d.m.position.x - s.focus.x, d.m.position.z - s.focus.z);
      if (!d.sleeping && dd < 200) {
        d.s += d.dir * 0.6 * dt; if (d.s < 0 || d.s > d.e.len) d.dir *= -1;
        d.m.position.set(d.e.ax + d.e.dx * d.s + d.e.dz * d.lat, 0, d.e.az + d.e.dz * d.s - d.e.dx * d.lat); d.m.rotation.y = Math.atan2(d.e.dx * d.dir, d.e.dz * d.dir);
      }
      d.barkCd -= dt;
      if (dd < 9 && s.speed > 6 && d.barkCd <= 0) { d.barkCd = 6; audio.bark(); if (dogToast <= 0) { dogToast = 60; ui.toast('🐕 Woof!', 'A street dog chased you for 20 metres. Standard procedure.'); } }
    }
    // ---- Deepavali nights
    const night = s.lights > 0.4;
    if (diyas) diyas.visible = night;
    if (deepavali && night) {
      fwT -= dt;
      if (fwT <= 0) { fwT = 1.2 + Math.random() * 3; const a = Math.random() * 6.28, r = 120 + Math.random() * 200; burst(s.focus.x + Math.cos(a) * r, 55 + Math.random() * 40, s.focus.z + Math.sin(a) * r); audio.firework(r / 340); }
    }
    let n = 0;
    q.copy(s.camera.quaternion);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.life -= dt; if (p.life <= 0) { sparks.splice(i, 1); continue; }
      p.vy -= 6 * dt; p.vx *= 0.985; p.vz *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = Math.min(1, p.life); m4.compose(pv.set(p.x, p.y, p.z), q, sc.set(k * 1.5, k * 1.5, 1)); fwMesh.setMatrixAt(n, m4); fwMesh.setColorAt(n, p.col); n++;
    }
    fwMesh.count = n; fwMesh.instanceMatrix.needsUpdate = true; if (fwMesh.instanceColor) fwMesh.instanceColor.needsUpdate = true;
    // ---- radio
    audio.radioTick(s.driving);
    if (s.driving && audio.station !== 'Off') { djT -= dt; if (djT <= 0) { djT = 35 + Math.random() * 25; const L = DJ[audio.station]; ui.dialogue('📻 ' + L[Math.floor(Math.random() * L.length)]); } }
  }
  return { update, radioNext, deepavali, dayName: (d) => DAYS[d], get startDay() { return ev.day; } };
}
