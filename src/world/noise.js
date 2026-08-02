// ── noise.js ────────────────────────────────────────────────────────────────
// The shape of the world. Everything about the landscape — where hills are,
// where the lake sits, which slopes are rock — comes out of `heightAt()`.
//
// It is a pure function of (x, z) with no state, which buys us three things:
//   1. Terrain chunks can be built and thrown away in any order, identically.
//   2. Player collision is an exact query, so no physics engine is needed.
//   3. The same seed reproduces the same world, forever.

import { createNoise2D, createNoise4D } from 'simplex-noise';
import { SEED, TERRAIN, LAKE, SCATTER, WATER_LEVEL } from '../config.js';
import { lerp, smoothstep } from '../util/math.js';
// caves.js imports nothing from here, so this is not a cycle — the carve is
// pure integer hashing by design, precisely so it can live inside heightAt.
import { caveCarve } from './caves.js';

// ── Seeded PRNG (Alea, by Johannes Baagøe) ──────────────────────────────────
// Inlined rather than pulled from npm: it is fifteen lines, and owning it means
// the world's determinism has no external dependency at all.
function mash() {
  let n = 0xefc8249d;
  return (data) => {
    data = String(data);
    for (let i = 0; i < data.length; i++) {
      n += data.charCodeAt(i);
      let h = 0.02519603282416938 * n;
      n = h >>> 0;
      h -= n;
      h *= n;
      n = h >>> 0;
      h -= n;
      n += h * 0x100000000;
    }
    return (n >>> 0) * 2.3283064365386963e-10;
  };
}

/** A fresh deterministic random stream. `tag` keeps streams independent. */
export function makeRandom(tag) {
  const m = mash();
  const seed = `${SEED}:${tag}`;
  let s0 = m(' ');
  let s1 = m(' ');
  let s2 = m(' ');
  let c = 1;
  s0 -= m(seed); if (s0 < 0) s0 += 1;
  s1 -= m(seed); if (s1 < 0) s1 += 1;
  s2 -= m(seed); if (s2 < 0) s2 += 1;
  return () => {
    const t = 2091639 * s0 + c * 2.3283064365386963e-10;
    s0 = s1;
    s1 = s2;
    c = t | 0;
    s2 = t - c;
    return s2;
  };
}

// ── Noise fields ────────────────────────────────────────────────────────────
const nWarpA = createNoise2D(makeRandom('warpA'));
const nWarpB = createNoise2D(makeRandom('warpB'));
const nBase = createNoise2D(makeRandom('base'));
const nRidge = createNoise2D(makeRandom('ridge'));
const nRidgeMask = createNoise2D(makeRandom('ridgeMask'));
const nDetail = createNoise2D(makeRandom('detail'));
const nTint = createNoise2D(makeRandom('tint'));
const nClump = createNoise2D(makeRandom('clump'));

/** 4-D noise, used to build perfectly tiling textures on a torus. */
export const noise4 = createNoise4D(makeRandom('tex4'));

/** Fractal Brownian motion — stacked octaves. Returns roughly [-1, 1]. */
function fbm(noise, x, y, octaves) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.02;
  }
  return sum / norm;
}

/**
 * Ridged multifractal — `1 - |noise|`, squared. Returns [0, 1].
 * Where plain fbm gives you rounded hills, this gives you sharp crests, which
 * is what makes a mountain read as a mountain.
 */
function ridged(noise, x, y, octaves) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x * freq, y * freq));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/**
 * Carve the lake basin. `t` sweeps 0 at the rim to 1 at the centre, so the
 * shore emerges naturally wherever the blended height crosses the waterline —
 * giving beaches on gentle ground and bluffs where the land was already high.
 */
function carveLake(x, z, h) {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= LAKE.radius) return h;
  const t = smoothstep(LAKE.radius, LAKE.radius * 0.3, d);
  const floor = WATER_LEVEL - 2 - LAKE.floorDrop * t;
  return lerp(h, Math.min(h, floor), t);
}

