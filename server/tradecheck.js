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
import { briefToText } from '../src/minds/perception.js';

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

  // ── A PRICE YOU DID NOT NAME MEANS COIN ──
  //
  // `offer` took three arguments where `approach` takes one, and any one of them
  // wrong made it a SILENT no-op — `resolveOffer` returned having done nothing.
  // Offered an easy verb and a hard verb that both move toward the goal, a model
  // takes the easy one, and one did: it worked out a barter in plain English,
  // wrote it in its reason, and then chose `approach`.
  {
    const { w, a, b } = world2();
    a.inventory.add('venison', 1);
    b.inventory.add('gold', 3);

    w.resolveOffer(a, 'Seonaid', 'venison', '');   // no price named
    const ev = w.events.find((e) => e.k === 'offer');
    check('AN OFFER WITH NO PRICE NAMED IS AN OFFER FOR GOLD',
      ev && ev.want === 'gold', JSON.stringify(ev ?? null));

    w.resolveAccept(b, 'Mairi');
    check('  …and it can be taken, like any other',
      has(b, 'venison') === 1 && has(a, 'gold') === 1,
      `Seonaid ${has(b, 'venison')} venison, Mairi ${has(a, 'gold')} gold`);
  }

  {
    // ...but an offer of NOTHING is still nothing. That half cannot be guessed.
    const { w, a } = world2();
    w.resolveOffer(a, 'Seonaid', '', 'gold');
    check('SENTINEL: an offer with no ITEM is still refused',
      !w.events.some((e) => e.k === 'offer'),
      'a price can be assumed; a thing to sell cannot');
  }

  // ── AND THAT THE OTHER MIND CAN SEE IT ────────────────────────────────────
  //
  // The measurement that caused this block: across three live hours and seven
  // models, `offer` was reached for 29 times, `give` 16, and `accept` ZERO.
  // Never once, by anybody. It read as a verb nobody wanted.
  //
  // It was a verb nobody could USE. An offer made TO a mind arrived only as a
  // line in its memory stream, weighted like any other event and decaying
  // against a half-life of about one decision, so by the time that mind next
  // chose, the deal had faded out of the six lines it gets shown. The world
  // knew a bargain was on the table and did not tell the one person who could
  // take it — the same shape as the 140 m blindness and the empty quiver.
  //
  // So this asserts the WHOLE path: offer -> snapshot -> brief -> prose.
  {
    const { w, a, b } = world2();
    a.inventory.add('venison_cooked', 4);
    b.inventory.add('wood', 30);
    w.resolveOffer(a, 'Seonaid', 'cooked venison', 'twelve branches');

    const snap = w.snapshot(b.id);
    check('A STANDING OFFER RIDES ON THE WIRE, beside health and hunger',
      !!snap?.me?.of && snap.me.of.n === 'Mairi' && snap.me.of.want === 'wood'
        && snap.me.of.asks === 12,
      snap?.me?.of ? JSON.stringify(snap.me.of) : 'nothing — accept can never be reached for');

    check('  …and only the person it was made TO can see it',
      !w.snapshot(a.id)?.me?.of,
      'the offerer sees no offer of their own');
  }

  {
    // And the prose, which is the only form a model ever actually reads. A
    // field on an object that never reaches the text is not a fix.
    const { w, a, b } = world2();
    a.inventory.add('venison_cooked', 4);
    b.inventory.add('wood', 30);
    w.resolveOffer(a, 'Seonaid', 'cooked venison', 'twelve branches');

    const brief = {
      offered: { from: 'Mairi', gives: 'cooked venison', asks: '12 branches', canPay: true, short: 0 },
      goal: 'walk the country', place: 'the glen', hour: '09:00',
    };
    const text = briefToText(brief);
    check('A MIND IS TOLD, IN WORDS, THAT A DEAL IS ON THE TABLE',
      /offering you/.test(text) && /12 branches/.test(text) && /accept/.test(text),
      text.split('\n').find((l) => /offering you/.test(l)) ?? 'the line never reaches the prose');

    const poor = briefToText({ ...brief, offered: { ...brief.offered, canPay: false, short: 7 } });
    check('  …and told what it is short, so it can go and fix it',
      /7 short/.test(poor) && !/accept/.test(poor),
      poor.split('\n').find((l) => /short/.test(l)) ?? 'no shortfall named');

    check('SENTINEL: a mind with no offer standing is told nothing at all',
      !/offering you/.test(briefToText({ ...brief, offered: null })),
      'silence costs nothing, which is almost always the case');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
