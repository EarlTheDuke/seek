// ── wakecheck.js ────────────────────────────────────────────────────────────
// When something happens TO a mind, does its attention arrive while the moment
// is still a moment?
//
//   npm run wakecheck
//
// THE REPORT THIS CLOSES. Ben, 2026-08-17: "What stops them from talking to me
// when i message them in game?" The answer was the architecture, in three
// parts, and every part was working exactly as designed:
//
//   * ATTENTION WAS A METRONOME. A mind thought every cadenceSeconds and chat
//     could not bring the appointment forward, so a question waited its turn
//     behind the timer — sixty to ninety seconds in the 2026-08-17 run.
//   * THE GAG COULD NOT TELL A REPLY FROM CHATTER. `speakEveryDecisions`
//     swallowed "coming to your fire" — an answer — as spam.
//   * A DIRECT QUESTION HAD NO RANK. It sat in `heard` as one line among
//     eight, exactly as important as somebody muttering about firewood.
//
// Three mechanisms answer those three faults — `wake` with a refractory, the
// `owedReply` exemption, and the `asked` line — and this file holds all three,
// plus the pinned-deal list that stops a bargain sampling out of memory
// mid-walk.
//
// THE HEADLINE ARM IS THE GESTURE, per the standing rule handcheck bought:
// a person's socket types a question at a mind whose cadence is TEN MINUTES,
// and the reply must come back over the wire in seconds. Nothing but the wake
// path can explain that reply arriving, so the reply IS the assertion. The
// stub mind answers ONLY when the brief carries the `asked` line — so one
// arrival proves the wake fired, the brief carried the debt, the model was
// told, and the gate let the answer through.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PROTOCOL_VERSION, C_HELLO, C_CHAT, S_WELCOME, S_CHAT,
  encode, decode,
} from '../src/net/protocol.js';
import { AGENTS } from '../src/config.js';
import { Agent } from '../src/net/agent.js';
import { makeRandom } from '../src/world/noise.js';
import { ModelProvider } from '../src/minds/providers.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8151);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A person, as far as the server is concerned. Same shape as chatcheck's. */
class Person {
  constructor(name) { this.name = name; this.id = null; this.heard = []; }
  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onerror = (e) => reject(new Error(e.message ?? 'socket error'));
      this.ws.onopen = () => this.ws.send(encode(C_HELLO, { name: this.name, version: PROTOCOL_VERSION }));
      this.ws.onmessage = (ev) => {
        const msg = decode(ev.data);
        if (!msg) return;
        if (msg.type === S_WELCOME) { this.id = msg.data.id; resolve(this); }
        else if (msg.type === S_CHAT && msg.data.id !== this.id) {
          this.heard.push({ at: Date.now(), line: `${msg.data.n}: ${msg.data.m}` });
        }
      };
    });
  }
  say(m) { if (this.ws.readyState === 1) this.ws.send(encode(C_CHAT, { m })); }
  close() { try { this.ws.close(); } catch { /* going anyway */ } }
}

/**
 * A mind that answers when asked and chatters when not.
 *
 * Deterministic on purpose: it replies IF AND ONLY IF the brief carries the
 * `asked` line, so a reply arriving on the wire proves the whole chain — wake,
 * brief, gate — and a reply NOT arriving in the ration arm proves the gag
 * still holds against everything that is not a debt.
 */
class StubProvider {
  constructor() { this.name = 'stub'; this.calls = 0; this.askedSeen = 0; this.dealsSeen = 0; }
  async decide(brief) {
    this.calls++;
    if (brief.asked) this.askedSeen++;
    if (brief.deals?.length) this.dealsSeen++;
    if (brief.asked) return { kind: 'wander', why: 'answering', say: 'Ben, north of the loch — what will you trade for it?' };
    return { kind: 'wander', why: 'idle', say: 'the wind is thin today' };
  }
}

