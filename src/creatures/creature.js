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
import { STEALTH } from '../config.js';
import { heightAt } from '../world/noise.js';
import { clamp, damp, lerp, smoothstep } from '../util/math.js';

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
      _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
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
          const a = this.rand() * Math.PI * 2;
          const r = 8 + this.rand() * 22;
          this.wanderTarget = new THREE.Vector3(
            this.home.x + Math.cos(a) * r,
            0,
            this.home.z + Math.sin(a) * r
          );
          this.stateTime = 0;
        }
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
    const want = Math.atan2(-(x - this.position.x), -(z - this.position.z));
    let diff = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const turn = (rate ?? this.species.turnRate) * dt;
    this.yaw += clamp(diff, -turn, turn);
  }

  steerTo(x, z, dt, rate = null) {
    this.faceToward(x, z, dt, rate);
  }

  // ── movement + animation ──────────────────────────────────────────────────

  move(dt) {
    this.speed = damp(this.speed, this.targetSpeed, 3.2, dt);
    if (this.speed > 0.02) {
      _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.position.addScaledVector(_fwd, this.speed * dt);
    }
    // Feet on the ground, always.
    this.position.y = heightAt(this.position.x, this.position.z);
    this.object.rotation.y = this.yaw;
  }

  animate(dt) {
    const p = this.parts;
    if (this.state === DEAD) {
      // Topple over and stay down.
      const t = smoothstep(0, 0.7, this.deathTime);
      this.object.rotation.z = lerp(0, Math.PI / 2.1, t);
      this.object.position.y = heightAt(this.position.x, this.position.z) - lerp(0, 0.25, t);
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
