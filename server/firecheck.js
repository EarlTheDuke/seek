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
import * as THREE from 'three';
import { SimWorld } from '../src/sim/world.js';
import { Fires } from '../src/world/fires.js';
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
check('none of those left anything in the world', world.fires.active.length === 1,
  `${world.fires.active.length} fires`);

// ── a claim laid ON a fire is FUEL ──────────────────────────────────────────
//
// It used to be refused, which was right while the client kept its own fuel:
// the browser fed the fire locally and the server's copy was nobody's business.
// It is wrong the moment the server owns how long a fire burns, because then
// `addFuel` in the browser is a number the next snapshot overwrites five times
// a second — pressing E to feed a dying fire would cost you the branch and
// change nothing. One packet does both, because from the player's end lighting
// and feeding are the same sentence.
const fedFire = world.fires.active[0];
const fuelBefore = fedFire.fuel;
const fed = world.lightFireFor(1, fx + 0.5, fz, SURVIVAL.fireFuelPerWood);
check('a claim laid on top of an existing fire feeds it', fed.ok === true && fed.fed === true, fed.why);
check('and the fuel actually went up', fedFire.fuel > fuelBefore,
  `${fuelBefore.toFixed(1)} → ${fedFire.fuel.toFixed(1)}`);
check('and it did NOT become a second fire', world.fires.active.length === 1,
  `${world.fires.active.length} fires`);

// A fire just inside the reach the browser uses must still be accepted — the
// packet is a frame or two old and you are moving, so an exact-distance rule
// would fail intermittently and invisibly, which is worse than a loose one.
const edge = world.lightFireFor(1, at.x - SURVIVAL.firePlaceDistance - 1, at.z);
check('a legal spot within reach is still accepted', edge.ok === true,
  edge.ok ? 'lit' : edge.why);

// ── AND BACK DOWN: can anybody ELSE see it? ─────────────────────────────────
//
// NOBODY COULD SEE ANYBODY ELSE'S FIRE. Everything above is the trip UP — the
// server's copy of you is warm beside your own fire. It stopped there: the
// snapshot did not carry the fires, so a second player walking into your camp
// stood in the dark on bare ground, unwarmed, beside a fire that was heating
// somebody else.
//
// Driven against the real `Fires` on both ends. The receiving one is built with
// a real `THREE.Scene`, which is what a browser gives it, and it needs no GL
// context — the same trick `clockcheck` uses for `Atmosphere`.
// Two of them by now — the fed one and the one the reach test lit — which is
// worth having: a list of one cannot catch a reconcile that collapses the list.
const BURNING = world.fires.active.length;
const snap = world.snapshot(1);
check('the snapshot carries the fires at all',
  Array.isArray(snap.fi) && snap.fi.length === BURNING,
  `fi ${JSON.stringify(snap.fi)}`);
check('as a position and a fuel load, and no height the client can compute itself',
  snap.fi[0].p.length === 2 && Number.isFinite(snap.fi[0].f),
  JSON.stringify(snap.fi[0]));
check('at the place the fire actually is',
  Math.hypot(snap.fi[0].p[0] - fedFire.position.x, snap.fi[0].p[1] - fedFire.position.z) < 0.01,
  `${snap.fi[0].p} vs ${fedFire.position.x.toFixed(2)}, ${fedFire.position.z.toFixed(2)}`);

/** The other player's browser: its own world, and not one fire in it. */
const theirs = new Fires(new THREE.Scene(), {});
check('the second player starts with bare ground', theirs.active.length === 0);
const theirEnvBefore = sampleEnvironment(fedFire.position, {
  hours: world.clock.hours,
  sunAltitude: solarPosition(world.clock.hours).altitude,
  weather: world.weather,
  fires: theirs,
});
check('and is cold standing on the exact spot', theirEnvBefore.fireWarmth === 0,
  `fireWarmth ${theirEnvBefore.fireWarmth.toFixed(2)} °C`);

theirs.applyRemote(snap.fi);
check('ONE packet later they can see it', theirs.active.length === BURNING,
  `${theirs.active.length} of ${BURNING} fires`);
check('in the same square metre of the same world',
  Math.hypot(theirs.active[0].position.x - fedFire.position.x,
             theirs.active[0].position.z - fedFire.position.z) < 0.01,
  `${theirs.active[0].position.x.toFixed(2)}, ${theirs.active[0].position.z.toFixed(2)}`);
