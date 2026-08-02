// ── ottercheck.js ───────────────────────────────────────────────────────────
// The otter: does care actually buy obedience, and is "seek" reliable?
//
//   npm run ottercheck
//
// Three claims worth proving, because all three are easy to say and easy to
// get wrong:
//
//   1. TRUST IS THE GATE. A neglected otter will not work for you, and no
//      amount of pressing the button changes that. If commands succeed on a
//      starving animal, care is decorative.
//   2. SEEK IS RELIABLE. It was asked for by that word. If there is food in
//      range it points at the NEAREST one, every time, with no dice. What
//      varies is range, never accuracy.
//   3. IT FIGHTS FOR YOU, and only for you — it answers what attacked you, not
//      whatever happens to be nearby.

import * as THREE from 'three';
import { Otter, TRICKS, TRICK_IDS } from '../src/creatures/otter.js';
import { OTTER } from '../src/config.js';
import { makeRandom } from '../src/world/noise.js';
import { heightAt } from '../src/world/noise.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const STEP = 1 / 60;
const at = (x, z) => new THREE.Vector3(x, heightAt(x, z), z);
const owner = { position: at(300, 200) };
const mild = { airC: 14, nearFire: false, shelter: 0, night: 0, dayMinutes: 24 };

function freshOtter() {
  const o = new Otter(at(302, 200), makeRandom('ottercheck'));
  return o;
}
const run = (o, seconds, ctx = mild, world = {}) => {
  for (let i = 0; i < seconds * 60; i++) o.update(STEP, owner, world, ctx);
};

console.log('\n  An otter you have just met.\n');

// ── 1. taming is care, repeated ──
let o = freshOtter();
check('a wild otter takes no commands', !o.command_('sit').ok,
  `trust ${o.trust.toFixed(2)} — ${o.command_('sit').why}`);

const feeds = [];
for (let i = 0; i < 4; i++) {
  const r = o.feed('venison');
  feeds.push(r.ok ? `${o.trust.toFixed(2)}` : `full`);
  o.fed = 0.4; // pretend a while has passed, so it will eat again
}
check('feeding it earns trust', o.trust > 0.3, `trust after four feeds: ${feeds.join(' -> ')}`);
check('and it gets a name along the way', !!o.name, o.name ?? 'unnamed');
check('now it will take a command', o.command_('sit').ok, `trust ${o.trust.toFixed(2)}`);

// ── 2. training is repetition, per trick ──
o = freshOtter();
o.trust = 0.7;
o.fed = o.played = o.warmth = 0.9;
const before = [...o.learned];
for (let i = 0; i < TRICKS.sit.reps; i++) o.command_('sit');
check('a trick is learned by repetition', o.learned.has('sit'),
  `${before.length} known before, sit learned after ${TRICKS.sit.reps} tries`);
check('and only that trick', !o.learned.has('lie'),
  `knows ${[...o.learned].join(', ')}; lie is ${o.progress.lie}/${TRICKS.lie.reps}`);

const hard = o.command_('guard');
check('a hard trick needs more trust than an easy one', TRICKS.guard.needs > TRICKS.sit.needs,
  `guard needs ${TRICKS.guard.needs}, sit needs ${TRICKS.sit.needs}`);

// ── 3. a miserable otter will not work ──
o = freshOtter();
o.trust = 0.7;
o.fed = 0.05;
o.played = 0.05;
o.warmth = 0.1;
o.decay(0.016, mild);
const refused = o.command_('lie');
check('a neglected otter refuses to learn', !refused.ok, `${refused.why} (care ${o.care.toFixed(2)})`);
check('and its mood says which need it is', ['hungry', 'shivering', 'restless'].includes(o.mood), o.mood);

// ── neglect costs you a trick ──
o = freshOtter();
o.trust = 0.8;
o.learned = new Set(['sit', 'lie', 'guard']);
o.fed = o.played = o.warmth = 0.05;
const knewBefore = o.learned.size;
// Genuinely neglected, which means COLD as well as hungry and bored. Run at
// 14 C and the otter simply warms back up, care climbs over the threshold and
// nothing is forgotten — correct behaviour, and the reason the first version
// of this check passed nothing.
run(o, OTTER.forgetSeconds + 4, { airC: -6, nearFire: false, shelter: 0, night: 1, dayMinutes: 24 });
check('sustained neglect loses the hardest trick first', o.learned.size < knewBefore && !o.learned.has('guard'),
  `knew ${knewBefore}, now knows ${[...o.learned].join(', ') || 'nothing'}`);
check('trust falls faster than it rises', OTTER.trustLoss > OTTER.trustGain,
  `${OTTER.trustLoss}/s down vs ${OTTER.trustGain}/s up`);

// ── warmth: a holt and a fire actually help ──
const cold = { airC: -4, nearFire: false, shelter: 0, night: 1, dayMinutes: 24 };
const exposed = freshOtter();
exposed.trust = 0.6;
run(exposed, 25, cold);
const housed = freshOtter();
housed.trust = 0.6;
housed.setHome(housed.position.x, housed.position.z);
run(housed, 25, cold);
const byFire = freshOtter();
byFire.trust = 0.6;
run(byFire, 25, { ...cold, nearFire: true });
check('a cold night hurts an otter with no home', exposed.warmth < 0.3,
  `warmth ${exposed.warmth.toFixed(2)} at -4 C`);
