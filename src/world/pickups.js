// ── pickups.js ──────────────────────────────────────────────────────────────
// Everything on the ground you can pick up, of three kinds:
//
//   recovered — an arrow embedded in the world. Has no visual of its own; the
//               projectile system is already drawing it, so this is purely a
//               collectable marker sitting on top of it.
//   dropped   — something you threw down with Q. Falls, settles, bobs.
//   loot      — quivers hash-placed across the world exactly like the trees, so
//               they are in the same spot every run and never respawn once
//               taken.
//
// Nothing here is arrow-specific: any registry item id can be dropped, found or
// recovered, so a future crossbow and its bolts work without edits.

import * as THREE from 'three';
import { PICKUP, PLAYER, WATER_LEVEL, STRUCTURES } from '../config.js';
import { heightAt, slopeAt, clumpAt } from './noise.js';
import { richnessAt } from './scarcity.js';
import { getItem } from '../items/registry.js';
import { hash2i, lerp } from '../util/math.js';

const _v = new THREE.Vector3();

let nextDropId = 1;

/**
 * Deadfall that has been picked up — and comes BACK.
 *
 * ── WHY IT NOW COMES BACK ───────────────────────────────────────────────────
 *
 * This was a plain `Set` and the comment beside it said "never come back". That
 * was survivable while the valley was generous and fatal the moment `SCARCE=on`
 * arrived: measured 2026-08-12, Eachann was refused **128 gathers across ~375
 * decisions** — a third of his run spent asking for wood that no longer existed
 * anywhere he had been. TODO 4b calls scarcity "the dial that makes them
 * social"; without regrowth it is a dial that makes them dead, and the death
 * spiral stops being behaviour and becomes arithmetic.
 *
 * ── AND IT IS THE SHAPE `Harvest` ALREADY USES ──────────────────────────────
 *
 * Trees and rocks have regrown for a long time (`STRUCTURES.regrowHours`), and
 * `Harvest` stores key -> THE HOUR IT COMES BACK. This is the same map with the
 * same units, deliberately, rather than a second mechanism with its own bugs.
 *
 * THE HOURS MUST BE MONOTONIC. `clock.hours` wraps at 24 and a regrow time of
 * `hours + 30` computed from a wrapping clock is a branch that came back
 * yesterday. `Harvest` carries a comment saying this project has been caught by
 * that clock three times; this is the fifth place that needs `world.totalHours`.
 *
 * Duck-typed as a Set (`has`/`add`) so every existing call site — including
 * `nearestDeadfall(..., taken)` — keeps working untouched.
 */
export class TakenDeadfall {
  constructor(regrowHours = STRUCTURES.regrowHours) {
    this.until = new Map();   // key -> in-game hour it is back
    this.regrowHours = regrowHours;
    this.hours = 0;
  }

  /** The world tells it the time. Until it does, nothing ever regrows. */
  at(hours) {
    if (Number.isFinite(hours)) this.hours = hours;
    return this;
  }

  has(key) {
    const until = this.until.get(key);
    if (until === undefined) return false;
    if (this.hours >= until) { this.until.delete(key); return false; }
    return true;
  }

  add(key) {
    this.until.set(key, this.hours + this.regrowHours);
    return this;
  }

  delete(key) { return this.until.delete(key); }
  clear() { this.until.clear(); }
  get size() { return this.until.size; }
}

export class Pickups {
  constructor(scene, deps) {
    this.scene = scene;
    this.deps = deps; // { inventory, projectiles, audio }
    this.recovered = []; // { projectile, item, count }
    this.dropped = []; // { obj, item, count, vel, resting }
    this.loot = new Map(); // key -> { obj, item, count, x, z, baseY }
    // Keys already collected. NOT a Set and no longer forever — see
    // `TakenDeadfall`. A branch comes back after `STRUCTURES.regrowHours`.
    this.taken = new TakenDeadfall();
    this.anchor = new THREE.Vector3(Infinity, 0, Infinity);
    this.nearest = null;
    this.time = 0;
  }

