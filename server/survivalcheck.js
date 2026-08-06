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

  // ── AND IT CAN SAY THAT IT DID ──
  //
  // The pack going up and the body being ABLE TO SAY the pack went up are two
  // different facts, and for a long time only the first was true: `did()` had
  // five call sites and gathering was not one of them, so the board's "did"
  // column read "nothing worth telling yet" beside a pack holding three
  // branches. The commonest thing a body does all session was the one thing it
  // could not report.
  //
  // Asserted against the SNAPSHOT above and not on its own: `sawWood > 0` is
  // the server's word that wood arrived, and this line is only interesting
  // because that one passed. A deed without the pack behind it would be the
  // keypress lie all over again.
  const gathers = agent.deeds.filter((d) => d.what === 'gather');
  check('AND IT CAN SAY IT PICKED IT UP — the deed, not just the pack',
    sawWood > 0 && gathers.length > 0,
    gathers.length
      ? `${gathers.length} gather deed${gathers.length > 1 ? 's' : ''}: ` +
        gathers.map((d) => `"${d.text}"`).join(' · ')
      : 'the pack filled up and the body had nothing to say about it');

  // The one thing that must NOT be in there. A cook makes `venison_cooked`
  // rise, which is indistinguishable from picking one up if all you watch is
  // the number — so the cook owns the pack for `AGENTS.makeOwnsPackFor` and a
  // steak must never be announced as something found lying about. This run
  // COOKED (the check above), so the window was genuinely exercised.
  const cookedAsGather = gathers.filter((d) => String(d.id).includes('cooked'));
  check('...and the COOKED MEAL it made is not reported as something it found',
    sawCooked && cookedAsGather.length === 0,
    cookedAsGather.length
      ? `${cookedAsGather.map((d) => d.text).join(' · ')} — the make window is too short`
      : 'it cooked, and the craft owned its own change to the pack');

  // ── and the coalescing, driven rather than hoped for ──
  //
  // A live forage cannot prove this: whether the world happens to hand a body
  // two branches in a row is not something a check gets to decide, and an
  // assertion that only holds when it does is the sort that passes by accident
  // for a year. So the sequence is FED IN — the same trick `boardcheck` uses on
  // `boardState`. `notePack` reads only the pack, the clock and the two logs,
  // so it runs perfectly well against a body made of four fields.
  //
  // What it is guarding: `deeds` is `AGENTS.logSize` deep and it is the column
  // a watcher reads. Nine branches one at a time must be ONE growing line, or
  // they push the kill and the fire off the end of it.
  const fake = { hours: 9, deeds: [], acted: {}, memory: { add() {} } };
  const feed = (iv) => Agent.prototype.notePack.call(fake, iv);
  feed({ arrow: 12 });                      // the starting kit — adopted in silence
  feed({ arrow: 12, wood: 1 });
  feed({ arrow: 12, wood: 2 });
  feed({ arrow: 12, wood: 3 });
  feed({ arrow: 12, wood: 3, stone: 1 });   // a different thing breaks the run
  feed({ arrow: 12, wood: 4, stone: 1 });   // ...and wood starts a new line
  feed({ arrow: 12, wood: 2, stone: 1 });   // burning two: a FALL is never a deed
  const fed = fake.deeds;
  check('...and a run of the same thing is ONE line, not one per branch',
    fed.length === 3
      && fed[0].id === 'wood' && fed[0].n === 3 && /3 branches/.test(fed[0].text)
      && fed[1].id === 'stone' && fed[1].n === 1
      && fed[2].id === 'wood' && fed[2].n === 1,
    fed.map((d) => `"${d.text}"`).join(' · ') || 'nothing recorded at all');
  check('...and the STARTING KIT is not a foraging triumph, nor is spending it',
    !fed.some((d) => d.id === 'arrow') && fake.acted.gather === 5,
    `twelve arrows arrived and two branches were burnt; ${fake.acted.gather} items counted as gathered`);

  // ── A CRAFT THE SERVER REFUSED MUST NOT READ AS A CRAFT ──
  //
  // The live half of this cannot prove it. `World.update` drops a craft when
  // the fire is out of its reach, when the inputs have gone, or when `maxHeld`
  // is already met, and it drops it IN SILENCE — no event, no reply, nothing on
  // the wire. So a body pressing at a dead fire all night used to fill its deed
  // log with cooking it never did, and no live run arranges that failure on
  // purpose. Fed in, the same way the coalescing above is.
  //
  // (The thing this was originally opened for turned out not to exist: two
  // identical craft lines at the same hour were `STOCK=venison:2` — two real
  // steaks — not one press counted twice. `craftTried` is in the tally beside
  // `craft` now so that question never has to be reasoned about again.)
  // It starts at the PRESS, because that is where the old version wrote its
  // deed and that is the line this discriminates against: a body standing at a
  // fire with a workable recipe must set the intent, count the attempt, and
  // claim NOTHING.
  // Built on the REAL prototype and given invented state, rather than a plain
  // object with the two methods borrowed: `notePack` now calls `noteMake`,
  // which calls `did`, and a hand-rolled stand-in that happens to be missing
  // the third of those tests nothing but itself.
  const pot = Object.assign(Object.create(Agent.prototype), {
    hours: 9, deeds: [], acted: {}, memory: { add() {} },
    food: 100, eatCooling: 0, coreC: 37,        // neither hungry nor cold: only the craft branch runs
    carrying: { venison: 1 }, _hadPack: true,
    count: () => 1,
    recipeToWork: () => 'cook_venison',
    nearestFire: () => ({ d: 1, x: 0, z: 0 }),  // standing right at one
  });
  const i = {};
  pot.upkeep(1 / 30, i);
  const pressed = i.craft === 'cook_venison' && pot.acted.craftTried === 1 && pot.deeds.length === 0;

  const pack = (iv) => pot.notePack(iv);
  pack({ venison: 1 });            // pressed, and nothing came of it
  pack({ venison: 1, wood: 1 });   // a branch arrives mid-window — still suppressed
  const refused = pot.deeds.length === 0;
  pack({ venison_cooked: 1 });     // ...and now the steak actually lands
  const landed = pot.deeds.length === 1 && /I made a cooked venison at the fire/.test(pot.deeds[0]?.text ?? '');
  pack({ venison_cooked: 2 });     // a second rise is NOT a second make
  check('...and a craft the server silently refused is not reported as a meal',
    pressed && refused && landed && pot.deeds.length === 1 && pot.acted.craft === 1,
    !pressed
      ? `the press alone wrote ${pot.deeds.length} deed(s) — a keypress is not a meal: ` +
        pot.deeds.map((d) => `"${d.text}"`).join(' · ')
      : !refused
        ? `${pot.deeds.length} deed(s) written for a craft that produced nothing`
        : landed
          ? `1 attempt, nothing claimed until the output arrived, then exactly one: "${pot.deeds[0].text}"`
          : `the steak landed and was recorded as ${JSON.stringify(pot.deeds.map((d) => d.text))}`);

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
