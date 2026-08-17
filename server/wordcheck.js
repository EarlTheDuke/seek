// ── wordcheck.js ────────────────────────────────────────────────────────────
// Does everything in this world call a thing by the same name?
//
//   npm run wordcheck
//
// THE HOLE THIS CLOSES. A brief said "3 venisons". Four hundred lines away, in
// the same class, on the same tick, about the same animal, a deed line said
// "3 venison". The rule had been written three times:
//
//   itemWords   (registry.js)  -s, or -es after s/x/ch     "3 venisons"
//   Agent.plural(agent.js)     ...plus a meat-and-fish rule  "3 venison"
//   amountText  (book.js)      -s, or -es after s/sh/ch/x  "3 venisons"
//
// and no two of them agreed. Two were wrong about venison and trout, and ALL
// THREE were wrong about gold, which took a plural in every one of them.
//
// It matters more than a typo, for two reasons.
//
// ── ONE: THE BRIEF IS THE THING THE MODEL READS ─────────────────────────────
//
// The HUD copy is read by a human who will forgive it. The BRIEF is read by a
// language model, several times a minute, all session, and it is the entire
// basis on which that model decides what to do. A brief that says "venisons"
// is teaching the model a word, and the model will say it back — so the game's
// own parser has to know a word the game's own designers never chose.
//
// ── TWO: THE ROUND TRIP IS THE HONESTY RULE IN MINIATURE ────────────────────
//
// A mind gets its body's SENSES and answers in a closed vocabulary. That
// contract only holds if every noun the senses use is a noun the vocabulary
// accepts. Any word this game says to a model MUST resolve back to the item it
// came from — otherwise the brief is inviting a reply the parser will refuse,
// and a refusal that the game itself provoked is the worst kind, because it
// looks exactly like a stupid model.
//
// So the assertions here are not "is the spelling nice". They are:
//
//   * every word we SAY resolves back to the thing we said it about
//   * the three places that speak all say the same word
//
// The second one is the one that would have caught this on day one, and it
// needs no opinion about English at all — just two functions and ===.

import { ITEMS, itemWords, plural, resolveItemId } from '../src/items/registry.js';
import { Agent } from '../src/net/agent.js';
import { amountText } from '../src/ui/book.js';

