// ── creature.js ─────────────────────────────────────────────────────────────
// One animal: what it knows, what it decides, and how it moves.
//
// The awareness meter is the heart of it. Rather than a hard "can it see me,
// yes or no", four sense channels each push a 0..1 meter up, and it decays when
// nothing is feeding it. That single number then drives the whole state
// machine, which buys a lot of behaviour for very little code:
//
//   * Sprinting at a deer fills the meter through hearing alone, so it bolts
//     before it ever lays eyes on you.
//   * Crouch-walking upwind fills it slowly enough that you can close the gap.
//   * Stop moving and the meter falls again — so freezing when its head comes
//     up genuinely works, without that being written down anywhere as a rule.
//
// States: GRAZE -> ALERT -> FLEE -> (recover) -> GRAZE, plus WANDER and DEAD.

import * as THREE from 'three';
import { STEALTH, WATER_LEVEL } from '../config.js';
import { heightAt } from '../world/noise.js';
import { clamp, damp, lerp, smoothstep } from '../util/math.js';

// Creature forward is local +Z.
//
// Note this is the OPPOSITE of the player camera, whose forward is -Z. The
// bodies in registry.js are built head-forward along +Z (chest at +0.6, rump at
// -0.62, tail at -0.78), so matching that here means `object.rotation.y = yaw`
// is simply correct, with no 180-degree correction hidden in the renderer for
// someone to trip over later. Every heading calculation below uses it.
const fwdX = (yaw) => Math.sin(yaw);
const fwdZ = (yaw) => Math.cos(yaw);

export const GRAZE = 'graze';
export const WANDER = 'wander';
export const ALERT = 'alert';
export const FLEE = 'flee';
export const DEAD = 'dead';

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();

let nextId = 1;

export class Creature {
  constructor(species, position, rand) {
    this.id = nextId++;
    this.species = species;
    this.rand = rand;

    const built = species.build(rand);
    this.object = built.group;
    this.parts = built.parts;
    this.male = built.male;
    this.scale = built.scale;
    this.object.position.copy(position);

    this.hp = species.hitPoints;
    this.maxHp = species.hitPoints;
    this.state = GRAZE;
    this.awareness = 0;
    this.stateTime = 0;
    this.yaw = rand() * Math.PI * 2;
    this.speed = 0;
    this.targetSpeed = 0;
    this.stamina = species.stamina;
    this.legPhase = rand() * Math.PI * 2;
    this.headDown = 1; // 1 = grazing, 0 = head fully up
    this.wanderTarget = null;
    this.home = position.clone();
    this.dead = false;
    this.deathTime = 0;
    this.lastKnownThreat = new THREE.Vector3();
    this.alarmed = false; // set for one frame when it first panics
  }

  get position() {
    return this.object.position;
  }

  // ── senses ────────────────────────────────────────────────────────────────

