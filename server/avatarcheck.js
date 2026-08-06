// ── avatarcheck.js ──────────────────────────────────────────────────────────
// What does somebody ELSE look like — crouching, drawing a bow, and dead?
//
//   npm run avatarcheck
//
// No port, no server, no wall clock. Everything a watcher sees of another player
// comes out of one method, `Avatar.apply`, driven from one snapshot entry, and
// that method is pure three.js maths — it needs no GL context and no frame. So
// unlike `rendercheck`, which reads the SOURCE because it is testing a renderer,
// this drives the REAL class and measures the REAL transforms.
//
// It measures WORLD scale rather than local scale, which is the whole point: the
// bug this was written for is a parent transform deforming a child, and a child's
// own `scale.y` reads 1 the entire time it is being squashed by its parent.
// Reading the local number is how you prove a bug is absent while looking
// straight at it.
//
// The DOM stub exists only because `nameplate` draws text into a canvas. It is
// the smallest thing that lets the real constructor run; nothing under test
// touches it.

import * as THREE from 'three';

// ── the smallest possible canvas, so the REAL constructor runs ──
// A fake made of a plain object and two borrowed methods stops testing anything
// the moment the real code grows a third call — so this stubs the DOM, not the
// Avatar. Every part of the figure under test is built by the real constructor.
const ctx2d = new Proxy({}, {
  get: (_, k) => (k === 'canvas' ? canvasStub : () => undefined),
});
const canvasStub = { width: 256, height: 64, getContext: () => ctx2d };
globalThis.document = { createElement: () => canvasStub };

const { Avatars } = await import('../src/net/avatars.js');

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** One snapshot entry, with only what `apply` reads. */
const entry = (over = {}) => ({
  id: 1, n: 'Eachann', p: [0, 0, 0], y: 0, t: 0,
  c: 0, s: 0, d: 0, h: 100, x: 0, ...over,
});

/**
 * A settled avatar. `apply` damps toward its target, so one call reads whatever
 * fraction of a second it was given — drive it until it stops moving instead of
 * asserting on a body still halfway into the pose.
 */
function settle(av, p, secs = 4) {
  for (let i = 0; i < secs * 60; i++) av.apply(p, 1 / 60);
  av.object.updateWorldMatrix(true, true);
}

/** World scale of a part — what the CAMERA sees, not what the part believes. */
const worldY = (o) => {
  const s = new THREE.Vector3();
  o.getWorldScale(s);
  return s.y;
};
const worldPosY = (o) => {
  const v = new THREE.Vector3();
  o.getWorldPosition(v);
  return v.y;
};

