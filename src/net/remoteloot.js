// ── remoteloot.js ───────────────────────────────────────────────────────────
// What everybody else has put on the ground.
//
// THE HOLE THIS FILLS. `drop` has been on the protocol's allow-list since the
// beginning and the server never read it, so every drop happened inside one
// browser: invisible to the other players, invisible to the agents, and gone
// the moment you reloaded. A playtester who agreed a price with two minds could
// not pay them — he put eighteen branches on the grass and neither could see
// them, and one went on asking for the nine he was standing on.
//
// The server owns dropped loot now and sends it in every snapshot as `lo`. This
// draws it.
//
// PURE PRESENTATION, exactly like `avatars.js` and for the same reason: nothing
// in here may touch the simulation. The pile you see is a picture of the
// server's pile, and taking something from it is `interact` going the other way
// — the server decides what left the ground and who now has it. A client that
// removed the mesh itself would be a client that could pick up the same branch
// twice.
//
// The seed-derived loot — deadfall, quivers — is NOT here and must not be. It
// is a pure function of the seed, both ends compute it, and sending it would be
// a few hundred entries a tick to say what the receiver already knows.

import * as THREE from 'three';
import { ITEMS, getItem } from '../items/registry.js';
import { SURVIVAL } from '../config.js';

/** A torch still alight where somebody left it. */
const TORCH_COLOUR = 0xffb257;

export class RemoteLoot {
  constructor(scene) {
    this.scene = scene;
    /** id -> { obj, light, item } */
    this.shown = new Map();
    this.time = 0;
  }

  /**
   * Match what is drawn to what the last snapshot said.
   *
   * Keyed on the entry's id rather than rebuilt each packet: an item that has
   * not moved keeps its mesh, and a torch keeps the light attached to it. The
   * id is what makes "the same branch, moved" distinguishable from "a different
   * branch", and without it this would flicker every tick.
   */
  update(dt, snapshot) {
    this.time += dt;
    const lo = snapshot?.lo;
    // No `lo` at all means no server, or a snapshot that predates the field.
    // Leaving what is drawn alone is right in both cases: clearing it would
    // make everything blink out on a single malformed packet.
    if (!Array.isArray(lo)) return;

    const seen = new Set();
    for (const e of lo) {
      if (e?.d == null) continue;
      seen.add(e.d);
      let it = this.shown.get(e.d);
      if (!it) {
        const def = getItem(e.i);
        if (!def) continue;
        const obj = def.makeObject();
        obj.castShadow = true;
        this.scene.add(obj);
        it = { obj, light: null, item: e.i };
        this.shown.set(e.d, it);
      }
      it.obj.position.set(e.p[0], e.p[1], e.p[2]);
      // A slow turn, so a thing on the ground reads as an object rather than as
      // scenery. The local pickups do the same.
      it.obj.rotation.y = this.time * 0.9;

      // ── the flame, for a torch left burning ──
      const burning = e.b > 0;
      if (burning && !it.light) {
        it.light = new THREE.PointLight(TORCH_COLOUR, 0, SURVIVAL.torchRange, 1.7);
        this.scene.add(it.light);
      }
      if (it.light) {
        it.light.visible = burning;
        if (burning) {
          it.light.position.set(e.p[0], e.p[1] + 0.25, e.p[2]);
          const gutter = 0.86 + 0.14 * Math.sin(this.time * 9.7 + e.d) * Math.sin(this.time * 3.3 + e.d);
          const fade = Math.min(1, e.b / SURVIVAL.torchGroundFade);
          it.light.intensity = SURVIVAL.torchLight * gutter * (0.3 + 0.7 * fade);
        }
      }
    }

    // Gone from the snapshot means gone from the world — somebody took it, or
    // it fell out of the wire radius. Either way it is not ours to keep drawing.
    for (const [id, it] of this.shown) {
      if (seen.has(id)) continue;
      this.drop(it);
      this.shown.delete(id);
    }
  }

  /** Take one out of the scene, lights and all. */
  drop(it) {
    this.scene.remove(it.obj);
    it.obj.geometry?.dispose?.();
    if (it.light) {
      this.scene.remove(it.light);
      it.light.dispose?.();
    }
  }

  /**
   * The nearest thing on the ground, for the interaction prompt.
   *
   * Returns what it IS and how far, and nothing that could change it — reading
   * this must never be a way to take something. That is the server's word.
   */
  nearest(pos, range) {
    let best = null;
    let bestD = range;
    for (const [id, it] of this.shown) {
      const d = Math.hypot(it.obj.position.x - pos.x, it.obj.position.z - pos.z);
      if (d >= bestD) continue;
      bestD = d;
      best = { id, item: it.item, distance: d, position: it.obj.position };
    }
    return best;
  }

  /** Everything, on a disconnect — the server is no longer telling us. */
  clear() {
    for (const it of this.shown.values()) this.drop(it);
    this.shown.clear();
  }
}
