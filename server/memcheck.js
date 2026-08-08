// ── memcheck.js ─────────────────────────────────────────────────────────────
// Does a mind remember what happened, or only what it can see?
//
//   npm run memcheck
//
// THE MEASUREMENT THAT CAUSED THIS FILE. On 2026-08-08, replaying the real
// write pattern against the real `Memory` class showed that an event was
// visible to the model for EXACTLY ONE DECISION and then gone:
//
//   decision 3 | visible: I brought down a deer
//   decision 4 | visible: Eachann offers me venison for wood
//   decision 5 | visible: I decided to say: that deer is mine
//   decision 6 | visible: NONE
//
// `Memory` was a single 40-entry ring handing over its last 5 entries, and
// perception wrote ~26 entries between two thoughts — 2 sightings every
// `AGENTS.noticeSeconds` plus `maxContacts` more at each deliberation. Four of
// the five lines a model ever saw were "a deer, somewhere, walking".
//
// That one fact explains most of a seven-hour run: a sentence said three times
// because there was no memory of saying it, a two-step barter whose step one
// was gone by step two, and an apparent grudge that was the same thought had
// forty times.
//
// SO THIS FILE ASSERTS THE THING THAT WAS BROKEN, NOT THE CODE THAT FIXES IT:
// drown a memory in perception and see whether it is still there. Both arms are
// run — `flat` must still fail, because a control that quietly starts passing
// is not a control, and the A/B is how anybody can tell what the split is worth.

import { Memory } from '../src/minds/mind.js';
import { MINDS, AGENTS } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// The real write pattern, from src/net/agent.js:
//   every AGENTS.noticeSeconds -> up to 2 contacts written as sightings
//   every decision             -> up to AGENTS.maxContacts more
const CADENCE = 20;
const HOURS_PER_SEC = 24 / (26 * 60); // a day is TIME.dayMinutes = 26 real minutes
const FAR = ['close', 'a little way off', 'far off'];
const DOING = ['walking', 'running'];

/** Deterministic, because a check that shuffles is not a check. */
function makeNoise() {
  let seed = 20260808;
  let i = 0;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    i++;
    return `a deer ${FAR[seed % FAR.length]}, ${DOING[(seed >> 5) % DOING.length]} ${i % 3}`;
  };
}

/**
 * Live a while, injecting real events, and report which are still visible.
 * @returns {{visible: number[][], lines: string[][]}} per decision
 */
function live({ flat, decisions = 12, events = {} }) {
  const m = new Memory({ flat });
  const noise = makeNoise();
  let hour = 0;
  const seen = [];
  const fired = [];

  for (let d = 1; d <= decisions; d++) {
    for (let t = 0; t < CADENCE; t += AGENTS.noticeSeconds) {
      hour += AGENTS.noticeSeconds * HOURS_PER_SEC;
      for (let i = 0; i < 2; i++) m.add(hour, noise(), MINDS.weight.sighting);
    }
    if (events[d]) {
      m.add(hour, events[d].text, events[d].w);
      fired.push(events[d].text);
    }
    // What the brief hands the model, at exactly the moment it is built.
    const lines = m.recent(hour);
    seen.push({ lines, alive: fired.filter((t) => lines.includes(t)) });
    // ...and then deliberate() writes its own contacts, as the real one does.
    for (let i = 0; i < AGENTS.maxContacts; i++) m.add(hour, noise(), MINDS.weight.sighting);
  }
  return seen;
}

const EVENTS = {
  3: { text: 'I brought down a deer', w: MINDS.weight.kill },
  4: { text: 'Eachann offers me venison for wood', w: MINDS.weight.trade },
  5: { text: 'I decided to say: that deer is mine', w: MINDS.weight.spoke },
};

