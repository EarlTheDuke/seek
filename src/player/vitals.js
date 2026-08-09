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
    /**
     * True once somebody else is keeping this number.
     *
     * Set by `applyRemote`, cleared by `takeOverLocally`. While it is set this
     * body does not regenerate, does not count down to a respawn and does not
     * revive itself: the server has already decided all three and a second
     * clock running against the first can only disagree. That is the same
     * lesson as `defend` versus `mirrorFight` — do not ask a question the
     * server has already answered.
     */
    this.remote = false;
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
    // The server is keeping this number and it has already counted the cold,
    // the starving and the goblin. Hurting yourself again here would take the
    // damage off twice on your screen and off nobody else's — and the next
    // snapshot would silently heal you back, which looks exactly like a bug.
    if (this.remote) {
      this.lastAttacker = source ?? this.lastAttacker;
      return;
    }
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

  /**
   * Take the server's word for how alive you are.
   *
   * THE SERVER KILLED ME AND RESPAWNED ME AND THE BROWSER NEVER NOTICED. The
   * snapshot has carried `me.h` for as long as there have been snapshots and
   * nothing in the browser has ever read one: watched running
   * 12 → 0 → 89 → 34 → 1 → 0 → 100 — two full deaths and two respawns, sixteen
   * seconds of being eaten by a warband — while the health bar on the same
   * screen read 100 the whole way through. You could be dead on the machine
   * that owns the world and be the last to know.
   *
   * Same shape as the position fix before it: the server is the authority and
   * the client's job is to agree, not to keep a second opinion. The local
   * simulation still runs — it has to, it is what draws the picture — but from
   * here on its health number is a copy, and `remote` stops its clock from
   * arguing with the one it is copying.
   *
   * The deps fire exactly as they do for local damage, so a hit landed on the
   * server flashes the screen, jolts the camera and cancels your draw, and a
   * death over the wire lands you on the ground with the same ceremony as one
   * you took in single player. Anything less and "the server says you are dead"
   * would still be a number in a debugger rather than something you feel.
   */
  applyRemote(health) {
    this.remote = true;
    const h = clamp(health, 0, this.max);
    const was = this.health;
    this.health = h;

    if (h < was) {
      // Whatever took it off you, you felt that.
      this.sinceHurt = 0;
      this.hurtFlash = Math.min(1, this.hurtFlash + clamp((was - h) / 45, 0.35, 1));
      this.deps.onDamage?.(was - h, this.lastAttacker, this);
    }

    if (h === 0 && !this.dead) {
      this.dead = true;
      this.deathTime = 0;
      this.deps.onDeath?.(this.lastAttacker, this);
    } else if (h > 0 && this.dead) {
      this.dead = false;
      this.deathTime = 0;
      this.hurtFlash = 0;
      this.sinceHurt = Infinity;
      // ── AND STAND UP FED, WARM AND DRY ──
      //
      // THE DEATH LOOP. `revive()` calls `Body.reset()` — hunger, core
      // temperature, stamina, wetness — but a body revived BY THE SERVER never
      // goes through `revive()`: it comes through here, which cleared the death
      // flags and nothing else. So the local body woke with the hunger it died
      // with, and a playtester went round the loop eight times: "you respawn
      // starving with an empty quiver and die again about ninety seconds later".
      //
      // `this.reset?.()` and not `revive()`, deliberately. `revive()` would also
      // set health to full, and health is the SERVER'S to give — it has just
      // told us what it is. `reset` exists on `Body` and not on a bare `Vitals`,
      // so the optional call is doing real work here.
      this.reset?.();
      this.deps.onRespawn?.(this);
    }
  }

  /**
   * Nobody is keeping this number for us any more — go back to running our own.
   *
   * Called when the socket drops. Without it a disconnected body would keep the
   * last health the server ever sent and never heal, or lie dead for ever
   * waiting on a respawn from a machine that has stopped talking.
   */
  takeOverLocally() {
    if (!this.remote) return;
    this.remote = false;
    this.deathTime = 0;
  }

  update(dt) {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * VITALS.flashFade);

    // Somebody else owns life and death while we are connected — see
    // `applyRemote`. The flash above is presentation and stays local.
    if (this.remote) return;

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
