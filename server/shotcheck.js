// ── shotcheck.js ────────────────────────────────────────────────────────────
// Does pressing the button become a SERVER-SIDE arrow?
//
//   npm run shotcheck
//
// This is the check that was missing, and its absence cost several sessions.
// `arrowcheck` passes 7/7 by calling `projectiles.spawn` directly: it proves the
// hit test and the PvP rules, and proves NOTHING about whether a player holding
// the trigger ever produces an arrow on the server. The whole reported bug —
// "the arrow leaves, the inventory drops, and nothing ever arrives" — lived in
// exactly that gap, because every test either drove the simulation directly or
// watched from the client end where the evidence is not.
//
// So this one is deliberately end to end and deliberately dumb about internals:
// it starts a REAL server as a child process, connects two REAL sockets, steers
// one of them to face the other by sending look deltas the way a keyboard does,
// holds `primary` for a full draw, lets go, and then asks the server — through
// its own snapshots — whether an arrow existed and what happened to it.
//
// Nothing here reaches into SimWorld. If it can only be seen by importing the
// simulation, it is not what a player experiences.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PROTOCOL_VERSION, C_HELLO, C_INTENT,
  S_WELCOME, S_SNAPSHOT, S_JOIN, S_LEAVE,
  encode, decode,
} from '../src/net/protocol.js';
import { PLAYER, BOW } from '../src/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8099);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A player with no eyes, no physics and no opinions — it sends intents. */
class WireClient {
  constructor(name) {
    this.name = name;
    this.id = null;
    this.me = null; // where the server says I am
    this.others = new Map(); // id -> last snapshot of them
    this.events = []; // everything the server said happened
    this.projectiles = []; // every arrow the server showed me, as it flew
    this.intent = { forward: 0, strafe: 0, lookYaw: 0, lookPitch: 0, primary: false };
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onerror = (e) => reject(new Error(`${this.name}: ${e.message ?? 'socket error'}`));
      this.ws.onopen = () => this.send(C_HELLO, { name: this.name, version: PROTOCOL_VERSION });
      this.ws.onmessage = (ev) => {
        const msg = decode(ev.data);
        if (!msg) return;
        if (msg.type === S_WELCOME) {
          this.id = msg.data.id;
          resolve(this);
        } else if (msg.type === S_SNAPSHOT) {
          const s = msg.data;
          this.me = s.me ?? this.me;
          for (const p of s.pl ?? []) this.others.set(p.id, p);
          for (const e of s.ev ?? []) this.events.push(e);
          for (const pr of s.pr ?? []) this.projectiles.push({ t: s.t, p: pr.p, v: pr.v });
        } else if (msg.type === S_JOIN || msg.type === S_LEAVE) {
          /* nothing to do; the snapshot carries the truth */
        }
      };
    });
  }

  send(type, data) {
    if (this.ws.readyState === 1) this.ws.send(encode(type, data));
  }

  sendIntent() {
    this.send(C_INTENT, { i: this.intent });
    // Look is a DELTA applied for one tick. Leaving it set would spin the
    // player forever, which is exactly what the browser avoids by clearing it
    // every frame — so this client behaves the same way.
    this.intent.lookYaw = 0;
    this.intent.lookPitch = 0;
  }

  close() { try { this.ws.close(); } catch { /* going anyway */ } }
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Where you have to be looking to point at (tx, tz) from (x, z). */
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

/** Drive both clients in REAL time. The server ticks on a wall clock. */
async function driveFor(ms, clients, each = null) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    each?.((Date.now() - t0) / 1000);
    for (const c of clients) c.sendIntent();
    await sleep(1000 / 30);
  }
}

