// ── goldcheck.js ────────────────────────────────────────────────────────────
// Is there money in this world, does it come off the things that carry it, and
// can it change hands?
//
//   npm run goldcheck
//
// GOLD IS THE ONE ITEM IN THE GAME THAT DOES NOTHING. It cannot be eaten,
// burned or shot, and that is not an oversight — it is what makes it a currency
// and what makes it worthless on the day it ships. A coin is worth something
// because somebody will take it, and the only somebodies here are five other
// minds.
//
// So this check deliberately does NOT assert that gold is valuable. It cannot:
// value is a fact about what six models from three vendors decide to do, and
// that is an experiment to run, not an invariant to pin. What it asserts is
// that the plumbing is all there — the item exists, it drops off the two things
// that carry it, and `give` moves it — so that when the experiment runs, a null
// result means "they did not want it" rather than "it was never reachable".
//
// That distinction is the whole reason this file exists. Two playtests were
// already spent on models that looked incurious and were actually being handed
// a broken verb.

import { ITEMS, getItem } from '../src/items/registry.js';
import { getSpecies } from '../src/creatures/registry.js';
import { SimWorld } from '../src/sim/world.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

function main() {
  console.log('\n  Is there money, does it drop, and can it change hands?\n');

  // ── 1. it exists and is shaped like everything else ──────────────────────
  const gold = getItem('gold');
  check('there is a coin', !!gold, gold ? `${gold.name}, stacks to ${gold.stack}` : 'no such item');
  check('  …and it stacks like a purse, not like a bow',
    (gold?.stack ?? 0) >= 50, `stack ${gold?.stack}`);

  // The point of gold is that it does nothing. If it ever gains a `fuel` or a
  // food value it has stopped being money and become a commodity, and the
  // experiment it exists for is void.
  check('IT DOES NOTHING — no fuel, no food, no ammo',
    !gold?.fuel && !gold?.food && gold?.kind !== 'food' && !gold?.ammo,
    `kind ${gold?.kind}, fuel ${gold?.fuel ?? 'none'}`);

  // ── 2. it comes off the things that would carry it ───────────────────────
  const dropsOf = (id) => (getSpecies(id)?.drops ?? []).find((d) => d.item === 'gold');
  const gob = dropsOf('goblin');
  const troll = dropsOf('troll');
  check('goblins carry a little', !!gob, gob ? `${gob.min}-${gob.max}` : 'none');
  check('trolls carry a hoard', !!troll, troll ? `${troll.min}-${troll.max}` : 'none');
  check('  …and the troll is worth more than the goblin, which is why you fight one',
    (troll?.min ?? 0) > (gob?.max ?? 99),
    `goblin up to ${gob?.max}, troll from ${troll?.min}`);

  // A deer must NOT drop gold. Money that falls out of the food supply is not
  // money, it is a second kind of meat.
  check('  …and a deer carries none — money comes off what fights back',
    !dropsOf('deer'), dropsOf('deer') ? 'a deer dropped gold' : 'none, correctly');

  // ── 3. IT CHANGES HANDS, which is the only thing that can make it worth
  // anything. Driven through the real world object rather than asserted about
  // the table: `give` has to accept an item it has never seen before, and
  // `giftFrom` has to hand over the NAMED coin rather than the food it prefers.
  const w = new SimWorld({ headless: true });
  const a = w.addPlayer(1, 'Eachann');
  const b = w.addPlayer(2, 'Morag');
  b.ctrl.position.copy(a.ctrl.position);
  a.inventory.add('gold', 5);
  a.inventory.add('venison', 2);

  const before = { a: a.inventory.countOf('gold'), b: b.inventory.countOf('gold') };
  w.resolveGive(a, 'Morag', 'gold');
  const after = { a: a.inventory.countOf('gold'), b: b.inventory.countOf('gold') };

  check('A COIN CAN BE HANDED TO SOMEBODY',
    after.b === before.b + 1 && after.a === before.a - 1,
    `${before.a} -> ${after.a} and ${before.b} -> ${after.b}`);
  check('  …and nothing was minted doing it',
    after.a + after.b === before.a + before.b,
    `${before.a + before.b} before, ${after.a + after.b} after`);

  // The sentinel that matters for a currency: asking for gold must GIVE gold,
  // not the venison `giftFrom` would otherwise prefer. A "generous" default
  // that quietly overrides what was asked for would make every priced trade a
  // lie.
  check('  …and asking for the coin gives the COIN, not the food it prefers',
    w.giftFrom(a, 'gold') === 'gold',
    `asked for gold, would hand over ${w.giftFrom(a, 'gold')}`);

  // …while an UNNAMED gift still prefers food, because that is what a hungry
  // person needs and what generosity means here.
  check('  …and an unnamed gift still reaches for the food',
    w.giftFrom(a, '') !== 'gold',
    `unnamed gift hands over ${w.giftFrom(a, '')}`);

  console.log('\n  NOT ASSERTED, ON PURPOSE: that gold is worth anything. It is worth what');
  console.log('  five other minds will take for it, and that is the experiment.\n');

  const failed = results.filter((r) => !r.pass);
  console.log(`  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
