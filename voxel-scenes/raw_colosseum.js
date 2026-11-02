import * as THREE from 'three';

// Deliberately crude "first attempt" Colosseum: big blocks, flat light, no shadows/fog/post.
const Wd = window.W || 1440, Hd = window.H || 1080, FPS = 30;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(Wd, Hd); renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#87ceeb');
scene.add(new THREE.AmbientLight('#ffffff', 1.2));
const dl = new THREE.DirectionalLight('#ffffff', 1.5); dl.position.set(50, 100, 60); scene.add(dl);
const camera = new THREE.PerspectiveCamera(38, Wd / Hd, 0.3, 2000);

const geo = new THREE.BoxGeometry(2, 2, 2), mats = {};
const mat = (c) => (mats[c] ||= new THREE.MeshLambertMaterial({ color: c }));
const cube = (x, y, z, c, s = 1) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); m.scale.setScalar(s); scene.add(m); return m; };

const A = 30, B = 24.5;
for (let x = -56; x <= 56; x += 2) for (let z = -56; z <= 56; z += 2) {
  const d = Math.hypot(x, z); if (d > 56) continue;
  const u = Math.hypot(x / A, z / B);
  cube(x, 0, z, u < 0.45 ? '#f0d060' : '#3cb043');
  if (d > 52) for (let y = -2; y >= -8; y -= 2) cube(x, y, z, '#8b5a2b');
  if (u > 0.88 && u <= 1.0) {
    const th = Math.atan2(z / B, x / A), bay = Math.floor(((th / (2 * Math.PI)) * 28 + 28) % 28);
    for (let y = 2; y <= 12; y += 2) {
      const hole = bay % 2 === 0 && (y === 4 || y === 8);
      if (!hole) cube(x, y, z, '#d2b48c');
    }
  }
}
// trees
let s = 3; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let i = 0; i < 16; i++) {
  const a = rnd() * Math.PI * 2, rr = 38 + rnd() * 12, x = Math.round(Math.cos(a) * rr / 2) * 2, z = Math.round(Math.sin(a) * rr / 2) * 2;
  cube(x, 2, z, '#8b5a2b'); cube(x, 4, z, '#228b22');
}
// "gladiators" + "lion"
const g1 = cube(0, 2, 0, '#ff0000', 0.6), g2 = cube(0, 2, 0, '#0000ff', 0.6), lion = cube(0, 2, 0, '#ffa500', 0.7);

// same camera choreography as the HQ version
const rot = (deg, dist, y) => { const a = -0.1 + deg * Math.PI / 180; return new THREE.Vector3(Math.cos(a) * dist, y, Math.sin(a) * dist); };
const keys = [
  [0.0, rot(8, 210, 120), new THREE.Vector3(0, 6, 0)],
  [1.6, rot(4, 128, 74), new THREE.Vector3(0, 5, 0)],
  [3.2, rot(0, 52, 30), new THREE.Vector3(-1, 4, 0)],
  [5.5, rot(-25, 64, 40), new THREE.Vector3(0, 3, 0)],
  [7.8, rot(-50, 72, 47), new THREE.Vector3(0, 3, 0)],
  [10.0, rot(-75, 82, 55), new THREE.Vector3(0, 4, 0)],
  [11.6, rot(-100, 98, 63), new THREE.Vector3(0, 5, 0)],
  [13.0, rot(-120, 120, 72), new THREE.Vector3(0, 6, 0)],
];
const pC = new THREE.CatmullRomCurve3(keys.map(k => k[1]), false, 'centripetal');
const lC = new THREE.CatmullRomCurve3(keys.map(k => k[2]), false, 'centripetal');
function camAt(t) {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const f = Math.min(1, Math.max(0, (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0])));
  const u = (i + f) / (keys.length - 1);
  return [pC.getPoint(u), lC.getPoint(u)];
}

window.renderFrame = (fi) => {
  const t = fi / FPS;
  const o = t * 0.6, sep = 1.9 - Math.max(0, Math.sin(t * 5.2)) * 0.8;
  g1.position.set(-Math.cos(o) * sep, 2, -Math.sin(o) * sep);
  g2.position.set(Math.cos(o) * sep, 2, Math.sin(o) * sep);
  lion.position.set(t < 5.2 ? 99 : Math.cos(t) * 5, 2, t < 5.2 ? 99 : Math.sin(t) * 5);
  const [p, l] = camAt(t);
  camera.position.copy(p); camera.lookAt(l);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
};
window.__done = scene.children.length;
