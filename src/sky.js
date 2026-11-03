import * as THREE from 'three';
import { smoothstep, lerp, clamp } from './util.js';

const vert = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const frag = /* glsl */`
uniform vec3 topColor, horizonColor, sunDir, sunColor, moonDir, cloudColor;
uniform float cloudiness, time, stars, sunVis, night, flash;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x), mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizonColor, topColor, pow(clamp(h,0.,1.), 0.5));
  if (h < 0.) col = mix(horizonColor, horizonColor*0.45, clamp(-h*5.,0.,1.));
  float sd = max(dot(d, sunDir), 0.);
  col += sunColor * (pow(sd, 5.)*0.22 + pow(sd, 48.)*0.45) * sunVis;
  col += sunColor * smoothstep(0.9992, 0.9996, sd) * 6. * sunVis * (1. - cloudiness*0.85);
  float md = max(dot(d, moonDir), 0.);
  col += vec3(0.9,0.93,1.0) * smoothstep(0.99955, 0.9998, md) * 1.6 * night * (1. - cloudiness*0.9);
  col += vec3(0.25,0.3,0.45) * pow(md, 30.) * 0.25 * night;
  if (stars > 0.01 && h > 0.02) {
    vec3 p = d * 260.; vec3 c = floor(p); float r = hash(c);
    if (r > 0.986) {
      // separate hashes so every star gets its own size, brightness, colour and twinkle rhythm
      float ph = hash(c + 17.3) * 6.2832, sp = 0.6 + hash(c + 41.7) * 2.4, sz = 0.25 + hash(c + 5.1) * 0.25, br = 0.35 + hash(c + 9.9) * 0.9;
      float s = smoothstep(sz, 0., length(fract(p)-0.5));
      float tw = 0.65 + 0.35 * sin(time * sp + ph) * sin(time * sp * 0.37 + ph * 1.7);
      vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), hash(c + 3.3));
      col += tint * s * br * stars * tw * smoothstep(0.02, 0.25, h);
    }
  }
  if (h > -0.02) {
    vec2 uv = d.xz / (max(h,0.0) + 0.14) * 0.55 + vec2(time*0.006, time*0.0025);
    float n = fbm(uv * 1.6);
    float th = mix(0.78, 0.28, cloudiness);
    float c = smoothstep(th, th + 0.22, n) * smoothstep(-0.02, 0.18, h);
    float shade = 0.72 + 0.28 * smoothstep(th, th + 0.5, n * 1.08 - 0.04);
    vec3 cc = cloudColor * shade + sunColor * pow(sd, 6.) * 0.35 * sunVis;
    col = mix(col, cc, c * 0.96);
  }
  col += vec3(0.75, 0.8, 1.0) * flash;
  gl_FragColor = vec4(col, 1.0);
}`;

function C(hex) { return new THREE.Color(hex); }
const P = {
  dayTop: C('#3f7fd6'), dayHor: C('#b6d3ea'),
  duskTop: C('#3b4f8a'), duskHor: C('#ff9a5c'),
  nightTop: C('#060a18'), nightHor: C('#2e2630'),
  overDay: C('#9aa4ad'), overDayHor: C('#b9bec2'), overNight: C('#0b0d12'), overNightHor: C('#1e1b1c'),
  sunNoon: C('#fff4e2'), sunLow: C('#ff8a3d'),
  cloudDay: C('#f4f4f6'), cloudDusk: C('#ffb08a'), cloudNight: C('#1d1b20'), cloudRain: C('#6d747c'),
  moon: C('#a8bcff'), cityGlow: C('#463a3a'),
};

export function createSky() {
  const uniforms = {
    topColor: { value: new THREE.Color() }, horizonColor: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color() }, cloudColor: { value: new THREE.Color() },
    cloudiness: { value: 0.3 }, time: { value: 0 }, stars: { value: 0 }, sunVis: { value: 1 }, night: { value: 0 }, flash: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  mesh.frustumCulled = false; mesh.renderOrder = 100; // last, depth-tested: only the pixels where sky actually shows get shaded
  const envMesh = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat);
  const envScene = new THREE.Scene(); envScene.add(envMesh);
  return { mesh, uniforms, envScene };
}

// Atmosphere state from hour-of-day + weather
export function atmosphere(hours, cloud, rain) {
  const a = ((hours - 6.2) / 12.4) * Math.PI;
  const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.35).normalize();
  const moonDir = new THREE.Vector3(-Math.cos(a) * 0.6, Math.max(0.25, -Math.sin(a)), -0.4).normalize();
  const el = sunDir.y;
  // wide, eased curves so sunset and sunrise take a good while instead of snapping (about 1.5 game-hours each)
  const day = smoothstep(-0.12, 0.38, el);
  const dusk = Math.exp(-((el - 0.03) * (el - 0.03)) / (0.24 * 0.24));
  const night = 1 - smoothstep(-0.3, 0.05, el);
  const lights = smoothstep(0.16, -0.12, el) * 0.85 + 0.15 * smoothstep(0.5, 0.9, cloud * rain + cloud * 0.3);

  const top = P.nightTop.clone().lerp(P.dayTop, day).lerp(P.duskTop, dusk * 0.45);
  const hor = P.nightHor.clone().lerp(P.dayHor, day).lerp(P.duskHor, dusk * 0.62);
  // sodium-orange glow of the city on the night horizon, stronger under clouds
  hor.lerp(P.cityGlow, night * (0.18 + cloud * 0.3));
  const oc = clamp(cloud * 0.9, 0, 1);
  top.lerp(P.overNight.clone().lerp(P.overDay, day), oc * 0.85);
  hor.lerp(P.overNightHor.clone().lerp(P.overDayHor, day), oc * 0.8);
  top.multiplyScalar(1 - rain * 0.35); hor.multiplyScalar(1 - rain * 0.3);

  const sunColor = P.sunLow.clone().lerp(P.sunNoon, smoothstep(-0.05, 0.5, el));
  const cloudCol = P.cloudNight.clone().lerp(P.cloudDay, day).lerp(P.cloudDusk, dusk * 0.6).lerp(P.cloudRain.clone().multiplyScalar(lerp(0.2, 1, day)), rain);

  const sunI = smoothstep(-0.07, 0.22, el) * lerp(3.0, 2.0, dusk) * (1 - cloud * 0.72);
  const moonI = smoothstep(-0.07, -0.3, el) * 0.85 * (1 - cloud * 0.5);
  const useSun = el > -0.06;
  const hemiI = lerp(0.85, 1.0, day) * (1 - rain * 0.12);
  const hemiSky = top.clone().lerp(new THREE.Color('#fff6ea'), 0.55);
  hemiSky.lerp(new THREE.Color('#6f7fb0'), night * 0.7);
  const fogFar = lerp(lerp(300, 460, day), 170, rain) * lerp(1, 0.75, cloud * 0.5);
  return {
    sunDir, moonDir, el, day, dusk, night, lights: clamp(lights, 0, 1),
    top, hor, sunColor, cloudCol,
    lightDir: useSun ? sunDir : moonDir, lightColor: useSun ? sunColor : P.moon, lightI: useSun ? sunI : moonI,
    hemiSky, hemiGround: new THREE.Color('#3b342c').multiplyScalar(lerp(0.35, 1, day)), hemiI,
    envI: lerp(0.6, 0.8, day),
    exposure: lerp(1.25, 1.0, day),
    fogColor: hor.clone(), fogNear: fogFar * 0.15, fogFar,
    stars: night * (1 - cloud),
    sunVis: smoothstep(-0.1, 0.02, el),
    bloom: lerp(0.22, 0.75, night),
  };
}
