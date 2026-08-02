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
import { PICKUP, PLAYER, WATER_LEVEL } from '../config.js';
import { heightAt, slopeAt, clumpAt } from './noise.js';
import { getItem } from '../items/registry.js';
import { hash2i, lerp } from '../util/math.js';

const _v = new THREE.Vector3();

export class Pickups {
  constructor(scene, deps) {
    this.scene = scene;
    this.deps = deps; // { inventory, projectiles, audio }
    this.recovered = []; // { projectile, item, count }
    this.dropped = []; // { obj, item, count, vel, resting }
    this.loot = new Map(); // key -> { obj, item, count, x, z, baseY }
    this.taken = new Set(); // loot keys already collected — never come back
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

    for (let cj = Math.floor((pz - R) / cell); cj <= Math.ceil((pz + R) / cell); cj++) {
      for (let ci = Math.floor((px - R) / cell); ci <= Math.ceil((px + R) / cell); ci++) {
        const key = `w${ci},${cj}`;
        if (this.taken.has(key)) continue;

        const x = ci * cell + hash2i(ci, cj, 511) * cell;
        const z = cj * cell + hash2i(ci, cj, 512) * cell;
        if ((x - px) ** 2 + (z - pz) ** 2 > R * R) continue;

        // Only under woodland, and only sometimes.
        const clump = clumpAt(x, z);
        if (clump < 0.25) continue;
        if (hash2i(ci, cj, 513) > PICKUP.woodChance * clump) continue;

        const y = heightAt(x, z);
        if (y < WATER_LEVEL + 0.5) continue;
        if (slopeAt(x, z) > 0.45) continue;

        want.add(key);
        if (this.loot.has(key)) continue;

        const def = getItem('wood');
        const obj = def.makeObject();
        obj.castShadow = true;
        obj.rotation.y = hash2i(ci, cj, 514) * Math.PI * 2;
        obj.rotation.z = (hash2i(ci, cj, 515) - 0.5) * 0.4;
        obj.position.set(x, y + 0.06, z);
        this.scene.add(obj);
        // Deadfall lies still — flagged so the bob/spin pass skips it.
        this.loot.set(key, { obj, item: 'wood', count: 1 + (hash2i(ci, cj, 516) < 0.35 ? 1 : 0), x, z, baseY: y + 0.06, key, still: true });
      }
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

  // ── per frame ────────────────────────────────────────────────────────────

  update(dt, playerPos) {
    this.time += dt;

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

  get stats() {
    return { recoverable: this.recovered.length, dropped: this.dropped.length, loot: this.loot.size };
  }
}
