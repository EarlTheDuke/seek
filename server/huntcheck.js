// ── huntcheck.js ────────────────────────────────────────────────────────────
// Can an agent actually KILL something?
//
//   npm run hunt-check      (npm run huntcheck)
//
// The check that should have existed since minds were added, and did not. Every
// existing test of an agent asked whether it deliberated, whether it walked, and
// whether its decisions were logged — all of which passed, for years, while
// `primary` appeared in neither agent.js nor hunter.js. No agent had ever drawn
// a bow. `hunt` meant "walk toward the deer" and meant it for ever, and nothing
// in the suite could tell the difference between a hunter and a follower.
//
// So this one refuses to be satisfied by intent. It sets a real agent on a real
// deer over a real socket and waits for the animal's hit points to go down.
//
// Same shape as shotcheck and for the same reason: the things that break in this
// game break BETWEEN the client and the server, and a test that drives SimWorld
// directly cannot see any of them.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Agent } from '../src/net/agent.js';
import { makeRandom } from '../src/world/noise.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8096);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * A provider that always says the same thing.
 *
 * The point of this check is the BODY, not the mind: whether an agent told to
 * hunt a deer can bring one down. A model in the loop would add a network call,
 * a cost and a source of flakiness to a question that has nothing to do with it.
 */
const alwaysHunt = {
  name: 'always-hunt',
  async decide() {
    return { kind: 'hunt', quarry: 'a deer' };
  },
};

async function main() {
  console.log('\n  Can an agent kill a deer?\n');
  await requireFreePort(PORT, 'huntcheck');

  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    // No bears and no rivals: the question is whether the bow works, and a bear
    // eating the archer answers a different one.
    env: { ...process.env, DANGER: 'no-bears', MINDS_HUNTERS: '0' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  let agent = null;
  for (let i = 0; i < 40 && !agent; i++) {
    await sleep(150);
    agent = await new Agent({ name: 'Hunter', provider: alwaysHunt, rand: makeRandom('huntcheck') })
      .connect(URL)
      .catch(() => null);
  }
  if (!agent) throw new Error(`no server answered on ${URL}`);
  await sleep(600);
  check('an agent joined over a socket', agent.id !== null, `#${agent.id}`);

  // ── drive it in REAL time ──
  // The server ticks on a wall clock and rate-limits intents; stepping this in
  // a tight loop sends a thousand packets describing one second and teaches us
  // nothing about what a real agent does.
  const deerHp = new Map();
  let lowest = Infinity;
  let sawShot = false;
  let killed = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 150_000 && !killed) {
    agent.update(1 / 30);
    if (agent.intent.primary) sawShot = true;
    for (const c of agent.snapshot?.cr ?? []) {
      if (c.k !== 'deer') continue;
      const was = deerHp.get(c.i);
      if (was !== undefined && c.h < was) lowest = Math.min(lowest, c.h);
      deerHp.set(c.i, c.h);
      if (c.h <= 0) killed = true;
    }
    // A carcass is the other way a kill shows: the server drops the creature
    // from `cr` and announces it. Either is proof.
    if (agent.memory.entries.some((e) => e.text.includes('went down'))) killed = true;
    await sleep(1000 / 30);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);

  check('it drew the bow at all', sawShot,
    sawShot ? 'held `primary` — which no agent in this project had ever done' : 'never once held the trigger');

  check('it loosed arrows', (agent.arrows ?? 0) > 0, `${agent.arrows ?? 0} loosed in ${secs} s`);

  check('a deer actually lost hit points', lowest < Infinity,
    lowest < Infinity ? `down to ${lowest} hp` : 'nothing was ever hurt');

  check('AND IT BROUGHT ONE DOWN', killed, killed ? `inside ${secs} s` : `not in ${secs} s`);

  // The bit that makes a miss worth having: an agent that shot and missed
  // should be able to say so afterwards, in a sentence with a number in it.
  const misses = agent.memory.entries.filter((e) => e.text.includes('a miss'));
  const noShot = agent.memory.entries.filter((e) => e.text.startsWith('no shot'));
  check('it can say what went wrong', misses.length + noShot.length > 0 || killed,
    `${misses.length} remembered misses, ${noShot.length} refused shots`);
  if (misses.length) console.log(`\n      e.g. "${misses.at(-1).text}"`);
  if (noShot.length) console.log(`      e.g. "${noShot.at(-1).text}"`);

  // ── THE INSTRUMENT ──
  // Every arrow, as the gap between where the solver said it would arrive and
  // where it actually landed. Printed whatever the verdict, because a green run
  // that took four arrows to do what should take one is still a body that
  // cannot reliably hunt, and aggregate counts never said WHICH WAY it was
  // wrong — an over-lead and an under-lead produce the same tally. See
  // `Agent.howItMissed`.
  const shots = agent.shots ?? [];
  if (shots.length) {
    console.log('\n      every arrow, against its own aim point:');
    for (const s of shots) {
      console.log(
        `        ${String(s.dist).padStart(5)} m  ` +
          `along ${s.along > 0 ? '+' : ''}${s.along} m  across ${s.across > 0 ? '+' : ''}${s.across} m  ` +
          `(pitch ${s.pitch}°, eye ${s.eye} m, hit ${s.hit})` +
          // The control: our own model said it would come down at `pred` m down
          // the shot line, and it actually landed `model` m from that spot.
          // Small means the bow is understood and the aim is at fault; large
          // means the model is, and no amount of aiming will fix it.
          (s.pred === null ? '' : `\n                 model said it would land at ${s.pred} m — it was ${s.model} m from there`)
      );
    }
    const mean = (k) => (shots.reduce((a, s) => a + s[k], 0) / shots.length).toFixed(1);
    console.log(`        mean: along ${mean('along')} m, across ${mean('across')} m over ${shots.length} arrows`);
  } else {
    console.log('\n      no arrow missed, so there is nothing to measure');
  }

  // The other half, and on the evidence the bigger half: every time the body
  // decided NOT to shoot, with the reason and the range. A refusal produces no
  // arrow, no event and no line anybody reads, so it is the commonest thing
  // that happens to a hunting body and the least visible.
  const refused = agent.refusals ?? [];
  if (refused.length) {
    const byReason = new Map();
    for (const r of refused) {
      const kind = r.why.replace(/ \d+ m out$/, '');
      const e = byReason.get(kind) ?? { n: 0, ranges: [], outs: [] };
      e.n++;
      e.ranges.push(r.d);
      const m = /(\d+) m out/.exec(r.why);
      if (m) e.outs.push(Number(m[1]));
      byReason.set(kind, e);
    }
    console.log('\n      every time it refused the shot:');
    for (const [kind, e] of byReason) {
      const where = e.outs.length ? `, obstruction ${Math.min(...e.outs)}-${Math.max(...e.outs)} m out` : '';
      console.log(`        ${String(e.n).padStart(3)} x  ${kind}  (deer at ${Math.min(...e.ranges)}-${Math.max(...e.ranges)} m${where})`);
    }
  }

  agent.close();
  stop();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n  huntcheck could not run: ${err.message}\n`);
  process.exit(1);
});