function main() {
  console.log('\n  Does a mind remember what happened, or only what it can see?\n');

  // ── the control arm, which must still be broken ──────────────────────────
  {
    const seen = live({ flat: true, events: EVENTS });
    const atSix = seen[5].alive.length;
    check('FLAT: an event is gone by the next decision — the old behaviour, preserved',
      atSix === 0,
      `${atSix} of 3 events still visible at decision 6 (0 is the bug being reproduced)`);
    const noiseAt6 = seen[5].lines.filter((l) => l.startsWith('a deer')).length;
    check('  …and the model sees almost nothing but sightings',
      noiseAt6 >= MINDS.memoryRecall - 1,
      `${noiseAt6} of ${seen[5].lines.length} lines are "a deer, somewhere, walking"`);
  }

  // ── the split, which is the whole point ──────────────────────────────────
  {
    const seen = live({ flat: false, events: EVENTS });

    const kill = seen.findIndex((s, i) => i >= 2 && !s.alive.includes('I brought down a deer'));
    const survived = kill === -1 ? seen.length : kill;
    check('SPLIT: a kill survives many decisions of perception, not one',
      survived >= 10,
      `visible for ${survived} decisions (was 1)`);

    const last = seen.at(-1);
    check('  …and ALL THREE events are still there at the end of the run',
      last.alive.length === 3,
      `${last.alive.length} of 3 — ${JSON.stringify(last.alive)}`);

    check('  …and a decision still gets some sightings, so it can see the world',
      last.lines.some((l) => l.startsWith('a deer')),
      `${last.lines.filter((l) => l.startsWith('a deer')).length} sighting lines`);

    // The ordering matters as much as the survival: a model reading
    // "I offered wood" before "I decided to hunt" infers the wrong sequence.
    const order = ['I brought down a deer', 'Eachann offers me venison for wood']
      .map((t) => last.lines.indexOf(t));
    check('  …and events are in the order they happened, oldest first',
      order[0] >= 0 && order[1] >= 0 && order[0] < order[1],
      `kill at ${order[0]}, offer at ${order[1]}`);
  }

  // ── importance actually decides, and is not just carried around ──────────
  {
    // Two events at the same instant, one trivial and one not. Then bury both.
    const m = new Memory();
    const noise = makeNoise();
    let hour = 0;
    m.add(hour, 'somebody shot me for 11', MINDS.weight.shot);
    for (let i = 0; i < MINDS.eventsKept; i++) {
      hour += 0.05;
      m.add(hour, `I picked up a branch ${i}`, MINDS.weight.event);
    }
    const lines = m.recent(hour);
    check('IMPORTANCE: being shot outranks sixty small events that came after',
      lines.includes('somebody shot me for 11'),
      JSON.stringify(lines.slice(0, 3)));

    // ...and the SENTINEL: with equal weights, the recent one wins instead —
    // so the line above is testing importance and not merely "the first entry".
    const flatW = new Memory();
    let h2 = 0;
    flatW.add(h2, 'somebody shot me for 11', MINDS.weight.event);
    for (let i = 0; i < MINDS.eventsKept; i++) {
      h2 += 0.05;
      flatW.add(h2, `I picked up a branch ${i}`, MINDS.weight.event);
    }
    check('  …and the SENTINEL: at equal weight the old one loses',
      !flatW.recent(h2).includes('somebody shot me for 11'),
      'so the assertion above is importance, not insertion order');
  }

  // ── decay: importance must not pin something for ever ────────────────────
  //
  // THIS IS THE ASSERTION THAT FOUND THE WRAPPING CLOCK. `Agent.hours` is
  // `% 24`, so "older than `memoryHours`" was inexpressible: a day after an
  // event its age computed as zero and it was young again, for ever. The first
  // version of this file asserted staleness at hour 23.9 of the SAME day, which
  // is 23.9 hours old and legitimately still inside the window — the check was
  // wrong and the code was wrong, in different ways, at the same time.
  //
  // Walked forward through a real midnight instead, which is the only way to
  // age something past a day on a clock that only counts to 24.
  {
    const m = new Memory();
    m.add(0, 'somebody shot me for 11', MINDS.weight.shot);
    const fresh = m.recent(0.1).includes('somebody shot me for 11');
    m.add(12, 'the day went by', MINDS.weight.event); // midday, same day
    m.add(0.5, 'and midnight passed', MINDS.weight.event); // <- the wrap
    const stale = m.recent(1.0).includes('somebody shot me for 11');
    check('DECAY: a heavy memory is dropped once it is more than a day old',
      fresh && !stale, `fresh ${fresh}, after one midnight ${stale}`);
  }

  // ── the midnight trap, which has already cost this project a night ───────
  {
    const m = new Memory();
    m.add(23.5, 'somebody shot me for 11', MINDS.weight.shot);
    // 00:30 the next day is ONE hour later, not minus twenty-three.
    check('MIDNIGHT: an event from last night is one hour old, not minus twenty-three',
      m.recent(0.5).includes('somebody shot me for 11'),
      'the wrap is counted forward, not backward');
    check('  …and the clock keeps counting past a single day',
      Memory.ageOf(26, 1) === 25,
      `ageOf(26, 1) = ${Memory.ageOf(26, 1)}`);
  }

  // ── a save must survive the change, in both directions ───────────────────
  {
    const m = new Memory();
    m.add(1, 'Eachann gave me venison', MINDS.weight.trade);
    m.add(1, 'a deer close, walking', MINDS.weight.sighting);
    const back = new Memory();
    back.restore(JSON.parse(JSON.stringify(m.serialise())));
    check('SAVE: a split memory round-trips',
      back.recent(1.1).includes('Eachann gave me venison'),
      JSON.stringify(back.recent(1.1)));

    // An OLD flat save, loaded by the new code. Its entries were the decision
    // log and are worth more than nothing, so they come back as events.
    const old = new Memory();
    old.restore([{ hour: 1, text: 'I decided to hunt a deer' }]);
    check('  …and an old flat save loads as events rather than vanishing',
      old.recent(1.1).includes('I decided to hunt a deer'));
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