check('standing on the ground the server generated, not floating over it',
  Math.abs(theirs.active[0].position.y - fedFire.position.y) < 0.01,
  `y ${theirs.active[0].position.y.toFixed(2)} vs ${fedFire.position.y.toFixed(2)}`);
const theirEnvAfter = sampleEnvironment(fedFire.position, {
  hours: world.clock.hours,
  sunAltitude: solarPosition(world.clock.hours).altitude,
  weather: world.weather,
  fires: theirs,
});
check('AND IT WARMS THEM — which is the whole point', theirEnvAfter.fireWarmth > 2,
  `fireWarmth ${theirEnvBefore.fireWarmth.toFixed(2)} → ${theirEnvAfter.fireWarmth.toFixed(2)} °C`);
check('and they know they are beside one', !!theirEnvAfter.nearFire);

// ── and it stays ONE fire, packet after packet ──────────────────────────────
//
// The reconcile matches on POSITION, not on id: the server builds its ids from
// a rounded position and the length of its own list, so they are not stable
// across two worlds and matching on them would spawn a duplicate every packet
// — five a second, for ever.
theirs.applyRemote(world.snapshot(1).fi);
theirs.applyRemote(world.snapshot(1).fi);
check('the same fires arriving again are the same fires', theirs.active.length === BURNING,
  `${theirs.active.length} fires after three packets, ${BURNING} burning`);
const nudged = world.snapshot(1).fi.map((e) => ({ ...e, p: [e.p[0] + 0.4, e.p[1] - 0.3] }));
theirs.applyRemote(nudged);
check('and half a metre of jitter does not make a second set', theirs.active.length === BURNING,
  `${theirs.active.length} fires`);

// ── the fuel is the server's, not theirs ────────────────────────────────────
theirs.applyRemote([{ p: [fedFire.position.x, fedFire.position.z], f: 120 }]);
check('and a shorter list drops the ones it no longer names', theirs.active.length === 1,
  `${theirs.active.length} fires`);
check('the fuel that arrives is the fuel they hold', theirs.active[0].fuel === 120,
  `fuel ${theirs.active[0].fuel}`);
const heldFuel = theirs.active[0].fuel;
for (let i = 0; i < 60 * 30; i++) theirs.update(STEP, world.weather);
check('and thirty seconds of their own clock does not touch it',
  theirs.active[0].fuel === heldFuel,
  `fuel ${theirs.active[0].fuel} after 30 s — the local burn must stand aside`);
theirs.takeOverLocally();
for (let i = 0; i < 60 * 30; i++) theirs.update(STEP, world.weather);
check('until the socket drops, and then it is theirs again',
  theirs.active[0].fuel < heldFuel,
  `fuel ${heldFuel} → ${theirs.active[0].fuel.toFixed(1)}`);

// ── a fire the server stops mentioning is out ───────────────────────────────
theirs.applyRemote(world.snapshot(1).fi);
theirs.applyRemote([]);
check('a fire the server no longer lists is taken away', theirs.active.length === 0,
  `${theirs.active.length} fires`);

// ── the one you light yourself, in the moment before the answer ─────────────
//
// The packet that confirms it was already in flight when it caught, so a fire
// lit here must be drawn immediately and must not be swept away by the very
// next snapshot — but it must not burn here for ever either if the server
// refused it, which it can: the server sees a fire 2 m away that this browser
// cannot.
const mine = new Fires(new THREE.Scene(), {});
mine.applyRemote([]); // connected, nothing burning yet
const own = mine.light(fx, fz, SURVIVAL.fireFuelPerWood);
check('a fire you light on a server appears at once', own.ok === true && mine.active.length === 1);
check('and is held as unanswered-for', own.fire.pending === true);
mine.applyRemote([]); // the packet in flight, which cannot know about it yet
check('the packet already in flight does not sweep it away', mine.active.length === 1,
  `${mine.active.length} fires`);
mine.applyRemote([{ p: [fx, fz], f: SURVIVAL.fireFuelPerWood }]);
check('the next one adopts it', mine.active.length === 1 && mine.active[0].pending === false);

const refused = new Fires(new THREE.Scene(), {});
refused.applyRemote([]);
refused.light(fx, fz, SURVIVAL.fireFuelPerWood);
for (let i = 0; i < 60 * 4; i++) refused.update(STEP, world.weather);
refused.applyRemote([]);
check('but a fire the server never answers for stops being drawn',
  refused.active.length === 0, `${refused.active.length} fires after 4 s unanswered`);

