import { setup, sun, island, Voxels, vary, rng, fbm, hash2, particles, glowSprite } from './engine.js';

const { THREE, renderer, scene, camera } = setup({
  skyTop: '#33416e', skyBottom: '#f4a56b', fog: '#f0b49a', fogNear: 170, fogFar: 400,
});
sun(scene, { color: '#ffc58e', intensity: 4.0, pos: [10, 60, 110], sky: '#a6b6e0', ground: '#6b4a32', hemi: 0.85, size: 85 });

const vox = new Voxels();
const r = rng(11);

// winding ridge path
const pathZ = (x) => 13 * Math.sin(x * 0.065 + 0.6) - 4 * Math.sin(x * 0.17);
const ridgeH = (x) => 21 + 7 * Math.sin(x * 0.11 + 0.3) + 5 * Math.sin(x * 0.23 + 1.0);
function terrain(x, z) {
  const d = z - pathZ(x);
  const dd = Math.max(0, Math.abs(d) - 3.5);
  const ridge = ridgeH(x) * Math.exp(-(dd * dd) / 150);
  const hills = 12 * fbm(x * 0.06, z * 0.06, 31) - 4;
  const edge = Math.max(0, 1 - Math.hypot(x, z) / 56);
  return Math.max(0, ridge * Math.min(1, edge * 1.8) + hills * Math.min(1, edge * 1.5));
}
const top = island(vox, 52, { seed: 12, grass: '#6f9a45', depth: 20, topFn: terrain });

// recolor exposed slopes: rock + moss instead of dirt stripes
for (let x = -58; x <= 58; x++) for (let z = -58; z <= 58; z++) {
  const h = top(x, z); if (h === undefined) continue;
  const n = [top(x + 1, z), top(x - 1, z), top(x, z + 1), top(x, z - 1)].map(v => v ?? -20);
  const low = Math.min(...n);
  const steep = h - low >= 2;
  for (let y = Math.max(low + 1, h - 12); y <= h; y++) {
    let c;
    if (steep) c = hash2(x * 5 + y, z, 7) < 0.25 ? vary('#6f8f45', 0.12, r) : vary('#8d867a', 0.12, r);
    else c = vary(y === h ? '#6f9a45' : '#5f8a3c', 0.12, r);
    vox.set(x, y, z, c);
  }
  if (!steep && h > 24) vox.set(x, h, z, vary('#8d867a', 0.1, r));
}

// ---- the wall ----
const WALL = '#a39a8c', WALL_D = '#857c70', TOPC = '#b8ae9c';
const pathPts = [];
for (let x = -50; x <= 50; x += 0.25) {
  const z = pathZ(x);
  if (top(x, z) === undefined) continue;
  pathPts.push([x, z]);
}
// smoothed wall-top heights
const groundAt = pathPts.map(([x, z]) => top(x, z) ?? 0);
const wallTop = groundAt.map((_, i) => {
  let s = 0, n = 0;
  for (let k = -6; k <= 6; k++) { const v = groundAt[i + k]; if (v !== undefined) { s += v; n++; } }
  return Math.round(s / n) + 3;
});
const towers = [];
pathPts.forEach(([x, z], i) => {
  const dx = 1, dz = (pathZ(x + 0.5) - pathZ(x - 0.5));
  const len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len;
  const T = wallTop[i];
  for (let w = -1.5; w <= 1.5; w += 0.5) {
    const px = Math.round(x + nx * w), pz = Math.round(z + nz * w);
    const g = top(px, pz); if (g === undefined) continue;
    const edge = Math.abs(w) >= 1.5;
    const H = edge ? T + 1 + (Math.round(i / 6) % 2 === 0 ? 1 : 0) : T;
    for (let y = Math.min(g, T - 4); y <= H; y++) {
      let c = vary(y === T && !edge ? TOPC : WALL, 0.08, r);
      if (hash2(px * 7 + y, pz, 4) < 0.08) c = vary(WALL_D, 0.06, r);
      vox.set(px, y, pz, c);
    }
  }
  if (i % 70 === 30) towers.push([Math.round(x), Math.round(z), T]);
});
for (const [tx, tz, T] of towers) {
  const TT = T + 4;
  for (let x = tx - 3; x <= tx + 3; x++) for (let z = tz - 3; z <= tz + 3; z++) {
    const g = top(x, z) ?? T - 4;
    const edge = Math.abs(x - tx) === 3 || Math.abs(z - tz) === 3;
    for (let y = Math.min(g, T - 4); y <= TT; y++) {
      // arched windows
      const mid = Math.abs(x - tx) === 3 ? z - tz : x - tx;
      const win = edge && mid === 0 && y >= T + 1 && y <= T + 2;
      if (win) { vox.set(x, y, z, '#2a2420'); continue; }
      if (!edge && y > T && y < TT) continue; // hollow room
      vox.set(x, y, z, vary(y === TT ? TOPC : WALL, 0.07, r));
    }
    if (edge && ((x + z) % 2 === 0)) vox.set(x, TT + 1, z, vary(WALL, 0.07, r));
  }
  // red lanterns at the tower corners
  for (const [ox, oz] of [[-3, -3], [3, 3]]) {
    vox.set(tx + ox, TT + 1, tz + oz, '#5a3a22');
    vox.set(tx + ox, TT + 2, tz + oz, '#ff4a2a', true);
    glowSprite(scene, [tx + ox, TT + 2, tz + oz], 'rgba(255,90,50,0.8)', 4);
  }
}

