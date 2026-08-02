// ── smoketest.js ────────────────────────────────────────────────────────────
// Two headless players connect, walk, and check they can see each other.
//
//   npm run serve            (in one terminal)
//   npm run netcheck         (in another)
//
// Deliberately a real client over a real socket rather than a unit test on
// SimWorld. The thing worth proving is not that the simulation works — the
// determinism harness already covers that — but that the TRANSPORT does: that
// two machines, sending nothing but intents, end up agreeing about a world
// neither of them downloaded.

import { PROTOCOL_VERSION, C_HELLO, C_INTENT, C_PING, C_CHAT,
         S_WELCOME, S_SNAPSHOT, S_JOIN, S_LEAVE, S_PONG, S_CHAT,
         encode, decode } from '../src/net/protocol.js';

const URL = process.argv[2] ?? 'ws://127.0.0.1:8080';

/** A player with no eyes: it sends intents and remembers what it is told. */
class HeadlessClient {
  constructor(name) {
    this.name = name;
    this.id = null;
    this.seed = null;
    this.others = new Map();
    this.snapshots = 0;
    this.lastSnapshot = null;
    this.pings = [];
    this.chats = [];
    this.bytesIn = 0;
    this.bytesOut = 0;
    this.intent = { forward: 0, strafe: 0, lookYaw: 0, sprint: false };
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onerror = (e) => reject(new Error(`${this.name}: ${e.message ?? 'socket error'}`));
      this.ws.onopen = () => {
        this.send(C_HELLO, { name: this.name, version: PROTOCOL_VERSION });
      };
      this.ws.onmessage = (ev) => {
        this.bytesIn += ev.data.length;
        const msg = decode(ev.data);
        if (!msg) return;
        switch (msg.type) {
          case S_WELCOME:
            this.id = msg.data.id;
            this.seed = msg.data.seed;
            this.spawn = msg.data.spawn;
            for (const p of msg.data.players) if (p.id !== this.id) this.others.set(p.id, p.n);
            resolve(this);
            break;
          case S_SNAPSHOT:
            this.snapshots++;
            this.lastSnapshot = msg.data;
            break;
          case S_JOIN:
            this.others.set(msg.data.id, msg.data.n);
            break;
          case S_LEAVE:
            this.others.delete(msg.data.id);
            break;
          case S_PONG:
            this.pings.push(Date.now() - msg.data.t);
            break;
          case S_CHAT:
            this.chats.push(`${msg.data.n}: ${msg.data.m}`);
            break;
        }
      };
    });
  }

  send(type, data) {
    const frame = encode(type, data);
    this.bytesOut += frame.length;
    this.ws.send(frame);
  }

  sendIntent() {
    this.send(C_INTENT, { i: this.intent });
  }

  close() {
    this.ws.close();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  console.log(`\n  connecting two players to ${URL}\n`);

  const alice = await new HeadlessClient('Alice').connect(URL);
  const bob = await new HeadlessClient('Bob').connect(URL);
  await sleep(300);

  check('both players got an id', alice.id !== null && bob.id !== null, `#${alice.id} and #${bob.id}`);
  check('both agree on the seed', alice.seed === bob.seed, `seed ${alice.seed}`);
  check('each sees the other join', alice.others.has(bob.id) && bob.others.has(alice.id),
        `Alice sees "${alice.others.get(bob.id)}", Bob sees "${alice.others.get(alice.id) ?? bob.others.get(alice.id)}"`);

  // ── walking ──
  // Alice walks forward for two seconds; Bob stands still and watches.
  const startSnap = bob.lastSnapshot;
  const aliceStart = startSnap?.pl.find((p) => p.id === alice.id);
  alice.intent.forward = 1;
  alice.intent.sprint = true;
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) {
    alice.sendIntent();
    bob.sendIntent();
    await sleep(1000 / 30);
  }
  alice.intent.forward = 0;
  alice.intent.sprint = false;
  alice.sendIntent();
  await sleep(300);

  const aliceEnd = bob.lastSnapshot?.pl.find((p) => p.id === alice.id);
  const moved = aliceStart && aliceEnd
    ? Math.hypot(aliceEnd.p[0] - aliceStart.p[0], aliceEnd.p[2] - aliceStart.p[2])
    : 0;
  check('Bob sees Alice move', moved > 8, `${moved.toFixed(1)} m in 2 s`);
  check('the server did not obey a lie', moved < 30,
        `${moved.toFixed(1)} m — a sprint is ~8.6 m/s, so 2 s cannot exceed ~18 m`);

  // ── the world, which nobody downloaded ──
  const snap = bob.lastSnapshot;
  check('creatures are shared', (snap?.cr?.length ?? 0) > 0, `${snap?.cr?.length ?? 0} creatures`);
  check('the clock is shared', typeof snap?.c === 'number', `${snap?.c?.toFixed(2)} h`);
  check('weather is shared', !!snap?.w?.s, `${snap?.w?.s} -> ${snap?.w?.n}`);

  // ── latency and budget ──
  for (let i = 0; i < 10; i++) {
    alice.send(C_PING, { t: Date.now() });
    await sleep(40);
  }
  await sleep(200);
  const avgPing = alice.pings.length
    ? alice.pings.reduce((s, v) => s + v, 0) / alice.pings.length : -1;
  check('ping round trip', alice.pings.length >= 8 && avgPing < 100, `${avgPing.toFixed(1)} ms avg over ${alice.pings.length}`);

  // ── chat ──
  alice.send(C_CHAT, { m: 'meet me at the Black Moss' });
  await sleep(300);
  check('chat reaches the other player', bob.chats.length > 0, bob.chats[0] ?? 'nothing received');

  // ── bandwidth ──
  const seconds = 3.2;
  const kbInPerSec = bob.bytesIn / 1024 / seconds;
  check('snapshot budget is small', kbInPerSec < 120,
        `${kbInPerSec.toFixed(1)} KB/s down, ${bob.snapshots} snapshots`);

  // ── leaving ──
  bob.close();
  await sleep(400);
  check('Alice sees Bob leave', !alice.others.has(bob.id), `${alice.others.size} others remain`);

  alice.close();
  await sleep(200);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  could not run: ${err.message}`);
  console.error('  is the server up?  npm run serve\n');
  process.exit(1);
});
