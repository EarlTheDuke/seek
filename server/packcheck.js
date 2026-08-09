// ── packcheck.js ────────────────────────────────────────────────────────────
// Who owns what you are carrying?
//
//   npm run packcheck
//
// THE SESSION THAT CAUSED THIS FILE. The pack was the last thing in the game
// that two machines both believed they owned, and they disagreed constantly:
//
//   > I made 36 arrows at a fire and the server's view of me stayed {bow: 1}.
//   > Dying permanently zeroes the server's copy of your ammo while the client
//   > happily restores twelve arrows from its own save, so you spend the rest
//   > of the run firing blanks. The only reliable fix I found was rejoining
//   > under a different name, which hands you a fresh, properly synced kit.
//
// Three separate leaks in one wound. Crafting went straight into the local
// inventory; ground pickups did too; and nothing ever read `me.iv`, which has
// ridden in every snapshot for as long as `me.h` has.
//
// The rule now, and it is the same rule as health, temperature and position:
// WHILE YOU ARE CONNECTED THE SERVER OWNS THE PACK, because the server's copy
// is the one the world acts on. Offline, this client is the only copy there is
// and nothing changes at all.
//
// What this holds it to:
//
//   * `me.iv` IS THE TRUTH, and applying it keeps what is in your hand.
//   * IT IS QUIET when nothing changed — this runs five times a second.
//   * THE SERVER CRAFTS, when a craft intent arrives, and the result is in
//     the next snapshot.
//   * SO DO PICKUPS.
//   * AND THE DEATH CASE, exactly as he hit it.

import { Inventory } from '../src/items/inventory.js';
import { SimWorld } from '../src/sim/world.js';
import { createIntent } from '../src/sim/intents.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const packOf = (inv) => {
  const m = {};
  for (const s of inv.slots) m[s.item] = (m[s.item] ?? 0) + s.count;
  return m;
};

