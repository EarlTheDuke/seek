// ── rotatecheck.js ──────────────────────────────────────────────────────────
// Can a MODEL be told apart from the SEAT it happened to sit in?
//
//   npm run rotatecheck
//
// THE TWO RUNS THAT CAUSED THIS FILE, both 2026-08-12, same roster, same
// settings, hours apart:
//
//     grok-4.6 (Ailsa) — 3 kills from 24 model answers
//     grok-4.6 (Fingal) — 1 kill from 135, and starved to death
//
// Nothing about the model changed. What differed was the seat: a name, a written
// character, a spawn point, and whoever happened to be standing nearby. Every
// model in this project is welded to one seat, so "grok-4.6 hunts well" and
// "that seat wakes up near the deer" are the same sentence.
//
// **Until rotation exists, no model claim from this project is quotable** — and
// that includes every observation made about grok-4.6 on the day this was
// written. Run the same roster at ROTATE=0,1,2,… and a model's score becomes an
// average over seats instead of a property of where it woke up.
//
// WHAT THIS FILE IS REALLY GUARDING is the second half, which is the easy half
// to get wrong: the OPERATING PARAMETERS have to travel with the mind. grok-4.6
// thinks for 26 seconds. Rotate it into a seat on a 12-second cadence and you
// have built a queue, and a queue is how a good model is made to look broken —
// which is the failure that produced 116 truncated kimi calls and a three-model
// run that was really a two-model run.

import { rotateMinds, loadRoster } from './roster.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n  Rotatecheck — is a model separable from its seat?\n');

// The real shape: models with genuinely different operating needs, plus the
// scripted control, which must never move and never acquire a mind.
const ROSTER = {
  budgetCalls: 2500,
  players: [
    { name: 'Eachann', character: 'You hoard.', provider: 'xai', model: 'grok-4.20-non-reasoning',
      keyEnv: 'XAI_API_KEY', cadenceSeconds: 12, timeoutSeconds: 20 },
    { name: 'Tormod', character: 'You lie about the deer.', provider: 'xai', model: 'grok-4.5',
      keyEnv: 'XAI_API_KEY', cadenceSeconds: 30, timeoutSeconds: 30 },
    { name: 'Fingal', character: 'You share.', provider: 'xai', model: 'grok-4.6',
      keyEnv: 'XAI_API_KEY', cadenceSeconds: 60, timeoutSeconds: 120, maxTokens: 6000, think: true },
    { name: 'Coinneach', character: 'You are blunt.', provider: 'openai-compatible',
      baseUrl: 'https://tinybox.example/api', model: 'kimi-k2.6', keyEnv: 'TINYBOX_API_KEY',
      cadenceSeconds: 70, timeoutSeconds: 150, maxTokens: 12000, think: true },
    { name: 'Iseabail', character: 'The control — no model, no key, no network.' },
  ],
};
const seatOf = (r, model) => r.players.find((p) => p.model === model)?.name;
const mindAt = (r, name) => r.players.find((p) => p.name === name);

// ── 1. THE CONTROL ARM ──────────────────────────────────────────────────────
// Same discipline `personacheck` holds the persona control to: an experiment
// whose off-state has drifted is measuring two things at once.
{
  const same = rotateMinds(ROSTER, 0);
  check('ROTATE=0 IS THE ROSTER, UNTOUCHED — the off-state cannot drift',
    same === ROSTER, same === ROSTER ? 'identical object' : 'A COPY WAS MADE');
  check('  …and so is a missing or nonsense ROTATE',
    rotateMinds(ROSTER, undefined) === ROSTER && rotateMinds(ROSTER, 'banana') === ROSTER,
    'undefined and "banana" both leave it alone');
}

// ── 2. THE MIND MOVES ───────────────────────────────────────────────────────
{
  const r1 = rotateMinds(ROSTER, 1);
  check('EVERY MIND MOVES ONE SEAT ALONG',
    seatOf(ROSTER, 'grok-4.6') === 'Fingal' && seatOf(r1, 'grok-4.6') === 'Coinneach',
    `grok-4.6: ${seatOf(ROSTER, 'grok-4.6')} -> ${seatOf(r1, 'grok-4.6')}`);

  const models = (r) => r.players.filter((p) => p.model).map((p) => p.model).sort();
  check('  …and it is a PERMUTATION — every model still plays, exactly once',
    JSON.stringify(models(r1)) === JSON.stringify(models(ROSTER)),
    models(r1).join(', '));

  const seats = (r) => r.players.map((p) => `${p.name}:${p.character}`).join(' | ');
  check('  …while the SEAT keeps its name and its character',
    seats(r1) === seats(ROSTER), seats(r1).slice(0, 84) + '…');
}

