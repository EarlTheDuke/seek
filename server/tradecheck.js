// ── tradecheck.js ───────────────────────────────────────────────────────────
// Can two people strike a bargain, and can one of them lie about it?
//
//   npm run tradecheck
//
// `give` made generosity legible. It cannot make a PRICE, and a hoarder written
// to "trade hard for something you want" needs one — which is also the only
// thing that can make gold worth anything, since gold's entire value is what
// somebody will hand over for it.
//
// TWO ASSERTIONS CARRY THIS FILE:
//
//   CONSERVATION. A swap is two removals and two additions and there is no
//   order of those four that is safe by accident. Crediting anybody before both
//   debits have succeeded is how a shared world gets a money printer, and there
//   is no recovering from one of those.
//
//   AND THAT A PROMISE IS ONLY WORDS. Nothing is reserved when an offer is
//   made, deliberately: a mind can offer what it does not have, and a hoarder
//   can promise the same venison to three people and deliver it once. Reserving
//   the goods would make every offer honest BY CONSTRUCTION, which is precisely
//   the thing this roster keeps a liar in it to test.

import { SimWorld } from '../src/sim/world.js';
import { GOAL_IDS, sanitiseGoal } from '../src/minds/goals.js';
import { SOCIAL } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

function world2() {
  const w = new SimWorld({ headless: true });
  const a = w.addPlayer(1, 'Mairi');    // the hoarder
  const b = w.addPlayer(2, 'Seonaid');  // the one with the coin
  b.ctrl.position.copy(a.ctrl.position);
  return { w, a, b };
}
const has = (p, id) => p.inventory.countOf(id);

function main() {
  console.log('\n  Can two people strike a bargain, and can one of them lie?\n');

  check('there are verbs for a price and for taking one',
    GOAL_IDS.includes('offer') && GOAL_IDS.includes('accept'),
    GOAL_IDS.join(' '));
  const g = sanitiseGoal({ kind: 'offer', target: 'Seonaid', item: 'venison', want: 'gold' });
  check('  …and an offer survives the door with all three parts',
    g?.target === 'Seonaid' && g.item === 'venison' && g.want === 'gold',
    JSON.stringify(g));

  // ── the honest trade ─────────────────────────────────────────────────────
  {
    const { w, a, b } = world2();
    a.inventory.add('venison', 2);
    b.inventory.add('gold', 4);
    const before = { meat: has(a, 'venison') + has(b, 'venison'), coin: has(a, 'gold') + has(b, 'gold') };

    w.resolveOffer(a, 'Seonaid', 'venison', 'gold');
    check('AN OFFER IS HEARD BY THE WHOLE TABLE, not whispered',
      w.events.some((e) => e.k === 'offer' && e.from === 'Mairi' && e.item === 'venison' && e.want === 'gold'),
      JSON.stringify(w.events.find((e) => e.k === 'offer') ?? null));

    w.resolveAccept(b, 'Mairi');
    check('AND ACCEPTING SWAPS BOTH WAYS',
      has(a, 'gold') === 1 && has(b, 'venison') === 1 && has(a, 'venison') === 1 && has(b, 'gold') === 3,
      `Mairi ${has(a, 'venison')} venison ${has(a, 'gold')} gold · Seonaid ${has(b, 'venison')} venison ${has(b, 'gold')} gold`);

    const after = { meat: has(a, 'venison') + has(b, 'venison'), coin: has(a, 'gold') + has(b, 'gold') };
    check('  …and NOTHING WAS MINTED on either side',
      after.meat === before.meat && after.coin === before.coin,
      `meat ${before.meat}->${after.meat}, coin ${before.coin}->${after.coin}`);

    check('  …and the trade is announced with both halves of the price',
      w.events.some((e) => e.k === 'trade' && e.gave === 'venison' && e.got === 'gold'),
      JSON.stringify(w.events.find((e) => e.k === 'trade') ?? null));

    // An offer is spent when it is taken. Otherwise one promise empties a pack.
    const coinBefore = has(b, 'gold');
    w.resolveAccept(b, 'Mairi');
    check('  …and one offer is one trade, not a standing order',
      has(b, 'gold') === coinBefore, `gold ${coinBefore} -> ${has(b, 'gold')}`);
  }

  // ── THE LIAR ─────────────────────────────────────────────────────────────
  {
    const { w, a, b } = world2();
    b.inventory.add('gold', 2);
    // Mairi has no venison at all and offers it anyway.
    w.resolveOffer(a, 'Seonaid', 'venison', 'gold');
    check('A MIND CAN OFFER WHAT IT DOES NOT HAVE',
      w.events.some((e) => e.k === 'offer'),
      'the promise is made, and heard, and is worth nothing');

    const coin = has(b, 'gold');
    w.resolveAccept(b, 'Mairi');
    check('  …and the bluff costs the taker NOTHING when it is called',
      has(b, 'gold') === coin && has(b, 'venison') === 0,
      `gold ${coin} -> ${has(b, 'gold')}, venison ${has(b, 'venison')}`);
    check('  …but the promise is on the record for anybody who was listening',
      w.events.filter((e) => e.k === 'offer').length === 1 &&
        !w.events.some((e) => e.k === 'trade'),
      'an offer event, no trade event — which is exactly how a liar is caught');
  }

  // ── the refusals, all quiet, all real ────────────────────────────────────
  {
    const { w, a, b } = world2();
    a.inventory.add('venison', 1);
    b.inventory.add('gold', 1);

    w.resolveOffer(a, 'Seonaid', 'venison', 'gold');
    b.ctrl.position.z += SOCIAL.giveRange * 3; // walk away before accepting
    w.resolveAccept(b, 'Mairi');
    check('you cannot take a bargain from across the glen',
      has(b, 'venison') === 0, `${has(b, 'venison')} venison changed hands at range`);

    // …and it still works once they are back together, so the line above is
    // testing the RANGE and not a trade that was broken all along.
    b.ctrl.position.copy(a.ctrl.position);
    w.resolveAccept(b, 'Mairi');
    check('  …and the SENTINEL: it works the moment they are together again',
      has(b, 'venison') === 1, `${has(b, 'venison')} venison`);
  }

  {
    const { w, a, b } = world2();
    b.inventory.add('gold', 1);
    // The bow is not tradeable, for the same reason it is not giftable: the
    // thing that makes you a hunter is not a commodity.
    w.resolveOffer(a, 'Seonaid', 'bow', 'gold');
    w.resolveAccept(b, 'Mairi');
    check('nobody can trade away the bow',
      has(b, 'bow') === 1 && has(a, 'bow') === 1,
      `Mairi ${has(a, 'bow')}, Seonaid ${has(b, 'bow')} — both keep their own`);

    // And accepting an offer that was never made must do nothing at all.
    const coin = has(b, 'gold');
    w.resolveAccept(b, 'Nobody At All');
    check('  …and accepting an offer nobody made costs nothing',
      has(b, 'gold') === coin, `gold ${coin} -> ${has(b, 'gold')}`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
