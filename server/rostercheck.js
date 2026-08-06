// ── rostercheck.js ──────────────────────────────────────────────────────────
// Does the server hold a FULL HOUSE, and what does it cost?
//
//   npm run rostercheck            twelve players
//   node server/rostercheck.js 8091 16
//
// MAX_PLAYERS was 8, shared between people and agents — six models plus a
// human plus one spare, which is not a roster, it is a queue. Raising a
// constant is easy and proves nothing, so this puts a full house on a real
// server, drives every one of them over a real socket, and MEASURES what the
// evening will actually cost:
//
//   TICK RATE     read from the snapshot's own tick number against the wall
//                 clock, from a client's seat. A server that has fallen to 40
//                 Hz is a world running slow for everybody in it, and nothing
//                 in the game says so out loud.
//   SNAPSHOT SIZE per client, per second. Every player is in everybody else's
//                 snapshot, so this grows with the SQUARE of the roster and is
//                 the number that decides where the real ceiling is.
//   NOBODY LOST   twelve joined and twelve are still there at the end, each
//                 hearing from the server.
//
// The point is the numbers, so they are printed whatever the verdict.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Agent } from '../src/net/agent.js';
import { makeRandom } from '../src/world/noise.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8091);
const HOUSE = Number(process.argv[3] ?? 12);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// Everybody hunts. The heaviest thing a body does — perception, ballistics, an
// arc walked against the timber every tick — so this is a pessimistic house
// rather than twelve players standing still.
const alwaysHunt = { name: 'always-hunt', async decide() { return { kind: 'hunt', quarry: 'a deer' }; } };

async function main() {
  console.log(`\n  Does the server hold ${HOUSE} of them at once?\n`);
  await requireFreePort(PORT, 'rostercheck');

  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'no-bears', MINDS_HUNTERS: '0' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  // ── fill the house ────────────────────────────────────────────────────────
  const agents = [];
  for (let i = 0; i < HOUSE; i++) {
    let a = null;
    for (let attempt = 0; attempt < 40 && !a; attempt++) {
      await sleep(i === 0 ? 150 : 60);
      a = await new Agent({
        name: `Player${i + 1}`,
        provider: alwaysHunt,
        rand: makeRandom(`roster:${i}`),
      }).connect(URL).catch(() => null);
    }
    if (a) agents.push(a);
  }
  check(`all ${HOUSE} of them got in`, agents.length === HOUSE,
    `${agents.length} joined — the cap was 8 before today`);
  if (!agents.length) throw new Error('nobody could join');

  await sleep(800);

  // ── drive them, and watch the wire ────────────────────────────────────────
  //
  // Bytes are counted on the socket itself rather than estimated from the
  // object: what matters is what actually crosses, and `Agent` decodes and
  // throws the frame away.
  let bytes = 0;
  let frames = 0;
  for (const a of agents) {
    const inner = a.ws.onmessage;
    a.ws.onmessage = (ev) => {
      bytes += ev.data?.byteLength ?? ev.data?.length ?? 0;
      frames++;
      inner(ev);
    };
  }

  const firstTick = agents[0].snapshot?.t ?? 0;
  const t0 = Date.now();
  const RUN = 30_000;
  while (Date.now() - t0 < RUN) {
    for (const a of agents) a.update(1 / 30);
    await sleep(1000 / 30);
  }
  const secs = (Date.now() - t0) / 1000;
  const lastTick = agents[0].snapshot?.t ?? firstTick;

  // ── what it cost ──────────────────────────────────────────────────────────
  const hz = (lastTick - firstTick) / secs;
  const perClient = bytes / agents.length / secs / 1024;
  const snapsPerSec = frames / agents.length / secs;

  console.log(`\n      ${agents.length} players · ${secs.toFixed(0)} s`);
  console.log(`      server tick        ${hz.toFixed(1)} Hz  (the simulation runs at 60)`);
  console.log(`      snapshots heard    ${snapsPerSec.toFixed(1)} /s per client  (sent at 20)`);
  console.log(`      down the wire      ${perClient.toFixed(1)} KB/s per client, ` +
    `${(perClient * agents.length).toFixed(0)} KB/s total\n`);

  // Half rate is the line: below it the world is visibly slow and everything
  // timed in ticks — hunger, fire, the clock — runs late for everybody.
  check('the world still runs at something like full speed', hz > 45,
    `${hz.toFixed(1)} Hz with a full house`);
  check('every client is still being told what is happening', snapsPerSec > 12,
    `${snapsPerSec.toFixed(1)} snapshots a second each`);
  // smoketest measures 23 KB/s for three players. Every player is in everybody
  // else's snapshot, so this grows with the square of the roster: the number to
  // watch when somebody asks for thirty-two.
  check('and the wire is not the thing that breaks first', perClient < 120,
    `${perClient.toFixed(1)} KB/s each`);

  const alive = agents.filter((a) => a.connected && a.snapshot);
  check('NOBODY WAS DROPPED', alive.length === agents.length,
    `${alive.length}/${agents.length} still connected and hearing from the server`);

  // Everybody sees everybody: the roster is one world, not N private ones.
  const seen = agents.map((a) => (a.snapshot?.pl ?? []).length);
  check('and they are all in the same world', Math.min(...seen) >= agents.length - 1,
    `each sees ${Math.min(...seen)}-${Math.max(...seen)} others of a possible ${agents.length - 1}`);

  for (const a of agents) a.close();
  stop();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n  rostercheck could not run: ${err.message}\n`);
  process.exit(1);
});
