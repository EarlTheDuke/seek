// ── controller.js ───────────────────────────────────────────────────────────
// Input, movement and ground collision.
//
// There is no physics engine here and there does not need to be one: the ground
// is a pure function of (x, z), so "where is the floor" is one call, exact, with
// no broadphase, no colliders and no tunnelling.

import * as THREE from 'three';
import { PLAYER, FEEL, WATER_LEVEL } from '../config.js';
import { heightAt } from '../world/noise.js';
import { regionAt, regionEffects } from '../world/regions.js';
import { clamp, damp, lerp } from '../util/math.js';
import { IDLE_INTENT } from '../sim/intents.js';

// Reused scratch vectors — the update loop allocates nothing.
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();

/** Stride length right now, in metres. Shorter when crouched. */
const strideFor = (crouching) =>
  FEEL.strideMetres * (crouching ? FEEL.crouchStrideScale : 1);

/**
 * The player's body.
 *
 * Consumes intents and produces motion. It has no idea what a keyboard is —
 * see player/input.js for that — which is what lets a network packet or an
 * LLM agent drive exactly the same code.
 */
export class Controller {
  constructor() {
    this.position = new THREE.Vector3(); // feet
    this.velocity = new THREE.Vector3();

    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;

    this.grounded = true;
    this.flying = false;
    this.crouching = false;
    this.eyeHeight = PLAYER.eyeHeight;

    // Set by whatever is in your hands — a drawn bow should root you a little.
    this.speedScale = 1;
    this.distanceTravelled = 0;
    this.footfalls = 0; // the gait clock — see step()
    this.horizontalSpeed = 0;
    this.strafeInput = 0;
    this.wadeDepth = 0;
    this.landImpulse = 0; // consumed by the camera and the footstep sound
    this.stepIndex = 0;
    this.steppedThisFrame = false;

    this._accum = 0;
  }

  teleport(position, yaw) {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.yaw = this.targetYaw = yaw;
    this.pitch = this.targetPitch = -0.03; // a hair below level, looking out
    this.grounded = true;
  }

  /** Height the feet should rest at, accounting for wading. */
  surfaceAt(x, z) {
    const g = heightAt(x, z);
    if (g >= WATER_LEVEL) return g;
    // You sink into the lake until it is chest deep, then stop. Keeps you from
    // walking into a bottomless hole and never getting out.
    return Math.max(g, WATER_LEVEL - PLAYER.maxWadeDepth);
  }

  /** Desired movement in world space, from the intent, relative to where you look. */
  wish(out, intent) {
    const f = intent.forward;
    const s = intent.strafe;
    this.strafeInput = s;
    if (f === 0 && s === 0) return out.set(0, 0, 0);
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return out.copy(_fwd).multiplyScalar(f).addScaledVector(_right, s).normalize();
  }

  /**
   * Fixed-timestep update. The delta is clamped so that alt-tabbing for a
   * minute does not launch you into orbit on the next frame.
   */
  update(dt, intent = IDLE_INTENT) {
    this.steppedThisFrame = false;

    // Look is applied once per frame, not per physics substep — the intent
    // carries the whole frame's mouse movement already.
    this.targetYaw -= intent.lookYaw;
    this.targetPitch -= intent.lookPitch;
    // Never let pitch reach straight up/down; it gimbals and feels awful.
    const limit = Math.PI / 2 - 0.02;
    this.targetPitch = clamp(this.targetPitch, -limit, limit);

    this._accum += Math.min(dt, 0.1);
    const step = PLAYER.physicsStep;
    let guard = 32;
    while (this._accum >= step && guard-- > 0) {
      this.step(step, intent);
      this._accum -= step;
    }

    // Look smoothing. A touch of lag on the mouse reads as weight, not lag.
    const rate = lerp(110, 14, PLAYER.mouseSmoothing);
    this.yaw = damp(this.yaw, this.targetYaw, rate, dt);
    this.pitch = damp(this.pitch, this.targetPitch, rate, dt);
  }

