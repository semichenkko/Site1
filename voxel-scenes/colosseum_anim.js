import { THREE, setup, composer, overlay, Voxels, vary, col, rng, fbm, hash2, noise2, glowSprite } from './engine2.js';

const Wd = window.W || 1440, Hd = window.H || 1080;
const FPS = 30;
const { renderer, scene, camera } = setup({
  w: Wd, h: Hd,
  sky: [[0, '#26335f'], [0.4, '#5d5a8e'], [0.66, '#d9877a'], [0.84, '#f6b46e'], [1, '#ffe0a8']],
  fog: '#e2a487', fogDensity: 0.0026, exposure: 1.02,
});
camera.fov = 38; camera.near = 0.3; camera.updateProjectionMatrix();

// ---------- light ----------
scene.add(new THREE.HemisphereLight('#a7b4e6', '#7a5638', 1.05));
const sunL = new THREE.DirectionalLight('#ffbe7d', 5.0);
sunL.position.set(70, 55, 95);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
Object.assign(sunL.shadow.camera, { left: -62, right: 62, top: 62, bottom: -62, near: 1, far: 400 });
sunL.shadow.bias = -0.0003; sunL.shadow.normalBias = 0.25;
scene.add(sunL);
const rimL = new THREE.DirectionalLight('#ff9a6a', 1.2); rimL.position.set(-80, 30, -60); scene.add(rimL);

const S = 0.5;
const vox = new Voxels(S);
const r = rng(5);
const A = 30, B = 24.5;
const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const uOf = (x, z) => Math.hypot(x / A, z / B);

// ---------- island ----------
const R = 58, tops = new Map(), bots = new Map();
const ck = (ix, iz) => ix * 4096 + iz;
function ground(x, z) {
  const u = uOf(x, z);
  if (u < 1.22) return 0;
  return Math.max(0, (fbm(x * 0.05, z * 0.05, 3) - 0.35) * 6 * Math.min(1, (u - 1.22) * 2));
}
for (let ix = -Math.ceil((R + 4) / S); ix <= Math.ceil((R + 4) / S); ix++)
  for (let iz = -Math.ceil((R + 4) / S); iz <= Math.ceil((R + 4) / S); iz++) {
    const x = ix * S, z = iz * S, d = Math.hypot(x, z);
    const edgeR = R + (fbm(x * 0.12, z * 0.12, 5) - 0.5) * 7;
    if (d > edgeR) continue;
    const t = d / edgeR;
    tops.set(ck(ix, iz), Math.round(ground(x, z) / S));
    const depth = 22 * (1 - t * t) * (0.55 + 0.7 * fbm(x * 0.25, z * 0.25, 9)) + 3 + 7 * Math.max(0, noise2(x * 0.6, z * 0.6, 4) - 0.6);
    bots.set(ck(ix, iz), -Math.round(depth / S));
  }
const topAt = (x, z) => { const v = tops.get(ck(Math.round(x / S), Math.round(z / S))); return v === undefined ? undefined : v * S; };
for (const [key, h] of tops) {
  const ix = Math.round(key / 4096), iz = key - ix * 4096, b = bots.get(key);
  const nb = [ck(ix + 1, iz), ck(ix - 1, iz), ck(ix, iz + 1), ck(ix, iz - 1)];
  const nt = nb.map(k => tops.get(k)), nbt = nb.map(k => bots.get(k));
  const edgeCol = nt.some(v => v === undefined);
  const minNT = Math.min(...nt.map(v => v ?? -999)), maxNB = Math.max(...nbt.map(v => v ?? 999));
  const x = ix * S, z = iz * S, u = uOf(x, z);
  const fillTo = edgeCol ? b : Math.min(minNT, h);
  const fillBot = edgeCol ? b : Math.min(maxNB, Math.min(minNT, h));
  for (let iy = h; iy >= fillTo; iy--) {
    const depth = h - iy, y = iy * S;
    let c;
    if (edgeCol && depth > 2) {
      const band = ((Math.floor(y * 0.7 + fbm(x * 0.2, z * 0.2, 3) * 3) % 3) + 3) % 3;
      c = vary(['#8a6a52', '#9c7a5c', '#76584a'][band], 0.07, r);
    } else if (depth === 0) {
      if (u < 1.18) { // travertine plaza with paving joints
        const joint = (Math.round(x / S) % 6 === 0) || (Math.round(z / S) % 6 === 0);
        c = vary(joint ? '#b9a27e' : '#d8c49e', 0.05, r);
      } else {
        const hn = fbm(x * 0.09, z * 0.09, 44);
        c = vary(hn > 0.56 ? '#93a650' : hn > 0.42 ? '#76a04a' : '#5f8c40', 0.1, r);
      }
    } else c = vary('#6a5040', 0.08, r);
    vox.seti(ix, iy, iz, c);
  }
  for (let iy = b; iy <= fillBot; iy++) vox.seti(ix, iy, iz, vary(['#5e4438', '#6d5040', '#4f3a32'][Math.floor(hash2(x, iy, 2) * 3)], 0.06, r));
}

