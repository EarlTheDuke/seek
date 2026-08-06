// ── providers.js ────────────────────────────────────────────────────────────
// Where a decision comes from.
//
// One interface, `decide(brief) -> goal`, and three implementations: a rule
// set, Claude, and everybody else. Everything upstream — the mind, the body,
// the world — is identical whichever is installed, which is the same seam trick
// the intents made possible for multiplayer. A mind is another intent producer;
// a provider is another mind producer.
//
// VISION.md's first constraint on this whole phase:
//
//   > Fully playable with no model at all. No key, no network, no problem —
//   > the scripted brains are the floor, not a fallback.
//
// So ScriptedProvider is the default and always present, it is deterministic,
// and it is written to be genuinely competent rather than to be embarrassing
// until the real thing arrives. If the language model never gets plugged in,
// the rival hunter is still a rival hunter.

import { GOAL_IDS, sanitiseGoal } from './goals.js';
import { briefToText } from './perception.js';

/**
 * A rule set that reads the same brief a model would.
 *
 * Deliberately built on the BRIEF rather than on world state, even though it
 * runs in-process and could cheat freely. Two reasons: it keeps the honesty
 * rule true for every mind rather than only the expensive ones, and it means
 * this provider is a working reference for what a model is being asked to do.
 * If the scripted hunter behaves sensibly on a brief, the brief is good enough.
 */
export class ScriptedProvider {
  constructor(rand) {
    this.rand = rand;
    this.name = 'scripted';
  }

  async decide(brief) {
    const threats = brief._contacts.filter((c) => THREATENING.has(c.what));
    const quarry = brief._contacts.filter((c) => QUARRY.has(c.what));
    const people = brief._contacts.filter((c) => c.what === 'a hunter' || c.what === 'someone');

    // ── survival first, and in the order a person would actually take it ──
    if (brief.health === 'nearly finished' || brief.health === 'badly hurt') {
      if (threats.length) return { kind: 'avoid', target: threats[0].what };
      return { kind: 'hold' };
    }

    // Something is coming and it is close. Distance words, not metres — the
    // rule set is held to the same information the model gets.
    const near = threats.find((t) => t.distance === 'right here' || t.distance === 'close');
    if (near) {
      // A wounded thing is worth finishing; a healthy one is worth avoiding.
      const weak = near.condition === 'badly hurt' || near.condition === 'nearly finished';
      return weak ? { kind: 'approach', target: near.what } : { kind: 'avoid', target: near.what };
    }

    // ── night in bad country is for shelter, not for hunting ──
    if (brief.light === 'dark' && brief.strangeness > 0.5) {
      return { kind: 'makeCamp' };
    }

    // ── hunger drives the hunt ──
    if (brief.hunger === 'starving' || brief.hunger === 'hungry') {
      if (quarry.length) return { kind: 'hunt', quarry: quarry[0].what };
    }

    // ── another person: greet them, then get on with it ──
    if (people.length && this.rand() < 0.35) {
      const who = people[0];
      return {
        kind: 'say',
        text: pick(GREETINGS, this.rand()).replace('{where}', brief.place),
      };
    }

    if (quarry.length && this.rand() < 0.7) return { kind: 'hunt', quarry: quarry[0].what };
    if (brief.light === 'dark') return { kind: 'makeCamp' };

    // ── pick up firewood on the way past ──
    // Below the hunt and above the aimless walk, which is where it belongs: a
    // person crossing woodland with nothing pressing picks up a branch, and a
    // person with a deer in sight does not stop to do it.
    //
    // This existed as a verb before anything ever chose it. The rule set is the
    // floor every mind falls back to, so a verb the floor never reaches for is
    // a verb that is only exercised when somebody is paying for a model — which
    // is the wrong way round for the one brain that is meant to prove the game
    // is playable without one.
    if (this.rand() < 0.4) return { kind: 'gather' };
    return { kind: 'wander' };
  }
}

