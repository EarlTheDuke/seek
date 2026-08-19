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
import { KothMatch, cleanTeam } from '../src/sim/match.js';
import { TIME } from '../src/config.js';
import { getItem } from '../src/items/registry.js';
import { makeProvider } from '../src/minds/providers.js';
import { addRivalHunter } from '../src/minds/hunter.js';
import { makeRandom } from '../src/world/noise.js';
import { bannedSpecies, getDangerLevel } from '../src/modes/danger.js';
import { solarPosition } from '../src/world/sky.js';
import { setScarcity, scarcityFromEnv, scarce } from '../src/world/scarcity.js';
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
// ── how many bodies may be in this world at once ──
//
// Eight, shared between people and agents, which is a fleet of six models plus
// one human plus one spare — and that is not a roster, it is a queue. Raised to
// sixteen and made settable, because "several models plus a human" is the whole
// point of the evening this is being built for.
//
// MEASURED rather than assumed, which is the only reason it moved: rostercheck
// puts a full house on a server, drives every one of them, and reports the tick
// rate and the bytes each client is being sent. See server/rostercheck.js.
const MAX_PLAYERS = Math.max(1, Number(process.env.MAX_PLAYERS) || 16);
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
//   STOCK=venison:2,wood:1 npm run serve
//
// ...and the third stage: what everybody arrives carrying, on top of the normal
// loadout. Same class of knob as the two above and off by default in the same
// way. It exists because the survival loop and the hunting loop are separate
// questions and were impossible to ask separately: to find out whether a body
// can cook, eat and get through a night you first had to make it kill a deer,
// so a red hunt made the whole of survival untestable. Staging two steaks costs
// nothing and answers the second question on its own.
const HOURS = Number(process.env.HOURS);
const RAID = Math.min(12, Math.max(0, Number(process.env.RAID) || 0));
const STOCK = parseStock(process.env.STOCK);
//   HUNGER=40 npm run serve
//
// ...and how empty everybody arrives. Hunger runs 100 down to 0 and falls about
// six points an hour, so a body that starts full is not hungry for most of a
// day — fourteen game hours, a quarter of an hour of real time, before it would
// touch its food. That is a long time to hold a socket open to find out whether
// eating works at all. Same argument as `HOURS`, and the same default of "off".
const HUNGER = Number(process.env.HUNGER);

// ── SCARCE: how much this valley has, and how unevenly ──
//
//   SCARCE=on        a hard winter — less of everything, pulled into good ground
//   SCARCE=0.5,0.8   half as much, and clumped hard
//
// OFF by default, so a world nobody asked to make hard is the world it has
// always been, to the byte. It exists because a hoarder and a generous soul
// behave identically when there is another branch four metres away: character
// only shows when something is at stake. See src/world/scarcity.js.
const SCARCITY = setScarcity(scarcityFromEnv(process.env));

/** `venison:2,wood:1` -> [['venison', 2], ['wood', 1]]. Unknown ids are loud. */
function parseStock(raw) {
  const out = [];
  for (const part of String(raw ?? '').split(',')) {
    if (!part.trim()) continue;
    const [id, n] = part.split(':');
    if (!getItem(id.trim())) {
      console.warn(`  STOCK: there is no such item as "${id.trim()}" — ignored`);
      continue;
    }
    out.push([id.trim(), Math.max(1, Math.min(20, Number(n) || 1))]);
  }
  return out;
}

// ── SOLID: a body stops being a point ──
//
//   SOLID=on node server/server.js 8080
//
// OFF by default and off is byte-identical, because this touches the movement
// path of every player and every agent on the server tick. On, a body cannot
// walk through a tree trunk, a boulder, or another person.
//
// Worth knowing before you turn it on: the agents were written against a world
// with nothing in it, so `agent.js` routes round trees to get a SIGHTLINE and
// has never had to respect a physical one. Watch for a body pressing itself
// into a trunk instead of hunting.
const SOLID = /^(on|yes|1|true)$/i.test(process.env.SOLID ?? '');

const MODE = String(process.env.MODE ?? '').trim().toLowerCase();
let matchPlan = null;
if (MODE === 'koth') {
  const at = String(process.env.HILL_AT ?? '').trim();
  matchPlan = {
    hillAt: /^spawn$/i.test(at) ? 'spawn'
      : /^-?[\d.]+\s*,\s*-?[\d.]+$/.test(at) ? at.split(',').map(Number) : null,
    radius: Math.max(8, Number(process.env.HILL_RADIUS) || 28),
    pointsToWin: Math.max(5, Number(process.env.POINTS_TO_WIN) || 120),
    minutes: Math.max(1, Number(process.env.MATCH_MINUTES) || 30),
    respawnSeconds: Math.max(1, Number(process.env.RESPAWN_SECONDS) || 25),
  };
}

const world = new SimWorld({
  headless: true,
  solid: SOLID,
  ...(Number.isFinite(HOURS) ? { hours: HOURS } : {}),
});
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
// ── PVP_EVERYWHERE: a straight brawl, including at the spawn ──
//
// PvP damage has been built and covered by `shotcheck` for months. The default
// rule is better than a toggle — party members never hurt each other, and
// between strangers it depends on where you are standing, keyed to
// `placeStrangeness`. This only exists for the case that rule cannot express:
// six models and a human who want a fight NOW, on the shore, without walking
// out to the strange country first.
if (/^(on|yes|1|true)$/i.test(process.env.PVP_EVERYWHERE ?? '')) {
  world.rules.pvpEverywhere = true;
  console.log('  staged: PVP_EVERYWHERE — strangers can fight anywhere, even at the spawn');
}

