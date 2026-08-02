// ── otter.js ────────────────────────────────────────────────────────────────
// The otter.
//
// Every other creature in this world is a problem to be solved. This one is a
// relationship, and that changes what the code has to be good at: not senses
// and morale, but MEMORY OF HOW YOU HAVE TREATED IT.
//
// The design rests on one number — TRUST — and the rule that trust is the only
// thing that buys obedience. You cannot command an otter that does not know
// you. You feed it, you play with it, you build it somewhere dry to sleep and
// you keep it warm, and in exchange it starts doing what you ask. Neglect it
// and it forgets the tricks first and the commands second, and eventually it
// goes back to the water.
//
// In plain real-world terms: this is how animals actually work. A dog that is
// fed and exercised and warm will work for you; a dog that is not, will not,
// and no amount of shouting changes that. Making trust the gate on every verb
// means care is not a side quest, it is the mechanic.
//
// It also has to earn its place in a survival game, so it does two things you
// genuinely want:
//
//   * IT FIGHTS FOR YOU. Not a damage stat — an otter is 9 kg — but it goes
//     for whatever hurt you, and a goblin with an otter attached to it is a
//     goblin that is not swinging at you. Distraction is the mechanic.
//   * IT FINDS FOOD. An otter's nose is better than yours and it spends its
//     life looking for something to eat. Ask it, and it points — reliably,
//     which is the word you used and the word that matters: a hint you cannot
//     trust is worse than no hint.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OTTER, WATER_LEVEL } from '../config.js';
import { heightAt, makeRandom } from '../world/noise.js';
import { regionAt } from '../world/regions.js';
import { clamp, damp, lerp, smoothstep } from '../util/math.js';

// ── the body ────────────────────────────────────────────────────────────────

const FUR = new THREE.Color(0x5a4634);
const FUR_DARK = new THREE.Color(0x3b2d21);
const BELLY = new THREE.Color(0x9c8a70);
const NOSE = new THREE.Color(0x241c16);
const EYE = new THREE.Color(0x100d0a);

const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.72, // otters are sleek and a bit wet
  metalness: 0,
});

function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

let parts = null;
function otterGeometry() {
  if (parts) return parts;

  // Long, low and tubular — the whole silhouette of an otter is that it is
  // longer than it has any right to be.
  const torso = new THREE.CapsuleGeometry(0.15, 0.44, 4, 8);
  torso.rotateX(Math.PI / 2);
  const belly = new THREE.CapsuleGeometry(0.115, 0.4, 3, 7);
  belly.rotateX(Math.PI / 2);
  belly.translate(0, -0.055, 0.02);
  const body = mergeGeometries([paint(torso, FUR), paint(belly, BELLY)]);
  body.computeVertexNormals();

  const neckGeo = new THREE.CylinderGeometry(0.085, 0.11, 0.1, 7);
  const neck = mergeGeometries([paint(neckGeo, FUR)]);

  // Blunt head, big whiskery muzzle, small round ears.
  const skull = new THREE.IcosahedronGeometry(0.105, 1);
  skull.scale(1, 0.88, 1.05);
  const muzzle = new THREE.CapsuleGeometry(0.058, 0.05, 3, 6);
  muzzle.rotateX(Math.PI / 2);
  muzzle.translate(0, -0.03, 0.1);
  const nose = new THREE.IcosahedronGeometry(0.026, 0);
  nose.translate(0, -0.018, 0.152);
  const earL = new THREE.IcosahedronGeometry(0.028, 0);
  earL.scale(1, 1, 0.5);
  earL.translate(0.072, 0.062, -0.022);
  const earR = earL.clone();
  earR.translate(-0.144, 0, 0);
  const eyeL = new THREE.IcosahedronGeometry(0.021, 0);
  eyeL.translate(0.058, 0.028, 0.072);
  const eyeR = eyeL.clone();
  eyeR.translate(-0.116, 0, 0);
  const head = mergeGeometries([
    paint(skull, FUR),
    paint(muzzle, BELLY),
    paint(nose, NOSE),
    paint(earL, FUR_DARK),
    paint(earR, FUR_DARK),
    paint(eyeL, EYE),
    paint(eyeR, EYE),
  ]);
  head.computeVertexNormals();

  // Short legs with webbed feet, tucked well under.
  const legGeo = new THREE.CylinderGeometry(0.038, 0.032, 0.15, 5);
  legGeo.translate(0, -0.075, 0);
  const foot = new THREE.IcosahedronGeometry(0.05, 0);
  foot.scale(1.1, 0.4, 1.3);
  foot.translate(0, -0.15, 0.02);
  const leg = mergeGeometries([paint(legGeo, FUR), paint(foot, FUR_DARK)]);

  // The tail is a third of the animal and does most of the animating.
  const tailGeo = new THREE.CapsuleGeometry(0.062, 0.3, 3, 7);
  tailGeo.rotateX(Math.PI / 2);
  tailGeo.translate(0, 0, -0.16);
  const tail = mergeGeometries([paint(tailGeo, FUR)]);

  parts = { body, neck, head, leg, tail };
  return parts;
}

