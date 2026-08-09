// ── loopcheck.js ────────────────────────────────────────────────────────────
// Can the world's frame loop be killed?
//
//   npm run loopcheck
//
// THE SESSIONS THAT CAUSED THIS FILE. Three computer-use playtests in a row
// spent most of their time fighting the game's frame loop rather than the game,
// and the third one worked out why:
//
//   > requestAnimationFrame is suspended, so frame() never fires, so stepWorld
//   > never runs — but the renderer's last image and the server clock keep
//   > going, so it looks alive. I'd issue a movement command and simply not
//   > move. Worse, frame() re-arms rAF after stepWorld(dt), so any single throw
//   > inside stepWorld kills the loop forever with no way back.
//
// Both halves are real and neither looks like a fault from inside the game,
// which is what makes them expensive: a frozen world and a running one are the
// same picture when the last frame is still on the screen.
//
// And it is not hypothetical. A build shipped with `NET` used but never
// imported; every snapshot threw; the world died on the first packet from the
// server and went on looking fine. A playtester lost that session.
//
// What this holds the loop to:
//
//   * A STEP THAT THROWS DOES NOT END THE LOOP. Not once, not sixty times.
//   * IT SAYS SO, once, and says so again when it recovers.
//   * A HIDDEN TAB KEEPS STEPPING, at the real elapsed rate.
//   * ...but never simulates an hour because it was hidden for one.
//   * AND THE FIRST VISIBLE FRAME AFTER HIDING IS NOT ENORMOUS.

import { makeLoop, HIDDEN_CATCHUP_MAX, HIDDEN_SLICE, MAX_FRAME } from '../src/loop.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A clock and a rAF we own, so nothing here waits on a real frame. */
function harness({ throwOn = () => false } = {}) {
  let t = 1000;
  let queued = null;
  const dts = [];
  let timerFn = null;
  const notices = [];

  const loop = makeLoop({
    step: (dt) => {
      dts.push(dt);
      if (throwOn(dts.length, dt)) throw new Error('the step threw');
    },
    now: () => t,
    raf: (fn) => { queued = fn; },
    setTimer: (fn) => { timerFn = fn; return 1; },
    clearTimer: () => { timerFn = null; },
    onStopped: (err) => notices.push(`stopped: ${err.message}`),
    onRecovered: () => notices.push('recovered'),
  });

  return {
    loop, dts, notices,
    advance: (ms) => { t += ms; },
    /** Deliver one animation frame at the current clock. */
    tick(ms = 16) {
      t += ms;
      const fn = queued;
      queued = null;
      fn?.(t);
      return !!fn;
    },
    /** Fire the hidden-tab heartbeat, as a background timer would. */
    heartbeat: () => timerFn?.(),
    get armed() { return queued !== null; },
    get timerRunning() { return timerFn !== null; },
  };
}

