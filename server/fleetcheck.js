// ── fleetcheck.js ───────────────────────────────────────────────────────────
// Does the fleet's own stopwatch tell the truth?
//
//   npm run fleetcheck
//
// THE RUN THAT CAUSED THIS FILE. On 2026-08-11 an hour run was asked to stop
// after an hour. It ran 150 minutes, reported 110, and stopped when somebody
// noticed. Nothing was wrong with the fleet: `agents.js` counted its own ticks
// and called them seconds —
//
//     const STEP = 1 / 30;
//     setInterval(() => { …; elapsed += STEP; }, 1000 / 30);
//
// — and a `setInterval` under load fires later than its delay, every time. So
// the clock ran 26% slow, and three things read it: the console line, the
// report's `meta.seconds`, and `if (SECONDS && elapsed >= SECONDS) shutdown()`.
// The last one is why a run left alone keeps spending after the hour it was
// given, on a clock that is always slow and never fast.
//
// WHY THE CLOCK IS ITS OWN MODULE. It lived inside a `setInterval` inside a
// `main()` in a script nothing imports, which is to say it could not be tested
// at all — and a stopwatch that cannot be tested is how you lose forty minutes
// of budget without noticing. `FleetClock` takes its time source as an
// argument, so everything below runs instantly and deterministically instead of
// sleeping through real seconds and flaking on a busy machine.

import { FleetClock, DRIFT_WORTH_SAYING } from './fleetclock.js';
import { AGENTS } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n  Fleetcheck — does the run know how long it has been running?\n');

// A hand-cranked millisecond source. Nothing here waits for a real second.
function fakeNow() {
  let ms = 1_000_000;
  const fn = () => ms;
  fn.advance = (seconds) => { ms += seconds * 1000; };
  return fn;
}

// ── 1. A FLEET KEEPING UP ───────────────────────────────────────────────────
{
  const now = fakeNow();
  const clock = new FleetClock(now);
  // 30 ticks and exactly one real second passes: a machine keeping its promise.
  for (let i = 0; i < 30; i++) clock.tick(1 / 30);
  now.advance(1);
  check('a fleet that keeps up reports the same wall and nominal time',
    Math.abs(clock.wall - 1) < 1e-9 && Math.abs(clock.ticked - 1) < 1e-9,
    `wall ${clock.wall.toFixed(3)}s · ticked ${clock.ticked.toFixed(3)}s`);
  check('  …and does not cry drift at a fleet that is fine',
    clock.drift < 1e-9 && !clock.lagging && clock.driftLine() === null,
    `drift ${(clock.drift * 100).toFixed(1)}%`);
}

// ── 2. THE HOUR RUN, REPRODUCED ─────────────────────────────────────────────
//
// The exact shape of the bug: the loop manages 30 ticks in the time 40 should
// have taken. THE OLD CODE HAD NO WAY TO NOTICE — `elapsed` was the tick count,
// so it could not disagree with itself, and 110 minutes was simply "the time".
{
  const now = fakeNow();
  const clock = new FleetClock(now);
  const REAL = 150 * 60;
  const ticks = Math.round((110 * 60) * 30); // 110 minutes' worth of ticks…
  for (let i = 0; i < ticks; i++) clock.tick(1 / 30);
  now.advance(REAL);                          // …across 150 real minutes

  check('THE WALL IS THE WALL — 150 minutes of running reads as 150, not 110',
    Math.round(clock.wall / 60) === 150, `${Math.round(clock.wall / 60)} minutes`);
  check('  …and the fleet still knows how much THINKING it did',
    Math.round(clock.ticked / 60) === 110, `${Math.round(clock.ticked / 60)} minutes of ticks`);
  check('  …and the gap is reported as the 26% it was',
    Math.round(clock.drift * 100) === 27 || Math.round(clock.drift * 100) === 26,
    `${Math.round(clock.drift * 100)}% behind`);
  check('  …in words a human can act on, not as a statistic',
    /behind real time/.test(clock.driftLine() ?? '') && /cadence/.test(clock.driftLine() ?? ''),
    clock.driftLine());
}

