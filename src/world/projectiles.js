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

  spawn(typeId, origin, velocity) {
    const type = TYPES[typeId];
    if (!type) return null;
    const p = {
      id: nextId++,
      typeId,
      type,
      pos: origin.clone(),
      vel: velocity.clone(),
      quat: new THREE.Quaternion(),
      flight: 0,
      landed: false,
      landedAt: 0,
      surface: null,
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

    // ── nearest of terrain / water / world colliders ──
    let bestT = Infinity;
    let surface = null;
    let normal = null;

    const tTerrain = this.terrainT(pos, _next);
    if (tTerrain !== null && tTerrain < bestT) {
      bestT = tTerrain;
      surface = 'ground';
    }

    const tWater = this.waterT(pos, _next);
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
        const hit = field.segmentHit(pos, _next, _hit);
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
    const wildlife = this.deps.wildlife;
    if (wildlife) {
      const ch = wildlife.hitTest(pos, _next);
      if (ch && ch.t < bestT) {
        bestT = ch.t;
        surface = 'flesh';
        struck = ch.creature;
      }
    }

    if (bestT === Infinity) {
      pos.copy(_next);
      return false;
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
