// ── projectiles.js ──────────────────────────────────────────────────────────
// Ballistic flight, collision and embedding, for every projectile in the game.
//
// The physics, and why it looks right:
//
//  * Arrows get their own gravity, not the player's. The player's 26 m/s² makes
//    jumping feel snappy; an arrow needs to fall like an arrow.
//  * Drag is quadratic (a = -k|v|v), so the arc is NOT a symmetric parabola —
//    it flattens on the way out and steepens on the way down. That asymmetry is
//    most of what makes a shot read as real.
//  * The arrow is rotated to face its own velocity every frame, so it visibly
//    noses over as it descends. This is the single strongest visual cue of
//    archery, and it is free.
//  * Fixed 1/240 s substeps with segment collision, so a 62 m/s arrow (26 cm
//    per tick) cannot tunnel through a tree trunk.
//
// One InstancedMesh draws every arrow, in flight and embedded, in one call.

import * as THREE from 'three';
import { ARROW, LAKE, WATER_LEVEL } from '../config.js';
import { heightAt } from './noise.js';
import { ITEMS } from '../items/registry.js';
import { itemMaterial } from '../items/registry.js';

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const _next = new THREE.Vector3();
const _probe = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _from = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _hit = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), tag: null };

// Shared result of `sweep`, and the scratch the aim preview flies through.
const _sweepNormal = new THREE.Vector3();
const _sweep = { t: 0, surface: null, creature: null, player: null, normal: null };
const _predPos = new THREE.Vector3();
const _predVel = new THREE.Vector3();
const _predNext = new THREE.Vector3();
const _prediction = {
  hit: false,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  hasNormal: false,
  surface: null,
  creature: null,
  player: null,
  distance: 0,
  time: 0,
};

// The preview integrates at the arrow's OWN substep, so it is the same
// computation as the shot: predicted impact then agrees with a real arrow to
// 1–2 cm, against 0–18 cm at 1/120. It costs 0.19 ms of a 16.7 ms frame and
// only runs while you hold a draw.
//
// Measuring this is a trap worth flagging. Comparing the prediction to a
// landed arrow's `pos` shows a stubborn 0.160 m error at every range and every
// substep — which is not error at all, it is `ARROW.embedDepth`: a landed
// arrow is pushed 16 cm into the surface along its flight. Compare against the
// impact point, not the resting shaft.
const PREDICT_STEP = ARROW.substep;
// Long enough that a lofted shot still gets a mark. At 1.6 s a 15° loft was
// still in the air at the cap, so the mark vanished exactly when the player
// most needed it — measured 104 m predicted against a 166 m arrow. The whole
// preview costs 0.12 ms of a 16.7 ms frame and only runs while you hold a
// draw, so the honest range is worth far more than the cycles.
const PREDICT_MAX_TIME = 3.0;

/**
 * Projectile types. A crossbow bolt or a sling stone is a new entry here —
 * heavier, faster, different drag, maybe `onLand: 'shatter'`.
 */
const TYPES = {
  arrow: {
    geometry: () => ITEMS.arrow.geometry(),
    gravity: ARROW.gravity,
    drag: ARROW.drag,
    damage: ARROW.damage,
    refSpeed: ARROW.refSpeed,
    maxFlight: ARROW.maxFlightTime,
    embed: ARROW.embedDepth,
    onLand: 'stick',
    recover: 'arrow', // item id you get back when you pick it up
    maxInWorld: ARROW.maxInWorld,
  },
};

let nextId = 1;

