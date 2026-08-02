// ── mind.js ─────────────────────────────────────────────────────────────────
// The deliberation layer.
//
// VISION.md §6b splits a mind in two, and the split is the whole design:
//
//   REFLEX        every tick        seeing, fleeing, aiming, footwork
//   DELIBERATION  every few seconds goals, memory, speech, grudges
//
//   > The model never drives a body. It sets intent — hunt the ridge, follow
//   > that human, fall back to the warren, say this. The existing state machine
//   > executes it. If the model is slow, absent or wrong, the creature still
//   > behaves like a competent animal.
//
// So this file owns a GOAL and a MEMORY, and nothing else. It never touches a
// position, never sets a velocity, never fires a bow. It decides what the body
// should be trying to do, on a slow cadence, and then gets out of the way.
//
// Being asynchronous is the point. `think()` starts a decision and returns
// immediately; when the answer arrives — in a millisecond from a rule set, or
// two seconds from a model — it is installed as the new goal. The world never
// waits for a mind, so a mind can never stall the world.

import { MINDS } from '../config.js';
import { sanitiseGoal, describeGoal } from './goals.js';
import { buildBrief } from './perception.js';

/**
 * What a mind carries between decisions.
 *
 * Deliberately small and deliberately in WORDS. A memory of "a hunter took a
 * deer near the Black Moss" is worth more to the next decision than a list of
 * coordinates, it survives being handed to a language model, and it is
 * something a player could be told if they asked.
 */
export class Memory {
  constructor(limit = MINDS.memorySize) {
    this.limit = limit;
    this.entries = []; // { hour, text }
  }

  add(hour, text) {
    // Never the same thing twice in a row — a mind that saw one deer six times
    // should not remember six deer.
    if (this.entries.at(-1)?.text === text) return;
    this.entries.push({ hour, text });
    if (this.entries.length > this.limit) this.entries.shift();
  }

  /** What still feels recent, newest first. */
  recent(hour, withinHours = MINDS.memoryHours) {
    return this.entries
      .filter((e) => hour - e.hour <= withinHours)
      .slice(-MINDS.memoryRecall)
      .reverse()
      .map((e) => e.text);
  }

  serialise() {
    return this.entries;
  }

  restore(list) {
    this.entries = (list ?? []).slice(-this.limit);
  }
}

export class Mind {
  /**
   * @param {object} body     anything with position, yaw and senses
   * @param {object} provider anything with decide(brief) -> goal
   */
  constructor(body, provider, { name = 'someone', cadence = MINDS.cadenceSeconds } = {}) {
    this.body = body;
    this.provider = provider;
    this.name = name;
    this.cadence = cadence;
    this.memory = new Memory();
    this.goal = { kind: 'wander' };
    this.since = 0;
    this.thinking = false;
    this.decisions = 0;
    this.log = []; // every decision, for the determinism story below
    body.mind = this;
  }

  /**
   * Called every tick. Almost always does nothing, which is the point.
   *
   * Returns immediately whether or not a decision is in flight, so a slow
   * provider costs latency on the NEXT goal rather than a stalled body now.
   */
  update(dt, world, ctx) {
    this.since += dt;
    if (this.thinking || this.since < this.cadence) return;
    this.since = 0;
    this.deliberate(world, ctx);
  }

  /** Kick off one decision. Fire and forget. */
  deliberate(world, ctx) {
    let brief;
    try {
      brief = buildBrief(this.body, world, ctx);
    } catch (err) {
      // A mind that cannot perceive keeps doing whatever it was doing. There
      // is no version of this worth crashing a world over.
      this.lastError = err.message;
      return;
    }

    // Notice things worth remembering, whether or not the provider says
    // anything interesting about them. Memory is a property of having senses,
    // not of being clever.
    for (const c of brief.contacts) {
      this.memory.add(ctx.hours ?? 0, `${c.what} ${c.how} ${c.distance} to the ${c.where}`);
    }

    this.thinking = true;
    Promise.resolve(this.provider.decide(brief))
      .then((raw) => {
        const goal = sanitiseGoal(raw);
        if (!goal) return;
        const changed = goal.kind !== this.goal.kind;
        this.goal = goal;
        this.decisions++;
        // ── the determinism story ──
        // VISION.md: "Model output is not reproducible, so decisions are
        // written into the world's event log as intents. A replay reads the
        // log rather than re-asking the model, and stays exact."
        //
        // This is that log. Every decision is recorded with the tick it landed
        // on, so a run can be replayed by feeding these back in order instead
        // of calling out again — and the replay is exact even though the
        // original decisions were not reproducible.
        this.log.push({ t: ctx.tick ?? 0, h: +(ctx.hours ?? 0).toFixed(2), g: goal });
        if (this.log.length > MINDS.logSize) this.log.shift();
        if (changed && goal.kind !== 'say') {
          this.memory.add(ctx.hours ?? 0, `I decided to ${describeGoal(goal)}`);
        }
      })
      .catch((err) => {
        this.lastError = err.message;
      })
      .finally(() => {
        this.thinking = false;
      });
  }

  /** Replay: install a recorded decision instead of asking anyone. */
  replay(entry) {
    const goal = sanitiseGoal(entry.g);
    if (goal) this.goal = goal;
  }

  get status() {
    return {
      name: this.name,
      goal: describeGoal(this.goal),
      provider: this.provider.name,
      decisions: this.decisions,
      thinking: this.thinking,
      remembers: this.memory.entries.length,
      lastError: this.lastError ?? null,
    };
  }
}
