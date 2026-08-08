// ── feedbackcheck.js ────────────────────────────────────────────────────────
// Is a mind ever told what its own last action did?
//
//   npm run feedbackcheck
//
// THE RUN THAT CAUSED THIS FILE. Seven hours on 2026-08-08 produced five
// separate pathologies which all turned out to be one bug wearing five hats:
//
//   94 fires laid, five inside 20 s   never told "there is already a fire here"
//   400+ draws, no arrow released     never told "that shot was refused"
//   an hour hunting on an empty bow   never told "you have no arrows"
//   one sentence said three times     never told "you said that already"
//
// `brief()` described the world's PRESENT STATE and said nothing about the
// consequences of the mind's own last action. A mind got senses and no
// outcomes — and an action that returns no signal cannot be told apart from one
// that did nothing, so it happens again.
//
// The measured nuance, which the fix has to respect: THE MODELS WERE NOT THE
// ONES REPEATING. Across 142 logged decisions, 0% were identical to the
// previous one — not even the opening verb. The repetition was in the BODY, one
// standing goal driving the same action every tick. So this file asserts BOTH
// halves: the body now refuses the impossible act, and the mind is told in
// words that it was refused.

import { Agent } from '../src/net/agent.js';
import { ScriptedProvider } from '../src/minds/providers.js';
import { briefToText } from '../src/minds/perception.js';
import { sanitiseGoal } from '../src/minds/goals.js';
import { makeRandom } from '../src/world/noise.js';
import { AGENTS } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** An agent with a body, off the wire — this is about the brief, not the net. */
function loneAgent(carrying = {}) {
  const a = new Agent({
    name: 'Mairi',
    provider: new ScriptedProvider(makeRandom('p')),
    rand: makeRandom('b'),
  });
  a.hours = 12;
  a._x = 0; a._y = 0; a._z = 0;
  a.health = 100;
  a.food = 60;
  a.carrying = carrying;
  a.snapshot = { pl: [], cr: [], c: 12, w: { s: 'clear' } };
  return a;
}

