// Headless simulation check: builds the real world from public/data/map, runs traffic, people and signals for
// thousands of frames around several neighbourhoods (the way the worker does), and checks the invariants the
// game relies on: no two vehicles overlap, no pedestrian stands inside a vehicle, nothing ends up at NaN.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// textures.js draws on canvases: give it a do-nothing one, like src/world-worker.js does
const any = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'width' || k === 'height' ? 1 : any),
  set: () => true, apply: () => any, construct: () => any,
});
globalThis.document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => any }) };

const FRAMES = +(process.env.SIM_FRAMES || 5000), DT = 1 / 30;
const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/map/${f}`, import.meta.url), 'utf8'));

test(`traffic and people: ${FRAMES} frames without overlaps`, { timeout: 600000 }, async () => {
  const THREE = await import('three');
  const { buildWorld } = await import('../src/world.js');
  const { createTraffic, createParked } = await import('../src/vehicles.js');
  const { createPeople } = await import('../src/people.js');
  const { createSignals } = await import('../src/signals.js');
  const index = load('index.json'), all = load(index.bundle || 'all.json');
  const world = buildWorld(new THREE.Scene(), { ...index, buildings: all.buildings, pois: all.pois }, { worker: true });
  const g = new THREE.Group();
  const traffic = createTraffic(g, world, { hornAt() {} }), people = createPeople(g, world);
  createParked(g, world); const signals = createSignals(g, world);
  traffic.setPeds(people.peds);
  const ev = { honked() {}, pedestrian() {}, hitPed() {}, tumble() {} };
  // around MG Road, then out to the new neighbourhoods (vehicles respawn round each new focus)
  const stops = [[600, -40], [4360, 370], [2555, 4426], [5107, -3893], [600, -40]];
  let worstOverlap = 0, pedInside = 0, bad = 0;
  for (let f = 0; f < FRAMES; f++) {
    const [x, z] = stops[Math.min(stops.length - 1, Math.floor(f / FRAMES * stops.length))];
    const focus = { x, z, fx: 0, fz: 1, density: 1, pdens: 1, live: { traffic: 0.85, people: 0.72 }, blockers: [{ x: 1e6, z: 1e6, speed: 0, r: 1, isPlayer: true, vx: 0, vz: 0 }], drag: () => 1 };
    signals.update(DT, null, { toast() {} }, { money: 0 });
    traffic.update(DT, focus, ev);
    people.update(DT, f * DT, focus, 0, ev);
    if (f % 50 === 0 && f > 60) {
      worstOverlap = Math.max(worstOverlap, traffic.overlaps());
      for (const v of traffic.vehicles) {
        if (v.off || v.hidden || v.x > 1e5) continue;
        if (!Number.isFinite(v.x) || !Number.isFinite(v.z)) bad++;
        for (const p of people.peds) {
          if (p.x > 1e5 || p.down || p.tumble || v.y > 2.2) continue; // (a car up on a flyover is not "on" the person below)
          const dx = p.x - v.x, dz = p.z - v.z; if (dx * dx + dz * dz > 36) continue;
          const along = dx * v.fx + dz * v.fz, lat = dx * v.fz - dz * v.fx;
          if (Math.abs(along) < v.long * 0.8 && Math.abs(lat) < v.hw * 0.8) pedInside++;
        }
      }
    }
  }
  console.log(`overlaps (worst sample) ${worstOverlap}, pedestrians inside vehicles ${pedInside}, NaN positions ${bad}`, traffic.stats);
  assert.equal(bad, 0, 'vehicles at NaN');
  assert.equal(worstOverlap, 0, 'vehicles overlapping');
  assert.equal(pedInside, 0, 'pedestrians inside vehicles');
});
