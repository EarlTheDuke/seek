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

// ── goblin body ─────────────────────────────────────────────────────────────
//
// The first thing in the world that is not an animal, so the silhouette has to
// carry that on its own: upright but hunched, arms too long, head too big. It
// reads as WRONG at a distance in a way a four-legged shape cannot, which
// matters because you will usually meet these at the edge of your light.

const GOB_SKIN = new THREE.Color(0x6b7355);
const GOB_SKIN_DARK = new THREE.Color(0x474d38);
const GOB_RAG = new THREE.Color(0x3d342a);
const GOB_EYE = new THREE.Color(0xd8a23c); // the only warm colour on it

let goblinParts = null;

function goblinGeometry() {
  if (goblinParts) return goblinParts;

  // Torso, pitched forward. The hunch is the whole silhouette.
  const chest = new THREE.IcosahedronGeometry(0.27, 1);
  chest.scale(1.1, 1.15, 0.8);
  const belly = new THREE.IcosahedronGeometry(0.22, 1);
  belly.scale(1.05, 0.9, 0.85);
  belly.translate(0, -0.3, 0.02);
  const rags = new THREE.CylinderGeometry(0.26, 0.19, 0.3, 7);
  rags.translate(0, -0.42, 0);
  const body = merge([paint(chest, GOB_SKIN), paint(belly, GOB_SKIN), paint(rags, GOB_RAG)]);

  const neckGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.14, 6);
  const neck = merge([paint(neckGeo, GOB_SKIN_DARK)]);

  // Head: oversized, with ears that break the outline. At the poly budget the
  // ears do more work than the face does.
  const skull = new THREE.IcosahedronGeometry(0.2, 1);
  skull.scale(0.92, 0.88, 1.0);
  const jaw = new THREE.IcosahedronGeometry(0.12, 0);
  jaw.scale(0.85, 0.6, 1.1);
  jaw.translate(0, -0.11, 0.09);
  const earL = new THREE.ConeGeometry(0.07, 0.26, 4);
  earL.rotateZ(-1.15);
  earL.rotateY(0.3);
  earL.translate(0.2, 0.06, -0.02);
  const earR = earL.clone();
  earR.scale(-1, 1, 1);
  const eyeL = new THREE.IcosahedronGeometry(0.038, 0);
  eyeL.translate(0.085, 0.03, 0.15);
  const eyeR = eyeL.clone();
  eyeR.translate(-0.17, 0, 0);
  const head = merge([
    paint(skull, GOB_SKIN),
    paint(jaw, GOB_SKIN_DARK),
    paint(earL, GOB_SKIN_DARK),
    paint(earR, GOB_SKIN_DARK),
    paint(eyeL, GOB_EYE),
    paint(eyeR, GOB_EYE),
  ]);

  const legGeo = new THREE.CylinderGeometry(0.075, 0.055, 0.52, 6);
  legGeo.translate(0, -0.26, 0);
  const foot = new THREE.IcosahedronGeometry(0.09, 0);
  foot.scale(1, 0.5, 1.5);
  foot.translate(0, -0.52, 0.05);
  const leg = merge([paint(legGeo, GOB_SKIN), paint(foot, GOB_SKIN_DARK)]);

  // Arms longer than the legs — the detail that says "not a small person".
  const armGeo = new THREE.CylinderGeometry(0.055, 0.042, 0.62, 6);
  armGeo.translate(0, -0.31, 0);
  const hand = new THREE.IcosahedronGeometry(0.075, 0);
  hand.scale(1, 0.8, 0.7);
  hand.translate(0, -0.63, 0.02);
  const arm = merge([paint(armGeo, GOB_SKIN), paint(hand, GOB_SKIN_DARK)]);

  const tailGeo = new THREE.IcosahedronGeometry(0.05, 0);
  const tail = merge([paint(tailGeo, GOB_RAG)]);

  goblinParts = { body, neck, head, leg, arm, tail };
  return goblinParts;
}