  /**
   * Fold every sense channel into the awareness meter.
   * Each channel returns 0..1; we take the strongest rather than summing, so a
   * creature that can both see and hear you is not double-counted into instant
   * panic — but the loudest signal still dominates, which is what you want.
   */
  sense(dt, player, stealth) {
    const S = this.species.senses;
    const px = player.x;
    const pz = player.z;
    const dx = px - this.position.x;
    const dz = pz - this.position.z;
    const dist = Math.hypot(dx, dz);

    let signal = 0;

    // ── sight ──
    if (dist < S.sightRange) {
      _fwd.set(fwdX(this.yaw), 0, fwdZ(this.yaw));
      const facing = (dx / (dist || 1)) * _fwd.x + (dz / (dist || 1)) * _fwd.z;
      const inFov = facing > Math.cos(S.sightFov / 2);
      if (inFov) {
        // Close and moving in the open = obvious. Far, crouched, still = not.
        const near = 1 - dist / S.sightRange;
        // Grazing animals look down; a head-down deer sees much less.
        const attention = lerp(0.35, 1, 1 - this.headDown);
        signal = Math.max(signal, near * stealth.visibility * S.sightAcuity * attention);
      }
    }

    // ── hearing ── omnidirectional, scales with how much noise you make
    const hearRange = STEALTH.hearingRange * stealth.noise;
    if (stealth.noise > 0.01 && dist < hearRange) {
      signal = Math.max(signal, (1 - dist / hearRange) * S.hearingAcuity);
    }

    // ── scent ── the deer's best sense, and entirely under your control
    const scent = stealth.scentAt(px, pz, this.position.x, this.position.z);
    if (scent > 0) signal = Math.max(signal, scent * S.scentAcuity);

    // ── proximity ── nothing survives you standing on top of it
    if (dist < 6) signal = Math.max(signal, 1 - dist / 6);

    if (signal > 0.02) {
      // Rises fast, so being spotted is decisive.
      this.awareness = clamp(this.awareness + signal * dt * 1.5, 0, 1);
      this.lastKnownThreat.set(px, 0, pz);
    } else {
      this.awareness = clamp(this.awareness - S.calmRate * dt, 0, 1);
    }
    this.distanceToPlayer = dist;
    return signal;
  }

  // ── decisions ─────────────────────────────────────────────────────────────

  think(dt) {
    const S = this.species.senses;
    const sp = this.species.speeds;
    this.stateTime += dt;

    if (this.awareness >= S.panicAt && this.state !== FLEE) {
      this.setState(FLEE);
      this.alarmed = true;
      this.stamina = this.species.stamina;
    } else if (this.state === GRAZE || this.state === WANDER) {
      if (this.awareness >= S.alertAt) this.setState(ALERT);
    }

    switch (this.state) {
      case GRAZE:
        this.targetSpeed = 0;
        // Head bobs down to feed, then lifts to check the surroundings — that
        // lift is the window a stalker is waiting for.
        this.headDown = damp(this.headDown, Math.sin(this.stateTime * 0.35) > 0.55 ? 0 : 1, 2.2, dt);
        if (this.stateTime > 9 + this.rand() * 8) this.setState(WANDER);
        break;

      case WANDER: {
        this.headDown = damp(this.headDown, 0.35, 2, dt);
        this.targetSpeed = sp.walk;
        if (!this.wanderTarget || this.stateTime > 12) {
          // Try a few spots and keep the first that is not in the lake, so
          // grazing animals never set off toward open water.
          this.wanderTarget = null;
          for (let attempt = 0; attempt < 8; attempt++) {
            const a = this.rand() * Math.PI * 2;
            const r = 8 + this.rand() * 22;
            const tx = this.home.x + Math.cos(a) * r;
            const tz = this.home.z + Math.sin(a) * r;
            if (this.passable(tx, tz)) {
              this.wanderTarget = new THREE.Vector3(tx, 0, tz);
              break;
            }
          }
          this.stateTime = 0;
          if (!this.wanderTarget) this.setState(GRAZE);
        }
        if (!this.wanderTarget) break;
        this.steerTo(this.wanderTarget.x, this.wanderTarget.z, dt);
        if (Math.hypot(this.wanderTarget.x - this.position.x, this.wanderTarget.z - this.position.z) < 2.5) {
          this.setState(GRAZE);
        }
        break;
      }

      case ALERT:
        // Frozen, head up, staring straight at whatever it noticed. Moving now
        // is what tips it over into bolting.
        this.headDown = damp(this.headDown, 0, 5, dt);
        this.targetSpeed = 0;
        this.faceToward(this.lastKnownThreat.x, this.lastKnownThreat.z, dt, 2.2);
        if (this.awareness < S.alertAt * 0.7) this.setState(GRAZE);
        break;

      case FLEE: {
        this.headDown = damp(this.headDown, 0, 8, dt);
        this.stamina -= dt;
        // A hard bolt, then dropping to a trot as it tires.
        this.targetSpeed = this.stamina > 0 ? sp.flee : sp.trot;
        // Run directly away from the threat.
        const ax = this.position.x - this.lastKnownThreat.x;
        const az = this.position.z - this.lastKnownThreat.z;
        this.steerTo(this.position.x + ax, this.position.z + az, dt, 4.5);
        // Far enough away and calming down? Stop and look back.
        if (this.stateTime > 3 && this.awareness < S.panicAt * 0.6 && this.distanceToPlayer > 45) {
          this.setState(ALERT);
        }
        break;
      }

      case DEAD:
        this.targetSpeed = 0;
        this.deathTime += dt;
        break;
    }
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
  }

