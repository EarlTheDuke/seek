// ── structures.js ───────────────────────────────────────────────────────────
// Somewhere to come back to.
//
// fires.js was written in Phase 2 with a note saying it was "deliberately built
// like the thing Phase 7 will generalise: a placement rule, a persistent entity
// with state that ticks, a footprint the environment query knows about, and a
// serialisable form for saves". This is that generalisation, and the note was
// accurate — a fire is now one row in the table below rather than a special
// case, and everything else follows the same four rules.
//
// THE DESIGN RULE, unchanged from the regions and the bestiary: A STRUCTURE
// MUST CHANGE A DECISION. Not decoration you can put down. A windbreak makes a
// ridge survivable; a lean-to turns a night from a fight into a rest; a store
// means you do not have to carry everything; a palisade decides where a
// warband can reach you. Anything that only looks like something is furniture,
// and furniture can wait.
//
// In plain real-world terms: this is the difference between travelling through
// a landscape and living in one. A camp is the moment a place stops being
// scenery and starts being YOURS — which is also, not coincidentally, the
// moment it is worth defending and worth showing someone.

import * as THREE from 'three';
import { STRUCTURES, WATER_LEVEL, GLIDER } from '../config.js';
import { heightAt, slopeAt, makeRandom } from './noise.js';
import { regionAt } from './regions.js';
import { clamp, smoothstep } from '../util/math.js';

const WOOD = new THREE.Color(0x5c452e);
const WOOD_PALE = new THREE.Color(0x7d6444);
const THATCH = new THREE.Color(0x8a7444);
const HIDE_C = new THREE.Color(0x6e5539);
const STONE_C = new THREE.Color(0x5c574e);

const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.92,
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

// ── the table ───────────────────────────────────────────────────────────────
//
// Everything about a buildable thing lives in one row: what it costs, how much
// room it needs, what it does, and how to draw it. Adding a drying rack or a
// gate is a row, exactly like adding a creature or an item.

export const BUILDABLE = {
  windbreak: {
    id: 'windbreak',
    name: 'Windbreak',
    verb: 'raise',
    cost: { wood: 3 },
    radius: 1.9,
    // What it DOES. Shelter feeds the same `extraShelter` hook the stone
    // circles use, so wind chill, drying and hypothermia all read it already.
    shelter: 0.55,
    // Reaches well past the hurdle itself. At 3.4 m the effect had all but
    // vanished by the time you were standing behind it — a windbreak that only
    // works if you are inside it is a wall you are leaning on, not shelter.
    shelterRadius: 5.5,
    // Sit somewhere this can actually stand.
    maxSlope: 0.34,
    build: buildWindbreak,
    blurb: 'takes the wind off a ridge',
  },

  leanto: {
    id: 'leanto',
    name: 'Lean-to',
    verb: 'build',
    cost: { wood: 6, hide: 2 },
    radius: 2.4,
    shelter: 0.86,
    shelterRadius: 5.0,
    // A roof keeps the rain off, which is worth more than it sounds: wetness
    // is the multiplier on everything cold.
    roof: true,
    maxSlope: 0.3,
    build: buildLeanTo,
    blurb: 'a roof, and the rain stops mattering',
  },

  store: {
    id: 'store',
    name: 'Store',
    verb: 'set up',
    cost: { wood: 4 },
    radius: 1.4,
    maxSlope: 0.36,
    // The first container in the world. Ten slots, and it stays where you
    // left it — which is what makes a camp a base rather than a bivouac.
    storage: 10,
    build: buildStore,
    blurb: 'somewhere to leave things',
  },

  holt: {
    id: 'holt',
    name: 'Holt',
    verb: 'dig',
    cost: { wood: 3, hide: 1 },
    radius: 1.3,
    maxSlope: 0.3,
    // Somewhere for the otter to sleep dry and warm. It is not shelter for
    // YOU — it is a metre-high heap of sticks — which is why it has no
    // `shelter` and why building one is an act of care rather than of comfort.
    holt: true,
    build: buildHolt,
    blurb: 'somewhere for the otter to sleep',
  },

  palisade: {
    id: 'palisade',
    name: 'Palisade',
    verb: 'drive',
    // The only thing that needs stone, and the reason quarrying a boulder is
    // worth the four seconds: a wall has to be footed in something.
    cost: { wood: 4, stone: 2 },
    radius: 1.6,
    maxSlope: 0.42,
    // Solid. The collider is what makes this a wall rather than a picture of
    // one, and it is the only structure that decides where a warband can go.
    solid: true,
    solidRadius: 1.5,
    height: 2.3,
    build: buildPalisade,
    blurb: 'a wall, and something has to go round it',
  },

  // The most expensive thing in the world, and the only one that is not about
  // staying alive. Everything else here is shelter, storage or defence — a
  // season's work that makes the next season survivable. This is a season's
  // work that makes the next VALLEY reachable, which is a different kind of
  // want entirely, and it is the first thing in the game you build because you
  // want to rather than because you are cold.
  //
  // The steep `maxSlope` is the feature, not a concession: this is the one
  // structure that BELONGS on a hillside, because a hillside is the only place
  // it is any use. See world/glider.js.
  glider: {
    id: 'glider',
    name: 'Glider',
    verb: 'build',
    cost: GLIDER.cost,
    radius: 4.6, // nine metres of span needs the room
    maxSlope: 0.55,
    flyable: true,
    build: buildGlider,
    blurb: 'a wing of branches and hide — carry it up a hill',
  },
};