// ── states ──────────────────────────────────────────────────────────────────

export const WILD = 'wild'; // has not decided about you
export const FOLLOW = 'follow'; // trotting along at your heel
export const PLAY = 'play'; // rolling about, which is what it is for
export const EAT = 'eat';
export const SIT = 'sit';
export const LIE = 'lie';
export const SPEAK = 'speak';
export const POINT = 'point'; // frozen, nose out, showing you something
export const FETCH = 'fetch';
export const ATTACK = 'attack';
export const SLEEP = 'sleep';
export const SWIM = 'swim';

/**
 * The tricks, as data.
 *
 * Each one is learned separately and independently forgotten, which is the
 * whole reason training feels like training rather than like unlocking. `reps`
 * is how many successful repetitions it takes; `needs` is the trust floor
 * below which the otter will not even try, so the hard tricks are gated on the
 * relationship rather than on grinding.
 *
 * Adding "roll over" or "play dead" is a row here.
 */
export const TRICKS = {
  sit: {
    id: 'sit',
    name: 'Sit',
    cue: 'sit',
    state: SIT,
    reps: 3,
    needs: 0.25,
    holds: 6,
    blurb: 'sits up on its haunches',
  },
  lie: {
    id: 'lie',
    name: 'Lie Down',
    cue: 'lie down',
    state: LIE,
    reps: 4,
    needs: 0.35,
    holds: 8,
    blurb: 'flattens out on its belly',
  },
  speak: {
    id: 'speak',
    name: 'Speak',
    cue: 'speak',
    state: SPEAK,
    reps: 4,
    needs: 0.3,
    holds: 1.6,
    blurb: 'chirrups at you',
  },
  spin: {
    id: 'spin',
    name: 'Spin',
    cue: 'spin',
    state: PLAY,
    reps: 5,
    needs: 0.45,
    holds: 2.2,
    blurb: 'turns a tight circle on the spot',
  },
  // The two that are worth something. Both are gated high, because an animal
  // that will work for you is the reward for having looked after it.
  seek: {
    id: 'seek',
    name: 'Seek',
    cue: 'seek',
    state: POINT,
    reps: 6,
    needs: 0.55,
    holds: 9,
    blurb: 'casts about, then freezes pointing at food',
    useful: true,
  },
  guard: {
    id: 'guard',
    name: 'Guard',
    cue: 'guard',
    state: FOLLOW,
    reps: 6,
    needs: 0.6,
    holds: 0,
    blurb: 'goes for anything that hurts you',
    useful: true,
    // Not a pose — a standing disposition, toggled rather than performed.
    toggle: true,
  },
};

export const TRICK_IDS = Object.keys(TRICKS);

/**
 * One otter.
 *
 * Deliberately NOT a `Creature` from the registry. Every creature in that table
 * is built around an awareness meter that decides how afraid of you it is, and
 * this animal's whole model is the opposite: it is built around how much it
 * likes you. Forcing it into the species table would mean special-casing the
 * one field that matters, in a file whose entire virtue is that it has no
 * special cases.
 */
