// ── firecheck.js ────────────────────────────────────────────────────────────
// Is the server's copy of you sitting beside your fire?
//
//   npm run firecheck
//
// THE SERVER'S COPY OF YOU HAS NEVER HAD A FIRE. `fires.light` is called in
// `main.js` and nowhere else; no fire is in the snapshot; and `stepPlayer`
// handles `intent.primary`, `selectSlot` and `interact` and nothing else — so
// `intent.place` arrives on the server sixty times a second and is dropped. The
// body the server keeps for you therefore stands in a world with no fire in it,
// for ever.
//
// Measured in a browser standing 1.54 m from a burning fire: the client's own
// environment sampled `fireWarmth` 8.90 °C and `effectiveC` 32.4; the server's
// copy of the same square metre, 8.90 °C colder. That is the whole reason the
// `me.c` core temperature the snapshot has always carried cannot be believed
// yet — and why reading it, which the queue called "a one-line fix", would have
// made sitting by a fire stop warming you the moment you joined a server.
//
// Driven against the real `SimWorld` and the real `sampleEnvironment`, not a
// transcription of either. The only parts read from source are the two lines of
// wiring — the browser's send and the server's case — that no headless process
// can execute. Needs no server.

import { readFileSync } from 'node:fs';
import { SimWorld } from '../src/sim/world.js';
import { sampleEnvironment } from '../src/world/environment.js';
import { solarPosition } from '../src/world/sky.js';
import { cleanFireClaim } from '../src/net/protocol.js';
import { SURVIVAL } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const STEP = 1 / 60;

console.log('\n  Whether the server is warm beside the fire you lit\n');

// ── a world, and somebody standing in it ────────────────────────────────────
//
// Staged at 02:00. A fire that only shows up as warmth at night is a fire whose
// effect can be measured: at noon the sun contributes `sunWarmthMax` and swamps
// it, and a test that cannot tell the two apart proves nothing.
const world = new SimWorld({ headless: true, hours: 2 });
world.addPlayer(1, 'Ceit');
const p = world.players.get(1);
const at = p.ctrl.position;

/** The environment the SERVER samples for this player — the number under test. */
const serverEnv = () =>
  sampleEnvironment(at, {
    hours: world.clock.hours,
    sunAltitude: solarPosition(world.clock.hours).altitude,
    weather: world.weather,
    fires: world.fires,
  });

check('the server starts with no fires at all', world.fires.active.length === 0,
  `${world.fires.active.length} fires`);
const cold = serverEnv();
check('so the ground you are standing on has no warmth in it',
  cold.fireWarmth === 0, `fireWarmth ${cold.fireWarmth.toFixed(2)} °C`);

// ── the claim arrives ───────────────────────────────────────────────────────
//
// Exactly where the browser lays one: `firePlaceDistance` in front of you. The
// spot travels in the packet rather than being re-derived here, because the
// server cannot see the camera the client aimed with — see `Client.lightFire`.
const fx = at.x + SURVIVAL.firePlaceDistance;
const fz = at.z;
const lit = world.lightFireFor(1, fx, fz, SURVIVAL.fireFuelPerWood);
check('a fire you say you lit is put in the world', lit.ok === true,
  lit.ok ? `at ${fx.toFixed(1)}, ${fz.toFixed(1)}` : lit.why);
check('and the world has it', world.fires.active.length === 1,
  `${world.fires.active.length} fires`);

// One step, so `Fires.update` gives it an intensity — `sampleEnvironment`
// weights the warmth by it, and a fire at intensity 0 is worth nothing.
world.step(STEP);
const warm = serverEnv();
check('NOW the server feels it', warm.fireWarmth > 2,
  `fireWarmth ${cold.fireWarmth.toFixed(2)} → ${warm.fireWarmth.toFixed(2)} °C`);
check('and knows it is beside one', !!warm.nearFire);

// ── and it is worth something to the BODY, which is the point ───────────────
//
// The warmth is only interesting because core temperature is downstream of it.
// Two bodies, same world, same spot, one night apart in one respect: whether
// the fire the player lit exists on the machine keeping their body.
// Both bodies chilled to the same 33 °C first. At a comfortable 37 the model's
// `drive` is zero and both simply rewarm, so the two agree to a hundredth and
// the test proves nothing — the fire is only worth measuring on somebody who
// needs it. 33 is `coldShiverC` territory: shivering, and losing.
const noFire = new SimWorld({ headless: true, hours: 2 });
noFire.addPlayer(1, 'Ceit');
world.players.get(1).body.coreC = 33;
noFire.players.get(1).body.coreC = 33;
for (let i = 0; i < 60 * 90; i++) {
  world.step(STEP);
  noFire.step(STEP);
}
const withBody = world.players.get(1).body;
const withoutBody = noFire.players.get(1).body;
check('a chilled body beside the fire loses less than one without it',
  withBody.coreC > withoutBody.coreC,
  `core ${withBody.coreC.toFixed(2)} °C with, ${withoutBody.coreC.toFixed(2)} °C without`);

