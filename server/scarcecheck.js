// ── scarcecheck.js ──────────────────────────────────────────────────────────
// Does a lean valley actually bite — and does everybody still agree where the
// wood is?
//
//   npm run scarcecheck
//
// Personas were built last run and cannot show. A hoarder who will not share a
// fire and someone generous who gets exploited take the SAME actions in a world
// where there is another branch four metres away and another herd over the
// rise. That is not a prompt problem; it is a game-design one, and this is the
// check for the fix.
//
// Two things have to be true and they pull against each other:
//
//   IT MUST BITE     — materially less fuel and game, pulled into fewer places,
//                      or the experiment measures nothing.
//   IT MUST NOT LIE  — firewood is drawn by each client from a pure function of
//                      the seed, so a server that thins the wood and does not
//                      say so leaves browsers painting branches that are not
//                      there and agents walking to them for ever. The number
//                      rides in the welcome and this proves an agent takes it
//                      and then successfully picks up a real branch.
//
// And OFF BY DEFAULT: with no SCARCE in the environment the placement is
// byte-identical to the world before any of this existed.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Agent } from '../src/net/agent.js';
import { makeRandom } from '../src/world/noise.js';
import { requireFreePort } from './freeport.js';
import { setScarcity, scarcityFromEnv, scarce, richnessAt } from '../src/world/scarcity.js';
import { deadfallNear } from '../src/world/pickups.js';
import { SimWorld } from '../src/sim/world.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8094);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Branches over a fixed square of country, so two settings are comparable. */
function woodOver(range = 600, step = 130) {
  let n = 0;
  for (let x = -range; x <= range; x += step) {
    for (let z = -range; z <= range; z += step) n += deadfallNear(x, z, step / 2).length;
  }
  return n;
}

const alwaysGather = { name: 'always-gather', async decide() { return { kind: 'gather' }; } };

async function main() {
  console.log('\n  Does a lean valley bite, and does everybody agree where the wood is?\n');

  // ── off by default ────────────────────────────────────────────────────────
  setScarcity(null);
  check('a world nobody made hard is the world it always was', !scarce(),
    `richness is ${richnessAt(120, -340).toFixed(3)} everywhere`);
  const plentyWood = woodOver();

  // ── the environment spelling ──────────────────────────────────────────────
  check('SCARCE=on is a hard winter', JSON.stringify(scarcityFromEnv({ SCARCE: 'on' })) === '{"plenty":0.45,"patchy":0.75}');
  check('SCARCE=0.5 is half as much, spread as evenly as ever',
    scarcityFromEnv({ SCARCE: '0.5' })?.plenty === 0.5);
  check('and nothing in the environment is the world unchanged', scarcityFromEnv({}) === null);

  // ── it bites ──────────────────────────────────────────────────────────────
  setScarcity(scarcityFromEnv({ SCARCE: 'on' }));
  const leanWood = woodOver();
  const drop = 1 - leanWood / plentyWood;
  check('a hard winter takes most of the firewood off the hill', drop > 0.35 && drop < 0.9,
    `${plentyWood} branches -> ${leanWood}, ${Math.round(drop * 100)}% gone`);

  // ── and it is PATCHY, which is the half that makes an evening ─────────────
  //
  // Halving everything everywhere is a poorer world that everyone forages a
  // little longer in. Pulling it into one good valley is what makes three
  // minds arrive at the same carcass.
  const patches = [];
  for (let x = -600; x <= 600; x += 200) {
    for (let z = -600; z <= 600; z += 200) patches.push(deadfallNear(x, z, 100).length);
  }
  const mean = patches.reduce((a, b) => a + b, 0) / patches.length;
  const worst = Math.min(...patches);
  const best = Math.max(...patches);
  check('and it is not spread evenly — there is good ground and bad', best > worst * 2.5,
    `${worst} branches in the barest 100 m, ${best} in the richest, mean ${mean.toFixed(1)}`);

  // ── the animals move with the fuel ────────────────────────────────────────
  //
  // Deliberately the same field: the valley with the deer in it is the valley
  // with the wood to cook them, which is what makes it worth holding rather
  // than merely worth passing through.
  const countLive = () => {
    const w = new SimWorld({ headless: true });
    w.addPlayer('a', 'Alice');
    for (let i = 0; i < 60; i++) w.step(1 / 30);
    return w.wildlife.creatures.length;
  };
  setScarcity(null);
  const plentyHerd = countLive();
  setScarcity(scarcityFromEnv({ SCARCE: 'on' }));
  const leanHerd = countLive();
  check('and there is less game on the same hillside', leanHerd < plentyHerd,
    `${plentyHerd} animals around a spawning player -> ${leanHerd}`);

  // ── it must not lie ───────────────────────────────────────────────────────
  //
  // The failure this guards against is silent and total: the server thins the
  // wood, the client does not hear, and every branch a body walks to is a
  // branch that is not there. `arriveWithin` is 6 m and `PICKUP.radius` is 2.2,
  // so a body can press E thirty-five times at nothing and every tally of
  // intents will call that foraging. This asserts the OUTCOME — wood in a pack
  // — on a server that is running lean.
  setScarcity(null); // the check process starts honest; the welcome must set it
  await requireFreePort(PORT, 'scarcecheck');
  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0', SCARCE: 'on' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  let agent = null;
  for (let i = 0; i < 40 && !agent; i++) {
    await sleep(150);
    agent = await new Agent({ name: 'Forager', provider: alwaysGather, rand: makeRandom('scarcecheck') })
      .connect(URL)
      .catch(() => null);
  }
  if (!agent) throw new Error(`no server answered on ${URL}`);
  await sleep(600);

  check('the welcome says how lean the country is', scarce(),
    `the agent's own world is now ${Math.round(scarce() ? 45 : 100)}% stocked, taken off the wire`);

  let sawWood = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000 && sawWood === 0) {
    agent.update(1 / 30);
    sawWood = Math.max(sawWood, agent.count('wood'));
    await sleep(1000 / 30);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  check('AND A BODY CAN STILL FIND A BRANCH THAT IS REALLY THERE', sawWood > 0,
    sawWood > 0
      ? `${sawWood} carried in ${secs} s — so the server and the agent agree about where the wood is`
      : `nothing in the pack after ${secs} s — client and server disagree, or the valley is too lean to live in`);

  agent.close();
  stop();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n  scarcecheck could not run: ${err.message}\n`);
  process.exit(1);
});
