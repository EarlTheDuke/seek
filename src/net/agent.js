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
  constructor({ name, provider, rand, onLog = null }) {
    this.name = name;
    this.provider = provider;
    this.rand = rand;
    this.onLog = onLog;

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
    this.wanderAngle = rand() * Math.PI * 2;
    this.retarget = 0;
    this.target = null;
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
      this.ws.onopen = () => this.send(C_HELLO, { name: this.name, version: PROTOCOL_VERSION });
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
            this.yaw = msg.data.spawn?.y ?? 0;
            for (const p of msg.data.players) if (p.id !== this.id) this.others.set(p.id, p.n);
            resolve(this);
            break;
          }
          case S_SNAPSHOT:
            this.snapshot = msg.data;
            this.hours = msg.data.c ?? this.hours;
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

    for (const p of s.pl ?? []) {
      add(
        this.others.get(p.id) ?? 'someone',
        p.p[0], p.p[2],
        p.c ? 'crouched' : p.s > 5 ? 'running' : 'walking',
        p.x ? 'down' : p.h < 45 ? 'badly hurt' : 'unhurt'
      );
    }
    for (const c of s.cr ?? []) {
      add(`a ${c.k}`, c.p[0], c.p[2], c.s, c.h < 30 ? 'wounded' : 'unhurt');
    }
    contacts.sort((a, b) => a._m - b._m);

    return {
      // Named so `briefToText` produces the same shape of prose a creature's
      // brief does — an agent has less to say than a creature does, but what
      // it says must read the same way.
      place: this.where(),
      hour: `${String(Math.floor(s.c ?? 12)).padStart(2, '0')}:00`,
      light: (s.c ?? 12) > 20 || (s.c ?? 12) < 5 ? 'dark' : 'daylight',
      weather: s.w?.s ?? 'clear',
      wind: s.w?.a !== undefined ? bearingName(0, 0, Math.cos(s.w.a), Math.sin(s.w.a)) : null,
      goal: describeGoal(this.goal),
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

        if (goal.kind === 'say' && goal.text && this.hours - this.spoke > AGENTS.speakEveryHours) {
          this.spoke = this.hours;
          this.send(C_CHAT, { m: goal.text });
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

  resolve(g) {
    const s = this.snapshot;
    const find = (pred) => {
      for (const c of s?.cr ?? []) if (pred(`a ${c.k}`, c)) return { x: c.p[0], z: c.p[2] };
      for (const p of s?.pl ?? []) if (pred(this.others.get(p.id) ?? 'someone', p)) return { x: p.p[0], z: p.p[2] };
      return null;
    };
    switch (g.kind) {
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