/**
 * Assemble a goblin. Honours the same part contract as the animals — body,
 * neckPivot, headPivot, legs[], tailPivot — plus an optional `arms[]` that the
 * shared animator swings if it finds it. Two legs rather than four falls out
 * of the existing diagonal-pair rule as a plain left-right alternation.
 */
function buildGoblin(rand) {
  const P = goblinGeometry();
  const g = new THREE.Group();

  const body = mesh(P.body);
  body.position.y = 0.92;
  body.rotation.x = 0.38; // the hunch
  body.castShadow = true;
  g.add(body);

  const neckPivot = new THREE.Object3D();
  neckPivot.position.set(0, 1.12, 0.1);
  const neck = mesh(P.neck);
  neckPivot.add(neck);

  const headPivot = new THREE.Object3D();
  headPivot.position.y = 0.13;
  const head = mesh(P.head);
  head.castShadow = true;
  headPivot.add(head);
  neckPivot.add(headPivot);
  g.add(neckPivot);

  const legs = [];
  for (const ix of [0.12, -0.12]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(ix, 0.56, 0);
    const l = mesh(P.leg);
    l.castShadow = true;
    pivot.add(l);
    g.add(pivot);
    legs.push(pivot);
  }

  const arms = [];
  for (const ix of [0.26, -0.26]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(ix, 1.06, 0.04);
    const a = mesh(P.arm);
    a.castShadow = true;
    pivot.add(a);
    g.add(pivot);
    arms.push(pivot);
  }

  // Vestigial, but the animator expects one and an empty pivot costs nothing.
  const tailPivot = new THREE.Object3D();
  tailPivot.position.set(0, 0.72, -0.2);
  tailPivot.add(mesh(P.tail));
  g.add(tailPivot);

  const scale = 0.86 + rand() * 0.24;
  g.scale.setScalar(scale);

  return { group: g, parts: { body, neckPivot, headPivot, legs, arms, tailPivot }, male: true, scale };
}

// ── troll body ──────────────────────────────────────────────────────────────
//
// Built to be looked at from a distance, because that is where you will spend
// most of your time near one: it cannot see you, so watching it is the whole
// encounter until you make a noise. Everything is therefore silhouette — the
// stoop, the shoulders, the arms that reach the ground. Stone colours, so it
// reads as part of the crag until it moves.

const TROLL_STONE = new THREE.Color(0x5c5b56);
const TROLL_STONE_DARK = new THREE.Color(0x3a3a36);
const TROLL_MOSS = new THREE.Color(0x4d5540);
const TROLL_EYE = new THREE.Color(0xbfc9b0); // pale, near-useless

let trollParts = null;

