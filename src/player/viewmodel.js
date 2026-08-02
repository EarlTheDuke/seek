// ── viewmodel.js ────────────────────────────────────────────────────────────
// The thing in your hands.
//
// Rendered in its own scene with its own camera, drawn after the post chain
// onto a cleared depth buffer. That costs one extra render call and buys three
// things: the bow can never clip into a hillside you are standing against, it
// keeps correct depth sorting *within itself*, and it stays out of the bloom
// and film grain — which is what you want, since it is notionally attached to
// your eye rather than sitting out in the world.
//
// Its key light is the real sun direction rotated into view space, so turning
// toward the sun genuinely lights the front of the bow.

import * as THREE from 'three';
import { BOW, FEEL } from '../config.js';
import { getItem, buildBow } from '../items/registry.js';
import { ITEMS, itemMaterial } from '../items/registry.js';
import { clamp, damp, lerp } from '../util/math.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

// The bow is built at world scale — about 1.26 m tip to tip. At the viewmodel
// camera's 52° FOV the visible height half a metre away is only ~0.49 m, so it
// has to be scaled down or almost all of it sits off the bottom of the screen.
const BOW_SCALE = 0.3;

// The arrow shaft is 11 mm across. Scaled into the viewmodel that is under two
// pixels, so the nocked arrow is thickened for the held view only — the one
// that actually flies uses the true geometry.
const NOCKED_FATTEN = 2.4;

// Where the bow sits at rest, and where it moves to at full draw. Rest is low
// and off to the left so it does not block the view; drawing brings it up to
// centre, the way an archer's hand comes to anchor.
const REST = {
  pos: new THREE.Vector3(-0.34, -0.29, -0.5),
  rot: new THREE.Euler(0.16, 0.55, 0.24),
};
const DRAWN = {
  pos: new THREE.Vector3(-0.21, -0.09, -0.46),
  rot: new THREE.Euler(0.0, 0.1, 0.0),
};

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.01, 12);

    this.key = new THREE.DirectionalLight(0xffffff, 3.2);
    this.scene.add(this.key);
    // Generous fill: the held item is often backlit (you tend to face the sun
    // here), and without this it collapses into a black silhouette.
    this.fill = new THREE.HemisphereLight(0xbcd0ea, 0x7d6242, 2.9);
    this.scene.add(this.fill);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.bowRig = null;
    this.generic = null;
    this.currentId = null;

    this.swayX = 0;
    this.swayY = 0;
    this.lastYaw = 0;
    this.lastPitch = 0;
    this.bobAmp = 0;
    this.hidden = false;
  }

  setSize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Swap what is being held. Called when the equipped slot changes. */
  setItem(itemId) {
    if (itemId === this.currentId) return;
    this.currentId = itemId;
    this.root.clear();
    this.bowRig = null;
    this.generic = null;
    if (!itemId) return;

    if (itemId === 'bow') {
      const group = buildBow();
      group.scale.setScalar(BOW_SCALE);
      const nocked = new THREE.Mesh(ITEMS.arrow.geometry(), itemMaterial);
      nocked.rotation.y = Math.PI; // geometry points +Z; the bow shoots -Z
      nocked.scale.set(NOCKED_FATTEN, NOCKED_FATTEN, 1);
      nocked.visible = false;
      group.add(nocked);
      this.root.add(group);
      this.bowRig = {
        group,
        string: group.userData.string,
        tips: group.userData.tips,
        nocked,
        restMid: new THREE.Vector3(0, 0, 0.02),
      };
      return;
    }

    const def = getItem(itemId);
    if (!def) return;
    const obj = def.makeObject();
    obj.position.set(-0.24, -0.28, -0.46);
    obj.rotation.set(0.5, 0.4, 0.2);
    obj.scale.setScalar(def.kind === 'ammo' ? 1 : 0.9);
    this.root.add(obj);
    this.generic = obj;
  }

  /**
   * @param {object} state  the weapon's getState(), or null
   */
  update(dt, controller, state, sunDirection, cameraQuat) {
    // Key light: the world sun, expressed in view space.
    if (sunDirection && cameraQuat) {
      _q.copy(cameraQuat).invert();
      _v.copy(sunDirection).applyQuaternion(_q).multiplyScalar(10);
      this.key.position.copy(_v);
    }

    // ── sway: the held item lags behind where you swing the camera ──
    const dYaw = controller.yaw - this.lastYaw;
    const dPitch = controller.pitch - this.lastPitch;
    this.lastYaw = controller.yaw;
    this.lastPitch = controller.pitch;
    this.swayX = damp(this.swayX + clamp(dYaw, -0.1, 0.1) * 0.28, 0, 9, dt);
    this.swayY = damp(this.swayY + clamp(dPitch, -0.1, 0.1) * 0.22, 0, 9, dt);

    // ── bob, on the same distance-driven phase as the camera ──
    const moving = controller.grounded && !controller.flying && controller.horizontalSpeed > 0.4;
    this.bobAmp = damp(this.bobAmp, moving ? 1 : 0, 7, dt);
    const phase = controller.distanceTravelled * FEEL.bobDistanceFreq * Math.PI * 2;
    const bobX = Math.sin(phase) * 0.014 * this.bobAmp;
    const bobY = Math.sin(phase * 2) * 0.011 * this.bobAmp;

    this.root.position.set(this.swayX + bobX, this.swayY + bobY, 0);

    if (this.bowRig) this.updateBow(dt, state);
    else if (this.generic) this.generic.rotation.y += dt * 0.4;
  }

  updateBow(dt, state) {
    const rig = this.bowRig;
    const charge = state?.charge ?? 0;
    const sway = state?.sway ?? 0;

    // Ease the pose so a released shot snaps back rather than teleporting.
    const t = charge;
    rig.group.position.lerpVectors(REST.pos, DRAWN.pos, t);
    rig.group.rotation.set(
      lerp(REST.rot.x, DRAWN.rot.x, t) + sway,
      lerp(REST.rot.y, DRAWN.rot.y, t),
      lerp(REST.rot.z, DRAWN.rot.z, t)
    );

    // String: pull the middle vertex back toward the archer.
    const pull = charge * 0.3;
    const pos = rig.string.geometry.attributes.position;
    pos.setXYZ(0, rig.tips[0].x, rig.tips[0].y, rig.tips[0].z);
    pos.setXYZ(1, 0, 0, rig.restMid.z + pull);
    pos.setXYZ(2, rig.tips[1].x, rig.tips[1].y, rig.tips[1].z);
    pos.needsUpdate = true;

    // Nocked arrow rides the string, pointing forward.
    const drawing = state?.drawing ?? false;
    rig.nocked.visible = drawing || charge > 0.01;
    if (rig.nocked.visible) {
      const nockZ = rig.restMid.z + pull;
      rig.nocked.position.set(0, 0, nockZ - 0.36);
    }
  }

  render(renderer) {
    if (this.hidden || !this.currentId) return;
    const wasAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth(); // the whole point: our own depth range
    renderer.render(this.scene, this.camera);
    renderer.autoClear = wasAuto;
  }
}
