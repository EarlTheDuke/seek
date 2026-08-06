// ── warmthcheck.js ──────────────────────────────────────────────────────────
// Is it as cold for you as it is for the world you are standing in?
//
//   npm run warmthcheck
//
// YOUR CORE TEMPERATURE WAS YOUR OWN OPINION. `me.c` has ridden in every
// snapshot for as long as `me.h` has, and nothing in the browser ever read one,
// so every client ran its own thermal model against its own weather and its own
// list of fires — which, before 15:40 today, was the only list there was.
//
// That was the right call for exactly as long as it lasted: `firecheck` opens
// by explaining that reading `me.c` would have made sitting beside a fire stop
// warming you the moment you joined a server, because the server's copy of you
// stood in a world with nothing burning in it. Both halves of that are closed —
// the fire you light goes up the wire, and everybody's fires come back down —
// so the server's number is now the better one and the client's is a second
// clock integrating the same quantity. That family of bug has cost this project
// the position (417 m), the health bar (read 100 through two deaths), the sky
// (midday at 01:00) and the fire's fuel. This is the same shape, again.
//
// Both ends run out here. The server half is the real `SimWorld` with a real
// fire in it; the client half is the actual `Body` class the browser walks
// around with. The only parts read from source are the lines of wiring no
// headless process can execute. Needs no server.

import { readFileSync } from 'node:fs';
import { SimWorld } from '../src/sim/world.js';
import { Body } from '../src/player/body.js';
import { SURVIVAL } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const STEP = 1 / 60;

/**
 * A believable freezing night, as the CLIENT would sample it — with no fire in
 * it, which is the whole point. Everything `Body.update` reads and nothing it
 * does not.
 */
const freezingNight = () => ({
  airC: -4,
  windStrength: 2.4,
  rain: 0,
  exposure: 1,
  inWater: false,
  sunWarmth: 0,
  fireWarmth: 0,
  effects: null,
});
/** A body standing still: no exertion warmth, no wading, not drawing a bow. */
const standingStill = { horizontalSpeed: 0, wadeDepth: 0, grounded: true };
const stepBody = (body, seconds, env = freezingNight()) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    body.update(STEP, { ctrl: standingStill, env, insulationC: 0, enabled: true });
  }
};

console.log('\n  How cold you are, and who says so\n');

// ── the server's half: the temperature goes out ─────────────────────────────
//
// Staged at 02:00 for the same reason `firecheck` is: at noon the sun swamps a
// fire and a measurement that cannot tell the two apart proves nothing.
const world = new SimWorld({ headless: true, hours: 2 });
world.addPlayer(1, 'Ceit');
const server = world.players.get(1);

check('the snapshot carries your core temperature',
  Number.isFinite(world.snapshot(1).me.c), `me.c is ${world.snapshot(1).me.c}`);
check('and it is the temperature of the body the server is keeping',
  Math.abs(world.snapshot(1).me.c - server.body.coreC) < 0.01,
  `me.c ${world.snapshot(1).me.c} vs body ${server.body.coreC.toFixed(3)}`);

// Chilled to shivering first, and then given the fire. At a comfortable 37 the
// model's `drive` is zero and a body simply rewarms — the fire is only worth
// measuring on somebody who needs it. That is `firecheck`'s lesson, kept.
server.body.coreC = 34.0;
const litAt = world.lightFireFor(1,
  server.ctrl.position.x + SURVIVAL.firePlaceDistance,
  server.ctrl.position.z, SURVIVAL.fireFuelPerWood * 40);
check('and there is a fire beside that body', litAt.ok === true,
  litAt.ok ? `fuel ${SURVIVAL.fireFuelPerWood * 40}` : litAt.why);

// ── the client's half, running blind ────────────────────────────────────────
//
// The precondition of the bug, stated as a measurement: the same body, the same
// three minutes, one of them in a world it cannot see the fires of.
const blind = new Body();
blind.coreC = 34.0;

for (let i = 0; i < 60 * 180; i++) world.step(STEP);
stepBody(blind, 180);

const drifted = Math.abs(server.body.coreC - blind.coreC);
check('three minutes apart and the two bodies no longer agree',
  drifted > 0.2,
  `server ${server.body.coreC.toFixed(2)} °C beside its fire, ` +
  `client ${blind.coreC.toFixed(2)} °C in the dark — ${drifted.toFixed(2)} °C apart`);
check('and the fire is the reason the server is the warmer one',
  server.body.coreC > blind.coreC && server.body.env.fireWarmth > 2,
  `fireWarmth ${server.body.env.fireWarmth.toFixed(2)} °C on the server, 0.00 on the client`);

// ── the packet lands ────────────────────────────────────────────────────────

const snap = world.snapshot(1);
blind.applyRemoteCore(snap.me.c);
check('the server\'s temperature lands on the client',
  Math.abs(blind.coreC - snap.me.c) < 0.001,
  `${blind.coreC.toFixed(2)} °C, was ${(blind.coreC - snap.me.c).toFixed(2)} off`);
check('and the two bodies are one body again',
  Math.abs(blind.coreC - server.body.coreC) < 0.01,
  `server ${server.body.coreC.toFixed(2)} vs client ${blind.coreC.toFixed(2)} °C`);

// Two clocks against one quantity is the entire bug family. While somebody else
// owns this number the local integration must stand aside — otherwise the
// client spends every 200 ms between packets walking away from the truth and
// the correction that arrives reads as a stutter.
const held = blind.coreC;
stepBody(blind, 180);
check('a remote temperature does not drift itself',
  blind.coreC === held,
  `${held.toFixed(3)} °C after three more minutes of freezing weather`);