// ── geometry ────────────────────────────────────────────────────────────────

let cache = null;
function geometries() {
  if (cache) return cache;
  const rand = makeRandom('structures');
  cache = {};

  // Windbreak: a leaning hurdle of stakes woven with brush.
  {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const t = (i / 6 - 0.5) * 3.2;
      const h = 1.4 + rand() * 0.35;
      const s = new THREE.CylinderGeometry(0.055, 0.075, h, 5);
      s.rotateX(-0.18);
      s.translate(t, h * 0.5, 0);
      parts.push(paint(s, WOOD));
    }
    for (let i = 0; i < 4; i++) {
      const y = 0.32 + i * 0.32;
      const w = new THREE.CylinderGeometry(0.05, 0.05, 3.3, 5);
      w.rotateZ(Math.PI / 2);
      w.translate(0, y, -y * 0.18 + (rand() - 0.5) * 0.06);
      parts.push(paint(w, WOOD_PALE));
    }
    cache.windbreak = parts;
  }

  // Lean-to: a sloping roof off a ridgepole, skinned with hide.
  {
    const parts = [];
    const pole = new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6);
    pole.rotateZ(Math.PI / 2);
    pole.translate(0, 1.85, -1.05);
    parts.push(paint(pole, WOOD));
    for (const x of [-1.5, 1.5]) {
      const leg = new THREE.CylinderGeometry(0.07, 0.09, 1.9, 5);
      leg.translate(x, 0.95, -1.05);
      parts.push(paint(leg, WOOD));
    }
    // The roof plane, sloping down to the ground at the front.
    const roof = new THREE.BoxGeometry(3.2, 0.09, 2.6);
    roof.rotateX(-0.62);
    roof.translate(0, 1.15, -0.1);
    parts.push(paint(roof, HIDE_C));
    for (let i = 0; i < 5; i++) {
      const t = (i / 4 - 0.5) * 3.0;
      const r = new THREE.CylinderGeometry(0.045, 0.05, 2.7, 5);
      r.rotateX(0.95);
      r.translate(t, 1.1, -0.12);
      parts.push(paint(r, WOOD_PALE));
    }
    const thatch = new THREE.BoxGeometry(3.1, 0.14, 0.5);
    thatch.rotateX(-0.62);
    thatch.translate(0, 0.36, 0.9);
    parts.push(paint(thatch, THATCH));
    cache.leanto = parts;
  }

  // Store: a raised box on legs, off the ground and away from animals.
  {
    const parts = [];
    for (const [x, z] of [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]]) {
      const leg = new THREE.CylinderGeometry(0.06, 0.07, 0.72, 5);
      leg.translate(x, 0.36, z);
      parts.push(paint(leg, WOOD));
    }
    const box = new THREE.BoxGeometry(1.25, 0.72, 1.25);
    box.translate(0, 1.08, 0);
    parts.push(paint(box, WOOD_PALE));
    const lid = new THREE.BoxGeometry(1.36, 0.1, 1.36);
    lid.translate(0, 1.49, 0);
    parts.push(paint(lid, WOOD));
    const band = new THREE.BoxGeometry(1.3, 0.09, 0.09);
    band.translate(0, 1.2, 0.64);
    parts.push(paint(band, STONE_C));
    cache.store = parts;
  }

  // Holt: a low heap of sticks and turf over a burrow mouth. Small, scruffy,
  // and obviously made by someone who cared rather than by a builder.
  {
    const parts = [];
    for (let i = 0; i < 11; i++) {
      const a = rand() * Math.PI * 2;
      const len = 0.6 + rand() * 0.5;
      const s = new THREE.CylinderGeometry(0.035, 0.045, len, 5);
      s.rotateZ(Math.PI / 2 - (0.5 + rand() * 0.6));
      s.rotateY(a);
      s.translate(Math.cos(a) * 0.22, 0.16 + rand() * 0.18, Math.sin(a) * 0.22);
      parts.push(paint(s, rand() < 0.4 ? WOOD_PALE : WOOD));
    }
    const turf = new THREE.IcosahedronGeometry(0.52, 1);
    turf.scale(1, 0.42, 1);
    turf.translate(0, 0.1, 0);
    parts.push(paint(turf, new THREE.Color(0x4c5636)));
    // The mouth: a dark hole, which is the only bit that has to read clearly.
    const mouth = new THREE.CylinderGeometry(0.17, 0.19, 0.3, 8);
    mouth.rotateX(Math.PI / 2);
    mouth.translate(0, 0.16, 0.42);
    parts.push(paint(mouth, new THREE.Color(0x120f0c)));
    cache.holt = parts;
  }

  // Palisade: three heavy stakes, sharpened, driven in a short arc.
  {
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.42;
      const h = 2.1 + rand() * 0.3;
      const s = new THREE.CylinderGeometry(0.13, 0.16, h, 7);
      s.rotateZ((rand() - 0.5) * 0.08);
      s.translate(Math.sin(a) * 1.25, h * 0.5, Math.cos(a) * 0.3);
      parts.push(paint(s, WOOD));
      const tip = new THREE.ConeGeometry(0.13, 0.34, 7);
      tip.translate(Math.sin(a) * 1.25, h + 0.14, Math.cos(a) * 0.3);
      parts.push(paint(tip, WOOD_PALE));
    }
    const rail = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5);
    rail.rotateZ(Math.PI / 2);
    rail.translate(0, 1.35, 0.3);
    parts.push(paint(rail, WOOD_PALE));
    cache.palisade = parts;
  }

  // Glider: a wing of bent branches with hide stretched over it, sitting nose
  // down on the grass waiting to be picked up. Deliberately BIG — nine metres
  // of span — because the whole point of it is that it is the largest thing
  // anybody in this world has ever made, and it should stop you when you come
  // over the ridge and find one somebody else built.
  {
    const parts = [];
    const HIDE_WING = new THREE.Color(0x9a7f5c);
    const span = 4.5;   // half-span
    const chord = 2.1;

    // Two wing halves, angled up into a shallow dihedral. Flat plates rather
    // than an aerofoil, which is honest: this thing is a stretched skin, and
    // the model in glider.js is not reading the geometry anyway.
    for (const sign of [1, -1]) {
      const panel = new THREE.BoxGeometry(span, 0.07, chord);
      panel.translate(sign * span * 0.5, 0, 0);
      panel.rotateZ(-sign * 0.11); // dihedral — what keeps it the right way up
      panel.translate(0, 1.55, 0);
      parts.push(paint(panel, HIDE_WING));

      // Ribs, so it reads as made rather than moulded.
      for (let i = 1; i <= 3; i++) {
        const rib = new THREE.CylinderGeometry(0.035, 0.035, chord * 1.02, 5);
        rib.rotateX(Math.PI / 2);
        rib.translate(sign * (i / 3.5) * span, 0, 0);
        rib.rotateZ(-sign * 0.11);
        rib.translate(0, 1.6, 0);
        parts.push(paint(rib, WOOD_PALE));
      }
    }

    // The leading-edge spar: the one piece that has to be a whole branch, and
    // the reason this costs fourteen of them.
    const spar = new THREE.CylinderGeometry(0.075, 0.075, span * 2, 6);
    spar.rotateZ(Math.PI / 2);
    spar.translate(0, 1.58, -chord * 0.45);
    parts.push(paint(spar, WOOD));

    // Keel, running fore and aft, and the A-frame you hang from.
    const keel = new THREE.CylinderGeometry(0.06, 0.06, chord * 1.6, 6);
    keel.rotateX(Math.PI / 2);
    keel.translate(0, 1.5, 0.1);
    parts.push(paint(keel, WOOD));
    for (const sign of [1, -1]) {
      const strut = new THREE.CylinderGeometry(0.05, 0.05, 1.7, 5);
      strut.rotateZ(sign * 0.42);
      strut.translate(sign * 0.34, 0.78, 0.15);
      parts.push(paint(strut, WOOD_PALE));
    }
    // A nose skid, so it is obviously resting on the ground rather than hovering.
    const skid = new THREE.CylinderGeometry(0.045, 0.045, 1.1, 5);
    skid.rotateX(Math.PI / 2.6);
    skid.translate(0, 0.5, -0.85);
    parts.push(paint(skid, WOOD_PALE));
    cache.glider = parts;
  }

  return cache;
}

