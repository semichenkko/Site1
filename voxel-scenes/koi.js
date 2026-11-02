import { THREE, setup, composer, Voxels, vary, rng, fbm, hash2, noise2, glowSprite, points } from './engine2.js';
import { buildIsland, cloudSea, textMask } from './island2.js';

const Wd = window.W || 1440, Hd = window.H || 1080;
const { renderer, scene, camera } = setup({
  w: Wd, h: Hd,
  sky: [[0, '#1f3060'], [0.38, '#5b5f9a'], [0.62, '#e48a7c'], [0.82, '#ffbe72'], [1, '#fff0c0']],
  fog: '#f0b48e', fogDensity: 0.0024, exposure: 1.05,
});
camera.fov = 36; camera.updateProjectionMatrix();

scene.add(new THREE.HemisphereLight('#b4c0ee', '#6a5038', 1.25));
const sunL = new THREE.DirectionalLight('#ffc27e', 4.2);
sunL.position.set(-55, 75, -60); sunL.castShadow = true; sunL.shadow.mapSize.set(4096, 4096);
Object.assign(sunL.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sunL.shadow.bias = -0.0003; sunL.shadow.normalBias = 0.3; scene.add(sunL);
const fill = new THREE.DirectionalLight('#ffd9b4', 1.3); fill.position.set(30, 40, 100); scene.add(fill);

const S = 0.5, vox = new Voxels(S), r = rng(88);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- terrain: cliff with waterfall, pool, river, karst peaks ----------
const CLIFF = 34, FACE = -15;
const riverX = (z) => 3 * Math.sin(z * 0.12);
const peaks = [[-32, -14, 46, 9], [34, -10, 38, 8], [-40, 18, 20, 7], [40, 22, 16, 6], [-18, -34, 52, 10], [20, -36, 48, 9]];
function ground(x, z) {
  let h = 2 + 4 * fbm(x * 0.06, z * 0.06, 2);
  h = Math.max(h, CLIFF * smooth(FACE + 1, FACE - 6, z) + 3 * fbm(x * 0.2, z * 0.2, 7) * smooth(FACE, FACE - 6, z));
  for (const [px, pz, ph, pr] of peaks) {
    const d = Math.hypot(x - px, z - pz) / pr;
    h = Math.max(h, ph * Math.max(0, 1 - Math.pow(d, 2.2)) + (d < 1 ? 2 * fbm(x * 0.4, z * 0.4, 9) : 0));
  }
  if (Math.hypot(x, (z + 1) * 1.15) < 13) h = 0;                                  // pool
  if (z > 6 && Math.abs(x - riverX(z)) < 3.2) h = Math.min(h, 0);                 // river
  if (z < FACE && z > FACE - 30 && Math.abs(x) < 4) h = Math.min(h, CLIFF - 1.5); // channel on top
  return h;
}
const isWater = (x, z) => Math.hypot(x, (z + 1) * 1.15) < 13 || (z > 6 && Math.abs(x - riverX(z)) < 3.2) || (z < FACE && z > FACE - 30 && Math.abs(x) < 4);
const topAt = buildIsland(vox, r, {
  R: 56, ground, seed: 6,
  surface: (x, z, y, depth, steep) => {
    if (steep) { const band = ((Math.floor(y / 1.5 + fbm(x * 0.15, z * 0.15, 2) * 2) % 3) + 3) % 3; return hash2(x * 3 + y, z, 7) < 0.18 ? vary('#5f8a45', 0.12, r) : vary(['#9a8f82', '#857b70', '#a89d8e'][band], 0.08, r); }
    if (depth === 0) {
      if (isWater(x, z)) return vary('#8a7a62', 0.1, r);
      const hn = fbm(x * 0.09, z * 0.09, 44);
      return vary(hn > 0.55 ? '#86b24e' : hn > 0.42 ? '#6aa246' : '#56903e', 0.1, r);
    }
    return vary('#6a5040', 0.08, r);
  },
});

// water surfaces
for (let x = -56; x <= 56; x += S) for (let z = -56; z <= 56; z += S) {
  if (!isWater(x, z)) continue;
  const g = topAt(x, z); if (g === undefined) continue;
  const surf = z < FACE ? CLIFF - 1 : 0.5;
  const nearFall = Math.abs(x) < 6 && Math.abs(z - FACE) < 6;
  const ripple = noise2(x * 0.7, z * 0.7, 3);
  const c = nearFall && hash2(x, z, 4) < 0.55 ? vary('#f2fbff', 0.03, r) : vary(ripple > 0.62 ? '#7fd3ec' : ripple > 0.4 ? '#3fa6cc' : '#2b86b4', 0.05, r);
  vox.set(x, surf, z, c);
}
// main waterfall over the cliff face
for (let x = -4; x <= 4; x += S) for (let y = 0.5; y <= CLIFF - 1; y += S) for (let dz = 0; dz <= 1.5; dz += S) {
  const z = FACE + 0.5 + dz + (CLIFF - y) * 0.03;
  const streak = noise2(x * 2.2, y * 0.15, 5);
  const edge = Math.abs(x) > 3.5;
  if (edge && hash2(x, y, 6) < 0.5) continue;
  vox.set(x, y, z, vary(streak > 0.6 ? '#ffffff' : streak > 0.4 ? '#cdeefa' : '#8fd6f0', 0.04, r));
}
// foam at the base
for (let i = 0; i < 900; i++) {
  const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 7;
  vox.set(Math.cos(a) * d, 1 + r() * 1.5 * (1 - d / 7), FACE + 2 + Math.abs(Math.sin(a)) * d * 0.8, vary('#ffffff', 0.02, r));
}
// river spilling off the island edge
for (let z = 46; z <= 60; z += S) {
  const x0 = riverX(z), g = topAt(x0, z);
  if (g !== undefined) continue;
  for (let x = x0 - 3; x <= x0 + 3; x += S) for (let y = 0.5; y >= -26; y -= S) {
    if (hash2(x, y, 3) < 0.25 + Math.max(0, -y) / 40) continue;
    vox.set(x, y, z + (-y) * 0.12, vary(hash2(x, y, 9) < 0.5 ? '#d8f2fb' : '#8fd6f0', 0.04, r));
  }
  break;
}

// lotus pads + flowers in the pool
for (let i = 0; i < 26; i++) {
  const a = r() * Math.PI * 2, d = 5 + r() * 7;
  const cx = Math.cos(a) * d, cz = Math.sin(a) * d / 1.15 - 1;
  if (Math.abs(cx) < 5 && cz < -6) continue;
  for (let px = -1.2; px <= 1.2; px += S) for (let pz = -1.2; pz <= 1.2; pz += S)
    if (px * px + pz * pz < 1.5 && !(px > 0 && Math.abs(pz) < 0.3)) vox.set(cx + px, 1, cz + pz, vary('#3f8a3a', 0.1, r));
  if (r() < 0.55) {
    vox.set(cx, 1.5, cz, '#ffd1e0'); vox.set(cx + 0.5, 1.5, cz, '#ff8fb4'); vox.set(cx - 0.5, 1.5, cz, '#ff8fb4');
    vox.set(cx, 1.5, cz + 0.5, '#ff8fb4'); vox.set(cx, 1.5, cz - 0.5, '#ff8fb4'); vox.set(cx, 2, cz, '#ffe14a');
  }
}

// ---------- the Dragon Gate (paifang) over the waterfall lip ----------
const GZ = FACE - 2.5, GY = CLIFF - 1.5;
const RED = '#b5231c', RED2 = '#8f1a14', TILE = '#2f7d6e', TILE2 = '#3d9682', GOLD = '#f2b632';
const box = (x0, x1, y0, y1, z0, z1, c) => { for (let x = x0; x <= x1 + 1e-6; x += S) for (let y = y0; y <= y1 + 1e-6; y += S) for (let z = z0; z <= z1 + 1e-6; z += S) vox.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c); };
for (const px of [-7, 7]) { box(px - 0.5, px + 0.5, GY, GY + 13, GZ - 0.5, GZ + 0.5, () => vary(RED, 0.04, r)); box(px - 1, px + 1, GY, GY + 1, GZ - 1, GZ + 1, '#d9d2c4'); }
for (const px of [-11, 11]) { box(px - 0.5, px + 0.5, GY, GY + 9, GZ - 0.5, GZ + 0.5, () => vary(RED, 0.04, r)); box(px - 1, px + 1, GY, GY + 1, GZ - 1, GZ + 1, '#d9d2c4'); }
box(-7, 7, GY + 11, GY + 12, GZ - 0.5, GZ + 0.5, () => vary(RED2, 0.04, r));
box(-11, -7, GY + 7.5, GY + 8.5, GZ - 0.5, GZ + 0.5, () => vary(RED2, 0.04, r));
box(7, 11, GY + 7.5, GY + 8.5, GZ - 0.5, GZ + 0.5, () => vary(RED2, 0.04, r));
// painted beam band (blue/green/gold like real paifang)
for (let x = -7; x <= 7; x += S) vox.set(x, GY + 12.5, GZ + 0.5, Math.round(x / S) % 4 < 2 ? '#2b5fa8' : '#3a9a6a');
// roofs with upturned gold eaves
function roof(cx, w, y0, depth) {
  for (let dy = 0; dy <= 2; dy += S) {
    const hw = w - dy * 0.9, hd = depth - dy * 0.6;
    for (let x = -hw; x <= hw + 1e-6; x += S) for (let z = -hd; z <= hd + 1e-6; z += S)
      vox.set(cx + x, y0 + dy, GZ + z, vary(Math.round((x) / S) % 2 ? TILE : TILE2, 0.05, r));
  }
  for (let x = -w + 0.5; x <= w - 0.5 + 1e-6; x += S) vox.set(cx + x, y0 + 2.5, GZ, '#1f5a50');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    vox.set(cx + sx * (w + 0.5), y0 + 0.5, GZ + sz * (depth + 0.5), GOLD);
    vox.set(cx + sx * (w + 1), y0 + 1, GZ + sz * (depth + 1), GOLD);
  }
  for (const sx of [-1, 1]) { vox.set(cx + sx * (w - 0.5), y0 + 3, GZ, GOLD); vox.set(cx + sx * (w - 0.5), y0 + 3.5, GZ, GOLD); } // ridge ornaments
}
roof(0, 9, GY + 13.5, 2.5);
roof(-9, 3.5, GY + 9, 2);
roof(9, 3.5, GY + 9, 2);
// plaque with gold 龙门
const PL = { x0: -3, x1: 3, y0: GY + 7, y1: GY + 10.5 };
box(PL.x0 - 0.5, PL.x1 + 0.5, PL.y0 - 0.5, PL.y1 + 0.5, GZ + 0.5, GZ + 0.5, GOLD);
box(PL.x0, PL.x1, PL.y0, PL.y1, GZ + 0.5, GZ + 0.5, '#1d2f6a');
box(-0.25, 0.25, PL.y1 + 0.5, GY + 11, GZ, GZ, '#e2a93b');
{
  const T = textMask('龙门', 26);
  const sx = (PL.x1 - PL.x0) / T.w, sy = (PL.y1 - PL.y0) / T.h, sc = Math.min(sx, sy);
  const offX = (PL.x0 + PL.x1) / 2 - (T.w * sc) / 2;
  const tv = new Voxels(0.125);
  for (const [px, py] of T.pts) tv.set(offX + px * sc, PL.y1 - py * sc - 0.1, GZ + 0.85, '#ffd34a', true);
  tv.buildMerged(scene);
}
// hanging red lanterns on the gate
for (const lx of [-9, 9, -4, 4]) {
  const ly = lx === -4 || lx === 4 ? GY + 5 : GY + 6;
  box(lx, lx, ly + 1, ly + 2, GZ + 1, GZ + 1, '#3a2a1a');
  box(lx - 0.5, lx + 0.5, ly - 0.5, ly + 0.5, GZ + 0.5, GZ + 1.5, () => '#ff3b22');
  glowSprite(scene, [lx, ly, GZ + 1.2], 'rgba(255,80,40,0.9)', 4);
}

