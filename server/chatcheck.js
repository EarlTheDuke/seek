// ── chatcheck.js ────────────────────────────────────────────────────────────
// Can a person talk to the minds, and can the minds talk back?
//
//   npm run chatcheck
//
// This is the check that was missing, and its absence cost a whole evening. A
// human sat in the game and typed four direct questions —
//
//   "are you here kimi? How you feeling?"
//   "who is in the game with me?"
//   "should we all group up at the water? Who is with me?"
//   "i am near the water with two fires. Join me if you like"
//
// — and got NOT ONE reply, from six models across three vendors. Everything
// else in his flight recorder was system text: `+1 Branch`, `a fire`,
// `Deer down`. From the outside that is indistinguishable from "the models are
// boring", which is the wrong conclusion and an expensive one.
//
// `watchcheck` proves a mind can be HEARD. Nothing proved a mind can LISTEN,
// and nothing at all covered the gate between deciding to speak and speaking.
//
// Free to run: the agent here uses the scripted brain, because every question
// this asks is about PLUMBING and a plumbing test that needs an API key is a
// plumbing test nobody runs.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PROTOCOL_VERSION, C_HELLO, C_CHAT, S_WELCOME, S_CHAT, S_SNAPSHOT,
  encode, decode,
} from '../src/net/protocol.js';
import { AGENTS } from '../src/config.js';
import { Agent } from '../src/net/agent.js';
import { makeRandom } from '../src/world/noise.js';
import { ScriptedProvider } from '../src/minds/providers.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8084);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A person, as far as the server is concerned: a socket that types. */
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
          this.heard.push(`${msg.data.n}: ${msg.data.m}`);
        }
      };
    });
  }
  say(m) { if (this.ws.readyState === 1) this.ws.send(encode(C_CHAT, { m })); }
  close() { try { this.ws.close(); } catch { /* going anyway */ } }
}

