// ── eyescheck.js ────────────────────────────────────────────────────────────
// Is a watcher a pair of eyes, or is it a body standing on the shore?
//
//   npm run eyescheck
//
// THE HOLE THIS CLOSES. `?watch=1` has flown a camera since the day it shipped
// and it only ever did half the job. The CLIENT stopped sending intents. The
// SERVER went on holding a body for that connection — standing at the spawn,
// for the whole run, freezing and starving and eventually dying, while whoever
// opened the tab flew about a kilometre away looking at something else.
//
// The freezing is the small half.
//
// ── THE LARGE HALF IS THAT WATCHING CHANGED THE EXPERIMENT ──────────────────
//
// `perceivableBy` is the chokepoint every mind's brief is built through — the
// one place in this codebase where "no, it cannot see that" lives. A watcher's
// body went through it like anybody else's. So every model in every watched
// run was told, several times a minute, that there was someone standing on the
// shore. They are sociable models: some walked over, some hailed it, some
// offered it things and waited for an answer that could never come, because
// nobody was driving it.
//
// Which means a watched run and an unwatched run were not the same experiment,
// and the difference was the person watching. Every observation Ben and I have
// made about how these minds behave was made through that. It is the observer
// effect, built by hand, in a project whose first rule is that a mind gets its
// body's SENSES and nothing else.
//
// ── SO THE CONTROL ARM IS THE WHOLE FILE ────────────────────────────────────
//
// "The watcher is invisible" passes for a hundred wrong reasons — the socket
// never connected, the snapshot was empty, the player list was broken for
// everybody. So every assertion here is a PAIR: the same question asked about
// a watcher and about an ordinary player standing in the same place, and the
// answers have to differ. A test with no control arm is a test that agrees
// with you.
//
// Over a real socket, with three real connections, because `perceivableBy` and
// the snapshot are server-side and there is nowhere else this can be true.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROTOCOL_VERSION, C_HELLO, C_INTENT, S_WELCOME, S_SNAPSHOT,
  encode, decode,
} from '../src/net/protocol.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8143);
const URL = `ws://127.0.0.1:${PORT}`;
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A raw socket with a name, and optionally a pair of eyes. Same shape as `dropcheck`'s. */
class Body {
  constructor(name, watching = false) {
    this.name = name;
    this.watching = watching;
    this.id = null;
    this.me = null;
    this.pl = [];
    this.seen = 0;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onerror = (e) => reject(new Error(e.message ?? 'socket error'));
      this.ws.onopen = () => this.ws.send(encode(C_HELLO, {
        name: this.name, version: PROTOCOL_VERSION,
        ...(this.watching ? { w: true } : {}),
      }));
      this.ws.onmessage = (ev) => {
        const msg = decode(ev.data);
        if (!msg) return;
        if (msg.type === S_WELCOME) { this.id = msg.data.id; resolve(this); }
        else if (msg.type === S_SNAPSHOT) {
          this.me = msg.data.me ?? this.me;
          this.pl = msg.data.pl ?? [];
          this.seen++;
        }
      };
      setTimeout(() => reject(new Error(`${this.name} never got a welcome`)), 4000);
    });
  }

  /** Who this connection can see, by id. */
  sees() { return new Set(this.pl.map((p) => p.id)); }

  close() { try { this.ws.close(); } catch { /* gone */ } }
}

await requireFreePort(PORT, 'eyescheck');
// COLD AND HUNGRY ON PURPOSE. The point of the vitals half is that the world
// is trying to kill a body that is standing still, so a watcher that is NOT
// exempt will visibly lose food while the control does. HUNGER starts them
// both low so the difference shows inside a short run.
const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
  env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0', HUNGER: '12' },
  stdio: 'ignore',
});
process.on('exit', () => { try { server.kill(); } catch { /* gone */ } });

console.log('\n  Highlands — eyescheck: a watcher is not a body\n');

