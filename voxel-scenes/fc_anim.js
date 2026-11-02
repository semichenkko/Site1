import { THREE, setup, composer, Voxels, vary, rng, fbm, hash2, noise2, glowSprite, points } from './engine2.js';
import { buildIsland, cloudSea, textMask } from './island2.js';

const Wd = window.W || 1440, Hd = window.H || 1080;
const FPS = 30;
const { renderer, scene, camera } = setup({
  w: Wd, h: Hd,
  sky: [[0, '#060a22'], [0.5, '#121d4a'], [0.8, '#2a2f66'], [1, '#5a3f6e']],
  fog: '#1c2350', fogDensity: 0.0022, exposure: 1.1,
});
camera.fov = 36; camera.updateProjectionMatrix();

scene.add(new THREE.HemisphereLight('#4a5aa8', '#2a1a20', 0.9));
const moon = new THREE.DirectionalLight('#9fb4ff', 1.6);
moon.position.set(-60, 90, -40); moon.castShadow = true; moon.shadow.mapSize.set(4096, 4096);
Object.assign(moon.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
moon.shadow.bias = -0.0003; moon.shadow.normalBias = 0.3; scene.add(moon);

const S = 0.5, vox = new Voxels(S), r = rng(18);
const box = (x0, x1, y0, y1, z0, z1, c, g) => { for (let x = x0; x <= x1 + 1e-6; x += S) for (let y = y0; y <= y1 + 1e-6; y += S) for (let z = z0; z <= z1 + 1e-6; z += S) vox.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c, g); };

// ---------- island: snowy ground ----------
const topAt = buildIsland(vox, r, {
  R: 58, seed: 9, ground: (x, z) => (Math.abs(x) < 42 && Math.abs(z) < 44 ? 0 : Math.max(0, (fbm(x * 0.07, z * 0.07, 4) - 0.4) * 5)),
  surface: (x, z, y, depth) => {
    if (depth > 0) return vary('#6a5040', 0.08, r);
    if (Math.abs(x) < 42 && Math.abs(z) < 44) { // stone plaza with snow patches
      const joint = Math.round(x / S) % 8 === 0 || Math.round(z / S) % 8 === 0;
      return fbm(x * 0.2, z * 0.2, 6) > 0.55 ? vary('#eef2fa', 0.03, r) : vary(joint ? '#7d7a80' : '#9c98a0', 0.05, r);
    }
    return fbm(x * 0.1, z * 0.1, 2) > 0.35 ? vary('#f2f5fc', 0.03, r) : vary('#4f6a4a', 0.1, r);
  },
});