// ---------- the Colosseum ----------
const TRAV = '#dcc8a2', TRAV2 = '#cbb48c', TRAV_D = '#a8916c', MARBLE = '#efe6d4';
const N = 40, TIER = 6, HFULL = 25;
const PERIM = Math.PI * (3 * (A + B) - Math.sqrt((3 * A + B) * (A + 3 * B)));
const WB = PERIM / N;
const ruinCenter = -0.1, ruinWidth = 1.45;
function ruin(th) {
  const bay = Math.floor((((th / (2 * Math.PI)) * N) % N + N) % N);
  const fall = Math.max(0, 1 - angDist(th, ruinCenter) / (ruinWidth / 2));
  const jag = hash2(bay, 1, 5), jag2 = hash2(bay, 2, 5);
  const outer = fall <= 0 ? HFULL : Math.max(1.5, HFULL - Math.min(1, fall * 2.3) * 21 - jag * 4);
  const inner = fall <= 0 ? 20 : Math.max(8, 20 - fall * 7 - jag2 * 3);
  return { outer, inner, fall };
}
for (let x = -A - 2; x <= A + 2; x += S) for (let z = -B - 2; z <= B + 2; z += S) {
  const u = uOf(x, z);
  if (u > 1.03) continue;
  const th = Math.atan2(z / B, x / A);
  if (u < 0.42) { // arena sand with rake marks
    const rake = noise2(x * 0.8, z * 3, 7) > 0.62;
    vox.set(x, 0.5, z, vary(rake ? '#d6b47a' : '#e6c98f', 0.04, r));
    continue;
  }
  if (u < 0.46) { // podium wall: marble top, painted band
    for (let y = 0.5; y <= 3.5; y += S) {
      let c = vary(MARBLE, 0.03, r);
      if (y === 2) c = vary('#8e2a22', 0.05, r);
      if (y === 3.5) c = vary('#f6f0e2', 0.02, r);
      vox.set(x, y, z, c);
    }
    continue;
  }
  const { outer, inner, fall } = ruin(th);
  if (u < 0.85) { // seating: three maeniana with walkways
    const k = (u - 0.46) / 0.39;
    let h = 3.5 + Math.floor(k * 30) * 0.5;
    const broken = fall > 0 && u > 0.66;
    if (broken) h = Math.min(h, inner - 2.5 - hash2(Math.round(x), Math.round(z), 3) * 2);
    const walkway = Math.abs(k - 0.36) < 0.025 || Math.abs(k - 0.7) < 0.025;
    for (let y = 0.5; y <= h; y += S) {
      let c = vary(TRAV_D, 0.07, r);
      if (y === h) c = vary(walkway ? '#c9b28a' : (Math.floor(k * 30) % 2 ? MARBLE : '#e2d5bb'), 0.04, r);
      vox.set(x, y, z, c);
    }
    continue;
  }
  const outerRing = u > 0.94;
  const H = outerRing ? outer : inner;
  const f = (((th / (2 * Math.PI)) * N) % 1 + 1) % 1;
  const a = (f - 0.5) * WB;
  for (let y = 0.5; y <= H; y += S) {
    const tier = Math.floor((y - 0.5) / TIER), ly = (y - 0.5) - tier * TIER;
    let empty = false;
    if (tier < 3) {
      const ay = ly - 3.2;
      const arch = Math.abs(a) < 1.45 && (ly < 3.2 || ay * ay + a * a < 1.45 * 1.45);
      if (arch && (u > 0.86)) empty = true;
      // ambulatory corridor between the two arcades
      if (u > 0.9 && u < 0.945 && ly < 4.6 && Math.abs(a) < WB / 2 - 0.7) empty = true;
    } else if (ly > 1.5 && ly < 3 && Math.abs(a) < 0.6 && Math.floor(th / (2 * Math.PI) * N + N) % 2 === 0) empty = true;
    if (empty) continue;
    let c = vary(hash2(x * 3 + y, z, 21) < 0.08 ? TRAV_D : TRAV, 0.06, r);
    if (ly > TIER - 1.1) c = vary('#e8d8b4', 0.04, r);           // entablature
    if (Math.abs(ly - 3.2) < 0.3 && Math.abs(a) < 1.9 && Math.abs(a) > 1.3) c = vary('#e9dab8', 0.04, r); // arch imposts
    if (H < HFULL && y > H - 1.5 && hash2(x, z + y, 22) < 0.35) c = vary('#b49a72', 0.06, r);
    vox.set(x, y, z, c);
  }
  // engaged half-columns and cornices on the facade
  if (u > 0.985 && H > 2) {
    const ox = x * 1.025, oz = z * 1.025;
    for (let y = 0.5; y <= Math.min(H, 19); y += S) {
      const ly = (y - 0.5) % TIER;
      if (ly > TIER - 1.1 || Math.abs(Math.abs(a) - WB / 2) < 0.5) vox.set(ox, y, oz, vary(ly > TIER - 1.1 ? '#efe1c0' : '#e3d2ae', 0.04, r));
      if (Math.abs(ly - (TIER - 0.75)) < 0.01) vox.set(x * 1.045, y, z * 1.045, vary('#efe1c0', 0.04, r));
    }
  }
  // flag poles along the top of the intact attic
  if (!fall && u > 0.97 && Math.abs(f - 0.5) < 0.03 && Math.floor(th / (2 * Math.PI) * N + N) % 4 === 0) {
    for (let y = HFULL + 0.5; y <= HFULL + 4; y += S) vox.set(x, y, z, '#5a4632');
  }
}
// rubble below the broken side
for (let i = 0; i < 520; i++) {
  const th = ruinCenter + (r() - 0.5) * ruinWidth * 0.95;
  const rr = 1.03 + Math.pow(r(), 2) * 0.25;
  const x = Math.cos(th) * A * rr, z = Math.sin(th) * B * rr;
  const h = topAt(x, z) ?? 0;
  const s = r() < 0.3 ? 1 : 0.5;
  for (let dx = 0; dx <= s; dx += S) for (let dz = 0; dz <= s; dz += S) for (let dy = S; dy <= s + S; dy += S)
    vox.set(x + dx, h + dy, z + dz, vary(r() < 0.5 ? TRAV : TRAV_D, 0.08, r));
}
// imperial box (pulvinar) on the north side
{
  const cx = 0, cz = -B * 0.58, base = 7;
  for (let x = cx - 3; x <= cx + 3; x += S) for (let z = cz - 2; z <= cz + 1; z += S) vox.set(x, base, z, vary(MARBLE, 0.02, r));
  for (const sx of [-3, 3]) for (const sz of [-2, 1]) for (let y = base + 0.5; y <= base + 4; y += S) vox.set(cx + sx, y, cz + sz, '#e2b33c');
  for (let x = cx - 3.5; x <= cx + 3.5; x += S) for (let z = cz - 2.5; z <= cz + 1.5; z += S)
    vox.set(x, base + 4.5 + Math.max(0, 1 - Math.abs(x - cx) / 3.5) * 1.5, z, vary(Math.round(x / S) % 2 ? '#7b1f5a' : '#9b2a6f', 0.05, r));
  for (let x = cx - 1; x <= cx + 1; x += S) vox.set(x, base + 0.5, cz - 1, '#e2b33c'), vox.set(x, base + 1, cz - 1.5, '#e2b33c');
}
// gates of life / death in the podium (major axis)
for (const sx of [-1, 1]) for (let z = -1.5; z <= 1.5; z += S) for (let y = 0.5; y <= 3; y += S) vox.set(sx * A * 0.44, y, z, '#2a1d16');

