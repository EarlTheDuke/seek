// ── danger.js ───────────────────────────────────────────────────────────────
// How much of the world is trying to kill you.
//
// A separate axis from the ruleset on purpose. A ruleset says what you are
// ALLOWED to do — fly, scrub the clock, conjure a deer — and this says what the
// world will do to you. They are genuinely independent: wanting the full
// survival body without a bear stalking you is a coherent way to play, and
// folding it into the mode list would have forced a combinatorial explosion of
// rows the moment anybody wanted "sandbox but peaceful" too.
//
// WHY THIS EXISTS. A bear is the hardest thing in this game by a distance, and
// hard in a specific way: it is faster than you, it does not panic, and by the
// time you have seen it the decision that mattered was made a minute ago. That
// is good design for someone who wants it and a wall for someone who does not,
// including people playing with one hand, people who find being stalked
// genuinely unpleasant, and — the reason this got built today — an agent
// driving the game through a browser, which cannot react in the tenth of a
// second a bear charge gives you.
//
// It is set THREE ways because the thing that needs it most cannot use a menu:
//
//   ?danger=none        in the URL — the only one an automated player can rely
//                       on, because it needs no clicking and survives a reload
//   the start screen    for a person
//   highlands.danger()  at runtime, which also clears out anything already
//                       roaming rather than only affecting future spawns

import { SPECIES } from '../creatures/registry.js';

const KEY = 'highlands.danger';

export const DANGER_LEVELS = {
  full: {
    id: 'full',
    name: 'Everything',
    tagline: 'bears, goblins and whatever is out past the moss',
    banned: () => [],
  },
  'no-bears': {
    id: 'no-bears',
    name: 'No bears',
    tagline: 'the rest of the world as it is, minus the one that hunts you',
    banned: () => ['bear'],
  },
  none: {
    id: 'none',
    name: 'Nothing hostile',
    tagline: 'deer, weather, cold and hunger — the world still kills, slowly',
    // Derived from the registry rather than listed, so adding a wolf to
    // creatures/registry.js makes it peaceful-aware for free. Listing species
    // here would mean every new predator silently ignored this setting until
    // somebody remembered — which is exactly the failure this codebase keeps
    // finding in seams between tables and the code that reads them.
    banned: () => Object.values(SPECIES).filter((s) => s.faction !== 'prey').map((s) => s.id),
  },
};

export const DEFAULT_DANGER = 'full';

export const getDangerLevel = (id) => DANGER_LEVELS[id] ?? DANGER_LEVELS[DEFAULT_DANGER];

/** The species ids that must not spawn at a given level. */
export function bannedSpecies(id) {
  return new Set(getDangerLevel(id).banned());
}

/**
 * What the player asked for: the URL wins, then whatever they chose last time.
 *
 * The URL winning matters — it is how an automated player configures itself,
 * and a remembered setting silently overriding an explicit `?danger=none`
 * would be the worst kind of surprise for something that cannot see a menu.
 */
export function readDanger(search = typeof location === 'undefined' ? '' : location.search) {
  const fromUrl = new URLSearchParams(search).get('danger');
  if (fromUrl && DANGER_LEVELS[fromUrl]) return fromUrl;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && DANGER_LEVELS[saved]) return saved;
  } catch { /* private browsing, no storage — the default is fine */ }
  return DEFAULT_DANGER;
}

export function writeDanger(id) {
  try {
    localStorage.setItem(KEY, getDangerLevel(id).id);
  } catch { /* nothing to do; it just will not persist */ }
  return getDangerLevel(id).id;
}
