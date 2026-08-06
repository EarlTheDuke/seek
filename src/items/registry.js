// ── registry.js ─────────────────────────────────────────────────────────────
// Every item in the world, as data.
//
// This is the extension point. Adding a crossbow means adding one entry here
// and one behaviour class in `weapons/`; inventory, the hotbar, the pickup
// system, the drop logic and the projectile renderer all read from this table
// and need no changes at all.
//
// Geometry is built in code like everything else in this project — there are no
// model files. Each builder returns a merged, vertex-coloured BufferGeometry so
// a whole item is one draw call with one shared material.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SURVIVAL } from '../config.js';

const WOOD = new THREE.Color(0x6f4c2b);
const WOOD_DARK = new THREE.Color(0x46331f);
const HORN = new THREE.Color(0x2e2a24);
const STEEL = new THREE.Color(0x9fa6ad);
const FEATHER = new THREE.Color(0xd9d3c6);
const FEATHER_RED = new THREE.Color(0xa8442f);
const LEATHER = new THREE.Color(0x5b4130);

/** One material for every item in the game. Colour comes from the vertices. */
export const itemMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.72,
  metalness: 0.08,
});

/** Bowstring: a real line, because a bowstring is one pixel wide at any range. */
export const stringMaterial = new THREE.LineBasicMaterial({ color: 0xcfc7b2 });

/** Give a geometry flat vertex colours and strip anything that blocks merging. */
function paint(geo, color, jitter = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    // One value per triangle keeps facets crisp instead of smearing.
    const k = 1 + (((i * 2654435761) % 1000) / 1000 - 0.5) * jitter;
    for (let v = 0; v < 3; v++) {
      arr[(i + v) * 3] = color.r * k;
      arr[(i + v) * 3 + 1] = color.g * k;
      arr[(i + v) * 3 + 2] = color.b * k;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function finish(parts) {
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  for (const p of parts) p.dispose();
  return merged;
}

// ── arrow ───────────────────────────────────────────────────────────────────

/**
 * An arrow, built pointing along +Z so a projectile can be aimed with a single
 * `setFromUnitVectors(Z_AXIS, velocity)` and needs no correction quaternion.
 * The origin sits at the centre of the shaft.
 */
export function buildArrowGeometry(length = 0.72) {
  const parts = [];

  const shaft = new THREE.CylinderGeometry(0.0055, 0.0048, length, 7, 1);
  shaft.rotateX(Math.PI / 2); // +Y cylinder -> +Z arrow
  parts.push(paint(shaft, WOOD, 0.18));

  const head = new THREE.ConeGeometry(0.013, 0.062, 7);
  head.rotateX(Math.PI / 2);
  head.translate(0, 0, length / 2 + 0.028);
  parts.push(paint(head, STEEL, 0.12));

  const nock = new THREE.CylinderGeometry(0.0072, 0.0072, 0.03, 6);
  nock.rotateX(Math.PI / 2);
  nock.translate(0, 0, -length / 2 + 0.012);
  parts.push(paint(nock, HORN, 0.1));

  // Three fletchings at 120°, angled slightly for the look of real spin vanes.
  for (let i = 0; i < 3; i++) {
    const vane = new THREE.PlaneGeometry(0.016, 0.075);
    vane.translate(0.011, 0, 0); // stand it off the shaft
    vane.rotateZ((i / 3) * Math.PI * 2);
    vane.rotateY(Math.PI / 2);
    vane.translate(0, 0, -length / 2 + 0.075);
    parts.push(paint(vane, i === 0 ? FEATHER_RED : FEATHER, 0.08));
  }

  return finish(parts);
}

// ── bow ─────────────────────────────────────────────────────────────────────

/**
 * A recurve bow lying in the XY plane, limbs along ±Y, shooting toward -Z.
 *
 * Returned as a group rather than one geometry because the string has to be
 * re-pointed every frame as you draw, and because the limbs bend.
 */
export function buildBow() {
  const group = new THREE.Group();
  const height = 0.58; // half-height, tip to grip

  const riser = new THREE.CylinderGeometry(0.019, 0.019, 0.26, 8);
  const grip = new THREE.CylinderGeometry(0.023, 0.023, 0.12, 8);
  const riserMesh = new THREE.Mesh(finish([paint(riser, WOOD_DARK, 0.12), paint(grip, LEATHER, 0.1)]), itemMaterial);
  group.add(riserMesh);

  // Each limb is a tube swept along a recurve profile: out, up, then the tip
  // curling back toward the archer.
  const limbs = [];
  for (const sign of [1, -1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, sign * 0.11, 0),
      new THREE.Vector3(0, sign * 0.3, -0.028),
      new THREE.Vector3(0, sign * 0.46, -0.052),
      new THREE.Vector3(0, sign * height, -0.03),
      new THREE.Vector3(0, sign * (height + 0.045), 0.028),
    ]);
    const tube = new THREE.TubeGeometry(curve, 20, 0.0135, 6, false);
    const mesh = new THREE.Mesh(paint(tube, WOOD, 0.14), itemMaterial);
    // The curve lies in the YZ plane, so the tube's cross-section spans X and
    // Z. Widening X alone turns the round tube into a flat laminate — which is
    // what a recurve limb actually is, and it stops the bow reading as a stick
    // when you are looking at its face in first person.
    mesh.scale.set(3.1, 1, 0.95);
    mesh.geometry.computeVertexNormals();
    group.add(mesh);
    limbs.push({ mesh, tip: curve.getPoint(1).clone() });
  }

  // The string: top nock -> nocking point -> bottom nock. The middle vertex is
  // what moves when you draw.
  const stringGeo = new THREE.BufferGeometry().setFromPoints([
    limbs[0].tip,
    new THREE.Vector3(0, 0, 0.02),
    limbs[1].tip,
  ]);
  const string = new THREE.Line(stringGeo, stringMaterial);
  group.add(string);

  group.userData.string = string;
  group.userData.tips = [limbs[0].tip, limbs[1].tip];
  return group;
}

