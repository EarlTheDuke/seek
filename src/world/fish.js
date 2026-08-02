// ── fish.js ─────────────────────────────────────────────────────────────────
// Something in the lake.
//
// The water has been the best-looking thing in this world since the first hour
// and the least useful — you could wade in it, get cold in it and drown a deer
// in it, and that was all. This puts food in it.
//
// Three things had to be true for it to be worth building:
//
//   * YOU CAN SEE THEM. A fishing spot you cannot tell from an empty one is a
//     dice roll wearing a hat. Shoals are visible from the bank as flickers
//     under the surface, and they move, so choosing where to wade in is a real
//     decision made with your eyes.
//   * STILLNESS IS THE SKILL, which is the same skill the whole game has been
//     teaching since the deer. Splashing about scatters them. Crouching in the
//     shallows and waiting does not.
//   * THE OTTER IS BETTER AT IT THAN YOU ARE. Of course it is. It is an otter.
//     That is the single most obvious thing a pet otter should do and it would
//     have been perverse to build fish without it.
//
// Shoals are placed by the same hash-grid trick as everything else, so a good
// pool is in the same place tomorrow and you can go back to it.

import * as THREE from 'three';
import { FISH, LAKE, WATER_LEVEL } from '../config.js';
import { heightAt, makeRandom } from './noise.js';
import { hash2i, clamp, lerp, smoothstep } from '../util/math.js';

const SCALE_DARK = new THREE.Color(0x3b4a52);
const SCALE_PALE = new THREE.Color(0x8fa2a0);
const BELLY = new THREE.Color(0xb9bfae);

let fishGeo = null;

/** One trout, about as long as your hand. */
function fishGeometry() {
  if (fishGeo) return fishGeo;
  const parts = [];
  const paint = (geo, color) => {
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
  };

  const body = new THREE.CapsuleGeometry(0.045, 0.16, 3, 6);
  body.rotateX(Math.PI / 2);
  body.scale(0.7, 1, 1);
  parts.push(paint(body, SCALE_DARK));
  const flank = new THREE.CapsuleGeometry(0.032, 0.13, 3, 6);
  flank.rotateX(Math.PI / 2);
  flank.scale(0.6, 1, 1);
  flank.translate(0, -0.02, 0.01);
  parts.push(paint(flank, BELLY));
  // The tail is what you actually see: a flicker of pale edge-on.
  const tail = new THREE.ConeGeometry(0.05, 0.09, 3);
  tail.rotateX(-Math.PI / 2);
  tail.scale(0.35, 1, 1);
  tail.translate(0, 0, -0.15);
  parts.push(paint(tail, SCALE_PALE));

  const merged = parts.reduce((acc, g) => {
    if (!acc) return g;
    const a = acc.attributes.position.array;
    const b = g.attributes.position.array;
    const ac = acc.attributes.color.array;
    const bc = g.attributes.color.array;
    const pos = new Float32Array(a.length + b.length);
    pos.set(a);
    pos.set(b, a.length);
    const col = new Float32Array(ac.length + bc.length);
    col.set(ac);
    col.set(bc, ac.length);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  }, null);
  merged.computeVertexNormals();
  fishGeo = merged;
  return fishGeo;
}

const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.36, // wet
  metalness: 0.15,
});

/**
 * Where the shoals are.
 *
 * Pure function of the grid cell, like the caves and the barrows, so a pool
 * that was good yesterday is good today. Shoals want water deep enough to hold
 * fish but shallow enough to wade — which puts them exactly where you can
 * reach them, and is the whole reason the lake has a gentle shelf.
 */
export function shoalInCell(ci, cj) {
  if (hash2i(ci, cj, 1401) > FISH.density) return null;
  const cell = FISH.cellSize;
  const x = ci * cell + hash2i(ci, cj, 1402) * cell;
  const z = cj * cell + hash2i(ci, cj, 1403) * cell;
  const depth = WATER_LEVEL - heightAt(x, z);
  if (depth < FISH.minDepth || depth > FISH.maxDepth) return null;
  return {
    key: `${ci},${cj}`,
    x,
    z,
    depth,
    // How many, and how skittish. A big shoal is easier to catch from and
    // easier to spot, so the good spots look good.
    size: Math.round(lerp(FISH.shoalMin, FISH.shoalMax, hash2i(ci, cj, 1404))),
    radius: FISH.shoalRadius * lerp(0.7, 1.3, hash2i(ci, cj, 1405)),
  };
}

/**
 * Every shoal near you, drawn as instanced fish that circle and dart.
 *
 * One InstancedMesh for the lot: a shoal of nine fish across six shoals is 54
 * moving objects, and at that count individual meshes start to matter on a
 * budget that is already spending everything it has on grass.
 */
