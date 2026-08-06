// ── refillcheck.js ──────────────────────────────────────────────────────────
// DOES THE GROUND YOU WALKED AWAY FROM EVER REFILL?
//
//   npm run refillcheck
//
// It did not, and nothing in the project could see it. Every other wildlife
// check watches a body that stays put, so the world never had to give anything
// back. Measured with one player on a real socket, a 645 m round trip of four
// minutes: he came home to ONE animal where he had left EIGHTEEN, and nothing
// at all within 320 m of him.
//
// The cause was a set that only ever grew. `refresh` skips any site key in
// `spawnedSites`, and nothing ever took a key back out — so a site emptied by
// the 400 m cull was burned for the rest of the session. The cull's own comment
// had always claimed otherwise ("a live one just leaves the simulation and its
// site can refill"); only the corpse half was ever implemented.
//
// This is the bug behind three separate entries in STATE.md: `netcheck`'s
// intermittent "creatures are shared — 0 creatures" (not a snapshot fault — a
// world that had genuinely emptied), the 68 -> 37 population drift over 24
// game minutes with four players, and every report of a hillside going quiet.
// It is the one thing here that gets WORSE the longer an evening runs, which is
// exactly the wrong shape for a night of agents roaming a valley.
//
// Two halves, because the rule has two halves:
//
//   * OVER A SOCKET, the outcome that matters — walk out past the cull radius,
//     walk home, and find the hillside alive again. Asserted on counts from the
//     snapshot, which is the only wildlife a connected client can see at all.
//   * IN THE SIMULATION, the rule itself — the LAST animal out of a herd decides
//     what happens to the ground. Left alive, the site is released. Died there,
//     it is gone for good. While any of the herd is still loaded, neither. That
//     third case is not pedantry: one deer shot out of five used to clear the
//     whole site for ever the moment its corpse was culled, so a good night's
//     hunting emptied the valley faster than a bad one.
//
// The socket half is deliberately slow — a real body walking real ground at
// about 6 m/s, roughly four minutes. There is no shortcut: the distances ARE
// the test.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PROTOCOL_VERSION, C_HELLO, C_INTENT, S_WELCOME, S_SNAPSHOT,
         encode, decode } from '../src/net/protocol.js';
import { Wildlife } from '../src/creatures/manager.js';
import { WILDLIFE } from '../src/config.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8097);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A body with no eyes, which walks where it is told. */
class Walker {
  constructor(name) { this.name = name; this.snap = null; }
  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onerror = () => reject(new Error('no server'));
      this.ws.onopen = () => this.ws.send(encode(C_HELLO, { name: this.name, version: PROTOCOL_VERSION }));
      this.ws.onmessage = (ev) => {
        const m = decode(ev.data);
        if (!m) return;
        if (m.type === S_WELCOME) { this.id = m.data.id; resolve(this); }
        if (m.type === S_SNAPSHOT) this.snap = m.data;
      };
    });
  }
  get pos() { return this.snap?.me?.p ?? null; }
  get creatures() { return this.snap?.cr ?? []; }
  /**
   * Walk toward a point for `seconds`.
   *
   * FORWARD IS (-sin yaw, -cos yaw). Measured on this server rather than
   * assumed — the first version of this walk used (+sin, +cos), marched briskly
   * in the opposite direction, and produced a beautifully consistent set of
   * numbers about a journey it never made.
   */
  async walkToward(target, seconds) {
    for (let t = 0; t < seconds * 20; t++) {
      const me = this.pos ?? [0, 0, 0];
      const yaw = Math.atan2(-(target[0] - me[0]), -(target[2] - me[2]));
      this.ws.send(encode(C_INTENT, { i: {
        forward: 1, strafe: 0, sprint: true, lookYaw: 0, lookPitch: 0, aimYaw: yaw, aimPitch: 0,
      } }));
      await sleep(50);
    }
  }
  stand() {
    this.ws.send(encode(C_INTENT, { i: {
      forward: 0, strafe: 0, sprint: false, lookYaw: 0, lookPitch: 0, aimYaw: 0, aimPitch: 0,
    } }));
  }
}

const within = (list, at, r) =>
  list.filter((c) => Math.hypot(c.p[0] - at[0], c.p[2] - at[2]) <= r).length;
const speciesNear = (list, at, r) => new Set(
  list.filter((c) => Math.hypot(c.p[0] - at[0], c.p[2] - at[2]) <= r).map((c) => c.k)
);

