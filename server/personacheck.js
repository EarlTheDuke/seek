// ── personacheck.js ─────────────────────────────────────────────────────────
// Are these characters an experiment, or a costume box?
//
//   npm run personacheck
//
// The difference is entirely in the control. If PERSONAS=off is byte-identical
// to the world before any of this existed, then a difference observed with them
// on is a difference personas made. If the off-state has quietly drifted — one
// extra blank line, one reworded sentence — then every comparison anybody makes
// afterwards is measuring two changes at once and cannot separate them.
//
// So the first case here asserts BYTES, and the baseline is written out in full
// rather than derived, because a baseline computed by the same code it is
// checking would follow it wherever it went.
//
// The rest: assignment must be deterministic (a run has to reproduce, and
// "player three was the liar" has to still be true tomorrow), explicit
// assignment must be obeyed in order, and a persona must reach BOTH the model's
// prompt and the written record — a session that cannot name its own cast
// cannot attribute anything that happened in it.

import { ModelProvider, ScriptedProvider, makeProvider } from '../src/minds/providers.js';
import { assignPersonas, personaById, PERSONAS, PERSONA_IDS } from '../src/minds/personas.js';
import { buildReport } from './playreport.js';
import { GOAL_IDS } from '../src/minds/goals.js';
import { itemVocabulary } from '../src/items/registry.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n  Are these characters an experiment, or a costume box?\n');

