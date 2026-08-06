// ── rangecheck.js ───────────────────────────────────────────────────────────
// How far away is a deer still worth an arrow?
//
//   npm run rangecheck            (node server/rangecheck.js 8087)
//
// ── why this exists ──
//
// `AGENTS.shootRange` is 26 m and the body is inside it for **5-14% of a run**.
// Two sessions have now ended with the same sentence: the aim is fine, the
// arrows go home, there are almost no shots. Shot RATE is the whole remaining
// tail of the hunt, and the cheapest lever on it by a mile is the constant that
// decides when a shot is on the table at all.
//
// The constant has never been measured. It was cut from 45 to 26 on a
// DELIBERATION argument, which is written down honestly in `config.js`: at 45
// the body spent its time considering shots the ground would never allow, 19
// refusals to 2 arrows. That is a real observation and it is not the same claim
// as "an arrow at 35 m misses". Nothing in this repo has ever asked the second
// question. `ballisticscheck` asks where a shaft lands on the GROUND, which is
// geometry amplified thirtyfold by a two-degree descent; a deer is 1.1 m wide
// and 1.75 m tall and stands between the archer and that landing point.
//
// So this check asks the only question that licenses the number: **fire a real
// arrow at a deer-sized mark at a known range, and did the shaft go through
// it.** Banded, so the answer is a curve rather than an anecdote.
//
// THE HOUSE RULE IS OBEYED. Real server as a child process, a real socket, a
// real draw and a real release, and the trajectory read off the wire — nothing
// here reaches into SimWorld. The hit test is `segmentCylinder` imported from
// `creatures/manager.js`, the same function the server's own `hitTest` calls,
// against `SPECIES.deer.radius` and `SPECIES.deer.height` read from the
// registry. Nothing about the target is invented here.
//
// ── what it does NOT prove, stated up front ──
//
// The mark is a cylinder standing on real ground, not a live animal. That is
// deliberate — a deer cannot be placed, and a stalked one bolts — but it means
// three things are outside this instrument:
//
//   * the server's own `Wildlife.hitTest` loop and the `hitZones` multiplier.
//     This measures whether the SHAFT ARRIVED, not what it did on arrival.
//   * a real deer's TURNING. The walking arms move at a constant velocity that
//     `aimAt` is handed exactly. That is the best case the lead will ever see.
//   * `NET.interpolationMs`. The real agent adds 110 ms of interpolation lag to
//     its lead because it is aiming at a stale drawing of the animal. This
//     check aims at a mark whose position it knows to the centimetre and passes
//     `lag: 0`. Again: best case.
//
// Every one of those biases points the same way — this check FLATTERS long
// range. If the curve falls off here it falls off harder in the game.
//
// ── the failure modes it was built expecting ──
//
//   * A 20 Hz WIRE AGAINST A 74 m/s ARROW. Snapshots carry the shaft every 3
//     ticks, which is 3.7 m of flight, and the mark is 1.1 m wide. Sampling the
//     POINTS would step straight over the target. `segmentCylinder` tests a
//     SEGMENT, so the chord between two samples catches it — and each wire
//     segment is subdivided 16 ways anyway so the walking mark can be moved
//     under it. Over 50 ms the arc's sag under a chord is about 1.2 cm.
//   * AN INSTRUMENT THAT AGREES WITH ITSELF. The height the shaft passes at is
//     compared against `arrowError`, our own model of the same shot, and the
//     check FAILS if the wire and the model part company. Two numbers from two
//     sources; if they disagree this file is wrong before the game is.
//   * A HIT TEST THAT SAYS YES TO EVERYTHING. Every trajectory is ALSO scored
//     against a decoy cylinder shoved 3 m across the aim line. That decoy must
//     never be hit. It is the arm sentinel, it costs no arrows, and without it
//     a hit rate of 100% at every band would be indistinguishable from a
//     `segmentCylinder` call with a bug in its arguments.
//   * AN EMPTY QUIVER, WHICH IS COMPLETELY SILENT. `Bow.fire` cancels and
//     returns when `consumeAmmo` fails: no shaft, no event, no complaint. The
//     starting kit is 12 arrows and this check wants sixty-odd, so it stages
//     more — `STOCK=arrow:20` four times over, because `parseStock` caps each
//     ENTRY at 20 and applies every entry. 92 arrows, and a shot that produces
//     no shaft is reported as a dry quiver rather than as a lost arrow.

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
import { aimAt, arrowError, arcClearance, solvePitch } from '../src/minds/marksman.js';
import { segmentCylinder } from '../src/creatures/manager.js';
import { SPECIES } from '../src/creatures/registry.js';
import { timberBlocker } from '../src/world/timber.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8087);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── the target, read from the registry rather than typed in here ────────────
//
// A FIXTURE WRITTEN FROM THE SAME GUESS AS THE CODE DOES NOT TEST IT. These are
// the exact numbers `Wildlife.hitTest` uses to decide whether a shaft hit an
// animal, so if a deer is ever resized this check resizes with it.
const DEER = SPECIES.deer;
const MARK_R = DEER.radius;
const MARK_H = DEER.height;
// A deer that has heard something and is moving off, which is what a hunting
// body is usually shooting at. `flee` is 10.5 and a fleeing deer is not a shot
// anybody should be taking; `graze` is 0.55 and is barely different from still.
const TROT = DEER.speeds.trot;

