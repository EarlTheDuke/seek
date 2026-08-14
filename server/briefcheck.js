// ── briefcheck.js ───────────────────────────────────────────────────────────
// Does the brief tell a mind the things it will not work out for itself?
//
//   npm run briefcheck
//
// This project has now made the same mistake five times, and every time it read
// as a stupid model:
//
//   * A body with no arrows hunted for an hour. It was carrying an empty bow and
//     the brief listed only what it HAD, so "no arrows" was an absence from a
//     list. `lacking` fixed it.
//   * Bodies hoarded to 205 branches because nothing said the pack was full.
//     `full` fixed it.
//   * A mind chose `craft` twice with an empty pack, was refused, and spent a
//     decision finding out what the brief could have told it. `canMake` (TODO
//     0k) fixed it.
//   * The `eat` verb was CHOSEN ONCE in the project's history while Eachann sat
//     at food 28 holding three raw venison. `couldEat` (0e) is this file's first
//     subject.
//   * Four minds agreed a shared hunt in their own words and executed none of
//     it, because a walk to a person outlasts a deliberation and the next
//     decision was made in ignorance of the last. `errand` (0i) is the second.
//
// THE SHAPE IS ALWAYS THE SAME: the fact was available, the model had to make
// two or three inferences to reach it, and it did not. None of these lines tell
// a mind what to WANT — they state a fact about its own body and name the verb
// that acts on it, which is the shared floor `lacking` and `full` are written
// to. That distinction is the whole reason `personacheck` exists, and it is why
// these lines go to every seat identically, personas on or off.

import { Agent } from '../src/net/agent.js';
import { briefToText } from '../src/minds/perception.js';
import { sanitiseGoal } from '../src/minds/goals.js';
import { AGENTS } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n  Briefcheck — is the brief telling a mind what it will not infer?\n');

/**
 * A body with just enough on it for the brief to be built.
 *
 * Prototype-borrowed rather than connected, the same trick `hailcheck` uses: the
 * two lines under test read the pack, the belly and the current target, and
 * none of that needs a socket. `survivalcheck` proves the same methods work on a
 * live body.
 */
function body(over = {}) {
  const a = Object.create(Agent.prototype);
  Object.assign(a, {
    name: 'Mairi', id: 1, _x: 0, _y: 0, _z: 0, yaw: 0,
    carrying: {}, food: 60, health: 100, coreC: 36.5, hours: 9,
    others: new Map(), snapshot: { lo: [], fi: [], cr: [], pl: [] },
    goal: { kind: 'wander' }, target: null, // The real `Memory` shape, not a guess: `brief()` calls `recent(hours)`.
    memory: { all: () => [], recent: () => [], add() {} },
    outcomes: [], deeds: [], intentions: [], acted: {}, taken: new Set(),
    _takenAt: new Map(), said: [], plan: [], note: '',
    // Everything else `brief()` reaches for. Listed from the method itself
    // rather than discovered one exception at a time.
    heard: [], shotBy: null, shootRange: 40, timber: null,
  }, over);
  return a;
}

// ── 0e. HUNGRY, WITH THE CURE IN THE PACK ───────────────────────────────────
{
  const hungry = body({ food: 28, carrying: { venison: 3, wood: 9 } });
  check('A HUNGRY BODY CARRYING FOOD IS TOLD SO — the exact state Eachann sat in',
    hungry.brief().couldEat.length > 0, JSON.stringify(hungry.brief().couldEat));
  // A brief that disagrees with itself two lines apart is a brief nobody trusts.
  // The first cut dropped the count and read "carrying venisons" while the line
  // above it read "3 venisons".
  check('  …counted, and worded the same way the carrying line words it',
    /^\d+ /.test(hungry.brief().couldEat[0] ?? '')
      && briefToText(hungry.brief()).includes(hungry.brief().couldEat[0]),
    `couldEat "${hungry.brief().couldEat[0]}" vs carrying "${hungry.brief().carrying.find((c) => /venison/.test(c))}"`);
  check('  …and it reaches the words a model reads, naming the verb',
    /hungry and carrying/.test(briefToText(hungry.brief()))
      && /"eat" would fill you now/.test(briefToText(hungry.brief())),
    (briefToText(hungry.brief()).match(/You are hungry and carrying.*/) ?? ['NO LINE'])[0]);

  const fed = body({ food: 90, carrying: { venison: 3 } });
  check('  …and a FED body is not told about its lunch — a brief nobody reads helps nobody',
    fed.brief().couldEat.length === 0 && !/would fill you now/.test(briefToText(fed.brief())),
    `at food ${fed.food}, couldEat = ${JSON.stringify(fed.brief().couldEat)}`);

  const empty = body({ food: 10, carrying: { wood: 9 } });
  check('  …and a starving body with NO food is not offered an imaginary meal',
    empty.brief().couldEat.length === 0, JSON.stringify(empty.brief().couldEat));

  check('SENTINEL: the threshold is the reflex\'s own, so the line cannot drift from the behaviour',
    body({ food: AGENTS.eatBelow - 1, carrying: { venison: 1 } }).brief().couldEat.length === 1
      && body({ food: AGENTS.eatBelow + 1, carrying: { venison: 1 } }).brief().couldEat.length === 0,
    `eatBelow = ${AGENTS.eatBelow}`);
}