const RED = '#a8241c', RED2 = '#8a1c16', YEL = '#e8a91c', YEL2 = '#d4931a', MARBLE = '#e8e6e0', SNOW = '#f6f8ff', GOLD = '#f2c040';
// marble terrace with balustrades
function terrace(cx, cz, hw, hd, y0, h) {
  box(cx - hw, cx + hw, y0 + S, y0 + h, cz - hd, cz + hd, () => vary(MARBLE, 0.03, r));
  for (let x = cx - hw; x <= cx + hw + 1e-6; x += S) for (const z of [cz - hd, cz + hd]) if (Math.round(x / S) % 3 === 0) vox.set(x, y0 + h + 0.5, z, '#f4f2ec'); else vox.set(x, y0 + h + 0.5, z, '#dcdad4');
  for (let z = cz - hd; z <= cz + hd + 1e-6; z += S) for (const x of [cx - hw, cx + hw]) vox.set(x, y0 + h + 0.5, z, Math.round(z / S) % 3 === 0 ? '#f4f2ec' : '#dcdad4');
  // snow on the terrace
  for (let x = cx - hw + 0.5; x <= cx + hw - 0.5; x += S) for (let z = cz - hd + 0.5; z <= cz + hd - 0.5; z += S) if (hash2(x, z, 3) < 0.25) vox.set(x, y0 + h + 0.5, z, SNOW);
}
// double-eave hip roof (golden glazed tiles + snow)
function hall(cx, cz, w, d, base, wallH, eaves = 2) {
  // columns + walls
  for (let x = cx - w; x <= cx + w + 1e-6; x += S) for (let z = cz - d; z <= cz + d + 1e-6; z += S) {
    const edge = Math.abs(Math.abs(x - cx) - w) < 0.01 || Math.abs(Math.abs(z - cz) - d) < 0.01;
    if (!edge) continue;
    for (let y = base + S; y <= base + wallH; y += S) {
      const col = Math.round((x - cx) / S) % 4 === 0;
      const front = Math.abs(z - (cz + d)) < 0.01;
      let c = vary(RED, 0.04, r), g = false;
      if (front && !col && y > base + 1 && y < base + wallH - 1) { c = Math.round((x + y) / S) % 2 ? '#c8783a' : '#9a5228'; g = true; } // lit lattice doors
      if (col) c = vary(RED2, 0.03, r);
      vox.set(x, y, z, c, g);
    }
  }
  // painted bracket band
  for (let x = cx - w; x <= cx + w + 1e-6; x += S) for (const z of [cz - d, cz + d]) { vox.set(x, base + wallH + 0.5, z, Math.round(x / S) % 3 ? '#2b5fa8' : '#3a9a6a'); vox.set(x, base + wallH + 1, z, GOLD); }
  // roofs
  let y = base + wallH + 1.5, ow = w + 3, od = d + 3;
  for (let e = 0; e < eaves; e++) {
    const layers = e === eaves - 1 ? 7 : 3;
    for (let k = 0; k < layers; k++) {
      const hw = ow - k * (e === eaves - 1 ? 1.0 : 0.8), hd = od - k * (e === eaves - 1 ? 1.0 : 0.8);
      if (hd < 0.5) break;
      for (let x = cx - hw; x <= cx + hw + 1e-6; x += S) for (let z = cz - hd; z <= cz + hd + 1e-6; z += S) {
        const rim = Math.abs(Math.abs(x - cx) - hw) < 0.6 || Math.abs(Math.abs(z - cz) - hd) < 0.6;
        const snow = hash2(x, z + k, 7) < (rim ? 0.12 : 0.32);
        vox.set(x, y + k * S * 1.2, z, snow ? vary(SNOW, 0.02, r) : vary(Math.round(x / S) % 2 ? YEL : YEL2, 0.05, r));
      }
      // upturned corners
      if (k === 0) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { vox.set(cx + sx * (hw + 0.5), y + 0.5, cz + sz * (hd + 0.5), YEL); vox.set(cx + sx * (hw + 1), y + 1, cz + sz * (hd + 1), YEL); }
    }
    // red lanterns under the eave
    if (e === 0) for (let x = cx - w + 1; x <= cx + w - 1; x += 4) {
      box(x - 0.5, x + 0.5, y - 2, y - 1, cz + od - 1, cz + od - 0.5, '#ff3b22', true);
      glowSprite(scene, [x, y - 1.5, cz + od - 0.5], 'rgba(255,70,40,0.9)', 3.2);
    }
    y += layers * S * 1.2 + (e === eaves - 1 ? 0 : 2.5);
    if (e === 0) { // upper wall between eaves
      for (let x = cx - w + 1; x <= cx + w - 1 + 1e-6; x += S) for (const z of [cz - d + 1, cz + d - 1]) for (let yy = y - 2.5; yy < y; yy += S) vox.set(x, yy, z, vary(RED, 0.04, r));
      ow = w + 2; od = d + 2;
    }
  }
  // ridge + dragon-head ends
  for (let x = cx - w + 1; x <= cx + w - 1; x += S) vox.set(x, y, cz, YEL2);
  for (const sx of [-1, 1]) box(cx + sx * (w - 1) - 0.5, cx + sx * (w - 1) + 0.5, y, y + 2, cz - 0.5, cz + 0.5, '#2f7d6e');
}

