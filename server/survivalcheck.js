// ── survivalcheck.js ────────────────────────────────────────────────────────
// Can an agent KEEP ITSELF ALIVE?
//
//   npm run survivalcheck
//
// The rung everything else stands on. An agent that starves makes every other
// feature moot: personalities, providers, a full roster of models arguing over
// a carcass — none of it survives a body that cannot eat.
//
// And until today it could not. Three separate holes, each invisible from the
// browser, which is the only place any of it had ever been exercised:
//
//   * COOKING WAS BROWSER-ONLY. `bestAvailable`/`craft` are pure and shared,
//     and their only caller was the interaction prompt in main.js. There was no
//     field on the wire for "cook this", so a body on a socket carried raw meat
//     for ever. Raw venison fills 16; cooked fills 34.
//   * E PICKED UP WHATEVER WAS NEAR THE FIRST PLAYER. `Pickups.collect` takes
//     what `update` last found, and `update` is called once a tick with the
//     anchor's position. One agent connected is exactly the case that hides it.
//   * A KILLED ANIMAL LEFT NOTHING ON THE SERVER'S GROUND. The kill was rolled
//     and announced, the browser laid the carcass out from the announcement,
//     and the server's own world — the only one an agent can reach — had bare
//     ground where the deer had been.
//
// So this check refuses to be satisfied by intent, the same way huntcheck does.
// It asserts OUTCOMES, over a real socket: wood in the pack, flames in the
// snapshot, a cooked item that did not exist before, hunger that went UP, and a
// body still standing after a staged night.
//
// The venison is STAGED (`STOCK=venison:2`) and that is deliberate. Whether a
// body can hunt is a different question, it has its own check, and it is red —
// tying survival to it would mean one bug hid the other.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Agent } from '../src/net/agent.js';
import { makeRandom } from '../src/world/noise.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8095);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * A mind that only ever says "go and pick something up".
 *
 * The point of this check is the BODY. Foraging is the one part of the loop
 * that IS a decision — the reflex layer will not wander off looking for fuel —
 * so the mind is pinned to it and everything else has to happen by itself.
 */
const alwaysGather = {
  name: 'always-gather',
  async decide() {
    return { kind: 'gather' };
  },
};

async function main() {
  console.log('\n  Can an agent keep itself alive?\n');
  await requireFreePort(PORT, 'survivalcheck');

  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: {
      ...process.env,
      // Nothing that eats people: the question is whether the body feeds and
      // warms itself, and a bear answers a different one.
      DANGER: 'none',
      MINDS_HUNTERS: '0',
      // 01:00. Cold, dark, and the hour this whole loop exists for.
      HOURS: '1',
      // Two steaks and not one branch. The wood has to be foraged, so the
      // gather half of the loop is proved rather than assumed.
      STOCK: 'venison:2',
      // Hungry enough to want a meal soon, not so hungry that it eats the
      // venison raw before it has a fire to cook it on: `AGENTS.eatBelow` is
      // 45 and `AGENTS.eatRawBelow` is 18. Starting at 52 leaves it about an
      // hour of the world's time to forage, lay a fire and cook — which is the
      // order the whole loop is supposed to happen in.
      HUNGER: '52',
    },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  let agent = null;
  for (let i = 0; i < 40 && !agent; i++) {
    await sleep(150);
    agent = await new Agent({ name: 'Camper', provider: alwaysGather, rand: makeRandom('survivalcheck') })
      .connect(URL)
      .catch(() => null);
  }
  if (!agent) throw new Error(`no server answered on ${URL}`);
  await sleep(600);
  check('an agent joined over a socket', agent.id !== null, `#${agent.id}`);

  const startFood = agent.food;

  // ── drive it in REAL time ──
  // The server ticks on a wall clock and rate-limits intents; a tight loop
  // sends a thousand packets describing one second and proves nothing.
  let sawWood = 0;
  let sawFire = false;
  let sawCooked = false;
  let ateAt = null; // the food value the tick before it went up
  let lowestFood = Infinity;
  let prevFood = agent.food;
  const t0 = Date.now();
  while (Date.now() - t0 < 210_000) {
    agent.update(1 / 30);
    sawWood = Math.max(sawWood, agent.count('wood'));
    if ((agent.snapshot?.fi ?? []).length) sawFire = true;
    if (agent.count('venison_cooked') > 0) sawCooked = true;
    const f = agent.food ?? prevFood;
    if (f > prevFood + 3) ateAt ??= prevFood; // hunger only ever goes UP by eating
    lowestFood = Math.min(lowestFood, f);
    prevFood = f;
    // Everything worth proving has happened; do not burn three more minutes.
    if (sawWood && sawFire && sawCooked && ateAt !== null && Date.now() - t0 > 30_000) break;
    await sleep(1000 / 30);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const hours = (agent.hours ?? 0).toFixed(1);

  check('it foraged — wood reached the pack', sawWood > 0,
    sawWood ? `${sawWood} branch${sawWood > 1 ? 'es' : ''} carried` : 'never picked up a stick');

  check('it lit a fire', sawFire, sawFire ? 'flames in the snapshot' : 'no fire ever burned');

  check('IT COOKED', sawCooked,
    sawCooked ? 'cooked venison appeared in a pack that had none' : 'the venison was still raw at the end');

  check('it ate', ateAt !== null,
    ateAt !== null ? `hunger climbed from ${ateAt}` : `hunger only ever fell (low ${lowestFood})`);

  check('AND IT WAS STILL ALIVE AT THE END', (agent.health ?? 0) > 0 && agent.food > 0,
    `${secs} s of real time, ${hours} on the world's clock — ${agent.health} health, ${agent.food} fed, ` +
      `core ${agent.coreC}°`);

  // Legibility, and it is not decoration: this is the record a watcher reads
  // and the record the next run debugs from.
  // Read from `deeds` and NOT from memory. `Memory` is a forty-entry ring
  // buffer that fills with noticing, so an hour after lighting a fire a mind
  // has honestly forgotten it — right for a mind, useless as a record.
  check('it can say what it did to stay alive', agent.deeds.length > 0,
    agent.deeds.length ? agent.deeds.map((d) => `${d.h}h ${d.text}`).join(' · ') : 'no deeds recorded');

  console.log(`\n      reached for: ${JSON.stringify(agent.acted)}`);

  agent.close();
  stop();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n  survivalcheck could not run: ${err.message}\n`);
  process.exit(1);
});
