// ── creatures/registry.js ───────────────────────────────────────────────────
// Every species, as data.
//
// The extension point for wildlife. A wolf is a new entry here: different hit
// points, different senses, `behaviour: 'stalker'`, a drop table, and a body
// builder. The creature class, the manager, the senses model, damage, death and
// looting all read from this table and need no edits.
//
// Bodies are procedural like everything else — legs, neck, head and tail are
// separate meshes on one group so they can be animated without a skeleton.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_LEVEL } from '../config.js';

const HIDE = new THREE.Color(0x7d5a37);
const HIDE_PALE = new THREE.Color(0xa98a5f);
const HIDE_DARK = new THREE.Color(0x4e3721);
const HORN = new THREE.Color(0x8d7d63);
const EYE = new THREE.Color(0x14100c);

export const creatureMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.86,
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

function merge(parts) {
  const m = mergeGeometries(parts);
  m.computeVertexNormals();
  m.computeBoundingSphere();
  for (const p of parts) p.dispose();
  return m;
}

function mesh(geo) {
  return new THREE.Mesh(geo, creatureMaterial);
}

// ── deer body ───────────────────────────────────────────────────────────────

let deerParts = null;

/** Build the shared geometry once; every deer reuses it. */
function deerGeometry() {
  if (deerParts) return deerParts;

  // Torso: a stretched, flattened sphere reads as a deer's barrel far better
  // than a box, and costs nothing at this poly count.
  const torso = new THREE.IcosahedronGeometry(0.44, 1);
  torso.scale(1.0, 0.86, 1.75);
  const rump = new THREE.IcosahedronGeometry(0.3, 1);
  rump.scale(1, 1, 1);
  rump.translate(0, 0.04, -0.62);
  const chest = new THREE.IcosahedronGeometry(0.3, 1);
  chest.translate(0, 0.02, 0.6);
  const body = merge([paint(torso, HIDE), paint(rump, HIDE), paint(chest, HIDE)]);

  const neckGeo = new THREE.CylinderGeometry(0.11, 0.17, 0.62, 7);
  const neck = merge([paint(neckGeo, HIDE)]);

  const skull = new THREE.IcosahedronGeometry(0.15, 1);
  skull.scale(0.85, 0.9, 1.15);
  const muzzle = new THREE.CylinderGeometry(0.055, 0.09, 0.24, 6);
  muzzle.rotateX(Math.PI / 2);
  muzzle.translate(0, -0.03, 0.19);
  const earL = new THREE.IcosahedronGeometry(0.06, 0);
  earL.scale(0.5, 1, 0.35);
  earL.translate(0.11, 0.11, -0.02);
  const earR = earL.clone();
  earR.translate(-0.22, 0, 0);
  const eyeL = new THREE.IcosahedronGeometry(0.028, 0);
  eyeL.translate(0.1, 0.03, 0.08);
  const eyeR = eyeL.clone();
  eyeR.translate(-0.2, 0, 0);
  const head = merge([
    paint(skull, HIDE),
    paint(muzzle, HIDE_DARK),
    paint(earL, HIDE_PALE),
    paint(earR, HIDE_PALE),
    paint(eyeL, EYE),
    paint(eyeR, EYE),
  ]);

  // Legs pivot at the top, so translate the geometry down from the origin.
  const legGeo = new THREE.CylinderGeometry(0.045, 0.032, 0.78, 6);
  legGeo.translate(0, -0.39, 0);
  const hoof = new THREE.CylinderGeometry(0.038, 0.045, 0.09, 6);
  hoof.translate(0, -0.79, 0);
  const leg = merge([paint(legGeo, HIDE), paint(hoof, HIDE_DARK)]);

  const tailGeo = new THREE.IcosahedronGeometry(0.08, 0);
  tailGeo.scale(0.7, 1.2, 0.5);
  tailGeo.translate(0, -0.06, 0);
  const tail = merge([paint(tailGeo, HIDE_PALE)]);

  // Antlers: a forked branch, only worn by males.
  const antlerParts = [];
  const beam = new THREE.CylinderGeometry(0.018, 0.026, 0.34, 5);
  beam.translate(0, 0.17, 0);
  beam.rotateZ(-0.3);
  antlerParts.push(paint(beam, HORN));
  for (let i = 0; i < 3; i++) {
    const tine = new THREE.CylinderGeometry(0.009, 0.015, 0.15 + i * 0.04, 5);
    tine.translate(0, 0.075 + i * 0.02, 0);
    tine.rotateZ(-0.75 - i * 0.12);
    tine.translate(-0.06 - i * 0.03, 0.13 + i * 0.09, 0.01 * i);
    antlerParts.push(paint(tine, HORN));
  }
  const antler = merge(antlerParts);

  deerParts = { body, neck, head, leg, tail, antler };
  return deerParts;
}