export class Otter {
  constructor(position, rand = makeRandom('otter')) {
    this.rand = rand;
    this.object = new THREE.Group();
    this.build();
    this.object.position.copy(position);

    this.state = WILD;
    this.stateTime = 0;
    this.yaw = rand() * Math.PI * 2;
    this.speed = 0;
    this.targetSpeed = 0;
    this.legPhase = 0;

    // ── the relationship ──
    this.trust = 0; // 0 wild .. 1 devoted
    this.fed = 0.5; // 0 starving .. 1 full
    this.played = 0.5; // 0 bored .. 1 content
    this.warmth = 0.7; // 0 freezing .. 1 snug
    this.name = null; // named when you first feed it

    // ── training ──
    // Progress toward each trick, and which are learned. Kept separate so a
    // trick can be half-learned, which is where the texture is.
    this.progress = Object.fromEntries(TRICK_IDS.map((id) => [id, 0]));
    this.learned = new Set();
    this.guarding = false;

    this.command = null; // what it is currently doing on your say-so
    this.commandTime = 0;
    this.pointingAt = null; // { x, z, what } when it has found something
    this.target = null; // a creature it is attacking
    this.home = null; // its holt, once you build one
    this.says = null; // one-frame flag: it made a noise
    this.mood = 'wary';
  }

  build() {
    const P = otterGeometry();
    const g = this.object;

    const body = new THREE.Mesh(P.body, material);
    body.position.y = 0.19;
    body.castShadow = true;
    g.add(body);

    const neckPivot = new THREE.Object3D();
    neckPivot.position.set(0, 0.22, 0.26);
    neckPivot.add(new THREE.Mesh(P.neck, material));

    const headPivot = new THREE.Object3D();
    headPivot.position.set(0, 0.07, 0.03);
    const head = new THREE.Mesh(P.head, material);
    head.castShadow = true;
    headPivot.add(head);
    neckPivot.add(headPivot);
    g.add(neckPivot);

    const legs = [];
    for (const [ix, iz] of [
      [0.11, 0.17],
      [-0.11, 0.17],
      [0.115, -0.14],
      [-0.115, -0.14],
    ]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(ix, 0.16, iz);
      const l = new THREE.Mesh(P.leg, material);
      l.castShadow = true;
      pivot.add(l);
      g.add(pivot);
      legs.push(pivot);
    }

    const tailPivot = new THREE.Object3D();
    tailPivot.position.set(0, 0.18, -0.24);
    const tail = new THREE.Mesh(P.tail, material);
    tail.castShadow = true;
    tailPivot.add(tail);
    g.add(tailPivot);

    this.parts = { body, neckPivot, headPivot, legs, tailPivot };
    g.scale.setScalar(0.95 + this.rand?.() * 0.12 || 1);
  }

  get position() {
    return this.object.position;
  }

  get tame() {
    return this.trust >= OTTER.tameAt;
  }

  /** How well it is being looked after, 0..1. Drives trust, and its mood. */
  get care() {
    return (this.fed + this.played + this.warmth) / 3;
  }

  // ── being looked after ────────────────────────────────────────────────────

  /**
   * Give it something to eat.
   *
   * The first feed is what tames it, which is the right shape: an otter does
   * not become yours because you won a fight, it becomes yours because you
   * turned up with a fish twice.
   */
  feed(itemId) {
    const value = OTTER.foods[itemId];
    if (!value) return { ok: false, why: 'it turns its nose up at that' };
    if (this.fed > 0.96) return { ok: false, why: 'it has eaten its fill' };

    this.fed = clamp(this.fed + value, 0, 1);
    this.trust = clamp(this.trust + OTTER.trustPerFeed, 0, 1);
    this.setState(EAT);
    this.says = 'chirr';
    const named = !this.name && this.trust >= OTTER.namesAt;
    if (named) this.name = pickName(this.rand);
    return { ok: true, named, name: this.name, trust: this.trust };
  }