// ---------- pavilion on the right karst peak ----------
{
  const [px, pz] = [34, -10], base = (topAt(px, pz) ?? 30);
  box(px - 3, px + 3, base, base + 0.5, pz - 3, pz + 3, '#d9d2c4');
  for (const sx of [-2.5, 2.5]) for (const sz of [-2.5, 2.5]) box(px + sx, px + sx, base + 0.5, base + 4, pz + sz, pz + sz, RED);
  for (let dy = 0; dy <= 2.5; dy += S) { const hw = 4 - dy * 1.4; box(px - hw, px + hw, base + 4.5 + dy, base + 4.5 + dy, pz - hw, pz + hw, () => vary(TILE, 0.05, r)); }
  box(px, px, base + 7.5, base + 8.5, pz, pz, GOLD);
  glowSprite(scene, [px, base + 2, pz], 'rgba(255,170,90,0.7)', 6);
}

// ---------- chinese pines + peach blossom trees ----------
function pine(x, z) {
  const h = topAt(x, z); if (h === undefined || isWater(x, z)) return;
  const H = 4 + r() * 3, lean = (r() - 0.5) * 0.6;
  for (let y = 0; y <= H; y += S) vox.set(x + y * lean, h + y, z, '#4a3424');
  for (const [ly, rad] of [[H, 2.6], [H - 1.6, 2], [H + 1.2, 1.5]]) {
    const cx = x + ly * lean + (r() - 0.5);
    for (let a = -rad; a <= rad; a += S) for (let b = -rad; b <= rad; b += S)
      if (a * a + b * b < rad * rad && hash2(cx + a, z + b, 4) < 0.9) { vox.set(cx + a, h + ly, z + b, vary('#2f5a34', 0.12, r)); if (r() < 0.5) vox.set(cx + a, h + ly + 0.5, z + b, vary('#3d6e3e', 0.12, r)); }
  }
}
function blossom(x, z) {
  const h = topAt(x, z); if (h === undefined || isWater(x, z)) return;
  const th = 1.5 + r();
  for (let y = 0; y <= th; y += S) vox.set(x, h + y, z, '#5a3a2a');
  const rad = 1.4 + r() * 0.9, cy = h + th + rad * 0.7;
  for (let a = -rad; a <= rad; a += S) for (let b = -rad; b <= rad; b += S) for (let d = -rad; d <= rad; d += S)
    if (a * a + b * b * 1.4 + d * d <= rad * rad && hash2(x + a, z + d + b, 5) < 0.9) vox.set(x + a, cy + b, z + d, vary(hash2(a, d, 2) < 0.7 ? '#ffb3cc' : '#ff8fb4', 0.1, r));
}
for (let i = 0; i < 260; i++) {
  const x = (r() - 0.5) * 108, z = (r() - 0.5) * 108;
  if (Math.abs(x) < 14 && z > -20 && z < 14) continue;
  const h = topAt(x, z); if (h === undefined) continue;
  (h > 12 || r() < 0.35 ? pine : blossom)(x, z);
}
// fallen petals on grass
for (let i = 0; i < 1400; i++) {
  const x = (r() - 0.5) * 100, z = (r() - 0.5) * 100, h = topAt(x, z);
  if (h !== undefined && h < 10 && !isWater(x, z) && !vox.has(x, h + S, z)) vox.set(x, h, z, vary('#ffc0d4', 0.1, r));
}

