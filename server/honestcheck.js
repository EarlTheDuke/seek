// ── honestcheck.js ──────────────────────────────────────────────────────────
// Does the game only say what actually happened?
//
//   npm run honestcheck
//
// THE REPORT THAT CAUSED THIS FILE, and it is the most expensive bug this
// project has had, because it is the one that hides all the others:
//
//   > The worst one is that the client announces success for things the server
//   > refused. I got "hit — head" on a goblin at 8 m with a verified clear arc
//   > and the goblin took zero damage. I got "36 arrows to Coinneach" five
//   > times in a row with no transfer. A playtester cannot learn anything in a
//   > world that lies to them about whether their actions landed; every other
//   > bug below took me ten times longer to find because of this one.
//
// The rule: THE CLIENT MAY SAY WHAT IT ATTEMPTED. ONLY THE SERVER MAY SAY WHAT
// HAPPENED. Offline the client IS the server and every word of it is true, so
// none of this applies and nothing changes.
//
// Silencing the client's claims is only half of it, and the easy half. The
// other half is that there has to be something TRUE to say instead — and
// `gift`, `trade`, `offer` and `nosuch` had been leaving the server since the
// verbs were written with only the agents ever reading them. So this file is
// mostly about the CONTRACT: does each event carry what a confirmation needs?
//
// It is written because I got that contract wrong myself an hour ago. On a
// gift, `n` is the RECIPIENT'S NAME and the count is `n2`; I read `n` as the
// count and produced "you handed Coinneach branches", which is wrong and still
// reads like a sentence, which is exactly how it would have shipped.

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

/** Everything a confirmation line needs, and what it is called on the wire. */
const NEEDS = {
  gift: ['by', 'to', 'n', 'n2', 'id', 'from'],
  trade: ['by', 'to', 'n', 'from', 'gave', 'got', 'gaveN', 'gotN'],
  offer: ['by', 'to', 'n', 'from', 'item', 'want', 'gives', 'asks'],
  nosuch: ['by', 'n', 'word'],
};

function main() {
  console.log('\n  Does the game only say what actually happened?\n');

  // ── 1. A GIFT SAYS WHO, WHAT AND HOW MANY ────────────────────────────────
  {
    const { w, a } = two();
    a.inventory.add('wood', 20);
    w.resolveGive(a, 'Seonaid', 'branches', 6);
    const e = w.events.find((x) => x.k === 'gift');

    check('A GIFT REACHES THE WIRE AT ALL',
      !!e, e ? JSON.stringify(e) : 'nothing — "20 branches to Coinneach", five times, with no transfer');

    check('  …carrying everything a confirmation needs',
      !!e && NEEDS.gift.every((k) => e[k] !== undefined),
      e ? NEEDS.gift.filter((k) => e[k] === undefined).join(', ') || 'all present' : '-');

    // The one I got wrong. `n` is a NAME; the count is `n2`.
    check('  …and the COUNT is `n2`, while `n` is the other person',
      !!e && typeof e.n === 'string' && e.n === 'Seonaid' && e.n2 === 6,
      e ? `n=${JSON.stringify(e.n)} n2=${JSON.stringify(e.n2)} — reading n as the count says "you handed Seonaid branches"` : '-');
  }

  // ── 2. A TRADE SAYS BOTH HALVES, WITH BOTH AMOUNTS ───────────────────────
  {
    const { w, a, b } = two();
    a.inventory.add('venison_cooked', 3);
    b.inventory.add('wood', 40);
    w.resolveOffer(a, 'Seonaid', 'cooked venison', 'twelve branches');

    const off = w.events.find((x) => x.k === 'offer');
    check('AN OFFER REACHES THE WIRE WITH ITS PRICE ON IT',
      !!off && NEEDS.offer.every((k) => off[k] !== undefined) && off.asks === 12,
      off ? `${off.gives} ${off.item} for ${off.asks} ${off.want}` : 'nothing');

    w.resolveAccept(b, 'Mairi');
    const tr = w.events.find((x) => x.k === 'trade');
    check('A SETTLED TRADE SAYS WHAT EACH SIDE ACTUALLY GAVE',
      !!tr && NEEDS.trade.every((k) => tr[k] !== undefined) && tr.gaveN === 1 && tr.gotN === 12,
      tr ? `${tr.gaveN} ${tr.gave} for ${tr.gotN} ${tr.got}` : 'nothing');

    check('  …and the amounts are the amounts, not a hard-coded 1',
      !!tr && tr.gotN === 12,
      tr ? `gotN=${tr.gotN}` : '-');
  }

  // ── 3. A REFUSAL IS ALSO AN OUTCOME, AND IS ALSO SAID ────────────────────
  //
  // The silent no-op is what made all of this expensive. A bargain priced in
  // something that does not exist used to leave NOTHING on the wire, so two
  // minds held out for flint for the best part of an hour.
  {
    const { w, a, b } = two();
    a.inventory.add('venison', 2);
    b.inventory.add('gold', 4);
    w.resolveOffer(a, 'Seonaid', 'venison', 'flint');
    const no = w.events.find((x) => x.k === 'nosuch');
    check('A REFUSAL IS SAID OUT LOUD, and names what it did not understand',
      !!no && NEEDS.nosuch.every((k) => no[k] !== undefined) && no.word === 'flint',
      no ? JSON.stringify(no) : 'silence — the bargain nobody could settle');
    check('  …and no offer was left standing to be accepted later',
      !w.events.some((x) => x.k === 'offer'));
  }

  // ── 4. NOTHING IS ANNOUNCED THAT DID NOT HAPPEN ──────────────────────────
  {
    // The give that cannot land: too far away. There must be no `gift` event,
    // because a `gift` event is now the thing the client prints "— done" for.
    const { w, a, b } = two();
    a.inventory.add('wood', 9);
    b.ctrl.position.z += 400;
    w.resolveGive(a, 'Seonaid', 'branches', 4);
    check('A HANDOVER THAT COULD NOT LAND ANNOUNCES NOTHING',
      !w.events.some((e) => e.k === 'gift') && b.inventory.countOf('wood') === 0,
      'no event, no transfer — and so no "— done" on anybody\'s screen');
  }

  {
    // The trade that cannot settle: the taker cannot cover the price.
    const { w, a, b } = two();
    a.inventory.add('venison_cooked', 2);
    b.inventory.add('wood', 5);
    w.resolveOffer(a, 'Seonaid', 'cooked venison', 'twelve branches');
    w.resolveAccept(b, 'Mairi');
    check('A BARGAIN THAT COULD NOT SETTLE ANNOUNCES NOTHING',
      !w.events.some((e) => e.k === 'trade'),
      'five branches cannot buy a twelve-branch deal, and nobody is told it did');
  }

  {
    // ...and the sentinel that keeps all of the above from being vacuous.
    const { w, a } = two();
    a.inventory.add('wood', 9);
    w.resolveGive(a, 'Seonaid', 'branches', 4);
    check('SENTINEL: a handover that DID land announces exactly once',
      w.events.filter((e) => e.k === 'gift').length === 1,
      'so the four silences above are about failure, not about a broken event');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
