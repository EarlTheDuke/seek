// ── inventorycheck.js ───────────────────────────────────────────────────────
// Is the pack trustworthy? For FIVE kinds of thing, over a real socket, with a
// second pair of eyes watching.
//
//   npm run inventorycheck
//
// WHY A SIXTH CHECK ROUND DROPPING. `dropcheck` proves the mechanism once, for
// one item — an arrow. That is the right shape for "does the server read the
// `drop` field at all", and it is not enough for "can I trust my pack": every
// assertion in it would still pass if the server dropped the WRONG thing, as
// long as the wrong thing was also an arrow.
//
// So this one runs a full round trip PER ITEM — wood, arrow, venison, hide,
// stone — and asks four questions of each:
//
//   1. the RIGHT id is on the ground (not "something is")
//   2. the right count left the pack, in `me.iv`, which is the number a
//      player's own hotbar is drawn from
//   3. picking it up puts it back
//   4. A SECOND CONNECTED CLIENT SEES THE SAME THING IN THE SAME PLACE
//
// Four is the one that cannot be faked in-process and is the reason this file
// drives sockets. A shared world where half the objects exist in one browser is
// not a shared world, and that was the state of dropping for months.
//
// AND IT ASSERTS OUTCOMES. `lootcheck` was green for months over a path no
// caller could reach, because it built its goal by hand instead of going
// through `sanitiseGoal`. Nothing here is built by hand: the items arrive
// through STOCK, the slot is chosen through `selectSlot`, the drop through
// `drop`, the pickup through `interact`, and every reading is taken from a
// snapshot rather than from the server's own memory.
//
// THE SLOT INDEX IS COMPUTED THE WAY THE HOTBAR COMPUTES IT — by feeding
// `me.iv` to the real `Inventory.applyRemote` — and not by counting on my
// fingers. If the server's slot order and the browser's ever part company, the
// wrong item drops and this says so, which is exactly the failure Ben reported
// and worth being able to catch a second way.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROTOCOL_VERSION, C_HELLO, C_INTENT, S_WELCOME, S_SNAPSHOT,
  encode, decode,
} from '../src/net/protocol.js';
import { Inventory } from '../src/items/inventory.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8141);
const URL = `ws://127.0.0.1:${PORT}`;

// Everybody arrives carrying these, so the check does not have to hunt a deer
// to find out whether venison can be put down. `arrow` is in the starting kit
// already and `bow` is deliberately absent from the list — it cannot be
// dropped, which is dropcheck's business.
const STOCK = 'wood:3,venison:2,hide:2,stone:3';
const TRY = ['wood', 'arrow', 'venison', 'hide', 'stone'];

// Only these two can be picked up off the seed-generated world. Deadfall is
// wood and quivers are arrows, so pressing E near either may hand you MORE than
// you put down — through no fault of the drop. Stated here rather than
// discovered as a flake at two in the morning.
const FREE_IN_THE_WORLD = new Set(['wood', 'arrow']);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A raw socket with a name. Same shape as dropcheck's, on purpose. */
class Body {
  constructor(name) {
    this.name = name;
    this.id = null;
    this.me = null;
    this.lo = [];
    this.events = [];
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
          for (const e of msg.data.ev ?? []) this.events.push(e);
        }
      };
    });
  }

  pack() { return this.me?.iv ?? {}; }
  countOf(id) { return this.pack()[id] ?? 0; }
  send() { if (this.ws.readyState === 1) this.ws.send(encode(C_INTENT, { i: this.intent })); }
  close() { try { this.ws.close(); } catch { /* going anyway */ } }

  /**
   * Which hotbar slot holds `id`, worked out the way the browser works it out.
   *
   * The REAL `Inventory`, fed the REAL `me.iv`. A hand-rolled "bow is 0, arrow
   * is 1, then STOCK in order" would be a fixture written from the same guess
   * as the code, which ratifies rather than tests.
   */
  slotOf(id) {
    const inv = new Inventory();
    inv.applyRemote({ ...this.pack() });
    return inv.slots.findIndex((s) => s.item === id);
  }
}

