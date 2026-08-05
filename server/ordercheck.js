// ── ordercheck.js ───────────────────────────────────────────────────────────
// Can a person direct a company, and does the company stay a company?
//
//   npm run ordercheck
//
// No network and no model. This is about the two things a party needs and the
// choice between them:
//
//   'decides' — what you say is PERCEPTION. It reaches the mind in the brief
//     and the mind does as it thinks best, which may be to ignore you.
//   'obeys'   — a recognised instruction becomes a goal directly, without
//     consulting the mind at all.
//
// Both are supported on purpose and neither is a fallback for the other. The
// first answers "is this good company"; the second answers "is this fight
// winnable", and you cannot test the second while the answer depends on
// whether a model felt like helping.

import { Agent } from '../src/net/agent.js';
import { ScriptedProvider } from '../src/minds/providers.js';
import { makeRandom } from '../src/world/noise.js';
import { GOALS } from '../src/minds/goals.js';
import { AGENTS } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const make = (orders) => {
  const a = new Agent({ name: 'Morag', provider: new ScriptedProvider(() => 0.5), rand: makeRandom('o'), orders });
  a._x = 0; a._z = 0; a.yaw = 0;
  return a;
};

/** A snapshot with a person and, optionally, something hostile beside them. */
const world = (self, ben, beast = null) => ({
  pl: [{ id: 1, p: [ben.x, 0, ben.z], h: 100 }],
  cr: beast ? [{ i: 9, k: beast.k, p: [beast.x, 0, beast.z], s: 'hunt', h: 400 }] : [],
});

console.log('\n  Orders\n');

// ── the vocabulary ──
check('follow and guard are real verbs', !!GOALS.follow && !!GOALS.guard,
  Object.keys(GOALS).join(', '));

// ── 'obeys': a sentence becomes a goal, now ──
let a = make('obeys');
check('"follow me" is understood', a.takeOrder('Ben', 'follow me') && a.goal.kind === 'follow',
  `-> ${JSON.stringify(a.goal)}`);
check('and it knows who said it', a.goal.target === 'Ben');

a = make('obeys');
check('"cover me" is a guard', a.takeOrder('Ben', 'cover me') && a.goal.kind === 'guard');
a = make('obeys');
check('"watch my back" too', a.takeOrder('Ben', 'watch my back') && a.goal.kind === 'guard');
a = make('obeys');
check('"kill the troll" names the quarry',
  a.takeOrder('Ben', 'kill the troll') && a.goal.quarry === 'a troll', JSON.stringify(a.goal));
a = make('obeys');
check('"hold" stops them', a.takeOrder('Ben', 'wait here') && a.goal.kind === 'hold');
a = make('obeys');
check('"carry on" hands them back to themselves',
  a.takeOrder('Ben', 'carry on') && a.goal.kind === 'wander');

// Nothing is ever swallowed: an unrecognised sentence falls through to the mind.
a = make('obeys');
check('an order it does not understand is NOT taken',
  a.takeOrder('Ben', 'the light on that ridge is extraordinary') === false,
  'falls through to the mind rather than being guessed at');

// ── 'decides': the same sentence changes no goal at all ──
a = make('decides');
const before = JSON.stringify(a.goal);
a.heard.push('Ben: follow me');
check('in "decides" mode a sentence commands nothing directly',
  JSON.stringify(a.goal) === before, `still ${before}`);
check('but it IS in the brief, for the mind to weigh',
  a.brief().heard.some((h) => /follow me/.test(h)), JSON.stringify(a.brief().heard));

// ── station-keeping ──
a = make('obeys');
a.takeOrder('Ben', 'follow me');
a.others.set(1, 'Ben');
a.snapshot = world(a, { x: 100, z: 0 });
let t = a.resolve(a.goal);
check('follow walks toward them but stops short',
  t && Math.abs(Math.hypot(t.x, t.z) - (100 - AGENTS.followWithin)) < 1,
  `heads for ${t?.x.toFixed(0)} m, ${AGENTS.followWithin} m short of them`);

a._x = 96; // now standing beside them
t = a.resolve(a.goal);
check('and holds station once close', t === null, 'no target — it stays put');

// ── guard breaks off ──
a = make('obeys');
a.takeOrder('Ben', 'guard me');
a.others.set(1, 'Ben');
a._x = 0; a._z = 0;
a.snapshot = world(a, { x: 40, z: 0 }, { k: 'troll', x: 55, z: 0 });
t = a.resolve(a.goal);
check('guard goes for a troll standing near the person',
  t && Math.abs(t.x - 55) < 1, `heads for the troll at ${t?.x.toFixed(0)}, not the man at 40`);

// A deer is not a threat, and a guard that charges deer is a liability.
a.snapshot = world(a, { x: 40, z: 0 }, { k: 'deer', x: 55, z: 0 });
t = a.resolve(a.goal);
check('but ignores a deer and keeps station',
  t && Math.abs(t.x - (40 - AGENTS.followWithin)) < 1,
  'faction is read off the species table, so a new predator is covered for free');

// Far enough away and it is not this guard's problem yet.
a.snapshot = world(a, { x: 40, z: 0 }, { k: 'troll', x: 40 + AGENTS.guardRange + 20, z: 0 });
t = a.resolve(a.goal);
check('a threat beyond guard range does not pull them off station',
  t && Math.abs(t.x - (40 - AGENTS.followWithin)) < 1, `range is ${AGENTS.guardRange} m`);

// ── follow does NOT fight ──
a = make('obeys');
a.takeOrder('Ben', 'follow me');
a.others.set(1, 'Ben');
a._x = 0; a._z = 0;
a.snapshot = world(a, { x: 40, z: 0 }, { k: 'troll', x: 55, z: 0 });
t = a.resolve(a.goal);
check('follow keeps walking with you and lets the troll be',
  t && Math.abs(t.x - (40 - AGENTS.followWithin)) < 1,
  'that difference is the whole reason both verbs exist');

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
