// ── colliders.js ────────────────────────────────────────────────────────────
// A spatial hash of everything solid that is not the terrain.
//
// Terrain collision is free — it is a height function. But trees and rocks are
// InstancedMeshes, and asking three's raycaster to test 2,000 instances of 500
// triangles each, 240 times a second per arrow, is not viable. So instead each
// instance contributes a cheap analytic proxy (a cylinder for a trunk, a sphere
// for a crown or a boulder, a box for a monolith) into a uniform grid.
//
// Arrow substeps are short — a 62 m/s arrow moves 26 cm per 1/240 s tick — so a
// segment query usually touches a single cell.

import * as THREE from 'three';

export const SPHERE = 0;
export const CYLINDER = 1; // vertical, from y to y + h
export const BOX = 2;

const _tmp = new THREE.Vector3();

export class ColliderField {
  constructor(cell = 14) {
    this.cell = cell;
    this.grid = new Map();
    this.list = [];
  }

  clear() {
    this.grid.clear();
    this.list.length = 0;
  }

  /**
   * @param soft  Solid to an ARROW, not to a BODY. See `resolveBody`: a tree's
   *   crown is the only thing that uses it, and it is 40% of the trees.
   */
  addSphere(x, y, z, r, tag, soft = false) {
    return this.push({ kind: SPHERE, x, y, z, r, tag, soft }, x - r, z - r, x + r, z + r);
  }

  /** Vertical cylinder with its base at (x, y, z). */
  addCylinder(x, y, z, r, h, tag) {
    return this.push({ kind: CYLINDER, x, y, z, r, h, tag }, x - r, z - r, x + r, z + r);
  }

  addBox(min, max, tag) {
    return this.push(
      { kind: BOX, minx: min.x, miny: min.y, minz: min.z, maxx: max.x, maxy: max.y, maxz: max.z, tag },
      min.x,
      min.z,
      max.x,
      max.z
    );
  }

  /**
   * Take one collider out of service.
   *
   * NOT a splice, and that is the whole design: `grid` holds INDICES into
   * `list`, so removing an entry would silently renumber every collider after it
   * and every bucket in the grid would then point at the wrong solid. A retired
   * collider keeps its slot and its index and is skipped by the query.
   *
   * This exists because structures can be taken down (`Structures.remove`, and a
   * palisade is the one structure with a collider). Until the `addCylinder` fix
   * landed no structure had ever actually contributed one, so removing a wall
   * could not leave anything behind. Now it can, and an invisible wall that
   * stops arrows for the rest of the run is a worse bug than the one that was
   * fixed.
   */
  retire(c) {
    if (c) c.dead = true;
  }

  push(c, x0, z0, x1, z1) {
    const i = this.list.length;
    this.list.push(c);
    const s = this.cell;
    for (let iz = Math.floor(z0 / s); iz <= Math.floor(z1 / s); iz++) {
      for (let ix = Math.floor(x0 / s); ix <= Math.floor(x1 / s); ix++) {
        const key = `${ix},${iz}`;
        let bucket = this.grid.get(key);
        if (!bucket) this.grid.set(key, (bucket = []));
        bucket.push(i);
      }
    }
    return c;
  }

