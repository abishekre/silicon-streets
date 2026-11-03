import * as THREE from 'three';
import { box, merge, part, damp } from './util.js';
import { metroCoach, trackLines, sampleLine, nearestS } from './vehicles.js';
import { createCharacter } from './people.js';

const KN = { 'MG Road': 'ಎಂ.ಜಿ. ರಸ್ತೆ', 'Cubbon Park': 'ಕಬ್ಬನ್ ಉದ್ಯಾನವನ', 'Vidhana Soudha': 'ವಿಧಾನ ಸೌಧ' };

function nameBoard(name) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#6a1b9a'; x.fillRect(0, 0, 1024, 256);
  x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '600 72px "Noto Sans Kannada"'; x.fillText(KN[name] || name, 512, 82);
  x.font = '700 78px "Space Grotesk"'; x.fillText(name.toUpperCase(), 512, 180);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function ledText(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 64); x.fillStyle = '#ff9f1c'; x.font = '700 40px "Space Grotesk", "Noto Sans Kannada"'; x.textBaseline = 'middle'; x.fillText(text, 12, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}

// The ride you actually take: platform → (viaduct above MG Road) → tunnel coach → arrival platform
export function createMetroRide(mainScene, world, ui, audio) {
  const { bodyG, winG } = metroCoach();
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 });
  const winMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const makeTrain = (parent) => {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) { const c = new THREE.Group(); c.add(new THREE.Mesh(bodyG, bodyMat), new THREE.Mesh(winG, winMat)); c.position.z = (k - 1) * 20.3; g.add(c); }
    parent.add(g); return g;
  };

  // ---------- platform scene ----------
  const plat = new THREE.Scene();
  plat.background = new THREE.Color('#14121a');
  plat.add(new THREE.HemisphereLight('#ffffff', '#55505a', 1.2));
  const pl = new THREE.PointLight('#ffffff', 12, 60, 1.2); pl.position.set(3, 5.4, 0); plat.add(pl);
  const P = [
    box(8, 1.1, 90, 4.6, 0.55, 0, '#b9b4ab'), box(0.4, 0.02, 90, 0.75, 1.11, 0, '#f2c230'),
    box(3, 0.2, 90, -1.6, 0.1, 0, '#3a3530'), box(0.1, 0.15, 90, -0.9, 0.28, 0, '#888'), box(0.1, 0.15, 90, -2.3, 0.28, 0, '#888'),
    box(0.4, 6, 90, -4, 3, 0, '#d6d0c6'), box(0.4, 6, 90, 8.8, 3, 0, '#d6d0c6'), box(13.2, 0.3, 90, 2.4, 6, 0, '#e8e4dc'),
  ];
  for (let z = -40; z <= 40; z += 10) P.push(box(0.6, 4.9, 0.6, 6.5, 3.55, z, '#7b2d8e'), box(1.4, 0.06, 0.3, 4.5, 5.8, z + 5, '#ffffff'));
  plat.add(new THREE.Mesh(merge(P), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })));
  const lamps = new THREE.Mesh(merge(Array.from({ length: 9 }, (_, i) => box(1.4, 0.05, 0.3, 4.5, 5.82, -40 + i * 10 + 5, '#fff'))), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) }));
  plat.add(lamps);
  const boardMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (const z of [-22, 0, 22]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), boardMat); b.position.set(8.55, 3.6, z); b.rotation.y = -Math.PI / 2; plat.add(b); }
  const platTrain = makeTrain(plat); platTrain.position.set(-1.6, 0.1, 0);
  const crowd = [];
  for (let i = 0; i < 10; i++) {
    const ch = createCharacter(plat, { shirt: ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fafafa', '#8e24aa'][i % 6], pants: '#263238', skin: ['#8d5a3b', '#a8714a', '#6e4429'][i % 3] });
    ch.root.position.set(2 + (i % 3) * 1.4, 1.1, -18 + i * 4); ch.root.rotation.y = -Math.PI / 2; crowd.push(ch);
  }

  // ---------- coach interior: used in the tunnel scene and inside the viaduct train ----------
  const ledMat = new THREE.MeshBasicMaterial({ map: ledText('') });
  const interiorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 });
  // windows are real glass now: you see the tunnel wall or the city through them
  const glass = new THREE.MeshBasicMaterial({ color: '#a9c4d8', transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
  function buildInterior(parent) {
    const grp = new THREE.Group();
    const C = [
      box(2.8, 0.05, 20, 0, 0, 0, '#8d8a93'), box(2.8, 0.05, 20, 0, 2.3, 0, '#eceaf0'),
      box(0.45, 0.45, 18, -1.15, 0.45, 0, '#7b2d8e'), box(0.45, 0.45, 18, 1.15, 0.45, 0, '#7b2d8e'),
      box(0.05, 0.7, 20, -1.4, 0.35, 0, '#d9d6de'), box(0.05, 0.7, 20, 1.4, 0.35, 0, '#d9d6de'),
      box(0.05, 0.5, 20, -1.4, 2.05, 0, '#d9d6de'), box(0.05, 0.5, 20, 1.4, 2.05, 0, '#d9d6de'),
      box(2.8, 2.3, 0.05, 0, 1.15, -10, '#d9d6de'), box(2.8, 2.3, 0.05, 0, 1.15, 10, '#d9d6de'),
    ];
    for (let z = -8; z <= 8; z += 4) C.push(box(0.05, 1.1, 0.12, -1.4, 1.25, z, '#d9d6de'), box(0.05, 1.1, 0.12, 1.4, 1.25, z, '#d9d6de'));
    for (let z = -8; z <= 8; z += 2.6) C.push(part(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6).translate(-0.6, 1.15, z), '#c0c0c0'), part(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6).translate(0.6, 1.15, z), '#c0c0c0'));
    C.push(part(new THREE.CylinderGeometry(0.02, 0.02, 20, 5).rotateX(Math.PI / 2).translate(-0.6, 2.0, 0), '#c0c0c0'), part(new THREE.CylinderGeometry(0.02, 0.02, 20, 5).rotateX(Math.PI / 2).translate(0.6, 2.0, 0), '#c0c0c0'));
    grp.add(new THREE.Mesh(merge(C), interiorMat));
    const cl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 18), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.4) })); cl.position.y = 2.27; grp.add(cl);
    for (const x of [-1.41, 1.41]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(20, 1.1), glass); g.position.set(x, 1.25, 0); g.rotation.y = Math.PI / 2; g.renderOrder = 5; grp.add(g); }
    const led = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.15), ledMat); led.position.set(0, 2.1, -9.9); grp.add(led);
    const shirts = ['#ff7043', '#3949ab', '#fafafa', '#43a047', '#8e24aa', '#fdd835', '#263238'];
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? 1 : -1;
      const ch = createCharacter(grp, { shirt: shirts[i], pants: '#263238', skin: ['#8d5a3b', '#a8714a', '#6e4429'][i % 3] });
      ch.root.position.set(side * 1.05, -0.2, -6 + i * 2); ch.root.rotation.y = -side * Math.PI / 2; ch.animate(0, 0, true);
    }
    parent.add(grp); return grp;
  }

  // ---------- tunnel scene: the train stands in a tube whose walls scroll past ----------
  const coach = new THREE.Scene();
  coach.background = new THREE.Color('#050506');
  coach.add(new THREE.HemisphereLight('#f4f6ff', '#4a4a55', 1.3));
  const tunnelTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#3a3a3e'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#333337' : '#404045'; x.fillRect(0, i * 32, 256, 30); }
    x.fillStyle = '#222'; x.fillRect(0, 60, 256, 6); x.fillRect(0, 190, 256, 6);
    x.fillStyle = '#ffd890'; x.fillRect(120, 0, 16, 10);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 40); return t;
  })();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 260, 24, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: tunnelTex, side: THREE.BackSide, roughness: 0.9, emissive: '#ffffff', emissiveMap: tunnelTex, emissiveIntensity: 0.25 }));
  tube.position.y = 1.6; coach.add(tube);
  const tunnelTrain = makeTrain(coach); tunnelTrain.position.y = -0.45;
  buildInterior(coach);
  const streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.1, 1.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.8) }), 24);
  coach.add(streaks);

  // ---------- the train on the real viaduct ----------
  const lines = trackLines(world);
  const line = lines.sort((a, b) => b.L - a.L)[0];
  const elevated = world.stations.find((s) => s.elevated);
  const sStation = line && elevated ? nearestS(line, elevated.tx, elevated.tz) : 0;
  const under = world.stations.filter((s) => !s.elevated);
  // the portal is the track end nearer the underground stations
  const sPortal = line && under.length ? (() => { const a = sampleLine(line, 0), b = sampleLine(line, line.L); const u = under[0]; return Math.hypot(a.x - u.x, a.z - u.z) < Math.hypot(b.x - u.x, b.z - u.z) ? 25 : line.L - 25; })() : 0;
  const viaTrain = makeTrain(mainScene); viaTrain.visible = false;
  const viaInside = buildInterior(viaTrain.children[1]); viaInside.position.y = 0.45;

  const R = { view: 'inside', active: false, phase: null, t: 0, from: null, to: null, legs: [], onDone: null, scene: null, s: 0 };
  function setLed(text) { ledMat.map.dispose(); ledMat.map = ledText(text); }
  function start(from, to, onDone) {
    R.active = true; R.from = from; R.to = to; R.onDone = onDone;
    R.legs = ['board'];
    if (from.elevated && line) R.legs.push('viaduct');
    R.legs.push('tunnel');
    if (to.elevated && line) R.legs.push('viaduct-in');
    R.legs.push('arrive');
    next();
  }
  function next() {
    R.phase = R.legs.shift(); R.t = 0;
    if (!R.phase) { finish(); return; }
    viaTrain.visible = false;
    if (R.phase === 'board' || R.phase === 'arrive') {
      const st = R.phase === 'board' ? R.from : R.to;
      boardMat.map = nameBoard(st.name); boardMat.needsUpdate = true;
      plat.background.set(st.elevated ? '#7f9bb8' : '#14121a');
      platTrain.position.z = R.phase === 'board' ? -120 : 0;
      R.scene = plat;
      ui.dialogue(R.phase === 'board' ? `Platform 1 · ${st.name}. Train arriving.` : `${st.name}. Doors will open on the left side.`);
      audio.chime();
    } else if (R.phase === 'tunnel') {
      R.scene = coach;
      const nxt = R.to.name;
      setLed(`ಮುಂದಿನ ನಿಲ್ದಾಣ: ${KN[nxt] || nxt}   ·   Next station: ${nxt}   ·   Please mind the gap   ·   `);
      ui.dialogue(`"ಮುಂದಿನ ನಿಲ್ದಾಣ ${KN[nxt] || nxt}. Next station: ${nxt}."`);
      audio.chime();
    } else {
      R.scene = mainScene; viaTrain.visible = true;
      R.s = R.phase === 'viaduct' ? sStation : sPortal;
      R.dir = R.phase === 'viaduct' ? Math.sign(sPortal - sStation) : Math.sign(sStation - sPortal);
      R.end = R.phase === 'viaduct' ? sPortal : sStation;
      R.speed = R.phase === 'viaduct' ? 2 : 22;
      // look out of the window on the side away from the other track
      { const p0 = sampleLine(line, R.s), yaw0 = p0.yaw + (R.dir < 0 ? Math.PI : 0), rx0 = Math.cos(yaw0), rz0 = -Math.sin(yaw0);
        const other = lines.find((l) => l !== line); let side = 1;
        if (other) { const q = sampleLine(other, nearestS(other, p0.x, p0.z)); side = ((q.x - p0.x) * rx0 + (q.z - p0.z) * rz0) > 0 ? -1 : 1; }
        R.side = side; }
      ui.dialogue(R.phase === 'viaduct' ? 'Gliding above MG Road on the Purple Line…' : 'Coming out of the tunnel onto the MG Road viaduct…');
    }
  }
  function finish() { R.active = false; R.phase = null; viaTrain.visible = false; R.onDone && R.onDone(); }
  function skip() { R.legs = []; finish(); }

  const m4 = new THREE.Matrix4(), pv = new THREE.Vector3(), look = new THREE.Vector3();
  function update(dt, camera) {
    if (!R.active) return;
    R.t += dt;
    // from inside, hide the shell of the coach you sit in so its window slabs don't block the view
    const shell = R.view !== 'inside';
    for (const tr of [viaTrain, tunnelTrain]) { const mid = tr.children[1]; mid.children[0].visible = mid.children[1].visible = shell; }
    if (R.phase === 'board' || R.phase === 'arrive') {
      // train glides in (board) or sits with doors open (arrive)
      if (R.phase === 'board') platTrain.position.z = Math.min(0, -120 + 120 * (1 - Math.pow(1 - Math.min(1, R.t / 4.5), 3)));
      camera.position.set(5.2, 2.75, 14 - R.t * 0.6); look.set(-1.2, 1.9, -6); camera.lookAt(look);
      crowd.forEach((c, i) => c.animate(dt, R.t > 4.5 && R.phase === 'board' && i % 2 ? 0.6 : 0));
      if (R.t > (R.phase === 'board' ? 6 : 4)) next();
    } else if (R.phase === 'tunnel') {
      const sway = Math.sin(R.t * 2.1) * 0.03;
      if (R.view === 'inside') { camera.position.set(0.25, 1.62 + sway, 9.2); look.set(-0.6, 1.3 + sway * 0.5, -8); }
      else { camera.position.set(1.2, 3.0, 40); look.set(0, 1.6, -10); }
      camera.lookAt(look);
      ledMat.map.offset.x = (R.t * 0.12) % 1;
      tunnelTex.offset.y = ((-R.t * 38 / 260 * 40) % 1 + 1) % 1;
      for (let i = 0; i < 24; i++) {
        const side = i % 2 ? 1 : -1, z = ((i * 11 - R.t * 38) % 130 + 130) % 130 - 65;
        m4.makeTranslation(side * 3.2, 2.6, z); streaks.setMatrixAt(i, m4);
      }
      streaks.instanceMatrix.needsUpdate = true;
      if (R.t > 7) next();
    } else {
      // follow the real train along the viaduct polyline
      R.speed = damp(R.speed, R.phase === 'viaduct' ? 22 : 3, 0.4, dt);
      R.s += R.speed * R.dir * dt;
      const done = R.dir > 0 ? R.s >= R.end : R.s <= R.end;
      const p = sampleLine(line, R.s), yaw = p.yaw + (R.dir < 0 ? Math.PI : 0);
      viaTrain.position.set(p.x, 10.5, p.z); viaTrain.rotation.y = yaw;
      const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      if (R.view === 'inside') {
        // window seat inside the middle coach, looking out over MG Road
        viaTrain.updateMatrixWorld(true);
        const mid = viaTrain.children[1].matrixWorld;
        camera.position.set(-0.85 * R.side, 2.0, 1.5).applyMatrix4(mid); look.set(4 * R.side, 1.9, -1.5).applyMatrix4(mid); camera.lookAt(look);
      } else {
        pv.set(p.x - fx * 26 + rx * 16, 19, p.z - fz * 26 + rz * 16);
        camera.position.lerp(pv, R.t < 0.1 ? 1 : 1 - Math.exp(-3 * dt)); look.set(p.x + fx * 12, 11, p.z + fz * 12); camera.lookAt(look);
      }
      if (done || R.t > 22) next();
    }
  }
  function toggleView() { R.view = R.view === 'inside' ? 'outside' : 'inside'; ui.toast('🎥 Metro camera', R.view === 'inside' ? 'Inside the coach' : 'Outside view'); }
  return { start, update, skip, toggleView, get active() { return R.active; }, get scene() { return R.scene; }, get phase() { return R.phase; }, get focus() { return R.phase && R.phase.startsWith('viaduct') ? viaTrain.position : null; } };
}
