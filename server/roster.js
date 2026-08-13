// ── roster.js ───────────────────────────────────────────────────────────────
// Who is playing, on what model, and as whom.
//
//   MINDS_ROSTER=roster.json npm run agents
//
// A fleet used to be N copies of one setting: one provider, one model, one
// system prompt, and names off a list. That is fine for testing whether an
// agent can walk and useless for the thing this is actually for — sitting down
// with several minds from several companies and watching them disagree.
//
// So the roster is a small JSON file, and it is the ONE place that says a
// player exists. Everything about that player is on its line: which vendor
// answers for it, which model, and a sentence of character that goes into its
// system prompt and nobody else's.
//
// KEYS ARE NAMED, NOT WRITTEN. An entry carries `keyEnv` — the NAME of an
// environment variable — never the key itself. A roster is a thing you check
// into a repository and paste into a chat window; a file format that invites
// you to type `sk-...` into it will eventually have `sk-...` in it. There is no
// field for a literal key and adding one would be a mistake.
//
// Everything is optional except a name. An entry with nothing else is a
// scripted player, which is also what an entry becomes when its key is absent —
// the same floor every other part of this system falls back to.
//
// {
//   "budgetCalls": 400,
//   "players": [
//     { "name": "Eachann", "provider": "anthropic", "model": "claude-opus-5",
//       "keyEnv": "ANTHROPIC_API_KEY",
//       "character": "You hoard. Firewood is yours and you do not share a fire." },
//     { "name": "Morag", "provider": "xai", "model": "grok-4",
//       "keyEnv": "XAI_API_KEY",
//       "character": "You are generous to a fault and slow to notice you are being used." },
//     { "name": "Tormod", "provider": "moonshot", "model": "kimi-k2",
//       "keyEnv": "MOONSHOT_API_KEY",
//       "character": "You lie about where the deer are. Not maliciously — you want to get there first." },
//     { "name": "Ailsa", "provider": "local", "model": "qwen3", "baseUrl": "http://127.0.0.1:8080/v1",
//       "character": "You break off any fight below half health and say so plainly." }
//   ]
// }

import { readFileSync } from 'node:fs';
import { makeProvider } from '../src/minds/providers.js';
import { makeRandom } from '../src/world/noise.js';

/**
 * Read a roster off disk. Throws only if the file is unreadable or not JSON —
 * a roster that is present and wrong should say so loudly, because the failure
 * mode it prevents is a fleet that silently runs six scripted players while you
 * believe you are paying for six models.
 */
