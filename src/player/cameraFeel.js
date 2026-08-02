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
  }

  update(dt, ctrl, camera) {
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

    // Vertical bobs at twice the lateral rate: one dip per footfall, one sway
    // per full stride. That 2:1 relationship is what makes it read as walking.
    const phase = ctrl.distanceTravelled * FEEL.bobDistanceFreq * Math.PI * 2;
    const bobY = Math.sin(phase * 2) * FEEL.bobAmpVertical * this.bobAmp;
    const bobX = Math.sin(phase) * FEEL.bobAmpLateral * this.bobAmp;

    // ── lean into a strafe ──
    this.roll = damp(this.roll, -ctrl.strafeInput * FEEL.strafeRoll, FEEL.rollLerp, dt);

    // Rotation first, because the lateral bob is applied along camera-right.
    camera.rotation.order = 'YXZ';
    camera.rotation.set(ctrl.pitch, ctrl.yaw, this.roll);

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
    const fovTarget = ctrl.flying
      ? FEEL.fovBase
      : FEEL.fovBase + (FEEL.fovSprint - FEEL.fovBase) * speedRatio;
    const next = damp(this.fov, fovTarget, FEEL.fovLerp, dt);
    if (Math.abs(next - this.fov) > 0.002) {
      this.fov = next;
      camera.fov = next;
      camera.updateProjectionMatrix();
    }
  }
}