// main hall (Hall of Supreme Harmony)
terrace(0, -14, 24, 14, 0, 2); terrace(0, -14, 21, 12, 2, 2); terrace(0, -14, 18, 10, 4, 2);
// central stairs + carved ramp
box(-3, 3, S, 6, -4, 2, (x, y, z) => (Math.abs(x) < 1 ? vary('#d8d2c4', 0.03, r) : (Math.round((z + y) / S) % 2 ? '#f0eee8' : '#d8d6d0')));
hall(0, -15, 15, 7, 6, 7, 2);
// plaque on the main hall
{
  const T = textMask('太和殿', 22); const tv = new Voxels(0.125);
  const y1 = 6 + 7 + 5.5, sc = 6 / T.w;
  box(-3.5, 3.5, y1 - 2.2, y1 + 0.3, -15 + 7 + 3.2, -15 + 7 + 3.2, '#1d2f6a');
  for (const [px, py] of T.pts) tv.set(-3 + px * sc, y1 - py * sc, -15 + 7 + 3.6, '#ffd34a', true);
  tv.buildMerged(scene);
}
// flanking halls
hall(-30, -2, 6, 4, 1, 5, 1); hall(30, -2, 6, 4, 1, 5, 1);
box(-36, -24, S, 1, -6, 2, () => vary(MARBLE, 0.03, r)); box(24, 36, S, 1, -6, 2, () => vary(MARBLE, 0.03, r));
// red palace walls with golden caps around the courtyard
for (let x = -42; x <= 42; x += S) for (const z of [-34, 30]) {
  if (z === 30 && Math.abs(x) < 6) continue; // gate opening
  box(x, x, S, 4, z, z + 1, () => vary(RED, 0.04, r)); vox.set(x, 4.5, z, YEL); vox.set(x, 4.5, z + 1, YEL); vox.set(x, 5, z + 0.5, SNOW);
}
for (let z = -34; z <= 30; z += S) for (const x of [-42, 41]) { box(x, x + 1, S, 4, z, z, () => vary(RED, 0.04, r)); vox.set(x + 0.5, 4.5, z, YEL); vox.set(x + 0.5, 5, z, SNOW); }
// front gate tower
terrace(0, 31, 8, 3, 0, 4); hall(0, 31, 6, 2.5, 4, 4, 1);
// golden ornamental bronze cauldrons + lamp posts with lanterns along the imperial way
for (let z = -2; z <= 26; z += 6) for (const sx of [-1, 1]) {
  const x = sx * 9;
  box(x, x, S, 4, z, z, '#3a2a1a');
  box(x - 0.5, x + 0.5, 4.5, 5.5, z - 0.5, z + 0.5, '#ff3b22', true);
  glowSprite(scene, [x, 5, z], 'rgba(255,80,40,0.9)', 4.5);
}
for (let z = -1; z <= 29; z += S) for (let x = -2; x <= 2; x += S) vox.set(x, 0.5, z, vary('#c8c4bc', 0.04, r)); // imperial way

// ---------- trees with snow + plum blossoms ----------
for (let i = 0; i < 120; i++) {
  const a = r() * Math.PI * 2, d = 46 + r() * 10, x = Math.cos(a) * d, z = Math.sin(a) * d;
  const h = topAt(x, z); if (h === undefined) continue;
  const plum = r() < 0.4, H = 3 + r() * 3;
  for (let y = S; y <= H; y += S) vox.set(x, h + y, z, '#3a2a20');
  const rad = 1.5 + r();
  for (let a2 = -rad; a2 <= rad; a2 += S) for (let b = -rad; b <= rad; b += S) for (let c = 0; c <= rad; c += S)
    if (a2 * a2 + b * b + (c * 1.4) ** 2 < rad * rad && hash2(x + a2, z + b + c, 3) < 0.85)
      vox.set(x + a2, h + H + c, z + b, c > rad * 0.5 && hash2(a2, b, 1) < 0.6 ? SNOW : (plum ? vary('#e83a5a', 0.1, r) : vary('#2c4a3a', 0.12, r)));
}

const count = vox.buildMerged(scene) + cloudSea(r, { tint: '#3a3f6e', skyTint: '#2c3260', sky: 0 }).buildMerged(scene, { shadow: false, emissive: 0x141830 });

// warm light pools
for (const [x, y, z, i] of [[0, 10, -4, 45], [-10, 8, 14, 22], [10, 8, 14, 22], [0, 6, 28, 18], [-30, 6, 3, 14], [30, 6, 3, 14]]) {
  const l = new THREE.PointLight('#ff8a40', i, 40, 1.6); l.position.set(x, y, z); scene.add(l);
}


renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;

// ---------- helpers for small rigid models ----------
function model(build, size = 0.25) {
  const v = new Voxels(size);
  const bx = (x0, x1, y0, y1, z0, z1, c, g) => { for (let x = x0; x <= x1 + 1e-6; x += size) for (let y = y0; y <= y1 + 1e-6; y += size) for (let z = z0; z <= z1 + 1e-6; z += size) v.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c, g); };
  build(bx, v);
  const g = new THREE.Group(); v.buildMerged(g); g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  scene.add(g); return g;
}

