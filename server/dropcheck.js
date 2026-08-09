// ── dropcheck.js ────────────────────────────────────────────────────────────
// Can somebody else see what you put on the ground, and take it?
//
//   npm run dropcheck
//
// THE HOLE THIS CLOSES. `drop` has been on the protocol's allow-list since the
// beginning and THE SERVER NEVER READ IT. So every drop happened inside one
// browser: invisible to the other players, invisible to the agents, and gone
// the moment you reloaded.
//
// A playtester: "There is no way to hand anything to another player... So I
// paid the only way the game allows: I walked to them and dropped eighteen
// branches on the grass at their feet, then later six arrows and nine more
// branches at Coinneach's. Neither of them ever picked any of it up, and
// Eachann kept asking for the nine branches he was standing on."
//
// Ben: "another player needs to be able to see what you drop for it to be a
// good complete game."
//
// OVER A REAL SOCKET, with two bodies, because that is the only place this can
// be true or false — and because `give` shipped working in-process and dead on
// the wire for a whole session, which is the mistake this file exists to stop
// repeating.
//
// THE ASSERTION THAT CARRIES IT IS CONSERVATION. A drop is a removal and an
// addition in two different places, and the same branch existing both on the
// ground and in the pack is a duplicator.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROTOCOL_VERSION, C_HELLO, C_INTENT, S_WELCOME, S_SNAPSHOT,
  encode, decode,
} from '../src/net/protocol.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8139);
const URL = `ws://127.0.0.1:${PORT}`;
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A raw socket with a name, not an `Agent`.
 *
 * The first version of this file used `Agent` and called `send()` with no
 * arguments — `Agent.send(type, data)` takes two, so it transmitted nothing at
 * all and every assertion failed for a reason that had nothing to do with the
 * code under test. Same shape as `givecheck`'s `Body`, on purpose.
 */
class Body {
  constructor(name) {
    this.name = name;
    this.id = null;
    this.me = null;
    this.lo = [];
    this.intent = {
      forward: 0, strafe: 0, lookYaw: 0, lookPitch: 0, aimYaw: null, aimPitch: null,
      drop: false, dropHalf: false, dropBurn: 0, interact: false, selectSlot: -1,
    };
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onerror = (e) => reject(new Error(e.message ?? 'socket error'));
      this.ws.onopen = () => this.ws.send(encode(C_HELLO, { name: this.name, version: PROTOCOL_VERSION }));
      this.ws.onmessage = (ev) => {
        const msg = decode(ev.data);
        if (!msg) return;
        if (msg.type === S_WELCOME) { this.id = msg.data.id; resolve(this); }
        else if (msg.type === S_SNAPSHOT) {
          this.me = msg.data.me ?? this.me;
          this.lo = msg.data.lo ?? [];
        }
      };
    });
  }

  pack() { return this.me?.iv ?? {}; }
  send() { if (this.ws.readyState === 1) this.ws.send(encode(C_INTENT, { i: this.intent })); }
  close() { try { this.ws.close(); } catch { /* going anyway */ } }
}

