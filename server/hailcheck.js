// ── hailcheck.js ────────────────────────────────────────────────────────────
// Does anybody stop when you speak to them?
//
//   npm run hailcheck
//
// THE THREE SESSIONS THAT CAUSED THIS FILE. A playtester tried to hire an agent
// to help kill a troll, and the conversation worked — they answered in
// character, one of them bargained over the price rather than refusing the job.
// The hiring still collapsed:
//
//   > agents move at roughly my sprint speed and never stop, so I could close
//   > to 0.02 m and then lose them; Morag's five arrows were always "at my fire
//   > tonight" and he re-planned before I could arrive.
//
// It is not only a human problem. In the third instrumented melee hour, three
// offers were ACCEPTED and only two became trades, and the one that failed
// failed the same way: the counterparty had walked off between the offer and
// the answer.
//
// WHY IT IS A REFLEX AND NOT A DECISION. A mind is seconds away — the cadences
// on the roster run 20 to 75 seconds, and a body at 4 m/s covers eighty metres
// in twenty of them. Waiting for a model to decide to stand still is waiting
// for it to decide something about a moment that has already ended. So the legs
// stop now and the mind answers in its own time, and every seat gets it,
// including the scripted control, because it is the body's doing and not the
// brain's.
//
// What this holds it to:
//
//   * BEING SPOKEN TO NEAR YOU STOPS YOU, and turns you to face them.
//   * SHOUTING FROM ACROSS THE GLEN DOES NOT.
//   * IT WEARS OFF, so nobody can pin a body in place.
//   * A STANDING OFFER STOPS YOU TOO — the offerer is walking over.
//   * IT NEVER FREEZES SOMEBODY WHO IS TRYING TO REACH YOU. Two bodies
//     politely waiting for each other is the deadlock this ends, not starts.
//   * AND IT NEVER HOLDS A BODY STILL WHILE SOMETHING IS EATING IT.

import { Agent } from '../src/net/agent.js';
import { SOCIAL, AGENTS } from '../src/config.js';
import { createIntent } from '../src/sim/intents.js';
import { readFileSync } from 'node:fs';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * An agent with a body but no socket. Everything the hail reflex touches is
 * plain state, so none of this needs a server.
 */
function bodyAt(x = 0, z = 0) {
  const a = Object.create(Agent.prototype);
  a.name = 'Morag';
  a.id = 1;
  a._x = x; a._y = 0; a._z = z;
  a.yaw = 0;
  a.goal = { kind: 'walk' };
  a.others = new Map();
  a.snapshot = { pl: [] };
  a.hailFor = 0;
  a.trackSelf = () => {};
  // Fed and warm unless a test says otherwise. `undefined` would mean "no
  // snapshot of myself yet", which is a third thing again.
  a.food = 90;
  a.coreC = 37;
  return a;
}

/** Put somebody else in the world, at a distance. */
function put(a, id, name, x, z) {
  a.others.set(id, name);
  a.snapshot.pl.push({ id, p: [x, 0, z] });
}