// ---------- koi (fine voxels) ----------
function koiModel(pattern) {
  const v = new Voxels(0.2), L = 3.2;
  for (let x = -L / 2; x <= L / 2; x += 0.2) {
    const t = (x + L / 2) / L, rad = 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.12;
    for (let y = -rad; y <= rad; y += 0.2) for (let z = -rad * 0.8; z <= rad * 0.8; z += 0.2) {
      if ((y * y) / (rad * rad) + (z * z) / (rad * rad * 0.64) > 1) continue;
      let c = pattern(x, y, z, t);
      if (y < -rad * 0.4) c = pattern === goldP ? '#ffd76a' : '#fff4e8';
      v.set(x, y, z, vary(c, 0.05, r));
    }
  }
  for (let k = 0; k < 6; k++) for (let y = -k * 0.2; y <= k * 0.2; y += 0.2) v.set(-L / 2 - k * 0.2, y + k * 0.05, 0, pattern === goldP ? '#ffb020' : '#ff7a2a'); // tail
  for (let k = 0; k < 4; k++) v.set(-0.2 + k * 0.2, 0.75 + (k < 2 ? 0.2 : 0), 0, pattern === goldP ? '#ffcc40' : '#ff8a3a'); // dorsal
  for (const s of [-1, 1]) v.set(L / 2 - 0.5, 0.15, s * 0.45, '#111111'); // eyes
  for (const s of [-1, 1]) { v.set(L / 2 + 0.1, -0.15, s * 0.25, '#e8b8a0'); v.set(L / 2 + 0.3, -0.3, s * 0.35, '#e8b8a0'); } // barbels
  const g = new THREE.Group(); v.buildMerged(g); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
const kohaku = (x, y, z, t) => (noise2(x * 2, z * 2 + y, 3) > 0.5 ? '#e8401e' : '#fff6ec');
const sanke = (x, y, z, t) => { const n = noise2(x * 2.5, z * 2.5 + y, 8); return n > 0.7 ? '#1a1a1a' : n > 0.45 ? '#ef5a24' : '#fff6ec'; };
const ogon = () => '#ff8a1e';
const goldP = () => '#ffcf3a';
function placeKoi(model, x, y, z, pitch, yaw, roll = 0) {
  const m = model; m.scale.setScalar(1.6); m.position.set(x, y, z); m.rotation.set(roll, yaw, pitch, 'YXZ'); scene.add(m); return m;
}
// leaping up the waterfall
placeKoi(koiModel(kohaku), -2.5, 8, FACE + 4, 1.25, Math.PI / 2 + 0.2);
placeKoi(koiModel(sanke), 2.8, 14, FACE + 3.5, 1.35, Math.PI / 2 - 0.25);
placeKoi(koiModel(ogon), -1, 21, FACE + 3, 1.4, Math.PI / 2 + 0.1);
placeKoi(koiModel(kohaku), 4.5, 3.5, FACE + 7, 0.9, Math.PI / 2 - 0.5);
placeKoi(koiModel(sanke), -6, 2.8, FACE + 9, 0.7, Math.PI / 2 + 0.7);
// the hero: golden koi soaring through the gate
const HY = GY + 21;
const hero = placeKoi(koiModel(goldP), 0, HY, GZ + 1, 0.9, Math.PI / 2, 0.3);
hero.scale.setScalar(3.0);
glowSprite(scene, [0, HY, GZ + 1], 'rgba(255,215,110,0.7)', 7);
glowSprite(scene, [0, HY, GZ + 1], 'rgba(255,170,60,0.5)', 22, 0.35);
const hl = new THREE.PointLight('#ffd27a', 35, 30, 1.6); hl.position.set(0, HY - 4, GZ + 6); scene.add(hl);

// golden spiral of light around the hero (the transformation)
{
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = i / n, a = t * Math.PI * 10, rr = 2 + t * 7;
    pos[i * 3] = Math.cos(a) * rr + (r() - 0.5) * 1.2;
    pos[i * 3 + 1] = GY + 4 + t * 26 + (r() - 0.5) * 1.2;
    pos[i * 3 + 2] = GZ + 1 + Math.sin(a) * rr * 0.6 + (r() - 0.5) * 1.2;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffd77a', size: 0.45, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })));
}
// splashes + mist
{
  const n = 1600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * 10;
    pos[i * 3] = Math.cos(a) * d; pos[i * 3 + 1] = 1 + r() * 7 * (1 - d / 12); pos[i * 3 + 2] = FACE + 3 + Math.abs(Math.sin(a)) * d;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, transparent: true, opacity: 0.7, depthWrite: false })));
}

const count = vox.buildMerged(scene) + cloudSea(r, { tint: '#ffe6dc' }).buildMerged(scene, { shadow: false, emissive: 0x4a3838 });
points(scene, 500, { color: '#ffe4b0', size: 0.3, box: [110, 60, 110], center: [0, 0, 0], opacity: 0.7, additive: true, seed: 3 });
// sun right behind the gate
glowSprite(scene, [-300, 70, -160], 'rgba(255,220,150,1)', 170);
glowSprite(scene, [-300, 70, -160], 'rgba(255,160,90,0.5)', 460, 0.6);

camera.position.set(34, 44, 132);
camera.lookAt(0, 20, -8);
renderer.shadowMap.needsUpdate = true;
const comp = composer(renderer, scene, camera, Wd, Hd, { bloom: [0.55, 0.55, 0.82], ao: true });
comp.render();
window.__done = count;