// Function DECLARATIONS, not const arrows. The table above refers to these
// before this line is reached, and `const` is not hoisted — as arrows they
// threw "Cannot access 'buildWindbreak' before initialization" the first time
// the module was actually executed. The bundler was perfectly happy with it;
// only running the code found it.
function buildWindbreak(g) {
  addParts(g, 'windbreak');
}
function buildLeanTo(g) {
  addParts(g, 'leanto');
}
function buildStore(g) {
  addParts(g, 'store');
}
function buildPalisade(g) {
  addParts(g, 'palisade');
}
function buildHolt(g) {
  addParts(g, 'holt');
}
function buildGlider(g) {
  addParts(g, 'glider');
}

function addParts(group, key) {
  for (const geo of geometries()[key]) {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
}

// ── gathering ───────────────────────────────────────────────────────────────
//
// "Gather (wood from trees, stone from rocks — both already exist as objects)."
// They do, and better than that: the scatter already tags every collider it
// makes as 'tree' or 'rock'. So harvesting needs no new world data at all — it
// asks the collision field what is standing next to you.
//
// A harvested tree is not removed from the scatter. It cannot be: the scatter
// is a pure function of the seed, regenerated whenever you walk back, and
// making it stateful to delete one tree would cost the whole streaming design
// to save a visual detail. Instead the HARVEST is remembered — a small set of
// rounded coordinates with an expiry — which is the same "the world is free,
// the diffs are not" trick the saves and the loot use.

export class Harvest {
  constructor() {
    this.taken = new Map(); // key -> in-game hour it becomes available again
  }

  static key(x, z) {
    return `${Math.round(x * 4)},${Math.round(z * 4)}`;
  }

  /** The nearest tree or rock you could work on, from the collision field. */
  nearestSource(field, pos, range = STRUCTURES.useRange, hours = 0) {
    if (!field?.list) return null;
    let best = null;
    let bestD = range;
    for (const c of field.list) {
      if (c.tag !== 'tree' && c.tag !== 'rock') continue;
      // Tree colliders come in pairs — a trunk cylinder and a crown sphere.
      // Only the trunk is something you can stand at and cut.
      if (c.tag === 'tree' && c.kind !== 1) continue;
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (d >= bestD) continue;
      if (this.isTaken(c.x, c.z, hours)) continue;
      bestD = d;
      best = c;
    }
    if (!best) return null;
    return {
      tag: best.tag,
      x: best.x,
      z: best.z,
      distance: bestD,
      item: best.tag === 'tree' ? 'wood' : 'stone',
      amount: best.tag === 'tree' ? STRUCTURES.chopYield : STRUCTURES.quarryYield,
      seconds: best.tag === 'tree' ? STRUCTURES.chopSeconds : STRUCTURES.quarrySeconds,
      verb: best.tag === 'tree' ? 'cut' : 'quarry',
    };
  }

  /**
   * PURE. Asking whether something has been harvested must not change whether
   * it has been harvested.
   *
   * This used to expire the record as a side effect of the query, which is a
   * tidy-looking lazy cleanup and a trap: any code that asked about a FUTURE
   * hour silently deleted the entry. It cost a confusing test failure where a
   * cut tree stopped being cut because something had checked whether it would
   * have regrown by tomorrow. Expiry is now `prune`, and it is called on a
   * schedule rather than by accident.
   */
  isTaken(x, z, hours) {
    const until = this.taken.get(Harvest.key(x, z));
    // Hours wrap at 24, so the caller passes a monotonically rising count.
    return until !== undefined && hours < until;
  }

  /** Drop records that have regrown. Cheap, and safe to call whenever. */
  prune(hours) {
    for (const [k, until] of this.taken) if (hours >= until) this.taken.delete(k);
  }

  take(x, z, hours) {
    this.taken.set(Harvest.key(x, z), hours + STRUCTURES.regrowHours);
  }

  serialise() {
    return [...this.taken.entries()];
  }

  restore(list) {
    this.taken = new Map(list ?? []);
  }
}

// ── the system ──────────────────────────────────────────────────────────────

let nextId = 1;

export class Structures {
  constructor(scene, deps = {}) {
    this.scene = scene;
    this.deps = deps; // { audio, colliders }
    this.root = new THREE.Group();
    scene.add(this.root);
    this.all = [];
  }

  /**
   * Can something of this kind stand here?
   *
   * Returns a reason rather than a boolean, because "you cannot build here" is
   * the least useful sentence in any survival game — the player needs to know
   * whether to step sideways or give up entirely.
   */
  canPlaceAt(kind, x, z) {
    const spec = BUILDABLE[kind];
    if (!spec) return { ok: false, why: 'no such thing' };

    const y = heightAt(x, z);
    if (y < WATER_LEVEL + 0.4) return { ok: false, why: 'not in the water' };
    if (slopeAt(x, z) > spec.maxSlope) return { ok: false, why: 'the ground is too steep' };

    const region = regionAt(x, z);
    if (region.bog > 0.55) return { ok: false, why: 'it would sink' };

    for (const s of this.all) {
      const d = Math.hypot(s.x - x, s.z - z);
      // 0.9 of the summed radii demanded 3.9 m between a windbreak and a
      // lean-to, which is not a camp, it is a hamlet. Real camps are tight —
      // the point of a windbreak is to be next to the thing it shelters. This
      // still refuses genuine overlap; it just stops insisting on a courtyard.
      const need = (BUILDABLE[s.kind].radius + spec.radius) * STRUCTURES.spacing;
      if (d < need) return { ok: false, why: `too close to the ${BUILDABLE[s.kind].name.toLowerCase()}` };
    }
    return { ok: true, y };
  }

  /**
   * Put one down. `owner` is a player id, or null in single-player.
   *
   * Ownership is recorded but not ENFORCED here: what it means to own
   * something is a rules question, and rules live in the ruleset. This just
   * remembers who built it, which is the part that has to survive a save.
   */
  place(kind, x, z, yaw = 0, owner = null) {
    const check = this.canPlaceAt(kind, x, z);
    if (!check.ok) return check;

    const spec = BUILDABLE[kind];
    const g = new THREE.Group();
    g.position.set(x, check.y, z);
    g.rotation.y = yaw;
    spec.build(g);
    this.root.add(g);

    const s = {
      id: nextId++,
      kind,
      x,
      z,
      y: check.y,
      yaw,
      owner,
      object: g,
      // A store carries its own inventory. Kept as a plain array of stacks so
      // it serialises without knowing anything about the Inventory class.
      contents: spec.storage ? [] : null,
    };
    this.all.push(s);

    // Solid things get a collider, which is what makes a palisade a wall
    // rather than a picture of one. The projectile system and the player
    // collision both already read this field.
    if (spec.solid && this.deps.colliders) {
      this.deps.colliders.add?.(x, check.y, z, spec.solidRadius, spec.height);
      s.collided = true;
    }

    this.deps.audio?.impact?.('wood', { x, y: check.y + 1, z });
    return { ok: true, structure: s };
  }

  remove(s) {
    const i = this.all.indexOf(s);
    if (i < 0) return false;
    this.root.remove(s.object);
    this.all.splice(i, 1);
    return true;
  }

  /** Whatever you are standing close enough to use. */
  nearest(pos, range = STRUCTURES.useRange) {
    let best = null;
    let bestD = range;
    for (const s of this.all) {
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best ? { structure: best, distance: bestD } : null;
  }

  /**
   * How much shelter everything nearby adds up to, 0..1.
   *
   * Combined multiplicatively rather than summed, so two windbreaks are better
   * than one but never total — and so a camp built out of six of them does not
   * quietly become a bunker.
   */
  shelterAt(x, z) {
    let open = 1;
    for (const s of this.all) {
      const spec = BUILDABLE[s.kind];
      if (!spec.shelter) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d > spec.shelterRadius) continue;
      // Full strength well inside the radius, then falling to nothing at the
      // edge. At 0.4 the plateau was so small that anywhere you would actually
      // stand was already on the way down.
      const strength = spec.shelter * smoothstep(spec.shelterRadius, spec.shelterRadius * 0.7, d);
      open *= 1 - strength;
    }
    return clamp(1 - open, 0, 0.95);
  }

  /** Is there a roof over this point? Rain stops mattering under one. */
  roofedAt(x, z) {
    for (const s of this.all) {
      const spec = BUILDABLE[s.kind];
      if (!spec.roof) continue;
      if (Math.hypot(s.x - x, s.z - z) <= spec.shelterRadius * 0.8) return true;
    }
    return false;
  }

  /** What it would cost, and whether an inventory can pay. */
  static affordable(kind, inventory) {
    const spec = BUILDABLE[kind];
    if (!spec) return { ok: false, why: 'no such thing' };
    for (const [item, n] of Object.entries(spec.cost)) {
      if (inventory.countOf(item) < n) {
        return { ok: false, why: `need ${n} ${item.replace(/_/g, ' ')}` };
      }
    }
    return { ok: true };
  }

  static pay(kind, inventory) {
    for (const [item, n] of Object.entries(BUILDABLE[kind].cost)) inventory.remove(item, n);
  }

  /**
   * The best thing to build right now, for a one-key prompt.
   *
   * "Cheapest affordable thing" was the obvious rule and it was wrong: it
   * always returned a windbreak, so pressing build four times tried to put
   * four windbreaks on the same spot and three of them were refused. B could
   * only ever build one kind of thing.
   *
   * The rule that works is "the cheapest thing this camp does not already
   * have". Pressing build repeatedly then COMPLETES a camp — windbreak,
   * lean-to, store, palisade — which is what the key is actually for, and it
   * still falls back to a duplicate once you have one of everything.
   */
  bestToBuild(inventory, x, z, radius = 9) {
    const here = new Set();
    for (const s of this.all) {
      if (Math.hypot(s.x - x, s.z - z) <= radius) here.add(s.kind);
    }
    let fallback = null;
    for (const spec of Object.values(BUILDABLE)) {
      if (!Structures.affordable(spec.id, inventory).ok) continue;
      if (!here.has(spec.id)) return spec;
      fallback ??= spec;
    }
    return fallback;
  }

  /** Kept for callers that only want to know if anything is affordable. */
  static bestAvailable(inventory) {
    for (const spec of Object.values(BUILDABLE)) {
      if (Structures.affordable(spec.id, inventory).ok) return spec;
    }
    return null;
  }

  // ── persistence ───────────────────────────────────────────────────────────
  //
  // The whole point of the phase: "build a camp, log off, and find it still
  // standing next week — with your friend's additions to it." Structures are
  // the first thing in this world that is NOT derivable from the seed, so
  // unlike terrain and creatures and place names they have to be written down
  // in full. That is what makes them a mark rather than scenery.

  serialise() {
    return this.all.map((s) => ({
      k: s.kind,
      x: Math.round(s.x * 100) / 100,
      z: Math.round(s.z * 100) / 100,
      r: Math.round(s.yaw * 1000) / 1000,
      o: s.owner,
      c: s.contents ?? undefined,
    }));
  }

  restore(list) {
    for (const s of [...this.all]) this.remove(s);
    for (const d of list ?? []) {
      const res = this.place(d.k, d.x, d.z, d.r ?? 0, d.o ?? null);
      if (res.ok && d.c && res.structure.contents) res.structure.contents = d.c;
    }
  }

  get stats() {
    const byKind = {};
    for (const s of this.all) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
    return { total: this.all.length, byKind };
  }
}