// ── quiver (world loot) ─────────────────────────────────────────────────────

function buildQuiverGeometry() {
  const parts = [];
  const body = new THREE.CylinderGeometry(0.075, 0.06, 0.42, 10, 1, true);
  parts.push(paint(body, LEATHER, 0.14));
  const base = new THREE.CircleGeometry(0.06, 10);
  base.rotateX(Math.PI / 2);
  base.translate(0, -0.21, 0);
  parts.push(paint(base, LEATHER, 0.1));
  // A few shafts poking out of the top.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const shaft = new THREE.CylinderGeometry(0.005, 0.005, 0.3, 5);
    shaft.translate(Math.cos(a) * 0.03, 0.3, Math.sin(a) * 0.03);
    shaft.rotateZ(Math.cos(a) * 0.12);
    parts.push(paint(shaft, WOOD, 0.2));
    const vane = new THREE.PlaneGeometry(0.014, 0.05);
    vane.translate(Math.cos(a) * 0.03, 0.42, Math.sin(a) * 0.03);
    parts.push(paint(vane, i % 2 ? FEATHER : FEATHER_RED, 0.1));
  }
  return finish(parts);
}

// ── the table ───────────────────────────────────────────────────────────────

let arrowGeo = null;
let quiverGeo = null;

export const ITEMS = {
  bow: {
    id: 'bow',
    name: 'Bow',
    kind: 'weapon',
    stack: 1,
    behaviour: 'bow', // resolved in weapons/index.js
    ammo: 'arrow', // what it consumes
    /** World representation, used by pickups and drops. */
    makeObject: () => {
      const g = buildBow();
      g.scale.setScalar(0.85);
      return g;
    },
  },

  arrow: {
    id: 'arrow',
    name: 'Arrow',
    kind: 'ammo',
    stack: 99,
    geometry: () => (arrowGeo ??= buildArrowGeometry()),
    makeObject: () => new THREE.Mesh(ITEMS.arrow.geometry(), itemMaterial),
  },

  quiver: {
    id: 'quiver',
    name: 'Quiver',
    kind: 'container',
    stack: 1,
    // Opening a quiver gives you arrows rather than an item you carry.
    yields: { item: 'arrow', min: 3, max: 7 },
    geometry: () => (quiverGeo ??= buildQuiverGeometry()),
    makeObject: () => new THREE.Mesh(ITEMS.quiver.geometry(), itemMaterial),
  },
};

