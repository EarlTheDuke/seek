// ── rain.js ─────────────────────────────────────────────────────────────────
// Falling rain as a single LineSegments draw call.
//
// Lines rather than sprites because a raindrop at speed IS a streak — that is
// what a camera and an eye both see — and it costs two vertices instead of a
// quad and a texture fetch. The streak leans with the wind, so a gusty day
// visibly drives the rain sideways.
//
// The whole field lives in a box that follows the player, with drops recycled
// to the top when they fall out of it, so there is no spawning cost at all.

import * as THREE from 'three';
import { makeRandom } from '../world/noise.js';
import { clamp, lerp } from '../util/math.js';

const BOX = 46; // horizontal extent of the rain volume, metres
const TOP = 26; // how far above you it starts
const DEPTH = 34; // and how far below before it recycles

export class Rain {
  constructor(scene, maxDrops = 2600) {
    this.max = maxDrops;
    this.rand = makeRandom('rain');
    this.count = 0;

    // Two vertices per drop: head and tail of the streak.
    this.pos = new Float32Array(maxDrops * 6);
    this.vel = new Float32Array(maxDrops); // fall speed, varied per drop
    this.len = new Float32Array(maxDrops); // streak length

    for (let i = 0; i < maxDrops; i++) {
      this.reset(i, true);
      this.vel[i] = lerp(24, 34, this.rand());
      this.len[i] = lerp(0.55, 1.5, this.rand());
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo = geo;

    this.mat = new THREE.LineBasicMaterial({
      color: 0xb9c9d8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true,
    });

    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);

    this.anchor = new THREE.Vector3();
  }

  /** Put drop `i` somewhere in the box, optionally at a random height. */
  reset(i, anywhere = false) {
    const o = i * 6;
    const x = (this.rand() - 0.5) * BOX;
    const z = (this.rand() - 0.5) * BOX;
    const y = anywhere ? this.rand() * (TOP + DEPTH) - DEPTH : TOP;
    this.pos[o] = x;
    this.pos[o + 1] = y;
    this.pos[o + 2] = z;
    this.pos[o + 3] = x;
    this.pos[o + 4] = y + 1;
    this.pos[o + 5] = z;
  }

  /**
   * @param {number} intensity 0..1 from the weather system
   * @param {THREE.Vector2} windDir
   * @param {number} windStrength
   */
  update(dt, playerPos, intensity, windDir, windStrength) {
    const active = Math.floor(this.max * clamp(intensity, 0, 1));
    this.lines.visible = active > 0;
    this.mat.opacity = clamp(intensity * 0.55, 0, 0.55);
    if (active === 0) {
      this.count = 0;
      return;
    }

    // The box rides with you, so drops are only ever simulated where they can
    // be seen.
    this.anchor.set(playerPos.x, playerPos.y, playerPos.z);
    this.lines.position.copy(this.anchor);

    // Wind pushes the streaks over. Heavier wind, more slant.
    const drift = 5.5 * windStrength;
    const dx = windDir.x * drift;
    const dz = windDir.y * drift;

    const p = this.pos;
    for (let i = 0; i < active; i++) {
      const o = i * 6;
      const fall = this.vel[i] * dt;
      p[o + 1] -= fall;
      p[o] += dx * dt;
      p[o + 2] += dz * dt;

      if (p[o + 1] < -DEPTH) {
        this.reset(i);
        continue;
      }
      // Tail trails back up the velocity vector, which is what makes it read
      // as motion rather than as a floating stick.
      const l = this.len[i];
      const speed = Math.hypot(dx, this.vel[i], dz) || 1;
      p[o + 3] = p[o] - (dx / speed) * l;
      p[o + 4] = p[o + 1] + (this.vel[i] / speed) * l;
      p[o + 5] = p[o + 2] - (dz / speed) * l;
    }

    this.count = active;
    this.geo.setDrawRange(0, active * 2);
    this.geo.attributes.position.needsUpdate = true;
  }
}
