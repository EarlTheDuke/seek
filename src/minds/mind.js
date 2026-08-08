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
  /**
   * @param {object} opts
   * @param {boolean} opts.flat  one undifferentiated ring, recency only — the
   *   behaviour before 2026-08-08, kept so `MEMORY=flat` is an exact control
   *   arm rather than a description of one. Every claim about how much memory
   *   scaffolding is worth needs both arms of this switch.
   */
  constructor({ flat = false } = {}) {
    this.flat = flat;
    // The flat arm keeps using this and only this.
    this.entries = []; // { hour, text }
    // ── the two streams ──
    // `happened` is protected from `noticed` by construction: they are separate
    // arrays, so no amount of staring at deer can evict a trade. That is the
    // whole fix, and it is smaller than the comment explaining it.
    this.happened = []; // { hour, text, w, t }
    this.noticed = []; // { hour, text, t }
    // ── AN ABSOLUTE CLOCK, BUILT OUT OF A WRAPPING ONE ──
    //
    // `Agent.hours` is the world clock and it is `% 24`. Nothing built on it
    // can express "older than a day": twenty-four hours after an event, its
    // age computes as zero and it is young again for ever. `memcheck` caught
    // exactly that — a memory set to expire after 24 h never expired.
    //
    // So the wrap is detected here and turned into a monotonic hour. Any jump
    // BACKWARDS is midnight; anything else is time passing.
    //
    // The threshold is ONE HOUR and not twelve. Twelve was the first guess and
    // `memcheck` caught it: a clock stepping 12.0 -> 0.5 is plainly a wrap and
    // `hour < last - 12` reads it as time going forwards. One game-hour is
    // about 2.7 real seconds at `TIME.dayMinutes`, which is far larger than any
    // jitter an interpolated snapshot clock can produce and far smaller than
    // any real wrap, so it separates the two cleanly.
    //
    // This is the third time a `% 24` clock has bitten this project — see
    // `Agent.spoke`, which silenced a mind for a whole run, and `Memory.ageOf`.
    // Doing the conversion ONCE, here, is what stops there being a fourth.
    this._epoch = 0;
    this._lastHour = null;
  }

  /** The wrapping world clock, as a monotonic one. */
  _absolute(hour) {
    if (this._lastHour !== null && this._lastHour - hour > 1) this._epoch += 24;
    this._lastHour = hour;
    return this._epoch + hour;
  }

  /**
   * @param {number} hour
   * @param {string} text
   * @param {number} w  importance, out of `MINDS.weight`. DEFAULTS TO `event`,
   *   not to `sighting`: an unweighted event scored as a sighting is precisely
   *   the bug this exists to kill, so an un-updated call site fails toward
   *   being remembered. Only the two perception sites pass `sighting`.
   */
  add(hour, text, w = MINDS.weight.event) {
    // Never the same thing twice in a row — a mind that saw one deer six times
    // should not remember six deer. Per-stream, so a sighting cannot suppress
    // an event that happens to read the same.
    if (this.flat) {
      if (this.entries.at(-1)?.text === text) return;
      this.entries.push({ hour, text });
      if (this.entries.length > MINDS.memorySize) this.entries.shift();
      return;
    }
    const t = this._absolute(hour);
    if (w <= MINDS.weight.sighting) {
      if (this.noticed.at(-1)?.text === text) return;
      this.noticed.push({ hour, text, t });
      if (this.noticed.length > MINDS.noticedKept) this.noticed.shift();
      return;
    }
    if (this.happened.at(-1)?.text === text) return;
    this.happened.push({ hour, text, w, t });
    // ── EVICT THE LEAST IMPORTANT, NOT THE OLDEST ──
    //
    // `shift()` was wrong and `memcheck` caught it: sixty small events pushed a
    // weight-9 "somebody shot me" straight out of the ring, so retrieval never
    // got the chance to score it. Weighting retrieval while evicting by age
    // means importance only decides among memories that survived a queue —
    // which is the same bug as before wearing a smaller hat.
    //
    // Ties break on the oldest, so a stream of equal-weight entries still
    // behaves exactly like the queue it replaces.
    if (this.happened.length > MINDS.eventsKept) {
      let worst = 0;
      for (let i = 1; i < this.happened.length; i++) {
        const a = this.happened[i], b = this.happened[worst];
        if (a.w < b.w || (a.w === b.w && a.t < b.t)) worst = i;
      }
      this.happened.splice(worst, 1);
    }
  }

  /**
   * How long ago, on the monotonic clock.
   *
   * Kept as a static for the checks, which want to assert the arithmetic
   * directly. Negative ages are clamped: a stamp fractionally ahead of the
   * query is a rounding artefact, not a memory from the future.
   */
  static ageOf(now, then) {
    return Math.max(0, now - then);
  }

  /**
   * What a decision is handed.
   *
   * Events first, scored by `importance × 0.5^(age / halfLife)` so that being
   * shot outranks a decision outranks a sighting until it is genuinely stale —
   * then a few of the most recent sightings for situational sense. Newest-first
   * within each group, because that is how the prose reads.
   */
  recent(hour, withinHours = MINDS.memoryHours) {
    if (this.flat) {
      // The ORIGINAL arithmetic, on purpose — a plain `hour - e.hour` against
      // the wrapping clock, negative across midnight and all. The control arm
      // has to be the old behaviour exactly, including its bugs, or an A/B
      // measures the difference between two new things.
      return this.entries
        .filter((e) => hour - e.hour <= withinHours)
        .slice(-MINDS.memoryRecall)
        .reverse()
        .map((e) => e.text);
    }
    const now = this._absolute(hour);
    const scored = this.happened
      .map((e) => {
        const age = Memory.ageOf(now, e.t);
        return { ...e, age, score: e.w * Math.pow(0.5, age / MINDS.memoryHalfLife) };
      })
      .filter((e) => e.age <= withinHours)
      // Score descending, and NEWEST first on a tie — otherwise two events of
      // equal weight are ordered by insertion, which reads as random.
      .sort((a, b) => b.score - a.score || a.age - b.age)
      .slice(0, MINDS.eventsRecalled)
      // Presented in the order they happened, oldest first: a model reading
      // "I offered wood / I decided to hunt" backwards infers the wrong
      // sequence, and sequence is the entire value of an event stream.
      .sort((a, b) => b.age - a.age)
      .map((e) => e.text);

    const seen = this.noticed
      .filter((e) => Memory.ageOf(now, e.t) <= withinHours)
      .slice(-MINDS.noticedRecalled)
      .reverse()
      .map((e) => e.text);

    return [...scored, ...seen];
  }

  /**
   * Everything held, whichever arm is running, oldest first.
   *
   * Exists for the checks. Two of them read `memory.entries` directly and went
   * red the moment there were two streams — not because anything had broken but
   * because they were asserting against a private field. A check that knows
   * which arm it is in is testing the implementation; this lets it ask the
   * question it actually means, which is "does this mind hold that thought".
   */
  all() {
    return this.flat
      ? this.entries.slice()
      : [...this.happened, ...this.noticed].sort((a, b) => a.t - b.t);
  }

  serialise() {
    return this.flat
      ? this.entries
      : { happened: this.happened, noticed: this.noticed };
  }

  restore(data) {
    // Tolerates both shapes, so a save written by either arm loads in either.
    // `t` is filled in from `hour` where it is absent — an old save has no
    // monotonic stamp, and treating its entries as same-day is the only honest
    // reading of a clock that never recorded which day it was.
    const stamp = (e) => ({ ...e, t: e.t ?? e.hour ?? 0 });
    if (Array.isArray(data)) {
      this.entries = data.slice(-MINDS.memorySize);
      // An old flat save restored into a split memory is better treated as
      // events than thrown away — it is the decision log that mattered.
      if (!this.flat) {
        this.happened = data.slice(-MINDS.eventsKept)
          .map((e) => stamp({ ...e, w: e.w ?? MINDS.weight.event }));
      }
    } else {
      this.happened = (data?.happened ?? []).slice(-MINDS.eventsKept).map(stamp);
      this.noticed = (data?.noticed ?? []).slice(-MINDS.noticedKept).map(stamp);
    }
    // Restart the clock past the newest thing restored, so a reloaded mind does
    // not read its own saved memories as arriving from the future.
    const newest = Math.max(0, ...this.happened.map((e) => e.t), ...this.noticed.map((e) => e.t));
    this._epoch = Math.floor(newest / 24) * 24;
    this._lastHour = null;
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
