// ── textures.js ─────────────────────────────────────────────────────────────
// Every texture in the world is generated here, in code, at load time.
// There are no image files anywhere in this project.
//
// The tiling ones (water normals, mist) are sampled on a 2-torus in 4-D noise
// space: walk a circle in (x,y) for u and another in (z,w) for v, and the field
// wraps perfectly in both directions with no visible seam.

import * as THREE from 'three';
import { noise4 } from '../world/noise.js';

const TAU = Math.PI * 2;

/** Seamless multi-octave height field on a torus. Returns Float32Array. */
function tilingField(size, octaves) {
  const out = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    const v = (j / size) * TAU;
    const cv = Math.cos(v);
    const sv = Math.sin(v);
    for (let i = 0; i < size; i++) {
      const u = (i / size) * TAU;
      const cu = Math.cos(u);
      const su = Math.sin(u);
      let sum = 0;
      let norm = 0;
      let amp = 1;
      for (let o = 0; o < octaves.length; o++) {
        const r = octaves[o];
        sum += amp * noise4(cu * r, su * r, cv * r, sv * r);
        norm += amp;
        amp *= 0.5;
      }
      out[j * size + i] = sum / norm;
    }
  }
  return out;
}

function finish(tex, { srgb = false, mips = true } = {}) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.generateMipmaps = mips;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Tiling normal map for the lake surface. Three's Water shader sums four
 * samples of this at different scales and scroll rates to build its ripples,
 * so it wants a plain tangent-space normal map — exactly what we bake here.
 */
export function makeWaterNormals(size = 256) {
  const h = tilingField(size, [1.7, 3.5, 7.2, 14.1]);
  const data = new Uint8Array(size * size * 4);
  const bump = 2.4;
  const wrap = (k) => (k + size) % size;

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const hl = h[j * size + wrap(i - 1)];
      const hr = h[j * size + wrap(i + 1)];
      const hd = h[wrap(j - 1) * size + i];
      const hu = h[wrap(j + 1) * size + i];
      let nx = (hl - hr) * bump;
      let ny = (hd - hu) * bump;
      let nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv;
      ny *= inv;
      nz *= inv;
      const o = (j * size + i) * 4;
      data[o] = (nx * 0.5 + 0.5) * 255;
      data[o + 1] = (ny * 0.5 + 0.5) * 255;
      data[o + 2] = (nz * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  return finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat));
}

/** Soft alpha blob — the sprite for pollen and dust motes. */
export function makeSoftCircle(size = 64) {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const d = Math.sqrt((i - c) ** 2 + (j - c) ** 2) / c;
      const a = Math.max(0, 1 - d) ** 2.1;
      const o = (j * size + i) * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = a * 255;
    }
  }
  return finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat), { mips: false });
}

/** Warm radial glow — the haze disc that sits around the sun and feeds bloom. */
export function makeRadialGlow(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const d = Math.min(1, Math.sqrt((i - c) ** 2 + (j - c) ** 2) / c);
      // Two lobes: a tight core for the disc, a wide skirt for atmospheric haze.
      const core = Math.max(0, 1 - d / 0.16) ** 2;
      const skirt = (1 - d) ** 3.4;
      const a = Math.min(1, core * 0.9 + skirt * 0.55);
      const o = (j * size + i) * 4;
      data[o] = 255;
      data[o + 1] = 236;
      data[o + 2] = 205;
      data[o + 3] = a * 255;
    }
  }
  return finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat), { mips: false });
}

/** Tiling wispy alpha for the valley mist sheets. */
export function makeMistAlpha(size = 256) {
  const h = tilingField(size, [1.4, 2.9, 6.1]);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    // Bias hard toward transparent so the mist is wisps, not a grey sheet.
    const a = Math.max(0, h[i] * 0.5 + 0.5) ** 2.6;
    const o = i * 4;
    data[o] = 255;
    data[o + 1] = 255;
    data[o + 2] = 255;
    data[o + 3] = a * 255;
  }
  return finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat));
}
