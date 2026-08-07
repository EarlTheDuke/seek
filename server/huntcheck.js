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
import { AGENTS, BOW, PLAYER } from '../src/config.js';
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

// ── WHICH ARM IS LOADED ──
//
// This check is real-time on a wall clock and comes back red about a third of
// the time with nothing changed, so a run that does not say which arm it was is
// a run nobody can read afterwards. Printed at the top AND beside the detour
// table. `DETOUR=commit npm run huntcheck` for the committed arm, `DETOUR=close`
// for the closing one, `DETOUR=commit,close` for both — they are independent
// mechanisms and either can be read alone.
const DETOUR = (process.env.DETOUR ?? '').toLowerCase().split(/[,\s]+/).filter(Boolean);
const COMMIT_DETOUR = DETOUR.some((t) => /^(commit|on|yes|1|true)$/.test(t));
const CLOSE_DETOUR = DETOUR.includes('close');
// ── ...AND HOW FAR IT WILL SHOOT ──
//
//   SHOOTRANGE=40 npm run huntcheck
//
// The other half of the shot-rate question. `server/rangecheck.js` measured the
// accuracy half over a socket and it is emphatic: a standing deer is hit 21 of
// 21 from 12 m to 52 m, median 0.10 m from the chest, and led at a trot 11 of
// 12. THE BOW IS NOT WHY THERE ARE NO SHOTS, so 26 m is not a marksmanship
// number — it was cut from 45 on a DELIBERATION argument, which config.js
// states honestly: at 45 the body considered shots the ground would never
// allow, 19 refusals to 2 arrows.
//
// That argument is exactly what THIS check can measure and `rangecheck` cannot,
// because rangecheck plans a clear bearing before every shot and the body in a
// real hunt does not get to. So the ceiling is an arm here rather than an edit
// to config.js: unset is `AGENTS.shootRange` to the byte.
const SHOOT_RANGE = Number(process.env.SHOOTRANGE) > 0
  ? Number(process.env.SHOOTRANGE)
  : AGENTS.shootRange;

// ── ...AND WHICH SCENARIO ──
//
//   HUNTSEED=b npm run huntcheck
//
// THE SEED HERE HAS ALWAYS BEEN THE LITERAL 'huntcheck', so four runs of this
// check are not four samples: they differ only by real-time jitter, and the
// last A/B in this project got three near-duplicate control runs (all 72 s
// kills) and two identical twins in the treatment. Call it 2-3 distinct
// scenarios from eight runs. That is written into STATE.md as a standing trap
// and the only fix is to be able to change it.
//
// It seeds the AGENT's own choices, not the world — the hillside and the herds
// come from the server's seed — so this varies which deer it picks and where it
// wanders, which is exactly the variation that was missing. Unset is
// 'huntcheck', byte for byte.
const HUNT_SEED = process.env.HUNTSEED || 'huntcheck';
// One string, used in three places, so the arm can never be reported two ways.
const ARM = [
  COMMIT_DETOUR ? 'COMMITTED' : null,
  CLOSE_DETOUR ? 'CLOSING' : null,
  SHOOT_RANGE !== AGENTS.shootRange ? `REACH ${SHOOT_RANGE}m` : null,
].filter(Boolean).join('+') || 'default';

