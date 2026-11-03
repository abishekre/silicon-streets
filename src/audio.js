// All sounds are synthesized with Web Audio — no files to download.
export function createAudio() {
  let ctx = null, master, engine, engineGain, engineFilter, lfo, lfoGain, rainGain, rainFilter, noiseBuf, crowdGain, radioGain;
  let muted = false;
  // mixer: every sound goes to a bus (master · radio · traffic · ambience · horn), each with its own volume from Settings
  const vol = { master: 0.7, radio: 1, traffic: 1, ambience: 1, horn: 1 };
  try { Object.assign(vol, JSON.parse(localStorage.getItem('blr.audio') || '{}')); } catch (e) { /* storage blocked */ }
  const bus = {};
  let out = null;
  const via = (b, fn) => { const o = out; out = bus[b]; try { fn(); } finally { out = o; } };
  const listener = { x: 0, z: 0, yaw: 0 };

  function start() {
    if (ctx) { ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : vol.master; master.connect(ctx.destination);
    for (const b of ['traffic', 'ambience', 'horn']) { bus[b] = ctx.createGain(); bus[b].gain.value = vol[b]; bus[b].connect(master); }
    out = master;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // engine
    engine = ctx.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 40;
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 400;
    engineGain = ctx.createGain(); engineGain.gain.value = 0.0;
    lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 12;
    lfoGain = ctx.createGain(); lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain); lfoGain.connect(engineGain.gain);
    engine.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master);
    engine.start(); lfo.start();
    // rain bed
    const rn = ctx.createBufferSource(); rn.buffer = noiseBuf; rn.loop = true;
    rainFilter = ctx.createBiquadFilter(); rainFilter.type = 'bandpass'; rainFilter.frequency.value = 1400; rainFilter.Q.value = 0.4;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rn.connect(rainFilter); rainFilter.connect(rainGain); rainGain.connect(bus.ambience); rn.start();
    // crowd murmur bed (busy streets, match nights)
    const cn = ctx.createBufferSource(); cn.buffer = noiseBuf; cn.loop = true; cn.playbackRate.value = 0.7;
    const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 520; cf.Q.value = 1.4;
    crowdGain = ctx.createGain(); crowdGain.gain.value = 0;
    cn.connect(cf); cf.connect(crowdGain); crowdGain.connect(bus.ambience); cn.start();
    radioGain = bus.radio = ctx.createGain(); radioGain.gain.value = vol.radio; radioGain.connect(master);
  }

  function tone(freqs, dur, type = 'square', vol = 0.12, pan = 0, delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015); g.gain.setValueAtTime(vol, t + dur - 0.04); g.gain.linearRampToValueAtTime(0, t + dur);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    if (p) { p.pan.value = pan; g.connect(p); p.connect(out); } else g.connect(out);
    f.connect(g);
    for (const fr of freqs) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.connect(f); o.start(t); o.stop(t + dur + 0.02); }
  }

  const HORNS = {
    auto: (v, pan, d) => { tone([720, 760], 0.12, 'square', v, pan, d); tone([720, 760], 0.12, 'square', v, pan, d + 0.18); },
    scooter: (v, pan, d) => { tone([880], 0.1, 'square', v * 0.8, pan, d); tone([880], 0.1, 'square', v * 0.8, pan, d + 0.15); },
    car: (v, pan, d) => tone([415, 520], 0.38, 'sawtooth', v * 0.7, pan, d),
    bus: (v, pan, d) => tone([233, 294], 0.7, 'sawtooth', v * 0.8, pan, d),
  };

  function horn(type) { via('horn', () => HORNS[type]?.(0.13, 0, 0)); }
  function hornAt(type, x, z, vol = 1) {
    if (!ctx || muted) return;
    const dx = x - listener.x, dz = z - listener.z, d = Math.hypot(dx, dz);
    const v = 0.09 * vol / (1 + d / 12);
    if (v < 0.004) return;
    const rx = -Math.cos(listener.yaw), rz = Math.sin(listener.yaw);
    const pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / (d + 1)));
    via('traffic', () => HORNS[type]?.(v, pan, Math.random() * 0.05));
  }

  function noiseBurst(dur, freq, vol, delay = 0, type = 'lowpass') {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.05);
  }
  function thunder(delay) { via('ambience', () => { noiseBurst(3.5, 160, 0.7, delay); noiseBurst(1.2, 400, 0.25, delay + 0.1); }); }
  // dhol and thamate for processions: a deep thump and a slap, v = loudness by distance
  function drum(v = 1) { via('ambience', () => { tone([70], 0.16, 'sine', 0.5 * v); noiseBurst(0.06, 1800, 0.18 * v, 0.12, 'bandpass'); }); }
  function bump(v = 1) { tone([55], 0.18, 'sine', 0.35 * v); noiseBurst(0.2, 500, 0.25 * v); }
  function crash(v = 1) { noiseBurst(0.45, 900, 0.5 * v); tone([70], 0.3, 'sine', 0.3 * v); }
  function chime() { tone([880], 0.14, 'sine', 0.12); tone([1320], 0.22, 'sine', 0.12, 0, 0.12); }
  function cash() { tone([1046], 0.08, 'triangle', 0.12); tone([1568], 0.25, 'triangle', 0.12, 0, 0.09); }
  function moo() { via('ambience', mooNow); }
  function mooNow() { if (!ctx || muted) return; const t = ctx.currentTime; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(95, t + 0.9); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 1); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 1.05); }

  function update(type, speed, throttle, rain, lx, lz, yaw) {
    listener.x = lx; listener.z = lz; listener.yaw = yaw;
    if (!ctx) return;
    const now = ctx.currentTime;
    const s = Math.abs(speed);
    const base = type === 'auto' ? 38 : type === 'scooter' ? 70 : 55;
    engine.frequency.setTargetAtTime(base + s * (type === 'car' ? 4 : 5.5) + throttle * 8, now, 0.08);
    lfo.frequency.setTargetAtTime(type === 'auto' ? 9 + s * 1.4 : 30 + s * 2, now, 0.1);
    engineFilter.frequency.setTargetAtTime(300 + s * 40 + throttle * 300, now, 0.1);
    const ev = muted || type === 'none' ? 0 : (type === 'auto' ? 0.05 : 0.035) + Math.abs(throttle) * 0.03;
    engineGain.gain.setTargetAtTime(ev, now, 0.1);
    lfoGain.gain.setTargetAtTime(muted ? 0 : (type === 'auto' ? ev * 0.8 : ev * 0.3), now, 0.1);
    rainGain.gain.setTargetAtTime(muted ? 0 : rain * 0.22, now, 0.5);
  }

  // a pitch glide: koels, dog barks, temple bells
  function glide(f0, f1, dur, vol, type = 'sine', delay = 0, pan = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.connect(g); if (pn) { pn.pan.value = pan; g.connect(pn); pn.connect(out); } else g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }
  // the Asian koel: "ku-OO, ku-OO", rising
  function koel(pan = 0) { via('ambience', () => { for (let i = 0; i < 3; i++) { glide(650 + i * 60, 900 + i * 80, 0.35, 0.05, 'sine', i * 0.55, pan); } }); }
  function bark(pan = 0) { via('ambience', () => { glide(420, 250, 0.12, 0.12, 'sawtooth', 0, pan); glide(450, 260, 0.12, 0.1, 'sawtooth', 0.22, pan); }); }
  function bell() { via('ambience', () => { for (const [f, v] of [[660, 0.06], [1320, 0.03], [1980, 0.015]]) glide(f, f * 0.995, 2.2, v, 'sine'); }); }
  function cheer() { via('ambience', () => { noiseBurst(1.6, 1400, 0.2, 0, 'bandpass'); noiseBurst(1.2, 900, 0.15, 0.3, 'bandpass'); }); }
  function firework(delay = 0) { via('ambience', () => { noiseBurst(0.08, 3000, 0.25, delay, 'highpass'); noiseBurst(1.4, 300, 0.4, delay + 0.05); }); }
  function alarm() { for (let i = 0; i < 6; i++) { tone([1200], 0.18, 'square', 0.05, 0, i * 0.4); tone([900], 0.18, 'square', 0.05, 0, i * 0.4 + 0.2); } }
  function setCrowd(v) { if (ctx) crowdGain.gain.setTargetAtTime(muted ? 0 : v * 0.07, ctx.currentTime, 0.8); }

  // ---------- FM radio: tiny procedural tracks ----------
  // Namma 93.FM: a raga-ish loop (Mayamalavagowla scale) over a tabla-like beat; Lo-fi Koramangala: soft chords
  const RAGA = [0, 1, 4, 5, 7, 8, 11, 12];
  let station = 0, beat = 0, nextBeat = 0;
  const STATIONS = ['Off', 'Namma 93.FM', 'Lo-fi Koramangala 101'];
  function setStation(i) { station = i % STATIONS.length; nextBeat = 0; return STATIONS[station]; }
  function radioTick(on) { via('radio', () => radioNow(on)); }
  function radioNow(on) {
    if (!ctx || muted || !on || station === 0) return;
    const now = ctx.currentTime;
    if (nextBeat < now) nextBeat = now + 0.05;
    while (nextBeat < now + 0.2) {
      const t = nextBeat - now;
      if (station === 1) {
        const step = beat % 16, base = 220;
        if (step % 4 === 0) { noiseBurst(0.12, 180, 0.22, t); }                 // "dha" bass stroke
        if (step % 4 === 2) noiseBurst(0.05, 2600, 0.08, t, 'bandpass');         // "na" rim
        if (step % 2 === 0) { const n = RAGA[(beat * 7 + Math.floor(beat / 16) * 3) % RAGA.length]; tone([base * Math.pow(2, n / 12)], 0.22, 'triangle', 0.045, 0, t); }
        if (step === 0) tone([110], 1.8, 'sawtooth', 0.015, 0, t);                // drone
        nextBeat += 0.16;
      } else {
        const bar = Math.floor(beat / 8) % 4, chords = [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]];
        if (beat % 8 === 0) tone(chords[bar].map((n) => 196 * Math.pow(2, n / 12)), 1.9, 'sine', 0.02, 0, t);
        if (beat % 2 === 0) noiseBurst(0.06, beat % 4 === 0 ? 150 : 3200, beat % 4 === 0 ? 0.18 : 0.04, t, beat % 4 === 0 ? 'lowpass' : 'highpass');
        nextBeat += 0.27;
      }
      beat++;
    }
  }

  function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : vol.master; return muted; }
  function setVolume(b, v) {
    vol[b] = v; try { localStorage.setItem('blr.audio', JSON.stringify(vol)); } catch (e) { /* private mode */ }
    const g = b === 'master' ? master : bus[b]; if (g && !(b === 'master' && muted)) g.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }

  return { setVolume, get volume() { return { ...vol }; }, alarm, koel, bark, bell, cheer, firework, drum, setCrowd, setStation, radioTick, get station() { return STATIONS[station]; }, start, horn, hornAt, thunder, bump, crash, chime, cash, moo, update, toggleMute, get muted() { return muted; } };
}
