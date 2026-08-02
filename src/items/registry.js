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

export const getItem = (id) => ITEMS[id] ?? null;
