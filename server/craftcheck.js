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
import { AGENTS } from '../src/config.js';
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
  // Twelve wood: ten to lay a fire and two to fletch with. STOCK ADDS TO the
  // starting loadout rather than replacing it, so this body also has the
  // standard bow and twelve arrows — which is why every assertion below is a
  // DELTA. The first cut asserted `arrow === 0` and "a mind got arrows" passed
  // before anything had happened.
  env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0', HUNGER: '60', STOCK: 'wood:12' },
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

  check('a body on a real socket with wood enough for a fire and a fletch',
    smith.count('wood') >= 12, `wood ${smith.count('wood')} · arrow ${smith.count('arrow')}`);

  // ── 3. THE ONE THAT MATTERS ───────────────────────────────────────────────
  //
  // A fire has to exist first, because everything needs one. Laid through the
  // ordinary target machinery — the same `act` the reflex uses — rather than by
  // reaching into the world, so the fire is as real as any other.
  smith.retarget = 999;                       // do not let resolve() replace it
  smith.target = { x: smith._x, z: smith._z, act: 'place', within: 2 };
  await run([smith], 1.5);
  const fire = smith.nearestFire();
  check('SENTINEL: a fire is lit and in reach, so the craft has a station to use',
    !!fire && fire.d <= 6, fire ? `fire ${fire.d.toFixed(1)} m away` : 'NO FIRE — staging failed');

  // Twelve arrows is well ABOVE `lowArrows`, so `recipeToWork` wants nothing:
  // the reflex will not fletch here. Anything that appears was CHOSEN.
  check('SENTINEL: the reflex does not want to fletch, so nothing but the VERB can',
    smith.recipeToWork() !== 'fletch_arrows' && smith.count('arrow') > AGENTS.lowArrows,
    `arrows ${smith.count('arrow')} vs lowArrows ${AGENTS.lowArrows} · reflex wants ${smith.recipeToWork() ?? 'nothing'}`);

  const arrowsBefore = smith.count('arrow');
  const woodBefore = smith.count('wood');
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