// Quarry. Referenced by creature drop tables; carried, dropped and picked up by
// exactly the same machinery as everything else.
let venisonGeo = null;
let hideGeo = null;

ITEMS.venison = {
  id: 'venison',
  name: 'Venison',
  kind: 'material',
  stack: 20,
  geometry: () => {
    if (venisonGeo) return venisonGeo;
    const g = new THREE.IcosahedronGeometry(0.11, 1);
    g.scale(1.3, 0.7, 1);
    return (venisonGeo = finish([paint(g, new THREE.Color(0x8c3b34), 0.22)]));
  },
  makeObject: () => new THREE.Mesh(ITEMS.venison.geometry(), itemMaterial),
};

ITEMS.hide = {
  id: 'hide',
  name: 'Hide',
  kind: 'material',
  stack: 20,
  geometry: () => {
    if (hideGeo) return hideGeo;
    // A rolled pelt: a squashed cylinder on its side.
    const g = new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8);
    g.rotateZ(Math.PI / 2);
    g.scale(1, 0.75, 1);
    return (hideGeo = finish([paint(g, new THREE.Color(0x7d5a37), 0.18)]));
  },
  makeObject: () => new THREE.Mesh(ITEMS.hide.geometry(), itemMaterial),
};

// ── survival items ──────────────────────────────────────────────────────────
// Fuel, food and clothing. `kind` is what the rest of the game switches on:
// 'fuel' can feed a fire, 'food' can be eaten, 'clothing' insulates while it is
// in your pack. Adding a warmer cloak is a row here, not a code change.

let woodGeo = null;
let cookedGeo = null;
let cloakGeo = null;

ITEMS.wood = {
  id: 'wood',
  name: 'Branch',
  kind: 'fuel',
  stack: 20,
  fuel: 1, // one branch of burn time — see SURVIVAL.fireFuelPerWood
  geometry: () => {
    if (woodGeo) return woodGeo;
    const parts = [];
    const main = new THREE.CylinderGeometry(0.035, 0.045, 0.62, 6);
    main.rotateZ(Math.PI / 2 - 0.25);
    parts.push(paint(main, new THREE.Color(0x574026), 0.2));
    const stub = new THREE.CylinderGeometry(0.02, 0.026, 0.2, 5);
    stub.rotateZ(0.7);
    stub.translate(0.08, 0.07, 0.02);
    parts.push(paint(stub, new THREE.Color(0x4a3520), 0.2));
    return (woodGeo = finish(parts));
  },
  makeObject: () => new THREE.Mesh(ITEMS.wood.geometry(), itemMaterial),
};

// Quarried from the boulders that were already scattered across this world
// doing nothing but casting shadows. Heavier than wood — a small stack, so
// carrying stone is a decision rather than a formality.
let stoneGeo = null;
ITEMS.stone = {
  id: 'stone',
  name: 'Stone',
  kind: 'material',
  stack: 10,
  geometry: () => {
    if (stoneGeo) return stoneGeo;
    const parts = [];
    const a = new THREE.IcosahedronGeometry(0.15, 0);
    a.scale(1, 0.75, 0.9);
    parts.push(paint(a, new THREE.Color(0x5f594e), 0.25));
    const b = new THREE.IcosahedronGeometry(0.09, 0);
    b.translate(0.13, -0.03, 0.05);
    parts.push(paint(b, new THREE.Color(0x4c473e), 0.25));
    return (stoneGeo = finish(parts));
  },
  makeObject: () => new THREE.Mesh(ITEMS.stone.geometry(), itemMaterial),
};

