// ── providercheck.js ────────────────────────────────────────────────────────
// Can a mind be somebody else's model?
//
//   npm run providercheck
//
// NO KEYS, NO NETWORK, NO COST. This check stands up a real HTTP server on
// 127.0.0.1 that answers in the two wire shapes the world speaks — Anthropic's
// Messages API and the OpenAI chat-completions shape everyone else uses — and
// points real providers at it. Every assertion is about bytes actually sent and
// bytes actually parsed, which is the only part of a provider layer that can
// be wrong in an interesting way.
//
// That matters because the alternative is finding out tomorrow evening, with
// six keys in the environment and people watching, that the field the reply
// comes back in was `message.content` and not `content[0].text`.
//
// What it holds the layer to:
//
//   * BOTH SHAPES PARSE. A canned reply in either format becomes the same goal.
//   * THE REQUEST IS RIGHT. The auth header, the path, the model string and the
//     system prompt are checked on the server side, where they arrive.
//   * PERSONALITY REACHES THE WIRE. A character in the roster ends up in the
//     system prompt of that agent and of no other.
//   * THE FLOOR HOLDS. A 500, a timeout, a reply with no JSON in it and an
//     exhausted budget all fall through to the scripted brain rather than
//     stopping anything.
//   * THE ROSTER IS THE ROSTER. Six lines produce six providers with six
//     configurations, and a missing key downgrades exactly one of them.

import http from 'node:http';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  AnthropicProvider,
  OpenAiProvider,
  ScriptedProvider,
  Budget,
  makeProvider,
} from '../src/minds/providers.js';
import { loadRoster, providerFor } from './roster.js';
import { makeRandom } from '../src/world/noise.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// A brief with just enough in it to be turned into prose. The shape the agent
// builds; see `Agent.brief`.
const BRIEF = {
  place: 'the Black Moss',
  hour: '21:00',
  light: 'dark',
  weather: 'rain',
  goal: 'walk the country',
  health: 'unhurt',
  hunger: 'hungry',
  cold: 'shivering',
  contacts: [{ what: 'a deer', how: 'seen', where: 'north', distance: 'close', doing: 'grazing' }],
  memory: [],
  carrying: ['2 branches'],
  _contacts: [],
};

/** Everything the fake vendor was asked, so the check can look at it. */
const seen = [];