// ── and none of this happens in single player ───────────────────────────────
const alone = new Fires(new THREE.Scene(), {});
const soloFire = alone.light(fx, fz, SURVIVAL.fireFuelPerWood).fire;
check('a single-player fire is never pending', soloFire.pending === false);
for (let i = 0; i < 60 * 30; i++) alone.update(STEP, world.weather);
check('and burns down on its own clock exactly as it always did',
  soloFire.fuel < SURVIVAL.fireFuelPerWood && alone.active.length === 1,
  `fuel ${SURVIVAL.fireFuelPerWood} → ${soloFire.fuel.toFixed(1)}`);
check('and nothing that arrives is garbage the client acts on',
  (alone.applyRemote(null), alone.applyRemote(undefined), alone.remote === false),
  `remote ${alone.remote}`);

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

// ── and the wiring for the trip back DOWN ──
const snapHandler = (mainSrc.match(/onSnapshot: \(snap\) => \{[\s\S]*?\n      \},/) ?? [''])[0];
check('the browser reads the fires out of the snapshot',
  /fires\.applyRemote\(snap\.fi\)/.test(snapHandler), snapHandler ? 'handler found' : 'NO onSnapshot handler');
check('and takes them back when the socket drops',
  /if \(s !== 'connected'\) \{[\s\S]{0,300}?fires\.takeOverLocally\(\)/.test(mainSrc));
check('feeding a fire goes up the wire too',
  /function feedFire\([\s\S]{0,400}?net\?\.lightFire\(fire\.position\.x, fire\.position\.z/.test(mainSrc));
check('and every feed goes through it, none left writing only locally',
  !/inventory\.remove\('wood', 1\);\s*\n\s*fires\.addFuel\(/.test(mainSrc));

// ── WHAT A FIRE COSTS, AND THAT BOTH ENDS AGREE ────────────────────────────
//
// Lighting cost ONE branch, the same as feeding, so `place` was the cheapest
// action in the game — and a body that finds a cheap action repeats it. 106
// fires went down in a seven-hour run, five of them inside twenty real seconds,
// laid across a hillside like breadcrumbs.
//
// It also kept firewood worthless. Deadfall is the one thing here that is both
// abundant and useful, and a hoarder with infinite firewood takes the same
// actions as a generous one — the reason SCARCE exists at all.
{
  const { SURVIVAL: S } = await import('../src/config.js');
  const worldSrc = readFileSync(new URL('../src/sim/world.js', import.meta.url), 'utf8');
  check(`lighting costs SURVIVAL.woodToLight, and it is more than one — ${S.woodToLight}`,
    S.woodToLight >= 5);

  // BOTH ENDS, from the source, because a browser and a server that disagree
  // about the price disagree about what is in your pack.
  check('the server spends woodToLight, not a literal',
    /inventory\.remove\('wood', SURVIVAL\.woodToLight\)/.test(worldSrc),
    'src/sim/world.js');
  check('  …and so does the browser',
    /inventory\.remove\('wood', SURVIVAL\.woodToLight\)/.test(mainSrc),
    'src/main.js');
  check('  …and both GATE on it too, so you cannot light one you cannot pay for',
    /countOf\('wood'\) >= SURVIVAL\.woodToLight/.test(worldSrc)
      && /countOf\('wood'\) < SURVIVAL\.woodToLight/.test(mainSrc));

  // FEEDING STAYS AT ONE. That is what makes keeping a fire alive cheaper than
  // walking away and lighting another — the opposite of the old arrangement,
  // where both cost the same and nobody ever bothered to feed one.
  check('feeding a fire still costs ONE branch',
    /inventory\.remove\('wood', 1\)/.test(mainSrc),
    'lighting is the expensive act; feeding is not');

  // And the heuristic that has to move with it: at spareWood 4 a body would
  // fletch away the very wood it needs to get warm.
  const { AGENTS: A } = await import('../src/config.js');
  check(`spareWood was raised with it — ${A.spareWood} against a fire at ${S.woodToLight}`,
    A.spareWood > S.woodToLight);
  check(`fireNearby was widened — ${A.fireNearby} m`,
    A.fireNearby >= 20,
    'nine metres is where a second fire is absurd, not where it is wasteful; a body that wanders clears nine constantly');
}

const passed = results.filter(Boolean).length;
console.log(`\n  ${passed}/${results.length}\n`);
process.exit(passed === results.length ? 0 : 1);