// ── half one: the simulation's rule ─────────────────────────────────────────
//
// Driven through the real `update()` cull rather than by calling the rule
// directly, so what is proved is the path the game actually takes.
function ruleChecks() {
  const scene = { add() {}, remove() {} };
  const ctx = { hours: 12, sunAltitude: 90, weather: null };
  const FAR = { x: 9000, y: 0, z: 9000 }; // nobody is anywhere near the herd
  const KEY = '7,7';

  const stage = (howMany) => {
    const w = new Wildlife(scene, { stealth: null });
    // Placed by hand at a site we name, then marked used exactly as `refresh`
    // would have marked it.
    const born = w.spawnHerd('deer', 40, 40, howMany, 8, { siteKey: KEY });
    w.spawnedSites.add(KEY);
    return { w, born };
  };
  const cullAll = (w) => {
    // One update with the player 12 km away: every creature is past the cull.
    w.update(0.1, FAR, null, ctx);
  };

  {
    const { w, born } = stage(3);
    cullAll(w);
    check('a herd that wandered off releases its ground',
          !w.spawnedSites.has(KEY) && !w.clearedSites.has(KEY),
          `${born.length} deer left alive, site ${w.spawnedSites.has(KEY) ? 'still burned' : 'free again'}`);
  }
  {
    const { w, born } = stage(3);
    for (const c of born) c.state = 'dead';
    cullAll(w);
    check('a herd that was hunted out stays gone',
          w.clearedSites.has(KEY),
          `${born.length} corpses, site ${w.clearedSites.has(KEY) ? 'cleared for good' : 'left open'}`);
  }
  {
    // The case that made a good night's hunting worse than a bad one: one dead
    // out of a herd used to clear the site permanently the moment its corpse
    // was culled, while its four living herdmates were still standing there.
    const { w, born } = stage(5);
    born[0].state = 'dead';
    born[0].position.set(9000, 0, 9000); // the corpse is culled; the rest are not
    // A live herd this close actually THINKS, and thinking reads the player's
    // stealth profile. The two culling cases above never got that far.
    w.update(0.1, { x: 40, y: 0, z: 40 }, { visibility: 1, noise: 0, scentAt: () => 0 }, ctx);
    check('one animal dead out of five does not kill the site',
          !w.clearedSites.has(KEY),
          `${w.creatures.length} still loaded, site ${w.clearedSites.has(KEY) ? 'cleared anyway' : 'intact'}`);
  }
}

// ── half two: the outcome, over a socket ────────────────────────────────────
async function main() {
  console.log('\n  Does ground you walked away from ever refill?\n');
  ruleChecks();
  await requireFreePort(PORT, 'refillcheck');

  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: {
      ...process.env,
      // One body and nothing that hunts it. The question is what the WORLD does
      // when a player leaves and comes back; a bear or a rival hunter would put
      // a second anchor on the hill and answer something else.
      DANGER: 'none',
      MINDS_HUNTERS: '0',
    },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  let me = null;
  for (let i = 0; i < 40 && !me; i++) {
    await sleep(150);
    me = await new Walker('Walker').connect(URL).catch(() => null);
  }
  if (!me) throw new Error(`no server answered on ${URL}`);
  await sleep(700);

  const home = [...me.pos];
  const atHome = within(me.creatures, home, WILDLIFE.spawnRadius);
  const speciesAtHome = speciesNear(me.creatures, home, WILDLIFE.spawnRadius);
  check('the hillside starts populated', atHome > 0, `${atHome} within ${WILDLIFE.spawnRadius} m of the spawn`);

  // ── out, until home is genuinely out of range ──
  // Distance-driven rather than clock-driven: the walk ends when the numbers
  // say it has gone far enough, so a slow patch of ground cannot quietly turn
  // this into a shorter trip that proves less.
  const OUT = WILDLIFE.despawnRadius + 240; // past the cull, with room to spare
  const away = [home[0] + OUT * 1.4, home[1], home[2] + OUT * 1.4];
  let out = 0;
  for (let leg = 0; leg < 30 && out < OUT; leg++) {
    await me.walkToward(away, 6);
    out = Math.hypot(me.pos[0] - home[0], me.pos[2] - home[2]);
  }
  me.stand();
  await sleep(500);
  const leftBehind = within(me.creatures, home, WILDLIFE.spawnRadius);
  check('walking away empties the ground behind you', out >= OUT && leftBehind === 0,
        `${out.toFixed(0)} m out, ${leftBehind} left near home`);

  // ── and home again ──
  let back = out;
  for (let leg = 0; leg < 40 && back > 30; leg++) {
    await me.walkToward(home, 6);
    back = Math.hypot(me.pos[0] - home[0], me.pos[2] - home[2]);
  }
  me.stand();
  await sleep(1200);

  const found = within(me.creatures, home, WILDLIFE.spawnRadius);
  const foundSpecies = speciesNear(me.creatures, home, WILDLIFE.spawnRadius);
  check('AND THE HILLSIDE IS ALIVE WHEN YOU COME BACK', found > 0,
        `${found} within ${WILDLIFE.spawnRadius} m of home, was ${atHome} when he left`);
  // Not "as many as before" — the herds have moved and the clock has turned —
  // but a world that gives back a tenth of what it had is still emptying.
  check('it refills to something like what it was', found >= Math.ceil(atHome / 2),
        `${found} against ${atHome}, ${back.toFixed(0)} m from home`);
  // The sites re-roll from the same hashes, so what comes back is the same cast.
  // A refill that quietly changed the species would mean the ground was being
  // re-decided rather than restored.
  // `every` over an empty set is true, and an empty set is precisely the
  // failure this file exists for — so the emptiness is asserted first.
  const same = foundSpecies.size > 0 && [...foundSpecies].every((k) => speciesAtHome.has(k));
  check('what comes back is the same country', same,
        `left ${[...speciesAtHome].join(',') || 'nothing'} · found ${[...foundSpecies].join(',') || 'nothing'}`);
  // Releasing sites must not become a spawn leak: the per-player budget still
  // bounds the world.
  const cap = Math.min(WILDLIFE.maxAlive, WILDLIFE.maxAliveTotal);
  check('and the population stays inside its budget', me.creatures.length <= cap,
        `${me.creatures.length} alive, cap ${cap} for one player`);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length} passed\n`);
  stop();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n  ${e.message}\n`);
  process.exit(1);
});
