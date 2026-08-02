// ── regions.js ──────────────────────────────────────────────────────────────
// What KIND of ground this is.
//
// Until now the world had exactly one kind of ground with a height on it. It
// was beautiful and completely uniform: every metre played identically to every
// other metre, so there was never a reason to prefer one route over another,
// and "where shall I camp" had no answer beyond "wherever I happen to be".
//
// This is the fix, and it is deliberately not a biome painter. Each region is
// derived from fields the world ALREADY HAS — height, slope, the woodland
// clump, a couple of slow noise masks — so nothing has to be stored, it works
// at any coordinate out to infinity, and it is identical in Node and the
// browser. `regionAt` is a pure function of (x, z) and nothing else.
//
// The design rule, borrowed from the bestiary: EVERY REGION MUST CHANGE A
// DECISION. Not a palette swap with a name. A bog is slower, wetter, colder and
// noisier to cross; snow is cold and shows where you have been; a gorge is out
// of the wind but hems you in; a spring is the only warm place in the high
// country. If a region does not change what you would do, it should not exist.
//
// In plain real-world terms: this is the difference between a map and a
// landscape. A map tells you where things are. A landscape tells you which way
// to walk.

import { createNoise2D } from 'simplex-noise';
import { WATER_LEVEL, REGIONS } from '../config.js';
import { heightAt, slopeAt, clumpAt, makeRandom } from './noise.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

// Two slow masks with their own seeded streams. Bog and spring are PLACES, not
// consequences of altitude, so they need a field of their own — otherwise every
// flat low spot in the world is a bog and there is no reason to remember any
// particular one.
const nBog = createNoise2D(makeRandom('bog'));
const nSpring = createNoise2D(makeRandom('spring'));

export const MOOR = 'moor';
export const WOOD = 'wood';
export const BOG = 'bog';
export const GORGE = 'gorge';
export const SNOW = 'snow';
export const SPRING = 'spring';
export const SHORE = 'shore';
export const WATER = 'water';

/**
 * Region membership at a point, as STRENGTHS rather than a single label.
 *
 * Returned as a set of 0..1 values because the edges matter: a bog does not
 * begin at a line, it gets soft underfoot and then it gets bad. Everything
 * downstream (movement, warmth, noise, colour) interpolates on these, so
 * boundaries are felt rather than crossed.
 */
export function regionAt(x, z) {
  const R = REGIONS;
  const y = heightAt(x, z);
  const slope = slopeAt(x, z);
  const clump = clumpAt(x, z);

  // ── water and shore ──
  const water = y < WATER_LEVEL ? 1 : 0;
  const shore = water ? 0 : 1 - smoothstep(0, R.shoreBand, y - WATER_LEVEL);

  // ── gorge ── steep broken ground. Already implicit in the terrain; nothing
  // had ever asked for it until the troll wanted somewhere to live.
  const gorge = smoothstep(R.gorgeSlope, R.gorgeSlopeFull, slope);

  // ── snow ── falls straight out of altitude, as the vision says. Free, and it
  // makes the tops feel like the tops. The line wobbles with a little of the
  // bog mask so it is not a perfect contour ring around every hill.
  const wobble = nBog(x * 0.0009 + 41.3, z * 0.0009 - 17.9) * R.snowWobble;
  const snow = smoothstep(R.snowLine + wobble, R.snowLineFull + wobble, y);

  // ── bog ── low, FLAT, and in the right place. All three conditions, or every
  // hollow in the world is marsh.
  const bogMask = smoothstep(R.bogThreshold, R.bogThresholdFull, nBog(x * R.bogFreq, z * R.bogFreq));
  const bogGround =
    smoothstep(R.bogHighest, R.bogLowest, y) * (1 - smoothstep(R.bogFlat, R.bogFlatMax, slope));
  const bog = bogMask * bogGround * (1 - water);

  // ── hot spring ── rare, small, and warm. The one place in the high country
  // that gives something back, so it is worth crossing a map to reach.
  const springMask = smoothstep(
    R.springThreshold,
    R.springThresholdFull,
    nSpring(x * R.springFreq, z * R.springFreq)
  );
  const spring = springMask * (1 - water) * (1 - smoothstep(R.gorgeSlopeFull, 1.4, slope));

  // ── woodland and moor ── the default pair, from the existing clump field.
  const wood = smoothstep(R.woodStart, R.woodFull, clump) * (1 - water) * (1 - snow);
  // Moor is what is left over, so the strengths always mean something.
  const claimed = clamp(Math.max(water, bog, snow, spring, gorge * 0.7, wood, shore * 0.7), 0, 1);
  const moor = 1 - claimed;

  return { water, shore, gorge, snow, bog, spring, wood, moor, height: y, slope, clump };
}

