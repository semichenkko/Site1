import * as THREE from './node_modules/three/build/three.module.js';

// deterministic RNG
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export function hash2(x, z, seed = 0) {
  let h = (x * 374761393 + z * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smooth(t) { return t * t * (3 - 2 * t); }
export function noise2(x, z, seed = 0) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed), c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  const u = smooth(xf), v = smooth(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, seed = 0, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * noise2(x * f, z * f, seed + i * 17); amp *= 0.5; f *= 2; }
  return s / (1 - Math.pow(0.5, oct));
}

export class Voxels {
  constructor() { this.map = new Map(); this.emissive = new Map(); }
  key(x, y, z) { return `${x},${y},${z}`; }
  set(x, y, z, color, emissive = false) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    const k = this.key(x, y, z);
    if (color === null) { this.map.delete(k); this.emissive.delete(k); return; }
    this.map.set(k, color);
    if (emissive) this.emissive.set(k, color); else this.emissive.delete(k);
  }
  has(x, y, z) { return this.map.has(this.key(Math.round(x), Math.round(y), Math.round(z))); }
  build(scene) {
    const solid = [], glow = [];
    for (const [k, c] of this.map) {
      const [x, y, z] = k.split(',').map(Number);
      if (this.map.has(`${x+1},${y},${z}`) && this.map.has(`${x-1},${y},${z}`) &&
          this.map.has(`${x},${y+1},${z}`) && this.map.has(`${x},${y-1},${z}`) &&
          this.map.has(`${x},${y},${z+1}`) && this.map.has(`${x},${y},${z-1}`)) continue;
      (this.emissive.has(k) ? glow : solid).push([x, y, z, c]);
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mk = (list, mat) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      const o = new THREE.Object3D(), col = new THREE.Color();
      list.forEach(([x, y, z, c], i) => {
        o.position.set(x, y, z); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
        m.setColorAt(i, col.set(c));
      });
      m.castShadow = m.receiveShadow = !mat.emissiveIntensity;
      scene.add(m);
    };
    mk(solid, new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 }));
    mk(glow, new THREE.MeshBasicMaterial({ toneMapped: false }));
    return solid.length + glow.length;
  }
}

// jitter a hex color slightly for texture
export function vary(hex, amt = 0.08, r = Math.random) {
  const c = new THREE.Color(hex);
  const k = 1 + (r() - 0.5) * 2 * amt;
  c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k);
  return '#' + c.getHexString();
}

// Floating island chunk; returns surface height function
export function island(vox, R, { seed = 3, grass = '#5f9e3a', dirt = '#7a5232', stone = '#6f6a66', topFn = () => 0, depth = 14 } = {}) {
  const r = rng(seed);
  const top = {};
  for (let x = -R - 3; x <= R + 3; x++) for (let z = -R - 3; z <= R + 3; z++) {
    const d = Math.hypot(x, z);
    const edge = R + (fbm(x * 0.15, z * 0.15, seed) - 0.5) * 6;
    if (d > edge) continue;
    const t = d / edge;
    const h = Math.round(topFn(x, z));
    const bottom = -Math.round(depth * (1 - t * t) * (0.6 + 0.6 * fbm(x * 0.3, z * 0.3, seed + 5)) + 2);
    for (let y = bottom; y <= h; y++) {
      let c;
      if (y === h) c = vary(grass, 0.12, r);
      else if (y > h - 3) c = vary(dirt, 0.1, r);
      else c = vary(r() < 0.5 ? stone : dirt, 0.12, r);
      vox.set(x, y, z, c);
    }
    top[`${x},${z}`] = h;
  }
  return (x, z) => top[`${Math.round(x)},${Math.round(z)}`];
}

export function setup({ w = 1080, h = 810, skyTop = '#2a3b63', skyBottom = '#f2a65a', fog = '#e8a66a', fogNear = 120, fogFar = 320 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h); renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  // gradient sky
  const cv = document.createElement('canvas'); cv.width = 2; cv.height = 512;
  const g = cv.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, skyTop); gr.addColorStop(1, skyBottom); g.fillStyle = gr; g.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
  scene.fog = new THREE.Fog(fog, fogNear, fogFar);
  const camera = new THREE.PerspectiveCamera(35, w / h, 1, 1000);
  return { THREE, renderer, scene, camera };
}

export function sun(scene, { color = '#ffc58a', intensity = 3.2, pos = [-80, 70, 40], sky = '#9fb7e8', ground = '#6b4a32', hemi = 1.0, size = 70 } = {}) {
  scene.add(new THREE.HemisphereLight(sky, ground, hemi));
  const d = new THREE.DirectionalLight(color, intensity);
  d.position.set(...pos); d.castShadow = true;
  d.shadow.mapSize.set(4096, 4096);
  Object.assign(d.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 1, far: 400 });
  d.shadow.bias = -0.0004; d.shadow.normalBias = 0.6;
  scene.add(d);
  return d;
}

export function particles(scene, n, { color = '#fff', size = 0.5, box = [80, 40, 80], y0 = 0, opacity = 0.7, seed = 9 } = {}) {
  const r = rng(seed);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (r() - 0.5) * box[0]; pos[i * 3 + 1] = y0 + r() * box[1]; pos[i * 3 + 2] = (r() - 0.5) * box[2];
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false }));
  scene.add(p); return p;
}

export function glowSprite(scene, pos, color, scale) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.position.set(...pos); s.scale.set(scale, scale, 1); scene.add(s); return s;
}