  /** Play with it. Cheap, immediate, and the fastest way to be liked. */
  play() {
    if (this.played > 0.95) return { ok: false, why: 'it has had enough for now' };
    this.played = clamp(this.played + OTTER.playValue, 0, 1);
    this.trust = clamp(this.trust + OTTER.trustPerPlay, 0, 1);
    this.setState(PLAY);
    this.commandTime = OTTER.playSeconds;
    this.says = 'chatter';
    return { ok: true, trust: this.trust };
  }

  /** Tell it where its holt is, so it has somewhere to sleep and dry off. */
  setHome(x, z) {
    this.home = { x, z };
    this.trust = clamp(this.trust + OTTER.trustPerHome, 0, 1);
    this.says = 'chirr';
    return { ok: true, trust: this.trust };
  }

  // ── training ──────────────────────────────────────────────────────────────

  /**
   * Ask for a trick.
   *
   * Three outcomes, and all three are informative — which is the difference
   * between training and a button. It refuses (trust too low), it tries and
   * gets it (progress, and eventually it is learned), or it is already learned
   * and simply does it.
   */
  command_(trickId) {
    const trick = TRICKS[trickId];
    if (!trick) return { ok: false, why: 'it does not know what you mean' };
    if (!this.tame) return { ok: false, why: 'it does not know you well enough' };

    if (this.trust < trick.needs && !this.learned.has(trickId)) {
      return { ok: false, why: `it is not sure enough of you for that yet` };
    }
    // A hungry, bored, cold animal does not want to work, and saying so is
    // more useful than silently failing.
    if (this.care < OTTER.willWorkAbove && !this.learned.has(trickId)) {
      return { ok: false, why: `it is ${this.mood} — see to it first` };
    }

    if (trick.toggle) {
      this.guarding = !this.guarding;
      this.learn(trickId);
      return { ok: true, learned: this.learned.has(trickId), toggled: this.guarding, trick };
    }

    this.command = trickId;
    this.commandTime = trick.holds;
    this.setState(trick.state);
    if (trickId === 'speak') this.says = 'chirp';

    const before = this.learned.has(trickId);
    this.learn(trickId);
    return {
      ok: true,
      trick,
      learned: this.learned.has(trickId),
      justLearned: !before && this.learned.has(trickId),
      progress: this.progress[trickId] / trick.reps,
    };
  }

  learn(trickId) {
    const trick = TRICKS[trickId];
    if (this.learned.has(trickId)) return;
    this.progress[trickId] = Math.min(trick.reps, (this.progress[trickId] ?? 0) + 1);
    if (this.progress[trickId] >= trick.reps) {
      this.learned.add(trickId);
      this.trust = clamp(this.trust + OTTER.trustPerTrick, 0, 1);
      this.says = 'chatter';
    }
  }

  // ── the two useful things ─────────────────────────────────────────────────

  /**
   * Point at food.
   *
   * "Reliably" is the requirement and it is the whole design. A hint you cannot
   * trust is worse than no hint, so this does not roll dice: it asks the world
   * for the nearest food and points at it, every time. What varies is RANGE —
   * a better-trained, better-fed otter casts wider — and that is a much better
   * knob than accuracy, because it never makes the animal look stupid.
   */
  seek(world) {
    if (!this.learned.has('seek')) return { ok: false, why: 'it has not learned to seek' };
    const range = lerp(OTTER.seekRangeMin, OTTER.seekRangeMax, this.trust) * (0.6 + this.care * 0.4);
    const found = world.nearestFood?.(this.position.x, this.position.z, range);
    if (!found) {
      this.setState(POINT);
      this.commandTime = 2;
      this.pointingAt = null;
      this.says = 'chirr';
      return { ok: true, found: null, range };
    }
    this.pointingAt = found;
    this.setState(POINT);
    this.commandTime = TRICKS.seek.holds;
    this.says = 'chirp';
    return { ok: true, found, range };
  }