  // ── recovered projectiles ────────────────────────────────────────────────

  registerRecoverable(projectile) {
    const item = projectile.type.recover;
    if (!item) return;
    this.recovered.push({ projectile, item, count: 1 });
  }

  forgetProjectile(projectile) {
    const i = this.recovered.findIndex((r) => r.projectile === projectile);
    if (i >= 0) this.recovered.splice(i, 1);
  }

  // ── dropped items ────────────────────────────────────────────────────────

  drop(itemId, count, from, forward) {
    const def = getItem(itemId);
    if (!def) return null;
    const obj = def.makeObject();
    obj.castShadow = true;
    obj.position
      .copy(from)
      .addScaledVector(forward, PICKUP.dropForward)
      .add(_v.set(0, PICKUP.dropUp, 0));
    this.scene.add(obj);
    const entry = {
      obj,
      // ── A STABLE ID ──
      // The snapshot sends dropped loot every tick and a viewer has to be able
      // to tell "the same branch, moved" from "a different branch". Without one
      // a client can only rebuild the whole pile every packet, which flickers
      // and throws away any light attached to it.
      id: nextDropId++,
      item: itemId,
      count,
      vel: forward.clone().multiplyScalar(2.6).setY(1.4),
      resting: false,
      spin: (hash2i(Math.round(from.x), Math.round(from.z), 7) - 0.5) * 2,
    };
    this.dropped.push(entry);
    return entry;
  }

  /**
   * Put a dropped item back where a save says it was, already at rest — no
   * toss arc, no settling. Used only when loading.
   */
  restoreDrop(itemId, count, pos) {
    const def = getItem(itemId);
    if (!def) return null;
    const obj = def.makeObject();
    obj.castShadow = true;
    obj.position.set(pos[0], pos[1], pos[2]);
    this.scene.add(obj);
    const entry = {
      obj,
      id: nextDropId++,
      item: itemId,
      count,
      vel: new THREE.Vector3(),
      resting: true,
      spin: (hash2i(Math.round(pos[0]), Math.round(pos[2]), 7) - 0.5) * 2,
    };
    this.dropped.push(entry);
    return entry;
  }

  // ── deterministic world loot ─────────────────────────────────────────────
  //
  // See `deadfallNear` below for WHERE the wood is. It is a pure function of
  // the seed, which is why the browser can draw branches it never downloaded —
  // and, now, why an agent playing over a socket can walk to one. The snapshot
  // does not carry pickups and never will; both ends compute them instead.

  /**
   * Deadfall branches, found where trees are.
   *
   * Uses the same tree-clump mask that decides where woodland grows, so fuel is
   * where you would expect it: plentiful in the woods, absent on a bare ridge.
   * That turns "where do I camp" into a real question — the warm low ground has
   * wood, and the exposed tops, where you most need a fire, do not.
   */
  refreshDeadfall(px, pz) {
    const cell = PICKUP.woodCell;
    const R = PICKUP.woodRadius;
    const want = new Set();

    // WHERE the branches are comes from the pure function; this loop only
    // decides what to draw. Keeping the placement rules in one place is what
    // lets an agent with no scene walk to the same branch you can see.
    for (const w of deadfallNear(px, pz, R)) {
      const { key, x, z, y, count } = w;
      if (this.taken.has(key)) continue;
      want.add(key);
      if (this.loot.has(key)) continue;

      const [ci, cj] = key.slice(1).split(',').map(Number);
      const def = getItem('wood');
      const obj = def.makeObject();
      obj.castShadow = true;
      obj.rotation.y = hash2i(ci, cj, 514) * Math.PI * 2;
      obj.rotation.z = (hash2i(ci, cj, 515) - 0.5) * 0.4;
      obj.position.set(x, y + 0.06, z);
      this.scene.add(obj);
      // Deadfall lies still — flagged so the bob/spin pass skips it.
      this.loot.set(key, { obj, item: 'wood', count, x, z, baseY: y + 0.06, key, still: true });
    }

    for (const [key, entry] of this.loot) {
      if (!key.startsWith('w')) continue;
      if (want.has(key)) continue;
      this.scene.remove(entry.obj);
      this.loot.delete(key);
    }
  }

