import { createJobMarker } from './marker.js';

// Missions arrive as phone messages (Broker Babu, Arjun the founder, Amma, Kannada Meshtru, Gig Support) and run as
// a list of steps: go somewhere (a ring and a GPS route), walk into a place, make a choice, beat a deadline.
// The current objective sits in the HUD; the phone lists active and finished missions.

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function createMissions({ world, game, ui, audio, scene, navTo, clearNav, state, player, walker: W, actions, hooks }) {
  const marker = createJobMarker(scene, '#b388ff', 'Mission');
  const S = { active: null, step: 0, t: 0, done: {}, home: null, vars: {}, offerT: 120, order: 0 };
  let phone = null, cur = null, target = null;
  const here = () => (state.mode === 'drive' ? player.pos : state.mode === 'interior' && W.street ? W.street : W.pos);

  // ---------- places missions use ----------
  const curb = (x, z) => { const nr = world.nearestRoad(x, z, 150); if (!nr) return { x, z }; const side = ((x - nr.x) * nr.dz - (z - nr.z) * nr.dx) >= 0 ? 1 : -1, o = nr.r.hw - 0.6; return { x: nr.x + nr.dz * o * side, z: nr.z - nr.dx * o * side, road: nr.r.n }; };
  const spot = (re) => game.spots.find((s) => re.test(s.name));
  const nearDoor = (test, lo = 40, hi = 900) => { const p = here(); const c = world.doors.filter((d) => test(d) && dist(p, d) > lo && dist(p, d) < hi); return c.length ? pick(c) : world.doors.find(test); };
  const homesNear = (n, lo, hi) => {
    const p = here(), c = world.buildings.filter((b) => b.style === 'res' && b.area > 80 && b.h < 30 && Math.abs(b.cx) < 1250 && Math.abs(b.cz) < 850 && Math.hypot(b.cx - p.x, b.cz - p.z) > lo && Math.hypot(b.cx - p.x, b.cz - p.z) < hi);
    const out = []; for (let i = 0; i < 40 && out.length < n && c.length; i++) { const b = pick(c); if (!out.some((o) => Math.hypot(o.cx - b.cx, o.cz - b.cz) < 150)) out.push(b); }
    return out.map((b) => ({ ...curb(b.cx, b.cz) }));
  };

  // ---------- the missions ----------
  // step: { text, go: (vars) => place, r, on: 'foot' | 'drive' }  |  { text, enter: (W, venues) => bool }  |  { choice: (vars) => ({ title, body, options: [[label, desc, fn]] }) }
  const MISSIONS = {
    pg: {
      title: 'Find a PG under ₹15k', from: 'broker', reward: { money: 0, respect: 5 },
      intro: 'Broker Babu here! Three PGs, all "near metro", all "fully furnished". Under ₹15k, as you asked. Shall we see?',
      setup: (v) => { v.l = homesNear(3, 150, 900); v.names = ['Sri Lakshmi PG for Gents', 'Elite Luxury Coliving', 'Comfort Stay PG']; },
      steps: [
        { text: (v) => `Visit listing 1: ${v.names[0]}`, go: (v) => ({ ...v.l[0], name: v.names[0] }), r: 6 },
        { choice: (v) => ({ title: v.names[0], body: '₹14,500 a month. 4-sharing. Curfew 9 PM. Wi-Fi "coming next week" (since 2022). The bathroom is shared with the landlord\'s gym equipment.',
          options: [['Take it', 'Deposit ₹300 now', () => takePG(0)], ['Keep looking', 'Two more to see', () => next()]] }) },
        { text: (v) => `Visit listing 2: ${v.names[1]}`, go: (v) => ({ ...v.l[1], name: v.names[1] }), r: 6 },
        { choice: () => ({ title: 'Elite Luxury Coliving', body: 'Broker Babu: "Very hot property, 10 people are interested. Just send ₹500 token advance on UPI, I\'ll show the room after."',
          options: [['Send the ₹500 token', 'What could go wrong?', () => { game.wallet.fine(500, 'PG "token advance" (scam)'); ui.dialogue('Broker Babu has blocked you on all platforms. The "room" was a stock photo.'); next(); }], ['Walk away', 'No room, no money', () => { ui.dialogue('Broker Babu: "Your loss, boss. Very hot property."'); next(); }]] }) },
        { text: (v) => `Visit listing 3: ${v.names[2]}`, go: (v) => ({ ...v.l[2], name: v.names[2] }), r: 6 },
        { choice: () => ({ title: 'Comfort Stay PG', body: '₹13,000. 2-sharing. Home food included (sambar every day, by law). The owner\'s cat comes with the room and has opinions.',
          options: [['Take it', 'Deposit ₹300', () => takePG(2)], ['Go back to the first one', '₹14,500, 4-sharing', () => takePG(0)]] }) },
      ],
      outro: 'Congrats on your new PG! My commission is one month\'s rent. Just kidding. (Not kidding.)',
    },
    silkboard: {
      title: 'Silk Board escape (practice run)', from: 'support', reward: { money: 800, respect: 3 }, needs: 'drive',
      intro: 'Gig Support: Silk Board isn\'t on your map yet, so here\'s a practice run. Get to Vidhana Soudha in 3 minutes. Every second counts. Good luck.',
      deadline: 180, fail: 'Three minutes, gone. You are now part of the jam. Peak Silk Board energy.',
      steps: [{ text: 'Reach Vidhana Soudha before the timer runs out', go: () => spot(/Vidhana/) || game.spots[0], r: 10 }],
      outro: 'You made it! At Silk Board that same trip takes 47 minutes and a small part of your soul.',
    },
    pitch: {
      title: 'Startup pitch at a café', from: 'founder', reward: null, needs: 'drive',
      intro: 'Hey! Arjun here, founder of a pre-seed, pre-revenue, pre-product startup. Can you drive me to a café on Church Street? Big pitch.',
      setup: (v) => { v.cafe = nearDoor((d) => /cafe|darshini/.test(d.theme), 60, 700); v.church = spot(/Church Street/) || game.spots[0]; },
      steps: [
        { text: (v) => `Pick up Arjun at ${v.cafe.name}`, go: (v) => ({ ...curb(v.cafe.x, v.cafe.z), name: v.cafe.name }), r: 7, on: 'drive', say: 'Arjun: "Okay, okay, okay. Deep breaths. Synergy. Moats. Okay."' },
        { text: 'Drive Arjun to Church Street', go: (v) => ({ ...v.church, name: 'Church Street' }), r: 9, on: 'drive', say: 'Arjun (rehearsing): "We are Uber, but for filter coffee. And there\'s AI."' },
        { choice: () => ({ title: 'The pitch', body: 'Arjun: "The investors loved it! I\'m paying you in ESOPs. 0.001% of a company that will be worth ten billion. Or I can do cash."',
          options: [['Take the ESOPs', 'Believe in the dream', () => { game.wallet.respect = Math.min(100, game.wallet.respect + 6); done('ESOPs: 0.001% of a filter-coffee AI. Your grandchildren will thank you. Maybe.'); }], ['Cash, please (₹1,500)', 'Rent is due', () => { game.wallet.earn(1500, 'Arjun: cash, not ESOPs'); done('Arjun: "Old-school. Respect." He pays by UPI. It goes through on the third try.'); }]] }) },
      ],
      outro: 'Arjun: We pivoted. We are now a podcast.',
    },
    kannada: {
      title: 'Get a Kannada sign right', from: 'kannada', reward: { money: 0, respect: 4 },
      intro: 'Namaskara! Kannada Meshtru here. A shopkeeper friend needs help with his new sign. Come, a small test. Swalpa adjust maadi.',
      setup: (v) => { v.shop = nearDoor(() => true, 30, 600); v.score = 0; },
      steps: [
        { text: (v) => `Go to ${v.shop.name}`, go: (v) => ({ x: v.shop.x, z: v.shop.z, name: v.shop.name }), r: 5 },
        quiz('The sign says "Coffee". Which is right?', [['ಕಾಫಿ', true], ['ಕಪಿ (monkey)', false], ['ಕೋಪ (anger)', false]]),
        quiz('Now "Open". Which one?', [['ತೆರೆದಿದೆ', true], ['ಮುಚ್ಚಿದೆ (closed)', false], ['ತೆರಿಗೆ (tax)', false]]),
        quiz('And "Thank you"?', [['ಧನ್ಯವಾದ', true], ['ದನ (cattle)', false], ['ಬನ್ನಿ (come)', false]]),
        { finish: (v) => { const k = v.score; game.wallet.earn(k * 250, 'Kannada sign help'); done(k === 3 ? 'Meshtru: "Sakkath! Full marks. You are now officially more Kannadiga than me."' : `Meshtru: "${k} out of 3. Practice maadi. Swalpa swalpa."`); } },
      ],
    },
    rain: {
      title: 'Beat the 4 PM rain', from: 'support', reward: { money: 900, respect: 2 },
      intro: 'Gig Support: priority order! Pick up from a darshini and deliver before the 4 PM rain. The sky is already looking at you.',
      setup: (v) => { v.k = nearDoor((d) => d.theme === 'darshini', 40, 600); v.home = homesNear(1, 300, 800)[0]; v.late = false; },
      deadline: 150, onLate: (v) => { v.late = true; actions.setWeather('rain'); ui.toast('Too late: it\'s pouring', 'Deliver anyway. Soggy dosa is still dosa.', 'rain'); },
      steps: [
        { text: (v) => `Collect the order at ${v.k.name}`, go: (v) => ({ x: v.k.x, z: v.k.z, name: v.k.name }), r: 7 },
        { text: 'Deliver it before the rain', go: (v) => ({ ...v.home, name: 'Customer' }), r: 7 },
      ],
      outro: 'Customer: "Dry and on time! Before the rain? You are a legend."',
    },
    medicine: {
      title: 'Amma\'s medicine run', from: 'amma', reward: { money: 500, respect: 2 },
      intro: 'Kanna, my BP tablets are over. Get them from the medical shop and bring them home. Don\'t forget like last time.',
      setup: (v) => { v.shop = nearDoor(() => true, 60, 700); v.home = (S.home && { ...S.home }) || homesNear(1, 250, 900)[0]; },
      steps: [
        { text: (v) => `Get Amma\'s tablets near ${v.shop.name}`, go: (v) => ({ x: v.shop.x, z: v.shop.z, name: 'Sri Ganesh Medicals' }), r: 6 },
        { choice: () => ({ title: 'Sri Ganesh Medicals', body: 'Pharmacist: "Which tablet? Small white one? Big white one? Amma\'s prescription is in Kannada, Hindi and doctor."',
          options: [['Call Amma and ask', 'The safe answer', () => { ui.dialogue('Amma: "The SMALL white one. Kanna, how many times!"'); next(); }], ['Guess: the big white one', 'Feeling lucky', () => { game.wallet.respect = Math.max(0, game.wallet.respect - 2); ui.dialogue('Pharmacist: "That is for horses, saar." You call Amma anyway.'); next(); }]] }) },
        { text: 'Take the tablets home to Amma', go: (v) => ({ ...v.home, name: 'Amma\'s house' }), r: 7 },
      ],
      outro: 'Amma: Good boy. Here, ₹500 for petrol. And eat something, you look thin.',
    },
  };
  const ORDER = ['pg', 'pitch', 'kannada', 'rain', 'medicine', 'silkboard'];
  function quiz(q, opts) {
    return { choice: (v) => ({ title: 'Kannada Meshtru', body: q, options: [...opts].sort(() => Math.random() - 0.5).map(([l, ok]) => [l, '', () => { if (ok) { v.score++; ui.dialogue('Meshtru: "Correct!"'); } else ui.dialogue('Meshtru: "Ayyo. No."'); next(); }]) }) };
  }
  function takePG(i) {
    const v = S.vars, p = v.l[i];
    game.wallet.fine(300, `PG deposit: ${v.names[i]}`);
    S.home = { x: p.x, z: p.z, name: v.names[i] };
    hooks.homeChanged && hooks.homeChanged(S.home);
    done(`You moved into ${v.names[i]}. It's on your map as Home: sleep there to rest and save.`);
  }

  // ---------- running a mission ----------
  function message(from, text) { if (phone && phone.message) phone.message(from, text); else ui.toast('New message', text, 'chat'); }
  function offer(id) {
    const M = MISSIONS[id]; if (!M || S.done[id] || S.active) return;
    if (phone && phone.message) phone.message(M.from, M.intro, [['Okay, let\'s go', () => start(id)], ['Not now', () => { S.offerT = 240; }]]);
    else start(id);
  }
  function start(id) {
    const M = MISSIONS[id]; if (!M || S.active) return;
    if (M.needs === 'drive' && state.mode !== 'drive') ui.toast(M.title, 'You\'ll need your vehicle for this one.', 'auto');
    S.active = id; S.step = 0; S.t = 0; S.vars = {}; S.lateDone = false;
    M.setup && M.setup(S.vars);
    ui.toast(`Mission: ${M.title}`, 'The objective is on your screen.', 'flag'); audio.chime && audio.chime();
    enter();
  }
  function enter() {
    const M = MISSIONS[S.active]; cur = M.steps[S.step];
    if (!cur) return done();
    target = null; marker.hide();
    if (cur.finish) return cur.finish(S.vars);
    if (cur.go) { target = cur.go(S.vars); marker.show(target.x, target.z); navTo({ ...target, keep: true }); }
    if (cur.say) ui.dialogue(cur.say);
    if (cur.choice) { const c = cur.choice(S.vars); setTimeout(() => ui.menu({ title: c.title, kn: '', foot: M.title, items: c.options.map(([name, desc, fn]) => ({ name, price: null, desc: `${c.body ? '' : ''}${desc}`, onPick: fn })) }), 300); ui.dialogue(c.body); }
    objective();
  }
  function next() { S.step++; enter(); }
  function done(line) {
    const id = S.active, M = MISSIONS[id]; if (!M) return;
    if (M.reward) { if (M.reward.money) game.wallet.earn(M.reward.money * (S.vars.late ? 0.5 : 1), `Mission: ${M.title}`); if (M.reward.respect) game.wallet.respect = Math.min(100, game.wallet.respect + M.reward.respect); }
    S.done[id] = true; S.active = null; cur = null; target = null; marker.hide(); clearNav();
    ui.toast('Mission complete', `${M.title}${M.reward && M.reward.money ? ` · ₹${Math.round(M.reward.money * (S.vars.late ? 0.5 : 1))}` : ''}`, 'check'); audio.cash && audio.cash();
    if (line) ui.dialogue(line);
    if (M.outro) setTimeout(() => message(M.from, M.outro), 2500);
    S.offerT = 150; objective();
  }
  function fail(why) {
    const M = MISSIONS[S.active]; S.active = null; cur = null; target = null; marker.hide(); clearNav();
    ui.toast('Mission failed', why || M.fail || 'Try again later.', 'warning'); S.offerT = 90; objective();
  }
  function cancel() { if (S.active) fail('You dropped the mission. It will come back later.'); }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function objective() {
    const el = document.getElementById('objective'); if (!el) return;
    if (!S.active || !cur) { el.classList.remove('on'); return; }
    const M = MISSIONS[S.active], txt = typeof cur.text === 'function' ? cur.text(S.vars) : cur.text || (cur.choice ? 'Make your choice' : '');
    const left = M.deadline ? M.deadline - S.t : null;
    el.innerHTML = `<b>${M.title}</b><span>${txt}${left != null && !S.vars.late ? ` · <em>${fmt(Math.max(0, left))}</em>` : ''}</span>`; el.classList.add('on');
  }

  let objT = 0;
  function update(dt, ctx) {
    marker.update(ctx.t, here());
    // offer the next story mission now and then, when nothing is going on
    if (!S.active && state.started && (S.offerT -= dt) <= 0) {
      S.offerT = 200;
      const id = ORDER.find((k) => !S.done[k] && (!MISSIONS[k].needs || MISSIONS[k].needs !== 'drive' || state.mode === 'drive'));
      if (id) offer(id);
    }
    if (!S.active || !cur) return;
    const M = MISSIONS[S.active];
    S.t += dt;
    if (M.deadline && S.t > M.deadline && !S.lateDone) { S.lateDone = true; if (M.onLate) M.onLate(S.vars); else return fail(); }
    if (cur.go && target) {
      const p = cur.on === 'drive' ? (state.mode === 'drive' ? player.pos : null) : cur.on === 'foot' ? (state.mode === 'walk' ? W.pos : null) : state.mode === 'interior' ? null : here();
      if (p && dist(p, target) < (cur.r || 6)) next();
    }
    if ((objT -= dt) <= 0) { objT = 0.5; objective(); }
  }

  // sleep at your PG: rest, full energy, and the game saves
  function homeAction(w) {
    if (!S.home) return null; const d = dist(w, S.home);
    return d < 4 ? { d, label: 'sleep at your PG (8 hours)', run: () => hooks.sleep && hooks.sleep() } : null;
  }

  return {
    update, start, cancel, offer, homeAction, missions: MISSIONS, order: ORDER,
    set phone(p) { phone = p; },
    get state() { return S; }, get home() { return S.home; },
    list: () => ORDER.map((id) => ({ id, title: MISSIONS[id].title, from: MISSIONS[id].from, status: S.active === id ? 'active' : S.done[id] ? 'done' : 'new' })),
    markers: () => [...(target ? [{ x: target.x, z: target.z, c: '#b388ff', big: true }] : []), ...(S.home ? [{ x: S.home.x, z: S.home.z, c: '#ffffff', icon: 'H' }] : [])],
    save: () => ({ done: S.done, home: S.home }),
    load(s) { if (!s) return; S.done = s.done || {}; S.home = s.home || null; if (S.home) hooks.homeChanged && hooks.homeChanged(S.home); },
  };
}