// ---- autumn trees ----
const leaves = ['#d9622b', '#e8a23a', '#c23b22', '#8fa83a', '#e7c14a', '#b5482a'];
for (let i = 0; i < 110; i++) {
  const x = Math.round((r() - 0.5) * 100), z = Math.round((r() - 0.5) * 100);
  const h = top(x, z); if (h === undefined) continue;
  if (Math.abs(z - pathZ(x)) < 5) continue;
  const c = leaves[Math.floor(r() * leaves.length)];
  const th = 2 + Math.floor(r() * 2), rad = 1 + (r() < 0.3 ? 1 : 0);
  for (let y = 1; y <= th; y++) vox.set(x, h + y, z, '#5a3e28');
  for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) for (let dy = 0; dy <= rad + 1; dy++) {
    if (dx * dx + dz * dz + (dy - 1) * (dy - 1) <= rad * rad + 1) vox.set(x + dx, h + th + dy, z + dz, vary(c, 0.12, r));
  }
}

// ---- chinese dragon ----
const spine = (t) => [
  -38 + t * 72,
  52 + 5 * Math.sin(t * Math.PI * 3.2),
  -6 + 11 * Math.cos(t * Math.PI * 2.4),
];
const RED = '#c8202a', GOLD = '#f2b632';
let last;
for (let t = 0; t <= 1; t += 0.0025) {
  const [cx, cy, cz] = spine(t);
  const rad = 0.7 + 1.9 * Math.min(1, t * 1.6);
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) {
    if (dx * dx + dy * dy + dz * dz > rad * rad) continue;
    const belly = dy < -rad * 0.35;
    vox.set(cx + dx, cy + dy, cz + dz, belly ? vary(GOLD, 0.06, r) : vary(RED, 0.08, r));
  }
  // dorsal fin
  if (Math.floor(t * 400) % 3 === 0 && t > 0.05) vox.set(cx, cy + rad + 1, cz, '#2f8a5a');
  last = [cx, cy, cz];
}
// head
const [hx, hy, hz] = last;
for (let dx = 0; dx <= 5; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++)
  vox.set(hx + dx, hy + dy, hz + dz, dy === -2 ? GOLD : vary(RED, 0.06, r));
for (let dx = 6; dx <= 8; dx++) for (let dy = -2; dy <= 0; dy++) for (let dz = -1; dz <= 1; dz++) vox.set(hx + dx, hy + dy, hz + dz, vary(RED, 0.05, r));
for (const s of [-2, 2]) {
  vox.set(hx + 4, hy + 1, hz + s, '#ffe14a', true); // eyes
  for (let k = 1; k <= 4; k++) vox.set(hx + 2 - k, hy + 2 + k, hz + s, GOLD); // horns
  for (let k = 1; k <= 6; k++) vox.set(hx + 7 - k * 0.4, hy - 1 - k * 0.6, hz + s + Math.sign(s) * k * 0.5, '#f7d36a'); // whiskers
}
for (let dz = -2; dz <= 2; dz++) vox.set(hx - 1, hy + 3, hz + dz, '#2f8a5a'); // mane
// flaming pearl
const pearl = [hx + 13, hy + 1, hz + 1];
for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) vox.set(pearl[0] + dx, pearl[1] + dy, pearl[2] + dz, '#fff3c4', true);
glowSprite(scene, pearl, 'rgba(255,220,140,1)', 16);
const pl = new THREE.PointLight('#ffd27a', 120, 50, 2); pl.position.set(...pearl); scene.add(pl);

// ---- clouds ----
function cloud(cx, cy, cz, s) {
  for (let i = 0; i < 6; i++) {
    const ox = (r() - 0.5) * s * 2, oz = (r() - 0.5) * s, rr = s * (0.4 + r() * 0.4);
    for (let dx = -rr; dx <= rr; dx++) for (let dy = 0; dy <= rr * 0.6; dy++) for (let dz = -rr; dz <= rr; dz++)
      if (dx * dx + (dy * 1.6) ** 2 + dz * dz <= rr * rr) vox.set(cx + ox + dx, cy + dy, cz + oz + dz, vary('#fff4ea', 0.03, r));
  }
}
cloud(-44, 44, -36, 7); cloud(46, 48, -28, 6); cloud(-62, 16, 26, 5); cloud(58, 12, 30, 5);

const count = vox.build(scene);
particles(scene, 300, { color: '#ffe9c8', size: 0.3, box: [120, 60, 120], y0: 0, opacity: 0.45 });
glowSprite(scene, [-60, 30, 190], 'rgba(255,205,150,1)', 120);

camera.position.set(140, 104, 100);
camera.lookAt(-4, 18, 0);
renderer.render(scene, camera);
window.__done = count;
