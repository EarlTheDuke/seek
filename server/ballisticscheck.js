// ── ballisticscheck.js ──────────────────────────────────────────────────────
// Does the bow do what our model of the bow says it does?
//
//   npm run ballisticscheck
//
// ── why this exists ──
//
// The board reported strays as "3 m long at 20 m", eight of them from one body
// and "5 m long at 26 m" from another, and that was written up as a systematic
// ballistics bias — consistent sign, two independent bodies, magnitude growing
// with range. It is none of those things. It is the instrument.
//
// `howItMissed` measures the impact against the MARK, and the mark is a deer's
// chest about 0.75 m above the ground it is standing on. An arrow that passes
// exactly through that chest does not stop there: it carries on and buries
// itself in the dirt somewhere further out. How much further is pure geometry —
// at 20 m the shaft is descending at barely two degrees, so shedding the last
// 0.75 m of height takes it another THIRTEEN METRES down the line. A flawless
// archer reads "+13 m long" on that scale. Every real reading was well under it.
//
// So "long" was never evidence of anything, and a run of them was not a trend.
// The number that IS evidence has been in `shots` since the day the instrument
// was built and nothing had ever read it: `pred`, where our own ballistics said
// the shaft would come down, and `model`, how far from there it actually did.
// The first live run to be read that way said 0.3 m at 22 m. That is a bow
// that is understood.
//
// One arrow is an anecdote, though, and a live hunt is a terrible laboratory —
// the range, the terrain, the lead and the spread all move at once. So this
// check strips all of it away: a real body on a real server, a fixed yaw, a
// staircase of known pitches, several shafts at each, and one question asked of
// every one of them — how far from `predictLanding` did it land?
//
// Nothing here reaches into SimWorld. The shot is a held trigger over a socket
// and the answer is the server's own `miss` event, which is the same channel a
// hunting agent learns from.
//
// ── the failure modes this was built expecting ──
//
//   * TERRAIN AMPLIFIES EVERYTHING. The shaft comes down at two or three
//     degrees, so where it stops is decided as much by the slope it meets as by
//     the arc. A centimetre of arc error becomes half a metre of range on flat
//     ground and nothing at all against a bank. Hence the median over many
//     shots rather than a worst case, and hence the 3D gap reported beside the
//     along-the-line one.
//   * SPREAD IS NOT ZERO even at a full draw, and the same lever applies: a
//     tenth of a degree low is centimetres at the mark and metres at the
//     landing. Three shafts per pitch, and the SIGN of the mean is the claim.
//   * A DRAW THAT NEVER FINISHED launches at `BOW.minSpeed`, which would look
//     exactly like a model that shoots long. Checked directly off the wire.
//   * THE LAKE is flat and `heightAt` does not know about it, so a shaft that
//     ends in water is compared against a prediction of the lake BED. Those are
//     counted and reported and kept out of the verdict.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PROTOCOL_VERSION, C_HELLO, C_INTENT,
  S_WELCOME, S_SNAPSHOT,
  encode, decode,
} from '../src/net/protocol.js';
import { PLAYER, BOW, AGENTS } from '../src/config.js';
import { heightAt } from '../src/world/noise.js';
import { predictLanding, solvePitch, arcClearance } from '../src/minds/marksman.js';
import { timberBlocker } from '../src/world/timber.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8088);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A body with no eyes and no opinions — it holds a trigger and reports. */
class WireClient {
  constructor(name) {
    this.name = name;
    this.id = null;
    this.me = null;
    this.meTick = -1;
    this.events = [];
    this.projectiles = [];
    this.intent = { forward: 0, strafe: 0, lookYaw: 0, lookPitch: 0, primary: false };
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onerror = (e) => reject(new Error(`${this.name}: ${e.message ?? 'socket error'}`));
      this.ws.onopen = () => this.send(C_HELLO, { name: this.name, version: PROTOCOL_VERSION });
      this.ws.onmessage = (ev) => {
        const msg = decode(ev.data);
        if (!msg) return;
        if (msg.type === S_WELCOME) {
          this.id = msg.data.id;
          resolve(this);
        } else if (msg.type === S_SNAPSHOT) {
          const s = msg.data;
          this.me = s.me ?? this.me;
          this.meTick = s.t;
          for (const e of s.ev ?? []) this.events.push(e);
          for (const pr of s.pr ?? []) this.projectiles.push({ t: s.t, p: pr.p, v: pr.v });
        }
      };
    });
  }

  send(type, data) {
    if (this.ws.readyState === 1) this.ws.send(encode(type, data));
  }

  sendIntent() {
    this.send(C_INTENT, { i: this.intent });
    this.intent.lookYaw = 0;
    this.intent.lookPitch = 0;
  }

  close() { try { this.ws.close(); } catch { /* going anyway */ } }
}