/**
 * The single strongest region, as a name. For place names, the HUD, and
 * anything that wants one word rather than eight numbers.
 *
 * FEATURES BEAT BACKDROP, and that ordering is the whole trick. Woodland and
 * moor are the two things the world is made of; bog, gorge, snow, spring and
 * shore are things that HAPPEN to it. Ranking them all together by raw
 * strength meant a bog under trees reported itself as "under trees" — the
 * feature you would actually remember losing to the scenery it sat in.
 *
 * So features are checked first, on their own thresholds, and the backdrop is
 * only consulted when none of them applies.
 */
export function dominantRegion(r) {
  if (r.water > 0.5) return WATER;
  if (r.spring > 0.45) return SPRING; // small and rare: it wins where it is
  if (r.bog > 0.45) return BOG;
  if (r.snow > 0.5) return SNOW;
  if (r.gorge > 0.5) return GORGE;
  if (r.shore > 0.5) return SHORE;
  return r.wood > 0.5 ? WOOD : MOOR;
}

/**
 * What this ground does to a body crossing it.
 *
 * One object, consumed by the controller (speed), the stealth model (noise),
 * the environment (warmth, shelter) and the body (wetness). Kept together
 * rather than scattered so that adding a region means editing ONE table and
 * every system picks it up.
 */
export function regionEffects(r) {
  const R = REGIONS;

  // Movement. Bog is the big one: crossing it is a real decision, not a
  // texture. Snow costs a little, steep ground costs a little.
  const speed =
    1 *
    lerp(1, R.bogSpeed, r.bog) *
    lerp(1, R.snowSpeed, r.snow) *
    lerp(1, R.gorgeSpeed, r.gorge);

  // Noise underfoot, as a MULTIPLIER on whatever you are already making. Bog
  // squelches and snow crunches, so the quiet approach across them is slower
  // than the quiet approach over moor — which is exactly the sort of tradeoff
  // the stealth model existed for and never had.
  const noise = lerp(1, R.bogNoise, r.bog) * lerp(1, R.snowNoise, r.snow);

  // Shelter reduces exposure, which the wind chill reads. A gorge is the only
  // place on a high ridge you can survive a gale, and woodland helps a little.
  const shelter = clamp(r.gorge * R.gorgeShelter + r.wood * R.woodShelter, 0, 0.9);

  // Degrees added or stolen by the ground itself.
  const warmthC = r.spring * R.springWarmthC - r.snow * R.snowChillC - r.bog * R.bogChillC;

  // How fast you get wet standing here.
  const wetRate = r.bog * R.bogWetRate + r.spring * R.springWetRate;

  return { speed, noise, shelter, warmthC, wetRate };
}

/** A short phrase for the HUD and, later, for describing a place to a model. */
export function describeRegion(r) {
  const name = dominantRegion(r);
  return (
    {
      [WATER]: 'in the water',
      [SHORE]: 'on the shore',
      [BOG]: 'in the bog',
      [GORGE]: 'in a gorge',
      [SNOW]: 'above the snow line',
      [SPRING]: 'at a hot spring',
      [WOOD]: 'under trees',
      [MOOR]: 'on open moor',
    }[name] ?? name
  );
}

/**
 * Find the nearest point of a given region, searching outward on a spiral.
 *
 * Used for placing things (a warren wants a hillside, a spring wants to be
 * findable) and for the "where is the nearest X" question a named world needs.
 * Returns null rather than searching forever.
 */
export function findRegion(kind, x, z, { radius = 600, step = 24, minStrength = 0.55 } = {}) {
  let best = null;
  let bestV = minStrength;
  // Golden-angle spiral: even coverage, no preferred direction, and
  // deterministic because it is pure arithmetic.
  const n = Math.ceil((radius / step) ** 2 * Math.PI);
  for (let i = 0; i < n; i++) {
    const t = Math.sqrt(i / n) * radius;
    const a = i * 2.399963229728653;
    const px = x + Math.cos(a) * t;
    const pz = z + Math.sin(a) * t;
    const r = regionAt(px, pz);
    const v = r[kind] ?? 0;
    if (v > bestV) {
      bestV = v;
      best = { x: px, z: pz, strength: v, distance: t };
      if (v > 0.92) break; // good enough; stop paying for perfection
    }
  }
  return best;
}