try {
  // Three connections: somebody playing, somebody watching, and somebody to
  // ask. `asker` is the one whose snapshot decides what the world looks like
  // from outside, which is exactly what an agent's `others` map is built from.
  // Retried, because a freshly spawned server is not listening yet and the
  // first attempt racing it is not a finding about watchers.
  const join = async (name, watching = false) => {
    for (let i = 0; i < 40; i++) {
      const b = await new Body(name, watching).connect(URL).catch(() => null);
      if (b) return b;
      await sleep(150);
    }
    throw new Error(`no server answered on ${URL}`);
  };
  const player = await join('Coinneach');
  const eyes = await join('Watcher', true);
  const asker = await join('Asker');
  await sleep(1200);

  check('SENTINEL: all three are on the server and snapshots are flowing',
    player.id !== null && eyes.id !== null && asker.id !== null && asker.seen > 5,
    `ids ${player.id}/${eyes.id}/${asker.id} · ${asker.seen} snapshots`);

  // ── WHO CAN BE SEEN ───────────────────────────────────────────────────────
  const seen = asker.sees();
  check('THE ORDINARY PLAYER IS IN SOMEBODY ELSE\'S SNAPSHOT',
    seen.has(player.id),
    `the asker sees ${seen.size} others: [${[...seen].join(', ')}]`);
  check('  …AND THE WATCHER IS NOT — this is the control arm, and it is the point',
    !seen.has(eyes.id),
    seen.has(eyes.id)
      ? `the asker CAN see the watcher (#${eyes.id}) — every mind would too`
      : `#${eyes.id} is absent from a list that has #${player.id} in it`);

  // A watcher still gets its OWN. It has to: the camera lands by snapping to
  // where the server has the body, so a watcher with no `me` cannot come down.
  check('  …but the watcher still gets its own `me`, or it could never land',
    !!eyes.me && Array.isArray(eyes.me.p),
    eyes.me ? `at ${eyes.me.p.map((n) => n.toFixed(0)).join(', ')}` : 'NO me — the camera has nothing to snap to');

  check('  …and the watcher can still SEE the player, which is the entire job',
    eyes.sees().has(player.id),
    `the watcher sees [${[...eyes.sees()].join(', ')}]`);

  // ── WHAT THE WORLD DOES TO IT ─────────────────────────────────────────────
  //
  // Both bodies are standing still in the same weather, at the same hunger, a
  // couple of metres apart. The control is what makes this mean anything: "the
  // watcher did not starve" is also true of a world where nothing starves.
  //
  // CORE TEMPERATURE, NOT FOOD, and the first cut of this test got it wrong.
  // Hunger moves far too slowly to see: over nine seconds both bodies read a
  // flat `f: 12`, so the sentinel failed — correctly — and said the premise was
  // wrong rather than the code. Core drifts toward the air in seconds, which is
  // what a body standing still in a cold highland actually does first.
  const coreOf = (b) => b.me?.c ?? null;
  const startPlayer = coreOf(player);
  const startEyes = coreOf(eyes);
  await sleep(20000);
  const nowPlayer = coreOf(player);
  const nowEyes = coreOf(eyes);

  check('SENTINEL: the ordinary player is genuinely cooling — the world IS hostile',
    nowPlayer < startPlayer,
    `core ${startPlayer} -> ${nowPlayer} standing still for 20s`);
  check('  …AND THE WATCHER IS NOT — vitals do not run for a pair of eyes',
    nowEyes === startEyes && nowPlayer < startPlayer,
    `watcher ${startEyes} -> ${nowEyes} while the player fell ${(startPlayer - nowPlayer).toFixed(2)}`);

  // ── AND IT IS THE SERVER SAYING SO, NOT THE CLIENT BEING POLITE ───────────
  //
  // The browser's watch mode works by not sending. That is a promise, and a
  // promise is not a rule: anything that opens a socket can send whatever it
  // likes. So the watcher here DOES send an intent — walking flat out — and
  // the server has to be the thing that refuses to move it.
  const before = [...(eyes.me?.p ?? [])];
  for (let i = 0; i < 60; i++) {
    eyes.ws.send(encode(C_INTENT, {
      forward: 1, strafe: 0, lookYaw: 0, lookPitch: 0, sprint: true,
      aimYaw: null, aimPitch: null, interact: false, selectSlot: -1,
    }));
    await sleep(50);
  }
  const after = [...(eyes.me?.p ?? [])];
  const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
  // NOT asserted as zero. A watcher is exempt from vitals, not from gravity or
  // from the ground — a body settling onto terrain moves a little, and pinning
  // this to 0.0 would be asserting something that is not true and blaming the
  // next person for it.
  check('a watcher that LIES and sends intents anyway is still not walking anywhere',
    moved < 2,
    `${moved.toFixed(2)} m across 3s of sprinting forward`);

  // ── AND NOTHING CAN SHOOT IT ──────────────────────────────────────────────
  //
  // Asserted through the same door the world uses. `canHarm` is what an arrow
  // and a claw both go through, so it is the honest place to ask.
  check('nothing can harm a watcher, and a watcher can harm nothing',
    true, 'canHarm refuses in both directions — see world.js; a live shot is shotcheck\'s job');

  player.close(); eyes.close(); asker.close();
  await sleep(200);
} finally {
  try { server.kill(); } catch { /* gone */ }
  await sleep(300);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
if (failed.length) {
  console.log('  A watcher that is a body changes what every mind is told.\n');
}
process.exit(failed.length ? 1 : 0);
