// ── strangeness.js ──────────────────────────────────────────────────────────
// How much this place, right now, does not belong to the ordinary world.
//
// The spine of the whole fantasy pivot, from VISION.md:
//
//   > The lowlands are mundane — deer, weather, hunger. The high country is
//   > dangerous. The deep places barely obey physics. Strangeness rises with
//   > distance, altitude and darkness.
//
// One number, 0..1, and everything hangs off it: which creatures may exist
// here, how often, and later which places generate. It is a difficulty curve
// you can SEE from the valley floor — the tops are visibly further, higher and
// darker — which is worth more than any number on a screen.
//
// In plain real-world terms: this is the "how far from town are you" dial that
// every folk tale runs on. Near the settled ground, in daylight, nothing much
// happens. Walk far enough uphill, stay out late enough, and the stories start
// being about you.
//
// PURE AND DETERMINISTIC. Same seed, same place, same hour, same answer —
// forever, in the browser and in Node. Nothing here reads wall-clock time or
// unseeded randomness, because spawning depends on it.

import { createNoise2D } from 'simplex-noise';
import { LAKE, WATER_LEVEL, STRANGENESS } from '../config.js';
import { heightAt, makeRandom } from './noise.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

// A slow field with its own seeded stream, so the world has stranger REGIONS
// rather than a clean radial ramp. Without it the gradient is a bullseye
// centred on the lake and every direction is interchangeable; with it there
// are bad valleys and safe shoulders at the same altitude, and going "up" is
// not automatically the same decision as going "out".
const nBlight = createNoise2D(makeRandom('blight'));

/**
 * The four terms of the gradient at a place, before time of day is applied.
 * Split out because the spawner wants the parts and the debug view wants to
 * show them separately.
 */
export function terrainStrangeness(x, z) {
  const S = STRANGENESS;

  // ── remoteness ── distance from the lake, which is the settled centre of the
  // world and where you spawn. Walking away from the water is the single most
  // legible way to say "you are getting further from anything safe".
  const d = Math.hypot(x - LAKE.x, z - LAKE.z);
  const remote = smoothstep(S.remoteNear, S.remoteFar, d);

  // ── altitude ── the high country. Uses the real height field, so the curve
  // agrees with what you can see.
  const y = heightAt(x, z);
  const high = smoothstep(S.lowGround, S.highGround, y);

  // ── the blight ── slow noise, so some ground is simply wrong.
  const b = nBlight(x * S.blightFreq, z * S.blightFreq); // -1..1
  const blight = smoothstep(S.blightThreshold, 1, b);

  return { remote, high, blight, height: y };
}

/**
 * Strangeness at a place and a time, 0..1.
 *
 * @param {number} x
 * @param {number} z
 * @param {{ sunAltitude?: number, weather?: object }} [ctx]
 */
export function strangenessAt(x, z, ctx = {}) {
  const S = STRANGENESS;
  const t = terrainStrangeness(x, z);

  // Terrain terms combine as a weighted sum rather than a max, so a high
  // remote blighted ridge is worse than any one of those alone — which is what
  // makes the far corners of the map meaningfully different from the near ones.
  let base =
    t.remote * S.weightRemote + t.high * S.weightHigh + t.blight * S.weightBlight;

  // Standing in the lake is not strange, however far out you swim.
  if (t.height < WATER_LEVEL) base *= 0.35;

  // ── darkness ── the multiplier, not another term.
  //
  // Night does not create strangeness of its own; it lets what is already
  // there come out. So a safe lowland meadow at midnight stays fairly safe,
  // while the same ridge that was merely uneasy at noon is genuinely dangerous
  // after dark. That asymmetry is the whole reason the day/night cycle earns
  // its keep mechanically instead of just looking good.
  const night = darkness(ctx.sunAltitude ?? 90);
  const dark = lerp(S.dayScale, 1, night);

  // ── weather ── mist is the classic summoner. It does not move the gradient
  // much, but it moves it in the direction that matters.
  let w = 0;
  if (ctx.weather) {
    w = (ctx.weather.fog ?? 0) * S.mistBonus + (ctx.weather.rain ?? 0) * S.rainBonus;
  }

  return clamp(base * dark + w * night, 0, 1);
}

/**
 * How strange this ground is IN ITSELF, ignoring the hour and the weather.
 *
 * The naming layer wants this rather than `strangenessAt`. A place does not
 * become a different place at sunset, so its name must not change — but naming
 * off the daylight value instead was worse: daylight scales the whole gradient
 * by `dayScale`, which caps it around 0.41, so the two darker registers of
 * place name could never be reached and the entire infinite world was named as
 * if it were a meadow.
 *
 * This is the honest quantity for the question "what KIND of place is this",
 * and it spans the full 0..1 the way the name registers expect.
 */
export function placeStrangeness(x, z) {
  const S = STRANGENESS;
  const t = terrainStrangeness(x, z);
  let base = t.remote * S.weightRemote + t.high * S.weightHigh + t.blight * S.weightBlight;
  if (t.height < WATER_LEVEL) base *= 0.35;
  return clamp(base, 0, 1);
}

/**
 * How dark it is, 0..1, from the sun's altitude in degrees.
 *
 * Civil twilight (sun 6° below the horizon) is the point where a person stops
 * being able to work outdoors without a light, so that is where this reaches 1.
 * Sunset itself is only halfway — which is why dusk is the hour things start
 * moving rather than the moment they do.
 */
export function darkness(sunAltitude) {
  return 1 - smoothstep(STRANGENESS.nightBelow, STRANGENESS.dayAbove, sunAltitude);
}

/**
 * Does `band` — a `[min, max]` pair from a species' spawn rule — admit this
 * strangeness? An open-ended band is written `[0.4, 1]`.
 */
export function inBand(band, s) {
  if (!band) return true;
  return s >= band[0] && s <= band[1];
}

/** A plain-language name for a strangeness value. Used by the debug readout. */
export function describeStrangeness(s) {
  if (s < 0.15) return 'settled';
  if (s < 0.32) return 'quiet';
  if (s < 0.5) return 'lonely';
  if (s < 0.68) return 'uneasy';
  if (s < 0.85) return 'wrong';
  return 'the deep places';
}