// ---------- Arch of Constantine ----------
function triumphalArch(cx, cz) {
  for (let x = -5; x <= 5; x += S) for (let z = -1.5; z <= 1.5; z += S) for (let y = 0.5; y <= 10; y += S) {
    const ax = Math.abs(x);
    const mainArch = ax < 1.6 && (y < 5 || (y - 5) ** 2 + x * x < 1.6 * 1.6);
    const sideArch = Math.abs(ax - 3.6) < 0.9 && (y < 3 || (y - 3) ** 2 + (ax - 3.6) ** 2 < 0.81);
    if ((mainArch || sideArch) && y < 8) continue;
    let c = vary(y > 7.5 ? '#e8dcc2' : MARBLE, 0.04, r);
    if (Math.abs(Math.abs(z) - 1.5) < 0.01 && Math.abs(ax - 2.4) < 0.3 && y < 7.5) c = '#d4c3a3'; // columns
    if (y > 8 && y < 9.5 && Math.abs(z) > 1.4 && ax < 3) c = vary('#c9b98f', 0.03, r); // inscription panel
    vox.set(cx + x, y + (topAt(cx, cz) ?? 0), cz + z, c);
  }
}
triumphalArch(-46, 14);

// ---------- trees ----------
function cypress(x, z) {
  const h = topAt(x, z); if (h === undefined || uOf(x, z) < 1.25) return;
  const H = 6 + r() * 4;
  for (let y = h + S; y <= h + H; y += S) {
    const rad = y < h + 1 ? 0.25 : 0.9 * Math.sin(Math.PI * Math.min(1, (y - h) / H)) + 0.25;
    for (let a = -rad; a <= rad; a += S) for (let b = -rad; b <= rad; b += S)
      if (a * a + b * b <= rad * rad + 0.05) vox.set(x + a, y, z + b, y < h + 1 ? '#4a3424' : vary('#2c4f2c', 0.12, r));
  }
}
function pine(x, z) {
  const h = topAt(x, z); if (h === undefined || uOf(x, z) < 1.3) return;
  const H = 5 + r() * 2.5;
  for (let y = h + S; y <= h + H; y += S) vox.set(x + (y - h) * 0.1, y, z, '#5b4030');
  const cx = x + H * 0.1;
  for (let a = -3; a <= 3; a += S) for (let b = -3; b <= 3; b += S) for (let d = 0; d <= 1.5; d += S) {
    const q = (a * a + b * b) / 9 + (d - 0.6) ** 2 / 0.8;
    if (q < 1 && hash2(cx + a, z + b + d, 9) < 0.93) vox.set(cx + a, h + H + d, z + b, vary(d > 0.8 ? '#4f8a3c' : '#3c6e30', 0.12, r));
  }
}
for (let i = 0; i < 140; i++) {
  const th = r() * Math.PI * 2, rr = 36 + r() * 20;
  const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
  if (angDist(th, -0.1) < 0.28) continue; // keep the approach open
  (r() < 0.62 ? cypress : pine)(x, z);
}
// via sacra road to the arch
for (let t = 0; t <= 1; t += 0.004) {
  const x = -34 - t * 20, z = 10 + t * 4;
  for (let w = -1.5; w <= 1.5; w += S) { const h = topAt(x, z + w); if (h !== undefined) vox.set(x, h, z + w, vary('#8f877c', 0.12, r)); }
}

