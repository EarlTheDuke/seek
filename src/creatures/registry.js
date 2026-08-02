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

    spawn: {
      minHeight: WATER_LEVEL + 1.5,
      maxHeight: 74,
      maxSlope: 0.42,
      // Deer like the edges of woodland, not deep forest or bare hilltop.
      preferClump: [0.15, 0.8],
      weight: 1,
    },

    drops: [
      { item: 'venison', min: 2, max: 4 },
      { item: 'hide', min: 1, max: 2 },
    ],

    build: buildDeer,
  },
};

export const getSpecies = (id) => SPECIES[id] ?? null;
