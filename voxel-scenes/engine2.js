import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
export { THREE };

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export function hash2(x, z, seed = 0) {
  let h = (Math.round(x * 7) * 374761393 + Math.round(z * 7) * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function ihash(x, z, seed) {
  let h = (x * 374761393 + z * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const sm = (t) => t * t * (3 - 2 * t);
export function noise2(x, z, seed = 0) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const a = ihash(xi, zi, seed), b = ihash(xi + 1, zi, seed), c = ihash(xi, zi + 1, seed), d = ihash(xi + 1, zi + 1, seed);
  const u = sm(xf), v = sm(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, seed = 0, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * noise2(x * f, z * f, seed + i * 17); amp *= 0.5; f *= 2; }
  return s / (1 - Math.pow(0.5, oct));
}

const _c = new THREE.Color();
export function vary(hex, amt = 0.08, r = Math.random) {
  _c.set(hex);
  const k = 1 + (r() - 0.5) * 2 * amt;
  return [Math.min(1, _c.r * k), Math.min(1, _c.g * k), Math.min(1, _c.b * k)];
}
export function col(hex) { _c.set(hex); return [_c.r, _c.g, _c.b]; }

// Voxel grid in world units with cell size S. Numeric keys for speed.
const OFF = 1024, W = 2048;
export class Voxels {
  constructor(S = 0.5) { this.S = S; this.map = new Map(); this.glow = new Set(); }
  k(ix, iy, iz) { return ((ix + OFF) * W + (iy + OFF)) * W + (iz + OFF); }
  idx(v) { return Math.round(v / this.S); }
  set(x, y, z, c, glow = false) { this.seti(this.idx(x), this.idx(y), this.idx(z), c, glow); }
  seti(ix, iy, iz, c, glow = false) {
    const key = this.k(ix, iy, iz);
    if (c === null) { this.map.delete(key); this.glow.delete(key); return; }
    if (typeof c === 'string') c = col(c);
    this.map.set(key, c);
    if (glow) this.glow.add(key); else this.glow.delete(key);
  }
  has(x, y, z) { return this.map.has(this.k(this.idx(x), this.idx(y), this.idx(z))); }

  // Merged mesh with hidden faces removed (much fewer triangles than instancing)
  buildMerged(scene, { shadow = true, emissive = 0 } = {}) {
    const S = this.S, m = this.map, WW = W * W, h = S / 2;
    const dirs = [
      [WW, [1, 0, 0], [[h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h]]],
      [-WW, [-1, 0, 0], [[-h, -h, h], [-h, h, h], [-h, h, -h], [-h, -h, -h]]],
      [W, [0, 1, 0], [[-h, h, -h], [-h, h, h], [h, h, h], [h, h, -h]]],
      [-W, [0, -1, 0], [[-h, -h, h], [-h, -h, -h], [h, -h, -h], [h, -h, h]]],
      [1, [0, 0, 1], [[h, -h, h], [h, h, h], [-h, h, h], [-h, -h, h]]],
      [-1, [0, 0, -1], [[-h, -h, -h], [-h, h, -h], [h, h, -h], [h, -h, -h]]],
    ];
    const out = { s: { p: [], n: [], c: [] }, g: { p: [], n: [], c: [] } };
    for (const [key, c] of m) {
      const iz = (key % W) - OFF, iy = (Math.floor(key / W) % W) - OFF, ix = Math.floor(key / WW) - OFF;
      const x = ix * S, y = iy * S, z = iz * S;
      const o = this.glow.has(key) ? out.g : out.s;
      for (const [d, n, q] of dirs) {
        if (m.has(key + d)) continue;
        for (const vi of [0, 1, 2, 0, 2, 3]) {
          o.p.push(x + q[vi][0], y + q[vi][1], z + q[vi][2]); o.n.push(...n); o.c.push(c[0], c[1], c[2]);
        }
      }
    }
    const mk = (o, mat, sh) => {
      if (!o.p.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = mesh.receiveShadow = sh; scene.add(mesh);
    };
    mk(out.s, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, emissive: new THREE.Color(emissive || 0), emissiveIntensity: emissive ? 1 : 0 }), shadow);
    mk(out.g, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false);
    return out.s.p.length / 18 + out.g.p.length / 18;
  }
  cells() { // culled list of [x, y, z, color, glow] in world units
    const S = this.S, m = this.map, WW = W * W, out = [];
    for (const [key, c] of m) {
      if (m.has(key + WW) && m.has(key - WW) && m.has(key + W) && m.has(key - W) && m.has(key + 1) && m.has(key - 1)) continue;
      const iz = (key % W) - OFF, iy = (Math.floor(key / W) % W) - OFF, ix = Math.floor(key / WW) - OFF;
      out.push([ix * S, iy * S, iz * S, c, this.glow.has(key)]);
    }
    return out;
  }
  build(scene, { shadow = true, emissive = 0 } = {}) {
    const S = this.S, solid = [], glow = [];
    const m = this.map, WW = W * W;
    for (const [key, c] of m) {
      if (m.has(key + WW) && m.has(key - WW) && m.has(key + W) && m.has(key - W) && m.has(key + 1) && m.has(key - 1)) continue;
      (this.glow.has(key) ? glow : solid).push(key, c);
    }
    const geo = new THREE.BoxGeometry(S, S, S);
    const mk = (list, mat, shadow) => {
      const n = list.length / 2; if (!n) return;
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      const mtx = new THREE.Matrix4(), cc = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const key = list[i * 2], c = list[i * 2 + 1];
        const iz = (key % W) - OFF, iy = (Math.floor(key / W) % W) - OFF, ix = Math.floor(key / WW) - OFF;
        mtx.makeTranslation(ix * S, iy * S, iz * S); mesh.setMatrixAt(i, mtx);
        mesh.setColorAt(i, cc.setRGB(c[0], c[1], c[2]));
      }
      mesh.castShadow = mesh.receiveShadow = shadow;
      scene.add(mesh);
    };
    mk(solid, new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 1 : 0 }), shadow);
    mk(glow, new THREE.MeshBasicMaterial({ toneMapped: false }), false);
    return (solid.length + glow.length) / 2;
  }
}

