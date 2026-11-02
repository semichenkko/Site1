import { THREE, setup, composer, Voxels, vary, col, rng, fbm, hash2, noise2, glowSprite, points } from './engine2.js';

const Wd = window.W || 2160, Hd = window.H || 1620;
const { renderer, scene, camera } = setup({
  w: Wd, h: Hd,
  sky: [[0, '#1d2550'], [0.35, '#4a3f78'], [0.62, '#c0607a'], [0.8, '#f29a64'], [1, '#ffd29a']],
  fog: '#c98a8a', fogDensity: 0.0017, exposure: 1.0,
});

// ---------- lights: low golden sun from back-left, cool sky fill ----------
scene.add(new THREE.HemisphereLight('#9aa2dc', '#6a4632', 1.15));
const sunL = new THREE.DirectionalLight('#ffb070', 5.2);
sunL.position.set(-120, 48, 70);
sunL.castShadow = true;
sunL.shadow.mapSize.set(4096, 4096);
Object.assign(sunL.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 400 });
sunL.shadow.bias = -0.0003; sunL.shadow.normalBias = 0.35;
scene.add(sunL);
const rim = new THREE.DirectionalLight('#ff8a5c', 1.4); rim.position.set(-60, 30, -120); scene.add(rim);

const S = 0.5;
const vox = new Voxels(S);
const r = rng(21);

// ---------- terrain ----------
const pathZ = (x) => 13 * Math.sin(x * 0.065 + 0.6) - 4 * Math.sin(x * 0.17);
const ridgeH = (x) => 21 + 7 * Math.sin(x * 0.11 + 0.3) + 5 * Math.sin(x * 0.23 + 1.0);
function terrain(x, z) {
  const d = z - pathZ(x);
  const dd = Math.max(0, Math.abs(d) - 3.2);
  const ridge = ridgeH(x) * Math.exp(-(dd * dd) / 140);
  const hills = 12 * fbm(x * 0.06, z * 0.06, 31) - 4;
  const edge = Math.max(0, 1 - Math.hypot(x, z) / 56);
  const crags = 2.2 * (fbm(x * 0.35, z * 0.35, 77) - 0.5);
  return Math.max(0, ridge * Math.min(1, edge * 1.8) + hills * Math.min(1, edge * 1.5) + crags * Math.min(1, ridge / 8));
}
const R = 52, tops = new Map(), bots = new Map();
const ck = (ix, iz) => ix * 4096 + iz;
for (let ix = -Math.ceil((R + 4) / S); ix <= Math.ceil((R + 4) / S); ix++)
  for (let iz = -Math.ceil((R + 4) / S); iz <= Math.ceil((R + 4) / S); iz++) {
    const x = ix * S, z = iz * S, d = Math.hypot(x, z);
    const edgeR = R + (fbm(x * 0.12, z * 0.12, 5) - 0.5) * 7;
    if (d > edgeR) continue;
    const t = d / edgeR;
    tops.set(ck(ix, iz), Math.round(terrain(x, z) / S));
    const depth = 24 * (1 - t * t) * (0.55 + 0.7 * fbm(x * 0.25, z * 0.25, 9)) + 3 + 6 * Math.max(0, noise2(x * 0.6, z * 0.6, 4) - 0.6);
    bots.set(ck(ix, iz), -Math.round(depth / S));
  }
const topAt = (x, z) => { const v = tops.get(ck(Math.round(x / S), Math.round(z / S))); return v === undefined ? undefined : v * S; };

