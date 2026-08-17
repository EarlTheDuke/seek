// ── craftcheck.js ───────────────────────────────────────────────────────────
// Can a mind ARM ITSELF? Over a real socket, asserting the pack.
//
//   npm run craftcheck
//
// THE TWO RUNS THAT CAUSED THIS FILE, both 2026-08-12. Every starving seat in
// both was a seat that could not shoot, and the arrow economy was closed to
// minds three separate ways:
//
//   0a. THERE WAS NO VERB. Fifteen goals and not one of them made anything.
//       Fingal asked the others out loud, twice — "Who has arrows? Need arrows
//       by dawn" — while carrying six wood, which is three fletches.
//   0b. A MISDIAGNOSIS, KEPT HERE BECAUSE THE SENTINEL BELOW CAUGHT IT. I read
//       `fletch_arrows` as station-less and shipped a branch for it. EVERY
//       recipe carries `requires: 'fire'`, arrows included — the diagnostic
//       that said otherwise printed `r.station`, a field that does not exist,
//       and reported "none" for all six. The first assertion in this file now
//       pins the truth so nobody rebuilds that fix.
//   0c. A STARVING BODY WOULD NOT SPEND FIRE-WOOD ON ARROWS. `spareWood` (14)
//       reserves ten branches for a fire. Sound about cold, silent about
//       hunger — so a body starved holding the cure.
//
// WHAT THIS ASSERTS, and it is deliberately not "did it press craft": arrows
// ARRIVING IN THE PACK, on the server's own snapshot, with no fire anywhere.
// `lootcheck` was green for months over a path no caller could reach because it
// built its goal by hand; nothing here does — every goal goes through
// `sanitiseGoal`, the same door a real decision comes through.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../src/net/agent.js';
import { ScriptedProvider, ModelProvider } from '../src/minds/providers.js';
import { makeRandom } from '../src/world/noise.js';
import { GOAL_IDS, sanitiseGoal, describeGoal } from '../src/minds/goals.js';
import { AGENTS, SURVIVAL } from '../src/config.js';
import { RECIPES } from '../src/items/recipes.js';
import { requireFreePort } from './freeport.js';
import { briefToText } from '../src/minds/perception.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8151);
const URL = `ws://127.0.0.1:${PORT}`;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n  Craftcheck — can a mind arm itself?\n');

// ── 1. THE VOCABULARY ───────────────────────────────────────────────────────
check('THERE IS A VERB FOR MAKING THINGS AT ALL', GOAL_IDS.includes('craft'), GOAL_IDS.join(' '));

// The trap `gather` fell into for a day: declaring a param makes it compulsory,
// and `sanitiseGoal` turns an all-params-missing goal into `wander`.
const bare = sanitiseGoal({ kind: 'craft', why: 'need arrows' });
check('  …and a bare "craft" survives sanitising — it does not become a wander',
  bare?.kind === 'craft', JSON.stringify(bare));
check('  …and reads as English for the board', describeGoal(bare) === 'make something useful',
  describeGoal(bare));
check('  …and a named one keeps its noun',
  sanitiseGoal({ kind: 'craft', thing: 'arrows' })?.thing === 'arrows',
  JSON.stringify(sanitiseGoal({ kind: 'craft', thing: 'arrows' })));

const prompt = ModelProvider.prototype.systemPrompt.call({ character: null });
const lines = Array.isArray(prompt) ? prompt : String(prompt).split('\n');
const verbLine = lines.find((l) => String(l).startsWith('Verbs:')) ?? '';
check('THE PROMPT TELLS A MODEL THE VERB EXISTS', /\bcraft\b/.test(verbLine), verbLine.slice(0, 92));
// It must also tell them the TRUE cost. The first version of this line said
// "arrows need no fire", which was my misdiagnosis reaching the models
// themselves — a prompt that lies is worse than a prompt that omits.
check('  …and tells them the truth about the cost: everything needs a fire',
  lines.some((l) => /^craft takes/.test(String(l))) && lines.some((l) => /needs a fire in reach/.test(String(l))),
  lines.find((l) => /needs a fire in reach/.test(String(l))) ?? 'NO LINE SAYING A FIRE IS NEEDED');

