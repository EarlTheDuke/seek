// ── deathcheck.js ───────────────────────────────────────────────────────────
// Does dying work when somebody else is keeping the score?
//
//   npm run deathcheck
//
// THE SERVER KILLED ME AND RESPAWNED ME AND THE BROWSER NEVER NOTICED. The
// snapshot has carried `me.h` since there have been snapshots and nothing in
// the browser ever read one. Watched against a staged warband: the server's
// copy of a player ran 12 → 0 → 89 → 34 → 1 → 0 → 100 — two deaths and two
// respawns, sixteen seconds of being eaten — while the health bar on the same
// screen read 100 the whole way through, and the player's own page said
// `dead: false` at the instant the server had them on the ground.
//
// Driven against `SimWorld` and `Vitals` directly rather than over a socket,
// which is the opposite choice to `netcheck` and the right one here: killing a
// player on demand is the whole point, and doing it by shooting one over a
// websocket would make a timing test out of an arithmetic one. What crosses the
// wire is one integer; what this file is about is what both ends do with it.

import * as THREE from 'three';
import { SimWorld } from '../src/sim/world.js';
import { Vitals } from '../src/player/vitals.js';
import { VITALS } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const STEP = 1 / 60;

console.log('\n  Dying, when the server is the one counting\n');

// ── the server's half ───────────────────────────────────────────────────────

const world = new SimWorld({ headless: true });
const p = world.addPlayer(1, 'Ceit');
const home = p.ctrl.position.clone();

check('a player remembers where they woke', !!p.home &&
  Math.hypot(p.home.position.x - home.x, p.home.position.z - home.z) < 0.01,
  `home is ${p.home?.position.x.toFixed(1)}, ${p.home?.position.z.toFixed(1)}`);

// Walk them a long way off and kill them there. WHERE THEY FELL is the whole
// question: the server used to revive a body on the spot, because `Vitals.revive`
// restores the health and nothing ever moved the feet. Standing in a warband
// that is not a respawn, it is a loop — a player was watched dying every eight
// seconds, for ever, on the same square metre as the gear they had just dropped.
const away = new THREE.Vector3(home.x + 60, home.y, home.z + 60);
p.ctrl.teleport(away, 0);
p.body.damage(999, { name: 'a bear' });
check('the server can kill you', p.body.dead && p.body.health === 0, `${p.body.health} hp`);

const snapDead = world.snapshot(1);
check('and says so in your own snapshot', snapDead.me?.h === 0,
  `me.h is ${snapDead.me?.h}`);

// How long the body stays down. THERE WERE TWO `body.update` CALLS in
// `stepPlayer` and a bare `Body.update` still runs the whole of `Vitals.update`
// inside it, so every death was half the length it says on the tin: measured
// against the same warband, a player who died at tick 2046 stood up at 2142 —
// 1.6 seconds, where `VITALS.respawnDelay` is 3.4.
let seconds = 0;
while (p.body.dead && seconds < VITALS.respawnDelay * 3) {
  world.step(STEP);
  seconds += STEP;
}
check('you are down for as long as the config says', Math.abs(seconds - VITALS.respawnDelay) < 0.1,
  `${seconds.toFixed(2)} s against a configured ${VITALS.respawnDelay} s`);

const wokeAt = p.ctrl.position;
const fromHome = Math.hypot(wokeAt.x - home.x, wokeAt.z - home.z);
const fromGrave = Math.hypot(wokeAt.x - away.x, wokeAt.z - away.z);
check('you wake on the shore, not where you fell', fromHome < 1 && fromGrave > 50,
  `${fromHome.toFixed(2)} m from home, ${fromGrave.toFixed(1)} m from the body`);
check('and you wake whole', p.body.health === p.body.max, `${p.body.health} hp`);
check('which your snapshot also says', world.snapshot(1).me?.h === p.body.max,
  `me.h is ${world.snapshot(1).me?.h}`);

// ── the client's half ───────────────────────────────────────────────────────
//
// What a browser does with that integer. Before this it did nothing at all with
// it, which is the entire bug.

const fired = { damage: 0, death: 0, respawn: 0 };
const v = new Vitals({
  onDamage: () => fired.damage++,
  onDeath: () => fired.death++,
  onRespawn: () => fired.respawn++,
});

check('a fresh body keeps its own health', !v.remote && v.health === v.max,
  `${v.health} hp, remote ${v.remote}`);

v.applyRemote(64);
check('the server\'s number is the one you read', v.health === 64 && v.remote,
  `${v.health} hp`);
check('and losing it feels like being hit', fired.damage === 1, `${fired.damage} damage callbacks`);

// The local clock must not argue with the one it is copying. Regeneration is
// the quiet version of the same bug the position split was: two machines each
// keeping their own copy of a number only one of them owns.
for (let i = 0; i < 60 * 30; i++) v.update(STEP);
check('and it does not heal itself back up behind the server\'s back', v.health === 64,
  `${v.health} hp after 30 s of local ticks`);

v.damage(30, { kind: 'cold' });
check('nor hurt itself twice for the same cold', v.health === 64, `${v.health} hp`);

v.applyRemote(0);
check('nought over the wire is a death you feel', v.dead && fired.death === 1,
  `dead ${v.dead}, ${fired.death} death callbacks`);

// Left to itself a local body stands up after `respawnDelay`. It must not, here:
// the server has its own clock for that and a client that revives early spends
// the difference walking around believing it is alive.
for (let i = 0; i < Math.ceil(VITALS.respawnDelay * 60) * 3; i++) v.update(STEP);
check('and you do not get up until the server says so', v.dead && fired.respawn === 0,
  `still dead after ${(VITALS.respawnDelay * 3).toFixed(1)} s, ${fired.respawn} respawn callbacks`);

// The blow that kills you is still a blow — 64 down to nought should flash the
// screen like any other. What must NOT read as damage is standing back up.
const hitsBeforeWaking = fired.damage;
v.applyRemote(100);
check('and when it does, you get up', !v.dead && v.health === 100 && fired.respawn === 1,
  `${v.health} hp, ${fired.respawn} respawn callbacks`);
check('a respawn is not a wound', fired.damage === hitsBeforeWaking,
  `${fired.damage} damage callbacks, unchanged by going 0 → 100`);

// ── and when the wire goes away ─────────────────────────────────────────────
// Nobody is keeping the number for us any more. A body left `remote` after a
// disconnect never heals and, if it went down with the socket, never gets up.

v.applyRemote(40);
v.takeOverLocally();
check('a dropped socket hands your health back', !v.remote, `remote ${v.remote}`);
for (let i = 0; i < 60 * 30; i++) v.update(STEP);
check('and you heal on your own again', v.health > 40, `${v.health.toFixed(1)} hp after 30 s`);

const orphan = new Vitals({});
orphan.applyRemote(0);
orphan.takeOverLocally();
let alone = 0;
while (orphan.dead && alone < VITALS.respawnDelay * 3) {
  orphan.update(STEP);
  alone += STEP;
}
check('and a body that died as the server vanished still gets up', !orphan.dead,
  `up after ${alone.toFixed(2)} s`);

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
