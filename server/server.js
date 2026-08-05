// ── server.js ───────────────────────────────────────────────────────────────
// The authoritative world, on a machine, for a friend on your LAN.
//
//   npm run serve
//   npm run serve -- 8081        (a different port)
//
// The whole of this file is transport. It owns no game logic at all: it accepts
// sockets, turns their messages into intents, ticks `SimWorld`, and posts
// snapshots back. That is exactly the shape VISION.md promised in Phase 1 —
// "single-player becomes a server running in the same process, and networking
// becomes a transport swap" — and this file is the proof that it was true.
//
// AUTHORITY IS ABSOLUTE. Clients send what they WANT to do, never what they
// did. The server decides where everyone is, what they hit and whether they are
// alive. A client that lies gets ignored rather than obeyed, and the only
// surface it can lie through is one sanitised intent per tick.

import { WebSocketServer } from 'ws';
import { SimWorld } from '../src/sim/world.js';
import { makeProvider } from '../src/minds/providers.js';
import { addRivalHunter } from '../src/minds/hunter.js';
import { makeRandom } from '../src/world/noise.js';
import { bannedSpecies, getDangerLevel } from '../src/modes/danger.js';
import { solarPosition } from '../src/world/sky.js';
import {
  PROTOCOL_VERSION,
  C_HELLO,
  C_INTENT,
  C_PING,
  C_CHAT,
  C_PARTY,
  C_PET,
  C_FIRE,
  S_WELCOME,
  S_SNAPSHOT,
  S_JOIN,
  S_LEAVE,
  S_PONG,
  S_CHAT,
  S_ERROR,
  encode,
  decode,
  pickIntent,
  cleanName,
  cleanChat,
  cleanPet,
  cleanPetState,
  cleanFireClaim,
} from '../src/net/protocol.js';

const args = process.argv.slice(2);
const num = (i, fallback) => (args[i] !== undefined && /^\d+$/.test(args[i]) ? Number(args[i]) : fallback);

const PORT = num(0, 8080);
const TICK_HZ = 60; // the simulation's own rate; never changes
const SEND_HZ = 20; // how often clients hear about it
const MAX_PLAYERS = 8;
// A client that has not spoken in this long is gone, whatever the socket says.
//
// Generous on purpose. Browsers throttle timers hard in a backgrounded tab —
// a 2-second keepalive can end up firing once a minute — so a tight timeout
// kicks anyone who alt-tabs. Measured: a hidden tab went silent and was reaped
// at 20 s while the player was still very much there. The socket closing is
// the reliable signal; this is only the backstop for a machine that vanished.
const TIMEOUT_MS = 90000;

// ── staging a fight you would otherwise have to wait for ────────────────────
//
//   HOURS=1 npm run serve        start the world at 01:00 instead of the morning
//   RAID=6  npm run serve        the first player to join is met by a warband
//
// Both off by default, and neither changes a single number when it is off. They
// exist because the interesting things in this game happen at night to somebody
// who is already in trouble, and there was no way to be in that position on a
// REAL server without waiting for it: a day is 26 real minutes, and goblins
// only spawn where the ground is strange enough. Waiting cost more than the
// thing being tested. `raidtest.js` has staged exactly this against SimWorld
// directly for a long time — this is the same stage, on the far side of the
// socket, which is the half that was never watched.
const HOURS = Number(process.env.HOURS);
const RAID = Math.min(12, Math.max(0, Number(process.env.RAID) || 0));

const world = new SimWorld({ headless: true, ...(Number.isFinite(HOURS) ? { hours: HOURS } : {}) });
const clients = new Map(); // ws -> { id, name, lastSeen }
let nextId = 1;
let raided = false;

