// ── axe.js ──────────────────────────────────────────────────────────────────
// Wind up, swing, and hope you judged the distance.
//
// The first MELEE weapon, so it establishes the second shape a weapon can have.
// The bow's whole feel is a negotiation with itself — speed against spread
// against fatigue — and none of that applies here. An axe has exactly one
// decision in it, and it is a decision about TIMING: the wind-up is long enough
// that a charging animal will reach you during it, so you either swing early
// and miss or swing late and get hit.
//
// That makes it a genuinely different answer to a bear than the bow is, rather
// than a worse bow. The bow says "kill it before it arrives". The axe says
// "let it arrive, and be right about when".
//
// It is also a TOOL, which is most of why you want one. Chopping a tree by hand
// is four seconds of pulling at deadfall; with an axe in your belt it is faster
// and it yields more, and that is the reason to carry the weight before you ever
// swing it at anything alive.

import * as THREE from 'three';
import { Weapon } from './weapon.js';
import { AXE } from '../config.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();

const IDLE = 'idle';
const WINDUP = 'windup';
const SWING = 'swing';
const RECOVER = 'recover';

export class Axe extends Weapon {
  constructor(def, ctx) {
    super(def, ctx);
    this.state = IDLE;
    this.t = 0; // time in the current phase
    this.held = false;
    this.hitThisSwing = null;
    this.lastHit = null; // one-frame report, read by the viewmodel and audio
  }

  onUnequip() {
    this.cancel();
  }

  cancel() {
    this.state = IDLE;
    this.t = 0;
    this.held = false;
    this.hitThisSwing = null;
  }

  /**
   * Hold to wind up.
   *
   * Charging is capped rather than open-ended: past `windupFull` you are just
   * standing there with an axe over your head, which is the correct punishment
   * for dithering and reads clearly in the viewmodel.
   */
  beginPrimary() {
    this.held = true;
    if (this.state !== IDLE) return;
    this.state = WINDUP;
    this.t = 0;
  }

  /** Let go to swing. A swing at no charge is a poke; a full one is a blow. */
  endPrimary() {
    this.held = false;
    if (this.state !== WINDUP) return;
    this.charge = clamp(this.t / AXE.windupFull, 0, 1);
    this.state = SWING;
    this.t = 0;
    this.hitThisSwing = new Set();
    this.ctx.audio?.impact?.('wood', this.ctx.camera.position);
  }

  update(dt) {
    this.lastHit = null;
    this.t += dt;

    switch (this.state) {
      case WINDUP:
        // Held past full: nothing more accrues, but you are committed.
        if (!this.held) this.endPrimary();
        break;

      case SWING:
        // The blade only bites during the middle of the arc, which is what
        // makes timing matter rather than just proximity.
        if (this.t >= AXE.contactAt && this.t - dt < AXE.contactAt) this.strike();
        if (this.t >= AXE.swingTime) {
          this.state = RECOVER;
          this.t = 0;
        }
        break;

      case RECOVER:
        if (this.t >= AXE.recoverTime) {
          this.state = IDLE;
          this.t = 0;
          // Trigger still down? Start winding up again.
          if (this.held) this.beginPrimary();
        }
        break;
    }
  }

  /**
   * Everything in the arc, at the moment of contact.
   *
   * An arc rather than a ray, because a swung axe is a wide thing and requiring
   * a centred crosshair on a moving animal at two metres would be miserable.
   * It hits everything it reaches, which matters exactly once — when three
   * goblins have closed on you at the same time.
   */
  strike() {
    const { camera, wildlife } = this.ctx;
    if (!wildlife) return;

    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    _fwd.normalize();

    const reach = AXE.reach;
    const cosHalf = Math.cos(AXE.arc / 2);
    const power = lerp(AXE.damageLight, AXE.damageFull, this.charge);
    let struck = 0;
    let best = null;

    for (const c of wildlife.creatures) {
      if (c.state === 'dead' || this.hitThisSwing.has(c.id)) continue;
      _to.set(c.position.x - camera.position.x, 0, c.position.z - camera.position.z);
      const dist = _to.length();
      // Give the creature's own body radius back, or you have to hit the
      // centre of a bear rather than the bear.
      if (dist - (c.species.radius ?? 0.5) * c.scale > reach) continue;
      _to.normalize();
      if (_to.dot(_fwd) < cosHalf) continue;

      this.hitThisSwing.add(c.id);
      // Height decides the zone, exactly as an arrow's landing point does — so
      // a low swing at a deer's legs is worth less than one to the body, and
      // the same hit-zone table serves both weapons.
      const zone = c.zoneAt(c.position.y + (c.species.height ?? 1) * c.scale * AXE.strikeHeight);
      const res = c.applyDamage(power, zone, camera.position);
      struck++;
      if (!best || res.damage > best.damage) best = { ...res, creature: c };
    }

    this.lastHit = best ?? (struck ? { damage: 0 } : null);
    if (best) {
      this.ctx.audio?.impact?.('flesh', this.ctx.camera.position);
      this.ctx.onHit?.(best);
    } else {
      // A miss is worth hearing. Silence reads as a bug.
      this.ctx.audio?.impact?.('grass', this.ctx.camera.position);
    }
  }

  getState() {
    const charge =
      this.state === WINDUP ? clamp(this.t / AXE.windupFull, 0, 1) : (this.charge ?? 0);
    return {
      kind: 'melee',
      state: this.state,
      // The viewmodel reads these two to pose the arms.
      charge,
      swing: this.state === SWING ? clamp(this.t / AXE.swingTime, 0, 1) : 0,
      // `drawing` is what the rest of the game already asks about a weapon
      // being readied — the body drains stamina on it and the HUD dims the
      // crosshair. Reusing the word means neither had to learn a new one.
      drawing: this.state === WINDUP,
      ready: this.state === IDLE,
    };
  }

  /** Winding up is heavy work and you cannot run flat out doing it. */
  get moveScale() {
    return this.state === WINDUP ? lerp(1, AXE.windupMoveScale, clamp(this.t / AXE.windupFull, 0, 1)) : 1;
  }

  get fovOffset() {
    return this.state === WINDUP ? -AXE.windupFov * clamp(this.t / AXE.windupFull, 0, 1) : 0;
  }

  /** No spread: it either reaches or it does not. */
  get spreadHint() {
    return 0;
  }
}
