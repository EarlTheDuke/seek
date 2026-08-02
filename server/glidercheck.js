// ── glidercheck.js ──────────────────────────────────────────────────────────
// Does it fly, and does it fly like the thing it is meant to be?
//
//   npm run glidercheck
//
// Flying it is the only way to know, and the browser pane is often not
// available to fly it in — which is exactly how a crash shipped earlier in this
// project. So the model has no THREE and no DOM in it, and this flies a few
// hundred launches over flat air in a few milliseconds.
//
// These are not "does it run" checks. Each one is a claim about the AIRCRAFT
// that would be false of a fake: it has a best glide speed, it stalls at a
// stalling angle and recovers if you have the height, turning costs you, and
// you cannot take off from a field.

import {
  launch, stepGlide, canLaunch, liftCoefficient, dragCoefficient, glideRatio, flightReport,
} from '../src/world/glider.js';
import { GLIDER } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const DT = 1 / 60;
const flat = () => 0;

/** Fly from 1000 m over flat ground until it lands, holding a control input. */
function fly(controls = { pitch: 0, roll: 0 }, { y = 1000, speed, steps = 60 * 400 } = {}) {
  const s = launch({ x: 0, y, z: 0, heading: 0, speed });
  const track = [];
  for (let i = 0; i < steps && s.airborne; i++) {
    const c = typeof controls === 'function' ? controls(s, i * DT) : controls;
    stepGlide(s, c, DT, flat);
    if (i % 60 === 0) track.push({ t: i * DT, v: s.v, y: s.y, sink: s.sink, alpha: s.alpha });
  }
  return { s, track, distance: Math.hypot(s.x, s.z), dropped: y - s.y };
}

console.log('\n  The glider\n');

// ── it flies ──
const trim = fly();
check('it stays up long enough to be flying, not falling',
  trim.distance > 300, `${trim.distance.toFixed(0)} m from 1000 m up`);

// The headline number, and the one the whole config is derived from. Measured
// over the settled part of the glide, not the first seconds, because it is
// launched deliberately out of trim and has to find its own speed.
const settled = trim.track.filter((p) => p.t > 40);
const ratios = settled.map((p) => (p.v * 1) / p.sink);
const meanRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
check('and it glides about 6:1, the way a wooden wing does',
  meanRatio > 5 && meanRatio < 7.2, `${meanRatio.toFixed(1)} m forward per metre down`);

const speeds = settled.map((p) => p.v);
const meanSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
check('at about the speed the equations say it should',
  meanSpeed > 9.5 && meanSpeed < 15, `${meanSpeed.toFixed(1)} m/s — the derivation says 11.8`);

// ── it settles rather than diverging ──
// A model with a sign error usually flies beautifully for ten seconds and then
// accelerates into the ground or into orbit. Compare the first settled minute
// with the last one: a real glider's phugoid damps, it does not build.
const early = settled.slice(0, 20).map((p) => p.v);
const late = settled.slice(-20).map((p) => p.v);
const swing = (a) => Math.max(...a) - Math.min(...a);
check('the phugoid damps out instead of building up',
  swing(late) <= swing(early) + 0.6, `speed swing ${swing(early).toFixed(1)} → ${swing(late).toFixed(1)} m/s`);

// ── there IS a best glide speed ──
// The defining property of a wing: too slow is draggy and too fast is draggy,
// so the distance-you-get curve has a PEAK in the middle rather than running
// off in one direction. A fake glide would just go further the faster you went.
//
// Held stick position, not launch speed — a trimmed aircraft converges on its
// trim speed whatever you throw it at, which is itself the point of the
// stability, so launch speed is the wrong knob to turn.
console.log('');
const byStick = [-0.6, -0.3, 0, 0.3, 0.6].map((p) => ({ p, d: fly({ pitch: p, roll: 0 }).distance }));
const best = byStick.reduce((a, b) => (b.d > a.d ? b : a));
check('there is a best speed, and it is in the middle of the range',
  best.p !== byStick[0].p && best.p !== byStick[byStick.length - 1].p,
  byStick.map((s) => `${s.p > 0 ? 'back' : s.p < 0 ? 'fwd' : 'trim'} ${s.p}→${s.d.toFixed(0)}m`).join(' '));

// And a trimmed aircraft forgets how it was launched, which is what lets you
// throw yourself off a hill badly and still fly.
const slow = fly({ pitch: 0, roll: 0 }, { speed: 7 });
const fast = fly({ pitch: 0, roll: 0 }, { speed: 22 });
check('it settles to the same glide however you launched it',
  Math.abs(slow.distance - fast.distance) / slow.distance < 0.12,
  `thrown at 7 m/s → ${slow.distance.toFixed(0)} m, at 22 → ${fast.distance.toFixed(0)} m`);

// ── the stall ──
const stalled = fly((s) => ({ pitch: s.alpha < GLIDER.alphaStall * 1.4 ? 1 : 0, roll: 0 }), { y: 1000, steps: 60 * 60 });
check('hauling back stalls it', stalled.s.stalled || stalled.track.some((p) => p.alpha > GLIDER.alphaStall),
  `reached ${(Math.max(...stalled.track.map((p) => p.alpha)) * 57.3).toFixed(0)}° of angle of attack, stalls at ${(GLIDER.alphaStall * 57.3).toFixed(0)}°`);
check('and a stall costs you height fast', Math.max(...stalled.track.map((p) => p.sink)) > 4,
  `${Math.max(...stalled.track.map((p) => p.sink)).toFixed(1)} m/s down at the worst of it`);

