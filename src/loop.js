/**
 * The frame loop, on its own so it can be tested.
 *
 * It used to be four lines inside `main.js`:
 *
 *     function frame(now) {
 *       const dt = Math.min((now - last) / 1000, 0.1);
 *       last = now;
 *       stepWorld(dt);
 *       requestAnimationFrame(frame);   // <- never reached if stepWorld throws
 *     }
 *
 * and it had three faults, all of which a player meets and none of which look
 * like a fault from inside the game.
 *
 * ONE — ANY EXCEPTION ENDED THE WORLD FOR EVER. `stepWorld` drives everything:
 * physics, the snapshot, the HUD, the renderer. One throw anywhere in it and
 * the re-arm never ran. It happened live — a build with a missing `NET` import
 * threw on every snapshot, so the world died on the first packet from the
 * server. The re-arm belongs in a `finally`, and now is.
 *
 * TWO — IT DIED SILENTLY. The last rendered image stays on the screen and the
 * server's clock keeps ticking, so a dead world and a running one look exactly
 * alike. A playtester spent most of a session issuing movement commands into a
 * world that had stopped. So a stopped world says so, and says it somewhere
 * that does not depend on the HUD still working — the HUD is inside the step
 * and may be what threw.
 *
 * THREE — A HIDDEN TAB PARKS `requestAnimationFrame`, which is the browser
 * behaving correctly and is still the same experience: the world ignores you
 * while looking alive. `setTimeout` is clamped to about a second in the
 * background, which is fine — the point is not smooth animation nobody is
 * watching, it is that the clock keeps up with the server's and that a command
 * issued while hidden actually happens.
 *
 * Everything is injected so a check can drive it with a fake clock and a fake
 * rAF, and assert the thing that matters: THE LOOP KEEPS GOING.
 */

/** How much sim time one slice may cover. `stepWorld` is built for ~a frame. */
export const HIDDEN_SLICE = 0.1;
/**
 * The most catch-up one heartbeat may do. A tab hidden for an hour must not
 * come back and try to simulate an hour in one go — that is a frozen tab and a
 * fan at full speed, which is a worse bug than the one being fixed.
 */
export const HIDDEN_CATCHUP_MAX = 1.0;
/** Longest single visible frame, so returning to a tab does not teleport you. */
export const MAX_FRAME = 0.1;

export function makeLoop({
  step,
  now = () => performance.now(),
  raf = (fn) => requestAnimationFrame(fn),
  setTimer = (fn, ms) => setInterval(fn, ms),
  clearTimer = (id) => clearInterval(id),
  onStopped = () => {},
  onRecovered = () => {},
  beatMs = 100,
} = {}) {
  let last = now();
  let hiddenTimer = null;
  let hiddenAt = 0;

  const state = {
    /** How many times the step has thrown since the last clean one. */
    failures: 0,
    /** Total frames that completed without throwing. */
    frames: 0,
    /** Slices run while the tab was hidden. */
    hiddenSteps: 0,
    /** True between a throw and the next clean step. */
    stopped: false,
    lastError: null,
  };

  /** One step, guarded. Returns false if it threw. */
  function once(dt) {
    try {
      step(dt);
      state.frames++;
      if (state.stopped) {
        // Recovered. Say that too: a red bar that never clears teaches a
        // player to ignore red bars.
        state.stopped = false;
        state.failures = 0;
        state.lastError = null;
        onRecovered();
      }
      return true;
    } catch (err) {
      state.failures++;
      state.lastError = err;
      // Once, not sixty times a second. The console keeps every one.
      console.error(`the world's step threw (${state.failures})`, err);
      if (!state.stopped) {
        state.stopped = true;
        onStopped(err);
      }
      return false;
    }
  }

  function frame(t) {
    const dt = Math.min((t - last) / 1000, MAX_FRAME);
    last = t;
    try {
      once(dt);
    } finally {
      // ALWAYS. This one line is the whole of fault ONE: everything above may
      // throw and the world still gets its next frame.
      raf(frame);
    }
  }

  function beat() {
    const t = now();
    let owed = Math.min((t - hiddenAt) / 1000, HIDDEN_CATCHUP_MAX);
    hiddenAt = t;
    // `> 0` and not `> EPSILON` left a residue: ten subtractions of 0.1 from
    // 1.0 leave about 1e-16 rather than zero, so every single heartbeat ran an
    // extra step of a hundred-quadrillionth of a second. Harmless in effect
    // and wrong in a way that would quietly confuse any measurement taken of
    // this loop later.
    while (owed > 1e-6) {
      const dt = Math.min(owed, HIDDEN_SLICE);
      state.hiddenSteps++;
      if (!once(dt)) break; // it is throwing; do not spin on it
      owed -= dt;
    }
    // rAF is parked, so `last` is stale by however long we have been hidden.
    // Without this the first VISIBLE frame arrives with a dt of minutes.
    last = now();
  }

  return {
    state,
    /**
     * Start the loop.
     *
     * `hidden` is not optional and defaults to the truth rather than to
     * `false`. A PAGE CAN LOAD INTO A TAB THAT IS ALREADY HIDDEN — an
     * automated browser, a background tab restored on startup, a window behind
     * another — and in that case `visibilitychange` NEVER FIRES, because
     * nothing changed. Starting the heartbeat only from the event meant such a
     * page never ran a single step in its life, which is precisely the
     * playtester's case and was still broken after the first version of this
     * fix. Found by loading the game in a hidden tab and watching the clock
     * not move, which no amount of reasoning about the code had turned up.
     */
    start(hidden = typeof document !== 'undefined' && document.hidden) {
      last = now();
      raf(frame);
      if (hidden) this.setHidden(true);
    },
    /** Call on `visibilitychange`. Idempotent in both directions. */
    setHidden(hidden) {
      if (hidden) {
        if (hiddenTimer !== null) return;
        hiddenAt = now();
        hiddenTimer = setTimer(beat, beatMs);
      } else if (hiddenTimer !== null) {
        clearTimer(hiddenTimer);
        hiddenTimer = null;
        last = now();
      }
    },
    get hidden() {
      return hiddenTimer !== null;
    },
    /** Exposed for the check, and for advancing the world by hand. */
    frame,
    beat,
  };
}