export function setup({ w, h, sky, fog, fogDensity = 0.004, exposure = 1.0 }) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(w, h); renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 1024;
  const g = cv.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 1024);
  sky.forEach(([t, c]) => gr.addColorStop(t, c)); g.fillStyle = gr; g.fillRect(0, 0, 4, 1024);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
  scene.fog = new THREE.FogExp2(fog, fogDensity);
  const camera = new THREE.PerspectiveCamera(32, w / h, 1, 2000);
  return { renderer, scene, camera };
}

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.35 }, warm: { value: new THREE.Vector3(1.03, 1.0, 0.96) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; uniform vec3 warm; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = 1.0 - amount * dot(d, d) * 2.2;
      gl_FragColor = vec4(c.rgb * warm * v, c.a); }`,
};

export const overlay = new THREE.Scene();
export function composer(renderer, scene, camera, w, h, { bloom = [0.55, 0.5, 0.82], ao = true } = {}) {
  const comp = new EffectComposer(renderer);
  comp.setPixelRatio(1); comp.setSize(w, h);
  comp.addPass(new RenderPass(scene, camera));
  if (ao) {
    const gtao = new GTAOPass(scene, camera, w, h);
    gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 1.5, scale: 1.2, samples: 8 });
    gtao.blendIntensity = 0.85;
    comp.addPass(gtao);
  }
  const ov = new RenderPass(overlay, camera); ov.clear = false; ov.clearDepth = true; comp.addPass(ov);
  comp.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), ...bloom));
  comp.addPass(new OutputPass());
  comp.addPass(new ShaderPass(VignetteShader));
  return comp;
}

export function glowSprite(scene, pos, color, scale, opacity = 1) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, color); gr.addColorStop(0.25, color.replace(/[\d.]+\)$/, '0.35)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }));
  s.position.set(...pos); s.scale.set(scale, scale, 1); overlay.add(s); return s;
}

export function points(scene, n, { color, size, box, center = [0, 0, 0], opacity = 0.7, seed = 9, additive = false }) {
  const r = rng(seed); const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = center[0] + (r() - 0.5) * box[0]; pos[i * 3 + 1] = center[1] + r() * box[1]; pos[i * 3 + 2] = center[2] + (r() - 0.5) * box[2];
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  overlay.add(p); return p;
}