function main() {
  console.log('\n  Does anybody stop when you speak to them?\n');

  // ── 1. SPOKEN TO, NEAR ────────────────────────────────────────────────────
  {
    const a = bodyAt(0, 0);
    put(a, 2, 'Ben', 0, 6);          // six metres away, well inside earshot
    a.noteHail('Ben');
    check('SOMEBODY SPEAKING NEXT TO YOU STOPS YOU',
      a.hailFor === SOCIAL.hailHoldSeconds && a.hailedBy === 'Ben',
      `holding for ${a.hailFor}s for ${a.hailedBy}`);

    const i = createIntent();
    i.forward = 1;
    i.sprint = true;
    const took = a.holdForHail(0.1, i);
    check('  …and the legs actually stop, this tick',
      took && i.forward === 0 && i.sprint === false,
      `forward ${i.forward}, sprint ${i.sprint} — he could close to 0.02 m and still lose them`);

    check('  …and the body turns to face them',
      Math.abs(i.aimYaw - Math.atan2(-0, -6)) < 1e-9,
      `yaw ${a.yaw.toFixed(3)} — being listened to, rather than a body that happened to stop`);
  }

  // ── 2. ...BUT NOT FROM ACROSS THE GLEN ───────────────────────────────────
  {
    const a = bodyAt(0, 0);
    put(a, 2, 'Ben', 0, SOCIAL.hailRange + 40);
    a.noteHail('Ben');
    check('SHOUTING FROM 56 M AWAY DOES NOT STOP ANYBODY',
      !(a.hailFor > 0),
      `hailRange is ${SOCIAL.hailRange} m — out of earshot is out of the conversation`);
  }

  {
    const a = bodyAt(0, 0);
    a.noteHail('Morag');   // itself
    check('  …and you cannot hail yourself', !(a.hailFor > 0));

    const b = bodyAt(0, 0);
    put(b, 2, 'Ben', 0, 3);
    b.noteHail('Somebody Who Is Not Here');
    check('  …nor can a name nobody in the world answers to', !(b.hailFor > 0));
  }

  // ── 3. IT WEARS OFF ──────────────────────────────────────────────────────
  {
    const a = bodyAt(0, 0);
    put(a, 2, 'Ben', 0, 4);
    a.noteHail('Ben');
    const i = createIntent();
    let ticks = 0;
    while (a.holdForHail(0.5, i) && ticks < 200) ticks++;
    const held = ticks * 0.5;
    check('A HAIL WEARS OFF — nobody can pin a body in place by talking at it',
      ticks < 200 && Math.abs(held - SOCIAL.hailHoldSeconds) <= 0.5,
      `stood for about ${held}s of ${SOCIAL.hailHoldSeconds}s`);

    // ...and speaking again renews it, because that is a conversation.
    a.noteHail('Ben');
    check('  …and speaking again renews it',
      a.holdForHail(0.1, createIntent()) === true);
  }

  // ── 4. A DEAL ON THE TABLE IS ALSO A HAIL ────────────────────────────────
  {
    const a = bodyAt(0, 0);
    put(a, 2, 'Tormod', 2, 2);
    a.noteHail('Tormod');
    check('A STANDING OFFER STOPS THE PERSON IT WAS MADE TO',
      a.hailFor > 0 && a.hailedBy === 'Tormod',
      'three accepts became two trades; the third walked away');
  }

  // ── 5. THE TWO IT MUST NEVER DO ──────────────────────────────────────────
  {
    // Freezing somebody who is trying to reach YOU is the deadlock, not the
    // fix: two bodies standing three metres apart waiting for each other.
    for (const kind of ['give', 'offer', 'accept', 'approach', 'follow']) {
      const a = bodyAt(0, 0);
      put(a, 2, 'Ben', 0, 5);
      a.noteHail('Ben');
      a.goal = { kind, target: 'Ben' };
      const i = createIntent();
      i.forward = 1;
      const took = a.holdForHail(0.1, i);
      check(`A BODY ALREADY WALKING TO YOU IS NOT FROZEN — \`${kind}\``,
        took === false && i.forward === 1,
        'both of us waiting politely is the deadlock this ends, not starts');
    }
  }

  {
    const a = bodyAt(0, 0);
    put(a, 2, 'Ben', 0, 5);
    a.noteHail('Ben');
    a.goal = { kind: 'avoid', target: 'a goblin' };
    const i = createIntent();
    i.forward = 1;
    check('AND NOTHING HOLDS A BODY STILL WHILE SOMETHING IS EATING IT',
      a.holdForHail(0.1, i) === false && i.forward === 1,
      'a hail cannot override `avoid`');
  }

  {
    // The sentinel that stops all of section 5 being vacuous: the same body,
    // the same hail, an ordinary goal — and it holds.
    const a = bodyAt(0, 0);
    put(a, 2, 'Ben', 0, 5);
    a.noteHail('Ben');
    a.goal = { kind: 'gather', want: 'wood' };
    const i = createIntent();
    i.forward = 1;
    check('SENTINEL: on an ordinary goal, the same hail DOES hold',
      a.holdForHail(0.1, i) === true && i.forward === 0,
      'so the exemptions above are about those goals, not about a dead reflex');
  }

  // ── 6. THE ONE THE CHECK DID NOT CATCH THE FIRST TIME ────────────────────
  //
  // The reflex was first placed AFTER `upkeep`, and every assertion above
  // passed. It still did not work in the game: `upkeep` does not only handle
  // the instant emergencies, it WALKS TO A FIRE — up to 45 m, returning true
  // on every tick of that walk — so a cold or hungry agent never reached the
  // hail at all. With `HUNGER=52` that is most of them, most of the time.
  //
  // Measured live: a freshly joined agent held for the full six seconds while
  // the scripted control, alive long enough to be cold, walked straight past a
  // man standing 3.6 m away saying her name.
  //
  // So the reflex now runs BEFORE `upkeep` and declines for itself when the
  // body is genuinely in trouble — which is narrower, and right: being on a
  // long walk toward a fire is not an emergency, and a person on that walk
  // would still stop when spoken to.
  {
    const a = bodyAt(0, 0);
    put(a, 2, 'Ben', 0, 5);
    // The ordinary state of everybody in this game: past the maintenance
    // lines (eatBelow 45, warmBelow 35.4) and nowhere near an emergency. The
    // first version declined here, which swallowed the whole feature.
    a.food = AGENTS.eatBelow - 5;
    a.coreC = AGENTS.warmBelow - 0.4;
    a.noteHail('Ben');
    const i = createIntent();
    i.forward = 1;
    check('A HUNGRY, CHILLY BODY — i.e. EVERYBODY — STILL STOPS WHEN SPOKEN TO',
      a.holdForHail(0.1, i) === true && i.forward === 0,
      'this is the one that was broken while every assertion above passed');
  }

  {
    const a = bodyAt(0, 0);
    put(a, 2, 'Ben', 0, 5);
    a.food = SOCIAL.tooHungryToTalk - 1;
    a.noteHail('Ben');
    const i = createIntent();
    i.forward = 1;
    check('  …but a STARVING body does not stop to chat',
      a.holdForHail(0.1, i) === false && i.forward === 1,
      `below ${SOCIAL.tooHungryToTalk} fed — being polite is not worth dying over`);
  }

  {
    const a = bodyAt(0, 0);
    put(a, 2, 'Ben', 0, 5);
    a.coreC = SOCIAL.tooColdToTalk - 0.5;
    a.noteHail('Ben');
    const i = createIntent();
    i.forward = 1;
    check('  …nor does a FREEZING one',
      a.holdForHail(0.1, i) === false && i.forward === 1,
      `below ${SOCIAL.tooColdToTalk}C core`);
  }

  {
    // And that the reflex is genuinely reached before upkeep in `act`, rather
    // than merely correct in isolation — which is exactly the gap that let the
    // first version pass sixteen assertions and fail in the game.
    const src = readFileSync(new URL('../src/net/agent.js', import.meta.url), 'utf8');
    const hail = src.indexOf('this.holdForHail(dt, i)) return;');
    const keep = src.indexOf('if (this.upkeep(dt, i)) {');
    check('AND THE HAIL IS REACHED BEFORE `upkeep`, in the source itself',
      hail > 0 && keep > 0 && hail < keep,
      hail < keep ? 'hail first' : 'upkeep first — a cold agent will never hear you');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
