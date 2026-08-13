// ── foodcheck.js ────────────────────────────────────────────────────────────
// Can a mind FEED ITSELF? Both halves of the chain, over a real socket.
//
//   npm run foodcheck
//
// THE RUN THAT CAUSED THIS FILE. Three models, 110 minutes, personas off:
// **635 decisions, 0 items picked up, 0 meals.** Two breaks, neither of them
// the model's fault, and both of them a MISSING CHANNEL rather than a bad
// decision:
//
//   1. `gather` could not hear the word "branch". 82 of 98 gather decisions
//      named it and every one was refused. The gate tested
//      `namesTheSame('branches', want)`, which matches on a word boundary — and
//      "branches" is not inside "branch". Singular went null, the deadfall was
//      never looked up, and a mind standing in a wood was told there was no
//      branch lying about.
//   2. No mind had a word for eating. `world.js` has honoured `intent.eat`
//      since agents got hands and the only setter in the codebase was a
//      KEYPRESS. A human could eat; a model could not say it wanted to.
//
// WHY A CHECK AND NOT A REPLY IN STATE.md. `nouncheck` was green over (1) the
// whole time — it proves `resolveItemId('branch') === 'wood'`, and it is right.
// The bug was that `gather`, the one caller that needed it, never called it.
// *A check green over a path no caller could reach*, which is the most repeated
// shape of wrong in this repo. So this file never asks whether a lookup works.
// It asks whether a MIND, holding the words a model actually typed, ends up
// with wood in its pack and food in its belly.
//
// ── THE CONFOUNDER, AND THE CONTROL ARM THAT RULES IT OUT ────────────────────
//
// `upkeep()` already eats BY REFLEX: a cooked meal below `eatBelow` (45), and
// raw below `eatRawBelow` (18). That is by design — a body whose mind is slow,
// absent or wrong still behaves like a competent animal — but it means a naive
// "did it eat" test passes for the wrong reason and proves nothing about the
// verb.
//
// So every body here is staged at **HUNGER=60**, above both thresholds, and
// carries RAW venison. The reflex cannot fire. Anything eaten was CHOSEN. And
// the second body is a control that is never given the goal: if it eats, the
// experiment is void and this file says so rather than crediting the verb.
//
// That is also the capability the verb actually adds. The reflex is
// deliberately conservative — it will not spend raw meat above 18 — so until
// now a mind that wanted to eat early, before a hunt or before the cold came
// on, had no way to overrule it. Now it does.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../src/net/agent.js';
import { ScriptedProvider, ModelProvider } from '../src/minds/providers.js';
import { makeRandom } from '../src/world/noise.js';
import { GOAL_IDS, sanitiseGoal, describeGoal } from '../src/minds/goals.js';
import { AGENTS, SURVIVAL } from '../src/config.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8147);
const URL = `ws://127.0.0.1:${PORT}`;

// Above `eatBelow` (45) and far above `eatRawBelow` (18), so no reflex can
// fire. Asserted below rather than trusted — if either constant is ever tuned
// past 60 this staging goes quietly meaningless, and a check that has stopped
// testing its own subject should fail loudly instead.
const HUNGER = 60;
const STOCK = 'venison:2';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n  Foodcheck — can a mind gather a branch and feed itself?\n');

// ── 1. THE VOCABULARY ───────────────────────────────────────────────────────
// Cheap, in-process, and it guards a trap that is easy to walk back into.

check('THERE IS A VERB FOR EATING AT ALL', GOAL_IDS.includes('eat'),
  GOAL_IDS.join(' '));

// THE TRAP. `sanitiseGoal` turns a goal whose every declared param is missing
// into `wander`. Give `eat` an "optional" item and a bare {"kind":"eat"} from a
// starving mind silently becomes a walk — the exact disease this verb was added
// to cure, reintroduced by a well-meant parameter. `params: []` is load-bearing.
const bare = sanitiseGoal({ kind: 'eat', why: 'I am starving' });
check('  …and a bare "eat" SURVIVES sanitising — it does not become a wander',
  bare?.kind === 'eat', JSON.stringify(bare));

check('  …and it keeps the reason, so a watcher can read why it ate',
  bare?.why === 'I am starving', String(bare?.why));

check('  …and it reads as English for the board', describeGoal(bare) === 'eat the best thing in your pack',
  describeGoal(bare));

