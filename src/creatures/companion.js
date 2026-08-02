// ── companion.js ────────────────────────────────────────────────────────────
// One animal that belongs to somebody.
//
// The otter's machinery, generalised: trust bought with care, tricks learned by
// repetition and forgotten under neglect, a home, warmth, and a signature power
// that is the reward for having looked after it.
//
// What is generic and what is per-species is the whole design of this file.
// GENERIC: needing to be fed, played with, housed and kept warm; trust; the
// learning and forgetting of tricks; following you; fighting for you; saving.
// PER-SPECIES: the body, the speeds, what it eats, its voice, its trick list,
// and what its power actually does.
//
// Nothing is shared between trick LISTS — a parrot does not sit, it perches;
// a hippo does not spin, it wallows. Sharing a core would have been less work
// and would have made five of the six feel like the otter wearing a hat.

import * as THREE from 'three';
import { OTTER as CARE, WATER_LEVEL } from '../config.js';
import { heightAt, makeRandom } from '../world/noise.js';
import { getCompanion, PET_NAMES } from './companions.js';
import { clamp, damp, lerp, smoothstep } from '../util/math.js';

export const IDLE = 'idle';
export const FOLLOW = 'follow';
export const PLAY = 'play';
export const EAT = 'eat';
export const PERFORM = 'perform'; // doing a trick; the POSE says which
export const ATTACK = 'attack';
export const SLEEP = 'sleep';
export const SWIM = 'swim';

export class Companion {
  constructor(speciesId, position, rand = makeRandom('companion')) {
    this.species = getCompanion(speciesId);
    this.rand = rand;

    const built = this.species.build();
    this.object = built.group;
    this.parts = built.parts;
    this.object.position.copy(position);
    this.object.scale.setScalar(this.species.scale ?? 1);

    this.state = IDLE;
    this.pose = null; // which trick pose is showing
    this.stateTime = 0;
    this.yaw = rand() * Math.PI * 2;
    this.speed = 0;
    this.targetSpeed = 0;
    this.legPhase = 0;

    // ── the relationship ──
    this.trust = 0;
    this.fed = 0.5;
    this.played = 0.5;
    this.warmth = 0.7;
    this.name = null;

    this.progress = Object.fromEntries(Object.keys(this.species.tricks).map((id) => [id, 0]));
    this.learned = new Set();
    this.toggles = {}; // for tricks that are standing orders rather than poses

    this.commandTime = 0;
    this.target = null;
    this.home = null;
    this.says = null;
    this.mood = 'wary';
    this.poseWeights = {};
    this.spun = 0;
    // Whatever the last power produced, for the caller to act on.
    this.result = null;
  }

  get position() {
    return this.object.position;
  }
  get tame() {
    return this.trust >= CARE.tameAt;
  }
  get care() {
    return (this.fed + this.played + this.warmth) / 3;
  }
  get tricks() {
    return this.species.tricks;
  }
  get trickIds() {
    return Object.keys(this.species.tricks);
  }

  // ── being looked after ────────────────────────────────────────────────────

  feed(itemId) {
    const value = this.species.foods[itemId];
    if (!value) return { ok: false, why: 'it turns its nose up at that' };
    if (this.fed > 0.96) return { ok: false, why: 'it has eaten its fill' };
    this.fed = clamp(this.fed + value, 0, 1);
    this.trust = clamp(this.trust + CARE.trustPerFeed, 0, 1);
    this.setState(EAT);
    this.says = 'chirr';
    const named = !this.name && this.trust >= CARE.namesAt;
    if (named) this.name = PET_NAMES[Math.floor(this.rand() * PET_NAMES.length) % PET_NAMES.length];
    return { ok: true, named, name: this.name, trust: this.trust };
  }

  play() {
    if (this.played > 0.95) return { ok: false, why: 'it has had enough for now' };
    this.played = clamp(this.played + CARE.playValue, 0, 1);
    this.trust = clamp(this.trust + CARE.trustPerPlay, 0, 1);
    this.setState(PLAY);
    this.commandTime = CARE.playSeconds;
    this.says = 'chatter';
    return { ok: true, trust: this.trust };
  }