/** Ground height in metres at world (x, z). The definition of the landscape. */
export function heightAt(x, z) {
  const T = TERRAIN;

  // Domain warping: distort the lookup coordinates before sampling. Cheap, and
  // it is the difference between generic lumps and carved ridges and valleys.
  const wf = T.warpFreq;
  const wx = x + T.warpAmp * nWarpA(x * wf, z * wf);
  const wz = z + T.warpAmp * nWarpB(x * wf + 31.7, z * wf - 17.3);

  // Broad valley form.
  let h = T.baseOffset + T.baseAmp * fbm(nBase, wx * T.baseFreq, wz * T.baseFreq, 5);

  // Peaks, but only in the regions the mask permits — so there are genuine
  // highlands and genuine open lowlands, not uniform bumpiness everywhere.
  const maskRaw = 0.5 + 0.5 * nRidgeMask(x * T.ridgeMaskFreq, z * T.ridgeMaskFreq);
  const mask = smoothstep(T.ridgeMaskLo, T.ridgeMaskHi, maskRaw);
  if (mask > 0) {
    h += mask * T.ridgeAmp * ridged(nRidge, wx * T.ridgeFreq, wz * T.ridgeFreq, 4);
  }

  // Small undulation — the hummocks you actually feel underfoot as you walk.
  h += T.detailAmp * nDetail(x * T.detailFreq, z * T.detailFreq);

  h = carveLake(x, z, h);

  // ── caves ──
  // Driven into the ground AFTER the lake carve, so a cave never opens into
  // the basin floor and fills with water.
  //
  // This is the one place a per-sample cost genuinely matters — heightAt is
  // called by collision, scatter, creatures, arrows and every terrain vertex —
  // so `caveCarve` early-outs on a single integer hash per candidate cell and
  // returns 0 for almost the entire world. See the note in caves.js about why
  // it is written out longhand rather than calling caveInCell.
  if (h > WATER_LEVEL + 1) h -= caveCarve(x, z);

  return h;
}

/**
 * Surface normal from the analytic height gradient.
 *
 * Deliberately *not* `computeVertexNormals()`: deriving normals from the same
 * function at every level of detail means a distant low-res chunk shades
 * identically to a near high-res one, so LOD transitions never pop.
 */
export function normalAt(x, z, out) {
  const e = 1.2;
  const hl = heightAt(x - e, z);
  const hr = heightAt(x + e, z);
  const hd = heightAt(x, z - e);
  const hu = heightAt(x, z + e);
  return out.set(hl - hr, 2 * e, hd - hu).normalize();
}

/** 0 = dead flat, 1 = vertical cliff. */
export function slopeAt(x, z) {
  const e = 1.2;
  const dx = (heightAt(x - e, z) - heightAt(x + e, z)) / (2 * e);
  const dz = (heightAt(x, z - e) - heightAt(x, z + e)) / (2 * e);
  return 1 - 1 / Math.sqrt(dx * dx + dz * dz + 1);
}

/** Low-frequency colour variation, so the ground is never a flat wash. [-1,1] */
export function tintAt(x, z) {
  return nTint(x * TERRAIN.tintFreq, z * TERRAIN.tintFreq);
}

/**
 * Forest mask, [0,1]. Real vegetation grows in copses and thins to nothing at
 * the treeline — a uniform scatter always looks synthetic.
 */
export function clumpAt(x, z) {
  const raw = 0.5 + 0.5 * fbm(nClump, x * SCATTER.treeClumpFreq, z * SCATTER.treeClumpFreq, 3);
  return smoothstep(SCATTER.treeClumpLo, SCATTER.treeClumpHi, raw);
}

/** True if this spot is under the lake surface. */
export const isUnderwater = (x, z) => heightAt(x, z) < WATER_LEVEL;
