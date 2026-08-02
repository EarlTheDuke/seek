// ── environment.js ──────────────────────────────────────────────────────────
// "What is it like, standing here, right now?"
//
// One pure-ish query that folds altitude, time of day, weather, wind and water
// into a description of a place. The player's body reads it, and later so will
// creatures (a wolf should know a ridge is exposed), building placement (is
// this sheltered?) and the LLM minds (a prompt saying "you are cold and wet on
// an open ridge at night" is worth a hundred coordinates).
//
// Kept deliberately free of player state: it describes the WORLD at a point.
// What that does to a particular body — clothing, wetness, exertion — belongs
// to player/body.js.

import { SURVIVAL, WATER_LEVEL, CAVES } from '../config.js';
import { heightAt } from './noise.js';
import { regionAt, regionEffects, describeRegion } from './regions.js';
import { caveAt } from './caves.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

/**
 * Air temperature in Celsius at a point.
 *
 * Three inputs: how high you are, how long ago the sun was up, and what the
 * sky is doing. The thermal lag matters more than it looks — without it the
 * coldest moment of the night lands at midnight instead of just before dawn,
 * and dawn stops feeling like dawn.
 */
export function airTemperature(y, hours, sunAltitude, weather) {
  // Altitude. Exaggerated lapse rate — see the note in config.
  const above = Math.max(0, y - WATER_LEVEL);
  let t = SURVIVAL.seaLevelC - above * SURVIVAL.lapsePerMetre;

  // Diurnal swing, driven by a LAGGED sun. Rather than re-deriving the solar
  // position for a past hour, approximate the lag as a phase shift on the
  // normalised daily cycle.
  const phase = ((hours - SURVIVAL.thermalLagHours) / 24) * Math.PI * 2;
  // Peaks in the afternoon, troughs before dawn.
  const daily = -Math.cos(phase - Math.PI / 12);
  t += daily * (SURVIVAL.diurnalSwingC / 2);

  // Direct sun adds on top of the ambient swing when it is actually up.
  const cloud = weather?.cloud ?? 0;
  const sunUp = smoothstep(-2, 12, sunAltitude);
  t += sunUp * SURVIVAL.sunWarmthMax * (1 - cloud) * 0.45;

  // Cloud caps the day and floors the night.
  const isDay = smoothstep(-4, 6, sunAltitude);
  t -= cloud * SURVIVAL.cloudDaySuppressC * isDay;
  t += cloud * SURVIVAL.cloudNightBlanketC * (1 - isDay);

  // Precipitation.
  t -= (weather?.rain ?? 0) * SURVIVAL.rainChillC;
  if (weather?.stateName === 'mist' || weather?.nextName === 'mist') {
    t -= SURVIVAL.mistChillC * (weather.fog > 2 ? 1 : 0.4);
  }

  return t;
}

/**
 * Everything the body needs to know about a location.
 *
 * @param {THREE.Vector3|{x,y,z}} pos
 * @param {object} ctx { hours, sunAltitude, weather, fires }
 */
