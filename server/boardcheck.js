// ── boardcheck.js ───────────────────────────────────────────────────────────
// Can a watcher see the whole fleet at once, and the three threads chat lost?
//
//   npm run boardcheck
//
// `watchcheck` proved the first mile: a mind says its goal, its reason and its
// persona, and another player HEARS it. This is the second — the same material
// as a BOARD instead of a column, plus the three logs narration never carried:
// what each body actually DID, every arrow and how far off it went, and every
// shot it REFUSED. The last is the one that explains a quiet hunter, and it has
// never been visible anywhere.
//
// Three ways at it, because they fail differently:
//
//   PURE     `boardState` from invented agents. This is where the three
//            previously-invisible threads are asserted, because deeds, arrows
//            and refusals are not something you can make a real body produce on
//            a schedule — and a check that waits for one is a flaky check.
//   LIVE     real Agents on a real server over real sockets, then a real HTTP
//            GET of the board. Identity, persona, model, goal, WHY and the
//            body's own state have to survive the whole path.
//   ENTRY    `agents.js` itself, spawned as a process with BOARD set. A board
//            that works when a check builds it and not when the fleet does is
//            this project's favourite bug: a name used and never defined is
//            invisible to the build and only found by running the line.
//
// Ports: the game server on 8093, the live board on 8090, the fleet's own board
// on 8089. None of them collide with another check.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Agent } from '../src/net/agent.js';
import { makeRandom } from '../src/world/noise.js';
import { personaById } from '../src/minds/personas.js';
import { requireFreePort } from './freeport.js';
import { boardState, boardHtml, serveBoard, boardPortFromEnv } from './board.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8093);
const BOARD = Number(process.argv[3] ?? 8090);
const FLEET_BOARD = BOARD - 1;
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const get = async (url) => {
  const res = await fetch(url);
  const text = await res.text();
  return { status: res.status, text };
};

/** A mind that always decides, always changes its mind, and always says why. */
const stubborn = (why) => ({
  name: 'stubborn',
  model: 'stub-1',
  calls: 0,
  async decide() {
    this.calls++;
    return this.calls % 2
      ? { kind: 'hunt', quarry: 'a deer', why }
      : { kind: 'gather', why };
  },
});