function trollGeometry() {
  if (trollParts) return trollParts;

  const torso = new THREE.IcosahedronGeometry(0.78, 1);
  torso.scale(1.15, 1.2, 0.85);
  const shoulders = new THREE.IcosahedronGeometry(0.62, 1);
  shoulders.scale(1.45, 0.7, 0.9);
  shoulders.translate(0, 0.62, 0);
  const gut = new THREE.IcosahedronGeometry(0.6, 1);
  gut.scale(1.05, 0.85, 0.95);
  gut.translate(0, -0.62, 0.06);
  // Moss on the back and shoulders — it has been standing still a long time.
  const moss = new THREE.IcosahedronGeometry(0.5, 1);
  moss.scale(1.25, 0.4, 0.5);
  moss.translate(0, 0.5, -0.45);
  const body = merge([
    paint(torso, TROLL_STONE),
    paint(shoulders, TROLL_STONE),
    paint(gut, TROLL_STONE_DARK),
    paint(moss, TROLL_MOSS),
  ]);

  const neckGeo = new THREE.CylinderGeometry(0.26, 0.34, 0.2, 7);
  const neck = merge([paint(neckGeo, TROLL_STONE_DARK)]);

  // Small head, low between the shoulders. Tiny eyes, and a lot of ear.
  const skull = new THREE.IcosahedronGeometry(0.32, 1);
  skull.scale(0.9, 0.8, 1.0);
  const brow = new THREE.IcosahedronGeometry(0.2, 0);
  brow.scale(1.5, 0.42, 0.7);
  brow.translate(0, 0.14, 0.2);
  const jaw = new THREE.IcosahedronGeometry(0.2, 0);
  jaw.scale(0.95, 0.6, 1.1);
  jaw.translate(0, -0.18, 0.1);
  // Ears the size of its face. The one honest tell about how it hunts.
  const earL = new THREE.IcosahedronGeometry(0.2, 0);
  earL.scale(0.28, 1.15, 0.85);
  earL.translate(0.34, 0.06, -0.04);
  const earR = earL.clone();
  earR.translate(-0.68, 0, 0);
  const eyeL = new THREE.IcosahedronGeometry(0.032, 0);
  eyeL.translate(0.11, 0.02, 0.26);
  const eyeR = eyeL.clone();
  eyeR.translate(-0.22, 0, 0);
  const head = merge([
    paint(skull, TROLL_STONE),
    paint(brow, TROLL_STONE_DARK),
    paint(jaw, TROLL_STONE_DARK),
    paint(earL, TROLL_STONE_DARK),
    paint(earR, TROLL_STONE_DARK),
    paint(eyeL, TROLL_EYE),
    paint(eyeR, TROLL_EYE),
  ]);

  const legGeo = new THREE.CylinderGeometry(0.24, 0.19, 0.9, 7);
  legGeo.translate(0, -0.45, 0);
  const foot = new THREE.IcosahedronGeometry(0.26, 0);
  foot.scale(1, 0.5, 1.5);
  foot.translate(0, -0.9, 0.1);
  const leg = merge([paint(legGeo, TROLL_STONE), paint(foot, TROLL_STONE_DARK)]);

  // Arms long enough to knuckle on the ground.
  const armGeo = new THREE.CylinderGeometry(0.2, 0.16, 1.24, 7);
  armGeo.translate(0, -0.62, 0);
  const fist = new THREE.IcosahedronGeometry(0.24, 0);
  fist.translate(0, -1.26, 0.03);
  const arm = merge([paint(armGeo, TROLL_STONE), paint(fist, TROLL_STONE_DARK)]);

  const tailGeo = new THREE.IcosahedronGeometry(0.09, 0);
  const tail = merge([paint(tailGeo, TROLL_STONE_DARK)]);

  trollParts = { body, neck, head, leg, arm, tail };
  return trollParts;
}

