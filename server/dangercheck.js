// ── dangercheck.js ──────────────────────────────────────────────────────────
// Does turning the dangerous things off actually turn them off?
//
//   npm run dangercheck
//
// The load-bearing check is the derived one. "Nothing hostile" is computed from
// the creature registry rather than listed here, so adding a wolf to
// creatures/registry.js makes it peaceful-aware for free — and this proves it
// by inventing a species and demanding the ban notice. A hand-written list
// would silently let every future predator through, and the player who turned
// predators off is exactly the player who cannot survive finding out.

import { DANGER_LEVELS, bannedSpecies, readDanger, getDangerLevel, DEFAULT_DANGER } from '../src/modes/danger.js';
import { SPECIES } from '../src/creatures/registry.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n  How dangerous\n');

const full = bannedSpecies('full');
const noBears = bannedSpecies('no-bears');
const none = bannedSpecies('none');

check('everything means everything', full.size === 0, 'nothing banned');
check('no bears means exactly the bear',
  noBears.size === 1 && noBears.has('bear'), [...noBears].join(', '));
check('nothing hostile bans every predator in the game',
  none.has('bear') && none.has('goblin') && none.has('troll'), [...none].sort().join(', '));

// The one that matters: prey stays, whatever the level.
const prey = Object.values(SPECIES).filter((s) => s.faction === 'prey').map((s) => s.id);
check('and never touches the animals you eat',
  prey.every((id) => !none.has(id)), `${prey.join(', ')} survive all three levels`);

// ── derived, not listed ──
// Add a predator to the registry and it must be caught with no edit here.
SPECIES.__testwolf = { id: '__testwolf', faction: 'predator' };
const afterWolf = bannedSpecies('none');
delete SPECIES.__testwolf;
check('a predator added to the registry is banned without editing anything',
  afterWolf.has('__testwolf'),
  'invented a wolf, and "nothing hostile" noticed on its own');

SPECIES.__testrabbit = { id: '__testrabbit', faction: 'prey' };
const afterRabbit = bannedSpecies('none');
delete SPECIES.__testrabbit;
check('and a harmless one added the same way is not',
  !afterRabbit.has('__testrabbit'), 'faction is what decides it, not a list');

// ── it fails safe ──
check('an unknown level falls back rather than throwing',
  getDangerLevel('nonsense').id === DEFAULT_DANGER, `"nonsense" -> ${DEFAULT_DANGER}`);
check('and the default is the full world', DEFAULT_DANGER === 'full',
  'turning danger OFF is the opt-in, which is the right way round');

// ── what the player asked for ──
// No localStorage in Node, so this exercises the URL path — which is the one
// an automated player actually uses, and the one that has to win.
check('the URL sets it', readDanger('?danger=none') === 'none');
check('and a nonsense URL does not', readDanger('?danger=banana') === DEFAULT_DANGER);
check('no URL, no preference, full world', readDanger('') === DEFAULT_DANGER);
check('every level is reachable by name',
  Object.keys(DANGER_LEVELS).every((id) => readDanger(`?danger=${id}`) === id),
  Object.keys(DANGER_LEVELS).join(', '));

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