  /**
   * Something hurt the person it belongs to.
   *
   * It does not care how big the thing is, which is both correct for an otter
   * and the reason this is a distraction rather than a damage source: a goblin
   * with an otter attached to it is a goblin that is not swinging at you.
   */
  defend(attacker) {
    if (!this.guarding || !this.tame) return false;
    if (this.state === SLEEP && this.trust < 0.7) return false;
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
    this.move(dt, world);
    this.animate(dt);
  }

  /**
   * Needs fall, and trust follows care.
   *
   * The important asymmetry: trust rises slowly when it is well kept and falls
   * faster when it is not. An animal forgives, but not instantly, and being
   * able to undo a week of neglect with one fish would make the whole thing
   * decorative.
   */
  decay(dt, ctx) {
    const hours = dt / 60 / (ctx.dayMinutes ?? 24);
    this.fed = clamp(this.fed - OTTER.hungerPerHour * hours * 24, 0, 1);
    this.played = clamp(this.played - OTTER.borednessPerHour * hours * 24, 0, 1);

    // ── warmth ──
    // An otter is small and it gets wet, so it loses heat fast. A holt, a fire
    // or a cave all count; open ground on a cold night does not.
    const cold = smoothstep(12, -2, ctx.airC ?? 12);
    const sheltered = clamp(
      (this.nearHome() ? OTTER.homeWarmth : 0) +
        (ctx.nearFire ? OTTER.fireWarmth : 0) +
        (ctx.shelter ?? 0) * 0.5,
      0,
      1
    );
    const wet = this.inWater ? OTTER.wetChill : 0;
    const target = clamp(1 - cold * (1 - sheltered) - wet, 0, 1);
    this.warmth = damp(this.warmth, target, OTTER.warmthRate, dt);

    const care = this.care;
    const rate = care > OTTER.contentAbove ? OTTER.trustGain : -OTTER.trustLoss;
    this.trust = clamp(this.trust + rate * dt, 0, 1);

    // Forget the hardest thing first, and only once it is genuinely neglected.
    if (care < OTTER.forgetBelow && this.learned.size) {
      this.forgetTimer = (this.forgetTimer ?? 0) + dt;
      if (this.forgetTimer > OTTER.forgetSeconds) {
        this.forgetTimer = 0;
        const hardest = [...this.learned].sort((a, b) => TRICKS[b].needs - TRICKS[a].needs)[0];
        this.learned.delete(hardest);
        this.progress[hardest] = Math.floor(TRICKS[hardest].reps * 0.5);
        this.forgot = hardest;
      }
    } else {
      this.forgetTimer = 0;
    }

    this.mood =
      this.fed < 0.3 ? 'hungry'
      : this.warmth < 0.3 ? 'shivering'
      : this.played < 0.3 ? 'restless'
      : this.trust < OTTER.tameAt ? 'wary'
      : this.trust > 0.85 ? 'devoted'
      : 'content';
  }

