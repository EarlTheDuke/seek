// ── stealth.js ──────────────────────────────────────────────────────────────
// What you look, sound and smell like to an animal.
//
// Deliberately a separate object from the controller: creatures should not be
// reaching into player internals to work out how loud you are, and later on a
// cloak, a scent-masking item or a wind-reading skill can all modify this one
// profile without touching a single creature.
//
// Three independent channels, because that is what makes the stalk interesting:
// you can be silent and still visible, or hidden and still upwind.

import { PLAYER, STEALTH, WATER_LEVEL, WIND } from '../config.js';
import { heightAt } from '../world/noise.js';
import { clamp, damp, lerp } from '../util/math.js';

export class StealthProfile {
  constructor() {
    this.noise = 0; // 0..1, smoothed
    this.visibility = 1; // 0..1
    this.inCover = 0; // 0..1, how much the grass is breaking your outline
    this.windDot = 0; // +1 = the wind is carrying your scent straight at them
    // Live wind, fed from the weather system. Starts at the config default so
    // scent still works before the first weather update.
    this.windX = WIND.dirX;
    this.windZ = WIND.dirZ;
    this.rainMask = 0; // 0..1, how much rain is covering your noise and scent
  }

  /** Called by main each frame with the current weather. */
  setWeather(weather) {
    this.windX = weather.windDir.x;
    this.windZ = weather.windDir.y;
    this.rainMask = weather.rain;
  }

  update(dt, ctrl) {
    // ── noise ──
    // Raw target from your gait, then smoothed: stopping dead should quieten
    // you quickly but not instantly, so a creature gets a moment to notice.
    const speed = ctrl.horizontalSpeed;
    const sprinting = speed > PLAYER.walkSpeed * 1.15;
    let target;
    if (speed < 0.35) target = STEALTH.noiseStill;
    else if (ctrl.crouching) target = STEALTH.noiseCrouch;
    else if (sprinting) target = STEALTH.noiseSprint;
    else target = lerp(STEALTH.noiseCrouch, STEALTH.noiseWalk, clamp(speed / PLAYER.walkSpeed, 0, 1));

    // Splashing through the shallows is loud whatever your gait.
    if (ctrl.wadeDepth > 0.1 && speed > 0.35) target = Math.max(target, STEALTH.noiseWade);
    // Landing from a jump is a thump.
    if (ctrl.steppedThisFrame && !ctrl.grounded) target = Math.max(target, 0.7);

    // Rain covers you. Not because you are quieter, but because everything else
    // is louder — which is the single best reason to hunt in bad weather.
    target *= lerp(1, STEALTH.rainNoiseMask, this.rainMask);

    this.noise = damp(this.noise, target, STEALTH.noiseSmoothing, dt);

    // ── cover ──
    // Grass only hides you if you are down in it. Standing in knee-high grass
    // does nothing; crouching in it does a lot.
    const ground = heightAt(ctrl.position.x, ctrl.position.z);
    const overWater = ground < WATER_LEVEL;
    const grassy = !overWater && ground < 92;
    this.inCover = grassy && ctrl.crouching ? STEALTH.coverCrouchBonus : 0;

    // ── visibility ──
    let vis = ctrl.crouching ? STEALTH.visCrouch : STEALTH.visStand;
    if (speed > 0.4) vis += STEALTH.visMovingBonus * clamp(speed / PLAYER.sprintSpeed, 0, 1);
    vis -= this.inCover;
    this.visibility = clamp(vis, 0.05, 1.4);
  }

  /**
   * How strongly your scent reaches a point, 0..1.
   *
   * The world already has a prevailing wind, so this is nearly free: if the
   * wind blows from you toward the animal, it smells you from a long way off.
   * Circling downwind is the single most useful thing a hunter can do here.
   */
  scentAt(fromX, fromZ, toX, toZ) {
    // Rain beats your scent out of the air. Combined with the noise mask above,
    // heavy rain is the closest thing to invisibility this world offers.
    const wash = lerp(1, STEALTH.rainScentMask, this.rainMask);
    if (wash <= 0.001) return 0;

    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return wash;
    const range = STEALTH.scentRange;
    if (d > range) return 0;
    // Live wind direction, normalised.
    const wl = Math.hypot(this.windX, this.windZ) || 1;
    const dot = ((dx / d) * this.windX + (dz / d) * this.windZ) / wl;
    if (dot <= 0) return 0; // they are upwind of you; nothing carries
    const cone = clamp((dot - (1 - STEALTH.scentCone)) / STEALTH.scentCone, 0, 1);
    const falloff = 1 - d / range;
    return cone * falloff * wash;
  }

  /** A one-word summary for the HUD. */
  get label() {
    if (this.noise < 0.05 && this.visibility < 0.55) return 'hidden';
    if (this.noise < 0.15) return 'quiet';
    if (this.noise < 0.5) return 'audible';
    return 'loud';
  }
}
