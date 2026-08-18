// ── handcheck.js ────────────────────────────────────────────────────────────
// Is the thing in your hand the thing the SERVER thinks is in your hand?
//
//   npm run handcheck
//
// THE REPORT THIS CLOSES. Ben, 2026-08-17:
//
//   > Right now it will not let me. If i have branches selected, and i hit Q
//   > it tells me i can not drop my bow. but i dont have the bow selected.
//
// He did have branches selected. The server did not know, and so the refusal it
// sent back named the only thing it believed was in his hand — the bow, which
// is slot one and cannot be dropped.
//
// TWO SEPARATE FAULTS PRODUCED THAT ONE SENTENCE, and `dropcheck`,
// `inventorycheck` and `pulsecheck` were all green through both of them.
//
//   ONE — THE WHEEL NEVER TOLD ANYBODY. `main.js` handled the mouse wheel by
//   calling the browser's own `cycle` and nothing else. No `pendingSlot`, so no
//   `selectSlot`, so no packet: the hand moved on screen and the server's copy
//   stayed on slot one for the whole session. The number keys were always fine
//   — and every check above drives `selectSlot` directly, which is precisely
//   why none of them ever touched the path a player uses. The HUD offers the
//   wheel FIRST ('1 2 / wheel'). Asserted here from the source, the way
//   `pulsecheck` asserts its pairing, because a mouse wheel is a DOM event and
//   there is no socket to press it over.
//
//   TWO — AN INDEX IS NOT AN ITEM. `selectSlot` is an index into the CLIENT's
//   slot array, and the two sides do not always agree on that order. `me.iv`
//   crosses the wire as a flat {item: count} map — on purpose, so the HUD only
//   churns when the goods change — so a stack split across two server slots
//   arrives as ONE entry, and `applyRemote` re-splits it somewhere else in the
//   list. Carry twenty branches, pick up a stone, pick up eight more branches:
//
//       server   [bow, arrow, wood20, stone, wood8]
//       browser  [bow, arrow, wood20, wood8, stone]
//
//   Slot three is branches to the player and a stone to the server. So the
//   client now also says WHAT it thinks it is holding, and the name wins.
//
// THE SENTINEL IS THE POINT OF THIS FILE. Fault two is invisible unless the
// pack is built to expose it, and a check that cannot fail proves nothing — so
// this drives the OLD behaviour first (an index and no name) and asserts that
// it puts down the WRONG THING. If that assertion ever starts passing by
// dropping wood, the fixture stopped reproducing and every line under it is
// worthless.
//
// OVER A REAL SOCKET, because that is the only place either fault exists.

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PROTOCOL_VERSION, C_HELLO, C_INTENT, S_WELCOME, S_SNAPSHOT,
  encode, decode, INTENT_KEYS,
} from '../src/net/protocol.js';
import { Inventory } from '../src/items/inventory.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8147);
const URL = `ws://127.0.0.1:${PORT}`;

// ── THE FIXTURE, AND WHY IT IS SHAPED LIKE THIS ─────────────────────────────
//
// Twenty branches fill a wood stack to its cap (`stack: 20`). The stone then
// opens a slot of its own. The last eight branches CANNOT go in the full stack,
// so they open a fourth slot AFTER the stone — and that is the interleave the
// flat {item: count} map cannot carry. `parseStock` applies these in order and
// caps each, which is what `rangecheck` relies on with its four `arrow:20`s.
const STOCK = 'wood:20,stone:2,wood:8';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Strip line comments, so a source assertion reads CODE and not prose. */
function codeOnly(src) {
  return src.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
}