// ---------- clouds sea ----------
const cloudVox = new Voxels(1);
function cloud(cx, cy, cz, s, n = 7, tint = '#fff1e6') {
  for (let i = 0; i < n; i++) {
    const ox = (r() - 0.5) * s * 2.2, oz = (r() - 0.5) * s * 1.4, rr = s * (0.35 + r() * 0.45);
    for (let a = -rr; a <= rr; a++) for (let b = 0; b <= rr * 0.55; b++) for (let c = -rr; c <= rr; c++)
      if (a * a + (b * 1.8) ** 2 + c * c <= rr * rr) cloudVox.set(cx + ox + a, cy + b, cz + oz + c, vary(tint, 0.03, r));
  }
}
for (let i = 0; i < 30; i++) { const th = r() * Math.PI * 2, rr = 45 + r() * 90; cloud(Math.cos(th) * rr, -26 + r() * 8, Math.sin(th) * rr, 8 + r() * 9, 8, '#ffe8d8'); }
for (let i = 0; i < 8; i++) { const th = r() * Math.PI * 2, rr = 120 + r() * 60; cloud(Math.cos(th) * rr, 30 + r() * 40, Math.sin(th) * rr, 6 + r() * 6, 6, '#ffeadb'); }

let count = vox.buildMerged(scene) + cloudVox.buildMerged(scene, { shadow: false, emissive: 0x4a3830 });

