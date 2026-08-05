// ── woundcheck.js ───────────────────────────────────────────────────────────
// Does damage stick?
//
//   npm run woundcheck
//
// A troll has 420 hit points, a 300 m leash and a 400 m cull. A tester put five
// arrows into one, watched it walk home, went and found it again — and it was
// whole. It had left the simulation with its wounds and come back rebuilt from
// the species table. The fight was not hard, it was impossible: there was no
// way to bank progress on it at all.
//
// So a creature you have hurt stays loaded. This checks both halves of that —
// that wounds persist, AND that the world does not slowly fill with limping
// survivors of fights nobody remembers.

import * as THREE from 'three';
import { Wildlife } from '../src/creatures/manager.js';
import { WILDLIFE } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const scene = new THREE.Scene();
const w = new Wildlife(scene, { stealth: null, audio: null });
const at = (x, z) => new THREE.Vector3(x, 0, z);
const NIGHT = { sunAltitude: -20 };
// The three fields a creature senses you through. Deliberately a quiet, unseen,
// scentless player — this file is about the CULL, and a troll that notices you
// and charges would be testing something else.
const QUIET = { noise: 0, visibility: 0, scentAt: () => 0 };
const FAR = WILDLIFE.despawnRadius + 60;

console.log('\n  Wounds stick\n');

// ── the old behaviour, which was right for anything unhurt ──
const healthy = w.spawn('troll', 0, 0);
w.update(1 / 60, at(0, 0), QUIET, NIGHT);
w.update(1 / 60, at(0, FAR), QUIET, NIGHT);
check('an unhurt creature past the cull is still removed',
  !w.creatures.includes(healthy), `culled at ${FAR} m, as before`);

// ── the fix ──
const hurt = w.spawn('troll', 0, 0);
hurt.hp = 249; // the tester's real best: 420 down to 249, then it got away
w.update(1 / 60, at(0, FAR), QUIET, NIGHT);
check('a wounded one is NOT removed', w.creatures.includes(hurt),
  `${hurt.hp}/${hurt.maxHp} hp at ${FAR} m`);
check('and it keeps the wound', hurt.hp === 249, `still ${hurt.hp}`);

// ── come back before it forgets ──
const chased = w.spawn('troll', 0, 0);
chased.hp = 100;
for (let i = 0; i < 60; i++) w.update(1, at(0, FAR), QUIET, NIGHT);
w.update(1 / 60, at(0, 0), QUIET, NIGHT);
check('walk away a minute and come back — still hurt',
  w.creatures.includes(chased) && chased.hp === 100,
  `${chased.hp} hp after 60 s away, limit is ${WILDLIFE.woundForgetSeconds} s`);

// ── but a forgotten fight heals ──
// Otherwise every skirmish you ever broke off leaves a cripple in the world for
// the rest of the run, and the roster fills with them.
const forgotten = w.spawn('troll', 0, 0);
forgotten.hp = 50;
let t = 0;
while (t < WILDLIFE.woundForgetSeconds + 30 && w.creatures.includes(forgotten)) {
  w.update(1, at(0, FAR), QUIET, NIGHT);
  t++;
}
check('but a wound nobody came back for heals, and it becomes cullable',
  forgotten.hp === forgotten.maxHp || !w.creatures.includes(forgotten),
  `${t} s away (limit ${WILDLIFE.woundForgetSeconds} s)`);

// ── and staying near it does not start the clock ──
const engaged = w.spawn('troll', 0, 0);
engaged.hp = 200;
for (let i = 0; i < WILDLIFE.woundForgetSeconds + 30; i++) {
  w.update(1, at(0, 10), QUIET, NIGHT); // standing right there, fighting it
}
check('a fight you are still in never heals under you',
  engaged.hp === 200, `${engaged.hp} hp after ${WILDLIFE.woundForgetSeconds + 30} s at 10 m`);

// ── a corpse is still a corpse ──
const dead = w.spawn('deer', 0, 0);
dead.hp = 0;
dead.state = 'dead';
w.update(1 / 60, at(0, FAR), QUIET, NIGHT);
check('a body you walked away from is still gone for good',
  !w.creatures.includes(dead), 'zero hp must not count as "wounded" and pin it forever');

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