const THREATENING = new Set(['a bear', 'a goblin', 'a troll']);
const QUARRY = new Set(['a deer']);
const GREETINGS = [
  'aye',
  'cold, is it not',
  'there are deer down the glen',
  'I would not go up there after dark',
  'mind the bog',
  'have you seen the stones?',
];
const pick = (list, r) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/**
 * A language model, when there is one — WHICHEVER one.
 *
 * DISABLED BY DEFAULT AND DELIBERATELY SO. It needs a key, it costs money per
 * call, and it reaches the network — none of which should ever start happening
 * because someone pulled a repository and ran it. You turn it on explicitly:
 *
 *   MINDS_PROVIDER=anthropic MINDS_API_KEY=sk-...  npm run serve
 *   MINDS_PROVIDER=xai MINDS_MODEL=grok-4 MINDS_API_KEY=xai-...  npm run serve
 *
 * This class is everything the two wire formats have in common, which turns out
 * to be almost all of it: the budget, the timeout, the fallback, the system
 * prompt, and turning a blob of text into a legal goal. A subclass supplies
 * `request()` and nothing else. That split is what makes "six models from six
 * companies in one world" a roster file rather than six code paths.
 *
 * Everything about the design keeps the blast radius small:
 *
 *   * SERVER-SIDE ONLY. VISION.md: "Clients never hold keys or call out." This
 *     module is imported by the server and by the headless world, never by the
 *     browser bundle.
 *   * CONSTRAINED OUTPUT. The reply is parsed for one of a closed list of
 *     verbs and thrown away otherwise. A model cannot invent an action.
 *   * BOUNDED COST. One mind per warband, not one per goblin, on a cadence
 *     measured in seconds, with a brief measured in hundreds of tokens.
 *   * A FLOOR UNDER IT. Every failure — no key, timeout, rubbish reply, rate
 *     limit — falls through to the scripted provider, and the creature carries
 *     on being a competent animal. There is no failure mode where a mind stops
 *     the world.
 */
export class ModelProvider {
  constructor({
    apiKey,
    model,
    baseUrl,
    fallback,
    fetchImpl,
    timeoutMs = 4000,
    maxCalls = Infinity,
    budget = null, // a shared Budget, when several agents draw on one purse
    // ── WHO THIS ONE IS ──
    //
    // A sentence or two of character, threaded into the system prompt. Null is
    // the plain inhabitant everybody used to be — and everybody DID used to be,
    // which was the problem: `systemPrompt()` returned identical text for every
    // agent in the world, so the only difference between two players was the
    // model's own randomness and the name over their head.
    //
    // Character only SHOWS under pressure. A hoarder with infinite firewood is
    // indistinguishable from a generous one; see the roster's note on scarcity.
    character = null,
  } = {}) {
    this.apiKey = apiKey;
    this.model = model ?? this.defaultModel;
    this.baseUrl = baseUrl ?? this.defaultBaseUrl;
    this.fallback = fallback ?? new ScriptedProvider(() => 0.5);
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.timeoutMs = timeoutMs;
    this.character = character;
    this.name = 'llm';
    this.calls = 0;
    this.failures = 0;
    this.maxCalls = maxCalls;
    this.budget = budget;
    this.lastTokensIn = 0;
    this.lastTokensOut = 0;
  }

  get defaultModel() {
    return null;
  }

  get defaultBaseUrl() {
    return null;
  }

  get available() {
    return !!this.apiKey && typeof this.fetch === 'function';
  }

  /**
   * Ask, once. The only thing a subclass has to write.
   * @returns {Promise<{text: string, tokensIn: number, tokensOut: number}>}
   */
  async request() {
    throw new Error('a provider must say how it asks');
  }

  systemPrompt() {
    return [
      'You are the mind of one inhabitant of a cold highland world.',
      'You are told only what your body can actually perceive. You have no map,',
      'no coordinates, and no knowledge of anyone you have not seen, heard or smelled.',
      '',
      // ── who you are, if anybody said ──
      // Above the verbs on purpose: it is meant to colour every choice below
      // it, not to read as a footnote after the rules.
      ...(this.character ? ['Who you are:', this.character, ''] : []),
      'Reply with ONE line of JSON and nothing else:',
      '  {"kind":"<verb>","<param>":"<value>","why":"<a few words>"}',
      '',
      `Verbs: ${GOAL_IDS.join(', ')}.`,
      'hunt takes quarry. approach and avoid take target. goTo takes place.',
      'say takes text — keep it under fifteen words and in character.',
      '',
      'You are not a helpful assistant. You are someone trying to get through a',
      'winter. Be brief, be practical, and prefer staying alive.',
    ].join('\n');
  }