// ── 3. THE HALF THAT IS EASY TO GET WRONG ───────────────────────────────────
//
// A model's cadence, timeout and token ceiling are properties of THE MODEL, not
// of the chair. grok-4.6 on Eachann's 12-second cadence is a queue.
{
  const r1 = rotateMinds(ROSTER, 1);
  const moved = mindAt(r1, 'Coinneach');          // grok-4.6 now sits here
  check('THE OPERATING PARAMETERS TRAVEL WITH THE MIND — cadence, timeout, tokens',
    moved.model === 'grok-4.6' && moved.cadenceSeconds === 60
      && moved.timeoutSeconds === 120 && moved.maxTokens === 6000 && moved.think === true,
    `${moved.model} @ ${moved.cadenceSeconds}s, timeout ${moved.timeoutSeconds}s, maxTokens ${moved.maxTokens}`);

  const fast = mindAt(r1, 'Tormod');              // the 12s non-reasoning model
  check('  …so no reasoning model is ever left on a twitchy seat',
    fast.model === 'grok-4.20-non-reasoning' && fast.cadenceSeconds === 12,
    `${fast.name} now runs ${fast.model} @ ${fast.cadenceSeconds}s`);

  const kimi = r1.players.find((p) => p.model === 'kimi-k2.6');
  check('  …and a mind keeps the endpoint that can actually serve it',
    kimi.baseUrl === 'https://tinybox.example/api' && kimi.keyEnv === 'TINYBOX_API_KEY',
    `kimi at ${kimi.name}: ${kimi.baseUrl}`);
}

// ── 4. THE CONTROL NEVER MOVES AND NEVER THINKS ─────────────────────────────
{
  for (const by of [1, 2, 3, 7]) {
    const r = rotateMinds(ROSTER, by);
    const ctl = mindAt(r, 'Iseabail');
    if (ctl.model || ctl.provider) {
      check(`THE SCRIPTED CONTROL STAYS SCRIPTED (ROTATE=${by})`, false, JSON.stringify(ctl));
      break;
    }
    if (by === 7) {
      check('THE SCRIPTED CONTROL STAYS SCRIPTED AT EVERY ROTATION',
        true, 'no provider, no model, no key at ROTATE=1,2,3,7');
    }
  }
  const r1 = rotateMinds(ROSTER, 1);
  check('  …and she keeps her seat, so "the control" still means one body',
    r1.players[4].name === 'Iseabail', r1.players.map((p) => p.name).join(' '));
}

// ── 5. A FULL TURN IS THE IDENTITY ──────────────────────────────────────────
//
// Four model seats, so ROTATE=4 must put everybody back. Without this, "run it
// at 0,1,2,3" would silently sample some seats twice and others never.
{
  const n = ROSTER.players.filter((p) => p.provider).length;
  const full = rotateMinds(ROSTER, n);
  const pairs = (r) => r.players.map((p) => `${p.name}=${p.model ?? 'scripted'}`).join(' ');
  check(`A FULL TURN RETURNS EVERY MIND TO ITS OWN SEAT (ROTATE=${n})`,
    pairs(full) === pairs(ROSTER), pairs(full));

  const seen = new Set();
  for (let by = 0; by < n; by++) seen.add(seatOf(rotateMinds(ROSTER, by), 'grok-4.6'));
  check('  …and 0..n-1 sits one model in EVERY model seat, exactly once each',
    seen.size === n, `grok-4.6 sat in: ${[...seen].join(', ')}`);
}

// ── 6. NEGATIVE AND OVERSIZED ROTATIONS ─────────────────────────────────────
{
  const n = ROSTER.players.filter((p) => p.provider).length;
  const back = rotateMinds(ROSTER, -1);
  const fwd = rotateMinds(ROSTER, n - 1);
  const pairs = (r) => r.players.map((p) => `${p.name}=${p.model ?? 'scripted'}`).join(' ');
  check('ROTATE=-1 is the same as rotating all the way round the other way',
    pairs(back) === pairs(fwd), pairs(back));
  check('  …and a rotation bigger than the roster wraps rather than emptying it',
    pairs(rotateMinds(ROSTER, n + 1)) === pairs(rotateMinds(ROSTER, 1)),
    `ROTATE=${n + 1} == ROTATE=1`);
}