async function main() {
  console.log('\n  Can somebody else see what you put on the ground, and take it?\n');
  await requireFreePort(PORT, 'dropcheck');
  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    stdio: 'ignore', env: { ...process.env, DANGER: 'none' },
  });
  try {
    let dropper = null;
    for (let i = 0; i < 40 && !dropper; i++) {
      await sleep(150);
      dropper = await new Body('Mairi').connect(URL).catch(() => null);
    }
    if (!dropper) throw new Error(`no server answered on ${URL}`);
    const watcher = await new Body('Seonaid').connect(URL);
    for (let i = 0; i < 40 && !(dropper.me && watcher.me); i++) await sleep(100);
    await sleep(400);
    check('two people are on the wire', dropper.id !== null && watcher.id !== null,
      `#${dropper.id} and #${watcher.id}`);

    const before = { dropper: { ...dropper.pack() }, watcher: { ...watcher.pack() } };
    const totalBefore = (before.dropper.arrow ?? 0) + (before.watcher.arrow ?? 0);
    check('both start with arrows', totalBefore > 0,
      `${before.dropper.arrow ?? 0} + ${before.watcher.arrow ?? 0} = ${totalBefore}`);

    // ── the drop, on the rising edge, exactly as a keypress sends it ────────
    //
    // Pick the arrows first, the way pressing 2 does. Slot one is the BOW, and
    // the server refuses to drop that at all — the same rule `giftFrom` and
    // `KEEP_ON_DEATH` already follow, and the most important of the three,
    // because the bow is what you are holding unless you said otherwise.
    dropper.intent.selectSlot = 1;
    for (let i = 0; i < 4; i++) { dropper.send(); watcher.send(); await sleep(1000 / 30); }
    dropper.intent.selectSlot = -1;

    const beforeLoot = watcher.lo.length;
    dropper.intent.drop = true;
    for (let i = 0; i < 6; i++) { dropper.send(); watcher.send(); await sleep(1000 / 30); }
    dropper.intent.drop = false;
    for (let i = 0; i < 20; i++) { dropper.send(); watcher.send(); await sleep(1000 / 30); }
    await sleep(400);

    const afterDrop = { ...dropper.pack() };
    check('THE SERVER TOOK IT OUT OF THE PACK — it used to ignore `drop` entirely',
      (afterDrop.arrow ?? 0) < (before.dropper.arrow ?? 0),
      `${before.dropper.arrow ?? 0} -> ${afterDrop.arrow ?? 0} arrows`);

    // THE ONE THAT MATTERS.
    const seen = watcher.lo;
    check('AND THE OTHER PLAYER CAN SEE IT',
      seen.length > beforeLoot && seen.some((l) => l.i === 'arrow'),
      `${beforeLoot} -> ${seen.length} things on the ground: ${JSON.stringify(seen.map((l) => `${l.n} ${l.i}`))}`);
    check('  …with an id, so it can be drawn without flickering',
      seen.every((l) => l.d != null),
      'a viewer has to tell "the same branch, moved" from "a different branch"');

    // ── and taken ──────────────────────────────────────────────────────────
    const target = seen.find((l) => l.i === 'arrow');
    const watcherBefore = watcher.pack().arrow ?? 0;
    // Walk on to it and press E, which is `interact` — the server's own
    // `collectFor`, the same door a keyboard uses.
    const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
    for (let i = 0; i < 200; i++) {
      const me = watcher.me?.p;
      if (!me) break;
      const d = Math.hypot(target.p[0] - me[0], target.p[2] - me[2]);
      if (d < 1.2) break;
      watcher.intent.aimYaw = yawTo(me[0], me[2], target.p[0], target.p[2]);
      watcher.intent.aimPitch = -0.03;
      watcher.intent.forward = 1;
      watcher.send(); dropper.send();
      await sleep(1000 / 30);
    }
    watcher.intent.forward = 0;
    for (let i = 0; i < 40; i++) {
      watcher.intent.interact = i % 6 === 0;
      watcher.send(); dropper.send();
      await sleep(1000 / 30);
    }
    watcher.intent.interact = false;
    await sleep(500);

    const watcherAfter = watcher.pack().arrow ?? 0;
    check('AND THEY CAN PICK IT UP', watcherAfter > watcherBefore,
      `${watcherBefore} -> ${watcherAfter} arrows — this is the deadlock, undone`);

    // The assertion that carries the file.
    const totalAfter = (dropper.pack().arrow ?? 0) + watcherAfter
      + watcher.lo.filter((l) => l.i === 'arrow').reduce((n, l) => n + l.n, 0);
    check('AND NOTHING WAS MINTED — pack, ground and pack again',
      totalAfter === totalBefore,
      `${totalBefore} before, ${totalAfter} after (in packs and on the ground)`);

    // ...and the bow stays put however hard you press.
    {
      const bowBefore = dropper.pack().bow ?? 0;
      dropper.intent.selectSlot = 0;
      for (let i = 0; i < 4; i++) { dropper.send(); watcher.send(); await sleep(1000 / 30); }
      dropper.intent.selectSlot = -1;
      for (let round = 0; round < 3; round++) {
        dropper.intent.drop = true;
        for (let i = 0; i < 4; i++) { dropper.send(); watcher.send(); await sleep(1000 / 30); }
        dropper.intent.drop = false;
        for (let i = 0; i < 6; i++) { dropper.send(); watcher.send(); await sleep(1000 / 30); }
      }
      await sleep(300);
      check('THE BOW CANNOT BE DROPPED, however many times you press it',
        (dropper.pack().bow ?? 0) === bowBefore && bowBefore > 0,
        `${bowBefore} -> ${dropper.pack().bow ?? 0} — it is slot one, so this is the default press`);
    }

    dropper.close();
    watcher.close();
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
  console.error(`\n  dropcheck could not run: ${err.stack}\n`);
  process.exit(1);
});
