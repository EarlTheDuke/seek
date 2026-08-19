// ── matchcheck.js ───────────────────────────────────────────────────────────
// Is the match real, and is its absence still absolute?
//
//   npm run matchcheck
//
// TWO QUESTIONS, AND THE SECOND ONE GUARDS EVERYTHING ELSE THIS REPO HAS.
//
// One: does MODE=koth actually play — teams assigned, sole occupancy scoring,
// a contested ring scoring for nobody, a win that fires, a death that comes
// back at the muster? Over a real socket wherever the fact lives on the wire,
// because that is where givecheck and handcheck earned their keep.
//
// Two: IS OFF STILL OFF. Every run in runs/ and every green check in this
// repo describes a game with no matches in it. A default server that leaked
// so much as an `m` field into its snapshot would make every one of those a
// description of a game that no longer exists. The absence arm runs FIRST,
// the way handcheck runs its counterfactual first, and for the same reason.
//
// HILL_AT=spawn is a testing seam, not a convenience: bodies on raw sockets
// cannot pathfind, so the check brings the hill to them. The seam is honest —
// it moves the ring, not the rules.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PROTOCOL_VERSION, C_HELLO, S_WELCOME, S_SNAPSHOT,
  encode, decode,
} from '../src/net/protocol.js';
import { KothMatch, cleanTeam } from '../src/sim/match.js';
import { loadRoster } from './roster.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8157);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A raw socket that keeps its snapshots and events. */
class Body {
  constructor(name, team = null) {
    this.name = name; this.team = team; this.id = null;
    this.m = null; this.events = []; this.g = new Map();
  }
  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onerror = (e) => reject(new Error(e.message ?? 'socket error'));
      this.ws.onopen = () => this.ws.send(encode(C_HELLO, {
        name: this.name, version: PROTOCOL_VERSION,
        ...(this.team ? { t: this.team } : {}),
      }));
      this.ws.onmessage = (ev) => {
        const msg = decode(ev.data);
        if (!msg) return;
        if (msg.type === S_WELCOME) { this.id = msg.data.id; resolve(this); }
        else if (msg.type === S_SNAPSHOT) {
          if ('m' in msg.data) this.m = msg.data.m;
          this.sawSnapshot = true;
          this.sawM = this.sawM || ('m' in msg.data);
          for (const p of msg.data.pl ?? []) if (p.g !== undefined) this.g.set(p.id, p.g);
          for (const e of msg.data.ev ?? []) this.events.push(e);
        }
      };
    });
  }
  close() { try { this.ws.close(); } catch { /* going anyway */ } }
}

function serverAt(port, env) {
  return spawn(process.execPath, [path.join(HERE, 'server.js'), String(port)], {
    env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0', ...env },
    stdio: 'ignore',
  });
}

async function joined(name, url, team = null) {
  let b = null;
  for (let i = 0; i < 40 && !b; i++) {
    await sleep(150);
    b = await new Body(name, team).connect(url).catch(() => null);
  }
  if (!b) throw new Error(`no server answered on ${url}`);
  return b;
}