function startFakeVendor() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch {
          /* recorded as null, which is itself a finding */
        }
        seen.push({ url: req.url, headers: req.headers, body: parsed });

        // ── the failure routes ──
        if (req.url.includes('/boom')) {
          res.writeHead(500).end('{"error":"nope"}');
          return;
        }
        if (req.url.includes('/prose')) {
          // A model that ignored the contract and answered in words.
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ content: [{ type: 'text', text: 'I think I shall go north.' }] }));
          return;
        }
        // ── WHAT CLAUDE OPUS 5 ACTUALLY SENDS BACK ──
        //
        // Adaptive thinking is ON when the `thinking` field is absent — a
        // change from Opus 4.8 — so the FIRST content block is a thinking
        // block and the answer is the second. The old code read `content[0]`
        // and got `undefined`, which `?? ''` turned into an empty string, so
        // every real call fell through to the scripted brain while the header
        // went on naming the model. This fixture is that reply, exactly.
        if (req.url.includes('/thinking')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              stop_reason: 'end_turn',
              content: [
                { type: 'thinking', thinking: '' },
                { type: 'text', text: '{"kind":"hunt","quarry":"a deer","why":"hungry"}' },
              ],
              usage: { input_tokens: 412, output_tokens: 17 },
            })
          );
          return;
        }
        // A 200 with no usable text, twice, for two completely different
        // reasons. Without naming them both land in the same bucket as a model
        // that answered in prose.
        if (req.url.includes('/refusal')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            stop_reason: 'refusal',
            stop_details: { type: 'refusal', category: 'cyber' },
            content: [],
          }));
          return;
        }
        if (req.url.includes('/truncated')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            stop_reason: 'max_tokens',
            content: [{ type: 'thinking', thinking: '' }],
            usage: { input_tokens: 412, output_tokens: 256 },
          }));
          return;
        }
        if (req.url.includes('/slow')) {
          setTimeout(() => {
            try {
              res.writeHead(200).end('{}');
            } catch {
              /* the client gave up, which is the point */
            }
          }, 2000);
          return;
        }

        res.writeHead(200, { 'content-type': 'application/json' });
        if (req.url.includes('/v1/messages')) {
          // Anthropic's shape.
          res.end(
            JSON.stringify({
              content: [{ type: 'text', text: '{"kind":"hunt","quarry":"a deer","why":"hungry"}' }],
              usage: { input_tokens: 412, output_tokens: 17 },
            })
          );
        } else {
          // Everybody else's shape.
          res.end(
            JSON.stringify({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: 'Sure! {"kind":"makeCamp","why":"dark and raining"}',
                  },
                },
              ],
              usage: { prompt_tokens: 388, completion_tokens: 12 },
            })
          );
        }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  console.log('\n  Can a mind be somebody else\'s model?\n');
  const { server, port } = await startFakeVendor();
  const base = `http://127.0.0.1:${port}`;
  const scripted = new ScriptedProvider(makeRandom('providercheck'));

  // ── 1. Anthropic's shape ──
  const anthropic = new AnthropicProvider({
    apiKey: 'test-key',
    baseUrl: base,
    fallback: scripted,
    character: 'You hoard. Firewood is yours.',
  });
  const g1 = await anthropic.decide(BRIEF);
  check('an Anthropic-shaped reply becomes a goal', g1?.kind === 'hunt', JSON.stringify(g1));

  const call1 = seen.at(-1);
  check('it asked the Messages API, with the key in the right header',
    call1.url === '/v1/messages' && call1.headers['x-api-key'] === 'test-key' &&
      call1.headers['anthropic-version'] === '2023-06-01',
    `${call1.url}, x-api-key ${call1.headers['x-api-key'] ? 'set' : 'MISSING'}`);

  check('and it defaults to a model from this generation',
    call1.body?.model === 'claude-opus-5', call1.body?.model);

  check('tokens came back off the reply',
    anthropic.lastTokensIn === 412 && anthropic.lastTokensOut === 17,
    `${anthropic.lastTokensIn} in / ${anthropic.lastTokensOut} out`);

  // ── 1b. THE REQUEST SAYS WHAT IT WANTS, and never inherits a default ──
  //
  // Opus 5 thinks when `thinking` is absent. A request that does not state its
  // posture is a request whose cost and whose reply shape are decided by
  // whichever model happens to be named, and that is how this whole class of
  // failure got in.
  check('the request states its thinking posture out loud',
    call1.body?.thinking?.type === 'disabled',
    `thinking: ${JSON.stringify(call1.body?.thinking ?? null)}`);
  check('...with an effort level, and room to answer in',
    call1.body?.output_config?.effort === 'low' && call1.body?.max_tokens >= 256,
    `effort ${call1.body?.output_config?.effort}, max_tokens ${call1.body?.max_tokens}`);
  // These three are REMOVED on Opus 5 and Sonnet 5 — sending any of them is a
  // 400, which would take the whole fleet scripted on the first call.
  check('and no sampling parameters, which are a 400 on this generation',
    call1.body?.temperature === undefined && call1.body?.top_p === undefined &&
      call1.body?.top_k === undefined,
    'no temperature / top_p / top_k');

  // ── 1c. A THINKING REPLY STILL BECOMES A GOAL ──
  //
  // THE REGRESSION THIS SECTION EXISTS FOR. `content[0]` is a thinking block
  // whenever the model thinks, so reading it got `undefined` -> `''` -> "no
  // json in reply" -> the scripted brain, on every single call, silently.
  const thinker = new AnthropicProvider({
    apiKey: 'test-key', baseUrl: `${base}/thinking`, fallback: scripted,
  });
  const gT = await thinker.decide(BRIEF);
  check('a reply that THINKS FIRST still becomes a goal', gT?.kind === 'hunt' && thinker.failures === 0,
    `${JSON.stringify(gT)}, ${thinker.failures} failures — content[0] is a thinking block here`);

  // ── 1d. AND THE TWO SILENT 200s ARE NAMED ──
  const refused = new AnthropicProvider({
    apiKey: 'test-key', baseUrl: `${base}/refusal`, fallback: scripted,
  });
  await refused.decide(BRIEF);
  check('a refusal says it was refused', /refused/i.test(refused.lastError ?? ''),
    refused.lastError ?? 'no error recorded');

  const cut = new AnthropicProvider({
    apiKey: 'test-key', baseUrl: `${base}/truncated`, fallback: scripted, think: true,
  });
  await cut.decide(BRIEF);
  check('and running out of tokens says THAT, not "no json in reply"',
    /token/i.test(cut.lastError ?? ''), cut.lastError ?? 'no error recorded');

  // ── 1e. THE THINKING FLAG REACHES THE WIRE ──
  const deep = new AnthropicProvider({
    apiKey: 'test-key', baseUrl: base, fallback: scripted, think: true,
  });
  await deep.decide(BRIEF);
  const callDeep = seen.at(-1);
  check('`think` turns adaptive thinking on and buys room for it',
    callDeep.body?.thinking?.type === 'adaptive' && callDeep.body?.max_tokens >= 1024,
    `thinking ${callDeep.body?.thinking?.type}, max_tokens ${callDeep.body?.max_tokens}`);

  // ...and `effort: null` omits the field, which the older models require.
  const old = new AnthropicProvider({
    apiKey: 'test-key', baseUrl: base, fallback: scripted,
    model: 'claude-haiku-4-5', effort: null,
  });
  await old.decide(BRIEF);
  check('`effort: null` omits it entirely, for models that reject it',
    seen.at(-1).body?.output_config === undefined,
    `output_config: ${JSON.stringify(seen.at(-1).body?.output_config ?? null)}`);

  // ── 2. Everybody else's shape ──
  const openai = new OpenAiProvider({
    apiKey: 'xai-test',
    baseUrl: `${base}/v1`,
    model: 'grok-4',
    fallback: scripted,
  });
  const g2 = await openai.decide(BRIEF);
  check('an OpenAI-shaped reply becomes a goal', g2?.kind === 'makeCamp', JSON.stringify(g2));

  const call2 = seen.at(-1);
  check('it asked chat/completions with a bearer token',
    call2.url === '/v1/chat/completions' && call2.headers.authorization === 'Bearer xai-test',
    call2.url);

  check('the model it was told to use is the model it asked for',
    call2.body?.model === 'grok-4', call2.body?.model);

  check('the system prompt travels as a system MESSAGE, not a field',
    call2.body?.messages?.[0]?.role === 'system' &&
      /ONE line of JSON/.test(call2.body?.messages?.[0]?.content ?? ''),
    call2.body?.messages?.[0]?.role);

  check('tokens came back out of the other shape too',
    openai.lastTokensIn === 388 && openai.lastTokensOut === 12,
    `${openai.lastTokensIn} in / ${openai.lastTokensOut} out`);

  // ── 3. Personality reaches the wire ──
  const withChar = call1.body?.system ?? '';
  check('A CHARACTER REACHES THE SYSTEM PROMPT',
    withChar.includes('You hoard. Firewood is yours.'),
    withChar.includes('Who you are') ? 'under "Who you are"' : 'absent');

  const plain = new AnthropicProvider({ apiKey: 'k', baseUrl: base, fallback: scripted });
  await plain.decide(BRIEF);
  check('...and only that agent has it',
    !(seen.at(-1).body?.system ?? '').includes('You hoard'),
    'a second mind got the plain prompt');

  // ── 4. The floor, four ways ──
  const boom = new AnthropicProvider({ apiKey: 'k', baseUrl: `${base}/boom`, fallback: scripted });
  const g3 = await boom.decide(BRIEF);
  check('an HTTP 500 falls through to the scripted brain', !!g3?.kind, `${g3?.kind}, ${boom.lastError}`);

  const prose = new AnthropicProvider({ apiKey: 'k', baseUrl: `${base}/prose`, fallback: scripted });
  const g4 = await prose.decide(BRIEF);
  check('a reply with no JSON in it falls through too', !!g4?.kind, `${g4?.kind}, ${prose.lastError}`);

  const slow = new AnthropicProvider({
    apiKey: 'k', baseUrl: `${base}/slow`, fallback: scripted, timeoutMs: 250,
  });
  const t0 = Date.now();
  const g5 = await slow.decide(BRIEF);
  const waited = Date.now() - t0;
  check('a vendor that never answers is abandoned, not waited on',
    !!g5?.kind && waited < 1500, `gave up after ${waited} ms`);

  const purse = new Budget({ maxCalls: 1 });
  const capped = new AnthropicProvider({ apiKey: 'k', baseUrl: base, fallback: scripted, budget: purse });
  await capped.decide(BRIEF);
  const before = seen.length;
  await capped.decide(BRIEF);
  check('an empty purse stops the asking, it does not stop the world',
    seen.length === before, `${purse.spent.calls}/${purse.spent.of} calls`);

  // ── 5. The roster ──
  const file = path.join(tmpdir(), `highlands-roster-${process.pid}.json`);
  writeFileSync(file, JSON.stringify({
    budgetCalls: 40,
    players: [
      { name: 'Eachann', provider: 'anthropic', model: 'claude-opus-5', keyEnv: 'CHECK_KEY_A',
        baseUrl: base, character: 'You hoard.' },
      { name: 'Morag', provider: 'xai', model: 'grok-4', keyEnv: 'CHECK_KEY_B',
        baseUrl: `${base}/v1`, character: 'You are generous to a fault.' },
      // No baseUrl on purpose: a REMOTE vendor with no key must go scripted.
      // The first fixture gave it a 127.0.0.1 base and it stayed on the model —
      // correctly, because a model on this machine needs no key. The check was
      // wrong, not the rule, and it would have passed for the wrong reason.
      { name: 'Tormod', provider: 'moonshot', model: 'kimi-k2', keyEnv: 'CHECK_KEY_MISSING' },
      { name: 'Ailsa' },
    ],
  }));
  const roster = loadRoster(file);
  const env = { CHECK_KEY_A: 'a-key', CHECK_KEY_B: 'b-key' };
  const built = roster.players.map((p, i) => providerFor(p, { env, index: i }));
  unlinkSync(file);

  check('A ROSTER PUTS DIFFERENT MINDS IN ONE WORLD',
    built[0].name === 'anthropic' && built[1].name === 'openai-compatible',
    built.map((p, i) => `${roster.players[i].name}=${p.name}`).join(', '));

  check('each one keeps its own model',
    built[0].model === 'claude-opus-5' && built[1].model === 'grok-4',
    `${built[0].model} / ${built[1].model}`);

  check('a player whose key is absent goes scripted — and only that player',
    built[2].name === 'scripted' && built[0].name !== 'scripted',
    `Tormod is ${built[2].name}`);

  check('a line with no provider on it is simply a scripted player',
    built[3].name === 'scripted');

  check('the roster carries the character, per player',
    built[0].character === 'You hoard.' && built[1].character === 'You are generous to a fault.' &&
      built[3].character === undefined || built[3].name === 'scripted',
    'each line its own');

  // Both of the model-backed ones still work end to end.
  const g6 = await built[0].decide(BRIEF);
  const g7 = await built[1].decide(BRIEF);
  check('and both of them can actually decide something',
    g6?.kind === 'hunt' && g7?.kind === 'makeCamp', `${g6?.kind} / ${g7?.kind}`);

  // ── 6. The default is still nothing at all ──
  const off = makeProvider(makeRandom('x'), {});
  check('with no environment set, nothing reaches the network', off.name === 'scripted');

  const nonsense = makeProvider(makeRandom('x'), { MINDS_PROVIDER: 'skynet', MINDS_API_KEY: 'k' });
  check('a vendor nobody has heard of is refused, loudly, and falls back',
    nonsense.name === 'scripted');

  const noKey = makeProvider(makeRandom('x'), { MINDS_PROVIDER: 'xai' });
  check('a vendor with no key is refused the same way', noKey.name === 'scripted');

  const localOne = makeProvider(makeRandom('x'), {
    MINDS_PROVIDER: 'local', MINDS_MODEL: 'qwen3',
  });
  check('...but a model on this machine needs no key',
    localOne.name === 'openai-compatible', localOne.baseUrl);

  server.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length} passed`);
  console.log(`  ${seen.length} requests, all of them to 127.0.0.1 — no key, no vendor, no cost\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n  providercheck could not run: ${err.message}\n`);
  process.exit(1);
});
