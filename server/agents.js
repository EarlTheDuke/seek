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
import { ScriptedProvider, makeProvider, Budget } from '../src/minds/providers.js';
import { loadRoster, providerFor as providerForEntry, describeRoster } from './roster.js';
import { makeRandom } from '../src/world/noise.js';
import { assignPersonas, PERSONA_IDS } from '../src/minds/personas.js';
import { AGENTS } from '../src/config.js';
import { buildReport, summarise } from './playreport.js';
import { appendNote, NOTES_FILE } from './notes.js';

const args = process.argv.slice(2);
const positional = args.filter((a) => /^\d+$/.test(a)).map(Number);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

let COUNT = positional[0] ?? Number(process.env.AGENT_COUNT ?? 6);
const URL = flag('url', process.env.AGENT_URL ?? 'ws://127.0.0.1:8080');
const SECONDS = Number(flag('for', process.env.AGENT_SECONDS ?? 0)); // 0 = forever

// Scots and Gaelic, like everything else that lives here.
const NAMES = [
  'Eachann', 'Morag', 'Tormod', 'Ailsa', 'Fingal', 'Iseabail',
  'Calum', 'Beathag', 'Ruaridh', 'Mairead', 'Lachlan', 'Oighrig',
];

// What a sentence you say to them DOES. See the note on Agent's constructor.
//
//   decides (default) — they hear you and make up their own minds
//   obeys             — a recognised instruction becomes a goal, deterministically
//
//   ORDERS=obeys npm run agents -- 2
const ORDERS = process.env.ORDERS === 'obeys' ? 'obeys' : 'decides';
// PET=wolfcub npm run agents — every agent walks in with one. Only useful for
// watching: the mind is not told the animal exists and cannot ask it for
// anything. It is here because a fleet with dogs is how you SEE that other
// people's companions are in the world now.
const PET = process.env.PET ?? null;

// ── A FLEET OF DIFFERENT MINDS, not N copies of one ──
//
//   MINDS_ROSTER=roster.json npm run agents
//
// The roster names every player and gives each its own vendor, model and
// character. Without one this behaves exactly as it always did: `COUNT` players
// off the name list, all on whatever the MINDS_* variables say. See roster.js.
const ROSTER = process.env.MINDS_ROSTER
  ? loadRoster(process.env.MINDS_ROSTER)
  : null;

// ── PERSONAS: the experiment, and its control ──
//
//   PERSONAS=off                    (default) everybody gets the untouched
//                                   baseline prompt, byte for byte. THE CONTROL.
//   PERSONAS=on                     characters dealt from the seed, so a run
//                                   reproduces and "player three was the liar"
//                                   is still true tomorrow.
//   PERSONAS=hoarder,liar,coward    explicit, in order, cycling.
//
// A roster entry's own `character` always wins: somebody who wrote the
// character out by hand meant it. See src/minds/personas.js.
const PERSONAS = process.env.PERSONAS ?? 'off';

const useModel = (process.env.MINDS_PROVIDER ?? 'scripted') !== 'scripted';
const hasKey = !!process.env.MINDS_API_KEY;

// One purse for the whole session, so "twelve players" cannot quietly cost
// twelve times what one does.
const budget = new Budget({
  maxCalls: Number(process.env.MINDS_MAX_CALLS ?? ROSTER?.budgetCalls ?? AGENTS.maxCallsTotal),
  label: 'agents',
});

// The roster decides how many there are — a fleet is the people in it.
if (ROSTER) COUNT = ROSTER.players.length;

// Built once, up front, so the console can say what is ACTUALLY about to play
// rather than what was asked for. A player whose key is missing is scripted,
// and finding that out from the header beats finding it out from the bill.
// Dealt before anything is built, because a provider is told who it is when it
// is constructed. Seeded by the roster file's name when there is one, so two
// different fleets do not get the same casting.
const cast = assignPersonas(PERSONAS, COUNT, process.env.MINDS_ROSTER ?? 'highlands');

const providers = [];
for (let i = 0; i < COUNT; i++) {
  providers.push(
    ROSTER
      ? providerForEntry(ROSTER.players[i], {
          budget, maxCalls: AGENTS.maxCallsPerAgent, index: i,
          // Only where the roster said nothing. Hand-written character wins.
          persona: ROSTER.players[i]?.character ? null : cast[i],
        })
      : makeProvider(makeRandom(`agent:${i}`), process.env, {
          budget,
          maxCalls: AGENTS.maxCallsPerAgent,
          character: cast[i]?.character ?? null,
        })
  );
}
const anyModel = providers.some((p) => p.name !== 'scripted');

console.log('\n  Highlands — agents');
console.log(`  ${COUNT} player${COUNT === 1 ? '' : 's'} joining ${URL}`);
console.log(`  orders: ${ORDERS === 'obeys'
  ? 'obeys — "follow me", "guard me", "kill the troll", "wait", "carry on"'
  : 'decides — they hear you and make up their own minds (ORDERS=obeys to change)'}`);
if (ROSTER) {
  console.log(`  roster: ${process.env.MINDS_ROSTER}`);
  for (const line of describeRoster(ROSTER, providers)) console.log(line);
} else if (anyModel) {
  console.log(`  minds: ${providers[0].name} · ${providers[0].model}`);
} else {
  console.log('  minds: scripted — no key, no network, no cost');
}
if (anyModel) {
  console.log(`  budget: ${budget.maxCalls} calls for the whole session, then scripted`);
}
// SAY WHO IS WHO, up front. A session that cannot name its own cast cannot
// attribute anything that happens in it.
if (cast.some(Boolean)) {
  console.log(`  personas: ${cast.map((p, i) => `${i + 1}=${p?.id ?? 'plain'}`).join(' ')}`);
} else {
  console.log(`  personas: off — every mind gets the same prompt (the control).` +
    ` PERSONAS=on, or ${PERSONA_IDS.slice(0, 3).join(',')}…`);
}
console.log('');

const agents = [];
const log = (m) => console.log(`  ${m}`);

async function main() {
  for (let i = 0; i < COUNT; i++) {
    const entry = ROSTER?.players[i];
    const a = new Agent({
      name: entry?.name
        ?? NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''),
      provider: providers[i],
      rand: makeRandom(`agentbody:${i}`),
      onLog: log,
      orders: entry?.orders ?? ORDERS,
      pet: entry?.pet ?? PET,
      // The label, so the report can attribute what happened. The character
      // itself went into the provider above.
      persona: entry?.character ? null : cast[i],
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
          (anyModel
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
        `    ${s.name.padEnd(12)} ${(s.persona ?? '—').padEnd(9)} ` +
          `${String(s.decisions).padStart(4)} decisions · ` +
          `${String(s.remembers).padStart(2)} memories · now: ${s.goal}`
      );
      if (s.lastError) console.log(`      last error: ${s.lastError}`);
    }
    if (anyModel) {
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
      minds: anyModel ? 'model' : 'scripted',
      // What actually played, not what was asked for — with a roster that is
      // several models at once, so it is named as a set.
      model: anyModel
        ? [...new Set(providers.filter((p) => p.name !== 'scripted').map((p) => p.model))].join(', ')
        : null,
      spend: anyModel ? budget.spent : null,
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