// A hand axe: a split stone head lashed to a haft. The first thing in this
// world you MAKE that is a tool rather than a comfort, and the shape says so —
// it is crude, and it is obviously crude, because you made it by a fire out of
// a stick and a rock.
let axeGeo = null;
ITEMS.axe = {
  id: 'axe',
  name: 'Hand Axe',
  kind: 'weapon',
  stack: 1,
  behaviour: 'melee', // resolved in weapons/index.js
  // No `ammo` — that absence is the whole difference between it and the bow,
  // and the weapon host already handles a weapon that consumes nothing.
  geometry: () => {
    if (axeGeo) return axeGeo;
    const parts = [];
    const haft = new THREE.CylinderGeometry(0.022, 0.028, 0.56, 6);
    haft.rotateZ(0.18);
    parts.push(paint(haft, new THREE.Color(0x6b5232), 0.25));
    // The head: a wedge, knapped rather than cast.
    const head = new THREE.IcosahedronGeometry(0.085, 0);
    head.scale(0.55, 1, 1.5);
    head.rotateZ(0.18);
    head.translate(0.055, 0.25, 0);
    parts.push(paint(head, new THREE.Color(0x615c53), 0.3));
    const edge = new THREE.IcosahedronGeometry(0.05, 0);
    edge.scale(0.3, 0.85, 1.15);
    edge.translate(0.09, 0.27, 0.055);
    parts.push(paint(edge, new THREE.Color(0x8b8579), 0.3));
    // The binding, which is the detail that makes it read as made by hand.
    const lash = new THREE.TorusGeometry(0.04, 0.011, 5, 8);
    lash.rotateY(Math.PI / 2);
    lash.rotateZ(0.18);
    lash.translate(0.045, 0.21, 0);
    parts.push(paint(lash, new THREE.Color(0x4a3a26), 0.25));
    return (axeGeo = finish(parts));
  },
  makeObject: () => new THREE.Mesh(ITEMS.axe.geometry(), itemMaterial),
};

// Out of the lake. Less filling than venison and far easier to come by, which
// is exactly the trade a river should offer: a reliable small meal against an
// occasional large one.
let trout = null;
let troutCooked = null;
ITEMS.fish = {
  id: 'fish',
  name: 'Trout',
  kind: 'food',
  stack: 12,
  geometry: () => {
    if (trout) return trout;
    const parts = [];
    const body = new THREE.CapsuleGeometry(0.05, 0.17, 3, 7);
    body.rotateZ(Math.PI / 2);
    body.scale(1, 0.72, 1);
    parts.push(paint(body, new THREE.Color(0x53656c), 0.32));
    const belly = new THREE.CapsuleGeometry(0.034, 0.14, 3, 6);
    belly.rotateZ(Math.PI / 2);
    belly.translate(0, -0.022, 0);
    parts.push(paint(belly, new THREE.Color(0xb2b9a8), 0.32));
    const tail = new THREE.ConeGeometry(0.055, 0.09, 3);
    tail.rotateZ(Math.PI / 2);
    tail.scale(1, 1, 0.35);
    tail.translate(-0.16, 0, 0);
    parts.push(paint(tail, new THREE.Color(0x8fa2a0), 0.32));
    return (trout = finish(parts));
  },
  makeObject: () => new THREE.Mesh(ITEMS.fish.geometry(), itemMaterial),
};

ITEMS.fish_cooked = {
  id: 'fish_cooked',
  name: 'Cooked Trout',
  kind: 'food',
  stack: 12,
  geometry: () => {
    if (troutCooked) return troutCooked;
    const parts = [];
    const body = new THREE.CapsuleGeometry(0.05, 0.17, 3, 7);
    body.rotateZ(Math.PI / 2);
    body.scale(1, 0.7, 1);
    parts.push(paint(body, new THREE.Color(0xb07a4a), 0.4));
    const char = new THREE.CapsuleGeometry(0.036, 0.12, 3, 6);
    char.rotateZ(Math.PI / 2);
    char.translate(0.01, 0.03, 0);
    parts.push(paint(char, new THREE.Color(0x6d4426), 0.4));
    return (troutCooked = finish(parts));
  },
  makeObject: () => new THREE.Mesh(ITEMS.fish_cooked.geometry(), itemMaterial),
};

ITEMS.venison_cooked = {
  id: 'venison_cooked',
  name: 'Cooked Venison',
  kind: 'food',
  stack: 20,
  geometry: () => {
    if (cookedGeo) return cookedGeo;
    const g = new THREE.IcosahedronGeometry(0.11, 1);
    g.scale(1.25, 0.7, 1);
    return (cookedGeo = finish([paint(g, new THREE.Color(0x5e3320), 0.24)]));
  },
  makeObject: () => new THREE.Mesh(ITEMS.venison_cooked.geometry(), itemMaterial),
};

