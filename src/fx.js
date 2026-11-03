import * as THREE from 'three';

// Small particle bursts for impacts: sparks, debris, leaves, glass and smoke.
export function createFx(scene) {
  const N = 400;
  const make = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, N); m.count = 0; m.frustumCulled = false; scene.add(m); return m; };
  const solid = make(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshStandardMaterial({ roughness: 0.8 }));
  const bright = make(new THREE.BoxGeometry(0.05, 0.05, 0.22), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 0.8) }));
  const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const smoke = make(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.55 }));
  const pools = { solid: [], bright: [], smoke: [] };
  const COLORS = { concrete: ['#9e9a92', '#bdb7ad', '#7d7870'], glass: ['#cfe8ff', '#a9d6ff', '#ffffff'], leaves: ['#3f7a2e', '#5b9a3c', '#d9471c'], wood: ['#6d4c41', '#8d6e63'], drum: ['#f06b1d', '#ffffff'], metal: ['#8d8d8d', '#cfcfcf'] };
  const c = new THREE.Color();
  function burst(kind, x, y, z, n = 12, { dx = 0, dz = 0, spread = 3, up = 3 } = {}) {
    for (let i = 0; i < n; i++) {
      const p = { x, y, z, vx: dx * 0.4 + (Math.random() - 0.5) * spread, vy: Math.random() * up + (kind === 'smoke' ? 0.6 : 1), vz: dz * 0.4 + (Math.random() - 0.5) * spread, life: kind === 'smoke' ? 1.6 : kind === 'sparks' ? 0.45 : 1.4, t: 0, rx: Math.random() * 6, col: null, s: kind === 'smoke' ? 0.6 + Math.random() * 0.5 : 1 };
      if (kind === 'sparks') pools.bright.push(p);
      else if (kind === 'smoke' || kind === 'blacksmoke') { p.col = kind === 'blacksmoke' ? '#2a2a2a' : '#9a9a9a'; pools.smoke.push(p); }
      else { const list = COLORS[kind] || COLORS.concrete; p.col = list[Math.floor(Math.random() * list.length)]; pools.solid.push(p); }
    }
    for (const k of Object.keys(pools)) if (pools[k].length > N) pools[k].splice(0, pools[k].length - N);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sc = new THREE.Vector3();
  function update(dt, camera) {
    for (const [k, mesh] of [['solid', solid], ['bright', bright], ['smoke', smoke]]) {
      const list = pools[k]; let n = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]; p.t += dt;
        if (p.t > p.life) { list.splice(i, 1); continue; }
        if (k === 'smoke') { p.vy *= 0.98; p.s += dt * 1.2; } else p.vy -= 12 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.05 && k !== 'smoke') { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
        if (k === 'smoke') q.copy(camera.quaternion); else q.setFromEuler(e.set(p.rx + p.t * 6, p.t * 4, 0));
        const s = k === 'smoke' ? p.s * (1 - p.t / p.life * 0.3) : 1;
        m4.compose(pv.set(p.x, p.y, p.z), q, sc.set(s, s, s)); mesh.setMatrixAt(n, m4);
        if (p.col) mesh.setColorAt(n, c.set(p.col));
        n++;
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  return { burst, update };
}
