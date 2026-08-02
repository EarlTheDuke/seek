// ── body.js ─────────────────────────────────────────────────────────────────
// Core temperature, hunger, stamina and how wet you are.
//
// Extends Vitals rather than replacing it: health, damage, death and respawn
// already worked and are orthogonal to needs. What this adds is the slow layer
// — the things that kill you over an hour rather than in three seconds.
//
// The design rule from the vision doc, restated because it is easy to lose:
// **meters must be slow**. Hunger runs about two in-world days. Nothing here
// should ever interrupt someone who wants to stand still and watch the light.
// The point is not to nag; it is to make altitude, wind, rain and night into
// decisions.
//
// Everything is expressed so that a new need — thirst, disease, a bleeding
// wound — is another field and another clause in update(), not a redesign.

import { SURVIVAL, PLAYER, TIME } from '../config.js';
import { Vitals } from './vitals.js';
import { windChill } from '../world/environment.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

export class Body extends Vitals {
  constructor(deps = {}) {
    super(deps);
    this.coreC = SURVIVAL.coreStartC;
    this.hunger = SURVIVAL.hungerStart; // 0 starving .. 100 full
    this.stamina = SURVIVAL.staminaStart;
    this.wetness = 0; // 0 dry .. 1 soaked

    this.insulationC = 0; // from worn clothing, recomputed each tick
    this.feltC = SURVIVAL.neutralC; // effective ambient after everything
    this.effectiveC = SURVIVAL.neutralC; // ...including insulation and exertion
    this.sprintBlocked = false;
    this.shivering = false;
    this.sweating = false;
    this.env = null;

    // Rate-limited so warnings never spam.
    this._lastWarning = '';
    this._warningCooldown = 0;
  }

  reset() {
    this.coreC = SURVIVAL.coreStartC;
    this.hunger = SURVIVAL.hungerStart;
    this.stamina = SURVIVAL.staminaStart;
    this.wetness = 0;
  }

  revive() {
    super.revive();
    this.reset();
  }

  // ── derived state the rest of the game reads ──────────────────────────────

  /** Movement multiplier from cold and exhaustion. */
  get speedScale() {
    let s = 1;
    if (this.coreC < SURVIVAL.coldSlowC) {
      s *= lerp(1, 0.62, smoothstep(SURVIVAL.coldSlowC, SURVIVAL.coldDamageC, this.coreC));
    }
    if (this.stamina < 15) s *= lerp(0.75, 1, this.stamina / 15);
    if (this.hunger < SURVIVAL.hungerWeakBelow) {
      s *= lerp(0.8, 1, this.hunger / SURVIVAL.hungerWeakBelow);
    }
    return s;
  }

  /** Extra aim wobble, 0..1, from shivering or heat exhaustion. */
  get aimSway() {
    const cold = smoothstep(SURVIVAL.coldShiverC, SURVIVAL.coldDamageC, this.coreC);
    const hot = smoothstep(SURVIVAL.hotSweatC, SURVIVAL.hotDamageC, this.coreC);
    const tired = smoothstep(30, 0, this.stamina);
    return clamp(Math.max(cold, hot) * 0.8 + tired * 0.4, 0, 1);
  }

  get staminaFraction() {
    return clamp(this.stamina / SURVIVAL.staminaStart, 0, 1);
  }

  get hungerFraction() {
    return clamp(this.hunger / 100, 0, 1);
  }

  /** Rough 0..1 where 0.5 is comfortable — for a HUD gauge. */
  get warmthFraction() {
    return clamp((this.coreC - SURVIVAL.coreMinC) / (SURVIVAL.coreMaxC - SURVIVAL.coreMinC), 0, 1);
  }

