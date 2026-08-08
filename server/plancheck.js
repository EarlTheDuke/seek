// ── plancheck.js ────────────────────────────────────────────────────────────
// Can a mind hold an intention longer than one decision?
//
//   npm run plancheck
//
// THE CASE THAT CAUSED THIS FILE, verbatim from a run on 2026-08-08:
//
//   Coinneach 13.94h  go toward Eachann  |  offer branches for some of that meat
//
// A mind worked out that it had firewood and no meat, that the other had meat,
// and that a barter resolved both. It said so in plain English. Then it chose
// step one — walk over — and step two existed only in the `why` field, which is
// never handed back. By the next decision the plan was gone. It never offered.
//
// `plan` and `note` are the only two fields in the brief a mind writes for
// itself. The world never reads them and never acts on them; they exist purely
// so an intention can outlive the decision that formed it.
//
// THE ASSERTION THAT CARRIES THIS FILE IS "OMITTED MEANS KEEP". `undefined` and
// `[]` have to mean different things, because a decision that simply does not
// mention the plan must not destroy it — if it did, a plan would live exactly
// as long as a goal did and nothing would have been fixed.

import { Agent } from '../src/net/agent.js';
import { ScriptedProvider } from '../src/minds/providers.js';
import { sanitiseGoal } from '../src/minds/goals.js';
import { briefToText } from '../src/minds/perception.js';
import { makeRandom } from '../src/world/noise.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loneAgent() {
  const a = new Agent({
    name: 'Coinneach',
    provider: new ScriptedProvider(makeRandom('p')),
    rand: makeRandom('b'),
  });
  a.hours = 12;
  a._x = 0; a._y = 0; a._z = 0;
  a.health = 100; a.food = 60;
  a.carrying = { bow: 1, wood: 20 };
  a.snapshot = { pl: [], cr: [], c: 12, w: { s: 'clear' } };
  return a;
}

/** One real decision, through the only path a decision ever takes. */
async function decide(agent, answer) {
  agent.provider = { decide: async () => answer, lastTokensIn: 0, lastTokensOut: 0 };
  agent.deliberate();
  for (let i = 0; i < 50 && agent.thinking; i++) await sleep(10);
}

async function main() {
  console.log('\n  Can a mind hold an intention longer than one decision?\n');

  // ── the door ─────────────────────────────────────────────────────────────
  {
    const g = sanitiseGoal({
      kind: 'goTo', place: 'the loch',
      plan: ['get meat', 'trade wood to Eachann for some', 'camp at Hollowed Beinn'],
      note: 'Eachann drives a hard bargain. Do not take his first price.',
    });
    check('a plan and a note survive the door',
      g?.plan?.length === 3 && /hard bargain/.test(g.note ?? ''),
      JSON.stringify(g));

    const long = sanitiseGoal({ kind: 'wander', plan: ['a', 'b', 'c', 'd', 'e'] });
    check('  …and a plan is capped at three lines',
      long.plan.length === 3, `${long.plan.length} lines`);

    const junk = sanitiseGoal({ kind: 'wander', plan: 'not a list', note: 42 });
    check('  …and rubbish in either field is simply absent, not crashed on',
      junk.plan === undefined && junk.note === undefined,
      JSON.stringify(junk));
  }

  // ── THE ASSERTION THAT CARRIES THE FILE ──────────────────────────────────
  {
    const a = loneAgent();
    await decide(a, { kind: 'goTo', place: 'Eachann', plan: ['walk over', 'offer branches for meat'] });
    check('A PLAN IS SET',
      a.plan.length === 2 && /offer branches/.test(a.plan[1]), JSON.stringify(a.plan));

    // The decision that killed the barter: step one taken, plan not restated.
    await decide(a, { kind: 'hunt', quarry: 'a deer', why: 'meat' });
    check('OMITTED MEANS KEEP — the plan survives a decision that never mentions it',
      a.plan.length === 2 && /offer branches/.test(a.plan[1]),
      JSON.stringify(a.plan) + ' — this is the whole point of the field');

    await decide(a, { kind: 'wander', plan: [] });
    check('  …and an explicit empty list clears it',
      a.plan.length === 0, JSON.stringify(a.plan));
  }

  // ── the same rule for the page ───────────────────────────────────────────
  {
    const a = loneAgent();
    await decide(a, { kind: 'wander', note: 'Eachann owes me three branches.' });
    await decide(a, { kind: 'hunt', quarry: 'a deer' });
    check('A NOTE SURVIVES A DECISION THAT NEVER MENTIONS IT',
      /owes me three branches/.test(a.note), JSON.stringify(a.note));
    await decide(a, { kind: 'wander', note: '' });
    check('  …and an explicit empty string clears it',
      a.note === '', JSON.stringify(a.note));
  }

  // ── it has to reach the model, or none of it matters ─────────────────────
  {
    const a = loneAgent();
    await decide(a, {
      kind: 'goTo', place: 'the loch',
      plan: ['get meat', 'trade wood for some'],
      note: 'Eachann drives a hard bargain.',
    });
    const b = a.brief();
    check('the plan is in the brief',
      b.plan?.length === 2 && b.note === 'Eachann drives a hard bargain.',
      JSON.stringify({ plan: b.plan, note: b.note }));

    const text = briefToText(b);
    check('  …and in the PROSE the model actually reads',
      /Your plan:[\s\S]*1\. get meat[\s\S]*2\. trade wood for some/.test(text)
        && /Your notes: Eachann drives a hard bargain\./.test(text),
      text.split('\n').filter((l) => /plan|notes|^\s+\d\./.test(l)).join(' | '));

    check('  …and it comes AFTER the current intention, which is what it belongs with',
      text.indexOf('Your current intention') < text.indexOf('Your plan:'),
      'here is what you are doing / here is what comes next — one thought');
  }

  // ── the SENTINEL: a mind that never writes one has neither ───────────────
  {
    const a = loneAgent();
    await decide(a, { kind: 'wander' });
    const b = a.brief();
    check('SENTINEL: a mind that never wrote a plan has none',
      (b.plan ?? []).length === 0 && !b.note,
      'so the assertions above are about the field being carried, not defaulted');
    check('  …and neither appears in its prompt',
      !/Your plan:|Your notes:/.test(briefToText(b)),
      'an empty section is noise in every prompt for ever');
  }

  // ── and none of it may cost a mind its goal ──────────────────────────────
  {
    const a = loneAgent();
    await decide(a, { kind: 'hunt', quarry: 'a deer' });
    await decide(a, { kind: 'hunt', quarry: 'a deer', plan: ['keep hunting'], note: 'hungry' });
    check('writing a plan does not disturb what the mind is doing',
      a.goal?.kind === 'hunt' && a.goal?.quarry === 'a deer',
      `${a.goal?.kind} ${a.goal?.quarry}`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  plancheck could not run: ${err.stack}\n`);
  process.exit(1);
});