function main() {
  console.log('\n  Who owns what you are carrying?\n');

  // ── 1. THE CLIENT TAKES THE SERVER'S WORD ────────────────────────────────
  {
    const inv = new Inventory();
    inv.add('bow', 1);
    inv.add('arrow', 12);        // the browser's own save
    const changed = inv.applyRemote({ bow: 1 });   // ...and the server's truth

    check('A QUIVER THE SERVER SAYS IS EMPTY IS EMPTY',
      changed && inv.countOf('arrow') === 0 && inv.countOf('bow') === 1,
      `${inv.countOf('arrow')} arrows left — he fired blanks for a whole session on this`);
  }

  {
    const inv = new Inventory();
    inv.add('bow', 1);
    inv.applyRemote({ bow: 1, arrow: 36, wood: 4 });
    check('  …and 36 arrows the server DOES know about arrive',
      inv.countOf('arrow') === 36 && inv.countOf('wood') === 4,
      JSON.stringify(packOf(inv)));
  }

  {
    // What is in your hand must survive, and by ID: the slot list is rebuilt,
    // so an index into it points at whatever happens to land there.
    const inv = new Inventory();
    inv.add('wood', 3);
    inv.add('bow', 1);
    inv.select(inv.slots.findIndex((s) => s.item === 'bow'));
    inv.applyRemote({ arrow: 20, bow: 1, wood: 9, hide: 2 });
    check('WHAT IS IN YOUR HAND SURVIVES A RECONCILE',
      inv.equippedSlot?.item === 'bow',
      `holding ${inv.equippedSlot?.item} — losing your bow mid-draw is how you learn to distrust the server`);
  }

  {
    const inv = new Inventory();
    inv.add('hide_cloak', 1);
    inv.toggleWorn('hide_cloak');
    inv.applyRemote({ bow: 1 });
    check('  …and you cannot go on wearing what you no longer have',
      !inv.isWorn('hide_cloak') && inv.worn.size === 0);
  }

  {
    // Five times a second, so silence when nothing changed is not a nicety.
    const inv = new Inventory();
    inv.add('bow', 1);
    inv.add('arrow', 12);
    let fired = 0;
    inv.onChange = () => { fired++; };
    const a = inv.applyRemote({ arrow: 12, bow: 1 });   // same goods, other order
    const b = inv.applyRemote({ bow: 1, arrow: 12 });
    check('A SNAPSHOT THAT CHANGES NOTHING CHANGES NOTHING',
      a === false && b === false && fired === 0,
      `${fired} change events from two identical snapshots`);
  }

  {
    const inv = new Inventory();
    inv.add('bow', 1);
    // A wire that has been tampered with, or a version skew.
    inv.applyRemote({ bow: 1, dragon: 4, arrow: -3 });
    check('an id this world has never heard of is dropped, not carried',
      inv.countOf('dragon') === 0 && inv.countOf('arrow') === 0 && inv.countOf('bow') === 1,
      JSON.stringify(packOf(inv)));

    const before = JSON.stringify(packOf(inv));
    inv.applyRemote(null);
    inv.applyRemote(undefined);
    check('  …and a snapshot with no pack in it leaves the pack alone',
      JSON.stringify(packOf(inv)) === before, before);
  }

  // ── 2. THE SERVER REALLY DOES THE WORK ───────────────────────────────────
  {
    const w = new SimWorld({ headless: true });
    const p = w.addPlayer(1, 'Mairi');
    p.inventory.add('wood', 12);
    // A fire within reach, because fletching needs one.
    w.fires.light(p.ctrl.position.x, p.ctrl.position.z, 40);

    const before = p.inventory.countOf('arrow');
    // Through the real door: the wire writes onto `p.intent`, and `stepPlayer`
    // reads it from there. Anything else would be testing a path nothing uses.
    w.setIntent(p.id, { craft: 'fletch_arrows' });
    w.stepPlayer(p, 1 / 60, {});

    const snap = w.snapshot(p.id);
    check('THE SERVER IS THE ONE THAT CRAFTS, and says so in `me.iv`',
      !!snap?.me?.iv,
      snap?.me?.iv ? JSON.stringify(snap.me.iv) : 'no pack on the wire at all');
    check('  …and the arrows it fletched are in the pack it sends',
      p.inventory.countOf('arrow') > before
        && (snap.me.iv.arrow ?? 0) === p.inventory.countOf('arrow'),
      `arrows ${before} -> ${p.inventory.countOf('arrow')}, on the wire as ${snap.me.iv.arrow}`);
  }

  {
    // And the round trip: whatever the server holds is what the browser ends
    // up holding, which is the only claim that actually matters.
    const w = new SimWorld({ headless: true });
    const p = w.addPlayer(1, 'Mairi');
    p.inventory.add('wood', 7);
    p.inventory.add('hide', 3);

    const browser = new Inventory();
    browser.add('bow', 1);
    browser.add('arrow', 12);      // the stale save
    browser.applyRemote(w.snapshot(p.id).me.iv);

    check('THE ROUND TRIP: the browser ends up holding what the server holds',
      JSON.stringify(packOf(browser)) === JSON.stringify(packOf(p.inventory)),
      `browser ${JSON.stringify(packOf(browser))} · server ${JSON.stringify(packOf(p.inventory))}`);
  }

  // ── 3. HIS DEATH, EXACTLY ────────────────────────────────────────────────
  {
    const w = new SimWorld({ headless: true });
    const p = w.addPlayer(1, 'Mairi');   // already comes with a bow and a quiver

    const browser = new Inventory();
    browser.applyRemote(w.snapshot(p.id).me.iv);
    const armed = browser.countOf('arrow');

    // Death takes the quiver on the server's side.
    p.inventory.remove('arrow', p.inventory.countOf('arrow'));

    // The browser reloads its own save — twelve arrows, from before.
    browser.add('arrow', 12);
    browser.applyRemote(w.snapshot(p.id).me.iv);

    check('AFTER DEATH THE BROWSER DOES NOT INVENT A QUIVER',
      armed === 12 && browser.countOf('arrow') === 0,
      `had ${armed} before dying, ${browser.countOf('arrow')} after — no more firing blanks`);
    check('  …and still has the bow, which death does not take',
      browser.countOf('bow') === 1);
  }

  // ── 4. AND THE TREES, WHICH THIS FIX BROKE BEFORE IT FIXED THEM ─────────
  //
  // Reported by Ben within the hour of shipping the reconcile: "I am cutting
  // branches but they are not going into my inventory."
  //
  // Cutting a tree was BROWSER-ONLY. That was invisible for as long as the
  // browser owned its own pack — it just meant the server disagreed, quietly,
  // which is the very disease this file exists to cure. The moment the server
  // became the authority, the disagreement became visible and brutal: wood
  // appeared for one frame and the next snapshot wiped it.
  //
  // The lesson is bigger than the trees. MAKING ONE SIDE AUTHORITATIVE TURNS
  // EVERY REMAINING LOCAL MUTATION INTO A VISIBLE BUG. Anything that can still
  // mint an item on the client has to move, and this is the assertion that
  // says so out loud for the next one.
  {
    const w = new SimWorld({ headless: true });
    const p = w.addPlayer(1, 'Jack');
    const trunk = w.scatterColliders.list.find((c) => c.tag === 'tree' && c.kind === 1);
    check('the server knows where the trees are at all',
      !!trunk, trunk ? `nearest trunk at ${Math.round(trunk.x)}, ${Math.round(trunk.z)}` : 'no trees on the server');

    p.ctrl.position.set(trunk.x, 0, trunk.z);
    const before = p.inventory.countOf('wood');
    const cut = w.harvestFor(p);
    check('CUTTING A TREE HAPPENS ON THE SERVER, and the branches are real',
      cut && p.inventory.countOf('wood') > before,
      `wood ${before} -> ${p.inventory.countOf('wood')}`);

    const ev = w.events.find((e) => e.k === 'cut');
    check('  …and it says so, with the stump, so the browser can grey it out',
      !!ev && ev.by === p.id && Array.isArray(ev.at) && ev.count > 0,
      ev ? JSON.stringify(ev) : 'no event — the browser would go on offering the same trunk');

    check('  …and the same trunk cannot be cut twice',
      w.harvestFor(p) === false || w.events.filter((e) => e.k === 'cut').length === 1,
      'a spent tree stays spent until it regrows');
  }

  {
    // The clock that regrows it must not wrap. `clock.hours` is % 24, and a
    // regrow time of `hours + 30` off a wrapping clock is a tree that came back
    // yesterday. This project has been caught by that clock three times.
    const w = new SimWorld({ headless: true });
    const start = w.totalHours;
    for (let i = 0; i < 60 * 60 * 30; i++) w.step(1 / 60);   // half an hour of ticks
    check('THE HARVEST CLOCK DOES NOT WRAP AT MIDNIGHT',
      w.totalHours > start && w.totalHours >= w.clock.hours,
      `totalHours ${start.toFixed(2)} -> ${w.totalHours.toFixed(2)}, wall clock reads ${w.clock.hours.toFixed(2)}`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
