import * as THREE from 'three';
import { damp } from './util.js';

export const WEATHERS = {
  clear: { label: 'Clear', icon: 'sun', cloud: 0.18, rain: 0 },
  cloudy: { label: 'Cloudy', icon: 'cloud', cloud: 0.7, rain: 0 },
  rain: { label: 'Rain', icon: 'rain', cloud: 0.92, rain: 0.6 },
  storm: { label: 'Storm', icon: 'storm', cloud: 1, rain: 1 },
};
export const WEATHER_ORDER = ['clear', 'cloudy', 'rain', 'storm'];

const rainVert = /* glsl */`
uniform float time; uniform vec3 camPos; uniform vec3 boxSize; uniform vec2 wind; uniform float len;
attribute vec3 seed; attribute float tip;
void main(){
  float speed = 16. + seed.y * 6.;
  vec3 p = seed * boxSize;
  float y = mod(p.y - time * speed, boxSize.y);
  float px = p.x + wind.x * time, pz = p.z + wind.y * time;
  vec3 w = vec3(camPos.x + mod(px - camPos.x, boxSize.x) - boxSize.x * .5,
                camPos.y - boxSize.y * .35 + y,
                camPos.z + mod(pz - camPos.z, boxSize.z) - boxSize.z * .5);
  vec3 dir = normalize(vec3(wind.x, -speed, wind.y));
  w += dir * len * tip;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
}`;
const rainFrag = /* glsl */`
uniform float opacity; uniform vec3 color;
void main(){ gl_FragColor = vec4(color, opacity); }`;

export function createWeather(scene) {
  const N = 9000;
  const seed = new Float32Array(N * 6), tip = new Float32Array(N * 2), pos = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) {
    const s = [Math.random(), Math.random(), Math.random()];
    seed.set(s, i * 6); seed.set(s, i * 6 + 3); tip[i * 2] = 0; tip[i * 2 + 1] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
  g.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
  const uniforms = {
    time: { value: 0 }, camPos: { value: new THREE.Vector3() }, boxSize: { value: new THREE.Vector3(60, 30, 60) },
    wind: { value: new THREE.Vector2(2, 1) }, len: { value: 0.9 }, opacity: { value: 0 }, color: { value: new THREE.Color('#aab8c8') },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: rainVert, fragmentShader: rainFrag, transparent: true, depthWrite: false });
  const rain = new THREE.LineSegments(g, mat);
  rain.frustumCulled = false; rain.visible = false;
  scene.add(rain);

  const state = {
    kind: 'clear', cloud: 0.18, rain: 0, wet: 0, flash: 0,
    nextFlash: 8, live: null, temp: null,
  };

  function set(kind) { state.kind = kind; }

  function update(dt, t, camPos, atm, audio) {
    const target = WEATHERS[state.kind];
    state.cloud = damp(state.cloud, target.cloud, 0.5, dt);
    state.rain = damp(state.rain, target.rain, 0.6, dt);
    // roads soak quickly, dry slowly
    const wetTarget = state.rain > 0.05 ? 1 : 0;
    state.wet += (wetTarget - state.wet) * Math.min(1, dt * (wetTarget ? 0.25 : 0.03));
    uniforms.time.value = t; uniforms.camPos.value.copy(camPos);
    uniforms.opacity.value = state.rain * (0.28 + atm.day * 0.12);
    uniforms.color.value.setRGB(0.55 + atm.day * 0.2, 0.6 + atm.day * 0.2, 0.68 + atm.day * 0.2);
    uniforms.wind.value.set(2 + state.rain * 3, 1 + state.rain);
    rain.visible = state.rain > 0.02;
    rain.geometry.setDrawRange(0, Math.floor(N * 2 * Math.min(1, state.rain * 1.2) * (state.density ?? 1)));
    // lightning in storms
    state.flash = Math.max(0, state.flash - dt * 4);
    if (state.kind === 'storm' && state.rain > 0.6) {
      state.nextFlash -= dt;
      if (state.nextFlash <= 0) {
        state.flash = 1; state.nextFlash = 6 + Math.random() * 14;
        setTimeout(() => { state.flash = Math.max(state.flash, 0.6); }, 120);
        audio && audio.thunder(0.8 + Math.random() * 1.8);
      }
    }
  }

  // Real Bengaluru weather from Open-Meteo (free, no key)
  async function fetchLive() {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=12.9716&longitude=77.5946&current=temperature_2m,weather_code,is_day&timezone=Asia%2FKolkata';
    const res = await fetch(url);
    if (!res.ok) throw new Error('weather ' + res.status);
    const j = await res.json();
    const code = j.current.weather_code;
    let kind = 'clear';
    if (code >= 95) kind = 'storm';
    else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) kind = 'rain';
    else if (code >= 2) kind = 'cloudy';
    state.temp = Math.round(j.current.temperature_2m);
    state.live = { code, kind };
    return kind;
  }

  return { state, set, update, fetchLive };
}

export function istHours() {
  const now = new Date();
  const mins = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440;
  return mins / 60 + now.getUTCSeconds() / 3600;
}