// ---------- crowd (animated) ----------
const crowd = [];
for (let x = -A; x <= A; x += S) for (let z = -B; z <= B; z += S) {
  const u = uOf(x, z); if (u < 0.47 || u > 0.84) continue;
  const th = Math.atan2(z / B, x / A);
  if (ruin(th).fall > 0 && u > 0.64) continue;
  if (hash2(x, z, 11) > 0.62) continue;
  const k = (u - 0.46) / 0.39; if (Math.abs(k - 0.36) < 0.03 || Math.abs(k - 0.7) < 0.03) continue;
  const h = 3.5 + Math.floor(k * 30) * 0.5;
  crowd.push([x, h + 0.5, z, hash2(x, z, 12)]);
}
const tunics = ['#c0392b', '#f4efe2', '#2d5aa0', '#e2b33c', '#7b3fa0', '#d97a2b', '#3e8e5a', '#f4efe2', '#a23b2a'].map(col);
const skins = ['#e0b08a', '#c68e64', '#a87250', '#f0c8a0'].map(col);
const bodyG = new THREE.BoxGeometry(0.46, 0.55, 0.46), headG = new THREE.BoxGeometry(0.34, 0.34, 0.34);
const crowdBody = new THREE.InstancedMesh(bodyG, new THREE.MeshStandardMaterial({ roughness: 0.9 }), crowd.length);
const crowdHead = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ roughness: 0.9 }), crowd.length);
{
  const cc = new THREE.Color();
  crowd.forEach((c, i) => {
    const t = tunics[Math.floor(c[3] * tunics.length)], s = skins[Math.floor(hash2(c[0], c[2], 14) * skins.length)];
    crowdBody.setColorAt(i, cc.setRGB(...t)); crowdHead.setColorAt(i, cc.setRGB(...s));
  });
  for (const m of [crowdBody, crowdHead]) { m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
}
const mtx = new THREE.Matrix4();
function updateCrowd(t, excite) {
  for (let i = 0; i < crowd.length; i++) {
    const [x, y, z, ph] = crowd[i];
    const jump = Math.max(0, Math.sin(t * (7 + ph * 5) + ph * 40)) * (0.12 + 0.35 * excite * (ph > 0.3 ? 1 : 0.3));
    mtx.makeTranslation(x, y + 0.02 + jump, z); crowdBody.setMatrixAt(i, mtx);
    mtx.makeTranslation(x, y + 0.47 + jump, z); crowdHead.setMatrixAt(i, mtx);
  }
  crowdBody.instanceMatrix.needsUpdate = true; crowdHead.instanceMatrix.needsUpdate = true;
}
count += crowd.length * 2;

// ---------- characters (fine voxels, rigid parts) ----------
const FS = 0.25;
function part(build) { const v = new Voxels(FS); build((x, y, z, c, g) => v.set(x, y, z, c, g)); const grp = new THREE.Group(); v.buildMerged(grp); grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return grp; }
const cube = (set, x0, x1, y0, y1, z0, z1, c) => { for (let x = x0; x <= x1 + 1e-6; x += FS) for (let y = y0; y <= y1 + 1e-6; y += FS) for (let z = z0; z <= z1 + 1e-6; z += FS) set(x, y, z, typeof c === 'function' ? c(x, y, z) : c); };

function gladiator({ tunic, armor, crest, weapon, shield }) {
  const root = new THREE.Group();
  const body = part((set) => {
    cube(set, -0.25, 0, 0, 0.75, -0.5, -0.25, '#c68e64'); cube(set, -0.25, 0, 0, 0.75, 0.25, 0.5, '#c68e64');      // legs
    cube(set, -0.25, 0, 0, 0.5, -0.5, -0.25, '#d4a62a'); cube(set, -0.25, 0, 0, 0.5, 0.25, 0.5, '#d4a62a');         // greaves
    cube(set, -0.25, 0.25, 1.0, 1.25, -0.5, 0.5, tunic);                                                              // skirt
    cube(set, -0.25, 0.25, 1.5, 2.0, -0.5, 0.5, armor); cube(set, -0.25, 0.25, 1.25, 1.25, -0.5, 0.5, '#6b4a2f');   // torso + belt
    cube(set, -0.25, 0.25, 2.25, 2.5, -0.25, 0.25, '#c68e64');                                                         // neck/head
    cube(set, -0.25, 0.25, 2.5, 2.75, -0.25, 0.25, '#d4a62a'); cube(set, 0.25, 0.25, 2.5, 2.5, -0.25, 0.25, '#2a2a2a'); // helmet + visor
    cube(set, -0.5, 0.25, 3.0, 3.25, 0, 0, crest); cube(set, -0.5, -0.5, 2.75, 3.0, 0, 0, crest);                       // plume
    if (shield) { cube(set, 0.25, 0.25, 0.75, 2.0, 0.5, 1.0, shield); cube(set, 0.5, 0.5, 1.25, 1.5, 0.75, 0.75, '#e2b33c'); }
  });
  const arm = part((set) => {
    cube(set, -0.125, 0.125, -1.0, 0, -0.125, 0.125, '#c68e64');
    if (weapon === 'sword') cube(set, 0, 1.25, -1.0, -1.0, 0, 0, (x) => x < 0.3 ? '#6b4a2f' : '#dfe4ea');
    else { cube(set, -1.5, 2.5, -1.0, -1.0, 0, 0, '#7a5a3a'); for (const zz of [-0.25, 0, 0.25]) cube(set, 2.5, 3.0, -1.0, -1.0, zz, zz, '#e2b33c'); }
  });
  arm.position.set(0, 2.0, -0.6);
  root.add(body); root.add(arm);
  return { root, arm };
}
function lionModel() {
  const root = new THREE.Group();
  root.add(part((set) => {
    cube(set, -1.25, 1.0, 0.75, 1.5, -0.5, 0.5, (x, y) => vary(y > 1.3 ? '#d1a258' : '#c4913f', 0.06, r));
    for (const [lx, lz] of [[-1, -0.5], [-1, 0.5], [0.75, -0.5], [0.75, 0.5]]) cube(set, lx, lx + 0.25, 0, 0.5, lz, lz, '#b8843a');
    cube(set, 0.75, 1.75, 1.0, 2.25, -0.75, 0.75, (x, y, z) => vary('#7a4a1e', 0.1, r));   // mane
    cube(set, 1.5, 2.25, 1.25, 1.75, -0.25, 0.25, '#c99a4f');                                // face
    cube(set, 2.0, 2.25, 1.5, 1.5, -0.25, -0.25, '#2a1a10'); cube(set, 2.0, 2.25, 1.5, 1.5, 0.25, 0.25, '#2a1a10');
    cube(set, 2.25, 2.25, 1.25, 1.25, 0, 0, '#8a3a2a');
    for (let k = 0; k <= 1.25; k += FS) set(-1.25 - k * 0.8, 1.25 + k * 0.4, 0, '#c4913f');
    cube(set, -2.5, -2.25, 1.75, 2.0, 0, 0, '#5a3418');
  }));
  return root;
}
function chariotModel() {
  const root = new THREE.Group();
  root.add(part((set) => {
    // two horses
    for (const hz of [-0.75, 0.75]) {
      const c = hz < 0 ? '#f2eee6' : '#6a4632';
      cube(set, 1.5, 3.5, 1.0, 1.75, hz - 0.25, hz + 0.25, c);
      cube(set, 3.25, 4.0, 1.5, 2.5, hz - 0.25, hz + 0.25, c); cube(set, 3.75, 4.5, 2.25, 2.5, hz - 0.125, hz + 0.125, c);
      cube(set, 3.25, 3.5, 2.5, 2.75, hz, hz, '#2a1a10');
      for (const lx of [1.5, 3.25]) cube(set, lx, lx + 0.25, 0, 1.0, hz, hz, c);
      cube(set, 1.0, 1.5, 1.25, 1.5, hz, hz, '#2a1a10');
      cube(set, 2.25, 2.75, 1.75, 1.75, hz - 0.25, hz + 0.25, '#b3261e'); // red saddle cloth
    }
    cube(set, 0, 3.25, 1.25, 1.25, 0, 0, '#6b4a2f');                       // pole
    cube(set, -1.0, 0, 0.75, 1.75, -0.75, 0.75, (x, y) => (y > 1.5 ? '#e2b33c' : '#a8231c')); // car
    for (const wz of [-1.0, 1.0]) for (let a = 0; a < Math.PI * 2; a += 0.3) set(-0.5 + Math.cos(a) * 0.6, 0.6 + Math.sin(a) * 0.6, wz, '#5a3a22');
    cube(set, -0.75, -0.25, 1.75, 3.0, -0.25, 0.25, '#2d5aa0'); cube(set, -0.75, -0.25, 3.0, 3.25, -0.25, 0.25, '#e0b08a');
    cube(set, -0.75, -0.25, 3.25, 3.5, -0.25, 0.25, '#d4a62a');
  }));
  return root;
}
const G1 = gladiator({ tunic: '#8e2a22', armor: '#b9bec6', crest: '#d42a1e', weapon: 'sword', shield: '#a8231c' });
const G2 = gladiator({ tunic: '#2d4f8e', armor: '#8a6a42', crest: '#e8e2d0', weapon: 'trident', shield: null });
const lion = lionModel(), chariot = chariotModel();
for (const o of [G1.root, G2.root, lion, chariot]) scene.add(o);

// ---------- banners ----------
const banners = [];
for (let k = 0; k < N; k += 4) {
  const th = ((k + 0.5) / N) * Math.PI * 2;
  if (ruin(th).fall > 0) continue;
  const x = Math.cos(th) * A * 0.985, z = Math.sin(th) * B * 0.985;
  const flag = part((set) => cube(set, 0, 2.5, -1.25, 0, 0, 0, (xx, yy) => (yy > -0.4 ? '#e2b33c' : '#a8231c')));
  flag.position.set(x, HFULL + 4, z); flag.rotation.y = -th + Math.PI / 2;
  scene.add(flag); banners.push([flag, -th + Math.PI / 2, k]);
}

// ---------- torches ----------
const torches = [];
for (let k = 0; k < 18; k++) {
  const th = (k / 18) * Math.PI * 2;
  const x = Math.cos(th) * A * 0.455, z = Math.sin(th) * B * 0.455;
  const v = new Voxels(FS);
  cube((a, b, c, d, g) => v.set(a, b, c, d, g), 0, 0, 3.75, 4.5, 0, 0, '#4a3424');
  cube((a, b, c, d, g) => v.set(a, b, c, d, g), -0.125, 0.125, 4.75, 5.0, -0.125, 0.125, (xx, yy) => '#ffb347');
  const g = new THREE.Group(); v.buildMerged(g); g.position.set(x, 0, z); scene.add(g);
  const flame = glowSprite(scene, [x, 5.1, z], 'rgba(255,160,60,0.95)', 3.2);
  torches.push(flame);
  if (k % 3 === 0) { const l = new THREE.PointLight('#ff9a3c', 22, 16, 2); l.position.set(x, 5.5, z); scene.add(l); torches.push(l); }
}

// ---------- particles (depth-tested, in the main scene) ----------
function dynPoints(n, size, additive, opacity = 1) {
  const pos = new Float32Array(n * 3).fill(-9999), colr = new Float32Array(n * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  p.frustumCulled = false; scene.add(p);
  return { pos, colr, g, vel: new Float32Array(n * 3), age: new Float32Array(n).fill(99), n, i: 0 };
}
const sparks = dynPoints(1200, 0.18, true);
const dust = dynPoints(2500, 0.35, false, 0.55);
const petals = dynPoints(1500, 0.22, false, 0.95);
const pr = rng(31);
function emit(P, x, y, z, vx, vy, vz, spread, c) {
  const j = P.i++ % P.n;
  P.age[j] = 0; P.pos.set([x, y, z], j * 3);
  P.vel.set([vx + (pr() - 0.5) * spread, vy + (pr() - 0.5) * spread, vz + (pr() - 0.5) * spread], j * 3);
  P.colr.set(c, j * 3);
}
function stepP(P, dt, life, grav, drag, colorFn) {
  for (let j = 0; j < P.n; j++) {
    P.age[j] += dt;
    if (P.age[j] > life) { P.pos[j * 3 + 1] = -9999; continue; }
    P.vel[j * 3 + 1] -= grav * dt;
    for (let k = 0; k < 3; k++) { P.vel[j * 3 + k] *= drag; P.pos[j * 3 + k] += P.vel[j * 3 + k] * dt; }
    if (colorFn) colorFn(P, j);
  }
  P.g.attributes.position.needsUpdate = true; P.g.attributes.color.needsUpdate = true;
}
// doves
const doves = [];
for (let i = 0; i < 26; i++) {
  const d = part((set) => { cube(set, -0.25, 0.25, 0, 0.25, 0, 0, '#f4f1ea'); cube(set, 0, 0, 0, 0, -0.5, 0.5, '#e8e4dc'); });
  scene.add(d); doves.push([d, pr() * Math.PI * 2, 14 + pr() * 10, 30 + pr() * 10, 0.5 + pr() * 0.4]);
}
// sun
glowSprite(scene, [260, 70, 330], 'rgba(255,214,150,1)', 150);
glowSprite(scene, [260, 70, 330], 'rgba(255,150,90,0.5)', 400, 0.6);

// ---------- camera choreography ----------
const D = new THREE.Vector3(Math.cos(-0.1), 0, Math.sin(-0.1));
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
const pCurve = new THREE.CatmullRomCurve3(keys.map(k => k[1]), false, 'centripetal');
const lCurve = new THREE.CatmullRomCurve3(keys.map(k => k[2]), false, 'centripetal');
function camAt(t) {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const f = Math.min(1, Math.max(0, (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0])));
  const u = (i + f) / (keys.length - 1);
  return [pCurve.getPoint(u), lCurve.getPoint(u)];
}

// ---------- action timeline ----------
const fightCenter = new THREE.Vector3(0, 0.5, 0);
let excite = 0;
window.renderFrame = (fi, skip) => {
  const t = fi / FPS, dt = 1 / FPS;
  // gladiators circle each other and clash
  const orbit = t * 0.6;
  const lunge = Math.sin(t * 5.2);
  const sep = 1.9 - Math.max(0, lunge) * 0.8;
  const ax = Math.cos(orbit), az = Math.sin(orbit);
  G1.root.position.set(fightCenter.x - ax * sep, 0.5 + Math.abs(Math.sin(t * 10)) * 0.08, fightCenter.z - az * sep);
  G2.root.position.set(fightCenter.x + ax * sep, 0.5 + Math.abs(Math.cos(t * 9)) * 0.08, fightCenter.z + az * sep);
  G1.root.rotation.y = -orbit; G2.root.rotation.y = -orbit + Math.PI;
  G1.arm.rotation.z = -0.4 + Math.sin(t * 10.4) * 1.1;
  G2.arm.rotation.z = -0.2 + Math.sin(t * 5.2 + 1.2) * 0.6;
  const clash = Math.sin(t * 10.4) > 0.97 && lunge > 0.2;
  if (clash) for (let k = 0; k < 40; k++) emit(sparks, fightCenter.x, 2.3, fightCenter.z, 0, 3, 0, 9, [1, 0.85, 0.4]);
  // chariot around the arena
  const ca = t * 0.95 + 1.0;
  const cx = Math.cos(ca) * A * 0.355, cz = Math.sin(ca) * B * 0.355;
  chariot.position.set(cx, 0.5 + Math.abs(Math.sin(t * 14)) * 0.05, cz);
  const tx = -Math.sin(ca) * A, tz = Math.cos(ca) * B;
  chariot.rotation.y = -Math.atan2(tz, tx);
  for (let k = 0; k < 14; k++) emit(dust, cx - tx * 0.04, 0.6, cz - tz * 0.04, (pr() - 0.5) * 2, 1.2 + pr(), (pr() - 0.5) * 2, 1.5, [0.86, 0.72, 0.5]);
  // lion bursts out of the gate and charges
  const lt = Math.max(0, t - 5.2);
  if (t < 5.2) lion.position.set(-A * 0.43, -10, 0);
  else {
    const la = Math.min(1, lt / 2.4);
    const lx = -A * 0.43 + la * (A * 0.43 - 3.5), lz = Math.sin(la * 3) * 2.5;
    const ang = la < 1 ? 0 : lt * 1.3;
    lion.position.set(la < 1 ? lx : Math.cos(ang) * 4.5, 0.5 + Math.abs(Math.sin(t * 16)) * 0.25, la < 1 ? lz : Math.sin(ang) * 4.5);
    lion.rotation.y = la < 1 ? -Math.atan2(Math.cos(la * 3) * 7.5, A * 0.43 / 2.4 * 2.4) : -ang - Math.PI / 2;
    for (let k = 0; k < 6; k++) emit(dust, lion.position.x, 0.6, lion.position.z, (pr() - 0.5) * 2, 1 + pr(), (pr() - 0.5) * 2, 1.2, [0.88, 0.74, 0.52]);
  }
  // petals rain from the stands
  if (t > 3.5) for (let k = 0; k < 22; k++) {
    const a = pr() * Math.PI * 2, rr = 0.5 + pr() * 0.3;
    const c = pr() < 0.6 ? [0.86, 0.12, 0.18] : (pr() < 0.5 ? [1, 0.95, 0.9] : [0.95, 0.75, 0.2]);
    emit(petals, Math.cos(a) * A * rr, 12 + pr() * 4, Math.sin(a) * B * rr, -Math.cos(a) * 3, 2, -Math.sin(a) * 3, 2, c);
  }
  stepP(sparks, dt, 0.6, 12, 0.96, (P, j) => { const k = P.age[j] / 0.6; P.colr[j * 3 + 1] = 0.85 - k * 0.6; P.colr[j * 3 + 2] = 0.4 - k * 0.4; });
  stepP(dust, dt, 2.2, -0.3, 0.97);
  stepP(petals, dt, 6, 1.2, 0.985, (P, j) => { P.pos[j * 3] += Math.sin(t * 3 + j) * 0.03; });
  // crowd excitement peaks on clashes
  excite = Math.max(excite * 0.95, clash ? 1 : 0, t > 5.2 && t < 8 ? 0.8 : 0);
  updateCrowd(t, Math.max(0.35, excite));
  banners.forEach(([f, base, k]) => { f.rotation.y = base + Math.sin(t * 2.4 + k) * 0.35; });
  torches.forEach((o, k) => { if (o.isSprite) o.scale.setScalar(3 + Math.sin(t * 17 + k * 3) * 0.5 + Math.sin(t * 29 + k) * 0.3); else o.intensity = 18 + Math.sin(t * 13 + k) * 6; });
  doves.forEach(([d, ph, rad, h, sp]) => {
    const a = ph + t * sp;
    d.position.set(Math.cos(a) * rad, h + Math.sin(t * 2 + ph) * 2, Math.sin(a) * rad * 0.8);
    d.rotation.y = -a; d.children.forEach(c => (c.scale.z = 0.4 + Math.abs(Math.sin(t * 12 + ph * 5))));
  });
  if (skip) return null;
  // camera + slight handheld shake in the fast approach
  const [cp, cl] = camAt(t);
  camera.position.copy(cp);
  if (t < 3.2) { const s = 0.25 * (1 - t / 3.2); camera.position.x += Math.sin(t * 23) * s; camera.position.y += Math.sin(t * 31) * s; }
  camera.fov = 38;
  camera.updateProjectionMatrix();
  camera.lookAt(cl);
  comp.render();
  return renderer.domElement.toDataURL('image/png');
};

renderer.shadowMap.autoUpdate = true;
const comp = composer(renderer, scene, camera, Wd, Hd, { bloom: [0.5, 0.5, 0.82], ao: true });
window.__done = count;
