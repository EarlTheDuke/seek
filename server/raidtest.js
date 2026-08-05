// ── raidtest.js ─────────────────────────────────────────────────────────────
// Phase 6's done-when: "four players survive a warband raid, or fail to".
//
//   npm run raidcheck
//
// Runs headless against SimWorld directly rather than over a socket. The
// transport is already proven by smoketest.js; what is unproven here is the
// SOCIAL mechanic — that a pack of goblins counts the people in front of it and
// behaves differently, and that a warband is therefore a group problem rather
// than four separate ones.
//
// If the numbers below come out flat, the phase has not shipped, whatever the
// code looks like.

import { SimWorld } from '../src/sim/world.js';
import { describeMorale } from '../src/creatures/morale.js';

const STEP = 1 / 60;

/** Put N players shoulder to shoulder and a warband of M in front of them. */
function stage(players, goblins, { seconds = 0 } = {}) {
  const world = new SimWorld({ hours: 1 });
  // Deep night, so nothing is fleeing the sun.
  world.clock.hours = 1;
  world.clock.running = false;

  const ids = [];
  for (let i = 0; i < players; i++) {
    const p = world.addPlayer(i + 1, `P${i + 1}`);
    ids.push(p.id);
  }
  // A single party, so they read as one group and cannot shoot each other.
  for (let i = 1; i < ids.length; i++) world.setParty(ids[0], ids[i]);

  // Stand them in a tight knot, which is what a group facing a pack does.
  const base = world.playersInOrder()[0].ctrl.position.clone();
  world.playersInOrder().forEach((p, i) => {
    const a = (i / players) * Math.PI * 2;
    p.ctrl.teleport(
      { x: base.x + Math.cos(a) * 1.6, y: base.y, z: base.z + Math.sin(a) * 1.6 },
      0
    );
  });

  for (const c of [...world.wildlife.creatures]) world.wildlife.remove(c);
  const born = world.wildlife.spawnHerd('goblin', base.x, base.z - 26, goblins, 6);
  for (const c of born) {
    c.packId = 'raid';
    c.awareness = 1;
    c.lastKnownThreat.copy(base);
  }

  const ctx = { hours: 1, sunAltitude: -25, weather: world.weather };
  world.wildlife.ctx = ctx;
  for (let i = 0; i < seconds * 60; i++) world.step(STEP);

  const live = world.wildlife.creatures.filter((c) => c.species.id === 'goblin' && c.state !== 'dead');
  const morale = live.length ? live.reduce((s, c) => s + c.morale, 0) / live.length : 0;
  const dist = live.length
    ? live.reduce((s, c) => s + (c.distanceToPlayer ?? 0), 0) / live.length
    : 0;

  return {
    world,
    goblinsAlive: live.length,
    morale: +morale.toFixed(2),
    nerve: describeMorale(morale),
    opposition: live[0]?.opposition ?? 0,
    meanDistance: +dist.toFixed(1),
    states: [...new Set(live.map((c) => c.state))].join('+') || '-',
    committed: live.filter((c) => c.state === 'charge' || c.state === 'attack').length,
    playerHealth: world.playersInOrder().map((p) => Math.round(p.body.health)),
  };
}

console.log('\n  A warband of five goblins, deep night, against a party that grows.\n');
console.log('  players  goblins  opposition  morale  nerve        committed  mean dist  health');

const rows = [];
for (const n of [1, 2, 3, 4, 6]) {
  const r = stage(n, 5, { seconds: 9 });
  rows.push({ players: n, ...r });
  console.log(
    `      ${String(n).padStart(2)}        5        ${String(r.opposition).padStart(2)}      ` +
      `${r.morale.toFixed(2)}   ${r.nerve.padEnd(12)}    ${String(r.committed).padStart(2)}      ` +
      `${String(r.meanDistance).padStart(5)} m   ${r.playerHealth.join(',')}`
  );
}

