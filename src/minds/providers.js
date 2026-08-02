// ── providers.js ────────────────────────────────────────────────────────────
// Where a decision comes from.
//
// One interface, `decide(brief) -> goal`, and two implementations. Everything
// upstream — the mind, the body, the world — is identical whichever is
// installed, which is the same seam trick the intents made possible for
// multiplayer. A mind is another intent producer; a provider is another mind
// producer.
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
 * A language model, when there is one.
 *
 * DISABLED BY DEFAULT AND DELIBERATELY SO. It needs a key, it costs money per
 * call, and it reaches the network — none of which should ever start happening
 * because someone pulled a repository and ran it. You turn it on explicitly:
 *
 *   MINDS_PROVIDER=claude  MINDS_API_KEY=sk-...  npm run serve
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
export class LlmProvider {
  constructor({
    apiKey,
    model = 'claude-sonnet-4-5',
    fallback,
    fetchImpl,
    timeoutMs = 4000,
    maxCalls = Infinity,
    budget = null, // a shared Budget, when several agents draw on one purse
  } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.fallback = fallback ?? new ScriptedProvider(() => 0.5);
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.timeoutMs = timeoutMs;
    this.name = 'llm';
    this.calls = 0;
    this.failures = 0;
    this.maxCalls = maxCalls;
    this.budget = budget;
    this.lastTokensIn = 0;
    this.lastTokensOut = 0;
  }

  get available() {
    return !!this.apiKey && typeof this.fetch === 'function';
  }

  systemPrompt() {
    return [
      'You are the mind of one inhabitant of a cold highland world.',
      'You are told only what your body can actually perceive. You have no map,',
      'no coordinates, and no knowledge of anyone you have not seen, heard or smelled.',
      '',
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
      const res = await this.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
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
      // Recorded so a run can report what it actually cost, rather than
      // leaving you to find out from a bill.
      this.lastTokensIn = data?.usage?.input_tokens ?? 0;
      this.lastTokensOut = data?.usage?.output_tokens ?? 0;
      this.budget?.spend(this.lastTokensIn, this.lastTokensOut);
      const text = data?.content?.[0]?.text ?? '';
      const match = text.match(/\{[\s\S]*\}/);
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
 * Build whatever the environment asks for. Scripted unless told otherwise, and
 * scripted anyway if the key is missing.
 */
export function makeProvider(rand, env = {}, { budget = null, maxCalls } = {}) {
  const scripted = new ScriptedProvider(rand);
  if ((env.MINDS_PROVIDER ?? 'scripted') !== 'claude') return scripted;
  if (!env.MINDS_API_KEY) {
    console.warn('  MINDS_PROVIDER=claude but no MINDS_API_KEY — using scripted minds');
    return scripted;
  }
  return new LlmProvider({
    apiKey: env.MINDS_API_KEY,
    model: env.MINDS_MODEL,
    fallback: scripted,
    budget,
    maxCalls,
  });
}
