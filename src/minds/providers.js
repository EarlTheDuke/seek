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
import { itemVocabulary } from '../items/registry.js';

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
/**
 * A failed HTTP reply, named well enough to act on.
 *
 * `http 429` and `http 500` used to be the whole story, and the two want
 * opposite responses: one means slow down and the other means something is
 * broken. Six agents on a six-second cadence is sixty calls a minute across two
 * vendors, so a rate limit is not an exotic case — it is Tuesday, and until now
 * it was indistinguishable from a boring model, because both ended in the same
 * silent fall-through to the scripted brain.
 *
 * `retryAfter` is seconds, off the header the vendor actually sends. Attached to
 * the error rather than acted on here so the one place that owns retry policy
 * — `decide` — stays the only place that owns it.
 */
async function httpError(res) {
  const status = res?.status ?? 0;
  const retryAfter = Number(res?.headers?.get?.('retry-after')) || null;
  let detail = '';
  try {
    const body = await res.text();
    detail = String(body ?? '').slice(0, 140).replace(/\s+/g, ' ').trim();
  } catch { /* a body we cannot read is not worth failing twice over */ }
  const named =
    status === 429 ? 'rate limited'
      : status === 529 || status === 503 ? 'vendor overloaded'
        : status === 401 || status === 403 ? 'key refused'
          : status >= 500 ? 'vendor error'
            : `http ${status}`;
  const err = new Error(
    `${named}${retryAfter ? `, retry after ${retryAfter}s` : ''}${detail ? ` — ${detail}` : ''}`
  );
  err.status = status;
  err.retryAfter = retryAfter;
  // 401/403 will never come right by waiting; 429/5xx usually will.
  err.transient = status === 429 || status >= 500;
  return err;
}

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
    // ── HOW HARD THIS MIND IS ALLOWED TO THINK ──
    //
    // Off by default, and that is a cost decision rather than a taste one:
    // thinking tokens bill as OUTPUT, and this call picks one verb out of a
    // fixed list and writes eight words of `why`. A reasoning budget spent
    // choosing between `hunt` and `goTo` buys nothing a watcher ever sees —
    // the visible reasoning is the `why` field, which costs a dozen tokens.
    //
    // It is a flag rather than a constant because one agent thinking and one
    // not, on the same persona, is a genuinely interesting thing to watch.
    think = false,
    // `low` unless told otherwise. NULL OMITS IT ENTIRELY, which is required
    // for the older models: `output_config.effort` is rejected by Haiku 4.5 and
    // Sonnet 4.5. Set `effort: null` in a roster entry for those.
    effort = 'low',
    // Enough for one line of JSON and a short reason; far more when the model
    // is thinking, because `max_tokens` caps thinking AND text together.
    maxTokens = null,
    // One retry, and only for a wait short enough to be worth having. See `ask`.
    retries = 1,
    retryBackoffMs = 400,
    retryMaxWaitMs = 5000,
  } = {}) {
    this.retries = retries;
    this.retryBackoffMs = retryBackoffMs;
    this.retryMaxWaitMs = retryMaxWaitMs;
    this.retried = 0;
    this.think = think;
    this.effort = effort;
    this.maxTokens = maxTokens ?? (think ? 1024 : 256);
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
      '  {"kind":"<verb>","<param>":"<value>","why":"<a few words>","say":"<optional>"}',
      '',
      `Verbs: ${GOAL_IDS.join(', ')}.`,
      'hunt takes quarry. approach and avoid take target. goTo takes place.',
      'gather takes an optional item — "venison" walks you to a carcass, none walks',
      'you to whatever is nearest, branch or kill.',
      // ── SPEAKING IS FREE, AND THE PROMPT HAS TO SAY SO ──
      //
      // `say` used to be a VERB, so speaking meant not hunting — a real cost,
      // built into the mechanics rather than the prompt. Across two days and
      // six models this world produced ONE sentence. It now rides along on any
      // verb, and that is worth nothing unless the model is told.
      '"say" is not a verb — add it to ANY decision and you speak while you act.',
      '  {"kind":"hunt","quarry":"deer","say":"that one is mine, I hit it"}',
      'Keep it under fifteen words and in character. It costs you nothing.',
      // ── SOMEWHERE TO PUT STEP TWO ──
      //
      // A mind worked out it had firewood and no meat, that the other had meat,
      // and that a barter solved both. It chose step one — walk over — and step
      // two existed only in the reason field and was gone by the next tick.
      // These two fields are the only thing in the brief a mind writes itself.
      '"plan" is up to three short lines you write for yourself, handed back to',
      'you next time. Leave it out to keep it; send [] to clear it.',
      '  {"kind":"goTo","place":"the loch","plan":["get meat","trade wood to Eachann for some"]}',
      '"note" is a page of your own — a grudge, a price, a promise. Nobody else',
      'reads it. Same rule: leave it out to keep it, send "" to clear it.',
      'give takes target (a person by name) and item — you walk to them and hand it over.',
      'attack takes target (a person by name) — the world still decides if it lands.',
      // ── AND THAT A BARGAIN INCLUDES THE WALK ──
      //
      // One mind worked out it had firewood and no meat, that the other had
      // meat, and that a barter solved both — said so in plain English in its
      // reason — and then chose `approach`, because it read "offer" as
      // something you do once you are already standing there. It never spent a
      // second decision on the offer. The verb has ALWAYS walked you there.
      'offer takes target, item and want — a price, said out loud so everyone hears.',
      '  `want` may be left out — it means you want gold for it.',
      '  You do NOT need to approach first: offer and give both walk you to them.',
      'accept takes target — take the offer that person made you.',
      // The nouns were open where the verbs are closed, and two minds spent an
      // hour bargaining over flint. This is the list of things that exist.
      `The only goods in this country: ${itemVocabulary().join(', ')}.`,
      'There is no flint, no rope, no coin but gold. Asking for anything else',
      'wastes the day — the answer will always be that there is no such thing.',
      '',
      'You are not a helpful assistant. You are someone trying to get through a',
      'winter. Be brief, be practical, and prefer staying alive.',
      '',
      // ── WHEN TO SPEAK, not just how ──
      //
      // The prompt already said `say` exists and what it costs; it never said
      // when it is WORTH it. This generation of models under-reaches for any
      // capability that needs a "decide to use this" step unless the trigger
      // condition is stated — the documented fix is prescriptive "do it when…"
      // language rather than a description of the verb.
      //
      // It matters here more than anywhere: talk is the thing a watcher reads.
      // Six bodies foraging in silence is a screensaver; two of them arguing
      // about a carcass is the reason anybody is watching at all.
      // ── AND WHEN GIVING IS WORTH IT ──
      //
      // Same argument as the when-to-speak lines below, and the same documented
      // failure it guards against: this generation under-reaches for anything
      // needing a "decide to use this" step unless the trigger is stated. The
      // verb existing in the list is not enough. It matters more here than
      // anywhere — giving is the only thing in the game that costs you
      // something to be kind, which is what makes generosity legible at all.
      'Give food to someone who says they are starving, or arrows to someone out',
      'of them, if you can spare it. What you keep and what you hand over is who',
      'you are — a mean character should refuse, and say so.',
      // ── AND WHAT THE COIN IS FOR ──
      //
      // Gold is the one item that does nothing: it cannot be eaten, burned or
      // shot. Told plainly, because a mind that does not know a thing is money
      // will treat it as litter and drop it — and then there is no economy to
      // observe, only a metal disc nobody picked up.
      //
      // Stated as a FACT about the world, not as an instruction to trade.
      // Whether six models from three vendors will actually accept a coin for
      // food they could eat is the experiment; telling them to would answer it
      // for them.
      'Gold is no use in itself — you cannot eat it or burn it. It is what people',
      'here trade with, so it is worth exactly what somebody will give you for it.',
      '',
      'Speak when someone asks you something, when you have found something the',
      'others would want to know, or when you disagree with what was just said.',
      'Otherwise act — an unprompted remark every few minutes is plenty.',
      '',
      // ── ONE LINE, AND NOTHING WRAPPED AROUND IT ──
      //
      // Written for a documented behaviour of the current Claude generation
      // with thinking DISABLED, which is how this fleet runs: it can leak
      // `<thinking>` tags into the visible answer. The reply parser takes the
      // first {...} it finds, so a tag OUTSIDE the braces is survivable and one
      // INSIDE is not. Cheap insurance either way.
      //
      // Deliberately phrased as "no internal tags" rather than "do not think":
      // an instruction not to reason measurably makes the leakage WORSE, which
      // is the opposite of what anybody would guess.
      'Do not include internal or system XML tags in your response.',
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

    try {
      this.calls++;
      const answer = await this.ask(brief);
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
    }
  }

  /**
   * One question, with one retry when the vendor says "not now".
   *
   * A rate limit is not an exotic case at this cadence — six agents asking
   * every six seconds is sixty calls a minute, across two vendors — and until
   * this existed a 429 was indistinguishable from a boring model: both ended in
   * the same silent fall-through to the scripted brain.
   *
   * BOUNDED ON PURPOSE. One retry, and only when the wait is short enough to be
   * worth having: a vendor asking for sixty seconds is telling you to go and be
   * a competent animal for a while, and the scripted brain is RIGHT THERE. A
   * mind that blocks for a minute is exactly the "a mind can stop the world"
   * failure this whole layer is built to prevent — the body still runs at 30 Hz
   * either way, but its deliberation would be frozen.
   *
   * A fresh AbortController per attempt, because a signal that has already
   * fired stays fired and the retry would abort before it left the building.
   */
  async ask(brief) {
    let last = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        return await this.request(brief, controller.signal);
      } catch (err) {
        last = err;
        const waitMs = err?.retryAfter ? err.retryAfter * 1000 : this.retryBackoffMs;
        const worthIt = err?.transient && attempt < this.retries && waitMs <= this.retryMaxWaitMs;
        if (!worthIt) throw err;
        this.retried = (this.retried ?? 0) + 1;
        await new Promise((r) => setTimeout(r, waitMs));
      } finally {
        clearTimeout(timer);
      }
    }
    throw last;
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
        max_tokens: this.maxTokens,
        // ── SAY WHAT YOU WANT; DO NOT INHERIT A DEFAULT ──
        //
        // Claude Opus 5 runs ADAPTIVE THINKING WHEN THIS FIELD IS ABSENT. That
        // is a change from Opus 4.8, where omitting it meant no thinking, and
        // it is not a detail: with thinking on, the first content block is a
        // THINKING block, and `max_tokens` caps thinking and text TOGETHER. The
        // 120-token budget this used to send could not reach the JSON at all.
        //
        // So the posture is always explicit. See `think` in the constructor.
        thinking: this.think ? { type: 'adaptive' } : { type: 'disabled' },
        // Omitted entirely when null — Haiku 4.5 and Sonnet 4.5 reject it.
        // Note `disabled` thinking is only legal at effort `high` or below on
        // Opus 5; `low` is comfortably inside that.
        ...(this.effort ? { output_config: { effort: this.effort } } : {}),
        // NO `temperature`, `top_p` OR `top_k`. All three are removed on Opus 5
        // and Sonnet 5 and return a 400. Variety here comes from the persona and
        // the seed, not from sampling.
        system: this.systemPrompt(),
        messages: [{ role: 'user', content: briefToText(brief) }],
      }),
    });
    if (!res.ok) throw await httpError(res);
    const data = await res.json();

    // ── NAME THE REFUSAL AND THE TRUNCATION, or they read as "rubbish reply" ──
    //
    // Both come back as a perfectly successful HTTP 200 with no usable text, so
    // without these two lines they land in the same bucket as a model that
    // answered with prose — and the board would say `no json in reply` for three
    // completely different problems. `max_tokens` in particular is the exact
    // failure mode of turning thinking on without raising the budget, and it is
    // worth being told that in those words.
    if (data?.stop_reason === 'refusal') {
      throw new Error(`refused (${data?.stop_details?.category ?? 'no category'})`);
    }

    // ── EVERY TEXT BLOCK, NOT `content[0]` ──
    //
    // THE BUG THIS FILE EXISTED WITH. `content[0]` is a THINKING block whenever
    // the model is thinking, so `.text` was `undefined`, `?? ''` made it empty,
    // and every single call fell through to the scripted brain while the startup
    // header went on printing the model's name. Silent, total, and flattering —
    // the worst shape of failure this project has.
    const text = (data?.content ?? [])
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!text && data?.stop_reason === 'max_tokens') {
      throw new Error(`ran out of tokens before answering (max_tokens ${this.maxTokens}` +
        `${this.think ? ', thinking is ON — raise it' : ''})`);
    }

    return {
      text,
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
        // ── `this.maxTokens`, NOT A LITERAL, and the literal was a real bug ──
        //
        // This said `120` while the Anthropic path six hundred lines up has
        // always used `this.maxTokens`. Nobody noticed because the models this
        // was written against answer in one line and 120 was plenty.
        //
        // A REASONING model spends this budget on reasoning FIRST and emits the
        // answer afterwards, so 120 bought a few tokens of thought and a
        // truncated `{"goal":"hunt","why":"h` — which arrives as "no json in
        // reply", a message that points at the model's manners rather than at
        // our own token cap. Measured on kimi-k2.6 through Open WebUI: the
        // reply carries a `reasoning` field beside `content`, and at 120 the
        // content is cut mid-string every time.
        //
        // `think: true` on a seat raises this to 1024, which is the knob a
        // reasoning model needs and could not previously reach.
        max_tokens: this.maxTokens,
        messages: [
          { role: 'system', content: this.systemPrompt() },
          { role: 'user', content: briefToText(brief) },
        ],
      }),
    });
    if (!res.ok) throw await httpError(res);
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
  {
    budget = null,
    maxCalls,
    character = null,
    label = null,
    // ── MINDS_THINK=on, MINDS_EFFORT=low|medium|high|none ──
    //
    // Both off the environment so a whole fleet can be switched at once, and
    // both overridable per entry so a roster can seat one thinking mind beside
    // five that answer from reflex. `none` omits `effort` altogether, which is
    // what Haiku 4.5 and Sonnet 4.5 need — they reject the field.
    think = /^(on|yes|1|true)$/i.test(env.MINDS_THINK ?? ''),
    effort = /^(none|off|)$/i.test(env.MINDS_EFFORT ?? '')
      ? (env.MINDS_EFFORT ? null : 'low')
      : env.MINDS_EFFORT,
    // ── HOW LONG THIS MIND MAY TAKE ──
    //
    // The 4 s default is right for a model that picks a verb and writes eight
    // words, and it is WRONG for a reasoning model, which spends time thinking
    // before it says anything. grok-4.5 took 2.3 s on a one-line toy prompt in
    // testing and blew straight through 4 s on the real brief — every call
    // aborted, and the board reported `This operation was aborted`, which reads
    // like a network fault and is a deadline we set ourselves.
    //
    // Per seat rather than global, because the whole point of a mixed roster is
    // that a fast model should not wait on a slow one's allowance.
    timeoutMs = Number(env.MINDS_TIMEOUT_MS) > 0 ? Number(env.MINDS_TIMEOUT_MS) : undefined,
    // Room for the whole answer. On the OpenAI shape a reasoning model spends
    // this on reasoning FIRST, so a budget sized for one line of JSON runs out
    // before the JSON. See the note in `OpenAiProvider.request`.
    maxTokens = Number(env.MINDS_MAX_TOKENS) > 0 ? Number(env.MINDS_MAX_TOKENS) : undefined,
  } = {}
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
    think,
    effort,
    // `undefined` must stay undefined so the constructor's own default stands.
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
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