// THE SENTINEL THAT CAUGHT MY OWN WRONG FIX. Read `requires`, never `station`.
check('SENTINEL: making anything needs a fire, arrows included',
  Object.values(RECIPES).every((r) => r.requires === 'fire'),
  Object.values(RECIPES).map((r) => `${r.id}:${r.requires ?? 'NONE'}`).join(' '));

// ── 2. A REAL SERVER ────────────────────────────────────────────────────────
await requireFreePort(PORT, 'craftcheck');
const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
  // Thirty wood, of which a body can hold twenty — one stack. `woodToLight` is
  // 10 to lay the fire and the recipe is 2 to fletch with, so this leaves eight
  // spare, and the eight are the point: an assertion that a body did NOT spend
  // its wood is empty against a body with no wood, and at STOCK 12 that is
  // exactly what it was. Caught by its own premise sentinel, which is the only
  // reason anybody knows.
  //
  // STOCK ADDS TO the starting loadout rather than replacing it, so this body
  // also has the standard bow and twelve arrows — which is why every assertion
  // below is a DELTA. The first cut asserted `arrow === 0` and "a mind got
  // arrows" passed before anything had happened.
  env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0', HUNGER: '60', STOCK: 'wood:30' },
  stdio: 'ignore',
});
const stop = () => { try { server.kill(); } catch { /* gone */ } };
process.on('exit', stop);

const STEP = 1 / 30;
async function run(bodies, seconds, each = null) {
  for (let n = 0; n < Math.round(seconds / STEP); n++) {
    for (const b of bodies) b.update(STEP);
    each?.(n);
    await sleep(STEP * 1000);
  }
}
async function body(name, seed) {
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    const a = new Agent({ name, rand: makeRandom(seed), provider: new ScriptedProvider(makeRandom(`${seed}p`)) });
    const ok = await a.connect(URL).then(() => a).catch(() => null);
    if (ok) return ok;
  }
  throw new Error(`no server answered on ${URL}`);
}

