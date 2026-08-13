// ── journalcheck.js ─────────────────────────────────────────────────────────
// Does the run survive being forgotten?
//
//   npm run journalcheck
//
// THE EVENING THAT CAUSED THIS FILE, 2026-08-12. `deeds` and `intentions` are
// rings `AGENTS.logSize` (400) deep PER SEAT and they were the only record a
// run left behind. In one evening that cost three separate things:
//
//   * A run's five TRANSFERS — the first goods ever to change hands in this
//     project — rolled off the ring within minutes. They survive only because
//     `board.json` was being snapshotted to a file from outside the game every
//     45 seconds, BY HAND, because I had already been bitten twice that night.
//   * `playreport` summarises a two-hour run from whatever is still in the ring
//     when the process exits, which is its last few minutes.
//   * DEV-NOTES is written ONLY on a clean exit, and STOP.cmd kills the window.
//     Two runs' reports were lost that way in one day.
//
// So the assertion that matters is not "it writes a file". It is: EVENTS THE
// RING HAS ALREADY THROWN AWAY ARE STILL IN THE JOURNAL, and a run killed
// mid-sentence keeps everything up to that sentence.
//
// Driven against a plain object with two arrays rather than a live fleet, on
// purpose: the journal PULLS from anything shaped like an agent, which is what
// keeps it out of the simulation's way, and a test that needed a server to
// prove a file-append would be testing the wrong seam.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openJournal } from './journal.js';
import { AGENTS } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n  Journalcheck — does the run survive being forgotten?\n');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'journalcheck-'));
const file = path.join(dir, 'run.jsonl');
const read = () => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

// A body shaped like an Agent and nothing more. Rings three deep so the drain
// is tested against a ring that is CONSTANTLY shifting, which is the condition
// the real one fails under.
const RING = 3;
function body(name = 'Mairi') {
  return { name, provider: { model: 'kimi-k2.6' }, deeds: [], intentions: [], _seq: 0 };
}
function deed(b, what, text, extra = {}) {
  b._seq += 1;
  b.deeds.push({ seq: b._seq, h: b._seq, what, text, ...extra });
  if (b.deeds.length > RING) b.deeds.shift();
}
function decision(b, goal, why) {
  b._seq += 1;
  b.intentions.push({ seq: b._seq, h: b._seq, goal, why, where: 'the black corrie' });
  if (b.intentions.length > RING) b.intentions.shift();
}

// ── 1. THE ONE THAT MATTERS ─────────────────────────────────────────────────
{
  const j = openJournal(file);
  j.begin({ url: 'ws://test', roster: 'roster-test.json', seats: [{ name: 'Mairi', model: 'kimi-k2.6' }] });
  const b = body();
  for (let i = 1; i <= 30; i++) {
    deed(b, 'gather', `I picked up branch ${i}`);
    j.drain([b], i);                     // drained as it goes, as the fleet does
  }
  const lines = read();
  const deeds = lines.filter((l) => l.k === 'deed');
  check('THIRTY DEEDS THROUGH A RING THAT HOLDS THREE — all thirty are in the journal',
    deeds.length === 30, `${deeds.length}/30 kept, ring held ${RING}`);
  check('  …in order, first to last, with nothing repeated',
    deeds[0]?.text === 'I picked up branch 1'
      && deeds[29]?.text === 'I picked up branch 30'
      && new Set(deeds.map((d) => d.text)).size === 30,
    `${deeds[0]?.text} … ${deeds[29]?.text}`);
  check('  …and the run says what world it was, so a reader is not guessing',
    lines[0]?.k === 'run' && lines[0]?.roster === 'roster-test.json',
    JSON.stringify(lines[0]).slice(0, 96));
  j.close();
}