function main() {
  console.log('\n  Is a mind ever told what its own last action did?\n');

  // ── the channel exists at all ────────────────────────────────────────────
  {
    const a = loneAgent();
    a.noteOutcome('you laid a fire');
    const b = a.brief();
    check('an outcome reaches the brief', b.outcome?.includes('you laid a fire'),
      JSON.stringify(b.outcome));
    check('  …and reaches the PROSE the model actually reads',
      /Since your last decision:[\s\S]*you laid a fire/.test(briefToText(b)),
      briefToText(b).split('\n').find((l) => l.includes('laid a fire')) ?? 'absent');
  }

  // ── seen exactly once, which is the whole discipline ─────────────────────
  {
    const a = loneAgent();
    a.noteOutcome('you laid a fire');
    const first = a.brief().outcome.slice();
    a.drainOutcomes(); // what deliberate() does
    const second = a.brief().outcome.slice();
    check('AN OUTCOME IS READ ONCE, then gone',
      first.length === 1 && second.length === 0,
      `${first.length} then ${second.length}`);
  }

  // ── four fires between two thoughts is one line and a count ──────────────
  {
    const a = loneAgent();
    for (let i = 0; i < 4; i++) a.noteOutcome('you laid a fire');
    const out = a.brief().outcome;
    check('four of the same act collapse into one line with a count',
      out.length === 1 && /4 times/.test(out[0]), JSON.stringify(out));
  }

  // ── and it cannot itself become the flood it was built to cure ───────────
  {
    const a = loneAgent();
    for (let i = 0; i < AGENTS.outcomesKept * 4; i++) a.noteOutcome(`thing ${i}`);
    check('the outcome list is capped',
      a.brief().outcome.length <= AGENTS.outcomesKept,
      `${a.brief().outcome.length} lines, cap ${AGENTS.outcomesKept}`);
  }

  // ── THE EMPTY QUIVER, from both sides ────────────────────────────────────
  {
    const a = loneAgent({ bow: 1, arrow: 0 });
    const b = a.brief();
    check('AN EMPTY QUIVER IS STATED, not left as a gap in a list',
      b.lacking?.some((l) => /no arrows/.test(l)), JSON.stringify(b.lacking));
    check('  …and it is in the prose',
      /no arrows/.test(briefToText(b)),
      briefToText(b).split('\n').find((l) => /no arrows/.test(l)) ?? 'absent');

    // The BODY half: it must stop miming the shot. This is the loop that ran
    // 400+ times in half an hour with nothing leaving the string.
    a.target = { x: 20, y: 0, z: 0, id: 7 };
    const i = { primary: false };
    a.act_shoot(0.1, i);
    check('  …and the body REFUSES TO DRAW on an empty quiver',
      i.primary === false, `primary=${i.primary}`);
    check('  …and says so, so the mind can do something about it',
      a.outcomes.some((o) => /quiver is empty/.test(o.text)),
      JSON.stringify(a.outcomes.map((o) => o.text)));
  }

  // ── the SENTINEL: a full quiver says none of that ────────────────────────
  {
    const a = loneAgent({ bow: 1, arrow: 12, wood: 5, venison_cooked: 1 });
    const b = a.brief();
    check('SENTINEL: a stocked pack reports nothing lacking',
      (b.lacking ?? []).length === 0,
      JSON.stringify(b.lacking));
    check('  …so the assertions above are about being empty, not about the field',
      b.carrying.some((c) => /arrow/.test(c)), JSON.stringify(b.carrying));
  }

  // ── no firewood, and no food ─────────────────────────────────────────────
  {
    const a = loneAgent({ bow: 1, arrow: 3 });
    const b = a.brief();
    check('no firewood is stated',
      b.lacking.some((l) => /no firewood/.test(l)), JSON.stringify(b.lacking));
    check('  …and so is an empty larder',
      b.lacking.some((l) => /no food/.test(l)), JSON.stringify(b.lacking));
  }

  // ── every deed reports itself, for free ──────────────────────────────────
  {
    const a = loneAgent();
    a.did('gather', 'I picked up 4 branches');
    check('a deed is an outcome without anybody wiring it up',
      a.brief().outcome.includes('I picked up 4 branches'),
      JSON.stringify(a.brief().outcome));
  }

  // ── the ordering that makes it useful ────────────────────────────────────
  {
    const a = loneAgent({ bow: 1, arrow: 0 });
    a.noteOutcome('you laid a fire');
    const text = briefToText(a.brief());
    const outcomeAt = text.indexOf('Since your last decision');
    const worldAt = text.indexOf('You are aware of');
    check('outcomes come BEFORE the world in the prompt',
      outcomeAt >= 0 && worldAt >= 0 && outcomeAt < worldAt,
      `outcome at ${outcomeAt}, world at ${worldAt} — the world reads the same ` +
      'whether the last decision did anything, so the outcome has to come first');
  }

  // ── SILENT DEGRADATION, WHICH WAS THE ONE PLACE THIS WAS NOT FIXED ──
  //
  // Two paths, both previously invisible: a goal missing its parameter became
  // `wander` inside `sanitiseGoal`, and a target name not in the brief became
  // `roam()` inside `resolve`. In both cases the mind chose something, the world
  // did something else, and nothing told it.
  //
  // The COUNTER matters as much as the sentence. Six of fifteen verbs went
  // unused across two days of runs with no way to tell "reached for and
  // refused" from "never wanted" — completely different findings about a model,
  // and only one of them is the model's fault.
  {
    const g = sanitiseGoal({ kind: 'hunt', why: 'hungry' }); // no quarry
    check('A GOAL MISSING ITS PARAMETER SAYS SO instead of quietly wandering',
      g.kind === 'wander' && /"hunt" needs quarry/.test(g.refused ?? ''),
      JSON.stringify(g));

    const ok = sanitiseGoal({ kind: 'hunt', quarry: 'a deer' });
    check('  …and the SENTINEL: a well-formed goal is refused nothing',
      ok.kind === 'hunt' && ok.refused === undefined, JSON.stringify(ok));
  }

  {
    const a = loneAgent({ bow: 1, arrow: 5 });
    a.resolve({ kind: 'offer', target: 'Somebody Absent', item: 'wood', want: 'meat' });
    check('A NAME NOBODY HAS IS REPORTED, not silently roamed',
      a.outcomes.some((o) => /nobody called "Somebody Absent"/.test(o.text)),
      JSON.stringify(a.outcomes.map((o) => o.text)));
    check('  …and it is COUNTED, so a refused verb stops looking like an unwanted one',
      a.refusedVerbs?.offer === 1, JSON.stringify(a.refusedVerbs));

    a.resolve({ kind: 'attack', target: 'Somebody Absent' });
    a.resolve({ kind: 'accept', target: 'Somebody Absent' });
    a.resolve({ kind: 'follow', target: 'Somebody Absent' });
    check('  …for every social verb, not just the one that was checked',
      a.refusedVerbs.attack === 1 && a.refusedVerbs.accept === 1 && a.refusedVerbs.follow === 1,
      JSON.stringify(a.refusedVerbs));
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
