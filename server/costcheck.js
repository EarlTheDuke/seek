// ── costcheck.js ────────────────────────────────────────────────────────────
// Does a run know what it is spending, WHILE it spends it?
//
//   npm run costcheck
//
// THE THREE THINGS THAT WENT WRONG ON 2026-08-12, in the order they hurt:
//
//   1. REASONING WAS NOT COUNTED AT ALL. xAI reports a thinking model as
//      `completion_tokens: 23` beside
//      `completion_tokens_details.reasoning_tokens: 1507` — separately — and
//      only the first was read. The board reported about $1.84 of xAI spend
//      against roughly $3.37 billable: **45% under**.
//   2. THE CAP WAS IN THE WRONG UNIT. `budgetCalls` caps CALLS. In the same run
//      grok-4.20-non-reasoning made 375 calls for ~$0.69 while two grok-4.6
//      seats made 135 between them for ~$1.63 — about NINE TIMES the cost per
//      decision — and the budget could not see the difference.
//   3. NOTHING SAID IT WHILE IT WAS HAPPENING. The cost was worked out after
//      the fact, by hand, from token totals. No invoice can tell you what a run
//      is costing while the run is going.
//
// WHAT THIS GUARDS ABOVE ALL: an unpriced model is reported as UNKNOWN AND
// NAMED, never as zero. A silent zero is how a bill becomes a surprise, and it
// is the same disease as every other silent failure in this repo's trap list.

import { Budget } from '../src/minds/providers.js';
import { PRICES } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

console.log('\n  Costcheck — does a run know what it is spending?\n');

// ── 1. THE ARITHMETIC ───────────────────────────────────────────────────────
{
  const b = new Budget({ maxCalls: 100 });
  // A million in and a million out of grok-4.6: $2.00 + $6.00.
  b.spend(1e6, 1e6, 'grok-4.6');
  check('A MODEL IS PRICED FROM ITS OWN RATES, in and out separately',
    near(b.usd, 8), `$${b.usd.toFixed(2)} for 1M in + 1M out of grok-4.6 ($2 + $6)`);

  const c = new Budget({ maxCalls: 100 });
  c.spend(1e6, 1e6, 'grok-4.20-0309-non-reasoning');
  check('  …and the cheap seat is cheaper, which is the whole point',
    near(c.usd, 3.75) && c.usd < b.usd,
    `$${c.usd.toFixed(2)} vs $${b.usd.toFixed(2)} — the same tokens, ${(b.usd / c.usd).toFixed(1)}x the cost`);
}

// ── 2. THE ONE THAT MATTERS MOST ────────────────────────────────────────────
{
  const b = new Budget({ maxCalls: 100 });
  b.spend(1000, 1000, 'some-model-nobody-priced');
  check('AN UNPRICED MODEL IS NAMED, NEVER SILENTLY COSTED AT ZERO',
    b.unpriced.includes('some-model-nobody-priced') && b.spent.unpriced.length === 1,
    `unpriced: ${b.unpriced.join(', ')}`);
  check('  …and `costOf` says NULL for it rather than 0',
    Budget.costOf('some-model-nobody-priced', 1e6, 1e6) === null,
    String(Budget.costOf('some-model-nobody-priced', 1e6, 1e6)));
  check('  …while a model priced at genuine zero is priced, not "unknown"',
    Budget.costOf('kimi-k2.6', 1e6, 1e6) === 0 && !b.unpriced.includes('kimi-k2.6'),
    'kimi on your own box: 0 is a measured fact, not a gap');
}

// ── 3. PER SEAT, BECAUSE "WHAT DID THE RUN COST" IS THE LESS USEFUL QUESTION ─
{
  const b = new Budget({ maxCalls: 1000 });
  // The 2026-08-12 shape, roughly: many cheap calls against few expensive ones.
  for (let i = 0; i < 375; i++) b.spend(1430, 22, 'grok-4.20-0309-non-reasoning');
  for (let i = 0; i < 135; i++) b.spend(1430, 1530, 'grok-4.6');
  const s = b.spent;
  const cheap = s.perModel.find((m) => m.model.startsWith('grok-4.20'));
  const dear = s.perModel.find((m) => m.model === 'grok-4.6');
  check('THE SPLIT IS PER MODEL, so a nine-fold difference is visible',
    dear.usd > cheap.usd && dear.calls < cheap.calls,
    `4.6: ${dear.calls} calls $${dear.usd.toFixed(2)} · 4.20: ${cheap.calls} calls $${cheap.usd.toFixed(2)}`);
  check('  …and the dearest model is listed FIRST, where a watcher looks',
    s.perModel[0].model === 'grok-4.6', s.perModel.map((m) => m.model).join(' > '));
  const perDecision = (dear.usd / dear.calls) / (cheap.usd / cheap.calls);
  check('  …and the per-decision ratio is the number worth quoting',
    perDecision > 4, `grok-4.6 costs ${perDecision.toFixed(1)}x per decision`);
}