// ── 2. A DRAIN THAT MISSES NOTHING AND SAYS NOTHING TWICE ───────────────────
{
  fs.writeFileSync(file, '');
  const j = openJournal(file);
  const b = body();
  // Four events between drains — MORE than the ring holds, so a naive "since
  // index N" reader would lose one and a naive "write it all" reader would
  // repeat two.
  for (let round = 0; round < 5; round++) {
    for (let i = 0; i < 4; i++) deed(b, 'gather', `r${round}-${i}`);
    j.drain([b], round);
  }
  const deeds = read().filter((l) => l.k === 'deed');
  const gaps = read().filter((l) => l.k === 'gap');
  // A ring drain CANNOT be lossless when a burst outruns the ring, and pretending
  // otherwise is the failure this whole file is about. What it can do is know.
  // (Ring 3, four events per drain: one lost each round, five rounds.)
  check('A BURST BIGGER THAN THE RING IS LOSSY — and the journal SAYS SO rather than reading whole',
    deeds.length === 15 && gaps.length === 5 && gaps.every((g) => g.missed === 1),
    `${deeds.length} deeds kept, ${gaps.length} gaps recorded, ${gaps.reduce((n, g) => n + g.missed, 0)} events admitted missing`);
  check('  …and 15 kept + 5 admitted missing accounts for every one of the 20',
    deeds.length + gaps.reduce((n, g) => n + g.missed, 0) === 20,
    `${deeds.length} + ${gaps.reduce((n, g) => n + g.missed, 0)} = 20`);
  check('  …and draining again with nothing new writes nothing at all',
    (j.drain([b], 99), read().length === deeds.length + gaps.length),
    `${read().length} lines after an empty drain`);
  j.close();

  // And the case that actually happens in a run: the drain keeps up with the
  // ring, and then it IS lossless.
  fs.writeFileSync(file, '');
  const j2 = openJournal(file);
  const c = body('Coinneach');
  for (let round = 0; round < 10; round++) {
    for (let i = 0; i < RING - 1; i++) deed(c, 'gather', `safe-${round}-${i}`);
    j2.drain([c], round);
  }
  const safe = read();
  check('WHEN THE DRAIN KEEPS UP WITH THE RING, NOTHING IS LOST AND NO GAP IS CLAIMED',
    safe.filter((l) => l.k === 'deed').length === 20 && !safe.some((l) => l.k === 'gap'),
    `${safe.filter((l) => l.k === 'deed').length}/20 deeds, ${safe.filter((l) => l.k === 'gap').length} gaps`);
  j2.close();
}

// ── 3. WHAT A READER NEEDS OFF IT ───────────────────────────────────────────
{
  fs.writeFileSync(file, '');
  const j = openJournal(file);
  const b = body();
  decision(b, 'make something useful', 'bow is useless without them');
  deed(b, 'craft', 'I chose to make 4 arrows', { id: 'arrow', n: 4, by: 'choice' });
  deed(b, 'eat', 'I chose to eat a venison', { id: 'venison', filled: 16, by: 'choice' });
  deed(b, 'give', 'I gave wood to Coinneach');
  j.drain([b], 12);
  const lines = read();
  const craft = lines.find((l) => l.what === 'craft');
  const meal = lines.find((l) => l.what === 'eat');
  check('A DECISION IS KEPT WITH ITS REASON — the only thing that tells two models apart',
    lines.some((l) => l.k === 'decision' && l.why === 'bow is useless without them'),
    JSON.stringify(lines.find((l) => l.k === 'decision')));
  check('  …and a MAKE keeps who asked for it, so chosen and reflex stay separable',
    craft?.by === 'choice' && craft?.id === 'arrow' && craft?.n === 4, JSON.stringify(craft));
  check('  …and a MEAL keeps who asked and how much it filled',
    meal?.by === 'choice' && meal?.filled === 16, JSON.stringify(meal));
  check('  …and a TRANSFER is in there at all, which is the event that kept vanishing',
    lines.some((l) => l.what === 'give'), JSON.stringify(lines.find((l) => l.what === 'give')));
  check('  …and every line names the seat AND its model, so a run is attributable',
    lines.filter((l) => l.k !== 'run' && l.k !== 'end').every((l) => l.who && l.model),
    `${lines.length} lines`);
  j.close();
}

// ── 4. A RUN THAT IS KILLED, WHICH IS HOW RUNS ACTUALLY END ─────────────────
{
  fs.writeFileSync(file, '');
  const j = openJournal(file);
  const b = body();
  for (let i = 1; i <= 7; i++) { deed(b, 'gather', `before the axe ${i}`); j.drain([b], i); }
  // No `end()`. STOP.cmd does not ask politely, and neither does Windows.
  const lines = read();
  check('A RUN KILLED WITHOUT A GOODBYE KEEPS EVERYTHING UP TO THE MOMENT',
    lines.filter((l) => l.k === 'deed').length === 7, `${lines.filter((l) => l.k === 'deed').length}/7 survived a kill`);
  check('  …and a reader can TELL it was killed, because there is no end line',
    !lines.some((l) => l.k === 'end'), 'no end marker, as expected');
  j.close();
}

// ── 5. AND IT NEVER EATS THE PREVIOUS RUN ───────────────────────────────────
{
  const before = read().length;
  const j = openJournal(file);
  j.begin({ url: 'second run' });
  j.end({ seconds: 1 });
  const after = read();
  check('A SECOND RUN APPENDS — it does not truncate the first',
    after.length === before + 2 && after.length > before,
    `${before} lines -> ${after.length}`);
  check('  …and a finished run says so, so the two can be told apart',
    after.some((l) => l.k === 'end'), JSON.stringify(after.at(-1)));
}

check('SENTINEL: the ring this defends against is real and still small',
  AGENTS.logSize > 0 && AGENTS.logSize <= 1000, `AGENTS.logSize = ${AGENTS.logSize}`);

fs.rmSync(dir, { recursive: true, force: true });

const passed = results.filter((r) => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed\n`);
if (passed < results.length) {
  console.log('  FAILED:');
  for (const r of results.filter((x) => !x.pass)) console.log(`    - ${r.name}`);
  console.log('');
}
