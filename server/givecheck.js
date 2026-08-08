// ── givecheck.js ────────────────────────────────────────────────────────────
// Can one person hand something to another?
//
//   npm run givecheck
//
// Until this verb existed, three of the six written characters had no way to
// behave differently from one another. A hoarder who "will trade for meat", a
// generous soul "slow to notice she is being used", and a liar were IDENTICAL
// in what they could do — the personality lived entirely in what they said, and
// talk is cheap in a way that handing over your last venison is not.
//
// Driven over a real socket against a real server, because the transfer is
// server-side by necessity: it is the one place holding both inventories. A
// test that called `resolveGive` directly would prove the arithmetic and none
// of the plumbing, and the plumbing is where this project's bugs live.
//
// THE ASSERTION THAT MATTERS IS CONSERVATION. It is easy to write a `give` that
// credits the receiver without debiting the giver, and an item you can print is
// the one bug a shared world never recovers from.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PROTOCOL_VERSION, C_HELLO, C_INTENT, S_WELCOME, S_SNAPSHOT,
  encode, decode,
} from '../src/net/protocol.js';
import { SOCIAL } from '../src/config.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8083);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

class Body {
  constructor(name) {
    this.name = name;
    this.id = null;
    this.me = null;
    this.events = [];
    this.intent = { forward: 0, strafe: 0, lookYaw: 0, lookPitch: 0, aimYaw: null, aimPitch: null, give: '', giveItem: '' };
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
          for (const e of msg.data.ev ?? []) this.events.push(e);
        }
      };
    });
  }

  /** What this body is carrying. The snapshot's `iv` is already {id: count}. */
  pack() { return this.me?.iv ?? {}; }

  send() { if (this.ws.readyState === 1) this.ws.send(encode(C_INTENT, { i: this.intent })); }
  close() { try { this.ws.close(); } catch { /* going anyway */ } }
}

async function main() {
  console.log('\n  Can one person hand something to another?\n');
  await requireFreePort(PORT, 'givecheck');

  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  try {
    let giver = null;
    for (let i = 0; i < 40 && !giver; i++) {
      await sleep(150);
      giver = await new Body('Morag').connect(URL).catch(() => null);
    }
    if (!giver) throw new Error(`no server answered on ${URL}`);
    const taker = await new Body('Eachann').connect(URL);
    for (let i = 0; i < 30 && !(giver.me && taker.me); i++) await sleep(100);

    check('two people are on the wire', giver.id !== null && taker.id !== null,
      `#${giver.id} ${giver.name}, #${taker.id} ${taker.name}`);

    const before = { giver: giver.pack(), taker: taker.pack() };
    const totalBefore = (before.giver.arrow ?? 0) + (before.taker.arrow ?? 0);
    check('both start with the same kit', totalBefore > 0,
      `${before.giver.arrow ?? 0} + ${before.taker.arrow ?? 0} = ${totalBefore} arrows between them`);

    // ── WALK, do not widen the rule ──
    //
    // They spawn ~3.3 m apart and `giveRange` is 3.0, so out of the box they
    // cannot reach each other. That is CORRECT — the whole point of `give` is
    // that it costs a walk, and a generous mind has to go to the hungry one.
    // Raising the constant to make this check pass would be tuning the game to
    // suit the test, which is how three earlier passes on the hunting side of
    // this project moved a failure around without fixing it.
    const gap = () => Math.hypot(giver.me.p[0] - taker.me.p[0], giver.me.p[2] - taker.me.p[2]);
    const started = gap();
    const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
    for (let i = 0; i < 120 && gap() > SOCIAL.giveRange * 0.6; i++) {
      giver.intent.aimYaw = yawTo(giver.me.p[0], giver.me.p[2], taker.me.p[0], taker.me.p[2]);
      giver.intent.aimPitch = -0.03;
      giver.intent.forward = 1;
      giver.send(); taker.send();
      await sleep(1000 / 30);
    }
    giver.intent.forward = 0;
    for (let i = 0; i < 6; i++) { giver.send(); taker.send(); await sleep(1000 / 30); }
    check('the giver walked over to them',
      gap() <= SOCIAL.giveRange,
      `${started.toFixed(2)} m -> ${gap().toFixed(2)} m, giveRange ${SOCIAL.giveRange}`);

    // ── the gift ──
    giver.intent.give = 'Eachann';
    giver.intent.giveItem = 'arrow';
    for (let i = 0; i < 8; i++) { giver.send(); taker.send(); await sleep(1000 / 30); }
    giver.intent.give = '';
    giver.intent.giveItem = '';
    for (let i = 0; i < 20; i++) { giver.send(); taker.send(); await sleep(1000 / 30); }
    await sleep(400);

    const after = { giver: giver.pack(), taker: taker.pack() };
    const gave = (before.giver.arrow ?? 0) - (after.giver.arrow ?? 0);
    const got = (after.taker.arrow ?? 0) - (before.taker.arrow ?? 0);

    check('THE GIVER LOST SOMETHING', gave > 0,
      `${before.giver.arrow ?? 0} -> ${after.giver.arrow ?? 0} arrows`);
    check('THE TAKER GAINED IT', got > 0,
      `${before.taker.arrow ?? 0} -> ${after.taker.arrow ?? 0} arrows`);

    // The one that matters. An item you can print is the bug a shared world
    // never recovers from, and crediting before debiting is the easy way to
    // write it.
    const totalAfter = (after.giver.arrow ?? 0) + (after.taker.arrow ?? 0);
    check('AND NOTHING WAS MINTED — the total is conserved',
      totalAfter === totalBefore,
      `${totalBefore} before, ${totalAfter} after`);

    check('one press hands over ONE thing, not the whole stack',
      gave === 1 && got === 1, `gave ${gave}, got ${got}`);

    // Both ends need to know, and a watcher wants to see it.
    const gift = [...giver.events, ...taker.events].find((e) => e.k === 'gift');
    check('the world announced it', !!gift,
      gift ? JSON.stringify(gift) : 'no gift event on either socket');

    // ── and the refusals, which must be quiet but real ──
    const midGiver = giver.pack();
    giver.intent.give = 'Nobody At All';
    giver.intent.giveItem = 'arrow';
    for (let i = 0; i < 8; i++) { giver.send(); await sleep(1000 / 30); }
    giver.intent.give = '';
    for (let i = 0; i < 10; i++) { giver.send(); await sleep(1000 / 30); }
    await sleep(300);
    check('giving to a name that is not there costs nothing',
      (giver.pack().arrow ?? 0) === (midGiver.arrow ?? 0),
      `${midGiver.arrow ?? 0} -> ${giver.pack().arrow ?? 0}`);

    giver.close();
    taker.close();
    await sleep(200);
  } finally {
    stop();
    await sleep(300);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  could not run: ${err.message}\n`);
  process.exit(1);
});
