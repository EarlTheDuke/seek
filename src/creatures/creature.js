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
import { STEALTH, WATER_LEVEL, WILDLIFE } from '../config.js';
import { heightAt } from '../world/noise.js';
import { darkness } from '../world/strangeness.js';
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
export const CHARGE = 'charge';
export const ATTACK = 'attack';
export const DEAD = 'dead';

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();

/**
 * How a body moves, as data. A species may override any of it in the registry.
 * The defaults are the deer, since that is what the animator was written
 * against and what every four-legged grazer should look like.
 */
export const ANIM_DEFAULTS = {
  strideRate: 1.5, // leg cycles per metre-per-second of travel
  legSwing: 0.65, // radians of fore-aft leg throw at full speed
  armSwing: 0, // only bodies with arms use this
  bodyBob: 0.05, // vertical rock, metres
  bodyRock: 0.05, // pitch, radians
  neckUp: -0.35, // neck angle head-up (alert)
  neckDown: 0.95, // ...and head-down (grazing)
  headUp: 0.2,
  headDown: 0.55,
  tailFlick: 0.4,
};

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
    // True only for a body mirrored from a server snapshot — see manager
    // applySnapshot. A remote body is drawn, never simulated and never damaged.
    this.remote = false;
    this.serverId = undefined;
    this.deathTime = 0;
    // Where the body sits when alive, so the death pose can settle back to it.
    this.restBodyY = this.parts.body.position.y;
    // Death pose, rolled at the moment of death so a carcass is never a mirror
    // of the one beside it. Defaults keep animate() safe before then.
    this.fallSide = 1;
    this.fallTilt = 0;
    this.deadLegs = [0, 0, 0, 0];
    this.deadLegSplay = [0, 0, 0, 0];
    // Seeded to its own position, not the world origin. An animal whose
    // awareness gets raised before it has actually detected anything would
    // otherwise charge at (0, 0, 0) from wherever it happens to be standing.
    this.lastKnownThreat = position.clone();
    this.alarmed = false; // set for one frame when it first panics
    // How many retellings away this animal's information is. 0 means it saw or
    // smelt the threat itself; 2 means it is reacting to an animal reacting to
    // an animal. Each hop weakens what gets passed on — see manager.raiseAlarm.
    this.alarmGen = 0;

    // ── pack state ──
    // Set by the manager for species that have `morale`. A creature with no
    // pack simply keeps the defaults and nothing reads them.
    this.packId = null;
    this.pack = null; // live roster, refreshed each frame
    this.packCentre = null; // where its fellows are, for rallying and prowling
    this.packStanding = 1; // how many of them are still up and nearby
    // Starts confident: a pack that spawns already wavering has no arc.
    this.morale = 1;
    this.broken = false;
    this.shock = 0;
    this.routing = false; // has spent stamina on this rout; reset when it rallies
    this.goneToGround = false; // blown, in daylight, hunkered where it stands
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

    // ── hearing ── omnidirectional, scales with how much noise you make.
    // Species may override the base range; a bear hears a running man a long
    // way further off than a deer does.
    const hearRange = (S.hearingRange ?? STEALTH.hearingRange) * stealth.noise;
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
      // First-hand knowledge. Anything it passes on from here is a fresh
      // rumour rather than a retelling of one, so the chain can restart.
      this.alarmGen = 0;
    } else {
      this.awareness = clamp(this.awareness - S.calmRate * dt, 0, 1);
    }
    this.distanceToPlayer = dist;
    return signal;
  }

  // ── decisions ─────────────────────────────────────────────────────────────

  /**
   * Dispatch to the species' brain. Adding a third temperament — a territorial
   * animal that warns before committing, say — is a new method and one entry
   * in this switch, with nothing else in the file touched.
   */
  think(dt) {
    this.stateTime += dt;
    if (this.species.behaviour === 'pack') this.thinkPack(dt);
    else if (this.species.behaviour === 'aggressive') this.thinkAggressive(dt);
    else this.thinkSkittish(dt);
  }

  // ── pack: circle, commit, break, rally ─────────────────────────────────────

  /**
   * The goblin.
   *
   * Deliberately not a small bear. A bear is a single decision — stand and
   * shoot, or die — and repeating that with a weaker enemy would be dull. This
   * is a fight against a GROUP's confidence rather than against its bodies,
   * and it has three postures instead of one:
   *
   *   * CONFIDENT — it commits, and it commits from a side. Each member holds
   *     an angular slot around you (see `flankAngle`), so a pack arrives
   *     spread out and gets behind you rather than queueing up on your
   *     crosshair. This is the thing that makes six of them frightening.
   *   * WAVERING — it closes to `hesitateRange` and STAYS there, circling, out
   *     of reach, watching. Not attacking and not leaving. That posture is
   *     worse to be on the end of than either alternative, and it is what a
   *     pack that has taken a loss but not been beaten actually does.
   *   * BROKEN — it runs. But it runs to regroup, not to leave, and if you let
   *     it gather with its fellows out of sight its morale climbs back and it
   *     comes again.
   *
   * Everything above is read off `morale`, which the manager recomputes each
   * frame from the pack's numbers, wounds, shock and the sun.
   */
  thinkPack(dt) {
    const S = this.species.senses;
    const sp = this.species.speeds;
    const A = this.species.aggression;
    const M = this.species.morale;

    this.attackCooldown = Math.max(0, (this.attackCooldown ?? 0) - dt);
    this.headDown = damp(this.headDown, 0, 4, dt);

    const dist = this.distanceToPlayer ?? Infinity;
    const tx = this.lastKnownThreat.x;
    const tz = this.lastKnownThreat.z;

    // ── broken: run to the rally point, not simply away ──
    if (this.broken) {
      // Running is WORK, and this was the one flight in the file that never
      // paid for it. The prey bolt spends stamina and drops to a trot; so does
      // the bear breaking off; this branch held `sp.flee` for ever.
      //
      // Against a player that is FASTER but can only hold it for nine seconds,
      // "for ever" is not an escape, it is invulnerability. Measured in
      // daylight, sprinting the whole time and re-sprinting the instant stamina
      // allowed: from 5.9 m behind one to 159 m behind it in fifty-five
      // seconds, still losing ground when the run was cut. That is the whole of
      // "goblins are unkillable in daylight" — a pack at the daylight morale
      // floor breaks on sight and then simply outlasts you.
      if (!this.routing) {
        this.routing = true;
        this.stamina = this.species.stamina;
      }
      this.stamina -= dt;
      const blown = this.stamina <= 0;

      // ── gone to ground ──
      //
      // The sun is what broke its nerve, so the sun is what strands it: out of
      // breath in daylight, a goblin does not keep trotting politely away, it
      // stops where it is and hunkers, head down, watching you come. Folklore
      // first — the thing that will not fight at noon hides from noon — but the
      // point of it is that daylight goblins become AVOIDABLE rather than
      // UNREACHABLE. You still cannot run one down in the open; you can run it
      // out of breath and then walk up to it.
      //
      // At night it drops to a trot instead, which is the rest of the file's
      // idiom, and its morale is climbing the whole time — so a night pack
      // still rallies and comes back at you rather than being farmed.
      const daylit = darkness(this.world?.sunAltitude ?? 90) < WILDLIFE.nightThreshold;
      if (blown && daylit) {
        this.goneToGround = true;
        this.setState(ALERT);
        this.targetSpeed = 0;
        this.headDown = damp(this.headDown, 1, 3, dt);
        this.faceToward(tx, tz, dt, this.species.turnRate);
        return;
      }
      this.goneToGround = false;

      this.setState(FLEE);
      this.targetSpeed = blown ? sp.trot : sp.flee;
      // Away from you, but biased toward where the rest of the pack is, so a
      // routed pack balls up somewhere in the dark instead of scattering to
      // the four winds and never being a pack again.
      let rx = this.position.x - tx;
      let rz = this.position.z - tz;
      if (this.packCentre) {
        const gx = this.packCentre.x - this.position.x;
        const gz = this.packCentre.z - this.position.z;
        const gl = Math.hypot(gx, gz) || 1;
        const rl = Math.hypot(rx, rz) || 1;
        rx = (rx / rl) * (1 - M.rallyPull) + (gx / gl) * M.rallyPull;
        rz = (rz / rl) * (1 - M.rallyPull) + (gz / gl) * M.rallyPull;
      }
      this.steerTo(this.position.x + rx * 10, this.position.z + rz * 10, dt, 4);
      return;
    }

    // Rallied. It gets its breath back with its nerve, so a pack you let
    // regroup comes at you fresh — and a routed one you keep pressure on does
    // not, which is the difference the chase is supposed to turn on.
    this.routing = false;
    this.goneToGround = false;

    // ── hasn't noticed you ── prowl, in a loose group.
    if (this.awareness < S.alertAt) {
      if (this.state !== WANDER && this.state !== GRAZE) this.setState(WANDER);
      this.targetSpeed = sp.walk;
      if (!this.wanderTarget || this.stateTime > 11) {
        this.wanderTarget = null;
        for (let attempt = 0; attempt < 8; attempt++) {
          const a = this.rand() * Math.PI * 2;
          const r = 8 + this.rand() * 20;
          const px = (this.packCentre?.x ?? this.home.x) + Math.cos(a) * r;
          const pz = (this.packCentre?.z ?? this.home.z) + Math.sin(a) * r;
          if (this.passable(px, pz)) {
            this.wanderTarget = new THREE.Vector3(px, 0, pz);
            break;
          }
        }
        this.stateTime = 0;
      }
      if (this.wanderTarget) this.steerTo(this.wanderTarget.x, this.wanderTarget.z, dt);
      return;
    }

    // ── it has you ── how close it is willing to get is pure morale.
    const committed = this.morale >= M.commitAt;
    const want = committed ? A.attackRange * 0.75 : M.hesitateRange;

    // Approach on its own arc rather than straight down your sight line.
    const [gx, gz] = this.ringPoint(tx, tz, want, committed ? M.flankSpread : M.circleSpread);

    if (committed && dist <= A.attackRange) {
      this.setState(ATTACK);
      this.targetSpeed = 0;
      this.faceToward(tx, tz, dt, this.species.turnRate);
      if (this.attackCooldown === 0) {
        this.attackCooldown = A.attackInterval;
        this.pendingAttack = true; // consumed by the manager
      }
      return;
    }

    if (committed) {
      this.setState(CHARGE);
      this.targetSpeed = sp.charge ?? sp.trot;
      this.steerTo(gx, gz, dt, this.species.turnRate);
      return;
    }

    // Wavering: hold the ring. Circling rather than standing, because a pack
    // of statues reads as a bug and a pack that paces reads as a threat.
    this.setState(ALERT);
    const ring = Math.abs(dist - M.hesitateRange);
    this.targetSpeed = ring > 3 ? sp.trot : sp.walk * M.circlePace;
    this.steerTo(gx, gz, dt, this.species.turnRate);
  }

  /**
   * Where on the ring around (tx, tz) this creature is heading.
   *
   * Built RADIALLY — the creature's own current bearing from the target, held
   * at radius `want`, plus a tangential step so it orbits rather than parks.
   *
   * The obvious version, "pick an angle from my id and aim at that point on
   * the circle", spirals. Aiming at a point elsewhere on a circle means
   * travelling a CHORD, which ends up inside it; do that every frame and the
   * ring closes. Measured: a wavering pack meant to hold 13 m crept in to 7.8
   * and was still descending — so the pack that was supposed to hesitate just
   * outside your reach walked politely into it instead.
   *
   * Anchoring on the creature's own bearing fixes it and costs nothing, since
   * a scattered pack already has scattered bearings — which is the fan-out the
   * angular version was trying to produce in the first place. The tangential
   * step is what keeps them moving, because a ring of statues reads as a bug
   * and a ring that paces reads as a threat.
   */
  ringPoint(tx, tz, want, spread) {
    let bx = this.position.x - tx;
    let bz = this.position.z - tz;
    const bl = Math.hypot(bx, bz);
    if (bl < 1e-3) {
      // Standing on top of the target — any direction will do, but it must be
      // a STABLE one, or it jitters. Derived from the id.
      const a = (((this.id * 2654435761) >>> 0) % 1000) / 1000 * Math.PI * 2;
      bx = Math.sin(a);
      bz = Math.cos(a);
    } else {
      bx /= bl;
      bz /= bl;
    }
    // Which way round it orbits, fixed per creature so the ring does not
    // reverse direction every time the arithmetic wobbles.
    const side = this.id % 2 === 0 ? 1 : -1;
    const step = want * spread * 0.18;
    return [tx + bx * want - bz * side * step, tz + bz * want + bx * side * step];
  }

  // ── prey: notice, freeze, bolt ─────────────────────────────────────────────

  thinkSkittish(dt) {
    const S = this.species.senses;
    const sp = this.species.speeds;

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

      // No DEAD case: think() is never reached once the animal is down.
    }
  }

  // ── predator: investigate, close, charge, maul ─────────────────────────────

  /**
   * The bear.
   *
   * The whole design rests on one number: its charge is faster than your
   * sprint, but only until its stamina runs out, after which it is slower than
   * you. So running is the wrong answer to the first rush and the right answer
   * to the second — you have to stand and shoot, then you get an exit.
   *
   * It also does not spook. Low `calmRate` means it keeps coming once it has
   * you, and being shot makes it press harder rather than scatter — right up
   * until it is badly hurt, when it finally breaks off.
   */
  thinkAggressive(dt) {
    const S = this.species.senses;
    const sp = this.species.speeds;
    const A = this.species.aggression;

    this.attackCooldown = Math.max(0, (this.attackCooldown ?? 0) - dt);
    this.headDown = damp(this.headDown, this.state === WANDER ? 0.6 : 0, 3, dt);

    this.enraged = Math.max(0, (this.enraged ?? 0) - dt);

    // ── the sun ── an override on everything below, for the one thing that
    // cannot bear it. Not "it takes damage in daylight" — it simply will not
    // be out in it. So the night has a hard edge, and holding out until the
    // sky greys is a genuine way to win a fight you could not otherwise win.
    //
    // It leaves DOWNHILL and away from you at once, because a troll heading for
    // its gorge while you stand on the ridge watching is a much better image
    // than one that evaporates.
    const sun = this.sunPressure;
    if (sun > 0) {
      this.retreating = true;
      this.charging = false;
      this.setState(FLEE);
      this.targetSpeed = lerp(this.species.speeds.trot, this.species.speeds.flee, sun);
      const away = this.downhillAway(this.lastKnownThreat.x, this.lastKnownThreat.z);
      this.steerTo(away[0], away[1], dt, this.species.turnRate * 1.4);
      return;
    }
    this.retreating = false;

    // Badly wounded AND still able to perceive the threat, it breaks off — so a
    // fight is winnable rather than merely survivable. It has to still sense
    // you, or a bear that escaped would keep bolting from an empty hillside.
    //
    // `brokenOff` is a latch with its OWN timer rather than a test on the
    // current state. Deriving it from `state` deadlocked: recovery set WANDER,
    // which reset stateTime, which let the wounded test immediately re-enter
    // FLEE and reset it again, so the timer could never reach its threshold and
    // the bear fled forever.
    if (!this.brokenOff && this.hp < this.maxHp * A.fleeBelow && this.awareness > 0.25) {
      this.brokenOff = true;
      this.charging = false;
      this.fleeTime = 0;
      this.stamina = this.species.stamina;
      this.setState(FLEE);
    }

    if (this.brokenOff) {
      this.fleeTime = (this.fleeTime ?? 0) + dt;
      this.stamina -= dt;
      this.targetSpeed = this.stamina > 0 ? sp.flee : sp.trot;
      const ax = this.position.x - this.lastKnownThreat.x;
      const az = this.position.z - this.lastKnownThreat.z;
      this.steerTo(this.position.x + ax, this.position.z + az, dt, 3.5);
      // Room bought and breath back: it stops running and goes back to being an
      // animal. Find it again and it will run again — but it is no longer stuck.
      const dist = this.distanceToPlayer ?? Infinity;
      if (this.fleeTime > 6 && (dist > 70 || this.awareness < 0.2)) {
        this.brokenOff = false;
        this.setState(WANDER);
      }
      return;
    }

    const dist = this.distanceToPlayer ?? Infinity;

    // Commitment is STICKY. Once it has decided you are worth chasing it does
    // not drop the idea the moment you jog out of earshot — it runs to where it
    // last had you, which is what makes it feel like being hunted rather than
    // like tripping a proximity trigger. It only breaks off if it genuinely
    // loses you for a good while, or you get a very long way clear.
    if (!this.charging && this.awareness >= A.chargeAt && dist < A.aggroRange) {
      this.charging = true;
      this.chargeTime = 0;
      this.giveUp = 0;
    }
    if (this.charging) {
      this.giveUp = this.awareness < 0.12 ? (this.giveUp ?? 0) + dt : 0;
      if (this.giveUp > A.loseInterest || dist > A.leash) {
        this.charging = false;
        this.chargeTime = 0;
      }
    }

    if (this.charging) {
      this.chargeTime = (this.chargeTime ?? 0) + dt;
      this.faceToward(this.lastKnownThreat.x, this.lastKnownThreat.z, dt, this.species.turnRate);

      if (dist <= A.attackRange) {
        this.setState(ATTACK);
        this.targetSpeed = 0;
        if (this.attackCooldown === 0) {
          this.attackCooldown = A.attackInterval;
          this.pendingAttack = true; // consumed by the manager
        }
      } else {
        this.setState(CHARGE);
        // Flat out, until the lungs give. Then it can no longer catch you —
        // unless it has just been shot, which buys it a few seconds of not
        // tiring at all. Hitting a bear and running is a bad plan.
        this.chargeSpent = this.chargeTime > A.chargeStamina && this.enraged <= 0;
        this.targetSpeed = this.chargeSpent ? A.chasePace : sp.charge;
      }
      return;
    }

    if (this.awareness >= S.alertAt) {
      // Heard or smelt something and is coming to look. At a trot, not a walk —
      // investigating at 1.9 m/s meant a running player simply left it behind
      // before it could ever make up its mind.
      this.setState(ALERT);
      this.targetSpeed = sp.trot;
      this.steerTo(this.lastKnownThreat.x, this.lastKnownThreat.z, dt);
      return;
    }

    // Foraging.
    if (this.state !== WANDER && this.state !== GRAZE) this.setState(WANDER);
    this.targetSpeed = sp.walk * 0.7;
    if (!this.wanderTarget || this.stateTime > 14) {
      this.wanderTarget = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        const a = this.rand() * Math.PI * 2;
        const r = 10 + this.rand() * 26;
        const tx = this.home.x + Math.cos(a) * r;
        const tz = this.home.z + Math.sin(a) * r;
        if (this.passable(tx, tz)) {
          this.wanderTarget = new THREE.Vector3(tx, 0, tz);
          break;
        }
      }
      this.stateTime = 0;
    }
    if (this.wanderTarget) this.steerTo(this.wanderTarget.x, this.wanderTarget.z, dt);
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

  /**
   * A point that is both away from (tx, tz) and downhill — where something
   * driven off by the light actually goes.
   *
   * Samples a fan of headings on the away side and scores each by how much
   * ground it loses, so it finds the gully rather than running blindly at a
   * cliff. Cheap: eleven height lookups, and only for creatures that flee the
   * sun at all.
   */
  downhillAway(tx, tz) {
    const ax = this.position.x - tx;
    const az = this.position.z - tz;
    const base = Math.atan2(ax, az);
    const REACH = 22;
    let bestX = this.position.x + Math.sin(base) * REACH;
    let bestZ = this.position.z + Math.cos(base) * REACH;
    let bestScore = -Infinity;
    for (let i = -5; i <= 5; i++) {
      const a = base + i * 0.24;
      const x = this.position.x + Math.sin(a) * REACH;
      const z = this.position.z + Math.cos(a) * REACH;
      if (!this.passable(x, z)) continue;
      // Losing height is good; deviating from straight-away is mildly bad.
      const drop = this.position.y - heightAt(x, z);
      const score = drop - Math.abs(i) * 0.35;
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestZ = z;
      }
    }
    return [bestX, bestZ];
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
      // Topple onto its side and lie there.
      //
      // The object's origin is at the feet, so rolling it 90 degrees swings the
      // whole body down through the ground plane. It has to be RAISED by
      // roughly the torso's half-width afterwards, or half the animal ends up
      // buried with its legs sticking out horizontally. (It used to be lowered,
      // which is exactly the wrong direction.)
      const fall = smoothstep(0, 0.8, this.deathTime);
      const settle = smoothstep(0.6, 2.2, this.deathTime);

      this.object.rotation.z = this.fallSide * lerp(0, Math.PI / 2, fall);
      this.object.rotation.x = lerp(0, this.fallTilt, fall);

      const ground = Math.max(heightAt(this.position.x, this.position.z), WATER_LEVEL - this.wadeMax);
      const lie = this.species.radius * this.scale * 0.72;
      // Rise as it rolls, then sink a few centimetres into the grass.
      this.object.position.y = ground + lie * fall - 0.07 * settle;

      // Legs collapse loosely rather than staying planted like table legs.
      for (let i = 0; i < p.legs.length; i++) {
        p.legs[i].rotation.x = damp(p.legs[i].rotation.x, this.deadLegs[i], 3.5, dt);
        p.legs[i].rotation.z = damp(p.legs[i].rotation.z, this.deadLegSplay[i], 3, dt);
      }
      // Head and neck go limp, thrown back the way a dropped animal's does.
      p.neckPivot.rotation.x = damp(p.neckPivot.rotation.x, -0.55, 2.6, dt);
      p.headPivot.rotation.x = damp(p.headPivot.rotation.x, 0.75, 2.6, dt);
      p.tailPivot.rotation.x = damp(p.tailPivot.rotation.x, 0, 3, dt);
      p.body.rotation.x = damp(p.body.rotation.x, 0, 4, dt);
      p.body.position.y = damp(p.body.position.y, this.restBodyY, 4, dt);
      return;
    }

    // Per-species animation shape. The gait code is shared; the numbers are
    // not, because a hunched biped and a stag do not move alike.
    const A = this.species.anim ?? ANIM_DEFAULTS;

    // Gait: stride frequency follows speed, so a walk and a bolt use the same
    // code and never look out of sync with the ground.
    const stride = this.speed > 0.05 ? this.speed * A.strideRate : 0;
    this.legPhase += stride * dt;
    const swing = clamp(this.speed / this.species.speeds.trot, 0, 1.5);
    for (let i = 0; i < p.legs.length; i++) {
      // Diagonal pairs for a quadruped. For a two-legged body this same rule
      // gives a plain left-right alternation, which is exactly right.
      const off = i === 0 || i === 3 ? 0 : Math.PI;
      p.legs[i].rotation.x = Math.sin(this.legPhase + off) * A.legSwing * swing;
    }

    // Arms, if this body has any. Counter-swung against the legs, the way
    // anything that walks upright does.
    if (p.arms) {
      for (let i = 0; i < p.arms.length; i++) {
        const off = i === 0 ? Math.PI : 0;
        p.arms[i].rotation.x = Math.sin(this.legPhase + off) * A.armSwing * swing;
      }
    }

    // Body rocks and lifts slightly at a gallop.
    //
    // The rest height is the one the BODY WAS BUILT AT, not a literal. It used
    // to be hard-coded to the deer's 0.86, so a bear — built at 1.02 — had its
    // torso yanked 16 cm down into its own legs on the first animated frame,
    // and then popped back up on death, since the death pose correctly used
    // restBodyY. Any new species would have inherited the same wrongness.
    const bound = this.speed > this.species.speeds.trot ? 1 : 0;
    p.body.position.y =
      this.restBodyY + Math.sin(this.legPhase * 2) * A.bodyBob * swing * (1 + bound);
    p.body.rotation.x = Math.sin(this.legPhase * 2) * A.bodyRock * swing;

    // Neck: down to graze, up and alert otherwise.
    p.neckPivot.rotation.x = lerp(A.neckUp, A.neckDown, this.headDown);
    p.headPivot.rotation.x = lerp(A.headUp, A.headDown, this.headDown);

    // Tail flicks — faster when nervous.
    const nerves = 1 + this.awareness * 4;
    p.tailPivot.rotation.x = Math.sin(this.legPhase * 1.5 + this.id) * 0.25 * nerves * A.tailFlick;

    // A predator rears as it swings. This is the tell that a blow is landing,
    // and it is the only reason you get a chance to back off.
    if (this.species.behaviour === 'aggressive') {
      const want = this.state === ATTACK ? 1 : 0;
      this.rear = damp(this.rear ?? 0, want, 6, dt);
      this.object.rotation.x = -this.rear * 0.5;
      if (this.rear > 0.01) {
        // Front paws come up with the chest.
        p.legs[0].rotation.x -= this.rear * 0.9;
        p.legs[1].rotation.x -= this.rear * 0.9;
      }
    }
  }

  update(dt, player, stealth, ctx = null) {
    if (ctx) this.world = ctx;
    if (this.state === DEAD) {
      // Advanced here, not in think() — think() is skipped for the dead, which
      // is why the death animation never used to play at all.
      this.deathTime += dt;
    } else {
      this.sense(dt, player, stealth);
      this.think(dt);
      // ── AND WHILE IT IS FLINCHING, IT DOES NOT COME ON ──
      //
      // After `think`, which is what chooses `targetSpeed`, and before `move`,
      // which is what spends it. Overriding here rather than inside `think`
      // keeps every reason a creature might want to move in one place and this
      // one exception plainly on top of it.
      //
      // It still turns, still hears, still wants you. It simply cannot close
      // the distance for a second and a half. See `stagger` in the registry.
      this.staggerCool = Math.max(0, (this.staggerCool ?? 0) - dt);
      if (this.staggered > 0) {
        this.staggered -= dt;
        this.targetSpeed = 0;
      }
      this.move(dt);
    }
    this.animate(dt);
  }

  /**
   * Is the sun high enough to drive this thing off?
   *
   * Returns 0 for anything that does not care, which is almost everything.
   * The one creature that does treats it as an override on all other reasoning:
   * you can be standing in front of it, bleeding, and it will still leave.
   */
  get sunPressure() {
    const S = this.species.sunlight;
    if (!S) return 0;
    const alt = this.world?.sunAltitude ?? 90;
    return clamp((alt - S.fleeAbove) / Math.max(1e-3, S.blindedAt - S.fleeAbove), 0, 1);
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

  /** Roll the death pose and drop. */
  die() {
    if (this.state === DEAD) return;
    this.setState(DEAD);
    this.dead = true;
    this.speed = 0;
    this.targetSpeed = 0;
    this.deathTime = 0;
    // Consumed by the manager on the next frame, which is what tells the rest
    // of the pack. Raised as a flag rather than calling into morale from here,
    // matching `alarmed` / `pendingAttack` / `hurt`: the creature reports what
    // happened to it and the manager decides what that means to anyone else.
    this.justDied = true;
    this.fallSide = this.rand() < 0.5 ? -1 : 1;
    this.fallTilt = (this.rand() - 0.5) * 0.4;
    // Front and back legs fold differently, and each one a little differently
    // again, so a carcass never looks like a toppled toy.
    this.deadLegs = this.parts.legs.map((_, i) =>
      (i < 2 ? 0.55 : -0.45) + (this.rand() - 0.5) * 0.5
    );
    this.deadLegSplay = this.parts.legs.map(() => (this.rand() - 0.5) * 0.55);
  }

  /**
   * @param {number} amount
   * @param {object} zone       hit zone from the species table
   * @param {THREE.Vector3} [from]  roughly where the damage came from, so the
   *                                animal can orient on its attacker
   */
  applyDamage(amount, zone, from = null) {
    // ── not our animal to kill ──
    // On a connected client this body is a mirror of one on the server, and the
    // server is already running this same shot from the same intent. Letting
    // the local copy take the damage too is how you get an animal that dies on
    // your screen, stays alive on everyone else's, and then stands back up when
    // the next snapshot arrives. One guard here covers arrows, the axe and the
    // pet, because all three come through this door.
    // The zone still comes back, so "hit — shoulder" stays true: the arrow did
    // strike there. Only what it COST is withheld, because we do not know yet.
    if (this.remote) return { killed: false, damage: 0, zone: zone?.name, remote: true };
    if (this.state === DEAD) return { killed: false, damage: 0 };
    const dealt = amount * (zone?.multiplier ?? 1);
    this.hp -= dealt;
    // Being hit is instantly and maximally alarming.
    this.awareness = 1;
    if (from) this.lastKnownThreat.copy(from);

    if (this.hp <= 0) {
      this.die();
      return { killed: true, damage: dealt, zone: zone?.name };
    }

    // What being shot MEANS depends on the animal. This used to unconditionally
    // set FLEE, which is deer logic — so a bear turned and ran the instant the
    // first arrow landed, which is the opposite of the point of a bear.
    if (this.species.behaviour === 'pack') {
      // A wounded goblin does not decide anything on its own — morale does,
      // and a wound is only a small term in it. So shooting one member of a
      // confident pack makes it angry, not cautious. You have to change the
      // ODDS, and the only way to do that is to put one of them down.
      this.hurt = true;
    } else if (this.species.behaviour === 'aggressive') {
      // ── A SOLID HIT MAKES IT FLINCH ──
      //
      // Only for a species that has a `stagger`, only for a hit that landed
      // properly, and only once per cooldown — so a stream of grazing shots
      // cannot pin it in place, and the answer to a troll is still one good
      // arrow rather than many bad ones. See the note on `stagger` in the
      // registry: this is what turns a footrace into a fight, and what makes
      // three archers meaningfully better than one.
      const st = this.species.stagger;
      if (st && dealt >= st.minDamage && (this.staggerCool ?? 0) <= 0) {
        this.staggered = st.seconds;
        this.staggerCool = st.cooldown;
      }
      this.charging = true;
      this.chargeTime = 0; // fresh legs: a wounded bear finds another gear
      this.giveUp = 0;
      this.enraged = 3.5; // and will not tire while it lasts
      this.hurt = true; // consumed by the manager for a pain roar
    } else {
      this.setState(FLEE);
      this.stamina = this.species.stamina;
    }
    return { killed: false, damage: dealt, zone: zone?.name };
  }
}
