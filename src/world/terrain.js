// ── terrain.js ──────────────────────────────────────────────────────────────
// Streams terrain chunks around the player at four levels of detail, so the
// ground underfoot has 2-metre triangles while the far ridges cost almost
// nothing. Two details make that seamless:
//
//   * Normals come from the analytic height gradient, not from the mesh, so
//     neighbouring chunks at different resolutions shade identically.
//   * Every chunk hangs a "skirt" down from its four edges. Where a high-res
//     edge has vertices its low-res neighbour lacks, the resulting hairline
//     crack shows skirt instead of sky. Standard trick, invisible in practice.

import * as THREE from 'three';
import { TERRAIN, Q, WATER_LEVEL } from '../config.js';
import { heightAt, normalAt, tintAt } from './noise.js';
import { clamp, smoothstep } from '../util/math.js';

// Ground palette. Declared as sRGB hex; three converts to linear working space
// on construction, which is what vertex colours need.
// Pitched brighter than feels right in isolation: the sun is low, so most
// ground is lit only by skylight, and dark albedos crush to mud under it. The
// grass blades are sparse by nature, so this colour IS most of what you see.
const C_VALLEY = new THREE.Color(0x5a6d2f); // sheltered low ground
const C_GRASS = new THREE.Color(0x8a9445); // mid green
const C_DRY = new THREE.Color(0xc3ab66); // sun-bleached upland gold
const C_ROCK = new THREE.Color(0x62594d); // exposed stone on steep faces
const C_SCREE = new THREE.Color(0x9d9384); // pale shattered rock near the peaks
const C_SHORE = new THREE.Color(0x8a7952); // wet sand and mud at the waterline
const C_BED = new THREE.Color(0x2e3526); // lake bed

const _n = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Colour the ground by slope and altitude rather than with a texture.
 * Slope is what stops procedural terrain looking like painted plastic: rock
 * appears exactly where the land is too steep to hold soil.
 */
function terrainColor(x, z, h, slope, out) {
  const tint = tintAt(x, z);

  // Altitude ramp: green in the sheltered valleys, dry gold on the uplands.
  // The band is wide on purpose — a narrow one turns the whole map one colour.
  out.copy(C_VALLEY).lerp(C_DRY, smoothstep(18, 72, h));

  // Patchy green/gold variation so no two hillsides read the same.
  out.lerp(C_GRASS, clamp(0.45 + 0.55 * tint, 0, 1) * 0.72);

  // Rock where soil could not cling.
  out.lerp(C_ROCK, smoothstep(0.33, 0.63, slope));

  // Pale scree approaching the tops.
  out.lerp(C_SCREE, smoothstep(76, 108, h) * 0.85);

  // Darkened wet margin, then the lake bed below it.
  out.lerp(C_SHORE, smoothstep(WATER_LEVEL + 2.0, WATER_LEVEL - 0.5, h) * 0.75);
  out.lerp(C_BED, smoothstep(WATER_LEVEL, WATER_LEVEL - 5, h) * 0.85);

  return out;
}

