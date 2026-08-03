// ── agents.js ───────────────────────────────────────────────────────────────
// Fill the world with players that are not people.
//
//   npm run agents                          six scripted players, no network
//   npm run agents -- 12                    twelve of them
//   node server/agents.js 6 --for 300       six, for five minutes, then report
//   MINDS_PROVIDER=claude MINDS_API_KEY=sk-... npm run agents -- 4
//
// Every run ends by writing a session report into DEV-NOTES.md — the same file
// a person types into from the game — so what the agents found and what a
// human noticed read as one document rather than two systems you have to
// remember to check. See server/playreport.js for what it looks for and why.
//
// Give it at least three minutes. Below that the report will tell you it is
// too short to conclude anything, which is the correct answer and the reason
// it says so out loud.
//
// Each agent is a real WebSocket client holding a real socket and sending real
// intents. The server cannot tell them from you — not as a trick, but because
// there is genuinely nothing to tell apart. Phase 1 made all player action an
// intent, Phase 5 made intents the only thing on the wire, Phase 8 made a mind
// another intent producer; this is those three facts collected in one place.
//
// SCRIPTED BY DEFAULT. Running this costs nothing and touches no network unless
// you hand it a key, and even then a shared Budget stops the whole thing dead
// at a fixed number of calls. Running out is not an error: every agent falls
// back to its scripted brain and the world carries on being fully playable,
// which is the floor VISION.md insisted on.

import { Agent } from '../src/net/agent.js';
import { ScriptedProvider, LlmProvider, Budget } from '../src/minds/providers.js';
import { makeRandom } from '../src/world/noise.js';
import { AGENTS } from '../src/config.js';
import { buildReport, summarise } from './playreport.js';
import { appendNote, NOTES_FILE } from './notes.js';

const args = process.argv.slice(2);
const positional = args.filter((a) => /^\d+$/.test(a)).map(Number);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const COUNT = positional[0] ?? Number(process.env.AGENT_COUNT ?? 6);
const URL = flag('url', process.env.AGENT_URL ?? 'ws://127.0.0.1:8080');
const SECONDS = Number(flag('for', process.env.AGENT_SECONDS ?? 0)); // 0 = forever

// Scots and Gaelic, like everything else that lives here.
const NAMES = [
  'Eachann', 'Morag', 'Tormod', 'Ailsa', 'Fingal', 'Iseabail',
  'Calum', 'Beathag', 'Ruaridh', 'Mairead', 'Lachlan', 'Oighrig',
];

const useModel = (process.env.MINDS_PROVIDER ?? 'scripted') === 'claude';
const hasKey = !!process.env.MINDS_API_KEY;

// One purse for the whole session, so "twelve players" cannot quietly cost
// twelve times what one does.
const budget = new Budget({
  maxCalls: Number(process.env.MINDS_MAX_CALLS ?? AGENTS.maxCallsTotal),
  label: 'agents',
});

console.log('\n  Highlands — agents');
console.log(`  ${COUNT} player${COUNT === 1 ? '' : 's'} joining ${URL}`);
if (useModel && hasKey) {
  console.log(`  minds: ${process.env.MINDS_MODEL ?? 'claude-sonnet-4-5'}`);
  console.log(`  budget: ${budget.maxCalls} calls for the whole session, then scripted`);
} else if (useModel) {
  console.log('  minds: scripted — MINDS_PROVIDER=claude but no MINDS_API_KEY');
} else {
  console.log('  minds: scripted — no key, no network, no cost');
}
console.log('');

const agents = [];
const log = (m) => console.log(`  ${m}`);

function providerFor(i) {
  const scripted = new ScriptedProvider(makeRandom(`agent:${i}`));
  if (!useModel || !hasKey) return scripted;
  return new LlmProvider({
    apiKey: process.env.MINDS_API_KEY,
    model: process.env.MINDS_MODEL,
    fallback: scripted,
    budget,
    maxCalls: AGENTS.maxCallsPerAgent,
  });
}

async function main() {
  for (let i = 0; i < COUNT; i++) {
    const a = new Agent({
      name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''),
      provider: providerFor(i),
      rand: makeRandom(`agentbody:${i}`),
      onLog: log,
    });
    try {
      await a.connect(URL);
      agents.push(a);
      log(`+ ${a.name} joined as #${a.id}`);
    } catch (err) {
      console.error(`  could not connect: ${err.message}`);
      console.error('  is the server up?  npm run serve\n');
      process.exit(1);
    }
    // Stagger the joins so twelve agents do not all deliberate on the same
    // tick, which would spike both the server and the bill.
    await sleep(120);
  }
  console.log('');

  const STEP = 1 / 30; // agents think at half the sim rate; nothing needs more
  let elapsed = 0;
  let reported = 0;

  const timer = setInterval(() => {
    for (const a of agents) a.update(STEP);
    elapsed += STEP;

    if (elapsed - reported >= 15) {
      reported = elapsed;
      const decisions = agents.reduce((n, a) => n + a.decisions, 0);
      const spent = budget.spent;
      const doing = {};
      for (const a of agents) {
        const g = a.status.goal.split(' ')[0];
        doing[g] = (doing[g] ?? 0) + 1;
      }
      console.log(
        `  ${Math.round(elapsed)}s · ${agents.length} alive · ${decisions} decisions · ` +
          Object.entries(doing).map(([k, n]) => `${n} ${k}`).join(', ') +
          (useModel && hasKey
            ? ` · ${spent.calls}/${spent.of} calls, ${spent.tokensIn + spent.tokensOut} tokens`
            : '')
      );
      if (spent.exhausted && !budget.announced) {
        budget.announced = true;
        console.log('  budget spent — everyone is on scripted brains from here');
      }
    }

    if (SECONDS && elapsed >= SECONDS) shutdown();
  }, 1000 / 30);

  function shutdown() {
    clearInterval(timer);
    console.log('\n  ── what they did ──\n');
    for (const a of agents) {
      const s = a.status;
      console.log(
        `    ${s.name.padEnd(12)} ${String(s.decisions).padStart(4)} decisions · ` +
          `${String(s.remembers).padStart(2)} memories · now: ${s.goal}`
      );
      if (s.lastError) console.log(`      last error: ${s.lastError}`);
    }
    if (useModel && hasKey) {
      const s = budget.spent;
      console.log(`\n    ${s.calls} calls · ${s.tokensIn} in / ${s.tokensOut} out tokens`);
    }

    // ── and file it ──
    // The console scrolls away and the findings go with it. A run that noticed
    // nobody ever made camp should still be saying so tomorrow, in the same
    // file the humans write their notes into — so the two kinds of feedback
    // read as one document rather than as two systems you have to check.
    const { text, findings } = buildReport(agents, {
      seconds: elapsed,
      minds: useModel && hasKey ? 'model' : 'scripted',
      model: useModel && hasKey ? (process.env.MINDS_MODEL ?? 'claude-sonnet-4-5') : null,
      spend: useModel && hasKey ? budget.spent : null,
    });
    try {
      appendNote({ text, who: `${agents.length} agents`, context: `${Math.round(elapsed)}s at ${URL}` });
      console.log(`\n  written to ${NOTES_FILE} — ${summarise(findings)}\n`);
    } catch (err) {
      // Never let filing a report be the thing that breaks the run.
      console.log(`\n  could not write ${NOTES_FILE}: ${err.message}\n`);
    }

    for (const a of agents) a.close();
    setTimeout(() => process.exit(0), 300);
  }

  process.on('SIGINT', shutdown);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((err) => {
  console.error(`\n  ${err.message}\n`);
  process.exit(1);
});