  /** Short status words, worst first, for the HUD. */
  get conditions() {
    const out = [];
    if (this.coreC < SURVIVAL.coldDamageC) out.push({ text: 'freezing to death', bad: true });
    else if (this.coreC < SURVIVAL.coldSlowC) out.push({ text: 'hypothermic', bad: true });
    else if (this.coreC < SURVIVAL.coldShiverC) out.push({ text: 'shivering', bad: false });
    if (this.coreC > SURVIVAL.hotDamageC) out.push({ text: 'heatstroke', bad: true });
    else if (this.coreC > SURVIVAL.hotSweatC) out.push({ text: 'overheating', bad: false });
    if (this.hunger <= 0) out.push({ text: 'starving', bad: true });
    else if (this.hunger < SURVIVAL.hungerWeakBelow) out.push({ text: 'hungry', bad: false });
    if (this.wetness > 0.65) out.push({ text: 'soaked', bad: false });
    else if (this.wetness > 0.25) out.push({ text: 'wet', bad: false });
    if (this.stamina < 12) out.push({ text: 'exhausted', bad: false });
    return out;
  }

  // ── the tick ──────────────────────────────────────────────────────────────

  /**
   * @param {number} dt
   * @param {object} ctx { ctrl, env, insulationC, drawing, ruleset }
   */
  update(dt, ctx = {}) {
    super.update(dt);
    this._warningCooldown = Math.max(0, this._warningCooldown - dt);

    const { ctrl, env, insulationC = 0, drawing = false, enabled = true } = ctx;
    if (!enabled || !env || !ctrl) return;
    this.env = env;

    const exertion = clamp(ctrl.horizontalSpeed / PLAYER.sprintSpeed, 0, 1);

    // ── wetness ───────────────────────────────────────────────────────────
    // Rain soaks you, standing in the lake soaks you faster, and you dry in
    // sun, wind and firelight. Wetness is the multiplier on everything cold.
    let wetRate = 0;
    if (env.rain > 0.02) wetRate += env.rain * SURVIVAL.wetRainRate * env.exposure;
    if (env.inWater || ctrl.wadeDepth > 0.2) wetRate += SURVIVAL.wetWadeRate;
    let dryRate = SURVIVAL.wetDryRate;
    dryRate += (env.fireWarmth / SURVIVAL.fireWarmthC) * SURVIVAL.wetDryFireBonus;
    dryRate += (env.sunWarmth / SURVIVAL.sunWarmthMax) * SURVIVAL.wetDrySunBonus;
    dryRate += smoothstep(0.3, 1.6, env.windStrength) * SURVIVAL.wetDryWindBonus;
    if (env.rain > 0.02 && env.exposure > 0.4) dryRate *= 0.2; // no drying in the rain
    this.wetness = clamp(this.wetness + (wetRate - dryRate) * dt, 0, 1);

    // ── how cold it actually feels ────────────────────────────────────────
    this.insulationC = insulationC * lerp(1, 1 - SURVIVAL.wetInsulationLoss, this.wetness);

    const chill = windChill(env.windStrength, this.wetness);
    const soak = this.wetness * SURVIVAL.wetChillC;
    this.feltC = env.airC - chill - soak + env.sunWarmth + env.fireWarmth;

    // Moving hard genuinely warms you — walking through the night is a real
    // survival tactic and the model should reward it.
    const exertionWarm = exertion * SURVIVAL.exertionWarmthC;
    this.shivering = this.coreC < SURVIVAL.coldShiverC;
    const shiverWarm = this.shivering ? SURVIVAL.shiverWarmthC : 0;
    this.effectiveC = this.feltC + this.insulationC + exertionWarm + shiverWarm;

    // ── core temperature ──────────────────────────────────────────────────
    // Asymmetric on purpose. Below neutral you lose heat in proportion to the
    // deficit; above it there is a wide band where sweating simply copes, and
    // only past that do you start gaining. That lopsidedness is what real
    // thermoregulation does, and it is why a fire is safe to sit beside.
    const upper = SURVIVAL.neutralC + SURVIVAL.comfortBandC;
    let drive = 0;
    if (this.effectiveC < SURVIVAL.neutralC) drive = this.effectiveC - SURVIVAL.neutralC;
    else if (this.effectiveC > upper) drive = this.effectiveC - upper;

    if (drive !== 0) {
      this.coreC = clamp(
        this.coreC + drive * SURVIVAL.thermalRate * dt,
        SURVIVAL.coreMinC,
        SURVIVAL.coreMaxC
      );
    } else {
      // Comfortable: the body works its way back to 37 on its own. Slow enough
      // that thawing out is a few minutes by the fire rather than a switch —
      // getting cold should cost you time, which is the only currency here.
      this.coreC += (SURVIVAL.coreStartC - this.coreC) * SURVIVAL.rewarmRate * dt;
    }
    this.sweating = this.coreC > SURVIVAL.hotSweatC;

    // ── hunger ────────────────────────────────────────────────────────────
    // Measured in IN-WORLD hours, not real ones, so appetite tracks the sun.
    // Change the day length and hunger rescales with it automatically.
    const worldHours = (dt / 60 / TIME.dayMinutes) * 24;
    let burn = SURVIVAL.hungerPerHour * worldHours;
    burn *= lerp(1, SURVIVAL.hungerExertionMul, exertion);
    if (this.shivering) burn *= SURVIVAL.hungerColdMul;
    this.hunger = clamp(this.hunger - burn, 0, 100);

    // ── stamina ───────────────────────────────────────────────────────────
    const sprinting = ctrl.horizontalSpeed > PLAYER.walkSpeed * 1.15 && ctrl.grounded;
    let drain = 0;
    if (sprinting) drain += SURVIVAL.staminaSprintDrain;
    if (drawing) drain += SURVIVAL.staminaDrawDrain;
    if (this.sweating) drain *= SURVIVAL.staminaHotMul;

    let recover = 0;
    if (!sprinting) {
      recover = ctrl.horizontalSpeed > 0.4 ? SURVIVAL.staminaWalkRecover : SURVIVAL.staminaRecover;
      if (this.shivering) recover *= 0.6;
    }
    // Hunger caps how much stamina you can hold at all.
    const ceiling =
      this.hunger < SURVIVAL.hungerWeakBelow
        ? lerp(35, 100, this.hunger / SURVIVAL.hungerWeakBelow)
        : 100;
    this.stamina = clamp(this.stamina + (recover - drain) * dt, 0, ceiling);
    // Once spent you must recover a margin before you can sprint again, so it
    // cannot be feathered on and off.
    if (this.stamina <= 0.5) this.sprintBlocked = true;
    if (this.stamina > SURVIVAL.staminaSprintFloor) this.sprintBlocked = false;

    // ── consequences ──────────────────────────────────────────────────────
    if (this.coreC < SURVIVAL.coldDamageC) {
      const severity = smoothstep(SURVIVAL.coldDamageC, SURVIVAL.coreMinC, this.coreC);
      this.damage(SURVIVAL.coldDamagePerSec * severity * dt, { kind: 'cold' });
      this.warn('you are freezing');
    }
    if (this.coreC > SURVIVAL.hotDamageC) {
      const severity = smoothstep(SURVIVAL.hotDamageC, SURVIVAL.coreMaxC, this.coreC);
      this.damage(SURVIVAL.hotDamagePerSec * severity * dt, { kind: 'heat' });
      this.warn('you are overheating');
    }
    if (this.hunger <= SURVIVAL.hungerDamageBelow) {
      this.damage(SURVIVAL.hungerDamagePerSec * dt, { kind: 'hunger' });
      this.warn('you are starving');
    }
  }

  /** Emit a warning at most once every eight seconds, and never repeat back to back. */
  warn(text) {
    if (this._warningCooldown > 0 && this._lastWarning === text) return;
    this._lastWarning = text;
    this._warningCooldown = 8;
    this.deps.onWarning?.(text);
  }

  /** Eat something. Returns how much it filled you, or 0 if it is not food. */
  eat(itemId) {
    const food = SURVIVAL.food[itemId];
    if (!food) return 0;
    const before = this.hunger;
    this.hunger = clamp(this.hunger + food.fills, 0, 100);
    return this.hunger - before;
  }
}
