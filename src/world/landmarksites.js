// ── landmarksites.js ────────────────────────────────────────────────────────
// WHERE the five landmarks stand, with no geometry attached.
//
// Lifted out of landmarks.js unchanged. That file is the builder — stone,
// materials, a THREE.Group per site — and the siting scan buried in it is pure
// arithmetic over the height field that several things now need without a
// scene: the scatter, which keeps a circle clear around each one, and anything
// off in Node that has to know where the trees are NOT. See timber.js.
//
// Nothing here imports THREE, which is the whole point.

import { LAKE, SKY, WATER_LEVEL } from '../config.js';
import { heightAt, slopeAt } from './noise.js';
import { lerp } from '../util/math.js';

/**
 * Scan a polar annulus for the spot that best satisfies `score`. Deterministic,
 * and cheap enough at load time to be worth doing properly.
 */
export function findSite(cx, cz, minR, maxR, dirDeg, spreadDeg, score) {
  let best = null;
  const steps = 26;
  const rings = 16;
  for (let a = 0; a < steps; a++) {
    const ang = ((dirDeg - spreadDeg / 2 + (spreadDeg * a) / (steps - 1)) * Math.PI) / 180;
    for (let r = 0; r < rings; r++) {
      const rad = lerp(minR, maxR, r / (rings - 1));
      const x = cx + Math.sin(ang) * rad;
      const z = cz + Math.cos(ang) * rad;
      const h = heightAt(x, z);
      const s = score(x, z, h);
      if (s !== null && (best === null || s > best.score)) best = { x, z, h, score: s };
    }
  }
  return best;
}

/**
 * How much ground each landmark keeps clear of trees and boulders.
 *
 * Without this the scatter buries the very things you walked over to look at.
 * The order is the build order, because a seed with no suitable ground for one
 * of them skips it and everything downstream counts on that being stable.
 */
export const CLEAR_RADIUS = {
  monoliths: 44,
  greatTree: 26,
  arch: 32,
  cairn: 20,
  sunken: 16,
};

/** The five sited landmarks, by name. Any may be missing on a hostile seed. */
export function landmarkSites() {
  const sunAz = SKY.azimuth;
  const sites = {};

  // Highest ridge, roughly beyond the lake toward the sun.
  sites.monoliths = findSite(LAKE.x, LAKE.z, 300, 520, sunAz, 70, (x, z, h) =>
    h < WATER_LEVEL + 12 || slopeAt(x, z) > 0.34 ? null : h
  );

  // A hilltop off to one side, moderate slope, clear of the water.
  sites.greatTree = findSite(LAKE.x, LAKE.z, 250, 400, sunAz + 78, 70, (x, z, h) =>
    h < WATER_LEVEL + 8 || slopeAt(x, z) > 0.24 ? null : h
  );

  // A gully: we want *low* ground here, so the score is negated height.
  sites.arch = findSite(LAKE.x, LAKE.z, 260, 400, sunAz - 84, 70, (x, z, h) =>
    h < WATER_LEVEL + 4 ? null : -h
  );

  // The top of the world, anywhere within range.
  sites.cairn = findSite(LAKE.x, LAKE.z, 430, 700, sunAz + 180, 260, (x, z, h) =>
    slopeAt(x, z) > 0.4 ? null : h
  );

  // Shallow water near the shore.
  sites.sunken = findSite(LAKE.x, LAKE.z, LAKE.radius * 0.42, LAKE.radius * 0.72, sunAz, 120, (x, z, h) => {
    const depth = WATER_LEVEL - h;
    return depth > 1.5 && depth < 6 ? -Math.abs(depth - 3.2) : null;
  });

  return sites;
}

/** The circles the scatter must leave alone: `[{x, z, r}]`. */
export function landmarkClearings() {
  const sites = landmarkSites();
  const out = [];
  for (const name of Object.keys(CLEAR_RADIUS)) {
    const site = sites[name];
    if (!site) continue; // this seed had no suitable ground; skip rather than float one
    out.push({ x: site.x, z: site.z, r: CLEAR_RADIUS[name] });
  }
  return out;
}