// ── THE CONTROL ─────────────────────────────────────────────────────────────
//
// Written out by hand. This is what every mind in this world was told before
// personas existed, and it is what every mind must still be told when they are
// off. If this check ever fails, either the baseline prompt was deliberately
// changed — in which case update this string IN THE SAME COMMIT and say so —
// or a persona has leaked into the control and the experiment is void.
//
// The verb list is the ONE part interpolated rather than typed out, because it
// is generated from the goal table and adding a verb is not a change to the
// control. Every word around it is pinned: a reworded sentence here silently
// changes what "personas off" means, and the whole point of a control is that
// it does not move.
const BASELINE = [
  'You are the mind of one inhabitant of a cold highland world.',
  'You are told only what your body can actually perceive. You have no map,',
  'no coordinates, and no knowledge of anyone you have not seen, heard or smelled.',
  '',
  'Reply with ONE line of JSON and nothing else:',
  '  {"kind":"<verb>","<param>":"<value>","why":"<a few words>","say":"<optional>"}',
  '',
  `Verbs: ${GOAL_IDS.join(', ')}.`,
  'hunt takes quarry. approach and avoid take target. goTo takes place.',
  // ── A NINTH TIME, when dropped loot reached the wire. Same commit. ──
  //
  // `gather` went to the nearest BRANCH and nothing else, so "pick up what is
  // lying about" walked a mind off its own carcass. Mechanics again, not
  // strategy: it states what the verb can take, and says nothing about when to
  // take it.
  'gather takes an optional item — "venison" walks you to a carcass, none walks',
  'you to whatever is nearest, branch or kill.',
  // ── A TENTH TIME, when minds were given a word for eating. Same commit. ──
  //
  // Until then no mind in this survival world could say it wanted to eat: the
  // server has honoured `intent.eat` since agents got hands and the only setter
  // was a keypress. Adding the verb is not on its own a change to the control —
  // the verb list above is interpolated for exactly that reason — but this
  // SENTENCE is, and it has to be here or "personas off" quietly means two
  // different briefs depending on which file you read.
  //
  // Shared-floor mechanics like every line around it: it says what the verb
  // takes and where the food comes from, and nothing about when to be hungry.
  'eat takes nothing — you eat the best food in your own pack, where you stand.',
  // ── A SEVENTH TIME, when speech stopped being a verb. Same commit. ──
  //
  // `say` WAS a verb, so speaking meant not hunting — a cost built into the
  // mechanics rather than the prompt, and one this project spent two days
  // failing to notice. Across six models and two full runs the world produced
  // ONE sentence between them, and the mind that produced it then sat pinned on
  // that sentence for nine real minutes.
  //
  // Speech now rides on any verb. The prompt has to say so or the change is
  // invisible to the model, and unlike `attack` or `offer` this IS shared-floor
  // guidance rather than a thumb on the scale: it tells every mind what the
  // mechanics now permit, not when to use it. The JSON shape line above moved
  // for the same reason and in the same breath.
  '"say" is not a verb — add it to ANY decision and you speak while you act.',
  '  {"kind":"hunt","quarry":"deer","say":"that one is mine, I hit it"}',
  'Keep it under fifteen words and in character. It costs you nothing.',
  // ── AN EIGHTH TIME, when a mind got somewhere to put step two. Same commit. ──
  //
  // `plan` and `note` are the only two things in the brief a mind writes for
  // itself. Shared-floor mechanics again, not strategy: they describe a place to
  // keep an intention, and say nothing about what to intend. Every mind gets
  // them identically, personas on or off.
  '"plan" is up to three short lines you write for yourself, handed back to',
  'you next time. Leave it out to keep it; send [] to clear it.',
  '  {"kind":"goTo","place":"the loch","plan":["get meat","trade wood to Eachann for some"]}',
  '"note" is a page of your own — a grudge, a price, a promise. Nobody else',
  'reads it. Same rule: leave it out to keep it, send "" to clear it.',
  'give takes target (a person by name) and item — you walk to them and hand it over.',
  // ── AND A FOURTH TIME, when `attack` was added, same commit ──
  //
  // Only the verb's SHAPE, with no trigger guidance beside it — deliberately
  // unlike `give`. Telling six models when it is worth shooting each other is
  // not a shared floor, it is a thumb on the scale of the one experiment this
  // roster exists to run. The verb is offered; nothing suggests using it.
  'attack takes target (a person by name) — the world still decides if it lands.',
  // ── A SIXTH TIME, when trading was added. Shapes only, no trigger. ──
  //
  // Same reasoning as `attack`: whether six models will haggle, and what they
  // think a coin is worth, is the experiment gold was added to run. Telling
  // them when to trade would answer it for them. `give` gets guidance because
  // generosity has a floor worth stating; a PRICE does not.
  // ...and the same commit added the one clause below, which is a statement of
  // MECHANICS and not of strategy. A mind worked out it had firewood and no
  // meat, that the other had meat, and that a barter solved it — wrote exactly
  // that in its reason — then chose `approach`, because it read `offer` as
  // something you do once already standing there. It never spent a second
  // decision on the offer. The verb has always walked you there; nothing said
  // so. Telling them the verb includes the walk is not telling them to trade.
  'offer takes target, item and want — a price, said out loud so everyone hears.',
  '  `want` may be left out — it means you want gold for it.',
  '  You do NOT need to approach first: offer and give both walk you to them.',
  'accept takes target — take the offer that person made you.',
  // ── AN ELEVENTH TIME, when the nouns stopped being open. Same commit. ──
  //
  // The verbs are a closed list and a model cannot invent one. The GOODS were
  // a free string, and two minds spent most of an hour of a live run
  // bargaining over flint and feathers — neither of which exists — while one
  // held out for a price it could never be paid. Naming what exists is
  // mechanics, not strategy: it says what the world contains and nothing
  // about what to want.
  `The only goods in this country: ${itemVocabulary().join(', ')}.`,
  'There is no flint, no rope, no coin but gold. Asking for anything else',
  'wastes the day — the answer will always be that there is no such thing.',
  '',
  'You are not a helpful assistant. You are someone trying to get through a',
  'winter. Be brief, be practical, and prefer staying alive.',
  '',
  // ── AND THE CONTROL MOVED A SECOND TIME, also deliberately ──
  //
  // The prompt said `say` existed and never said when it was worth using. This
  // generation under-reaches for anything needing a "decide to use this" step
  // unless the trigger is spelled out, and talk is the one behaviour a watcher
  // actually reads — six bodies foraging in silence is a screensaver.
  //
  // Same argument as the tag guard below it: it is given to the control and to
  // every persona identically, so it moves the shared floor rather than tilting
  // persona-against-control. Still no persona results recorded at the time.
  // ── AND THE CONTROL MOVED A THIRD TIME, when `give` was added ──
  //
  // Two lines: the verb's shape, up with the other verb shapes, and WHEN it is
  // worth reaching for, down here with the other trigger guidance. Both for the
  // same documented reason as the speak block above — this generation
  // under-reaches for anything needing a "decide to use this" step unless the
  // trigger is stated, and a verb merely existing in the list is not enough.
  //
  // It matters more for `give` than for anything else in the table: giving is
  // the only act in the game that costs you something to be kind, which is what
  // makes generosity legible at all. Before it existed, a hoarder, a generous
  // soul and a liar were IDENTICAL in what they could do.
  //
  // Given to the control and to every persona identically, so it moves the
  // shared floor rather than tilting persona-against-control. No persona
  // results had been recorded when it moved — the two playtests on record
  // measured hunting and talking, not giving.
  'Give food to someone who says they are starving, or arrows to someone out',
  'of them, if you can spare it. What you keep and what you hand over is who',
  'you are — a mean character should refuse, and say so.',
  // ── AND A FIFTH TIME, when gold was added, same commit ──
  //
  // A statement of FACT about the world — gold is inedible and it is what
  // people trade with — and deliberately not an instruction to trade. A mind
  // that does not know a thing is money treats it as litter, and then there is
  // no economy to observe. But telling six models to accept a coin for food
  // would answer the very question the coin was added to ask.
  //
  // Identical for the control and every persona. No persona results had been
  // recorded that measured trading; the two on file measured hunting and talk.
  'Gold is no use in itself — you cannot eat it or burn it. It is what people',
  'here trade with, so it is worth exactly what somebody will give you for it.',
  '',
  'Speak when someone asks you something, when you have found something the',
  'others would want to know, or when you disagree with what was just said.',
  'Otherwise act — an unprompted remark every few minutes is plenty.',
  '',
  // ── THE CONTROL MOVED ONCE, DELIBERATELY, AND THIS IS THE RECORD OF IT ──
  //
  // Added when the fleet switched to running with thinking DISABLED, which is
  // the posture that makes the current Claude generation occasionally leak
  // `<thinking>` tags into the visible answer. The reply parser takes the first
  // {...} it finds, so a leaked tag INSIDE the braces breaks the parse and the
  // agent silently falls through to the scripted brain — the exact failure this
  // whole phase of work existed to kill.
  //
  // It applies identically to the control and to every persona, so it does not
  // bias persona-against-control; it moves the shared floor both stand on. No
  // persona results had been recorded when it moved. If it moves again, say so
  // here again — a control whose history is undocumented is not a control.
  'Do not include internal or system XML tags in your response.',
].join('\n');