  /**
   * Nearest hit along the segment from `a` to `b`.
   * @returns {{t:number, point:THREE.Vector3, normal:THREE.Vector3, tag:any}|null}
   */
  segmentHit(a, b, out) {
    const s = this.cell;
    const x0 = Math.floor(Math.min(a.x, b.x) / s);
    const x1 = Math.floor(Math.max(a.x, b.x) / s);
    const z0 = Math.floor(Math.min(a.z, b.z) / s);
    const z1 = Math.floor(Math.max(a.z, b.z) / s);

    let bestT = Infinity;
    let best = null;
    const seen = this._seen ??= new Set();
    seen.clear();

    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        const bucket = this.grid.get(`${ix},${iz}`);
        if (!bucket) continue;
        for (let k = 0; k < bucket.length; k++) {
          const idx = bucket[k];
          if (seen.has(idx)) continue;
          seen.add(idx);
          const c = this.list[idx];
          if (c.dead) continue;
          const t =
            c.kind === SPHERE
              ? hitSphere(a, b, c)
              : c.kind === CYLINDER
                ? hitCylinder(a, b, c)
                : hitBox(a, b, c);
          if (t !== null && t < bestT) {
            bestT = t;
            best = c;
          }
        }
      }
    }

    if (!best) return null;
    out.t = bestT;
    out.point.lerpVectors(a, b, bestT);
    out.tag = best.tag;
    normalFor(best, out.point, out.normal);
    return out;
  }

  /**
   * Push a standing body out of anything solid it has walked into.
   *
   * The body is a vertical cylinder: feet at `pos.y`, `height` tall, `radius`
   * across. Only the XZ position is corrected — the ground is a height function
   * and owns `y` entirely, so lifting a body over a rock here would fight
   * `Controller.step` for the rest of the run.
   *
   * ── WHAT IS SOLID TO A BODY IS NOT WHAT IS SOLID TO AN ARROW ──
   *
   * A tree's crown is `soft`, and that is measured, not taste. Scanning 2,974
   * placed trees: the crown sphere reaches into the band a walking body
   * occupies on **40.2% of them**, and on the smallest it reaches BELOW THE
   * FEET — crown radii run 2.4-4.5 m, so a solid crown is a four-metre pillar
   * you cannot walk round and can be spawned inside. The trunk cylinder is
   * taller than a body on **99.8%** of them, so the trunk alone is a complete
   * and honest solid for a tree, and you push through branches because in a
   * wood you do. Arrows still hit crowns: `segmentHit` never reads `soft`.
   *
   * ── WHY THE PUSHES ARE SUMMED AND NOT APPLIED ONE AT A TIME ──
   *
   * Resolving each collider against the running position is what a single-player
   * game does, and it makes the answer depend on the order the grid hands them
   * over. The server builds its field from `refreshTimber` and a browser builds
   * its own from `Scatter`, in a different order, so an order-dependent solve
   * would put the two copies of one body in two different places at a corner.
   * A SUM is commutative; two passes converge the corner. Deterministic on both
   * sides by construction rather than by luck.
   *
   * The total is capped: a body that starts deep inside a solid oozes out over
   * a few ticks instead of teleporting. `cap` is per call, and this is called
   * once per 1/120 s physics substep.
   *
   * VELOCITY IS DELIBERATELY NOT TOUCHED. Cancelling the into-surface part of
   * the DISPLACEMENT is already exactly what makes a body slide along a trunk;
   * the tangential part is never cancelled, so it survives untouched. Reaching
   * into `velocity` as well would fight the `damp()` that owns it and buy
   * nothing.
   *
   * @returns {number} how far the body was moved, in metres. 0 means clear.
   */
  resolveBody(pos, radius, height, cap = 0.5, out = null) {
    const s = this.cell;
    let total = 0;
    if (out) { out.hits = 0; out.tag = null; }

    for (let pass = 0; pass < 2; pass++) {
      let px = 0;
      let pz = 0;
      let hits = 0;
      let tag = null;
      const x0 = Math.floor((pos.x - radius) / s);
      const x1 = Math.floor((pos.x + radius) / s);
      const z0 = Math.floor((pos.z - radius) / s);
      const z1 = Math.floor((pos.z + radius) / s);
      const seen = this._seenBody ??= new Set();
      seen.clear();

      for (let iz = z0; iz <= z1; iz++) {
        for (let ix = x0; ix <= x1; ix++) {
          const bucket = this.grid.get(`${ix},${iz}`);
          if (!bucket) continue;
          for (let k = 0; k < bucket.length; k++) {
            const idx = bucket[k];
            if (seen.has(idx)) continue;
            seen.add(idx);
            const c = this.list[idx];
            if (c.dead || c.soft) continue;
            if (!pushOut(pos, radius, height, c, _push)) continue;
            px += _push.x;
            pz += _push.z;
            hits++;
            if (tag === null) tag = c.tag;
          }
        }
      }

      if (hits === 0) break;
      const mag = Math.hypot(px, pz);
      if (mag < 1e-6) break; // wedged and the sum cancelled — say so by stopping
      const k = Math.min(1, (cap - total) / mag);
      if (k <= 0) break;
      pos.x += px * k;
      pos.z += pz * k;
      total += mag * k;
      if (out) { out.hits += hits; out.tag ??= tag; }
    }
    return total;
  }
}

// Scratch for `resolveBody` — one push at a time, so nothing allocates in the
// movement path.
const _push = { x: 0, z: 0 };

/**
 * The XZ displacement that would take a standing body out of one collider,
 * or `false` if it is already clear of it. Writes into `out`.
 *
 * Everything here is done on the body's HORIZONTAL cross-section against the
 * collider's widest slice inside the body's own vertical band. That is why a
 * crown 4 m over your head cannot stop you and a boulder at your knees can.
 */