// Recovery, flown the way a person would fly it: hold it stalled, push the nose
// down until the wing bites again, then CENTRE the stick. The first version of
// this check held full-forward for another twelve seconds and then complained
// about a 40 m/s dive, which is not a failed recovery, it is a power dive — the
// check was wrong, not the aeroplane.
const rec = launch({ x: 0, y: 900, z: 0, heading: 0 });
for (let i = 0; i < 60 * 8; i++) stepGlide(rec, { pitch: 1, roll: 0 }, DT, flat);
const worst = rec.sink;
const stallHeight = rec.y;
let pushed = 0;
while (rec.stalled && rec.airborne && pushed < 60 * 10) { stepGlide(rec, { pitch: -1, roll: 0 }, DT, flat); pushed++; }
for (let i = 0; i < 60 * 15 && rec.airborne; i++) stepGlide(rec, { pitch: 0, roll: 0 }, DT, flat);
check('nose down, then hands off, and it flies again',
  !rec.stalled && rec.airborne && rec.sink < 3 && rec.v > 9,
  `sink ${worst.toFixed(1)} → ${rec.sink.toFixed(1)} m/s at ${rec.v.toFixed(1)} m/s`);
// Measured at 29 m, not asserted at a guess. The number is the point: stall it
// on the approach, below the height of the trees you are landing among, and
// there is no recovery to fly — which is the oldest way there is to die in an
// aeroplane, and it is in here for free because the model is the real one.
check('but a stall costs you real height to get out of',
  stallHeight - rec.y > 20,
  `${(stallHeight - rec.y).toFixed(0)} m used up recovering — stall it lower than that and you do not`);

// ── turning ──
console.log('');
const straight = fly({ pitch: 0, roll: 0 }, { y: 400 });
const turning = fly({ pitch: 0, roll: 1 }, { y: 400 });
check('a banked turn actually turns you',
  Math.abs(turning.s.heading) > 1.5, `${(turning.s.heading * 57.3).toFixed(0)}° of heading change`);
check('and it costs you height, because cos(bank) is in the equation',
  turning.distance < straight.distance,
  `${turning.distance.toFixed(0)} m banked against ${straight.distance.toFixed(0)} m straight`);

// ── you cannot take off from a field ──
console.log('');
const field = canLaunch(0, 0, 0, flat);
check('you cannot launch off flat ground', !field.ok, `"${field.why}"`);

// A ridge, dropping away to the north.
const ridge = (x, z) => 200 - Math.max(0, z) * 0.5;
check('a slope that falls away in front of you will do',
  canLaunch(0, 0, 0, ridge).ok, `${(canLaunch(0, 0, 0, ridge).drop * 100).toFixed(0)}% downhill ahead`);
// Facing back UP the same hill. The slope underfoot is identical — only the
// direction changed — which is the whole reason this looks ahead rather than
// down.
check('the same slope facing uphill will not',
  !canLaunch(0, 0, Math.PI, ridge).ok, 'steep enough, wrong way — checked ahead, not underfoot');

// ── arriving ──
console.log('');
const gentle = fly({ pitch: 0, roll: 0 }, { y: 60 });
check('a normal glide ends in a landing, not a crash',
  gentle.s.landed && !gentle.s.crashed, `${gentle.s.v.toFixed(1)} m/s, sinking ${gentle.s.sink.toFixed(1)}`);

const dive = launch({ x: 0, y: 300, z: 0, heading: 0 });
while (dive.airborne) stepGlide(dive, { pitch: -1, roll: 0 }, DT, flat);
check('diving it into the hill breaks it', dive.crashed && !dive.landed,
  `${dive.v.toFixed(0)} m/s — the limit is ${GLIDER.crashSpeed}`);

// ── the wing itself ──
console.log('');
check('lift rises with angle of attack, then collapses',
  liftCoefficient(0.1) < liftCoefficient(GLIDER.alphaStall) &&
  liftCoefficient(GLIDER.alphaStall + 0.2) < liftCoefficient(GLIDER.alphaStall),
  `Cl 0.1rad=${liftCoefficient(0.1).toFixed(2)} peak=${liftCoefficient(GLIDER.alphaStall).toFixed(2)} stalled=${liftCoefficient(GLIDER.alphaStall + 0.2).toFixed(2)}`);
check('and drag goes UP when it does — that is why a stall bites',
  dragCoefficient(0.6, GLIDER.alphaStall + 0.2) > dragCoefficient(0.6, 0.1) * 2,
  `Cd ${dragCoefficient(0.6, 0.1).toFixed(2)} flying, ${dragCoefficient(0.6, GLIDER.alphaStall + 0.2).toFixed(2)} stalled`);

// ── it is told in words ──
const words = new Set();
const talker = launch({ x: 0, y: 1000, z: 0, heading: 0 });
for (let i = 0; i < 60 * 200 && talker.airborne; i++) {
  stepGlide(talker, { pitch: Math.sin(i / 240), roll: 0 }, DT, flat);
  words.add(flightReport(talker));
}
check('the aircraft talks to you in words, not instruments', words.size >= 3,
  [...words].join(' · '));
check('and a glide ratio is a number you could act on', Number.isFinite(glideRatio(trim.s)) || trim.s.sink <= 0.05);

// ── determinism ──
const a = fly({ pitch: 0.3, roll: 0.2 }, { y: 500 });
const b = fly({ pitch: 0.3, roll: 0.2 }, { y: 500 });
check('two identical flights land in the same place',
  a.s.x === b.s.x && a.s.z === b.s.z && a.s.y === b.s.y,
  `${a.s.x.toFixed(3)}, ${a.s.z.toFixed(3)}`);

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