  think(dt, owner, world, ctx) {
    // ── fighting ──
    if (this.state === ATTACK) {
      const t = this.target;
      const gone = !t || t.state === 'dead' || this.dist(t.position) > OTTER.giveUpRange;
      if (gone || this.stateTime > OTTER.attackSeconds) {
        this.target = null;
        this.setState(FOLLOW);
      } else {
        this.faceToward(t.position.x, t.position.z, dt, 6);
        this.targetSpeed = OTTER.runSpeed;
        if (this.dist(t.position) < OTTER.biteRange && this.stateTime % 1.1 < dt) {
          this.pendingBite = t; // consumed by the manager
          this.says = 'growl';
        }
        return;
      }
    }

    // ── a held command ──
    if (this.commandTime > 0 && this.state !== FOLLOW) {
      this.targetSpeed = this.state === PLAY ? OTTER.playSpeed : 0;
      if (this.state === POINT && this.pointingAt) {
        this.faceToward(this.pointingAt.x, this.pointingAt.z, dt, 3);
      }
      return;
    }
    if (this.commandTime <= 0 && this.command) {
      this.command = null;
      this.pointingAt = null;
    }

    // ── wild ──
    if (!this.tame) {
      // Keeps its distance, but curious rather than frightened — an otter that
      // bolted would never get tamed.
      const d = owner ? this.dist(owner.position) : Infinity;
      if (d < OTTER.shyRange) {
        this.faceToward(owner.position.x, owner.position.z, dt, 2);
        this.targetSpeed = d < OTTER.shyRange * 0.55 ? -OTTER.walkSpeed : 0;
      } else {
        this.wander(dt, world);
      }
      return;
    }

    // ── tame ──
    if (!owner) return this.wander(dt, world);
    const d = this.dist(owner.position);

    // Cold and tired and there is a holt: go home and sleep.
    if (this.home && (this.warmth < 0.35 || (ctx.night ?? 0) > 0.8) && d > OTTER.followRange) {
      const dh = Math.hypot(this.home.x - this.position.x, this.home.z - this.position.z);
      if (dh > 1.4) {
        this.setState(FOLLOW);
        this.faceToward(this.home.x, this.home.z, dt, 3);
        this.targetSpeed = OTTER.walkSpeed;
      } else {
        this.setState(SLEEP);
        this.targetSpeed = 0;
      }
      return;
    }

    if (d > OTTER.followRange) {
      this.setState(FOLLOW);
      this.faceToward(owner.position.x, owner.position.z, dt, 4.5);
      this.targetSpeed = d > OTTER.runRange ? OTTER.runSpeed : OTTER.walkSpeed;
    } else if (d < OTTER.followRange * 0.5) {
      // Close enough. Mill about, which is what otters do.
      this.targetSpeed = 0;
      if (this.stateTime > 3 + this.rand() * 4) {
        this.setState(this.played < 0.5 ? PLAY : FOLLOW);
        this.commandTime = this.played < 0.5 ? 2 : 0;
      }
    } else {
      this.targetSpeed = OTTER.walkSpeed * 0.5;
      this.faceToward(owner.position.x, owner.position.z, dt, 3);
    }
  }

  wander(dt, world) {
    if (!this.wanderTarget || this.stateTime > 8) {
      const a = this.rand() * Math.PI * 2;
      const r = 4 + this.rand() * 10;
      this.wanderTarget = {
        x: this.position.x + Math.cos(a) * r,
        z: this.position.z + Math.sin(a) * r,
      };
      this.stateTime = 0;
    }
    this.setState(FOLLOW);
    this.faceToward(this.wanderTarget.x, this.wanderTarget.z, dt, 2);
    this.targetSpeed = OTTER.walkSpeed * 0.6;
  }