/** Drive both sockets for `frames` frames at the client's own cadence. */
async function spin(bodies, frames) {
  for (let i = 0; i < frames; i++) {
    for (const b of bodies) b.send();
    await sleep(1000 / 30);
  }
}

/** Hold a pulse field down long enough that a 20 Hz server cannot miss it. */
async function pulse(bodies, actor, field, value = true) {
  actor.intent[field] = value;
  await spin(bodies, 5);
  actor.intent[field] = field === 'selectSlot' ? -1 : false;
  await spin(bodies, 5);
}

async function main() {
  console.log('\n  Can you trust your pack? Five kinds of thing, two pairs of eyes.\n');
  await requireFreePort(PORT, 'inventorycheck');
  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    stdio: 'ignore', env: { ...process.env, DANGER: 'none', STOCK },
  });

  try {
    let actor = null;
    for (let i = 0; i < 40 && !actor; i++) {
      await sleep(150);
      actor = await new Body('Mairi').connect(URL).catch(() => null);
    }
    if (!actor) throw new Error(`no server answered on ${URL}`);
    const witness = await new Body('Seonaid').connect(URL);
    for (let i = 0; i < 40 && !(actor.me && witness.me); i++) await sleep(100);
    await sleep(500);

    check('two people are on the wire', actor.id !== null && witness.id !== null,
      `#${actor.id} and #${witness.id}`);

    const stocked = TRY.filter((id) => actor.countOf(id) > 0);
    check('the pack arrives holding all five kinds',
      stocked.length === TRY.length,
      `${JSON.stringify(actor.pack())} — STOCK=${STOCK}`);
    if (stocked.length !== TRY.length) {
      throw new Error(`nothing to test with: only ${stocked.join(', ')} arrived`);
    }

    // The total across both packs and the ground, for the conservation line at
    // the end. Counted once at the start and once at the finish, per item.
    const onGround = (id) => actor.lo.filter((l) => l.i === id).reduce((n, l) => n + l.n, 0);
    const worldTotal = (id) => actor.countOf(id) + witness.countOf(id) + onGround(id);
    const totalsBefore = Object.fromEntries(TRY.map((id) => [id, worldTotal(id)]));

    for (const id of TRY) {
      console.log(`\n  ── ${id} ──`);
      const slot = actor.slotOf(id);
      const heldBefore = actor.countOf(id);
      const idsBefore = new Set(actor.lo.map((l) => l.d));

      // ── choose it, the way pressing a number key does ──
      await pulse([actor, witness], actor, 'selectSlot', slot);
      // ── and put it down ──
      await pulse([actor, witness], actor, 'drop');
      await spin([actor, witness], 20); // it has to fall and settle
      await sleep(300);

      const fresh = actor.lo.filter((l) => !idsBefore.has(l.d));
      const mine = fresh.find((l) => l.i === id) ?? null;

      // 1 — THE RIGHT THING IS ON THE GROUND. Not "something is".
      check(`  ${id}: the RIGHT id is on the ground`,
        mine !== null,
        mine
          ? `#${mine.d} is ${mine.n} ${mine.i} (slot ${slot})`
          : `slot ${slot} put down ${JSON.stringify(fresh.map((l) => `${l.n} ${l.i}`))}`
          + ' — THIS IS THE "it looks like an arrow" FAILURE');
      if (!mine) continue;

      // 2 — AND THE RIGHT COUNT LEFT THE PACK, read from `me.iv`, which is the
      //     number the hotbar is drawn from.
      const heldAfter = actor.countOf(id);
      check(`  ${id}: the right count left the pack`,
        heldBefore - heldAfter === mine.n,
        `${heldBefore} -> ${heldAfter} in the pack, ${mine.n} on the ground`);

      // 4 — AND SOMEBODY ELSE SEES IT, in the same place. The whole reason this
      //     file drives two sockets.
      const theirs = witness.lo.find((l) => l.d === mine.d) ?? null;
      const apart = theirs
        ? Math.hypot(theirs.p[0] - mine.p[0], theirs.p[1] - mine.p[1], theirs.p[2] - mine.p[2])
        : Infinity;
      check(`  ${id}: THE OTHER PLAYER SEES THE SAME ONE, IN THE SAME SPOT`,
        theirs !== null && theirs.i === id && theirs.n === mine.n && apart < 0.05,
        theirs
          ? `#${theirs.d} ${theirs.n} ${theirs.i}, ${apart.toFixed(3)} m apart`
          : `they see ${JSON.stringify(witness.lo.map((l) => `${l.n} ${l.i}`))}`);

      // 3 — AND PICKING IT UP PUTS IT BACK. It landed 1.1 m in front and the
      //     reach is 2.2, so E without walking.
      await pulse([actor, witness], actor, 'interact');
      await spin([actor, witness], 10);
      await sleep(300);

      const heldBack = actor.countOf(id);
      const stillThere = actor.lo.some((l) => l.d === mine.d);
      // Deadfall is wood and quivers are arrows, so E near either can hand you
      // MORE than you put down. That is the world being generous, not the drop
      // being wrong — so those two are allowed to come back up, and the rest
      // must land on the nose.
      const restored = FREE_IN_THE_WORLD.has(id)
        ? heldBack >= heldBefore
        : heldBack === heldBefore;
      check(`  ${id}: and picking it up puts it back`,
        restored && !stillThere,
        `${heldAfter} -> ${heldBack} (started at ${heldBefore})`
        + `${stillThere ? ', BUT IT IS STILL ON THE GROUND' : ', and it is off the ground'}`
        + `${FREE_IN_THE_WORLD.has(id) ? ' — >= because the valley has free ones lying about' : ''}`);
    }

    // ── AND A REFUSAL SAYS SOMETHING ─────────────────────────────────────────
    //
    // Both early returns in `resolveDrop` were silent, and the bow one fires on
    // the DEFAULT press because the bow is slot one — so the commonest possible
    // first experience of the drop key was nothing whatsoever. It cost this
    // very session an hour: a run hunting the drop bug fell into it, watched
    // `me.iv` not move, and wrote up a working server as broken. A refusal that
    // says nothing does not just fail the player, it manufactures evidence.
    console.log('\n  ── and pressing Q on the bow says so ──');
    {
      const bowSlot = actor.slotOf('bow');
      const packBefore = JSON.stringify(actor.pack());
      actor.events.length = 0;
      await pulse([actor, witness], actor, 'selectSlot', bowSlot);
      await pulse([actor, witness], actor, 'drop');
      await spin([actor, witness], 10);
      await sleep(300);

      const refusals = actor.events.filter((e) => e.k === 'nodrop' && e.by === actor.id);
      check('the bow refusal SPEAKS instead of returning in silence',
        refusals.length > 0 && /bow/i.test(refusals[0]?.why ?? ''),
        refusals.length
          ? `"${refusals[0].why}"`
          : 'nothing was said — this is the silence that cost a session an hour');
      check('  …and it really did keep the bow',
        JSON.stringify(actor.pack()) === packBefore,
        `${packBefore} -> ${JSON.stringify(actor.pack())}`);
    }

    // ── AND NOTHING WAS MINTED, over all five round trips ──
    //
    // The assertion that carries the file, same as dropcheck's. Wood and arrows
    // are allowed to have GROWN, because pressing E can also lift a branch the
    // seed put there; nothing may ever have shrunk, and nothing else may move
    // at all.
    console.log('');
    for (const id of TRY) {
      const now = worldTotal(id);
      const was = totalsBefore[id];
      const ok = FREE_IN_THE_WORLD.has(id) ? now >= was : now === was;
      check(`nothing was minted: ${id}`, ok,
        `${was} before, ${now} after (both packs plus the ground)`);
    }

    actor.close();
    witness.close();
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
  console.error(`\n  inventorycheck could not run: ${err.stack}\n`);
  process.exit(1);
});
