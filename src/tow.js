import * as THREE from 'three';
import { box, merge } from './util.js';
import { textTexture } from './textures.js';

// Leave your vehicle blocking a lane and traffic police tow it to the yard.
// The truck is a road user like everyone else: it drives up the next lane, waits for whatever is in its way,
// traffic queues behind it, and a crane swings your vehicle sideways onto the flatbed.
export function createTow(scene, world, ui, audio) {
  const truck = new THREE.Group();
  truck.add(new THREE.Mesh(merge([
    box(2.4, 1.0, 7.5, 0, 0.9, -1, '#2b2b2b'), box(2.3, 1.8, 2.2, 0, 1.9, 3.1, '#f2c230'), box(2.0, 0.8, 0.05, 0, 2.3, 4.21, '#26323a'),
    box(2.6, 0.2, 5.6, 0, 1.45, -1.8, '#7a7a7a'), box(0.3, 1.4, 0.3, 0, 2.1, -4.4, '#555'),
    ...[[-1.1, 3], [1.1, 3], [-1.1, -3], [1.1, -3]].map(([x, z]) => box(0.35, 0.9, 0.9, x, 0.45, z, '#111')),
  ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
  // crane: a post behind the cab and a boom that swings out over the kerb
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.6, 0.35), new THREE.MeshStandardMaterial({ color: '#f2c230' })); post.position.set(0, 2.3, 1.4); truck.add(post);
  const boom = new THREE.Group(); boom.position.set(0, 3.0, 1.4); truck.add(boom);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 4.2).translate(0, 0, 2.1), post.material); boom.add(arm);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: '#ff2020' })); bar.position.set(0, 2.9, 3.1); truck.add(bar);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshBasicMaterial({ map: textTexture(['TRAFFIC POLICE · TOWING'], { w: 512, h: 96, bg: '#f2c230', fg: '#111', font: '700 40px "Space Grotesk"' }) }));
  sign.position.set(0, 1.4, -4.76); sign.rotation.y = Math.PI; truck.add(sign);
  truck.traverse((o) => (o.castShadow = true)); truck.visible = false; scene.add(truck);

  // the tow yard: a curb spot well away from the action
  const B = world.bounds, yr = (world.inMap(-200, 380) && world.nearestRoad(-200, 380, 400)) || world.nearestRoad((B.x1 + B.x2) / 2, (B.z1 + B.z2) / 2, 3000);
  const yard = { name: 'Traffic Police Tow Yard', x: yr.x + yr.dz * (yr.r.hw + 1.5), z: yr.z - yr.dx * (yr.r.hw + 1.5), yaw: Math.atan2(yr.dx, yr.dz) };

  const T = { blockT: 0, phase: 'none', t: 0, warned: false, impounded: false, s: 0, speed: 0, wait: 0 };
  const L = { ox: 0, oz: 0, dx: 0, dz: 1, side: 1, stop: 0 }; // the truck's lane: origin, direction, which side your vehicle is on
  const lanePos = (s) => ({ x: L.ox + L.dx * s, z: L.oz + L.dz * s });
  // is anything (traffic, your vehicle, you on foot) in the truck's path?
  function clearAhead(x, z, vehicles, extra) {
    let best = Infinity;
    // half-width sideways, half-length along the lane
    const check = (ox, oz, w, len) => {
      const ax = ox - x, az = oz - z, along = ax * L.dx + az * L.dz, lat = Math.abs(ax * -L.dz + az * L.dx);
      if (along > -len && along < 16 + len && lat < 1.25 + w) best = Math.min(best, along - len);
    };
    for (const v of vehicles) {
      if (v.off) continue;
      // oncoming traffic squeezes over towards its own kerb to get past the truck (siren on, everyone makes room)
      const ax = v.x - x, az = v.z - z, along = ax * L.dx + az * L.dz;
      if (v.fx * L.dx + v.fz * L.dz < -0.5 && along > -6 && along < 22 && Math.abs(ax * -L.dz + az * L.dx) < 3) { v.ox = v.fz * 2.7; v.oz = -v.fx * 2.7; continue; }
      check(v.x, v.z, v.type === 'scooter' ? 0.35 : v.type === 'auto' ? 0.7 : v.type === 'bus' ? 1.3 : 0.95, (v.r || 1) + (v.long || 0));
    }
    for (const e of extra) check(e.x, e.z, e.r, e.r);
    return best;
  }
  function drive(dt, vehicles, extra, target) {
    const p = lanePos(T.s), gapAhead = clearAhead(p.x + L.dx * 4.2, p.z + L.dz * 4.2, vehicles, extra);
    const want = Math.min(target, gapAhead < 2.5 ? 0 : gapAhead < 8 ? (gapAhead - 2.5) * 1.2 : target);
    T.speed += Math.max(-9 * dt, Math.min(3 * dt, want - T.speed));
    T.s += T.speed * dt;
    if (T.speed < 0.3 && want === 0) { T.wait += dt; if (T.wait > 2.5) { T.wait = 0; audio.hornAt('bus', p.x, p.z, 1.2); } }
    const q = lanePos(T.s); truck.position.set(q.x, 0, q.z); truck.rotation.y = Math.atan2(L.dx, L.dz);
  }

  function update(dt, { player, mode, blockedBehind, wallet, navTo, traffic, walker }) {
    // ---- count up while your parked vehicle blocks traffic
    if (T.phase === 'none' && !T.impounded) {
      const nr = mode !== 'drive' && world.nearestRoad(player.pos.x, player.pos.z, 10);
      const onLane = nr && nr.d < nr.r.hw - 0.4;
      T.blockT = onLane && blockedBehind > 0 ? T.blockT + dt : Math.max(0, T.blockT - dt * 0.5);
      if (T.blockT > 40 && !T.warned) { T.warned = true; ui.toast('Traffic police are noting your number', 'Your vehicle is blocking the road. Move it, or it gets towed.', 'police'); }
      if (T.blockT < 20) T.warned = false;
      if (T.blockT > 60 && nr) {
        // pull up in the lane next to your vehicle (towards the middle of the road), coming from behind
        const lat = (player.pos.x - nr.x) * nr.dz - (player.pos.z - nr.z) * nr.dx;
        const side = Math.abs(lat) < 1.6 ? 1 : Math.sign(lat), tl = Math.abs(lat) < 1.6 ? lat - 3.3 : lat - side * 3.3;
        L.dx = nr.dx; L.dz = nr.dz; L.side = side;
        // lane origin = level with your vehicle; the truck starts 60 m back and stops with its crane beside you
        L.ox = nr.x + nr.dz * tl + nr.dx * ((player.pos.x - nr.x) * nr.dx + (player.pos.z - nr.z) * nr.dz);
        L.oz = nr.z - nr.dx * tl + nr.dz * ((player.pos.x - nr.x) * nr.dx + (player.pos.z - nr.z) * nr.dz);
        L.stop = -1.4; T.s = -60; T.speed = 7; T.wait = 0;
        T.phase = 'coming'; T.t = 0; truck.visible = true; boom.rotation.y = 0;
        audio.hornAt('bus', player.pos.x, player.pos.z, 1.5);
        ui.toast('Tow truck on the way', 'Traffic police are coming to tow your vehicle!', 'siren');
      }
    }
    if (T.phase === 'none') return;
    // ---- getting back in before it's lifted cancels the tow
    if (mode === 'drive' && T.phase === 'coming') { T.phase = 'leaving'; T.cancelled = true; T.blockT = 0; ui.toast('Close one', 'You moved it before the tow truck got there.', 'smile'); }
    T.t += dt;
    bar.material.color.set(Math.sin(T.t * 12) > 0 ? '#ff2020' : '#2050ff');
    const vehicles = traffic ? traffic.vehicles : [];
    if (T.phase === 'coming') {
      // your own vehicle and you on foot count as obstacles too (the truck stops beside, not on top of, them)
      const extra = walker ? [{ x: walker.x, z: walker.z, r: 0.4 }] : [];
      const left = L.stop - T.s;
      drive(dt, vehicles, extra, Math.min(9, Math.max(0, left) * 0.9 + (left > 0.2 ? 0.8 : 0)));
      if (left < 0.2 && T.speed < 0.4) { T.s = L.stop; T.phase = 'lifting'; T.t = 0; T.from = { x: player.pos.x, z: player.pos.z, h: player.heading }; }
    } else if (T.phase === 'lifting') {
      // crane swings out, hooks, lifts your vehicle up and over onto the bed
      const k = Math.min(1, T.t / 4), sw = Math.min(1, k * 3), lift = Math.max(0, Math.min(1, (k - 0.33) * 1.5));
      boom.rotation.y = L.side * -Math.PI / 2 * sw * (1 - Math.max(0, (lift - 0.5) * 2));
      const bedX = truck.position.x - L.dx * 1.8, bedZ = truck.position.z - L.dz * 1.8;
      player.pos.set(T.from.x + (bedX - T.from.x) * lift, 0, T.from.z + (bedZ - T.from.z) * lift);
      player.heading = T.from.h + (Math.atan2(L.dx, L.dz) - T.from.h) * lift; player.syncMesh();
      player.group.position.y = Math.sin(lift * Math.PI) * 1.6 + lift * 1.55;
      // no money changes hands here: the release fee is paid at Namma Garage & Impound 
      if (k >= 1) { T.phase = 'leaving'; T.t = 0; T.speed = 0; ui.toast('Towed!', 'Your vehicle is going to Namma Garage & Impound. Pay the release fee there.', 'truck'); }
    } else if (T.phase === 'leaving') {
      boom.rotation.y = 0;
      drive(dt, vehicles, [], 9);
      if (!T.cancelled) { player.pos.set(truck.position.x - L.dx * 1.8, 0, truck.position.z - L.dz * 1.8); player.heading = Math.atan2(L.dx, L.dz); player.syncMesh(); player.group.position.y = 1.55; }
      if (T.s > L.stop + 70 || T.t > 25) {
        truck.visible = false; T.phase = 'none'; T.blockT = 0;
        if (!T.cancelled) { impoundNow(player); onImpound ? onImpound() : navTo({ ...yard, name: yard.name, keep: true }); }
        T.cancelled = false;
      }
    }
  }
  // walking up to it at the yard (or paying to have it delivered) releases it
  function release() { T.impounded = false; }
  // your vehicle parked at the yard (also used to restore a saved game)
  function impoundNow(player) { T.impounded = true; player.pos.set(yard.x, 0, yard.z); player.heading = yard.yaw; player.park(); }
  let onImpound = null;
  // for traffic: the truck (cab and tail) is something to stop behind
  const bl = [{ x: 0, z: 0, speed: 0, r: 1.4 }, { x: 0, z: 0, speed: 0, r: 1.4 }];
  return {
    update, release, yard,
    get blockers() {
      if (!truck.visible) return [];
      bl[0].x = truck.position.x + L.dx * 2.5; bl[0].z = truck.position.z + L.dz * 2.5; bl[1].x = truck.position.x - L.dx * 3.5; bl[1].z = truck.position.z - L.dz * 3.5;
      bl[0].speed = bl[1].speed = T.speed; return bl;
    },
    impoundNow, set onImpound(f) { onImpound = f; },
    state: T, get impounded() { return T.impounded; }, get busy() { return T.phase !== 'none'; },
  };
}