/** Drive the client in REAL time — the server ticks on a wall clock. */
async function driveFor(ms, c) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    c.sendIntent();
    await sleep(1000 / 30);
  }
}

/**
 * Hold the aim until the SERVER agrees it is holding it, then loose one shaft
 * and wait for the server to say where it stopped.
 *
 * The aim is stated as an angle rather than nudged, so it lands in one packet
 * (see `intents.js`); the repetition here is only to let the body settle on the
 * ground, because both the launch height and the terrain under the arc depend
 * on where the feet have finished sliding to.
 */
async function oneShot(c, yaw, pitch) {
  c.intent.aimYaw = yaw;
  c.intent.aimPitch = pitch;
  c.intent.primary = false;
  await driveFor(700, c);

  // Where the shot is taken FROM, read off the server rather than assumed. `e`
  // is the body's own eye height, which is not `PLAYER.eyeHeight` if it is
  // crouched — and the whole arc hangs off it.
  const from = { x: c.me.p[0], y: c.me.p[1], z: c.me.p[2] };
  const eye = c.me.e ?? PLAYER.eyeHeight;
  const servedYaw = c.me.y;
  const servedPitch = c.me.t;

  c.projectiles.length = 0;
  c.events.length = 0;

  // A full draw plus margin: below a full charge the launch speed is lerped
  // down toward `BOW.minSpeed` and the comparison would be against a bow that
  // was never drawn.
  c.intent.primary = true;
  await driveFor((BOW.drawTime + 0.5) * 1000, c);
  c.intent.primary = false;

  // ── past `ARROW.maxFlightTime`, on purpose ──
  //
  // The first draft waited six seconds and reported "no impact" for every shot
  // at 55 m and beyond, which reads like a server that swallows long shots. It
  // is not: a shaft lofted for a 70 m mark can be down the valley for the best
  // part of ten seconds. Waiting past the 12 s expiry means a silence here is a
  // real silence — and there IS one to catch, because a projectile that outlives
  // `maxFlight` is spliced out with no `onMiss` at all.
  const t0 = Date.now();
  let miss = null;
  while (Date.now() - t0 < 13_500 && !miss) {
    c.sendIntent();
    miss = c.events.find((e) => e.k === 'miss' && e.by === c.id && e.at);
    await sleep(1000 / 30);
  }
  if (!miss) {
    // ── AN EMPTY QUIVER LOOKS EXACTLY LIKE A LOST ARROW ──
    //
    // The first run of this check reported "no impact" for every shot at 55 m
    // and beyond and it read like a range effect worth chasing. It was not: the
    // starting kit holds TWELVE arrows, twelve shots had already been taken,
    // and `Bow.fire` calls `cancel()` and returns silently when
    // `consumeAmmo` fails. No shaft, no event, no complaint. Distinguished
    // here so the next reader is not sent after a ballistics bug that is a
    // shopping problem.
    return { dry: c.projectiles.length === 0 };
  }

  // The launch speed the server actually used, recovered from the first
  // sighting of the shaft. Drag has already taken a little off it by then, so
  // this is a floor, not an equality.
  const first = c.projectiles[0];
  const seenSpeed = first ? Math.hypot(first.v[0], first.v[1], first.v[2]) : 0;

  // OUR OWN MODEL of the same shot, from the same place, at the angles the
  // SERVER says the body is holding — not the ones we asked for.
  const pred = predictLanding(from, from.y + eye, servedPitch, servedYaw, heightAt);

  // Decomposed along the shot line, because the two directions mean different
  // things: along is the arc, across is the spread.
  const ux = -Math.sin(servedYaw);
  const uz = -Math.cos(servedYaw);
  const ax = miss.at[0] - from.x;
  const az = miss.at[2] - from.z;
  const actualAlong = ax * ux + az * uz;
  const actualAcross = ax * -uz + az * ux;
  const predAlong = (pred.x - from.x) * ux + (pred.z - from.z) * uz;

  return {
    pitch: servedPitch,
    surface: miss.hit,
    speed: seenSpeed,
    actual: actualAlong,
    predicted: predAlong,
    along: actualAlong - predAlong,
    across: actualAcross,
    gap: Math.hypot(miss.at[0] - pred.x, miss.at[2] - pred.z),
  };
}