/**
 * Assemble one deer. Returns the group plus direct references to the parts the
 * animator moves, so nothing has to be looked up by name per frame.
 */
function buildDeer(rand) {
  const P = deerGeometry();
  const g = new THREE.Group();

  const body = mesh(P.body);
  body.position.y = 0.86;
  body.castShadow = true;
  g.add(body);

  // Neck pivots at the shoulders; head pivots at the top of the neck. Lowering
  // the neck to graze therefore carries the head with it, for free.
  const neckPivot = new THREE.Object3D();
  neckPivot.position.set(0, 1.06, 0.6);
  const neck = mesh(P.neck);
  neck.position.y = 0.31;
  neck.castShadow = true;
  neckPivot.add(neck);

  const headPivot = new THREE.Object3D();
  headPivot.position.y = 0.62;
  const head = mesh(P.head);
  head.castShadow = true;
  headPivot.add(head);
  neckPivot.add(headPivot);
  g.add(neckPivot);

  const male = rand() < 0.42;
  if (male) {
    const a1 = mesh(P.antler);
    a1.position.set(0.07, 0.1, -0.02);
    const a2 = mesh(P.antler);
    a2.position.set(-0.07, 0.1, -0.02);
    a2.scale.x = -1;
    headPivot.add(a1, a2);
  }

  // Four legs, front pair and back pair, each pivoting at the shoulder/hip.
  const legs = [];
  for (const [ix, iz] of [
    [0.22, 0.52],
    [-0.22, 0.52],
    [0.24, -0.5],
    [-0.24, -0.5],
  ]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(ix, 0.86, iz);
    const l = mesh(P.leg);
    l.castShadow = true;
    pivot.add(l);
    g.add(pivot);
    legs.push(pivot);
  }

  const tailPivot = new THREE.Object3D();
  tailPivot.position.set(0, 1.0, -0.78);
  const tail = mesh(P.tail);
  tailPivot.add(tail);
  g.add(tailPivot);

  const scale = 0.88 + rand() * 0.28 + (male ? 0.08 : 0);
  g.scale.setScalar(scale);

  return { group: g, parts: { body, neckPivot, headPivot, legs, tailPivot }, male, scale };
}

// ── bear body ───────────────────────────────────────────────────────────────

const FUR = new THREE.Color(0x3b2b1f);
const FUR_DARK = new THREE.Color(0x261a12);
const SNOUT = new THREE.Color(0x59452f);
const CLAW = new THREE.Color(0xd8cfc0);

let bearParts = null;

function bearGeometry() {
  if (bearParts) return bearParts;

  // Barrel torso plus a shoulder hump — the hump is the single silhouette cue
  // that says "bear" rather than "large dog", and it costs one sphere.
  const torso = new THREE.IcosahedronGeometry(0.62, 1);
  torso.scale(1.05, 0.95, 1.55);
  const hump = new THREE.IcosahedronGeometry(0.4, 1);
  hump.scale(1, 0.85, 1);
  hump.translate(0, 0.3, 0.42);
  const haunch = new THREE.IcosahedronGeometry(0.44, 1);
  haunch.translate(0, -0.02, -0.72);
  const body = merge([paint(torso, FUR), paint(hump, FUR), paint(haunch, FUR)]);

  const neckGeo = new THREE.CylinderGeometry(0.26, 0.34, 0.3, 8);
  const neck = merge([paint(neckGeo, FUR)]);

  const skull = new THREE.IcosahedronGeometry(0.26, 1);
  skull.scale(0.95, 0.85, 1.05);
  const muzzle = new THREE.CylinderGeometry(0.11, 0.17, 0.34, 7);
  muzzle.rotateX(Math.PI / 2);
  muzzle.translate(0, -0.07, 0.26);
  const nose = new THREE.IcosahedronGeometry(0.06, 0);
  nose.translate(0, -0.05, 0.43);
  const earL = new THREE.IcosahedronGeometry(0.09, 0);
  earL.scale(1, 1, 0.5);
  earL.translate(0.16, 0.2, -0.04);
  const earR = earL.clone();
  earR.translate(-0.32, 0, 0);
  const eyeL = new THREE.IcosahedronGeometry(0.035, 0);
  eyeL.translate(0.13, 0.06, 0.16);
  const eyeR = eyeL.clone();
  eyeR.translate(-0.26, 0, 0);
  const head = merge([
    paint(skull, FUR),
    paint(muzzle, SNOUT),
    paint(nose, FUR_DARK),
    paint(earL, FUR_DARK),
    paint(earR, FUR_DARK),
    paint(eyeL, EYE),
    paint(eyeR, EYE),
  ]);

  // Short, thick legs with visible claws.
  const legGeo = new THREE.CylinderGeometry(0.14, 0.13, 0.66, 7);
  legGeo.translate(0, -0.33, 0);
  const paw = new THREE.IcosahedronGeometry(0.16, 0);
  paw.scale(1, 0.6, 1.25);
  paw.translate(0, -0.64, 0.04);
  const clawsGeo = new THREE.ConeGeometry(0.028, 0.1, 4);
  clawsGeo.rotateX(Math.PI / 2);
  clawsGeo.translate(0, -0.66, 0.2);
  const leg = merge([paint(legGeo, FUR), paint(paw, FUR_DARK), paint(clawsGeo, CLAW)]);

  const tailGeo = new THREE.IcosahedronGeometry(0.1, 0);
  const tail = merge([paint(tailGeo, FUR)]);

  bearParts = { body, neck, head, leg, tail };
  return bearParts;
}