for (const [key, h] of tops) {
  const ix = Math.round(key / 4096), iz = key - ix * 4096;
  const b = bots.get(key);
  const nb = [ck(ix + 1, iz), ck(ix - 1, iz), ck(ix, iz + 1), ck(ix, iz - 1)];
  const nt = nb.map(k => tops.get(k)), nbt = nb.map(k => bots.get(k));
  const edgeCol = nt.some(v => v === undefined);
  const minNT = Math.min(...nt.map(v => v ?? -999));
  const maxNB = Math.max(...nbt.map(v => v ?? 999));
  const steep = h - minNT >= 3;
  const x = ix * S, z = iz * S;
  const fillTo = edgeCol ? b : Math.min(minNT, h);
  const fillBot = edgeCol ? b : Math.min(maxNB, Math.min(minNT, h));
  for (let iy = h; iy >= fillTo; iy--) {
    const depth = h - iy, y = iy * S;
    let c;
    if (edgeCol && depth > 3) {
      // cliff sides: layered sandstone/rock
      const band = Math.floor(y * 0.7 + fbm(x * 0.2, z * 0.2, 3) * 3) % 3;
      c = vary(['#7a5a48', '#8b6a52', '#6a4d40'][band < 0 ? band + 3 : band], 0.07, r);
    } else if (steep || (y > 22 && hash2(x, z, 8) < 0.6)) {
      c = hash2(x * 3 + y, z, 7) < 0.22 ? vary('#6d8a45', 0.12, r) : vary(y > 20 ? '#9a9288' : '#857d72', 0.1, r);
    } else if (depth === 0) {
      const hn = fbm(x * 0.09, z * 0.09, 44);
      c = vary(hn > 0.55 ? '#8aa449' : hn > 0.42 ? '#6f9a45' : '#5c8a3e', 0.1, r);
    } else c = vary('#6a5040', 0.08, r);
    vox.seti(ix, iy, iz, c);
  }
  for (let iy = b; iy <= fillBot; iy++) vox.seti(ix, iy, iz, vary(['#5e4438', '#6d5040', '#4f3a32'][Math.floor(hash2(x, iy, 2) * 3)], 0.06, r));
}

// ---------- the Great Wall ----------
const WALL = '#b2a796', WALL_D = '#8e8476', WALK = '#c8bba5';
const pts = [];
for (let x = -52; x <= 52; x += 0.1) { const z = pathZ(x); if (topAt(x, z) !== undefined) pts.push([x, z]); }
const g0 = pts.map(([x, z]) => topAt(x, z));
const wallTop = g0.map((_, i) => {
  let s = 0, n = 0;
  for (let k = -12; k <= 12; k++) if (g0[i + k] !== undefined) { s += g0[i + k]; n++; }
  return Math.round((s / n + 2.5) / S) * S;
});
let dist = 0;
const towers = [];
pts.forEach(([x, z], i) => {
  if (i > 0) dist += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
  const dz = pathZ(x + 0.25) - pathZ(x - 0.25), len = Math.hypot(0.5, dz);
  const nx = -dz / len, nz = 0.5 / len;
  const T = wallTop[i];
  for (let w = -1.75; w <= 1.751; w += 0.25) {
    const px = x + nx * w, pz = z + nz * w;
    const g = topAt(px, pz); if (g === undefined) continue;
    const edge = Math.abs(w) > 1.5;
    const merlon = Math.floor(dist / 0.75) % 2 === 0;
    const H = edge ? T + 0.5 + (merlon ? 0.5 : 0) : T;
    for (let y = Math.min(g, T - 3); y <= H + 0.01; y += S) {
      let c;
      if (!edge && Math.abs(y - T) < 0.01) c = vary(WALK, 0.06, r);
      else c = vary(hash2(px * 5 + y, pz, 4) < 0.1 ? WALL_D : WALL, 0.07, r);
      // stone courses
      if (Math.round(y / S) % 4 === 0 && edge) c = vary('#a0958a', 0.05, r);
      vox.set(px, y, pz, c);
    }
  }
  if (i % 300 === 120) towers.push([x, z, T, i]);
  // little red lanterns along the parapet
  if (i % 55 === 0) {
    const lx = x + nx * 1.75, lz = z + nz * 1.75;
    vox.set(lx, T + 1.5, lz, '#ff5a2e', true);
  }
});

