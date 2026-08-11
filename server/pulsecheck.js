// ── pulsecheck.js ───────────────────────────────────────────────────────────
// Does a keypress survive the trip to the server?
//
//   npm run pulsecheck
//
// ══ THE BUG THIS EXISTS FOR ══
//
// Ben: *"when i drop a branch it looks like an arrow"*.
//
// It looked like an arrow because it WAS an arrow, and nothing was wrong with
// either the drop or the drawing. The frame loop runs on `requestAnimationFrame`
// — 60 or 144 times a second — and `NetClient.sendIntent` is gated to
// `NET.intentHz`, which is 30. So most frames never become a packet.
//
// That is correct and cheap for a LEVEL field: `forward` describes right now,
// and the next packet carries the truth again. It is ruinous for a PULSE — a
// field a keypress sets for exactly one frame, which `PlayerInput.poll` then
// clears whether or not anybody sent it. A pulse that lands on a skipped frame
// is a keypress that never happened, silently, with the browser's own HUD
// showing that it did.
//
// So: you press 3, the browser selects the branch LOCALLY, your hand and your
// hotbar both show a branch — and the server, which never heard, still has slot
// two equipped. Press Q and it drops what IT thinks you are holding.
//
// Measured against the real gate before the fix: 33% of presses arrived at 60
// fps and 21% at 120. Two acts in three, thrown away without a word.
//
// ══ WHY THIS FILE IS SHAPED THE WAY IT IS ══
//
// EVERY OTHER SOCKET CHECK IN THIS REPO IS BLIND TO THIS BUG, and would stay
// blind however many were added. They build a raw `Body`, set `intent.drop =
// true`, and send it themselves every 33 ms for six frames — so they exercise
// the server's edge detection and never once touch `NetClient`, which is where
// the loss happens. dropcheck is 8/8 and has been throughout.
//
// So this one drives THE REAL CLIENT: the actual `NetClient`, the actual
// `sendIntent` gate, the actual `PlayerInput`-shaped one-frame pulse, against
// the actual server, at the frame rates real monitors run at. Node has a global
// `WebSocket`, so the browser's own module runs here unmodified.
//
// And it runs the COUNTERFACTUAL in-process — the same presses through a client
// with the latch disabled — because a green number means nothing until you have
// watched it go red. That arm is the sentinel: it is 0-ish BY CONSTRUCTION, and
// if it ever reads high this file is measuring something other than it thinks.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NetClient, PULSE_FIELDS, noPulses } from '../src/net/client.js';
import { createIntent, clearIntent } from '../src/sim/intents.js';
import { INTENT_KEYS } from '../src/net/protocol.js';
import { NET } from '../src/config.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8142);
const URL = `ws://127.0.0.1:${PORT}`;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── PART ONE: the gate, in isolation, at the frame rates people own ─────────
//
// No server. The real `sendIntent` and the real intent object; only the clock
// and the socket are invented, so the METHOD under test is the shipped one.
//
// `latched: false` bypasses the fix by handing the client a fresh, empty set of
// held pulses on every call — the pre-fix behaviour exactly, since an empty
// latch has nothing to spend.
function pressesThatLanded(fps, { latched }) {
  const net = new NetClient({});
  net.connected = true;
  net.id = 1;
  const sent = [];
  net.send = (type, payload) => sent.push({ ...payload.i });

  const frameMs = 1000 / fps;
  const intent = createIntent();
  let pressed = 0;
  let next = 40;
  for (let f = 0; f < 3000; f++) {
    clearIntent(intent);
    if (f === next) {
      intent.selectSlot = 2;
      intent.drop = true;
      pressed++;
      // Irregular, because a REGULAR press against a REGULAR clock aliases:
      // the first version of this pressed every 40th frame and read 99% at 144
      // fps, which was the probe and not the game.
      next += 37 + ((pressed * 13) % 11);
    }
    if (!latched) net.pulses = noPulses();
    // A hand does not press on a whole frame boundary either.
    const jitter = (((f * 7919) % 1000) / 1000) * frameMs * 0.4;
    net.sendIntent(intent, f * frameMs + jitter);
  }
  return {
    pressed,
    slots: sent.filter((s) => s.selectSlot === 2).length,
    drops: sent.filter((s) => s.drop).length,
    // The pair was pressed on ONE frame, so it must arrive in ONE packet. A
    // select that arrives a packet after its drop drops the wrong thing, which
    // is the original bug wearing a different hat.
    split: sent.filter((s) => (s.selectSlot === 2) !== !!s.drop).length,
  };
}

/** A real client with the fields this check reads off a snapshot. */
function client(name) {
  const c = new NetClient({});
  c.pack = () => c.buffer.at(-1)?.snap?.me?.iv ?? {};
  c.ground = () => c.buffer.at(-1)?.snap?.lo ?? [];
  c.connect(URL, name);
  return c;
}