// ── how dangerous, on the server ────────────────────────────────────────────
//
//   DANGER=no-bears npm run serve
//   DANGER=none npm run serve
//
// The browser reads this from `?danger=` and remembers it in localStorage.
// Neither of those exists in Node, so for a while the setting was CLIENT ONLY
// and a fleet of agents was always playing the full world with bears in it —
// while the console said nothing, because nothing was wrong from its point of
// view. Worth stating plainly: turning bears off in your browser never had any
// effect on what the agents were walking into.
//
// It matters most for exactly the case it was missing from. A person who turns
// bears off has hands and can run; an agent is being tested on whether the
// FOOD loop works and should not be eaten while we find out.
const DANGER = process.env.DANGER ?? 'full';
const banned = bannedSpecies(DANGER);
world.wildlife.setBanned(banned);

// ── minds ───────────────────────────────────────────────────────────────────
//
// Server-side only, which VISION.md is explicit about: "Clients never hold keys
// or call out." Scripted by default and scripted anyway if a key is missing, so
// pulling this repository and running it never reaches the network and never
// costs anybody anything.
//
//   npm run serve                                    scripted minds
//   MINDS_PROVIDER=claude MINDS_API_KEY=... npm run serve
//
const HUNTERS = num(1, Number(process.env.MINDS_HUNTERS ?? 1));
const provider = makeProvider(makeRandom('minds'), process.env);
const rivals = [];
const HUNTER_NAMES = ['Eachann', 'Morag', 'Tormod', 'Ailsa'];
for (let i = 0; i < Math.min(HUNTERS, HUNTER_NAMES.length); i++) {
  rivals.push(addRivalHunter(world, provider, { id: nextId++, name: HUNTER_NAMES[i] }));
}

const wss = new WebSocketServer({ port: PORT });

console.log(`\n  Highlands server`);
console.log(`  seed ${world.seed}  ·  tick ${TICK_HZ} Hz  ·  snapshots ${SEND_HZ} Hz`);
// Said out loud every run, because a world with the bears quietly turned off is
// a different experiment and nothing else on screen would tell you.
console.log(`  danger: ${getDangerLevel(DANGER).name.toLowerCase()}` +
  (banned.size ? ` — no ${[...banned].join(', ')}` : ''));
if (Number.isFinite(HOURS)) console.log(`  staged: the world starts at ${String(Math.floor(HOURS)).padStart(2, '0')}:00`);
if (RAID) console.log(`  staged: a warband of ${RAID} meets the first player through the door`);
console.log(`  listening on ws://0.0.0.0:${PORT}`);
console.log(
  `  ${rivals.length} rival hunter${rivals.length === 1 ? '' : 's'} (${provider.name} minds)` +
    `${provider.name === 'scripted' ? ' — no key, no network' : ''}`
);
console.log(`  tell a friend on your network: ws://<this machine's IP>:${PORT}\n`);