  refreshLoot(px, pz) {
    const cell = PICKUP.lootCell;
    const R = PICKUP.lootRadius;
    const want = new Set();

    for (let cj = Math.floor((pz - R) / cell); cj <= Math.ceil((pz + R) / cell); cj++) {
      for (let ci = Math.floor((px - R) / cell); ci <= Math.ceil((px + R) / cell); ci++) {
        const key = `${ci},${cj}`;
        if (this.taken.has(key)) continue;
        if (hash2i(ci, cj, 401) > PICKUP.lootChance) continue;

        const x = ci * cell + hash2i(ci, cj, 402) * cell;
        const z = cj * cell + hash2i(ci, cj, 403) * cell;
        if ((x - px) ** 2 + (z - pz) ** 2 > R * R) continue;

        const y = heightAt(x, z);
        if (y < WATER_LEVEL + 0.6) continue; // not in the lake
        if (slopeAt(x, z) > 0.4) continue; // not on a cliff face

        want.add(key);
        if (this.loot.has(key)) continue;

        const count = Math.round(
          lerp(PICKUP.arrowsPerBundle[0], PICKUP.arrowsPerBundle[1], hash2i(ci, cj, 404))
        );
        const def = getItem('quiver');
        const obj = def.makeObject();
        obj.castShadow = true;
        obj.rotation.y = hash2i(ci, cj, 405) * Math.PI * 2;
        obj.rotation.z = 0.28; // leaning over, as if dropped
        obj.position.set(x, y + 0.22, z);
        this.scene.add(obj);
        this.loot.set(key, { obj, item: 'arrow', count, x, z, baseY: y + 0.22, key });
      }
    }

    for (const [key, entry] of this.loot) {
      if (key.startsWith('w')) continue; // deadfall has its own pass
      if (want.has(key)) continue;
      this.scene.remove(entry.obj);
      this.loot.delete(key);
    }
  }

  /**
   * Forget where we thought the loot was and look again on the next tick.
   *
   * Called when the RULE changes underneath us — joining a server that runs a
   * leaner valley than this client assumed. Without it the branches placed
   * before the welcome stay on the ground until the player has walked 45 m,
   * and they are branches the server does not have.
   */
  reconsider() {
    this.anchor.set(Infinity, 0, Infinity);
  }

  // ── per frame ────────────────────────────────────────────────────────────

  update(dt, playerPos, hours) {
    this.time += dt;
    // The MONOTONIC hour, so regrowth can be judged. A caller that never passes
    // one keeps the old behaviour exactly: nothing ever comes back.
    this.taken.at(hours);

    if (Math.hypot(playerPos.x - this.anchor.x, playerPos.z - this.anchor.z) > 45) {
      this.anchor.set(playerPos.x, 0, playerPos.z);
      this.refreshLoot(playerPos.x, playerPos.z);
      this.refreshDeadfall(playerPos.x, playerPos.z);
    }

    // Dropped items fall and settle.
    for (const d of this.dropped) {
      if (d.resting) {
        d.obj.rotation.y += dt * d.spin * 0.3;
        continue;
      }
      d.vel.y -= PLAYER.gravity * dt;
      d.obj.position.addScaledVector(d.vel, dt);
      d.obj.rotation.y += dt * d.spin * 2;
      const ground = Math.max(heightAt(d.obj.position.x, d.obj.position.z), WATER_LEVEL - 0.4);
      if (d.obj.position.y <= ground + 0.12) {
        d.obj.position.y = ground + 0.12;
        d.vel.set(0, 0, 0);
        d.resting = true;
      }
    }

    // Loot bobs so it catches the eye against the grass.
    const bob = Math.sin(this.time * PICKUP.bobRate) * PICKUP.bobHeight;
    for (const entry of this.loot.values()) {
      // Deadfall is scenery that happens to be collectable; a branch bobbing
      // and spinning in mid-air would read as a video game power-up.
      if (entry.still) continue;
      entry.obj.position.y = entry.baseY + bob;
      entry.obj.rotation.y += dt * PICKUP.spinRate;
    }

    this.nearest = this.findNearest(playerPos);
    if (this.nearest && PICKUP.autoCollect) this.collect();
    return this.nearest;
  }