async function main() {
  console.log('\n  Does a keypress survive the trip to the server?\n');

  // ── the allow-list audit ──────────────────────────────────────────────────
  //
  // INTENT_KEYS is an allow-list and so is PULSE_FIELDS, and this repo has now
  // been bitten twice by a field added to one list and forgotten in the other.
  // Anything on the wire is either a level or a pulse; naming the levels here
  // means a NEW field is red until somebody classifies it, rather than silently
  // back in the hole.
  const LEVELS = ['forward', 'strafe', 'jump', 'crouch', 'sprint',
    'lookYaw', 'lookPitch', 'aimYaw', 'aimPitch', 'primary'];
  const unclassified = INTENT_KEYS.filter((k) => !LEVELS.includes(k) && !PULSE_FIELDS.includes(k));
  check('every field on the wire is classified as a level or a pulse',
    unclassified.length === 0,
    unclassified.length
      ? `${JSON.stringify(unclassified)} is neither — a new pulse left out of PULSE_FIELDS loses two presses in three`
      : `${LEVELS.length} levels, ${PULSE_FIELDS.length} pulses, ${INTENT_KEYS.length} on the wire`);
  const orphan = PULSE_FIELDS.filter((k) => !INTENT_KEYS.includes(k));
  check('and every pulse it latches is actually on the wire',
    orphan.length === 0,
    orphan.length ? `${JSON.stringify(orphan)} is latched and never sent` : 'nothing latched in vain');

  // ── part one ──────────────────────────────────────────────────────────────
  console.log(`\n  ── the gate, at ${NET.intentHz} Hz, against the frame rates people own ──\n`);
  let worstBefore = 100;
  for (const fps of [60, 75, 120, 144]) {
    const before = pressesThatLanded(fps, { latched: false });
    const after = pressesThatLanded(fps, { latched: true });
    const pctBefore = Math.round((100 * before.slots) / before.pressed);
    worstBefore = Math.min(worstBefore, pctBefore);
    check(`  ${fps} fps: every press reaches the server`,
      after.slots === after.pressed && after.drops === after.pressed,
      `${after.slots}/${after.pressed} slot, ${after.drops}/${after.pressed} drop `
      + `(was ${pctBefore}% before the latch)`);
    check(`  ${fps} fps: and the pair rides in ONE packet`,
      after.split === 0,
      `${after.split} packets carried one half of a press`);
  }

  // THE ARM SENTINEL. This number is low BY CONSTRUCTION — it is the bug, run
  // on purpose. If it ever reads ~100 the counterfactual is not being applied
  // and every PASS above is passing on nothing.
  check('THE COUNTERFACTUAL REALLY IS THE OLD BEHAVIOUR',
    worstBefore < 60,
    `the un-latched arm lost most presses at its worst (${worstBefore}% arrived) `
    + '— if this is high, the arm above is not the arm you think it is');

  // ── part two: the real client, the real server, the real bug ─────────────
  console.log('\n  ── and end to end: press 3, press Q, and see what hits the grass ──\n');
  await requireFreePort(PORT, 'pulsecheck');
  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    stdio: 'ignore', env: { ...process.env, DANGER: 'none', STOCK: 'wood:3' },
  });

  try {
    // A fresh client each attempt: `connect` fires `onerror` once and does not
    // retry, so reusing the first one would wait forty times on a socket that
    // gave up on the first try.
    let me = null;
    for (let i = 0; i < 40 && !me?.connected; i++) {
      await sleep(200);
      me?.ws?.close?.();
      me = client('Mairi');
      await sleep(150);
    }
    if (!me?.connected) throw new Error(`no server answered on ${URL}`);
    for (let i = 0; i < 60 && !Object.keys(me.pack()).length; i++) await sleep(100);
    check('a real NetClient is on the wire, carrying a branch',
      me.connected && (me.pack().wood ?? 0) > 0,
      `pack: ${JSON.stringify(me.pack())}`);

    // The hotbar: bow 0, arrow 1, wood 2. Pressing 3 means slot 2.
    const WOOD_SLOT = 2;
    const woodBefore = me.pack().wood ?? 0;
    const arrowBefore = me.pack().arrow ?? 0;
    const idsBefore = new Set(me.ground().map((l) => l.d));

    // ── 120 fps, and ONE frame each, exactly as a hand and `poll` produce it ──
    //
    // The press is not held. That is the entire point: holding it is what every
    // other check in this repo does, and holding it is what hides the bug.
    const intent = createIntent();
    const frameMs = 1000 / 120;
    const t0 = performance.now();
    for (let f = 0; f < 240; f++) {
      clearIntent(intent);
      intent.aimPitch = -0.03;
      if (f === 60) intent.selectSlot = WOOD_SLOT; // press 3
      if (f === 120) intent.drop = true; // press Q
      me.sendIntent(intent, t0 + f * frameMs);
      await sleep(frameMs);
    }
    await sleep(900); // let it fall and settle, and a snapshot come back

    const fresh = me.ground().filter((l) => !idsBefore.has(l.d));
    const branch = fresh.find((l) => l.i === 'wood') ?? null;
    check('ONE press of 3 and ONE press of Q puts a BRANCH on the ground',
      branch !== null,
      branch
        ? `#${branch.d} is ${branch.n} wood`
        : `it put down ${JSON.stringify(fresh.map((l) => `${l.n} ${l.i}`))} `
        + '— an arrow here is the reported bug, an empty list is the press being eaten');
    check('  …and the branch came out of the pack, not the quiver',
      (me.pack().wood ?? 0) === woodBefore - 1 && (me.pack().arrow ?? 0) === arrowBefore,
      `wood ${woodBefore} -> ${me.pack().wood ?? 0}, arrow ${arrowBefore} -> ${me.pack().arrow ?? 0}`);

    me.ws?.close();
    await sleep(200);
  } finally {
    try { server.kill(); } catch { /* already gone */ }
    await sleep(300);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  pulsecheck could not run: ${err.stack}\n`);
  process.exit(1);
});