function pushOut(pos, radius, height, c, out) {
  const lo = pos.y;
  const hi = pos.y + height;
  let cx;
  let cz;
  let cr;

  if (c.kind === CYLINDER) {
    if (hi <= c.y || lo >= c.y + c.h) return false;
    cx = c.x;
    cz = c.z;
    cr = c.r;
  } else if (c.kind === SPHERE) {
    // The sphere's widest horizontal slice within the body's band: at the
    // height of its own centre if the band contains it, otherwise at whichever
    // end of the band is nearer. A boulder sunk to its equator is still a
    // full-radius obstacle at ankle height, which is right.
    const y = clampNum(c.y, lo, hi);
    const dy = c.y - y;
    const rr2 = c.r * c.r - dy * dy;
    if (rr2 <= 0) return false;
    cx = c.x;
    cz = c.z;
    cr = Math.sqrt(rr2);
  } else {
    if (hi <= c.miny || lo >= c.maxy) return false;
    // Box: nearest point on the XZ rectangle. Outside is a circle-vs-rect push;
    // INSIDE has no nearest point to push from, so it leaves by the nearest
    // face instead — the axis of least penetration.
    const nx = clampNum(pos.x, c.minx, c.maxx);
    const nz = clampNum(pos.z, c.minz, c.maxz);
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) return false;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      const push = radius - d;
      out.x = (dx / d) * push;
      out.z = (dz / d) * push;
      return true;
    }
    const outs = [
      [pos.x - c.minx + radius, -1, 0],
      [c.maxx - pos.x + radius, 1, 0],
      [pos.z - c.minz + radius, 0, -1],
      [c.maxz - pos.z + radius, 0, 1],
    ];
    let best = outs[0];
    for (const o of outs) if (o[0] < best[0]) best = o;
    out.x = best[1] * best[0];
    out.z = best[2] * best[0];
    return true;
  }

  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const want = cr + radius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= want * want) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-6) {
    // Dead centre. Any direction is as good as any other and none of them is
    // derivable from the body, so take one that is the same on every machine.
    out.x = want;
    out.z = 0;
    return true;
  }
  const push = want - d;
  out.x = (dx / d) * push;
  out.z = (dz / d) * push;
  return true;
}

const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ── analytic segment tests. Each returns t in [0,1] or null. ────────────────

function hitSphere(a, b, c) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const ox = a.x - c.x;
  const oy = a.y - c.y;
  const oz = a.z - c.z;
  const A = dx * dx + dy * dy + dz * dz;
  if (A === 0) return null;
  const B = 2 * (ox * dx + oy * dy + oz * dz);
  const C = ox * ox + oy * oy + oz * oz - c.r * c.r;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t0 = (-B - sq) / (2 * A);
  if (t0 >= 0 && t0 <= 1) return t0;
  const t1 = (-B + sq) / (2 * A);
  if (t1 >= 0 && t1 <= 1) return t1;
  return null;
}

function hitCylinder(a, b, c) {
  // Solve in XZ for the infinite cylinder, then check the y span.
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const ox = a.x - c.x;
  const oz = a.z - c.z;
  const A = dx * dx + dz * dz;
  if (A < 1e-9) {
    // Travelling straight up or down inside the radius.
    if (ox * ox + oz * oz > c.r * c.r) return null;
    const lo = c.y;
    const hi = c.y + c.h;
    const dy = b.y - a.y;
    if (Math.abs(dy) < 1e-9) return null;
    const t = ((a.y < lo ? lo : hi) - a.y) / dy;
    return t >= 0 && t <= 1 ? t : null;
  }
  const B = 2 * (ox * dx + oz * dz);
  const C = ox * ox + oz * oz - c.r * c.r;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
    if (t < 0 || t > 1) continue;
    const y = a.y + (b.y - a.y) * t;
    if (y >= c.y && y <= c.y + c.h) return t;
  }
  return null;
}

function hitBox(a, b, c) {
  let tmin = 0;
  let tmax = 1;
  const axes = [
    [a.x, b.x - a.x, c.minx, c.maxx],
    [a.y, b.y - a.y, c.miny, c.maxy],
    [a.z, b.z - a.z, c.minz, c.maxz],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

function normalFor(c, point, out) {
  if (c.kind === SPHERE) return out.set(point.x - c.x, point.y - c.y, point.z - c.z).normalize();
  if (c.kind === CYLINDER) return out.set(point.x - c.x, 0, point.z - c.z).normalize();
  // Box: whichever face the point is closest to.
  const dists = [
    [Math.abs(point.x - c.minx), -1, 0, 0],
    [Math.abs(point.x - c.maxx), 1, 0, 0],
    [Math.abs(point.y - c.miny), 0, -1, 0],
    [Math.abs(point.y - c.maxy), 0, 1, 0],
    [Math.abs(point.z - c.minz), 0, 0, -1],
    [Math.abs(point.z - c.maxz), 0, 0, 1],
  ];
  dists.sort((p, q) => p[0] - q[0]);
  return out.set(dists[0][1], dists[0][2], dists[0][3]);
}

/** Add every mesh under a group as a world-space AABB. Static geometry only. */
export function addStaticGroup(field, root, tag) {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    box.setFromObject(o);
    if (box.isEmpty()) return;
    field.addBox(box.min, box.max, tag);
  });
}
