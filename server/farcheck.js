// ── farcheck.js ─────────────────────────────────────────────────────────────
// Can two minds find each other once they have drifted apart?
//
//   npm run farcheck
//
// THE RUN THAT CAUSED THIS FILE. Two minds spawn 3.3 m apart — `addPlayer` fans
// joiners around one spot, "everyone opens their eyes on the same shore" — and
// on 2026-08-08 they were a kilometre apart within the hour and never came
// back. `brief()` drops any contact past `AGENTS.noticeRange` (140 m), and
// EVERY SOCIAL VERB RESOLVES ITS TARGET BY NAME OUT OF THE BRIEF, so past that
// range `offer`, `accept`, `give`, `attack`, `follow` and `guard` all silently
// became `roam()`. Within ten minutes of any run all six were unreachable.
//
// It retroactively explains both six-model playtests. "The models never
// coordinated" was never a fact about the models: they were each alone in a
// private world with the same weather.
//
// AND THE WIRE WAS NEVER THE PROBLEM. `SimWorld.snapshot` culls players by
// nothing at all — every player, every tick, exact coordinates. The agent
// already knew where everybody was and threw it away building the prompt.
//
// TWO ASSERTIONS CARRY THIS FILE:
//
//   A NAME AND A BEARING AT ANY RANGE, so a verb has something to take.
//
//   AND THAT THE NEAR CHANNEL STILL MEANS SOMETHING. The far entry must carry
//   no distance and no condition — if it did, 140 m would stop meaning anything
//   and this would be "raise the range" wearing a disguise.

import { Agent } from '../src/net/agent.js';
import { ScriptedProvider } from '../src/minds/providers.js';
import { briefToText } from '../src/minds/perception.js';
import { makeRandom } from '../src/world/noise.js';
import { AGENTS } from '../src/config.js';
import { describePosition } from '../src/world/placenames.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * One mind, standing at the origin, with `others` at the given offsets.
 * Off the wire on purpose: this is about what the prompt says, not the socket.
 */
function seeing(others) {
  const a = new Agent({
    name: 'Mairi',
    provider: new ScriptedProvider(makeRandom('p')),
    rand: makeRandom('b'),
  });
  a.hours = 12;
  a._x = 0; a._y = 0; a._z = 0;
  a.health = 100; a.food = 60;
  a.carrying = { bow: 1, arrow: 5, wood: 3, venison_cooked: 1 };
  a.snapshot = {
    c: 12,
    w: { s: 'clear' },
    cr: [],
    pl: others.map((o, i) => ({
      id: 10 + i, p: [o.x, 0, o.z], h: 100, s: 0, c: false, x: false,
    })),
  };
  others.forEach((o, i) => a.others.set(10 + i, o.name));
  return a;
}

