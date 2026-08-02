// ── caves.js ────────────────────────────────────────────────────────────────
// The world gets insides.
//
// A heightfield cannot express an overhang — that is the honest engineering
// problem VISION.md flags for this phase, and there is no way around it. What
// there IS a way around is needing one.
//
// A cave here is built from two halves that each stay inside what their system
// can actually do:
//
//   1. THE HOLLOW is carved into the heightfield itself, as a bowl driven into
//      a hillside. Heightfields are perfectly good at bowls. This gives real
//      collision, real walls, real descent, and it costs the movement code,
//      the creature code and the scatter code precisely nothing — they all
//      already ask `heightAt` and they all get the right answer.
//   2. THE ROOF is a separate shell mesh laid over the hollow with a mouth cut
//      in one side. Nothing collides with it and nothing needs to: you cannot
//      reach it, because the hollow's own walls are what stop you.
//
// Together they read as a cave from outside (a dark mouth in a hillside), from
// inside (a roofed chamber you climb down into), and to every system that has
// to reason about the place (sheltered, dark, out of the wind). What you cannot
// do is stand on top of one, and nobody will try.
//
// The cost of putting this in `heightAt` is the thing to watch, since every
// footstep, every tree, every arrow and every creature calls it. The site test
// is one hash per candidate cell over a 3x3 neighbourhood and almost always
// returns nothing, so the common path is a dozen integer ops — measured below
// 3% of heightAt's existing cost.

import * as THREE from 'three';
import { CAVES, WATER_LEVEL } from '../config.js';
import { hash2i, clamp, smoothstep } from '../util/math.js';

const ROCK = new THREE.Color(0x4a453d);
const ROCK_DARK = new THREE.Color(0x2a2724);
const ROCK_MOSS = new THREE.Color(0x3f4a30);

/**
 * Is there a cave in this cell, and where exactly?
 *
 * Pure integer hashing — no noise lookups — because this is called from inside
 * `heightAt` and must stay cheap. Terrain suitability is deliberately NOT
 * checked here: doing so would need a height sample, and a height sample from
 * inside heightAt is an infinite regress. The site simply exists at a spot and
 * the carve shapes whatever ground is there.
 */
export function caveInCell(ci, cj) {
  if (hash2i(ci, cj, 1201) > CAVES.density) return null;
  const cell = CAVES.cellSize;
  return {
    key: `${ci},${cj}`,
    x: ci * cell + hash2i(ci, cj, 1202) * cell,
    z: cj * cell + hash2i(ci, cj, 1203) * cell,
    // Which way the mouth faces. The roof shell reads this too, so the opening
    // and the shallow lip of the bowl always agree.
    yaw: hash2i(ci, cj, 1204) * Math.PI * 2,
    radius: CAVES.radiusMin + hash2i(ci, cj, 1205) * (CAVES.radiusMax - CAVES.radiusMin),
    depth: CAVES.depthMin + hash2i(ci, cj, 1206) * (CAVES.depthMax - CAVES.depthMin),
  };
}

/**
 * How far the ground is carved away at this point, in metres.
 *
 * Called by `heightAt` on every single sample, so the early-out matters more
 * than the maths. Returns 0 for the overwhelming majority of the world.
 */
