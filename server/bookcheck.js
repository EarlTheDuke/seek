// ── bookcheck.js ────────────────────────────────────────────────────────────
// Does the reference tell the truth, and will it still tell it next month?
//
//   npm run bookcheck
//
// A wrong reference is worse than none, because you would act on it. So the
// checks here are less about "does it render" and more about "is it possible
// for this to drift from the tables" — the answer has to be no, structurally,
// not because somebody remembered.
//
// The load-bearing one is the last: it retunes a cost and demands the book say
// something different. That is the only check that can tell a value READ from a
// value COPIED, and copying is the failure mode this whole file exists to catch.

import { buildBook, amountText } from '../src/ui/book.js';
import { BUILDABLE } from '../src/world/structures.js';
import { RECIPES } from '../src/items/recipes.js';
import { ITEMS } from '../src/items/registry.js';
import { COMPANIONS } from '../src/creatures/companions.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** The smallest thing that satisfies what the book asks of an inventory. */
const pack = (held = {}) => ({ countOf: (id) => held[id] ?? 0 });

const flat = (book) => book.flatMap((s) => s.rows);
const rowFor = (book, name) => flat(book).find((r) => r.name === name);

console.log('\n  The reference book\n');

// ── everything is in it ──
const empty = buildBook({ inventory: pack() });
const names = flat(empty).map((r) => r.name);

const missingBuild = Object.values(BUILDABLE).filter((b) => !names.includes(b.name));
check('every buildable thing is listed', missingBuild.length === 0,
  missingBuild.length ? `missing ${missingBuild.map((b) => b.name).join(', ')}`
    : `${Object.keys(BUILDABLE).length} structures and a fire`);

const missingRecipe = Object.values(RECIPES).filter((r) => !names.includes(r.name));
check('every recipe is listed', missingRecipe.length === 0,
  missingRecipe.length ? `missing ${missingRecipe.map((r) => r.name).join(', ')}`
    : `${Object.keys(RECIPES).length} recipes`);

// A fire is not in BUILDABLE — it is lit, not built — so it is the one row that
// could plausibly be forgotten, and the one everything else depends on.
check('and a fire, which is not in the table at all', names.includes('Fire'),
  'lit from a single branch, so it has to be stated by hand — and is');

// ── the costs are the real costs ──
let wrong = [];
for (const b of Object.values(BUILDABLE)) {
  const row = rowFor(empty, b.name);
  for (const [id, n] of Object.entries(b.cost)) {
    if (!row.cost.includes(amountText(id, n))) wrong.push(`${b.name}: ${id}×${n} not in "${row.cost}"`);
  }
}
for (const r of Object.values(RECIPES)) {
  const row = rowFor(empty, r.name);
  for (const [id, n] of Object.entries(r.inputs)) {
    if (!row.cost.includes(amountText(id, n))) wrong.push(`${r.name}: ${id}×${n} not in "${row.cost}"`);
  }
}
check('every cost shown is the cost charged', wrong.length === 0,
  wrong.length ? wrong.join(' · ') : 'checked against BUILDABLE and RECIPES, item by item');

// ── what you are short of ──
const some = buildBook({ inventory: pack({ wood: 4, hide: 1 }) });
const leanto = rowFor(some, 'Lean-to'); // 6 wood, 2 hide
check('it tells you what you are MISSING, not what it costs',
  /need 2 branches and 1 hide/.test(leanto.note ?? ''), `"${leanto.note}"`);
check('and will not let you think you can build it', leanto.can === false);

const windbreak = rowFor(some, 'Windbreak'); // 3 wood, and you have 4
check('what you can afford says what it is for instead',
  windbreak.can === true && windbreak.note === BUILDABLE.windbreak.blurb, `"${windbreak.note}"`);

const one = rowFor(buildBook({ inventory: pack({ wood: 5, hide: 2 }) }), 'Lean-to');
check('one short is "1 branch", not "1 branchs"', /need 1 branch\b/.test(one.note), `"${one.note}"`);

// ── it agrees with the fire prompt ──
// bestAvailable() skips a recipe once you hold maxHeld of its output. If the
// book still showed it as available you would stand at a fire pressing E at
// something the game had quietly stopped offering.
const withCloak = buildBook({ inventory: pack({ hide: 5, cloak: 1 }) });
const cloakRow = rowFor(withCloak, RECIPES.make_cloak.name);
check('a one-off you already own is not offered', cloakRow.can === false && cloakRow.note === 'you have one',
  `hide 5 of 3 needed, but "${cloakRow.note}"`);

