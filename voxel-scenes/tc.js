import { THREE, setup, composer, overlay, Voxels, vary, rng, fbm, hash2, noise2, glowSprite, points } from './engine2.js';
import { buildIsland, cloudSea } from './island2.js';

const Wd = window.W || 1440, Hd = window.H || 1080;
const { renderer, scene, camera } = setup({
  w: Wd, h: Hd,
  sky: [[0, '#1a1c3a'], [0.4, '#4a3550'], [0.65, '#b85a40'], [0.85, '#f09048'], [1, '#ffd08a']],
  fog: '#c87a58', fogDensity: 0.0032, exposure: 1.0,
});
camera.fov = 34; camera.updateProjectionMatrix();

scene.add(new THREE.HemisphereLight('#9a8ac8', '#4a2a1c', 0.8));
const sunL = new THREE.DirectionalLight('#ffa860', 5.0);
sunL.position.set(-70, 40, -80); sunL.castShadow = true; sunL.shadow.mapSize.set(4096, 4096);
Object.assign(sunL.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sunL.shadow.bias = -0.0003; sunL.shadow.normalBias = 0.3; scene.add(sunL);
const fill = new THREE.DirectionalLight('#ffcfa0', 0.9); fill.position.set(40, 50, 100); scene.add(fill);

const S = 0.5, vox = new Voxels(S), r = rng(77);
const PIT = { x0: -32, x1: 32, z0: -32, z1: 22, d: -4.5 };
const inPit = (x, z) => x >= PIT.x0 && x <= PIT.x1 && z >= PIT.z0 && z <= PIT.z1;
const WALLS = [-26, -19.5, -13, -6.5, 0, 6.5, 13, 19.5, 26];
const isWall = (x, z) => z < 8 && WALLS.some(w => Math.abs(x - w) <= 0.75);
function ground(x, z) {
  if (inPit(x, z)) return isWall(x, z) ? -0.5 : PIT.d;
  const hills = Math.max(0, (fbm(x * 0.05, z * 0.05, 3) - 0.35) * 10) * Math.min(1, Math.max(0, (Math.hypot(x, z) - 38) / 10));
  return hills;
}
const topAt = buildIsland(vox, r, {
  R: 58, ground, seed: 3, depthScale: 26,
  surface: (x, z, y, depth, steep) => {
    if (inPit(x, z)) {
      if (isWall(x, z)) return depth === 0 ? vary('#9c7a58', 0.08, r) : vary(((Math.round(y / S) % 3) ? '#8a6a4c' : '#7a5c42'), 0.06, r); // rammed earth layers
      return vary(hash2(x, z, 4) < 0.15 ? '#7a6250' : '#8f7458', 0.07, r); // pit floor
    }
    if (depth === 0) { const n = fbm(x * 0.1, z * 0.1, 8); return vary(n > 0.55 ? '#8a9a4c' : n > 0.4 ? '#a89a62' : '#b89a6a', 0.1, r); }
    return vary(((Math.round(y / S) % 3) ? '#9a7656' : '#86664a'), 0.06, r);
  },
});
// pit rim walls (layered loess) + timber beams across the back trenches
for (let x = PIT.x0; x <= PIT.x1; x += S) for (let y = PIT.d; y <= 0; y += S) { vox.set(x, y, PIT.z0 - 0.5, vary((Math.round(y / S) % 2) ? '#8a6a4c' : '#76583e', 0.06, r)); }
for (const w of WALLS) for (let z = -31; z <= -16; z += 3.5) for (let x = w; x <= w + 6.5 && x <= 32; x += S) if (hash2(w, z, 2) < 0.6) vox.set(x, -0.5, z, vary('#5a4030', 0.1, r));

// ---------- fine voxels for the army ----------
const A = new Voxels(0.25), F = 0.25;
const cub = (x0, x1, y0, y1, z0, z1, c, g) => { for (let x = x0; x <= x1 + 1e-6; x += F) for (let y = y0; y <= y1 + 1e-6; y += F) for (let z = z0; z <= z1 + 1e-6; z += F) A.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c, g); };
const clay = (base, amt = 0.08) => () => vary(base, amt, r);
function soldier(ox, oy, oz, { awake = false, cracks = false, scale = 1, sword = false, kneel = false, tone = 0 } = {}) {
  const T = ['#b37e5e', '#a87458', '#bb8866', '#9e6c52'][tone % 4], ARM = '#8a5c44', DARK = '#6e4836';
  const s = (v) => v * scale;
  const X = (v) => ox + s(v), Y = (v) => oy + s(v), Z = (v) => oz + s(v);
  const box = (x0, x1, y0, y1, z0, z1, c, g) => cub(X(x0), X(x1), Y(y0), Y(y1), Z(z0), Z(z1), c, g);
  box(-0.75, 0.75, 0, 0.25, -0.75, 0.75, clay('#9a7a62'));                                   // plinth
  const legH = kneel ? 0.75 : 1.5;
  box(-0.5, -0.25, 0.25, legH, -0.25, 0.25, clay(T)); box(0.25, 0.5, 0.25, legH, -0.25, 0.25, clay(T));
  box(-0.5, -0.25, 0.25, 0.5, -0.25, 0.5, clay(DARK)); box(0.25, 0.5, 0.25, 0.5, -0.25, 0.5, clay(DARK)); // shoes
  const t0 = legH;
  box(-0.75, 0.75, t0, t0 + 0.5, -0.5, 0.5, clay(T));                                         // robe skirt
  box(-0.75, 0.75, t0 + 0.5, t0 + 1.5, -0.5, 0.5, (x, y, z) => vary(((Math.round(x / F) + Math.round(y / F)) % 2) ? ARM : '#7a4e3a', 0.06, r)); // armour plates
  for (const xx of [-0.5, 0, 0.5]) box(xx, xx, t0 + 1.25, t0 + 1.25, 0.5, 0.5, clay('#94684e', 0.03));   // rivets
  // arms
  box(-1.0, -0.75, t0 + 0.5, t0 + 1.5, -0.25, 0.25, clay(T));
  if (sword) { box(0.75, 1.0, t0 + 1.25, t0 + 2.75, -0.25, 0.25, clay(T)); box(0.75, 1.0, t0 + 2.75, t0 + 4.25, 0, 0, '#d8dee6', awake); }
  else { box(0.75, 1.0, t0 + 0.75, t0 + 1.5, -0.25, 0.5, clay(T)); box(0.75, 1.0, t0 + 0.75, t0 + 0.75, 0.5, 0.75, clay(T)); }
  // head with topknot
  box(-0.25, 0.25, t0 + 1.5, t0 + 1.75, -0.25, 0.25, clay(T));
  box(-0.5, 0.5, t0 + 1.75, t0 + 2.5, -0.5, 0.5, clay('#b88466'));
  box(-0.5, 0.5, t0 + 2.5, t0 + 2.75, -0.5, 0.25, clay('#5a3e30'));                               // hair
  box(0.25, 0.5, t0 + 2.75, t0 + 3.0, -0.25, 0, clay('#5a3e30'));                                 // topknot
  box(-0.25, 0.25, t0 + 1.75, t0 + 1.75, 0.5, 0.5, clay('#7a5440'));                              // beard line
  const eye = awake ? '#ffcf5a' : '#4a3226';
  box(-0.25, -0.25, t0 + 2.25, t0 + 2.25, 0.5, 0.5, eye, awake); box(0.25, 0.25, t0 + 2.25, t0 + 2.25, 0.5, 0.5, eye, awake);
  if (cracks) { // glowing cracks
    for (let k = 0; k < 6; k++) { const yy = t0 + 0.5 + k * 0.25, xx = -0.5 + ((k * 3) % 5) * 0.25; box(xx, xx, yy, yy, 0.5, 0.5, '#ff9a3a', true); }
  }
}
// rows of soldiers in the trenches
let tone = 0;
for (let wi = 0; wi < WALLS.length - 1; wi++) {
  const cx = (WALLS[wi] + WALLS[wi + 1]) / 2;
  for (let row = 0; row < 9; row++) for (const off of [-1.5, 1.5]) {
    const z = 6 - row * 4.2, x = cx + off;
    const awake = row < 1 || hash2(x, z, 9) < 0.08;
    soldier(x, PIT.d + 0.5, z, { awake, tone: tone++ });
  }
}
// vanguard: three transverse rows of kneeling archers + standing crossbowmen, and the general
for (let x = -28; x <= 28; x += 3.2) {
  soldier(x, PIT.d + 0.5, 11, { awake: true, cracks: hash2(x, 1, 3) < 0.4, kneel: true, tone: tone++ });
  if (Math.abs(x) > 6) soldier(x + 1.6, PIT.d + 0.5, 14.5, { awake: true, cracks: hash2(x, 2, 3) < 0.4, tone: tone++ });
}
soldier(0, PIT.d + 0.5, 17, { awake: true, cracks: true, scale: 1.7, sword: true });
// war chariot with four horses
function horse(ox, oy, oz) {
  const H = '#a87458';
  cub(ox - 1.5, ox + 1.5, oy + 1.5, oy + 2.75, oz - 0.5, oz + 0.5, clay(H));
  for (const [lx, lz] of [[-1.25, -0.5], [-1.25, 0.25], [1.0, -0.5], [1.0, 0.25]]) cub(ox + lx, ox + lx + 0.25, oy, oy + 1.5, oz + lz, oz + lz + 0.25, clay(H));
  cub(ox + 1.25, ox + 2.25, oy + 2.5, oy + 3.75, oz - 0.25, oz + 0.25, clay(H));
  cub(ox + 1.75, ox + 2.75, oy + 3.25, oy + 3.75, oz - 0.25, oz + 0.25, clay(H));
  cub(ox + 1.0, ox + 1.5, oy + 3.75, oy + 4.0, oz - 0.25, oz + 0.25, clay('#5a3e30'));
  cub(ox + 2.5, ox + 2.5, oy + 3.5, oy + 3.5, oz - 0.25, oz - 0.25, '#ffcf5a', true); cub(ox + 2.5, ox + 2.5, oy + 3.5, oy + 3.5, oz + 0.25, oz + 0.25, '#ffcf5a', true);
}
{
  const cx = -14, cz = 17.5, y0 = PIT.d + 0.5;
  for (const hz of [-2.25, -0.75, 0.75, 2.25]) horse(cx + 4, y0, cz + hz);
  cub(cx - 2, cx + 0.5, y0 + 1.25, y0 + 2.25, cz - 1.5, cz + 1.5, clay('#8a6248'));
  for (const wz of [-1.75, 1.75]) for (let a = 0; a < Math.PI * 2; a += 0.25) A.set(cx - 0.75 + Math.cos(a) * 1.1, y0 + 1.1 + Math.sin(a) * 1.1, cz + wz, vary('#6e4836', 0.08, r));
  cub(cx + 0.5, cx + 3, y0 + 1.75, y0 + 1.75, cz, cz, clay('#6e4836'));
  // canopy
  cub(cx - 1.25, cx - 1.0, y0 + 2.25, y0 + 4.5, cz, cz, clay('#6e4836'));
  for (let a = -1.75; a <= 1.75; a += F) for (let b = -1.75; b <= 1.75; b += F) if (a * a + b * b < 3.1) A.set(cx - 1.1 + a, y0 + 4.6 - (a * a + b * b) * 0.08, cz + b, vary('#9a6e50', 0.06, r));
  soldier(cx - 1.25, y0 + 2.25, cz + 0.75, { awake: true, tone: 1, scale: 0.8 });
}