const roofTower = towers.reduce((a, b) => (b[2] > a[2] ? b : a));
for (const tw of towers) {
  const [tx, tz, T] = tw;
  const hw = 3.5, TT = T + 4.5;
  for (let x = tx - hw; x <= tx + hw + 0.01; x += S) for (let z = tz - hw; z <= tz + hw + 0.01; z += S) {
    const g = topAt(x, z) ?? T - 3;
    const ex = Math.abs(Math.abs(x - tx) - hw) < 0.01, ez = Math.abs(Math.abs(z - tz) - hw) < 0.01;
    const edge = ex || ez;
    for (let y = Math.min(g, T - 3); y <= TT + 0.01; y += S) {
      const along = ex ? z - tz : x - tx;
      const win = edge && Math.abs(along) <= 0.5 && y > T + 0.4 && y < T + 2.6 && !(Math.abs(along) === 0.5 && y > T + 2.1);
      if (win) { vox.set(x, y, z, '#ffb15a', true); continue; } // warm lit windows
      if (!edge && y > T + 0.01 && y < TT - 0.01) continue;
      let c = vary(Math.abs(y - TT) < 0.01 ? WALK : WALL, 0.06, r);
      if (Math.round(y / S) % 5 === 0 && edge) c = vary('#c4b8a3', 0.04, r);
      vox.set(x, y, z, c);
    }
    if (edge && Math.round((x + z) / S) % 2 === 0) { vox.set(x, TT + 0.5, z, vary(WALL, 0.06, r)); vox.set(x, TT + 1, z, vary(WALL, 0.06, r)); }
  }
  const wl = new THREE.PointLight('#ff9a4a', 30, 14, 2); wl.position.set(tx, T + 1.5, tz + hw + 1); scene.add(wl);
  if (tw === roofTower) pavilion(tx, tz, TT);
}