function main() {
  console.log('\n  Can two minds find each other once they have drifted apart?\n');

  // ── the range at which everything used to disappear ──────────────────────
  const FAR = AGENTS.noticeRange * 6; // ~840 m, about what was measured live

  {
    const a = seeing([{ name: 'Coinneach', x: -FAR * 0.7, z: FAR * 0.7 }]);
    const b = a.brief();

    check('THE OTHER MIND IS NAMED, at six times notice range',
      b.far?.some((f) => f.who === 'Coinneach'), JSON.stringify(b.far));
    check('  …with a bearing to set off along',
      /west/.test(b.far?.[0]?.where ?? ''), b.far?.[0]?.where ?? 'none');
    check('  …and it reaches the PROSE the model actually reads',
      /Also out there somewhere:[\s\S]*Coinneach, off to the/.test(briefToText(b)),
      briefToText(b).split('\n').find((l) => /Coinneach/.test(l)) ?? 'absent');

    // THE ASSERTION THAT KEEPS THIS FROM BEING "RAISE THE RANGE".
    const entry = b.far[0];
    check('  …and it carries NO distance and NO condition',
      Object.keys(entry).sort().join(',') === 'where,who',
      `keys: ${Object.keys(entry).join(', ')} — the near channel has to keep meaning something`);
    check('  …and it is NOT in contacts, which still stops at notice range',
      !b.contacts.some((c) => c.what === 'Coinneach'),
      `${b.contacts.length} contacts`);
  }

  // ── the sentinel: inside the range, nothing changes ──────────────────────
  {
    const a = seeing([{ name: 'Coinneach', x: 30, z: 0 }]);
    const b = a.brief();
    check('SENTINEL: somebody CLOSE is a contact and not a rumour',
      b.contacts.some((c) => c.what === 'Coinneach') && (b.far ?? []).length === 0,
      `${b.contacts.length} contacts, ${b.far?.length ?? 0} far`);
    check('  …and a close contact still carries distance and condition',
      !!b.contacts[0].distance && !!b.contacts[0].condition,
      `${b.contacts[0].distance}, ${b.contacts[0].condition}`);
  }

  // ── and an unnamed stranger is not reported, because no verb takes one ───
  {
    const a = seeing([{ name: 'Coinneach', x: FAR, z: 0 }]);
    a.others.clear(); // never met
    const b = a.brief();
    check('an unnamed stranger over the horizon is NOT reported',
      (b.far ?? []).length === 0,
      'a prompt line that can only produce a refused goal is worse than silence');
  }

  // ── THE POINT: a verb can now take that name ─────────────────────────────
  {
    const a = seeing([{ name: 'Coinneach', x: -FAR, z: 0 }]);
    const to = a.resolve({ kind: 'approach', target: 'Coinneach' });
    check('APPROACH WALKS TOWARD SOMEBODY IT CANNOT SEE',
      to && Math.abs(to.x - -FAR) < 1 && Math.abs(to.z) < 1,
      to ? `heading for ${Math.round(to.x)},${Math.round(to.z)}` : 'roamed');

    // ...and the sentinel: a name nobody has is still refused, and SAID SO.
    a.outcomes = [];
    a.resolve({ kind: 'approach', target: 'Nobody At All' });
    check('  …and a name nobody has is refused, out loud',
      a.outcomes.some((o) => /nobody called "Nobody At All"/.test(o.text)),
      JSON.stringify(a.outcomes.map((o) => o.text)));
  }

  // ── goTo: A VERB THAT HAD NEVER ONCE WORKED ──────────────────────────────
  //
  // It is in GOAL_IDS and the system prompt advertises it, and the agent's
  // resolve switch had no case for it — it fell through to `default:
  // this.roam()`. Every mind that ever decided to make for a named place
  // wandered at random, and a session log read "make for Hollowed Beinn" while
  // the body did nothing of the kind.
  {
    const a = seeing([]);
    // Whatever district this world calls the ground 900 m north of the origin.
    const there = describePosition(0, -900);
    const name = there.district?.name ?? there.name ?? null;
    if (!name) {
      check('goTo walks to a named place', false, 'could not name a test district');
    } else {
      const to = a.resolve({ kind: 'goTo', place: name });
      const moved = to && Math.hypot(to.x - a._x, to.z - a._z) > 1;
      const roamed = to && Math.hypot(to.x - a._x, to.z - a._z) <= AGENTS.roamDistance + 1;
      check(`GOTO WALKS TO A NAMED PLACE — "${name}"`,
        moved && !roamed,
        to ? `${Math.round(to.x)},${Math.round(to.z)} — roam would be within ${AGENTS.roamDistance} m` : 'null');
    }

    a.outcomes = [];
    a.resolve({ kind: 'goTo', place: 'Nowhere In Particular' });
    check('  …and a place it does not know is refused, out loud',
      a.outcomes.some((o) => /do not know the way/.test(o.text)),
      JSON.stringify(a.outcomes.map((o) => o.text)));
  }

  // ── goTo a PERSON, because a model plainly means that too ────────────────
  {
    const a = seeing([{ name: 'Coinneach', x: 0, z: -FAR }]);
    const to = a.resolve({ kind: 'goTo', place: 'Coinneach' });
    check('goTo also takes a person',
      to && Math.abs(to.z - -FAR) < 1,
      to ? `${Math.round(to.x)},${Math.round(to.z)}` : 'roamed');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
