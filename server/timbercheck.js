// ── timbercheck.js ──────────────────────────────────────────────────────────
// Does a body with no scene know where the trees are?
//
//   npm run timbercheck
//
// The whole tree layer rests on ONE claim: that `treesNear`, computed from the
// seed by something that has never seen a mesh, names exactly the trunks and
// crowns the projectile system will actually stop an arrow with. If that claim
// is even slightly wrong the body gets worse, not better — it will refuse shots
// it has because of a tree that is not there, and take shots it does not have
// because a real one is missing from its map.
//
// So this compares the two directly: build the real world, let it place its
// scatter and rebuild its collider field, and check the pure function against
// every cylinder and sphere in it. Not a sample — all of them, both ways round.
//
// The second half is the reason any of it matters: an arc walked against the
// timber must refuse the shot that the arc walked against bare ground took,
// and huntcheck's instrument said those arrows end `hit tree`.

import { createSimWorld } from '../src/sim/headless.js';
import { SimWorld } from '../src/sim/world.js';
import { CYLINDER, SPHERE } from '../src/world/colliders.js';
import { treesNear, rocksNear, timberBlocker, latticeHeight } from '../src/world/timber.js';
import { arcClearance, solvePitch, sightline } from '../src/minds/marksman.js';
import { heightAt } from '../src/world/noise.js';
import { Q, PLAYER } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n  Does a body with no scene know where the trees are?\n');

// ── the world's own answer ──────────────────────────────────────────────────
const world = createSimWorld();
const anchor = world.ctrl.position;
const field = world.scatter.colliders;
check('the world placed a scatter at all', field.list.length > 0, `${field.list.length} colliders`);

const trunks = field.list.filter((c) => c.kind === CYLINDER && c.tag === 'tree');
const crowns = field.list.filter((c) => c.kind === SPHERE && c.tag === 'tree');
const boulders = field.list.filter((c) => c.kind === SPHERE && c.tag === 'rock');
check('and it has trunks, crowns and boulders in it',
  trunks.length > 0 && crowns.length > 0 && boulders.length > 0,
  `${trunks.length} trunks, ${crowns.length} crowns, ${boulders.length} rocks`);

// ── the same question, from arithmetic ──────────────────────────────────────
//
// A little inside the scatter radius: the placement loop stops at exactly
// `Q.scatterRadius`, and a tree sitting on that circle would be in or out
// depending on floating point rather than on any disagreement worth reporting.
const R = Q.scatterRadius - 2;
const guessedTrees = treesNear(anchor.x, anchor.z, R);
const guessedRocks = rocksNear(anchor.x, anchor.z, R);

const within = (c) => Math.hypot(c.x - anchor.x, c.z - anchor.z) <= R;
// ── the tolerance is FLOAT32, and that is not a fudge ──
//
// The world's colliders are read back out of an InstancedMesh's matrix array,
// which is a Float32Array: a coordinate 400 m from the origin comes back with
// about 3e-5 m of rounding on it. A first pass of this check compared at 1e-6
// and reported 101 of 2149 trees "wrong" — a headline number that was entirely
// the instrument. Half a millimetre is far tighter than anything an arrow can
// tell apart and far looser than float32 noise.
const near = (a, b) => Math.abs(a - b) < 5e-4;

// Trunks, matched by position — position is the identity here, because two
// trees never share a cell.
const worldTrunks = trunks.filter(within);
let matched = 0;
let mismatched = [];
for (const t of guessedTrees) {
  const hit = worldTrunks.find((c) => near(c.x, t.x) && near(c.z, t.z));
  if (!hit) { mismatched.push(`no trunk at ${t.x.toFixed(1)},${t.z.toFixed(1)}`); continue; }
  if (!near(hit.r, t.trunkR) || !near(hit.h, t.trunkH) || !near(hit.y, t.y)) {
    mismatched.push(
      `trunk at ${t.x.toFixed(1)},${t.z.toFixed(1)}: world r=${hit.r.toFixed(3)} h=${hit.h.toFixed(3)} y=${hit.y.toFixed(3)}` +
      ` vs ours r=${t.trunkR.toFixed(3)} h=${t.trunkH.toFixed(3)} y=${t.y.toFixed(3)}`);
    continue;
  }
  matched++;
}
check('every tree it works out is really there, to the millimetre',
  mismatched.length === 0 && matched === guessedTrees.length,
  `${matched}/${guessedTrees.length} exact` + (mismatched.length ? ` · e.g. ${mismatched[0]}` : ''));