  step(dt, intent) {
    if (this.flying) return this.stepFly(dt, intent);

    this.crouching = intent.crouch;
    const sprinting = intent.sprint;

    const ground = heightAt(this.position.x, this.position.z);
    this.wadeDepth = clamp(WATER_LEVEL - ground, 0, PLAYER.maxWadeDepth);

    // ── horizontal ──
    let speed = this.crouching
      ? PLAYER.crouchSpeed
      : sprinting
        ? PLAYER.sprintSpeed
        : PLAYER.walkSpeed;
    // Wading is hard work, and so is holding a bow at full draw.
    speed *= lerp(1, PLAYER.wadeFactor, this.wadeDepth / PLAYER.maxWadeDepth);
    speed *= this.speedScale;

    // And so is the ground itself. A bog at 0.52 is the first thing in the
    // world that makes a ROUTE a decision — going round is often faster than
    // going through, which is the whole reason the region system exists.
    // Cached: regionAt is cheap but this runs at the fixed step, and the
    // ground under you does not change in the centimetres between ticks.
    this.region = regionAt(this.position.x, this.position.z);
    this.regionEffects = regionEffects(this.region);
    speed *= this.regionEffects.speed;

    const wish = this.wish(_wish, intent);
    const moving = wish.lengthSq() > 0;
    const accel = this.grounded ? (moving ? PLAYER.accel : PLAYER.friction) : PLAYER.airAccel;
    this.velocity.x = damp(this.velocity.x, wish.x * speed, accel, dt);
    this.velocity.z = damp(this.velocity.z, wish.z * speed, accel, dt);

    const beforeX = this.position.x;
    const beforeZ = this.position.z;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    const moved = Math.hypot(this.position.x - beforeX, this.position.z - beforeZ);
    this.horizontalSpeed = moved / dt;
    if (this.grounded) {
      this.distanceTravelled += moved;
      // The gait phase is ACCUMULATED, not derived from total distance, so the
      // stride can change (crouching) without the footfall count jumping. This
      // counter is the single source of truth for the walk cycle — the camera
      // bob, the viewmodel sway and the footstep sounds all read it, so they
      // cannot drift apart.
      this.footfalls += moved / strideFor(this.crouching);
      const idx = Math.floor(this.footfalls);
      if (idx !== this.stepIndex) {
        this.stepIndex = idx;
        this.steppedThisFrame = true;
      }
    }

    // ── vertical ──
    const newSurface = this.surfaceAt(this.position.x, this.position.z);
    if (this.grounded) {
      if (intent.jump) {
        this.velocity.y = PLAYER.jumpSpeed;
        this.grounded = false;
        this.position.y += this.velocity.y * dt;
      } else {
        // Critically-damped follow: slopes feel like slopes, and small bumps
        // don't jolt the camera.
        this.position.y = damp(this.position.y, newSurface, PLAYER.groundSmooth, dt);
        // Walked off an edge?
        if (this.position.y - newSurface > 0.7) {
          this.grounded = false;
          this.velocity.y = 0;
        }
      }
    } else {
      this.velocity.y -= PLAYER.gravity * dt;
      this.position.y += this.velocity.y * dt;
      if (this.position.y <= newSurface) {
        const impact = -this.velocity.y;
        this.position.y = newSurface;
        this.velocity.y = 0;
        this.grounded = true;
        if (impact > 2.5) {
          this.landImpulse = clamp(impact / 11, 0, 1);
          this.steppedThisFrame = true;
        }
      }
    }

    // ── crouch ──
    const targetEye = this.crouching ? PLAYER.crouchHeight : PLAYER.eyeHeight;
    this.eyeHeight = damp(this.eyeHeight, targetEye, 12, dt);
  }

  stepFly(dt, intent) {
    const speed = PLAYER.flySpeed * (intent.sprint ? PLAYER.flySprintMul : 1);

    // Free-fly moves along the full look vector, including pitch.
    const f = intent.forward;
    const s = intent.strafe;
    const u = (intent.jump ? 1 : 0) - (intent.crouch ? 1 : 0);
    this.strafeInput = s;

    const cp = Math.cos(this.pitch);
    _fwd.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    _wish.copy(_fwd).multiplyScalar(f).addScaledVector(_right, s);
    _wish.y += u;
    if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(speed);

    this.velocity.lerp(_wish, 1 - Math.exp(-7 * dt));
    this.position.addScaledVector(this.velocity, dt);
    this.horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.eyeHeight = damp(this.eyeHeight, PLAYER.eyeHeight, 12, dt);
  }

  toggleFly() {
    this.flying = !this.flying;
    this.velocity.set(0, 0, 0);
    if (!this.flying) this.grounded = false; // fall back to the ground
    return this.flying;
  }

  /** Read and clear the landing impulse. */
  takeLandImpulse() {
    const v = this.landImpulse;
    this.landImpulse = 0;
    return v;
  }
}
