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
import { AGENTS, BOW } from '../src/config.js';
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
  // ── WHERE THE HERDS ACTUALLY WERE ──
  //
  // One run in seven ends with no kill and no arrows, and every instrument this
  // check has is downstream of a shot: the arrow table needs a release and the
  // refusal log needs a resolved quarry. Neither fires on the failure that
  // matters, so "150 s and nothing died" has read the same whether the body was
  // stalking a deer it could not shoot or walking an empty hillside.
  //
  // Those are different bugs. `resolve` falls through to `roam()` when nothing
  // in the snapshot is labelled "a deer" — SILENTLY, and roaming looks exactly
  // like stalking from outside. So sample the hillside once a second and keep
  // the three facts that tell them apart: was there a deer in the snapshot at
  // all, how far was the nearest one, and had the body actually locked onto one
  // (`target.quarry`) or was it wandering for want of a quarry.
  //
  // `AGENTS.shootRange` is 26 m, so the count of samples INSIDE that is the
  // number of seconds in which a shot was ever physically on the table. A run
  // with zero of them was never a marksmanship failure whatever the miss table
  // says.
  const trace = [];
  let sampleAt = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 150_000 && !agent.kills.length) {
    agent.update(1 / 30);
    if (agent.intent.primary) sawShot = true;
    let deerN = 0;
    let nearest = Infinity;
    for (const c of agent.snapshot?.cr ?? []) {
      if (c.k !== 'deer') continue;
      deerN++;
      nearest = Math.min(nearest, Math.hypot(c.p[0] - agent._x, c.p[2] - agent._z));
      const was = deerHp.get(c.i);
      if (was !== undefined && c.h < was) lowest = Math.min(lowest, c.h);
      deerHp.set(c.i, c.h);
      if (c.h <= 0) anyDeerDown = true;
    }
    const now = Date.now() - t0;
    if (now >= sampleAt) {
      sampleAt = now + 1000;
      trace.push({
        t: Math.round(now / 1000),
        n: deerN,
        d: nearest === Infinity ? null : Math.round(nearest),
        // ── three states, and lumping them was the instrument's first lie ──
        // "not locked on" read as "could not find a deer" on the first run of
        // this block, and 14 of its 131 samples were nothing of the kind:
        // `act` sets `this.target = null` the moment a non-quarry target is
        // ARRIVED at, and `resolve` only re-runs every `retargetSeconds`, so a
        // body between two targets has no target at all and is not roaming for
        // want of anything. Only `roam` — a target that exists and carries no
        // `quarry` flag while the goal IS hunt — is `resolve` failing to find a
        // deer, which is the thing this check came here to measure.
        q: agent.target?.quarry === true,
        roam: !!agent.target && agent.target.quarry !== true,
        goal: agent.goal?.kind ?? '?',
      });
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
    console.log('\n      every arrow, against what the bow promised:');
    for (const s of shots) {
      console.log(
        `        ${String(s.dist).padStart(5)} m  ` +
          `vsModel ${s.vsModel > 0 ? '+' : ''}${s.vsModel} m  across ${s.across > 0 ? '+' : ''}${s.across} m  ` +
          `(pitch ${s.pitch}°, eye ${s.eye} m, hit ${s.hit})` +
          // The control: our own model said it would come down at `pred` m down
          // the shot line, and it actually landed `model` m from that spot.
          // Small means the bow is understood and the aim is at fault; large
          // means the model is, and no amount of aiming will fix it.
          (s.pred === null ? '' : `\n                 model said it would land at ${s.pred} m — it was ${s.model} m from there`)
      );
    }
    const mean = (k) => (shots.reduce((a, s) => a + (s[k] ?? 0), 0) / shots.length).toFixed(1);
    console.log(`        mean: vsModel ${mean('vsModel')} m, across ${mean('across')} m over ${shots.length} arrows`);
    // ── and the number that is NOT marksmanship, kept where it can be seen ──
    // `along` is the impact against the deer's chest, and a shaft that goes
    // clean through a chest still lands ten to fourteen metres further on. It
    // is printed because it is a fact, and labelled because a run of it was
    // once read as a ballistics bias and put at the top of the queue.
    console.log(`        (raw \`along\` vs the animal: ${mean('along')} m — mostly the ` +
      `geometry of a two-degree descent, not the archer. See ballisticscheck.)`);
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

  // ── THE HILLSIDE, and it is the verdict on any run that killed nothing ──
  //
  // Read this before the arrow table on a red run. The tables above only exist
  // downstream of a shot; this one says whether a shot was ever available, and
  // the last line names which of the four failures actually happened so nobody
  // has to infer it from three sets of counts that all read "nothing happened".
  if (trace.length) {
    const withDeer = trace.filter((s) => s.n > 0);
    const ranges = withDeer.map((s) => s.d).sort((a, b) => a - b);
    const inRange = withDeer.filter((s) => s.d <= AGENTS.shootRange);
    const locked = trace.filter((s) => s.q);
    // `resolve` genuinely failing to find a deer: a hunting goal, a target that
    // exists, and no quarry on it. Everything else that is "not locked on" is
    // either between retargets or not hunting at all, and neither is a herd
    // problem.
    const roamed = trace.filter((s) => s.roam && s.goal === 'hunt');
    const notHunting = trace.filter((s) => s.goal !== 'hunt');
    const pc = (n) => `${Math.round((n / trace.length) * 100)}%`;
    console.log('\n      where the herds actually were, sampled once a second:');
    console.log(`        a deer in the snapshot   ${String(withDeer.length).padStart(3)}/${trace.length} samples (${pc(withDeer.length)})` +
      (withDeer.length ? `, ${Math.min(...withDeer.map((s) => s.n))}-${Math.max(...withDeer.map((s) => s.n))} at a time` : ''));
    if (ranges.length) {
      console.log(`        the nearest one          closest ${ranges[0]} m · median ${ranges[Math.floor(ranges.length / 2)]} m · furthest ${ranges.at(-1)} m`);
    }
    console.log(`        a quarry was LOCKED ON   ${String(locked.length).padStart(3)}/${trace.length} samples (${pc(locked.length)})`);
    console.log(`        hunting but NO deer found${String(roamed.length).padStart(3)}/${trace.length} — \`resolve\` fell through to roam() with a hunt goal` +
      (notHunting.length ? ` (and ${notHunting.length} not hunting at all)` : ''));
    console.log(`        inside shootRange ${AGENTS.shootRange} m    ${String(inRange.length).padStart(3)}/${trace.length} samples (${pc(inRange.length)})` +
      ' — the only seconds in which a shot was ever on the table');

    if (!killed) {
      // Four failures, and they are NOT interchangeable: an empty hillside is a
      // world bug, a herd that stays at 80 m is an approach bug, a refusal at
      // 20 m is a sightline bug, and an arrow that leaves and misses is the
      // only one that is marksmanship. Three sessions have read the fourth into
      // evidence for one of the first three.
      const why = withDeer.length === 0
        ? 'NOT ONE DEER in the snapshot all run — an empty hillside, not an archer'
        : locked.length === 0
          ? `deer were in the snapshot but a quarry never resolved — ${withDeer.length} samples saw one and \`resolve\` still roamed ${roamed.length} of them`
          : inRange.length === 0
            ? `it never closed to ${AGENTS.shootRange} m — nearest all run was ${ranges[0]} m, so no shot was ever possible`
            : (agent.arrows ?? 0) === 0
              ? `it was inside ${AGENTS.shootRange} m for ${inRange.length} s and never loosed — read the refusal table above, not the ballistics`
              : `it loosed ${agent.arrows} arrows from inside ${AGENTS.shootRange} m and none of them killed — this one IS marksmanship`;
      console.log(`\n      so the reason nothing died: ${why}`);
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
