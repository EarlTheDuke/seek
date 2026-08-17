// ── book.js ─────────────────────────────────────────────────────────────────
// What you can make, what it costs, and what you are short of.
//
// The game had a discoverability hole you could walk around in for an hour:
// every cost lived in a table, the tables were right, and none of it was ever
// said to you. You could carry two stones and a branch past a fire all evening
// without being told they were an axe. Worse, the fire's prompt only ever
// offered the BEST thing you could make right now — so a recipe you could not
// yet afford was not merely unavailable, it was invisible, and there was no way
// to learn it existed short of reading the source.
//
// So: a reference, opened with B, that answers the two questions a person
// actually has — "what can I make?" and "what am I missing?"
//
// THE ONE RULE HERE is that nothing in this file restates a number. Every cost
// is read out of BUILDABLE and RECIPES at call time. A reference that is
// hand-copied from the tables is a reference that goes quietly wrong the first
// time somebody retunes a cost, and being quietly wrong is worse than being
// absent — you would trust it. Add a drying rack to BUILDABLE and it appears
// here, priced correctly, with no edit to this file.
//
// No THREE, no DOM. It turns tables and an inventory into rows; the HUD paints
// them. That is what lets `npm run bookcheck` run the whole thing headlessly,
// which matters more than usual on a project where the browser is often not
// available to play in.

import { BUILDABLE } from '../world/structures.js';
import { RECIPES } from '../items/recipes.js';
import { ITEMS, itemWords } from '../items/registry.js';
import { COMPANIONS } from '../creatures/companions.js';
import { SPECIES } from '../creatures/registry.js';
import { SURVIVAL, ARROW } from '../config.js';

/**
 * "6 branches", "1 hide", "3 venison" — plural where a person would pluralise.
 *
 * The third of three copies of this rule, and the second of two that said
 * "3 venisons". It is now the item table's own words, which is the only way
 * the HUD a human reads and the brief a model reads can be guaranteed to
 * agree — and they have to agree, because they are describing the same pack.
 */
export function amountText(id, n) {
  return `${n} ${itemWords(id, n)}`;
}

/** Seconds, said the way a person would say them. */
export function durationText(seconds) {
  if (seconds < 90) return `burns ${Math.round(seconds)}s`;
  return `burns ${Math.round(seconds / 60)} min`;
}

/** The cost line, and what of it you are still missing. */
function priceOf(cost, inventory) {
  const parts = [];
  const short = [];
  for (const [id, n] of Object.entries(cost)) {
    parts.push(amountText(id, n));
    const have = inventory?.countOf(id) ?? 0;
    if (have < n) short.push(amountText(id, n - have));
  }
  return {
    cost: parts.join(', '),
    // `short` is the whole point. "You need 6 branches" is a fact; "you need 2
    // more branches" is a decision you can act on without doing arithmetic in
    // your head while something is hunting you.
    short: short.length ? `need ${short.join(' and ')}` : null,
    can: short.length === 0,
  };
}

/**
 * The whole reference, as sections of rows.
 *
 * @param {object} ctx
 * @param {object} ctx.inventory   what you are carrying — may be null
 * @param {string|object} ctx.companion  your animal: its species id, or the
 *   species definition itself. Both, because `Companion.species` holds the
 *   whole definition object while everything else in the codebase calls a
 *   string an id — and the first version of this file took the string, got
 *   handed the object, and quietly dropped the entire section with no error.
 *   That is the third time a representation mismatch has crossed a module
 *   boundary in silence here; accepting both is cheaper than remembering.
 * @returns {{title:string, note?:string, rows:{name:string, cost?:string,
 *           note?:string, can?:boolean}[]}[]}
 */