// ---------- surroundings ----------
for (let i = 0; i < 110; i++) {
  const a = r() * Math.PI * 2, d = 42 + r() * 14, x = Math.cos(a) * d, z = Math.sin(a) * d;
  const h = topAt(x, z); if (h === undefined || inPit(x, z) || z > 10) continue;
  const H = 3 + r() * 3;
  for (let y = S; y <= H; y += S) vox.set(x, h + y, z, '#4a3424');
  const rad = 1.4 + r() * 1.2, c = r() < 0.5 ? '#3a5a34' : (r() < 0.5 ? '#c27a2a' : '#8a9a3c');
  for (let a2 = -rad; a2 <= rad; a2 += S) for (let b = -rad; b <= rad; b += S) for (let cc = -rad * 0.5; cc <= rad; cc += S)
    if (a2 * a2 + b * b + cc * cc * 1.6 < rad * rad && hash2(x + a2, z + b + cc, 3) < 0.9) vox.set(x + a2, h + H + cc, z + b, vary(c, 0.12, r));
}
// torches around the pit rim
for (let x = PIT.x0; x <= PIT.x1; x += 8) for (const z of [PIT.z1 + 1.5]) {
  vox.set(x, 0.5, z, '#3a2a1a'); vox.set(x, 1, z, '#3a2a1a'); vox.set(x, 1.5, z, '#ffb347', true);
  glowSprite(scene, [x, 1.8, z], 'rgba(255,150,60,0.95)', 3.5);
}
for (const [x, z] of [[-20, 20], [20, 20], [0, 22]]) { const l = new THREE.PointLight('#ff9a4a', 40, 30, 1.6); l.position.set(x, 3, z); scene.add(l); }

