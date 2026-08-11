// DRIVEN THREE WAYS, deliberately. `give` worked in-process and did nothing on
// the wire for a whole session, because `INTENT_KEYS` is an allow-list and
// nobody had checked the wire. This change is the same class in the other
// direction, so:
//
//   THE ENCODER, because that is where an outbound field actually dies. There
//   is no allow-list on the snapshot, so a round-trip through `encode`/`decode`
//   is the honest test of "does it survive the wire".
//
//   THE WORLD, in process, for what the snapshot contains and what the pack
//   ends up holding.
//
//   AND A REAL SOCKET, for the one thing neither of those can show: that a
//   joined agent's own `snapshot.lo` arrives as an array rather than undefined.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimWorld } from '../src/sim/world.js';
import { encode, decode, S_SNAPSHOT } from '../src/net/protocol.js';
import { Agent } from '../src/net/agent.js';
import { ScriptedProvider } from '../src/minds/providers.js';
import { briefToText } from '../src/minds/perception.js';
import { makeRandom } from '../src/world/noise.js';
import { PICKUP } from '../src/config.js';
import { sanitiseGoal } from '../src/minds/goals.js';

const PORT = 8137;
const URL = `ws://127.0.0.1:${PORT}`;
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A world with one body in it, off the wire. */
function loneWorld() {
  const w = new SimWorld({ headless: true });
  const p = w.addPlayer(1, 'Mairi');
  return { w, p, at: p.ctrl.position };
}
// `drop` wants a REAL THREE.Vector3 for `forward` — it calls `addScaledVector`
// with it and then `clone().multiplyScalar().setY()`. A hand-rolled stub with
// only the methods that looked necessary gave NaN positions, which the wire
// radius then filtered out, and every assertion here failed for a reason that
// had nothing to do with the code under test. Borrow one off the body.
const zero = (at) => at.clone().set(0, 0, 0);

