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
