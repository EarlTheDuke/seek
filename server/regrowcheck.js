// ── regrowcheck.js ──────────────────────────────────────────────────────────
// Does the wood come back?
//
//   npm run regrowcheck
//
// THE RUN THAT CAUSED THIS FILE, 2026-08-12 with `SCARCE=on`. Eachann was
// refused **128 gathers across ~375 decisions** — a third of his run spent
// asking for wood that no longer existed anywhere he had been. `Pickups.taken`
// was a plain Set with a comment beside it reading "never come back", which was
// survivable in a generous valley and arithmetic in a lean one:
//
//     no wood -> no fire -> no arrows and no cooking -> no food -> dead
//
// TODO 4b calls scarcity "the dial that makes them social". Without regrowth it
// is a dial that makes them dead, and the death spiral stops being behaviour —
// which is the only thing this project is trying to measure — and becomes a
// property of the map.
//
// WHAT THIS GUARDS, in order of what would hurt most if it broke:
//
//   1. A branch taken is GONE, immediately. Regrowth must not mean "free wood".
//   2. It comes BACK, and not before its hour.
//   3. THE HOURS ARE MONOTONIC. `clock.hours` wraps at 24, and a regrow time of
//      `hours + 30` off a wrapping clock is a branch that returned yesterday.
//      `Harvest` carries a comment saying this project has been caught by that
//      clock three times. This is the fifth place that needs `world.totalHours`
//      and the assertion that pins it.
//   4. A caller that never says what time it is gets the OLD behaviour exactly,
//      so nothing regrows by accident in a world that never asked.

import { TakenDeadfall, Pickups } from '../src/world/pickups.js';
import { STRUCTURES, AGENTS, TIME } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n  Regrowcheck — does the wood come back?\n');

// ── 1. TAKEN IS TAKEN ───────────────────────────────────────────────────────
{
  const t = new TakenDeadfall();
  t.at(10).add('w1,1');
  check('A BRANCH JUST LIFTED IS GONE — regrowth is not free wood',
    t.has('w1,1'), 'taken at hour 10, still taken at hour 10');
  check('  …and a branch nobody touched was never taken',
    !t.has('w9,9'), 'untouched key reads as available');
}

// ── 2. AND IT COMES BACK, ON ITS HOUR ───────────────────────────────────────
{
  const t = new TakenDeadfall();
  t.at(10).add('w1,1');
  const R = STRUCTURES.regrowHours;
  t.at(10 + R - 0.01);
  check(`STILL GONE ONE MINUTE SHORT OF ${R} HOURS`, t.has('w1,1'),
    `hour ${(10 + R - 0.01).toFixed(2)} of ${10 + R}`);
  t.at(10 + R);
  check('  …and BACK on the hour it was promised', !t.has('w1,1'),
    `hour ${10 + R} — the branch is there again`);
  check('  …and it stays back, rather than flickering',
    !t.has('w1,1') && !t.has('w1,1'), 'twice asked, twice available');
}

// ── 3. THE CLOCK THAT HAS CAUGHT THIS PROJECT FOUR TIMES ────────────────────
//
// A wrapping clock is the whole bug. Taken at hour 23 with a 30-hour regrow, a
// monotonic clock says "back at 53" and a wrapping one says "back at 29" — a
// number the hour of day NEVER REACHES, so on the wrapping clock the branch is
// either gone forever or back within the hour depending on which side you test.
{
  const t = new TakenDeadfall();
  t.at(23).add('w2,2');                       // late in the day
  t.at(23 + STRUCTURES.regrowHours - 1);
  check('SENTINEL: taken near midnight, a branch does not return early',
    t.has('w2,2'), `taken at 23, still gone at ${23 + STRUCTURES.regrowHours - 1}`);
  // What a WRAPPING clock would have said at this moment: 5am, which is less
  // than the stored 53 — so it would read "back" long before it should.
  const wrapped = (23 + STRUCTURES.regrowHours - 1) % 24;
  check('  …and the wrapping hour it would have been given is the trap, plainly',
    wrapped < 23, `wrapping clock would say hour ${wrapped}, i.e. EARLIER than when it was taken`);
}

// ── 4. A WORLD THAT NEVER ASKS KEEPS THE OLD BEHAVIOUR ──────────────────────
{
  const t = new TakenDeadfall();
  t.add('w3,3');                              // no `at()` ever called
  check('A CALLER THAT NEVER SAYS THE TIME GETS THE OLD BEHAVIOUR — nothing regrows',
    t.has('w3,3'), 'taken with no clock, still taken');
  check('  …and a nonsense hour does not move the clock either',
    (t.at(undefined), t.at(NaN), t.has('w3,3')), 'undefined and NaN are ignored');
}

// ── 5. IT IS STILL SET-SHAPED, WHICH EVERY CALLER RELIES ON ─────────────────
//
// `nearestDeadfall(px, pz, radius, taken)` calls `taken?.has(key)`, and so do
// two loops inside `Pickups`. Changing the type under them silently would be
// the kind of break a build does not catch.
{
  const t = new TakenDeadfall();
  t.at(1).add('a').add('b');
  check('IT DUCK-TYPES AS A SET — has, add, delete, clear, size',
    t.has('a') && t.size === 2 && t.delete('a') && !t.has('a')
      && (t.clear(), t.size === 0),
    'has/add/delete/clear/size all behave');

  // A scene stub with both halves — `refreshLoot` adds as well as removes.
  const p = new Pickups({ add() {}, remove() {} }, {});
  check('  …and Pickups uses one rather than a bare Set',
    p.taken instanceof TakenDeadfall, p.taken.constructor.name);
  check('  …and its update accepts the hour without complaint',
    (p.update(0.016, { x: 0, y: 0, z: 0 }, 42), p.taken.hours === 42),
    `pickups clock reads ${p.taken.hours}`);
}

// ── 6. THE BODY'S MEMO MUST OUTLAST THE REGROWTH, NOT UNDERCUT IT ───────────
//
// An agent keeps its own "I already took that" note so it does not walk back to
// a branch it just lifted. It re-adds the key ON ARRIVAL, so a memo that
// forgets EARLIER than the wood returns produces a loop: walk, find nothing,
// re-add, forget, walk again.
{
  // DO THE CONVERSION. The first version of this assertion read
  // `forgetTakenSeconds >= 600` — which passed, while the value was 1800 and
  // the wood takes 1950 real seconds to return. A check that claims a
  // relationship without computing it is worse than no check: it is a green
  // light over the exact bug it names.
  const regrowRealSeconds = (STRUCTURES.regrowHours / 24) * TIME.dayMinutes * 60;
  check('THE BODY FORGETS LATER THAN THE WOOD RETURNS, never earlier',
    AGENTS.forgetTakenSeconds > regrowRealSeconds,
    `forgets after ${AGENTS.forgetTakenSeconds}s · wood returns after ${Math.round(regrowRealSeconds)}s ` +
    `(${STRUCTURES.regrowHours} game-hours at ${TIME.dayMinutes} real minutes a day)`);
  check('  …and it forgets at all, which it did not before',
    Number.isFinite(AGENTS.forgetTakenSeconds) && AGENTS.forgetTakenSeconds > 0,
    `${AGENTS.forgetTakenSeconds}s`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed\n`);
if (passed < results.length) {
  console.log('  FAILED:');
  for (const r of results.filter((x) => !x.pass)) console.log(`    - ${r.name}`);
  console.log('');
}
