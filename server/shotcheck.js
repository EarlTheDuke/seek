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
// one of them to face the other by sending look deltas the way a mouse does,
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
import { PLAYER, BOW, ARROW } from '../src/config.js';

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
    this.meTick = -1; // which tick that was, so a loop can wait for a fresh one
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
          this.meTick = s.t;
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
async function driveFor(ms, clients) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
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

  const them = () => archer.others.get(target.id);
  const aimError = () => {
    const t = them();
    if (!t || !archer.me) return Math.PI;
    return wrap(yawTo(archer.me.p[0], archer.me.p[2], t.p[0], t.p[2]) - archer.me.y);
  };

  /**
   * How far ABOVE level to hold, to put the arrow in the middle of them.
   *
   * Not zero, and assuming zero is what made this check miss every shot at
   * 10 m while hitting at 3. Two reasons the aim is not flat: the ground is a
   * hillside, so backing away changes your height relative to theirs, and an
   * arrow falls — ARROW.gravity is 12.5, which is about 0.1 m over this range.
   * Both are small at spawn distance and neither is small at ten metres.
   */
  const pitchWanted = () => {
    const t = them();
    if (!t || !archer.me) return 0;
    const d = Math.hypot(t.p[0] - archer.me.p[0], t.p[2] - archer.me.p[2]);
    if (d < 0.5) return 0;
    const eyeY = archer.me.p[1] + PLAYER.eyeHeight;
    const aimY = t.p[1] + PLAYER.eyeHeight * 0.5; // the middle of them, not their feet
    const flight = d / BOW.maxSpeed;
    const drop = 0.5 * ARROW.gravity * flight * flight;
    return Math.atan2(aimY - eyeY + drop, d);
  };

  // ── aiming over a wire, which used to be harder than it looks ──
  //
  // WHAT THIS USED TO SAY, because the scar is the point:
  //
  //   "Two rates and an accumulator, and every naive controller here
  //    oscillates. `targetYaw -= lookYaw` ACCUMULATES; the yaw you are told
  //    about lags behind it through the look smoothing; and `me` refreshes at
  //    the 20 Hz snapshot rate while intents go out at 30. Re-applying the
  //    whole remaining error every tick therefore stacks corrections for a turn
  //    already under way, AND applies each stale reading about one and a half
  //    times. Done that way the aim ended up 38° wide with the pitch 67° in the
  //    air. So: ONE correction per FRESH look at yourself, then hands off while
  //    it settles."
  //
  // All of that was an elaborate way of coping with a channel that ate half of
  // what was posted through it. `PlayerInput.poll` consumes and zeroes a look
  // delta every frame at 60 Hz; `Client.sendIntent` transmits at 30. Half of
  // every turn was destroyed before it was sent, so the server's copy of your
  // facing drifted from your own for ever, and no field existed to correct it.
  // The dance above still only got this check to 2/8: the pitch came out 14°
  // high and the arrow was never seen.
  //
  // The intent now carries WHERE YOU ARE POINTING, not how far you turned, so
  // there is nothing to accumulate and nothing to lose. State the angle; the
  // server sets it. See `intents.js` for the field and the whole story.
  // Repeated only because the GROUND is still moving under us, never because
  // the aim needs to converge — it lands in one packet. Walking backwards down
  // a hillside leaves you settling for a moment afterwards, and both the angle
  // to them and the drop depend on how high you are standing while you take it.
  const aim = async () => {
    for (let pass = 0; pass < 6; pass++) {
      archer.intent.aimYaw = yawTo(archer.me.p[0], archer.me.p[2], them().p[0], them().p[2]);
      archer.intent.aimPitch = pitchWanted();
      const seen = archer.meTick;
      for (let i = 0; i < 40 && archer.meTick === seen; i++) {
        archer.sendIntent();
        target.sendIntent();
        await sleep(1000 / 30);
      }
    }
  };

  // Point at them while they are still close, where a couple of degrees cannot
  // miss — a person is 0.42 m wide, so at 3 m the tolerance is a whole 8°.
  await aim();

  // ── then open the range, walking straight backwards ──
  //
  // An arrow covers 3.3 m in 45 ms and snapshots are 50 ms apart, so at spawn
  // range whether ANY snapshot catches the shaft in flight is a coin toss: this
  // check passed 8/8 when it was written and 6/8 on the very next run, purely
  // from that. Backing off puts three or four snapshots inside the flight.
  //
  // Backwards, specifically: retreating along the line of sight leaves the
  // bearing to them exactly unchanged, so the aim above survives the walk.
  archer.intent.forward = -1;
  await driveFor(3000, [archer, target]);
  archer.intent.forward = 0;
  await driveFor(400, [archer, target]);
  await aim();

  const t0 = them();
  const range = t0 ? Math.hypot(t0.p[0] - archer.me.p[0], t0.p[2] - archer.me.p[2]) : 0;
  check('the archer backed off to a range a snapshot can see', !!t0 && range > 6,
    t0 ? `${range.toFixed(1)} m away — ${((range / 74) * 20).toFixed(1)} snapshots of flight` : 'nobody there');

  const aimErr = Math.abs(aimError());
  const pitchErr = Math.abs(archer.me.t - pitchWanted());
  check('the server turned the archer to face them', aimErr < 0.02 && pitchErr < 0.02,
    `${(aimErr * 57.3).toFixed(2)}° wide, ${(pitchErr * 57.3).toFixed(2)}° high — ` +
      `${(Math.sin(aimErr) * range).toFixed(2)} m of lateral miss, against a 0.42 m body ` +
      `(holding ${(archer.me.t * 57.3).toFixed(2)}° for ${range.toFixed(1)} m)`);

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
  //
  // MEASURED BY FLYING IT BACKWARDS, not by reading the first sighting.
  //
  // The first snapshot to catch an arrow is up to a full 50 ms after it left,
  // and 50 ms is 3.7 m of flight. While the aim happened to be flat that cost
  // nothing; now that the archer correctly holds 8° down a hillside, the shaft
  // has already dropped half a metre before anyone sees it, and reading that
  // sighting as the launch point says "fired from the waist" about a perfectly
  // good shot. Reported as a failure by this very check, which is the sort of
  // thing that sends you looking for a bug in the wrong file.
  //
  // So: take the sighting, work out how long it must have been flying from how
  // far it has travelled, and put the gravity and the vertical speed back.
  const first = archer.projectiles[0];
  let launchHeight = NaN;
  if (first) {
    const flownX = first.p[0] - archer.me.p[0];
    const flownZ = first.p[2] - archer.me.p[2];
    const vH = Math.hypot(first.v[0], first.v[2]);
    const tof = vH > 1 ? Math.hypot(flownX, flownZ) / vH : 0;
    launchHeight = first.p[1] - first.v[1] * tof - 0.5 * ARROW.gravity * tof * tof - feetY;
  }
  check('and it left from eye height, not the archer\'s ankles',
    first && launchHeight > PLAYER.eyeHeight - 0.5,
    first
      ? `${launchHeight.toFixed(2)} m above the feet (eye is ${PLAYER.eyeHeight})`
      : 'no arrow to measure');

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
