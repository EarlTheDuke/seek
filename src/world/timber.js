// ── timber.js ───────────────────────────────────────────────────────────────
// Where the trees and boulders are, as a pure function of the seed.
//
// WHY THIS EXISTS. An agent aiming a bow could see the ground and nothing else.
// `sightline` and `arcClearance` walk `heightAt`, so a shot that will bury
// itself in an oak reads as a clear line across a meadow — and it is not a
// theory: huntcheck, instrumented, showed BOTH aimed arrows of a run ending
// `hit tree`, 10 m and 6 m short of a mark at 21 m and 17 m. The body had no
// way to know the wood was there, so it took the same shot again.
//
// The browser knows, because it built the trees out of THREE and handed the
// projectile system a field of cylinders and spheres. An agent has no scene and
// never will. So this is the same move `deadfallNear` made for firewood: state
// the placement ONCE, as arithmetic both ends can run, and have the renderer
// build its geometry from the same answer rather than beside it.
//
// Pure and THREE-free, on purpose — it has to import into a socket check.
//
// ── the anchor problem, and why the lattice is global ──
//
// `Scatter.placeLarge` used to test each cell against a `HeightGrid` centred on
// the PLAYER, so whether a tree existed depended on where somebody was standing
// when the scatter was last placed, 8 m of interpolation at a time. Nothing
// outside that class could ever reproduce it. The lattice below is fixed to the
// world instead: same 8 m smoothing, same character of forest, but the answer
// to "is there a tree in this cell" no longer depends on who is looking.

import { SCATTER, WATER_LEVEL } from '../config.js';
import { heightAt, clumpAt } from './noise.js';
import { hash2i, lerp, smoothstep } from '../util/math.js';

// ── the smoothed ground the big scatter stands on ───────────────────────────

/** Metres between lattice samples. Was `HeightGrid(8, …)`'s spacing. */
const CELL = 8;

// A tree's cell is asked about five times over (once for height, four for the
// slope), and the same lattice corners are shared by every neighbouring cell,
// so the naive version costs tens of thousands of `heightAt` calls per
// placement. The lattice is a pure function of (i, j) and the world does not
// move, so nothing here ever needs invalidating.
const _lattice = new Map();

function cornerHeight(i, j) {
  const key = i * 8_388_593 + j; // a prime stride, so (i,j) collisions cannot happen
  let h = _lattice.get(key);
  if (h === undefined) {
    h = heightAt(i * CELL, j * CELL);
    _lattice.set(key, h);
  }
  return h;
}

/** The 8 m-smoothed height the scatter is placed against. */
export function latticeHeight(x, z) {
  const fx = x / CELL;
  const fz = z / CELL;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  return lerp(
    lerp(cornerHeight(i, j), cornerHeight(i + 1, j), tx),
    lerp(cornerHeight(i, j + 1), cornerHeight(i + 1, j + 1), tx),
    tz
  );
}

/** 0 = flat, 1 = cliff, measured over the same 8 m. */
export function latticeSlope(x, z) {
  const dx = (latticeHeight(x - CELL, z) - latticeHeight(x + CELL, z)) / (2 * CELL);
  const dz = (latticeHeight(x, z - CELL) - latticeHeight(x, z + CELL)) / (2 * CELL);
  return 1 - 1 / Math.sqrt(dx * dx + dz * dz + 1);
}

// ── what a tree of each variant is shaped like ──────────────────────────────
//
// These numbers used to come off the head of `Scatter`'s own random stream,
// interleaved with per-face colour jitter — reproducible only by replaying the
// whole geometry build, which is exactly what a body over a socket cannot do.
// Derived from the variant index instead, in the same ranges, so `makeTree` and
// an agent agree by construction rather than by anyone remembering to.

/** @returns {{height:number, trunkR:number, trunkH:number, crownY:number, crownR:number}} */
export function treeShape(variant) {
  const v = variant | 0;
  const height = lerp(5.5, 11, hash2i(v, 0, 71));
  const trunkR = lerp(0.28, 0.5, hash2i(v, 0, 72));
  const crownR = lerp(2.1, 3.1, hash2i(v, 0, 73));
  return {
    height,
    trunkR,
    trunkH: height * 0.58,
    crownY: height * 0.72,
    // The 1.15 the collider proxy has always used: the crown is a cluster of
    // blobs packed around one centre and spreads a little wider than the
    // nominal radius.
    crownR: crownR * 1.15,
  };
}

// The roughening pushes vertices out along their own radius by up to this
// much, so it is what the drawn boulder swells to. Named rather than buried:
// the collider is built from it at both ends.
export const ROCK_BOUND = 1.42;