// ---------- dragon dance ----------
const DN = 20;
const segs = [];
for (let i = 0; i < DN; i++) {
  segs.push(model((bx) => {
    bx(-0.75, 0.75, -0.75, 0.75, -0.75, 0.75, (x, y) => (y < -0.3 ? '#f2c040' : (i % 2 ? '#d42a1e' : '#e8401e')));
    bx(-0.25, 0.25, 1.0, 1.25, 0, 0, '#2f9a72');                     // fin
    bx(0, 0, -4.5, -0.75, 0, 0, '#5a3a22');                         // pole
    if (i % 2 === 0) { bx(-0.25, 0.25, -4.5, -3.5, 0.5, 0.75, '#2a2a2a'); bx(-0.25, 0.25, -3.5, -2.5, 0.5, 0.75, '#f4efe2'); bx(-0.25, 0.25, -2.5, -2.25, 0.5, 0.75, '#e0b08a'); bx(-0.25, 0.25, -2.25, -2.0, 0.5, 0.75, '#c0392b'); } // performer
  }));
}
const dHead = model((bx) => {
  bx(-1.0, 1.75, -1.0, 1.25, -1.25, 1.25, (x, y) => (y < -0.4 ? '#f2c040' : '#d42a1e'));
  bx(1.75, 2.75, -1.0, -0.25, -1.0, 1.0, '#f4efe2');               // jaw / teeth
  bx(1.75, 2.75, 0, 0.75, -1.0, 1.0, '#e8401e');
  for (const s of [-1, 1]) { bx(1.5, 1.75, 0.75, 1.0, s * 0.75, s * 0.75, '#fff3a0', true); bx(-0.75, -0.25, 1.25, 2.75, s * 0.75, s * 0.75, '#f2c040'); bx(2.5, 4.5, -0.5, -0.5, s * 1.0, s * 1.0, '#f7dc7a'); }
  bx(-1.25, -0.75, 0.5, 1.75, -1.0, 1.0, '#2f9a72');
  bx(0, 0, -4.5, -1.0, 0, 0, '#5a3a22');
  bx(-0.25, 0.25, -4.5, -3.5, 0.5, 0.75, '#2a2a2a'); bx(-0.25, 0.25, -3.5, -2.5, 0.5, 0.75, '#f4efe2'); bx(-0.25, 0.25, -2.5, -2.25, 0.5, 0.75, '#e0b08a');
});
const pearl = model((bx) => { bx(-0.5, 0.5, -0.5, 0.5, -0.5, 0.5, '#fff1c0', true); bx(0, 0, -5, -0.5, 0, 0, '#5a3a22'); });
const pearlGlow = glowSprite(scene, [0, 0, 0], 'rgba(255,220,150,1)', 6);
// winding path through the courtyard (figure-eight around the imperial way)
const dpath = (s) => { const a = s * 0.11; return new THREE.Vector3(Math.sin(a) * 15, 0, 15 + Math.sin(a * 2) * 6); };

// ---------- lion dancers ----------
function lionModel(c) {
  return model((bx) => {
    bx(-1.25, 1.0, 1.0, 2.25, -0.75, 0.75, c);                      // body cloth
    bx(1.0, 2.5, 1.5, 3.25, -1.0, 1.0, '#d42a1e');                  // head
    bx(2.5, 2.75, 1.5, 2.25, -0.75, 0.75, '#f4efe2');               // mouth
    for (const s of [-1, 1]) { bx(2.5, 2.5, 2.75, 3.0, s * 0.5, s * 0.5, '#ffffff'); bx(1.25, 1.75, 3.25, 3.5, s * 0.75, s * 0.75, '#f2c040'); }
    bx(1.0, 2.5, 3.25, 3.75, -1.0, 1.0, '#ffffff');                 // fur crest
    bx(1.5, 1.75, 3.75, 4.25, 0, 0, '#f2c040');                     // horn
    for (const ox of [-1.0, 0.75]) for (const oz of [-0.5, 0.5]) bx(ox, ox, 0, 1.0, oz, oz, '#f4efe2');
  });
}
const lions = [[lionModel('#e8401e'), -20, 8, 0], [lionModel('#f2c040'), 20, 9, 2]];

