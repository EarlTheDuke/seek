// ── companions.js ───────────────────────────────────────────────────────────
// Six animals, and what each of them is FOR.
//
// The otter proved the shape: trust is the only thing that buys obedience, and
// care is the mechanic rather than a side quest. This generalises it, and the
// generalisation is where the interesting design decision lives.
//
// THE RULE: EVERY ANIMAL SOLVES A DIFFERENT REAL PROBLEM.
//
// Not "the same pet with different fur". Each one's signature trick answers
// something this world genuinely does to you, and no two answer the same thing:
//
//   otter     you cannot find food          → seek: points at the nearest meal
//   hippo     deep water and bog stop you   → ferry: ride it, it wades anything
//   parrot    you cannot see over the ridge → scout: flies up and reports
//   kangaroo  your pack is full             → pouch: ten slots that walk
//   octopus   the deep lake is unreachable  → dive: fetches what you cannot
//   wolf-cub  you shoot a deer and lose it  → track: follows the blood trail
//
// That is the test any seventh animal has to pass. A companion whose power
// duplicates another one's is a skin, and this file should not accept skins.
//
// Tricks are ENTIRELY PER-ANIMAL — nothing is shared, not even sit. A parrot
// does not sit, it perches; a hippo does not spin, it wallows. Sharing a core
// would have been less work and it would have made five of the six feel like
// the otter wearing a hat.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lerp, clamp } from '../util/math.js';

const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.74,
  metalness: 0,
});
export const companionMaterial = material;

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

const merge = (parts) => {
  const m = mergeGeometries(parts);
  m.computeVertexNormals();
  return m;
};

const C = (hex) => new THREE.Color(hex);

/**
 * Build one body from a spec.
 *
 * Every animal is assembled from the same six named pivots — body, neckPivot,
 * headPivot, legs[], arms[] (optional), tailPivot — so one animator drives all
 * six and a seventh costs a geometry function rather than a rendering path.
 * That contract is exactly the one the creature registry already uses, and it
 * is why the deer's animator survived the goblin, the troll and now these.
 */
function assemble({ body, neck, head, leg, arm, tail }, layout) {
  const g = new THREE.Group();

  const bodyMesh = new THREE.Mesh(body, material);
  bodyMesh.position.y = layout.bodyY;
  if (layout.bodyPitch) bodyMesh.rotation.x = layout.bodyPitch;
  bodyMesh.castShadow = true;
  g.add(bodyMesh);

  const neckPivot = new THREE.Object3D();
  neckPivot.position.set(0, layout.neckY, layout.neckZ);
  if (neck) neckPivot.add(new THREE.Mesh(neck, material));
  const headPivot = new THREE.Object3D();
  headPivot.position.set(0, layout.headY ?? 0.1, layout.headZ ?? 0);
  const headMesh = new THREE.Mesh(head, material);
  headMesh.castShadow = true;
  headPivot.add(headMesh);
  neckPivot.add(headPivot);
  g.add(neckPivot);

  const legs = [];
  for (const [ix, iz] of layout.legs ?? []) {
    const p = new THREE.Object3D();
    p.position.set(ix, layout.legY, iz);
    const m = new THREE.Mesh(leg, material);
    m.castShadow = true;
    p.add(m);
    g.add(p);
    legs.push(p);
  }

  const arms = [];
  for (const [ix, iy, iz] of layout.arms ?? []) {
    const p = new THREE.Object3D();
    p.position.set(ix, iy, iz);
    const m = new THREE.Mesh(arm, material);
    m.castShadow = true;
    p.add(m);
    g.add(p);
    arms.push(p);
  }

  let tailPivot = null;
  if (tail) {
    tailPivot = new THREE.Object3D();
    tailPivot.position.set(0, layout.tailY, layout.tailZ);
    tailPivot.add(new THREE.Mesh(tail, material));
    g.add(tailPivot);
  } else {
    tailPivot = new THREE.Object3D(); // the animator expects one
    g.add(tailPivot);
  }

  return { group: g, parts: { body: bodyMesh, neckPivot, headPivot, legs, arms: arms.length ? arms : null, tailPivot } };
}

// ── bodies ──────────────────────────────────────────────────────────────────
// Cached per species; every companion of that kind shares the geometry.

const cache = {};
const geo = (id, make) => (cache[id] ??= make());

