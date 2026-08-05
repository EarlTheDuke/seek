// ── spreadcheck.js ──────────────────────────────────────────────────────────
// Is the world alive around EVERY player, or only around the first one?
//
//   npm run spreadcheck
//
// Spawning learned to follow everybody. Culling did not, and that combination
// is worse than either bug on its own: animals were born around the second
// player and deleted on the frame they were born, because `manager.update`
// measured every distance to `playerPos` — which `world.js` filled from
// `everyone[0]` alone. It was permanent, too. The site stayed in `spawnedSites`
// so the ground never refilled.
//
// Printed live before the fix, two players 900 m apart, four seconds:
//
//     11 alive — nearest to Ann 110 m, nearest to Bel 931 m
//     removals: 15 total, 15 of them standing WITHIN Bel's spawn radius
//
// That is why multiplayer looked empty. Not the population cap — that was 26
// and only 18 were alive.
//
// This drives the real `Wildlife` with two anchors and demands that both of
// them have a populated hillside, that each creature is sensed by whoever is
// actually near it, and that single-player culling is untouched.

import * as THREE from 'three';
import { Wildlife } from '../src/creatures/manager.js';
import { WILDLIFE } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const at = (x, z) => new THREE.Vector3(x, 0, z);
const DAY = { sunAltitude: 60 };
// The three fields a creature senses you through.
const quiet = () => ({ noise: 0, visibility: 0, scentAt: () => 0 });
const loud = () => ({ noise: 1, visibility: 1, scentAt: () => 0 });

const nearest = (w, pos) => {
  let best = Infinity;
  for (const c of w.creatures) {
    best = Math.min(best, Math.hypot(c.position.x - pos.x, c.position.z - pos.z));
  }
  return best;
};
const within = (w, pos, r) => w.creatures.filter(
  (c) => Math.hypot(c.position.x - pos.x, c.position.z - pos.z) <= r).length;

// Two anchors far enough apart that neither is inside the other's spawn radius,
// so anything standing by one of them was unambiguously spawned for that one.
const ANN = at(0, 0);
const BEL = at(900, 0);
const R = WILDLIFE.spawnRadius;

console.log('\n  A hillside for everybody\n');

const world = (anchors) => {
  const w = new Wildlife(new THREE.Scene(), { stealth: null, audio: null });
  w.extraAnchors = anchors;
  return w;
};

// ── the bug, in one measurement ────────────────────────────────────────────
const w = world([{ key: 'bel', x: BEL.x, z: BEL.z, pos: BEL, stealth: quiet() }]);
for (let i = 0; i < 240; i++) w.update(1 / 60, ANN, quiet(), DAY);

const nAnn = within(w, ANN, R);
const nBel = within(w, BEL, R);
console.log(`      ${w.creatures.length} alive — ${nAnn} within ${R} m of Ann, ${nBel} of Bel`);
console.log(`      nearest to Ann ${nearest(w, ANN).toFixed(1)} m, `
  + `nearest to Bel ${nearest(w, BEL).toFixed(1)} m`);

check('the first player has animals', nAnn > 0, `${nAnn} of them`);
check('and so does the second', nBel > 0,
  nBel > 0 ? `${nBel} of them, nearest ${nearest(w, BEL).toFixed(1)} m`
    : 'NONE — every one spawned for Bel was culled on the frame it was born');
check('neither hillside is a leftover of the other',
  nearest(w, BEL) < R && nearest(w, ANN) < R,
  `${nearest(w, ANN).toFixed(1)} m and ${nearest(w, BEL).toFixed(1)} m`);

// ── and it stays populated ─────────────────────────────────────────────────
// The old failure was permanent: a culled site is a used site, so it never
// refilled. Four more seconds must not quietly empty Bel's hillside.
for (let i = 0; i < 240; i++) w.update(1 / 60, ANN, quiet(), DAY);
check('Bel still has them four seconds later', within(w, BEL, R) > 0,
  `${within(w, BEL, R)} within ${R} m`);

// ── whose stealth does a creature read? ────────────────────────────────────
// A deer standing on top of Bel should startle at BEL. Before the fix it was
// handed the first player's profile, so a man creeping up on it was invisible
// while somebody a kilometre away decided whether it panicked.
const s = world([]);
const target = s.spawn('deer', 0, 40);
target.awareness = 0;
s.extraAnchors = [{ key: 'bel', x: 0, z: 40, pos: at(0, 40), stealth: loud() }];
for (let i = 0; i < 120; i++) s.update(1 / 60, at(0, -3000), quiet(), DAY);
check('a deer senses the player standing next to it', target.awareness > 0.2,
  `awareness ${target.awareness.toFixed(2)} with a loud visible man at 0 m `
  + 'and a quiet one 3 km away');

// ── single-player is untouched ─────────────────────────────────────────────
const solo = new Wildlife(new THREE.Scene(), { stealth: null, audio: null });
const doomed = solo.spawn('deer', 0, 0);
solo.update(1 / 60, at(0, 0), quiet(), DAY);
solo.update(1 / 60, at(0, WILDLIFE.despawnRadius + 60), quiet(), DAY);
check('one player alone still culls what he walks away from',
  !solo.creatures.includes(doomed), `gone at ${WILDLIFE.despawnRadius + 60} m`);

// ── the cull is nearest-of-any, not everyone-lives ─────────────────────────
// The opposite failure would be just as bad: never culling anything, so the
// server drags a continent of animals around behind it.
const both = world([{ key: 'bel', x: BEL.x, z: BEL.z, pos: BEL, stealth: quiet() }]);
const stray = both.spawn('deer', 4000, 4000);
both.update(1 / 60, ANN, quiet(), DAY);
check('something far from EVERY player is still culled',
  !both.creatures.includes(stray), 'a deer 4 km from both is gone');

// ── the cap is a budget per player, not a shared total ─────────────────────
// Fixing the cull alone was NOT enough, and this is the measurement that said
// so: with everyone's animals finally surviving they all came out of the same
// 26, and six players a kilometre apart got 15, 7, 0, 0, 0 and 0.
const SIX = [at(0, 0), at(900, 0), at(0, 900), at(-900, 0), at(0, -900), at(900, 900)];
const six = world(SIX.slice(1).map((p, i) => (
  { key: `p${i}`, x: p.x, z: p.z, pos: p, stealth: quiet() })));
for (let i = 0; i < 600; i++) six.update(1 / 60, SIX[0], quiet(), DAY);

const counts = SIX.map((p) => within(six, p, R));
console.log(`      six players: ${counts.join(', ')} within ${R} m `
  + `(${six.creatures.length} alive, cap ${six.aliveCap()})`);
check('every one of six spread players has a populated hillside',
  counts.every((n) => n > 0), counts.join(', '));
check('and the cap grew with them rather than being shared',
  six.aliveCap() > WILDLIFE.maxAlive && six.aliveCap() <= WILDLIFE.maxAliveTotal,
  `${six.aliveCap()}, ceiling ${WILDLIFE.maxAliveTotal}`);

// One player is one budget, so nothing about playing alone changed.
const alone = new Wildlife(new THREE.Scene(), { stealth: null, audio: null });
check('one player is still exactly one budget',
  alone.aliveCap() === WILDLIFE.maxAlive, `${alone.aliveCap()}`);

const passed = results.filter(Boolean).length;
console.log(`\n  ${passed}/${results.length}\n`);
process.exit(passed === results.length ? 0 : 1);