async function main() {
  console.log('\n  A shot, over a real socket\n');

  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  // Wait for it to be listening rather than guessing at a sleep.
  let archer = null;
  for (let i = 0; i < 40 && !archer; i++) {
    await sleep(150);
    archer = await new WireClient('Archer').connect(URL).catch(() => null);
  }
  if (!archer) throw new Error(`no server answered on ${URL}`);
  const target = await new WireClient('Target').connect(URL);
  await sleep(400);

  check('two clients joined over a socket', archer.id !== null && target.id !== null,
    `#${archer.id} archer, #${target.id} target`);

  // ── aim ──
  // Steer with look deltas, the way a mouse does. The server owns the yaw and
  // reports it back; this reads it and corrects, so it is a real control loop
  // over the wire rather than a teleport.
  const them = () => archer.others.get(target.id);
  const t0 = them();
  check('the archer can see the target', !!t0,
    t0 ? `${Math.hypot(t0.p[0] - archer.me.p[0], t0.p[2] - archer.me.p[2]).toFixed(1)} m away` : 'nobody there');

  await driveFor(1500, [archer, target], () => {
    const t = them();
    if (!t || !archer.me) return;
    const want = yawTo(archer.me.p[0], archer.me.p[2], t.p[0], t.p[2]);
    // `targetYaw -= lookYaw`, so turning left is a negative delta.
    archer.intent.lookYaw = -wrap(want - archer.me.y) * 0.4;
    // And level, because the aim starts wherever the spawn left it.
    // `targetPitch -= lookPitch`, same as yaw — the first run of this file got
    // that sign backwards, drove the aim to 89° down, and reported "the press
    // never crossed the wire" when it had simply been shooting at its own boots.
    archer.intent.lookPitch = archer.me.t * 0.4;
  });

  const t1 = them();
  const aimErr = t1 && archer.me
    ? Math.abs(wrap(yawTo(archer.me.p[0], archer.me.p[2], t1.p[0], t1.p[2]) - archer.me.y))
    : Math.PI;
  check('the server turned the archer to face them', aimErr < 0.08,
    `${(aimErr * 57.3).toFixed(1)}° off, pitch ${(archer.me.t * 57.3).toFixed(1)}°`);

  // ── draw, and let go ──
  const feetY = archer.me.p[1];
  const beforeHealth = target.me?.h ?? 100;
  archer.projectiles.length = 0;
  archer.events.length = 0;
  target.events.length = 0;

  archer.intent.primary = true;
  await driveFor((BOW.drawTime + 0.4) * 1000, [archer, target]);
  archer.intent.primary = false;
  await driveFor(1200, [archer, target]);

  // ── what the SERVER did about it ──
  check('holding the trigger produced an arrow ON THE SERVER',
    archer.projectiles.length > 0,
    archer.projectiles.length
      ? `${archer.projectiles.length} sightings of an arrow in flight`
      : 'the server never spawned one — the press did not cross the wire');

  // The bug this check was written to catch on its first run: the server aims
  // from `ctrl.position`, which is the FEET. A shot loosed from the ankles digs
  // into the hill in front of you, and every symptom downstream looks like a
  // broken hit test.
  const first = archer.projectiles[0];
  const launchHeight = first ? first.p[1] - feetY : NaN;
  check('and it left from eye height, not the archer\'s ankles',
    first && launchHeight > PLAYER.eyeHeight - 0.5,
    first ? `${launchHeight.toFixed(2)} m above the feet (eye is ${PLAYER.eyeHeight})` : 'no arrow to measure');

  // ── and the client was told ──
  const mine = (c) => c.events.filter((e) => e.by === archer.id);
  const seen = mine(archer);
  check('the shot resolved against the person in front of them',
    seen.length > 0,
    seen.length ? JSON.stringify(seen[0]) : 'the server said nothing about it');

  // Spawn is settled ground, so the honest outcome here is a refusal WITH A
  // REASON. Either is proof the shot arrived; a silence is not.
  const glance = seen.find((e) => e.k === 'glance');
  const hit = seen.find((e) => e.k === 'hit');
  check('and it either hurt them or said why it did not',
    !!hit || !!(glance && glance.why),
    hit ? `hit for ${hit.dmg} (${beforeHealth} -> ${target.me?.h})` : glance?.why ?? '—');

  check('the TARGET heard about it too, not just the shooter',
    mine(target).length > 0,
    `${mine(target).length} events on the other socket`);

  archer.close();
  target.close();
  await sleep(200);
  stop();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  could not run: ${err.message}\n`);
  process.exit(1);
});