try {
  const smith = await body('Mairi', 'smith');
  await sleep(900);

  check('a body on a real socket with wood enough for a fire, a fletch and a spare',
    smith.count('wood') >= 20, `wood ${smith.count('wood')} · arrow ${smith.count('arrow')}`);

  // ── 3. THE ONE THAT MATTERS ───────────────────────────────────────────────
  //
  // A fire has to exist first, because everything needs one. Laid through the
  // ordinary target machinery — the same `act` the reflex uses — rather than by
  // reaching into the world, so the fire is as real as any other.
  //
  const woodAtStart = smith.count('wood');
  smith.retarget = 999;                       // do not let resolve() replace it
  smith.target = { x: smith._x, z: smith._z, act: 'place', within: 2 };
  // ONE TICK is all it takes, and it used to take everything. See the
  // assertion below: an intent is a level the server re-reads, so this single
  // press was applied twice until `place` was given edge detection.
  await run([smith], STEP);                   // exactly ONE press
  // Then wait for the snapshot to catch up: `nearestFire` reads what the body
  // can SEE, which is a few frames behind the server that lit it.
  for (let i = 0; i < 300 && !smith.nearestFire(); i++) await run([smith], STEP);
  await run([smith], 0.3);
  const fire = smith.nearestFire();
  check('SENTINEL: a fire is lit and in reach, so the craft has a station to use',
    !!fire && fire.d <= 6, fire ? `fire ${fire.d.toFixed(1)} m away` : 'NO FIRE — staging failed');
  // ── AND IT COST ONE FIRE'S WORTH, NOT AS MUCH AS THE PACK COULD PAY ───────
  //
  // An intent is a LEVEL the server re-reads every tick until the next packet
  // arrives, so a single press used to be applied twice — measured here, one
  // `[CLI target place]` against two `[SRV place]`. `lightFireFor` treats the
  // second claim as FUEL for the first fire, so it did not even show up as two
  // fires: one fire, twenty wood, silence. Hidden for months by poverty, since
  // 10 to light means a body with 12 cannot afford the second application.
  //
  // Fixed by giving `place` and `craft` the edge detection that `primary`,
  // `drop`, `give`, `offer`, `accept` and `eat` have always had. Asserted here
  // because this is the only test in the repo that ever hands a body a full
  // stack of wood, which is the only reason anybody found out.
  check('  …and it cost ONE fire, not as many as a full pack could pay for',
    woodAtStart - smith.count('wood') === SURVIVAL.woodToLight,
    `${woodAtStart} -> ${smith.count('wood')} wood for one press · ` +
    `a fire is ${SURVIVAL.woodToLight}`);

  // Twelve arrows is well ABOVE `lowArrows`, so `recipeToWork` wants nothing:
  // the reflex will not fletch here. Anything that appears was CHOSEN.
  check('SENTINEL: the reflex does not want to fletch, so nothing but the VERB can',
    smith.recipeToWork() !== 'fletch_arrows' && smith.count('arrow') > AGENTS.lowArrows,
    `arrows ${smith.count('arrow')} vs lowArrows ${AGENTS.lowArrows} · reflex wants ${smith.recipeToWork() ?? 'nothing'}`);

  const arrowsBefore = smith.count('arrow');
  const woodBefore = smith.count('wood');
  // Where the body is standing as the make begins, so the deed's own position
  // can be checked against the truth rather than against where it ended up.
  const madeAt = { x: smith._x, z: smith._z };
  const wantArrows = sanitiseGoal({ kind: 'craft', thing: 'arrows', why: 'empty quiver' });
  let made = false;
  await run([smith], 4, () => {
    if (made) return;
    smith.goal = wantArrows;
    smith.retarget = 0;
    made = smith.count('arrow') > arrowsBefore;
  });
  check('A MIND THAT SAYS "craft arrows" GETS ARROWS',
    made, `arrow ${arrowsBefore} -> ${smith.count('arrow')} · wood ${woodBefore} -> ${smith.count('wood')}`);
  check('  …four of them, for the two wood the recipe costs',
    smith.count('arrow') - arrowsBefore === 4 && woodBefore - smith.count('wood') === 2,
    `+${smith.count('arrow') - arrowsBefore} arrows for ${woodBefore - smith.count('wood')} wood`);

  const deed = smith.deeds.filter((d) => d.what === 'craft').pop();
  check('  …and the deed says a MAKE, not a find — the pack rose and it was not foraging',
    /I (made|chose to make)/.test(deed?.text ?? ''), deed?.text ?? 'no craft deed');
  // WHO ASKED. Bodies have cooked and fletched on instinct since long before
  // this verb existed, so a board full of makes says nothing about whether the
  // VERB is used. Watched live on the night it shipped: the scripted control
  // fletching by reflex was momentarily read as the new verb working.
  // ── AND WHERE IT HAPPENED, WHICH THE RECORDER CANNOT DO WITHOUT ──
  //
  // Stamped by `did()` at the moment of the deed rather than when the journal
  // drains a second later — a body walks four metres in that. Asserted on a
  // REAL agent over a REAL socket, because the whole point is that these are
  // the body's own coordinates in the world and not a fixture's.
  check('  …and the deed carries WHERE IT HAPPENED, so a camera could fly there',
    typeof deed?.x === 'number' && typeof deed?.z === 'number'
      && Math.hypot(deed.x - madeAt.x, deed.z - madeAt.z) < 4,
    `deed at ${deed?.x}, ${deed?.z} · body was at ${madeAt.x.toFixed(1)}, ${madeAt.z.toFixed(1)} ` +
    `when it made them, and is at ${smith._x.toFixed(1)}, ${smith._z.toFixed(1)} now`);

  // ── ONE DECISION IS ONE MAKE ──────────────────────────────────────────────
  //
  // The mirror of foodcheck's one-decision-one-meal, and the same mechanism
  // underneath: a craft resolves INSTANTLY on the server (`RECIPES.seconds` is
  // presentation), `after` fires on arrival, arrival at a fire you are standing
  // at is distance zero, and the standing goal presses again every retarget.
  // One decision, unbounded makes.
  //
  // `fletch_arrows` has no `maxHeld`, so nothing stops it: 2 wood -> 4 arrows,
  // repeated until the pack is empty — straight through `AGENTS.spareWood`, the
  // firewood reserve `recipeToWork` guards so carefully that 0c needed a
  // starvation override to get past it.

  // THE PREMISE, STATED, so it cannot quietly go vacuous. "It did not repeat"
  // proves nothing against a pack with no wood in it, and a test that cannot
  // fail is how this project has fooled itself before.
  const spareFletches = Math.floor(smith.count('wood') / RECIPES.fletch_arrows.inputs.wood);
  check('SENTINEL: there is wood for several more fletches, so a repeat COULD happen',
    spareFletches >= 3 && !smith.recipeToWork(),
    `${smith.count('wood')} wood = ${spareFletches} more fletches · reflex wants ${smith.recipeToWork() ?? 'nothing'}`);

  const afterOne = { arrows: smith.count('arrow'), wood: smith.count('wood') };
  await run([smith], AGENTS.retargetSeconds * 4, () => {
    smith.goal = wantArrows;      // the SAME decision object, still standing
    smith.retarget = 0;           // and retargeting as hard as it possibly can
  });
  check('ONE DECISION IS ONE MAKE — the same standing goal does not fletch again',
    smith.count('arrow') === afterOne.arrows && smith.count('wood') === afterOne.wood,
    `arrows ${afterOne.arrows} -> ${smith.count('arrow')}, wood ${afterOne.wood} -> ${smith.count('wood')}, ` +
    `across ${(AGENTS.retargetSeconds * 4).toFixed(1)}s of forced retargets at the fire`);

  // AND THE RECORD AGREES, which is the half that was actually complained about:
  // the deed log filed one craft per PRESS, so a standing goal wrote ten crafts
  // against one decision and the run report read as a mind that had decided ten
  // times. A log that misrepresents what a mind chose is worse than no log.
  check('  …and the record agrees — ONE craft deed for ONE decision',
    smith.deeds.filter((d) => d.what === 'craft').length === 1,
    `${smith.deeds.filter((d) => d.what === 'craft').length} craft deeds · ` +
    `${spareFletches} more fletches were affordable and none were taken`);

  // ...but the rule is ONE PER DECISION, not one per run. A mind that decides
  // twice makes twice, or the verb is a one-shot and the guard has overreached.
  const decidesAgain = sanitiseGoal({ kind: 'craft', thing: 'arrows', why: 'still short' });
  await run([smith], 3, () => {
    smith.goal = decidesAgain;
    smith.retarget = 0;
  });
  check('  …but a NEW decision IS a new make — the guard is per decision, not permanent',
    smith.count('arrow') === afterOne.arrows + RECIPES.fletch_arrows.outputs.arrow,
    `arrows ${afterOne.arrows} -> ${smith.count('arrow')} on a second, separate decision`);

  check('  …and both makes are on the record as CHOSEN, not as reflexes',
    smith.deeds.filter((d) => d.what === 'craft' && d.by === 'choice').length === 2,
    smith.deeds.filter((d) => d.what === 'craft').map((d) => `${d.by}:${d.text}`).join(' | '));
  // ── AND NOW THE BODY IS SENT FOR A WALK, ON PURPOSE ───────────────────────
  //
  // THE GAP IS THE POINT, and the first version of this assertion got it
  // exactly backwards by demanding the deed match the body's CURRENT position.
  // A deed stamped at drain time would read wherever the body wandered to in
  // the second afterwards, which is the bug the stamping exists to avoid.
  //
  // But it used to get that gap BY ACCIDENT. The chosen craft repeated until
  // the wood ran out, at which point the refusal dropped it into `roam()` and
  // the body strolled off — ten metres, reliably, every run. When 0.5e made one
  // decision mean one make, the body correctly stood still, and this assertion
  // failed on a change that fixed something.
  //
  // A premise riding on a bug is not a premise. So the walk is now ORDERED,
  // and the assertion tests only what it claims to: that the numbers on the
  // deed are frozen at the moment of the deed.
  const walkFrom = { x: smith._x, z: smith._z };
  smith.goal = sanitiseGoal({ kind: 'wander', why: 'to put ground between body and deed' });
  smith.retarget = 0;
  await run([smith], 4);
  check('  …and it is the position at the TIME, not wherever the body walked to after',
    Math.hypot(smith._x - deed.x, smith._z - deed.z) > 1
      && Math.hypot(smith._x - walkFrom.x, smith._z - walkFrom.z) > 1,
    `${Math.hypot(smith._x - deed.x, smith._z - deed.z).toFixed(1)} m from the deed, ` +
    `${Math.hypot(smith._x - walkFrom.x, smith._z - walkFrom.z).toFixed(1)} m walked since it was written`);

  check('  …and it records that a MIND chose it, not that a reflex fired',
    deed?.by === 'choice' && /^I chose to make/.test(deed?.text ?? ''),
    `by=${deed?.by} text="${deed?.text}" id=${deed?.id} n=${deed?.n}`);

  // ── 4. THE WORDS A MODEL ACTUALLY TYPES ───────────────────────────────────
  const SPELLINGS = ['arrows', 'arrow', 'an arrow', 'fletch_arrows', 'fletch arrows'];
  const found = SPELLINGS.filter((w) => smith.recipeNamed(w)?.id === 'fletch_arrows');
  check('EVERY SPELLING OF ARROWS FINDS THE RECIPE — named by the thing, not the recipe id',
    found.length === SPELLINGS.length, `${found.length}/${SPELLINGS.length}: ${found.join(', ')}`);
  check('  …and "cooked venison" finds the cook, which needs a fire',
    smith.recipeNamed('cooked venison')?.id === 'cook_venison',
    String(smith.recipeNamed('cooked venison')?.id));
  // A bare craft means "whatever is most useful", so it depends on the pack —
  // and correctly answers NOTHING when nothing can be made. Both halves asserted,
  // because the first cut only checked the happy one and failed on an empty pack
  // that was behaving perfectly.
  const packWas = smith.carrying;
  smith.carrying = { hide: 3 };
  check('  …and a bare craft picks whatever the pack can actually make',
    smith.recipeNamed('')?.id === 'make_cloak', String(smith.recipeNamed('')?.id));

  // ── "SOMETHING USEFUL" MUST MEAN WHAT YOU LACK ──
  //
  // Watched live 2026-08-12, forty minutes after the verb shipped: Fingal chose
  // `craft` with the reason "need them to hunt", holding ZERO arrows and nine
  // wood, and was handed a HAND AXE — because the fallback was table order and
  // `make_axe` is first in the table. The verb worked; the choice was useless.
  smith.carrying = { wood: 9, stone: 2, hide: 1 };   // an axe AND arrows are possible
  smith.food = 70;                                   // fed, so the reflex guards its wood
  check('A BARE CRAFT WITH AN EMPTY QUIVER MAKES ARROWS, not the first row of the table',
    smith.recipeNamed('')?.id === 'fletch_arrows',
    `${smith.recipeNamed('')?.id} — arrows ${smith.count('arrow')}, wood ${smith.count('wood')}`);
  smith.carrying = { wood: 9, stone: 2, hide: 1, arrow: 20 };
  check('  …and with a full quiver it makes something else instead',
    smith.recipeNamed('')?.id !== 'fletch_arrows', String(smith.recipeNamed('')?.id));
  smith.carrying = { venison: 2, arrow: 20 };
  check('  …and raw meat in the pack is cooked before anything ornamental',
    smith.recipeNamed('')?.id === 'cook_venison', String(smith.recipeNamed('')?.id));
  smith.carrying = {};
  check('  …and answers NOTHING when nothing can be made, rather than guessing',
    smith.recipeNamed('') === null, String(smith.recipeNamed('')?.id ?? 'null'));
  smith.carrying = packWas;

  // ── 4b. AND THE BRIEF SAYS SO BEFORE A DECISION IS SPENT ON IT (0k) ───────
  //
  // Fingal chose `craft` twice with an empty pack and was refused both times —
  // correctly, in words, and he went and got wood on the very next decision.
  // The refusal loop worked; the decision was still wasted. `lacking` exists
  // for the identical reason one step earlier ("no arrows — you cannot shoot"),
  // because a model will not infer an absence, and it will not infer a recipe
  // it has never seen either.
  smith.carrying = { wood: 9, stone: 2, hide: 1 };
  const canMake = smith.makeable();
  check('THE BRIEF NAMES WHAT THE PACK COULD BECOME — not just what it lacks',
    canMake.length > 0, JSON.stringify(canMake));
  check('  …headed by what a BARE craft would actually make, so the two agree',
    /arrow/.test(canMake[0] ?? ''), `first: "${canMake[0]}" · bare craft picks ${smith.recipeNamed('')?.id}`);
  check('  …named by the OUTPUT, which is the word the verb takes',
    canMake.every((w) => !/_/.test(w)), canMake.join(', '));

  smith.carrying = {};
  check('  …and an empty pack claims nothing, rather than listing what it cannot afford',
    smith.makeable().length === 0, JSON.stringify(smith.makeable()));

  // It has to reach the TEXT a model reads, not merely the object.
  smith.carrying = { wood: 9 };
  const text = briefToText(smith.brief());
  check('  …and it reaches the words a model actually reads',
    /You could make:/.test(text) && /fire must be in reach/.test(text),
    (text.match(/You could make:.*/) ?? ['NO LINE IN THE BRIEF'])[0].slice(0, 100));

  // ── 5. REFUSALS, IN WORDS ─────────────────────────────────────────────────
  smith.outcomes = []; smith.refusedVerbs = {};
  const nonsense = smith.resolve(sanitiseGoal({ kind: 'craft', thing: 'a longbow' }));
  const saidNonsense = smith.drainOutcomes().join(' | ');
  check('A THING THIS WORLD CANNOT MAKE IS REFUSED IN WORDS',
    nonsense?.act !== 'craft' && /no way to make/.test(saidNonsense), saidNonsense || 'silence');

  smith.carrying = {};                    // no inputs at all
  smith.outcomes = []; smith.refusedVerbs = {}; smith._refusedAt = {};
  smith.decisions += 1;                   // refusals count once per DECISION
  const short = smith.resolve(sanitiseGoal({ kind: 'craft', thing: 'arrows' }));
  const saidShort = smith.drainOutcomes().join(' | ');
  check('  …and a SHORT PACK is told exactly what it is short of',
    short?.act !== 'craft' && /2 more branches/.test(saidShort), saidShort || 'silence');
  check('  …and the refusal is counted, so a report can tell refused from never wanted',
    (smith.refusedVerbs?.craft ?? 0) > 0, JSON.stringify(smith.refusedVerbs ?? {}));

  // ── 6. 0c — THE STARVATION OVERRIDE ───────────────────────────────────────
  // `recipeToWork` is the reflex's own choice. Well fed with two wood it must
  // NOT spend them; starving it must, because you cannot eat a fire.
  smith.carrying = { wood: 2 };
  smith.food = AGENTS.arrowsBeatFirewoodBelow + 5;
  check('A WELL-FED BODY KEEPS ITS WOOD FOR THE FIRE — the old rule, unbroken',
    smith.recipeToWork() !== 'fletch_arrows',
    `at food ${smith.food}, reflex wants ${smith.recipeToWork() ?? 'nothing'}`);
  smith.food = AGENTS.arrowsBeatFirewoodBelow - 5;
  check('  …and a STARVING one spends them on arrows, because you cannot eat a fire',
    smith.recipeToWork() === 'fletch_arrows',
    `at food ${smith.food}, reflex wants ${smith.recipeToWork() ?? 'nothing'}`);

  smith.close?.();
  await sleep(200);
} finally { stop(); }

const passed = results.filter((r) => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed\n`);
if (passed < results.length) {
  console.log('  FAILED:');
  for (const r of results.filter((x) => !x.pass)) console.log(`    - ${r.name}`);
  console.log('');
}