/**
 * A bearing at which a shot to `range` is not simply an oak.
 *
 * THE FIRST RUN OF THIS CHECK PUT EVERY SHALLOW SHAFT INTO THE SAME TREE — 25.9
 * m out, three times, agreeing to two centimetres. Wonderfully deterministic
 * and completely uninformative: `predictLanding` walks the height field, and a
 * trunk is not in the height field, so the model said 134 m and the wood said
 * 26. That is a known limit of the model, not a bias in it, and measuring it
 * over and over says nothing about the arc.
 *
 * So the line is chosen the way a hunter chooses one: turn until there is
 * nothing in the way. Screened with the SAME `arcClearance` and the SAME
 * blocker a hunting agent uses, so if a shaft still finds timber the model and
 * the world genuinely disagree and the check should say so.
 *
 * @returns {{yaw:number, pitch:number, markY:number}|null}
 */
function planShot(from, eye, range, blocker, startYaw) {
  const eyeY = from.y + eye;
  // Every bearing, nearest to where the body already faces first, so the check
  // spends its time shooting rather than pirouetting.
  for (let step = 0; step < 72; step++) {
    const half = Math.ceil(step / 2) * (step % 2 ? 1 : -1);
    const yaw = startYaw + (half * 5 * Math.PI) / 180;
    const mx = from.x - Math.sin(yaw) * range;
    const mz = from.z - Math.cos(yaw) * range;
    // A deer's chest above whatever the ground is doing out there — the same
    // mark `hunter` aims at, so this measures the shot the game actually takes.
    const markY = heightAt(mx, mz) + AGENTS.aimAboveFeet;
    const pitch = solvePitch(range, markY - eyeY);
    if (pitch === null) continue;
    const arc = arcClearance(from, eyeY, pitch, { x: mx, y: markY, z: mz }, heightAt, { solidAt: blocker });
    if (arc.blocked) continue;
    // And clear PAST the mark too, all the way to where the model says it comes
    // down — otherwise the arc is fine and the landing is in a thicket.
    const pred = predictLanding(from, eyeY, pitch, yaw, heightAt);
    const beyond = arcClearance(from, eyeY, pitch, { x: pred.x, y: heightAt(pred.x, pred.z), z: pred.z },
      heightAt, { solidAt: blocker, margin: -Infinity });
    if (beyond.what === 'timber') continue;
    return { yaw, pitch, markY };
  }
  return null;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

// ── a staircase of RANGES, not of angles ──
//
// The first draft walked raw pitches, and 8° put a shaft three hundred metres
// down the valley — a shot no hunter takes and no agent solves for. These are
// the ranges a body actually shoots at, each aimed the way `hunter` aims: at a
// chest 0.75 m above the ground out there, through `solvePitch`. A bias in the
// drag model grows with time of flight and a bias in the launch height does
// not, so the spread of ranges is what tells those two apart.
//
// TWO EACH, AND SIX RANGES, BECAUSE THE QUIVER HOLDS TWELVE. The starting kit
// is `{ item: 'arrow', count: 12 }` and there is no thirteenth shot: the bow
// cancels the draw in silence. Three each over six ranges spent the quiver
// two-thirds of the way through and made the rest look like a range effect.
const RANGES = [15, 22, 30, 40, 55, 70];
const PER_RANGE = 2;

async function main() {
  console.log('\n  Does the arrow go where our model of the bow says?\n');
  await requireFreePort(PORT, 'ballisticscheck');

  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  let archer = null;
  for (let i = 0; i < 40 && !archer; i++) {
    await sleep(150);
    archer = await new WireClient('Archer').connect(URL).catch(() => null);
  }
  if (!archer) throw new Error(`no server answered on ${URL}`);
  await sleep(400);
  check('an archer joined over a socket', archer.id !== null, `#${archer.id}`);

  // Let the feet settle before anything is measured. A body still sliding down
  // to the surface launches from a height nobody recorded.
  await driveFor(1500, archer);

  const yaw = archer.me.y ?? 0;
  console.log(`      standing at ${archer.me.p.map((n) => n.toFixed(1)).join(', ')}, ` +
    `facing ${(yaw * 57.3).toFixed(0)}°, eye ${(archer.me.e ?? PLAYER.eyeHeight).toFixed(2)} m\n`);

  // The wood inside 120 m, cached once — the body does not move all run.
  const blocker = timberBlocker(archer.me.p[0], archer.me.p[2], 120);

  const shots = [];
  let unplanned = 0;
  let dryQuiver = false;
  for (const range of RANGES) {
    for (let n = 0; n < PER_RANGE; n++) {
      const from = { x: archer.me.p[0], y: archer.me.p[1], z: archer.me.p[2] };
      const eye = archer.me.e ?? PLAYER.eyeHeight;
      // A fresh bearing per shot, walking round the compass, so the whole run
      // is not one line of ground and one accident of slope.
      const plan = planShot(from, eye, range, blocker, yaw + (n * 47 * Math.PI) / 180);
      if (!plan) {
        unplanned++;
        console.log(`        ${String(range).padStart(3)} m  no clear line on any bearing`);
        continue;
      }
      const s = await oneShot(archer, plan.yaw, plan.pitch);
      if (!s || s.dry !== undefined) {
        dryQuiver ||= !!s?.dry;
        console.log(`        ${String(range).padStart(3)} m  ` +
          (s?.dry ? 'NO ARROW LEFT THE BOW — the quiver is empty' : 'a shaft flew and never reported an impact'));
        continue;
      }
      s.range = range;
      shots.push(s);
      console.log(
        `        ${String(range).padStart(3)} m at ${(s.pitch * 57.3).toFixed(1).padStart(5)}°  ` +
        `landed ${s.actual.toFixed(1).padStart(6)} m  ` +
        `model said ${s.predicted.toFixed(1).padStart(6)} m  ` +
        `along ${((s.along > 0 ? '+' : '') + s.along.toFixed(2)).padStart(6)} m  ` +
        `across ${((s.across > 0 ? '+' : '') + s.across.toFixed(2)).padStart(6)} m  ` +
        `(${s.surface}, ${s.speed.toFixed(0)} m/s)`
      );
    }
  }

  check('every shaft came back with an impact point',
    shots.length === RANGES.length * PER_RANGE,
    `${shots.length} of ${RANGES.length * PER_RANGE} arrows reported where they stopped` +
      (unplanned ? ` (${unplanned} had no clear bearing to take)` : '') +
      (dryQuiver ? ' — AND THE QUIVER RAN DRY, so the run is short of arrows, not of answers' : ''));

  // A trunk is not in the height field, so `predictLanding` cannot see one and
  // a shaft that finds wood is measuring the model's blind spot, not its arc.
  // The bearing was screened with the SAME blocker the agent shoots by, so this
  // number ought to be zero — if it is not, the blocker and the world disagree
  // and that is worth knowing on its own.
  const woody = shots.filter((s) => s.surface === 'tree' || s.surface === 'solid');
  check('and the bearing it was given really was clear of wood', woody.length === 0,
    woody.length
      ? `${woody.length} shafts ended in timber the arc screen said was not there`
      : `all ${shots.length} flew clear of a screen built from \`timberBlocker\``);

  // A half-drawn bow launches at `BOW.minSpeed` (26 m/s against 74) and would
  // look exactly like a model that shoots long. Rule it out before reading
  // anything else, or every number below is about a bow nobody drew.
  const slow = shots.filter((s) => s.speed < BOW.maxSpeed - 6);
  check('and every one of them left a fully drawn bow', slow.length === 0,
    slow.length
      ? `${slow.length} shafts left at ${slow.map((s) => s.speed.toFixed(0)).join(', ')} m/s ` +
        `(a full draw is ${BOW.maxSpeed})`
      : `all ${shots.length} at ${Math.min(...shots.map((s) => s.speed)).toFixed(0)}+ m/s`);

  // The lake is flat and `heightAt` does not know it is there, so a shaft that
  // ends in water was compared against a prediction of the lake bed. Reported,
  // not counted.
  const dry = shots.filter((s) => s.surface !== 'water' && !woody.includes(s));
  if (dry.length !== shots.length) {
    console.log(`\n      ${shots.length - dry.length} shafts ended in the lake or in wood and are left out ` +
      `— \`heightAt\` knows about neither, so those measure the model's blind spots, not its arc`);
  }

  const alongs = dry.map((s) => s.along);
  const medAbs = median(alongs.map(Math.abs));
  const meanAlong = mean(alongs);
  const medGap = median(dry.map((s) => s.gap));

  console.log(
    `\n      ${dry.length} arrows on dry ground:` +
    `\n        median miss from our own prediction   ${medGap.toFixed(2)} m` +
    `\n        median |along| error                  ${medAbs.toFixed(2)} m` +
    `\n        MEAN along error (the sign is the claim)  ${(meanAlong > 0 ? '+' : '') + meanAlong.toFixed(2)} m` +
    `\n        range of along errors                 ${Math.min(...alongs).toFixed(2)} to ${Math.max(...alongs).toFixed(2)} m\n`
  );

  // ── the verdict ──
  //
  // 1.5 m of median gap is generous and deliberately so: at a two-degree
  // descent the shaft travels roughly thirty metres for every metre of height,
  // so a centimetre of honest launch-angle scatter is tens of centimetres of
  // range and a bank in the way is more. The claim being tested is not "the
  // model is exact" — it is "the model is not systematically wrong", and a
  // metre and a half at these ranges is well inside marksmanship.
  check('the shaft lands where our own ballistics said it would',
    medGap < 1.5, `median ${medGap.toFixed(2)} m from the predicted spot`);

  // ── THE ONE THAT ANSWERS THE QUEUE, and it is a test of the SIGN ──
  //
  // Scatter is symmetric; a bias is not. The first draft of this check tested
  // the mean against a tolerance and PASSED a real bias at +0.31 m — twelve
  // arrows long out of twelve, which is a coin landing heads a dozen times.
  // The magnitude was small and the sign was unanimous, and it was the sign
  // that was the finding: `predictLanding` launched from the eye while the bow
  // launches from `BOW.muzzle`, half a metre down the aim line.
  //
  // So this counts the signs. Ten of twelve one way is a one-in-forty accident;
  // demanding a genuine split is what makes the check able to find the next
  // one, and a tolerance on the mean never could.
  const longer = alongs.filter((v) => v > 0).length;
  const shorter = alongs.length - longer;
  const lopsided = Math.max(longer, shorter);
  check('and it does NOT land systematically long or short',
    lopsided <= Math.max(3, Math.ceil(alongs.length * 0.8)) && Math.abs(meanAlong) < Math.max(0.5, medAbs),
    `${longer} long, ${shorter} short — mean ${(meanAlong > 0 ? '+' : '') + meanAlong.toFixed(2)} m ` +
      `against a median absolute of ${medAbs.toFixed(2)} m`);

  // Across is spread and nothing else here — there is no lead, no wind and no
  // moving archer. If this walks off zero the shot does not go where it points.
  const meanAcross = mean(dry.map((s) => s.across));
  check('and it does not drift to one side',
    Math.abs(meanAcross) < 0.5,
    `mean ${(meanAcross > 0 ? '+' : '') + meanAcross.toFixed(2)} m off the aim line`);

  // ── and the thing the board was actually reading ──
  //
  // The number that started all this. A shaft aimed through a deer's chest
  // carries on to the ground, and how far past is geometry, not error. Printed
  // here beside the real errors so the next person to read "+3 m long" on the
  // board has the yardstick in front of them.
  // Solved for a flat 20 m shot at a chest 0.75 m up, from a CROUCHED eye —
  // exactly the shot the board was describing when it said "+3 m long at 20 m".
  const flat = () => 0;
  const perfect = predictLanding(
    { x: 0, y: 0, z: 0 }, PLAYER.crouchHeight,
    solvePitch(20, AGENTS.aimAboveFeet - PLAYER.crouchHeight), 0, flat
  ).dist;
  console.log(`      for scale: a PERFECT shot through a deer's chest at 20 m — one that passes exactly` +
    `\n      through the animal — still buries itself ${(perfect - 20).toFixed(0)} m past it, because it is descending` +
    `\n      at barely two degrees. "+3 m long at 20 m" was an arrow landing ${(perfect - 23).toFixed(0)} m SHORT of a` +
    `\n      flawless one. The board was reading geometry and calling it a bias.\n`);

  archer.close();
  await sleep(200);
  stop();

  const failed = results.filter((r) => !r.pass);
  console.log(`  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  could not run: ${err.message}\n`);
  process.exit(1);
});
