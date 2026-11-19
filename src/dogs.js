import * as THREE from 'three';
import { box, merge, part, makeRng } from './util.js';

// Street dogs with a personality each: sleepy ones nap on the footpath, friendly ones wander and like a scratch,
// shy ones keep their distance until fed, and territorial ones chase anything fast through their patch at night.
// Pet one (E), feed it Parle-G from a chai cart three times, and it becomes your friend and follows you on foot.
const NAMES = ['Raja', 'Kalu', 'Tommy', 'Brownie', 'Moti', 'Jimmy', 'Rani', 'Sheru', 'Lucky', 'Tiger'];
const PET = ['The dog leans into your hand. Tail going like a ceiling fan.', 'A happy wiggle. You now have a dog-hair situation.', 'It rolls over for a belly rub. Of course you oblige.', '"Who is a good boy?" Everyone on the footpath, apparently.'];
const CHASE = ['A pack is on your tail. Classic Bengaluru night.', 'Territorial dog! It considers this road its own.', 'Barking escort, free of charge.'];

export function createDogs(scene, world, ui, audio, wallet) {
  const rng = makeRng(404);
  const dogG = merge([
    part(new THREE.CapsuleGeometry(0.17, 0.55, 2, 6).rotateX(Math.PI / 2).translate(0, 0.35, 0), '#fff'),
    part(new THREE.SphereGeometry(0.14, 8, 6).translate(0, 0.48, 0.42), '#fff'), box(0.09, 0.08, 0.14, 0, 0.44, 0.58, '#3a2a1a'),
    box(0.05, 0.12, 0.05, -0.08, 0.6, 0.38, '#fff'), box(0.05, 0.12, 0.05, 0.08, 0.6, 0.38, '#fff'),
    ...[[-0.1, 0.25], [0.1, 0.25], [-0.1, -0.25], [0.1, -0.25]].map(([x, z]) => part(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 5).translate(x, 0.15, z), '#fff')),
  ]);
  // the tail is its own mesh so it can wag
  const tailG = part(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 4).translate(0, 0.15, 0), '#fff');
  const COATS = ['#c8a165', '#8d6e4a', '#3b2f2a', '#e8dcc6', '#a0522d'];
  const edges = world.graph.edges.filter((e) => e.len > 30 && !e.l && world.inMap(e.ax, e.az, 200));
  const dogs = [];
  for (let i = 0; i < 30 && edges.length; i++) {
    const e = edges[Math.floor(rng() * edges.length)], s = rng() * e.len, lat = e.w / 2 + 1.8;
    const x = e.ax + e.dx * s + e.dz * lat, z = e.az + e.dz * s - e.dx * lat;
    if (world.insideBuilding(x, z, 0.5)) continue;
    const r = rng(), kind = r < 0.15 ? 'territorial' : r < 0.5 ? 'sleepy' : r < 0.85 ? 'friendly' : 'shy';
    const mat = new THREE.MeshStandardMaterial({ color: rng.pick(COATS), roughness: 0.9, vertexColors: true });
    const g = new THREE.Group(), body = new THREE.Mesh(dogG, mat), tail = new THREE.Mesh(tailG, mat);
    tail.position.set(0, 0.42, -0.36); tail.rotation.x = -0.8; body.castShadow = true; g.add(body, tail); scene.add(g);
    const d = { g, body, tail, kind, name: NAMES[i % NAMES.length], x, z, yaw: rng() * 6.28, home: { x, z }, e, s, lat, dir: rng() < 0.5 ? 1 : -1,
      mode: kind === 'sleepy' ? 'sleep' : 'roam', t: 0, wag: 0, petCd: 0, barkCd: 0, fed: 0, chaseT: 0, stillT: 0, nipCd: 0, id: dogs.length };
    dogs.push(d);
  }
  let friend = null, biscuits = 0, toastCd = 0, nearMissCd = 0;

  const say = (title, body) => { if (toastCd <= 0) { toastCd = 4; ui.flavour(`${title}. ${body}`, 8000); } };
  function pet(d) {
    d.petCd = 45; d.mode = 'happy'; d.t = 2.5; d.wag = 3; audio.bark && audio.bark(0);
    ui.dialogue(PET[Math.floor(Math.random() * PET.length)]);
    wallet.energy = Math.min(100, wallet.energy + 3); wallet.respect = Math.min(100, wallet.respect + 1);
  }
  function feed(d) {
    biscuits--; d.fed++; d.mode = 'happy'; d.t = 3; d.wag = 3;
    if (d.kind === 'shy') d.kind = 'friendly';
    if (d.fed >= 3 && friend !== d) {
      if (friend) { friend.mode = 'roam'; }
      friend = d; d.mode = 'follow';
      ui.toast(`${d.name} is your friend now`, 'They will follow you on foot and wait while you drive.', 'paw');
    } else ui.dialogue(`${d.name} wolfs down the Parle-G. ${3 - d.fed > 0 && friend !== d ? 'Looks at you hopefully.' : ''}`);
  }

  // E near a dog (game.addAction): feed it if you have biscuits, otherwise pet it
  function action(w) {
    let best = null;
    for (const d of dogs) { const dd = Math.hypot(d.x - w.x, d.z - w.z); if (dd < 1.7 && d.mode !== 'chase' && (!best || dd < best.dd)) best = { d, dd }; }
    if (!best) return null;
    const d = best.d;
    if (biscuits > 0 && friend !== d) return { d: best.dd, label: `feed ${d.name} a biscuit`, run: () => feed(d) };
    if (d.kind === 'shy') return { d: best.dd, label: `crouch for ${d.name}`, run: () => ui.dialogue(`${d.name} sniffs from a distance. Maybe biscuits would help.`) };
    if (d.petCd > 0) return null;
    return { d: best.dd, label: `pet ${d.name}`, run: () => pet(d) };
  }

  const v3 = new THREE.Vector3();
  // focus: where you are; target: you (on foot) or your vehicle; speed of whatever you're on
  function update(dt, t, s) {
    toastCd -= dt; nearMissCd -= dt;
    const me = s.mode === 'drive' ? s.player.pos : s.walker, mySpeed = s.mode === 'drive' ? Math.abs(s.player.speed) : s.walkSpeed;
    const night = s.lights > 0.4, fast = (s.mode === 'drive' && s.player.type === 'scooter' && mySpeed > 5) || (s.mode === 'walk' && mySpeed > 3.5) || (s.mode === 'drive' && mySpeed > 9);
    let chasing = 0;
    for (const d of dogs) {
      const dx = me.x - d.x, dz = me.z - d.z, dd = Math.hypot(dx, dz);
      if (dd > 220 && d !== friend) continue; // asleep as far as you can tell
      d.petCd -= dt; d.barkCd -= dt; d.nipCd -= dt; d.wag = Math.max(0, d.wag - dt);
      let speed = 0, face = null;
      if (d.mode === 'happy') { if ((d.t -= dt) <= 0) d.mode = d === friend ? 'follow' : d.kind === 'sleepy' ? 'sleep' : 'roam'; }
      else if (d === friend) {
        // follows you on foot; waits where you got into a vehicle (or went inside)
        if (s.mode === 'walk' && dd > 2.2) { speed = Math.min(5, dd * 1.2); face = Math.atan2(dx, dz); if (dd > 60) { d.x = me.x - 2; d.z = me.z - 2; } }
        d.mode = 'follow';
      } else if (d.mode === 'chase') {
        d.chaseT += dt;
        d.stillT = mySpeed < 0.6 ? d.stillT + dt : 0;
        const homeD = Math.hypot(d.x - d.home.x, d.z - d.home.z);
        // they give up when you stop, leave their patch, or your friend tells them off
        const friendNear = friend && Math.hypot(friend.x - d.x, friend.z - d.z) < 6;
        if (d.stillT > 1.5 || homeD > 45 || d.chaseT > 14 || friendNear) {
          d.mode = 'return'; if (friendNear) { audio.bark && audio.bark(0.3); say(`${friend.name} saw them off`, 'Your friend has your back.'); }
        } else {
          speed = 5.2; face = Math.atan2(dx, dz);
          if (d.barkCd <= 0) { d.barkCd = 0.8 + Math.random(); audio.bark && audio.bark(Math.max(-1, Math.min(1, dx / 20))); }
          if (dd < 1.3 && d.nipCd <= 0) { d.nipCd = 3; s.onNip && s.onNip(d); }
          chasing++;
        }
      } else if (d.mode === 'return') {
        const hx = d.home.x - d.x, hz = d.home.z - d.z, hd = Math.hypot(hx, hz);
        if (hd < 1) d.mode = d.kind === 'sleepy' ? 'sleep' : 'roam'; else { speed = 2; face = Math.atan2(hx, hz); }
      } else {
        // territorial dogs take off after anything fast in their patch, at night or when it's really fast
        if (d.kind === 'territorial' && fast && (night || mySpeed > 7) && dd < 22 && Math.hypot(me.x - d.home.x, me.z - d.home.z) < 35) {
          d.mode = 'chase'; d.chaseT = 0; d.stillT = 0; say('Woof woof woof!', CHASE[Math.floor(Math.random() * CHASE.length)]);
        } else if (d.kind === 'shy' && s.mode === 'walk' && dd < 3) { speed = 1.6; face = Math.atan2(-dx, -dz); }
        else if (d.mode === 'roam') {
          d.s += d.dir * 0.6 * dt; if (d.s < 0 || d.s > d.e.len) d.dir *= -1;
          d.x = d.e.ax + d.e.dx * d.s + d.e.dz * d.lat; d.z = d.e.az + d.e.dz * d.s - d.e.dx * d.lat; d.yaw = Math.atan2(d.e.dx * d.dir, d.e.dz * d.dir);
          // a friendly dog trots up to people passing by, tail going
          if (d.kind === 'friendly' && s.peds) for (const p of s.peds) if (p.x < 1e5 && Math.abs(p.x - d.x) < 1.4 && Math.abs(p.z - d.z) < 1.4) { d.wag = 1.5; break; }
        }
        // everyone barks at fast vehicles going past
        if (dd < 9 && s.mode === 'drive' && mySpeed > 6 && d.barkCd <= 0) { d.barkCd = 6; audio.bark && audio.bark(); }
      }
      if (speed > 0) { d.x += Math.sin(face) * speed * dt; d.z += Math.cos(face) * speed * dt; d.yaw = face; }
      // your vehicle never runs a dog over: it jumps aside (and you lose a little respect for scaring it)
      if (s.mode === 'drive' && dd < s.player.radius + 0.5 && mySpeed > 1.5) {
        const k = (s.player.radius + 0.9 - dd) / (dd || 1); d.x -= dx * k; d.z -= dz * k;
        if (nearMissCd <= 0) { nearMissCd = 8; audio.bark && audio.bark(0); s.onNearMiss && s.onNearMiss(d); }
      }
      // pose: asleep on its side, sitting when happy, running bob otherwise
      const g = d.g, run = speed > 3;
      g.position.set(d.x, d.mode === 'sleep' ? 0.17 : run ? Math.abs(Math.sin(t * 14 + d.id)) * 0.08 : 0, d.z);
      g.rotation.set(d.mode === 'happy' ? -0.25 : 0, d.yaw, d.mode === 'sleep' ? Math.PI / 2 * 0.95 : 0);
      d.tail.rotation.z = d.wag > 0 || d.mode === 'follow' ? Math.sin(t * 22) * 0.7 : d.mode === 'chase' ? 0 : Math.sin(t * 2 + d.id) * 0.15;
    }
    return chasing;
  }
  return {
    dogs, action, update,
    get friend() { return friend; }, get biscuits() { return biscuits; }, addBiscuits(n = 1) { biscuits += n; },
    save: () => ({ friend: friend ? friend.id : -1, biscuits, fed: dogs.map((d) => d.fed) }),
    load(s) { if (!s) return; biscuits = s.biscuits || 0; (s.fed || []).forEach((f, i) => { if (dogs[i]) dogs[i].fed = f; }); if (s.friend >= 0 && dogs[s.friend]) { friend = dogs[s.friend]; friend.mode = 'follow'; } },
  };
}
