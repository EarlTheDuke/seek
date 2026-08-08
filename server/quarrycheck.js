// ── quarrycheck.js ──────────────────────────────────────────────────────────
// When a mind says "hunt deer", does the body go and hunt a deer?
//
//   npm run quarrycheck
//
// For two live runs the answer was NO, and nothing anywhere said so.
//
// Every contact is labelled with its article — `a deer`, `a goblin` — and the
// goal came back from the model as whatever the model felt like writing. The
// two were compared with `label === g.quarry`. Anything that did not match to
// the character fell through to `roam()`: the mind had decided to hunt, and the
// body wandered off. No refusal, no log line, no counter. Invisible.
//
// Measured across six models and roughly 400 decisions:
//
//     "a deer"                   matched   -> 37 arrows  (kimi, the only one)
//     "deer"                     no match  -> wandered
//     "deer south-west"          no match  -> wandered
//     "deer close to the north"  no match  -> wandered
//
// Five models, zero arrows, one missing indefinite article. It broke `avoid`
// the same way, so "keep away from goblin" was a body strolling about near a
// goblin — and it is why the SCRIPTED control out-hunted every model twice
// over: `setOrder` builds its quarry as `a ${species}` and matched by
// construction.
//
// No port, no server, no wall clock: this is a string question and a resolve
// question, and both can be asked directly.

import { Agent, namesTheSame } from '../src/net/agent.js';
import { makeRandom } from '../src/world/noise.js';
import { ScriptedProvider } from '../src/minds/providers.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── the exact strings six models produced in the field ──────────────────────
//
// Copied out of the live board, not invented. A fixture written from the same
// guess as the code does not test it, it ratifies it.
const SAID_IN_THE_FIELD = [
  ['a deer', 'a deer', true, 'kimi — the only one that matched before'],
  ['a deer', 'deer', true, 'grok-fast, haiku'],
  ['a deer', 'deer south-west', true, 'sonnet'],
  ['a deer', 'deer close to the north', true, 'sonnet'],
  ['a deer', 'deer 180 m north', true, 'kimi, qualified'],
  ['a deer', 'deer to the north', true, 'sonnet'],
  ['a goblin', 'goblin', true, 'avoid was broken the same way'],
  ['a goblin', 'keep away from goblin', true, 'a whole phrase'],
  ['a hunter', 'hunter named Mairi', true, 'people, too'],
];

// …and the ones that must still NOT match, or the fix is worse than the bug.
const MUST_NOT_MATCH = [
  ['a deer', 'a goblin', 'a different animal'],
  ['a goblin', 'a deer', 'and the other way round'],
  ['a deer', 'deerhound', 'a word that merely contains it'],
  ['a troll', 'trolley', 'same'],
  ['a deer', '', 'nothing said'],
  ['a deer', null, 'nothing at all'],
];

function main() {
  console.log('\n  When a mind says "hunt deer", does the body hunt a deer?\n');

  let matched = 0;
  for (const [label, said, want, note] of SAID_IN_THE_FIELD) {
    if (namesTheSame(label, said) === want) matched++;
  }
  check('every phrasing six models actually used now finds its animal',
    matched === SAID_IN_THE_FIELD.length,
    `${matched}/${SAID_IN_THE_FIELD.length}`);

  // The counterfactual, stated rather than implied: the OLD rule was `===`, so
  // it matched exactly one of the nine. If a future change makes everything
  // match, this number says so.
  const wouldHaveMatched = SAID_IN_THE_FIELD.filter(([l, s]) => l === s).length;
  check('  …and the old `===` rule matched only one of them',
    wouldHaveMatched === 1,
    `${wouldHaveMatched}/${SAID_IN_THE_FIELD.length} under the old rule — that gap is the bug`);

  let rejected = 0;
  const wrong = [];
  for (const [label, said, note] of MUST_NOT_MATCH) {
    if (!namesTheSame(label, said)) rejected++;
    else wrong.push(`${label} ~ ${said} (${note})`);
  }
  check('and it still refuses the things it should',
    rejected === MUST_NOT_MATCH.length,
    rejected === MUST_NOT_MATCH.length
      ? `${rejected}/${MUST_NOT_MATCH.length} — a word boundary, not a substring`
      : wrong.join('; '));

  // ── and now the thing that actually matters: does RESOLVE find the animal ──
  //
  // The string test above could pass while the goal path still roamed, which is
  // exactly the shape of failure this whole check exists for. So drive the real
  // `Agent.prototype.resolve` over an invented snapshot and look at where it
  // decides to walk.
  const born = (name) => Object.assign(Object.create(Agent.prototype), {
    name,
    rand: makeRandom(name),
    provider: new ScriptedProvider(makeRandom(`p:${name}`)),
    _x: 0, _z: 0, wanderAngle: 0,
    others: new Map(),
    taken: new Set(),
    snapshot: null,
  });

  // One deer, due north, 40 m away. `cr` is the snapshot's creature list:
  // k = species key, i = id, p = [x, y, z], h = health, s = state.
  const snap = { cr: [{ k: 'deer', i: 7, p: [0, 12, -40], h: 100, s: 'graze' }], pl: [] };

  const tryQuarry = (said) => {
    const a = born('Probe');
    a.snapshot = snap;
    const spot = a.resolve({ kind: 'hunt', quarry: said });
    return spot;
  };

  const phrasings = ['a deer', 'deer', 'deer south-west', 'deer 180 m north'];
  let found = 0;
  const missed = [];
  for (const said of phrasings) {
    const spot = tryQuarry(said);
    // The tell is `quarry: true` and the deer's own id — `roam()` returns
    // neither, and a roam spot is a plausible-looking place to walk to, which
    // is exactly why this went unnoticed for two runs.
    if (spot?.quarry === true && spot.id === 7) found++;
    else missed.push(said);
  }
  check('THE BODY ACTUALLY WALKS AT THE DEER, whichever way the mind said it',
    found === phrasings.length,
    found === phrasings.length ? `${found}/${phrasings.length} resolved to the animal`
      : `wandered instead on: ${missed.join(', ')}`);

  // …and the sentinel: something genuinely unmatchable must STILL roam, or the
  // matcher has stopped discriminating and every goal resolves to whatever is
  // nearest.
  const nonsense = tryQuarry('the aurora borealis');
  check('  …and a quarry that is not out there still falls through to roaming',
    !(nonsense?.quarry === true),
    nonsense?.quarry === true ? 'it matched something it should not have' : 'roamed, correctly');

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