  findNearest(playerPos) {
    let best = null;
    let bestD = PICKUP.radius * PICKUP.radius;

    const consider = (pos, kind, ref, item, count) => {
      const d = pos.distanceToSquared(playerPos);
      if (d < bestD) {
        bestD = d;
        best = { kind, ref, item, count, distance: Math.sqrt(d) };
      }
    };

    for (const r of this.recovered) consider(r.projectile.pos, 'recovered', r, r.item, r.count);
    for (const d of this.dropped) consider(d.obj.position, 'dropped', d, d.item, d.count);
    for (const l of this.loot.values()) consider(l.obj.position, 'loot', l, l.item, l.count);
    return best;
  }

  /** Collect whatever the prompt is pointing at. Returns a message or null. */
  collect() {
    const target = this.nearest;
    if (!target) return null;
    const def = getItem(target.item);
    const added = this.deps.inventory.add(target.item, target.count);
    if (added === 0) return `no room for ${def?.name ?? target.item}`;

    if (target.kind === 'recovered') {
      this.deps.projectiles.removeById(target.ref.projectile.id);
      this.forgetProjectile(target.ref.projectile);
    } else if (target.kind === 'dropped') {
      this.scene.remove(target.ref.obj);
      this.dropped.splice(this.dropped.indexOf(target.ref), 1);
    } else {
      this.scene.remove(target.ref.obj);
      this.loot.delete(target.ref.key);
      this.taken.add(target.ref.key); // gone for good
    }

    this.deps.audio?.pickup?.();
    this.nearest = null;
    return `+${added} ${def?.name ?? target.item}${added > 1 ? 's' : ''}`;
  }

  /**
   * Pick up whatever is at ONE PERSON's feet, into THEIR pack.
   *
   * `collect()` above takes `this.nearest`, which `update()` fills in from the
   * single position it is given each tick. On your own that is you and the
   * answer is right. On a server it is the first player in the map, for
   * everybody — so a second player's E collected things lying beside the first,
   * and when the first was standing on bare ground nobody could pick anything
   * up at all. Every socket-level test of gathering has run with exactly one
   * agent connected, which is precisely the case where the bug does not show.
   *
   * Deadfall is asked for from the PURE function rather than from `this.loot`,
   * for the same reason: the loot map only holds what was built around the
   * anchor, so branches beside anyone else were not in it to be found. The
   * scene copy is removed too when there is one, so the browser stops drawing
   * a branch that has been carried away.
   *
   * @returns {string|null} what was taken, in words, or null for bare ground.
   */
  collectFor(pos, inventory) {
    let best = this.findNearest(pos);
    let bestD = best ? best.distance : PICKUP.radius;

    const wood = nearestDeadfall(pos.x, pos.z, PICKUP.radius, this.taken);
    // STRICTLY NEARER, not "no further". At `<=` a branch beat a carcass they
    // were both standing on, so a mind that walked to its own kill and pressed
    // E came away with firewood. Deadfall is everywhere and meat is not; when
    // they are the same distance the meat is what was meant.
    if (wood && wood.distance < bestD) {
      const added = inventory.add('wood', wood.count);
      if (added === 0) return null;
      this.taken.add(wood.key);
      const entry = this.loot.get(wood.key);
      if (entry) {
        this.scene.remove(entry.obj);
        this.loot.delete(wood.key);
      }
      if (this.nearest?.ref?.key === wood.key) this.nearest = null;
      this.deps.audio?.pickup?.();
      return `+${added} branch${added > 1 ? 'es' : ''}`;
    }
    if (!best) return null;

    // Everything else is a real entry, so hand it to the existing path rather
    // than writing a second one — `collect` is where "and take it out of the
    // world" lives, and two copies of that would drift.
    const wasNearest = this.nearest;
    const wasInventory = this.deps.inventory;
    this.nearest = best;
    this.deps.inventory = inventory;
    const msg = this.collect();
    this.deps.inventory = wasInventory;
    // `collect` clears `nearest`; only restore it if it was pointing at
    // something else, so the local prompt does not resurrect what we just took.
    if (wasNearest && wasNearest !== best) this.nearest = wasNearest;
    return msg;
  }