  faceToward(x, z, dt, rate = null) {
    // atan2(dx, dz) is the +Z-forward inverse — see the note at the top.
    const want = Math.atan2(x - this.position.x, z - this.position.z);
    let diff = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const turn = (rate ?? this.species.turnRate) * dt;
    this.yaw += clamp(diff, -turn, turn);
  }

  steerTo(x, z, dt, rate = null) {
    this.faceToward(x, z, dt, rate);
  }

  // ── movement + animation ──────────────────────────────────────────────────

  /** Deepest water this animal will walk into, in metres. */
  get wadeMax() {
    return this.species.wadeMax ?? 0.8;
  }

  /** Can it stand here, or is the water over its head? */
  passable(x, z) {
    return heightAt(x, z) > WATER_LEVEL - this.wadeMax;
  }

  /**
   * Look ahead along a heading and report whether it stays out of deep water.
   * Sampled at a few points rather than just the endpoint, so a deer cannot
   * step over a narrow inlet.
   */
  clearAhead(yaw, distance) {
    const dx = fwdX(yaw);
    const dz = fwdZ(yaw);
    for (let i = 1; i <= 3; i++) {
      const t = (i / 3) * distance;
      if (!this.passable(this.position.x + dx * t, this.position.z + dz * t)) return false;
    }
    return true;
  }

  /** Centre-to-centre distance this animal wants from its neighbours. */
  get personalSpace() {
    return (this.species.personalSpace ?? 2) * this.scale;
  }

  /**
   * Shove this animal sideways, refusing the move if it would put it in water
   * it cannot stand in. Used by the herd separation pass in the manager.
   */
  nudge(dx, dz) {
    const nx = this.position.x + dx;
    const nz = this.position.z + dz;
    if (!this.passable(nx, nz)) return;
    this.position.x = nx;
    this.position.z = nz;
    this.position.y = Math.max(heightAt(nx, nz), WATER_LEVEL - this.wadeMax);
  }

