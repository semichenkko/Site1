import { THREE, setup, composer, Voxels, vary, rng, fbm, hash2, noise2, glowSprite, points } from './engine2.js';
import { buildIsland, cloudSea, textMask } from './island2.js';

const Wd = window.W || 1440, Hd = window.H || 1080;
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

// ---------- dragon dance in the courtyard ----------
{
  const N = 22;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const x = -14 + t * 24, z = 14 + Math.sin(t * Math.PI * 2.2) * 5, y = 4 + Math.sin(t * Math.PI * 3 + 1) * 1.2;
    box(x - 0.75, x + 0.75, y - 0.75, y + 0.75, z - 0.75, z + 0.75, (xx, yy) => (yy < y - 0.3 ? GOLD : (i % 2 ? '#d42a1e' : '#e8401e')));
    vox.set(x, y + 1.25, z, '#2f9a72');
    if (i % 3 === 0) { box(x, x, S, y - 1, z, z, '#5a3a22'); box(x - 0.25, x + 0.25, S, 1.5, z + 0.75, z + 0.75, '#f4efe2'); vox.set(x, 2, z + 0.75, '#e0b08a'); }
  }
  const hx = 11, hz = 14 + Math.sin(Math.PI * 2.2) * 5, hy = 5;
  box(hx, hx + 3, hy - 1, hy + 1.5, hz - 1.25, hz + 1.25, (x, y) => (y < hy - 0.4 ? GOLD : '#d42a1e'));
  for (const s of [-1, 1]) { vox.set(hx + 2.5, hy + 1, hz + s, '#fff3a0', true); box(hx, hx + 0.5, hy + 1.5, hy + 3, hz + s, hz + s, GOLD); }
  box(hx + 3, hx + 4, hy - 1, hy - 0.5, hz - 1, hz + 1, '#f4efe2');
  // pearl on a pole leading the dragon
  box(hx + 7, hx + 7, S, 6, hz, hz, '#5a3a22'); box(hx + 6.5, hx + 7.5, 6.5, 7.5, hz - 0.5, hz + 0.5, '#fff1c0', true);
  glowSprite(scene, [hx + 7, 7, hz], 'rgba(255,220,150,1)', 6);
}
// lion dance pair
for (const [lx, lz, c] of [[-20, 6, '#e8401e'], [20, 8, '#f2c040']]) {
  box(lx - 1, lx + 1.5, 1.5, 3, lz - 0.75, lz + 0.75, c);
  box(lx + 1.5, lx + 3, 2, 4, lz - 1, lz + 1, '#d42a1e');
  vox.set(lx + 3, 3.5, lz - 0.5, '#ffffff'); vox.set(lx + 3, 3.5, lz + 0.5, '#ffffff');
  box(lx + 1.5, lx + 2, 4, 4.5, lz - 1, lz + 1, '#ffffff');
  for (const ox of [-0.5, 1]) for (const oz of [-0.5, 0.5]) box(lx + ox, lx + ox, S, 1.5, lz + oz, lz + oz, '#f4efe2');
}
// crowd along the walls
for (let i = 0; i < 260; i++) {
  const side = r() < 0.5 ? -1 : 1, x = side * (14 + r() * 24), z = 4 + r() * 22;
  if (Math.abs(x) > 39) continue;
  const c = ['#c0392b', '#2d5aa0', '#e2b33c', '#3e8e5a', '#7b3fa0', '#d97a2b'][Math.floor(r() * 6)];
  vox.set(x, 0.5, z, '#2a2a2a'); vox.set(x, 1, z, c); vox.set(x, 1.5, z, c); vox.set(x, 2, z, '#e0b08a');
  if (r() < 0.2) { vox.set(x, 3, z, '#ff3b22', true); vox.set(x, 2.5, z, '#3a2a1a'); } // hand lanterns
}

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

// ---------- fireworks ----------
const fr = rng(7);
const fw = [];
function burst(cx, cy, cz, rad, color, n = 500) {
  for (let i = 0; i < n; i++) {
    const u = fr() * 2 - 1, a = fr() * Math.PI * 2, s = Math.sqrt(1 - u * u), k = 0.75 + fr() * 0.25;
    for (let tr = 0; tr < 4; tr++) { const f = k * (1 - tr * 0.08); fw.push([cx + s * Math.cos(a) * rad * f, cy + u * rad * f - tr * 0.3, cz + s * Math.sin(a) * rad * f, ...color.map(c => c * (1 - tr * 0.2))]); }
  }
  const l = new THREE.PointLight(new THREE.Color(...color), 40, 140, 1.4); l.position.set(cx, cy, cz); scene.add(l);
  glowSprite(scene, [cx, cy, cz], `rgba(${color.map(c => Math.round(c * 255)).join(',')},0.55)`, rad * 2.2, 0.6);
}
burst(-26, 62, -50, 15, [1.0, 0.25, 0.2]);
burst(18, 72, -60, 19, [1.0, 0.8, 0.3]);
burst(46, 54, -36, 12, [0.4, 1.0, 0.6]);
burst(-52, 48, -24, 11, [1.0, 0.5, 0.9]);
burst(0, 86, -90, 22, [1.0, 0.65, 0.25], 700);
burst(-6, 50, -30, 9, [0.6, 0.8, 1.0], 300);
{
  const pos = new Float32Array(fw.length * 3), colr = new Float32Array(fw.length * 3);
  fw.forEach((p, i) => { pos.set(p.slice(0, 3), i * 3); colr.set(p.slice(3), i * 3); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
}
// rising rocket trails
for (const [x, z, h] of [[-36, -10, 40], [30, -20, 46], [8, -30, 34]]) {
  const n = 80, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([x + (fr() - 0.5) * 0.3, 8 + (i / n) * h, z + (fr() - 0.5) * 0.3], i * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffd28a', size: 0.5, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })));
}
// snowfall + stars + moon
points(scene, 3500, { color: '#ffffff', size: 0.3, box: [140, 80, 140], center: [0, -5, 0], opacity: 0.85, seed: 4 });
glowSprite(scene, [-180, 160, -260], 'rgba(220,230,255,1)', 40);
glowSprite(scene, [-180, 160, -260], 'rgba(150,170,255,0.4)', 160, 0.5);

camera.position.set(40, 68, 120);
camera.lookAt(0, 10, -6);
renderer.shadowMap.needsUpdate = true;
const comp = composer(renderer, scene, camera, Wd, Hd, { bloom: [0.7, 0.55, 0.8], ao: true });
comp.render();
window.__done = count;