// ---------- crowd (instanced, jumping) ----------
const crowd = [];
for (let i = 0; i < 520; i++) {
  const side = r() < 0.5 ? -1 : 1, x = side * (13 + r() * 26), z = 2 + r() * 25;
  if (Math.abs(x) > 39) continue;
  crowd.push([x, z, r(), r() < 0.22]);
}
const bodyM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1.0, 0.5), new THREE.MeshStandardMaterial({ roughness: 0.9 }), crowd.length);
const headM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshStandardMaterial({ roughness: 0.9 }), crowd.length);
const lampM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.55, 0.45), new THREE.MeshBasicMaterial({ color: '#ff3b22', toneMapped: false }), crowd.length);
{
  const cc = new THREE.Color(), cols = ['#c0392b', '#2d5aa0', '#e2b33c', '#3e8e5a', '#7b3fa0', '#d97a2b', '#e8401e'];
  crowd.forEach((c, i) => { bodyM.setColorAt(i, cc.set(cols[Math.floor(c[2] * cols.length)])); headM.setColorAt(i, cc.set('#e0b08a')); });
  for (const m of [bodyM, headM, lampM]) { m.frustumCulled = false; scene.add(m); }
}
const M4 = new THREE.Matrix4();

// ---------- particles: fireworks, firecrackers, snow ----------
const NP = 60000;
const P = { pos: new Float32Array(NP * 3).fill(-9999), col: new Float32Array(NP * 3), vel: new Float32Array(NP * 3), base: new Float32Array(NP * 3), age: new Float32Array(NP).fill(99), life: new Float32Array(NP), grav: new Float32Array(NP), drag: new Float32Array(NP), tw: new Float32Array(NP), i: 0 };
const pg = new THREE.BufferGeometry();
pg.setAttribute('position', new THREE.BufferAttribute(P.pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(P.col, 3));
const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.75, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
pts.frustumCulled = false; scene.add(pts);
const fr = rng(2027);
function spawn(x, y, z, vx, vy, vz, c, life, grav, drag, tw = 0) {
  const j = P.i++ % NP;
  P.pos.set([x, y, z], j * 3); P.vel.set([vx, vy, vz], j * 3); P.base.set(c, j * 3);
  P.age[j] = 0; P.life[j] = life; P.grav[j] = grav; P.drag[j] = drag; P.tw[j] = tw;
}
const PALETTE = { red: [1, 0.18, 0.12], gold: [1, 0.72, 0.25], white: [1, 0.95, 0.85], green: [0.35, 1, 0.5], pink: [1, 0.45, 0.85], blue: [0.45, 0.65, 1], orange: [1, 0.5, 0.15] };
// shells: [launch time, x, z, burst height, color, type, size]
const shells = [];
{
  const sr = rng(8);
  const types = ['peony', 'peony', 'willow', 'ring', 'chrys', 'peony'];
  const cols = ['red', 'gold', 'red', 'gold', 'white', 'green', 'pink', 'blue', 'orange', 'red'];
  const add = (t, n) => { for (let k = 0; k < n; k++) shells.push([t + sr() * 0.5, (sr() - 0.5) * 120, -30 - sr() * 60, 42 + sr() * 40, cols[Math.floor(sr() * cols.length)], types[Math.floor(sr() * types.length)], 14 + sr() * 12]); };
  for (let t = -2.2; t < 2.0; t += 0.28) add(t, 1);
  for (let t = 2.0; t < 10.3; t += 0.5) add(t, 1);
  for (let t = 10.3; t < 13; t += 0.25) add(t, 2); // finale
  shells.push([-1.0, 0, -60, 70, 'gold', 'chrys', 24]); // the big one already blooming at t=0
}
const flashes = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight('#ffffff', 0, 160, 1.3); scene.add(l); return l; });
let flashI = 0;
function explode(x, y, z, colName, type, size) {
  const c = PALETTE[colName], n = type === 'chrys' ? 1600 : type === 'willow' ? 900 : 1000;
  const second = PALETTE[colName === 'gold' ? 'red' : 'gold'];
  for (let k = 0; k < n; k++) {
    let dx, dy, dz;
    if (type === 'ring') { const a = fr() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a) * 0.35; dz = Math.sin(a) * 0.9; }
    else { const u = fr() * 2 - 1, a = fr() * Math.PI * 2, s = Math.sqrt(1 - u * u); dx = s * Math.cos(a); dy = u; dz = s * Math.sin(a); }
    const sp = size * (0.85 + fr() * 0.25) * (type === 'willow' ? 0.8 : 1.0);
    const cc = type === 'chrys' && k % 3 === 0 ? second : c;
    spawn(x, y, z, dx * sp, dy * sp, dz * sp, cc, type === 'willow' ? 3.2 : 2.0 + fr() * 0.6, type === 'willow' ? 7 : 4, type === 'willow' ? 0.94 : 0.955, type === 'chrys' ? 1 : 0);
  }
  const l = flashes[flashI++ % flashes.length]; l.color.setRGB(...c); l.position.set(x, y, z); l.userData = { t: 0, peak: 260 };
}
function stepParticles(dt) {
  for (let j = 0; j < NP; j++) {
    if (P.age[j] > P.life[j]) { if (P.pos[j * 3 + 1] > -9000) P.pos[j * 3 + 1] = -9999; continue; }
    P.age[j] += dt;
    const d = P.drag[j];
    P.vel[j * 3] *= d; P.vel[j * 3 + 1] = P.vel[j * 3 + 1] * d - P.grav[j] * dt; P.vel[j * 3 + 2] *= d;
    P.pos[j * 3] += P.vel[j * 3] * dt; P.pos[j * 3 + 1] += P.vel[j * 3 + 1] * dt; P.pos[j * 3 + 2] += P.vel[j * 3 + 2] * dt;
    const k = Math.min(1, P.age[j] / P.life[j]);
    let b = Math.pow(1 - k, 1.4);
    if (P.tw[j] && k > 0.4) b *= fr() < 0.5 ? 1.4 : 0.2;
    P.col[j * 3] = P.base[j * 3] * b; P.col[j * 3 + 1] = P.base[j * 3 + 1] * b; P.col[j * 3 + 2] = P.base[j * 3 + 2] * b;
  }
  pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true;
}
const launched = new Set(), burst = new Set();
function fireworks(t, dt) {
  shells.forEach((sh, idx) => {
    const [t0, x, z, h, colName, type, size] = sh;
    const rise = 1.0, tb = t0 + rise;
    if (t >= t0 && t < tb) { // rocket trail
      const k = (t - t0) / rise, y = 4 + k * (h - 4);
      for (let q = 0; q < 6; q++) spawn(x + (fr() - 0.5) * 0.3, y - q * 0.4, z + (fr() - 0.5) * 0.3, (fr() - 0.5), -2, (fr() - 0.5), [1, 0.75, 0.4], 0.5, 2, 0.9);
    }
    if (t >= tb && !burst.has(idx)) { burst.add(idx); explode(x, h, z, colName, type, size); }
  });
  flashes.forEach(l => { if (l.userData.t !== undefined) { l.userData.t += dt; l.intensity = l.userData.peak * Math.max(0, 1 - l.userData.t / 0.8); } });
}
// firecrackers popping at the courtyard corners
const crackers = [[-34, 24], [34, 24], [-34, -2], [34, -2], [-12, 27], [12, 27]];
function firecrackers(t) {
  crackers.forEach(([x, z], k) => {
    if (Math.sin(t * 9 + k * 1.7) > 0.55) for (let q = 0; q < 25; q++) {
      const a = fr() * Math.PI * 2, s = 3 + fr() * 5;
      spawn(x, 1, z, Math.cos(a) * s, 2 + fr() * 5, Math.sin(a) * s, fr() < 0.6 ? [1, 0.3, 0.15] : [1, 0.85, 0.4], 0.35 + fr() * 0.3, 12, 0.9);
    }
  });
}
// snow
const NS = 5000, sp = new Float32Array(NS * 3), sr2 = rng(4);
for (let i = 0; i < NS; i++) sp.set([(sr2() - 0.5) * 160, sr2() * 90 - 10, (sr2() - 0.5) * 160], i * 3);
const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
const snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.3, transparent: true, opacity: 0.85, depthWrite: false }));
snow.frustumCulled = false; scene.add(snow);
glowSprite(scene, [-180, 160, -260], 'rgba(220,230,255,1)', 40);
glowSprite(scene, [-180, 160, -260], 'rgba(150,170,255,0.4)', 160, 0.5);

