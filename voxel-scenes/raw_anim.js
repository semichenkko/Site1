import * as THREE from 'three';

// Deliberately crude "first attempt": big blocks, flat light, no shadows/fog/post.
const Wd = window.W || 1080, Hd = window.H || 810, FPS = 30;
const P = await (await fetch('/path.json')).json();
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(Wd, Hd); renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#87ceeb');
scene.add(new THREE.AmbientLight('#ffffff', 1.2));
const dl = new THREE.DirectionalLight('#ffffff', 1.6); dl.position.set(-50, 100, 40); scene.add(dl);
const camera = new THREE.PerspectiveCamera(32, Wd / Hd, 1, 2000);

const geo = new THREE.BoxGeometry(2, 2, 2);
const mats = {};
const mat = (c) => (mats[c] ||= new THREE.MeshLambertMaterial({ color: c }));
const cube = (x, y, z, c, s = 1) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); m.scale.setScalar(s); scene.add(m); return m; };

// flat disc island + pyramid hill
const hill = (x, z) => Math.max(0, Math.round((24 - Math.hypot(x, z * 1.4) * 0.9) / 2) * 2);
for (let x = -50; x <= 50; x += 2) for (let z = -50; z <= 50; z += 2) {
  if (Math.hypot(x, z) > 50) continue;
  const h = hill(x, z);
  cube(x, h, z, '#3cb043');
  if (Math.hypot(x, z) > 46) for (let y = h - 2; y >= -6; y -= 2) cube(x, y, z, '#8b5a2b');
}
// wall: straight row of grey boxes
for (let x = -44; x <= 44; x += 2) cube(x, hill(x, 0) + 2, 0, '#888888');
cube(0, hill(0, 0) + 4, 0, '#777777', 3); // "tower"
// trees
const rnd = (() => { let s = 7; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
for (let i = 0; i < 18; i++) {
  const x = Math.round(((rnd() - 0.5) * 80) / 2) * 2, z = Math.round(((rnd() - 0.5) * 80) / 2) * 2;
  if (Math.hypot(x, z) > 44 || Math.abs(z) < 6) continue;
  const h = hill(x, z);
  cube(x, h + 2, z, '#8b5a2b'); cube(x, h + 4, z, '#228b22');
}

// dragon = chain of red cubes on the same flight path
const curve = new THREE.CatmullRomCurve3(P.ctrl.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.5);
curve.arcLengthDivisions = 4000;
const N = 14, seg = [];
for (let k = 0; k < N; k++) seg.push(cube(0, 0, 0, k === 0 ? '#ffcc00' : '#dd0000', k === 0 ? 1.4 : 1.2));
const pearl = cube(0, 0, 0, '#ffffff', 0.8);
const fire = [0, 1, 2].map(() => cube(0, 0, 0, '#ff8800', 0.9));
const breathing = (t) => (t > 0.15 && t < 1.5) || (t > 4.0 && t < 5.2) || (t > 7.4 && t < 8.6) || (t > 11.3 && t < 12.6);
const at = (s) => curve.getPointAt(Math.min(1, Math.max(0, s / P.total)));

camera.position.set(Math.cos(0.58) * 142, 66, Math.sin(0.58) * 142);
camera.lookAt(-4, 19, 0);

window.renderFrame = (i) => {
  const t = i / FPS, sHead = P.s0 + P.v * t;
  seg.forEach((m, k) => m.position.copy(at(sHead - k * 5)));
  pearl.position.copy(at(sHead + 16));
  const dir = at(sHead + 1).sub(at(sHead)).normalize();
  fire.forEach((m, k) => { m.visible = breathing(t); m.position.copy(seg[0].position).addScaledVector(dir, 4 + k * 3); });
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
};
window.__done = scene.children.length;
