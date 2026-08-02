// ── ruleset.js ──────────────────────────────────────────────────────────────
// What is allowed, as data.
//
// The alternative — scattering `if (survival)` through every system — is how a
// game mode becomes impossible to reason about. Here a mode is a row, every
// system asks the same object, and adding "hardcore" or "photo" later is
// another row rather than another twenty branches.
//
// Rules are permissions, never behaviour. A ruleset says whether flying is
// allowed; it never says what flying does.

export const RULESETS = {
  survival: {
    id: 'survival',
    name: 'Survival',
    tagline: 'no flying, no shortcuts, and the sun sets when it sets',

    // Capabilities the sandbox tooling exposes. All off here on purpose: the
    // point of the mode is that the world does not bend for you.
    allowFly: false,
    allowTimeControl: false, // no scrubbing or pausing the clock
    allowWeatherControl: false,
    allowSpawning: false, // no conjuring creatures or loot
    allowWarp: false, // no teleporting

    persist: true,
    autosaveSeconds: 25,

    // Placeholders for Phase 2, declared now so the shape is settled.
    hunger: false,
    temperature: false,
  },

  sandbox: {
    id: 'sandbox',
    name: 'Sandbox',
    tagline: 'every tool unlocked, for building and testing and looking around',

    allowFly: true,
    allowTimeControl: true,
    allowWeatherControl: true,
    allowSpawning: true,
    allowWarp: true,

    // Deliberately does not persist. Sandbox is a scratchpad; a scratchpad that
    // remembers yesterday's experiments is worse than one that does not.
    persist: false,
    autosaveSeconds: 0,

    hunger: false,
    temperature: false,
  },
};

export const DEFAULT_MODE = 'survival';

/** Look up a ruleset, falling back rather than throwing on a bad id. */
export function getRuleset(id) {
  return RULESETS[id] ?? RULESETS[DEFAULT_MODE];
}

/**
 * Wrap a sandbox-only helper so it refuses politely in Survival instead of
 * silently working. Returning a string keeps console helpers self-documenting.
 */
export function gated(ruleset, capability, fn, what = 'that') {
  return (...args) => {
    if (!ruleset.current[capability]) return `${what} is disabled in ${ruleset.current.name}`;
    return fn(...args);
  };
}

/** Mutable holder, so systems capture a reference rather than a snapshot. */
export class ActiveRuleset {
  constructor(id = DEFAULT_MODE) {
    this.current = getRuleset(id);
  }

  set(id) {
    this.current = getRuleset(id);
    return this.current;
  }

  get id() {
    return this.current.id;
  }

  allows(capability) {
    return !!this.current[capability];
  }
}
