// ── watchcheck.js ───────────────────────────────────────────────────────────
// Can somebody standing on the hill tell WHY?
//
//   npm run watchcheck
//
// Six models on one server is only worth watching if a watcher can tell an
// ambush from a retreat from an aimless wander. Every agent in this project has
// logged `{brief -> goal}` for replay since the day minds were added and NOBODY
// COULD SEE IT — which makes a fleet "some NPCs are about" rather than "watch
// three minds disagree about a carcass".
//
// And the reason matters more than the act: when all three are hunting, the WHY
// is the only thing that tells them apart. The prompt has asked every model for
// one since the beginning — `"why":"<a few words>"` — and `sanitiseGoal` built
// its answer out of the goal's own parameters and dropped it on the floor. Case
// one below is that hole.
//
// Asserted over a real socket, from the OTHER player's seat: what a watcher
// receives, not what the narrator believes it sent.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Agent } from '../src/net/agent.js';
import { makeRandom } from '../src/world/noise.js';
import { sanitiseGoal } from '../src/minds/goals.js';
import { personaById } from '../src/minds/personas.js';
import { AGENTS } from '../src/config.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8092);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A mind that always says the same thing, and always says why. */
const stubborn = (why) => ({
  name: 'stubborn',
  calls: 0,
  async decide() {
    // Alternates, so there is a CHANGE of mind to narrate rather than one
    // decision repeated — narration only fires when a mind changes its mind.
    this.calls++;
    return this.calls % 2
      ? { kind: 'hunt', quarry: 'a deer', why }
      : { kind: 'gather', why };
  },
});

async function main() {
  console.log('\n  Can somebody standing on the hill tell why?\n');

  // ── the reason survives the door ──────────────────────────────────────────
  const kept = sanitiseGoal({ kind: 'hunt', quarry: 'a deer', why: 'meat before the light goes' });
  check('a stated reason is no longer thrown away on arrival', kept.why === 'meat before the light goes',
    JSON.stringify(kept));
  check('...and it is capped like anything else off a socket',
    sanitiseGoal({ kind: 'wander', why: 'x'.repeat(400) }).why.length === 90);
  check('a goal without one is still a goal', sanitiseGoal({ kind: 'wander' }).kind === 'wander');
  check('and a verb that needs a param keeps the reason when it falls back',
    sanitiseGoal({ kind: 'goTo', why: 'somewhere warmer' }).why === 'somewhere warmer',
    'a mind that fumbles the place should not also lose its reason');

  // ── and it reaches a watcher ──────────────────────────────────────────────
  await requireFreePort(PORT, 'watchcheck');
  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  const connect = (opts) => new Agent({ rand: makeRandom(opts.name), ...opts }).connect(URL);

  let watcher = null;
  for (let i = 0; i < 40 && !watcher; i++) {
    await sleep(150);
    watcher = await connect({ name: 'Watcher', provider: stubborn('watching') }).catch(() => null);
  }
  if (!watcher) throw new Error(`no server answered on ${URL}`);

  const talker = await connect({
    name: 'Eachann',
    provider: stubborn('the herd moved down to the water'),
    persona: personaById('hoarder'),
    narrate: true,
  });
  const quiet = await connect({
    name: 'Morag',
    provider: stubborn('the herd moved down to the water'),
    // narrate deliberately absent — the default has to be silence.
  });
  await sleep(500);
  check('three of them are on one server', !!talker.id && !!quiet.id && !!watcher.id,
    `#${watcher.id}, #${talker.id}, #${quiet.id}`);

  const t0 = Date.now();
  let heard = [];
  const fromQuiet = [];
  while (Date.now() - t0 < 60_000 && heard.length < 2) {
    for (const a of [watcher, talker, quiet]) a.update(1 / 30);
    // `Agent.heard` is a ring of plain "Name: what they said" strings — six
    // deep, so this reads it every tick rather than at the end.
    for (const line of watcher.heard ?? []) {
      if (line.startsWith('Eachann:') && !heard.includes(line)) heard.push(line);
      if (line.startsWith('Morag:') && !fromQuiet.includes(line)) fromQuiet.push(line);
    }
    await sleep(1000 / 30);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const text = heard.join(' | ');

  check('A WATCHER HEARS WHAT A MIND IS DOING', heard.length > 0,
    heard.length ? `${heard.length} in ${secs} s: "${heard[0]}"` : `nothing in ${secs} s`);
  check('...and WHY it is doing it', /the herd moved down to the water/.test(text),
    'the reason is the only thing that tells three hunting minds apart');
  check('...and who it is, so the experiment can be attributed', /\[hoarder\]/.test(text),
    'the persona rides along');

  check('and a mind nobody asked to narrate stays silent', fromQuiet.length === 0,
    `${fromQuiet.length} lines from the one with narration off — the default is a world that does not explain itself`);

  check('the narrator also keeps its own thread of intentions',
    (talker.intentions?.length ?? 0) > 0 && talker.intentions.some((i) => i.why),
    talker.intentions?.length
      ? `${talker.intentions.length} kept · e.g. "${talker.intentions.at(-1).goal} — ${talker.intentions.at(-1).why}"`
      : 'nothing recorded');

  // ── AND IT REACHES THE MIND, not just the ring ──
  //
  // `heard` being full is not the same as the mind being told. The brief is the
  // only thing a provider ever sees, and for a long time it carried the last
  // THREE lines out of a ring of six — less than one exchange once six agents
  // and a human share a channel. A mind would answer a question that had already
  // scrolled out of its own memory.
  const brief = watcher.brief();
  check('what it heard reaches the BRIEF the mind is actually given',
    Array.isArray(brief.heard) && brief.heard.some((l) => /Eachann:/.test(l)),
    brief.heard?.length ? `${brief.heard.length} lines, e.g. "${brief.heard.at(-1)}"` : 'the brief heard nothing');

  // Deterministic, because a live run cannot be made to produce twelve lines on
  // a schedule. Fills the ring by hand and asserts the WIDTH.
  const wide = Object.assign(Object.create(Object.getPrototypeOf(watcher)), watcher);
  wide.heard = Array.from({ length: 12 }, (_, i) => `Somebody: line ${i + 1}`);
  const wideBrief = wide.brief();
  check('and the window is wide enough to hold a conversation in',
    wideBrief.heard.length === AGENTS.hears && AGENTS.hears >= 8 &&
      wideBrief.heard.at(-1) === 'Somebody: line 12',
    `${wideBrief.heard.length} of 12 lines reach the mind (AGENTS.hears ${AGENTS.hears}), newest last`);

  for (const a of [watcher, talker, quiet]) a.close();
  stop();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n  watchcheck could not run: ${err.message}\n`);
  process.exit(1);
});
