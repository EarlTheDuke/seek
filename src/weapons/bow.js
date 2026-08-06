// ── bow.js ──────────────────────────────────────────────────────────────────
// Draw, hold, release.
//
// The feel comes from three things working against each other: speed rises with
// draw, spread falls with draw, and holding at full draw eventually costs you
// accuracy. So there is a real decision in every shot rather than "always hold
// for maximum". Moving opens the spread further, which is what makes stopping,
// planting your feet and breathing out feel like it earns something.

import * as THREE from 'three';
import { Weapon } from './weapon.js';
import { BOW, PLAYER } from '../config.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _origin = new THREE.Vector3();
// The preview keeps its own scratch. It runs in the render loop and `fire`
// runs off input; sharing would work today and break the first time one of
// them moves.
const _aimFwd = new THREE.Vector3();
const _aimVel = new THREE.Vector3();
const _aimOrigin = new THREE.Vector3();

const IDLE = 'idle';
const DRAWING = 'drawing';
const COOLDOWN = 'cooldown';

export class Bow extends Weapon {
  constructor(def, ctx) {
    super(def, ctx);
    this.state = IDLE;
    this.charge = 0; // 0..1
    this.holdTime = 0; // seconds spent at full draw
    this.cooldown = 0;
    this.wantDraw = false;
    this.lastShotAt = -Infinity;
    this.time = 0;
  }

  get ammoCount() {
    return this.ctx.inventory.countOf(this.def.ammo);
  }

  onUnequip() {
    this.cancel();
  }

  cancel() {
    if (this.state === DRAWING) this.ctx.audio?.bowRelax?.();
    this.state = IDLE;
    this.charge = 0;
    this.holdTime = 0;
    this.wantDraw = false;
  }

  beginPrimary() {
    this.wantDraw = true;
    if (this.state !== IDLE || this.cooldown > 0) return;
    if (this.ammoCount <= 0) {
      this.ctx.onDryFire?.();
      return;
    }
    this.state = DRAWING;
    this.charge = 0;
    this.holdTime = 0;
    this.ctx.audio?.bowDraw?.(BOW.drawTime);
  }

  endPrimary() {
    this.wantDraw = false;
    if (this.state !== DRAWING) return;
    if (this.charge < BOW.minCharge) {
      // Not enough tension to be worth an arrow — let it slip, keep the arrow.
      this.cancel();
      return;
    }
    this.fire();
  }

  update(dt) {
    this.time += dt;
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      if (this.cooldown === 0 && this.state === COOLDOWN) {
        this.state = IDLE;
        // Trigger still held and arrows left? Start the next draw automatically.
        if (this.wantDraw && this.ammoCount > 0) this.beginPrimary();
      }
    }

    if (this.state !== DRAWING) return;