  get stats() {
    return { recoverable: this.recovered.length, dropped: this.dropped.length, loot: this.loot.size };
  }
}

// ── where the wood is, as a pure function ───────────────────────────────────
//
// Same hash, same clump mask, same water and slope rules as `refreshDeadfall`
// above — because it is the definition, and that method now calls this one.
// Two copies of "where is the wood" would drift the first time either was
// tuned, and the drift would be invisible: the branches you can see and the
// branches something walks toward would simply stop being the same branches.
//
// No THREE and no scene, which is the point. A browser needs geometry to draw
// deadfall; an agent over a socket needs only coordinates, and the snapshot
// carries no pickups at all. Both ends compute the same answer from the seed,
// exactly as they already do for the terrain and the place names.
export function deadfallNear(px, pz, radius = PICKUP.woodRadius, taken = null) {
  const cell = PICKUP.woodCell;
  const out = [];
  for (let cj = Math.floor((pz - radius) / cell); cj <= Math.ceil((pz + radius) / cell); cj++) {
    for (let ci = Math.floor((px - radius) / cell); ci <= Math.ceil((px + radius) / cell); ci++) {
      const x = ci * cell + hash2i(ci, cj, 511) * cell;
      const z = cj * cell + hash2i(ci, cj, 512) * cell;
      if ((x - px) ** 2 + (z - pz) ** 2 > radius * radius) continue;
      const clump = clumpAt(x, z);
      if (clump < 0.25) continue;
      // ── and how much this valley has ──
      // `richnessAt` is 1 everywhere until somebody turns scarcity on, so this
      // multiplies by one and the world is byte-identical by default. With it
      // on, fuel pulls into the good ground along with the deer — see
      // world/scarcity.js for why that, rather than "less everywhere".
      if (hash2i(ci, cj, 513) > PICKUP.woodChance * clump * richnessAt(x, z)) continue;
      const y = heightAt(x, z);
      if (y < WATER_LEVEL + 0.5) continue;
      if (slopeAt(x, z) > 0.45) continue;
      // ── and not one somebody has already picked up ──
      // Where the wood IS is a pure function of the seed. Whether it is still
      // THERE is not, and this returned branches that had been carried away
      // hours ago. Found by playing: I told the harness "walk to the nearest
      // branch, press E" five times and it walked two metres, pressed E five
      // times, and gathered ONE — because after the first pickup the answer to
      // "where is the nearest branch" never changed. An agent's `gather` does
      // exactly the same thing and would have circled that spot for ever.
      if (taken?.has(`w${ci},${cj}`)) continue;
      out.push({ key: `w${ci},${cj}`, x, z, y, count: 1 + (hash2i(ci, cj, 516) < 0.35 ? 1 : 0) });
    }
  }
  return out;
}

/** The closest branch to a point, or null if the ground here is bare. */
/**
 * @param {Set<string>} [taken] keys already collected. An agent has no
 *   `Pickups` instance and therefore no memory of what it has carried away, so
 *   it keeps its own set and passes it here — otherwise the nearest branch is
 *   the same branch for ever and `gather` becomes a loop.
 */
export function nearestDeadfall(px, pz, radius = PICKUP.woodRadius, taken = null) {
  let best = null;
  let bestD = Infinity;
  for (const w of deadfallNear(px, pz, radius, taken)) {
    const d = (w.x - px) ** 2 + (w.z - pz) ** 2;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best ? { ...best, distance: Math.sqrt(bestD) } : null;
}