// ...but everything DOWNSTREAM of it must still move, because that is what the
// player actually sees. The environment is local, the felt temperature is
// local, and the number they are all fighting is the server's.
check('while the world around you is still sampled locally',
  blind.effectiveC < SURVIVAL.neutralC && blind.env !== null,
  `effectiveC ${blind.effectiveC.toFixed(2)} °C in weather the server never sent`);

// ── what the client must still be allowed to feel ───────────────────────────
//
// A snapshot arriving with a body at 32 °C has to reach the screen as words and
// a colour, not just a field. `conditions` and `warmthFraction` are what the HUD
// draws; if they did not follow, the fix would be invisible to the only person
// it is for.
const cold = new Body();
cold.applyRemoteCore(32.0);
stepBody(cold, 1);
check('a freezing body the SERVER says is freezing says so on screen',
  cold.conditions.some((c) => /freezing/.test(c.text)) && cold.shivering,
  `"${cold.conditions.map((c) => c.text).join(', ')}", warmth gauge ` +
  `${cold.warmthFraction.toFixed(2)}`);
check('and it is slowed down by it like any other cold body',
  cold.speedScale < 0.8, `speedScale ${cold.speedScale.toFixed(2)}`);

// The damage, though, is the server's — `Vitals.remote` already refuses local
// damage, and cold is one more thing that would otherwise be counted twice: off
// your screen and off nobody else's, then silently healed by the next packet.
const twice = new Body();
twice.applyRemote(80);      // health: the server's
twice.applyRemoteCore(30.0); // and freezing hard enough to be losing it
stepBody(twice, 5);
check('but the damage the cold does is the server\'s to count',
  twice.health === 80, `health ${twice.health} after 5 s at 30.0 °C`);

// ── what must not be believed ───────────────────────────────────────────────
//
// One `undefined` on the path of every packet would set `NaN` and every
// comparison against it is silently false for ever: you would neither shiver
// nor freeze nor ever warm up again, and nothing would throw. The same guard
// the hour needed, for the same reason.
const guard = new Body();
guard.applyRemoteCore(35.5);
guard.applyRemoteCore(undefined);
guard.applyRemoteCore(NaN);
guard.applyRemoteCore(null);
check('a snapshot with no temperature in it is ignored, not obeyed',
  guard.coreC === 35.5, `still ${guard.coreC} °C`);

guard.applyRemoteCore(-40);
check('and one that could not be a person is clamped',
  guard.coreC === SURVIVAL.coreMinC, `${guard.coreC} °C, floor is ${SURVIVAL.coreMinC}`);
guard.applyRemoteCore(999);
check('at both ends', guard.coreC === SURVIVAL.coreMaxC,
  `${guard.coreC} °C, ceiling is ${SURVIVAL.coreMaxC}`);

// ── and when nobody is keeping it any more ──────────────────────────────────
//
// Without this a dropped socket leaves you holding the last temperature the
// server ever sent: you could walk into a blizzard at a comfortable 37.0 and
// never feel it.
const dropped = new Body();
dropped.applyRemote(100);
dropped.applyRemoteCore(37.0);
dropped.takeOverLocally();
stepBody(dropped, 120);
check('the cold reaches you again once the socket drops',
  dropped.coreC < 37.0 && !dropped.remoteCore && !dropped.remote,
  `37.00 → ${dropped.coreC.toFixed(2)} °C over two minutes of the same night`);

// ── the wiring, read from source ────────────────────────────────────────────
//
// Nothing headless calls `netHandlers`, so the one line that joins the two
// halves is read rather than run — the same way `clockcheck` guards the hour.

const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const worldSrc = readFileSync(new URL('../src/sim/world.js', import.meta.url), 'utf8');
const onSnap = (mainSrc.match(/onSnapshot: \(snap\) => \{[\s\S]*?\n      \},/) ?? [''])[0];
const onStatus = (mainSrc.match(/onStatus: \(s\) => \{[\s\S]*?\n      \},/) ?? [''])[0];

check('the client applies the temperature out of the snapshot',
  /vitals\.applyRemoteCore\(\s*snap\.me\.c\s*\)/.test(onSnap));
check('and hands the thermometer back when the socket drops',
  /vitals\.takeOverLocally\(\)/.test(onStatus));
check('the server still puts it in the snapshot',
  /c:\s*round2\(p\.body\.coreC\)/.test(worldSrc));

// The one that is deliberately still NOT read, and the reason, so that a future
// session cannot quietly make everybody starve on a schedule they cannot touch.
//
// The old reason has been fixed: `intent.eat` has a handler, the server holds a
// real inventory, and `me.iv` now says what is in it. The remaining reason is
// narrower and still good — a BROWSER eats out of its own inventory, in its own
// simulation, and reading `me.f` would have the server's copy of that number
// overwrite every mouthful five times a second. An agent has no local inventory
// and no local body, which is exactly why it reads both and a browser does not.
// The day the browser stops resolving eating locally, this line is the right
// thing to delete — but delete it on purpose.
check('and your HUNGER is still your own, because a browser feeds itself locally',
  !/applyRemote\w*\(\s*snap\.me\.f\s*\)/.test(onSnap),
  'the server-side loop lives behind the seam instead — see survivalcheck');

const passed = results.filter(Boolean).length;
console.log(`\n  ${passed}/${results.length}\n`);
process.exit(passed === results.length ? 0 : 1);