// ...and nothing the world planted is missing from our map. This is the
// direction that costs arrows: a tree we cannot see is a tree we shoot into.
const unseen = worldTrunks.filter(
  (c) => !guessedTrees.some((t) => near(t.x, c.x) && near(t.z, c.z))
);
check('and no tree in the world is missing from its map', unseen.length === 0,
  `${worldTrunks.length} trunks within ${R} m, ${unseen.length} unaccounted for`);

const worldCrowns = crowns.filter(within);
const crownMiss = guessedTrees.filter((t) => !worldCrowns.some(
  (c) => near(c.x, t.x) && near(c.z, t.z) && near(c.r, t.crownR) && near(c.y, t.crownCentreY)
));
check('the crowns agree too', crownMiss.length === 0,
  `${guessedTrees.length - crownMiss.length}/${guessedTrees.length} crowns exact`);

const worldRocks = boulders.filter(within);
const rockMiss = guessedRocks.filter((r) => !worldRocks.some(
  (c) => near(c.x, r.x) && near(c.z, r.z) && near(c.r, r.r) && near(c.y, r.centreY)
));
check('and the boulders', rockMiss.length === 0 && worldRocks.length === guessedRocks.length,
  `${guessedRocks.length - rockMiss.length}/${guessedRocks.length} exact, world has ${worldRocks.length}`);

// ── the ground the trees stand on ───────────────────────────────────────────
check('a tree stands on the ground it was placed against',
  guessedTrees.every((t) => Math.abs(t.y - (latticeHeight(t.x, t.z) - 0.3)) < 1e-9),
  'trunk bases sit 0.3 m into the lattice height');

// ── the blocker ─────────────────────────────────────────────────────────────
const blocked = timberBlocker(anchor.x, anchor.z, 120);
const sample = blocked.trees[0];
check('a point inside a trunk reads as solid',
  !!blocked(sample.x, sample.y + sample.trunkH * 0.5, sample.z),
  `the trunk at ${sample.x.toFixed(0)},${sample.z.toFixed(0)}`);
check('a point in its crown reads as solid',
  !!blocked(sample.x, sample.crownCentreY, sample.z), 'the canopy above it');
check('open ground beside it does not',
  !blocked(sample.x + sample.crownR + 4, sample.y + 1.5, sample.z + sample.crownR + 4),
  `${(sample.crownR + 4).toFixed(1)} m clear of the trunk`);

// ── and the point of the exercise ───────────────────────────────────────────
//
// Stand a bowman right in front of a tree and aim at a mark on the far side of
// it. Against bare ground the arc is clear and the shot is on; it is not, and
// the arrow that proves it is in huntcheck's log ending `hit tree`.
// Searched rather than assumed: a tree on rolling ground can have a crest in
// front of it too, and a case where BOTH checks refuse proves nothing about
// either. We want the one where the ground says yes and the wood says no —
// which is precisely the shot the body kept taking.
let trial = null;
for (const t of blocked.trees) {
  if (t.trunkH < 3) continue;
  for (const back of [6, 9, 12]) {
    const from = { x: t.x - back, y: heightAt(t.x - back, t.z), z: t.z };
    const markX = t.x + 10;
    const mark = { x: markX, y: heightAt(markX, t.z) + 0.75, z: t.z };
    const eyeY = from.y + PLAYER.eyeHeight;
    const dist = Math.hypot(mark.x - from.x, mark.z - from.z);
    const pitch = solvePitch(dist, mark.y - eyeY);
    if (pitch === null) continue;
    const ground = arcClearance(from, eyeY, pitch, mark, heightAt);
    if (ground.blocked) continue; // a hill is in the way; not the case we want
    const timber = arcClearance(from, eyeY, pitch, mark, heightAt, { solidAt: blocked });
    if (!timber.blocked) continue;
    trial = { t, from, mark, eyeY, pitch, ground, timber, back };
    break;
  }
  if (trial) break;
}