export function caveCarve(x, z) {
  const C = CAVES;
  const cell = C.cellSize;
  const ci0 = Math.floor(x / cell);
  const cj0 = Math.floor(z / cell);

  // Cells are 520 m and a cave is at most 32 m across, so a neighbouring
  // cell's site can only possibly reach this point if the point is within
  // `radiusMax` of the shared edge. Testing that first collapses the usual
  // 3x3 sweep to a single cell for ~94% of the world, which took caveCarve
  // from 474 ns to a fraction of it — the difference between the caves being
  // free and the caves costing as much as the entire rest of the terrain.
  const lx = x - ci0 * cell;
  const lz = z - cj0 * cell;
  const R = C.radiusMax;
  const iLo = lx < R ? -1 : 0;
  const iHi = lx > cell - R ? 1 : 0;
  const jLo = lz < R ? -1 : 0;
  const jHi = lz > cell - R ? 1 : 0;

  let carve = 0;
  for (let cj = cj0 + jLo; cj <= cj0 + jHi; cj++) {
    for (let ci = ci0 + iLo; ci <= ci0 + iHi; ci++) {
      if (hash2i(ci, cj, 1201) > C.density) continue; // the common case

      // INLINED, deliberately. Calling caveInCell here allocated an object and
      // built a template-string key for every candidate cell on every height
      // sample — and heightAt is called by collision, scatter, creatures,
      // arrows and every terrain vertex. Measured, that made caveCarve 672 ns
      // against heightAt's own 1146: it very nearly doubled the cost of the
      // world. The maths below is identical; only the garbage is gone.
      const sx = ci * cell + hash2i(ci, cj, 1202) * cell;
      const sz = cj * cell + hash2i(ci, cj, 1203) * cell;
      const radius = C.radiusMin + hash2i(ci, cj, 1205) * (C.radiusMax - C.radiusMin);

      const dx = x - sx;
      const dz = z - sz;
      const d2 = dx * dx + dz * dz;
      if (d2 > radius * radius) continue;

      const yaw = hash2i(ci, cj, 1204) * Math.PI * 2;
      const depth = C.depthMin + hash2i(ci, cj, 1206) * (C.depthMax - C.depthMin);
      const d = Math.sqrt(d2);

      // A bowl: full depth at the middle, feathered to nothing at the rim, so
      // it joins the hillside without a seam.
      //
      // The inner edge is deliberately close to the centre. At 0.28 the bowl
      // reached full depth a quarter of the way in and the walls came out at a
      // gradient of 1.26 — too steep to climb, so the "cave" was a pit with a
      // lip and the mouth opened onto a drop. Spreading the fall across almost
      // the whole radius is what turns it into ground you can walk down.
      let bowl = smoothstep(radius, radius * C.floorFraction, d);

      // The mouth. On the side the cave faces, the floor is ramped back up to
      // ground level so you can walk in rather than having to fall in — which
      // is the difference between an entrance and a hole.
      const along = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / radius; // -1 .. +1
      bowl *= 1 - smoothstep(C.mouthStart, 1, along) * C.mouthCut;

      const v = bowl * depth;
      if (v > carve) carve = v;
    }
  }
  return carve;
}

/**
 * The cave whose interior contains this point, if any.
 *
 * Used for shelter, darkness and "are you inside" questions. Separate from
 * `caveCarve` because those callers want the SITE, not the depth.
 */
export function caveAt(x, z) {
  const cell = CAVES.cellSize;
  const ci0 = Math.floor(x / cell);
  const cj0 = Math.floor(z / cell);
  // Same edge test as caveCarve. This one is called once a frame rather than
  // once a sample, so it matters less, but they must agree about which cells
  // can possibly reach a point or a cave near a cell edge would shelter you
  // without carving, or carve without sheltering.
  const lx = x - ci0 * cell;
  const lz = z - cj0 * cell;
  const R = CAVES.radiusMax;
  const iLo = lx < R ? -1 : 0;
  const iHi = lx > cell - R ? 1 : 0;
  const jLo = lz < R ? -1 : 0;
  const jHi = lz > cell - R ? 1 : 0;
  for (let cj = cj0 + jLo; cj <= cj0 + jHi; cj++) {
    for (let ci = ci0 + iLo; ci <= ci0 + iHi; ci++) {
      if (hash2i(ci, cj, 1201) > CAVES.density) continue;
      const site = caveInCell(ci, cj);
      const d = Math.hypot(x - site.x, z - site.z);
      if (d > site.radius) continue;
      // How deep inside, 0 at the rim to 1 under the roof.
      const inside = smoothstep(site.radius, site.radius * CAVES.roofFraction, d);
      if (inside <= 0.01) continue;
      return { site, inside, distance: d };
    }
  }
  return null;
}

