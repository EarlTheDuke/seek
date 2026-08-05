// ── herdcheck.js ────────────────────────────────────────────────────────────
// Are two people standing together looking at the SAME animals?
//
//   npm run herdcheck
//
// For as long as multiplayer has existed the answer was no. The server ran a
// herd, `client.js` decoded it into `snapshot.cr`, interpolated it — and then
// dropped it, while the browser quietly ran a second, private herd of its own.
// Measured on one client at one instant:
//
//     my local world:   24 creatures, nearest deer   20 m
//     the server's:     20 creatures, nearest deer 1390 m
//
// Every kill was fiction, other people's arrows flew at nothing, and two
// players side by side hunted different deer. Nothing caught it because no
// check had ever put the CLIENT's creature list next to the SERVER's.
//
// So that is all this does, and it does it with the real pieces: a real server
// as a child process, two real sockets, and two instances of the actual browser
// `Wildlife` manager — the same class main.js uses — fed the same snapshots the
// browser feeds it. If the mirror is wrong, this fails.
//
// The one stub is the THREE scene, which only has to swallow add/remove; there
// is no renderer in Node and the geometry never needs to reach one.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PROTOCOL_VERSION, C_HELLO, C_INTENT,
  S_WELCOME, S_SNAPSHOT,
  encode, decode,
} from '../src/net/protocol.js';
import { Wildlife } from '../src/creatures/manager.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8098);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Everything a Wildlife needs from a THREE scene, which is not much. */
const stubScene = () => ({ add() {}, remove() {} });

/**
 * A browser, minus the browser: a real socket, and the real client-side
 * creature manager behind it, driven exactly the way main.js drives it.
 */
class MirrorClient {
  constructor(name) {
    this.name = name;
    this.id = null;
    this.me = null;
    this.latest = null; // the newest snapshot, raw
    this.snapshots = 0;
    this.wildlife = new Wildlife(stubScene(), {});
    this.intent = { forward: 0, strafe: 0, lookYaw: 0, lookPitch: 0 };
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
          this.latest = msg.data;
          this.me = msg.data.me ?? this.me;
          this.snapshots++;
          // Exactly what main.js does every frame while connected.
          this.wildlife.applySnapshot(msg.data.cr, 1 / 20, {
            hours: msg.data.c,
            sunAltitude: 40,
            weather: null,
          });
        }
      };
    });
  }

  send(type, data) {
    if (this.ws.readyState === 1) this.ws.send(encode(type, data));
  }

  sendIntent() {
    this.send(C_INTENT, { i: this.intent });
  }

  /** What the player would see: every animal, by the server's id. */
  get mirrored() {
    return new Map(this.wildlife.creatures.map((c) => [c.serverId, c]));
  }

  /** How far the nearest living animal is — the number the bug got wrong. */
  nearest(list) {
    if (!this.me) return null;
    let best = Infinity;
    for (const c of list) {
      const p = c.position ?? { x: c.p[0], z: c.p[2] };
      const d = Math.hypot(p.x - this.me.p[0], p.z - this.me.p[2]);
      if (d < best) best = d;
    }
    return Number.isFinite(best) ? best : null;
  }

  close() { try { this.ws.close(); } catch { /* going anyway */ } }
}

async function driveFor(ms, clients) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const c of clients) c.sendIntent();
    await sleep(1000 / 30);
  }
}

