// ── duelcheck.js ────────────────────────────────────────────────────────────
// Can one mind pick a fight with another, and can the other one tell who?
//
//   npm run duelcheck
//
// PvP DAMAGE HAS BEEN FULLY BUILT FOR MONTHS and no agent could reach it.
// `canHarm`, the player hit geometry and the refusal event all existed and
// `shotcheck` covered them — but `hunt` takes quarry, a player is not quarry,
// and there was no other verb. A mind could not CHOOSE to shoot anybody.
//
// The second half was worse and quieter: a body that got shot was told "an
// arrow hit me for 11" and nothing else. The event has carried the shooter's id
// since the day it was written and nobody ever resolved it to a name, so a mind
// had no name to put in a reply even once it had a verb. Retaliation was
// impossible; a duel could not happen.
//
// Two assertions, and the second is the one that was missing for months.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PROTOCOL_VERSION, C_HELLO, C_INTENT, S_WELCOME, S_SNAPSHOT,
  encode, decode,
} from '../src/net/protocol.js';
import { GOAL_IDS, sanitiseGoal } from '../src/minds/goals.js';
import { Agent, namesTheSame } from '../src/net/agent.js';
import { makeRandom } from '../src/world/noise.js';
import { ScriptedProvider } from '../src/minds/providers.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8082);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  console.log('\n  Can a mind pick a fight, and can the other one tell who?\n');

  // ── 1. the verb exists and survives the door ────────────────────────────
  check('there is a verb for going after a PERSON', GOAL_IDS.includes('attack'),
    GOAL_IDS.join(' '));
  const g = sanitiseGoal({ kind: 'attack', target: 'Tormod', why: 'he lied about the deer' });
  check('  …and it survives sanitising with its target and its reason',
    g?.kind === 'attack' && g.target === 'Tormod' && g.why === 'he lied about the deer',
    JSON.stringify(g));

  // ── 2. it resolves to a SHOT, not a walk ────────────────────────────────
  //
  // `quarry: true` is what routes a target into the shoot path. Anything that
  // merely walks somewhere would look identical from outside and never fire an
  // arrow — which is exactly how `hunt` failed silently for two whole runs.
  const body = Object.assign(Object.create(Agent.prototype), {
    name: 'Ailsa', id: 4, rand: makeRandom('Ailsa'),
    provider: new ScriptedProvider(makeRandom('p')),
    _x: 0, _z: 0, wanderAngle: 0, taken: new Set(),
    others: new Map([[9, 'Tormod']]),
    snapshot: { cr: [], pl: [{ id: 9, p: [0, 12, -18] }] },
  });
  const spot = body.resolve({ kind: 'attack', target: 'Tormod' });
  check('IT RESOLVES TO A SHOT AT THE PERSON, not a stroll toward them',
    spot?.quarry === true,
    spot?.quarry === true ? `aiming at ${Math.round(Math.hypot(spot.x, spot.z))} m` : JSON.stringify(spot));

  // …and it uses the same loose name matching everything else does, or a mind
  // saying "go for Tormod, the liar" walks into a field instead.
  const loose = body.resolve({ kind: 'attack', target: 'that liar Tormod' });
  check('  …and it finds them however the mind phrased the name',
    loose?.quarry === true, JSON.stringify(loose?.quarry ?? null));

  // ── 3. THE HALF THAT WAS MISSING: who shot me? ──────────────────────────
  await requireFreePort(PORT, 'duelcheck');
  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  try {
    // A real body on a real socket, so the event shape is the server's own.
    // Retried, because a freshly spawned server is not listening yet and a
    // single attempt is a race this check would lose about half the time.
    let victim = null;
    for (let i = 0; i < 40 && !victim; i++) {
      await sleep(150);
      const a = new Agent({
        name: 'Ailsa', rand: makeRandom('a'), provider: new ScriptedProvider(makeRandom('b')),
      });
      victim = await a.connect(URL).then(() => a).catch(() => null);
    }
    if (!victim) throw new Error(`no server answered on ${URL}`);
    await sleep(600);

    // Feed it the server's own hit event rather than staging a live duel: the
    // arrow flight is `shotcheck`'s job and already covered, and what is being
    // asked here is whether a NAME reaches the mind.
    victim.remember({ k: 'hit', id: victim.id, by: 9, n: 'Tormod', dmg: 11 });
    const said = victim.memory.all().map((e) => e.text ?? String(e)).join(' | ');
    check('A BODY LEARNS WHO SHOT IT, not merely that it was shot',
      /Tormod shot me/.test(said),
      said.split(' | ').filter((t) => /shot me/.test(t))[0] ?? said.slice(0, 90));

    check('  …and it keeps the name, so it has something to put in `attack`',
      victim.shotBy === 'Tormod', String(victim.shotBy));

    // The sentinel: an unnamed shooter must not become the string "undefined"
    // in a mind's memory. A prompt that says "undefined shot me for 11" is
    // worse than one that says "someone".
    const stray = new Agent({
      name: 'Morag', rand: makeRandom('c'), provider: new ScriptedProvider(makeRandom('d')),
    });
    stray.id = 5;
    stray.others = new Map();
    stray.remember({ k: 'hit', id: 5, by: 99, dmg: 7 });
    const strayText = stray.memory.all().map((e) => e.text ?? String(e)).join(' | ');
    check('  …and an unknown shooter reads as "someone", never as undefined',
      /someone shot me/.test(strayText) && !/undefined/.test(strayText),
      strayText.slice(0, 80));

    victim.close?.();
    stray.close?.();
    await sleep(200);
  } finally {
    stop();
    await sleep(300);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  could not run: ${err.message}\n`);
  process.exit(1);
});