// ---------- camera ----------
const keys = [
  [0.0, [34, 120, 210], [0, 52, -50]],
  [2.5, [30, 48, 100], [0, 12, -8]],
  [4.6, [28, 17, 30], [0, 4, 12]],
  [7.0, [-26, 15, 26], [0, 4, 12]],
  [9.0, [-40, 30, 56], [0, 10, -6]],
  [11.0, [-30, 56, 112], [0, 32, -30]],
  [13.0, [-10, 76, 154], [0, 46, -46]],
];
const pC = new THREE.CatmullRomCurve3(keys.map(k => new THREE.Vector3(...k[1])), false, 'centripetal');
const lC = new THREE.CatmullRomCurve3(keys.map(k => new THREE.Vector3(...k[2])), false, 'centripetal');
function camAt(t) {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const f = Math.min(1, Math.max(0, (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0])));
  const u = (i + f) / (keys.length - 1);
  return [pC.getPoint(u), lC.getPoint(u)];
}

let simT = -2.0; // pre-roll so the sky is already full at frame 0
function simulateTo(t) {
  const dt = 1 / FPS;
  while (simT < t - 1e-6) { simT += dt; fireworks(simT, dt); if (simT > -0.5) firecrackers(simT); stepParticles(dt); }
}

window.renderFrame = (fi, skip) => {
  const t = fi / FPS;
  simulateTo(t);
  // dragon dance
  const sHead = t * 9;
  for (let i = 0; i < DN; i++) {
    const p = dpath(sHead - (i + 1) * 1.55), y = 4.2 + Math.sin(t * 6 - i * 0.55) * 1.1;
    segs[i].position.set(p.x, y, p.z);
    const q = dpath(sHead - (i + 1) * 1.55 + 0.2); segs[i].rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
  }
  const hp = dpath(sHead), hq = dpath(sHead + 0.3);
  dHead.position.set(hp.x, 4.6 + Math.sin(t * 6 + 0.6) * 1.2, hp.z); dHead.rotation.y = -Math.atan2(hq.z - hp.z, hq.x - hp.x);
  const pp = dpath(sHead + 4.5); pearl.position.set(pp.x, 6 + Math.sin(t * 8) * 0.8, pp.z); pearlGlow.position.copy(pearl.position);
  // lions
  lions.forEach(([m, x, z, ph]) => {
    const jump = Math.max(0, Math.sin(t * 4 + ph)) * 1.4;
    m.position.set(x + Math.sin(t * 1.3 + ph) * 3, 0.5 + jump, z + Math.cos(t * 1.1 + ph) * 2);
    m.rotation.y = Math.sin(t * 1.5 + ph) * 0.8; m.rotation.z = Math.sin(t * 8 + ph) * 0.12;
  });
  // crowd
  crowd.forEach(([x, z, ph, lamp], i) => {
    const j = Math.max(0, Math.sin(t * (6 + ph * 4) + ph * 30)) * 0.35;
    M4.makeTranslation(x, 1.0 + j, z); bodyM.setMatrixAt(i, M4);
    M4.makeTranslation(x, 1.75 + j, z); headM.setMatrixAt(i, M4);
    M4.makeTranslation(x + 0.3, lamp ? 2.6 + j + Math.sin(t * 3 + ph * 9) * 0.1 : -999, z); lampM.setMatrixAt(i, M4);
  });
  bodyM.instanceMatrix.needsUpdate = headM.instanceMatrix.needsUpdate = lampM.instanceMatrix.needsUpdate = true;
  // snow falls
  for (let i = 0; i < NS; i++) { sp[i * 3 + 1] -= 0.12; sp[i * 3] += Math.sin(t + i) * 0.02; if (sp[i * 3 + 1] < -10) sp[i * 3 + 1] += 90; }
  sg.attributes.position.needsUpdate = true;
  if (skip) return null;
  const [cp, cl] = camAt(t);
  camera.position.copy(cp);
  if (t < 2.5) { const s = 0.35 * (1 - t / 2.5); camera.position.x += Math.sin(t * 21) * s; camera.position.y += Math.sin(t * 27) * s; }
  camera.lookAt(cl);
  comp.render();
  return renderer.domElement.toDataURL('image/png');
};

const comp = composer(renderer, scene, camera, Wd, Hd, { bloom: [0.75, 0.55, 0.78], ao: true });
window.__done = count;