function otterParts() {
  const FUR = C(0x5a4634), DARK = C(0x3b2d21), BELLY = C(0x9c8a70), NOSE = C(0x241c16), EYE = C(0x100d0a);
  const torso = new THREE.CapsuleGeometry(0.15, 0.44, 4, 8); torso.rotateX(Math.PI / 2);
  const under = new THREE.CapsuleGeometry(0.115, 0.4, 3, 7); under.rotateX(Math.PI / 2); under.translate(0, -0.055, 0.02);
  const skull = new THREE.IcosahedronGeometry(0.105, 1); skull.scale(1, 0.88, 1.05);
  const muzzle = new THREE.CapsuleGeometry(0.058, 0.05, 3, 6); muzzle.rotateX(Math.PI / 2); muzzle.translate(0, -0.03, 0.1);
  const nose = new THREE.IcosahedronGeometry(0.026, 0); nose.translate(0, -0.018, 0.152);
  const earL = new THREE.IcosahedronGeometry(0.028, 0); earL.scale(1, 1, 0.5); earL.translate(0.072, 0.062, -0.022);
  const earR = earL.clone(); earR.translate(-0.144, 0, 0);
  const eyeL = new THREE.IcosahedronGeometry(0.021, 0); eyeL.translate(0.058, 0.028, 0.072);
  const eyeR = eyeL.clone(); eyeR.translate(-0.116, 0, 0);
  const legG = new THREE.CylinderGeometry(0.038, 0.032, 0.15, 5); legG.translate(0, -0.075, 0);
  const foot = new THREE.IcosahedronGeometry(0.05, 0); foot.scale(1.1, 0.4, 1.3); foot.translate(0, -0.15, 0.02);
  const tailG = new THREE.CapsuleGeometry(0.062, 0.3, 3, 7); tailG.rotateX(Math.PI / 2); tailG.translate(0, 0, -0.16);
  return {
    body: merge([paint(torso, FUR), paint(under, BELLY)]),
    neck: merge([paint(new THREE.CylinderGeometry(0.085, 0.11, 0.1, 7), FUR)]),
    head: merge([paint(skull, FUR), paint(muzzle, BELLY), paint(nose, NOSE), paint(earL, DARK), paint(earR, DARK), paint(eyeL, EYE), paint(eyeR, EYE)]),
    leg: merge([paint(legG, FUR), paint(foot, DARK)]),
    tail: merge([paint(tailG, FUR)]),
  };
}

function hippoParts() {
  const HIDE = C(0x6b5c62), DARK = C(0x4a3f45), PINK = C(0x8f6f70), EYE = C(0x100d0a);
  const torso = new THREE.CapsuleGeometry(0.62, 0.9, 5, 10); torso.rotateX(Math.PI / 2); torso.scale(1.05, 0.92, 1);
  const skull = new THREE.IcosahedronGeometry(0.4, 1); skull.scale(1.05, 0.85, 1.1);
  const jaw = new THREE.BoxGeometry(0.6, 0.26, 0.5); jaw.translate(0, -0.2, 0.24);
  const snout = new THREE.IcosahedronGeometry(0.3, 1); snout.scale(1.15, 0.7, 0.85); snout.translate(0, -0.06, 0.36);
  const nostrilL = new THREE.IcosahedronGeometry(0.06, 0); nostrilL.translate(0.13, 0.1, 0.6);
  const nostrilR = nostrilL.clone(); nostrilR.translate(-0.26, 0, 0);
  const earL = new THREE.IcosahedronGeometry(0.08, 0); earL.scale(1, 1.2, 0.6); earL.translate(0.26, 0.3, -0.2);
  const earR = earL.clone(); earR.translate(-0.52, 0, 0);
  const eyeL = new THREE.IcosahedronGeometry(0.05, 0); eyeL.translate(0.24, 0.22, 0.18);
  const eyeR = eyeL.clone(); eyeR.translate(-0.48, 0, 0);
  const legG = new THREE.CylinderGeometry(0.19, 0.21, 0.5, 8); legG.translate(0, -0.25, 0);
  const foot = new THREE.CylinderGeometry(0.23, 0.24, 0.1, 8); foot.translate(0, -0.5, 0);
  const tailG = new THREE.CapsuleGeometry(0.06, 0.16, 3, 6); tailG.rotateX(Math.PI / 2); tailG.translate(0, 0, -0.1);
  return {
    body: merge([paint(torso, HIDE)]),
    neck: merge([paint(new THREE.CylinderGeometry(0.34, 0.4, 0.16, 8), HIDE)]),
    head: merge([paint(skull, HIDE), paint(jaw, PINK), paint(snout, HIDE), paint(nostrilL, DARK), paint(nostrilR, DARK), paint(earL, DARK), paint(earR, DARK), paint(eyeL, EYE), paint(eyeR, EYE)]),
    leg: merge([paint(legG, HIDE), paint(foot, DARK)]),
    tail: merge([paint(tailG, DARK)]),
  };
}

