// ── puppet.js ───────────────────────────────────────────────────────────────
// An agent whose mind is you.
//
//   npm run serve                 (in one terminal)
//   npm run puppet                (in another)
//
// A provider is anything with `decide(brief) -> goal`. The scripted brain is
// one. A language model is another. This is a third: a provider that returns
// whatever the script below tells it to, so a person can drive an agent through
// every verb in the vocabulary and watch what the body actually does with it.
//
// WHY THIS EXISTS. Before paying a model to play, it is worth knowing what the
// model is being handed — whether each verb reaches the body at all, whether
// the brief contains enough to choose between them, and which levers are simply
// missing. A model that cannot see its own health cannot decide to retreat, and
// you would rather learn that from a free run than from a bill.
//
// Everything here goes over a real socket to a real server. Nothing is mocked.

import { Agent } from '../src/net/agent.js';
import { makeRandom } from '../src/world/noise.js';
import { briefToText } from '../src/minds/perception.js';
import { GOAL_IDS } from '../src/minds/goals.js';

const URL = process.argv[2] ?? 'ws://127.0.0.1:8080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A provider you drive by hand. Same interface a model implements. */
class PuppetProvider {
  constructor() {
    this.name = 'puppet';
    this.next = { kind: 'wander' };
    this.asked = 0;
    this.lastBrief = null;
  }
  async decide(brief) {
    this.asked++;
    this.lastBrief = brief;
    return this.next;
  }
}

const puppet = new PuppetProvider();
const agent = new Agent({ name: 'Puppet', provider: puppet, rand: makeRandom('puppet') });

console.log(`\n  Puppet — driving one agent by hand against ${URL}\n`);
try {
  await agent.connect(URL);
} catch (err) {
  console.error(`  could not connect: ${err.message}`);
  console.error('  is the server up?  npm run serve\n');
  process.exit(1);
}
await sleep(800);
console.log(`  joined as #${agent.id}, seed ${agent.seed}\n`);

/** Drive the body for `secs`, then report what the goal actually did. */
async function drive(goal, secs = 4) {
  puppet.next = goal;
  agent.goal = goal;
  const from = { x: agent.x, z: agent.z };
  const acted = { ...agent.acted };
  let target = null;
  let pressed = null;

  const steps = Math.round(secs * 30);
  for (let i = 0; i < steps; i++) {
    agent.update(1 / 30);
    if (!target && agent.target) target = { ...agent.target };
    for (const k of Object.keys(agent.acted)) {
      if (agent.acted[k] !== acted[k]) pressed = k;
    }
    await sleep(1000 / 30);
  }

  const moved = Math.hypot(agent.x - from.x, agent.z - from.z);
  const label = JSON.stringify(goal).padEnd(38);
  console.log(
    `    ${label} moved ${moved.toFixed(1).padStart(5)} m  ` +
      `${target ? `aimed at ${target.x.toFixed(0)},${target.z.toFixed(0)}` : 'no target'}` +
      `${pressed ? `  PRESSED ${pressed}` : ''}`
  );
  return { moved, target, pressed };
}

// ── every verb in the table, one at a time ──
console.log('  ── what the body does with each verb ──\n');
const others = [...agent.others.values()];
const someone = others[0] ?? 'someone';

await drive({ kind: 'wander' });
await drive({ kind: 'gather' }, 6);
await drive({ kind: 'hold' }, 2);
await drive({ kind: 'goTo', place: 'Broad Loch' });
await drive({ kind: 'makeCamp' }, 6);
await drive({ kind: 'hunt', quarry: 'a deer' });
await drive({ kind: 'approach', target: someone });
await drive({ kind: 'avoid', target: someone });
await drive({ kind: 'follow', target: someone }, 6);
await drive({ kind: 'guard', target: someone }, 6);
await drive({ kind: 'say', text: 'the puppet is testing its voice' }, 2);

const unused = GOAL_IDS.filter((id) => !agent.goalCounts[id] && id !== 'say');
console.log(`\n  verbs exercised: ${Object.keys(agent.goalCounts).join(', ')}`);
if (unused.length) console.log(`  NEVER REACHED THE BODY: ${unused.join(', ')}`);

// ── what a mind is actually handed ──
console.log('\n  ── the brief, verbatim — this is all a model would ever see ──\n');
console.log(briefToText(agent.brief()).split('\n').map((l) => '    ' + l).join('\n'));

console.log('\n  ── and the raw fields behind it ──\n');
const b = agent.brief();
for (const [k, v] of Object.entries(b)) {
  if (k === '_contacts') continue;
  const shown = Array.isArray(v) ? `[${v.length}] ${JSON.stringify(v).slice(0, 90)}` : JSON.stringify(v);
  console.log(`    ${k.padEnd(10)} ${shown}`);
}

console.log(`\n  decisions asked of the puppet: ${puppet.asked}`);
console.log('');
agent.close();
await sleep(200);
process.exit(0);