export class Fish {
  constructor(scene) {
    this.scene = scene;
    this.rand = makeRandom('fish');
    this.shoals = [];
    this.anchor = new THREE.Vector3(Infinity, 0, Infinity);
    this.time = 0;

    this.mesh = new THREE.InstancedMesh(fishGeometry(), material, FISH.maxDrawn);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // Fish do not cast useful shadows through water and it costs a shadow pass.
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  refresh(px, pz) {
    const cell = FISH.cellSize;
    const R = FISH.visibleRange;
    const wanted = new Map();
    for (let cj = Math.floor((pz - R) / cell); cj <= Math.ceil((pz + R) / cell); cj++) {
      for (let ci = Math.floor((px - R) / cell); ci <= Math.ceil((px + R) / cell); ci++) {
        const s = shoalInCell(ci, cj);
        if (!s) continue;
        if (Math.hypot(s.x - px, s.z - pz) > R) continue;
        wanted.set(s.key, s);
      }
    }

    // Keep the ones still in range, so a shoal you have been stalking does not
    // reshuffle its fish under you.
    const kept = this.shoals.filter((s) => wanted.has(s.key));
    for (const s of kept) wanted.delete(s.key);
    for (const s of wanted.values()) {
      s.fish = [];
      for (let i = 0; i < s.size; i++) {
        s.fish.push({
          a: this.rand() * Math.PI * 2, // where on the ring
          r: 0.3 + this.rand() * 0.7, // how far out
          speed: lerp(0.5, 1.4, this.rand()) * (this.rand() < 0.5 ? -1 : 1),
          bob: this.rand() * Math.PI * 2,
          depth: 0.25 + this.rand() * 0.5,
        });
      }
      s.spooked = 0;
      kept.push(s);
    }
    this.shoals = kept;
  }

  /**
   * @param {number} disturbance 0..1 — how much splashing is going on nearby.
   *   Fed from the player's own noise, so wading loudly scatters them and
   *   crouching still does not. The same stealth number the deer read.
   */
  update(dt, playerPos, disturbance = 0) {
    this.time += dt;
    if (Math.hypot(playerPos.x - this.anchor.x, playerPos.z - this.anchor.z) > 24) {
      this.anchor.copy(playerPos);
      this.refresh(playerPos.x, playerPos.z);
    }

    let n = 0;
    for (const s of this.shoals) {
      const near = Math.hypot(s.x - playerPos.x, s.z - playerPos.z);
      // Only what is close enough to disturb gets disturbed.
      const felt = near < FISH.spookRange ? disturbance * (1 - near / FISH.spookRange) : 0;
      s.spooked = clamp(Math.max(s.spooked - dt * FISH.calmRate, felt), 0, 1);

      for (const f of s.fish) {
        // Spooked fish swim faster and wider — which is both what they do and
        // a clear visual tell that you have blown it.
        const speed = f.speed * lerp(1, FISH.spookedSpeed, s.spooked);
        f.a += speed * dt;
        const radius = s.radius * f.r * lerp(1, 1.5, s.spooked);
        const x = s.x + Math.cos(f.a) * radius;
        const z = s.z + Math.sin(f.a) * radius;
        const y =
          WATER_LEVEL -
          f.depth * lerp(1, 1.8, s.spooked) +
          Math.sin(this.time * 1.7 + f.bob) * 0.05;

        if (n >= FISH.maxDrawn) break;
        this._v.set(x, y, z);
        // Face along travel.
        this._e.set(0, Math.atan2(-Math.sin(f.a) * speed, -Math.cos(f.a) * speed) + Math.PI / 2, 0);
        this._q.setFromEuler(this._e);
        this._m.compose(this._v, this._q, this._s);
        this.mesh.setMatrixAt(n++, this._m);
      }
    }
    this.mesh.count = n;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** The shoal you could reach from here, if any. */
  nearest(pos, range = FISH.reach) {
    let best = null;
    let bestD = range;
    for (const s of this.shoals) {
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best ? { shoal: best, distance: bestD } : null;
  }

  /**
   * Try to take one.
   *
   * Stillness is the skill. A crouched, motionless player in the shallows gets
   * most of the way there; someone who waded in at a run gets almost nothing.
   * The otter is simply better at it, because it is an otter, and having it
   * with you is worth more than anything you can do yourself.
   *
   * Returns { ok, why } or { ok: true, count } — and either way it SPOOKS the
   * shoal, so you get one attempt and then you wait, which is the same rhythm
   * as a stalk.
   */
  tryCatch(shoal, { noise = 0, crouched = false, otter = null } = {}) {
    if (!shoal) return { ok: false, why: 'nothing here' };

    let chance = FISH.baseChance;
    chance += crouched ? FISH.crouchBonus : 0;
    chance -= noise * FISH.noisePenalty;
    chance -= shoal.spooked * FISH.spookedPenalty;
    // A big shoal is easier to get a hand into.
    chance += smoothstep(FISH.shoalMin, FISH.shoalMax, shoal.size) * FISH.shoalBonus;

    // The otter. Its help scales with trust, because a half-tame otter that
    // wanders off mid-hunt is not help.
    const helping = otter && otter.tame && !otter.broken;
    if (helping) chance += lerp(FISH.otterBonusMin, FISH.otterBonusMax, otter.trust);

    chance = clamp(chance, 0, FISH.maxChance);
    const roll = this.rand();
    shoal.spooked = 1;

    if (roll > chance) return { ok: false, why: 'they scatter', chance, helped: helping };
    // With an otter along you sometimes get two, because it caught one as well.
    const count = helping && this.rand() < otter.trust * 0.5 ? 2 : 1;
    return { ok: true, count, chance, helped: helping };
  }

  get stats() {
    return {
      shoals: this.shoals.length,
      fish: this.shoals.reduce((n, s) => n + s.size, 0),
      drawn: this.mesh.count,
    };
  }
}