ITEMS.cloak = {
  id: 'cloak',
  name: 'Hide Cloak',
  kind: 'clothing',
  stack: 1,
  // Degrees of effective ambient added while carried. Halved when soaked —
  // see SURVIVAL.wetInsulationLoss.
  insulation: 9,
  geometry: () => {
    if (cloakGeo) return cloakGeo;
    const parts = [];
    const body = new THREE.CylinderGeometry(0.16, 0.26, 0.42, 9, 1, true);
    parts.push(paint(body, new THREE.Color(0x6b4d31), 0.16));
    const collar = new THREE.TorusGeometry(0.15, 0.045, 6, 10);
    collar.rotateX(Math.PI / 2);
    collar.translate(0, 0.2, 0);
    parts.push(paint(collar, new THREE.Color(0x4f3925), 0.14));
    return (cloakGeo = finish(parts));
  },
  makeObject: () => new THREE.Mesh(ITEMS.cloak.geometry(), itemMaterial),
};

// Raw venison is food too, just poor food — declared here so `kind` is right.
ITEMS.venison.kind = 'food';

// ── where a thing comes from ────────────────────────────────────────────────
//
// One line each, in the words a person would use. This is the only fact about
// an item that the game knew and never said out loud: you could carry a stone
// for an hour without being told that a second one and a branch make an axe,
// and you could want a hide with no idea that hides are on deer.
//
// It lives HERE, next to the item, rather than in the panel that displays it,
// for the same reason the cost lives in BUILDABLE: adding a crossbow should be
// one row, and a row that cannot explain itself is a row someone has to
// remember to document twice.
const SOURCES = {
  wood: 'fallen branches, on the ground under woodland',
  stone: 'quarry a boulder — much faster with an axe',
  hide: 'from a deer, once you have killed one',
  venison: 'from a deer, once you have killed one',
  fish: 'the loch and the rivers — stand in the shallows',
  arrow: 'fletch them at a fire, or pull them out of what you shot',
  quiver: 'left in barrows and old camps',
  bow: 'you started with it',
  axe: 'knap one at a fire',
  cloak: 'stitch one at a fire',
  fish_cooked: 'cook a trout at a fire',
  venison_cooked: 'cook venison at a fire',
};
for (const [id, source] of Object.entries(SOURCES)) {
  // Assign rather than merge, so a typo'd id here is a loud undefined rather
  // than a silent new item with nothing in it.
  if (ITEMS[id]) ITEMS[id].source = source;
}

export const getItem = (id) => ITEMS[id] ?? null;

/**
 * Total insulation from everything you are actually WEARING.
 *
 * It used to count anything of kind 'clothing' sitting in the pack, which is
 * tidy to code and nonsense to play: you stitched a cloak and nothing happened,
 * because the only thing that changed was a number you could not see. It also
 * meant carrying three cloaks made you three times as warm, which is not how
 * cloaks work.
 *
 * Now one worn garment insulates, once, and putting it on is something you do.
 */
export function insulationOf(inventory) {
  let total = 0;
  // Older saves and the headless sim may hand us a plain object without a worn
  // set; treat that as wearing nothing rather than crashing.
  const worn = inventory?.worn;
  if (!worn?.size) return 0;
  for (const id of worn) {
    if (inventory.countOf(id) < 1) continue; // worn but no longer held
    const def = ITEMS[id];
    if (def?.kind === 'clothing' && def.insulation) total += def.insulation;
  }
  return total;
}

/**
 * Everything you can eat, best meal first.
 *
 * Built from SURVIVAL.food so that adding a food to that table is the only
 * thing anyone ever has to do. The alternative — a hand-written order alongside
 * the table — is what made trout inedible the moment they were added: R said
 * "nothing to eat" while you stood there holding one.
 *
 * IT LIVES HERE, not in main.js, because the browser is no longer the only
 * thing that eats. The server now resolves `intent.eat` for agents, and a
 * second copy of this list in a second file is the same bug again with a longer
 * fuse — the first copy already went stale once.
 */
export const EDIBLE = Object.entries(SURVIVAL.food)
  .sort((a, b) => b[1].fills - a[1].fills)
  .map(([id]) => id);