function main() {
  console.log('\n  What does somebody else look like?\n');

  const scene = new THREE.Scene();
  const avatars = new Avatars(scene);
  avatars.update(1 / 60, { pl: [entry()] });
  const av = avatars.byId.get(1);
  check('a body is built for another player in the snapshot', !!av,
    av ? `#${av.id} "${av.name}", ${av.object.children.length} parts` : 'none');
  if (!av) { console.log('\n  nothing to measure\n'); process.exit(1); }

  const head = av.parts.headPivot;
  const plate = av.parts.plate;

  settle(av, entry({ c: 0 }));
  const standing = {
    root: av.object.scale.y,
    head: worldY(head),
    plate: worldY(plate),
    headY: worldPosY(head),
    plateY: worldPosY(plate),
  };
  check('standing, nothing is scaled at all', Math.abs(standing.root - 1) < 1e-6,
    `root scale.y ${standing.root.toFixed(3)}, head world ${standing.head.toFixed(3)}`);

  settle(av, entry({ c: 1 }));
  const crouched = {
    root: av.object.scale.y,
    head: worldY(head),
    plate: worldY(plate),
    headY: worldPosY(head),
    plateY: worldPosY(plate),
  };

  console.log(`\n      standing   root ${standing.root.toFixed(3)} · head world ${standing.head.toFixed(3)} ` +
    `at ${standing.headY.toFixed(2)} m · name world ${standing.plate.toFixed(3)} at ${standing.plateY.toFixed(2)} m`);
  console.log(`      crouched   root ${crouched.root.toFixed(3)} · head world ${crouched.head.toFixed(3)} ` +
    `at ${crouched.headY.toFixed(2)} m · name world ${crouched.plate.toFixed(3)} at ${crouched.plateY.toFixed(2)} m\n`);

  // ── THE FIGURE MUST STILL SETTLE ──
  // The crouch is deliberately cheap and that is fine. If this stops being true
  // the fix has thrown away the effect instead of correcting it.
  check('crouching, the figure still settles', crouched.root < 0.9 && crouched.headY < standing.headY - 0.2,
    `root scale.y ${standing.root.toFixed(2)} -> ${crouched.root.toFixed(2)}, ` +
    `head drops ${(standing.headY - crouched.headY).toFixed(2)} m`);

  // ── ...AND THE HEAD MUST NOT DEFORM WHILE IT DOES ──
  // Measured in WORLD scale. Before the fix this read 0.72 while the head's own
  // `scale.y` sat at exactly 1.0, which is the reading that makes this bug
  // invisible from the inside.
  check('but the HEAD is not squashed with it', Math.abs(crouched.head - 1) < 1e-6,
    `head world scale.y ${crouched.head.toFixed(3)} crouched against ${standing.head.toFixed(3)} standing`);

  // ── AND NEITHER IS THE NAME, which is the one thing on screen meant to be READ ──
  check('and the NAME keeps its shape', Math.abs(crouched.plate - standing.plate) < 1e-6,
    `name world scale.y ${crouched.plate.toFixed(3)} crouched against ${standing.plate.toFixed(3)} standing`);

  // ...but both still travel down with the body, which is the half worth keeping.
  check('both still travel DOWN with the body', crouched.plateY < standing.plateY - 0.2,
    `the name sits ${(standing.plateY - crouched.plateY).toFixed(2)} m lower when they crouch`);

  // ── STANDING BACK UP RESTORES EVERYTHING ──
  // A counter-scale that is applied and never cleared leaves a permanently
  // stretched head the moment somebody stands.
  settle(av, entry({ c: 0 }));
  const backUp = { root: av.object.scale.y, head: worldY(head), plate: worldY(plate) };
  check('standing back up puts it all back', Math.abs(backUp.root - 1) < 1e-6 &&
    Math.abs(backUp.head - 1) < 1e-6 && Math.abs(backUp.plate - standing.plate) < 1e-6,
    `root ${backUp.root.toFixed(3)}, head ${backUp.head.toFixed(3)}, name ${backUp.plate.toFixed(3)}`);

  // ── DEATH IS A STATE, NOT AN ANIMATION ──
  // `p.x` is the dead flag. Asserted because it is the only thing a watcher ever
  // sees of somebody else dying, and nothing else in this repo covers it.
  settle(av, entry({ x: 1 }));
  const tipped = av.object.rotation.z;
  check('a dead body goes down, and its name goes out',
    Math.abs(tipped - Math.PI * 0.5) < 0.05 && av.parts.plate.visible === false,
    `tipped ${(tipped * 180 / Math.PI).toFixed(0)}°, nameplate visible: ${av.parts.plate.visible}`);

  settle(av, entry({ x: 0 }));
  check('and getting back up clears both', Math.abs(av.object.rotation.z) < 0.05 && av.parts.plate.visible === true,
    `tipped ${(av.object.rotation.z * 180 / Math.PI).toFixed(0)}°, nameplate visible: ${av.parts.plate.visible}`);

  // ── DRAWING A BOW ──
  // The other thing a watcher needs to read off a distant body, and the one that
  // decides whether they take cover.
  settle(av, entry({ d: 0 }));
  const armRelaxed = av.parts.arms[0].rotation.x;
  settle(av, entry({ d: 1 }));
  const armDrawn = av.parts.arms[0].rotation.x;
  check('you can see somebody else draw a bow', Math.abs(armDrawn - armRelaxed) > 1,
    `arm swings ${armRelaxed.toFixed(2)} -> ${armDrawn.toFixed(2)} rad when they raise it`);

  // ── AND THEY LEAVE WHEN THEY LEAVE ──
  avatars.update(1 / 60, { pl: [] });
  check('a body that left the snapshot is removed', avatars.byId.size === 0,
    `${avatars.byId.size} avatars remain, ${scene.children.length} objects left in the scene`);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