    this.charge = clamp(this.charge + dt / BOW.drawTime, 0, 1);
    if (this.charge >= 1) this.holdTime += dt;
  }

  /** 0 while fresh, ramping to 1 as your arms start to complain. */
  get fatigue() {
    return smoothstep(BOW.holdFatigue, BOW.holdFatigue + 3.5, this.holdTime);
  }

  /**
   * The half-angle of the shot cone right now, in radians.
   *
   * Tight at full draw, loose at a snatched half-draw, worse while moving,
   * worse again if you have been straining at full draw for a while. `fire`
   * scatters the arrow by exactly this, and the aim mark draws a ring of
   * exactly this — which is what makes the ring an honest promise rather than
   * a decoration.
   */
  get spread() {
    const moveTerm =
      BOW.spreadMovePenalty * clamp(this.ctx.controller.horizontalSpeed / PLAYER.sprintSpeed, 0, 1);
    return (
      lerp(BOW.spreadLoose, BOW.spreadFull, this.charge) +
      moveTerm +
      this.fatigue * BOW.spreadLoose * 0.8
    );
  }

  /** Launch speed for the current draw. */
  get launchSpeed() {
    return lerp(BOW.minSpeed, BOW.maxSpeed, this.charge);
  }

  /**
   * Where this shot would actually end up if loosed this instant — the centre
   * of the group, before spread scatters it.
   *
   * Null unless you are actually drawing: the mark is a thing you get for
   * taking your time, not a permanent overlay on the world.
   *
   * The returned record is shared scratch owned by `Projectiles` — read it now,
   * do not keep it.
   */
  previewShot() {
    if (this.state !== DRAWING) return null;
    const { camera, controller, projectiles } = this.ctx;
    if (!projectiles?.predict) return null;

    camera.getWorldDirection(_aimFwd).normalize();
    // Same origin and the same inherited motion as `fire`, or the preview would
    // quietly promise a shot the bow does not take.
    _aimOrigin.copy(camera.position).addScaledVector(_aimFwd, BOW.muzzle);
    _aimVel.copy(_aimFwd).multiplyScalar(this.launchSpeed).add(controller.velocity);

    return projectiles.predict('arrow', _aimOrigin, _aimVel, this.ctx.ownerId ?? null);
  }

  fire() {
    const { camera, controller, inventory, projectiles, audio, rand } = this.ctx;

    if (!inventory.consumeAmmo(this.def, 1)) {
      this.cancel();
      return;
    }

    camera.getWorldDirection(_fwd).normalize();
    _right.crossVectors(_fwd, camera.up).normalize();
    _up.crossVectors(_right, _fwd).normalize();

    // ── spread ──
    // One definition, shared with the aim mark — see the `spread` getter.
    const spread = this.spread;

    // Gaussian-ish scatter in the plane perpendicular to aim, so error clusters
    // near the centre instead of spreading evenly over a disc.
    const gauss = () => (rand() + rand() + rand() - 1.5) * 0.9;
    _fwd.addScaledVector(_right, gauss() * spread).addScaledVector(_up, gauss() * spread).normalize();

    _vel.copy(_fwd).multiplyScalar(this.launchSpeed);
    // Inherit the archer's motion — a shot taken at a run genuinely drifts.
    _vel.add(controller.velocity);

    // Spawn on the aim line rather than at the bow, so the arrow goes exactly
    // where the crosshair says. Offsetting to the bow looks nicer and lies.
    _origin.copy(camera.position).addScaledVector(_fwd, BOW.muzzle);

    // `ownerId` so the shaft cannot strike the archer who loosed it — it
    // spawns half a metre in front of a capsule wider than that.
    projectiles.spawn('arrow', _origin, _vel, this.ctx.ownerId ?? null);
    audio?.bowRelease?.(this.charge);

    // A little upward kick, scaled by how hard you drew.
    controller.targetPitch = clamp(
      controller.targetPitch + 0.012 + 0.022 * this.charge,
      -Math.PI / 2 + 0.02,
      Math.PI / 2 - 0.02
    );

    this.state = COOLDOWN;
    this.cooldown = BOW.cooldown;
    this.charge = 0;
    this.holdTime = 0;
    this.lastShotAt = this.time;
  }

  getState() {
    const ammo = this.ammoCount;
    return {
      charge: this.charge,
      drawing: this.state === DRAWING,
      ready: this.state === IDLE && this.cooldown === 0 && ammo > 0,
      ammo,
      fatigue: this.fatigue,
      // A tiny sway once you have held it too long, for the viewmodel to use.
      sway: this.fatigue * 0.012 * Math.sin(this.time * 7.3),
      note: ammo === 0 ? 'out of arrows' : null,
    };
  }

  get moveScale() {
    return this.state === DRAWING ? lerp(1, BOW.moveSlow, this.charge) : 1;
  }

  get fovOffset() {
    return this.state === DRAWING ? -BOW.fovPull * this.charge : 0;
  }

  get spreadHint() {
    if (this.state !== DRAWING) return 1;
    return clamp(1 - this.charge + this.fatigue * 0.5, 0, 1);
  }
}
