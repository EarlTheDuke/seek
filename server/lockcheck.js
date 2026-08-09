// ── lockcheck.js ────────────────────────────────────────────────────────────
// Can you talk to somebody and still aim afterwards?
//
//   npm run lockcheck
//
// THIS AREA HAS BROKEN THREE TIMES AND HAD NO TEST AT ALL.
//
//   1. `closeSay` never took the pointer lock back, so pressing Enter to send a
//      line left the game running with a free mouse. Talking to the other
//      players cost you your view of them. Fixed by calling `onWantLock`.
//
//   2. `lockUnavailable` was a ONE-WAY LATCH: any single rejected
//      requestPointerLock() set `lockSupported = false` for ever, the cursor
//      became a hand, keys kept working, and only a page reload brought
//      mouse-look back.
//
//   3. And the cause of (2) in normal play: CHROME REFUSES A RE-LOCK FOR ABOUT
//      1.25 SECONDS after a lock is released. `openSay` releases one so there is
//      a caret to type into — which is right — and `closeSay` asks for it
//      straight back, INSIDE that window. So the ordinary act of pressing Enter,
//      typing, and pressing Enter again was enough to kill aiming for the rest
//      of the session.
//
// Ben, twice, in his own words: "the game sometimes breaks, changes from cursor
// to a hand, and then I can not use the mouse in the game. I can press buttons
// but not change directions." And: "it is when I hit enter to type a message."
//
// So this file drives the REAL PlayerInput against a fake browser that refuses
// exactly the way Chrome does, and asserts the mouse comes back.

import { PlayerInput } from '../src/player/input.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A browser that behaves like Chrome: a lock released now cannot be retaken
 * for `cooldown` milliseconds, and asking inside that window REJECTS.
 */
function fakeBrowser({ cooldown = 1250, supported = true } = {}) {
  const listeners = new Map();
  const dom = {
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const state = { locked: false, releasedAt: -Infinity, requests: 0, rejections: 0 };

  if (supported) {
    dom.requestPointerLock = () => {
      state.requests++;
      if (Date.now() - state.releasedAt < cooldown) {
        state.rejections++;
        return Promise.reject(new Error('SecurityError: pointer lock cooldown'));
      }
      state.locked = true;
      fire('pointerlockchange');
      return Promise.resolve();
    };
  }

  const doc = {
    get pointerLockElement() { return state.locked ? dom : null; },
    addEventListener: (t, fn) => { listeners.set(t, [...(listeners.get(t) ?? []), fn]); },
    removeEventListener: () => {},
    exitPointerLock: () => {
      if (!state.locked) return;
      state.locked = false;
      state.releasedAt = Date.now();
      fire('pointerlockchange');
    },
  };
  function fire(type) { for (const fn of listeners.get(type) ?? []) fn(); }

  return { dom, doc, state, fire };
}

/** Install the fakes as globals, run, and put everything back. */
async function withBrowser(opts, body) {
  const b = fakeBrowser(opts);
  const hadDoc = 'document' in globalThis;
  const hadWin = 'window' in globalThis;
  const oldDoc = globalThis.document;
  const oldWin = globalThis.window;
  globalThis.document = b.doc;
  globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };
  try {
    return await body(b);
  } finally {
    if (hadDoc) globalThis.document = oldDoc; else delete globalThis.document;
    if (hadWin) globalThis.window = oldWin; else delete globalThis.window;
  }
}

async function main() {
  console.log('\n  Can you talk to somebody and still aim afterwards?\n');

  // ── THE EXACT SEQUENCE BEN DESCRIBED ─────────────────────────────────────
  await withBrowser({ cooldown: 250 }, async (b) => {
    const input = new PlayerInput(b.dom);
    input.requestLock();
    await sleep(20);
    check('the mouse is held to begin with', input.locked === true, `locked=${input.locked}`);

    // Enter -> openSay releases the lock so there is a caret to type into.
    b.doc.exitPointerLock();
    check('  …and opening the say box releases it, which is correct',
      input.locked === false, 'you cannot type into a locked pointer');

    // Enter again -> closeSay asks for it straight back, INSIDE the cooldown.
    input.requestLock();
    await sleep(30);
    // Either the browser rejected it, or the input layer knew better than to ask
    // inside the cooldown. Both are correct; asking and being refused is not a
    // requirement, coming back afterwards is. What is NOT allowed is a request
    // that never happens and never gets retried, which is what the first version
    // of this assertion let through with a `+1 >= 1` that could not fail.
    check('  …and it does not come straight back — the browser will not allow it',
      input.locked === false,
      `${b.state.rejections} rejection(s) of ${b.state.requests} request(s)`);

    // THE ASSERTION THAT CARRIES THE FILE.
    // Longer than LOCK_COOLDOWN_MS in input.js, which is what the retry waits.
    await sleep(1700);
    check('THE MOUSE COMES BACK ON ITS OWN once the cooldown passes',
      input.locked === true,
      input.locked ? 'aiming works again without touching anything'
                   : 'this is the bug: a hand cursor and no way back but a reload');

    check('  …and mouse-look is live again',
      (() => {
        input.pendingYaw = 0;
        input.onMouseMove({ movementX: 10, movementY: 0 });
        return input.pendingYaw !== 0;
      })(), `pendingYaw=${input.pendingYaw}`);
  });

  // ── a refusal must NOT be mistaken for an unsupported browser ────────────
  await withBrowser({ cooldown: 5000 }, async (b) => {
    const input = new PlayerInput(b.dom);
    input.requestLock();
    await sleep(20);
    b.doc.exitPointerLock();
    input.requestLock();
    await sleep(50);
    check('A REFUSAL DOES NOT DISABLE POINTER LOCK FOR THE SESSION',
      input.lockSupported === true,
      'lockSupported stayed true — "refused this time" and "this browser cannot" are different things');
    check('  …and a click asks again rather than doing nothing',
      (() => {
        b.state.releasedAt = -Infinity; // cooldown over
        input.onMouseDown({ button: 0, preventDefault() {} });
        return input.relockClick === true;
      })(), 'a left click on the canvas takes the mouse back');
    check('  …and that click is swallowed, so it does not also loose an arrow',
      input.consumeRelockClick() === true && input.consumeRelockClick() === false,
      'consumed exactly once');
  });

  // ── a browser that genuinely cannot: the drag fallback, permanently ──────
  await withBrowser({ supported: false }, async (b) => {
    const input = new PlayerInput(b.dom);
    let told = null;
    input.onLockUnavailable = (e) => { told = e; };
    input.requestLock();
    await sleep(20);
    check('AN UNSUPPORTED BROWSER IS still A PERMANENT VERDICT',
      input.lockSupported === false && told !== null,
      'no requestPointerLock at all is the one thing worth latching on');
    check('  …and right-drag look turns on for it',
      (() => {
        input.onMouseDown({ button: 2, preventDefault() {} });
        return input.dragging === true;
      })(), 'hold the right button and drag');
  });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  lockcheck could not run: ${err.stack}\n`);
  process.exit(1);
});