function parrotParts() {
  const RED = C(0xc4453a), BLUE = C(0x3a6fb0), GOLD = C(0xd8a63c), BEAK = C(0x2a2622), EYE = C(0xf0e4cc);
  const torso = new THREE.CapsuleGeometry(0.11, 0.2, 4, 8); torso.rotateX(Math.PI / 2);
  const breast = new THREE.IcosahedronGeometry(0.1, 1); breast.scale(1, 1.1, 0.9); breast.translate(0, -0.03, 0.08);
  const skull = new THREE.IcosahedronGeometry(0.085, 1);
  const beak = new THREE.ConeGeometry(0.05, 0.11, 5); beak.rotateX(Math.PI / 2.1); beak.translate(0, -0.03, 0.09);
  const crest = new THREE.ConeGeometry(0.035, 0.11, 4); crest.translate(0, 0.09, -0.02);
  const eyeL = new THREE.IcosahedronGeometry(0.02, 0); eyeL.translate(0.055, 0.02, 0.045);
  const eyeR = eyeL.clone(); eyeR.translate(-0.11, 0, 0);
  // The "legs" are wings, so the shared leg animator flaps them. Cheap trick,
  // and it means a bird needs no bespoke rendering path.
  const wing = new THREE.BoxGeometry(0.3, 0.03, 0.16); wing.translate(0.15, 0, 0);
  const tailG = new THREE.BoxGeometry(0.07, 0.02, 0.3); tailG.translate(0, 0, -0.15);
  const footG = new THREE.CylinderGeometry(0.018, 0.018, 0.09, 4); footG.translate(0, -0.045, 0);
  return {
    body: merge([paint(torso, RED), paint(breast, GOLD)]),
    neck: null,
    head: merge([paint(skull, BLUE), paint(beak, BEAK), paint(crest, GOLD), paint(eyeL, EYE), paint(eyeR, EYE)]),
    leg: merge([paint(wing, BLUE)]),
    arm: merge([paint(footG, BEAK)]),
    tail: merge([paint(tailG, GOLD)]),
  };
}

function kangarooParts() {
  const FUR = C(0x9b7a55), DARK = C(0x6e563b), PALE = C(0xc4ab86), EYE = C(0x100d0a);
  const torso = new THREE.CapsuleGeometry(0.2, 0.34, 4, 8); torso.rotateX(0.5);
  const chest = new THREE.IcosahedronGeometry(0.17, 1); chest.scale(0.9, 1, 0.85); chest.translate(0, 0.22, 0.1);
  const pouch = new THREE.IcosahedronGeometry(0.15, 1); pouch.scale(1, 0.9, 0.7); pouch.translate(0, -0.06, 0.16);
  const skull = new THREE.IcosahedronGeometry(0.11, 1); skull.scale(0.85, 0.9, 1.25);
  const muzzle = new THREE.CapsuleGeometry(0.05, 0.08, 3, 6); muzzle.rotateX(Math.PI / 2); muzzle.translate(0, -0.03, 0.13);
  const earL = new THREE.CapsuleGeometry(0.032, 0.13, 3, 6); earL.rotateZ(0.22); earL.translate(0.06, 0.15, -0.02);
  const earR = earL.clone(); earR.scale(-1, 1, 1);
  const eyeL = new THREE.IcosahedronGeometry(0.022, 0); eyeL.translate(0.062, 0.03, 0.075);
  const eyeR = eyeL.clone(); eyeR.translate(-0.124, 0, 0);
  // Big hind legs, tiny arms.
  const thigh = new THREE.CapsuleGeometry(0.085, 0.2, 3, 7); thigh.rotateX(0.5); thigh.translate(0, -0.1, -0.02);
  const shin = new THREE.CapsuleGeometry(0.055, 0.2, 3, 6); shin.rotateX(-0.35); shin.translate(0, -0.28, 0.04);
  const foot = new THREE.BoxGeometry(0.1, 0.05, 0.28); foot.translate(0, -0.4, 0.1);
  const armG = new THREE.CapsuleGeometry(0.032, 0.13, 3, 6); armG.translate(0, -0.07, 0);
  const tailG = new THREE.CapsuleGeometry(0.075, 0.44, 4, 7); tailG.rotateX(Math.PI / 2.4); tailG.translate(0, -0.1, -0.28);
  return {
    body: merge([paint(torso, FUR), paint(chest, PALE), paint(pouch, DARK)]),
    neck: merge([paint(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 6), FUR)]),
    head: merge([paint(skull, FUR), paint(muzzle, PALE), paint(earL, DARK), paint(earR, DARK), paint(eyeL, EYE), paint(eyeR, EYE)]),
    leg: merge([paint(thigh, FUR), paint(shin, FUR), paint(foot, DARK)]),
    arm: merge([paint(armG, FUR)]),
    tail: merge([paint(tailG, FUR)]),
  };
}