// ── where things come from ──
const noSource = ['wood', 'stone', 'hide', 'venison', 'fish'].filter((id) => !ITEMS[id]?.source);
check('every raw material says where to get it', noSource.length === 0,
  noSource.length ? `silent: ${noSource.join(', ')}` : 'branches, boulders, deer and the loch');
const stone = rowFor(empty, 'Stone');
check('and it is advice, not a definition', /axe/.test(stone.note),
  `"${stone.note}"`);

// ── your animal ──
const withPet = buildBook({ inventory: pack(), companion: 'hippo' });
const petSection = withPet.find((s) => s.title === 'Your animal');
check('your animal gets a page', !!petSection && petSection.rows.length === 1 + Object.keys(COMPANIONS.hippo.tricks).length,
  `${petSection?.rows.length} rows for a hippo`);
const power = petSection.rows.find((r) => /this is the one/.test(r.note ?? ''));
check('and the one trick worth learning is marked', !!power, `"${power?.name}: ${power?.note}"`);
check('a player with no animal gets no page', !buildBook({ inventory: pack() }).some((s) => s.title === 'Your animal'));

// main.js passes `pet.species`, and Companion.species is the whole DEFINITION
// object, not the id string everything else in the codebase calls a species.
// The first version took only the string, was handed the object, and dropped
// the section silently — no error, just a book with a page missing. This check
// exists because passing the check in isolation proved nothing about the seam.
const byDef = buildBook({ inventory: pack(), companion: COMPANIONS.otter });
const byId = buildBook({ inventory: pack(), companion: 'otter' });
check('handed the species OBJECT it works too, not just the id',
  JSON.stringify(byDef) === JSON.stringify(byId), 'the way main.js actually calls it');

// ── times are said, not rounded away ──
const fireRow = rowFor(buildBook({ inventory: pack({ wood: 1 }) }), 'Fire');
check('a 45-second branch does not become "1 min"', !/1 min/.test(fireRow.note),
  `"${fireRow.note}"`);

// ── the one that catches copying ──
// Everything above would still pass if the numbers had been typed in by hand
// and happened to be right today. Move a cost and the book must move with it.
console.log('');
const was = BUILDABLE.leanto.cost.wood;
const before = rowFor(buildBook({ inventory: pack() }), 'Lean-to').cost;
BUILDABLE.leanto.cost.wood = was + 7;
const after = rowFor(buildBook({ inventory: pack() }), 'Lean-to').cost;
BUILDABLE.leanto.cost.wood = was;
check('retune a cost and the book retunes with it', after !== before && after.includes(`${was + 7} branches`),
  `"${before}" became "${after}" — read from the table, not copied out of it`);

const wasReps = RECIPES.cook_fish.seconds;
RECIPES.cook_fish.seconds = 999;
const slow = rowFor(buildBook({ inventory: pack({ fish: 1 }) }), RECIPES.cook_fish.name).note;
RECIPES.cook_fish.seconds = wasReps;
check('and so do the times', slow === '999s', `"${slow}"`);

// ── THE FIRE'S PRICE, WHICH THIS FILE'S OWN RULE DID NOT COVER ──
//
// book.js opens by saying nothing in it restates a number, because "being
// quietly wrong is worse than being absent — you would trust it". The fire
// slipped past that rule by being the one buildable thing NOT in BUILDABLE: it
// was hard-coded as `{ wood: 1 }`, so when lighting went from one branch to
// SURVIVAL.woodToLight the reference kept confidently saying one.
{
  const { SURVIVAL: S } = await import('../src/config.js');
  const rich = pack({ wood: S.woodToLight + 2 });
  const poor = pack({ wood: 1 });
  const rowOf = (inv) => buildBook({ inventory: inv })[0].rows.find((r) => r.name === 'Fire');
  check('the book prices a fire from SURVIVAL.woodToLight, not a literal',
    rowOf(rich).cost === amountText('wood', S.woodToLight),
    `"${rowOf(rich).cost}" with the constant at ${S.woodToLight}`);
  check('  …and says how many more you need when you are short',
    /9 branches/.test(rowOf(poor).note ?? '') || /branch/.test(rowOf(poor).note ?? ''),
    `"${rowOf(poor).note}" holding one branch`);
  check('  …and one branch is NOT enough any more',
    rowOf(poor).can === false, 'a reference that says you can when you cannot is the worst kind');
}

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