  async decide(brief) {
    if (!this.available) return this.fallback.decide(brief);

    // ── the ceiling ──
    // Checked BEFORE the call, never after. Running out of budget is not an
    // error: every agent falls back to its scripted brain and the game carries
    // on being fully playable, which is the whole point of the floor existing.
    if (this.calls >= this.maxCalls) return this.fallback.decide(brief);
    if (this.budget && !this.budget.take()) return this.fallback.decide(brief);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      this.calls++;
      const answer = await this.request(brief, controller.signal);
      // Recorded so a run can report what it actually cost, rather than
      // leaving you to find out from a bill.
      this.lastTokensIn = answer?.tokensIn ?? 0;
      this.lastTokensOut = answer?.tokensOut ?? 0;
      this.budget?.spend(this.lastTokensIn, this.lastTokensOut);
      const match = String(answer?.text ?? '').match(/\{[\s\S]*\}/);
      if (!match) throw new Error('no json in reply');
      const goal = sanitiseGoal(JSON.parse(match[0]));
      if (!goal) throw new Error('no legal verb in reply');
      return goal;
    } catch (err) {
      // Every failure lands here, and every failure means "carry on being a
      // competent animal". A mind that can stop the world is not a mind, it is
      // a dependency.
      this.failures++;
      this.lastError = err.message;
      return this.fallback.decide(brief);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Claude, over the Messages API.
 *
 * Raw HTTP rather than the official SDK, and deliberately: this file has to
 * speak two wire formats through one set of plumbing, and the whole repository
 * has three dependencies. One `fetch` is smaller than the seam it would take to
 * hold an SDK and a raw client side by side.
 */
export class AnthropicProvider extends ModelProvider {
  constructor(opts = {}) {
    super(opts);
    this.name = 'anthropic';
  }

  /**
   * The current family. This said `claude-sonnet-4-5` for a long time, which is
   * two generations behind — a default nobody sets is a default nobody notices,
   * and it would have been the model playing tomorrow night.
   */
  get defaultModel() {
    return 'claude-opus-5';
  }

  get defaultBaseUrl() {
    return 'https://api.anthropic.com';
  }

  async request(brief, signal) {
    const res = await this.fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 120,
        system: this.systemPrompt(),
        messages: [{ role: 'user', content: briefToText(brief) }],
      }),
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = await res.json();
    return {
      text: data?.content?.[0]?.text ?? '',
      tokensIn: data?.usage?.input_tokens ?? 0,
      tokensOut: data?.usage?.output_tokens ?? 0,
    };
  }
}

/**
 * Everybody else, over the OpenAI chat-completions shape.
 *
 * ONE CLASS COVERS NEARLY THE WHOLE FIELD. xAI, Moonshot, DeepSeek, OpenRouter,
 * Together, Groq, Mistral and a llama.cpp server on the machine under the desk
 * all speak this: `POST {base}/chat/completions`, a bearer token, a messages
 * array, `choices[0].message.content` back. So the difference between "Grok is
 * playing" and "Kimi is playing" is a base URL and a model string — a line in a
 * roster file rather than a new file in this directory.
 *
 * The BASE URL is the whole configuration and it is required: there is no
 * sensible default because there is no default vendor. Give it the root that
 * ends in `/v1` and this appends the rest.
 */
export class OpenAiProvider extends ModelProvider {
  constructor(opts = {}) {
    super(opts);
    this.name = 'openai-compatible';
  }