const plain = new ModelProvider({ apiKey: 'x' });
check('PERSONAS=off is BYTE-IDENTICAL to the prompt every mind used to get',
  plain.systemPrompt() === BASELINE,
  plain.systemPrompt() === BASELINE
    ? `${BASELINE.length} bytes, unchanged`
    : 'the control has drifted — every comparison against it is now worthless');
if (plain.systemPrompt() !== BASELINE) {
  console.log('\n--- what it says now ---\n' + plain.systemPrompt() + '\n--- what it must say ---\n' + BASELINE + '\n');
}

// ── and a character actually reaches the model ──────────────────────────────
const hoarder = personaById('hoarder');
const dressed = new ModelProvider({ apiKey: 'x', character: hoarder.character });
check('a character reaches the system prompt', dressed.systemPrompt().includes(hoarder.character.slice(0, 40)));
check('and it goes ABOVE the verbs, where it colours the choice',
  dressed.systemPrompt().indexOf('Who you are:') < dressed.systemPrompt().indexOf('Reply with ONE line'),
  'a disposition read after the rules is a footnote');
check('the rest of the prompt is untouched by it',
  dressed.systemPrompt().replace(`Who you are:\n${hoarder.character}\n\n`, '') === BASELINE,
  'nothing but the character block differs');

// ── the table ───────────────────────────────────────────────────────────────
check('there are enough characters for a full fleet', PERSONAS.length >= 5,
  PERSONA_IDS.join(', '));