function pavilion(cx, cz, base) {
  const RED = '#a8231c', TILE = '#2f2e3a', TILE2 = '#3d3b4a', GOLDC = '#e2a93b';
  // pillars
  for (const sx of [-2.5, 2.5]) for (const sz of [-2.5, 2.5])
    for (let y = base + 0.5; y <= base + 4; y += S) vox.set(cx + sx, y, cz + sz, vary(RED, 0.05, r));
  // beam
  for (let a = -2.5; a <= 2.5; a += S) for (const s of [-2.5, 2.5]) {
    vox.set(cx + a, base + 4, cz + s, '#1f6a5a'); vox.set(cx + s, base + 4, cz + a, '#1f6a5a');
  }
  // two-tier roof with upturned eaves
  const tier = (y0, half, height) => {
    for (let dy = 0; dy <= height; dy += S) {
      const hh = half * (1 - 0.75 * dy / height);
      for (let a = -hh; a <= hh + 0.01; a += S) for (let b = -hh; b <= hh + 0.01; b += S) {
        vox.set(cx + a, y0 + dy, cz + b, vary(Math.round((a + b) / S) % 2 ? TILE : TILE2, 0.05, r));
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      vox.set(cx + sx * (half + 0.5), y0 + 0.5, cz + sz * (half + 0.5), GOLDC);
      vox.set(cx + sx * (half + 0.5), y0 + 1, cz + sz * (half + 0.5), GOLDC);
      // hanging lantern under each eave
      vox.set(cx + sx * (half - 0.5), y0 - 1, cz + sz * (half - 0.5), '#ff4a26', true);
      vox.set(cx + sx * (half - 0.5), y0 - 1.5, cz + sz * (half - 0.5), '#ff4a26', true);
      glowSprite(scene, [cx + sx * (half - 0.5), y0 - 1.2, cz + sz * (half - 0.5)], 'rgba(255,90,40,0.9)', 5);
    }
  };
  tier(base + 4.5, 5, 1.5);
  tier(base + 6.5, 3.5, 2);
  for (let y = base + 9; y <= base + 10.5; y += S) vox.set(cx, y, cz, GOLDC);
  const pl = new THREE.PointLight('#ff7a3a', 60, 18, 2); pl.position.set(cx, base + 2, cz); scene.add(pl);
}

// ---------- trees ----------
const maple = ['#d9502a', '#e8862f', '#c2301f', '#f0b13a', '#b73a26', '#e96a2c'];
function tree(x, z) {
  const h = topAt(x, z); if (h === undefined) return;
  if (Math.abs(z - pathZ(x)) < 4.5) return;
  if (r() < 0.22) { // dark pine
    const H = 4 + r() * 3;
    for (let y = h + S; y <= h + 1; y += S) vox.set(x, y, z, '#4a3424');
    for (let y = h + 1; y <= h + H; y += S) {
      const rad = 1.6 * (1 - (y - h - 1) / H) + 0.2;
      for (let a = -rad; a <= rad; a += S) for (let b = -rad; b <= rad; b += S)
        if (a * a + b * b <= rad * rad) vox.set(x + a, y, z + b, vary('#2e4a30', 0.12, r));
    }
    return;
  }
  const c = maple[Math.floor(r() * maple.length)];
  const th = 1 + r() * 1.5, rad = 1 + r() * 1.1;
  for (let y = h + S; y <= h + th; y += S) vox.set(x, y, z, '#4a3424');
  const cy = h + th + rad * 0.8;
  for (let a = -rad; a <= rad; a += S) for (let b = -rad; b <= rad; b += S) for (let d = -rad; d <= rad; d += S) {
    const q = a * a + b * b * 1.3 + d * d;
    if (q <= rad * rad && hash2(x + a, z + d + b, 3) < 0.92) vox.set(x + a, cy + b, z + d, vary(c, 0.14, r));
  }
}
for (let i = 0; i < 230; i++) tree((r() - 0.5) * 100, (r() - 0.5) * 100);
// fallen leaves on the grass
for (let i = 0; i < 900; i++) {
  const x = (r() - 0.5) * 100, z = (r() - 0.5) * 100, h = topAt(x, z);
  if (h !== undefined && !vox.has(x, h + S, z)) vox.set(x, h, z, vary(maple[Math.floor(r() * maple.length)], 0.15, r));
}

// ---------- chinese dragon ----------
const spine = (t) => [-40 + t * 76, 50 + 5.5 * Math.sin(t * Math.PI * 3.1), -6 + 11 * Math.cos(t * Math.PI * 2.3)];
const RED = '#cf1f26', RED2 = '#9e1219', GOLD = '#f4b73a', JADE = '#2f9a72';
const dt = 0.0012;
let prev = spine(0);
for (let t = 0; t <= 1; t += dt) {
  const p = spine(t), q = spine(Math.min(1, t + 0.002));
  const tx = q[0] - p[0], ty = q[1] - p[1], tz = q[2] - p[2], tl = Math.hypot(tx, ty, tz) || 1;
  const rad = 0.5 + 2.0 * Math.min(1, Math.pow(t * 1.5, 0.7));
  for (let a = -rad; a <= rad; a += S) for (let b = -rad; b <= rad; b += S) for (let c = -rad; c <= rad; c += S) {
    const d2 = a * a + b * b + c * c;
    if (d2 > rad * rad || d2 < (rad - 0.9) * (rad - 0.9)) continue;
    const belly = b < -rad * 0.4;
    const ring = Math.floor(t * 260) % 2;
    let colr;
    if (belly) colr = vary(Math.floor(t * 320) % 2 ? GOLD : '#d9952c', 0.04, r);
    else colr = vary(((ring + Math.round((a + c) / S)) % 3 === 0) ? RED2 : RED, 0.05, r);
    vox.set(p[0] + a, p[1] + b, p[2] + c, colr);
  }
  // dorsal spines + flowing jade mane near the neck
  if (Math.floor(t / dt) % 7 === 0 && t > 0.04) {
    const sh = 0.5 + rad * 0.45;
    for (let y = 0; y <= sh; y += S) vox.set(p[0], p[1] + rad + y, p[2], t > 0.82 ? JADE : '#f7d26a');
  }
  if (t > 0.86) for (let k = 0; k < 3; k++) vox.set(p[0] - 1 - k * 0.5, p[1] + rad - k * 0.5, p[2] + (k - 1) * 0.8, vary(JADE, 0.1, r));
  // legs with golden claws
  for (const lt of [0.38, 0.4, 0.66, 0.68]) if (Math.abs(t - lt) < dt / 2) {
    const side = lt === 0.38 || lt === 0.66 ? 1 : -1;
    for (let k = 0; k <= 4; k += S) vox.set(p[0] + k * 0.2, p[1] - rad - k * 0.7, p[2] + side * (rad * 0.6 + k * 0.35), vary(RED, 0.05, r));
    const fx = p[0] + 0.8, fy = p[1] - rad - 3, fz = p[2] + side * (rad * 0.6 + 1.4);
    for (const o of [-0.5, 0, 0.5]) { vox.set(fx + 0.5, fy - 0.5, fz + o, GOLD); vox.set(fx + 1, fy - 1, fz + o, '#fff2c0'); }
  }
  prev = p;
}
// tail flame fin
const tail = spine(0);
for (let k = 0; k < 14; k++) for (let w = -k * 0.15; w <= k * 0.15; w += S)
  vox.set(tail[0] - 0.4 * k, tail[1] + Math.sin(k * 0.6) * 0.8 + w, tail[2] + w * 0.4, vary(k % 3 ? GOLD : '#ff8a2a', 0.08, r));

// head
const [hx, hy, hz] = spine(1);
const box = (x0, x1, y0, y1, z0, z1, c) => { for (let x = x0; x <= x1 + 0.01; x += S) for (let y = y0; y <= y1 + 0.01; y += S) for (let z = z0; z <= z1 + 0.01; z += S) vox.set(hx + x, hy + y, hz + z, typeof c === 'function' ? c(x, y, z) : c); };
box(-1, 3, -1.5, 2, -2, 2, () => vary(RED, 0.05, r));          // skull
box(3, 6.5, -0.5, 1.5, -1.5, 1.5, () => vary(RED, 0.05, r));   // upper snout
box(6, 7, 0, 1.5, -1.5, 1.5, () => vary(RED2, 0.05, r));       // nose
box(3, 6, -2.5, -1.5, -1.2, 1.2, () => vary(GOLD, 0.05, r));   // open lower jaw
box(3.5, 6, -1, -0.5, -1, 1, '#3a0a10');                         // mouth inside
for (let x = 3.5; x <= 6; x += 1) { vox.set(hx + x, hy - 1, hz - 1, '#fffaf0'); vox.set(hx + x, hy - 1, hz + 1, '#fffaf0'); vox.set(hx + x, hy - 1.5, hz, '#fffaf0'); }
for (const s of [-1, 1]) {
  vox.set(hx + 2.5, hy + 1.5, hz + s * 2, '#fff3a0', true);  // glowing eyes
  vox.set(hx + 3, hy + 1.5, hz + s * 2, '#fff3a0', true);
  glowSprite(scene, [hx + 2.8, hy + 1.5, hz + s * 2.2], 'rgba(255,240,150,0.9)', 2.5);
  box(2, 3.5, 2, 2.5, s * 1.5, s * 1.5, '#e8c24a');              // brow ridge
  // antler horns
  for (let k = 0; k <= 5; k += S) {
    vox.set(hx - k * 0.9, hy + 2.5 + k * 0.6, hz + s * (1.2 + k * 0.25), GOLD);
    if (Math.abs(k - 2.5) < 0.01 || Math.abs(k - 4) < 0.01) for (let j = 0; j <= 1.5; j += S) vox.set(hx - k * 0.9 + j * 0.3, hy + 2.5 + k * 0.6 + j, hz + s * (1.2 + k * 0.25), GOLD);
  }
  // long flowing whiskers
  for (let k = 0; k <= 9; k += S) vox.set(hx + 6.5 - k * 0.55, hy + 0.5 - k * 0.45 + Math.sin(k * 0.8) * 0.6, hz + s * (1.5 + k * 0.45), '#f7dc7a');
  // cheek fins
  for (let k = 0; k <= 2; k += S) vox.set(hx - 0.5 - k * 0.5, hy - 0.5 + k * 0.3, hz + s * (2.5 + k * 0.5), vary(JADE, 0.08, r));
}
// beard
for (let k = 0; k <= 2.5; k += S) for (let w = -0.5; w <= 0.5; w += S) vox.set(hx + 3.5 - k * 0.3, hy - 3 - k, hz + w, vary(JADE, 0.1, r));

// flaming pearl
const pearl = [hx + 16, hy + 2.5, hz + 2];
for (let a = -1.2; a <= 1.2; a += S) for (let b = -1.2; b <= 1.2; b += S) for (let c = -1.2; c <= 1.2; c += S)
  if (a * a + b * b + c * c <= 1.5) vox.set(pearl[0] + a, pearl[1] + b, pearl[2] + c, '#fff6d8', true);
glowSprite(scene, pearl, 'rgba(255,225,150,1)', 11);
glowSprite(scene, pearl, 'rgba(255,170,90,0.6)', 24, 0.5);
const pl = new THREE.PointLight('#ffcf7a', 260, 70, 1.8); pl.position.set(...pearl); scene.add(pl);

// ---------- sea of clouds below + floating clouds ----------
const cloudVox = new Voxels(1);
function cloud(cx, cy, cz, s, n = 7, tint = '#fff1e6') {
  for (let i = 0; i < n; i++) {
    const ox = (r() - 0.5) * s * 2.2, oz = (r() - 0.5) * s * 1.4, rr = s * (0.35 + r() * 0.45);
    for (let a = -rr; a <= rr; a++) for (let b = 0; b <= rr * 0.55; b++) for (let c = -rr; c <= rr; c++)
      if (a * a + (b * 1.8) ** 2 + c * c <= rr * rr) cloudVox.set(cx + ox + a, cy + b, cz + oz + c, vary(tint, 0.03, r));
  }
}
for (let i = 0; i < 26; i++) {
  const th = r() * Math.PI * 2, rr = 40 + r() * 70;
  cloud(Math.cos(th) * rr, -26 + r() * 8, Math.sin(th) * rr, 8 + r() * 8, 8, '#ffe6dc');
}
cloud(-48, 44, -40, 8); cloud(52, 46, -34, 7); cloud(-70, 20, 30, 6, 6, '#ffe2cf'); cloud(70, 14, 40, 6, 6, '#ffe2cf');

// ---------- distant mountain silhouettes ----------
const far = new Voxels(3);
for (let ang = -1.9; ang <= 0.4; ang += 0.012) {
  for (const [rad, hmax, c] of [[230, 70, '#7a5c8c'], [320, 110, '#8a6a98']]) {
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad * 1.0 - 40;
    const h = hmax * (0.35 + 0.65 * fbm(ang * 6 + rad, rad, 13)) - 30;
    for (let y = -40; y <= h; y += 3) far.set(x, y, z, vary(y > h - 6 && hmax > 100 ? '#d9b2c2' : c, 0.04, r));
  }
}

const count = vox.build(scene) + cloudVox.build(scene, { shadow: false, emissive: 0x4a3038 }) + far.build(scene);

// ---------- atmosphere ----------
glowSprite(scene, [-330, 70, 120], 'rgba(255,214,150,1)', 160);
glowSprite(scene, [-330, 70, 120], 'rgba(255,150,90,0.5)', 420, 0.6);
points(scene, 700, { color: '#ffd59a', size: 0.35, box: [110, 50, 110], center: [0, 2, 0], opacity: 0.8, additive: true, seed: 3 }); // fireflies / embers
points(scene, 500, { color: '#fff3e0', size: 0.25, box: [160, 70, 160], center: [0, -10, 0], opacity: 0.35, seed: 5 });

camera.position.set(140, 80, 101);
camera.lookAt(-4, 19, 0);
camera.updateMatrixWorld();

const comp = composer(renderer, scene, camera, Wd, Hd, { bloom: [0.6, 0.55, 0.8], ao: true });
comp.render();
window.__done = count;