function main() {
  console.log('\n  Can the world\'s frame loop be killed?\n');

  // ── 1. A THROW DOES NOT END THE WORLD ────────────────────────────────────
  {
    // Console noise is the point of the fix, not of the check.
    const realError = console.error;
    console.error = () => {};

    const h = harness({ throwOn: (n) => n === 2 });
    h.loop.start();
    h.tick(); h.tick(); h.tick(); h.tick();
    console.error = realError;

    check('A STEP THAT THROWS DOES NOT END THE LOOP',
      h.dts.length === 4 && h.armed,
      `${h.dts.length} steps ran, next frame ${h.armed ? 'is armed' : 'IS NOT ARMED — the world is dead'}`);

    check('  …and it says so, once, rather than sixty times a second',
      h.notices.filter((n) => n.startsWith('stopped')).length === 1,
      h.notices.join(' · ') || 'nothing said');

    check('  …and says so again when it comes right',
      h.notices.includes('recovered') && h.loop.state.stopped === false,
      h.notices.join(' · '));
  }

  {
    // The harder case: it throws EVERY time. The loop must still be alive.
    const realError = console.error;
    console.error = () => {};
    const h = harness({ throwOn: () => true });
    h.loop.start();
    for (let i = 0; i < 30; i++) h.tick();
    console.error = realError;

    check('A STEP THAT ALWAYS THROWS STILL LEAVES A LIVE LOOP',
      h.dts.length === 30 && h.armed && h.loop.state.failures === 30,
      `${h.loop.state.failures} failures, ${h.dts.length} attempts, still armed: ${h.armed}`);
    check('  …and the player was told exactly once',
      h.notices.length === 1, `${h.notices.length} notices`);
  }

  // ── 2. THE SENTINEL: a clean loop is undisturbed ─────────────────────────
  {
    const h = harness();
    h.loop.start();
    for (let i = 0; i < 5; i++) h.tick(16);
    check('SENTINEL: a loop that never throws runs normally and says nothing',
      h.dts.length === 5 && h.notices.length === 0 && h.loop.state.failures === 0
        && Math.abs(h.dts[1] - 0.016) < 1e-9,
      `${h.dts.length} frames at dt ${h.dts[1]}`);
  }

  // ── 3. A LONG FRAME IS CLAMPED ───────────────────────────────────────────
  {
    const h = harness();
    h.loop.start();
    h.tick(9000); // nine seconds between frames
    check('one enormous frame cannot teleport you across the glen',
      h.dts[0] === MAX_FRAME, `dt ${h.dts[0]}s, capped at ${MAX_FRAME}s`);
  }

  // ── 4. A HIDDEN TAB KEEPS THE WORLD RUNNING ──────────────────────────────
  {
    const h = harness();
    h.loop.start();
    h.tick(16);
    const visible = h.dts.length;

    h.loop.setHidden(true);
    check('going hidden starts a heartbeat',
      h.timerRunning && h.loop.hidden, 'rAF is parked from here on');

    // A background timer is clamped to about a second. That is the case worth
    // testing, because it is the one the browser actually gives you.
    h.advance(1000);
    h.heartbeat();
    const ran = h.dts.length - visible;
    check('A HIDDEN TAB STILL STEPS THE WORLD — the whole second of it',
      ran === Math.round(1 / HIDDEN_SLICE) && h.loop.state.hiddenSteps === ran,
      `${ran} slices of ${HIDDEN_SLICE}s for 1s hidden — a command issued here actually happens`);

    h.advance(3600_000); // hidden for an hour
    const before = h.dts.length;
    h.heartbeat();
    check('  …but an hour hidden does not simulate an hour in one beat',
      h.dts.length - before === Math.round(HIDDEN_CATCHUP_MAX / HIDDEN_SLICE),
      `${h.dts.length - before} slices, capped at ${HIDDEN_CATCHUP_MAX}s of catch-up`);

    h.loop.setHidden(false);
    check('  …and coming back stops the heartbeat',
      !h.timerRunning && !h.loop.hidden);

    // The first VISIBLE frame must not carry the hidden hour.
    const n = h.dts.length;
    h.tick(16);
    check('  …and the first frame back is a frame, not an hour',
      h.dts[n] <= MAX_FRAME, `dt ${h.dts[n]}s`);
  }

  // ── 4b. A PAGE THAT LOADS INTO A HIDDEN TAB ──────────────────────────────
  //
  // The first version of this fix started the heartbeat from the
  // `visibilitychange` handler only, and this case has no such event: nothing
  // CHANGED, the tab was hidden from the first byte. Such a page never ran a
  // single step in its life.
  //
  // Found by opening the game in a background tab and watching the clock sit
  // at 07:12 while `stepWorld` was called zero times — not by reading the
  // code, which looked correct, and not by the checks above, which all start
  // from a visible tab.
  {
    const h = harness();
    h.loop.start(true);
    check('A PAGE LOADED INTO AN ALREADY-HIDDEN TAB STILL RUNS',
      h.timerRunning && h.loop.hidden,
      'no visibilitychange ever fires here — there is nothing to change');

    h.advance(1000);
    h.heartbeat();
    check('  …and it is really stepping, not merely armed',
      h.dts.length === Math.round(1 / HIDDEN_SLICE),
      `${h.dts.length} slices from a cold hidden start`);
  }

  {
    const h = harness();
    h.loop.start(false);
    check('SENTINEL: a page loaded VISIBLE starts no heartbeat',
      !h.timerRunning && !h.loop.hidden, 'rAF is doing the work, as it should');
  }

  {
    // Idempotent both ways: `visibilitychange` fires more than you expect.
    const h = harness();
    h.loop.start();
    h.loop.setHidden(true);
    h.loop.setHidden(true);
    h.loop.setHidden(false);
    h.loop.setHidden(false);
    check('SENTINEL: hiding twice and showing twice leaves no stray heartbeat',
      !h.timerRunning && !h.loop.hidden, 'visibilitychange fires more often than you expect');
  }

  {
    // A step that throws while hidden must not spin the loop white-hot.
    const realError = console.error;
    console.error = () => {};
    const h = harness({ throwOn: () => true });
    h.loop.start();
    h.loop.setHidden(true);
    h.advance(1000);
    h.heartbeat();
    console.error = realError;
    check('a step throwing while hidden gives up on that beat, it does not spin',
      h.loop.state.hiddenSteps === 1,
      `${h.loop.state.hiddenSteps} slice attempted for a second owed`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
