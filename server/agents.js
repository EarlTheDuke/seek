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
import { loadRoster, providerFor as providerForEntry, describeRoster, rotateMinds } from './roster.js';
import { makeRandom } from '../src/world/noise.js';
import { assignPersonas, PERSONA_IDS } from '../src/minds/personas.js';
import { AGENTS } from '../src/config.js';
import { buildReport, summarise } from './playreport.js';
import { boardState, serveBoard, boardPortFromEnv, mindHealth } from './board.js';
import { FleetClock } from './fleetclock.js';
import { openJournal } from './journal.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendNote, NOTES_FILE } from './notes.js';

// `new URL(...).pathname` percent-encodes the spaces in this repo's own path and
// node cannot open the result — the trap `keycheck` already wrote down.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

// A wall clock, IN THE RUNNER. A file needs a name and a run needs a date, and
// neither is simulation — the same line `fleetclock.js` draws. Nothing seeded
// reads this, so a run still reproduces from its seed whatever it is called.
const RUN_ID = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
const round1 = (n) => Math.round(n * 10) / 10;

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

// ── NARRATE: make it watchable ──
//
//   NARRATE=on npm run agents
//
// Every mind has logged what it decided since the day minds were added, and
// nobody could ever see it. With this on, each one says what it is doing and
// WHY into the world's chat as it changes its mind — which is the difference
// between "some NPCs are wandering" and "watch three models disagree about a
// carcass". Off by default: a world that narrates itself unasked is one nobody
// can play straight.
const NARRATE = /^(on|yes|1|true)$/i.test(process.env.NARRATE ?? '');

// ── MEMORY=flat: the control arm for the memory split ──
//
// `flat` is one undifferentiated ring with recency-only recall — exactly how
// this project worked until 2026-08-08, when it was measured that an event
// survived precisely ONE decision before perception evicted it. The default is
// the two-stream, importance-scored version.
//
// It is a switch and not a rewrite because "how much of a model's competence is
// the scaffolding rather than the model" is a question that needs BOTH arms of
// a run to answer, and this project has now twice concluded a model was
// incompetent when the harness was at fault. See lmgame-Bench's modular
// scaffolds, and WHAT-A-MIND-IS-GIVEN.md.
const MEMORY_FLAT = /^(flat|off|old)$/i.test(process.env.MEMORY ?? '');

// ── DETOUR=commit: a step aside becomes a DESTINATION ──
//
//   DETOUR=commit npm run agents
//
// When the ground is in the way the body picks a spot to walk round it, and
// until this flag existed it re-picked that spot thirty times a second from a
// probe cast along a line of sight that rotates as it walks. 13% of those came
// back null and the walk was abandoned a tenth of a second in: sixteen episodes,
// twenty metres walked in TOTAL, not one arrival. With `commit` the spot is
// remembered in world coordinates and walked to. Off by default because
// `huntcheck` is a real-time check that comes back red about a third of the
// time, and an unguarded behaviour change cannot be told apart from luck.
// ── ...and DETOUR=close: that step also CLOSES THE RANGE ──
//
//   DETOUR=close npm run agents          DETOUR=commit,close npm run agents
//
// The second mechanism, and the one the commitment did not touch. A candidate
// spot is offered PERPENDICULAR to the line of sight, so a step aside holds the
// range exactly while the deer drifts — the slant crosses `AGENTS.shootRange`,
// `aimAt` answers `too far`, and that answer carries no `blockedBy` so the
// detour branch stops firing and the body walks back at the hill. Measured over
// eight runs on both arms of `commit`: `too far` ends 54-64% of every step
// aside. `close` lets a candidate move up the line of sight as well as across
// it. Independent flags, composable in either order.
const DETOUR = (process.env.DETOUR ?? '').toLowerCase().split(/[,\s]+/).filter(Boolean);
const COMMIT_DETOUR = DETOUR.some((t) => /^(commit|on|yes|1|true)$/.test(t));
const CLOSE_DETOUR = DETOUR.includes('close');

// ── BOARD: the second mile — a board, not a column ──
//
//   BOARD=on npm run agents         http://127.0.0.1:8090
//   BOARD=8090 npm run agents
//
// NARRATE puts each change of mind into the chat, and chat scrolls: six minds
// narrating push each other off the top in seconds, and three of the four
// things every agent records — what it DID, every arrow, and every shot it
// refused — never appear anywhere at all. The board is one card per mind,
// repainting once a second, with all four threads under it. Off by default and
// loopback only. See server/board.js.
const BOARD_PORT = boardPortFromEnv(process.env);