// ── and the gap in the CORE is small on purpose, so measure the DRIVE ───────
//
// This was got wrong twice before it was printed. 90 s of fire moves the core
// by 0.09 °C and that is not a weak fire, it is `thermalRate` — 0.00023 per
// second per degree of deficit, four significant figures of "meters must be
// slow". The core is downstream and glacial by design; the term the fire
// actually lands on is `effectiveC`, the temperature the body is fighting, and
// there it is worth over three degrees immediately. Assert the quantity that
// moves, not the one three integrations below it, or the test measures the
// design and calls it a bug.
const drive = withBody.effectiveC - withoutBody.effectiveC;
check('because what the fire actually moves is what the body is fighting',
  drive > 2,
  `effectiveC ${withoutBody.effectiveC.toFixed(2)} → ${withBody.effectiveC.toFixed(2)} °C, ` +
  `a ${drive.toFixed(2)} °C gap — core moved ${(withBody.coreC - withoutBody.coreC).toFixed(2)} ` +
  `in 90 s at thermalRate ${SURVIVAL.thermalRate}`);
check('and the fire is still the reason for it', withBody.env.fireWarmth > 2 && withoutBody.env.fireWarmth === 0,
  `fireWarmth ${withBody.env.fireWarmth.toFixed(2)} vs ${withoutBody.env.fireWarmth.toFixed(2)} °C`);

// ── what the world refuses ──────────────────────────────────────────────────
//
// The claim about the WOOD is believed — it is yours and it is already spent.
// The claim about the GROUND is not: those rules are the world's.
const far = world.lightFireFor(1, at.x + 400, at.z, SURVIVAL.fireFuelPerWood);
check('a fire claimed 400 m away is refused', far.ok === false, far.why);
const nobody = world.lightFireFor(99, at.x + 1, at.z);
check('and one from a player who is not here', nobody.ok === false, nobody.why);
const stacked = world.lightFireFor(1, fx + 0.5, fz);
check('and one laid on top of an existing fire', stacked.ok === false, stacked.why);
check('none of those left anything in the world', world.fires.active.length === 1,
  `${world.fires.active.length} fires`);

// A fire just inside the reach the browser uses must still be accepted — the
// packet is a frame or two old and you are moving, so an exact-distance rule
// would fail intermittently and invisibly, which is worse than a loose one.
const edge = world.lightFireFor(1, at.x - SURVIVAL.firePlaceDistance - 1, at.z);
check('a legal spot within reach is still accepted', edge.ok === true,
  edge.ok ? 'lit' : edge.why);

// ── the packet boundary ─────────────────────────────────────────────────────
//
// Shape here, meaning in the simulation — the same split as `cleanPetState`.
check('a well-formed claim survives the boundary',
  cleanFireClaim({ p: [10, -20], f: 45 })?.x === 10, JSON.stringify(cleanFireClaim({ p: [10, -20], f: 45 })));
check('a claim with no position is dropped', cleanFireClaim({ f: 45 }) === null);
check('a claim with NaN in it is dropped', cleanFireClaim({ p: [NaN, 2] }) === null);
check('a claim that is not an object is dropped',
  cleanFireClaim(null) === null && cleanFireClaim('fire') === null);
check('a claim with three numbers is dropped', cleanFireClaim({ p: [1, 2, 3] }) === null);
check('an absurd fuel load is clamped, not obeyed',
  cleanFireClaim({ p: [1, 2], f: 1e9 }).fuel === 600,
  `fuel ${cleanFireClaim({ p: [1, 2], f: 1e9 }).fuel}`);
check('and a claim with no fuel still lights, at the default',
  cleanFireClaim({ p: [1, 2] }).fuel === undefined);

// ── the wiring, read from source ────────────────────────────────────────────
//
// Neither end of this can be executed headlessly: nothing out here runs the
// browser's `intent.place` branch or the server's message loop. Read, so that
// tidying either line away is caught.
const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const serverSrc = readFileSync(new URL('./server.js', import.meta.url), 'utf8');
const clientSrc = readFileSync(new URL('../src/net/client.js', import.meta.url), 'utf8');

const placeBranch = (mainSrc.match(/if \(intent\.place\) \{[\s\S]*?\n    \}/) ?? [''])[0];
check('the browser tells the server about a fire it lit',
  /net\?\.lightFire\(\s*fx,\s*fz/.test(placeBranch));
check('and only once the local light has SUCCEEDED',
  /if \(result\.ok\) \{[\s\S]*?net\?\.lightFire/.test(placeBranch));
check('the client sends it as one packet, not through the intent',
  /lightFire\(x, z, fuel\) \{[\s\S]*?this\.send\(C_FIRE/.test(clientSrc));
check('the server has a case for it', /case C_FIRE:/.test(serverSrc));
check('which sanitises before it believes',
  /cleanFireClaim\(msg\.data\)[\s\S]{0,200}?world\.lightFireFor\(/.test(serverSrc));

const passed = results.filter(Boolean).length;
console.log(`\n  ${passed}/${results.length}\n`);
process.exit(passed === results.length ? 0 : 1);