  setHome(x, z) {
    this.home = { x, z };
    this.trust = clamp(this.trust + CARE.trustPerHome, 0, 1);
    this.says = 'chirr';
    return { ok: true, trust: this.trust };
  }

  // ── asking it to do something ─────────────────────────────────────────────

  /**
   * Three outcomes, all informative: it refuses (and says why), it tries and
   * gets a little better, or it knows this one and simply does it. That is the
   * difference between training and a button.
   */
  ask(trickId) {
    const t = this.tricks[trickId];
    if (!t) return { ok: false, why: 'it does not know what you mean' };
    if (!this.tame) return { ok: false, why: 'it does not know you well enough' };
    const known = this.learned.has(trickId);
    if (!known && this.trust < t.needs) return { ok: false, why: 'it is not sure enough of you for that' };
    if (!known && this.care < CARE.willWorkAbove) return { ok: false, why: `it is ${this.mood} — see to it first` };

    const before = known;
    this.learn(trickId);

    if (t.toggle) {
      this.toggles[trickId] = !this.toggles[trickId];
      return { ok: true, trick: t, id: trickId, toggled: this.toggles[trickId], learned: this.learned.has(trickId) };
    }

    this.setState(PERFORM);
    this.pose = t.pose ?? null;
    this.commandTime = t.holds;
    this.spun = 0;
    if (t.pose === 'speak') this.says = this.species.voice ?? 'chirp';

    return {
      ok: true,
      trick: t,
      id: trickId,
      // Only a LEARNED trick actually does its job. A half-trained animal
      // performs the shape of it and nothing happens, which is the clearest
      // possible signal that repetition is the point.
      power: this.learned.has(trickId) ? t.power ?? null : null,
      learned: this.learned.has(trickId),
      justLearned: !before && this.learned.has(trickId),
      progress: this.progress[trickId] / t.reps,
    };
  }

  learn(trickId) {
    const t = this.tricks[trickId];
    if (this.learned.has(trickId)) return;
    this.progress[trickId] = Math.min(t.reps, (this.progress[trickId] ?? 0) + 1);
    if (this.progress[trickId] >= t.reps) {
      this.learned.add(trickId);
      this.trust = clamp(this.trust + CARE.trustPerTrick, 0, 1);
      this.says = 'chatter';
    }
  }

  /** Is a standing order (guard, ferry) currently on? */
  isOn(trickId) {
    return !!this.toggles[trickId];
  }

  defend(attacker) {
    if (!this.isOn('guard') || !this.tame) return false;
    this.target = attacker;
    this.setState(ATTACK);
    this.says = 'growl';
    return true;
  }

  // ── the tick ──────────────────────────────────────────────────────────────

  update(dt, owner, world, ctx) {
    this.stateTime += dt;
    this.commandTime = Math.max(0, this.commandTime - dt);
    this.says = null;
    this.decay(dt, ctx);
    this.think(dt, owner, world, ctx);
    this.move(dt);
    this.animate(dt);
  }

  decay(dt, ctx) {
    const hours = (dt / 60 / (ctx.dayMinutes ?? 24)) * 24;
    this.fed = clamp(this.fed - CARE.hungerPerHour * hours, 0, 1);
    this.played = clamp(this.played - CARE.borednessPerHour * hours, 0, 1);

    const cold = smoothstep(12, -2, ctx.airC ?? 12);
    const sheltered = clamp(
      (this.nearHome() ? CARE.homeWarmth : 0) + (ctx.nearFire ? CARE.fireWarmth : 0) + (ctx.shelter ?? 0) * 0.5,
      0, 1
    );
    // A swimmer is not chilled by being in the water; everything else is.
    const wet = this.inWater && !this.species.swims ? CARE.wetChill : 0;
    this.warmth = damp(this.warmth, clamp(1 - cold * (1 - sheltered) - wet, 0, 1), CARE.warmthRate, dt);

    this.trust = clamp(
      this.trust + (this.care > CARE.contentAbove ? CARE.trustGain : -CARE.trustLoss) * dt, 0, 1
    );

    if (this.care < CARE.forgetBelow && this.learned.size) {
      this.forgetTimer = (this.forgetTimer ?? 0) + dt;
      if (this.forgetTimer > CARE.forgetSeconds) {
        this.forgetTimer = 0;
        const hardest = [...this.learned].sort((a, b) => this.tricks[b].needs - this.tricks[a].needs)[0];
        this.learned.delete(hardest);
        this.progress[hardest] = Math.floor(this.tricks[hardest].reps * 0.5);
        this.forgot = hardest;
      }
    } else this.forgetTimer = 0;

    this.mood =
      this.fed < 0.3 ? 'hungry'
      : this.warmth < 0.3 ? 'shivering'
      : this.played < 0.3 ? 'restless'
      : this.trust < CARE.tameAt ? 'wary'
      : this.trust > 0.85 ? 'devoted'
      : 'content';
  }

