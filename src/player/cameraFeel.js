// ── cameraFeel.js ───────────────────────────────────────────────────────────
// The difference between "a camera moving through terrain" and "walking".
//
// The one non-obvious choice: the head bob is driven by *distance travelled*,
// not by elapsed time. A time-based bob desyncs from your legs the moment you
// sprint or crouch — it keeps cycling at the same rate while your stride length
// changes. Distance-based bob stays locked at every speed, and lets the
// footstep sounds fire on the exact same phase.

import * as THREE from 'three';
import { FEEL, PLAYER } from '../config.js';
import { clamp, damp } from '../util/math.js';

const _right = new THREE.Vector3();

export class CameraFeel {
  constructor() {
    this.bobAmp = 0;
    this.roll = 0;
    this.dip = 0; // landing dip, a damped spring
    this.dipVel = 0;
    this.fov = FEEL.fovBase;
    this.shakeAmt = 0; // decaying impulse, driven by taking hits
    this.shakeT = 0;
  }

  /** Jolt the view. `amount` is roughly 0..1. */
  shake(amount) {
    this.shakeAmt = Math.min(1.2, this.shakeAmt + amount);
  }

  /** `fovOffset` lets whatever is in your hands pull the view in while aiming. */
  update(dt, ctrl, camera, fovOffset = 0) {
    // ── landing dip: spring back toward zero ──
    this.dipVel += ctrl.takeLandImpulse() * FEEL.landDipMax * FEEL.landDipSpring * dt;
    this.dipVel += (-this.dip * FEEL.landDipSpring - this.dipVel * FEEL.landDipDamp) * dt;
    this.dip = clamp(this.dip + this.dipVel * dt, -0.05, FEEL.landDipMax);

    // ── bob amplitude tracks how fast you are actually moving ──
    const target =
      ctrl.grounded && !ctrl.flying && ctrl.horizontalSpeed > 0.4
        ? clamp(ctrl.horizontalSpeed / PLAYER.walkSpeed, 0, 1.7)
        : 0;
    this.bobAmp = damp(this.bobAmp, target, 8, dt);

    // Counted in footfalls, so the maths says what it means: one vertical dip
    // per footfall, one lateral sway per full stride (a left and a right). That
    // 2:1 relationship is what makes it read as walking rather than floating.
    const bobY = Math.sin(ctrl.footfalls * Math.PI * 2) * FEEL.bobAmpVertical * this.bobAmp;
    const bobX = Math.sin(ctrl.footfalls * Math.PI) * FEEL.bobAmpLateral * this.bobAmp;

    // ── lean into a strafe ──
    this.roll = damp(this.roll, -ctrl.strafeInput * FEEL.strafeRoll, FEEL.rollLerp, dt);

    // ── impact shake ──
    // Two incommensurate frequencies per axis so it never settles into a
    // visible rhythm, decaying fast enough to punctuate rather than nauseate.
    this.shakeT += dt;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.6);
    const s = this.shakeAmt * this.shakeAmt; // ease out hard
    const shakePitch = s * 0.055 * (Math.sin(this.shakeT * 47) + 0.6 * Math.sin(this.shakeT * 29));
    const shakeYaw = s * 0.05 * (Math.sin(this.shakeT * 38 + 1.7) + 0.6 * Math.sin(this.shakeT * 61));
    const shakeRoll = s * 0.09 * Math.sin(this.shakeT * 33 + 0.4);

    // Rotation first, because the lateral bob is applied along camera-right.
    camera.rotation.order = 'YXZ';
    camera.rotation.set(ctrl.pitch + shakePitch, ctrl.yaw + shakeYaw, this.roll + shakeRoll);

    camera.position.copy(ctrl.position);
    camera.position.y += ctrl.eyeHeight + bobY - this.dip;
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(_right, bobX);

    // ── FOV kick ──
    // Cheap, and it is most of what "fast" actually feels like.
    const speedRatio = clamp(
      (ctrl.horizontalSpeed - PLAYER.walkSpeed) / (PLAYER.sprintSpeed - PLAYER.walkSpeed),
      0,
      1
    );
    const fovTarget =
      (ctrl.flying ? FEEL.fovBase : FEEL.fovBase + (FEEL.fovSprint - FEEL.fovBase) * speedRatio) +
      fovOffset;
    const next = damp(this.fov, fovTarget, FEEL.fovLerp, dt);
    if (Math.abs(next - this.fov) > 0.002) {
      this.fov = next;
      camera.fov = next;
      camera.updateProjectionMatrix();
    }
  }
}