async function main() {
  console.log('\n  Can a mind take the meat off its own kill?\n');

  // ── 1. THE ENCODER, where an outbound field actually dies ────────────────
  {
    const { w, at } = loneWorld();
    w.pickups.drop('venison', 3, at, zero(at));
    const snap = w.snapshot(1);
    const back = decode(encode(S_SNAPSHOT, snap));
    check('DROPPED LOOT SURVIVES THE WIRE',
      back?.data?.lo?.some((l) => l.i === 'venison' && l.n === 3),
      JSON.stringify(back?.data?.lo ?? null));
  }

  // ── 2. the snapshot contents, and the bound on them ──────────────────────
  {
    const { w, at } = loneWorld();
    w.pickups.drop('venison', 3, at, zero(at));
    w.pickups.drop('hide', 1, at, zero(at));
    w.pickups.drop('gold', 5, at.clone().setX(at.x + PICKUP.wireRadius * 2), zero(at));
    const lo = w.snapshot(1).lo;
    check('a carcass is in the snapshot',
      lo.some((l) => l.i === 'venison') && lo.some((l) => l.i === 'hide'),
      JSON.stringify(lo.map((l) => `${l.n} ${l.i}`)));
    check('  …and loot beyond PICKUP.wireRadius is NOT sent',
      !lo.some((l) => l.i === 'gold'),
      `${lo.length} entries within ${PICKUP.wireRadius} m — dropped is unbounded in principle`);
  }

  // ── 3. a mind can SEE it, and walk to it ─────────────────────────────────
  {
    const { w, at } = loneWorld();
    w.pickups.drop('venison', 3, at, zero(at));
    const a = new Agent({
      name: 'Mairi', provider: new ScriptedProvider(makeRandom('p')), rand: makeRandom('b'),
    });
    a.hours = 12;
    a._x = at.x; a._y = at.y; a._z = at.z;
    a.health = 100; a.food = 40; a.carrying = { bow: 1, arrow: 4 };
    a.snapshot = w.snapshot(1);

    const b = a.brief();
    check('A MIND CAN SEE THE CARCASS',
      b.contacts.some((c) => /venison/.test(c.what)),
      b.contacts.map((c) => c.what).join(' | ') || 'nothing');
    // "3 venisons" — `itemWords` pluralises by adding an s and venison is a mass
    // noun. Cosmetic, left alone: the item registry is pinned by other checks
    // and this is not worth risking them for an English lesson.
    check('  …and it is in the PROSE, with what it is and where',
      /venison[s]?, seen, right here to the .*, on the ground/.test(briefToText(b)),
      briefToText(b).split('\n').find((l) => /venison/.test(l))?.trim() ?? 'absent');

    // ── THROUGH THE REAL DOOR, NOT PAST IT ──
    //
    // This built the goal by hand and never imported `sanitiseGoal` — so it
    // certified a feature over a path NO MIND COULD REACH. `gather` was
    // declared with `params: []`, the sanitiser deleted `item` from every model
    // reply, and this check went on passing for the life of the bug while
    // starving minds were handed branches.
    //
    // A goal that has not been through the sanitiser is not a goal any mind can
    // issue. Every check that resolves one must pipe it through this function.
    const asked = { kind: 'gather', item: 'venison', why: 'I need meat' };
    const clean = sanitiseGoal(asked);
    check('THE SANITISER KEEPS THE NOUN A MIND ASKED FOR',
      clean?.item === 'venison',
      clean?.item ? `gather item="${clean.item}"` : 'item was DELETED at the door — the mind cannot ask for meat');

    const to = a.resolve(clean);
    check('GATHER venison WALKS TO THE CARCASS, not to a branch',
      to && Math.hypot(to.x - at.x, to.z - at.z) < 3 && to.act === 'interact',
      to ? `${Math.round(to.x)},${Math.round(to.z)} vs carcass at ${Math.round(at.x)},${Math.round(at.z)}`
         : 'roamed — this is the bug that starved a mind on its own kill');

    // THE SENTINEL. `makeCamp` means "a place with fuel in reach" and must not
    // start walking to carcasses just because one is nearer.
    // Asserted on the KEY and not on the distance: `nearestDeadfall` returns a
    // deadfall key and the loot path does not, so the key is what distinguishes
    // "went to firewood" from "went to the carcass". The first version of this
    // measured distance and failed because the nearest branch happened to be
    // two metres away — which was makeCamp working, not breaking.
    const camp = a.resolve({ kind: 'makeCamp' });
    check('SENTINEL: makeCamp still means FIREWOOD, not the nearest meat',
      camp && camp.key !== undefined,
      camp ? `key=${camp.key} — a deadfall key, so it went to wood` : 'null');

    a.outcomes = [];
    a.resolve({ kind: 'gather', item: 'gold' });
    check('  …and gathering something that is not there is refused, out loud',
      a.outcomes.some((o) => /no gold lying about/.test(o.text)),
      JSON.stringify(a.outcomes.map((o) => o.text)));

    const bare = a.resolve({ kind: 'gather' });
    check('bare gather still resolves to something to pick up',
      bare && bare.act === 'interact', bare ? 'yes' : 'roamed');
  }

  // ── 4. AND THE MEAT ACTUALLY ENDS UP IN THE PACK ─────────────────────────
  {
    const { w, p, at } = loneWorld();
    w.pickups.drop('venison', 3, at, zero(at));
    const before = p.inventory.countOf('venison');
    // Standing on it and pressing E is what `gather` resolves to.
    const msg = w.pickups.collectFor(p.ctrl.position, p.inventory);
    check('THE MEAT ENDS UP IN THE PACK',
      p.inventory.countOf('venison') > before,
      `${before} -> ${p.inventory.countOf('venison')} venison (${msg})`);
    check('  …and what was taken is GONE from the ground — nothing minted',
      (w.snapshot(1).lo ?? []).reduce((n, l) => n + (l.i === 'venison' ? l.n : 0), 0)
        + (p.inventory.countOf('venison') - before) === 3,
      'three dropped, and three still accounted for');
  }

  // ── 5. THE TIE-BREAK that let a branch beat a carcass ────────────────────
  //
  // `collectFor` had `wood.distance <= bestD`, so at equal distance the
  // firewood won and a mind that walked to its own kill came away with a
  // branch. Deadfall is everywhere and meat is not.
  {
    const { w, p, at } = loneWorld();
    w.pickups.drop('venison', 1, at, zero(at));
    w.pickups.drop('wood', 1, at, zero(at));
    w.pickups.collectFor(p.ctrl.position, p.inventory);
    check('AT EQUAL DISTANCE THE MEAT WINS, not the branch',
      p.inventory.countOf('venison') > 0,
      `venison ${p.inventory.countOf('venison')}, wood ${p.inventory.countOf('wood')}`);
  }

  // ── 6. and a real socket, for the one thing the rest cannot show ─────────
  {
    const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
      stdio: 'ignore', env: { ...process.env, DANGER: 'none' },
    });
    try {
      const a = new Agent({
        name: 'Seonaid', provider: new ScriptedProvider(makeRandom('q')), rand: makeRandom('c'),
      });
      let joined = null;
      for (let i = 0; i < 40 && !joined; i++) {
        joined = await a.connect(URL).then(() => a).catch(() => null);
        if (!joined) await sleep(100);
      }
      if (!joined) throw new Error(`no server answered on ${URL}`);
      await sleep(800);
      check('A JOINED AGENT RECEIVES THE FIELD over a real socket',
        Array.isArray(a.snapshot?.lo),
        `lo = ${JSON.stringify(a.snapshot?.lo)} — an array, not undefined`);
      a.close?.();
      await sleep(150);
    } finally {
      try { server.kill(); } catch { /* already gone */ }
      await sleep(300);
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  lootcheck could not run: ${err.stack}\n`);
  process.exit(1);
});