  move(dt) {
    this.speed = damp(this.speed, this.targetSpeed, 3.2, dt);

    if (this.speed > 0.02) {
      // ── don't run into the lake ──
      // A deer fleeing straight away from you will happily sprint off a
      // shoreline otherwise, and the lake bed drops to 14 m below the surface.
      // Fan out from the intended heading and take the nearest clear one.
      const look = Math.max(2.5, this.speed * 0.8);
      if (!this.clearAhead(this.yaw, look)) {
        let found = null;
        for (let step = 1; step <= 7 && found === null; step++) {
          for (const side of [1, -1]) {
            const test = this.yaw + side * step * 0.32;
            if (this.clearAhead(test, look)) {
              found = test;
              break;
            }
          }
        }
        if (found === null) {
          // Boxed in — stop rather than wade in blindly.
          this.speed *= 0.25;
        } else {
          // Turn hard toward the opening; panicking animals cut sharply.
          let diff = ((found - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          this.yaw += clamp(diff, -6 * dt, 6 * dt);
        }
      }

      _fwd.set(fwdX(this.yaw), 0, fwdZ(this.yaw));
      const nx = this.position.x + _fwd.x * this.speed * dt;
      const nz = this.position.z + _fwd.z * this.speed * dt;
      // Final guard: never actually step into water it cannot stand in.
      if (this.passable(nx, nz)) {
        this.position.x = nx;
        this.position.z = nz;
      } else {
        this.speed *= 0.4;
      }
    }

    // Feet on the ground — but never below chest depth, so an animal that
    // somehow ends up in the shallows wades out instead of sinking.
    const ground = heightAt(this.position.x, this.position.z);
    this.position.y = Math.max(ground, WATER_LEVEL - this.wadeMax);
    this.object.rotation.y = this.yaw;
  }

  animate(dt) {
    const p = this.parts;
    if (this.state === DEAD) {
      // Topple over and stay down.
      const t = smoothstep(0, 0.7, this.deathTime);
      this.object.rotation.z = lerp(0, Math.PI / 2.1, t);
      // Same floor as the living case: a carcass in the shallows must not sink.
      const ground = Math.max(heightAt(this.position.x, this.position.z), WATER_LEVEL - this.wadeMax);
      this.object.position.y = ground - lerp(0, 0.25, t);
      for (const leg of p.legs) leg.rotation.x = lerp(leg.rotation.x, 0.2, dt * 3);
      p.neckPivot.rotation.x = lerp(p.neckPivot.rotation.x, 0.9, dt * 3);
      return;
    }

    // Gait: stride frequency follows speed, so a walk and a bolt use the same
    // code and never look out of sync with the ground.
    const stride = this.speed > 0.05 ? this.speed * 1.5 : 0;
    this.legPhase += stride * dt;
    const swing = clamp(this.speed / this.species.speeds.trot, 0, 1.5);
    for (let i = 0; i < p.legs.length; i++) {
      // Diagonal pairs, as a real quadruped moves.
      const off = i === 0 || i === 3 ? 0 : Math.PI;
      p.legs[i].rotation.x = Math.sin(this.legPhase + off) * 0.65 * swing;
    }

    // Body rocks and lifts slightly at a gallop.
    const bound = this.speed > this.species.speeds.trot ? 1 : 0;
    p.body.position.y = 0.86 + Math.sin(this.legPhase * 2) * 0.05 * swing * (1 + bound);
    p.body.rotation.x = Math.sin(this.legPhase * 2) * 0.05 * swing;

    // Neck: down to graze, up and alert otherwise.
    p.neckPivot.rotation.x = lerp(-0.35, 0.95, this.headDown);
    p.headPivot.rotation.x = lerp(0.2, 0.55, this.headDown);

    // Tail flicks — faster when nervous.
    const nerves = 1 + this.awareness * 4;
    p.tailPivot.rotation.x = Math.sin(this.legPhase * 1.5 + this.id) * 0.25 * nerves * 0.4;
  }

  update(dt, player, stealth) {
    if (this.state !== DEAD) {
      this.sense(dt, player, stealth);
      this.think(dt);
      this.move(dt);
    }
    this.animate(dt);
  }

  // ── damage ────────────────────────────────────────────────────────────────

  /**
   * Which zone a world-space hit point falls in. Heights are fractions of the
   * creature's standing height, so this works for any species in the table.
   */
  zoneAt(worldY) {
    const rel = (worldY - this.position.y) / (this.species.height * this.scale);
    const zones = this.species.hitZones;
    for (const z of zones) if (rel >= z.minY) return z;
    return zones[zones.length - 1];
  }

  applyDamage(amount, zone) {
    if (this.state === DEAD) return { killed: false, damage: 0 };
    const dealt = amount * (zone?.multiplier ?? 1);
    this.hp -= dealt;
    // Being hit is instantly and maximally alarming.
    this.awareness = 1;
    if (this.hp <= 0) {
      this.setState(DEAD);
      this.dead = true;
      return { killed: true, damage: dealt, zone: zone?.name };
    }
    this.setState(FLEE);
    this.stamina = this.species.stamina;
    return { killed: false, damage: dealt, zone: zone?.name };
  }
}