const results = [];
function check(what, pass, detail = '') {
  results.push({ what, pass });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`);
}

const IDS = Object.keys(ITEMS);
console.log('\n  Highlands — wordcheck: one thing, one name\n');

// ── THE ROUND TRIP ──────────────────────────────────────────────────────────
//
// Said at one, said at many, and heard back. Both counts, because the plural is
// the half that gets improvised.
for (const n of [1, 3]) {
  const broken = IDS
    .map((id) => [id, itemWords(id, n)])
    .filter(([id, said]) => resolveItemId(said) !== id);
  check(`every item said at ${n} is heard back as itself`,
    broken.length === 0,
    broken.length
      ? broken.map(([id, said]) => `"${said}" -> ${resolveItemId(said) ?? 'NOTHING'} (wanted ${id})`).join(', ')
      : `${IDS.length} items`);
}

// A brief writes counts straight out of the pack, so the numbers a body can
// actually be holding all have to survive the trip, not just 1 and 3.
{
  const broken = [];
  for (const id of IDS) {
    for (const n of [0, 1, 2, 5, 12, 40]) {
      const said = itemWords(id, n);
      if (resolveItemId(said) !== id) broken.push(`${n} ${said}`);
    }
  }
  check('...at every count a pack can hold, not just the two that got tested',
    broken.length === 0, broken.length ? broken.join(', ') : '6 counts x ' + IDS.length);
}

// ── THE THREE SPEAKERS AGREE ────────────────────────────────────────────────
//
// THIS IS THE ONE THAT WOULD HAVE CAUGHT IT. No opinion about English required:
// the brief, the deed line and the HUD are describing the same pack, so they
// have to produce the same string, and that is ===.
{
  const disagree = [];
  for (const id of IDS) {
    for (const n of [1, 2, 3, 9]) {
      const brief = itemWords(id, n);                       // what the model reads
      const deed = Agent.plural(itemWords(id, 1), n);       // what the body writes
      const hud = amountText(id, n);                        // what the human reads
      if (deed !== brief || hud !== `${n} ${brief}`) {
        disagree.push(`${id} x${n}: brief "${brief}", deed "${deed}", hud "${hud}"`);
      }
    }
  }
  check('THE BRIEF, THE DEED LINE AND THE HUD ALL SAY THE SAME WORD',
    disagree.length === 0,
    disagree.length ? disagree.slice(0, 4).join(' | ') : `${IDS.length} items x 4 counts, all identical`);
}

// ── THE EXCEPTIONS, NAMED ───────────────────────────────────────────────────
//
// These are facts about the THINGS, not about spelling, which is exactly why no
// regex over the letters was ever going to find them and why they are listed.
const SAYS = [
  ['venison', 3, '3 venison', 'meat is not counted in the plural'],
  ['venison_cooked', 3, '3 cooked venison', 'and cooking it does not change that'],
  ['fish', 3, '3 trout', 'nor is a fish, and this one is called a trout'],
  ['fish_cooked', 3, '3 cooked trout', ''],
  ['gold', 6, '6 gold', 'a mass noun — every one of the three copies got this wrong'],
  ['wood', 8, '8 branches', 'the id is wood and the game calls it a Branch'],
  ['stone', 2, '2 stones', 'and the ordinary case still works'],
  ['torch', 2, '2 torches', ''],
  ['axe', 2, '2 hand axes', 'the -es goes on the last word, not the name'],
  ['hide', 1, '1 hide', ''],
];
for (const [id, n, want, why] of SAYS) {
  const got = `${n} ${itemWords(id, n)}`;
  check(`"${want}"`, got === want, got === want ? why : `got "${got}"`);
}

// ── AND THE SENTINELS ───────────────────────────────────────────────────────
//
// Every assertion above is satisfied by a rule that pluralises NOTHING. So feed
// the three real shipped rules back in and require each to be caught. A check
// that cannot fail on the bug it was written for is decoration — and this file
// exists because three separate people-shaped hands wrote a plural rule that
// looked right.
{
  const oldRegistry = (name, n) => (n > 1 ? `${name}${/(s|x|ch)$/.test(name) ? 'es' : 's'}` : name);
  const oldAgent = (noun, n) => {
    if (n === 1) return noun;
    if (/(venison|trout|fish)$/.test(noun)) return noun;
    if (/(s|x|z|ch|sh)$/.test(noun)) return `${noun}es`;
    return `${noun}s`;
  };
  const oldBook = (name, n) => (n === 1 ? name : /(s|sh|ch|x)$/i.test(name) ? `${name}es` : `${name}s`);

  check('SENTINEL: the shipped registry rule is caught — it said "venisons"',
    oldRegistry('venison', 3) !== plural('venison', 3),
    `"${oldRegistry('venison', 3)}" vs "${plural('venison', 3)}"`);
  check('SENTINEL: the shipped book rule is caught — it said "venisons" too',
    oldBook('venison', 3) !== plural('venison', 3),
    `"${oldBook('venison', 3)}"`);
  check('SENTINEL: the shipped agent rule is caught — it had the meat rule and still said "golds"',
    oldAgent('gold', 6) !== plural('gold', 6),
    `"${oldAgent('gold', 6)}" vs "${plural('gold', 6)}"`);
  check('SENTINEL: a rule that pluralises nothing is caught',
    plural('stone', 3) !== 'stone',
    `"${plural('stone', 3)}" — the exceptions must stay exceptions`);
  check('SENTINEL: the old registry and agent rules DID disagree with each other',
    oldRegistry('venison', 3) !== oldAgent('venison', 3),
    'which is the disagreement the third assertion above now forbids');
}

// ── the shape of the rule itself ────────────────────────────────────────────
check('one is always singular',
  IDS.every((id) => itemWords(id, 1) === (ITEMS[id]?.name ?? id).toLowerCase()),
  `${IDS.length} items`);
check('nothing is ever said with an underscore in it',
  IDS.every((id) => !itemWords(id, 1).includes('_') && !itemWords(id, 4).includes('_')),
  'ids are for code, names are for people and for models');
check('nothing is ever said with a capital in it — these land mid-sentence',
  IDS.every((id) => itemWords(id, 3) === itemWords(id, 3).toLowerCase()),
  `${IDS.length} items`);

const failed = results.filter((r) => !r.pass);
console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
