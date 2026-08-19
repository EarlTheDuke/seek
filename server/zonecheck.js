// ── zonecheck.js ────────────────────────────────────────────────────────────
// Does WHERE an arrow lands on a person matter, and does a cloak soften it?
//
//   npm run zonecheck
//
// Ben, 2026-08-18: "can we have hit zones for PVP so a head shot is like x3
// the damage or something? Cloak should add double the hit points maybe."
// Both shipped the same evening — see PLAN-COMBAT.md for the design and the
// order of application. This file holds the arithmetic table and the wiring;
// the live-fire socket gesture rides shotcheck and duelcheck, which already
// drive a real arrow through the ONE gate every player hit passes
// (`onPlayerHit` in world.js) — the same gate these rules live in.
//
// THE TABLE IS THE CONTRACT:
//
//     dealt = base × (head ? 3 : 1) × (cloaked ? 0.5 : 1)
//
// A head shot through a cloak is 1.5× — softened, not excused. An impact the
// wire could not describe (an old server, a missing probe) is the BODY: the
// conservative answer, never a free triple.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playerStrikeZone, playerDamage } from '../src/sim/world.js';
import { COMBAT, PLAYER } from '../src/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const codeOnly = (src) => src.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');

console.log('\n  Does WHERE an arrow lands matter, and does a cloak soften it?\n');

// ── the boundary, against the body it divides ───────────────────────────────
check('the head line is on the body — above the shoulders, below the crown',
  COMBAT.headshotAbove > 1.3 && COMBAT.headshotAbove < PLAYER.bodyHeight,
  `${COMBAT.headshotAbove} m on a ${PLAYER.bodyHeight} m body`);
check('an eye-height impact IS a head shot — a level close shot that lands is one',
  playerStrikeZone(100 + PLAYER.eyeHeight, 100) === 'head',
  `eye at ${PLAYER.eyeHeight}`);
check('the chest is the body', playerStrikeZone(101.2, 100) === 'body');
check('the legs are the body — two zones only, on purpose',
  playerStrikeZone(100.3, 100) === 'body');
check('an impact the wire could not describe is the BODY, never a free triple',
  playerStrikeZone(undefined, 100) === 'body' && playerStrikeZone(101.72, undefined) === 'body');
check('the line respects the feet, wherever the ground put them',
  playerStrikeZone(51.72, 50) === 'head' && playerStrikeZone(51.2, 50) === 'body',
  'measured from the body, not from sea level');

// ── the table ───────────────────────────────────────────────────────────────
check('a head shot is ×3', playerDamage(11, 'head', false) === 33,
  '11 → 33');
check('the body is ×1', playerDamage(11, 'body', false) === 11);
check('a cloak halves a body hit — "double the hit points", as damage arithmetic',
  playerDamage(11, 'body', true) === 5.5, '11 → 5.5: you survive twice the arrows');
check('a cloak SOFTENS a head shot and does not excuse it',
  playerDamage(11, 'head', true) === 16.5, '×1.5 — zone first, cloak after');

// ── the wiring, from the source, comments stripped ──────────────────────────
const world = codeOnly(fs.readFileSync(path.join(HERE, '..', 'src', 'sim', 'world.js'), 'utf8'));
const gate = world.slice(world.indexOf('onPlayerHit = '), world.indexOf('onPlayerHit = ') + 1600);
check('the ONE player-damage gate consults the zone',
  /playerStrikeZone\(at\?\.y, target\.ctrl\.position\.y\)/.test(gate),
  'onPlayerHit reads the impact height the segment test always had');
check('  …and the cloak, by carriage — the same rule as its warmth',
  /countOf\('cloak'\)/.test(gate));
check('  …and deals the COMPUTED damage, not the base',
  /target\.body\.damage\(dealt/.test(gate),
  'a table nothing reads is a comment');
check('  …and the hit event says zone and cloak, so both ends can say so',
  /zone,/.test(gate) && /cloaked: true/.test(gate));

const passed = results.filter((r) => r.pass).length;
console.log(`\n  ${passed}/${results.length}${passed === results.length ? ' passed' : ' PASSED — SOMETHING IS WRONG'}\n`);
