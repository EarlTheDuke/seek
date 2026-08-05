// ── bitecheck.js ────────────────────────────────────────────────────────────
// Somebody else watches your animal bite for you.
//
//   npm run bitecheck
//
// WHAT WAS ACTUALLY UNPROVEN. `companioncheck` has long shown that a Companion
// with `guard` on answers whatever hurt its owner, and that the relationship
// survives the wire. Neither of those is the claim. The claim is the whole
// chain, on a real server, seen from a machine that is not the owner's:
//
//   owner's client sends the relationship  ->  the server's COPY is guarding
//   a goblin swings at the owner           ->  resolveAttack finds the victim
//   victim.companion.defend(creature)      ->  the copy takes the goblin as target
//   stepCompanion drains pendingBite       ->  the goblin loses hit points
//   the snapshot goes out                  ->  A SECOND PLAYER SEES ALL OF IT
//
// Every link but the last had been checked in isolation, and the last one had
// never been watched at all. So this runs its own server, joins two real
// sockets to it, and reads the evidence out of the WATCHER's snapshots only —
// never the owner's, and never out of the simulation. If it is not in the
// watcher's stream it did not happen as far as this file is concerned.
//
// It stages the fight (`HOURS=1 RAID=6`) rather than waiting for one. The night
// and the warband are the two things you cannot ask a live server for, and
// waiting for them costs twenty minutes and delivers a goblin at a time.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  PROTOCOL_VERSION, C_HELLO, C_INTENT, C_PET,
  S_WELCOME, S_SNAPSHOT, encode, decode,
} from '../src/net/protocol.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.BITE_PORT ?? 8099);
const URL = `ws://127.0.0.1:${PORT}`;
const GOBLINS = 6;
const PATIENCE_MS = 60000; // how long we will stand there waiting to be hit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A player with no eyes. Sends intents, remembers snapshots. */
class Client {
  constructor(name, pet = null) {
    this.name = name;
    this.pet = pet;
    this.id = null;
    this.last = null;
    this.snapshots = 0;
    this.intent = { forward: 0, strafe: 0, lookYaw: 0, sprint: false };
    this.onSnapshot = null;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onerror = (e) => reject(new Error(`${this.name}: ${e.message ?? 'socket error'}`));
      this.ws.onopen = () =>
        this.send(C_HELLO, { name: this.name, version: PROTOCOL_VERSION, pet: this.pet ?? undefined });
      this.ws.onmessage = (ev) => {
        const msg = decode(ev.data);
        if (!msg) return;
        if (msg.type === S_WELCOME) {
          this.id = msg.data.id;
          resolve(this);
        } else if (msg.type === S_SNAPSHOT) {
          this.snapshots++;
          this.last = msg.data;
          this.onSnapshot?.(msg.data);
        }
      };
    });
  }

  send(type, data) { this.ws.send(encode(type, data)); }
  sendIntent() { this.send(C_INTENT, { i: this.intent }); }
  close() { try { this.ws.close(); } catch { /* going away anyway */ } }
}

/** The server, on its own port, staged for a night fight. */
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(HERE, 'server.js'), String(PORT)], {
      env: { ...process.env, HOURS: '1', RAID: String(GOBLINS), DANGER: 'full' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const done = setTimeout(() => reject(new Error(`server did not start:\n${out}`)), 10000);
    child.stdout.on('data', (d) => {
      out += d;
      if (out.includes('listening on')) { clearTimeout(done); resolve({ child, log: () => out }); }
    });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => { clearTimeout(done); reject(new Error(`server exited ${code}:\n${out}`)); });
  });
}

