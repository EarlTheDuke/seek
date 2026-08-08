// ── agentcheck.js ───────────────────────────────────────────────────────────
// Are the agents real players, and can they be trusted with a key?
//
//   npm run serve            (in one terminal)
//   npm run agentcheck       (in another)
//
// Two questions, and neither is "is the model clever".
//
//   1. IS IT A REAL PLAYER? The server must not be able to tell. That means it
//      holds its own socket, appears in everyone else's snapshots, MOVES, and
//      is subject to exactly the same authority as a person.
//   2. CAN IT BE LEFT ALONE WITH A KEY? A budget that can be overrun by an
//      unattended process is not a budget. Every path out of money, network or
//      patience has to land on the scripted brain rather than on a stall.
//
// No network calls. Running this must never cost anybody anything.

import { Agent } from '../src/net/agent.js';
import { ScriptedProvider, LlmProvider, Budget } from '../src/minds/providers.js';
import { makeRandom } from '../src/world/noise.js';
import { PROTOCOL_VERSION, C_HELLO, S_WELCOME, S_SNAPSHOT, encode, decode } from '../src/net/protocol.js';
import { briefToText } from '../src/minds/perception.js';

const URL = process.argv[2] ?? 'ws://127.0.0.1:8080';
const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A plain observer, so we can see the agents the way another player would. */
class Watcher {
  constructor() {
    this.snap = null;
    this.names = new Map();
  }
  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onerror = (e) => reject(new Error(e.message ?? 'socket'));
      this.ws.onopen = () => this.ws.send(encode(C_HELLO, { name: 'Watcher', version: PROTOCOL_VERSION }));
      this.ws.onmessage = (ev) => {
        const m = decode(ev.data);
        if (!m) return;
        if (m.type === S_WELCOME) {
          this.id = m.data.id;
          resolve(this);
        }
        if (m.type === S_SNAPSHOT) this.snap = m.data;
      };
    });
  }
}

console.log(`\n  Agents against ${URL}\n`);

const watcher = await new Watcher().connect(URL).catch((e) => {
  console.error(`  could not connect: ${e.message}`);
  console.error('  is the server up?  npm run serve\n');
  process.exit(1);
});

// ── 1. a real player ──
const agents = [];
for (let i = 0; i < 3; i++) {
  const a = new Agent({
    name: ['Eachann', 'Morag', 'Tormod'][i],
    provider: new ScriptedProvider(makeRandom(`chk:${i}`)),
    rand: makeRandom(`chkbody:${i}`),
  });
  await a.connect(URL);
  agents.push(a);
}
await sleep(400);

check('agents get ids of their own', agents.every((a) => a.id !== null),
  agents.map((a) => `#${a.id}`).join(' '));
check('they agree with the server about the seed', agents.every((a) => a.seed === agents[0].seed),
  `seed ${agents[0].seed}`);

const seen = (watcher.snap?.pl ?? []).map((p) => p.id);
check('another player sees them as players', agents.every((a) => seen.includes(a.id)),
  `watcher sees ${seen.length} others`);

// ── they move, and only as fast as the rules allow ──
const start = new Map((watcher.snap?.pl ?? []).map((p) => [p.id, [...p.p]]));
const t0 = Date.now();
while (Date.now() - t0 < 3000) {
  for (const a of agents) a.update(1 / 30);
  await sleep(1000 / 30);
}
await sleep(300);

// Only count OUR agents. The watcher also sees the server's own rival hunter,
// which is how "4 of 3 moved" happened.
const ours = new Set(agents.map((a) => a.id));
let moved = 0;
let fastest = 0;
for (const p of watcher.snap?.pl ?? []) {
  if (!ours.has(p.id)) continue;
  const was = start.get(p.id);
  if (!was) continue;
  const d = Math.hypot(p.p[0] - was[0], p.p[2] - was[2]);
  if (d > 2) moved++;
  fastest = Math.max(fastest, d / 3.3);
}
check('they actually walk', moved >= 2, `${moved} of ${agents.length} moved more than 2 m in 3 s`);
check('and the server still governs them', fastest < 10,
  `fastest ${fastest.toFixed(1)} m/s — a sprint is 8.6, so nothing is teleporting`);

