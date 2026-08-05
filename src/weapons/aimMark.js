// ── aimMark.js ──────────────────────────────────────────────────────────────
// The mark: a ring laid on the world where your arrow would actually land.
//
// Why this exists, measured rather than guessed:
//
// Aiming dead at a deer at 35 m, at full draw with the spread term removed, from
// twelve stands on a ring around it — twelve arrows out of twelve went into the
// ground, short by 5 to 30 m. At eight of those twelve stands the animal was in
// plain sight. The reason is not the ballistics, which match their spec to the
// centimetre: the sight line to a grazing deer clears the intervening ground by
// only 0.2–0.9 m, and the arrow drops 0.5 m by 20 m and 1.1 m by 30 m. The drop
// eats the clearance. The shot was never available, and nothing on screen said
// so, because a smooth heightfield offers the eye no texture at that scale.
//
// So the mark is not an aiming aid in the crosshair sense — it adds no accuracy
// and it does not track anything. It reports one fact the player had no way to
// get: where this shot ends. When it sits on a hillside twelve metres in front
// of you instead of on the deer, the shot is off and the answer is to move,
// which is the stalk doing its job.
//
// Three things keep it honest:
//   * it flies the same integrator and the same collision sweep as the arrow,
//     via `Projectiles.predict`, so it cannot drift from the real shot;
//   * it only appears while you are actually drawing;
//   * its radius is the real spread cone at that range, so the ring IS your
//     group — it shrinks as you draw, swells when you move or hold too long.
//
// Rendering only reads. Nothing here touches simulation state.

import * as THREE from 'three';
import { AIM } from '../config.js';
import { clamp, damp } from '../util/math.js';

const UP = new THREE.Vector3(0, 1, 0);
const _normal = new THREE.Vector3();
const _quat = new THREE.Quaternion();

// Ring and circle geometry are born in the XY plane, facing +Z. Everything
// below works in "normal" space, so this rotates them flat once, up front.
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// Warm for a shot that lands on the animal, cold for one that lands on the
// hill. Two states only — this is a fact, not a gauge.
const ON_TARGET = new THREE.Color(0xffd9a0);
const ON_GROUND = new THREE.Color(0x93a7b4);

export class AimMark {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.enabled = AIM.enabled;
    this.radius = AIM.minRadius;
    this.visible = false;

    // A unit ring, scaled per frame — one geometry, never rebuilt.
    const geometry = new THREE.RingGeometry(0.82, 1, AIM.segments);
    this.material = new THREE.MeshBasicMaterial({
      color: ON_GROUND,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    scene.add(this.mesh);

    // A dot at the centre, so a very tight group is still findable on busy
    // ground. Same material, so it fades and colours with the ring.
    const dot = new THREE.CircleGeometry(0.16, 12);
    this.dot = new THREE.Mesh(dot, this.material);
    this.dot.frustumCulled = false;
    this.dot.renderOrder = 3;
    this.dot.visible = false;
    scene.add(this.dot);
  }

  hide() {
    this.visible = false;
    this.mesh.visible = false;
    this.dot.visible = false;
    this.material.opacity = 0;
  }

  /**
   * @param {number} dt
   * @param {object|null} weapon  the equipped weapon, if any — only a bow has
   *   `previewShot`, so an axe simply never marks anything.
   * @param {THREE.Camera} camera  needed to face a mark that landed on flesh.
   */
  update(dt, weapon, camera) {
    if (!this.enabled || !camera || !weapon || typeof weapon.previewShot !== 'function') {
      this.hide();
      return;
    }

    const shot = weapon.previewShot();
    if (!shot || !shot.hit) {
      this.hide();
      return;
    }

    // Ring radius is the spread cone where the arrow arrives. `spread` is the
    // same number `fire` scatters by.
    const spread = typeof weapon.spread === 'number' ? weapon.spread : 0;
    const onFlesh = !!(shot.creature || shot.player);
    const wanted = clamp(
      Math.tan(spread) * shot.distance,
      onFlesh ? AIM.minFleshRadius : AIM.minRadius,
      AIM.maxRadius
    );
    this.radius = this.visible ? damp(this.radius, wanted, AIM.followRate, dt) : wanted;

    const target = shot.creature || shot.player;

    // Lie the ring on whatever it hit.
    //
    // A hit on flesh is the exception, and the first capture caught it: an
    // animal reports no surface normal, so the ring was laid flat at chest
    // height — seen edge-on from twenty metres it is a hairline, and the half
    // of it inside the body is depth-tested away. Exactly the shot the player
    // most needs to see was the one they could not. So a mark on something
    // living faces the shooter instead, and stands off toward them so it
    // frames the animal rather than sinking into it.
    if (target) {
      _normal.copy(camera.position).sub(shot.point).normalize();
    } else if (shot.hasNormal) {
      _normal.copy(shot.normal).normalize();
    } else {
      _normal.copy(UP);
    }
    _quat.setFromUnitVectors(UP, _normal);
    // RingGeometry is built in the XY plane; stand it up to face the normal.
    this.mesh.quaternion.copy(_quat).multiply(FLAT);
    this.dot.quaternion.copy(this.mesh.quaternion);
    this.material.color.copy(target ? ON_TARGET : ON_GROUND);
    this.material.opacity = target ? 0.85 : 0.55;

    if (this.visible) {
      this.mesh.position.set(
        damp(this.mesh.position.x, shot.point.x, AIM.followRate, dt),
        damp(this.mesh.position.y, shot.point.y, AIM.followRate, dt),
        damp(this.mesh.position.z, shot.point.z, AIM.followRate, dt)
      );
    } else {
      this.mesh.position.copy(shot.point);
    }
    // Off the surface so it does not z-fight; further off a body, which is
    // solid for most of a metre and would swallow a 5 cm offset.
    this.mesh.position.addScaledVector(_normal, target ? AIM.fleshStandoff : AIM.lift);
    this.mesh.scale.setScalar(this.radius);

    this.dot.position.copy(this.mesh.position);
    this.dot.scale.setScalar(clamp(this.radius * 0.5, 0.5, 1.4));

    this.visible = true;
    this.mesh.visible = true;
    this.dot.visible = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.dot);
    this.mesh.geometry.dispose();
    this.dot.geometry.dispose();
    this.material.dispose();
  }
}