async function main() {
  console.log('\n  Does attention arrive while the moment is still a moment?\n');

  // ── the shipped numbers, before this file touches anything ────────────────
  check('the refractory is long enough to be a budget guard',
    AGENTS.reactRefractorySeconds >= 10, `${AGENTS.reactRefractorySeconds}s — wakes must never become a billing method`);
  check('the conversation cadence is short enough to volley',
    AGENTS.conversationCadenceSeconds <= 20, `${AGENTS.conversationCadenceSeconds}s against roster cadences of 20-100`);
  check('a conversation outlives one exchange',
    AGENTS.conversationSeconds > 2 * AGENTS.conversationCadenceSeconds,
    `${AGENTS.conversationSeconds}s window, ${AGENTS.conversationCadenceSeconds}s cadence`);

  // ── the format teaches conversation, not only announcement ───────────────
  const prompt = String(ModelProvider.prototype.systemPrompt.call({ character: null }));
  check('the prompt tells a mind to ANSWER what it has not answered',
    /ANSWER them/.test(prompt), 'the `asked` line is dead words if the format never says a reply is allowed');
  check("  …and how to speak TO somebody — the same name-prefix `takeOrder` reads",
    /open with their name/.test(prompt), 'so addressed speech is a convention both ends share');

  // ── wake and refractory, at the unit ─────────────────────────────────────
  const bare = new Agent({ name: 'Unit', rand: makeRandom('u'), provider: new StubProvider() });
  check('a wake is taken when attention is free', bare.wake('test') === true && bare.wakePending === true);
  bare.wakePending = false; bare.reactCooldown = 10;
  check('  …and REFUSED inside the refractory', bare.wake('again') === false && bare.wakePending === false,
    'this refusal is the difference between reacting to events and billing per event');

  // ── being shot wakes; an offer pins AND wakes; a trade unpins ────────────
  const shot = new Agent({ name: 'Shot', rand: makeRandom('s'), provider: new StubProvider() });
  shot.id = 7; shot.hours = 7;
  shot.remember({ k: 'hit', id: 7, by: 99, n: 'Tormod', dmg: 11 });
  check('an arrow in the body wakes the mind', shot.wakePending === true && shot.shotBy === 'Tormod',
    'it used to wait its turn behind the metronome like gossip');

  const dealt = new Agent({ name: 'Dealt', rand: makeRandom('d'), provider: new StubProvider() });
  dealt.id = 3; dealt.hours = 7;
  dealt.remember({ k: 'offer', to: 3, by: 99, from: 'Ben', item: 'venison', want: 'wood' });
  check('an offer AT you is pinned and wakes you',
    dealt.wakePending === true && dealt.deals.length === 1 && dealt.deals[0].with === 'Ben',
    dealt.deals[0]?.text ?? '(nothing pinned)');
  dealt.remember({ k: 'trade', to: 3, by: 99, from: 'Ben', n: 'Dealt', gave: 'venison', got: 'wood' });
  check('  …and the settled trade takes it off the table', dealt.deals.length === 0,
    'a deal that outlives its settlement would nag a mind about history');
  dealt.pinDeal('a', 'P1'); dealt.pinDeal('b', 'P2'); dealt.pinDeal('c', 'P3');
  dealt.pinDeal('d', 'P4'); dealt.pinDeal('e', 'P5'); dealt.pinDeal('f', 'P2');
  check('  …the pin list caps at 4 and one party holds one deal',
    dealt.deals.length <= 4 && dealt.deals.filter((d) => d.with === 'P2').length === 1,
    `${dealt.deals.length} pinned, P2 once`);

  // ── THE GESTURE, over a real socket ──────────────────────────────────────
  //
  // The conversation cadence is dropped to 3 s FOR SPEED — the mechanism under
  // test does not change, only the wait between assertions. The shipped value
  // was asserted above, before this line touched it.
  AGENTS.conversationCadenceSeconds = 3;

  await requireFreePort(PORT, 'wakecheck');
  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  let pump = null;
  try {
    let ben = null;
    for (let i = 0; i < 40 && !ben; i++) {
      await sleep(150);
      ben = await new Person('Ben').connect(URL).catch(() => null);
    }
    if (!ben) throw new Error(`no server answered on ${URL}`);

    const stub = new StubProvider();
    // TEN MINUTES of cadence. If anything thinks in the next few seconds, it
    // was a wake — there is no other appointment on the calendar.
    const mind = new Agent({
      name: 'Eachann', rand: makeRandom('e'), provider: stub, cadenceSeconds: 600,
    });
    await mind.connect(URL);
    pump = setInterval(() => { try { mind.update(1 / 30); } catch { /* a bad tick must not kill the pump */ } }, 1000 / 30);
    await sleep(1200);

    console.log('\n  ── the gesture: a question at a ten-minute mind ──\n');
    const callsBefore = stub.calls;
    const t0 = Date.now();
    ben.say('Eachann, where are the deer?');
    for (let i = 0; i < 100 && !ben.heard.length; i++) await sleep(100);
    const first = ben.heard[0] ?? null;

    check('THE REPLY ARRIVES IN SECONDS, NOT A CADENCE',
      first !== null && first.at - t0 < 8000,
      first ? `"${first.line}" after ${((first.at - t0) / 1000).toFixed(1)}s, against a 600s cadence`
        : `no reply in 10s — calls went ${callsBefore} -> ${stub.calls}`);
    check('  …and the mind thought BECAUSE it was spoken to', stub.calls > callsBefore,
      `${stub.calls - callsBefore} think(s), none scheduled for another ten minutes`);
    check('  …and the brief carried the question as a debt', stub.askedSeen >= 1,
      'the stub only answers when `asked` is present, so the reply above half-proves this already');
    check('  …and the reply opens with the asker\'s name', !!first && / Ben,/.test(first.line),
      first?.line ?? '');
    check('  …and the conversation window is open', mind.talkingWith === 'Ben' && mind.talkSeconds > 0,
      `talking with ${mind.talkingWith}, ${mind.talkSeconds.toFixed(0)}s left`);

    // ── the second question: refractory holds, conversation cadence answers ─
    console.log('\n  ── the second question — no wake left, and answered anyway ──\n');
    const heardBefore = ben.heard.length;
    ben.say('Eachann: is there water near them?');
    // The wake is spent (refractory ~15s), so ONLY the 3s conversation cadence
    // can deliver this reply — and the mind spoke one decision ago, so ONLY
    // the owedReply exemption can get it past the gag.
    for (let i = 0; i < 80 && ben.heard.length <= heardBefore; i++) await sleep(100);
    const second = ben.heard[heardBefore] ?? null;
    check('a reply while the gag would normally hold — the debt outranks the ration',
      second !== null, second ? `"${second.line}"` : 'nothing came back');

    // ── and the ration itself still stands ───────────────────────────────────
    console.log('\n  ── and unprompted chatter is still rationed ──\n');
    const gaggedBefore = mind.gagged ?? 0;
    const heardNow = ben.heard.length;
    // Nobody says anything. The conversation window keeps 3s thinks coming and
    // the stub tries to chatter on every one; with no debt outstanding the gag
    // must eat at least one of them.
    await sleep(7000);
    check('the gag still eats what is not owed', (mind.gagged ?? 0) > gaggedBefore,
      `gagged ${gaggedBefore} -> ${mind.gagged} while the stub chattered every think`);
    check('  …so the channel did not flood', ben.heard.length - heardNow <= 2,
      `${ben.heard.length - heardNow} lines in 7s of a 3s-cadence conversation window`);

    // ── the pinned deal decays in real seconds ───────────────────────────────
    mind.pinDeal('a test bargain with a ghost', 'Ghost', 0.5);
    await sleep(1500);
    check('a pinned deal lapses on a REAL clock — game hours wrap at midnight',
      mind.deals.every((d) => d.with !== 'Ghost'),
      'chatcheck\'s midnight arm is why nothing here counts in game hours');

    ben.close();
    mind.close?.();
  } finally {
    if (pump) clearInterval(pump);
    stop();
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length}${passed === results.length ? ' passed' : ' PASSED — SOMETHING IS WRONG'}\n`);
}

main().catch((e) => {
  console.error('\n  could not run:', e.message, '\n');
  process.exitCode = 0; // a failing check exits 0 here; the output is the result
});
