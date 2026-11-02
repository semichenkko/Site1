import { setup, sun, island, Voxels, vary, rng, fbm, hash2, particles, glowSprite } from './engine.js';

const { THREE, renderer, scene, camera } = setup({
  skyTop: '#3b4f86', skyBottom: '#f6b46a', fog: '#f0b07a', fogNear: 160, fogFar: 380,
});
sun(scene, { color: '#ffc787', intensity: 4.2, pos: [-95, 45, 55], sky: '#9fb3e0', ground: '#7a5a3c', hemi: 0.85, size: 80 });

const vox = new Voxels();
const r = rng(42);
const A = 30, B = 24.5;
const top = island(vox, 52, {
  seed: 7, grass: '#7aa04a', depth: 22,
  topFn: (x, z) => {
    const u = Math.hypot(x / A, z / B);
    return u < 1.25 ? 0 : Math.floor(fbm(x * 0.08, z * 0.08, 3) * 3);
  },
});

const STONE = '#d9c39a', STONE_D = '#b89f76', SAND = '#e3c78f';
const ruinCenter = -0.25, ruinWidth = 1.5; // radians
const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const N = 44; // bays around the ellipse
const TIER = 6, H_FULL = 24;
function ruinHeights(th) {
  const bay = Math.floor(((th / (2 * Math.PI)) * N + N) % N);
  const fall = Math.max(0, 1 - angDist(th, ruinCenter) / (ruinWidth / 2)); // 1 at center
  const jag = hash2(bay, 0, 5);
  const outer = fall <= 0 ? H_FULL : Math.max(2, Math.round(H_FULL - Math.min(1, fall * 2.2) * 20 - jag * 4));
  const inner = fall <= 0 ? 19 : Math.max(8, Math.round(19 - fall * 6 - jag * 3));
  return { outer, inner, fall };
}

for (let x = -A - 3; x <= A + 3; x++) for (let z = -B - 3; z <= B + 3; z++) {
  const u = Math.hypot(x / A, z / B);
  const th = Math.atan2(z / B, x / A);
  if (u > 1.06) continue;
  vox.set(x, 0, z, vary('#cdb48a', 0.07, r));
  if (u < 0.42) { vox.set(x, 1, z, vary(SAND, 0.06, r)); continue; }
  if (u < 0.47) { for (let y = 1; y <= 3; y++) vox.set(x, y, z, vary('#c9b083', 0.06, r)); continue; }
  const { outer, inner, fall } = ruinHeights(th);
  if (u < 0.84) { // seating terraces
    let h = 3 + Math.floor(((u - 0.47) / 0.37) * 8) * 2;
    const broken = fall > 0 && u > 0.7;
    if (broken) h = Math.min(h, inner - 2);
    for (let y = 1; y <= h; y++) vox.set(x, y, z, vary(y === h ? '#e6d4ae' : STONE_D, 0.07, r));
    if (hash2(x, z, 11) < 0.6) {
      const cols = ['#c0392b', '#f1f1ea', '#2d5aa0', '#e2b33c', '#7b3fa0', '#d97a2b', '#3e8e5a'];
      vox.set(x, h + 1, z, cols[Math.floor(hash2(x, z, 12) * cols.length)]);
      if (hash2(x, z, 13) < 0.5) vox.set(x, h + 2, z, '#e0b08a');
    }
    continue;
  }
  const H = u > 0.93 ? outer : inner;
  const f = (((th / (2 * Math.PI)) * N) % 1 + 1) % 1;
  for (let y = 1; y <= H; y++) {
    const tier = Math.floor((y - 1) / TIER), ly = (y - 1) % TIER;
    let open = false;
    if (tier < 3) {
      if (ly <= 3 && f > 0.22 && f < 0.78) open = true;
      if (ly === 4 && f > 0.34 && f < 0.66) open = true;
    } else if (ly >= 2 && ly <= 3 && f > 0.4 && f < 0.6 && Math.floor(((th / (2 * Math.PI)) * N + N) % N) % 2 === 0) open = true;
    if (open) continue;
    let c = vary(STONE, 0.06, r);
    if (ly === TIER - 1) c = vary('#ecdcb8', 0.04, r);
    if (hash2(x * 3 + y, z, 21) < 0.07) c = vary('#a58d66', 0.05, r);
    if (H < H_FULL && y > H - 2 && hash2(x, z + y, 22) < 0.3) c = vary('#b49a72', 0.06, r); // broken top
    vox.set(x, y, z, c);
  }
  // pilasters + cornices on the facade
  if (u > 0.985 && H > 2) {
    const ox = Math.round(x * 1.035), oz = Math.round(z * 1.035);
    for (let y = 1; y <= Math.min(H, 18); y++) {
      const ly = (y - 1) % TIER;
      if (ly === TIER - 1 || f < 0.12 || f > 0.88) vox.set(ox, y, oz, vary('#eadbb8', 0.05, r));
    }
  }
}

// rubble outside the broken side
for (let i = 0; i < 160; i++) {
  const th = ruinCenter + (r() - 0.5) * ruinWidth;
  const rr = 1.02 + r() * 0.22;
  const x = Math.round(Math.cos(th) * A * rr), z = Math.round(Math.sin(th) * B * rr);
  const h = (top(x, z) ?? 0);
  vox.set(x, h + 1, z, vary(STONE, 0.1, r));
  if (r() < 0.35) vox.set(x, h + 2, z, vary(STONE_D, 0.1, r));
}

