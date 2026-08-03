// ── reportcheck.js ──────────────────────────────────────────────────────────
// Does a session report say true things, and would it notice a real problem?
//
//   npm run reportcheck
//
// Built from INVENTED agents rather than from a live run, which is the only way
// to check the interesting property: a report is worth having if it finds
// things, so the checks here plant a problem and demand the report catch it.
// Asserting that a file got written would prove nothing about whether reading
// it would ever change what you build.

import { buildReport, summarise } from './playreport.js';
import { appendNote } from './notes.js';
import { GOAL_IDS } from '../src/minds/goals.js';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** An agent that did whatever you say it did. */
const agent = (name, goalCounts, extra = {}) => ({
  name,
  goalCounts,
  decisions: Object.values(goalCounts).reduce((a, b) => a + b, 0),
  startX: 0, startZ: 0, x: 300, z: 200,
  said: [], lastError: null,
  ...extra,
});

console.log('\n  Session reports\n');

// ── a healthy run ──
const healthy = GOAL_IDS.map((id, i) => agent(`A${i}`, { [id]: 5 }));
const good = buildReport(healthy, { seconds: 1200, minds: 'scripted' });
check('a run that used every verb reports nothing missing',
  !/nobody ever did/i.test(good.text), summarise(good.findings));

// ── it admits when it cannot tell ──
// The first live run reported "nobody ever hunted, made camp or spoke" off
// twelve decisions in thirty seconds. That is a fact about the run, not the
// game, and a report that cries wolf is a report you stop reading.
const brief = [agent('Eachann', { wander: 6 }), agent('Morag', { wander: 6 })];
const tooShort = buildReport(brief, { seconds: 30 });
check('a run too short to conclude from says so instead of guessing',
  /too short to conclude/i.test(tooShort.text) && !/nobody ever did/i.test(tooShort.text),
  '12 decisions in 30s — the shape of the first live run');
check('and reports no finding it cannot support',
  !tooShort.findings.some((f) => f.startsWith('never used')),
  `"${summarise(tooShort.findings)}"`);

// ── the finding the whole thing exists for ──
const narrow = [agent('Eachann', { wander: 20, hunt: 8 }), agent('Morag', { wander: 14, avoid: 3 })];
const found = buildReport(narrow, { seconds: 1200 });
check('a verb nobody reached for is called out',
  /nobody ever did/i.test(found.text) && found.text.includes('makeCamp'),
  'two agents, 45 decisions, never once made camp');
check('and every unused verb is named, not just the first',
  GOAL_IDS.filter((id) => !['wander', 'hunt', 'avoid'].includes(id))
    .every((id) => found.text.includes(id)),
  'all of them, so you can see the shape of what is being ignored');
check('the used ones are NOT called out',
  !/`wander` — not once/.test(found.text), 'wander was used 34 times');

// ── went nowhere ──
const rooted = [agent('Tormod', { wander: 30 }, { x: 4, z: 3 }), agent('Ailsa', { wander: 12 })];
const stuck = buildReport(rooted, { seconds: 600 });
check('an agent that decided a lot and moved nothing is flagged',
  /Went nowhere/.test(stuck.text) && stuck.text.includes('Tormod'),
  '30 decisions, 5 m travelled');
check('and one that actually walked is not',
  !/- Ailsa —.*moved/.test(stuck.text), 'Ailsa covered 360 m');

// ── looping ──
const looping = [agent('Fingal', { hunt: 40 })];
const loop = buildReport(looping, { seconds: 600 });
check('a mind re-deciding the same goal forever is flagged',
  /same goal over and over/i.test(loop.text) && loop.text.includes('hunt'),
  'chose hunt 40 times and kept choosing it');

// A mind with a spread of goals is not looping, even if one dominates.
const varied = [agent('Calum', { hunt: 10, wander: 6, avoid: 4 })];
check('but a mind with a spread of goals is not',
  !/same goal over and over/i.test(buildReport(varied, { seconds: 600 }).text),
  'hunt led but never dominated');

// ── their own words ──
const talkative = [agent('Beathag', { wander: 4 }, { said: ['have you seen the stones?'] })];
const spoken = buildReport(talkative, { seconds: 300 });
check('what they said out loud is kept verbatim',
  spoken.text.includes('have you seen the stones?'),
  'the only unprompted sentence in the run');

// ── errors surface ──
const broken = [agent('Ruaridh', { wander: 3 }, { lastError: 'brief threw: no carrying' })];
check('an agent that errored says so',
  /Errors/.test(buildReport(broken, { seconds: 60 }).text));

// ── an empty run does not invent findings ──
const empty = buildReport([], { seconds: 0 });
check('a run with no agents finds nothing rather than everything',
  empty.findings.length === 0 && !/nobody ever did/i.test(empty.text),
  `"${summarise(empty.findings)}"`);

// ── and it lands in the same file the humans write to ──
const dir = mkdtempSync(join(tmpdir(), 'hl-notes-'));
appendNote({ text: 'a person typed this', who: 'player', context: 'on open moor · 03:12' }, dir);
appendNote({ text: found.text, who: '2 agents', context: '1200s' }, dir);
const file = readFileSync(join(dir, 'DEV-NOTES.md'), 'utf8');
check('a human note and an agent report share one format',
  (file.match(/^## /gm) ?? []).length === 2 && file.includes('a person typed this')
    && file.includes('nobody ever did'),
  'both are ## heading, body, > context — one document, not two systems');
check('and it appends rather than replacing',
  file.indexOf('a person typed this') < file.indexOf('nobody ever did'),
  'the first note survived the second');

let threw = null;
try { appendNote({ text: '   ' }, dir); } catch (e) { threw = e.message; }
check('an empty note is refused', !!threw, `"${threw}"`);

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