// ── THE SAME TRAP, ON THE VERB THAT ALREADY HAD IT ──
//
// Declaring `item` on `gather` made the noun compulsory as a side effect, so a
// bare {"kind":"gather"} fell into the rule above and became `wander` with a
// refusal — the plainest possible way to say "pick something up", and what
// every mind sent for the whole life of the project before the noun existed.
// Found by this file; it is the third distinct way that one parameter created
// to answer `gather` badly, after the word "none" and the singular "branch".
const bareGatherGoal = sanitiseGoal({ kind: 'gather', why: 'need firewood' });
check('A BARE "gather" IS STILL A GATHER — an optional noun must not become a compulsory one',
  bareGatherGoal?.kind === 'gather', JSON.stringify(bareGatherGoal));

// The other side of it: a verb whose parameter is genuinely required must still
// be caught, or the exemption above has quietly disarmed the whole rule.
const emptyHunt = sanitiseGoal({ kind: 'hunt' });
check('  …but a verb that GENUINELY needs its parameter is still caught — hunt with no quarry',
  emptyHunt?.kind === 'wander' && !!emptyHunt?.refused, JSON.stringify(emptyHunt));

// The prompt is the only place a model learns the vocabulary exists. A verb
// nobody is told about is a verb nobody uses, and that is indistinguishable in
// a run report from a verb nobody wanted.
const prompt = ModelProvider.prototype.systemPrompt.call({ character: null });
const lines = Array.isArray(prompt) ? prompt : String(prompt).split('\n');
const verbLine = lines.find((l) => String(l).startsWith('Verbs:')) ?? '';
check('THE PROMPT TELLS A MODEL THE VERB EXISTS', /\beat\b/.test(verbLine),
  verbLine.slice(0, 96));
check('  …and says it takes no parameters, so nobody sends an item and loses it',
  lines.some((l) => /^eat takes nothing/.test(String(l))),
  lines.find((l) => /^eat takes/.test(String(l))) ?? 'NO LINE ABOUT eat');

// The staging is only meaningful if it really is above both reflex thresholds.
check('SENTINEL: the staged hunger is above BOTH reflex thresholds, so nothing here can eat by reflex',
  HUNGER > AGENTS.eatBelow && HUNGER > AGENTS.eatRawBelow,
  `staged ${HUNGER} · eatBelow ${AGENTS.eatBelow} · eatRawBelow ${AGENTS.eatRawBelow}`);

// ── 2. A REAL SERVER, AND TWO REAL BODIES ───────────────────────────────────

await requireFreePort(PORT, 'foodcheck');
const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
  env: {
    ...process.env,
    DANGER: 'none',          // nothing may eat the subject mid-experiment
    MINDS_HUNTERS: '0',      // no server-side minds competing for the deadfall
    HUNGER: String(HUNGER),
    STOCK,
  },
  stdio: 'ignore',
});
const stop = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stop);

// ── AN AGENT DOES NOT TICK ITSELF ───────────────────────────────────────────
//
// `connect()` opens the socket and starts nothing. `update(dt)` is driven from
// OUTSIDE, by the `setInterval` in `agents.js`, and every existing agent check
// gets away with not knowing that because none of them needed a body to act —
// they read memory, or events, or call `resolve` directly.
//
// The first cut of this file was one of those and it read a flat zero: no
// meals, no refusals, nothing. It looked exactly like "the eat verb does not
// work" and it was the harness not turning the handle. INSTRUMENT, DO NOT
// GUESS, and check your instrument before believing it — `upkeep` and `resolve`
// were counted and both were called zero times, which is what gave it away.
//
// Same step as the fleet: 1/30, the rate a real agent actually runs at.
const STEP = 1 / 30;
async function run(bodies, seconds, each = null) {
  const ticks = Math.round(seconds / STEP);
  for (let n = 0; n < ticks; n++) {
    for (const b of bodies) b.update(STEP);
    each?.(n);
    await sleep(STEP * 1000);
  }
}

/** A real agent on a real socket. Retried: a fresh server is not listening yet. */
async function body(name, seed) {
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    const a = new Agent({
      name, rand: makeRandom(seed), provider: new ScriptedProvider(makeRandom(`${seed}p`)),
    });
    const ok = await a.connect(URL).then(() => a).catch(() => null);
    if (ok) return ok;
  }
  throw new Error(`no server answered on ${URL}`);
}