async function main() {
  console.log('\n  Can an agent kill a deer?');
  console.log(`  stepping aside: ${ARM}  (DETOUR=${process.env.DETOUR || '<unset>'})`);
  console.log(`    ${COMMIT_DETOUR ? 'the spot is remembered and walked to' : 'the spot is re-solved every tick'}; ` +
    `${CLOSE_DETOUR ? `a step aside also closes ${AGENTS.detourAdvance}x its own width` : 'a step aside is purely across the line of sight'}`);
  console.log(`    it will shoot out to ${SHOOT_RANGE} m of slant` +
    `${SHOOT_RANGE === AGENTS.shootRange ? '  (AGENTS.shootRange, unchanged)' : `  (RAISED from ${AGENTS.shootRange} — SHOOTRANGE=${process.env.SHOOTRANGE})`}`);
  console.log(`    scenario seed "${HUNT_SEED}"` +
    `${HUNT_SEED === 'huntcheck' ? '  (the default — vary it with HUNTSEED= before quoting any rate)' : ''}\n`);
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
    agent = await new Agent({ name: 'Hunter', provider: alwaysHunt, rand: makeRandom(HUNT_SEED),
                              commitDetour: COMMIT_DETOUR, closeDetour: CLOSE_DETOUR,
                              shootRange: SHOOT_RANGE })
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
    // ── THE QUARRY'S OWN RANGE, and the SLANT of it ──
    //
    // `nearest` is the closest deer of any, measured horizontally, and for two
    // runs it was the number reported as "inside shootRange — the only seconds a
    // shot was on the table". It is neither of the things `aimAt` actually
    // tests. `aimAt` refuses on the SLANT to the LOCKED QUARRY, and this run
    // measured why that matters: 9 of 9 `too far` refusals were a deer 6-18 m
    // above or below the eye, where slant runs metres longer than ground range.
    // A body 23 m from its quarry with the animal 12.6 m up is 26 m from it as
    // the arrow flies, and the old line counted that second as a shot available.
    let qd = null;
    let qs = null;
    for (const c of agent.snapshot?.cr ?? []) {
      if (c.k !== 'deer') continue;
      deerN++;
      nearest = Math.min(nearest, Math.hypot(c.p[0] - agent._x, c.p[2] - agent._z));
      if (agent.target?.quarry === true && c.i === agent.target.id) {
        qd = Math.hypot(c.p[0] - agent._x, c.p[2] - agent._z);
        // The same two corrections `aimAt` makes: aim at the middle of the
        // animal, and measure from the eye the body is ACTUALLY looking from,
        // which is the crouched one while it stalks.
        const dy = (c.p[1] + AGENTS.aimAboveFeet) - (agent._y + (agent.eye ?? PLAYER.eyeHeight));
        qs = Math.hypot(qd, dy);
      }
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
        // Range to the animal it actually chose, on the ground and as the arrow
        // flies. Null whenever nothing is locked on.
        qd: qd === null ? null : Math.round(qd),
        qs: qs === null ? null : Math.round(qs),
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
        // How many wounds had landed by this second. The wound record keeps
        // GAME hours and this trace keeps REAL seconds, and comparing the two
        // is how the first cut of the "did it stay on that animal" block came
        // to count the whole run instead of the part after the arrow — it took
        // an `atHour` argument and never used it. One clock, counted here.
        w: agent.wounds?.length ?? 0,
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

  // ── THE REACH SENTINEL — a number that is 0 on one arm and N on the other BY
  //    CONSTRUCTION, and it proves which code was loaded from the DATA ──
  //
  // Two A/Bs in this project have run the same arm twice and been read as
  // findings. `aimAt` refuses on the slant, so on the default arm NO arrow can
  // leave the bow at more than `AGENTS.shootRange` of slant — the count below
  // is 0 by the geometry, not by hope. On a raised arm it must be non-zero, and
  // if it is not, the flag did not reach the body and this run is the control
  // wearing the treatment's label. It says so rather than leaving it derivable:
  // the last finding in this file sat unread for a run and a half because it
  // was derivable and nobody derived it.
  //
  // ── AND IT READS `loosed`, NOT `shots`, WHICH IS WHY THIS PARAGRAPH EXISTS ──
  //
  // Its first live reading printed *"0 of 0 arrows — no arrows, so this run says
  // nothing about the arm"* on a run that loosed an arrow AND wounded a deer
  // with it, while `agent.arrows` sat at 1 four lines away. `shots` is pushed by
  // `howItMissed`, which only runs off a `miss` event — an arrow that goes home
  // never lands in it. So the sentinel could see the arm ONLY when the arm
  // failed, and reported "unproven" every time the treatment worked.
  //
  // Sixth instrument in this project to report something it had not measured,
  // and the first to do it in the direction that hides a success. `Agent.loosed`
  // is now written at the moment of RELEASE, one entry per arrow, before
  // anything can happen to the shaft.
  const loosed = agent.loosed ?? [];
  const slants = loosed.map((s) => s.slant).filter((v) => typeof v === 'number');
  const stretched = slants.filter((v) => v > AGENTS.shootRange + 0.05).length;
  const raised = SHOOT_RANGE !== AGENTS.shootRange;
  // A cross-check against the counter a human reads, from a different code path.
  // If these two disagree the sentinel is broken again and must not be believed.
  const fired = agent.arrows ?? 0;
  console.log(`\n      REACH SENTINEL: ${stretched} of ${slants.length} arrows were loosed past ` +
    `${AGENTS.shootRange} m of slant` +
    (loosed.length !== fired
      ? `\n      \`loosed\` HOLDS ${loosed.length} AND \`arrows\` COUNTED ${fired}: this instrument is wrong, not the arm`
      : '') +
    (slants.length === 0 && fired === 0 ? ' — no arrows, so this run says nothing about the arm' : '') +
    (raised && slants.length && stretched === 0
      ? `\n      THE REACH IS RAISED TO ${SHOOT_RANGE} m AND NOT ONE ARROW USED IT: distrust this run`
      : '') +
    (!raised && stretched > 0
      ? '\n      THE REACH IS NOT RAISED AND AN ARROW WENT PAST IT: this instrument is wrong'
      : '') +
    (slants.length ? `\n      furthest arrow ${Math.max(...slants).toFixed(1)} m of slant` : ''));
  if (loosed.length) {
    console.log('      every arrow that LEFT THE BOW, hit or miss, by the range the rule is written in:');
    for (const s of loosed) {
      console.log(`        ${String(s.slant ?? '?').padStart(6)} m of slant  (${String(s.dist ?? '?').padStart(5)} m on the ground)` +
        (s.slant != null && s.slant > AGENTS.shootRange + 0.05 ? '  <- past the default ceiling' : ''));
    }
  }

  if (shots.length) {
    console.log('\n      every arrow, against what the bow promised:');
    for (const s of shots) {
      console.log(
        `        ${String(s.dist).padStart(5)} m  ` +
          `vsModel ${s.vsModel > 0 ? '+' : ''}${s.vsModel} m  across ${s.across > 0 ? '+' : ''}${s.across} m  ` +
          `(pitch ${s.pitch}°, eye ${s.eye} m, hit ${s.hit})` +
          // What the aim was ASKED, beside what it produced. A big `led` is the
          // tracker over-projecting; a small `led` with a wild pitch is the arc
          // solver, and the miss columns alone cannot tell those apart.
          (s.leadBy === null || s.leadBy === undefined
            ? ''
            : `\n                 aimed ${s.leadBy} m ahead of the animal, solved for a target ` +
              `${Math.abs(s.dropTo ?? 0)} m ${(s.dropTo ?? 0) < 0 ? 'BELOW' : 'above'} the eye`) +
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
    // ── AND EVERY COUNT HERE IS OVER A DIFFERENT AMOUNT OF TIME ──
    //
    // This check STOPS ON A KILL. A run that kills ends at 36-77 s; a run that
    // does not runs the full 150. So the raw tallies of arrows and refusals are
    // counts over run lengths that differ by a factor of four, and comparing
    // two arms on them straight REWARDS THE ARM THAT FAILS, for taking longer
    // to fail. It cost this project a whole aggregate on the reach A/B: the
    // control looked like it refused a third as often, and per second it did
    // not. Same family as "a transition count is not a tick count".
    //
    // So the rate is printed beside the count rather than left derivable, and
    // the run's own length is printed with it. Nothing here is comparable
    // across arms except the right-hand column.
    // `secs` is a STRING from `.toFixed(0)`, so `secs || 150` never falls back
    // and a run that ends in under half a second divides by "0" and prints
    // Infinity for every row. Coerce, then guard.
    const per100 = (n) => (n / (Number(secs) || 150) * 100).toFixed(1);
    console.log(`\n      every time it refused the shot  —  over ${secs} s of hunting, ` +
      `so read the RATE, not the count (this check stops on a kill):`);
    for (const [kind, e] of byReason) {
      const where = e.outs.length ? `, obstruction ${Math.min(...e.outs)}-${Math.max(...e.outs)} m out` : '';
      console.log(`        ${String(e.n).padStart(3)} x  ${String(kind).padEnd(20)} ${String(per100(e.n)).padStart(5)} /100s  ` +
        `(deer at ${Math.min(...e.ranges)}-${Math.max(...e.ranges)} m${where})`);
    }
    console.log(`        ${String(refused.length).padStart(3)} x  ${'ALL REFUSALS'.padEnd(20)} ${String(per100(refused.length)).padStart(5)} /100s` +
      `  · and ${agent.arrows ?? 0} arrows is ${per100(agent.arrows ?? 0)} /100s`);
    // ── `too far` AT TWENTY METRES, WITH A TWENTY-SIX METRE BOW ──
    //
    // The open question this run left. `too far` ended detours with the deer
    // standing at 20-23 m, which is comfortably inside `AGENTS.shootRange`, and
    // two different mechanisms produce that with neither visible from a count:
    // the CLIMB (`dist` is horizontal, the arrow flies the slant, and a deer up
    // a crag is further than it looks) and the LEAD (`dist` is measured to where
    // the animal WILL BE, so a deer running away earns metres of range the body
    // does not actually have to shoot across).
    //
    // They want opposite fixes. Printed one refusal per line rather than
    // averaged, because a mean of the two is a number describing neither — that
    // is precisely how the miss table lied for three sessions.
    const far = (agent.refusals ?? []).filter((r) => r.slant != null);
    if (far.length) {
      console.log(`\n      ...and the ${far.length} \`too far\` refusals, broken into their parts ` +
        `(shootRange ${SHOOT_RANGE} m):`);
      for (const r of far) {
        // A refusal is `too far` because slant > shootRange. `dy` is how much of
        // that is the climb; `leadBy` is how much the body added by aiming ahead.
        const blame = Math.abs(r.dy) > Math.abs(r.leadBy) ? 'THE CLIMB' : 'THE LEAD';
        console.log(`        deer ${String(r.d).padStart(3)} m away, arrow must fly ${String(r.slant).padStart(5)} m  ` +
          `(${r.dy >= 0 ? '+' : ''}${r.dy} m of climb, ${r.leadBy} m of lead)  -> mostly ${blame}`);
      }
      const climb = far.filter((r) => Math.abs(r.dy) > Math.abs(r.leadBy)).length;
      console.log(`        ${climb} of ${far.length} are mostly the climb, ${far.length - climb} mostly the lead` +
        ` — and a refusal whose slant is UNDER ${SHOOT_RANGE} m is neither, and means this instrument is wrong`);
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
    console.log(`\n      when it stepped aside for a clear line — did it work?  [${ARM}]`);
    console.log(`        ${detours.length} detours attempted, ${cleared} ended with a shot on ` +
      '(read the walk beside it — a shot after 0 m is the line clearing on its own, not the step)');
    for (const [outcome, n] of [...by].sort((a, b) => b[1] - a[1])) {
      console.log(`          ${String(n).padStart(3)} x  ${outcome}`);
    }
    // ── THE TWO NUMBERS THE CLOSING ARM EXISTS TO MOVE, spelled out ──
    //
    // Both were already derivable from the block above and the per-detour lines
    // below, and being derivable is exactly how the `too far` finding sat unread
    // for a run and a half while everybody read the averages. So they are
    // printed as the numbers they are.
    //
    //   `too far` share — 54-64% of closed episodes across eight runs on both
    //   arms of `commit`, and the reason committing to the spot changed nothing.
    //
    //   did the range actually CLOSE — `d0` against `d` per episode, counted.
    //   A purely perpendicular step holds the range by construction, so on the
    //   default arm this is near enough all `held or lost`; that is not a
    //   failure of the body, it is the geometry, and it is what `close` changes.
    if (done.length) {
      const tooFar = by.get('too far') ?? 0;
      const closed = done.filter((e) => e.d < e.d0).length;
      const heldOrLost = done.length - closed;
      const drift = done.reduce((a, e) => a + (e.d0 - e.d), 0) / done.length;
      console.log(`        \`too far\` ended ${tooFar} of ${done.length} closed detours ` +
        `(${Math.round((tooFar / done.length) * 100)}%) — the number the closing arm is aimed at`);
      console.log(`        the range CLOSED on ${closed} of them and was held or lost on ${heldOrLost} ` +
        `(mean ${drift >= 0 ? '-' : '+'}${Math.abs(drift).toFixed(1)} m over the step aside)`);
      const withAlong = done.filter((e) => (e.along ?? 0) > 0).length;
      console.log(`        ${withAlong} of ${done.length} stepped UP the line of sight as well as across it` +
        `${CLOSE_DETOUR && !withAlong ? '  — CLOSING IS ON AND NOT ONE DID: distrust this run' : ''}` +
        `${!CLOSE_DETOUR && withAlong ? '  — CLOSING IS OFF AND SOME DID: distrust this run' : ''}`);
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
      // ── DID IT COMMIT, or have a fresh opinion every tick? ──
      //
      // The mechanism number, and it is upstream of every other line in this
      // block. `clearSpotNear` asked once per episode is a body walking to a
      // place it chose; asked a hundred and fifty times is a body re-deciding
      // thirty times a second, which is what it did for months — and a
      // twenty-metre probe over rolling ground flickers null 13% of the time, so
      // it abandoned the walk a tenth of a second in. If `walked` per detour is
      // still 1 m while `resolves` per detour is 1, the commitment is working
      // and something ELSE is ending the walk: read `gave up because`.
      const resolves = sum('resolves');
      console.log(`        it asked \`clearSpotNear\` ${resolves} times across ${done.length} detours ` +
        `(${(resolves / done.length).toFixed(1)} per detour) and walked to a remembered spot ` +
        `for ${sum('held')} ticks`);
      const drops = new Map();
      for (const e of done) if (e.dropped) drops.set(e.dropped, (drops.get(e.dropped) ?? 0) + 1);
      if (drops.size) {
        console.log(`        gave up on a held spot: ${[...drops].map(([k, n]) => `${n} x ${k}`).join(', ')}`);
      }
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
      //
      // ...AND THAT IS NO LONGER A HYPOTHESIS. Measured over eight runs, four
      // an arm, with the commitment flag off and on: `too far` is the outcome
      // of 9 of 14 closed detours uncommitted and 15 of 28 committed. It is the
      // commonest end of a step aside on BOTH arms and by a long way.
      //
      // Which is why committing to the spot fixed the flicker and did not move
      // the kill rate. The flicker ended 13-17% of detour ticks; `too far` ends
      // the MAJORITY of detour episodes, and no amount of remembering where you
      // were going survives the range check that fires while you walk there.
      // `clearSpotNear` only offers offsets PERPENDICULAR to the line of sight,
      // so a step aside never closes an inch — see the queue in STATE.md.
      console.log('        each one, and what it cost:');
      for (const e of detours) {
        console.log(`          deer ${String(e.d0).padStart(3)} m -> ${String(e.d).padStart(3)} m  ` +
          `${String(Math.abs(e.step)).padStart(2)} m aside${e.along ? ` +${e.along} m up the line` : ''}` +
          `, walked ${String(e.walked).padStart(3)} m ` +
          `in ${e.secs.toFixed(1)} s  (${e.why})  ${e.outcome ?? 'still walking'}` +
          `  [${e.resolves ?? '?'} solves${e.dropped ? `, last drop: ${e.dropped}` : ''}]`);
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
    const inRange = withDeer.filter((s) => s.d <= SHOOT_RANGE);
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
    console.log(`        inside shootRange ${SHOOT_RANGE} m    ${String(inRange.length).padStart(3)}/${trace.length} samples (${pc(inRange.length)})` +
      ' — nearest deer, on the GROUND. Read the next two lines before quoting it');

    // ── ...AND THE NUMBER `aimAt` ACTUALLY TESTS ──
    //
    // The line above has been quoted as "the only seconds in which a shot was
    // on the table" for three runs, and it is neither of the things the body
    // tests. `aimAt` refuses on the SLANT to the LOCKED QUARRY; that line is the
    // GROUND range to the NEAREST deer, which is a different animal whenever
    // `resolve` has not picked the closest one, and a shorter distance always.
    //
    // This run measured the size of the second error: 9 of 9 `too far` refusals
    // were a deer 6-18 m above or below the eye. A body 23 m from its quarry
    // with the animal 12.6 m up is 26 m away as the arrow flies — in range on
    // the old line, refused by the code.
    //
    // Both are printed. The GAP between them is the point, and if it is large
    // then every "in range" share this project has quoted is an overstatement.
    const onQ = trace.filter((s) => s.qd != null);
    if (onQ.length) {
      const byGround = onQ.filter((s) => s.qd <= SHOOT_RANGE).length;
      const bySlant = onQ.filter((s) => s.qs <= SHOOT_RANGE).length;
      const climbs = onQ.map((s) => s.qs - s.qd).sort((a, b) => a - b);
      console.log(`        ...the QUARRY on the ground ${String(byGround).padStart(3)}/${trace.length} samples (${pc(byGround)})`);
      console.log(`        ...the QUARRY by SLANT      ${String(bySlant).padStart(3)}/${trace.length} samples (${pc(bySlant)})` +
        '  <- THIS is what `aimAt` tests');
      console.log(`        the climb costs a median ${climbs[Math.floor(climbs.length / 2)].toFixed(1)} m of range ` +
        `(worst ${climbs.at(-1).toFixed(1)} m) — ${byGround - bySlant} seconds that look like a shot and are not`);

      // ── AND THE ONE THAT IS LEFT: WHERE DOES THE APPROACH GO? ──
      //
      // Everything above is about the moment of the shot. This is about the
      // 80%+ of a run that is not one. The body locks on for ~90% of a run and
      // is in range for under a fifth of it, so it spends most of a hunt walking
      // toward an animal it has already chosen — and nothing has ever measured
      // whether that walk CLOSES.
      //
      // Second by second on the same quarry: did the range fall, hold or grow?
      // A body that closes steadily and still cannot shoot is a range problem; a
      // body whose range holds flat is a body the deer is walking away from at
      // its own speed, and those want completely different answers.
      //
      // 1 m of dead-band, because these are metres rounded to the metre and a
      // ±0.5 m rounding flutter would otherwise read as motion.
      let closing = 0;
      let holding = 0;
      let opening = 0;
      for (let k = 1; k < trace.length; k++) {
        const a = trace[k - 1];
        const b = trace[k];
        // Same animal, both seconds, or the comparison is between two deer.
        if (a.qd == null || b.qd == null || a.qid == null || a.qid !== b.qid) continue;
        const dd = b.qd - a.qd;
        if (dd <= -1) closing++; else if (dd >= 1) opening++; else holding++;
      }
      const steps = closing + holding + opening;
      if (steps) {
        const share = (n) => `${String(n).padStart(3)} s (${Math.round((n / steps) * 100)}%)`;
        console.log(`        on the SAME deer, second to second: closing ${share(closing)} · ` +
          `holding ${share(holding)} · opening ${share(opening)}`);
      }
    }

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
      for (let k = 0; k < wounded.length; k++) {
        const w = wounded[k];
        // The first sample that had seen this wound land. Everything from there
        // on is "after"; everything before it is the stalk that produced it,
        // and lumping the two together made a body that hunted one deer all run
        // read identically to one that hit an animal and wandered off.
        const at = trace.findIndex((s) => s.w > k);
        const after = at < 0 ? [] : trace.slice(at);
        const onIt = after.filter((s) => s.qid === w.id).length;
        const onOthers = after.filter((s) => s.qid != null && s.qid !== w.id).length;
        console.log(`        the ${w.what.toLowerCase()} it hit for ${w.dmg} (left at ${w.hp} hp, id ${w.id ?? '?'}) — ` +
          `of the ${after.length} s that followed it was the quarry for ${onIt} s, ` +
          `and some OTHER animal was for ${onOthers} s`);
      }
      // Stated as counts and nothing else. The first version of this line
      // editorialised — "an animal it then walked away from" — and printed that
      // on a run whose own numbers showed the body stayed on the wounded deer
      // for 68 of 133 seconds. That is the fourth instrument in this project to
      // assert a cause it had not measured, and it was mine.
      console.log(`        ${wounded.length} wounded, ${(agent.kills ?? []).length} killed`);
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
            ? `it never closed to ${SHOOT_RANGE} m — nearest all run was ${ranges[0]} m, so no shot was ever possible`
            : (agent.arrows ?? 0) === 0
              ? `it was inside ${SHOOT_RANGE} m for ${inRange.length} s and never loosed` +
                (worst ? ` — ${worst[1]} refusals, mostly "${worst[0]}"` : '') +
                '. A SIGHTLINE problem, not ballistics'
              : wounds > 0
                ? `its arrows went HOME — ${wounds} wound${wounds === 1 ? '' : 's'} and no kill off ` +
                  `${agent.arrows} shot${agent.arrows === 1 ? '' : 's'} in ${secs} s` +
                  (worst ? `, with ${worst[1]} refusals mostly "${worst[0]}"` : '') +
                  '. That is damage and shot RATE, not aim'
                : `it loosed ${agent.arrows} arrows from inside ${SHOOT_RANGE} m and every one missed — ` +
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
