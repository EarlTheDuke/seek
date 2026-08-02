// ── vitals.js ───────────────────────────────────────────────────────────────
// The player's health, and what happens when it runs out.
//
// Kept apart from the controller on purpose: the controller is about movement,
// and later on hunger, cold or poison all want to push on this without knowing
// anything about walking. Anything that can hurt you calls `damage()`.
//
// Health regenerates, slowly, and only once you have been left alone for a
// while — so surviving a bear means breaking contact, not standing still for
// three seconds.

import { VITALS } from '../config.js';
import { clamp } from '../util/math.js';

export class Vitals {
  constructor(deps = {}) {
    this.deps = deps; // { onDamage, onDeath, onRespawn }
    this.max = VITALS.maxHealth;
    this.health = this.max;
    this.sinceHurt = Infinity;
    this.dead = false;
    this.deathTime = 0;
    /** Rises on a hit and decays — drives the red flash and the camera jolt. */
    this.hurtFlash = 0;
    this.lastAttacker = null;
  }

  get fraction() {
    return clamp(this.health / this.max, 0, 1);
  }

  /** True once you have taken enough that it is worth showing you a bar. */
  get wounded() {
    return this.health < this.max - 0.5;
  }

  damage(amount, source = null) {
    if (this.dead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.sinceHurt = 0;
    this.hurtFlash = Math.min(1, this.hurtFlash + clamp(amount / 45, 0.35, 1));
    this.lastAttacker = source;
    this.deps.onDamage?.(amount, source, this);
    if (this.health === 0) {
      this.dead = true;
      this.deathTime = 0;
      this.deps.onDeath?.(source, this);
    }
  }

  heal(amount) {
    if (this.dead) return;
    this.health = Math.min(this.max, this.health + amount);
  }

  revive() {
    this.dead = false;
    this.health = this.max;
    this.sinceHurt = Infinity;
    this.hurtFlash = 0;
    this.deathTime = 0;
    this.deps.onRespawn?.(this);
  }

  update(dt) {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * VITALS.flashFade);

    if (this.dead) {
      this.deathTime += dt;
      if (this.deathTime >= VITALS.respawnDelay) this.revive();
      return;
    }

    this.sinceHurt += dt;
    if (this.sinceHurt > VITALS.regenDelay && this.health < this.max) {
      this.health = Math.min(this.max, this.health + VITALS.regenRate * dt);
    }
  }
}