/**
 * A boulder of this variant: nominal radius, the squash applied to it, and the
 * sphere the collision layer stands in for it with.
 *
 * `bound` is what `mesh.userData.radius` is set to. It was read off the built
 * geometry's bounding sphere, which is unavailable to anything without THREE —
 * and being a couple of centimetres out from the drawn rock matters far less
 * than both ends agreeing to the millimetre about where an arrow stops.
 */
export function rockShape(variant) {
  const v = variant | 0;
  const r = lerp(0.4, 1.25, hash2i(v, 0, 74));
  const sx = lerp(0.8, 1.5, hash2i(v, 0, 75));
  const sy = lerp(0.4, 0.8, hash2i(v, 0, 76));
  const sz = lerp(0.8, 1.5, hash2i(v, 0, 77));
  return { r, sx, sy, sz, bound: r * ROCK_BOUND * Math.max(sx, sz) };
}

// ── ground nobody plants on ─────────────────────────────────────────────────
//
// The five landmarks keep a circle clear so the scatter does not bury the very
// thing you walked over to look at. Their positions are a pure scan of the
// height field — `findSite` in landmarks.js — and that file cannot be imported
// here, so the scan lives in `landmarksites.js` and both sides call it.

import { landmarkClearings } from './landmarksites.js';

let _clearings = null;
function clearings() {
  if (!_clearings) setClearings(landmarkClearings());
  return _clearings;
}

/**
 * Override the circles kept clear. The default is the five landmarks, which is
 * what every caller passes anyway — this exists so that a world which sites
 * them differently cannot end up with a renderer and an agent disagreeing about
 * where the trees are.
 */
export function setClearings(list) {
  // Pre-square the radii so the placement loop stays sqrt-free.
  _clearings = list.map((c) => ({ x: c.x, z: c.z, r2: c.r * c.r }));
}

export function inClearing(x, z) {
  const list = clearings();
  for (let i = 0; i < list.length; i++) {
    const dx = x - list[i].x;
    const dz = z - list[i].z;
    if (dx * dx + dz * dz < list[i].r2) return true;
  }
  return false;
}

// ── the placement itself ────────────────────────────────────────────────────

/**
 * Every tree within `radius` of a point, with the shape of its solid parts.
 *
 * Same cell hashes, same clump mask, same height, slope and clearing rules as
 * `Scatter.placeLarge` — because this IS the rule now, and that method calls
 * these functions rather than keeping its own copy. Two definitions of "where
 * the trees are" would drift the first time either was tuned, and the drift
 * would be invisible: the trees you can see and the trees your arrow stops in
 * would simply stop being the same trees.
 *
 * `trunkR` and `crownR` come back ALREADY SCALED and already carrying the
 * fattening the collider proxy applies, so a caller can test against them
 * directly and get the same answer the projectile system gets.
 */
export function treesNear(px, pz, radius) {
  const tc = SCATTER.treeCell;
  const r2 = radius * radius;
  const out = [];
  for (let cj = Math.floor((pz - radius) / tc); cj <= Math.ceil((pz + radius) / tc); cj++) {
    for (let ci = Math.floor((px - radius) / tc); ci <= Math.ceil((px + radius) / tc); ci++) {
      const x = ci * tc + hash2i(ci, cj, 11) * tc;
      const z = cj * tc + hash2i(ci, cj, 12) * tc;
      if ((x - px) ** 2 + (z - pz) ** 2 > r2) continue;
      // Copses, not confetti.
      if (hash2i(ci, cj, 13) > clumpAt(x, z) * 0.92) continue;
      if (inClearing(x, z)) continue;
      const h = latticeHeight(x, z);
      if (h < SCATTER.treeMinHeight || h > SCATTER.treeMaxHeight) continue;
      if (latticeSlope(x, z) > SCATTER.treeMaxSlope) continue;

      const variant = Math.floor(hash2i(ci, cj, 14) * 5) % 5;
      const shape = treeShape(variant);
      // Thin and shrink toward the treeline, as real forests do.
      const alt = 1 - smoothstep(SCATTER.treeMaxHeight - 22, SCATTER.treeMaxHeight, h) * 0.45;
      const s = lerp(0.75, 1.3, hash2i(ci, cj, 16)) * alt;
      const y = h - 0.3; // trunks are set slightly into the ground
      out.push({
        key: `t${ci},${cj}`,
        variant,
        x, y, z, s,
        yaw: hash2i(ci, cj, 15) * Math.PI * 2,
        trunkR: shape.trunkR * s * 1.5,
        trunkH: shape.trunkH * s,
        crownCentreY: y + shape.crownY * s,
        crownR: shape.crownR * s,
      });
    }
  }
  return out;
}