function buildTroll(rand) {
  const P = trollGeometry();
  const g = new THREE.Group();

  const body = mesh(P.body);
  body.position.y = 1.78;
  body.rotation.x = 0.3; // the stoop
  body.castShadow = true;
  g.add(body);

  const neckPivot = new THREE.Object3D();
  neckPivot.position.set(0, 2.3, 0.18);
  neckPivot.add(mesh(P.neck));

  const headPivot = new THREE.Object3D();
  headPivot.position.set(0, 0.16, 0.12);
  const head = mesh(P.head);
  head.castShadow = true;
  headPivot.add(head);
  neckPivot.add(headPivot);
  g.add(neckPivot);

  const legs = [];
  for (const ix of [0.3, -0.3]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(ix, 1.02, 0);
    const l = mesh(P.leg);
    l.castShadow = true;
    pivot.add(l);
    g.add(pivot);
    legs.push(pivot);
  }

  const arms = [];
  for (const ix of [0.72, -0.72]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(ix, 2.16, 0.06);
    const a = mesh(P.arm);
    a.castShadow = true;
    pivot.add(a);
    g.add(pivot);
    arms.push(pivot);
  }

  const tailPivot = new THREE.Object3D();
  tailPivot.position.set(0, 1.2, -0.5);
  tailPivot.add(mesh(P.tail));
  g.add(tailPivot);

  const scale = 1.0 + rand() * 0.2;
  g.scale.setScalar(scale);

  return { group: g, parts: { body, neckPivot, headPivot, legs, arms, tailPivot }, male: true, scale };
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

// ── the goblin ──────────────────────────────────────────────────────────────
//
// From VISION.md: "hunts you, in packs, by scent. Cowardly alone: break the
// pack and it breaks. First enemy with morale."
//
// What it inverts: everything the deer taught you. Wind is no longer your tool
// — being downwind of a goblin is how it finds you. Patience is no longer free
// — standing still in the dark is how they surround you. And it is the first
// thing in the game that is hunting rather than being hunted.
//
// Individually it is nothing: 34 hit points, a bad swing, slower than you.
// The danger is entirely in the arithmetic, which is what morale.js is for.
SPECIES.goblin = {
  id: 'goblin',
  name: 'Goblin',
  faction: 'strange',
  diet: 'carrion',
  behaviour: 'pack',

  // Two good arrows, or one to the head. It has to die fast, or a pack of six
  // is simply a wall of hit points and the morale system never gets to speak.
  hitPoints: 34,
  hitZones: [
    { name: 'head', minY: 0.8, multiplier: 3.2 },
    { name: 'vitals', minY: 0.5, multiplier: 1.8 },
    { name: 'body', minY: 0.22, multiplier: 1.0 },
    { name: 'legs', minY: 0.0, multiplier: 0.5 },
  ],

  radius: 0.42,
  height: 1.34,
  eyeHeight: 1.2,
  wadeMax: 0.9,
  personalSpace: 1.5, // they crowd; that is the point

  // `charge` is BELOW your 8.6 m/s sprint. You can outrun goblins — but only
  // in a straight line, and only if you are not already surrounded, and only
  // if you know which way is downhill in the dark. The threat is position,
  // not speed, which is what makes it a different fight from the bear.
  speeds: { graze: 0.5, walk: 1.6, trot: 4.4, flee: 7.6, charge: 7.4 },
  turnRate: 3.6, // nimble
  stamina: 14,

  senses: {
    // Poor eyes, superb nose. Being downwind is now a liability rather than a
    // tool — the single cleanest inversion of the deer.
    sightRange: 34,
    sightFov: 1.9,
    sightAcuity: 0.55,
    hearingRange: 54,
    hearingAcuity: 1.2,
    scentAcuity: 2.8, // the best nose in the game, and it is hunting you
    alertAt: 0.28,
    panicAt: 999, // panic is morale's job, not awareness's
    calmRate: 0.1,
  },

  aggression: {
    chargeAt: 0.4,
    aggroRange: 90,
    leash: 200,
    loseInterest: 18,
    attackRange: 2.1,
    attackInterval: 1.5,
    damage: 11, // survivable one at a time; four at once is not
    chargeStamina: 99,
    chasePace: 4.4,
    fleeBelow: 0, // it does not break on its own health — see morale
  },

  morale: {
    // How many of them, standing and nearby, counts as good odds.
    confidentAt: 4,
    // How hard the pack counts YOUR numbers against its own. 1 would be a
    // straight head count, which makes two players trivially safe from any
    // pack; 0.6 means numbers help a great deal without being an off switch.
    // Four players facing five goblins should be a fight they expect to win,
    // not one the goblins refuse to have.
    oddsWeight: 0.6,
    // Beyond this a pack-mate is no comfort at all. Must exceed the DIAMETER
    // of the hesitation ring (2 x 13 m), or two goblins circling opposite
    // sides of you fall out of each other's cohesion and break up purely from
    // the geometry of watching you — which is what they did at 26 m.
    cohesionRange: 34,

    // The three thresholds that give the fight its shape. They are set against
    // what the numbers term can actually PRODUCE: with confidentAt 4, a pack of
    // two tops out at 0.26, three at 0.74, four or more at 1.
    //
    //   4+ standing -> 1.00  commits
    //   3  standing -> 0.74  commits
    //   2  standing -> 0.26  circles, and can still rally
    //   1  standing -> 0.00  runs, and stays run
    //
    // rallyAt started at 0.46, ABOVE the ceiling a pair can ever reach — so any
    // pack reduced to two was permanently broken the first time it took a
    // fright, and the circling posture existed only as a knife-edge on the way
    // past. Keeping rallyAt under that ceiling is what makes "let them regroup
    // and they come again" true for a small pack as well as a large one.
    commitAt: 0.5, // above this it comes in; below, it circles
    breakAt: 0.18, // and below this it runs
    rallyAt: 0.24, // hysteresis, so it commits or breaks rather than dithers

    woundPenalty: 0.3, // its own wounds matter, but not much
    deathShock: 0.55, // watching one die matters a great deal
    witnessRange: 30,
    shockRecovery: 0.11, // ~5 s to shake off a death it survived

    // Daylight is a hard multiplier: no number of goblins fights at noon.
    // Surviving until sunrise is a real tactic and not a figure of speech.
    daylightFloor: 0.12,

    fallRate: 3.5, // losing your nerve is a moment...
    riseRate: 0.55, // ...getting it back is a decision

    hesitateRange: 13, // where a wavering pack sits and watches you
    circlePace: 1.5,
    flankSpread: 2.1, // radians of arc a committed pack fans across
    circleSpread: 3.0, // wider when merely watching — a proper ring
    rallyPull: 0.45, // how much a routed goblin runs TO its fellows
  },

  anim: {
    strideRate: 2.2,
    legSwing: 0.8,
    armSwing: 0.55, // the long arms swing, and they are what you notice
    bodyBob: 0.035,
    bodyRock: 0.03,
    // Barely any neck articulation: it does not graze, it stares.
    neckUp: 0.1,
    neckDown: 0.35,
    headUp: -0.05,
    headDown: 0.2,
    tailFlick: 0,
  },

  herd: { min: 3, max: 6, spread: 9 }, // they arrive together

  // Goblins raise the alarm to each other loudly and over a long way, and they
  // listen to prey too — a bolting deer tells them something is moving.
  alarm: { radius: 80, core: 34, strength: 1, hears: ['strange', 'prey'], trust: 0.9 },

  spawn: {
    minHeight: WATER_LEVEL + 1,
    maxHeight: 95,
    maxSlope: 0.55,
    // WEIGHT IS PER SITE, NOT PER CREATURE, and a goblin site holds three to
    // six of them where a deer site holds one to four. At 1.4 they were 76% of
    // everything that spawned after dark — in the lowlands as much as the
    // tops — which flattened the whole gradient into "it is night, so goblins".
    // Weighted against their pack size they now read as one warband among
    // several things rather than the only thing in the world.
    weight: 0.45,
    // Only where the world has already gone wrong, and only after dark. The
    // floor was 0.42, which a merely remote lowland clears easily once night
    // multiplies it — so they were common on safe low ground.
    strangeness: [0.55, 1],
    nightOnly: true,
  },

  drops: [
    { item: 'hide', min: 1, max: 1 },
    // A goblin carries what it has taken off somebody. Small and uneven on
    // purpose: one is pocket change, a pack of six is worth the fight, and that
    // difference is the only reason to take a fight you could walk away from.
    { item: 'gold', min: 0, max: 3 },
  ],

  build: buildGoblin,
};

// ── the troll ───────────────────────────────────────────────────────────────
//
// From VISION.md: "nearly blind, superb hearing — the exact reverse of the
// deer. You can watch it from open ground and it has no idea. Retreats at
// sunrise."
//
// This is the species that pays off the whole senses model, because it inverts
// the lesson the deer spent the first ten hours teaching you:
//
//   * With a deer, being SEEN is the risk and noise is secondary. You use the
//     wind, you keep low, you move when its head is down.
//   * With a troll, you can stand in the open at thirty metres in full view
//     and it has no idea you exist. Then you jog, and it knows exactly where
//     you are from a hundred and forty metres away.
//
// So every instinct the game has trained turns into a liability, and crouching
// — which drops your noise from 0.38 to 0.08, a factor of nearly five — stops
// being a stealth option and becomes the entire encounter.
//
// It is not a fight. It has 420 hit points and hits for 62, and its charge is
// slower than your sprint, so the correct answer is almost always to be quiet
// and go around. The ones who try are the reason it drops anything worth having.
SPECIES.troll = {
  id: 'troll',
  name: 'Troll',
  faction: 'strange',
  diet: 'omnivore',
  behaviour: 'aggressive',

  hitPoints: 420,
  hitZones: [
    // The head is low and between the shoulders, and hard to hit — but it is
    // the only zone that makes the arithmetic work at all.
    { name: 'head', minY: 0.82, multiplier: 3.4 },
    { name: 'vitals', minY: 0.55, multiplier: 1.6 },
    { name: 'body', minY: 0.25, multiplier: 0.9 },
    { name: 'legs', minY: 0.0, multiplier: 0.6 },
  ],

  radius: 1.15,
  height: 2.9,
  eyeHeight: 2.5,
  wadeMax: 2.2, // it simply walks through water that would drown you
  personalSpace: 4.2,

  // Slower than your sprint at full charge. You can always outrun a troll.
  // What you cannot do is outrun it while it can still hear you, because it
  // never stops and never loses the thread.
  speeds: { graze: 0.4, walk: 1.5, trot: 4.0, flee: 6.4, charge: 7.2 },
  turnRate: 1.5, // ponderous — sidestepping one actually works
  stamina: 40,

  senses: {
    // THE INVERSION, in four numbers.
    sightRange: 11, // it can barely make out its own hands
    sightFov: 1.5,
    sightAcuity: 0.16,
    hearingRange: 145, // and it hears a running man from the next valley
    hearingAcuity: 3.0,
    scentAcuity: 0.5, // a poor nose, so the wind will not save you either way
    alertAt: 0.22,
    panicAt: 999,
    calmRate: 0.05, // it does not forget in a hurry
  },

  aggression: {
    chargeAt: 0.42,
    aggroRange: 150, // as far as it can hear
    leash: 300,
    loseInterest: 26,
    attackRange: 4.2, // those arms
    attackInterval: 2.1,
    damage: 62, // two of these kill you
    chargeStamina: 999, // it does not tire; it just is not very fast
    chasePace: 6.4,
    fleeBelow: 0, // it does not run from you. It runs from the sun.
  },

  // The one thing that beats it. `fleeAbove` is a few degrees before sunrise —
  // the grey light, not the sun itself — so dawn is a process you can watch
  // happening rather than a switch that flips.
  sunlight: { fleeAbove: -7, blindedAt: 2 },

  anim: {
    strideRate: 1.0, // long, slow strides
    legSwing: 0.5,
    armSwing: 0.42,
    bodyBob: 0.07,
    bodyRock: 0.04,
    neckUp: 0.15,
    neckDown: 0.5,
    headUp: 0.05,
    headDown: 0.3,
    tailFlick: 0,
  },

  herd: { min: 1, max: 1, spread: 0 }, // always alone

  // It is far too deaf-to-its-own-kind to be alarmed by anything smaller, and
  // there is never a second one to tell.
  alarm: { radius: 0, core: 0, strength: 0, hears: [], trust: 0 },

  spawn: {
    minHeight: WATER_LEVEL + 1,
    maxHeight: 95,
    // Gorges and crags: it wants BROKEN ground, which is the one habitat
    // nothing else in the table has ever asked for.
    minSlope: 0.26,
    maxSlope: 1.6,
    // High for the same reason the goblin's is low: a troll site holds exactly
    // one troll. At 0.5 against the goblin's old 1.4 they were 1% of night
    // spawns — the headline creature of the high country, effectively absent.
    weight: 1.1,
    strangeness: [0.55, 1],
    nightOnly: true,
  },

  drops: [
    { item: 'hide', min: 3, max: 5 },
    { item: 'venison', min: 4, max: 7 },
    // A hoard, because a troll is the hardest thing in the world to kill and
    // the reward has to be worth the walk home. This is the largest single
    // amount of anything in the game.
    { item: 'gold', min: 8, max: 20 },
  ],

  build: buildTroll,
};

export const getSpecies = (id) => SPECIES[id] ?? null;
