// ── nopetcheck.js ───────────────────────────────────────────────────────────
// Does the game work for somebody who brought no animal?
//
//   npm run nopetcheck
//
// Pets now default to OFF (see TRAJECTORY.md), which makes "no pet" the state
// almost every session runs in — and it had never once been tested. Every check
// in this suite that touches a companion asks for one; none asked what happens
// without.
//
// The risk this file exists to catch is specific. `main.js` holds `pet` as a
// const and reads it in about 140 places with essentially one guard, so the
// absent animal is an OBJECT rather than a null — it exists, it is never tame,
// it is never drawn, and it does nothing on update. That is cheap and safe, and
// it has one failure mode worth guarding: an absent animal that quietly still
// HELPS, because every helper path asks `pet.tame && petNear()` and a bug in
// `tame` would hand a petless player an otter's foraging for free.
//
// So this asserts both halves: the world still works, and the animal that is
// not there does nothing.

import { Companion } from '../src/creatures/companion.js';
import { COMPANION_IDS } from '../src/creatures/companions.js';
import { SimWorld } from '../src/sim/world.js';
import { makeRandom } from '../src/world/noise.js';
import * as THREE from 'three';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n  A player who brought no animal\n');

// ── the absent animal itself ──
const none = new Companion('none', new THREE.Vector3(0, 0, 0), makeRandom('nopet'));
const otter = new Companion('otter', new THREE.Vector3(0, 0, 0), makeRandom('nopet'));

check('an absent animal still constructs', !!none && none.absent === true,
  `absent=${none.absent}`);

check('  …and it is NEVER tame, which is what switches every helper off',
  none.tame === false,
  'tame=false — foraging, the fishing bonus, guarding and the E prompt all ask this first');

check('  …and a chosen animal is unaffected', otter.absent === false,
  `otter absent=${otter.absent}, species=${otter.species.id}`);

// Feeding and playing must not be able to tame something that is not there —
// otherwise a petless player who wanders past a berry gets an invisible helper.
none.fed = 1;
none.played = 1;
none.trust = 1;
check('  …and it cannot be tamed by force either', none.tame === false,
  'trust/fed/played all maxed and still not tame');

// ── it must do nothing when the world ticks ──
const before = none.object.position.clone();
none.update(1 / 60, new THREE.Vector3(50, 0, 50), null, {});
check('  …and a tick moves it nowhere and says nothing',
  none.object.position.equals(before) && !none.says,
  `moved ${none.object.position.distanceTo(before).toFixed(3)} m, says=${none.says ?? 'null'}`);

// ── the picker still offers every animal ──
check('every animal is still choosable', COMPANION_IDS.length >= 6,
  `${COMPANION_IDS.length} species: ${COMPANION_IDS.join(', ')}`);
check('  …and "none" is not one of them — it is the absence, not a species',
  !COMPANION_IDS.includes('none'), 'COMPANION_IDS is unchanged');

// ── the server side, which was always ready for this ──
const w = new SimWorld({ headless: true });
const p = w.addPlayer(1, 'Alone');
check('a player joins the server with no companion at all', p.companion === null,
  'Player.companion === null — the server has defaulted to this since it was written');

for (let i = 0; i < 120; i++) w.step(1 / 60);
check('  …and the world ticks two seconds without one', w.tick >= 120, `${w.tick} ticks`);

const snap = w.snapshot(p.id);
check('  …and the snapshot carries no companion for them',
  !(snap.co ?? []).some((c) => c.o === p.id),
  `co has ${(snap.co ?? []).length} entries, none owned by #${p.id}`);

// ── and one WITH an animal still works, so this did not cost the feature ──
const w2 = new SimWorld({ headless: true });
const p2 = w2.addPlayer(1, 'Companioned', { pet: 'otter' });
check('and somebody who ASKED for one still gets it', !!p2.companion,
  p2.companion ? `a ${p2.companion.species.name.toLowerCase()}` : 'none — the opt-in is broken');

const passed = results.filter((r) => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed\n`);
process.exit(passed === results.length ? 0 : 1);