async function main() {
  console.log('\n  Can a person talk to the minds, and can they talk back?\n');
  await requireFreePort(PORT, 'chatcheck');

  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0', MINDS_PROVIDER: 'scripted' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  try {
    // ── 1. the listening half, over a real socket ──
    let ben = null;
    for (let i = 0; i < 40 && !ben; i++) {
      await sleep(150);
      ben = await new Person('Ben').connect(URL).catch(() => null);
    }
    if (!ben) throw new Error(`no server answered on ${URL}`);

    const born = (name) => new Agent({
      name, rand: makeRandom(name), provider: new ScriptedProvider(makeRandom(`p:${name}`)),
    });
    const mind = born('Eachann');
    await mind.connect(URL);
    await sleep(800);
    check('a person and a mind are both on the wire', ben.id !== null && mind.id !== null,
      `#${ben.id} person, #${mind.id} mind`);

    const question = 'who is in the game with me?';
    ben.say(question);
    for (let i = 0; i < 30 && !mind.heard.some((h) => h.includes(question)); i++) await sleep(100);

    check('THE MIND HEARS THE PERSON',
      mind.heard.some((h) => h.includes(question)),
      mind.heard.length ? `heard "${mind.heard.at(-1)}"` : 'heard nothing at all');

    // Hearing it is not the same as being TOLD it. The brief is what the model
    // is actually shown, and that is the only thing that can change its mind.
    const brief = mind.brief();
    check('  …and it reaches the BRIEF the model is shown',
      Array.isArray(brief.heard) && brief.heard.some((h) => h.includes(question)),
      brief.heard?.length ? `${brief.heard.length} lines, last "${brief.heard.at(-1)}"` : 'the brief heard nothing');

    // ── 2. the speaking half, and the gate in front of it ──
    //
    // Driven on the real object rather than over the wire, because the question
    // is about the GATE, and a gate is easiest to test by standing in front of
    // it at a known time.
    const gate = AGENTS.speakEveryHours;
    check('there is a gate on speaking, and it is stated', gate > 0, `speakEveryHours ${gate}`);

    // A fresh mind may speak — `spoke` starts at -999 for exactly this reason.
    const fresh = born('Fresh');
    fresh.hours = 7;
    check('a mind that has never spoken may speak',
      fresh.hours - fresh.spoke > gate, `${fresh.hours} - ${fresh.spoke} > ${gate}`);

    // ── 3. THE ONE THAT BITES: the clock wraps at 24 and the gate does not ──
    //
    // `hours` is the world's clock and it is `% 24`. `spoke` is a stamp taken
    // off that same clock. Subtracting them across midnight gives a NEGATIVE
    // number, which is never greater than the gate — so a mind that speaks in
    // the evening is mute for ever, and nothing anywhere says so.
    //
    // A day here is `TIME.dayMinutes` = 26 REAL minutes, so this is not an edge
    // case waiting for a long campaign. It happens twice an hour.
    const midnight = born('Midnight');
    midnight.spoke = 20;   // spoke at eight in the evening
    midnight.hours = 0.6;  // clock has since wrapped past midnight
    const since = (a) => (a.spoke < 0 ? Infinity : (a.hours - a.spoke + 24) % 24);
    const canSpeakAfterWrap = since(midnight) > gate;
    check('A MIND THAT SPOKE BEFORE MIDNIGHT CAN STILL SPEAK AFTER IT',
      canSpeakAfterWrap,
      canSpeakAfterWrap
        ? 'the wrap is handled'
        : `spoke at ${midnight.spoke}, now ${midnight.hours}, gap reads ${(midnight.hours - midnight.spoke).toFixed(1)}h — permanently mute`);

    // THE SENTINEL FOR THE FIX ITSELF. `spoke` is -999 for "never", and running
    // that through a modulo yields an arbitrary hour in [0,24) — which lands
    // under the gate for one hour of every day. A fix that silenced a brand new
    // mind at nine in the morning would look exactly like a fix that worked.
    let everFresh = true;
    for (let h = 0; h < 24; h += 0.25) {
      const a = born('Sentinel'); a.hours = h;
      if (!(since(a) > gate)) { everFresh = false; break; }
    }
    check('  …and a mind that has NEVER spoken may speak at any hour of the day',
      everFresh, everFresh ? 'all 96 quarter-hours' : 'the never-spoken sentinel fell through the modulo');

    // And the same body an hour earlier, to prove the gate itself works and
    // this is the WRAP rather than the gate being broken outright.
    const evening = born('Evening');
    evening.spoke = 20;
    evening.hours = 21;
    check('  …and the sentinel: the same gate opens normally within one day',
      since(evening) > gate, `${evening.hours} - ${evening.spoke} = 1.0h > ${gate}`);

    // ── 4. SPEAKING MUST NOT COST A MIND ITS PLAN ──
    //
    // THIS ASSERTION USED TO BE VACUOUS AND THAT IS WHY THE BUG SURVIVED.
    // It called `planner.act({kind:'say',…})` — the REFLEX layer, whose only
    // argument is a delta-time — so it passed a goal where a number goes, never
    // touched the decision path, and could not have failed however broken that
    // path was. Meanwhile a real mind sat pinned on one sentence for nine real
    // minutes because `this.goal = goal` ran before the speech was handled.
    //
    // Driven through `deliberate()` and a stub provider now, which is the only
    // path a real decision ever takes.
    const decide = async (agent, answer) => {
      agent.provider = { decide: async () => answer, lastTokensIn: 0, lastTokensOut: 0 };
      agent.deliberate();
      for (let i = 0; i < 50 && agent.thinking; i++) await sleep(20);
    };

    const planner = born('Planner');
    planner.hours = 9;
    planner.spoke = 8;                       // allowed: an hour ago
    planner.snapshot = { pl: [], cr: [], c: 9, w: { s: 'clear' } };
    planner._x = planner._y = planner._z = 0;
    planner.goal = { kind: 'hunt', quarry: 'a deer' };

    await decide(planner, { kind: 'say', text: 'deer to the north' });
    check('SPEAKING DOES NOT WIPE WHAT A MIND WAS DOING',
      planner.goal?.kind === 'hunt',
      `was hunt, now ${planner.goal?.kind} — a bare say keeps the standing plan`);
    check('  …and the sentence was actually spoken',
      planner.said.includes('deer to the north'),
      JSON.stringify(planner.said));

    // ── 5. AND THE POINT OF THE WHOLE CHANGE: both, in one decision ──
    const both = born('Both');
    both.hours = 9;
    both.spoke = 8;
    both.snapshot = { pl: [], cr: [], c: 9, w: { s: 'clear' } };
    both._x = both._y = both._z = 0;
    both.goal = { kind: 'wander' };

    await decide(both, { kind: 'hunt', quarry: 'a deer', say: 'that one is mine', why: 'meat' });
    check('A MIND CAN ACT AND TALK IN THE SAME DECISION',
      both.goal?.kind === 'hunt' && both.said.includes('that one is mine'),
      `goal ${both.goal?.kind}, said ${JSON.stringify(both.said)}`);
    check('  …and the log records both halves, not one',
      both.intentions.at(-1)?.said === 'that one is mine'
        && /hunt/.test(both.intentions.at(-1)?.goal ?? ''),
      JSON.stringify(both.intentions.at(-1)));

    // ── 6. and it remembers its own voice, so it stops repeating itself ──
    check('A MIND REMEMBERS WHAT IT SAID',
      both.memory.all().some((e) => /I said "that one is mine"/.test(e.text)),
      'one mind said the same sentence three times over nine minutes because '
      + 'it had no memory of saying it');

    // …and the gate now TELLS the mind, instead of refusing in silence.
    both.said.length = 0;
    await decide(both, { kind: 'hunt', quarry: 'a deer', say: 'that one is mine' });
    check('  …and a gagged sentence is reported to the next decision',
      both.outcomes.some((o) => /already spoken recently/.test(o.text)),
      JSON.stringify(both.outcomes.map((o) => o.text)));
    check('  …and being gagged still does not cost it the plan',
      both.goal?.kind === 'hunt', String(both.goal?.kind));

    both.close?.();
    planner.close?.();
    mind.close?.();
    fresh.close?.();
    midnight.close?.();
    evening.close?.();
    ben.close();
    await sleep(200);
  } finally {
    stop();
    await sleep(300);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  could not run: ${err.message}\n`);
  process.exit(1);
});
