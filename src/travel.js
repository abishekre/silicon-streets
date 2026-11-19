// Fast travel across the bigger map. Pick a place on the big map (or search it) and choose "fast travel":
// driving, you skip the drive (time passes at Bengaluru traffic speed); on foot, an
// Oober cab takes you (a fare, and your vehicle stays where you left it). Also the neighbourhoods as map places.
const KX = 111320 * Math.cos(12.97525 * Math.PI / 180), KZ = 110574; // tools/osm2game.py proj()

// [name, lat, lon]: the neighbourhoods in tools/areas.json
const DISTRICTS = [
  ['MG Road', 12.9755, 77.6065], ['Cubbon Park', 12.9763, 77.5929], ['Ulsoor', 12.9812, 77.6200],
  ['Indiranagar', 12.9719, 77.6412], ['Domlur', 12.9610, 77.6387], ['Ejipura', 12.9450, 77.6300],
  ['Shanthinagar', 12.9585, 77.6080], ['Koramangala', 12.9352, 77.6245], ['Madiwala', 12.9226, 77.6174],
  ['Byappanahalli', 12.9915, 77.6520], ['Banaswadi', 13.0104, 77.6480], ['Kasturi Nagar', 13.0030, 77.6600],
  ['Kammanahalli', 13.0159, 77.6378], ['Kalyan Nagar', 13.0240, 77.6400],
];
// what you skipped (one at random)
const SKIPPED = [
  'Stuck behind a BMTC bus that stopped at every stop, and some that are not stops.',
  'Forty minutes at one signal. The signal was green for six seconds of it.',
  'The road was dug up. Then filled. Then dug up again, by a different department.',
  'A cow held a sit-in on the main road. Nobody argued.',
  'Took a "shortcut" through the lanes. Everyone else had the same idea.',
  'Waited out a water tanker reversing into a lane two inches wider than it.',
];
const RUSH = (h) => (h >= 8.5 && h < 11) || (h >= 17.5 && h < 21);

export function createTravel({ world, game, ui, state, player, walker: W, tow, origin, later }) {
  const lat0 = origin ? origin.lat : 12.97525, lon0 = origin ? origin.lon : 77.601;
  // kerbside on the nearest drivable road: where a vehicle can stop
  const kerb = (x, z, out = 1.4) => {
    const nr = world.nearestRoad(x, z, 400);
    if (!nr) return null;
    const side = ((x - nr.x) * nr.dz - (z - nr.z) * nr.dx) >= 0 ? 1 : -1, o = nr.r.hw - out;
    return { x: nr.x + nr.dz * o * side, z: nr.z - nr.dx * o * side, heading: Math.atan2(nr.dx * side, nr.dz * side), nr, side };
  };
  const districts = DISTRICTS.map(([name, lat, lon]) => {
    const x = (lon - lon0) * KX, z = -(lat - lat0) * KZ;
    if (!world.inMap(x, z, 0)) return null;
    const k = kerb(x, z, 0); return k && { name, x: k.x, z: k.z, icon: 'city', kind: 'Neighbourhood' };
  }).filter(Boolean);

  const here = () => (state.mode === 'drive' ? player.pos : W.pos);
  function quote(p) {
    const f = here(), km = Math.hypot(p.x - f.x, p.z - f.z) * 1.35 / 1000; // roads are never straight
    const rain = state.weather === 'rain' || state.weather === 'storm';
    const night = state.hours >= 23 || state.hours < 5;
    let kmh = RUSH(state.hours) ? 12 : night ? 34 : 21; if (rain) kmh *= 0.7;
    const min = Math.round(km / kmh * 60 + 3);
    const q = { km, min, rush: RUSH(state.hours), rain };
    if (state.mode === 'drive') {
      q.mode = 'drive';
    } else {
      const surge = (q.rush ? 1.4 : 1) * (rain ? 1.6 : 1);
      q.mode = 'cab'; q.surge = surge; q.fare = Math.round((40 + 14 * km) * surge / 10) * 10;
    }
    return q;
  }
  // why you can't fast travel right now (or null)
  function blocked(p, q) {
    const { missions, hustles } = later(); // made after the map places
    if (state.mode !== 'drive' && state.mode !== 'walk') return 'Step outside first.';
    if (W.venue) return 'Step outside first.';
    if (game.ride.state === 'waiting' || game.ride.state === 'riding') return 'Finish the job you are on first (or cancel it).';
    if (missions.state.active && missions.missions[missions.state.active].deadline) return 'No shortcuts on a mission with a deadline.';
    if (hustles.doing) return 'You are in the middle of a side hustle.';
    if (state.mode === 'drive' && (tow.busy || tow.impounded)) return 'Your vehicle is with the tow truck.';
    if (q.km < 0.5) return 'It is right there. Just go.';
    if (q.mode === 'cab' && game.wallet.money < q.fare) return `The cab is ₹${q.fare} and you have ₹${Math.floor(game.wallet.money)}.`;
    return null;
  }
  function label(q) {
    const t = q.min >= 60 ? `${Math.floor(q.min / 60)} h ${q.min % 60} min` : `${q.min} min`;
    return q.mode === 'drive' ? `${q.km.toFixed(1)} km · ${t} in traffic`
      : `${q.km.toFixed(1)} km · ${t} · ₹${q.fare}${q.surge > 1 ? ` (${q.surge.toFixed(1)}x surge)` : ''}`;
  }

  function go(p, q, done) {
    const k = kerb(p.x, p.z);
    if (!k) return ui.toast('Can\'t get there', 'No road near that spot.', 'road');
    ui.fade(() => {
      state.hours = (state.hours + q.min / 60) % 24;
      if (q.mode === 'drive') {
        player.pos.set(k.x, 0, k.z); player.heading = k.heading; player.park();
      } else {
        game.wallet.spend(q.fare, `Oober cab to ${p.name}`);
        const o = k.nr.r.hw + 2.2; // the footpath beside the kerb
        W.pos.set(k.nr.x + k.nr.dz * o * k.side, 0, k.nr.z - k.nr.dx * o * k.side); W.yaw = k.heading; W.speed = 0; W.y = 0; W.vy = 0;
      }
      done && done();
      const skipped = SKIPPED[Math.floor(Math.random() * SKIPPED.length)];
      ui.toast(`${p.name}: ${q.min} min later`, q.mode === 'cab' ? `₹${q.fare} to Oober. ${skipped} Your vehicle is where you left it (${ui.kbd('call')} calls it).` : skipped, q.mode === 'cab' ? 'phone' : 'clock');
    }, q.mode === 'cab' ? 'Oober cab…' : 'Skipping the traffic…');
  }

  // the choice after picking a place on the big map: directions, or fast travel
  function choose(p, { route, done }) {
    const q = quote(p), why = blocked(p, q);
    ui.menu({ title: p.name, kn: '', foot: why ? `Fast travel: ${why}` : 'Fast travel passes the time it would take', items: [
      { name: 'Get directions', price: null, desc: 'GPS route with the blue arrows', onPick: () => route(p) },
      { name: q.mode === 'cab' ? 'Fast travel: book an Oober cab' : 'Fast travel: skip the drive', price: null, desc: why || label(q), disabled: !!why,
        onPick: () => (why ? ui.toast('Can\'t fast travel', why, 'warning') : go(p, q, done)) },
    ] });
  }
  return { districts, quote, choose, blocked };
}