  async request(brief, signal) {
    if (!this.baseUrl) throw new Error('no base url — this provider needs one');
    if (!this.model) throw new Error('no model — this provider needs one');
    const res = await this.fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 120,
        messages: [
          { role: 'system', content: this.systemPrompt() },
          { role: 'user', content: briefToText(brief) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = await res.json();
    return {
      // `content` is where every one of them puts it. A reasoning model may
      // ALSO return `reasoning_content`; this does not read it — the contract
      // is one line of JSON, and a mind that needs its own thinking quoted back
      // is a mind with a different contract.
      text: data?.choices?.[0]?.message?.content ?? '',
      tokensIn: data?.usage?.prompt_tokens ?? 0,
      tokensOut: data?.usage?.completion_tokens ?? 0,
    };
  }
}

// The old name, kept because two servers and three checks import it. It has
// always meant "the Anthropic one".
export { AnthropicProvider as LlmProvider };

/**
 * A shared purse.
 *
 * Several agents drawing on one budget, so "twelve players" cannot cost twelve
 * times what one does without anybody noticing. Deliberately a hard stop rather
 * than a warning: an unattended process that can keep spending is the failure
 * mode worth engineering against, and the consequence of running out here is
 * only that the world goes back to scripted brains.
 */
export class Budget {
  constructor({ maxCalls = Infinity, label = 'session' } = {}) {
    this.maxCalls = maxCalls;
    this.label = label;
    this.calls = 0;
    this.tokensIn = 0;
    this.tokensOut = 0;
    this.exhaustedAt = null;
  }

  /** Reserve one call. False once the purse is empty. */
  take() {
    if (this.calls >= this.maxCalls) {
      this.exhaustedAt ??= this.calls;
      return false;
    }
    this.calls++;
    return true;
  }

  spend(inTokens, outTokens) {
    this.tokensIn += inTokens;
    this.tokensOut += outTokens;
  }

  get spent() {
    return {
      calls: this.calls,
      of: this.maxCalls,
      tokensIn: this.tokensIn,
      tokensOut: this.tokensOut,
      exhausted: this.calls >= this.maxCalls,
    };
  }
}

/**
 * Where each vendor lives.
 *
 * CONVENIENCE ONLY — every one of these is the same OpenAI-compatible class
 * with a base URL filled in, and any of them can be reached by setting
 * `MINDS_BASE_URL` by hand instead. They are here because
 * `MINDS_PROVIDER=moonshot` is a thing somebody can type from memory at nine in
 * the evening and a base URL is not.
 */
const VENDORS = {
  xai: 'https://api.x.ai/v1',
  grok: 'https://api.x.ai/v1',
  moonshot: 'https://api.moonshot.ai/v1',
  kimi: 'https://api.moonshot.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  together: 'https://api.together.xyz/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  openai: 'https://api.openai.com/v1',
  // llama.cpp / Ollama / LM Studio on this machine. Most of them want no key at
  // all, which is why a local base URL is the one case that runs without one.
  local: 'http://127.0.0.1:8080/v1',
};

export const PROVIDER_NAMES = ['scripted', 'anthropic', 'claude', ...Object.keys(VENDORS)];

/** Is this a model running on the same machine, which needs no key? */
const isLocal = (url) => /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])/.test(url ?? '');

/**
 * Build whatever the environment asks for. Scripted unless told otherwise, and
 * scripted anyway if the key is missing.
 *
 *   MINDS_PROVIDER   scripted (default) | anthropic | claude | xai | moonshot | ...
 *   MINDS_BASE_URL   any OpenAI-compatible root; overrides the vendor table
 *   MINDS_MODEL      whatever that vendor calls the model
 *   MINDS_API_KEY    the key, out of the environment, never out of a file
 *
 * @param {object} [o]
 * @param {string} [o.character]  who this particular mind is, if anybody said
 * @param {string} [o.label]      whose warning this is, when several are built
 */
export function makeProvider(
  rand,
  env = {},
  { budget = null, maxCalls, character = null, label = null } = {}
) {
  const scripted = new ScriptedProvider(rand);
  const kind = String(env.MINDS_PROVIDER ?? 'scripted').toLowerCase();
  if (kind === 'scripted') return scripted;

  const who = label ? `${label}: ` : '';
  const common = {
    apiKey: env.MINDS_API_KEY,
    model: env.MINDS_MODEL,
    fallback: scripted,
    budget,
    maxCalls,
    character,
  };

  if (kind === 'claude' || kind === 'anthropic') {
    if (!env.MINDS_API_KEY) {
      console.warn(`  ${who}MINDS_PROVIDER=${kind} but no MINDS_API_KEY — using scripted minds`);
      return scripted;
    }
    return new AnthropicProvider({ ...common, baseUrl: env.MINDS_BASE_URL });
  }

  const baseUrl = env.MINDS_BASE_URL ?? VENDORS[kind];
  if (!baseUrl) {
    console.warn(
      `  ${who}no such provider as "${kind}" — using scripted minds\n` +
        `    known: ${PROVIDER_NAMES.join(', ')} (or set MINDS_BASE_URL)`
    );
    return scripted;
  }
  if (!env.MINDS_API_KEY && !isLocal(baseUrl)) {
    console.warn(`  ${who}MINDS_PROVIDER=${kind} but no MINDS_API_KEY — using scripted minds`);
    return scripted;
  }
  return new OpenAiProvider({ ...common, apiKey: env.MINDS_API_KEY ?? 'local', baseUrl });
}