/**
 * Assemble a bear. Returns the same part contract as the deer — body, neck
 * pivot, head pivot, four leg pivots, tail pivot — so the shared animator in
 * creature.js drives it without knowing which species it is holding.
 */
function buildBear(rand) {
  const P = bearGeometry();
  const g = new THREE.Group();

  const body = mesh(P.body);
  body.position.y = 1.02;
  body.castShadow = true;
  g.add(body);

  const neckPivot = new THREE.Object3D();
  neckPivot.position.set(0, 1.16, 0.72);
  const neck = mesh(P.neck);
  neck.position.y = 0.1;
  neck.rotation.x = 0.7; // carried low and forward, the way a bear does
  neck.castShadow = true;
  neckPivot.add(neck);

  const headPivot = new THREE.Object3D();
  headPivot.position.set(0, 0.16, 0.24);
  const head = mesh(P.head);
  head.castShadow = true;
  headPivot.add(head);
  neckPivot.add(headPivot);
  g.add(neckPivot);

  const legs = [];
  for (const [ix, iz] of [
    [0.34, 0.56],
    [-0.34, 0.56],
    [0.36, -0.6],
    [-0.36, -0.6],
  ]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(ix, 1.0, iz);
    const l = mesh(P.leg);
    l.castShadow = true;
    pivot.add(l);
    g.add(pivot);
    legs.push(pivot);
  }

  const tailPivot = new THREE.Object3D();
  tailPivot.position.set(0, 1.06, -1.05);
  tailPivot.add(mesh(P.tail));
  g.add(tailPivot);

  const scale = 1.0 + rand() * 0.22;
  g.scale.setScalar(scale);

  return { group: g, parts: { body, neckPivot, headPivot, legs, tailPivot }, male: true, scale };
}

// ── species table ───────────────────────────────────────────────────────────

export const SPECIES = {
  deer: {
    id: 'deer',
    name: 'Deer',
    faction: 'prey',
    diet: 'grazer',
    behaviour: 'skittish', // resolved in creature.js

    hitPoints: 42,
    // Where an arrow lands matters. Heights are fractions of standing height.
    hitZones: [
      { name: 'head', minY: 0.86, multiplier: 3.0 },
      { name: 'vitals', minY: 0.52, multiplier: 1.9 },
      { name: 'body', minY: 0.28, multiplier: 1.0 },
      { name: 'legs', minY: 0.0, multiplier: 0.45 },
    ],

    // Collision proxy and rough standing height, in metres.
    radius: 0.55,
    height: 1.75,
    eyeHeight: 1.5,
    // Deer will wade the shallows but will not swim, so they steer around
    // anything deeper than this rather than running out into the lake.
    wadeMax: 0.7,
    // Centre-to-centre distance the herd keeps between bodies. The torso is
    // roughly 1.5 m long and 0.9 m wide, so this leaves daylight between them.
    personalSpace: 2.1,

    speeds: { graze: 0.55, walk: 1.5, trot: 4.2, flee: 10.5 },
    turnRate: 3.2, // radians per second
    stamina: 9, // seconds of full flight before dropping to a trot

    senses: {
      sightRange: 62,
      sightFov: 2.6, // radians, total. Deer have very wide vision.
      sightAcuity: 0.85, // multiplier on how fast sight fills the meter
      hearingAcuity: 1.15,
      scentAcuity: 1.6, // a deer's nose is its best sense, by far
      // Awareness thresholds.
      alertAt: 0.35,
      panicAt: 0.75,
      calmRate: 0.22, // per second, when nothing is detected
    },

    herd: { min: 1, max: 4, spread: 14 },

    // A bolting deer is the loudest thing on the hillside. Inside `core` — a
    // herd's own spacing — it is unmissable and the neighbours go with it.
    // Beyond that out to `radius` it fades to a rumour that lifts heads
    // without emptying the hillside.
    alarm: { radius: 58, core: 24, strength: 1, hears: ['prey'], trust: 1 },

    spawn: {
      minHeight: WATER_LEVEL + 1.5,
      maxHeight: 74,
      maxSlope: 0.42,
      // Deer like the edges of woodland, not deep forest or bare hilltop.
      preferClump: [0.15, 0.8],
      weight: 1,
      // Ordinary animals live in the ordinary world. They thin out as things
      // get strange and are simply absent from the worst ground — which is a
      // warning in itself: a hillside with no deer on it is telling you
      // something before anything has come out of the dark.
      strangeness: [0, 0.62],
    },

    drops: [
      { item: 'venison', min: 2, max: 4 },
      { item: 'hide', min: 1, max: 2 },
    ],

    build: buildDeer,
  },
};