check('there is a shot the ground calls clear and a tree stops', !!trial,
  trial ? `${trial.back} m short of the trunk at ${trial.t.x.toFixed(0)},${trial.t.z.toFixed(0)}` : 'no such case found');

if (trial) {
  check('the ground-only check calls it clear', !trial.ground.blocked,
    `${trial.ground.clear.toFixed(2)} m of air under the shaft — which is why arrows kept ending in wood`);
  check('THE ARC NOW SEES THE TREE', trial.timber.blocked && trial.timber.what === 'timber',
    `refused: ${trial.timber.what} at ${trial.timber.at.toFixed(1)} m out`);

  // A sightline is the same question for perception — "can I see it" — and the
  // brief tells a mind whether it has one, so it has to see wood as well.
  const m = trial.mark;
  const f = trial.from;
  const seeGround = sightline(f.x, trial.eyeY, f.z, m.x, m.y, m.z, heightAt);
  const seeTimber = sightline(f.x, trial.eyeY, f.z, m.x, m.y, m.z, heightAt, 0.3, blocked);
  check('and so does the sightline the brief is written from',
    !seeGround.blocked && seeTimber.blocked && seeTimber.what === 'timber',
    `ground says ${seeGround.blocked ? 'blocked' : 'clear'}, with timber says ${seeTimber.what ?? 'clear'}`);
}

// ── and the same question for a SERVER, which has more than one player ──────
//
// `Scatter` places ONE patch around ONE position, and the multiplayer world
// called it with the first player in the map. So the trees that could stop an
// arrow existed around whoever joined first and nowhere else: every other
// player was shooting through a forest their own browser was drawing and the
// server had never heard of. Nothing could see it in single player, and a fleet
// of agents spread over a valley is nothing but that case.
{
  const sim = new SimWorld({ headless: true });
  const a = sim.addPlayer('a', 'Alice');
  const b = sim.addPlayer('b', 'Bob');
  // Bob walks half a kilometre away — further than any one patch reaches.
  const far = { x: a.ctrl.position.x + 520, z: a.ctrl.position.z - 380 };
  b.ctrl.teleport({ x: far.x, y: heightAt(far.x, far.z), z: far.z }, 0);
  sim.step(1 / 30);

  // Trunks only — every tree contributes a cylinder AND a crown sphere, and
  // counting both makes the number twice the trees and reads as a bug.
  const treesBy = (x, z, r) => sim.scatterColliders.list.filter(
    (c) => c.tag === 'tree' && c.kind === CYLINDER && Math.hypot(c.x - x, c.z - z) < r
  ).length;
  const nearAlice = treesBy(a.ctrl.position.x, a.ctrl.position.z, 120);
  const nearBob = treesBy(b.ctrl.position.x, b.ctrl.position.z, 120);
  // What SHOULD be there, from the same arithmetic the agent uses.
  const owedBob = treesNear(b.ctrl.position.x, b.ctrl.position.z, 120).length;

  check('the server has solid trees around the first player', nearAlice > 0, `${nearAlice} within 120 m`);
  check('AND AROUND EVERYBODY ELSE', nearBob >= owedBob && owedBob > 0,
    `Bob is 640 m away with ${nearBob} of an owed ${owedBob} — this was 0 before today`);
}

// ── nothing was left standing in the air ────────────────────────────────────
// A tree beside deep water or on a cliff is the placement rule leaking.
const drowned = guessedTrees.filter((t) => t.y < -0.3);
check('no tree is standing in the loch', drowned.length === 0, `${drowned.length} below the waterline`);

const passed = results.filter((r) => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed\n`);
process.exit(passed === results.length ? 0 : 1);