// ── the claims ──
const solo = rows[0];
const four = rows.find((r) => r.players === 4);
const six = rows.find((r) => r.players === 6);

const checks = [
  ['a lone player is attacked outright', solo.committed >= 3, `${solo.committed}/5 committed`],
  ['numbers visibly discourage them', four.morale < solo.morale, `${solo.morale} -> ${four.morale}`],
  ['a party of four is not simply safe', four.morale > 0.15, `morale ${four.morale} — still a fight`],
  ['six is enough to give a warband pause', six.committed < solo.committed, `${solo.committed} -> ${six.committed} committed`],
  ['the pack keeps its distance from a crowd', six.meanDistance > solo.meanDistance,
    `${solo.meanDistance} m -> ${six.meanDistance} m`],
  ['a lone player took real damage', Math.min(...solo.playerHealth) < 100,
    `health ${solo.playerHealth.join(',')}`],
];

console.log('');
let failed = 0;
for (const [name, pass, detail] of checks) {
  if (!pass) failed++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

// ── daylight: a rout that runs out of breath ────────────────────────────────
//
// The sun puts a goblin's morale on the floor, so a daylight pack breaks the
// moment it sees you. For a long time that did not make them harmless, it made
// them INVULNERABLE: the broken branch held `flee` (7.6 m/s) for ever, and a
// player who sprints at 8.6 can only hold it for nine seconds. Measured in the
// running game before the fix — sprinting the whole time and re-sprinting the
// instant stamina allowed — a chase that started 5.9 m behind one goblin ended
// 159 m behind it fifty-five seconds later, still losing ground.
//
// Now it spends stamina like every other flight in creature.js, and when its
// breath is gone in daylight it hunkers where it stands instead of trotting on.
// Daylight goblins are AVOIDABLE rather than UNREACHABLE: you cannot run one
// down in the open, you run it out of breath and then walk up to it.
//
// Sampled either side of the goblin's 14 s of stamina.
function rout(hours, seconds) {
  const world = new SimWorld({ hours });
  world.clock.hours = hours;
  world.clock.running = false; // the sun is the variable; hold it still

  const p = world.addPlayer(1, 'P1');
  const base = p.ctrl.position.clone();
  for (const c of [...world.wildlife.creatures]) world.wildlife.remove(c);
  const born = world.wildlife.spawnHerd('goblin', base.x, base.z - 20, 3, 5);
  for (const c of born) {
    c.packId = 'rout';
    c.awareness = 1;
    c.lastKnownThreat.copy(base);
  }

  for (let i = 0; i < seconds * 60; i++) world.step(STEP);

  const live = world.wildlife.creatures.filter((c) => c.species.id === 'goblin' && c.state !== 'dead');
  const mean = (f) => (live.length ? live.reduce((s, c) => s + f(c), 0) / live.length : 0);
  return {
    dist: +mean((c) => c.distanceToPlayer ?? 0).toFixed(1),
    speed: +mean((c) => c.speed ?? 0).toFixed(1),
    gone: live.filter((c) => c.goneToGround).length,
    broken: live.filter((c) => c.broken).length,
    n: live.length,
  };
}

console.log('\n  Daylight: a routed pack runs out of breath.\n');
console.log('  when      after   mean dist   mean speed   gone to ground');
const dayEarly = rout(12, 8);
const dayLate = rout(12, 40);
const nightLate = rout(1, 40);
for (const [label, t, r] of [
  ['noon', 8, dayEarly],
  ['noon', 40, dayLate],
  ['1 a.m.', 40, nightLate],
]) {
  console.log(
    `  ${label.padEnd(8)}  ${String(t).padStart(2)} s   ${String(r.dist).padStart(7)} m   ` +
      `${String(r.speed).padStart(8)} m/s   ${r.gone}/${r.n}`
  );
}

// 7.6 m/s held for the full 40 s would be ~300 m from a 20 m start. Anything
// near that means the stamina spend has been lost again.
const runaway = 200;
const daylightChecks = [
  ['daylight still breaks them on sight', dayEarly.broken === dayEarly.n, `${dayEarly.broken}/${dayEarly.n} broken`],
  ['with breath left they genuinely run', dayEarly.speed > 6 && dayEarly.gone === 0,
    `${dayEarly.speed} m/s, none gone to ground yet`],
  ['out of breath in daylight they go to ground', dayLate.gone === dayLate.n,
    `${dayLate.gone}/${dayLate.n} hunkered`],
  ['and having gone to ground they stay put', dayLate.speed < 0.5, `${dayLate.speed} m/s`],
  ['so a daylight pack is reachable, not gone', dayLate.dist < runaway,
    `${dayLate.dist} m after 40 s, not ${runaway}+`],
  ['the night rout is untouched — it keeps moving', nightLate.gone === 0,
    `${nightLate.gone} gone to ground at 1 a.m.`],
];
console.log('');
for (const [name, pass, detail] of daylightChecks) {
  if (!pass) failed++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

// ── PvP zoning ──
console.log('\n  PvP is the strangeness gradient, not a toggle.\n');
const w = new SimWorld({});
const a = w.addPlayer(1, 'A');
const b = w.addPlayer(2, 'B');
const { placeStrangeness } = await import('../src/world/strangeness.js');

const zoneRows = [];
for (const [x, z, label] of [
  [300, 130, 'at the lake'],
  [900, -400, 'a walk out'],
  [-880, -920, 'the deep country'],
]) {
  b.ctrl.position.set(x, 0, z);
  const s = placeStrangeness(x, z);
  zoneRows.push([label, +s.toFixed(2), w.canHarm(a, b)]);
  console.log(`  ${label.padEnd(18)} strangeness ${s.toFixed(2)}   friendly fire: ${w.canHarm(a, b) ? 'ON' : 'off'}`);
}

w.setParty(1, 2);
const partyBlocked = !w.canHarm(a, b);
console.log(`  in a party, out there                       friendly fire: ${partyBlocked ? 'off' : 'ON'}`);

const zoneChecks = [
  ['safe near the lake', zoneRows[0][2] === false, `strangeness ${zoneRows[0][1]}`],
  ['dangerous out in the strange country', zoneRows[2][2] === true, `strangeness ${zoneRows[2][1]}`],
  ['a party is safe anywhere', partyBlocked, 'party members never harm each other'],
];
console.log('');
for (const [name, pass, detail] of zoneChecks) {
  if (!pass) failed++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

// ── death drops ──
const victim = w.playersInOrder()[0];
victim.inventory.add('venison', 3);
victim.inventory.add('hide', 2);
const carried = victim.inventory.slots.filter((s) => s.item && s.count).length;
victim.body.health = 0;
victim.body.dead = true;
const dropped = w.onPlayerDied(victim, { species: { name: 'Goblin' } });
const kept = victim.inventory.slots.filter((s) => s.item && s.count).map((s) => s.item);
console.log('\n  Dying is a problem with a location.\n');
console.log(`  carried ${carried} kinds, dropped ${dropped.length}, kept ${kept.join(',') || 'nothing'}`);
const ev = w.events.at(-1);
console.log(`  event: ${ev.n} killed by ${ev.by} — ${ev.where}`);

const deathChecks = [
  ['gear drops where you fell', dropped.length > 0, `${dropped.length} stacks`],
  ['the bow is kept', kept.includes('bow'), `kept ${kept.join(',')}`],
  ['the death is a shared, located event', !!ev.where, ev.where],
];
console.log('');
for (const [name, pass, detail] of deathChecks) {
  if (!pass) failed++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

const total = checks.length + daylightChecks.length + zoneChecks.length + deathChecks.length;
console.log(`\n  ${total - failed}/${total} passed\n`);
process.exit(failed ? 1 : 0);