SPECIES.bear = {
  id: 'bear',
  name: 'Bear',
  faction: 'predator',
  diet: 'omnivore',
  behaviour: 'aggressive',

  // Four to six arrows, and only if you place them. A body-shot bear closes
  // the distance long before it goes down.
  hitPoints: 165,
  hitZones: [
    { name: 'head', minY: 0.78, multiplier: 2.5 },
    { name: 'vitals', minY: 0.48, multiplier: 1.7 },
    { name: 'body', minY: 0.24, multiplier: 1.0 },
    { name: 'legs', minY: 0.0, multiplier: 0.5 },
  ],

  radius: 0.95,
  height: 1.65,
  eyeHeight: 1.3,
  wadeMax: 1.3, // bears will happily wade
  personalSpace: 3.4,

  // `charge` is deliberately above the player's 8.6 m/s sprint. `chasePace`,
  // used once its stamina is gone, is deliberately below it.
  speeds: { graze: 0.5, walk: 1.9, trot: 5.4, flee: 9.2, charge: 11.5 },
  turnRate: 2.6,
  stamina: 8,

  senses: {
    sightRange: 52,
    sightFov: 2.2,
    sightAcuity: 0.8,
    hearingRange: 78, // overrides the global — it hears a running man a long way off
    hearingAcuity: 1.5,
    scentAcuity: 2.4, // the best nose in the game — it will find you
    alertAt: 0.3,
    panicAt: 999, // a bear does not panic; see `aggression` instead
    calmRate: 0.07, // and it does not lose interest in a hurry
  },

  aggression: {
    chargeAt: 0.5, // awareness at which it commits
    aggroRange: 72, // and how close you have to be for that to matter
    leash: 165, // it will follow this far before losing the thread
    loseInterest: 13, // seconds of no contact at all before it gives up
    attackRange: 2.9,
    attackInterval: 1.3, // seconds between swipes
    damage: 38, // three of these will kill you
    chargeStamina: 7, // seconds at full charge before it blows up
    chasePace: 6.2, // slower than your sprint — this is your escape window
    fleeBelow: 0.22, // gives up under 22% health
  },

  herd: { min: 1, max: 1, spread: 0 }, // solitary

  // A bear does not raise the alarm — it IS the alarm — but it listens to prey,
  // at low trust. So a herd bolting nearby makes it lift its head and come to
  // look rather than sending it into a charge. Blow a stalk badly enough and
  // the thing that answers is not the deer.
  alarm: { radius: 0, core: 0, strength: 0, hears: ['prey'], trust: 0.42 },

  spawn: {
    minHeight: WATER_LEVEL + 2,
    maxHeight: 80,
    maxSlope: 0.46,
    preferClump: [0.35, 1.0], // likes the deeper woodland
    weight: 0.16, // rare
    // A bear is a real animal, not a strange one — but it is the top of the
    // ordinary world, so it holds ground the deer will not.
    strangeness: [0.05, 0.72],
  },

  drops: [
    { item: 'hide', min: 2, max: 3 },
    { item: 'venison', min: 3, max: 6 },
  ],

  build: buildBear,
};

export const getSpecies = (id) => SPECIES[id] ?? null;