  think(dt, owner, world, ctx) {
    const S = this.species;

    if (this.state === ATTACK) {
      const t = this.target;
      if (!t || t.state === 'dead' || this.dist(t.position) > CARE.giveUpRange || this.stateTime > CARE.attackSeconds) {
        this.target = null;
        this.setState(FOLLOW);
      } else {
        this.faceToward(t.position.x, t.position.z, dt, 6);
        this.targetSpeed = S.runSpeed;
        if (this.dist(t.position) < CARE.biteRange && this.stateTime % 1.1 < dt) {
          this.pendingBite = t;
          this.says = 'growl';
        }
        return;
      }
    }

    // ── performing ──
    if (this.commandTime > 0 && this.state === PERFORM) {
      this.targetSpeed = 0;
      if (this.pose === 'point' && this.pointingAt) {
        this.faceToward(this.pointingAt.x, this.pointingAt.z, dt, 3);
      }
      if (this.pose === 'speak') {
        this.chirpAt = (this.chirpAt ?? 0) - dt;
        if (this.chirpAt <= 0) {
          this.chirpAt = CARE.chirpEvery;
          this.says = S.voice ?? 'chirp';
        }
      }
      if (this.pose === 'roll') {
        this.spun += CARE.spinRate * dt;
        this.yaw += CARE.spinRate * dt;
      }
      return;
    }
    if (this.commandTime <= 0 && this.state === PERFORM) {
      this.setState(FOLLOW);
      this.pose = null;
      this.pointingAt = null;
    }

    if (!this.tame) {
      const d = owner ? this.dist(owner.position) : Infinity;
      if (d < CARE.shyRange) {
        this.faceToward(owner.position.x, owner.position.z, dt, 2);
        this.targetSpeed = d < CARE.shyRange * 0.55 ? -S.walkSpeed : 0;
      } else this.wander(dt);
      return;
    }

    if (!owner) return this.wander(dt);
    const d = this.dist(owner.position);

    if (this.home && (this.warmth < 0.35 || (ctx.night ?? 0) > 0.8) && d > CARE.followRange) {
      const dh = Math.hypot(this.home.x - this.position.x, this.home.z - this.position.z);
      if (dh > 1.4) {
        this.setState(FOLLOW);
        this.faceToward(this.home.x, this.home.z, dt, 3);
        this.targetSpeed = S.walkSpeed;
      } else {
        this.setState(SLEEP);
        this.targetSpeed = 0;
      }
      return;
    }

    if (d > CARE.followRange) {
      this.setState(FOLLOW);
      this.faceToward(owner.position.x, owner.position.z, dt, 4.5);
      this.targetSpeed = d > CARE.runRange ? S.runSpeed : S.walkSpeed;
    } else if (d < CARE.followRange * 0.5) {
      this.targetSpeed = 0;
      if (this.state !== IDLE) this.setState(IDLE);
    } else {
      this.targetSpeed = S.walkSpeed * 0.5;
      this.faceToward(owner.position.x, owner.position.z, dt, 3);
    }
  }

  wander(dt) {
    if (!this.wanderTarget || this.stateTime > 8) {
      const a = this.rand() * Math.PI * 2;
      const r = 4 + this.rand() * 10;
      this.wanderTarget = { x: this.position.x + Math.cos(a) * r, z: this.position.z + Math.sin(a) * r };
      this.stateTime = 0;
    }
    this.setState(FOLLOW);
    this.faceToward(this.wanderTarget.x, this.wanderTarget.z, dt, 2);
    this.targetSpeed = this.species.walkSpeed * 0.6;
  }