const count = vox.buildMerged(scene) + A.buildMerged(scene) + cloudSea(r, { tint: '#f0b49a', skyTint: '#e8a088' }).buildMerged(scene, { shadow: false, emissive: 0x3a2018 });

// eye glow sprites on the front rows + general
glowSprite(scene, [0, PIT.d + 0.5 + 1.7 * (1.5 + 2.25), 17 + 0.85], 'rgba(255,200,90,1)', 3);
// dust in the air + falling from awakened soldiers
points(scene, 2500, { color: '#e8c49a', size: 0.25, box: [70, 14, 60], center: [0, -4, -6], opacity: 0.55, seed: 5 });
points(scene, 600, { color: '#ffb060', size: 0.35, box: [70, 10, 20], center: [0, -3, 12], opacity: 0.9, additive: true, seed: 6 });
// god-ray shafts from the low sun
for (let i = 0; i < 4; i++) {
  const g = new THREE.BoxGeometry(5 + r() * 5, 90, 0.2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ffb070', transparent: true, opacity: 0.025 + r() * 0.02, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.position.set(-30 + i * 10 + r() * 4, 20, -20 - r() * 10); m.rotation.set(0.25, 0.5, -0.55);
  overlay.add(m);
}
glowSprite(scene, [-240, 50, -300], 'rgba(255,200,130,1)', 170);
glowSprite(scene, [-240, 50, -300], 'rgba(255,130,70,0.5)', 460, 0.6);

camera.position.set(16, 14, 50);
camera.lookAt(-3, -2, 0);
renderer.shadowMap.needsUpdate = true;
const comp = composer(renderer, scene, camera, Wd, Hd, { bloom: [0.6, 0.5, 0.8], ao: true });
comp.render();
window.__done = count;
