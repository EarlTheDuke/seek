// ── fleetclock.js ───────────────────────────────────────────────────────────
// How long has this run actually been going?
//
// A stopwatch, extracted from `agents.js` so it can be tested without standing
// up a fleet — and because the bug it fixes was invisible precisely because it
// lived inside a `setInterval` nobody could reach.
//
// ── THE BUG ─────────────────────────────────────────────────────────────────
//
// `agents.js` counted time like this:
//
//     const STEP = 1 / 30;
//     setInterval(() => { …; elapsed += STEP; }, 1000 / 30);
//
// which counts TICKS and calls them seconds. A `setInterval` is a floor, not a
// promise: it fires no sooner than its delay and, under load, considerably
// later. Thirty agents driving sockets, JSON and a board server do not get 30
// ticks into every second, so `elapsed` drifts behind the wall — measured at
// **110 minutes reported against 150 minutes actual, 26% slow**, on the
// 2026-08-11 hour run.
//
// Three things read that number and all three were wrong:
//
//   1. the console line a watcher reads, which said 110 when it was 150;
//   2. `if (SECONDS && elapsed >= SECONDS) shutdown()` — which is why an hour
//      run **did not stop at the hour**, and a run left alone spends past its
//      budget on a clock that is always slow;
//   3. `meta.seconds` in the report, which `playreport` uses as the floor for
//      whether a run was long enough to conclude anything from.
//
// ── AND THE FIX THAT WOULD BREAK EVERYTHING ─────────────────────────────────
//
// **DO NOT "fix" this by feeding real elapsed time into `agent.update(dt)`.**
// The fixed `STEP` is deliberate and is load-bearing: a seeded run must
// reproduce, and a variable dt makes every body's path depend on how busy the
// machine was. Determinism forbids a wall clock inside the SIMULATION. It does
// not forbid one in the stopwatch measuring how long the session took, which is
// not simulation and never was.
//
// So both numbers are kept, and the gap between them is itself a finding: a
// fleet whose nominal time lags the wall is a fleet whose minds are being asked
// to think LESS OFTEN than their cadence promises, which quietly changes the
// experiment. Better said out loud than discovered again in six weeks.

/** How far behind nominal may fall before it is worth printing, as a fraction. */
export const DRIFT_WORTH_SAYING = 0.05;

export class FleetClock {
  /**
   * @param {() => number} now  Milliseconds source. Injectable ONLY so a check
   *   can drive it without sleeping — a test of a clock that waits for real
   *   seconds is a slow test that flakes on a busy machine. Production passes
   *   nothing and gets `Date.now`.
   */
  constructor(now = Date.now) {
    this._now = now;
    this._startedAt = now();
    this._ticked = 0;
  }

  /** One turn of the fleet's loop, worth `step` nominal seconds. */
  tick(step) {
    this._ticked += step;
  }

  /** Real seconds since the run began. THE honest answer to "how long". */
  get wall() {
    return (this._now() - this._startedAt) / 1000;
  }

  /** Seconds the fleet BELIEVES it has run — ticks × step. */
  get ticked() {
    return this._ticked;
  }

  /**
   * How far behind the wall the fleet has fallen, as a fraction of the wall.
   *
   * 0 is keeping up, 0.26 is the hour run. Negative is impossible in practice
   * and is clamped rather than reported, because a nominal clock AHEAD of the
   * wall means the machine ran the interval faster than its own delay, which it
   * cannot, and printing "-2% drift" would send somebody hunting a phantom.
   */
  get drift() {
    const w = this.wall;
    if (w <= 0) return 0;
    return Math.max(0, (w - this._ticked) / w);
  }

  /** Worth telling a human about? */
  get lagging() {
    return this.drift >= DRIFT_WORTH_SAYING;
  }

  /**
   * The one-liner for the console, or null when the fleet is keeping up.
   *
   * Phrased as what it MEANS rather than as a statistic: nobody reads "drift
   * 0.26" and thinks "my models are thinking a quarter less often than I
   * configured them to", which is the actual consequence.
   */
  driftLine() {
    if (!this.lagging) return null;
    return `⚠ the fleet is ${Math.round(this.drift * 100)}% behind real time ` +
      `(${Math.round(this.ticked)}s of thinking in ${Math.round(this.wall)}s) — ` +
      `every cadence is effectively that much slower than the roster says`;
  }
}