export function buildBook({ inventory = null, companion = null } = {}) {
  const sections = [];

  // ── build ──
  // A fire is first because it is the thing everything else needs, and it is
  // not in BUILDABLE — it is lit rather than built.
  //
  // `SURVIVAL.woodToLight`, AND THIS FILE HAD IT HARD-CODED AS 1. The rule at
  // the top of this file is that nothing here restates a number, because "being
  // quietly wrong is worse than being absent — you would trust it". The fire
  // slipped past that rule by being the one thing NOT in BUILDABLE, so when the
  // price went from one branch to ten the reference kept confidently saying one.
  // Exactly the failure the rule was written to prevent, in the file that
  // wrote it.
  const fire = priceOf({ wood: SURVIVAL.woodToLight }, inventory);
  const buildRows = [{
    name: 'Fire',
    cost: fire.cost,
    // Minutes only once it IS minutes. Rounding 45 seconds to "1 min" is the
    // kind of small lie that gets someone killed walking back for firewood.
    note: fire.can ? `G to light · ${durationText(SURVIVAL.fireFuelPerWood)} a branch` : fire.short,
    can: fire.can,
  }];
  for (const b of Object.values(BUILDABLE)) {
    const p = priceOf(b.cost, inventory);
    buildRows.push({ name: b.name, cost: p.cost, note: p.can ? b.blurb : p.short, can: p.can });
  }
  // "hold E where you want it" was wrong and a tester lost time to it: it
  // produced no prompt in ten of eleven attempts, because building was never
  // an E interaction at all. B is the verb, and it now asks which.
  sections.push({ title: 'Build', note: 'press B and choose', rows: buildRows });

  // ── craft ──
  const craftRows = [];
  for (const r of Object.values(RECIPES)) {
    const p = priceOf(r.inputs, inventory);
    // Already have as many as it is worth making? Say so plainly rather than
    // showing it as available — this reads the same maxHeld the fire prompt
    // uses, and disagreeing with the prompt would make the book a liar.
    const out = Object.keys(r.outputs)[0];
    const done = !!r.maxHeld && (inventory?.countOf(out) ?? 0) >= r.maxHeld;
    craftRows.push({
      name: r.name,
      cost: p.cost,
      note: done ? 'you have one' : p.can ? `${r.seconds}s` : p.short,
      can: p.can && !done,
    });
  }
  sections.push({ title: 'Make at a fire', note: 'stand at a fire and press E', rows: craftRows });

  // ── where things come from ──
  // Only the raw materials. Listing the cooked trout's source under "where
  // things come from" would be circular — it is a recipe, and it is above.
  const rawRows = [];
  for (const id of ['wood', 'stone', 'hide', 'venison', 'fish', 'arrow']) {
    const def = ITEMS[id];
    if (!def?.source) continue;
    const have = inventory?.countOf(id) ?? 0;
    rawRows.push({ name: def.name, cost: have ? `you have ${have}` : '', note: def.source, can: have > 0 });
  }
  sections.push({ title: 'Where things come from', rows: rawRows });

  // ── WHAT WALKS HERE, AND WHEN ──
  //
  // A playtester spent two nights working this out and then said so plainly:
  // "nothing anywhere hints that goblins are nocturnal or that they live near
  // caves; I only knew where to go because I went digging." He read the source.
  //
  // Every word below is already in the species table — `nightOnly`, the
  // strangeness band, the hit points, the hit zones — and it is read at call
  // time like everything else here, so retuning a creature retunes the page.
  const beastRows = Object.values(SPECIES)
    .filter((sp) => sp.hitPoints && sp.spawn)
    .sort((x, y) => x.hitPoints - y.hitPoints)
    .map((sp) => {
      const sw = sp.spawn ?? {};
      const when = sw.nightOnly ? 'at night' : sw.dayOnly ? 'by day' : 'any hour';
      const strange = sw.strangeness?.[0] ?? 0;
      const where = strange >= 0.5 ? 'strange ground — the old places and the caves'
        : strange >= 0.25 ? 'where the country turns odd'
        : 'the ordinary glens';
      // Where to put an arrow, and how many, straight off the zone table.
      const best = [...(sp.hitZones ?? [])].sort((x, y) => y.multiplier - x.multiplier)[0];
      const shots = best ? Math.ceil(sp.hitPoints / (ARROW.damage * best.multiplier)) : null;
      return {
        name: sp.name,
        cost: `${when}, ${where}`,
        note: shots
          ? `${sp.hitPoints} hit points — ${shots} clean ${best.name} shot${shots === 1 ? '' : 's'}`
          : `${sp.hitPoints} hit points`,
        can: sp.faction === 'prey',
      };
    });
  if (beastRows.length) sections.push({ title: 'What walks here', rows: beastRows });

  // ── your animal ──
  // Every player gets one and they all differ, so "what is mine actually FOR"
  // is a real question with a different answer per save.
  const speciesId = typeof companion === 'string' ? companion : companion?.id;
  if (speciesId && COMPANIONS[speciesId]) {
    const c = COMPANIONS[speciesId];
    const rows = [{ name: c.name, cost: '', note: c.helps, can: true }];
    for (const trick of Object.values(c.tricks ?? {})) {
      rows.push({
        name: trick.name,
        cost: `${trick.reps} to learn`,
        // The power is the one worth knowing about — it is the difference
        // between a party trick and the reason this animal is yours.
        note: trick.power ? `${trick.blurb} — this is the one` : trick.blurb ?? '',
        can: true,
      });
    }
    sections.push({ title: 'Your animal', note: 'Z to choose, E to ask', rows });
  }

  return sections;
}
