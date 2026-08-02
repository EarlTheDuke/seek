// ── inputCheck.js ───────────────────────────────────────────────────────────
// A self-test for the keyboard→intent path, run against a REAL browser.
//
// This exists because of a specific failure. Crouch was bound to Ctrl, and the
// keydown handler opened with `if (e.ctrlKey || ...) return;` — which drops the
// Control keydown itself, since pressing Control sets `ctrlKey` on its own
// event. Crouch therefore never worked, and every key pressed while Ctrl was
// held was discarded too.
//
// It survived testing because the tests dispatched
//
//     new KeyboardEvent('keydown', { code: 'ControlLeft' })
//
// which is NOT the event a keyboard sends. The modifier flags were missing, so
// the guard let the synthetic event through and the check went green against an
// input path that was dead in real play.
//
// So the rule this file enforces: a keyboard test must reproduce the modifier
// state a real keyboard sets, and it must assert on the INTENT — the thing the
// simulation actually consumes — not on the key set.

/**
 * Dispatch a keydown the way a keyboard would, with modifier flags that agree
 * with the keys being held.
 */
function press(code, held) {
  held.add(code);
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...flags(held) }));
}

function release(code, held) {
  held.delete(code);
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, ...flags(held) }));
}

/** The modifier flags implied by the set of keys currently down. */
function flags(held) {
  const any = (...c) => c.some((k) => held.has(k));
  return {
    ctrlKey: any('ControlLeft', 'ControlRight'),
    shiftKey: any('ShiftLeft', 'ShiftRight'),
    altKey: any('AltLeft', 'AltRight'),
    metaKey: any('MetaLeft', 'MetaRight'),
  };
}

/**
 * Run the checks. Returns `{ pass, results }`; each result is
 * `{ name, ok, got, want }`.
 *
 * `input` is the live PlayerInput. It is left released afterwards.
 */
export function checkInput(input) {
  const results = [];
  const held = new Set();

  const check = (name, want, read) => {
    input.releaseAll();
    held.clear();
    const got = read();
    input.releaseAll();
    held.clear();
    const ok = JSON.stringify(got) === JSON.stringify(want);
    results.push({ name, ok, got, want });
  };

  const tap = (code) => {
    press(code, held);
    release(code, held);
  };

  // The bug itself: C toggles crouch, and stays on with no key held.
  check('C toggles crouch on', { crouch: true }, () => {
    tap('KeyC');
    return { crouch: input.poll().crouch };
  });

  check('C again stands up', { crouch: false }, () => {
    tap('KeyC');
    input.poll();
    tap('KeyC');
    return { crouch: input.poll().crouch };
  });

  // The regression that made the whole thing unplayable: walking while crouched.
  check('crouch survives walking', { crouch: true, forward: 1 }, () => {
    tap('KeyC');
    press('KeyW', held);
    const i = input.poll();
    return { crouch: i.crouch, forward: i.forward };
  });

  // Sprint and jump stand you up, so a stale toggle cannot strand you.
  check('sprint stands you up', { crouch: false, sprint: true }, () => {
    tap('KeyC');
    input.poll();
    press('ShiftLeft', held);
    const i = input.poll();
    return { crouch: i.crouch, sprint: i.sprint };
  });

  check('jump stands you up', { crouch: false }, () => {
    tap('KeyC');
    input.poll();
    press('Space', held);
    return { crouch: input.poll().crouch };
  });

  // Ctrl is no longer bound to anything, and — the part that mattered — it no
  // longer eats movement. If a player holds it out of habit, the game keeps
  // working instead of going dead.
  check('Ctrl alone does not crouch', { crouch: false }, () => {
    press('ControlLeft', held);
    return { crouch: input.poll().crouch };
  });

  check('movement survives a held Ctrl', { forward: 1, strafe: -1 }, () => {
    press('ControlLeft', held);
    press('KeyW', held);
    press('KeyA', held);
    const i = input.poll();
    return { forward: i.forward, strafe: i.strafe };
  });

  // Browser shortcuts must not double as game actions. Ctrl+R reloads; it must
  // not also eat a meal on the way out. Ctrl+C copies; it must not crouch.
  check('Ctrl+R does not eat', { eat: false }, () => {
    press('ControlLeft', held);
    tap('KeyR');
    return { eat: input.poll().eat };
  });

  check('Ctrl+C does not crouch', { crouch: false }, () => {
    press('ControlLeft', held);
    tap('KeyC');
    return { crouch: input.poll().crouch };
  });

  // The rest of the bindings, so this is a real guard on the whole path rather
  // than a crouch-shaped one.
  check('WASD', { forward: -1, strafe: 1 }, () => {
    press('KeyS', held);
    press('KeyD', held);
    const i = input.poll();
    return { forward: i.forward, strafe: i.strafe };
  });

  check('shift sprints', { sprint: true }, () => {
    press('ShiftLeft', held);
    return { sprint: input.poll().sprint };
  });

  check('E interacts once per tap', { first: true, second: false }, () => {
    tap('KeyE');
    return { first: input.poll().interact, second: input.poll().interact };
  });

  check('digits select slots', { slot: 2 }, () => {
    tap('Digit3');
    return { slot: input.poll().selectSlot };
  });

  check('death releases everything', { crouch: false, forward: 0 }, () => {
    tap('KeyC');
    press('KeyW', held);
    input.poll();
    input.releaseAll();
    const i = input.poll();
    return { crouch: i.crouch, forward: i.forward };
  });

  return { pass: results.every((r) => r.ok), results };
}