// ── 3. THE ONE THAT COSTS MONEY ─────────────────────────────────────────────
//
// `for=3600` has to stop at 3600 REAL seconds. On the old clock it stopped at
// 3600 ticks, which on the hour run would have been about 82 real minutes — and
// every one of those extra minutes is paid calls against a roster nobody is
// watching. This is the assertion that guards the budget.
{
  const now = fakeNow();
  const clock = new FleetClock(now);
  const SECONDS = 3600;
  let stoppedAtWall = null;
  let stoppedAtTicks = null;
  // A loop running 25% slow, stepped a minute at a time.
  for (let minute = 0; minute < 200 && stoppedAtWall === null; minute++) {
    for (let i = 0; i < 30 * 45; i++) clock.tick(1 / 30);  // 45s of ticks…
    now.advance(60);                                        // …per real minute
    if (clock.wall >= SECONDS) { stoppedAtWall = clock.wall; stoppedAtTicks = clock.ticked; }
  }
  check('A RUN ASKED TO STOP AFTER AN HOUR STOPS AFTER A REAL HOUR',
    stoppedAtWall !== null && Math.abs(stoppedAtWall - SECONDS) <= 60,
    `stopped at ${Math.round(stoppedAtWall ?? -1)}s wall`);
  check('  …and would have overrun by 20 minutes on the tick clock',
    stoppedAtTicks !== null && stoppedAtTicks < SECONDS - 600,
    `the old clock would have read only ${Math.round(stoppedAtTicks ?? -1)}s at that moment — ` +
    `${Math.round((SECONDS - (stoppedAtTicks ?? 0)) / 60)} more minutes of paid calls`);
}

// ── 4. SENTINELS ────────────────────────────────────────────────────────────
{
  const now = fakeNow();
  const clock = new FleetClock(now);
  check('SENTINEL: a clock asked before any time has passed reports no drift, not a divide-by-zero',
    clock.drift === 0 && Number.isFinite(clock.drift), String(clock.drift));

  // A nominal clock AHEAD of the wall is impossible — an interval cannot fire
  // faster than its own delay. Reporting "-4% drift" would send somebody
  // hunting a bug that is not there, so it clamps.
  clock.tick(10);
  now.advance(5);
  check('  …and one somehow AHEAD of the wall reports 0, never a negative drift',
    clock.drift === 0, `${(clock.drift * 100).toFixed(1)}%`);
}

// ── 5. THE THRESHOLD IS A REAL SHARED CONSTANT ──────────────────────────────
{
  const now = fakeNow();
  const clock = new FleetClock(now);
  // MORE ticks means LESS drift. The first cut subtracted here and produced
  // 5.5% against a 5% threshold, then called it "just under" — an assertion
  // whose own detail line said the opposite of its name.
  clock.tick(100 * (1 - DRIFT_WORTH_SAYING) + 0.5); // just inside tolerance
  now.advance(100);
  check('a fleet drifting just under the threshold stays quiet',
    !clock.lagging, `${(clock.drift * 100).toFixed(1)}% vs ${DRIFT_WORTH_SAYING * 100}%`);

  const now2 = fakeNow();
  const loud = new FleetClock(now2);
  loud.tick(100 * (1 - DRIFT_WORTH_SAYING) - 2); // just past it
  now2.advance(100);
  check('  …and one just past it speaks up',
    loud.lagging, `${(loud.drift * 100).toFixed(1)}%`);

  check('the unwell/drift repeat interval is configured, not hard-coded in the loop',
    Number.isFinite(AGENTS.unwellRepeatSeconds) && AGENTS.unwellRepeatSeconds > 0,
    `AGENTS.unwellRepeatSeconds = ${AGENTS.unwellRepeatSeconds}`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed\n`);
if (passed < results.length) {
  console.log('  FAILED:');
  for (const r of results.filter((x) => !x.pass)) console.log(`    - ${r.name}`);
  console.log('');
}