async function main() {
  console.log('\n  A board, not a column — can a watcher see the whole fleet?\n');

  // ── PURE: the shape, and the three threads narration never carried ────────
  //
  // Invented agents, the way reportcheck invents them. The point is not that
  // the board can talk to a socket — the LIVE section does that — it is that
  // every thread an Agent keeps comes out the other side.
  const invented = [{
    name: 'Eachann',
    id: 3,
    persona: personaById('hoarder'),
    provider: { name: 'openai', model: 'kimi-k2' },
    health: 55,
    food: 18,
    hours: 21.4,
    carrying: { branch: 3, venison: 0, arrow: 7 },
    kills: [{}],
    wounds: [{}, {}],
    where: () => 'the black corrie',
    status: {
      id: 3, name: 'Eachann', provider: 'openai', persona: 'hoarder',
      goal: 'hunt a deer', why: 'the light is going', decisions: 12, tokens: 900,
      thinking: false, lastError: null, remembers: 8, others: 2,
    },
    intentions: [{ h: 21.1, goal: 'gather wood', why: 'mine, not theirs', where: 'the black corrie' }],
    deeds: [{ h: 21.2, what: 'interact', text: 'I picked up a branch' }],
    // ── THE SHAPE, AS THE SIMULATION ACTUALLY EMITS IT ────────────────────
    //
    // `Agent.shots` IS A LOG OF MISSES AND NOTHING ELSE. It is filled from one
    // place — `howItMissed`, called from the `'miss'` event — and `world.js`
    // sets `hit: surface`, a STRING naming what the shaft buried itself in.
    // `projectiles.js`: "a creature or a player hit never reaches here".
    //
    // The first version of this fixture wrote `hit: true` / `hit: false`
    // booleans, because that is what the board's author assumed. The board read
    // the field the same wrong way, so the two agreed and the check went green
    // — while a real fleet showed "7 arrows, 7 hit" for a body that had missed
    // seven times running. A fixture written from the same guess as the code
    // does not test the code, it ratifies it. These values are copied from a
    // real `board.json`.
    shots: [
      { dist: 24.2, along: -3.1, across: 0.4, high: 0.2, hit: 'ground' },
      { dist: 18.0, along: 0.1, across: 0.1, high: 0, hit: 'solid' },
    ],
    // Where an arrow that went HOME is recorded — nowhere near `shots`.
    releases: [
      { h: 21.0, held: 1.2, loosed: true, why: 'aimed' },
      { h: 21.1, held: 1.3, loosed: true, why: 'aimed' },
      { h: 21.2, held: 1.1, loosed: true, why: 'aimed' },
      { h: 21.3, held: 0.1, loosed: false, why: 'let go without meaning to' },
    ],
    refusals: [{ d: 31, why: 'ground in the way' }],
    said: ['this fire is mine'],
  }];

  const s = boardState(invented, { seconds: 90, minds: 'model', model: 'kimi-k2' });
  const p = s.players[0];
  check('the board names who is playing, on what model, as whom',
    p.name === 'Eachann' && p.model === 'kimi-k2' && p.persona?.id === 'hoarder',
    `${p.name} · ${p.model} · ${p.persona?.id}`);
  check('...and what it is doing AND WHY', p.goal === 'hunt a deer' && p.why === 'the light is going',
    `${p.goal} — "${p.why}"`);
  check('WHAT IT MEANT is there (chat had this one)', p.intentions.length === 1 && !!p.intentions[0].why,
    p.intentions[0]?.goal);
  check('WHAT IT DID is there (chat never carried this)', p.deeds.length === 1,
    p.deeds[0]?.text);
  check('EVERY STRAY ARROW is there, with how far off it went and into what',
    p.strays.length === 2 && p.astray === 2
      && /3 m short.*into the ground/.test(p.strays[0].text)
      && /into something solid/.test(p.strays[1].text),
    p.strays.map((x) => x.text).join(' | '));
  // The regression that started all this. A miss whose `hit` field names a
  // surface must never be counted as a hit, and the honest denominator is the
  // number of shafts that actually left the string.
  check('...and A MISS IS NEVER COUNTED AS A HIT, whatever it buried itself in',
    p.astray === 2 && p.kills === 1 && p.wounds === 2 && p.loosed === 3,
    `${p.loosed} loosed, ${p.astray} astray, ${p.wounds} wounded, ${p.kills} killed`);
  check('...and a release that kept its arrow is not counted as one loosed',
    p.loosed === 3, 'four times the string went slack, three shafts left it');
  check('...and the SHOTS IT WOULD NOT TAKE, with the reason',
    p.refusals.length === 1 && p.refusals[0].why === 'ground in the way',
    `${p.refusals[0]?.d} m — ${p.refusals[0]?.why}`);
  check('the body it believes it has comes too', p.health === 55 && p.food === 18 && p.where === 'the black corrie',
    `${p.health} hp, ${p.food} fed, ${p.where}`);
  check('...and what is in the pack, with the empty slots dropped',
    p.carrying.length === 2 && p.carrying.every((c) => c.n > 0),
    JSON.stringify(p.carrying));
  check('the persona brings its disposition with it, so a watcher can attribute',
    /hoard/i.test(p.persona?.character ?? ''),
    'the character hangs off the tag rather than in a table nobody has open');

  // A board that throws on the first second of a run is worse than no board:
  // an Agent has no health, no food and no carrying until a snapshot lands.
  let bare = null;
  try {
    bare = boardState([{ name: 'Morag', provider: { name: 'scripted' }, where: () => null }]);
  } catch (err) {
    bare = { error: err.message };
  }
  check('an agent that has not had a snapshot yet does not break the board',
    bare?.players?.length === 1 && bare.players[0].name === 'Morag' && !bare.error,
    bare?.error ?? 'renders with everything empty');
  check('and a board of nobody is still a board', boardState([]).players.length === 0);

  check('the page is self-contained — no CDN, no build step',
    !/https?:\/\//.test(boardHtml().replace(/http:\/\/127\.0\.0\.1/g, '')),
    'a watcher on a LAN with no internet still gets a board');

  // ── the switch, and its default ────────────────────────────────────────────
  check('BOARD is OFF unless somebody asks', boardPortFromEnv({}) === null
    && boardPortFromEnv({ BOARD: '' }) === null);
  check('...and "on" means the sensible port', boardPortFromEnv({ BOARD: 'on' }) === 8090);
  check('...and a number means that number', boardPortFromEnv({ BOARD: '9111' }) === 9111);
  check('...and nonsense is off, not a crash', boardPortFromEnv({ BOARD: 'banana' }) === null);

  // ── LIVE: real bodies, a real server, a real HTTP GET ─────────────────────
  await requireFreePort(PORT, 'boardcheck');
  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  const connect = (opts) => new Agent({ rand: makeRandom(opts.name), ...opts }).connect(URL);

  let first = null;
  for (let i = 0; i < 40 && !first; i++) {
    await sleep(150);
    first = await connect({
      name: 'Eachann', provider: stubborn('the herd moved down to the water'),
      persona: personaById('hoarder'),
    }).catch(() => null);
  }
  if (!first) throw new Error(`no server answered on ${URL}`);
  const second = await connect({
    name: 'Morag', provider: stubborn('wood before dark'), persona: personaById('generous'),
  });
  const live = [first, second];

  let seconds = 0;
  const served = await serveBoard({
    port: BOARD,
    state: () => boardState(live, { seconds, minds: 'model', model: 'stub-1' }),
  });
  check('the board binds, on loopback', !!served, served?.url ?? 'it did not');
  if (!served) throw new Error('no board to check');

  // Drive them until both have decided at least once. `decide` is async and
  // fires on the mind's own cadence, so this waits for the OUTCOME rather than
  // sleeping a guessed number of seconds.
  const t0 = Date.now();
  while (Date.now() - t0 < 45_000 && live.some((a) => !a.intentions.length)) {
    for (const a of live) a.update(1 / 30);
    seconds = (Date.now() - t0) / 1000;
    await sleep(1000 / 30);
  }

  const json = await get(`${served.url}/board.json`);
  const state = JSON.parse(json.text);
  const byName = Object.fromEntries(state.players.map((x) => [x.name, x]));
  check('a watcher fetches the whole fleet in one request',
    json.status === 200 && state.players.length === 2,
    `${state.players.length} minds after ${Math.round(seconds)} s`);
  check('EVERY ONE OF THEM IS NAMED, with the id the server gave it',
    !!byName.Eachann?.id && !!byName.Morag?.id && byName.Eachann.id !== byName.Morag.id,
    `#${byName.Eachann?.id} Eachann, #${byName.Morag?.id} Morag`);
  check('...and who each one IS, so behaviour can be attributed',
    byName.Eachann?.persona?.id === 'hoarder' && byName.Morag?.persona?.id === 'generous',
    'the persona rides all the way to the board');
  check('...and what it is thinking, live',
    !!byName.Eachann?.goal && !!byName.Morag?.goal,
    `${byName.Eachann?.goal} / ${byName.Morag?.goal}`);
  check('AND WHY — the only thing that tells two hunting minds apart',
    byName.Eachann?.why === 'the herd moved down to the water'
      && byName.Morag?.why === 'wood before dark',
    `"${byName.Eachann?.why}" vs "${byName.Morag?.why}"`);
  check('the thread of what each one meant is on the board, not just the last line',
    state.players.every((x) => x.intentions.length > 0 && x.intentions.some((i) => i.why)),
    state.players.map((x) => `${x.name}:${x.intentions.length}`).join(' '));
  check('and the board knows how each body actually is, off its own snapshot',
    state.players.every((x) => typeof x.food === 'number' && typeof x.health === 'number'),
    state.players.map((x) => `${x.name} ${x.health}hp ${x.food}fed`).join(' · '));
  check('the board moves — it is a live reading, not a page printed once',
    state.at > 0 && state.players.some((x) => x.decisions > 0),
    `${state.at} s · ${state.players.map((x) => x.decisions).join('+')} decisions`);

  const page = await get(served.url);
  check('and the page itself comes back, ready to repaint',
    page.status === 200 && /board\.json/.test(page.text) && /THE MINDS/.test(page.text));
  const missing = await get(`${served.url}/nothing-here`);
  check('anything else is a plain 404 rather than a stack trace', missing.status === 404);

  // ── and it lets go PROMPTLY ──
  // `server.close()` waits for open connections, and both a watching browser
  // and `fetch` hold keep-alive sockets. Left to itself the callback never
  // fires: the port stops listening and the process sits there looking hung.
  // Timed rather than merely awaited, because the broken version does finish —
  // eventually, when a socket somewhere idles out — and a check that only
  // awaits it passes on a good day and hangs on a bad one.
  const closeT0 = Date.now();
  const closed = await Promise.race([
    served.close().then(() => true),
    sleep(5000).then(() => false),
  ]);
  check('the board lets go of its port at once, keep-alive sockets and all',
    closed, `${Date.now() - closeT0} ms — a board that will not close hangs whatever is hosting it`);
  for (const a of live) a.close();

  // ── ENTRY: the fleet's own board, from the real command ───────────────────
  //
  // Everything above went through the check's own wiring. This spawns
  // `agents.js` exactly as the evening will, reads its console, and fetches the
  // board it stood up — which is the only way to catch a mistake in agents.js.
  const fleet = spawn(
    process.execPath,
    [path.join(HERE, 'agents.js'), '2', '--url', URL, '--for', '25'],
    { env: { ...process.env, BOARD: String(FLEET_BOARD), PERSONAS: 'on', NARRATE: 'on' }, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let out = '';
  fleet.stdout.on('data', (b) => { out += b.toString(); });
  fleet.stderr.on('data', (b) => { out += b.toString(); });
  const killFleet = () => { try { fleet.kill(); } catch { /* gone */ } };
  process.on('exit', killFleet);

  let fleetJson = null;
  for (let i = 0; i < 60 && !fleetJson; i++) {
    await sleep(500);
    fleetJson = await get(`http://127.0.0.1:${FLEET_BOARD}/board.json`)
      .then((r) => JSON.parse(r.text))
      .catch(() => null);
  }
  check('`npm run agents` stands its own board up', !!fleetJson,
    fleetJson ? `${fleetJson.players.length} minds` : out.split('\n').slice(-4).join(' / ').trim() || 'nothing answered');
  check('...and says the address out loud, so a watcher can find it',
    new RegExp(`board: http://127\\.0\\.0\\.1:${FLEET_BOARD}`).test(out),
    out.split('\n').find((l) => l.includes('board:'))?.trim() ?? 'the console never mentioned it');
  check('...with its real cast on it, personas and all',
    (fleetJson?.players?.length ?? 0) === 2 && fleetJson.players.every((x) => x.persona?.id),
    fleetJson?.players?.map((x) => `${x.name}[${x.persona?.id}]`).join(' ') ?? '—');

  killFleet();
  await sleep(400);
  // ...and it lets the port go when the fleet does. A board that outlives its
  // run holds the port against the next one, which is the exact failure
  // freeport.js exists to shout about.
  const afterwards = await get(`http://127.0.0.1:${FLEET_BOARD}/board.json`).catch(() => null);
  check('and the board dies with the fleet — the port comes back', afterwards === null,
    'the next run wants it');

  stop();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n  boardcheck could not run: ${err.message}\n`);
  process.exit(1);
});
