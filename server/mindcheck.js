// ── mindcheck.js ────────────────────────────────────────────────────────────
// Phase 8: does a mind behave, and does it play fair?
//
//   npm run mindcheck
//
// Two things are worth proving and neither of them is "the model is clever".
//
//   1. THE HONESTY RULE HOLDS. A mind must be given its creature's senses, not
//      the world's state. If a brief ever contains something the body could not
//      have perceived, the whole design is a lie and the opponent will feel
//      like it is cheating however good its reasoning is.
//   2. THE FLOOR IS SOLID. VISION.md: "fully playable with no model at all —
//      the scripted brains are the floor, not a fallback." So the scripted
//      hunter has to be a competent hunter, and every failure path has to land
//      on it rather than on a stopped world.
//
// No network calls. Nothing here needs a key, and running it must never cost
// anybody money.

import { SimWorld } from '../src/sim/world.js';
import { ScriptedProvider, LlmProvider, makeProvider } from '../src/minds/providers.js';
import { addRivalHunter } from '../src/minds/hunter.js';
import { buildBrief, briefToText } from '../src/minds/perception.js';
import { sanitiseGoal, GOAL_IDS } from '../src/minds/goals.js';
import { makeRandom } from '../src/world/noise.js';
import { solarPosition } from '../src/world/sky.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const STEP = 1 / 60;
const world = new SimWorld({ hours: 9 });
world.clock.running = false;
const provider = new ScriptedProvider(makeRandom('mindcheck'));
const rival = addRivalHunter(world, provider, { id: 1, name: 'Eachann' });
const you = world.addPlayer(2, 'You');

const ctx = () => ({
  hours: world.clock.hours,
  sunAltitude: solarPosition(world.clock.hours).altitude,
  weather: world.weather,
  tick: world.tick,
  fires: world.fires,
  scentAt: (ax, az, bx, bz) => world.scentAt(ax, az, bx, bz),
});

/**
 * ASYNC on purpose. A mind's decision is a promise, and the world never waits
 * for it — which is the entire point of the design and also the reason a
 * synchronous test loop sees zero decisions however long it runs: the
 * microtask queue never gets a chance to drain. Yielding every simulated
 * second is what a real server does anyway, between timer ticks.
 */
async function run(seconds) {
  for (let i = 0; i < seconds * 60; i++) {
    rival.mind.update(STEP, world, ctx());
    rival.body.update(STEP, world, ctx());
    world.step(STEP);
    if (i % 60 === 0) await Promise.resolve();
  }
  await new Promise((r) => setTimeout(r, 10)); // let the last one land
}

console.log('\n  A rival hunter, working the same valley.\n');

// ── the honesty rule ──
// Put a player a long way off, out of every sense, and confirm the brief does
// not mention them. Then walk them up and confirm it does.
you.ctrl.teleport({ x: rival.player.ctrl.position.x + 900, y: 0, z: rival.player.ctrl.position.z + 900 }, 0);
you.ctrl.position.y = 30;
world.step(STEP);
const farBrief = buildBrief(rival.mind.body, world, ctx());
const mentionsFar = JSON.stringify(farBrief.contacts).includes('someone');
check('a mind is not told about someone 1.2 km away', !mentionsFar,
  `${farBrief.contacts.length} contacts`);

// Right in front, in daylight, standing up. A body's forward is
// (sin yaw, cos yaw) — adding PI put the observer BEHIND the hunter, which the
// honesty rule then correctly refused to tell it about.
const rp = rival.player.ctrl.position;
you.ctrl.teleport({ x: rp.x + Math.sin(rival.player.ctrl.yaw) * 12, y: 0,
                    z: rp.z + Math.cos(rival.player.ctrl.yaw) * 12 }, 0);
you.ctrl.position.y = rp.y;
you.stealth.visibility = 1;
world.step(STEP);
const nearBrief = buildBrief(rival.mind.body, world, ctx());
const sawYou = nearBrief.contacts.some((c) => c.what === 'someone' && c.how === 'seen');
check('but it does see someone standing in front of it', sawYou,
  nearBrief.contacts.map((c) => `${c.what} ${c.how}`).join(', ') || 'nothing');

// ── no coordinates, anywhere ──
const text = briefToText(nearBrief);
const hasNumbers = /-?\d{2,}\.\d/.test(text);
check('the brief carries no coordinates', !hasNumbers,
  hasNumbers ? 'found a raw number' : 'distances are words, not metres');
const leaksInventory = JSON.stringify(nearBrief.contacts).includes('venison');
check('and no inventory it has not seen', !leaksInventory, 'contacts carry no loot');