// ── A FLEET OF DIFFERENT MINDS, not N copies of one ──
//
//   MINDS_ROSTER=roster.json npm run agents
//
// The roster names every player and gives each its own vendor, model and
// character. Without one this behaves exactly as it always did: `COUNT` players
// off the name list, all on whatever the MINDS_* variables say. See roster.js.
// ── ROTATE: move every mind one seat along ──
//
//   ROTATE=1 npm run agents
//
// A model welded to one seat, one character and one spawn cannot be told apart
// from that seat. Two runs of the same roster reached opposite verdicts on
// grok-4.6 on 2026-08-12 for exactly this reason. Run the same roster at
// ROTATE=0,1,2,… and a model's score is the average over seats rather than a
// property of where it happened to wake up. 0 is byte-identical to no rotation.
// See `rotateMinds`.
const ROTATE = Math.trunc(Number(process.env.ROTATE) || 0);

const ROSTER = process.env.MINDS_ROSTER
  ? rotateMinds(loadRoster(process.env.MINDS_ROSTER), ROTATE)
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
  // ── A CAP IN THE UNIT THAT ACTUALLY MATTERS ──
  //
  //   BUDGET_USD=5 npm run agents
  //
  // Calls stopped being a useful unit the moment two seats in one roster cost
  // different amounts. Measured 2026-08-12: grok-4.20-non-reasoning made 375
  // calls for ~$0.69 while two grok-4.6 seats made 135 between them for ~$1.63
  // — about NINE TIMES the cost per decision — and `budgetCalls` could not see
  // the difference. Off unless asked, so nothing that used to run changes.
  maxUsd: Number(process.env.BUDGET_USD) > 0 ? Number(process.env.BUDGET_USD) : Infinity,
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
// ── AND SAY WHEN THE TABLE IS NOT LEVEL ──
//
// Cadence is set by price, which is right for an unattended hour and fatal for
// a comparison. One measured hour: Eachann took 138 decisions and Coinneach 34,
// so anything said about grok against kimi from that run is about the CADENCE,
// not the models. Nobody noticed until the numbers were added up afterwards.
//
// Said loudly at the top, before the money is spent, because a confound you
// discover in the write-up has already cost you the run.
if (ROSTER) {
  const cad = ROSTER.players
    .filter((p) => p.provider && p.provider !== 'scripted')
    .map((p) => Number(process.env.CADENCE) || Number(p.cadenceSeconds) || AGENTS.cadenceSeconds);
  if (cad.length > 1) {
    const lo = Math.min(...cad);
    const hi = Math.max(...cad);
    if (hi / lo >= 1.5) {
      console.log('');
      console.log(`  ⚠ THE TABLE IS NOT LEVEL — cadences run ${lo}s to ${hi}s, so the fastest`);
      console.log(`    seat will take about ${(hi / lo).toFixed(1)}x the decisions of the slowest.`);
      console.log('    Fine for watching. NOT a comparison between models: the difference you');
      console.log('    measure will mostly be the clock. CADENCE=30 levels it.');
      console.log('');
    } else {
      console.log(`  cadence: level at ${lo}-${hi}s — a fair table`);
    }
  }
}
if (ROSTER) {
  console.log(`  roster: ${process.env.MINDS_ROSTER}`);
  // SAY IT OUT LOUD. A rotated run and an unrotated one are the same seven names
  // in the same order, and comparing two runs without knowing which is which is
  // worse than not rotating at all.
  if (ROSTER.rotatedBy) {
    console.log(`  ROTATED by ${ROSTER.rotatedBy} — every mind has moved seat. Characters and spawns stayed put.`);
  }
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
if (NARRATE) {
  console.log('  narrating: each mind says what it is doing and why, in the chat column');
}
console.log(MEMORY_FLAT
  ? '  memory: FLAT — one ring, recency only. The pre-2026-08-08 control arm.'
  : '  memory: two streams — sightings cannot evict what happened (MEMORY=flat for the old behaviour)');
console.log('');

const agents = [];
const log = (m) => console.log(`  ${m}`);
// Module scope so the board can read it. The board is served from a callback
// that fires whenever a browser asks, which is not on the fleet's own clock.
let elapsed = 0;
let board = null;

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
      narrate: NARRATE,
      memoryFlat: MEMORY_FLAT,
      commitDetour: COMMIT_DETOUR,
      closeDetour: CLOSE_DETOUR,
      // Per-agent, so a ponderous mind and a twitchy one can share a hillside —
      // and so a model-backed fleet can be slowed without slowing any BODY.
      //
      // ── CADENCE OVERRIDES THE ROSTER, AND THAT IS THE POINT ──
      //
      // It used to be `entry?.cadenceSeconds ?? process.env.CADENCE`, so a
      // roster line always won and `CADENCE=30` was dead for every real run —
      // the same shape of bug as ORDERS, where a default silently ate the
      // switch that was meant to change it.
      //
      // It matters because cadence is set by PRICE, which is right for an
      // unattended hour and fatal for a comparison. Measured over one:
      //
      //     Eachann (grok-fast, 20 s)   138 decisions
      //     Fingal  (haiku, 25 s)       110
      //     Morag   (opus-5, 35 s)       79
      //     Coinneach (kimi, 75 s)       34
      //
      // Nothing can be concluded about kimi-k2.6 against claude-opus-5 when one
      // gets four times the turns. `CADENCE=30` now equalises the table, and
      // the budget is the thing you vary instead.
      // The roster's side in a match server ('team': 'red' | 'blue').
      // Ignored by any server not running one.
      team: entry?.team ?? null,
      cadenceSeconds: Number(process.env.CADENCE) > 0
        ? Number(process.env.CADENCE)
        : (Number(entry?.cadenceSeconds) > 0 ? Number(entry.cadenceSeconds) : AGENTS.cadenceSeconds),
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

  // ── the board ──
  // Stood up after everybody is in, so the first page a watcher loads already
  // has a fleet on it. Built fresh on every request rather than kept and
  // mutated: `boardState` is pure and the agents are the only source of truth,
  // so there is no second copy to go stale.
  if (BOARD_PORT) {
    board = await serveBoard({
      port: BOARD_PORT,
      log: console.log,
      state: () => boardState(agents, {
        seconds: elapsed,
        minds: anyModel ? 'model' : 'scripted',
        model: anyModel
          ? [...new Set(providers.filter((p) => p.name !== 'scripted').map((p) => p.model))].join(', ')
          : null,
        spend: anyModel ? budget.spent : null,
        url: URL,
      }),
    });
    if (board) console.log(`  board: ${board.url} — one card per mind, what it means, does, shoots and refuses`);
  }
  console.log('');

  // FIXED STEP, AND IT MUST STAY FIXED. A seeded run has to reproduce, and a
  // variable dt makes every body's path depend on how busy the machine was.
  // What was wrong was never this number — it was counting ticks of it and
  // calling the total "seconds". See `fleetclock.js`.
  const STEP = 1 / 30; // agents think at half the sim rate; nothing needs more
  const clock = new FleetClock();

  // ── THE RUN, WRITTEN DOWN AS IT HAPPENS ──
  //
  // `deeds` and `intentions` are 400-deep rings and DEV-NOTES is only written
  // on a clean exit, so until now a killed window — which is what STOP.cmd
  // does — left nothing behind but whatever was still in the ring. This is
  // append-only and flushed as it goes: a run killed mid-sentence keeps
  // everything up to that sentence. Nothing reads it back, so it cannot change
  // a run.
  const journal = openJournal(path.join(ROOT, 'runs', `journal-${RUN_ID}.jsonl`));
  journal.begin({ url: URL, roster: process.env.MINDS_ROSTER ?? 'roster.json',
                  rotate: ROSTER?.rotatedBy ?? 0,
                  seats: agents.map((a) => ({ name: a.name, model: a.provider?.model ?? a.provider?.name ?? 'scripted' })) });
  let journalledAt = 0;
  let reported = 0;
  let laggedAt = 0;

  const timer = setInterval(() => {
    for (const a of agents) a.update(STEP);
    clock.tick(STEP);
    // Drained on a timer rather than every tick: the events are rare and the
    // cost is a file write, so once a second keeps the file honest without
    // making a 30 Hz loop do IO thirty times a second for nothing.
    if (clock.wall - journalledAt >= 1) {
      journalledAt = clock.wall;
      journal.drain(agents, clock.wall);
    }
    // The wall, not the tick count. `elapsed` feeds the console line, the
    // report's `meta.seconds`, the board and the `for=` stop — and every one of
    // them was 26% slow on the hour run, which is why that run did not stop at
    // the hour it was asked for.
    elapsed = clock.wall;

    if (elapsed - reported >= 15) {
      reported = elapsed;
      const decisions = agents.reduce((n, a) => n + a.decisions, 0);
      const spent = budget.spent;
      const doing = {};
      for (const a of agents) {
        const g = a.status.goal.split(' ')[0];
        doing[g] = (doing[g] ?? 0) + 1;
      }
      // ── HOW MANY OF THOSE CALLS CAME BACK AS A GOAL ──
      //
      // `spent.calls` counts what was ASKED. It has always been printed and it
      // is not the interesting number: every failure falls through to the
      // scripted brain, so a fleet whose every answer is the rules engine
      // prints an identical line to one that is working perfectly. `answered`
      // is the number a watcher actually wants.
      const health = anyModel ? agents.map((a) => mindHealth(a.provider)) : [];
      const failed = health.reduce((n, h) => n + h.failures, 0);
      // ── HOW MUCH OF THE TALKING ACTUALLY HAPPENED ──
      //
      // `gagged` has been counted in `agent.js` since the speech gate was
      // written and READ BY NOTHING — a private number in an object nobody
      // printed. Meanwhile the only speech reaching the console was the
      // refusals, because the success branch never called `onLog`. So the
      // liveliest thing six models produce was invisible except when it failed,
      // and the ratio that says whether the gate is set right was uncollected.
      //
      // Both, together, on the line a watcher already reads. `said` is the
      // count of sentences that reached the wire; `gagged` is the count the
      // gate refused, and a gagged number climbing past the said one means
      // `AGENTS.speakEveryDecisions` is throttling a conversation, not spam.
      const said = agents.reduce((n, a) => n + (a.said?.length ?? 0), 0);
      const gagged = agents.reduce((n, a) => n + (a.gagged ?? 0), 0);
      console.log(
        `  ${Math.round(elapsed)}s · ${agents.length} alive · ${decisions} decisions · ` +
          Object.entries(doing).map(([k, n]) => `${n} ${k}`).join(', ') +
          (said || gagged ? ` · ${said} said / ${gagged} gagged` : '') +
          (anyModel
            ? ` · ${spent.calls}/${spent.of} calls, ${spent.tokensIn + spent.tokensOut} tokens` +
              // ── AND WHAT IT HAS COST, WHILE IT IS COSTING IT ──
              // No invoice can tell you this while a run is happening, and the
              // only number that used to be on this line was CALLS — the unit
              // that hides a nine-fold difference between two seats.
              (spent.usd > 0
                ? `, $${spent.usd.toFixed(2)}${Number.isFinite(spent.ofUsd) ? `/$${spent.ofUsd}` : ''}` +
                  ` (${spent.perModel.filter((m) => (m.usd ?? 0) > 0)
                    .map((m) => `${m.model.replace(/^grok-/, '').slice(0, 14)} $${m.usd.toFixed(2)}`)
                    .join(', ')})`
                : '') +
              // Named, never silently priced at zero. A model nobody has a price
              // for is a hole in the number, and a hole you cannot see is how a
              // bill becomes a surprise.
              (spent.unpriced?.length ? `, UNPRICED: ${spent.unpriced.join(', ')}` : '') +
              // ── NAMED, NOT JUST COUNTED ──
              // `52 FAILED` is a number nobody can act on. The loud warning
              // below only fires past 20%, so a steady 11% — one decision in
              // nine silently answered by the scripted brain — printed this
              // aggregate and nothing else for 83 minutes. A rate that low
              // does not deserve a klaxon, but it must not be anonymous:
              // an unattributed failure rate quietly contaminates every
              // comparison between models made from the same run.
              (failed
                ? `, ${failed} FAILED (` +
                  health
                    .map((h, i) => (h.failures ? `${agents[i].name} ${h.failures}` : null))
                    .filter(Boolean)
                    .join(', ') + ')'
                : '')
            : '')
      );

      // ── AND SAY SO ONCE, LOUDLY, WHEN A MIND HAS STOPPED BEING ONE ──
      //
      // The worst outcome for a watched session is not a model behaving badly;
      // it is a model that is not playing while the header says it is. Said
      // once per agent so it cannot be scrolled past and cannot become noise.
      for (let i = 0; i < agents.length; i++) {
        const h = health[i];
        if (!h || h.provider === 'scripted') continue;
        // 0.2 was too high to catch the thing it exists to catch. A run
        // sat at 11% for 83 minutes — well under the alarm, and well over
        // "fine". Below about 8% you are arguing with ordinary API flakiness;
        // above it you are measuring the scripted brain and calling it a model.
        const bad = h.fellBack || (h.calls >= 5 && h.failureRate > AGENTS.unwellAbove);
        // ── SAID ONCE PER AGENT MEANT SAID ONCE PER RUN, FOREVER ──
        //
        // `_warnedUnwell` was set true and never cleared, so a seat that went
        // bad, recovered, and went bad again was reported for the first spell
        // and silent for every one after — and "silent" is exactly what a
        // watcher reads as "fine now". Worse, the warning is worth MORE the
        // second time: one bad patch is API weather, a returning one is a seat
        // that should not be in the comparison at all.
        //
        // So the latch now RESETS when the seat recovers, and repeats are
        // rationed by time rather than suppressed outright — loud enough not to
        // be scrolled past, quiet enough not to become the wallpaper it was
        // originally silenced for being.
        if (!bad) { agents[i]._warnedUnwell = 0; continue; }
        const since = elapsed - (agents[i]._warnedUnwell ?? 0);
        if (agents[i]._warnedUnwell && since < AGENTS.unwellRepeatSeconds) continue;
        const again = agents[i]._warnedUnwell ? ' (still)' : '';
        agents[i]._warnedUnwell = elapsed;
        console.log(
          `  ⚠ ${agents[i].name}${again} is on ${h.model ?? h.provider} and ` +
            `${h.failures} of ${h.calls} calls FAILED — it is answering from the scripted brain.\n` +
            `    last error: ${h.lastError ?? 'none recorded'}`
        );
      }

      // ── AND WHETHER THE FLEET IS KEEPING UP WITH REAL TIME AT ALL ──
      //
      // A number nobody had, because `elapsed` WAS the tick count and could not
      // disagree with itself. Now it can, and the gap is a finding: a fleet
      // running 26% behind is asking every mind to think 26% less often than
      // the roster says, which silently changes the experiment.
      if (clock.lagging && elapsed - laggedAt >= AGENTS.unwellRepeatSeconds) {
        laggedAt = elapsed;
        console.log(`  ${clock.driftLine()}`);
      }
      if (spent.exhausted && !budget.announced) {
        budget.announced = true;
        console.log(`  budget spent (${spent.calls}/${spent.of} calls, $${spent.usd.toFixed(2)}` +
          `${Number.isFinite(spent.ofUsd) ? ` of $${spent.ofUsd}` : ''}) — everyone is on scripted brains from here`);
      }
    }

    if (SECONDS && elapsed >= SECONDS) shutdown();
  }, 1000 / 30);

  function shutdown() {
    clearInterval(timer);
    // One last drain BEFORE anything else, so the final decisions of a run are
    // in the file even if the report below throws.
    try { journal.drain(agents, clock.wall); journal.end({ seconds: round1(clock.wall), lines: journal.lines }); } catch { /* never block a shutdown on the record of it */ }
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
    // -- AND THE WORLD IS STILL RUNNING, WHICH NOBODY EXPECTS --
    //
    // `--for` / AGENT_SECONDS stops the MINDS. The server is a different process
    // that this one did not start and cannot politely stop -- and it holds port
    // 8080. So a run that has finished, printed its report and gone quiet leaves
    // a world standing, which then blocks the next run and makes `boardcheck`
    // fail on a held port.
    //
    // Hit twice on 2026-08-14: once while writing a run up, once while starting
    // the next. Deliberately NOT solved with a remote-kill message -- any
    // connected client could then close the world, which is a far worse thing to
    // have than a port to tidy up. So it says so, plainly, at the one moment
    // somebody is certainly looking at this console.
    console.log(`  THE WORLD IS STILL RUNNING at ${URL} -- the minds stopped, it did not.`);
    console.log('  Nothing is spending now. But it holds the port, so the next run and');
    console.log('  boardcheck will fail until it is closed: double-click STOP.cmd.');
    console.log('');

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
    // The board outlives nothing. Closed here so a run that ends stops holding
    // the port — the next fleet wants it back.
    board?.close();
    setTimeout(() => process.exit(0), 300);
  }

  process.on('SIGINT', shutdown);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((err) => {
  console.error(`\n  ${err.message}\n`);
  process.exit(1);
});
