// ── controller.js ───────────────────────────────────────────────────────────
// Input, movement and ground collision.
//
// There is no physics engine here and there does not need to be one: the ground
// is a pure function of (x, z), so "where is the floor" is one call, exact, with
// no broadphase, no colliders and no tunnelling.

import * as THREE from 'three';
import { PLAYER, FEEL, WATER_LEVEL } from '../config.js';
import { heightAt } from '../world/noise.js';
import { clamp, damp, lerp } from '../util/math.js';

// Reused scratch vectors — the update loop allocates nothing.
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();

// Two footfalls per bob cycle. Derived from the bob frequency rather than typed
// separately, because if these two numbers ever disagree the footstep sounds
// visibly desync from the camera.
const STEPS_PER_METRE = FEEL.bobDistanceFreq * 2;

export class Controller {
  constructor(domElement) {
    this.dom = domElement;
    this.position = new THREE.Vector3(); // feet
    this.velocity = new THREE.Vector3();

    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;

    this.keys = new Set();
    this.locked = false;
    // Pointer lock is not always available — inside an iframe the embedding
    // page must grant `allow="pointer-lock"`, and the request throws a
    // SecurityError if it hasn't. When that happens we fall back to
    // hold-left-button-and-drag, which works anywhere.
    this.lockSupported = true;
    this.dragging = false;
    this.onLockUnavailable = null; // set by main.js to tell the player
    this.grounded = true;
    this.flying = false;
    this.crouching = false;
    this.eyeHeight = PLAYER.eyeHeight;

    this.distanceTravelled = 0; // drives head bob and footsteps
    this.horizontalSpeed = 0;
    this.strafeInput = 0;
    this.wadeDepth = 0;
    this.landImpulse = 0; // consumed by the camera and the footstep sound
    this.stepIndex = 0;
    this.steppedThisFrame = false;

    this._accum = 0;
    this.bind();
  }

  bind() {
    this.onKeyDown = (e) => {
      // Don't swallow browser shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onMouseMove = (e) => {
      // `movementX/Y` is populated on ordinary mousemove too, so the drag
      // fallback uses exactly the same path as pointer lock.
      if (!this.locked && !this.dragging) return;
      this.targetYaw -= e.movementX * PLAYER.mouseSensitivity;
      this.targetPitch -= e.movementY * PLAYER.mouseSensitivity;
      // Never let pitch reach straight up/down — it gimbals and feels awful.
      const limit = Math.PI / 2 - 0.02;
      this.targetPitch = clamp(this.targetPitch, -limit, limit);
    };
    this.onMouseDown = (e) => {
      if (this.lockSupported || e.button !== 0) return;
      this.dragging = true;
      this.dom.style.cursor = 'grabbing';
      e.preventDefault();
    };
    this.onMouseUp = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.dom.style.cursor = 'grab';
    };
    this.onLockChange = () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) this.keys.clear(); // avoid a key sticking on blur
    };
    // Some browsers report the failure here rather than throwing or rejecting.
    this.onLockError = () => this.lockUnavailable(new Error('pointerlockerror'));
    this.onBlur = () => {
      this.keys.clear();
      this.onMouseUp();
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    this.dom.addEventListener('mousedown', this.onMouseDown);
    // On window, not the canvas: releasing outside the canvas must still stop.
    window.addEventListener('mouseup', this.onMouseUp);
  }

  /**
   * Ask for pointer lock, tolerating every way it can fail: a synchronous
   * throw, a rejected promise, or a `pointerlockerror` event.
   */
  requestLock() {
    if (!this.lockSupported) return;
    let result;
    try {
      result = this.dom.requestPointerLock?.();
    } catch (err) {
      return this.lockUnavailable(err);
    }
    if (result && typeof result.catch === 'function') {
      result.catch((err) => this.lockUnavailable(err));
    }
  }

  /** Switch permanently to drag-look and let the UI say so. */
  lockUnavailable(err) {
    if (!this.lockSupported) return; // already handled
    this.lockSupported = false;
    this.locked = false;
    this.dom.style.cursor = 'grab';
    this.onLockUnavailable?.(err);
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

  /** Movement intent in world space, from WASD relative to where you look. */
  wish(out) {
    const f = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const s = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
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
  update(dt) {
    this.steppedThisFrame = false;
    this._accum += Math.min(dt, 0.1);
    const step = PLAYER.physicsStep;
    let guard = 32;
    while (this._accum >= step && guard-- > 0) {
      this.step(step);
      this._accum -= step;
    }

    // Look smoothing. A touch of lag on the mouse reads as weight, not lag.
    const rate = lerp(110, 14, PLAYER.mouseSmoothing);
    this.yaw = damp(this.yaw, this.targetYaw, rate, dt);
    this.pitch = damp(this.pitch, this.targetPitch, rate, dt);
  }

  step(dt) {
    if (this.flying) return this.stepFly(dt);

    this.crouching = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

    const ground = heightAt(this.position.x, this.position.z);
    this.wadeDepth = clamp(WATER_LEVEL - ground, 0, PLAYER.maxWadeDepth);

    // ── horizontal ──
    let speed = this.crouching
      ? PLAYER.crouchSpeed
      : sprinting
        ? PLAYER.sprintSpeed
        : PLAYER.walkSpeed;
    // Wading is hard work.
    speed *= lerp(1, PLAYER.wadeFactor, this.wadeDepth / PLAYER.maxWadeDepth);

    const wish = this.wish(_wish);
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
      // Two footfalls per bob cycle.
      const idx = Math.floor(this.distanceTravelled * STEPS_PER_METRE);
      if (idx !== this.stepIndex) {
        this.stepIndex = idx;
        this.steppedThisFrame = true;
      }
    }

    // ── vertical ──
    const newSurface = this.surfaceAt(this.position.x, this.position.z);
    if (this.grounded) {
      if (this.keys.has('Space')) {
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

  stepFly(dt) {
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = PLAYER.flySpeed * (sprint ? PLAYER.flySprintMul : 1);

    // Free-fly moves along the full look vector, including pitch.
    const f = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const s = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const u = (this.keys.has('Space') ? 1 : 0) - (this.keys.has('ControlLeft') ? 1 : 0);
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

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    this.dom.removeEventListener('mousedown', this.onMouseDown);
  }
}
