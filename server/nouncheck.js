// ── nouncheck.js ────────────────────────────────────────────────────────────
// The verbs are a closed list. Are the nouns?
//
//   npm run nouncheck
//
// THE RUN THAT CAUSED THIS FILE. `GOAL_IDS` means a model cannot invent an
// action — that has been true and checked since the day models were added. But
// `offerItem`, `offerWant` and `giveItem` are free strings, and over a live
// 15-hour run two minds spent most of an hour bargaining over goods that do not
// exist:
//
//     Coinneach  "got feathers or flint?"
//     Eachann    "anyone got flint or feathers?"
//     Coinneach  "arrow for flint"
//     Eachann    "fine, arrow for flint"      <- a deal that can never settle
//     Coinneach  "No flint."
//
// And two other agents told a playtester "meet me at the Black Moss", which the
// game had to answer was nowhere within 8.7 km.
//
// THE QUIETER HALF, which is worse because it looks like the same bug and is
// not: a REAL item named the way a person says it failed just as hard. The id
// is `wood`; the game calls it a Branch on the hotbar, "8 branches" in the
// pickup line and "3 branches" in a build cost. Every mind in this world says
// branch. `countOf('branch')` is 0.
//
// Three fixes, one check: say what exists, accept what people actually call it,
// and refuse the rest OUT LOUD so a mind can stop asking.

import { resolveItemId, itemVocabulary, ITEMS } from '../src/items/registry.js';
import { SimWorld } from '../src/sim/world.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

function two() {
  const w = new SimWorld({ headless: true });
  const a = w.addPlayer(1, 'Mairi');
  const b = w.addPlayer(2, 'Seonaid');
  b.ctrl.position.copy(a.ctrl.position);
  return { w, a, b };
}

function main() {
  console.log('\n  The verbs are a closed list. Are the nouns?\n');

  // ── what a person actually says ──────────────────────────────────────────
  {
    const said = {
      branch: 'wood', branches: 'wood', 'a branch': 'wood', Branch: 'wood',
      arrows: 'arrow', 'the gold': 'gold', hides: 'hide',
      'cooked venison': 'venison_cooked', venison: 'venison',
    };
    const wrong = Object.entries(said).filter(([w, id]) => resolveItemId(w) !== id);
    check('THE WORD A PERSON USES FINDS THE ITEM — "branch" is `wood`',
      wrong.length === 0,
      wrong.length ? wrong.map(([w, id]) => `${w} -> ${resolveItemId(w)}, wanted ${id}`).join(' · ')
                   : `${Object.keys(said).length} spellings, all found`);
  }

  {
    const made = ['flint', 'feathers', 'rope', 'coin', 'a sword', ''];
    const found = made.filter((w) => resolveItemId(w) !== null);
    check('  …and a thing that does not exist finds NOTHING',
      found.length === 0,
      found.length ? `resolved: ${found.join(', ')}` : 'flint, feathers, rope, coin — all null');
  }

  // ── the vocabulary a mind is handed ──────────────────────────────────────
  {
    const vocab = itemVocabulary();
    check('the prompt can name every good in the world',
      vocab.length >= 10 && vocab.includes('branch') && vocab.includes('gold'),
      vocab.join(', '));
    check('  …and it is the words a person uses, not the ids',
      !vocab.some((v) => v.includes('_')),
      'no `venison_cooked` in front of a model');
  }

  // ── AN OFFER FOR SOMETHING THAT DOES NOT EXIST ───────────────────────────
  {
    const { w, a, b } = two();
    a.inventory.add('venison', 2);
    b.inventory.add('gold', 4);

    w.resolveOffer(a, 'Seonaid', 'venison', 'flint');
    check('AN OFFER PRICED IN FLINT IS REFUSED, not left standing for an hour',
      !w.events.some((e) => e.k === 'offer'),
      'the deal that could never settle');
    check('  …and the world SAYS SO, so a mind can stop asking',
      w.events.some((e) => e.k === 'nosuch' && e.word === 'flint'),
      JSON.stringify(w.events.find((e) => e.k === 'nosuch') ?? null));
  }

  {
    // ...and the sentinel: a real price still goes through.
    const { w, a, b } = two();
    a.inventory.add('venison', 2);
    b.inventory.add('gold', 4);
    w.resolveOffer(a, 'Seonaid', 'venison', 'gold');
    check('SENTINEL: a real price is still an offer',
      w.events.some((e) => e.k === 'offer' && e.want === 'gold'),
      'so the refusal above is about flint and not about offers');
  }

  // ── "branches", which is a REAL thing spelled the way people say it ──────
  {
    const { w, a, b } = two();
    a.inventory.add('wood', 9);
    b.inventory.add('gold', 2);
    w.resolveOffer(a, 'Seonaid', 'branches', 'gold');
    const ev = w.events.find((e) => e.k === 'offer');
    check('AN OFFER OF "branches" IS AN OFFER OF WOOD',
      ev && ev.item === 'wood',
      ev ? `item came through as \`${ev.item}\`` : 'no offer at all — the bargain nobody could settle');

    w.resolveAccept(b, 'Mairi');
    check('  …and it can actually be taken',
      b.inventory.countOf('wood') > 0,
      `${b.inventory.countOf('wood')} branches changed hands`);
  }

  // ── giving, by the same rule ─────────────────────────────────────────────
  {
    const { w, a, b } = two();
    a.inventory.add('wood', 5);
    w.resolveGive(a, 'Seonaid', 'branch', 3);
    check('GIVING "a branch" hands over wood',
      b.inventory.countOf('wood') === 3,
      `${b.inventory.countOf('wood')} of 3`);
  }

  // ── places that exist ────────────────────────────────────────────────────
  {
    const ids = Object.keys(ITEMS);
    check('every item resolves to itself, so nothing is unreachable by its own id',
      ids.every((id) => resolveItemId(id) === id),
      `${ids.length} ids`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