function octopusParts() {
  const SKIN = C(0x8c4a63), DARK = C(0x5f2f43), PALE = C(0xc48a9a), EYE = C(0xf3e2b8);
  const mantle = new THREE.IcosahedronGeometry(0.24, 2); mantle.scale(0.9, 1.15, 0.95);
  const eyeL = new THREE.IcosahedronGeometry(0.055, 1); eyeL.translate(0.15, 0.02, 0.13);
  const eyeR = eyeL.clone(); eyeR.translate(-0.3, 0, 0);
  const pupilL = new THREE.BoxGeometry(0.05, 0.014, 0.02); pupilL.translate(0.175, 0.03, 0.17);
  const pupilR = pupilL.clone(); pupilR.translate(-0.35, 0, 0);
  // Eight arms as the "legs" array, so the shared animator waves them.
  const armG = new THREE.CapsuleGeometry(0.038, 0.3, 3, 6); armG.rotateX(1.15); armG.translate(0, -0.14, 0.1);
  return {
    body: merge([paint(mantle, SKIN), paint(eyeL, PALE), paint(eyeR, PALE), paint(pupilL, C(0x120d10)), paint(pupilR, C(0x120d10))]),
    neck: null,
    head: merge([paint(new THREE.IcosahedronGeometry(0.02, 0), SKIN)]), // vestigial; the mantle is the head
    leg: merge([paint(armG, DARK)]),
    tail: null,
  };
}

function wolfCubParts() {
  const FUR = C(0x6a6259), DARK = C(0x413c36), PALE = C(0xa39684), EYE = C(0xc8b25e);
  const torso = new THREE.CapsuleGeometry(0.15, 0.3, 4, 8); torso.rotateX(Math.PI / 2);
  const ruff = new THREE.IcosahedronGeometry(0.17, 1); ruff.scale(1.05, 1, 0.8); ruff.translate(0, 0.03, 0.16);
  const skull = new THREE.IcosahedronGeometry(0.1, 1); skull.scale(0.95, 0.9, 1.1);
  const muzzle = new THREE.CapsuleGeometry(0.045, 0.08, 3, 6); muzzle.rotateX(Math.PI / 2); muzzle.translate(0, -0.03, 0.12);
  const nose = new THREE.IcosahedronGeometry(0.024, 0); nose.translate(0, -0.02, 0.17);
  const earL = new THREE.ConeGeometry(0.05, 0.1, 4); earL.translate(0.06, 0.11, -0.01);
  const earR = earL.clone(); earR.translate(-0.12, 0, 0);
  const eyeL = new THREE.IcosahedronGeometry(0.022, 0); eyeL.translate(0.055, 0.03, 0.07);
  const eyeR = eyeL.clone(); eyeR.translate(-0.11, 0, 0);
  const legG = new THREE.CylinderGeometry(0.036, 0.03, 0.24, 6); legG.translate(0, -0.12, 0);
  const paw = new THREE.IcosahedronGeometry(0.042, 0); paw.scale(1, 0.7, 1.2); paw.translate(0, -0.24, 0.01);
  const tailG = new THREE.CapsuleGeometry(0.05, 0.22, 3, 7); tailG.rotateX(Math.PI / 2.6); tailG.translate(0, 0.04, -0.14);
  return {
    body: merge([paint(torso, FUR), paint(ruff, PALE)]),
    neck: merge([paint(new THREE.CylinderGeometry(0.07, 0.09, 0.09, 6), FUR)]),
    head: merge([paint(skull, FUR), paint(muzzle, PALE), paint(nose, C(0x1c1815)), paint(earL, DARK), paint(earR, DARK), paint(eyeL, EYE), paint(eyeR, EYE)]),
    leg: merge([paint(legG, FUR), paint(paw, DARK)]),
    tail: merge([paint(tailG, FUR)]),
  };
}