const DANGER = process.env.DANGER ?? 'full';

// ── MODE: the game as it was, or a match ──
//
//   MODE=koth             king of the hill — see PLAN-KOTH.md
//   HILL_AT=x,z           put the hill somewhere exact (HILL_AT=spawn for
//                         the spawn itself — matchcheck stands on this)
//   HILL_RADIUS=28        metres; wider than a bowshot on purpose
//   POINTS_TO_WIN=120     seconds of SOLE occupancy that end it
//   MATCH_MINUTES=30      real minutes to the cap, best standing wins
//   RESPAWN_SECONDS=25    how long a death sits out
//
// Anything else — including unset — is the game exactly as it has always
// been: no match object, no match fields, no match events.
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
if (matchPlan) {
  const m = new KothMatch({
    hillAt: matchPlan.hillAt === 'spawn'
      ? [world.spawn.position.x, world.spawn.position.z] : matchPlan.hillAt,
    radius: matchPlan.radius,
    pointsToWin: matchPlan.pointsToWin,
    respawnSeconds: matchPlan.respawnSeconds,
  });
  // Real minutes to game hours: a day is TIME.dayMinutes real minutes.
  m.capAfterHours = matchPlan.minutes * (24 / TIME.dayMinutes) / 60;
  world.match = m.start(world);
  console.log('  MODE: KING OF THE HILL — first to ' + m.pointsToWin + ' seconds of sole hold, or best in ' + matchPlan.minutes + ' min');
  console.log('  the hill: ' + m.hillName + ' — ring ' + m.radius + ' m · respawn ' + m.respawnSeconds + 's at the team muster');
}

const HUNTERS = num(1, Number(process.env.MINDS_HUNTERS ?? 1));
const provider = makeProvider(makeRandom('minds'), process.env);
const rivals = [];
const HUNTER_NAMES = ['Eachann', 'Morag', 'Tormod', 'Ailsa'];
for (let i = 0; i < Math.min(HUNTERS, HUNTER_NAMES.length); i++) {
  rivals.push(addRivalHunter(world, provider, { id: nextId++, name: HUNTER_NAMES[i] }));
}

const wss = new WebSocketServer({ port: PORT });

console.log(`\n  Highlands server`);
console.log(`  seed ${world.seed}  ·  tick ${TICK_HZ} Hz  ·  snapshots ${SEND_HZ} Hz  ·  up to ${MAX_PLAYERS} players`);
// Said out loud every run, because a world with the bears quietly turned off is
// a different experiment and nothing else on screen would tell you.
console.log(`  danger: ${getDangerLevel(DANGER).name.toLowerCase()}` +
  (banned.size ? ` — no ${[...banned].join(', ')}` : ''));
if (Number.isFinite(HOURS)) console.log(`  staged: the world starts at ${String(Math.floor(HOURS)).padStart(2, '0')}:00`);
if (RAID) console.log(`  staged: a warband of ${RAID} meets the first player through the door`);
if (STOCK.length) console.log(`  staged: everybody arrives carrying ${STOCK.map(([i, n]) => `${n} ${i}`).join(', ')}`);
if (Number.isFinite(HUNGER)) console.log(`  staged: everybody arrives ${HUNGER < 25 ? 'starving' : 'hungry'} (${HUNGER}/100)`);
if (scarce()) {
  console.log(`  staged: a lean valley — ${Math.round(SCARCITY.plenty * 100)}% of the usual food and fuel` +
    (SCARCITY.patchy ? `, ${Math.round(SCARCITY.patchy * 100)}% of it pulled into the good ground` : ', spread evenly'));
}
if (SOLID) console.log('  staged: SOLID — trunks, boulders and other people stop a body');
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
        // WATCHING, not playing. A claim about what this connection INTENDS,
        // like the name and the pet, and sanitised the same way — the worst a
        // liar can do with it is make themselves invisible and invulnerable
        // while giving up every verb in the game.
        client.watching = msg.data.w === true;
        world.addPlayer(client.id, client.name, { pet, watching: client.watching });
        // In match mode every playing joiner gets a side: the one their
        // hello asked for, or the smaller one. A watcher stays sideless.
        if (world.match && !client.watching) {
          const team = world.match.assignTeam(world, world.players.get(client.id), cleanTeam(msg.data.t));
          console.log('  ' + client.name + ' fights for ' + team.toUpperCase());
        }
        for (const [item, n] of STOCK) world.players.get(client.id).inventory.add(item, n);
        if (Number.isFinite(HUNGER)) world.players.get(client.id).body.hunger = Math.max(0, Math.min(100, HUNGER));
        ws.send(encode(S_WELCOME, world.hello(client.id)));
        broadcast(S_JOIN, { id: client.id, n: client.name }, ws);
        console.log(
          `  + ${client.name} (#${client.id})${client.watching ? ' WATCHING' : ''} from ${where} — ${clients.size} here` +
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
            `${claim.x.toFixed(1)}, ${claim.z.toFixed(1)} — ${r.why ?? 'lit'}`
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
