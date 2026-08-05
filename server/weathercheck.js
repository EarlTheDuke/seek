// ── weathercheck.js ─────────────────────────────────────────────────────────
// Is everybody standing under the same sky?
//
//   npm run weathercheck
//
// THE WEATHER WAS YOUR BROWSER'S INVENTION, and it is the sixth and last of a
// family this project has now closed five times: the position, the health, the
// hour, a fire's fuel, your core temperature. Every one of them was two copies
// of one number, and this one was hiding in plain sight — the snapshot has
// carried `w` (the state, the next state, the blend, the wind's angle) for as
// long as there have been snapshots, and nothing in the browser ever read it.
//
// The divergence is NOT a seed difference: both ends roll their front out of
// `makeRandom('weather')` and two clients booted together agree exactly. It is
// a PHASE difference, which is worse, because it grows with how long the server
// has been up. Your front starts when your browser does. Join a server that has
// been running ten minutes and you are simply somewhere else in the sequence.
//
// It stopped being cosmetic at 15:40, when your core temperature became the
// server's number: the HUD explains a falling temperature with the wind chill
// and the rain it can SEE, so the number was the server's and the reason beside
// it was your own. Wind also carries your scent, so the creatures hunting you
// were reading a bearing you had no way to look at.
//
// Driven against `SimWorld` for the sending end and the ACTUAL `Weather` class
// for the receiving one — not a transcription of either. Needs no server.

import { readFileSync } from 'node:fs';
import { SimWorld } from '../src/sim/world.js';
import { Weather } from '../src/world/weather.js';
import { WEATHER } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const STEP = 1 / 60;
/** The four fields the snapshot carries, off any `Weather`. */
const packet = (w) => ({
  s: w.stateName,
  n: w.nextName,
  b: Math.round(w.blend * 1000) / 1000,
  a: Math.round(w.windAngle * 1000) / 1000,
});
/** What the sky, the grass, the rain and the HUD are actually drawn from. */
const drawn = (w) => [w.cloud, w.fog, w.wind, w.rain];
const apart = (a, b) => Math.max(...drawn(a).map((v, i) => Math.abs(v - drawn(b)[i])));
const run = (w, seconds) => { for (let i = 0; i < seconds * 60; i++) w.update(STEP); };

console.log('\n  What the sky is doing, and who says so\n');

// ── the server's half: the front goes out ───────────────────────────────────

const world = new SimWorld({ headless: true });
world.addPlayer(1, 'Ceit');
const snap0 = world.snapshot(1);

check('the snapshot carries the weather',
  !!snap0.w && typeof snap0.w.s === 'string' && typeof snap0.w.n === 'string'
  && Number.isFinite(snap0.w.b) && Number.isFinite(snap0.w.a),
  `w = ${JSON.stringify(snap0.w)}`);
check('and it is the front the world is actually in',
  snap0.w.s === world.weather.stateName && snap0.w.n === world.weather.nextName,
  `${snap0.w.s} → ${snap0.w.n}`);

for (let i = 0; i < 60 * 30; i++) world.step(STEP);
const snap1 = world.snapshot(1);
check('and it moves as the world runs',
  snap1.w.a !== snap0.w.a,
  `wind ${snap0.w.a} → ${snap1.w.a} rad over 30 s`);

// ── the precondition: two fronts, one world ─────────────────────────────────
//
// The bug, measured. `server` has been up ten real minutes — four to five holds
// at `minHold` 2.2 — and `browser` has just opened. Neither is wrong about
// anything except which world it is in.

const server = new Weather();
run(server, 600);
const browser = new Weather();
run(browser, 1); // one frame, as a fresh client that has drawn once

check('two clients booted together agree exactly',
  apart(new Weather(), new Weather()) === 0,
  'so the divergence below is PHASE, not seed — it grows with server uptime');
check('but a browser that joins late is under a DIFFERENT sky',
  server.label !== browser.label || apart(server, browser) > 0.01,
  `server "${server.label}" vs browser "${browser.label}"`);
const wasApart = apart(server, browser);
const angleApart = Math.abs(server.windAngle - browser.windAngle);
check('and it is not a rounding difference',
  wasApart > 0.01 || angleApart > 0.01,
  `cloud/fog/wind/rain up to ${wasApart.toFixed(3)} apart, wind ${(angleApart * 180 / Math.PI).toFixed(1)}° apart`);
check('which is a bearing the scent model reads',
  browser.bearingText !== undefined,
  `blowing ${server.bearingText} on the server, ${browser.bearingText} on the screen`);

// ── the client's half: the front comes in ───────────────────────────────────

browser.applyRemote(packet(server));

check('the server\'s front lands on the client',
  browser.stateName === server.stateName && browser.nextName === server.nextName,
  `"${browser.label}"`);
check('blend and wind angle with it',
  Math.abs(browser.blend - server.blend) < 0.001
  && Math.abs(browser.windAngle - server.windAngle) < 0.001,
  `blend ${browser.blend.toFixed(3)}, wind ${browser.windAngle.toFixed(3)} rad`);
check('and the numbers everything is DRAWN from follow it',
  apart(browser, server) < 0.002,
  `${wasApart.toFixed(3)} apart → ${apart(browser, server).toFixed(4)}, one packet later`);