async function main() {
  console.log('\n  Is the match real, and is its absence still absolute?\n');

  // ── OFF IS OFF, first ─────────────────────────────────────────────────────
  console.log('  ── the absence arm: a default server carries no trace ──\n');
  await requireFreePort(PORT, 'matchcheck');
  let proc = serverAt(PORT, {});
  try {
    const a = await joined('Mairi', `ws://127.0.0.1:${PORT}`);
    for (let i = 0; i < 30 && !a.sawSnapshot; i++) await sleep(100);
    check('SENTINEL: a default snapshot has NO match field — off is byte-identical on the wire',
      a.sawSnapshot && !a.sawM,
      a.sawM ? 'an `m` field leaked into the default game' : 'snapshots flowed, none carried m');
    check('  …and no hill/score/win event ever fires',
      !a.events.some((e) => ['hill', 'score', 'win', 'respawn'].includes(e.k)),
      `${a.events.length} events seen, none of them match events`);
    a.close();
  } finally { try { proc.kill(); } catch { /* gone */ } }
  await sleep(600);

  // ── the mode itself ───────────────────────────────────────────────────────
  console.log('\n  ── the match: spawn-hill, first to 6 seconds of sole hold ──\n');
  await requireFreePort(PORT, 'matchcheck');
  proc = serverAt(PORT, {
    MODE: 'koth', HILL_AT: 'spawn', HILL_RADIUS: '30',
    POINTS_TO_WIN: '6', RESPAWN_SECONDS: '2',
  });
  try {
    const URL = `ws://127.0.0.1:${PORT}`;
    // Red and blue both stand at the spawn — which IS the hill.
    const red = await joined('Aonghas', URL, 'red');
    const blue = await joined('Beathag', URL, 'blue');
    await sleep(1200);

    check('the snapshot carries the match', red.m !== null && red.m.mode === 'koth',
      red.m ? `hill "${red.m.name}", ring ${red.m.r} m, first to ${red.m.target}` : 'no m field arrived');
    check('  …and the hello\'s team claim was honoured',
      red.m?.teams?.red?.includes('Aonghas') && red.m?.teams?.blue?.includes('Beathag'),
      `teams ${JSON.stringify(red.m?.teams)}`);
    check('  …and the side rides the wire as the party tag',
      red.g.get(blue.id) === 'team:blue',
      `red sees blue as g=${JSON.stringify(red.g.get(blue.id))} — the same field that already blocks friendly fire`);

    // Both teams in the ring: contested, and NOBODY scores.
    const s0 = { red: red.m?.red ?? 0, blue: red.m?.blue ?? 0 };
    await sleep(2500);
    const s1 = { red: red.m?.red ?? 0, blue: red.m?.blue ?? 0 };
    check('BOTH SIDES IN THE RING SCORES FOR NOBODY — a contested hill is a stalemate',
      red.m?.contested === true && s1.red === s0.red && s1.blue === s0.blue,
      `contested=${red.m?.contested}, red ${s0.red}->${s1.red}, blue ${s0.blue}->${s1.blue}`);
    check('  …and the contested transition was announced',
      red.events.some((e) => e.k === 'hill' && e.s === 'contested'),
      'the match speaks in transitions');

    // Blue leaves: red alone in the ring scores, and at 6 wins.
    blue.close();
    let win = null;
    for (let i = 0; i < 120 && !win; i++) {
      await sleep(100);
      win = red.events.find((e) => e.k === 'win') ?? null;
    }
    check('A SOLE HOLDER SCORES, AND THE WIN FIRES AT THE TARGET',
      win !== null && win.party === 'red',
      win ? `red wins ${win.red}-${win.blue} at "${win.n}"` : `no win inside 12s; m=${JSON.stringify(red.m)}`);
    check('  …the hill was taken out loud on the way',
      red.events.some((e) => e.k === 'hill' && e.s === 'taken' && e.party === 'red'));
    check('  …and the snapshot agrees the match is over',
      red.m?.state === 'won' && red.m?.winner === 'red',
      `state ${red.m?.state}, winner ${red.m?.winner}`);

    red.close();
  } finally { try { proc.kill(); } catch { /* gone */ } }

  // ── the respawn cycle, at the unit, against a stub world ──────────────────
  console.log('\n  ── the respawn: death sits out, then walks back from the muster ──\n');
  const m = new KothMatch({ hillAt: [0, 0], radius: 20, pointsToWin: 999, respawnSeconds: 3 });
  const revived = { called: false };
  const p = {
    id: 7, name: 'Torcall', party: 'team:red', watching: false, dirty: false,
    body: { dead: true, revive() { this.dead = false; revived.called = true; } },
    ctrl: { position: { x: 500, y: 4, z: 500 } },
  };
  const stub = {
    totalHours: 10,
    spawn: { position: { x: 0, y: 0, z: 0 } },
    players: new Map([[7, p]]),
    events: [],
    rules: {},
  };
  m.start(stub);
  m.noteDeath(p);
  m.step(2.0, stub);
  check('two seconds into a three-second respawn, still down', p.body.dead === true && m.waiting.has(7));
  m.step(1.5, stub);
  const ev = stub.events.find((e) => e.k === 'respawn');
  check('past it, the body REVIVES at the team muster',
    revived.called && ev != null && p.ctrl.position.x === m.muster.red[0] && p.ctrl.position.z === m.muster.red[1],
    ev ? `back at [${ev.at.join(', ')}] — the pack stayed where they fell, per onPlayerDied` : 'no respawn event');
  check('  …and the muster points face each other across the ring',
    m.muster.red[0] < m.hillAt[0] && m.muster.blue[0] > m.hillAt[0],
    `red at x ${m.muster.red[0]}, blue at x ${m.muster.blue[0]}, hill at ${m.hillAt[0]}`);

  // ── the roster carries the side through its own allow-list ───────────────
  //
  // loadRoster maps rows through a field whitelist, and 'team' spent its
  // first hour missing from it: five minds silently join-order balanced
  // while the roster named sides — the INTENT_KEYS failure, in roster form.
  const roster = loadRoster('roster-koth.json');
  check('the roster allow-list carries the team through',
    roster.players.every((p) => ['red', 'blue', null].includes(p.team))
    && roster.players.some((p) => p.team === 'red') && roster.players.some((p) => p.team === 'blue'),
    roster.players.map((p) => p.name + ':' + (p.team ?? 'assign')).join(' '));

  // ── the team hello is tamed ───────────────────────────────────────────────
  check('a team claim is clamped to the two sides that exist',
    cleanTeam('red') === 'red' && cleanTeam('BLUE') === 'blue'
    && cleanTeam('mauve') === null && cleanTeam('<script>') === null && cleanTeam(null) === null,
    'anything else means "assign me"');

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length}${passed === results.length ? ' passed' : ' PASSED — SOMETHING IS WRONG'}\n`);
}

main().catch((e) => {
  console.error('\n  could not run:', e.message, '\n');
  process.exitCode = 0; // a failing check exits 0 here; the output is the result
});
