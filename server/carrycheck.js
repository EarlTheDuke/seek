// ── carrycheck.js ───────────────────────────────────────────────────────────
// What can a person actually carry?
//
//   npm run carrycheck
//
// THE MEASURED HOUR THAT CAUSED THIS FILE. There was no limit at all: `stack`
// bounded a SLOT and `add` opened new slots for ever, so a body could hold any
// number of anything. Morag finished run 4 carrying 205 BRANCHES — twenty
// fires' worth — having spent the hour picking up wood nobody needed.
//
// The number is not the problem. What it did to every decision in the game is:
//
//     pick up what is lying about    32% of ALL decisions
//     gather                         334 of 471 deeds
//
// The most-chosen action in this world was collecting things that had no use,
// because collecting was free and there was nowhere for it to stop.
//
// It is also why the economy read so strangely. What they traded FOR was
// arrows, venison and hides; what they paid WITH was wood. WOOD WAS THE
// CURRENCY PRECISELY BECAUSE IT WAS WORTHLESS — everybody had unlimited
// amounts of it. A cap is what gives a branch a price.
//
// Two halves, and the second is the one this project keeps having to learn:
//
//   THE CAP STOPS THE HOARDING.
//   SAYING SO STOPS THE REACHING. A mind not told a thing is full will go on
//   choosing to fill it, for ever, and look stupid doing it.

import { Inventory } from '../src/items/inventory.js';
import { ITEMS, getItem } from '../src/items/registry.js';
import { SURVIVAL } from '../src/config.js';
import { briefToText } from '../src/minds/perception.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

function main() {
  console.log('\n  What can a person actually carry?\n');

  // ── 1. THE HOARD IS IMPOSSIBLE ───────────────────────────────────────────
  {
    const inv = new Inventory();
    const took = inv.add('wood', 205);   // the exact number Morag finished on
    check('YOU CANNOT CARRY TWO HUNDRED BRANCHES',
      inv.countOf('wood') === ITEMS.wood.carry && took === ITEMS.wood.carry,
      `asked for 205, took ${took}, holding ${inv.countOf('wood')} — Morag's real hour`);

    check('  …and asking again gets you nothing, rather than silently more',
      inv.add('wood', 50) === 0 && inv.countOf('wood') === ITEMS.wood.carry,
      'the return value is what a caller needs to leave the rest in the world');
  }

  {
    // A cap that is not a multiple of the stack still holds. `stack` bounds a
    // slot and `carry` bounds the pack, and they are different questions.
    const inv = new Inventory();
    inv.add('wood', 1000);
    const slots = inv.slots.filter((s) => s.item === 'wood').length;
    check('  …and the slots add up to exactly the cap, not to a round number',
      inv.countOf('wood') === ITEMS.wood.carry,
      `${slots} slots of stack ${ITEMS.wood.stack} holding ${inv.countOf('wood')}`);
  }

  // ── 2. A FIRE IS NOW A REAL FRACTION OF WHAT YOU HOLD ────────────────────
  {
    const fires = ITEMS.wood.carry / SURVIVAL.woodToLight;
    check('A FULL LOAD OF WOOD IS A FEW FIRES, NOT A CAMP',
      fires >= 2 && fires <= 6,
      `${ITEMS.wood.carry} branches at ${SURVIVAL.woodToLight} a fire = ${fires} fires — `
      + 'it was twenty, which is why laying one cost nothing');
  }

  // ── 3. NOT EVERYTHING IS CAPPED, AND THAT IS DELIBERATE ──────────────────
  {
    const uncapped = Object.entries(ITEMS).filter(([, d]) => !d.carry).map(([id]) => id);
    check('the things you own ONE of need no cap',
      uncapped.every((id) => getItem(id).stack === 1 || id === 'quiver'),
      uncapped.join(', ') + ' — a bow, an axe, a cloak, a quiver');
  }

  // ── 4. AND THE MIND IS TOLD, WHICH IS THE HALF THAT MATTERS ──────────────
  //
  // The cap alone would produce a body that picks up nothing, for ever, with
  // no idea why — which looks exactly like a broken model.
  {
    const text = briefToText({
      place: 'the glen', hour: '09:00', goal: 'gather wood',
      full: ['branches'],
    });
    check('A MIND WITH FULL HANDS IS TOLD SO, IN WORDS',
      /cannot carry any more branches/.test(text),
      text.split('\n').find((l) => /cannot carry/.test(l)) ?? 'silence — it will reach for wood for ever');

    const many = briefToText({
      place: 'the glen', hour: '09:00', goal: 'gather wood',
      full: ['branches', 'stone', 'hides'],
    });
    check('  …and the list reads like a sentence, not like a dump',
      /branches, stone or hides/.test(many),
      many.split('\n').find((l) => /cannot carry/.test(l)));

    check('SENTINEL: a mind with room says nothing about it',
      !/cannot carry/.test(briefToText({ place: 'the glen', hour: '09:00', goal: 'gather wood' })),
      'a brief that lists what you are NOT short of is a brief nobody reads');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