/** Every boulder within `radius`, as the sphere the projectile system uses. */
export function rocksNear(px, pz, radius) {
  const rc = SCATTER.rockCell;
  const r2 = radius * radius;
  const out = [];
  for (let cj = Math.floor((pz - radius) / rc); cj <= Math.ceil((pz + radius) / rc); cj++) {
    for (let ci = Math.floor((px - radius) / rc); ci <= Math.ceil((px + radius) / rc); ci++) {
      const x = ci * rc + hash2i(ci, cj, 21) * rc;
      const z = cj * rc + hash2i(ci, cj, 22) * rc;
      if ((x - px) ** 2 + (z - pz) ** 2 > r2) continue;
      const h = latticeHeight(x, z);
      const slope = latticeSlope(x, z);
      // Rocks like steep ground and shorelines; grass covers the gentle flats.
      const shore = smoothstep(3.5, 0.6, Math.abs(h - WATER_LEVEL)) * SCATTER.rockShoreBonus;
      const chance = smoothstep(0.2, 0.62, slope) * 0.7 + shore + 0.09;
      if (hash2i(ci, cj, 23) > chance) continue;
      if (inClearing(x, z)) continue;

      const variant = Math.floor(hash2i(ci, cj, 24) * 3) % 3;
      const s = lerp(0.55, 1.35, hash2i(ci, cj, 26));
      const r0 = rockShape(variant).bound;
      const y = h - 0.25;
      out.push({
        key: `r${ci},${cj}`,
        variant,
        x, y, z, s,
        yaw: hash2i(ci, cj, 25) * Math.PI * 2,
        centreY: y + r0 * s * 0.45,
        r: r0 * s * 0.85,
      });
    }
  }
  return out;
}

/**
 * A point-in-solid test over a patch of ground, for the ballistics to walk.
 *
 * Built once per shot from the trees and rocks around the archer and then
 * called a few hundred times as the arc is stepped, which is why it takes a
 * pre-fetched list rather than doing its own lookup: the cell scan is the
 * expensive half and it must not happen inside the integration loop.
 *
 * @param {number} pad extra metres of girth. A shot that shaves a trunk is a
 *   coin flip, and a body that takes coin flips at a deer wastes arrows it had
 *   to fletch — so the body asks for a little more room than the arrow needs.
 */
export function timberBlocker(px, pz, radius, { pad = 0 } = {}) {
  const trees = treesNear(px, pz, radius);
  const rocks = rocksNear(px, pz, radius);

  // ── bucketed, because this is called from inside the ballistics loop ──
  //
  // An arc is walked at the arrow's own substep — about 85 points for a 26 m
  // shot — and it is re-solved every tick, twice, for every agent on the
  // server. Against a flat list of the ~600 trees inside 90 m that is half a
  // million distance tests a second per body, which is the sort of thing that
  // quietly turns a full roster into a slideshow. Same fix `ColliderField`
  // uses: a uniform grid, and each thing dropped into every cell its own girth
  // reaches into, so a lookup is one bucket and no candidate is ever missed.
  const CELL_M = 16;
  const grid = new Map();
  const key = (ix, iz) => ix * 8_388_593 + iz;
  const put = (item, r) => {
    for (let iz = Math.floor((item.z - r) / CELL_M); iz <= Math.floor((item.z + r) / CELL_M); iz++) {
      for (let ix = Math.floor((item.x - r) / CELL_M); ix <= Math.floor((item.x + r) / CELL_M); ix++) {
        const k = key(ix, iz);
        let b = grid.get(k);
        if (!b) grid.set(k, (b = []));
        b.push(item);
      }
    }
  };
  for (const t of trees) put(t, Math.max(t.trunkR, t.crownR) + pad);
  for (const r of rocks) put(r, r.r + pad);

  const test = (x, y, z) => {
    const bucket = grid.get(key(Math.floor(x / CELL_M), Math.floor(z / CELL_M)));
    if (!bucket) return null;
    for (let i = 0; i < bucket.length; i++) {
      const c = bucket[i];
      const dx = x - c.x;
      const dz = z - c.z;
      const d2 = dx * dx + dz * dz;
      if (c.trunkR !== undefined) {
        // trunk: a cylinder standing on the ground
        const tr = c.trunkR + pad;
        if (d2 < tr * tr && y >= c.y && y <= c.y + c.trunkH) return c;
        // crown: a ball of leaves above it
        const cr = c.crownR + pad;
        const dy = y - c.crownCentreY;
        if (d2 + dy * dy < cr * cr) return c;
      } else {
        const rr = c.r + pad;
        const dy = y - c.centreY;
        if (d2 + dy * dy < rr * rr) return c;
      }
    }
    return null;
  };
  test.trees = trees;
  test.rocks = rocks;
  return test;
}