check('they build memories from what they see', agents.some((a) => a.memory.all().length > 0),
  `${agents.map((a) => a.memory.all().length).join('/')} memories`);
// Give them long enough to actually deliberate, or this passes vacuously with
// nought decisions and nought log entries — which it did.
const t1 = Date.now();
while (Date.now() - t1 < 9000) {
  for (const a of agents) a.update(1 / 30);
  await sleep(1000 / 30);
}
await sleep(300);
const totalDecisions = agents.reduce((n, a) => n + a.decisions, 0);
check('they deliberate', totalDecisions > 0, `${totalDecisions} decisions across three`);
check('and every decision is logged for replay', agents.every((a) => a.log.length === a.decisions),
  `${agents.map((a) => `${a.log.length}/${a.decisions}`).join(' ')}`);

// ── 2. safe to leave alone with a key ──
console.log('');
const scripted = new ScriptedProvider(() => 0.5);
const brief = agents[0].brief();

const purse = new Budget({ maxCalls: 3 });
let attempted = 0;
const counting = new LlmProvider({
  apiKey: 'test-key-not-real',
  fallback: scripted,
  budget: purse,
  fetchImpl: async () => {
    attempted++;
    return {
      ok: true,
      json: async () => ({
        content: [{ text: '{"kind":"hunt","quarry":"a deer"}' }],
        usage: { input_tokens: 210, output_tokens: 18 },
      }),
    };
  },
});
for (let i = 0; i < 10; i++) await counting.decide(brief);
check('a budget is a hard stop, not a warning', attempted === 3,
  `10 asks, ${attempted} calls made, cap was ${purse.maxCalls}`);
check('and past it everyone falls back rather than stalling',
  (await counting.decide(brief))?.kind !== undefined, 'still returns a legal goal');
check('spend is accounted', purse.spent.tokensIn === 630 && purse.spent.tokensOut === 54,
  `${purse.spent.tokensIn} in / ${purse.spent.tokensOut} out over ${purse.spent.calls} calls`);

const perAgent = new LlmProvider({
  apiKey: 'test-key-not-real', fallback: scripted, maxCalls: 2,
  fetchImpl: async () => ({ ok: true, json: async () => ({ content: [{ text: '{"kind":"hold"}' }] }) }),
});
for (let i = 0; i < 5; i++) await perAgent.decide(brief);
check('and there is a per-agent cap as well as a shared one', perAgent.calls <= 2,
  `${perAgent.calls} calls of a 2 cap — one runaway agent cannot drain the purse`);

const noKey = new LlmProvider({ apiKey: null, fallback: scripted });
check('no key means no network at all', !noKey.available && !!(await noKey.decide(brief))?.kind,
  'falls straight through to scripted');

const dead = new LlmProvider({
  apiKey: 'test-key-not-real', fallback: scripted,
  fetchImpl: async () => { throw new Error('network is down'); },
});
check('a dead network does not stop the world', !!(await dead.decide(brief))?.kind && dead.failures === 1);

const rubbish = new LlmProvider({
  apiKey: 'test-key-not-real', fallback: scripted,
  fetchImpl: async () => ({ ok: true, json: async () => ({ content: [{ text: 'Sure! I can help with that.' }] }) }),
});
check('a reply with no legal verb falls back', !!(await rubbish.decide(brief))?.kind);

// ── 3. the honesty rule survives the jump to a socket ──
console.log('');
// Test what is actually SENT, not the object it is built from. `_contacts`
// carries raw metres on purpose — it is the scripted provider's working set and
// never reaches a model — so stringifying the brief tests the wrong thing.
const sent = briefToText(brief);
check('what reaches the model carries no coordinates', !/-?\d+\.\d{2,}/.test(sent),
  'distances are words, not metres');
check('and it is built only from the public snapshot', Array.isArray(brief.contacts),
  `${brief.contacts.length} contacts, the same ones any client renders`);
console.log('\n  What an agent is actually told:\n');
console.log(sent.split('\n').map((l) => `    ${l}`).join('\n'));

for (const a of agents) a.close();
watcher.ws.close();
await sleep(200);

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