  dist(p) {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  faceToward(x, z, dt, rate) {
    const want = Math.atan2(x - this.position.x, z - this.position.z);
    let diff = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.yaw += clamp(diff, -rate * dt, rate * dt);
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
  }

  move(dt) {
    this.speed = damp(this.speed, this.targetSpeed, 5, dt);
    if (Math.abs(this.speed) > 0.02) {
      const nx = this.position.x + Math.sin(this.yaw) * this.speed * dt;
      const nz = this.position.z + Math.cos(this.yaw) * this.speed * dt;
      this.position.x = nx;
      this.position.z = nz;
    }
    const ground = heightAt(this.position.x, this.position.z);
    // Otters swim. It floats rather than walking the lake bed, which is both
    // correct and the reason it can follow you across water you have to wade.
    this.inWater = ground < WATER_LEVEL - 0.15;
    this.position.y = this.inWater ? WATER_LEVEL - 0.08 : ground;
    if (this.inWater && this.state !== ATTACK) this.setState(SWIM);
    this.object.rotation.y = this.yaw;
  }

  animate(dt) {
    const p = this.parts;
    const A = OTTER.anim;

    // Gait. An otter bounds — the back arches — so the body bob is large and
    // the legs barely swing, which is the opposite of the deer.
    this.legPhase += Math.abs(this.speed) * A.strideRate * dt;
    const swing = clamp(Math.abs(this.speed) / OTTER.runSpeed, 0, 1.2);
    for (let i = 0; i < 4; i++) {
      const off = i === 0 || i === 3 ? 0 : Math.PI;
      p.legs[i].rotation.x = Math.sin(this.legPhase + off) * A.legSwing * swing;
    }

    const posed = { sit: 0, lie: 0, alert: 0 };
    if (this.state === SIT) posed.sit = 1;
    if (this.state === LIE) posed.lie = 1;
    if (this.state === POINT || this.state === ATTACK) posed.alert = 1;
    this.pose = this.pose ?? { sit: 0, lie: 0, alert: 0 };
    for (const k of Object.keys(posed)) this.pose[k] = damp(this.pose[k], posed[k], 7, dt);

    // Sitting up on the haunches: the front of the body lifts and the tail
    // becomes a prop, which is exactly what a real otter does.
    const rear = this.pose.sit;
    this.object.rotation.x = -rear * 0.55 + this.pose.lie * 0.05;
    p.body.position.y = 0.19 + Math.sin(this.legPhase * 2) * A.bodyBob * swing - this.pose.lie * 0.07;

    // Head: up and forward when pointing, down when lying.
    p.neckPivot.rotation.x = lerp(0.1, -0.35, this.pose.alert) + this.pose.lie * 0.5 - rear * 0.3;
    p.headPivot.rotation.x = this.pose.lie * 0.25;

    // The tail does the emoting. Fast when happy, still when pointing.
    const happy = this.trust * (this.state === PLAY ? 3 : 1);
    const wag = this.state === POINT ? 0 : Math.sin(this.legPhase * 1.4 + this.stateTime * 6) * (0.12 + happy * 0.3);
    p.tailPivot.rotation.y = wag;
    p.tailPivot.rotation.x = -0.1 + rear * 0.9 + this.pose.alert * 0.2;

    if (this.state === PLAY) {
      // Rolling about. Cheap, and it reads instantly as delight.
      this.object.rotation.z = Math.sin(this.stateTime * 7) * 0.6;
    } else {
      this.object.rotation.z = damp(this.object.rotation.z, 0, 6, dt);
    }
  }

  // ── persistence ───────────────────────────────────────────────────────────

  toJSON() {
    return {
      p: [
        Math.round(this.position.x * 100) / 100,
        Math.round(this.position.z * 100) / 100,
      ],
      n: this.name,
      t: Math.round(this.trust * 1000) / 1000,
      f: Math.round(this.fed * 1000) / 1000,
      y: Math.round(this.played * 1000) / 1000,
      w: Math.round(this.warmth * 1000) / 1000,
      l: [...this.learned],
      g: this.progress,
      h: this.home,
      d: this.guarding,
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
    this.guarding = !!d.d;
  }

  nearHome() {
    if (!this.home) return false;
    return Math.hypot(this.home.x - this.position.x, this.home.z - this.position.z) < OTTER.homeRadius;
  }

  get status() {
    return {
      name: this.name ?? 'an otter',
      mood: this.mood,
      trust: +this.trust.toFixed(2),
      tame: this.tame,
      fed: +this.fed.toFixed(2),
      played: +this.played.toFixed(2),
      warmth: +this.warmth.toFixed(2),
      state: this.state,
      guarding: this.guarding,
      knows: [...this.learned],
      learning: Object.entries(this.progress)
        .filter(([id, n]) => n > 0 && !this.learned.has(id))
        .map(([id, n]) => `${id} ${n}/${TRICKS[id].reps}`),
      home: this.home ? 'has a holt' : 'no holt',
    };
  }
}

// Otter names. Scots and Gaelic, like the place names, because it lives here.
const NAMES = [
  'Bramble', 'Sgadan', 'Tuppence', 'Moss', 'Rannoch', 'Sile', 'Pebble',
  'Dorlach', 'Whisker', 'Cuilean', 'Neap', 'Tarn',
];
const pickName = (rand) => NAMES[Math.floor(rand() * NAMES.length) % NAMES.length];
