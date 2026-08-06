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
        // ── WHICH deer, not just whether there was one ──
        // `resolve` re-runs every `AGENTS.retargetSeconds` and picks the
        // NEAREST match, and there are eighteen to twenty-six of them milling
        // about. Two animals at similar range swap places and the body drops a
        // stalk it has spent twenty seconds on to start again on the other one
        // — which would throttle the shot rate exactly as observed while every
        // instrument here reported a deer present, locked on, and in range.
        // The id is the only thing that can see it.
        qid: agent.target?.quarry ? agent.target.id : null,
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
          // ── the deer, not the aim point ──
          // Everything else on this line measures the arrow against where we
          // CHOSE to aim, and `mark` is lead-adjusted — so a wrong lead reads
          // as a perfect shot on every other column. This is the only number
          // here that can see it.
          (s.leadAcross === null || s.leadAcross === undefined
            ? '\n                 the quarry had left the snapshot by the time it landed'
            : `\n                 the deer itself was ${Math.abs(s.leadAcross)} m ` +
              `${s.leadAcross < 0 ? 'LEFT' : 'RIGHT'} of the mark and ${Math.abs(s.leadAlong)} m ` +
              `${s.leadAlong < 0 ? 'nearer' : 'further'} than solved for`) +
          // The control: our own model said it would come down at `pred` m down
          // the shot line, and it actually landed `model` m from that spot.
          // Small means the bow is understood and the aim is at fault; large
          // means the model is, and no amount of aiming will fix it.
          (s.pred === null ? '' : `\n                 model said it would land at ${s.pred} m — it was ${s.model} m from there`)
      );
    }
    const mean = (k) => (shots.reduce((a, s) => a + (s[k] ?? 0), 0) / shots.length).toFixed(1);
    console.log(`        mean: vsModel ${mean('vsModel')} m, across ${mean('across')} m over ${shots.length} arrows`);
    // ── the sign split, because a tolerance on the mean cannot see a bias ──
    // Twelve arrows erring the same way is the finding whatever the magnitude
    // is; ballisticscheck learned that the hard way and this is the same test
    // applied to the lead. A consistent sign here is an over- or under-lead.
    const led = shots.filter((s) => s.leadAcross !== null && s.leadAcross !== undefined);
    if (led.length) {
      const right = led.filter((s) => s.leadAcross > 0).length;
      console.log(`        LEAD: mean ${(led.reduce((a, s) => a + s.leadAcross, 0) / led.length).toFixed(1)} m across ` +
        `over ${led.length} arrows — ${right} right of the mark, ${led.length - right} left. ` +
        'A split is spread; all one way is a lead the solver is getting wrong.');
    }
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

  // ── DID STEPPING ASIDE EVER WORK? ──
  //
  // The other instrument gap, and the same shape as the refusal log before
  // somebody built it: `clearSpotNear` exists to answer "ground in the way",
  // it writes a line into memory when it fires, and NOTHING counted whether it
  // was tried or whether trying it produced a shot. A body walking sideways for
  // ever and a body that never stepped aside at all both read as silence.
  //
  // `walked` against `net` is the number to read. The spot is re-solved every
  // tick from wherever the body now stands, six metres perpendicular to a line
  // of sight that ROTATES as it moves — so a detour that never arrives shows up
  // as tens of metres walked to end up a few metres from where it started.
  // See `Agent.openDetour`.
  const detours = agent.detours ?? [];
  // Asked per TICK, not per episode: how often the body wanted a way round the
  // obstruction, and how often `clearSpotNear` had nothing to offer. A high
  // `nowhere` share means the six candidate spots it tries are the wrong six —
  // they are all across the line of sight at whatever height the ground there
  // happens to be, and against a crest that is the one direction that does not
  // help. Closing is then the body's only remaining answer, and closing on a
  // crest walks you onto the animal.
  const asked = agent.detourAsked ?? { ground: 0, timber: 0 };
  const none = agent.detourNone ?? { ground: 0, timber: 0 };
  if (asked.ground + asked.timber > 0) {
    console.log('\n      when the line was blocked, was there anywhere to step to?');
    for (const k of ['ground', 'timber']) {
      if (!asked[k]) continue;
      const pcNone = Math.round((none[k] / asked[k]) * 100);
      console.log(`        ${k.padEnd(6)}  asked ${String(asked[k]).padStart(4)} times, ` +
        `NOWHERE to go ${String(none[k]).padStart(4)} (${pcNone}%)`);
    }
  }
  if (detours.length) {
    const done = detours.filter((e) => e.outcome);
    const by = new Map();
    for (const e of done) by.set(e.outcome, (by.get(e.outcome) ?? 0) + 1);
    const open = detours.length - done.length;
    const cleared = by.get('a shot came on') ?? 0;
    const sum = (k, rows = done) => rows.reduce((a, e) => a + (e[k] ?? 0), 0);
    console.log('\n      when it stepped aside for a clear line — did it work?');
    console.log(`        ${detours.length} detours attempted, ${cleared} ended with a shot on ` +
      '(read the walk beside it — a shot after 0 m is the line clearing on its own, not the step)');
    for (const [outcome, n] of [...by].sort((a, b) => b[1] - a[1])) {
      console.log(`          ${String(n).padStart(3)} x  ${outcome}`);
    }
    if (open) console.log(`          ${String(open).padStart(3)} x  still walking when the run ended`);
    // The arithmetic that proves the instrument is not lying: every episode
    // opened must have exactly one outcome or still be open. Three instruments
    // in this project have reported confidently on something they could not
    // measure; this one says so out loud if the books do not balance.
    const balanced = done.length + open === detours.length;
    console.log(`        (${done.length} closed + ${open} open = ${detours.length} opened${balanced ? '' : ' — THE TALLY DOES NOT BALANCE, distrust this block'})`);
    if (done.length) {
      const walked = sum('walked');
      const net = sum('net');
      console.log(`        it walked ${walked} m in total to end up ${net} m from where each detour began ` +
        `(${(walked / done.length).toFixed(0)} m per detour, net ${(net / done.length).toFixed(0)} m), ` +
        `over ${sum('secs').toFixed(0)} s`);
      console.log(`        ${sum('flips')} times it reversed the side it was stepping to — an oscillation, not a walk`);
      const worked = done.filter((e) => e.outcome === 'a shot came on');
      const failed = done.filter((e) => e.outcome !== 'a shot came on');
      const line = (label, rows) => rows.length
        ? `        ${label}: ${rows.length}, ${(sum('secs', rows) / rows.length).toFixed(1)} s and ` +
          `${(sum('walked', rows) / rows.length).toFixed(0)} m each, deer ` +
          `${Math.min(...rows.map((e) => e.d0))}-${Math.max(...rows.map((e) => e.d0))} m at the start`
        : null;
      for (const l of [line('the ones that worked', worked), line('the ones that did not', failed)]) {
        if (l) console.log(l);
      }
      // ── every detour, one line, because the AVERAGES hid the mechanism ──
      //
      // "2 m per detour toward a spot 6 m away" says it was abandoned; it does
      // not say what abandoned it. The range at the start against the range at
      // the end does, and it is one number: stepping sideways does not close
      // the distance, so if the animal drifts at all the slant crosses
      // `AGENTS.shootRange` and `aimAt` answers `too far` — which carries no
      // `blockedBy`, so the detour branch stops firing and the body turns and
      // walks straight back at the obstruction it just left.
      console.log('        each one, and what it cost:');
      for (const e of detours) {
        console.log(`          deer ${String(e.d0).padStart(3)} m -> ${String(e.d).padStart(3)} m  ` +
          `${String(Math.abs(e.step)).padStart(2)} m aside, walked ${String(e.walked).padStart(3)} m ` +
          `in ${e.secs.toFixed(1)} s  (${e.why})  ${e.outcome ?? 'still walking'}`);
      }
    }
  } else {
    console.log('\n      it never once stepped aside for a clear line');
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

    // ── DID IT KEEP THE SAME DEER? ──
    //
    // A stalk is a twenty-second investment and `resolve` re-runs every 2.5 s
    // on the NEAREST match. Everything above reports a body locked on a quarry
    // for 90% of a run without ever asking whether it was the SAME quarry, so a
    // body that swapped animals every few seconds and never finished an
    // approach reads identically to one patiently working a single deer.
    const onSomething = trace.filter((s) => s.qid != null);
    let swaps = 0;
    let longest = 0;
    let runLen = 0;
    for (let k = 0; k < trace.length; k++) {
      const id = trace[k].qid;
      const prev = k ? trace[k - 1].qid : null;
      if (id != null && prev != null && id !== prev) swaps++;
      if (id != null && id === prev) runLen++; else runLen = id != null ? 1 : 0;
      longest = Math.max(longest, runLen);
    }
    const distinct = new Set(onSomething.map((s) => s.qid)).size;
    console.log(`        it changed its mind about WHICH deer  ${swaps} times in ${onSomething.length} s ` +
      `on a quarry — ${distinct} different animals, longest unbroken stalk ${longest} s`);

    // ── DID IT FINISH WHAT IT HIT? ──
    //
    // The shape every red run in this session has: arrows that go HOME, wounds
    // spread across two or three animals, and nothing dead. A wounded deer runs
    // — so it is no longer the NEAREST one, and `resolve` picks the nearest.
    // The body then starts again on a fresh healthy animal and banks another
    // wound, for ever. Every green run, by contrast, put one arrow into one
    // deer and ate.
    //
    // The wound event now carries the individual's id, so this is answerable
    // for the first time: after hurting THAT one, was it ever the quarry again?
    const wounded = agent.wounds ?? [];
    if (wounded.length) {
      console.log('\n      after it wounded an animal, did it stay on that animal?');
      const afterFirst = (id, atHour) => trace.filter((s) => s.qid === id).length;
      for (const w of wounded) {
        const secondsOnIt = afterFirst(w.id, w.h);
        console.log(`        the ${w.what.toLowerCase()} it hit for ${w.dmg} (left at ${w.hp} hp, id ${w.id ?? '?'}) — ` +
          `it was the quarry for ${secondsOnIt} s of the run in total`);
      }
      const finished = wounded.filter((w) => (agent.kills ?? []).length && w.id != null).length;
      console.log(`        ${wounded.length} wounded, ${(agent.kills ?? []).length} killed` +
        (wounded.length && !(agent.kills ?? []).length
          ? ' — every arrow that went home was spent on an animal it then walked away from'
          : ''));
      if (finished === 0 && wounded.length && !(agent.kills ?? []).length) {
        console.log('        (a deer takes two arrows. Spread over two deer, that is two wounds and no dinner.)');
      }
    }

    if (!killed) {
      // SIX failures, and they are NOT interchangeable: an empty hillside is a
      // world bug, a herd that stays at 80 m is an approach bug, a refusal at
      // 20 m is a sightline bug, an arrow that goes home and leaves the animal
      // standing is a damage bug, and only an arrow that leaves and misses is
      // marksmanship. Three sessions have read the last into evidence for one
      // of the others.
      //
      // The two at the end were added the run this block was written, because
      // its FIRST version called a run "marksmanship" that loosed one arrow,
      // WOUNDED the deer with it, and spent the other 149 seconds refusing for
      // ground — the same class of lie the board told twice. A verdict line
      // that names the wrong bug is worse than no verdict line.
      const wounds = agent.wounds?.length ?? 0;
      const topRefusal = [...(refused ?? [])].reduce((acc, r) => {
        const k = r.why.replace(/ \d+ m out$/, '');
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
      const worst = Object.entries(topRefusal).sort((a, b) => b[1] - a[1])[0];
      const why = withDeer.length === 0
        ? 'NOT ONE DEER in the snapshot all run — an empty hillside, not an archer'
        : locked.length === 0
          ? `deer were in the snapshot but a quarry never resolved — ${withDeer.length} samples saw one and \`resolve\` still roamed ${roamed.length} of them`
          : inRange.length === 0
            ? `it never closed to ${AGENTS.shootRange} m — nearest all run was ${ranges[0]} m, so no shot was ever possible`
            : (agent.arrows ?? 0) === 0
              ? `it was inside ${AGENTS.shootRange} m for ${inRange.length} s and never loosed` +
                (worst ? ` — ${worst[1]} refusals, mostly "${worst[0]}"` : '') +
                '. A SIGHTLINE problem, not ballistics'
              : wounds > 0
                ? `its arrows went HOME — ${wounds} wound${wounds === 1 ? '' : 's'} and no kill off ` +
                  `${agent.arrows} shot${agent.arrows === 1 ? '' : 's'} in ${secs} s` +
                  (worst ? `, with ${worst[1]} refusals mostly "${worst[0]}"` : '') +
                  '. That is damage and shot RATE, not aim'
                : `it loosed ${agent.arrows} arrows from inside ${AGENTS.shootRange} m and every one missed — ` +
                  'this one IS the aim, and the LEAD column above is the place to read it';
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
