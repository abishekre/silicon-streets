import * as THREE from 'three';

// Where a job wants you: a wide glowing ring on the road, a beam tall enough to clear every rooftop and never lost in fog,
// and a distance label that shows through buildings. You can always find it, whatever route (or one-way) you take.
export const RING_R = 5;
export function createJobMarker(scene, color, label) {
  const grp = new THREE.Group(); grp.visible = false;
  const glow = { color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false };
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 160, 24, 1, true).translate(0, 80, 0), new THREE.MeshBasicMaterial({ ...glow, opacity: 0.4, side: THREE.DoubleSide }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(RING_R, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ ...glow, opacity: 0.2 }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(RING_R - 0.7, RING_R, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
  disc.position.y = 0.14; ring.position.y = 0.16;
  // label: fixed size on screen, drawn on top of everything
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const cx = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false }));
  tag.scale.set(0.2, 0.05, 1); tag.position.y = 7; tag.renderOrder = 20;
  grp.add(beam, disc, ring, tag); scene.add(grp);
  let shown = -1;
  function draw(d) {
    const txt = d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`;
    cx.clearRect(0, 0, 512, 128);
    cx.fillStyle = 'rgba(12,14,18,0.78)'; cx.beginPath(); cx.roundRect(8, 16, 496, 96, 48); cx.fill();
    cx.fillStyle = color; cx.beginPath(); cx.arc(64, 64, 18, 0, 7); cx.fill();
    cx.font = '700 40px "Space Grotesk", sans-serif'; cx.textBaseline = 'middle';
    cx.fillStyle = '#fff'; cx.fillText(label, 100, 64);
    cx.fillStyle = '#c9ced6'; cx.textAlign = 'right'; cx.fillText(txt, 476, 66); cx.textAlign = 'left';
    tex.needsUpdate = true;
  }
  return {
    group: grp,
    show(x, z) { grp.position.set(x, 0, z); grp.visible = true; shown = -1; },
    hide() { grp.visible = false; },
    get visible() { return grp.visible; },
    update(t, from) {
      if (!grp.visible) return;
      const s = Math.sin(t * 3);
      beam.material.opacity = 0.34 + s * 0.08; disc.material.opacity = 0.16 + s * 0.06; ring.scale.setScalar(1 + s * 0.04);
      const d = Math.hypot(from.x - grp.position.x, from.z - grp.position.z);
      // the label rides higher when you're far, so it sits above the rooftops in between
      tag.position.y = 7 + Math.min(40, d * 0.06);
      tag.visible = d > 12;
      const k = Math.round(d / 10); if (k !== shown) { shown = k; draw(d); }
    },
  };
}