export function loadRoster(path) {
  const raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  const players = Array.isArray(data) ? data : data.players;
  if (!Array.isArray(players) || players.length === 0) {
    throw new Error(`${path}: no players in it`);
  }
  return {
    budgetCalls: Number(data.budgetCalls) || null,
    players: players.map((p, i) => ({
      name: String(p.name ?? `player ${i + 1}`).slice(0, 18),
      provider: p.provider ? String(p.provider).toLowerCase() : 'scripted',
      model: p.model ? String(p.model) : undefined,
      baseUrl: p.baseUrl ? String(p.baseUrl) : undefined,
      keyEnv: p.keyEnv ? String(p.keyEnv) : undefined,
      character: p.character ? String(p.character) : null,
      pet: p.pet ? String(p.pet) : null,
      // ── UNDEFINED IS NOT 'decides' ──
      //
      // This said `p.orders === 'obeys' ? 'obeys' : 'decides'`, which turned a
      // roster line that said NOTHING about orders into one that said
      // 'decides' — and agents.js resolves the mode as `entry?.orders ??
      // ORDERS`, so the `??` could never fire and the ORDERS ENVIRONMENT
      // VARIABLE WAS SILENTLY DEAD for every run that used a roster. Which is
      // every real run.
      //
      // The cost of that was two whole nights of a playtester's time. He was
      // set the task of recruiting the agents to help kill a troll, could not,
      // read the source to find out why, and correctly identified `decides` as
      // the reason — then told us "if you flip the orders setting to obey, I'd
      // like another go". Flipping it would not have worked either.
      //
      // A default that overwrites the thing it is defaulting FOR is not a
      // default. Undefined stays undefined and the caller decides.
      orders: p.orders === 'obeys' ? 'obeys' : (p.orders === 'decides' ? 'decides' : undefined),
      // ── HOW THIS ONE THINKS, AND HOW OFTEN ──
      //
      // `think` turns adaptive thinking on for this seat alone and raises its
      // token budget to match — one thinking mind beside five that answer from
      // reflex is a genuinely interesting thing to watch, and it is one line.
      //
      // `effort` may be null DELIBERATELY: `output_config.effort` is rejected by
      // Haiku 4.5 and Sonnet 4.5, so an entry on one of those needs
      // `"effort": null` to have the field omitted rather than sent and 400ed.
      // `undefined` means "not stated, use the default"; null means "send none".
      // A boolean is a STATED choice; anything else is "not stated", which must
      // stay undefined so the MINDS_THINK environment default still applies.
      think: typeof p.think === 'boolean' ? p.think : undefined,
      effort: p.effort === null ? null : (p.effort ? String(p.effort) : undefined),
      // Seconds between deliberations for this mind. The BODY is unaffected —
      // reflex runs at 30 Hz regardless — so this is the cost lever that costs
      // a watcher nothing. See the deliberation gate in agent.js.
      cadenceSeconds: Number(p.cadenceSeconds) > 0 ? Number(p.cadenceSeconds) : undefined,
      // How long this mind may take before the call is abandoned. The 4 s
      // default suits a model that picks a verb; a REASONING model thinks
      // first and needs far longer. Measured: grok-4.5 aborted on every call
      // at 4 s, and the board said `This operation was aborted` — which reads
      // as a network fault and is a deadline we set ourselves.
      timeoutSeconds: Number(p.timeoutSeconds) > 0 ? Number(p.timeoutSeconds) : undefined,
      // Room for the whole answer. `think: true` buys 1024, which is right for
      // a model that thinks a little; a model that thinks a LOT needs more,
      // because on the OpenAI shape the reasoning is spent out of this same
      // budget before a single character of the answer is written. Measured on
      // kimi-k2.6: 1,173-1,664 characters of reasoning per decision, so 1024
      // ran out mid-JSON on the longer briefs and arrived as "no json in
      // reply" — a message about the model's manners, for a cap of ours.
      maxTokens: Number(p.maxTokens) > 0 ? Number(p.maxTokens) : undefined,
    })),
  };
}

/**
 * Move every mind one seat along, so a MODEL is not welded to a PERSONA.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * On 2026-08-12 two runs of the same roster reached OPPOSITE verdicts on
 * grok-4.6 — 3 kills from 24 answers in one, 1 from 135 in the next. Nothing
 * about the model changed. What differed was the seat: a name, a written
 * character, a spawn point and whoever happened to be standing nearby.
 *
 * Every model in this project is welded to one seat, so "grok-4.6 hunts well"
 * and "Ailsa's spawn is near the deer" are the same sentence and cannot be told
 * apart. **Until this exists, no model claim from this project is quotable.**
 *
 * ── THE SPLIT THAT MAKES IT WORK ───────────────────────────────────────────
 *
 * A SEAT is a name, a character and where it wakes up. A MIND is a provider, a
 * model, and THE OPERATING PARAMETERS THAT MODEL NEEDS. The second half is the
 * part that is easy to get wrong: cadence, timeout and token ceiling belong to
 * the MIND and must travel with it. grok-4.6 thinks for 26 seconds — drop it
 * into a seat on a 12-second cadence and you have built a queue, and a queue is
 * how a good model is made to look broken. Measured, on this roster.
 *
 * ── AND THE CONTROL NEVER MOVES ────────────────────────────────────────────
 *
 * A seat with no provider is scripted ON PURPOSE — Iseabail is the reference
 * for whether a startling thing was the model or the world, and she has
 * out-performed the whole field twice. Rotation skips those seats entirely, so
 * the control stays a control and never quietly acquires a model.
 *
 * `by = 0` returns the roster UNCHANGED, byte for byte. That is the same
 * discipline `personacheck` holds the persona control to: an experiment whose
 * off-state has drifted is measuring two things at once.
 */