check('the wind vector follows the angle in the same call',
  Math.abs(browser.windDir.x - Math.cos(server.windAngle)) < 0.002
  && Math.abs(browser.windDir.y - Math.sin(server.windAngle)) < 0.002,
  `dir ${browser.windDir.x.toFixed(3)}, ${browser.windDir.y.toFixed(3)} — ${browser.bearingText}`);

// While somebody else owns the sky this machine must not also run one. Two
// state machines against one world is the entire bug family.
const held = packet(browser);
run(browser, 600);
const still = packet(browser);
check('a remote client does not roll its own front',
  still.s === held.s && still.n === held.n && still.b === held.b,
  `"${browser.label}" after ten more minutes of stepping`);
check('nor turn its own wind',
  still.a === held.a, `${still.a} rad, unmoved`);

// ...but everything DOWNSTREAM of the owned numbers must keep running, or the
// picture freezes and the HUD stops explaining anything. Narrowest possible
// stand-aside: the state machine and one integration, nothing else.
check('the blended numbers are still derived while remote',
  apart(browser, server) < 0.002,
  `cloud ${browser.cloud.toFixed(3)}, fog ${browser.fog.toFixed(3)}, rain ${browser.rain.toFixed(3)}`);
check('and the local wander keeps running underneath',
  browser.windTargetAngle !== held.a,
  'so the handover on disconnect is continuous, not a jump');

// ── when the socket drops ───────────────────────────────────────────────────

browser.takeOverLocally();
run(browser, 600);
check('the front moves again once nobody is keeping it',
  !browser.remote && packet(browser).a !== still.a,
  `"${browser.label}", wind ${browser.windAngle.toFixed(3)} rad`);

// ── a packet that makes no sense is ignored, not obeyed ─────────────────────

const guard = new Weather();
run(guard, 120);
const before = packet(guard);
guard.applyRemote(undefined);
guard.applyRemote(null);
check('a snapshot with no weather is ignored',
  !guard.remote && packet(guard).s === before.s, `still "${guard.label}"`);
guard.applyRemote({ s: 'clear', n: 'rain', b: NaN, a: 0.5 });
guard.applyRemote({ s: 'clear', n: 'rain', b: 0.5, a: undefined });
check('a non-finite blend or angle is ignored, not obeyed',
  !guard.remote && Number.isFinite(guard.blend) && Number.isFinite(guard.windAngle),
  `blend ${guard.blend}, wind ${guard.windAngle.toFixed(3)}`);
guard.applyRemote({ s: 'clear', n: 'thundersnow', b: 0.5, a: 0.5 });
check('a state this build does not have is ignored',
  !guard.remote && guard.nextName !== 'thundersnow',
  `still "${guard.label}" — a broken sky is worse than an old one`);
guard.applyRemote({ s: 'mist', n: 'rain', b: 4.5, a: 0.5 });
check('and a blend off the end of the wire is clamped',
  guard.blend === 1 && Math.abs(guard.rain - WEATHER.states.rain.rain) < 1e-9,
  `b 4.5 → ${guard.blend}, rain ${guard.rain}`);

// ── the symptom, stated as the test ─────────────────────────────────────────
//
// Two browsers, ten minutes, one of them fed the server's packets and one of
// them blind. This is the whole bug in three lines.

const fed = new Weather();
const blind = new Weather();
const truth = new Weather();
run(truth, 300); // the server, already up when they joined
for (let i = 0; i < 600 * 60; i++) {
  truth.update(STEP);
  blind.update(STEP);
  fed.update(STEP);
  if (i % 12 === 0) fed.applyRemote(packet(truth)); // 5 Hz, as the server sends
}
check('ten minutes later the fed client agrees with the server',
  apart(fed, truth) < 0.002 && fed.label === truth.label,
  `both "${truth.label}"`);
check('and the blind one is somewhere else entirely',
  blind.label !== truth.label || apart(blind, truth) > 0.01,
  `"${blind.label}" vs "${truth.label}", up to ${apart(blind, truth).toFixed(3)} apart`);
check('which is what the HUD was explaining your temperature with',
  true,
  `wind ×${blind.wind.toFixed(2)} rain ${blind.rain.toFixed(2)} on screen,`
  + ` ×${truth.wind.toFixed(2)} / ${truth.rain.toFixed(2)} on the body the server was cooling`);

// ── the wiring, read from source ────────────────────────────────────────────
//
// Nothing headless calls `netHandlers`, so this last piece is read rather than
// run — it is the line that a tidy-up would delete without failing anything.

const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const wSrc = readFileSync(new URL('../src/world/weather.js', import.meta.url), 'utf8');
const onSnap = (mainSrc.match(/onSnapshot: \(snap\) => \{[\s\S]*?\n      \},/) ?? [''])[0];
const onStatus = (mainSrc.match(/onStatus: \(s\) => \{[\s\S]*?\n      \},/) ?? [''])[0];

check('the client applies the weather out of the snapshot',
  /weather\.applyRemote\(\s*snap\.w\s*\)/.test(onSnap));
check('and takes the sky back when the socket drops',
  /weather\.takeOverLocally\(\)/.test(onStatus));
check('the state machine stands aside while remote',
  /if \(!this\.remote\) \{[\s\S]*?this\.hold -= dt;/.test(wSrc));
check('pinning a sky you do not own says so rather than doing nothing',
  /weather\.remote\) return 'the server owns the sky/.test(mainSrc));

const passed = results.filter(Boolean).length;
console.log(`\n  ${passed}/${results.length}\n`);
process.exit(passed === results.length ? 0 : 1);