check('a holt keeps it warm', housed.warmth > exposed.warmth + 0.3,
  `${exposed.warmth.toFixed(2)} -> ${housed.warmth.toFixed(2)}`);
check('so does a fire', byFire.warmth > exposed.warmth + 0.2,
  `${exposed.warmth.toFixed(2)} -> ${byFire.warmth.toFixed(2)}`);

// ── 4. SEEK IS RELIABLE ──
o = freshOtter();
o.trust = 0.9;
o.fed = o.played = o.warmth = 1;
o.learned = new Set(['seek']);

const food = [
  { x: 340, z: 200, what: 'a deer' },
  { x: 306, z: 204, what: 'venison' },  // the nearest
  { x: 380, z: 260, what: 'a deer' },
];
const world = {
  nearestFood: (x, z, range) => {
    let best = null;
    for (const f of food) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d > range || (best && d >= best.distance)) continue;
      best = { ...f, distance: d };
    }
    return best;
  },
};

let alwaysNearest = true;
let everFailed = false;
for (let i = 0; i < 50; i++) {
  const r = o.seek(world);
  if (!r.ok || !r.found) everFailed = true;
  else if (r.found.what !== 'venison') alwaysNearest = false;
}
check('seek never fails when there is food in range', !everFailed, '50 of 50 found something');
check('and it always points at the NEAREST', alwaysNearest, '50 of 50 chose the venison at 4 m');

// Range scales with training and condition, but accuracy never wavers.
const eager = o.seek(world).range;
o.trust = 0.35;
o.fed = 0.3;
o.played = 0.3;
o.warmth = 0.3;
const weary = o.seek(world).range;
check('a better-kept otter casts further', eager > weary + 20,
  `${weary.toFixed(0)} m when neglected, ${eager.toFixed(0)} m when devoted`);

o.trust = 0.9;
const nothing = o.seek({ nearestFood: () => null });
check('with nothing in range it says so rather than lying', nothing.ok && nothing.found === null,
  'points at nothing, reports nothing');

const untrained = freshOtter();
untrained.trust = 0.9;
check('an otter that has not learned seek cannot seek', !untrained.seek(world).ok,
  untrained.seek(world).why);

// ── 5. it fights for you ──
o = freshOtter();
o.trust = 0.8;
o.guarding = true;
const goblin = { position: at(305, 202), state: 'charge', species: { name: 'Goblin', hitZones: [{ name: 'body', multiplier: 1 }] } };
check('it will not guard until told to', (() => {
  const off = freshOtter();
  off.trust = 0.8;
  off.guarding = false;
  return !off.defend(goblin);
})(), 'guarding is a standing order, not a default');

check('a guarding otter answers what hurt you', o.defend(goblin) && o.state === 'attack',
  `state ${o.state}, target ${goblin.species.name}`);

let bit = false;
for (let i = 0; i < 60 * 6; i++) {
  o.update(STEP, owner, world, mild);
  if (o.pendingBite) { bit = true; o.pendingBite = null; }
}
check('and it actually bites', bit, `${OTTER.biteDamage} damage a bite — a distraction, not a weapon`);

o.stateTime = OTTER.attackSeconds + 1;
o.update(STEP, owner, world, mild);
check('it breaks off rather than fighting to the death', o.state !== 'attack',
  `gives up after ${OTTER.attackSeconds} s and comes back to you`);

const wild = freshOtter();
wild.guarding = true; // even if set
check('a WILD otter will not fight for you', !wild.defend(goblin),
  `trust ${wild.trust.toFixed(2)} — it is not yours yet`);

// ── 6. it survives being saved ──
o = freshOtter();
o.trust = 0.72;
o.feed('venison');
o.learned = new Set(['sit', 'speak']);
o.progress.lie = 2;
o.setHome(310, 205);
o.guarding = true;
const json = JSON.parse(JSON.stringify(o.toJSON()));
const loaded = freshOtter();
loaded.fromJSON(json);
check('a tamed otter survives a save', loaded.name === o.name && Math.abs(loaded.trust - o.trust) < 0.01,
  `${loaded.name}, trust ${loaded.trust.toFixed(2)}`);
check('its tricks survive too', loaded.learned.has('sit') && loaded.learned.has('speak') && loaded.progress.lie === 2,
  `knows ${[...loaded.learned].join(', ')}, half-way through lie`);
check('and its holt', !!loaded.home && loaded.guarding, 'home and standing orders kept');

// ── the full roster ──
console.log('\n  Tricks it can learn:\n');
for (const id of TRICK_IDS) {
  const t = TRICKS[id];
  console.log(
    `    ${t.name.padEnd(10)} "${t.cue}"`.padEnd(30) +
      `${String(t.reps).padStart(2)} reps · needs trust ${t.needs.toFixed(2)}` +
      `${t.useful ? '  ← earns its keep' : ''}`
  );
  console.log(`               ${t.blurb}`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
