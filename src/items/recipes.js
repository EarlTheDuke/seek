// ── recipes.js ──────────────────────────────────────────────────────────────
// Turning things into other things, as data.
//
// Small on purpose. The interesting property is that a recipe declares its
// REQUIREMENTS rather than its interface: what it consumes, and what the world
// must provide (a fire, later a workbench, an anvil, daylight). Phase 7's
// building recipes and Phase 3's fletching drop into the same table without the
// crafting code learning anything new.

export const RECIPES = {
  // The axe is first because it is the one thing here that changes what you can
  // DO rather than how comfortable you are, and because — like the cloak — it
  // is a one-off. Anything above it would shadow it forever.
  //
  // Stone, a haft and something to lash it with, at a fire, which is exactly
  // the list a person would actually need. Nothing about it is a recipe in the
  // sense of a menu: you have been carrying all three for hours without knowing
  // they added up to something.
  make_axe: {
    id: 'make_axe',
    name: 'Knap a Hand Axe',
    inputs: { stone: 2, wood: 1, hide: 1 },
    outputs: { axe: 1 },
    requires: 'fire',
    seconds: 16,
    verb: 'knap',
    maxHeld: 1,
  },

  // The cloak comes next because it is also a one-off you will rarely be able
  // to make — put cooking above it and you can never stitch anything while
  // carrying meat.
  make_cloak: {
    id: 'make_cloak',
    name: 'Stitch a Hide Cloak',
    inputs: { hide: 3 },
    outputs: { cloak: 1 },
    requires: 'fire', // somewhere to sit and work
    seconds: 12,
    verb: 'stitch',
    // Stop offering it once you have one — otherwise it would shadow cooking
    // forever for anyone who keeps hides.
    maxHeld: 1,
  },

  cook_venison: {
    id: 'cook_venison',
    name: 'Cook Venison',
    inputs: { venison: 1 },
    outputs: { venison_cooked: 1 },
    requires: 'fire',
    seconds: 22,
    // Shown on the interaction prompt.
    verb: 'cook',
  },

  fletch_arrows: {
    id: 'fletch_arrows',
    name: 'Fletch Arrows',
    inputs: { wood: 2 },
    outputs: { arrow: 4 },
    requires: 'fire',
    seconds: 10,
    verb: 'fletch',
  },
};

/** Does the inventory hold everything this recipe needs? */
export function canCraft(recipe, inventory) {
  for (const [item, n] of Object.entries(recipe.inputs)) {
    if (inventory.countOf(item) < n) return false;
  }
  return true;
}

/** Consume inputs and grant outputs. Returns a description, or null on failure. */
export function craft(recipe, inventory) {
  if (!canCraft(recipe, inventory)) return null;
  for (const [item, n] of Object.entries(recipe.inputs)) inventory.remove(item, n);
  const made = [];
  for (const [item, n] of Object.entries(recipe.outputs)) {
    inventory.add(item, n);
    made.push(`${n} ${item.replace(/_/g, ' ')}`);
  }
  return made.join(', ');
}

/**
 * The best thing you could make right now at a given station.
 *
 * Ordered by the table, so putting the most-wanted recipe first is how you
 * control what the prompt offers. Good enough until there is a crafting UI,
 * and it keeps the whole interaction to one key.
 */
export function bestAvailable(station, inventory) {
  for (const r of Object.values(RECIPES)) {
    if (r.requires !== station) continue;
    if (!canCraft(r, inventory)) continue;
    // Already have as many as this recipe is worth making? Move on, so it does
    // not permanently shadow everything below it.
    if (r.maxHeld) {
      const out = Object.keys(r.outputs)[0];
      if (inventory.countOf(out) >= r.maxHeld) continue;
    }
    return r;
  }
  return null;
}