// ── temperament ─────────────────────────────────────────────────────────────
//
// Everything about how an animal BEHAVES, as opposed to what it looks like.
//
// These were one shared block, which meant a hippo trailed you at four and a
// half metres and bit like an otter — six animals with one temperament and a
// different coat. The defaults below are the otter's, because that is what
// they were tuned as; every other species overrides what makes it itself.
//
// The rule for an override: it should be something you would NOTICE. A hippo
// that keeps its distance and hits like a truck is a different companion. A
// hippo whose `trustPerFeed` is 0.11 instead of 0.1 is a rounding error.
export const CARE_DEFAULTS = {
  tameAt: 0.3,
  namesAt: 0.18,

  trustPerFeed: 0.1,
  trustPerPlay: 0.07,
  trustPerHome: 0.12,
  trustPerTrick: 0.05,

  hungerPerHour: 0.028,
  borednessPerHour: 0.038,

  contentAbove: 0.55,
  trustGain: 0.004,
  trustLoss: 0.011,
  willWorkAbove: 0.35,
  forgetBelow: 0.22,
  forgetSeconds: 90,

  warmthRate: 0.35,
  homeWarmth: 0.85,
  fireWarmth: 0.7,
  wetChill: 0.3,
  homeRadius: 3.2,

  followRange: 4.5,
  runRange: 13,
  shyRange: 9,

  biteDamage: 6,
  biteRange: 1.9,
  attackSeconds: 14,
  giveUpRange: 34,

  playValue: 0.34,
  playSeconds: 4,
  spinRate: 6.2,
  chirpEvery: 0.34,

  // ── what working costs ──
  // A power used to be free, instant and unlimited, so the answer to every
  // problem was to press the button again. Now the animal gets TIRED — which
  // fits the care model that already exists rather than bolting a mana bar
  // onto an otter.
  powerCooldownHours: 0.75, // in-game hours before it will do it again
  powerTires: 0.09, // played, spent per use
  powerHungers: 0.05, // fed, spent per use
};

/** One species' full temperament: the defaults, with its own edits on top. */
export const careOf = (species) => ({ ...CARE_DEFAULTS, ...(species.care ?? {}) });

// ── the table ───────────────────────────────────────────────────────────────
//
// `power` is the signature trick — the one that solves this animal's problem
// and that nothing else can do. It is ALWAYS THE HIGHEST `needs`, because a
// companion that will work for you is the reward for having looked after it.
//
// That was not true on the first pass: guard sat at 0.6 against powers at
// 0.55, so on three of the six the last thing you unlocked was a bodyguard
// rather than the thing the animal is FOR. Guard is 0.5 now and the powers
// out-rank everything.