/** Build one chunk's geometry: a height grid plus a hanging skirt. */
function buildChunkGeometry(cx, cz, seg) {
  const size = TERRAIN.chunkSize;
  const step = size / seg;
  const ox = cx * size - size * 0.5;
  const oz = cz * size - size * 0.5;
  const n = seg + 1;

  const gridCount = n * n;
  const skirtCount = 4 * n * 2; // four sides, a top and a dropped vertex each
  const vCount = gridCount + skirtCount;

  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = [];

  // ── surface grid ──
  for (let j = 0; j < n; j++) {
    const z = oz + j * step;
    for (let i = 0; i < n; i++) {
      const x = ox + i * step;
      const h = heightAt(x, z);
      const k = (j * n + i) * 3;
      pos[k] = x;
      pos[k + 1] = h;
      pos[k + 2] = z;
      normalAt(x, z, _n);
      nor[k] = _n.x;
      nor[k + 1] = _n.y;
      nor[k + 2] = _n.z;
      terrainColor(x, z, h, 1 - _n.y, _c);
      col[k] = _c.r;
      col[k + 1] = _c.g;
      col[k + 2] = _c.b;
    }
  }
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  // ── skirt ──
  const edge = [
    (k) => k, // j = 0
    (k) => seg * n + k, // j = seg
    (k) => k * n, // i = 0
    (k) => k * n + seg, // i = seg
  ];
  let base = gridCount;
  for (const pick of edge) {
    const start = base;
    for (let k = 0; k <= seg; k++) {
      const g = pick(k) * 3;
      const top = base * 3;
      const bot = (base + 1) * 3;
      pos[top] = pos[g];
      pos[top + 1] = pos[g + 1];
      pos[top + 2] = pos[g + 2];
      pos[bot] = pos[g];
      pos[bot + 1] = pos[g + 1] - TERRAIN.skirtDepth;
      pos[bot + 2] = pos[g + 2];
      for (let q = 0; q < 3; q++) {
        nor[top + q] = nor[g + q];
        nor[bot + q] = nor[g + q];
        col[top + q] = col[g + q] * 0.45;
        col[bot + q] = col[g + q] * 0.25;
      }
      base += 2;
    }
    for (let k = 0; k < seg; k++) {
      const a = start + k * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    // Skirts are only ever seen edge-on through a hairline crack, so rather
    // than fuss over per-side winding we render the terrain double-sided.
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
      dithering: true,
    });
    this.chunks = new Map();
    this.queue = [];
    this.lastKey = null;
  }

  /** Call once per frame with the player's position. */
  update(px, pz) {
    const size = TERRAIN.chunkSize;
    const pcx = Math.round(px / size);
    const pcz = Math.round(pz / size);
    const key = `${pcx},${pcz}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.plan(pcx, pcz);
    }
    this.drain();
  }

  /** Work out which chunks should exist, at what resolution. */
  plan(pcx, pcz) {
    const R = Q.viewChunks;
    const lods = Q.lodSegments;
    const want = new Set();
    const jobs = [];

    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        const seg = lods[Math.min(ring, lods.length - 1)];
        const key = `${cx},${cz}`;
        want.add(key);
        const have = this.chunks.get(key);
        if (!have || have.seg !== seg) {
          jobs.push({ cx, cz, seg, key, d: dx * dx + dz * dz });
        }
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (!want.has(key)) this.remove(key, chunk);
    }

    jobs.sort((a, b) => a.d - b.d); // nearest first — build what I can see
    this.queue = jobs;
  }

  remove(key, chunk) {
    this.scene.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    this.chunks.delete(key);
  }

  /** Build a couple of chunks per frame so streaming never hitches. */
  drain() {
    let budget = TERRAIN.maxBuildsPerFrame;
    while (budget-- > 0 && this.queue.length) {
      const job = this.queue.shift();
      const old = this.chunks.get(job.key);
      if (old) this.remove(job.key, old);

      const mesh = new THREE.Mesh(buildChunkGeometry(job.cx, job.cz, job.seg), this.material);
      mesh.receiveShadow = true;
      // Terrain does not cast: at this sun angle a hill's shadow is hundreds of
      // metres long and would clip against the shadow camera. The analytic
      // normals already give the raking light its bite.
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      this.chunks.set(job.key, { mesh, seg: job.seg });
    }
  }

  /** Force the whole visible set to exist right now (used before frame one). */
  buildImmediate(px, pz) {
    const size = TERRAIN.chunkSize;
    const pcx = Math.round(px / size);
    const pcz = Math.round(pz / size);
    this.lastKey = `${pcx},${pcz}`;
    this.plan(pcx, pcz);
    while (this.queue.length) this.drain();
  }

  get chunkCount() {
    return this.chunks.size;
  }
}