/** A body with no eyes and no opinions — it holds a trigger and reports. */
class WireClient {
  constructor(name) {
    this.name = name;
    this.id = null;
    this.me = null;
    this.events = [];
    // Tick-stamped, because the wall clock is not the sim clock and the walking
    // mark has to be placed at the moment each sample was taken. `t` is
    // `SimWorld.tick` at 60 Hz — see the snapshot builder in sim/world.js.
    this.samples = [];
    // ── HOW MANY SHAFTS ARE IN THE SKY, THIS SNAPSHOT ──
    //
    // `pr` is a GLOBAL list and carries NO id. A 52 m lofted shot is airborne
    // for seconds and `ARROW.maxFlightTime` is twelve of them, so the first
    // draft's second arrow was scored against a list holding two flights
    // interleaved — which reads as a trajectory that leaps sideways, and
    // produced closest approaches of 48 m and 86 m to a mark 44 m away. The
    // model-versus-wire assertion caught it; nothing else would have.
    //
    // With no id on the wire the only honest fix is to make the sky empty
    // before drawing and to WATCH it stay that way. One is fine; two is
    // contamination and the flight is thrown out rather than averaged in.
    this.inFlight = 0;
    this.maxInFlight = 0;
    this.intent = { forward: 0, strafe: 0, lookYaw: 0, lookPitch: 0, primary: false, crouch: true };
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
          for (const e of s.ev ?? []) this.events.push(e);
          this.inFlight = (s.pr ?? []).length;
          if (this.inFlight > this.maxInFlight) this.maxInFlight = this.inFlight;
          for (const pr of s.pr ?? []) {
            this.samples.push({ t: s.t, x: pr.p[0], y: pr.p[1], z: pr.p[2], v: pr.v });
          }
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
 * Hold an aim, draw fully, loose one shaft, and hand back its flight.
 *
 * Shorter than `ballisticscheck`'s equivalent on purpose: that one waits out
 * `ARROW.maxFlightTime` because it needs the LANDING, and a lofted shaft can be
 * down the valley for ten seconds. This one needs the part of the flight around
 * the mark, which at 74 m/s is over inside a second at every band here, so it
 * stops as soon as the shaft is past the mark's range or the impact arrives.
 * That is the difference between a four minute run and a twenty minute one.
 */
async function oneShot(c, yaw, pitch, pastRange) {
  c.intent.aimYaw = yaw;
  c.intent.aimPitch = pitch;
  c.intent.primary = false;
  // Long enough for the feet to settle and for `BOW.cooldown` (0.22 s) to
  // clear, so a shot is never eaten by the pause after the last one.
  await driveFor(500, c);

  // ── AND WAIT FOR AN EMPTY SKY ──
  //
  // The previous shaft may still be flying: `pr` carries no id, so a second
  // arrow launched under the first produces one interleaved list and a
  // trajectory that appears to teleport. `ARROW.maxFlightTime` is 12 s, which
  // bounds this; in practice a 52 m lob clears in about three.
  const skyT0 = Date.now();
  while (c.inFlight > 0 && Date.now() - skyT0 < 13_000) {
    c.sendIntent();
    await sleep(1000 / 30);
  }

  // Read the stand off the server rather than assuming it. `e` is the body's
  // OWN eye height, which is `PLAYER.crouchHeight` here because this body
  // stalks crouched, and the whole arc hangs off it.
  const from = { x: c.me.p[0], y: c.me.p[1], z: c.me.p[2] };
  const eye = c.me.e ?? PLAYER.eyeHeight;
  const servedYaw = c.me.y;
  const servedPitch = c.me.t;

  c.samples.length = 0;
  c.events.length = 0;
  c.maxInFlight = 0;

  // A full draw plus margin: below a full charge the launch speed is lerped
  // down toward `BOW.minSpeed` and every number below would be about a bow
  // nobody drew. `AGENTS.drawMargin` is the hunting body's own hold — well
  // under `BOW.holdFatigue` (3.2 s), where the aim starts to shake.
  //
  // ── AND IT IS `AGENTS.drawMargin`, NOT `BOW.drawMargin` ──
  //
  // The first draft wrote `BOW.drawMargin`, which has never existed. `(0.92 +
  // undefined) * 1000` is NaN, `while (Date.now() - t0 < NaN)` is false on the
  // first evaluation, and the trigger therefore went up and down inside one
  // tick. `Bow.endPrimary` finds `charge` under `BOW.minCharge`, calls
  // `cancel()`, and KEEPS THE ARROW — no shaft, no event, no complaint, and an
  // inventory that still reads 92. It presents as an empty quiver on the very
  // first shot of the run, which is not remotely what it is. A name used and
  // never defined, invisible to the build, found only by running the line.
  c.intent.primary = true;
  await driveFor((BOW.drawTime + AGENTS.drawMargin) * 1000, c);
  c.intent.primary = false;

  // Wait for the shaft to get past the mark, or to stop. 2.5 s covers 52 m of
  // flight three times over even after drag.
  const t0 = Date.now();
  let impact = null;
  while (Date.now() - t0 < 2500) {
    c.sendIntent();
    impact = c.events.find((e) => e.k === 'miss' && e.by === c.id && e.at);
    if (impact) break;
    const last = c.samples[c.samples.length - 1];
    if (last && Math.hypot(last.x - from.x, last.z - from.z) > pastRange + 6) break;
    await sleep(1000 / 30);
  }

  // ── AN EMPTY QUIVER LOOKS EXACTLY LIKE A DRAW THAT NEVER HAPPENED ──
  //
  // Both are completely silent — `Bow.fire` cancels when `consumeAmmo` fails,
  // and `endPrimary` cancels when the charge is under `BOW.minCharge` — and the
  // first draft of this check reported the second as the first, on shot one of
  // sixty-three. `me.iv` carries the pack across the wire, so the two are told
  // apart by ASKING rather than by assuming: arrows left and no shaft means the
  // trigger is the problem, not the shopping.
  if (!c.samples.length) {
    const left = c.me?.iv?.arrow ?? 0;
    return { dry: true, arrowsLeft: left, noDraw: left > 0 };
  }

  const first = c.samples[0];
  return {
    from, eye, servedYaw, servedPitch,
    speed: Math.hypot(first.v[0], first.v[1], first.v[2]),
    samples: [...c.samples],
    // Never more than one shaft in the sky at once, or these samples are two
    // flights spliced together and every number off them is fiction.
    mixed: c.maxInFlight > 1,
    impact: impact ? { x: impact.at[0], y: impact.at[1], z: impact.at[2], hit: impact.hit } : null,
  };
}

/**
 * Score one flight against one deer-shaped mark.
 *
 * ── why the wire segments are subdivided ──
 *
 * `segmentCylinder` would answer the still case straight off the two wire
 * samples either side of the mark — it tests the whole chord, so a 3.7 m step
 * cannot skip a 1.1 m target. The subdivision is for the WALKING case, where
 * the cylinder is somewhere different at the start of the segment than at the
 * end: at a trot it slides 0.2 m across a wire segment, and a sixteenth of that
 * is 1.3 cm, which is well under the centimetre-rounded positions on the wire.
 *
 * It also buys the miss DISTANCE, which is the number that says how a band is
 * failing rather than that it failed. The closest approach is tracked to the
 * cylinder's AXIS, decomposed into how far across the arrow passed and how far
 * above or below the chest it was aiming at — an over-lead and a shot that flew
 * high are different bugs and a hit rate cannot tell them apart.
 *
 * @param flight  what `oneShot` handed back
 * @param base    the mark's feet at t=0, world space
 * @param vel     {x,z} m/s, or null for a standing mark
 * @param tRelease the sim tick the shaft left the bow, fractional
 */
function scoreAgainst(flight, base, vel, tRelease) {
  const path = [...flight.samples];
  // The last leg, from the final sighting to where it actually stopped. The
  // server splices a landed arrow out of the flight list, so without this the
  // trajectory ends up to 3.7 m short of the ground — and a shaft that clips a
  // mark on its way into the dirt just past it would read as a miss.
  if (flight.impact) {
    const last = path[path.length - 1];
    const gap = Math.hypot(flight.impact.x - last.x, flight.impact.y - last.y, flight.impact.z - last.z);
    const speed = Math.hypot(last.v[0], last.v[1], last.v[2]) || BOW.maxSpeed;
    path.push({ t: last.t + (gap / speed) * 60, x: flight.impact.x, y: flight.impact.y, z: flight.impact.z, v: last.v });
  }

  const SUB = 16;
  let hit = false;
  let best = null;

  const markAt = (tick) => {
    if (!vel) return base;
    const secs = Math.max(0, (tick - tRelease) / 60);
    const x = base.x + vel.x * secs;
    const z = base.z + vel.z * secs;
    // A deer walks on the ground, not on the plane its feet started on.
    return { x, y: heightAt(x, z), z };
  };

  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    for (let s = 0; s < SUB; s++) {
      const f0 = s / SUB;
      const f1 = (s + 1) / SUB;
      const p0 = { x: a.x + (b.x - a.x) * f0, y: a.y + (b.y - a.y) * f0, z: a.z + (b.z - a.z) * f0 };
      const p1 = { x: a.x + (b.x - a.x) * f1, y: a.y + (b.y - a.y) * f1, z: a.z + (b.z - a.z) * f1 };
      const m = markAt(a.t + (b.t - a.t) * ((f0 + f1) / 2));
      if (segmentCylinder(p0, p1, m, MARK_R, MARK_H) !== null) hit = true;
      // Closest approach to the AXIS, sampled at the sub-segment's start. At a
      // sixteenth of a wire step that is 23 cm of flight, and near the closest
      // point the radial distance is stationary by definition, so the reading
      // is far finer than the spacing suggests.
      const across = Math.hypot(p0.x - m.x, p0.z - m.z);
      if (!best || across < best.across) {
        best = {
          across,
          // Relative to the chest the shot was aimed at — `AGENTS.aimAboveFeet`
          // above the animal's feet — so a positive number is a shaft that
          // passed over its back.
          vert: p0.y - (m.y + AGENTS.aimAboveFeet),
          at: Math.hypot(p0.x - flight.from.x, p0.z - flight.from.z),
        };
      }
    }
  }
  return { hit, ...best };
}

/**
 * A bearing at `range` whose arc is not simply an oak or a hillside.
 *
 * Same argument as `ballisticscheck.planShot` and screened with the SAME
 * `arcClearance` and the SAME blocker a hunting agent uses: a shaft that ends
 * in a trunk measures the height field's blind spot, not the bow. The bearing
 * walks the compass so the run is not one line of ground and one accident of
 * slope — and the CLIMB comes free with it, because rolling terrain puts a mark
 * at 30 m anywhere from ten metres below the eye to ten above it, which is the
 * variable last run's refusal instrument said dominates everything.
 */
function planMark(from, eye, range, blocker, startYaw) {
  const eyeY = from.y + eye;
  for (let step = 0; step < 72; step++) {
    const half = Math.ceil(step / 2) * (step % 2 ? 1 : -1);
    const yaw = startYaw + (half * 5 * Math.PI) / 180;
    const mx = from.x - Math.sin(yaw) * range;
    const mz = from.z - Math.cos(yaw) * range;
    const baseY = heightAt(mx, mz);
    const markY = baseY + AGENTS.aimAboveFeet;
    const pitch = solvePitch(range, markY - eyeY);
    if (pitch === null) continue;
    const arc = arcClearance(from, eyeY, pitch, { x: mx, y: markY, z: mz }, heightAt, { solidAt: blocker });
    if (arc.blocked) continue;
    return { x: mx, y: baseY, z: mz, yaw };
  }
  return null;
}

// ── the bands ───────────────────────────────────────────────────────────────
//
// GROUND ranges, bracketing `AGENTS.shootRange` on both sides — the answer is
// then reported by SLANT, because slant is what the rule is written in and the
// two differ by the climb, which on this terrain is metres. 12 is
// `AGENTS.standOff`, the closest the body will ever willingly stand; 52 is
// twice the current ceiling and past the 45 the constant was cut down from, so
// the curve covers the whole of the argument rather than one side of it.
const RANGES = [12, 18, 24, 30, 36, 44, 52];
// Different BEARING each time, not the same shot three times: `BOW.spreadFull`
// is 0.0022 rad, which is 9 cm at 40 m against a mark 110 cm wide, so repeating
// a bearing measures nothing. The variance that matters is the ground.
const PER_RANGE = 3;

// ── the three arms ──────────────────────────────────────────────────────────
//
// `still` is the ceiling: a grazing animal, perfect knowledge, no lead at all.
// Whatever this arm cannot do at a range, nothing can.
// `lead` is the same mark at a trot with `aimAt` handed its exact velocity —
// the lead solver's best case, and the arm that says whether range costs
// accuracy through TIME OF FLIGHT.
// `nolead` is the sentinel. It is the same walking mark aimed at where the
// animal IS. Its miss distance must grow with range BY CONSTRUCTION — flight
// time times 4.2 m/s — so if it does not, the walking machinery in this file is
// not doing anything and the `lead` arm's numbers are worthless.
const ARMS = [
  { id: 'still', label: 'standing', moving: false, lead: false },
  { id: 'lead', label: 'at a trot, led', moving: true, lead: true },
  { id: 'nolead', label: 'at a trot, NOT led', moving: true, lead: false },
];

const pc = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—');
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function main() {
  console.log('\n  How far away is a deer still worth an arrow?\n');
  console.log(`      the mark: a ${DEER.name.toLowerCase()} — ${(MARK_R * 2).toFixed(2)} m wide, ${MARK_H.toFixed(2)} m tall, ` +
    `aimed at a chest ${AGENTS.aimAboveFeet} m up`);
  console.log(`      the rule under test: AGENTS.shootRange = ${AGENTS.shootRange} m of SLANT\n`);
  await requireFreePort(PORT, 'rangecheck');

  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    // No danger and no rival minds: the question is the bow, and a bear eating
    // the archer answers a different one. The quiver is staged four entries
    // deep because `parseStock` caps each entry at 20 — see the header.
    env: {
      ...process.env,
      DANGER: 'none',
      MINDS_HUNTERS: '0',
      STOCK: 'arrow:20,arrow:20,arrow:20,arrow:20',
    },
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

  // Crouched, because that is how this game hunts: `AGENTS.stalkWithin` is 45 m
  // and the body stalks crouched inside it, so the eye is `PLAYER.crouchHeight`
  // (1.05 m) rather than 1.72. Two thirds of a metre of launch height is the
  // difference between an arc that clears a lip of turf and one that does not,
  // and measuring from a standing eye would measure a shot nobody takes.
  archer.intent.crouch = true;
  await driveFor(1800, archer);

  const eye0 = archer.me.e ?? PLAYER.eyeHeight;
  console.log(`      standing at ${archer.me.p.map((n) => n.toFixed(1)).join(', ')}, ` +
    `eye ${eye0.toFixed(2)} m ${eye0 < PLAYER.eyeHeight - 0.05 ? '(crouched, as a stalking body is)' : '(UPRIGHT — the crouch did not take)'}\n`);
  check('and it is crouched, which is the stance this game hunts in',
    eye0 < PLAYER.eyeHeight - 0.05,
    `eye ${eye0.toFixed(2)} m against a standing ${PLAYER.eyeHeight} m`);

  // The wood inside 140 m, cached once — the body does not move all run.
  const blocker = timberBlocker(archer.me.p[0], archer.me.p[2], 140);

  const shots = [];
  let unplanned = 0;
  let dry = false;
  // A refusal is DATA, not a failure. `aimAt` is the real solver and the lead
  // moves the aim point sideways, sometimes into a trunk the standing shot had
  // a clear line past — so the walking arms lose bearings the standing one
  // keeps. Counted and named rather than folded into "arrows that did not fly",
  // which is a different fault entirely.
  const refusals = [];

  console.log('        band   arm                  slant   climb   pitch     across    vert    outcome');
  console.log('        ─────────────────────────────────────────────────────────────────────────────────');

  for (const range of RANGES) {
    for (let n = 0; n < PER_RANGE; n++) {
      const from0 = { x: archer.me.p[0], y: archer.me.p[1], z: archer.me.p[2] };
      const site = planMark(from0, eye0, range, blocker, archer.me.y + (n * 53 * Math.PI) / 180);
      if (!site) {
        unplanned++;
        console.log(`        ${String(range).padStart(3)} m  no clear arc on any bearing`);
        continue;
      }
      // Across the line of sight: the hardest lead case and the commonest sight
      // — a grazing herd drifts sideways far more often than it charges.
      const vel = { x: -Math.cos(site.yaw) * TROT, z: Math.sin(site.yaw) * TROT };

      for (const arm of ARMS) {
        if (dry) break;
        const from = { x: archer.me.p[0], y: archer.me.p[1], z: archer.me.p[2] };
        const eye = archer.me.e ?? PLAYER.eyeHeight;
        const mark = { x: site.x, y: site.y + AGENTS.aimAboveFeet, z: site.z };

        // ── the aim, taken from the REAL solver the game aims with ──
        //
        // `maxRange` is deliberately opened up. The whole point is to see how a
        // 40 m shot flies even though `AGENTS.shootRange` refuses it — asking
        // `aimAt` with the game's own ceiling would return `too far` and
        // measure nothing but the constant being tested. What the game WOULD
        // have said is recorded separately, off the same slant.
        // `lag: 0` because this check knows exactly where its mark is; the real
        // agent adds `NET.interpolationMs` on top because it is aiming at a
        // drawing that is 110 ms old. Best case, and said so in the header.
        const shot = aimAt(from, mark, heightAt, {
          maxRange: 500,
          velocity: arm.moving && arm.lead ? vel : null,
          lag: 0,
          eye,
          solidAt: blocker,
        });
        if (!shot.shoot) {
          refusals.push({ range, arm: arm.id, why: shot.why });
          console.log(`        ${String(range).padStart(3)} m  ${arm.label.padEnd(20)} refused: ${shot.why}`);
          continue;
        }

        const flight = await oneShot(archer, shot.yaw, shot.pitch, range);
        if (flight.dry) {
          dry = true;
          console.log(`        ${String(range).padStart(3)} m  ${arm.label.padEnd(20)} NO ARROW LEFT THE BOW — ` +
            (flight.noDraw
              ? `and the quiver still holds ${flight.arrowsLeft}, so the DRAW never completed`
              : 'the quiver is empty'));
          break;
        }

        // ── when the shaft actually left, in sim ticks ──
        //
        // The first sighting is already a tick or two into the flight, and at a
        // trot the mark slides 7 cm per tick. Backed out of the first sample's
        // own distance from the muzzle and its own speed, so the walking mark's
        // t=0 is the release rather than the first packet. Small, and it is a
        // bias rather than scatter, which is the kind this project has been
        // caught by twice.
        const s0 = flight.samples[0];
        const muzzle = {
          x: flight.from.x - Math.sin(flight.servedYaw) * BOW.muzzle * Math.cos(flight.servedPitch),
          y: flight.from.y + flight.eye + BOW.muzzle * Math.sin(flight.servedPitch),
          z: flight.from.z - Math.cos(flight.servedYaw) * BOW.muzzle * Math.cos(flight.servedPitch),
        };
        const back = Math.hypot(s0.x - muzzle.x, s0.y - muzzle.y, s0.z - muzzle.z) /
          (Math.hypot(s0.v[0], s0.v[1], s0.v[2]) || BOW.maxSpeed);
        const tRelease = s0.t - back * 60;

        const base = { x: site.x, y: site.y, z: site.z };
        const scored = scoreAgainst(flight, base, arm.moving ? vel : null, tRelease);

        // ── THE DECOY, and it costs nothing ──
        //
        // The same trajectory against the same cylinder shoved 3 m across the
        // aim line. It must never be hit. A hit rate of 100% at every band and
        // a `segmentCylinder` call with its arguments in the wrong order look
        // identical from the outside; this is the difference.
        const px = -Math.cos(site.yaw);
        const pz = Math.sin(site.yaw);
        const decoyBase = { x: base.x + px * 3, z: base.z + pz * 3 };
        decoyBase.y = heightAt(decoyBase.x, decoyBase.z);
        const decoy = scoreAgainst(flight, decoyBase, arm.moving ? vel : null, tRelease);

        // What the game's own rule would have made of this shot. `aimAt`
        // computes the slant to the LEAD-ADJUSTED point, which is the number
        // `AGENTS.shootRange` is actually compared against — so recompute it
        // the same way rather than off the animal's own position.
        const eyeY = from.y + eye;
        const slant = Math.hypot(shot.dist, mark.y - eyeY);
        const climb = mark.y - eyeY;

        // ── OUR OWN MODEL of the same shot, as a check on this check ──
        //
        // `arrowError` says how far above the mark the shaft passes at that
        // range. The wire says the same thing through `scored.vert`. They are
        // two independent answers to one question and they have to agree, or
        // this file is wrong before the game is.
        const modelled = arrowError(flight.servedPitch, shot.dist, mark.y - eyeY);

        shots.push({
          range, arm: arm.id, slant, climb, pitch: flight.servedPitch,
          hit: scored.hit, across: scored.across, vert: scored.vert,
          decoy: decoy.hit, modelled, speed: flight.speed, mixed: flight.mixed,
          surface: flight.impact?.hit ?? null,
          inGameRange: slant <= AGENTS.shootRange,
        });

        console.log(
          `        ${String(range).padStart(3)} m  ${arm.label.padEnd(20)} ` +
          `${slant.toFixed(1).padStart(5)}  ${((climb > 0 ? '+' : '') + climb.toFixed(1)).padStart(6)}  ` +
          `${(flight.servedPitch * 57.3).toFixed(1).padStart(5)}°  ` +
          `${scored.across.toFixed(2).padStart(7)}  ${((scored.vert > 0 ? '+' : '') + scored.vert.toFixed(2)).padStart(6)}  ` +
          `  ${scored.hit ? 'HIT' : 'miss'}${flight.impact?.hit ? ` (${flight.impact.hit})` : ''}` +
          `${decoy.hit ? '  ** DECOY ALSO HIT **' : ''}${flight.mixed ? '  ** TWO SHAFTS IN THE SKY **' : ''}`
        );
      }
      if (dry) break;
    }
    if (dry) break;
  }

  const planned = RANGES.length * PER_RANGE * ARMS.length;
  check('every shot the solver accepted put a shaft in the air',
    shots.length === planned - refusals.length && !dry && unplanned === 0,
    `${shots.length} arrows flew, ${refusals.length} of ${planned} were refused by \`aimAt\` before the draw` +
      (unplanned ? `  — AND ${unplanned} bands had no clear bearing at all` : '') +
      (dry ? ' — AND THE QUIVER RAN DRY, so the run is short of arrows, not of answers' : ''));

  if (refusals.length) {
    // Named, because WHICH arm loses bearings is the thing to know: the lead
    // swings the aim point sideways, so the walking arms are screened against a
    // different piece of hillside from the standing one and their sample is not
    // the same sample.
    const byArm = ARMS.map((a) => `${a.label} ${refusals.filter((r) => r.arm === a.id).length}`).join(', ');
    console.log(`\n      ${refusals.length} refusals before the draw (${byArm}) — ` +
      `${refusals.filter((r) => /tree/.test(r.why)).length} timber, ` +
      `${refusals.filter((r) => /ground/.test(r.why)).length} ground. ` +
      `The lead moves the aim point, so the walking arms lose lines the standing one keeps.`);
  }

  // ── AND ONE SHAFT AT A TIME, or the samples are two flights ──
  const mixed = shots.filter((s) => s.mixed);
  check('one shaft in the sky at a time, so a trajectory is one arrow',
    mixed.length === 0,
    mixed.length
      ? `${mixed.length} flights were scored while a second shaft was airborne — ` +
        'THOSE TRAJECTORIES ARE TWO ARROWS SPLICED TOGETHER'
      : `${shots.length} flights, none of them sharing the sky with another arrow`);

  // ── THE SENTINEL, before anything else is believed ──
  const decoyed = shots.filter((s) => s.decoy);
  check('a mark 3 m to one side is never hit',
    decoyed.length === 0,
    decoyed.length
      ? `${decoyed.length} of ${shots.length} trajectories "hit" a decoy shoved 3 m across the aim line — ` +
        'THE HIT TEST IN THIS FILE IS WRONG AND EVERY NUMBER BELOW IS WORTHLESS'
      : `${shots.length} trajectories scored against a decoy 3 m off the line, none of them hit it`);

  // ── AND THE WIRE AND THE MODEL AGREE ──
  //
  // Only on the standing arm: on a walking one `scored.vert` is measured at the
  // closest approach to a mark that has MOVED, and `arrowError` knows nothing
  // about that. Comparing them there would be comparing two different shots.
  const still = shots.filter((s) => s.arm === 'still');
  const gaps = still.map((s) => Math.abs(s.vert - s.modelled));
  const worstGap = gaps.length ? Math.max(...gaps) : 0;
  check('and the height the wire says the shaft passed at is the height our model says',
    worstGap < 0.5,
    `worst disagreement ${worstGap.toFixed(2)} m over ${still.length} standing shots ` +
      `(median ${median(gaps).toFixed(2)} m)`);

  // ── the curve ───────────────────────────────────────────────────────────────
  console.log('\n      HIT RATE BY BAND — a real arrow through a deer-shaped mark, over a socket\n');
  console.log('        ground   slant       standing        at a trot, led     at a trot, NOT led');
  console.log('        ────────────────────────────────────────────────────────────────────────────');
  const byRange = new Map();
  for (const s of shots) {
    if (!byRange.has(s.range)) byRange.set(s.range, []);
    byRange.get(s.range).push(s);
  }
  const rate = (list) => {
    if (!list.length) return { n: 0, hit: 0, text: '     —      ' };
    const hit = list.filter((s) => s.hit).length;
    return {
      n: list.length, hit,
      text: `${String(hit)}/${list.length} ${pc(hit, list.length).padStart(4)}  ` +
        `${median(list.map((s) => Math.hypot(s.across, s.vert))).toFixed(2)} m`,
    };
  };
  const armRates = new Map(ARMS.map((a) => [a.id, []]));
  for (const range of RANGES) {
    const list = byRange.get(range) ?? [];
    const cells = ARMS.map((a) => {
      const sub = list.filter((s) => s.arm === a.id);
      armRates.get(a.id).push({ range, ...rate(sub) });
      return rate(sub).text.padEnd(22);
    });
    const slants = list.map((s) => s.slant);
    const mark = list.some((s) => s.inGameRange) && list.some((s) => !s.inGameRange) ? ' <- shootRange' : '';
    console.log(`        ${String(range).padStart(4)} m  ${slants.length ? `${Math.min(...slants).toFixed(0)}-${Math.max(...slants).toFixed(0)}` : '—'}`.padEnd(23) +
      cells.join('') + mark);
  }
  console.log('\n        (the metres beside each rate are the MEDIAN miss from the chest, hits included —');
  console.log('         a band can be at 100% and still be drifting toward the edge of the animal)\n');

  // ── the numbers the verdicts are drawn from ─────────────────────────────────
  const inRange = still.filter((s) => s.inGameRange);
  const beyond = still.filter((s) => !s.inGameRange);
  const inHit = inRange.filter((s) => s.hit).length;
  const beyondHit = beyond.filter((s) => s.hit).length;

  check(`inside shootRange a standing deer is hit`,
    inRange.length > 0 && inHit / inRange.length >= 0.8,
    `${inHit}/${inRange.length} (${pc(inHit, inRange.length)}) at ${AGENTS.shootRange} m of slant or less`);

  // ── AND THIS IS THE QUEUE'S QUESTION ───────────────────────────────────────
  //
  // Not "is 26 too small" — that is a judgement — but the fact the judgement
  // needs: does the arrow still arrive out there. Reported as a rate and as the
  // band where it stops arriving, and asserted only in the direction that is
  // safe to assert: the CURRENT number must not already be past the falloff.
  check('and shootRange is not already past where the arrow stops arriving',
    inRange.length > 0 && inHit / inRange.length >= 0.6,
    `the band that contains ${AGENTS.shootRange} m hits at ${pc(inHit, inRange.length)} — ` +
      (inHit / inRange.length >= 0.6 ? 'the constant is inside the honest envelope' : 'the constant is ALREADY too generous'));

  console.log(`\n      BEYOND the current rule: a standing deer past ${AGENTS.shootRange} m of slant was hit ` +
    `${beyondHit}/${beyond.length} (${pc(beyondHit, beyond.length)}).`);

  // Where each arm falls below half, read off the bands rather than asserted.
  for (const arm of ARMS) {
    const rows = armRates.get(arm.id).filter((r) => r.n);
    const fell = rows.find((r) => r.hit / r.n < 0.5);
    console.log(`        ${arm.label.padEnd(20)} holds to ` +
      (fell ? `${rows[Math.max(0, rows.indexOf(fell) - 1)].range} m and falls under half at ${fell.range} m`
            : `${rows.length ? rows[rows.length - 1].range : '?'} m — it never fell under half in this run`));
  }

  // ── THE LEAD SENTINEL ──
  //
  // A number that is small on one arm and large on the other BY CONSTRUCTION.
  // An unled shot at a trotting deer must miss by roughly flight time times 4.2
  // m/s, growing with range; if it does not, the walking machinery in this file
  // never moved anything and the led arm proves nothing.
  const led = shots.filter((s) => s.arm === 'lead');
  const unled = shots.filter((s) => s.arm === 'nolead');
  const ledMiss = median(led.map((s) => s.across));
  const unledMiss = median(unled.map((s) => s.across));
  check('a trotting mark that is NOT led is missed, and the led one is not',
    unled.length > 0 && led.length > 0 && unledMiss > ledMiss + 0.5,
    `unled ${unledMiss.toFixed(2)} m across against led ${ledMiss.toFixed(2)} m — ` +
      `${unledMiss > ledMiss + 0.5 ? 'the mark really is moving and the lead really is working' : 'THE MARK IS NOT MOVING: distrust every walking number in this run'}`);

  // ── what a change would actually buy, in the only currency that matters ────
  console.log(`\n      WHAT RAISING THE RULE WOULD BUY, and what it would cost:`);
  for (const r of armRates.get('still')) {
    if (!r.n) continue;
    const beyondHere = still.filter((s) => s.range <= r.range);
    const h = beyondHere.filter((s) => s.hit).length;
    console.log(`        a ceiling at ${String(r.range).padStart(2)} m of ground range: ` +
      `${h}/${beyondHere.length} of every standing shot inside it arrives (${pc(h, beyondHere.length)})`);
  }
  console.log(`\n      Read that against the reason the constant is 26 and not 45, which is written in`);
  console.log(`      config.js and is NOT about accuracy: at 45 the body deliberated over shots the`);
  console.log(`      ground would never allow — 19 refusals to 2 arrows. This check cannot see that`);
  console.log(`      cost, because it plans a clear bearing before every shot. It answers the other`);
  console.log(`      half: whether the arrow arrives. Both halves are needed to move the number.\n`);

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