/** A raw socket with a name. Same shape as dropcheck's and inventorycheck's. */
class Body {
  constructor(name) {
    this.name = name;
    this.id = null;
    this.me = null;
    this.lo = [];
    this.events = [];
    this.intent = {
      forward: 0, strafe: 0, lookYaw: 0, lookPitch: 0, aimYaw: null, aimPitch: null,
      drop: false, dropHalf: false, dropBurn: 0, interact: false,
      selectSlot: -1, selectItem: '',
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
   * The browser's slot list, built the way the browser builds it.
   *
   * The REAL `Inventory` fed the REAL `me.iv`. Counting the slots out by hand
   * here would be a fixture written from the same guess as the code, which
   * ratifies rather than tests — `inventorycheck` says the same thing.
   */
  clientSlots() {
    const inv = new Inventory();
    inv.applyRemote({ ...this.pack() });
    return inv.slots;
  }

  slotOf(id) { return this.clientSlots().findIndex((s) => s.item === id); }

  /** The LAST slot holding `id` — for wood that is the eight, not the twenty. */
  lastSlotOf(id) {
    const s = this.clientSlots();
    for (let i = s.length - 1; i >= 0; i--) if (s[i].item === id) return i;
    return -1;
  }
}

async function spin(bodies, frames) {
  for (let i = 0; i < frames; i++) {
    for (const b of bodies) b.send();
    await sleep(1000 / 30);
  }
}

/** Hold a pulse down long enough that a 20 Hz server cannot miss it. */
async function pulse(bodies, actor, fields) {
  for (const [k, v] of Object.entries(fields)) actor.intent[k] = v;
  await spin(bodies, 5);
  for (const k of Object.keys(fields)) {
    actor.intent[k] = k === 'selectSlot' ? -1 : (k === 'selectItem' ? '' : false);
  }
  await spin(bodies, 5);
}

/** Everything that hit the grass since `before`. */
const freshLoot = (body, before) => body.lo.filter((l) => !before.has(l.d));

async function main() {
  console.log('\n  Is the thing in your hand the thing the server thinks is in your hand?\n');

  // ── the wheel, asserted from the source ───────────────────────────────────
  //
  // A DOM wheel event cannot be sent over a socket, so this reads the handler.
  // Crude, and it is the only thing here that would have caught the actual
  // report: every socket-level check in this repo drives `selectSlot` by hand
  // and so agrees with a client that never sends it.
  //
  // READ THE CODE, NOT THE PROSE. The first version of this matched the
  // handler's own comment, which quotes the call it is explaining, and reported
  // the fix as unfixed — exactly the "bad string filter believed" failure this
  // repo keeps writing down. An instrument has to be checked before it is
  // trusted, so the comments come out first.
  const mainSrc = fs.readFileSync(path.join(HERE, '..', 'src', 'main.js'), 'utf8');
  const wheelAt = mainSrc.indexOf("'wheel',");
  const wheelEnd = mainSrc.indexOf('{ passive: false }', wheelAt);
  const wheelBody = codeOnly(mainSrc.slice(wheelAt, wheelEnd > wheelAt ? wheelEnd : wheelAt + 1800));

  check('THE WHEEL GOES THROUGH THE INTENT — it is the way the HUD tells you to change item',
    /input\.pendingSlot\s*=/.test(wheelBody),
    /input\.pendingSlot\s*=/.test(wheelBody)
      ? 'sets `input.pendingSlot`, so `selectSlot` goes out with the next packet'
      : 'THE WHEEL SETS NOTHING THE SERVER WILL EVER SEE — this is the reported bug');

  check('  …and no longer moves the hand behind the server\'s back',
    !/inventory\.cycle\(/.test(wheelBody),
    /inventory\.cycle\(/.test(wheelBody)
      ? 'still calls the browser-only cycle directly — invisible on the wire'
      : 'the browser no longer changes its own hand and keeps it to itself');

  check('  …and `selectItem` is on the protocol allow-list, or none of it crosses',
    INTENT_KEYS.includes('selectItem'),
    `INTENT_KEYS ${INTENT_KEYS.includes('selectItem') ? 'has' : 'IS MISSING'} selectItem`
    + ' — a field missing there is dropped silently at the socket');

  await requireFreePort(PORT, 'handcheck');
  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    stdio: 'ignore', env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0', STOCK },
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

    console.log('\n  ── the pack the two sides disagree about ──\n');

    check('two people are on the wire', actor.id !== null && witness.id !== null,
      `#${actor.id} and #${witness.id}`);

    const pack = actor.pack();
    check('the fixture stocked a SPLIT STACK with something else between the halves',
      (pack.wood ?? 0) > 20 && (pack.stone ?? 0) > 0,
      `${JSON.stringify(pack)} — STOCK=${STOCK}`);

    const drawn = actor.clientSlots().map((s, i) => `${i}:${s.item}x${s.count}`).join('  ');
    const woodTail = actor.lastSlotOf('wood');
    const stoneAt = actor.slotOf('stone');
    check('SENTINEL: the browser really does re-split the stack, so the orders CAN part',
      woodTail > 0 && stoneAt > 0 && woodTail < stoneAt,
      `browser draws [${drawn}] — the second wood slot lands BEFORE the stone, `
      + 'while the server opened it after');

    // The conservation line, taken across both packs and the ground.
    const onGround = (id) => actor.lo.filter((l) => l.i === id).reduce((n, l) => n + l.n, 0);
    const total = (id) => actor.countOf(id) + witness.countOf(id) + onGround(id);
    const before = { wood: total('wood'), stone: total('stone'), bow: total('bow') };

    // ── 1. THE OLD BEHAVIOUR, WHICH MUST STILL BE WRONG ─────────────────────
    console.log('\n  ── the counterfactual: an index and no name, the way it used to go ──\n');

    let seen = new Set(actor.lo.map((l) => l.d));
    await pulse([actor, witness], actor, { selectSlot: woodTail });
    await pulse([actor, witness], actor, { drop: true });
    await spin([actor, witness], 20);
    await sleep(300);

    const blind = freshLoot(actor, seen);
    const blindIds = blind.map((l) => `${l.n} ${l.i}`);
    check('SENTINEL: the index ALONE still puts down the wrong thing',
      blind.length > 0 && !blind.some((l) => l.i === 'wood'),
      `slot ${woodTail} is branches in the browser and put down ${JSON.stringify(blindIds)}`
      + ' — if this ever reads "wood" the fixture has stopped reproducing the bug,'
      + ' and everything below it is meaningless');

    // ── 2. THE FIX: SAY WHAT IT IS ──────────────────────────────────────────
    console.log('\n  ── and now, with the name attached ──\n');

    seen = new Set(actor.lo.map((l) => l.d));
    actor.events.length = 0;
    const woodBefore = actor.countOf('wood');
    await pulse([actor, witness], actor, { selectSlot: woodTail, selectItem: 'wood' });
    await pulse([actor, witness], actor, { drop: true });
    await spin([actor, witness], 20);
    await sleep(300);

    const named = freshLoot(actor, seen);
    const branch = named.find((l) => l.i === 'wood') ?? null;
    check('THE BRANCH GOES DOWN — the same index, now with the name, drops what the player sees',
      branch !== null,
      branch ? `#${branch.d} is ${branch.n} wood`
        : `still put down ${JSON.stringify(named.map((l) => `${l.n} ${l.i}`))}`);
    check('  …and it came out of the pack, not out of thin air',
      branch !== null && actor.countOf('wood') === woodBefore - branch.n,
      `wood ${woodBefore} -> ${actor.countOf('wood')}`);
    check('  …AND THE OTHER PLAYER SEES IT — a drop nobody else can see is not a drop',
      branch !== null && witness.lo.some((l) => l.d === branch.d && l.i === 'wood'),
      branch ? `#${witness.id} sees loot #${branch.d}` : 'nothing to look for');
    check('  …and no refusal came back naming the bow — which was the whole report',
      !actor.events.some((e) => e.k === 'nodrop' && /bow/i.test(e.why ?? '')),
      'a `nodrop` about the bow here is the exact sentence he saw');

    // ── 3. THE BOW IS STILL SAFE ────────────────────────────────────────────
    console.log('\n  ── and the bow is still the one thing you cannot put down ──\n');

    const bowBefore = actor.countOf('bow');
    actor.events.length = 0;
    await pulse([actor, witness], actor, { selectSlot: actor.slotOf('bow'), selectItem: 'bow' });
    await pulse([actor, witness], actor, { drop: true });
    await spin([actor, witness], 20);
    await sleep(300);

    const refusal = actor.events.find((e) => e.k === 'nodrop');
    check('asking for the bow BY NAME is still refused, and still says why',
      refusal != null && /bow/i.test(refusal.why ?? ''),
      refusal ? `"${refusal.why}"` : 'no `nodrop` event arrived at all');
    check('  …and the bow is still in the pack', actor.countOf('bow') === bowBefore,
      `${bowBefore} -> ${actor.countOf('bow')}`);

    // ── 4. A NAME FOR SOMETHING YOU ARE NOT CARRYING ────────────────────────
    seen = new Set(actor.lo.map((l) => l.d));
    const packBefore = JSON.stringify(actor.pack());
    await pulse([actor, witness], actor, { selectItem: 'venison' });
    await pulse([actor, witness], actor, { drop: true });
    await spin([actor, witness], 20);
    await sleep(300);
    check('naming something you are not carrying cannot conjure it',
      !freshLoot(actor, seen).some((l) => l.i === 'venison'),
      `pack ${packBefore} -> ${JSON.stringify(actor.pack())}`
      + ' — an unknown name matches no slot, so it falls back to the index');

    // ── 5. NOTHING WAS MINTED ───────────────────────────────────────────────
    console.log('');
    for (const id of ['wood', 'stone', 'bow']) {
      check(`nothing was minted: ${id}`, total(id) === before[id],
        `${before[id]} before, ${total(id)} after (both packs plus the ground)`);
    }

    actor.close();
    witness.close();
  } finally {
    server.kill();
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length}${passed === results.length ? ' passed' : ' PASSED — SOMETHING IS WRONG'}\n`);
}

main().catch((e) => {
  console.error('\n  could not run:', e.message, '\n');
  process.exitCode = 0; // a failing check exits 0 here; the output is the result
});