wss.on('connection', (ws, req) => {
  if (clients.size >= MAX_PLAYERS) {
    ws.send(encode(S_ERROR, { m: 'server full' }));
    ws.close();
    return;
  }

  const client = { id: null, name: null, lastSeen: Date.now(), ws };
  clients.set(ws, client);
  const where = req.socket.remoteAddress ?? 'somewhere';

  ws.on('message', (raw) => {
    const msg = decode(raw);
    if (!msg) return; // malformed; drop it and carry on
    client.lastSeen = Date.now();

    switch (msg.type) {
      case C_HELLO: {
        if (client.id !== null) return; // already introduced
        if (msg.data.version !== PROTOCOL_VERSION) {
          ws.send(encode(S_ERROR, { m: `protocol ${PROTOCOL_VERSION} required` }));
          ws.close();
          return;
        }
        client.id = nextId++;
        client.name = cleanName(msg.data.name);
        // The animal they brought with them. A claim about what you OWN rather
        // than about the world, so it is allowed — same class of assertion as
        // your name, and sanitised the same way.
        const pet = cleanPet(msg.data.pet);
        world.addPlayer(client.id, client.name, { pet });
        ws.send(encode(S_WELCOME, world.hello(client.id)));
        broadcast(S_JOIN, { id: client.id, n: client.name }, ws);
        console.log(
          `  + ${client.name} (#${client.id}) from ${where} — ${clients.size} here` +
            (pet ? ` · with a ${world.players.get(client.id).companion.species.name.toLowerCase()}` : '')
        );
        if (RAID && !raided) {
          raided = true;
          if (banned.has('goblin')) console.log('  RAID — asked for, but goblins are banned by DANGER');
          else stageRaid(world.players.get(client.id), RAID);
        }
        break;
      }

      case C_INTENT:
        if (client.id === null) return;
        // The only thing a client is allowed to assert. Filtered for which keys
        // may exist, then clamped inside the simulation.
        world.setIntent(client.id, pickIntent(msg.data.i));
        break;

      case C_PET:
        if (client.id === null) return;
        // What your animal is actually like. A claim about the thing you own,
        // the same class as your name — sanitised for shape here, checked for
        // meaning against the species' own trick table inside the simulation.
        world.setCompanionState(client.id, cleanPetState(msg.data));
        break;

      case C_FIRE: {
        if (client.id === null) return;
        // A fire you lit, arriving so the server's copy of you can feel it. The
        // wood was yours and is already spent; what the simulation checks is
        // that the spot is one you could have reached and that the ground will
        // take it. Dropped silently when it refuses — the browser is still
        // drawing its own fire, and a toast saying "the server disagreed about
        // your fire" is not a sentence any player should ever have to read.
        const claim = cleanFireClaim(msg.data);
        if (!claim) {
          console.log(`  ~ ${client.name} sent a fire that made no sense`);
          break;
        }
        const r = world.lightFireFor(client.id, claim.x, claim.z, claim.fuel);
        // Logged either way, and on purpose. A fire that the browser drew and
        // the server dropped is invisible from both ends — the player sees
        // flames, the server sees nothing, and the only place the disagreement
        // exists is in a packet nobody printed. It cost this session a wrong
        // theory before the line was added.
        console.log(
          `  ${r.ok ? '*' : '~'} ${client.name}'s fire at ` +
            `${claim.x.toFixed(1)}, ${claim.z.toFixed(1)} — ${r.ok ? 'lit' : r.why}`
        );
        break;
      }

      case C_PING:
        ws.send(encode(S_PONG, { t: msg.data.t, s: world.tick }));
        break;

      case C_CHAT: {
        if (client.id === null) return;
        const text = cleanChat(msg.data.m);
        if (!text) return;
        broadcast(S_CHAT, { id: client.id, n: client.name, m: text });
        break;
      }

      case C_PARTY: {
        if (client.id === null) return;
        if (msg.data.leave) {
          world.leaveParty(client.id);
          broadcast(S_CHAT, { id: 0, n: 'the hills', m: `${client.name} is alone again` });
          return;
        }
        const withId = Number(msg.data.with);
        const other = world.players.get(withId);
        if (!other) return;
        // Deliberately not an invite-and-accept handshake. On a LAN, with
        // people you can hear, ceremony is friction — and the only cost of
        // being wrong is that someone cannot shoot you.
        world.setParty(client.id, withId);
        broadcast(S_CHAT, { id: 0, n: 'the hills', m: `${client.name} and ${other.name} travel together` });
        break;
      }
    }
  });

  ws.on('close', () => drop(ws, 'left'));
  ws.on('error', () => drop(ws, 'error'));
});

/**
 * Put a warband on the hill above the first person through the door.
 *
 * Staged the way `raidtest.js` stages it — 26 m off, already aware, one pack —
 * because a goblin that has to FIND you turns a two-minute test into a
 * twenty-minute one, and a pack that arrives one at a time never commits: a
 * lone goblin's morale is 0.00 and it runs. They walk in from there on their
 * own legs and decide for themselves whether to come.
 */
function stageRaid(player, n) {
  const at = player.ctrl.position;
  const born = world.wildlife.spawnHerd('goblin', at.x, at.z - 26, n, 6);
  for (const c of born) {
    c.packId = 'raid';
    c.awareness = 1;
    c.lastKnownThreat.copy(at);
  }
  console.log(`  RAID — ${born.length} goblins staged 26 m from ${player.name}`);
  return born.length;
}