export function sampleEnvironment(pos, ctx) {
  const {
    hours,
    sunAltitude,
    weather,
    fires,
    shelter: extraShelter = 0,
    roofed = false,
  } = ctx;

  const ground = heightAt(pos.x, pos.z);
  let air = airTemperature(pos.y, hours, sunAltitude, weather);

  // What KIND of ground this is. Snow steals degrees, a hot spring gives them
  // back, and a gorge or a wood takes the wind off you — so where you stand is
  // now a survival decision and not only a view.
  const region = regionAt(pos.x, pos.z);
  const effects = regionEffects(region);
  air += effects.warmthC;

  // ── inside a cave ──
  // Rock has thermal mass: it is cool by day and holds the day's heat into the
  // night, which is exactly why people and animals have always slept in them.
  // So a cave is not simply "warmer" — it pulls the temperature TOWARD the
  // daily mean, which is a gain at 3 a.m. and a loss at noon.
  const cave = caveAt(pos.x, pos.z);
  const caveInside = cave ? cave.inside : 0;
  if (caveInside > 0) {
    // The mean the rock settles at is NOT just sea level minus the lapse rate.
    // The sun only adds heat while it is up, so the true daily average sits
    // above that — and without the bias the night-time gain came out at +0.1 C,
    // which is not a reason to sleep anywhere. With it, a cave is a couple of
    // degrees of free warmth at 4 a.m. and several degrees of shade at noon.
    const mean =
      SURVIVAL.seaLevelC -
      Math.max(0, ground - WATER_LEVEL) * SURVIVAL.lapsePerMetre +
      CAVES.meanBiasC;
    air += (mean - air) * caveInside * (CAVES.thermalMassC / 10);
  }

  // Exposure: how much of the sky can reach you. Approximated from altitude —
  // a ridge is windier than a hollow — then reduced by whatever you are
  // standing in. This is the promised override: the comment used to say
  // "Phase 4's caves and shelters will do this properly", and gorges and
  // woodland are the first half of that.
  // `extraShelter` is whatever is standing around you that the terrain does not
  // know about — a stone circle now, walls in Phase 7. Combined rather than
  // added, so shelter can approach but never reach total.
  const caveShelter = caveInside * CAVES.shelter;
  const shelter = clamp(
    1 - (1 - effects.shelter) * (1 - extraShelter) * (1 - caveShelter),
    0,
    0.98
  );
  const exposure = clamp((0.35 + smoothstep(10, 85, ground) * 0.65) * (1 - shelter), 0, 1);

  const windStrength = clamp((weather?.wind ?? 1) * exposure, 0, 2);

  // Under a roof the sun does not reach you, however high it is — which is
  // what makes a cave a genuinely dark place to be at night AND a cool one at
  // noon, without either being a special case.
  const skyReach = 1 - caveInside * CAVES.skyOcclusion;
  const daylight = smoothstep(-4, 8, sunAltitude) * skyReach;
  const sunWarmth = daylight * SURVIVAL.sunWarmthMax * (1 - (weather?.cloud ?? 0));

  // Nearest fire's contribution, falling off with distance.
  let fireWarmth = 0;
  let nearFire = null;
  if (fires) {
    for (const f of fires.active) {
      const d = Math.hypot(f.position.x - pos.x, f.position.z - pos.z);
      if (d > SURVIVAL.fireWarmRadius) continue;
      const w = (1 - d / SURVIVAL.fireWarmRadius) ** 1.4 * SURVIVAL.fireWarmthC * f.intensity;
      if (w > fireWarmth) {
        fireWarmth = w;
        nearFire = f;
      }
    }
  }

  const inWater = ground < WATER_LEVEL && pos.y < WATER_LEVEL + 0.6;

  return {
    ground,
    airC: air,
    exposure,
    windStrength,
    daylight,
    sunWarmth,
    fireWarmth,
    nearFire,
    inWater,
    // Under a roof — a lean-to, or a cave — the rain does not reach you. That
    // matters more than it sounds: wetness is the multiplier on everything
    // cold, so a roof is worth more on a wet night than a fire is.
    rain: roofed || caveInside > 0.5 ? 0 : weather?.rain ?? 0,
    region,
    effects,
    cave,
    inCave: caveInside > 0.5,
    // A short phrase, for the HUD and — later — for describing a place to a
    // language model.
    describe() {
      const bits = [caveInside > 0.5 ? 'in a cave' : describeRegion(region)];
      if (air < 2) bits.push('freezing');
      else if (air < 8) bits.push('cold');
      else if (air > 24) bits.push('hot');
      if (this.rain > 0.3) bits.push('raining');
      if (this.windStrength > 1.3) bits.push('windy');
      if (this.exposure > 0.8) bits.push('exposed');
      if (fireWarmth > 2) bits.push('by the fire');
      return bits.join(', ');
    },
  };
}

/** Wind chill, in degrees stolen, given wind strength and how wet you are. */
export function windChill(windStrength, wetness) {
  const base = smoothstep(0.2, 2, windStrength);
  return base * (SURVIVAL.windChillMax + wetness * SURVIVAL.windChillWetBonus);
}

/** Convenience: is this spot survivable overnight without a fire? */
export function nightRisk(pos, ctx) {
  const env = sampleEnvironment(pos, { ...ctx, sunAltitude: -12, hours: 3 });
  const felt = env.airC - windChill(env.windStrength, 0);
  return {
    feltC: felt,
    verdict: felt > 12 ? 'mild' : felt > 4 ? 'cold' : felt > -2 ? 'dangerous' : 'lethal',
  };
}

export { lerp };
