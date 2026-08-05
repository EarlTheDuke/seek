// ── clockcheck.js ───────────────────────────────────────────────────────────
// Is it the same time of day for everybody?
//
//   npm run clockcheck
//
// THE CLIENT DREW ITS OWN DAYLIGHT. The snapshot has carried the hour (`c`)
// since there have been snapshots and nothing in the browser ever read one, so
// every client went on ticking the clock it happened to boot with. Seen four
// times and finally photographed: a capture taken with the player dead at server
// 01:29 shows a blue midday sky. Two clocks, one world — the same family of bug
// as the 417 m body split and the health bar that read 100 through two deaths,
// and the last surviving member of it.
//
// It is not only the picture. The sun decides which species may exist, how cold
// the air is, how far you can see and whether the stars are out; a client an
// eight-hour error away from the server is running every one of those rules
// against a different sky than the world it is standing in.
//
// Driven against `SimWorld` and the real `Atmosphere` directly rather than over
// a socket. Both halves run out here: `Atmosphere` builds its scene graph
// without a GL context, so this file drives the ACTUAL class the browser draws
// with — not a transcription of it — and the only part that must be read from
// source is the one line of wiring in `main.js` that no headless process can
// execute. Needs no server.

import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { SimWorld } from '../src/sim/world.js';
import { Atmosphere } from '../src/world/sky.js';
import { TIME } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const STEP = 1 / 60;
/** A stand-in for the renderer: `apply()` writes one number onto it. */
const newSky = () => {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x8899aa, 0.001);
  return new Atmosphere(scene, { toneMappingExposure: 1 });
};

console.log('\n  What time it is, and who says so\n');

// ── the server's half: the hour goes out ────────────────────────────────────
//
// Staged at 01:00, which is the hour the bug was photographed at and is nothing
// like `TIME.startHour` — a client that agrees by accident proves nothing.
const world = new SimWorld({ headless: true, hours: 1 });
world.addPlayer(1, 'Ceit');

const snap = world.snapshot(1);
check('the snapshot carries the hour', Number.isFinite(snap.c), `c is ${snap.c}`);
check('and it is the hour the world is at',
  Math.abs(snap.c - world.clock.hours) < 0.002,
  `c ${snap.c} vs clock ${world.clock.hours.toFixed(3)}`);
check('staged at 01:00, and saying so', Math.abs(snap.c - 1) < 0.01, `c is ${snap.c}`);

// Ten seconds of world. A day is `TIME.dayMinutes` of real time, so this is a
// small number by design — the point is that it moves and that it moves at the
// rate the client will be ticking at between packets.
for (let i = 0; i < 600; i++) world.step(STEP);
const moved = world.snapshot(1).c;
const expected = 1 + (10 / 60 / TIME.dayMinutes) * 24;
check('the hour moves as the world runs', moved > 1,
  `01:00 → ${moved.toFixed(3)} over 10 s`);
check('at the rate the client also ticks at', Math.abs(moved - expected) < 0.01,
  `${moved.toFixed(3)} vs ${expected.toFixed(3)} — same formula both ends`);

// ── the client's half: the hour comes in ────────────────────────────────────

const sky = newSky();
// The precondition of the whole bug: a fresh browser is on its own clock, and
// its own clock is broad daylight.
check('a fresh client starts on its OWN hour',
  Math.abs(sky.hours - TIME.startHour) < 0.001, `${sky.clockText}`);
const bugElevation = sky.elevation;
check('and that hour is broad daylight', sky.elevation > 5 && sky.daylight > 0.9,
  `sun ${sky.elevation.toFixed(1)}°, daylight ${sky.daylight.toFixed(2)}`);

sky.applyRemote(snap.c);
check('the server\'s hour lands on the client', Math.abs(sky.hours - snap.c) < 0.001,
  `${sky.clockText}`);
check('and the SUN follows it', sky.elevation < -5,
  `sun ${bugElevation.toFixed(1)}° → ${sky.elevation.toFixed(1)}°`);
check('so 01:00 on the server is night on the screen', sky.daylight < 0.01,
  `daylight ${sky.daylight.toFixed(3)}, stars ${sky.stars.material.opacity.toFixed(2)}`);

// While somebody else owns the hour this clock must not also run one. Two
// clocks against one world is the entire bug family — `Vitals.remote` exists
// for the same reason and this is the same flag.
const held = sky.hours;
for (let i = 0; i < 600; i++) sky.tick(STEP);
check('a remote clock does not tick itself', sky.hours === held,
  `${held.toFixed(3)} after 10 s of stepping`);

// ...and the correction that arrives instead is a nudge, not a jump: both ends
// advance with the same formula, so ten seconds apart is ten seconds apart.
sky.applyRemote(moved);
check('the correction that arrives is small',
  Math.abs(sky.hours - held) < 0.2,
  `${(Math.abs(sky.hours - held) * 60).toFixed(1)} in-world minutes after 10 s`);

sky.takeOverLocally();
for (let i = 0; i < 600; i++) sky.tick(STEP);
check('and the sun moves again once the socket drops',
  sky.hours > moved && !sky.remote,
  `${moved.toFixed(3)} → ${sky.hours.toFixed(3)}`);

// A snapshot without an hour must not stop the world. `c` has always been sent,
// but `applyRemote` is now on the path of every packet and a single undefined
// would otherwise set `NaN` hours and black the sky out for ever.
const before = sky.hours;
sky.applyRemote(undefined);
sky.applyRemote(NaN);
check('a snapshot with no hour is ignored, not obeyed',
  sky.hours === before && !sky.remote, `still ${sky.clockText}`);

// The wire rounds to 3 dp and the day wraps; neither may leave the clock
// outside [0, 24), which `apply()` would turn into a sun below the world.
sky.applyRemote(25.5);
check('a wrapped hour normalises', Math.abs(sky.hours - 1.5) < 0.001, sky.clockText);
sky.applyRemote(-0.25);
check('and so does a negative one', Math.abs(sky.hours - 23.75) < 0.001, sky.clockText);

// The symptom, stated as the test: same hour in, same sky out, both ways.
const noon = newSky();
noon.applyRemote(12);
const small = newSky();
small.applyRemote(1);
check('midday and 01:00 are not the same sky',
  noon.daylight > 0.9 && small.daylight < 0.01,
  `daylight ${noon.daylight.toFixed(2)} vs ${small.daylight.toFixed(2)}`);

// ── the wiring, read from source ────────────────────────────────────────────
//
// The one part that cannot be executed out here: nothing headless calls
// `netHandlers`. Read, so that tidying the line away is caught.

const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const skySrc = readFileSync(new URL('../src/world/sky.js', import.meta.url), 'utf8');
const onSnap = (mainSrc.match(/onSnapshot: \(snap\) => \{[\s\S]*?\n      \},/) ?? [''])[0];
const onStatus = (mainSrc.match(/onStatus: \(s\) => \{[\s\S]*?\n      \},/) ?? [''])[0];

check('the client applies the hour out of the snapshot',
  /atmosphere\.applyRemote\(\s*snap\.c\s*\)/.test(onSnap));
check('and hands the clock back when the socket drops',
  /atmosphere\.takeOverLocally\(\)/.test(onStatus));
check('the local tick stands aside while remote',
  /tick\(dt\) \{[\s\S]*?if \(this\.remote\) return;/.test(skySrc));
check('scrubbing a clock you do not own says so',
  /atmosphere\.remote/.test(mainSrc) && /server keeps the hours/.test(mainSrc));

const passed = results.filter(Boolean).length;
console.log(`\n  ${passed}/${results.length}\n`);
process.exit(passed === results.length ? 0 : 1);