try {
  const eater = await body('Mairi', 'eater');
  const control = await body('Seonag', 'control');
  await sleep(900); // let a snapshot or two arrive, so `me.f` and `me.iv` are real

  const staged = eater.food === HUNGER && eater.count('venison') === 2;
  check('two bodies on one server, staged hungry-but-not-starving, carrying raw meat',
    staged, `Mairi: hunger ${eater.food}, venison ${eater.count('venison')}`);

  // ── 3. THE MEAL ───────────────────────────────────────────────────────────
  const beforeFood = eater.food;
  const beforeMeat = eater.count('venison');

  // Through `sanitiseGoal`, never built by hand. `lootcheck` was green for
  // months over a path no caller could reach because it hand-built its goal and
  // therefore never went through the door a real decision comes through.
  const wantsToEat = sanitiseGoal({ kind: 'eat', why: 'before the light goes' });

  // Held steady rather than set once: the scripted brain deliberates on its own
  // cadence and would replace the goal underneath us. `retarget = 0` forces the
  // resolve this tick instead of up to `retargetSeconds` later.
  // BOTH bodies tick, so the control is under identical conditions and the only
  // difference between them is the goal. `retarget = 0` forces the resolve this
  // tick rather than up to `retargetSeconds` later.
  let ate = false;
  await run([eater, control], 2.5, () => {
    if (ate) return;
    eater.goal = wantsToEat;
    eater.retarget = 0;
    ate = eater.count('venison') < beforeMeat;
  });

  check('A MIND THAT SAYS "eat" ACTUALLY EATS — the meat leaves the pack',
    ate, `venison ${beforeMeat} -> ${eater.count('venison')}`);

  await sleep(300); // the fed hunger comes back on the next snapshot, at 20 Hz
  check('  …and the belly says so, on the server\'s own snapshot',
    eater.food > beforeFood, `hunger ${beforeFood} -> ${eater.food}`);

  // ── ONE DECISION IS ONE MEAL ──────────────────────────────────────────────
  // The goal persists and re-resolves every `retargetSeconds`, so without a
  // swallow timer a single "eat" pulses again and again and empties the pack
  // before the mind's next thought. First measured right here: venison 2 -> 0
  // in two and a half seconds. It is the reflex's old "two steaks, most of a
  // deer wasted" bug arriving by the other door.
  check('  …and ONE decision is ONE meal — the pack is not emptied in a heartbeat',
    eater.count('venison') === beforeMeat - 1,
    `venison ${beforeMeat} -> ${eater.count('venison')} · swallow ${AGENTS.swallowSeconds}s`);

  // ── 3b. AND THE MEAL IS VISIBLE, WHICH IS A SEPARATE QUESTION ─────────────
  //
  // On the night the verb shipped it worked and left NO TRACE: a chosen meal
  // wrote no deed, so the board could not show it and the report could not
  // count it, and the only way to answer "has any mind chosen to eat?" was to
  // read the raw goal history by hand. A verb nobody can see used is
  // indistinguishable from a verb nobody wanted — which is the exact confusion
  // `playreport` exists to prevent.
  const meals = eater.deeds.filter((d) => d.what === 'eat');
  check('THE CHOSEN MEAL IS ON THE RECORD — one deed, not zero and not two',
    meals.length === 1, `${meals.length} eat deeds: ${meals.map((m) => m.text).join(' | ')}`);

  check('  …and it says a MIND chose it, not that a reflex fired',
    meals[0]?.by === 'choice' && /^I chose to eat/.test(meals[0]?.text ?? ''),
    `by=${meals[0]?.by} text="${meals[0]?.text}"`);

  check('  …and it names what went down and how much it filled',
    meals[0]?.id === 'venison' && meals[0]?.filled > 0,
    `id=${meals[0]?.id} filled=${meals[0]?.filled}`);

  // ── 4. THE CONTROL ARM ────────────────────────────────────────────────────
  // Same stock, same hunger, same server, never given the goal. If this body
  // ate too then the reflex did it and everything above is worthless.
  check('THE CONTROL DID NOT EAT — so the meal above was the VERB and not the reflex',
    control.count('venison') === 2 && control.food === HUNGER,
    `Seonag: venison ${control.count('venison')}, hunger ${control.food}`);

  // ── 5. THE REFUSAL ────────────────────────────────────────────────────────
  // `world.js` resolves `eat` against the pack and does nothing whatever when
  // the pack is empty — silently, which is the disease behind half this repo's
  // trap list. A mind that reaches for food it does not have must be TOLD.
  //
  // Resolved SYNCHRONOUSLY rather than over a few ticks, and that is not
  // laziness. The first cut emptied `carrying` and then ticked — and a snapshot
  // lands at 20 Hz and puts the venison straight back, so the body was never
  // empty-handed when it was asked and the check failed for a reason that had
  // nothing to do with the refusal. Nothing can interleave inside these four
  // lines, so the pack is empty at the only moment that matters.
  control.carrying = {};              // the pack the server last reported, emptied
  control.outcomes = [];
  control.refusedVerbs = {};
  control.eatCooling = 0;             // not mid-swallow, or it declines to answer at all
  const hungryTarget = control.resolve(sanitiseGoal({ kind: 'eat' }));
  const said = control.drainOutcomes().join(' | ');

  check('  …and an empty-handed "eat" resolves to nothing at all, rather than a walk',
    hungryTarget === null, JSON.stringify(hungryTarget));
  check('A MIND WITH AN EMPTY PACK IS TOLD SO, rather than silently doing nothing',
    /nothing in your pack/.test(said), said || '(SILENCE — nothing was said)');
  check('  …and the refusal is counted, so a run report can tell "refused" from "never wanted"',
    (control.refusedVerbs?.eat ?? 0) > 0, JSON.stringify(control.refusedVerbs ?? {}));

  // ── 5b. THE SENTINEL: A PRESS THE WORLD IGNORED IS NOT A MEAL ─────────────
  //
  // The reason the deed moved to `noteMeal` at all. `World.update` drops an eat
  // in SILENCE when the pack holds nothing edible or the belly is already at
  // 100, and the old code wrote the deed where the button was pressed — so a
  // body pressing at nothing read, in the report and on the board, as a body
  // eating. Exactly the bug `noteMake` was written to fix for crafting, one
  // method away, three months earlier.
  //
  // Driven straight at `notePack` because that is the seam the lie crossed: a
  // pack that did not change and a belly that did not rise must produce no deed
  // no matter how loudly the body asked.
  const before = control.deeds.length;
  control._mealAskedBy = 'choice';                  // it asked, as loudly as it can
  control.notePack({ ...control.carrying }, control.food); // ...and nothing happened
  check('SENTINEL: an eat the world ignored writes NO deed — a press is not a meal',
    control.deeds.length === before,
    `${control.deeds.length - before} deed(s) appeared from a snapshot where nothing changed`);

  // ── AND THE SENTINEL THAT COST A WRONG HEADLINE: A RESPAWN IS NOT A MEAL ──
  //
  // The first cut of `noteMeal` reported ANY rise in hunger, reasoning that the
  // belly is the fact and the item name is a convenience. Then two seats
  // STARVED TO DEATH in the 2026-08-12 run and the board announced `I ate
  // something` for both: `Body.revive()` calls `reset()`, which sets hunger to
  // `SURVIVAL.hungerStart` — 85, the fullest belly in the game. A death was
  // reported as dinner, and the run was briefly written up as a recovery.
  //
  // A meal now needs BOTH halves. This drives the exact shape of that bug: the
  // belly leaps by a full `hungerStart` and NOTHING leaves the pack.
  const before2 = control.deeds.length;
  control._mealAskedBy = null;
  control.notePack({ ...control.carrying }, control.food - SURVIVAL.hungerStart);
  check('SENTINEL: a RESPAWN is not a meal — a belly that rose with nothing leaving the pack',
    control.deeds.length === before2,
    `${control.deeds.length - before2} deed(s) from a hunger reset of +${SURVIVAL.hungerStart}`);

  // ...while a real meal with nobody owning the ask IS still reported, because
  // the pack says it happened. Both halves, or the rule is just "trust nothing".
  const before2b = control.deeds.length;
  control.carrying = { venison_cooked: 2 };
  control._mealAskedBy = null;
  control.notePack({ venison_cooked: 1 }, control.food - 14);
  const orphan = control.deeds[control.deeds.length - 1];
  check('  …but an unowned meal that DID leave the pack is still reported',
    control.deeds.length === before2b + 1 && orphan?.what === 'eat' && orphan?.id === 'venison_cooked',
    `${orphan?.text ?? 'no deed'} (filled ${orphan?.filled})`);

  // ── 5c. COOK THEN EAT, WHICH IS THE COMMON CASE AND NEARLY GOT SWALLOWED ──
  //
  // `notePack` gives a craft a suppression window: for `makeOwnsPackFor` after
  // a cook, every change to the pack belongs to the make, so a cooked steak is
  // not announced as something found lying about. Sound rule — and a meal
  // landing inside that window would have vanished into it.
  //
  // Not hypothetical. In the first live run to ever complete the chain, Eachann
  // cooked and ate inside the same recorded second. So `noteMeal` runs ABOVE
  // the window, and this holds it there.
  const before3 = control.deeds.length;
  control.carrying = { venison_cooked: 2 };
  control._made = 1;                      // a craft owns the pack right now
  control._mealAskedBy = 'reflex';
  control.notePack({ venison_cooked: 1 }, control.food - 9);
  const inWindow = control.deeds[control.deeds.length - 1];
  check('A MEAL INSIDE THE CRAFT WINDOW IS STILL REPORTED — cook-then-eat is the common case',
    control.deeds.length === before3 + 1 && inWindow?.what === 'eat',
    inWindow?.text ?? 'the make window swallowed the meal');
  control._made = 0;

  // ── 5d. A REFUSAL IS ONE PER DECISION, NOT ONE PER RETARGET ───────────────
  //
  // A goal STANDS and `act()` re-resolves it every `retargetSeconds`, so one
  // decision refused itself over and over. Measured live: Eachann finished on
  // gather=73 against 50 decisions WHILE HOLDING 16 BRANCHES HE HAD PICKED UP.
  // A count larger than the decisions it describes, contradicting the outcome
  // beside it, reads as a broken verb — and `gather` was working.
  control.refusedVerbs = {};
  control._refusedAt = {};
  control.decisions = 100;
  for (let i = 0; i < 12; i++) control.refuse('gather', 'there is no flint lying about that you can see');
  const oneDecision = control.refusedVerbs.gather;
  control.decisions = 101;
  control.refuse('gather', 'there is no flint lying about that you can see');
  check('TWELVE RETARGETS OF ONE STANDING GOAL COUNT ONCE — the tally is per decision',
    oneDecision === 1, `12 refusals inside one decision counted as ${oneDecision}`);
  check('  …and the NEXT decision counts again, so a stuck mind is still visible',
    control.refusedVerbs.gather === 2, `after a second decision: ${control.refusedVerbs.gather}`);
  // Drained ONCE into a variable. The first cut called `drainOutcomes()` in the
  // assertion and again in the detail — and the second call returns empty,
  // because draining is what the method is for. It passed, with an evidence
  // line reading "the brief said nothing". A green check whose own evidence
  // contradicts it is worse than a red one: CHECK YOUR INSTRUMENT.
  const heard = control.drainOutcomes().join(' | ');
  check('  …while the mind itself still hears it every time, coalesced',
    /1[23] times/.test(heard), heard || 'the brief said nothing');

  // ── 6. THE WORD THE MODELS ACTUALLY TYPED ─────────────────────────────────
  // 82 of 98 gather decisions in the hour run said "branch". Every spelling a
  // model has been recorded using has to reach the firewood — asserted on a
  // LIVE agent with real coordinates in a real world, not on a fixture.
  const SPELLINGS = ['branch', 'branches', 'a branch', 'some branches', 'wood', 'the branches'];
  const reached = [];
  const missed = [];
  for (const word of SPELLINGS) {
    eater.taken.clear();
    const t = eater.resolve(sanitiseGoal({ kind: 'gather', item: word }));
    // A deadfall target uses its hands and carries the pickup key. `roam()`
    // returns a bare point with no `act`, which is what every one of those 82
    // refusals actually produced.
    (t?.act === 'interact' ? reached : missed).push(word);
  }
  check('EVERY SPELLING OF FIREWOOD REACHES THE WOOD — including the singular that failed 82 times',
    missed.length === 0, missed.length ? `STILL REFUSED: ${missed.join(', ')}` : `${reached.length}/${SPELLINGS.length}: ${reached.join(', ')}`);

  // The sentinel. The fix widens what matches; it must not make `gather`
  // deaf — a word for a thing that does not exist still has to be refused,
  // or "gather flint" quietly becomes "gather anything" and the noun is noise.
  eater.taken.clear();
  eater.refusedVerbs = {};
  eater.outcomes = [];
  const nonsense = eater.resolve(sanitiseGoal({ kind: 'gather', item: 'flint' }));
  check('SENTINEL: a thing that does not exist is still refused, so the noun still means something',
    nonsense?.act !== 'interact' && (eater.refusedVerbs?.gather ?? 0) > 0,
    eater.drainOutcomes().join(' | ') || 'no refusal was spoken');

  // And a bare gather — no noun at all — must still work, because that is what
  // every mind sent for the life of the project before the noun existed.
  eater.taken.clear();
  const bareGather = eater.resolve(sanitiseGoal({ kind: 'gather' }));
  check('  …and a bare "gather" with no noun still finds something to pick up',
    bareGather?.act === 'interact', JSON.stringify(bareGather ?? null));

  eater.close?.();
  control.close?.();
  await sleep(200);
} finally {
  stop();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed\n`);
if (passed < results.length) {
  console.log('  FAILED:');
  for (const r of results.filter((x) => !x.pass)) console.log(`    - ${r.name}`);
  console.log('');
}
