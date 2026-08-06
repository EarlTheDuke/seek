// ── agent.js ────────────────────────────────────────────────────────────────
// A player that is not a person.
//
// One class: a real WebSocket client, holding a real socket, sending real
// intents. The server cannot tell it from you, and that is not a trick — it is
// the whole architecture arriving at its destination. Phase 1 made all player
// action an intent; Phase 5 made intents the only thing that crosses the wire;
// Phase 8 made a Mind another intent producer. This is those three facts in one
// file, and it is short because of it.
//
// THE SHAPE, from VISION.md §6b, unchanged:
//
//   REFLEX        every tick        aiming, footwork, not walking into a lake
//   DELIBERATION  every few seconds where to go, what to hunt, what to say
//
// The model never drives a body. It sets a goal; the reflex layer carries it
// out; and if the model is slow, absent, broken or expensive, the agent goes on
// behaving like a competent person doing the last sensible thing it was told.
//
// WHAT AN AGENT KNOWS is only what its snapshots contain — the same interpolated
// view a human client renders. It has no privileged access to the world, cannot
// see through hills, and does not know where anything is that the server has not
// told it about. That is the honesty rule surviving the jump from a creature in
// the sim to a client on a socket, and it is the reason these are worth having
// as opponents rather than as scenery.

import {
  PROTOCOL_VERSION,
  C_HELLO,
  C_INTENT,
  C_CHAT,
  C_PING,
  S_WELCOME,
  S_SNAPSHOT,
  S_CHAT,
  S_JOIN,
  S_LEAVE,
  S_ERROR,
  encode,
  decode,
} from './protocol.js';
import { createIntent } from '../sim/intents.js';
import { sanitiseGoal, describeGoal, GOAL_IDS } from '../minds/goals.js';
import { Memory } from '../minds/mind.js';
import { nearestDeadfall } from '../world/pickups.js';
// For `guard`: what counts as a threat is read off the species table rather
// than listed here, so a wolf added later is guarded against without an edit.
import { SPECIES } from '../creatures/registry.js';
import { bearingName, describePosition } from '../world/placenames.js';
import { AGENTS } from '../config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Agent {
  /**
   * @param {object} opts
   * @param {string} opts.name
   * @param {object} opts.provider  anything with decide(brief) -> goal
   * @param {function} opts.rand    seeded, for the reflex layer's jitter
   */
  /**
   * @param {object} o
   * @param {'decides'|'obeys'} [o.orders]  what a plain instruction does
   *
   * TWO WAYS TO BE COMMANDED, and the default is the interesting one.
   *
   *   'decides' — a sentence you say is PERCEPTION. It arrives in the brief as
   *     "You have heard: Ben: keep back and shoot it" and the mind does
   *     whatever it thinks best, which may be to ignore you. This is the
   *     honesty rule applied to language: a mind acts on what it perceives, and
   *     speech is a thing you perceive. A frightened companion can reasonably
   *     refuse, and that makes it company rather than a drone.
   *
   *   'obeys' — a recognised instruction is parsed straight into a goal without
   *     consulting the mind at all. Deterministic, free, and the right choice
   *     when you are testing whether a fight is winnable rather than whether a
   *     companion is interesting.
   *
   * Both exist because they answer different questions and the author wanted
   * the option. Neither is a fallback for the other.
   */
  constructor({ name, provider, rand, onLog = null, orders = 'decides', pet = null }) {
    this.name = name;
    this.provider = provider;
    this.rand = rand;
    this.onLog = onLog;
    this.orders = orders;
    // An animal at its heel, if it was given one. The agent's mind knows
    // nothing about it — it is the server's copy that walks, and this is here
    // so a fleet can be watched with something at its side.
    this.pet = pet;

    this.id = null;
    this.seed = null;
    this.connected = false;
    this.intent = createIntent();
    this.snapshot = null;
    this.others = new Map();
    this.heard = [];

    this.memory = new Memory();
    this.goal = { kind: 'wander' };
    this.since = 0;
    this.thinking = false;
    this.decisions = 0;
    this.log = [];
    // What a session report is built out of — see server/playreport.js.
    this.goalCounts = {};
    // Times it actually reached for something, by intent field. Counted where
    // the key is pressed rather than where the goal is chosen, because those
    // are very different numbers: deciding to gather and arriving at a branch
    // are separated by a walk that may not finish.
    this.acted = {};
    this.said = [];
    this.startX = 0;
    this.startZ = 0;
    this.wanderAngle = rand() * Math.PI * 2;
    this.retarget = 0;
    this.target = null;
    // ── what we have already carried away ──
    // Deadfall is a pure function of the seed, so `nearestDeadfall` will happily
    // name the same branch for ever. A `Pickups` instance remembers what it has
    // collected; an agent has no `Pickups`, so it remembers here. Without this
    // the `gather` goal walks two metres, presses E, and never moves again.
    this.taken = new Set();
    this.hours = 0;
    this.spoke = -999;
    this.tokensIn = 0;
    this.tokensOut = 0;
  }

  // ── the wire ──────────────────────────────────────────────────────────────

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      const fail = (e) => reject(new Error(`${this.name}: ${e?.message ?? 'socket error'}`));
      this.ws.onerror = fail;
      this.ws.onopen = () =>
        this.send(C_HELLO, { name: this.name, version: PROTOCOL_VERSION, pet: this.pet ?? undefined });
      this.ws.onclose = () => {
        this.connected = false;
      };
      this.ws.onmessage = (ev) => {
        const msg = decode(ev.data);
        if (!msg) return;
        switch (msg.type) {
          case S_WELCOME: {
            this.id = msg.data.id;
            this.seed = msg.data.seed;
            this.connected = true;
            // ── where it thinks it is ──
            // The server never sends you your own position (you are expected
            // to know it), so an agent navigates by dead reckoning — and it
            // has to START from somewhere true. Left at the origin it thought
            // it was at (0, 0) while standing on the shore, so every goal it
            // set was already behind it and it barely moved.
            const sp = msg.data.spawn?.p;
            this._x = sp ? sp[0] : 0;
            this._z = sp ? sp[2] : 0;
            // Remembered so a report can say how far they actually got. An
            // agent that decided forty times and moved nine metres is the
            // single loudest signal a session produces.
            this.startX = this._x;
            this.startZ = this._z;
            this.yaw = msg.data.spawn?.y ?? 0;
            for (const p of msg.data.players) if (p.id !== this.id) this.others.set(p.id, p.n);
            resolve(this);
            break;
          }
          case S_SNAPSHOT:
            this.snapshot = msg.data;
            this.hours = msg.data.c ?? this.hours;
            // ── the server knows better ──
            // Dead reckoning between snapshots is fine; dead reckoning FOREVER
            // is what put a puppet 8 km from where it stood inside a minute,
            // after which it perceived nothing at all because every contact is
            // measured from here. Snap to the truth whenever it arrives.
            if (msg.data.me) {
              this._x = msg.data.me.p[0];
              this._z = msg.data.me.p[2];
              // Heading too. Position without facing is half a fix: a body that
              // integrates its own yaw against a server integrating it
              // differently walks confidently in the wrong direction.
              if (msg.data.me.y !== undefined) this.yaw = msg.data.me.y;
              this.health = msg.data.me.h;
              this.food = msg.data.me.f;
              this.coreC = msg.data.me.c;
            }
            break;
          case S_JOIN:
            this.others.set(msg.data.id, msg.data.n);
            break;
          case S_LEAVE:
            this.others.delete(msg.data.id);
            break;
          case S_CHAT:
            if (msg.data.id === this.id) break; // it does not need to hear itself
            this.heard.push(`${msg.data.n}: ${msg.data.m}`);
            if (this.heard.length > 6) this.heard.shift();
            // In 'obeys' mode a recognised instruction becomes a goal here and
            // now, without waiting for the next deliberation — which may be
            // seconds away and may cost a model call. In 'decides' mode this
            // does nothing at all and the sentence simply travels on into the
            // brief, which is the whole point of the mode.
            if (this.orders === 'obeys') this.takeOrder(msg.data.n, msg.data.m);
            this.memory.add(this.hours, `${msg.data.n} said "${msg.data.m}"`);
            break;
          case S_ERROR:
            this.onLog?.(`${this.name}: server says ${msg.data.m}`);
            break;
        }
      };
    });
  }

  send(type, data) {
    if (this.ws?.readyState === 1) this.ws.send(encode(type, data));
  }

  close() {
    this.ws?.close();
  }

  // ── the tick ──────────────────────────────────────────────────────────────

  update(dt) {
    if (!this.connected || !this.snapshot) return;
    this.since += dt;
    if (!this.thinking && this.since >= AGENTS.cadenceSeconds) {
      this.since = 0;
      this.deliberate();
    }
    this.act(dt);
    this.send(C_INTENT, { i: this.intent });
  }

  /**
   * What this agent can actually perceive, in words.
   *
   * Built ONLY from the last snapshot — which is the interpolated public view
   * every client gets, and contains nothing a human player could not see. An
   * agent that read the server's world directly would be a cheat wearing a
   * costume, and would also be useless as a test of whether the game is fair.
   */
  brief() {
    const s = this.snapshot;
    const me = { x: 0, z: 0 }; // the server omits you from your own snapshot
    const contacts = [];

    // `where` is the compass bearing, and it is not optional: without it every
    // contact read "a little way off to the undefined", which is both useless
    // to a model and the single most obvious sign nobody had read the output.
    const add = (what, x, z, doing, condition) => {
      const d = Math.hypot(x - this.x, z - this.z);
      if (d > AGENTS.noticeRange) return;
      contacts.push({
        what,
        how: 'seen',
        where: bearingName(this.x, this.z, x, z),
        distance: howFar(d),
        doing,
        condition,
        _m: d,
      });
    };

    // `s?.` and not `s.` — a mind can deliberate before its first snapshot
    // lands, and a brief that throws does not fail loudly: it lands in the
    // provider's catch and the agent silently falls back to its scripted brain
    // for ever. That exact shape has already cost this project a night, when
    // briefToText read a field an agent's brief does not have and every
    // model-driven player quietly never called the model once.
    for (const p of s?.pl ?? []) {
      add(
        this.others.get(p.id) ?? 'someone',
        p.p[0], p.p[2],
        p.c ? 'crouched' : p.s > 5 ? 'running' : 'walking',
        p.x ? 'down' : p.h < 45 ? 'badly hurt' : 'unhurt'
      );
    }
    for (const c of s?.cr ?? []) {
      add(`a ${c.k}`, c.p[0], c.p[2], c.s, c.h < 30 ? 'wounded' : 'unhurt');
    }
    contacts.sort((a, b) => a._m - b._m);

    return {
      // Named so `briefToText` produces the same shape of prose a creature's
      // brief does — an agent has less to say than a creature does, but what
      // it says must read the same way.
      place: this.where(),
      hour: `${String(Math.floor(s?.c ?? 12)).padStart(2, '0')}:00`,
      light: (s?.c ?? 12) > 20 || (s?.c ?? 12) < 5 ? 'dark' : 'daylight',
      weather: s?.w?.s ?? 'clear',
      wind: s?.w?.a !== undefined ? bearingName(0, 0, Math.cos(s.w.a), Math.sin(s.w.a)) : null,
      goal: describeGoal(this.goal),
      // ── how you are ──
      // In words, like everything else a mind is told. A companion that cannot
      // tell it is nearly dead cannot decide to retreat, and "retreat when
      // hurt, and say so" is the single most useful thing a companion does.
      // These were simply absent before, so no mind has ever been able to
      // reason about its own body at all.
      health: this.health === undefined ? 'unhurt'
        : this.health < 30 ? 'nearly finished'
        : this.health < 60 ? 'badly hurt'
        : this.health < 90 ? 'hurt' : 'unhurt',
      hunger: this.food === undefined ? 'fed'
        : this.food <= 0 ? 'starving'
        : this.food < 25 ? 'hungry' : 'fed',
      cold: this.coreC === undefined ? 'warm enough'
        : this.coreC < 33 ? 'freezing to death'
        : this.coreC < 34.5 ? 'badly chilled'
        : this.coreC < 35.6 ? 'shivering' : 'warm enough',
      contacts: contacts.slice(0, AGENTS.maxContacts).map(({ _m, ...r }) => r),
      heard: this.heard.slice(-3),
      memory: this.memory.recent(this.hours),
      carrying: [],
      _contacts: contacts,
    };
  }

  /** Where the agent thinks it is. Tracked by dead reckoning from its intent. */
  get x() {
    return this._x ?? 0;
  }
  get z() {
    return this._z ?? 0;
  }

  /**
   * Where it thinks it is, in words.
   *
   * The place-name layer is a pure function of the seed, and an agent knows the
   * seed — so it can name its own district without the server telling it, which
   * is exactly what a human player's client does.
   */
  where() {
    try {
      return describePosition(this.x, this.z).phrase;
    } catch {
      return null;
    }
  }

  deliberate() {
    let brief;
    try {
      brief = this.brief();
    } catch (err) {
      this.lastError = err.message;
      return;
    }
    for (const c of brief.contacts) {
      this.memory.add(this.hours, `${c.what} ${c.distance}, ${c.doing}`);
    }

    this.thinking = true;
    Promise.resolve(this.provider.decide(brief))
      .then((raw) => {
        const goal = sanitiseGoal(raw);
        if (!goal) return;
        const changed = goal.kind !== this.goal.kind;
        this.goal = goal;
        this.decisions++;
        this.tokensIn += this.provider.lastTokensIn ?? 0;
        this.tokensOut += this.provider.lastTokensOut ?? 0;
        // The replay log. Model output is not reproducible, so a run is
        // repeated by feeding these back rather than by asking again.
        this.log.push({ t: this.snapshot?.t ?? 0, h: +this.hours.toFixed(2), g: goal });
        if (this.log.length > AGENTS.logSize) this.log.shift();
        // Counted separately from the log, because the log is a ring buffer.
        // Tallying goals out of it would silently undercount exactly the long
        // runs worth reporting on, and "nobody ever made camp" has to mean
        // nobody ever made camp rather than nobody made camp recently.
        this.goalCounts[goal.kind] = (this.goalCounts[goal.kind] ?? 0) + 1;

        if (goal.kind === 'say' && goal.text && this.hours - this.spoke > AGENTS.speakEveryHours) {
          this.spoke = this.hours;
          this.send(C_CHAT, { m: goal.text });
          // Kept because it is the only unprompted sentence anybody in this
          // world produces — the closest thing to a player telling you
          // something in their own words.
          this.said.push(goal.text);
          this.goal = { kind: 'wander' };
        } else if (changed) {
          this.memory.add(this.hours, `I decided to ${describeGoal(goal)}`);
          this.onLog?.(`${this.name}: ${describeGoal(goal)}`);
        }
      })
      .catch((err) => {
        this.lastError = err.message;
      })
      .finally(() => {
        this.thinking = false;
      });
  }

  /**
   * The reflex layer: turn a standing goal into this tick's intent.
   *
   * Deliberately dumb, and deliberately never blocked on the model. Dead
   * reckoning tracks position from the intent, because the server does not send
   * you your own coordinates — you are expected to know where you are, which is
   * exactly what a human client does too.
   */
  act(dt) {
    const i = this.intent;
    i.interact = i.drop = i.place = i.eat = i.jump = false;

    // SAY WHERE WE ARE POINTING, not just how far we turned.
    //
    // An agent is a network client like any other, so its `lookYaw` deltas were
    // rate-limited on the way out and the server integrated a fraction of them
    // — the agent believed it was facing its quarry while the server had it
    // looking somewhere else entirely. `this.yaw` is the agent's own honest
    // answer and it is already tracked below, so stating it costs nothing and
    // makes every model-driven player able to aim. See `intents.js`.
    i.aimYaw = this.yaw;

    this._x ??= 0;
    this._z ??= 0;

    const g = this.goal;
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = AGENTS.retargetSeconds;
      this.target = this.resolve(g);
    }

    if (g.kind === 'hold') {
      i.forward = 0;
      i.sprint = i.crouch = false;
      this.trackSelf(dt, 0);
      return;
    }

    if (this.target) {
      const dx = this.target.x - this._x;
      const dz = this.target.z - this._z;
      const dist = Math.hypot(dx, dz);
      if (dist > AGENTS.arriveWithin) {
        const want = Math.atan2(-dx, -dz);
        let diff = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        i.lookYaw = -clamp(diff, -AGENTS.turnRate * dt, AGENTS.turnRate * dt);
        this.yaw += clamp(diff, -AGENTS.turnRate * dt, AGENTS.turnRate * dt);
        i.forward = 1;
        i.sprint = g.kind === 'avoid' && dist < 45;
        i.crouch = g.kind === 'hunt' && dist < AGENTS.stalkWithin;
      } else {
        i.forward = 0;
        // ── arrived, so use your hands ──
        // Pulsed for exactly one tick, because `interact` is edge-detected on
        // the server and a held key would collect on every frame you stood
        // there. Cleared at the top of act(), so it is false again next tick
        // without anything having to remember to unset it.
        if (this.target.act) {
          i[this.target.act] = true;
          this.acted[this.target.act] = (this.acted[this.target.act] ?? 0) + 1;
          // Reached it and used our hands on it, so stop being offered it.
          if (this.target.key) this.taken.add(this.target.key);
        }
        this.target = null;
      }
    } else {
      i.forward = 0;
    }

    this.trackSelf(dt, i.forward ? (i.sprint ? 8.4 : 4.1) * (i.crouch ? 0.5 : 1) : 0);
  }

  /** Dead reckoning. Good enough to navigate by; the server is still the truth. */
  trackSelf(dt, speed) {
    this.yaw ??= 0;
    this._x -= Math.sin(this.yaw) * speed * dt;
    this._z -= Math.cos(this.yaw) * speed * dt;
  }

  /**
   * Turn a sentence into a goal, for 'obeys' mode.
   *
   * Deliberately a SMALL vocabulary of plain phrasings rather than anything
   * clever. This is the deterministic path — its whole value is that it does
   * exactly the same thing every time and costs nothing — and a fuzzy matcher
   * that guesses wrong is worse than one that plainly does not understand.
   * Anything it does not recognise falls through to the mind, which is the
   * 'decides' behaviour, so nothing is ever swallowed.
   *
   * @returns {boolean} whether it took the order
   */
  takeOrder(from, text) {
    const t = String(text).toLowerCase();
    // "follow me", "stay with me", "with me"
    if (/\b(follow|stay with|come with|with) me\b/.test(t)) {
      this.setOrder({ kind: 'follow', target: from });
      return true;
    }
    // "guard me", "cover me", "watch my back"
    if (/\b(guard|cover|protect) me\b|\bwatch my back\b/.test(t)) {
      this.setOrder({ kind: 'guard', target: from });
      return true;
    }
    // "wait", "hold", "stay here", "stop"
    if (/\b(wait|hold|stay here|stop|hold position)\b/.test(t)) {
      this.setOrder({ kind: 'hold' });
      return true;
    }
    // "kill the troll", "attack the bear", "shoot the deer"
    const quarry = /\b(kill|attack|shoot|hunt)\s+(?:the\s+|that\s+|a\s+)?(\w+)/.exec(t);
    if (quarry) {
      this.setOrder({ kind: 'hunt', quarry: `a ${quarry[2]}` });
      return true;
    }
    // "go on", "carry on", "as you were" — hands them back to themselves
    if (/\b(carry on|go on|as you were|free|do what you like)\b/.test(t)) {
      this.setOrder({ kind: 'wander' });
      return true;
    }
    return false;
  }

  setOrder(goal) {
    this.goal = goal;
    this.goalCounts[goal.kind] = (this.goalCounts[goal.kind] ?? 0) + 1;
    this.ordered = true;
    this.memory.add(this.hours, `I was told to ${describeGoal(goal)}`);
    this.onLog?.(`${this.name}: ${describeGoal(goal)} (ordered)`);
  }

  resolve(g) {
    const s = this.snapshot;
    const find = (pred) => {
      for (const c of s?.cr ?? []) if (pred(`a ${c.k}`, c)) return { x: c.p[0], z: c.p[2] };
      for (const p of s?.pl ?? []) if (pred(this.others.get(p.id) ?? 'someone', p)) return { x: p.p[0], z: p.p[2] };
      return null;
    };
    switch (g.kind) {
      // Walk to the nearest branch and PRESS E when you get there.
      //
      // The snapshot carries players, creatures and arrows — no pickups, and it
      // never will, because deadfall is a pure function of the seed and both
      // ends compute it rather than shipping it. That is the same trick the
      // terrain and the place names already use, and it is why an agent can
      // walk to a branch it was never told about. See world/pickups.js.
      case 'gather': {
        const wood = nearestDeadfall(this._x, this._z, undefined, this.taken);
        return wood ? { x: wood.x, z: wood.z, key: wood.key, act: 'interact' } : this.roam();
      }
      // Camp is a place with fuel in reach, so this is gather with a reason.
      // It used to fall through to `roam()` — which meant an agent that decided
      // to make camp did precisely what an agent that decided to wander did,
      // and the report counted it as a distinct activity. It was not one.
      case 'makeCamp': {
        const wood = nearestDeadfall(this._x, this._z, 60, this.taken);
        return wood ? { x: wood.x, z: wood.z, key: wood.key, act: 'interact' } : this.roam();
      }
      // ── standing orders ──
      // Both resolve to "be near them", and the difference is what happens when
      // something attacks: `guard` breaks off to deal with it (see update()),
      // `follow` does not. Keeping a respectful distance rather than standing
      // in their pocket — a companion that walks into your back while you draw
      // is worse company than one twelve metres away.
      case 'follow':
      case 'guard': {
        const who = find((label) => label === (g.target ?? ''));
        if (!who) return this.roam();

        // Guarding means watching THEM, not waiting to be told. An agent gets
        // senses, not events — there is no "so-and-so was attacked" message on
        // the wire and there should not be — so it looks for something hostile
        // standing near the person it is minding, exactly as you would.
        //
        // Hostility is read off the registry rather than a list here, so a wolf
        // added to the species table is guarded against for free.
        if (g.kind === 'guard') {
          let threat = null;
          let nearest = AGENTS.guardRange;
          for (const c of s?.cr ?? []) {
            if (SPECIES[c.k]?.faction === 'prey') continue;
            const d = Math.hypot(c.p[0] - who.x, c.p[2] - who.z);
            if (d < nearest) {
              nearest = d;
              threat = { x: c.p[0], z: c.p[2] };
            }
          }
          if (threat) return threat;
        }

        const dx = who.x - this._x;
        const dz = who.z - this._z;
        const d = Math.hypot(dx, dz) || 1;
        if (d < AGENTS.followWithin) return null; // close enough; hold station
        return { x: who.x - (dx / d) * AGENTS.followWithin, z: who.z - (dz / d) * AGENTS.followWithin };
      }
      case 'hunt':
        return find((label) => label === (g.quarry ?? '')) ?? this.roam();
      case 'approach':
        return find((label) => label === (g.target ?? '')) ?? this.roam();
      case 'avoid': {
        const from = find((label) => label === (g.target ?? ''));
        if (!from) return this.roam();
        const dx = this._x - from.x;
        const dz = this._z - from.z;
        const len = Math.hypot(dx, dz) || 1;
        return { x: this._x + (dx / len) * 70, z: this._z + (dz / len) * 70 };
      }
      case 'hold':
        return null;
      default:
        return this.roam();
    }
  }

  roam() {
    this.wanderAngle += (this.rand() - 0.5) * 1.2;
    return {
      x: this._x + Math.cos(this.wanderAngle) * AGENTS.roamDistance,
      z: this._z + Math.sin(this.wanderAngle) * AGENTS.roamDistance,
    };
  }

  get status() {
    return {
      name: this.name,
      id: this.id,
      provider: this.provider.name,
      goal: describeGoal(this.goal),
      decisions: this.decisions,
      remembers: this.memory.entries.length,
      others: this.others.size,
      thinking: this.thinking,
      lastError: this.lastError ?? null,
      tokens: this.tokensIn + this.tokensOut,
    };
  }
}

function howFar(d) {
  if (d < 6) return 'right here';
  if (d < 20) return 'close';
  if (d < 55) return 'a little way off';
  if (d < 130) return 'far off';
  return 'a long way off';
}