console.log('\n  What the hunter is actually told:\n');
console.log(text.split('\n').map((l) => `    ${l}`).join('\n'));
console.log('');

// ── the floor is solid ──
await run(20);
check('the scripted mind decides', rival.mind.decisions > 0,
  `${rival.mind.decisions} decisions, currently "${rival.mind.status.goal}"`);
check('and it remembers what it saw', rival.mind.memory.entries.length > 0,
  `${rival.mind.memory.entries.length} memories, e.g. "${rival.mind.memory.entries.at(-1)?.text}"`);

const startedAt = { x: rp.x, z: rp.z };
await run(25);
const moved = Math.hypot(rp.x - startedAt.x, rp.z - startedAt.z);
check('the hunter actually goes somewhere', moved > 15, `${moved.toFixed(0)} m walked`);
check('it stays alive doing it', !rival.player.body.dead,
  `${Math.round(rival.player.body.health)} health, ${Math.round(rival.player.body.hunger)} fed`);

// ── constrained output ──
const attacks = [
  { kind: 'rm -rf /' },
  { kind: 'hunt', quarry: 'a deer' },
  { kind: 'say', text: 'x'.repeat(900) },
  { kind: 'goTo', place: '../../etc/passwd' },
  null,
  'wander',
  { kind: 'approach' },
];
const survived = attacks.map((a) => sanitiseGoal(a));
check('an illegal verb is discarded', survived[0] === null, 'not interpreted, dropped');
check('a legal one passes', survived[1]?.kind === 'hunt' && survived[1].quarry === 'a deer');
check('speech is length-capped', (survived[2]?.text?.length ?? 0) <= 160,
  `${survived[2]?.text?.length} chars`);
check('rubbish input cannot crash it', survived[4] === null && survived[5] === null,
  'null and a bare string both refused');
check('a goal missing its parameter degrades safely', survived[6]?.kind === 'wander',
  'approach-with-no-target becomes wander');

// ── the model path, without calling anything ──
const noKey = new LlmProvider({ apiKey: null, fallback: provider });
const fellBack = await noKey.decide(nearBrief);
check('no key means no network and no failure', !noKey.available && !!fellBack?.kind,
  `fell through to scripted, got "${fellBack.kind}"`);

const brokenFetch = new LlmProvider({
  apiKey: 'test-key-not-real',
  fallback: provider,
  fetchImpl: async () => {
    throw new Error('network is down');
  },
});
const afterFailure = await brokenFetch.decide(nearBrief);
check('a dead network falls back rather than stalling', !!afterFailure?.kind && brokenFetch.failures === 1,
  `"${afterFailure.kind}" after ${brokenFetch.failures} failure`);

const rubbishFetch = new LlmProvider({
  apiKey: 'test-key-not-real',
  fallback: provider,
  fetchImpl: async () => ({ ok: true, json: async () => ({ content: [{ text: 'I would love to help!' }] }) }),
});
const afterRubbish = await rubbishFetch.decide(nearBrief);
check('a reply with no legal verb falls back too', !!afterRubbish?.kind,
  `"${afterRubbish.kind}"`);

const goodFetch = new LlmProvider({
  apiKey: 'test-key-not-real',
  fallback: provider,
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({ content: [{ text: '{"kind":"hunt","quarry":"a deer","why":"hungry"}' }] }),
  }),
});
const afterGood = await goodFetch.decide(nearBrief);
check('a well-formed reply is honoured', afterGood?.kind === 'hunt' && afterGood.quarry === 'a deer',
  `"${afterGood.kind} ${afterGood.quarry}"`);

check('the default provider needs no key', makeProvider(() => 0.5, {}).name === 'scripted',
  'scripted unless explicitly asked otherwise');
check('and asking for a model without a key still gives one',
  makeProvider(() => 0.5, { MINDS_PROVIDER: 'claude' }).name === 'scripted',
  'refuses to half-start');

// ── determinism ──
check('every decision is logged for replay', rival.mind.log.length === rival.mind.decisions,
  `${rival.mind.log.length} entries, e.g. tick ${rival.mind.log[0]?.t} -> ${rival.mind.log[0]?.g.kind}`);

const replayed = { goal: null };
const before = rival.mind.goal.kind;
rival.mind.goal = { kind: 'hold' };
rival.mind.replay(rival.mind.log.at(-1));
check('a logged decision can be replayed without asking anyone',
  rival.mind.goal.kind === rival.mind.log.at(-1).g.kind,
  `restored "${rival.mind.goal.kind}" from the log`);

console.log(`\n  Hunter status: ${JSON.stringify(rival.mind.status)}`);
const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