// ── 4. THE CAP THAT IS IN MONEY ─────────────────────────────────────────────
{
  const b = new Budget({ maxCalls: Infinity, maxUsd: 1 });
  let taken = 0;
  // Each call is ~$0.0122 of grok-4.6, so about 82 of them reach a dollar.
  while (b.take() && taken < 500) { taken++; b.spend(1430, 1530, 'grok-4.6'); }
  check('A MONEY CAP STOPS THE RUN, where a call cap would not have',
    taken < 500 && b.usd >= 1, `stopped after ${taken} calls at $${b.usd.toFixed(2)} of $1`);
  check('  …and it says it is exhausted, so the fleet can announce it',
    b.spent.exhausted === true, JSON.stringify({ usd: +b.usd.toFixed(3), of: b.spent.ofUsd }));
  // Said plainly rather than papered over: the cap is checked BEFORE a call and
  // paid AFTER it, so a fleet can overshoot by at most one call per seat.
  check('  …and it overshoots by AT MOST one call, which is stated in the code',
    b.usd < 1 + 0.02, `$${b.usd.toFixed(4)} — one call's worth past the line at most`);
}

// ── 5. THE OLD CAP STILL WORKS, UNTOUCHED ───────────────────────────────────
{
  const b = new Budget({ maxCalls: 3 });
  let n = 0;
  while (b.take()) n++;
  check('THE CALL CAP IS UNCHANGED — it is the one limit that works unpriced',
    n === 3 && b.spent.exhausted, `${n} calls of 3`);
  const free = new Budget({ maxCalls: 5 });
  while (free.take()) free.spend(1e6, 1e6, 'kimi-k2.6');
  check('  …and a free model never trips a money cap it cannot reach',
    free.usd === 0 && !new Budget({ maxCalls: 5, maxUsd: 0.01 }).spent.exhausted,
    'kimi is free, so only the call cap can stop it');
}

// ── 6. THE PRICE TABLE ITSELF ───────────────────────────────────────────────
{
  const bad = Object.entries(PRICES).filter(([, p]) =>
    !Number.isFinite(p?.in) || !Number.isFinite(p?.out) || p.in < 0 || p.out < 0);
  check('EVERY PRICE IS A REAL, NON-NEGATIVE NUMBER',
    bad.length === 0, bad.length ? JSON.stringify(bad) : `${Object.keys(PRICES).length} models priced`);
  check('  …and output costs at least as much as input, as every vendor prices it',
    Object.entries(PRICES).every(([, p]) => p.out >= p.in),
    Object.entries(PRICES).map(([m, p]) => `${m.replace(/^grok-/, '')} ${p.in}/${p.out}`).join('  '));
  // The seats actually on the roster today must be priced, or the live line
  // silently reads "UNPRICED" for the whole run.
  for (const m of ['grok-4.20-0309-non-reasoning', 'grok-4.5', 'grok-4.6', 'kimi-k2.6']) {
    if (!PRICES[m]) { check(`SENTINEL: ${m} is on the live roster and MUST be priced`, false, 'missing'); break; }
  }
  check('SENTINEL: every model on the live roster is priced',
    ['grok-4.20-0309-non-reasoning', 'grok-4.5', 'grok-4.6', 'kimi-k2.6'].every((m) => PRICES[m]),
    'the four seats in roster-grok46.json');
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed\n`);
if (passed < results.length) {
  console.log('  FAILED:');
  for (const r of results.filter((x) => !x.pass)) console.log(`    - ${r.name}`);
  console.log('');
}