check('each is a disposition, not a biography',
  PERSONAS.every((p) => p.character.length > 80 && p.character.length < 420),
  `${Math.min(...PERSONAS.map((p) => p.character.length))}-${Math.max(...PERSONAS.map((p) => p.character.length))} characters each`);
check('and each says what this person DOES when it costs them',
  PERSONAS.every((p) => /\byou\b/i.test(p.character)),
  'written in the second person, as an instruction to be someone');

// ── off, on, explicit ───────────────────────────────────────────────────────
check('off means nobody is anybody', assignPersonas('off', 6).every((p) => p === null));
check('...and so does saying nothing at all', assignPersonas(null, 6).every((p) => p === null));

const dealt = assignPersonas('on', 6, 'seed-a');
check('on gives everybody a character', dealt.every(Boolean),
  dealt.map((p) => p.id).join(', '));
check('...all different, while the deck lasts',
  new Set(dealt.map((p) => p.id)).size === Math.min(6, PERSONAS.length),
  'three hoarders and no liar would waste an evening');

const again = assignPersonas('on', 6, 'seed-a');
check('THE SAME SEED DEALS THE SAME CAST',
  JSON.stringify(again.map((p) => p.id)) === JSON.stringify(dealt.map((p) => p.id)),
  'a run reproduces, or "player three was the liar" is not a fact');
const other = assignPersonas('on', 6, 'seed-b');
check('and a different one does not', JSON.stringify(other.map((p) => p.id)) !== JSON.stringify(dealt.map((p) => p.id)),
  other.map((p) => p.id).join(', '));

const explicit = assignPersonas('hoarder,liar,coward', 5);
check('explicit assignment is obeyed in order, and cycles',
  explicit.map((p) => p.id).join(',') === 'hoarder,liar,coward,hoarder,liar',
  explicit.map((p) => p.id).join(','));
check('a typo costs you one character, not the evening',
  assignPersonas('hoarder,wizard', 2).map((p) => p?.id ?? 'none').join(',') === 'hoarder,none');

// ── it reaches the provider the fleet actually builds ───────────────────────
const built = makeProvider(() => 0.5, { MINDS_PROVIDER: 'anthropic', MINDS_API_KEY: 'k' },
  { character: personaById('liar').character });
check('the fleet builder passes a character through to the mind',
  built.systemPrompt().includes('mislead people about where the deer are'));
check('and with none it is the control again',
  makeProvider(() => 0.5, { MINDS_PROVIDER: 'anthropic', MINDS_API_KEY: 'k' }).systemPrompt() === BASELINE);
check('a scripted mind is unaffected either way',
  new ScriptedProvider(() => 0.5).name === 'scripted');

// ── AND IT IS WRITTEN DOWN ──────────────────────────────────────────────────
//
// The half that turns this from anecdote into a result. Behaviour that cannot
// be attributed to a character is a story about a session, not a finding.
const fakeAgents = [
  { name: 'Eachann', persona: personaById('hoarder'), provider: { name: 'anthropic', model: 'claude-opus-5' },
    decisions: 30, goalCounts: { hunt: 30 }, startX: 0, startZ: 0, _x: 90, _z: 0 },
  { name: 'Morag', persona: personaById('generous'), provider: { name: 'scripted' },
    decisions: 30, goalCounts: { gather: 30 }, startX: 0, startZ: 0, _x: 70, _z: 0 },
];
const report = buildReport(fakeAgents, { seconds: 400, minds: 'model' }).text;
check('the session report names who was who', /Who was who/.test(report) && /hoarder/.test(report) && /generous/.test(report),
  report.split('\n').find((l) => l.startsWith('- Eachann')) ?? 'no cast list');
check('...and which model wore it',
  /claude-opus-5/.test(report), 'so a behaviour can be pinned to a model AND a character');

const control = buildReport(
  fakeAgents.map((a) => ({ ...a, persona: null })), { seconds: 400, minds: 'model' }
).text;
check('and with personas off the report has no cast list to give', !/Who was who/.test(control),
  'the control should read as a control');

const passed = results.filter((r) => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed\n`);
process.exit(passed === results.length ? 0 : 1);