async function main() {
  console.log('\n  One herd, seen by two people\n');

  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'no-bears', MINDS_HUNTERS: '0' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  let ann = null;
  for (let i = 0; i < 40 && !ann; i++) {
    await sleep(150);
    ann = await new MirrorClient('Ann').connect(URL).catch(() => null);
  }
  if (!ann) throw new Error(`no server answered on ${URL}`);
  const bel = await new MirrorClient('Bel').connect(URL);

  // Long enough for the server to populate around both of them and for a good
  // few snapshots to land. Walking, so the herd is not a single frozen frame.
  ann.intent.forward = 1;
  await driveFor(4000, [ann, bel]);
  ann.intent.forward = 0;
  await driveFor(1000, [ann, bel]);

  check('two clients joined and are being sent snapshots',
    ann.id !== null && bel.id !== null && ann.snapshots > 10,
    `#${ann.id} Ann, #${bel.id} Bel — ${ann.snapshots} snapshots`);

  const server_cr = ann.latest?.cr ?? [];
  check('the server has animals to send at all', server_cr.length > 0,
    `${server_cr.length} creatures in the newest snapshot`);

  // ── the check the whole file exists for ──
  const mine = ann.mirrored;
  const missing = server_cr.filter((e) => !mine.has(e.i));
  const extra = [...mine.keys()].filter((id) => !server_cr.some((e) => e.i === id));
  check('the client\'s herd IS the server\'s herd, animal for animal',
    missing.length === 0 && extra.length === 0 && mine.size === server_cr.length,
    `client ${mine.size}, server ${server_cr.length}` +
      (missing.length ? `, ${missing.length} never mirrored` : '') +
      (extra.length ? `, ${extra.length} ghosts the server never mentioned` : ''));

  // Positions, to the centimetre. A mirror that creates the right animals and
  // then leaves them where they spawned is not a mirror.
  let worst = 0;
  let worstOf = null;
  for (const e of server_cr) {
    const c = mine.get(e.i);
    if (!c) continue;
    const d = Math.hypot(c.position.x - e.p[0], c.position.y - e.p[1], c.position.z - e.p[2]);
    if (d > worst) { worst = d; worstOf = e; }
  }
  check('and every one of them is standing where the server says',
    server_cr.length > 0 && worst < 0.02,
    `worst ${worst.toFixed(4)} m${worstOf ? ` (${worstOf.k} #${worstOf.i})` : ''}`);

  // Species and life-or-death, not just coordinates.
  const wrongKind = server_cr.filter((e) => mine.get(e.i)?.species.id !== e.k);
  const wrongState = server_cr.filter((e) => mine.get(e.i)?.state !== e.s);
  check('the right species, in the right state',
    wrongKind.length === 0 && wrongState.length === 0,
    `${wrongKind.length} wrong species, ${wrongState.length} wrong state`);

  // ── the reported symptom, in the reported terms ──
  const clientNear = ann.nearest(ann.wildlife.creatures);
  const serverNear = ann.nearest(server_cr);
  check('the nearest animal is the same animal on both sides',
    clientNear !== null && serverNear !== null && Math.abs(clientNear - serverNear) < 0.05,
    `client ${clientNear?.toFixed(1)} m, server ${serverNear?.toFixed(1)} m`);

  // ── two people, one hillside ──
  const hers = bel.mirrored;
  const disagree = [...mine.keys()].filter((id) => !hers.has(id));
  check('Ann and Bel are looking at the same animals',
    mine.size > 0 && disagree.length === 0 && mine.size === hers.size,
    `Ann ${mine.size}, Bel ${hers.size}, ${disagree.length} seen by only one of them`);

  // ── it is a mirror, not a simulation ──
  const before = ann.wildlife.creatures.map((c) => `${c.serverId}:${c.position.x.toFixed(3)}`).join('|');
  for (let i = 0; i < 30; i++) ann.wildlife.update(1 / 60, { x: 0, y: 0, z: 0 }, null, null);
  const after = ann.wildlife.creatures.map((c) => `${c.serverId}:${c.position.x.toFixed(3)}`).join('|');
  check('half a second of local update() moves nothing and spawns nothing',
    before === after && before.length > 0,
    before === after ? `${ann.wildlife.creatures.length} unchanged` : 'the local simulation is still running');

  // ── and it is not ours to kill ──
  const victim = ann.wildlife.creatures.find((c) => c.state !== 'dead');
  const hpBefore = victim?.hp;
  const res = victim?.applyDamage(9999, victim.species.hitZones[0], null);
  check('a local arrow cannot kill somebody else\'s animal',
    !!victim && res?.killed === false && victim.hp === hpBefore && victim.state !== 'dead',
    victim ? `${victim.species.id} still ${victim.hp} hp, state ${victim.state}, zone reported "${res?.zone}"` : 'nothing alive to shoot');

  // ── a death, arriving over the wire ──
  //
  // The one transition hunting depends on, and the only one this file cannot
  // get from the live server on demand: making a real deer die would mean
  // reproducing all of shotcheck's archery first. So the packet is synthetic
  // and everything it drives is real — the same applySnapshot, the same
  // Creature, the same death pose. What is being checked is that a state the
  // CLIENT never decided still lands on the body.
  const doomed = ann.wildlife.creatures.find((c) => c.state !== 'dead');
  const killed = { ...ann.latest.cr.find((e) => e.i === doomed.serverId), s: 'dead', h: 0 };
  const rest = ann.latest.cr.filter((e) => e.i !== doomed.serverId);
  ann.wildlife.applySnapshot([killed, ...rest], 1 / 20);
  const rolledOver = Math.abs(doomed.object.rotation.z) > 0;
  for (let i = 0; i < 20; i++) ann.wildlife.applySnapshot([killed, ...rest], 1 / 20);
  check('an animal the SERVER killed dies on our screen, and lies down',
    doomed.state === 'dead' && doomed.deathTime > 0.9 && Math.abs(doomed.object.rotation.z) > 1.2,
    `state ${doomed.state}, ${doomed.deathTime.toFixed(2)} s dead, rolled ` +
      `${(doomed.object.rotation.z * 57.3).toFixed(0)}° (was ${rolledOver ? 'already falling' : 'upright'} on frame one)`);

  // And when the server stops mentioning the carcass, it goes.
  const gone = doomed.serverId;
  ann.wildlife.applySnapshot(rest, 1 / 20);
  check('and the carcass leaves when the server drops it',
    !ann.wildlife.byServerId.has(gone) && !ann.wildlife.creatures.includes(doomed),
    `${ann.wildlife.creatures.length} left, server listed ${rest.length}`);

  // ── and single-player is still single-player ──
  ann.wildlife.setRemote(false);
  check('leaving the server hands the world back, empty and ready to repopulate',
    ann.wildlife.creatures.length === 0 && ann.wildlife.byServerId.size === 0 &&
      ann.wildlife.remote === false && ann.wildlife.spawnedSites.size === 0,
    `${ann.wildlife.creatures.length} left over, ${ann.wildlife.spawnedSites.size} sites still marked used`);

  ann.close();
  bel.close();
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