export const COMPANIONS = {
  otter: {
    id: 'otter',
    name: 'Otter',
    blurb: 'quick, curious, and the best fisher in the world',
    helps: 'finds you food',
    scale: 1,
    build: () => assemble(geo('otter', otterParts), {
      bodyY: 0.19, neckY: 0.22, neckZ: 0.26, headY: 0.07, headZ: 0.03, legY: 0.16,
      legs: [[0.11, 0.17], [-0.11, 0.17], [0.115, -0.14], [-0.115, -0.14]],
      tailY: 0.18, tailZ: -0.24,
    }),
    swims: true,
    walkSpeed: 2.2, runSpeed: 5.4,
    foods: { fish: 0.55, fish_cooked: 0.4, venison: 0.42, venison_cooked: 0.3 },
    voice: 'chirp',
    // The baseline. Everything else is described relative to this.
    care: {},
    anim: { strideRate: 3.4, legSwing: 0.34, bodyBob: 0.035 },
    tricks: {
      sit:   { name: 'Sit',   reps: 3, needs: 0.25, holds: 6,   pose: 'sit',   blurb: 'up on its haunches' },
      roll:  { name: 'Roll',  reps: 4, needs: 0.35, holds: 2.4, pose: 'roll',  blurb: 'rolls over in the shallows' },
      chirp: { name: 'Chirp', reps: 4, needs: 0.3,  holds: 1.8, pose: 'speak', blurb: 'chirrups at you' },
      seek:  { name: 'Seek',  reps: 6, needs: 0.55, holds: 9,   pose: 'point', blurb: 'freezes pointing at the nearest food', power: 'seek' },
      guard: { name: 'Guard', reps: 6, needs: 0.5,  holds: 0,   toggle: true,  blurb: 'goes for anything that hurts you' },
    },
  },

  hippo: {
    id: 'hippo',
    name: 'Hippo',
    blurb: 'four tonnes of unbothered',
    helps: 'carries you across water and bog',
    scale: 1,
    build: () => assemble(geo('hippo', hippoParts), {
      bodyY: 0.72, neckY: 0.86, neckZ: 0.62, headY: 0.1, headZ: 0.2, legY: 0.56,
      legs: [[0.38, 0.44], [-0.38, 0.44], [0.4, -0.44], [-0.4, -0.44]],
      tailY: 0.78, tailZ: -0.86,
    }),
    swims: true,
    wadeMax: 6, // it simply walks along the bottom
    walkSpeed: 1.9, runSpeed: 6.2,
    foods: { venison: 0.4, venison_cooked: 0.3, fish: 0.25 },
    voice: 'growl',
    care: {
      // It is enormous, so it keeps its distance and you notice when it does
      // not. Standing where a hippo wants to stand is your problem.
      followRange: 8, runRange: 22, shyRange: 14, homeRadius: 5,
      // Four tonnes. The bite is the reason to bring one to a warband.
      biteDamage: 34, biteRange: 3.2, attackSeconds: 20, giveUpRange: 46,
      // It eats a great deal and it is slow to warm to you.
      hungerPerHour: 0.055, trustPerFeed: 0.07, trustGain: 0.003,
      // But it is unbothered by cold and by being wet.
      wetChill: 0, warmthRate: 0.2,
      // Carrying a person is work.
      powerCooldownHours: 0.2, powerTires: 0.16, powerHungers: 0.12,
    },
    anim: { strideRate: 1.3, legSwing: 0.42, bodyBob: 0.05 },
    tricks: {
      wallow: { name: 'Wallow', reps: 3, needs: 0.25, holds: 6,  pose: 'lie',   blurb: 'sinks down into the mud, content' },
      bellow: { name: 'Bellow', reps: 4, needs: 0.3,  holds: 2,  pose: 'speak', blurb: 'a bellow you can hear a valley away' },
      charge: { name: 'Charge', reps: 5, needs: 0.45, holds: 3,  pose: 'lunge', blurb: 'scatters whatever is in front of it' },
      ferry:  { name: 'Ferry',  reps: 6, needs: 0.55, holds: 0,  toggle: true,  blurb: 'kneels so you can ride — wades anything', power: 'ferry' },
      guard:  { name: 'Guard',  reps: 6, needs: 0.5,  holds: 0,  toggle: true,  blurb: 'stands between you and trouble' },
    },
  },

  parrot: {
    id: 'parrot',
    name: 'Parrot',
    blurb: 'loud, bright, and pays attention',
    helps: 'tells you what is over the ridge',
    scale: 1,
    flies: true,
    build: () => assemble(geo('parrot', parrotParts), {
      bodyY: 0.16, neckY: 0.22, neckZ: 0.11, headY: 0.03, headZ: 0.02, legY: 0.18,
      legs: [[0.05, 0], [-0.05, 0]], // wings
      arms: [[0.045, 0.07, 0.02], [-0.045, 0.07, 0.02]], // feet
      tailY: 0.16, tailZ: -0.12,
    }),
    walkSpeed: 3.4, runSpeed: 7.5,
    hoverHeight: 1.9, // it flies at your shoulder rather than walking
    foods: { venison: 0.2, fish: 0.2, wood: 0.1 },
    voice: 'chirp',
    care: {
      // It flies, so it never lags and it never crowds you.
      followRange: 3, runRange: 30, shyRange: 6,
      // A parrot is not a fighter. It is, however, extremely annoying.
      biteDamage: 2, biteRange: 1.4, attackSeconds: 6, giveUpRange: 20,
      // Small and fast-burning: eats little but often, bores quickly, and
      // feels the cold badly.
      hungerPerHour: 0.042, borednessPerHour: 0.07, wetChill: 0.5, warmthRate: 0.5,
      // It bonds fast and it forgets fast, which is exactly a parrot.
      trustPerFeed: 0.14, trustPerPlay: 0.11, trustLoss: 0.016, forgetSeconds: 60,
      // Climbing to look costs it almost nothing.
      powerCooldownHours: 0.4, powerTires: 0.06, powerHungers: 0.04,
    },
    anim: { strideRate: 14, legSwing: 0.9, bodyBob: 0.02 },
    tricks: {
      perch:  { name: 'Perch',  reps: 3, needs: 0.25, holds: 12, pose: 'perch', blurb: 'settles on your shoulder' },
      squawk: { name: 'Squawk', reps: 3, needs: 0.3,  holds: 2,  pose: 'speak', blurb: 'a shriek that scatters small things' },
      mimic:  { name: 'Mimic',  reps: 5, needs: 0.45, holds: 3,  pose: 'speak', blurb: 'repeats the last thing it heard said' },
      scout:  { name: 'Scout',  reps: 6, needs: 0.55, holds: 7,  pose: 'soar',  blurb: 'climbs and reports what is around you', power: 'scout' },
    },
  },

  kangaroo: {
    id: 'kangaroo',
    name: 'Kangaroo',
    blurb: 'a pocket with legs',
    helps: 'carries what you cannot',
    scale: 1,
    build: () => assemble(geo('kangaroo', kangarooParts), {
      bodyY: 0.5, neckY: 0.76, neckZ: 0.12, headY: 0.1, headZ: 0.04, legY: 0.44,
      legs: [[0.13, -0.02], [-0.13, -0.02]],
      arms: [[0.16, 0.62, 0.12], [-0.16, 0.62, 0.12]],
      tailY: 0.42, tailZ: -0.2,
    }),
    walkSpeed: 2.6, runSpeed: 8.4,
    hops: true,
    foods: { venison: 0.3, wood: 0.15, fish: 0.2 },
    voice: 'chatter',
    care: {
      // It bounds ahead and waits, rather than heeling.
      followRange: 6.5, runRange: 26, shyRange: 11,
      // It kicks, and a kick from a kangaroo is not a joke.
      biteDamage: 19, biteRange: 2.4, attackSeconds: 12,
      // Grazer's metabolism: eats steadily, bores slowly, hardy.
      hungerPerHour: 0.036, borednessPerHour: 0.026, wetChill: 0.22,
      // Carrying your gear all day is the least it can do.
      powerCooldownHours: 0.1, powerTires: 0.05, powerHungers: 0.06,
    },
    anim: { strideRate: 2.1, legSwing: 0.5, bodyBob: 0.16 },
    tricks: {
      stand: { name: 'Stand',  reps: 3, needs: 0.25, holds: 7,  pose: 'sit',   blurb: 'rocks back on its tail, up tall' },
      thump: { name: 'Thump',  reps: 4, needs: 0.3,  holds: 2,  pose: 'speak', blurb: 'drums the ground — everything nearby looks up' },
      box:   { name: 'Box',    reps: 5, needs: 0.45, holds: 4,  pose: 'lunge', blurb: 'puts up its fists and means it' },
      pouch: { name: 'Pouch',  reps: 6, needs: 0.55, holds: 0,  toggle: false, blurb: 'ten slots that walk with you', power: 'pouch' },
    },
  },

  octopus: {
    id: 'octopus',
    name: 'Octopus',
    blurb: 'far cleverer than it has any right to be',
    helps: 'fetches from water you cannot reach',
    scale: 1,
    swims: true,
    aquatic: true, // slow and unhappy on land
    build: () => assemble(geo('octopus', octopusParts), {
      bodyY: 0.3, neckY: 0.34, neckZ: 0, headY: 0, headZ: 0, legY: 0.28,
      legs: [[0.12, 0.14], [-0.12, 0.14], [0.18, 0.02], [-0.18, 0.02],
             [0.16, -0.1], [-0.16, -0.1], [0.07, -0.18], [-0.07, -0.18]],
      tailY: 0, tailZ: 0,
    }),
    walkSpeed: 1.1, runSpeed: 2.4, // on land
    swimSpeed: 6.0,
    foods: { fish: 0.6, venison: 0.25 },
    voice: 'chirr',
    care: {
      // Slow on land, so it stays close and you wait for it — which is the
      // cost of choosing the cleverest animal in the game.
      followRange: 3.2, runRange: 8, shyRange: 5, homeRadius: 4,
      // Eight arms and a beak. Nothing enjoys being held by an octopus.
      biteDamage: 14, biteRange: 2.2, attackSeconds: 16,
      // It dries out. Being away from water is the thing that hurts it, so
      // `wetChill` is negative — water is where it recovers.
      wetChill: -0.45, warmthRate: 0.4, hungerPerHour: 0.031,
      // Extremely bright: learns fast and forgives slowly.
      trustPerTrick: 0.09, forgetSeconds: 140, trustLoss: 0.014,
      powerCooldownHours: 0.5, powerTires: 0.11, powerHungers: 0.09,
    },
    anim: { strideRate: 2.2, legSwing: 0.55, bodyBob: 0.05 },
    tricks: {
      furl:   { name: 'Furl',   reps: 3, needs: 0.25, holds: 6, pose: 'lie',   blurb: 'draws its arms in and sulks' },
      colour: { name: 'Colour', reps: 4, needs: 0.35, holds: 5, pose: 'point', blurb: 'flushes through every colour it knows' },
      ink:    { name: 'Ink',    reps: 5, needs: 0.45, holds: 3, pose: 'lunge', blurb: 'a cloud of ink — nothing can see you' },
      dive:   { name: 'Dive',   reps: 6, needs: 0.55, holds: 8, pose: 'soar',  blurb: 'goes down after what you dropped', power: 'dive' },
    },
  },

  wolfcub: {
    id: 'wolfcub',
    name: 'Wolf Cub',
    blurb: 'all nose and no manners',
    helps: 'finds what you wounded',
    scale: 1,
    build: () => assemble(geo('wolfcub', wolfCubParts), {
      bodyY: 0.28, neckY: 0.34, neckZ: 0.2, headY: 0.06, headZ: 0.03, legY: 0.25,
      legs: [[0.1, 0.14], [-0.1, 0.14], [0.105, -0.12], [-0.105, -0.12]],
      tailY: 0.28, tailZ: -0.2,
    }),
    walkSpeed: 2.8, runSpeed: 7.2,
    foods: { venison: 0.5, venison_cooked: 0.36, fish: 0.3 },
    voice: 'growl',
    care: {
      // It heels. Of the six it is the one that actually stays with you.
      followRange: 3.4, runRange: 20, shyRange: 8,
      // A cub, not a wolf — but it means it.
      biteDamage: 15, biteRange: 2.0, attackSeconds: 18, giveUpRange: 44,
      // Carnivore: eats a lot, hates being bored, warm-coated.
      hungerPerHour: 0.048, borednessPerHour: 0.055, wetChill: 0.34, warmthRate: 0.28,
      // Pack animal. It bonds hard and it takes neglect badly.
      trustPerPlay: 0.11, trustGain: 0.006, trustLoss: 0.015,
      powerCooldownHours: 0.6, powerTires: 0.1, powerHungers: 0.08,
    },
    anim: { strideRate: 3.0, legSwing: 0.62, bodyBob: 0.04 },
    tricks: {
      sit:   { name: 'Sit',   reps: 3, needs: 0.25, holds: 7, pose: 'sit',   blurb: 'sits, more or less' },
      howl:  { name: 'Howl',  reps: 4, needs: 0.3,  holds: 3, pose: 'speak', blurb: 'a thin little howl, carrying a long way' },
      lunge: { name: 'Lunge', reps: 5, needs: 0.45, holds: 3, pose: 'lunge', blurb: 'snaps at whatever is bothering you' },
      track: { name: 'Track', reps: 6, needs: 0.55, holds: 9, pose: 'point', blurb: 'follows the blood to where it fell', power: 'track' },
      guard: { name: 'Guard', reps: 6, needs: 0.5,  holds: 0, toggle: true,  blurb: 'goes for anything that hurts you' },
    },
  },
};

export const COMPANION_IDS = Object.keys(COMPANIONS);
export const getCompanion = (id) => COMPANIONS[id] ?? COMPANIONS.otter;

/** Names, shared across all of them. Scots and Gaelic, like the place names. */
export const PET_NAMES = [
  'Bramble', 'Sgadan', 'Tuppence', 'Moss', 'Rannoch', 'Sile', 'Pebble',
  'Dorlach', 'Whisker', 'Cuilean', 'Neap', 'Tarn', 'Brochan', 'Fiadh',
];