export function rotateMinds(roster, by = 0) {
  const shift = Math.trunc(Number(by) || 0);
  if (!shift) return roster;

  // Everything that describes HOW A MIND THINKS travels; everything that
  // describes WHO IS SITTING THERE stays. Listed rather than inferred, because
  // a field added later must be classified deliberately — a new model knob that
  // silently stayed behind would confound the very comparison this enables.
  const MIND_FIELDS = [
    'provider', 'model', 'keyEnv', 'baseUrl',
    'cadenceSeconds', 'timeoutSeconds', 'maxTokens', 'think', 'effort',
  ];

  const players = roster.players.map((p) => ({ ...p }));
  // ── WHAT COUNTS AS A SEAT WITH A MIND IN IT ──
  //
  // `p.provider` is the WRONG test and cost a real bug: `loadRoster` fills an
  // absent provider with the string `'scripted'`, which is truthy, so a naive
  // filter swept the control into the rotation. Caught by running this against
  // the actual roster file rather than a hand-built one — at ROTATE=1 Eachann
  // went scripted and ISEABAIL ACQUIRED A KIMI MODEL, which would have silently
  // destroyed the control arm in every rotated run.
  //
  // A seat has a mind when it NAMES A MODEL. That is the same thing
  // `describeRoster` prints and `providerFor` acts on.
  const hasMind = (p) => !!p.model && p.provider !== 'scripted';
  const seated = players.map((p, i) => (hasMind(p) ? i : -1)).filter((i) => i >= 0);
  if (seated.length < 2) return roster;

  const minds = seated.map((i) => {
    const m = {};
    for (const f of MIND_FIELDS) m[f] = players[i][f];
    return m;
  });
  // Positive `by` moves each mind FORWARD to the next model seat, which is what
  // "rotate the roster" reads as. Modulo the seat count, so ROTATE equal to the
  // number of seats is the identity again.
  const n = seated.length;
  seated.forEach((seatIndex, k) => {
    const from = ((k - shift) % n + n) % n;
    Object.assign(players[seatIndex], minds[from]);
  });
  return { ...roster, players, rotatedBy: ((shift % n) + n) % n };
}

/**
 * Turn one roster line into a provider.
 *
 * The environment it hands `makeProvider` is BUILT, not the process's own: the
 * whole point is that six players in one process each get a different vendor, a
 * different model and a different key, and `MINDS_*` is one set of variables.
 * Reading the key by NAME out of `env` here is what keeps the roster file free
 * of secrets.
 */
export function providerFor(entry, { env = process.env, budget = null, maxCalls, index = 0, persona = null } = {}) {
  const scriptedRand = makeRandom(`agent:${entry.name}:${index}`);
  return makeProvider(
    scriptedRand,
    {
      MINDS_PROVIDER: entry.provider,
      MINDS_MODEL: entry.model,
      MINDS_BASE_URL: entry.baseUrl,
      MINDS_API_KEY: entry.keyEnv ? env[entry.keyEnv] : undefined,
    },
    {
      budget,
      maxCalls,
      // A hand-written character in the file always wins over one dealt by
      // PERSONAS — somebody who typed it out meant it. See minds/personas.js.
      character: entry.character ?? persona?.character ?? null,
      label: entry.name,
      // Per-seat, and `undefined` means "not stated" so `makeProvider` falls
      // back to the MINDS_* environment default rather than to a hard-coded
      // one. `effort: null` is a STATED choice and must survive as null.
      ...(entry.think === undefined ? {} : { think: entry.think }),
      ...(entry.effort === undefined ? {} : { effort: entry.effort }),
      ...(entry.timeoutSeconds === undefined ? {} : { timeoutMs: entry.timeoutSeconds * 1000 }),
      ...(entry.maxTokens === undefined ? {} : { maxTokens: entry.maxTokens }),
    }
  );
}

/** One line per player, for the console — what is actually about to play. */
export function describeRoster(roster, providers) {
  return roster.players.map((p, i) => {
    const prov = providers[i];
    const brain = prov.name === 'scripted'
      ? 'scripted'
      : `${prov.name} · ${prov.model}`;
    const key = p.keyEnv && prov.name === 'scripted' ? ` (no ${p.keyEnv})` : '';
    return `    ${p.name.padEnd(12)} ${brain}${key}` +
      (p.character ? `\n      "${p.character.slice(0, 88)}${p.character.length > 88 ? '…' : ''}"` : '');
  });
}
