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

    /**
     * True once somebody else is keeping the sky — see `applyRemote`. While it
     * is set, the state machine and the wind's integration stand aside and
     * nothing else does: the same flag, for the same reason, as
     * `Vitals.remote`, `Atmosphere.remote` and `Fires.remote`.
     */
    this.remote = false;

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
    // Stands aside while somebody else owns the front — see `applyRemote`. Two
    // machines rolling their own holds out of their own RNG cannot agree, and
    // whichever one you can see is the one you would believe.
    if (!this.remote) {
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
    }

    // ── and the blended numbers, ALWAYS ──
    // Everything below this line is derivation, not opinion: given the two
    // states and the blend, it is the same arithmetic on both ends. It keeps
    // running while remote for the same reason `feltC` does — it is what the
    // sky, the grass, the rain and the HUD are drawn from, and standing it
    // aside would leave the picture frozen at whatever it said on connect.
    this.settle();

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

    // The wander above keeps running while remote — it is a pure function of
    // accumulated time and it is what the local machine would steer toward the
    // moment the socket drops. Only the INTEGRATION stands aside, because the
    // angle itself is the server's number now.
    if (!this.remote) {
      const maxTurn = (WEATHER.windTurnRate * Math.PI) / 180 * dt;
      let diff = ((this.windTargetAngle - this.windAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.windAngle += clamp(diff, -maxTurn, maxTurn);
    }
    this.windDir.set(Math.cos(this.windAngle), Math.sin(this.windAngle));
  }

  /**
   * The blended numbers, from the two state names and the blend.
   *
   * Pulled out of `update` so `applyRemote` can run it the instant a packet
   * lands rather than leaving the sky one frame behind the front that just
   * arrived — the same reason `Atmosphere.applyRemote` calls `apply()`.
   */
  settle() {
    const from = WEATHER.states[this.stateName];
    const to = WEATHER.states[this.nextName];
    if (!from || !to) return;
    // Smoothstep the blend so fronts ease in and out rather than ramping.
    const t = this.blend * this.blend * (3 - 2 * this.blend);
    for (const k of KEYS) this[k] = lerp(from[k], to[k], t);
  }

  /**
   * THE WEATHER WAS YOUR BROWSER'S INVENTION — the sixth and last member of a
   * family this project has now fixed five times (position, health, the hour,
   * a fire's fuel, your core temperature).
   *
   * The snapshot has carried `w` — the state, the next state, the blend and the
   * wind's angle — for as long as there have been snapshots, and nothing in the
   * browser ever read one. So every client ran its own front out of its own
   * seeded RNG and drew whatever it rolled: your screen could be showing a
   * clear evening and no wind while the server had you in a gale. That was
   * cosmetic right up until 15:40, when your core temperature became the
   * server's number — and then it was worse than cosmetic, because the HUD
   * explains a falling temperature with the wind chill and the rain it can see,
   * and it was explaining the server's cold with a sky nobody else was under.
   * Wind also carries your scent, so the creatures hunting you were reading a
   * bearing the player had no way to see.
   *
   * Four fields, ~30 bytes, already on the wire. Delivered RAW from
   * `onSnapshot` for the same reason as the hour and the health: the
   * interpolation buffer exists to smooth BODIES, and a front that arrives
   * 110 ms late is still the right front.
   *
   * @param {{s: string, n: string, b: number, a: number}} w the snapshot's `w`.
   */
  applyRemote(w) {
    if (!w) return;
    // A state name this build does not have is not a reason to draw a broken
    // sky. Ignore it rather than obey it — same guard as the non-finite one.
    if (!WEATHER.states[w.s] || !WEATHER.states[w.n]) return;
    if (!Number.isFinite(w.b) || !Number.isFinite(w.a)) return;
    this.remote = true;
    this.stateName = w.s;
    this.nextName = w.n;
    this.blend = clamp(w.b, 0, 1);
    this.windAngle = w.a;
    this.settle();
    this.windDir.set(Math.cos(this.windAngle), Math.sin(this.windAngle));
  }

  /**
   * Nobody is keeping the sky for us any more — go back to running our own.
   *
   * Called when the socket drops. Without it a disconnected world would hold
   * the last front it was sent for ever and the wind would stop turning.
   */
  takeOverLocally() {
    this.remote = false;
    // The hold is whatever it was when the socket opened, and it may have been
    // pinned to Infinity by `setWeather`. Roll a fresh one so the local machine
    // starts cycling again instead of sitting on the last packet's front.
    if (!Number.isFinite(this.hold) || this.hold <= 0) this.hold = this.rollHold();
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