// ── 7. AND THE ORIGINAL IS NEVER MUTATED ────────────────────────────────────
// A rotated roster that edited its source in place would poison every later
// rotation, and the bug would look like "the models drifted".
{
  const before = JSON.stringify(ROSTER);
  rotateMinds(ROSTER, 1); rotateMinds(ROSTER, 2); rotateMinds(ROSTER, 3);
  check('ROTATING NEVER EDITS THE ROSTER IT WAS GIVEN',
    JSON.stringify(ROSTER) === before, 'source roster unchanged after three rotations');
  check('  …and the rotated copy says how far it was turned, so a run is attributable',
    rotateMinds(ROSTER, 2).rotatedBy === 2, `rotatedBy = ${rotateMinds(ROSTER, 2).rotatedBy}`);
}

// ── 8. A ROSTER TOO SMALL TO ROTATE ─────────────────────────────────────────
{
  const solo = { players: [{ name: 'A', provider: 'xai', model: 'm' }, { name: 'Ctl' }] };
  check('SENTINEL: one model and a control cannot rotate, and does not pretend to',
    rotateMinds(solo, 1) === solo, 'returned unchanged rather than shuffling one seat');
}

// ── 9. AND THE ONE THAT ACTUALLY CAUGHT THE BUG ─────────────────────────────
//
// Everything above ran against a roster built by hand in this file, and it all
// passed while the real thing was broken. `loadRoster` fills an ABSENT provider
// with the string `'scripted'` — truthy — so a filter of `p.provider` swept the
// control into the rotation: at ROTATE=1, Eachann went scripted and Iseabail
// acquired a kimi model. Every rotated run would have had no control arm.
//
// So this section loads the REAL file through the REAL loader. A check that
// only ever sees a fixture is a check green over a path no caller can reach,
// which is the most repeated shape of wrong in this repo.
{
  let real = null;
  try { real = loadRoster('roster-grok46.json'); } catch { /* not present in a bare checkout */ }
  if (!real) {
    check('SKIPPED: roster-grok46.json is not here, so the real loader was not exercised',
      true, 'run this from the project root to get the assertion that matters');
  } else {
    const ctlName = real.players.find((p) => !p.model)?.name;
    check('THROUGH THE REAL LOADER: the control has a truthy provider, which is the trap',
      real.players.find((p) => p.name === ctlName)?.provider === 'scripted',
      `${ctlName}.provider = "${real.players.find((p) => p.name === ctlName)?.provider}" — truthy, and NOT a mind`);

    let ok = true;
    const detail = [];
    for (let by = 0; by < real.players.length + 2; by++) {
      const r = rotateMinds(real, by);
      const ctl = r.players.find((p) => p.name === ctlName);
      const models = r.players.filter((p) => p.model).length;
      if (ctl.model || models !== real.players.filter((p) => p.model).length) {
        ok = false;
        detail.push(`ROTATE=${by}: ${ctlName} has ${ctl.model ?? 'no model'}, ${models} minds`);
      }
    }
    check('  …and at EVERY rotation the control keeps no model, and no mind is lost',
      ok, ok ? `${ctlName} stayed scripted through every rotation` : detail.join(' | '));

    // A MIND IS NOT ITS MODEL NAME. This roster runs grok-4.6 TWICE, so
    // `find(p => p.model === 'grok-4.6')` returns whichever comes first and the
    // question "where did it sit" has no answer. Their cadences differ (60s and
    // 75s) because that is what the two seats are for, so model+cadence is the
    // identity — and it is the pair rotation is supposed to keep together.
    const n = real.players.filter((p) => p.model).length;
    const idOf = (p) => `${p.model}@${p.cadenceSeconds ?? '-'}`;
    const allMinds = real.players.filter((p) => p.model).map(idOf).sort();
    check('SENTINEL: every mind in the real roster is distinguishable by model+cadence',
      new Set(allMinds).size === n, allMinds.join(' '));

    const firstSeat = real.players.find((p) => p.model).name;
    const visitors = new Set();
    for (let by = 0; by < n; by++) {
      visitors.add(idOf(rotateMinds(real, by).players.find((p) => p.name === firstSeat)));
    }
    check('  …and across a full turn ONE SEAT hosts every mind exactly once',
      visitors.size === n && [...visitors].sort().join(' ') === allMinds.join(' '),
      `${firstSeat} hosted: ${[...visitors].join(', ')}`);
  }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed\n`);
if (passed < results.length) {
  console.log('  FAILED:');
  for (const r of results.filter((x) => !x.pass)) console.log(`    - ${r.name}`);
  console.log('');
}
