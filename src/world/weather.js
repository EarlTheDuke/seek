// ── weather.js ──────────────────────────────────────────────────────────────
// What the sky is doing, and what that does to everything else.
//
// A small weighted state machine whose states are just target values. Nothing
// reads the state name; everything reads the blended numbers, so adding "storm"
// or "snow" is a row in the config table rather than a branch anywhere.
//
// The important connection is that weather is not decoration here. Wind
// direction feeds the scent model creatures hunt you with, wind strength drives
// the grass shader, and rain masks your footsteps — so a change in the sky
// changes how you have to hunt.

import * as THREE from 'three';
import { WEATHER, WIND, SKY } from '../config.js';
import { clamp, damp, lerp } from '../util/math.js';
import { makeRandom } from './noise.js';

const KEYS = ['cloud', 'fog', 'wind', 'rain'];

export class Weather {
  constructor() {
    this.rand = makeRandom('weather');
    this.stateName = WEATHER.startState;
    this.nextName = WEATHER.startState;

    const start = WEATHER.states[WEATHER.startState];
    /** Live blended values — this is what the rest of the game reads. */
    this.cloud = start.cloud;
    this.fog = start.fog;
    this.wind = start.wind;
    this.rain = start.rain;

    this.blend = 1; // 0 = fully in `stateName`, 1 = arrived at `nextName`
    this.hold = this.rollHold();

    // Wind direction, in radians, wandering continuously.
    this.windAngle = Math.atan2(WIND.dirZ, WIND.dirX);
    this.windTargetAngle = this.windAngle;
    this.windDir = new THREE.Vector2(WIND.dirX, WIND.dirZ).normalize();
    this.windWander = this.rand() * 100;
  }

  rollHold() {
    return lerp(WEATHER.minHold, WEATHER.maxHold, this.rand()) * 60;
  }

  /** Weighted pick, never the state we are already in. */
  pickNext() {
    const entries = Object.entries(WEATHER.states).filter(([n]) => n !== this.stateName);
    const total = entries.reduce((s, [, v]) => s + v.weight, 0);
    let r = this.rand() * total;
    for (const [name, v] of entries) {
      r -= v.weight;
      if (r <= 0) return name;
    }
    return entries[entries.length - 1][0];
  }

  update(dt) {
    if (!WEATHER.enabled) return;

    // ── state machine ──
    if (this.blend >= 1) {
      this.hold -= dt;
      if (this.hold <= 0) {
        this.stateName = this.nextName;
        this.nextName = this.pickNext();
        this.blend = 0;
      }
    } else {
      this.blend = clamp(this.blend + dt / WEATHER.blendSeconds, 0, 1);
      if (this.blend >= 1) {
        this.stateName = this.nextName;
        this.hold = this.rollHold();
      }
    }

    const from = WEATHER.states[this.stateName];
    const to = WEATHER.states[this.nextName];
    // Smoothstep the blend so fronts ease in and out rather than ramping.
    const t = this.blend * this.blend * (3 - 2 * this.blend);
    for (const k of KEYS) this[k] = lerp(from[k], to[k], t);

    // ── wind direction ──
    // Wanders on a slow sine sum rather than a random walk, so it drifts and
    // returns instead of eventually pointing anywhere at all.
    this.windWander += dt * WEATHER.windWanderScale;
    const w = this.windWander;
    this.windTargetAngle =
      Math.atan2(WIND.dirZ, WIND.dirX) +
      Math.sin(w) * 0.9 +
      Math.sin(w * 0.37 + 1.3) * 0.6 +
      // Gusty weather swings the wind around more.
      Math.sin(w * 2.1) * 0.35 * this.wind;

    const maxTurn = (WEATHER.windTurnRate * Math.PI) / 180 * dt;
    let diff = ((this.windTargetAngle - this.windAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.windAngle += clamp(diff, -maxTurn, maxTurn);
    this.windDir.set(Math.cos(this.windAngle), Math.sin(this.windAngle));
  }

  /** Fog density for the atmosphere, before time-of-day adjustment. */
  get fogDensity() {
    return SKY.fogDensity * this.fog;
  }

  /** 0..1 — how much the sun is being smothered. Drives light and shadow. */
  get overcast() {
    return this.cloud;
  }

  /** Compass bearing the wind is blowing TOWARD, for the HUD. */
  get bearingText() {
    // atan2(z, x) with x=east, z=south in world terms.
    const deg = (((Math.atan2(this.windDir.x, -this.windDir.y) * 180) / Math.PI) + 360) % 360;
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return names[Math.round(deg / 45) % 8];
  }

  get label() {
    if (this.blend < 1 && this.blend > 0.08) return `${this.stateName} → ${this.nextName}`;
    return this.stateName;
  }
}