// figures
function gladiator(x, z, tunic, facing = 1) {
  vox.set(x, 2, z, '#6b4a2f'); vox.set(x, 3, z, '#d8a47a');
  vox.set(x, 4, z, tunic); vox.set(x, 5, z, tunic);
  vox.set(x, 6, z, '#d8a47a'); vox.set(x, 7, z, '#d4a62a'); vox.set(x, 8, z, '#b3261e');
  for (let y = 3; y <= 6; y++) { vox.set(x + facing, y, z + 1, '#9b1c16'); vox.set(x + facing, y, z, '#9b1c16'); }
  for (let i = 1; i <= 3; i++) vox.set(x - facing * i, 5, z - 1, '#c9ced6');
}
gladiator(-4, 1, '#8e2a22', 1);
gladiator(-1, 4, '#2d4f8e', -1);
// lion
const lx = 5, lz = -2;
for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) { vox.set(lx + i, 3, lz + j, '#c99a4f'); vox.set(lx + i, 4, lz + j, '#c99a4f'); }
for (const [i, j] of [[0, 0], [0, 1], [4, 0], [4, 1]]) vox.set(lx + i, 2, lz + j, '#b88a44');
for (let j = -1; j <= 2; j++) for (let y = 3; y <= 6; y++) vox.set(lx - 1, y, lz + j, '#7a4a1e');
vox.set(lx - 2, 4, lz, '#c99a4f'); vox.set(lx - 2, 4, lz + 1, '#c99a4f'); vox.set(lx - 2, 5, lz, '#c99a4f'); vox.set(lx - 2, 5, lz + 1, '#c99a4f');
vox.set(lx + 5, 5, lz, '#c99a4f'); vox.set(lx + 6, 6, lz, '#7a4a1e');

// torches around the arena
for (let k = 0; k < 12; k++) {
  const th = (k / 12) * Math.PI * 2;
  const x = Math.round(Math.cos(th) * A * 0.445), z = Math.round(Math.sin(th) * B * 0.445);
  vox.set(x, 4, z, '#5a4632'); vox.set(x, 5, z, '#ffb347', true);
  if (k % 3 === 0) { const l = new THREE.PointLight('#ff9a3c', 25, 18, 2); l.position.set(x, 6, z); scene.add(l); }
  glowSprite(scene, [x, 5.5, z], 'rgba(255,170,70,0.9)', 4);
}

// trees
function cypress(x, z) {
  const h0 = top(x, z); if (h0 === undefined) return;
  const H = 8 + Math.floor(r() * 5);
  for (let y = 1; y <= H; y++) {
    const w = y < 2 ? 0 : (y < H * 0.75 ? 1 : 0);
    for (let dx = -w; dx <= w; dx++) for (let dz = -w; dz <= w; dz++)
      if (dx * dx + dz * dz <= w * w + 0.5) vox.set(x + dx, h0 + y, z + dz, y < 2 ? '#5a3e28' : vary('#2f5a2c', 0.12, r));
  }
}
function pine(x, z) {
  const h0 = top(x, z); if (h0 === undefined) return;
  for (let y = 1; y <= 7; y++) vox.set(x, h0 + y, z, '#6b4a2f');
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    const d = dx * dx + dz * dz;
    if (d <= 16) vox.set(x + dx, h0 + 8, z + dz, vary('#3f6e32', 0.12, r));
    if (d <= 8) vox.set(x + dx, h0 + 9, z + dz, vary('#4a7d3a', 0.12, r));
  }
}
for (let i = 0; i < 40; i++) {
  const th = r() * Math.PI * 2, rr = 37 + r() * 12;
  const x = Math.round(Math.cos(th) * rr), z = Math.round(Math.sin(th) * rr);
  if (angDist(th, 0.75) < 0.45) continue; // keep camera side open
  (r() < 0.7 ? cypress : pine)(x, z);
}


// roman road to the front + broken columns
for (let t = 0; t < 30; t++) {
  const cx = Math.round(30 + t * 0.75), cz = Math.round(25 + t * 0.62);
  for (let w = -1; w <= 1; w++) {
    const x = cx + w, z = cz - w;
    const h = top(x, z); if (h === undefined) continue;
    vox.set(x, h, z, vary('#9d958a', 0.1, r));
  }
}
for (const [x, z, hh] of [[24, 34, 7], [28, 38, 4], [20, 37, 9], [34, 30, 3]]) {
  const h0 = top(x, z); if (h0 === undefined) continue;
  for (let y = 1; y <= hh; y++) vox.set(x, h0 + y, z, vary('#e8dcc0', 0.05, r));
  vox.set(x + 1, h0 + 1, z, vary('#e8dcc0', 0.05, r));
}

const count = vox.build(scene);

// dust in the arena + over the island
particles(scene, 600, { color: '#ffe2b0', size: 0.35, box: [34, 10, 26], y0: 2, opacity: 0.55 });
particles(scene, 300, { color: '#fff1d6', size: 0.25, box: [110, 50, 110], y0: -10, opacity: 0.4, seed: 4 });
// sun glow
glowSprite(scene, [-170, 45, 60], 'rgba(255,214,150,1)', 120);

camera.position.set(92, 104, 92);
camera.lookAt(0, -4, 2);
renderer.render(scene, camera);
window.__done = count;