  dist(p) {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  faceToward(x, z, dt, rate) {
    const want = Math.atan2(x - this.position.x, z - this.position.z);
    const diff = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.yaw += clamp(diff, -rate * dt, rate * dt);
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
  }

  move(dt) {
    const S = this.species;
    this.speed = damp(this.speed, this.targetSpeed, 5, dt);
    if (Math.abs(this.speed) > 0.02) {
      this.position.x += Math.sin(this.yaw) * this.speed * dt;
      this.position.z += Math.cos(this.yaw) * this.speed * dt;
    }
    const ground = heightAt(this.position.x, this.position.z);
    this.inWater = ground < WATER_LEVEL - 0.15;

    if (S.flies) {
      // A bird rides above the ground rather than on it.
      this.position.y = Math.max(ground, WATER_LEVEL) + (S.hoverHeight ?? 1.6);
    } else if (this.inWater && S.swims) {
      this.position.y = WATER_LEVEL - (S.aquatic ? 0.35 : 0.08);
      if (this.state !== ATTACK && this.state !== PERFORM) this.setState(SWIM);
    } else {
      this.position.y = ground;
    }
    this.object.rotation.y = this.yaw;
  }

  /**
   * One animator, six animals, and per-trick poses on top.
   *
   * The poses are 0..1 weights that ease in and out, so nothing snaps and two
   * overlapping poses blend rather than fight. Adding a pose is a case here and
   * a string in the table — which is what let six animals have entirely
   * separate trick lists without six animators.
   */
  animate(dt) {
    const p = this.parts;
    const A = this.species.anim;
    const S = this.species;

    const stride = Math.abs(this.speed) * A.strideRate;
    this.legPhase += stride * dt;
    const swing = clamp(Math.abs(this.speed) / S.runSpeed, 0, 1.3);

    // A bird's "legs" are wings and flap constantly; a hopper's legs move
    // together; everything else alternates in diagonal pairs.
    for (let i = 0; i < p.legs.length; i++) {
      if (S.flies) {
        p.legs[i].rotation.z = (i % 2 ? -1 : 1) * (0.5 + Math.sin(this.legPhase) * 0.8);
      } else if (S.hops) {
        p.legs[i].rotation.x = Math.max(0, Math.sin(this.legPhase)) * A.legSwing * swing;
      } else if (p.legs.length === 8) {
        // An octopus. Each arm on its own phase, so it ripples.
        p.legs[i].rotation.x = Math.sin(this.legPhase + i * 0.8) * A.legSwing * (0.4 + swing);
      } else {
        const off = i === 0 || i === 3 ? 0 : Math.PI;
        p.legs[i].rotation.x = Math.sin(this.legPhase + off) * A.legSwing * swing;
      }
    }
    if (p.arms) {
      for (let i = 0; i < p.arms.length; i++) {
        p.arms[i].rotation.x = Math.sin(this.legPhase + (i ? 0 : Math.PI)) * 0.3 * swing;
      }
    }

    // A hopper leaves the ground.
    const hop = S.hops ? Math.max(0, Math.sin(this.legPhase)) * 0.28 * swing : 0;

    // ── poses ──
    const w = this.poseWeights;
    const want = { sit: 0, lie: 0, point: 0, speak: 0, roll: 0, lunge: 0, perch: 0, soar: 0, sleep: 0 };
    if (this.state === PERFORM && this.pose) want[this.pose] = 1;
    if (this.state === SLEEP) want.lie = want.sleep = 1;
    if (this.state === ATTACK) want.lunge = 1;
    for (const k of Object.keys(want)) w[k] = damp(w[k] ?? 0, want[k], 8, dt);

    const rear = w.sit + w.perch * 0.4;
    const flat = w.lie;

    this.object.rotation.x = -rear * 0.6 + flat * 0.08 - w.soar * 0.5 + w.lunge * 0.25;
    this.object.position.y += hop;

    p.body.position.y = (p.body.userData.restY ??= p.body.position.y) +
      Math.sin(this.legPhase * 2) * A.bodyBob * swing - flat * 0.1;

    for (let i = 0; i < p.legs.length; i++) {
      const front = i < p.legs.length / 2;
      const side = i % 2 === 0 ? 1 : -1;
      if (front) p.legs[i].rotation.x -= rear * 1.1;
      p.legs[i].rotation.z = (p.legs[i].rotation.z ?? 0) * (S.flies ? 1 : 1) + flat * 0.7 * side;
      if (flat > 0.05 && !S.flies) p.legs[i].rotation.x = lerp(p.legs[i].rotation.x, front ? 0.5 : -0.45, flat);
      // Lunging throws the front of the body forward.
      if (front) p.legs[i].rotation.x -= w.lunge * 0.8;
    }

    const chirp = w.speak * Math.sin(this.stateTime * 19) * 0.22;
    p.neckPivot.rotation.x =
      lerp(0.1, -0.35, w.point) + flat * 0.55 - rear * 0.45 - w.speak * 0.3 + chirp + w.soar * 0.4;
    p.headPivot.rotation.x = flat * 0.3 - w.speak * 0.25 + chirp * 0.6;
    p.headPivot.rotation.y = w.sleep * 0.7;

    const happy = this.trust * (this.state === PLAY ? 3 : 1);
    const still = clamp(w.point + w.sleep, 0, 1);
    p.tailPivot.rotation.y =
      (1 - still) * Math.sin(this.legPhase * 1.4 + this.stateTime * 6) * (0.12 + happy * 0.3) + w.sleep * 1.5;
    p.tailPivot.rotation.x = -0.1 + rear * 1.0 + w.point * 0.25 - flat * 0.15;

    if (w.roll > 0.02) this.object.rotation.z = -0.28 * w.roll;
    else if (this.state === PLAY) this.object.rotation.z = Math.sin(this.stateTime * 7) * 0.6;
    else this.object.rotation.z = damp(this.object.rotation.z, 0, 6, dt);
  }

  nearHome() {
    return this.home && Math.hypot(this.home.x - this.position.x, this.home.z - this.position.z) < CARE.homeRadius;
  }

  // ── persistence ───────────────────────────────────────────────────────────

  toJSON() {
    return {
      k: this.species.id,
      p: [Math.round(this.position.x * 100) / 100, Math.round(this.position.z * 100) / 100],
      n: this.name,
      t: Math.round(this.trust * 1000) / 1000,
      f: Math.round(this.fed * 1000) / 1000,
      y: Math.round(this.played * 1000) / 1000,
      w: Math.round(this.warmth * 1000) / 1000,
      l: [...this.learned],
      g: this.progress,
      h: this.home,
      o: this.toggles,
    };
  }

  fromJSON(d) {
    if (!d) return;
    if (d.p) this.position.set(d.p[0], heightAt(d.p[0], d.p[1]), d.p[1]);
    this.name = d.n ?? null;
    this.trust = d.t ?? 0;
    this.fed = d.f ?? 0.5;
    this.played = d.y ?? 0.5;
    this.warmth = d.w ?? 0.7;
    this.learned = new Set(d.l ?? []);
    this.progress = { ...this.progress, ...(d.g ?? {}) };
    this.home = d.h ?? null;
    this.toggles = d.o ?? {};
  }

  get status() {
    return {
      kind: this.species.name,
      name: this.name ?? `a ${this.species.name.toLowerCase()}`,
      helps: this.species.helps,
      mood: this.mood,
      trust: +this.trust.toFixed(2),
      tame: this.tame,
      fed: +this.fed.toFixed(2),
      played: +this.played.toFixed(2),
      warmth: +this.warmth.toFixed(2),
      state: this.state,
      pose: this.pose,
      knows: [...this.learned],
      learning: Object.entries(this.progress)
        .filter(([id, n]) => n > 0 && !this.learned.has(id))
        .map(([id, n]) => `${id} ${n}/${this.tricks[id].reps}`),
      standingOrders: Object.entries(this.toggles).filter(([, v]) => v).map(([k]) => k),
      home: this.home ? 'has a home' : 'no home',
    };
  }
}
