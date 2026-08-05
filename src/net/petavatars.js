// ── petavatars.js ───────────────────────────────────────────────────────────
// Other people's animals.
//
// The complaint this answers, in one line from the queue: "Companions do not
// exist in multiplayer — `Companion` appears 0 times in `sim/world.js`." You
// could spend an hour earning an otter's trust, walk it onto a shared server,
// and be the only person alive who could see it. It was never in the world.
//
// It is now, and the whole of the drawing is this file, because the animals
// were already built to be driven from outside: `Companion` keeps its geometry,
// its pivots and its animator in one object and its BRAIN in a separate method.
// So a remote pet is a real `Companion` with `think` and `move` never called —
// position, facing, speed and pose come off the wire, and `animate` does the
// rest exactly as it does for your own.
//
// RENDERING ONLY READS. Nothing here can touch a simulation, and on a client
// there is no simulation of anyone else's animal to touch.

import * as THREE from 'three';
import { Companion } from '../creatures/companion.js';
import { makeRandom } from '../world/noise.js';

/** One animal belonging to somebody else, driven from interpolated snapshots. */
class PetAvatar {
  constructor(ownerId, speciesId) {
    this.ownerId = ownerId;
    this.speciesId = speciesId;
    // The rand seed is per owner and species so two people with otters do not
    // idle in lockstep. It is only ever read by the constructor here — nothing
    // that could diverge from the server, because nothing here decides anything.
    this.pet = new Companion(speciesId, new THREE.Vector3(), makeRandom(`remote-pet:${ownerId}:${speciesId}`));
    this.object = this.pet.object;
  }

  apply(c, dt) {
    const pet = this.pet;
    // Position BEFORE animating: the animator adds a hop on top of whatever it
    // finds, so writing the position afterwards would flatten every kangaroo.
    pet.position.set(c.p[0], c.p[1], c.p[2]);
    pet.yaw = c.y;
    pet.object.rotation.y = c.y;
    // Speed drives the gait. Reported rather than differenced between frames,
    // for the same reason the human avatars use it: distance-based legs stutter
    // exactly when a packet is late.
    pet.speed = c.v ?? 0;
    if (pet.state !== c.s) {
      pet.state = c.s;
      pet.stateTime = 0;
    } else {
      pet.stateTime += dt;
    }
    pet.pose = c.q ?? null;
    pet.name = c.n ?? null;
    pet.animate(dt);
  }
}

/** Everybody's animals, kept in step with whatever the snapshots say exists. */
export class PetAvatars {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.byOwner = new Map();
  }

  /**
   * `skipOwner` is you. Your own animal is in the snapshot — see the note in
   * `SimWorld.snapshot` about why it is sent to everyone including its owner —
   * but you are already drawing the real one, the one whose trust you earned
   * and whose tricks it knows. Drawing the server's copy too would give you a
   * second otter half a metre behind the first.
   */
  update(dt, snapshot, skipOwner = null) {
    if (!snapshot) return;
    const seen = new Set();

    for (const c of snapshot.co ?? []) {
      if (c.o === skipOwner) continue;
      seen.add(c.o);
      let a = this.byOwner.get(c.o);
      // A different animal for the same person means a different body: rebuild
      // rather than pretend a hippo is an otter.
      if (a && a.speciesId !== c.k) {
        this.root.remove(a.object);
        a = null;
      }
      if (!a) {
        a = new PetAvatar(c.o, c.k);
        this.byOwner.set(c.o, a);
        this.root.add(a.object);
      }
      a.apply(c, dt);
    }

    for (const [id, a] of this.byOwner) {
      if (seen.has(id)) continue;
      this.root.remove(a.object);
      this.byOwner.delete(id);
    }
  }

  clear() {
    for (const [, a] of this.byOwner) this.root.remove(a.object);
    this.byOwner.clear();
  }

  get count() {
    return this.byOwner.size;
  }
}
