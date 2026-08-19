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
    // The real shape a pickup now takes: `what: 'gather'`, with the item and a
    // running count, because consecutive pickups of the same thing grow ONE
    // line rather than nine. `what: 'interact'` was invented here and the
    // simulation never emitted it — the deed did not exist at all until the
    // inventory delta started driving it. See `Agent.notePack`.
    deeds: [{ h: 21.2, what: 'gather', id: 'wood', n: 3, text: 'I picked up 3 branches' }],
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
    //
    // ── AND THE SECOND VERSION OF BOTH LIED TOO, more quietly ──
    //
    // The first row is copied verbatim out of a live huntcheck payload, and it
    // is here because it is the exact shape that misled this project. READ THE
    // TWO NUMBERS TOGETHER: `along` is +2.8 — "long" — and `vsModel` is +0.3.
    // The shaft went almost precisely where the bow promised. The +2.8 is not
    // marksmanship at all, it is the deer's chest sitting 0.75 m above the
    // ground the deer is standing on, and a shaft that passes clean through a
    // chest carries on for another ten metres or more before it finds dirt.
    //
    // A board that prints the first number tells a watcher the archer shoots
    // long, and eight of those in a row got written into STATE.md as a
    // systematic ballistics bias at the top of the queue. It was geometry.
    shots: [
      { dist: 22.1, along: 2.8, across: 0.1, high: -0.6, pitch: 22.99, eye: 1.05,
        hit: 'ground', pred: 24.6, model: 0.3, vsModel: 0.3 },
      // And a shaft that genuinely fell short of its own promise, for contrast:
      // landed at 14.9 m down the line where the model said 19.1, and 2.4 m to
      // the right of the aim. THIS is what a bad arrow looks like in the
      // honest frame.
      { dist: 18.0, along: -3.1, across: 2.4, high: 0.1, pitch: 0.61, eye: 1.05,
        hit: 'solid', pred: 19.1, model: 4.8, vsModel: -4.2 },
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
      && /into the ground/.test(p.strays[0].text)
      && /4 m short of the promise and 2 m right.*into something solid/.test(p.strays[1].text),
    p.strays.map((x) => x.text).join(' | '));
  // ── THE OTHER REGRESSION, and it is a wording one ──
  //
  // Row one landed 0.3 m from what the bow promised. It is a clean shaft and a
  // missed deer, and the board must say so. What it must NEVER say about it is
  // "long", because "long" against the animal is the reading that put a
  // phantom ballistics bias at the top of the queue for a session. Asserted on
  // the TEXT, because the text is what a watcher reads.
  check('...and an arrow that flew TRUE is never described as shooting long',
    !/long/.test(p.strays[0].text) && /flew true/.test(p.strays[0].text),
    `"${p.strays[0].text}" — \`along\` was +2.8 m against the deer, \`vsModel\` +0.3 m against the bow`);
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

  // ── the butcher's bill rides one agent's ears to the top of the page ──
  const heard = { name: 'Y', provider: { name: 'scripted' }, where: () => null,
    tally: { kills: { Deer: 3, Goblin: 1 }, deaths: { Eachann: 2 } } };
  const bt = boardState([{ name: 'X', provider: { name: 'scripted' }, where: () => null }, heard]);
  check('the tally is taken from whichever mind carries one — every ear hears every death',
    bt.tally?.kills?.Deer === 3 && bt.tally?.deaths?.Eachann === 2,
    JSON.stringify(bt.tally));
  check('...and a fleet of bare agents simply has none', boardState([{ name: 'X', provider: { name: 'scripted' }, where: () => null }]).tally === null);


  // ── IS THIS MIND STILL A MIND? ──
  //
  // Every failure inside `decide()` falls through to the scripted brain — the
  // right behaviour and, until now, a total silence. The counters were recorded
  // from the first day and nothing anybody looked at read them, so a model that
  // had quietly become the rules engine drew exactly the same card as one that
  // was working. These assert the THREE states apart, because a health field
  // that renders the same in all three is the fifth instrument in this project
  // to report something it had not measured.
  const mind = (o) => boardState([{ name: 'X', provider: o, where: () => null }]).players[0].mind;

  const well = mind({ name: 'anthropic', model: 'claude-opus-5', calls: 40, failures: 0 });
  check('a mind that is answering says how many it answered',
    well.answered === 40 && well.fellBack === false && well.failureRate === 0,
    `${well.answered}/${well.calls} answered, fellBack ${well.fellBack}`);

  const shaky = mind({ name: 'anthropic', model: 'claude-opus-5', calls: 10, failures: 4,
    lastError: 'http 429' });
  check('a mind that is half failing says THAT, and says why',
    shaky.answered === 6 && shaky.failures === 4 && shaky.failureRate === 0.4 &&
      shaky.lastError === 'http 429' && shaky.fellBack === false,
    `${shaky.answered}/${shaky.calls}, rate ${shaky.failureRate}, "${shaky.lastError}"`);

  // The one that matters. Every call asked, every call failed: the header says
  // claude-opus-5 and the answers are all coming from the rules engine.
  const dead = mind({ name: 'anthropic', model: 'claude-opus-5', calls: 12, failures: 12,
    lastError: 'no json in reply' });
  check('AND A MIND THAT HAS STOPPED BEING ONE IS NAMED AS SUCH',
    dead.fellBack === true && dead.answered === 0,
    `fellBack ${dead.fellBack}, ${dead.answered}/${dead.calls} answered — "${dead.lastError}"`);

  // A scripted seat is not a failure and must not be dressed as one.
  const script = mind({ name: 'scripted' });
  check('...but a scripted seat is not a failure', script.fellBack === false && script.calls === 0,
    'a player that was never meant to think is not a player that stopped');

  // ── AND THE CARD ACTUALLY SHOWS IT ──
  // ── AND THE PAGE MUST ACTUALLY RENDER IT ──
  //
  // `boardState` carrying a field nobody draws is the same silence one layer up.
  //
  // Asserted from the SOURCE, because the card is BROWSER-SIDE: `card` and
  // `mindTag` live inside boardHtml's template literal and run in the page, so
  // there is no module export to call. This proves the wiring is present, not
  // that it painted — the same limitation rendercheck states about a renderer,
  // and the reason the DATA assertions above are the real test.
  //
  // Writing this cost a near-miss worth remembering: an `export` added to
  // `mindTag` to make it importable landed INSIDE the template literal, where it
  // is not an export at all — it is page text, and `export` in a plain <script>
  // is a syntax error that would have broken the whole board silently. Same trap
  // as the `//` comment in STATE.md, wearing different clothes.
  const pageSrc = boardHtml();
  check('and the page actually renders that health, rather than carrying it unused',
    /function mindTag/.test(pageSrc) && /mindTag\(p\.mind\)/.test(pageSrc) && /SCRIPTED/.test(pageSrc),
    'mindTag is defined in the page, card calls it, and SCRIPTED is a string it can print');

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
  // ── THE PORT, ASKED FOR BEFORE IT IS ASSUMED ──
  //
  // `requireFreePort` is already used for the game port thirty lines up and was
  // never used for the BOARD port. `serveBoard` logs "could not listen on 8090
  // — carrying on without one" and returns null, so a live run holding 8090
  // turned this file into "the board binds — it did not" and then "boardcheck
  // could not run". On 2026-08-14 I read that as a REGRESSION twice and
  // diagnosed it twice.
  //
  // That is the exact failure `freeport.js` exists for: a stale server on a port
  // once had `bitecheck` reporting 3/10 and it was written up as a product
  // defect that never existed. Ask first, and say plainly what is in the way.
  await requireFreePort(BOARD, 'boardcheck (board)');
  const served = await serveBoard({
    port: BOARD,
    state: () => boardState(live, { seconds, minds: 'model', model: 'stub-1' }),
  });
  check('the board binds, on loopback', !!served, served?.url ?? 'it did not');

  // ── AND THE GUARD THAT LETS IT SAY WHY, WHEN IT DOES NOT ──
  //
  // `requireFreePort` probed with a WEBSOCKET, so it only ever detected the game
  // server. The board is a plain HTTP server: the handshake failed against it,
  // the port was reported FREE, and a live run holding 8090 turned this file
  // into "the board binds — it did not" with no reason attached. Read as a
  // regression twice on 2026-08-14 and diagnosed twice. It probes by TCP now,
  // which answers the actual question whatever protocol is on the other end.
  const httpHeld = await (async () => {
    const http = await import('node:http');
    const srv = http.createServer((q, r) => r.end('x'));
    await new Promise((r) => srv.listen(8099, '127.0.0.1', r));
    let caught = false;
    try { await requireFreePort(8099, 'boardcheck self-test'); } catch { caught = true; }
    await new Promise((r) => srv.close(r));
    return caught;
  })();
  check('SENTINEL: the port guard sees a plain HTTP server, not only a websocket one',
    httpHeld, httpHeld ? 'an HTTP listener is detected' : 'BLIND to HTTP — the board port is unguarded');
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
