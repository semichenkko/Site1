import { Voxels, vary, fbm, hash2, noise2 } from './engine2.js';

// Floating island shell builder. ground(x,z) -> height (world units); surface(x,z,y,depth,steep) -> color
export function buildIsland(vox, r, { R = 56, ground = () => 0, surface, seed = 5, depthScale = 22 }) {
  const S = vox.S, tops = new Map(), bots = new Map();
  const ck = (ix, iz) => ix * 4096 + iz;
  const n = Math.ceil((R + 5) / S);
  for (let ix = -n; ix <= n; ix++) for (let iz = -n; iz <= n; iz++) {
    const x = ix * S, z = iz * S, d = Math.hypot(x, z);
    const edgeR = R + (fbm(x * 0.12, z * 0.12, seed) - 0.5) * 7;
    if (d > edgeR) continue;
    const t = d / edgeR;
    tops.set(ck(ix, iz), Math.round(ground(x, z) / S));
    const depth = depthScale * (1 - t * t) * (0.55 + 0.7 * fbm(x * 0.25, z * 0.25, seed + 4)) + 3 + 7 * Math.max(0, noise2(x * 0.6, z * 0.6, seed + 1) - 0.6);
    bots.set(ck(ix, iz), -Math.round(depth / S));
  }
  const topAt = (x, z) => { const v = tops.get(ck(Math.round(x / S), Math.round(z / S))); return v === undefined ? undefined : v * S; };
  for (const [key, h] of tops) {
    const ix = Math.round(key / 4096), iz = key - ix * 4096, b = bots.get(key);
    const nb = [ck(ix + 1, iz), ck(ix - 1, iz), ck(ix, iz + 1), ck(ix, iz - 1)];
    const nt = nb.map(k => tops.get(k)), nbt = nb.map(k => bots.get(k));
    const edgeCol = nt.some(v => v === undefined);
    const minNT = Math.min(...nt.map(v => v ?? -999)), maxNB = Math.max(...nbt.map(v => v ?? 999));
    const x = ix * S, z = iz * S;
    const steep = h - minNT >= 3;
    const fillTo = edgeCol ? b : Math.min(minNT, h);
    const fillBot = edgeCol ? b : Math.min(maxNB, Math.min(minNT, h));
    for (let iy = h; iy >= fillTo; iy--) {
      const depth = h - iy, y = iy * S;
      let c;
      if (edgeCol && depth > 2) {
        const band = ((Math.floor(y * 0.7 + fbm(x * 0.2, z * 0.2, 3) * 3) % 3) + 3) % 3;
        c = vary(['#7a5a48', '#8b6a52', '#6a4d40'][band], 0.07, r);
      } else c = surface(x, z, y, depth, steep);
      vox.seti(ix, iy, iz, c);
    }
    for (let iy = b; iy <= fillBot; iy++) vox.seti(ix, iy, iz, vary(['#5e4438', '#6d5040', '#4f3a32'][Math.floor(hash2(x, iy, 2) * 3)], 0.06, r));
  }
  return topAt;
}

export function cloudSea(r, { n = 30, y = -26, rmin = 45, rmax = 135, tint = '#ffe8d8', sky = 8, skyTint = '#ffeadb' } = {}) {
  const cv = new Voxels(1);
  const cloud = (cx, cy, cz, s, k, t) => {
    for (let i = 0; i < k; i++) {
      const ox = (r() - 0.5) * s * 2.2, oz = (r() - 0.5) * s * 1.4, rr = s * (0.35 + r() * 0.45);
      for (let a = -rr; a <= rr; a++) for (let b = 0; b <= rr * 0.55; b++) for (let c = -rr; c <= rr; c++)
        if (a * a + (b * 1.8) ** 2 + c * c <= rr * rr) cv.set(cx + ox + a, cy + b, cz + oz + c, vary(t, 0.03, r));
    }
  };
  for (let i = 0; i < n; i++) { const th = r() * Math.PI * 2, rr = rmin + r() * (rmax - rmin); cloud(Math.cos(th) * rr, y + r() * 8, Math.sin(th) * rr, 8 + r() * 9, 8, tint); }
  for (let i = 0; i < sky; i++) { const th = r() * Math.PI * 2, rr = 120 + r() * 60; cloud(Math.cos(th) * rr, 30 + r() * 40, Math.sin(th) * rr, 6 + r() * 6, 6, skyTint); }
  return cv;
}

// Rasterize text into a 2D boolean grid using the browser's fonts (CJK supported)
export function textMask(text, px = 32, font = '"WenQuanYi Zen Hei", sans-serif') {
  const cv = document.createElement('canvas'); cv.width = px * text.length + 8; cv.height = px + 8;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#fff'; g.font = `bold ${px}px ${font}`; g.textBaseline = 'top'; g.fillText(text, 4, 4);
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  const out = [];
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4] > 128) out.push([x, y]);
  return { pts: out, w: cv.width, h: cv.height };
}