export class Projectiles {
  /**
   * @param {THREE.Scene} scene
   * @param {object} deps { colliders, onLanded, onRemoved, audio, listener }
   */
  constructor(scene, deps) {
    this.deps = deps;
    this.items = [];
    this.capacity = ARROW.maxInWorld + 32;

    this.mesh = new THREE.InstancedMesh(TYPES.arrow.geometry(), itemMaterial, this.capacity);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  /**
   * @param {string|number|null} ownerId  who loosed it, so it cannot hit them.
   *   Without this an arrow strikes its own archer on the first frame, because
   *   it spawns 0.55 m in front of a capsule 0.4 m wide.
   */
  spawn(typeId, origin, velocity, ownerId = null) {
    const type = TYPES[typeId];
    if (!type) return null;
    const p = {
      id: nextId++,
      typeId,
      type,
      ownerId,
      pos: origin.clone(),
      vel: velocity.clone(),
      quat: new THREE.Quaternion(),
      flight: 0,
      landed: false,
      landedAt: 0,
      surface: null,
      // Kept so a shot that ends in the dirt can say HOW FAR it got. A bare
      // "you missed" is nearly useless for learning a bow; "into the slope at
      // 21 m, and you were aiming at something 30 m away" is a lesson.
      origin: origin.clone(),
    };
    this.aim(p);
    this.items.push(p);
    this.enforceLimit(type);
    return p;
  }

  /** Point the projectile along its own velocity. */
  aim(p) {
    if (p.vel.lengthSq() < 1e-6) return;
    _dir.copy(p.vel).normalize();
    p.quat.setFromUnitVectors(Z_AXIS, _dir);
  }

  /** Keep the number of embedded projectiles bounded — oldest goes first. */
  enforceLimit(type) {
    let landed = 0;
    for (const p of this.items) if (p.landed && p.type === type) landed++;
    while (landed > type.maxInWorld) {
      const i = this.items.findIndex((p) => p.landed && p.type === type);
      if (i < 0) break;
      this.deps.onRemoved?.(this.items[i]);
      this.items.splice(i, 1);
      landed--;
    }
  }

  /**
   * Put a previously-landed projectile back exactly where it was. Used when
   * loading a save; skips all flight and collision and registers it as
   * recoverable so it can be picked up again.
   */
  restoreLanded(typeId, pos, quat, surface = 'ground') {
    const type = TYPES[typeId];
    if (!type) return null;
    const p = {
      id: nextId++,
      typeId,
      type,
      pos: new THREE.Vector3(pos[0], pos[1], pos[2]),
      vel: new THREE.Vector3(),
      quat: new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]),
      flight: 0,
      landed: true,
      landedAt: 0,
      surface,
      normal: null,
    };
    this.items.push(p);
    if (type.recover) this.deps.onLanded?.(p);
    this.enforceLimit(type);
    return p;
  }

  removeById(id) {
    const i = this.items.findIndex((p) => p.id === id);
    if (i >= 0) this.items.splice(i, 1);
  }

  update(dt) {
    const step = ARROW.substep;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      if (p.landed) continue;

      let left = Math.min(dt, 0.1);
      let dead = false;
      while (left > 0 && !dead) {
        const h = Math.min(step, left);
        left -= h;
        p.flight += h;
        if (p.flight > p.type.maxFlight) {
          dead = true;
          break;
        }
        dead = this.advance(p, h);
      }
      if (dead && !p.landed) {
        this.deps.onRemoved?.(p);
        this.items.splice(i, 1);
      }
    }
    this.render();
  }

  /**
   * The nearest thing the segment from→to strikes, or null for clear air.
   *
   * A PURE QUERY — no damage, no audio, no state change. That is the whole
   * point of it being separate: the aim preview (`predict`) walks the very same
   * code the arrow flies through, so a previewed shot cannot drift from the
   * real one. Duplicating this logic for the preview would have been the
   * obvious shortcut and it would have been wrong within a week.
   *
   * Returns a shared record — read it before calling `sweep` again.
   */
  sweep(from, to, ownerId) {
    let bestT = Infinity;
    let surface = null;
    let normal = null;

    const tTerrain = this.terrainT(from, to);
    if (tTerrain !== null && tTerrain < bestT) {
      bestT = tTerrain;
      surface = 'ground';
    }

    const tWater = this.waterT(from, to);
    if (tWater !== null && tWater < bestT) {
      bestT = tWater;
      surface = 'water';
    }

    // Several fields: the scatter's rebuilds itself every 55 m of travel and
    // would wipe the landmarks if they shared one, so they stay separate.
    const fields = this.deps.colliders;
    if (fields) {
      for (let f = 0; f < fields.length; f++) {
        const field = fields[f];
        if (!field || field.list.length === 0) continue;
        const hit = field.segmentHit(from, to, _hit);
        if (hit && hit.t < bestT) {
          bestT = hit.t;
          surface = hit.tag ?? 'solid';
          // Copy, don't alias: _hit is reused by the next field's query.
          _normal.copy(_hit.normal);
          normal = _normal;
        }
      }
    }

    // Living things, tested last so a tree between you and the deer wins.
    let struck = null;
    let struckPlayer = null;
    const wildlife = this.deps.wildlife;
    if (wildlife) {
      const ch = wildlife.hitTest(from, to);
      if (ch && ch.t < bestT) {
        bestT = ch.t;
        surface = 'flesh';
        struck = ch.creature;
        normal = null;
      }
    }
    // ── and people ──
    // There was no player test here at all. Arrows passed through everybody,
    // always, at any range, in any country — reported as "the arrow goes
    // directly through your character model". It looked like the strangeness
    // gate refusing damage, and it was not: the shot never reached that check
    // because nothing ever noticed it had hit a person.
    const hitPlayer = this.deps.playerHitTest;
    if (hitPlayer) {
      const ph = hitPlayer(from, to, ownerId);
      if (ph && ph.t < bestT) {
        bestT = ph.t;
        surface = 'flesh';
        struck = null;
        struckPlayer = ph.player;
        normal = null;
      }
    }

    if (bestT === Infinity) return null;

    _sweep.t = bestT;
    _sweep.surface = surface;
    _sweep.creature = struck;
    _sweep.player = struckPlayer;
    _sweep.normal = normal ? _sweepNormal.copy(normal) : null;
    return _sweep;
  }

  /**
   * Where a shot loosed right now would actually end up, without loosing it.
   *
   * Fired for the aim mark while the bow is drawn. Integrates with the same
   * drag/gravity as `advance` and collides through the same `sweep`, at a
   * coarser substep because it is a preview and it runs every frame.
   *
   * Read-only with respect to the world: it never touches `this.items`.
   */
  predict(typeId, origin, velocity, ownerId = null) {
    const type = TYPES[typeId];
    if (!type) return null;

    const pos = _predPos.copy(origin);
    const vel = _predVel.copy(velocity);
    const step = PREDICT_STEP;
    let t = 0;

    while (t < PREDICT_MAX_TIME) {
      const speed = vel.length();
      if (speed > 0) vel.addScaledVector(vel, -type.drag * speed * step);
      vel.y -= type.gravity * step;
      _predNext.copy(pos).addScaledVector(vel, step);

      const hit = this.sweep(pos, _predNext, ownerId);
      if (hit) {
        _prediction.point.lerpVectors(pos, _predNext, hit.t);
        _prediction.surface = hit.surface;
        _prediction.creature = hit.creature;
        _prediction.player = hit.player;
        if (hit.normal) {
          _prediction.normal.copy(hit.normal);
          _prediction.hasNormal = true;
        } else {
          _prediction.hasNormal = false;
        }
        _prediction.hit = true;
        _prediction.time = t;
        _prediction.distance = origin.distanceTo(_prediction.point);
        return _prediction;
      }

      pos.copy(_predNext);
      t += step;
    }

    // Still flying at the horizon — nothing to mark.
    _prediction.hit = false;
    _prediction.surface = null;
    _prediction.creature = null;
    _prediction.player = null;
    _prediction.hasNormal = false;
    _prediction.point.copy(pos);
    _prediction.time = t;
    _prediction.distance = origin.distanceTo(pos);
    return _prediction;
  }

  /** One substep. Returns true if the projectile should be destroyed. */
  advance(p, dt) {
    const { vel, pos, type } = p;

    // Quadratic drag, then gravity.
    const speed = vel.length();
    if (speed > 0) {
      const k = type.drag * speed * dt;
      vel.addScaledVector(vel, -k);
    }
    vel.y -= type.gravity * dt;

    _next.copy(pos).addScaledVector(vel, dt);
    this.aim(p);

    const swept = this.sweep(pos, _next, p.ownerId);

    if (!swept) {
      pos.copy(_next);
      return false;
    }

    const bestT = swept.t;
    const surface = swept.surface;
    const struck = swept.creature;
    const struckPlayer = swept.player;
    const normal = swept.normal;

    if (struckPlayer) {
      _probe.lerpVectors(pos, _next, bestT);
      const speed = vel.length();
      const base = (type.damage ?? 0) * (speed / (type.refSpeed ?? speed));
      // The arrow STOPS either way. Whether it hurts is somebody else's rule —
      // PvP is gated on strangeness — but a shaft that sails through a person
      // because the rules say you cannot fight here is indistinguishable from a
      // bug, and was reported as one.
      this.deps.onPlayerHit?.(struckPlayer, base, _probe, p.ownerId);
      this.deps.audio?.impact?.('flesh', _probe);
      return true;
    }

    if (struck) {
      _probe.lerpVectors(pos, _next, bestT);
      // Damage falls off with impact speed, so a spent arrow only wounds.
      const speed = vel.length();
      const base = (type.damage ?? 0) * (speed / (type.refSpeed ?? speed));
      const zone = struck.zoneAt(_probe.y);
      // Point the animal back down the arrow's flight path, so a predator turns
      // on where the shot came from rather than on nothing.
      _from.copy(_probe).addScaledVector(_dir, -45);
      const result = struck.applyDamage(base, zone, _from);
      this.deps.audio?.impact?.('flesh', _probe);
      this.deps.onCreatureHit?.(struck, result, _probe);
      // Drop the arrow at the animal's feet rather than parenting it to a
      // bolting deer — recoverable, and it never floats in mid-air.
      pos.set(_probe.x, heightAt(_probe.x, _probe.z) + 0.05, _probe.z);
      vel.set(0, 0, 0);
      p.landed = true;
      p.surface = 'ground';
      if (type.recover) this.deps.onLanded?.(p);
      this.enforceLimit(type);
      return false;
    }

    // ── impact ──
    _probe.lerpVectors(pos, _next, bestT);
    if (surface === 'water') {
      this.deps.audio?.impact?.('water', _probe);
      return !ARROW.stickToWater;
    }

    _dir.copy(vel).normalize();
    pos.copy(_probe).addScaledVector(_dir, type.embed);
    vel.set(0, 0, 0);
    p.landed = true;
    p.surface = surface;
    p.normal = normal ? normal.clone() : null;

    this.deps.audio?.impact?.(surface, pos);
    // ── a miss is a RESULT, and until now it was silence ──
    //
    // An arrow that buried itself in a hillside looked exactly like an arrow
    // that never existed: no message, no sound you could place, nothing. That
    // is the single worst thing in the game to learn from, because the bow is
    // the one tool whose whole skill is judging drop and dead ground — and it
    // was the only tool that answered a mistake with nothing at all.
    //
    // It cost the author four confident wrong diagnoses in one session, each
    // starting from "the arrow did nothing, so the hit test must be broken".
    // The hit test was fine every time. There was a hill in the way, and the
    // game knew and did not say.
    //
    // Reported with the DISTANCE FLOWN, because "you hit the ground" and "you
    // hit the ground 8 m in front of your own feet" are different lessons.
    // A creature or a player hit never reaches here — this branch is only ever
    // terrain, a tree or a rock.
    this.deps.onMiss?.(p, surface, p.pos.distanceTo(p.origin));
    if (type.recover) this.deps.onLanded?.(p);
    this.enforceLimit(type);
    return false;
  }

  /**
   * Where the segment crosses the ground, by bisection. The height field is
   * cheap enough to sample a handful of times and this lands the arrow on the
   * surface rather than a substep past it.
   */
  terrainT(from, to) {
    if (to.y >= heightAt(to.x, to.z)) return null;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) * 0.5;
      _probe.lerpVectors(from, to, mid);
      if (_probe.y < heightAt(_probe.x, _probe.z)) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  /** Crossing the lake surface, but only inside the actual lake disc. */
  waterT(from, to) {
    if (from.y < WATER_LEVEL || to.y >= WATER_LEVEL) return null;
    const t = (from.y - WATER_LEVEL) / (from.y - to.y);
    if (t < 0 || t > 1) return null;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const r = LAKE.radius * LAKE.planeOversize;
    return (x - LAKE.x) ** 2 + (z - LAKE.z) ** 2 <= r * r ? t : null;
  }

  render() {
    const n = Math.min(this.items.length, this.capacity);
    for (let i = 0; i < n; i++) {
      const p = this.items[i];
      _m4.compose(p.pos, p.quat, _one);
      this.mesh.setMatrixAt(i, _m4);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get stats() {
    let flying = 0;
    let landed = 0;
    for (const p of this.items) (p.landed ? landed++ : flying++);
    return { flying, landed, total: this.items.length };
  }
}