async function main() {
  console.log('\n  Bitecheck — a warband, at night, watched from somebody else\'s machine\n');
  const server = await startServer();

  // ── the owner goes first, because the warband is staged on whoever does ──
  const owner = await new Client('Alice', 'wolfcub').connect(URL);
  // What her animal is actually like: tame, and taught to guard. This is the
  // packet that turns `defend` from dead code into a participant, and until it
  // arrives the server's copy is a stranger's idea of the pet — trust 0.6, no
  // tricks, guard off.
  const relationship = { k: 'wolfcub', t: 0.95, f: 0.9, y: 0.9, w: 0.9, n: 'Fang', l: ['guard'], o: { guard: true } };
  owner.send(C_PET, relationship);

  const watcher = await new Client('Bob').connect(URL);
  await sleep(400);
  check('two players and one animal on one server', owner.id !== null && watcher.id !== null,
        `#${owner.id} with a wolf cub, #${watcher.id} watching`);

  // ── what the watcher saw ──
  //
  // Read out of Bob's stream and nothing else. `co` is everybody's animals,
  // `cr` is the creatures, `pl` is the other people — all of it the ordinary
  // snapshot every client already gets.
  const seen = {
    petEver: false,        // Bob's snapshots mention Alice's animal at all
    petAttackAt: null,     // ...and it went to 'attack'
    ownerHurtAt: null,     // ...after Alice lost health
    goblinHurt: null,      // ...and a goblin lost hit points to no arrow
    petStates: new Set(),
    ownerHealth: null,
    goblinHp: new Map(),
  };
  const t0 = Date.now();
  const at = () => ((Date.now() - t0) / 1000).toFixed(1);

  watcher.onSnapshot = (s) => {
    const pet = s.co?.find((c) => c.o === owner.id);
    if (pet) {
      seen.petEver = true;
      seen.petStates.add(pet.s);
      if (pet.s === 'attack' && seen.petAttackAt === null) seen.petAttackAt = at();
    }
    const alice = s.pl?.find((p) => p.id === owner.id);
    if (alice) {
      if (seen.ownerHealth !== null && alice.h < seen.ownerHealth && seen.ownerHurtAt === null) {
        seen.ownerHurtAt = at();
      }
      seen.ownerHealth = alice.h;
    }
    // A goblin losing hit points with nothing in flight. `pr` is every arrow in
    // the air; if it is empty, the only thing in this world that can have taken
    // that hit point off is teeth.
    for (const c of s.cr ?? []) {
      if (c.k !== 'goblin') continue;
      const was = seen.goblinHp.get(c.i);
      if (was !== undefined && c.h < was && !(s.pr ?? []).length && !seen.goblinHurt) {
        // How far is it from the animal? A bite is close work.
        const d = pet ? Math.hypot(c.p[0] - pet.p[0], c.p[2] - pet.p[2]) : Infinity;
        seen.goblinHurt = { id: c.i, from: was, to: c.h, at: at(), petDistance: d };
      }
      seen.goblinHp.set(c.i, c.h);
    }
  };

  // Bob walks off. He is a witness, not a combatant — and a second body
  // standing in the ring is counted by the pack as opposition, which is exactly
  // the arithmetic that makes goblins refuse a fight. This happens AFTER the
  // observer above is attached, and that ordering is the whole reason the first
  // run of this file could not say which came first: the goblins covered 26 m
  // and drew blood inside the three seconds Bob spent walking, so by the time
  // anything was watching, Alice was already on 78 health and the cub was
  // already in 'attack'. The evidence had been spent before the witness arrived.
  watcher.intent.forward = 1;
  watcher.intent.sprint = true;
  for (let i = 0; i < 90; i++) { watcher.sendIntent(); owner.sendIntent(); await sleep(1000 / 30); }
  watcher.intent.forward = 0;
  watcher.intent.sprint = false;
  watcher.sendIntent();

  // Alice stands still and takes it, resending the relationship the way a real
  // client does — the digest is quantised to 2 dp, so this is a packet a second
  // at most and nothing at all while the animal is content.
  let ticks = 0;
  while (Date.now() - t0 < PATIENCE_MS && !(seen.petAttackAt && seen.goblinHurt)) {
    owner.sendIntent();
    watcher.sendIntent();
    if (++ticks % 30 === 0) owner.send(C_PET, relationship);
    await sleep(1000 / 30);
  }

  const goblinsSeen = seen.goblinHp.size;
  console.log(`\n  ${at()} s later: ${goblinsSeen} goblins in Bob's snapshots, ` +
              `Alice on ${seen.ownerHealth} health, her cub seen ${[...seen.petStates].join('/') || 'not at all'}\n`);

  check('the watcher sees the owner\'s animal', seen.petEver, `states: ${[...seen.petStates].join(', ')}`);
  check('the warband reached her', seen.ownerHurtAt !== null,
        seen.ownerHurtAt ? `Alice first lost health at ${seen.ownerHurtAt} s` : 'nothing ever hit her');
  check('THE WATCHER SEES THE CUB ANSWER IT', seen.petAttackAt !== null,
        seen.petAttackAt ? `state 'attack' in Bob's snapshot at ${seen.petAttackAt} s` : 'it never left follow');
  check('it answered AFTER she was hurt, not before',
        seen.petAttackAt !== null && seen.ownerHurtAt !== null && Number(seen.petAttackAt) >= Number(seen.ownerHurtAt),
        `hurt ${seen.ownerHurtAt} s, attack ${seen.petAttackAt} s`);
  check('THE WATCHER SEES THE BITE LAND', !!seen.goblinHurt,
        seen.goblinHurt
          ? `goblin #${seen.goblinHurt.id} ${seen.goblinHurt.from} -> ${seen.goblinHurt.to} hp at ` +
            `${seen.goblinHurt.at} s, ${seen.goblinHurt.petDistance.toFixed(1)} m from the cub, no arrow in flight`
          : 'no goblin ever lost hit points');
  check('the bite is the cub\'s, by range', !!seen.goblinHurt && seen.goblinHurt.petDistance < 6,
        seen.goblinHurt ? `${seen.goblinHurt.petDistance.toFixed(1)} m — biteRange is 2.0` : '-');

  owner.close();
  watcher.close();
  await sleep(200);
  server.child.kill();

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  bitecheck could not run: ${err.message}\n`);
  process.exit(1);
});