// ── 0i. THE ERRAND YOU ARE HALFWAY THROUGH ──────────────────────────────────
{
  const walking = body({
    goal: sanitiseGoal({ kind: 'give', target: 'Coinneach', item: 'venison' }),
    target: { x: 40, z: 30, within: 2, act: 'give' },
  });
  const e = walking.brief().errand;
  check('A BODY MID-WALK TO SOMEBODY IS TOLD WHAT IT IS DOING AND HOW FAR',
    !!e && /give/.test(e) && /Coinneach/.test(e) && /m still to walk/.test(e), String(e));
  check('  …in the SAME words the board and the report use',
    e.startsWith('give venison to Coinneach'), e);
  check('  …and it reaches the text a model reads',
    /part-way through something/.test(briefToText(walking.brief())),
    (briefToText(walking.brief()).match(/You are part-way through.*/) ?? ['NO LINE'])[0]);

  const arrived = body({
    goal: sanitiseGoal({ kind: 'give', target: 'Coinneach', item: 'venison' }),
    target: { x: 1, z: 0, within: 2, act: 'give' },
  });
  check('  …and a body ALREADY THERE is not told it has 0 m to walk',
    arrived.brief().errand === null, String(arrived.brief().errand));

  // The verbs that re-resolve to whatever is nearest lose nothing by being
  // re-decided, so saying "you are 40 m from a branch" every decision is noise.
  const foraging = body({
    goal: sanitiseGoal({ kind: 'gather', item: 'branch' }),
    target: { x: 40, z: 30, within: 2, act: 'interact' },
  });
  check('SENTINEL: an impersonal errand is NOT announced — only walks to a person outlast a cadence',
    foraging.brief().errand === null, String(foraging.brief().errand));

  const idle = body({ goal: { kind: 'wander' }, target: null });
  check('  …and a body with no target claims no errand',
    idle.brief().errand === null, String(idle.brief().errand));
}

// ── AND NONE OF IT IS A THUMB ON THE SCALE ──────────────────────────────────
//
// The line `personacheck` draws: MECHANICS ("this verb takes this, your pack
// holds that") go to every seat; STRATEGY ("you should trade with him") is the
// experiment and must never be handed out. Both lines here state a fact about
// the body's own pack or position and name a verb. Neither says when to want
// anything, and this asserts the words rather than trusting the intent.
{
  const b = body({ food: 20, carrying: { venison: 2 },
    goal: sanitiseGoal({ kind: 'give', target: 'Coinneach', item: 'venison' }),
    target: { x: 40, z: 0, within: 2 } });
  const text = briefToText(b.brief());
  const bossy = /you should|you must|it would be wise|better to|try to/i.test(text);
  check('NEITHER LINE TELLS A MIND WHAT TO WANT — mechanics, not strategy',
    !bossy, bossy ? 'FOUND ADVICE IN THE BRIEF' : 'no "should", "must" or "better to" anywhere in it');
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed\n`);
if (passed < results.length) {
  console.log('  FAILED:');
  for (const r of results.filter((x) => !x.pass)) console.log(`    - ${r.name}`);
  console.log('');
}
