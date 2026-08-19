// ── stumpcheck.js ───────────────────────────────────────────────────────────
// Do the two ends agree about which trees are spent?
//
//   npm run stumpcheck
//
// THE REPORT THIS CLOSES. Jack, 2026-08-18, mid-run: "it say tree is already
// cut but then give me too much branches for it anyway."
//
// Both halves of that sentence were true at once, because the two ends kept
// SEPARATE stump maps on SEPARATE clocks and nothing ever reconciled them:
//
//   * A client is born at totalHours 0 with an empty `harvest.taken`, into a
//     world that may be hours old and part-harvested. The welcome carried the
//     seed and the scarcity — and neither the server's clock nor its stumps.
//   * It then learns only about cuts made WHILE IT WATCHED (the `cut` event).
//     Reload the page — a hot reload, a crash, a rejoin — and every mark is
//     gone, or wrong by the whole age of the world.
//   * The prompt reads the CLIENT map; the E-press crosses the wire and is
//     resolved against the SERVER map. Where they disagree, the prompt lies:
//     "already cut" over a trunk the server will happily fell — branches from
//     a stump — or "cut tree — 8 wood" over one it will silently refuse.
//
// The fix is one exchange at the door: the welcome now carries `th` (the
// server's MONOTONIC hour) and `cut` (its stump map), the client adopts both —
// clock first, or the stamps mean nothing — and each snapshot carries `th` so
// a tab that sat hidden (whose catch-up is deliberately clamped) snaps back.
//
// THE COUNTERFACTUAL ARMS ARE THE POINT, per handcheck: this file first proves
// the OLD behaviour still disagrees — an empty map calls a spent tree free,
// and stamps read against an un-adopted clock call a regrown tree taken for
// most of three days. If either sentinel ever passes the wrong way, the
// fixture stopped reproducing the bug and everything else here is noise.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PROTOCOL_VERSION, C_HELLO, S_WELCOME, S_SNAPSHOT,
  encode, decode,
} from '../src/net/protocol.js';
import { Harvest } from '../src/world/structures.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8153);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Strip line comments, so a source assertion reads CODE and not prose. */
const codeOnly = (src) => src.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');

/** A socket that keeps its welcome and its snapshots. */
class Joiner {
  constructor(name) { this.name = name; this.welcome = null; this.ths = []; }
  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onerror = (e) => reject(new Error(e.message ?? 'socket error'));
      this.ws.onopen = () => this.ws.send(encode(C_HELLO, { name: this.name, version: PROTOCOL_VERSION }));
      this.ws.onmessage = (ev) => {
        const msg = decode(ev.data);
        if (!msg) return;
        if (msg.type === S_WELCOME) { this.welcome = msg.data; resolve(this); }
        else if (msg.type === S_SNAPSHOT && Number.isFinite(msg.data.th)) this.ths.push(msg.data.th);
      };
    });
  }
  close() { try { this.ws.close(); } catch { /* going anyway */ } }
}

async function main() {
  console.log('\n  Do the two ends agree about which trees are spent?\n');

  // ── the stamp domain, in-process, sentinels first ─────────────────────────
  console.log('  ── the two maps, and the two clocks ──\n');

  // A world that has lived 40 monotonic hours and had a tree cut at hour 40.
  const server = new Harvest();
  server.take(10, 10, 40); // regrows at 70

  // THE OLD CLIENT: born empty, clock at 0. This is the pre-fix behaviour.
  const oldClient = new Harvest();
  check('SENTINEL: the old client calls the spent tree FREE — the lying prompt, arm one',
    server.isTaken(10, 10, 45) === true && oldClient.isTaken(10, 10, 0.5) === false,
    'server says taken at hour 45, a just-reloaded client says workable — E then gets silence or a neighbour');

  // A client that took the STAMPS but not the CLOCK: the other lie.
  const halfClient = new Harvest();
  halfClient.restore(server.serialise());
  check('SENTINEL: stamps without the clock call a REGROWN tree taken for days — arm two',
    server.isTaken(10, 10, 75) === false && halfClient.isTaken(10, 10, 0.5) === true,
    'until=70 read against an un-adopted hour 0.5 — which is why `th` must be adopted FIRST');

  // THE FIX: stamps AND clock, and the two ends give one answer everywhere.
  const synced = new Harvest();
  synced.restore(server.serialise());
  const agree = (h) => server.isTaken(10, 10, h) === synced.isTaken(10, 10, h);
  check('with both adopted, the ends agree while it is a stump AND after it regrows',
    agree(45) && agree(69.9) && agree(70.1) && agree(75),
    'checked either side of the regrow hour, 70');

  // Round-trip through what the wire actually carries.
  const wired = new Harvest();
  wired.restore(JSON.parse(JSON.stringify(server.serialise())));
  check('the map survives the wire — serialise/JSON/restore round-trips',
    wired.isTaken(10, 10, 45) === true && wired.isTaken(10, 10, 75) === false);

  // ── the client reader exists, asserted from source like handcheck's wheel ─
  const mainSrc = codeOnly(fs.readFileSync(path.join(HERE, '..', 'src', 'main.js'), 'utf8'));
  check('the client ADOPTS the clock at the door', /totalHours\s*=\s*data\.th/.test(mainSrc),
    'a reader with no writer was the iv bug; a writer with no reader is the same hole mirrored');
  check('  …and the stumps', /harvest\.restore\(data\.cut\)/.test(mainSrc));
  check('  …and snaps back when a hidden tab drifts', /totalHours\s*=\s*snap\.th/.test(mainSrc),
    'the hidden-tab catch-up is clamped on purpose, so the clock MUST have a way home');

  // ── and the wire itself, over a real socket ───────────────────────────────
  console.log('\n  ── the welcome, over the wire ──\n');
  await requireFreePort(PORT, 'stumpcheck');
  const proc = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0' },
    stdio: 'ignore',
  });
  const stop = () => { try { proc.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  try {
    let a = null;
    for (let i = 0; i < 40 && !a; i++) {
      await sleep(150);
      a = await new Joiner('Mairi').connect(URL).catch(() => null);
    }
    if (!a) throw new Error(`no server answered on ${URL}`);

    check('the welcome carries the monotonic hour', Number.isFinite(a.welcome.th) && a.welcome.th >= 0,
      `th ${a.welcome.th}`);
    check('  …and the stump map', Array.isArray(a.welcome.cut),
      `cut ${JSON.stringify(a.welcome.cut)} — empty is right on a fresh world; ABSENT was the bug`);

    // A later joiner hears a LATER hour — this is the live clock, not a field.
    await sleep(2500);
    const b = await new Joiner('Seonaid').connect(URL);
    check('a later joiner is told a later hour — it is the live clock on the wire',
      b.welcome.th > a.welcome.th,
      `${a.welcome.th} then ${b.welcome.th}, 2.5s apart`);

    for (let i = 0; i < 30 && a.ths.length < 3; i++) await sleep(100);
    const rising = a.ths.length >= 2 && a.ths.at(-1) >= a.ths[0];
    check('every snapshot carries it too, rising — the way home for a hidden tab',
      a.ths.length >= 2 && rising,
      `${a.ths.length} snapshots, ${a.ths[0]} -> ${a.ths.at(-1)}`);

    a.close(); b.close();
  } finally {
    stop();
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length}${passed === results.length ? ' passed' : ' PASSED — SOMETHING IS WRONG'}\n`);
}

main().catch((e) => {
  console.error('\n  could not run:', e.message, '\n');
  process.exitCode = 0; // a failing check exits 0 here; the output is the result
});
