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
import { BOW } from '../src/config.js';
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
  // ── WHOSE KILL? ──
  //
  // This check used to watch deer hit points fall and a carcass be announced,
  // and call either one proof. Neither is: nothing on the wire said who did it,
  // so a wolf eating a deer read as an agent hunting one. It passed a run in
  // which the agent loosed ZERO arrows — 5/6, with "AND IT BROUGHT ONE DOWN"
  // green — which is the exact shape of a green check that lies.
  //
  // The kill event now carries `by`, and `agent.kills` holds only the ones with
  // this agent's id on them. Hit points and carcasses are still watched, but as
  // CONTEXT printed at the end, never as the verdict.
  const deerHp = new Map();
  let lowest = Infinity;
  let sawShot = false;
  let anyDeerDown = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 150_000 && !agent.kills.length) {
    agent.update(1 / 30);
    if (agent.intent.primary) sawShot = true;
    for (const c of agent.snapshot?.cr ?? []) {
      if (c.k !== 'deer') continue;
      const was = deerHp.get(c.i);
      if (was !== undefined && c.h < was) lowest = Math.min(lowest, c.h);
      deerHp.set(c.i, c.h);
      if (c.h <= 0) anyDeerDown = true;
    }
    if (agent.memory.entries.some((e) => e.text.includes('went down'))) anyDeerDown = true;
    await sleep(1000 / 30);
  }
  const killed = agent.kills.length > 0;
  const secs = ((Date.now() - t0) / 1000).toFixed(0);

  check('it drew the bow at all', sawShot,
    sawShot ? 'held `primary` — which no agent in this project had ever done' : 'never once held the trigger');

  check('it loosed arrows', (agent.arrows ?? 0) > 0, `${agent.arrows ?? 0} aimed shots in ${secs} s`);

  // ── every release of the string, meant or not ──
  //
  // The server edge-detects `intent.primary`: any true -> false is an arrow, so
  // a body that changes its mind mid-draw fires one without deciding to. Those
  // shots leave at as little as a third of the solver's launch speed, in
  // whatever direction it was turning, and NOTHING counted them — `arrows` only
  // ever counted the deliberate ones. If these outnumber the aimed shots, the
  // body is spraying the hillside while believing it has not fired.
  const rel = agent.releases ?? [];
  const stray = rel.filter((r) => r.loosed && r.why !== 'aimed');
  check('it does not fire arrows it never meant to', stray.length === 0,
    `${rel.filter((r) => r.why === 'aimed').length} aimed, ${stray.length} loosed by letting go mid-draw`);
  if (stray.length) {
    const held = stray.map((r) => r.held);
    console.log(`      strays held ${Math.min(...held).toFixed(2)}-${Math.max(...held).toFixed(2)} s ` +
      `(full draw is ${BOW.drawTime} s, so they left at a fraction of the speed the solver assumed)`);
  }

  check("its own arrows drew blood", (agent.wounds?.length ?? 0) + (agent.kills?.length ?? 0) > 0,
    `${agent.wounds?.length ?? 0} wounds, ${agent.kills?.length ?? 0} kills` +
    (lowest < Infinity ? ` · some deer went to ${lowest} hp (whoever did it)` : ''));

  check('AND IT BROUGHT ONE DOWN', killed,
    killed ? `${agent.kills.map((k) => k.what).join(', ')} inside ${secs} s`
      : `not in ${secs} s${anyDeerDown ? ' — a deer did die, but not by this agent\'s hand' : ''}`);

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