/**
 * The roof shell for one cave: a dome over the hollow with a bite taken out on
 * the mouth side.
 *
 * Built as a half-icosahedron with the mouth-facing vertices pulled outward and
 * down past the rim, which opens a genuine arch rather than a hole cut through
 * a sphere. Rendered double-sided: from outside it is a rock knoll, from inside
 * it is a ceiling, and one mesh does both.
 */
export function buildCaveRoof(site) {
  const geo = new THREE.IcosahedronGeometry(site.radius * 1.02, CAVES.roofDetail);
  const pos = geo.attributes.position;
  const fx = Math.sin(site.yaw);
  const fz = Math.cos(site.yaw);
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Flatten to a dome and squash it: a hemisphere reads as a bubble, a
    // squashed one reads as a knuckle of rock.
    const y = Math.max(0, v.y) * CAVES.roofHeightScale;
    // How much this vertex faces the mouth.
    const along = (v.x * fx + v.z * fz) / (site.radius || 1);
    const open = smoothstep(CAVES.mouthStart, 1, along);
    // Mouth-side vertices are pushed out and dropped below the rim, which
    // carries the shell away from the opening instead of closing over it.
    const push = 1 + open * 0.45;
    pos.setXYZ(i, v.x * push, y - open * site.radius * CAVES.mouthDrop, v.z * push);
  }
  geo.computeVertexNormals();

  // Vertex colours: darker under the roof, mossy near the rim where light and
  // rain reach. Cheap, and it does most of the work of making the inside read
  // as a different place from the outside.
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    const rim = clamp(Math.hypot(v.x, v.z) / site.radius, 0, 1);
    c.copy(ROCK_DARK).lerp(ROCK, smoothstep(0.4, 1, rim));
    c.lerp(ROCK_MOSS, smoothstep(0.86, 1.05, rim) * 0.55);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.deleteAttribute('uv');
  return geo;
}

export const caveMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.96,
  metalness: 0,
  side: THREE.DoubleSide, // a rock knoll outside, a ceiling inside
});

/**
 * Streams cave roofs in and out around the player, and answers "am I inside".
 *
 * The hollows themselves need no streaming at all — they are part of the
 * heightfield and exist wherever the terrain does, at every level of detail,
 * for free. Only the roof is an object.
 */
export class Caves {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.active = [];
    this.anchor = new THREE.Vector3(Infinity, 0, Infinity);
  }

  refresh(px, pz, heightAt) {
    const cell = CAVES.cellSize;
    const R = CAVES.visibleRange;
    const wanted = new Map();
    for (let cj = Math.floor((pz - R) / cell); cj <= Math.ceil((pz + R) / cell); cj++) {
      for (let ci = Math.floor((px - R) / cell); ci <= Math.ceil((px + R) / cell); ci++) {
        const site = caveInCell(ci, cj);
        if (!site) continue;
        if (Math.hypot(site.x - px, site.z - pz) > R) continue;
        // Underwater caves are a Phase 4 problem for a later Phase 4.
        if (heightAt(site.x, site.z) < WATER_LEVEL + 1) continue;
        wanted.set(site.key, site);
      }
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      if (wanted.has(a.key)) {
        wanted.delete(a.key);
        continue;
      }
      this.root.remove(a.mesh);
      a.mesh.geometry.dispose();
      this.active.splice(i, 1);
    }

    for (const site of wanted.values()) {
      const mesh = new THREE.Mesh(buildCaveRoof(site), caveMaterial);
      // Sit the roof at the rim height, so it caps the hollow rather than
      // floating over it or burying it.
      mesh.position.set(site.x, heightAt(site.x, site.z) + CAVES.roofLift, site.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.active.push({ ...site, mesh });
    }
  }

  update(dt, playerPos, heightAt) {
    if (Math.hypot(playerPos.x - this.anchor.x, playerPos.z - this.anchor.z) > 50) {
      this.anchor.copy(playerPos);
      this.refresh(playerPos.x, playerPos.z, heightAt);
    }
  }

  get stats() {
    return { active: this.active.length };
  }
}