function drop(ws, why) {
  const client = clients.get(ws);
  if (!client) return;
  clients.delete(ws);
  if (client.id !== null) {
    world.removePlayer(client.id);
    broadcast(S_LEAVE, { id: client.id });
    console.log(`  - ${client.name} (#${client.id}) ${why} — ${clients.size} here`);
  }
}

function broadcast(type, data, except = null) {
  const frame = encode(type, data);
  for (const [ws] of clients) {
    if (ws === except) continue;
    if (ws.readyState === ws.OPEN) ws.send(frame);
  }
}

// ── the loop ────────────────────────────────────────────────────────────────
//
// A FIXED simulation step, accumulated against real time. Never a variable dt:
// the whole determinism guarantee — same seed, same inputs, same world — rests
// on every tick being the same size, and a server that speeds up when it is
// idle would break replays, saves and any future client-side prediction at once.

const STEP = 1 / TICK_HZ;
const SEND_EVERY = Math.max(1, Math.round(TICK_HZ / SEND_HZ));
let accumulator = 0;
let last = process.hrtime.bigint();
let ticksThisSecond = 0;
let secondMark = Date.now();

function loop() {
  const now = process.hrtime.bigint();
  let elapsed = Number(now - last) / 1e9;
  last = now;
  // A long stall (a laptop lid, a GC pause) must not be "simulated" in one
  // enormous burst — that would teleport everything. Cap it and accept the
  // lost time honestly.
  if (elapsed > 0.25) elapsed = 0.25;
  accumulator += elapsed;

  while (accumulator >= STEP) {
    // Minds first, so a goal set this tick is acted on this tick. They never
    // block: `update` starts a decision and returns, and the answer lands
    // whenever it lands.
    if (rivals.length) {
      const mctx = {
        hours: world.clock.hours,
        sunAltitude: solarPosition(world.clock.hours).altitude,
        weather: world.weather,
        tick: world.tick,
        fires: world.fires,
        scentAt: (ax, az, bx, bz) => world.scentAt(ax, az, bx, bz),
      };
      for (const r of rivals) {
        r.mind.update(STEP, world, mctx);
        r.body.update(STEP, world, mctx);
        const said = r.body.takeSpeech();
        if (said) broadcast(S_CHAT, { id: r.player.id, n: r.mind.name, m: said });
      }
    }

    world.step(STEP);
    accumulator -= STEP;
    ticksThisSecond++;

    if (world.tick % SEND_EVERY === 0) {
      for (const [ws, client] of clients) {
        if (client.id === null || ws.readyState !== ws.OPEN) continue;
        ws.send(encode(S_SNAPSHOT, world.snapshot(client.id)));
      }
      // Cleared here rather than inside snapshot(), which is called once per
      // client — clearing in there would deliver each death to exactly one
      // person, chosen by iteration order.
      world.clearEvents();
    }
  }

  // Reap the silent.
  const cutoff = Date.now() - TIMEOUT_MS;
  for (const [ws, client] of clients) {
    if (client.lastSeen < cutoff) {
      drop(ws, 'timed out');
      try {
        ws.terminate();
      } catch {
        /* already gone */
      }
    }
  }

  if (Date.now() - secondMark >= 5000) {
    const s = world.stats;
    console.log(
      `  tick ${s.tick} · ${(ticksThisSecond / 5).toFixed(0)} Hz · ` +
        `${s.players} players · ${s.creatures} creatures · ` +
        (s.fires ? `${s.fires} fires · ` : '') +
        `${String(Math.floor(s.hours)).padStart(2, '0')}:00`
    );
    ticksThisSecond = 0;
    secondMark = Date.now();
  }
}

// setInterval rather than a busy loop: at 60 Hz the accumulator absorbs the
// timer's jitter, and the process stays at a few percent of a core instead of
// pinning one.
const timer = setInterval(loop, 1000 / TICK_HZ);

const shutdown = () => {
  console.log('\n  shutting down');
  clearInterval(timer);
  for (const [ws] of clients) {
    try {
      ws.close();
    } catch {
      /* going away anyway */
    }
  }
  wss.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
