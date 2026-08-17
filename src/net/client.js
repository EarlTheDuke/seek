// ── client.js ───────────────────────────────────────────────────────────────
// The browser's end of the wire.
//
// Deliberately dumb. It sends what the player wants and draws what it is told,
// and it never argues: the server owns the world. That is the boring choice and
// it is the right one — every cheat-resistant multiplayer game ever shipped
// works this way, and the alternative (trusting clients about their own
// position) is unfixable once it is in.
//
// The one concession to feeling good is INTERPOLATION. Snapshots arrive 20
// times a second and the screen redraws 60+; drawing the newest snapshot
// directly would make everyone else move in visible steps. So remote players
// and creatures are drawn a fixed fraction of a second in the past, smoothly
// between the two snapshots that bracket that moment. You are seeing a
// truthful past rather than a guessed present, which is the honest trade.

import {
  PROTOCOL_VERSION,
  C_HELLO,
  C_INTENT,
  C_PING,
  C_CHAT,
  C_PET,
  C_FIRE,
  S_WELCOME,
  S_SNAPSHOT,
  S_JOIN,
  S_LEAVE,
  S_PONG,
  S_CHAT,
  S_ERROR,
  encode,
  decode,
} from './protocol.js';
import { NET } from '../config.js';

// ── THE PULSE FIELDS ────────────────────────────────────────────────────────
//
// Every intent field that a keypress sets for ONE frame and `PlayerInput.poll`
// then clears. Split by how you merge two of them, because the answer differs:
//
//   BOOL — "it happened". Two presses between packets collapse into one, and
//          that is a real loss, but the server edge-detects these anyway so a
//          second press inside a 33 ms window was never going to be two acts.
//   LAST — "this one, not that one". A player who presses 3 then 4 meant 4.
//          Empty string / -1 / 0 mean "not set", which is why they are grouped
//          by their sentinel rather than by their type.
//
// THIS LIST IS AN ALLOW-LIST TOO, and it has the same trap as INTENT_KEYS: a
// pulse field added to the protocol and forgotten here is silently back in the
// hole, losing two presses in three, and everything in-process still passes.
// The pairing is asserted from the source in `pulsecheck`.
const PULSE_BOOL = ['interact', 'drop', 'dropHalf', 'place', 'eat', 'letdown'];
const PULSE_TEXT = ['craft', 'give', 'giveItem', 'offer', 'offerItem', 'offerWant', 'accept'];
const PULSE_NUM = ['giveCount', 'dropBurn']; // 0 means "not set"
const PULSE_SLOT = 'selectSlot'; // -1 means "no change"

/** A fresh, empty set of held pulses. */
export function noPulses() {
  const p = {};
  for (const k of PULSE_BOOL) p[k] = false;
  for (const k of PULSE_TEXT) p[k] = '';
  for (const k of PULSE_NUM) p[k] = 0;
  p[PULSE_SLOT] = -1;
  return p;
}

/** Remember what this frame asked for, because its packet is not going out. */
export function latchPulses(held, intent) {
  for (const k of PULSE_BOOL) if (intent[k]) held[k] = true;
  for (const k of PULSE_TEXT) if (intent[k]) held[k] = intent[k];
  for (const k of PULSE_NUM) if (intent[k]) held[k] = intent[k];
  if (intent[PULSE_SLOT] >= 0) held[PULSE_SLOT] = intent[PULSE_SLOT];
  return held;
}

/**
 * Fold everything held since the last packet into the one going out now, and
 * forget it. Mutates `intent`, which is the frame-local `PlayerInput` reuses
 * and clears at the top of the next poll — so there is nothing to preserve.
 *
 * The frame's OWN value wins where both are set: it is the more recent press.
 */
export function spendPulses(held, intent) {
  for (const k of PULSE_BOOL) {
    if (held[k]) { intent[k] = true; held[k] = false; }
  }
  for (const k of PULSE_TEXT) {
    if (held[k]) { if (!intent[k]) intent[k] = held[k]; held[k] = ''; }
  }
  for (const k of PULSE_NUM) {
    if (held[k]) { if (!intent[k]) intent[k] = held[k]; held[k] = 0; }
  }
  if (held[PULSE_SLOT] >= 0) {
    if (!(intent[PULSE_SLOT] >= 0)) intent[PULSE_SLOT] = held[PULSE_SLOT];
    held[PULSE_SLOT] = -1;
  }
  return intent;
}

/** For `pulsecheck`, so the list above can be audited against the protocol. */
export const PULSE_FIELDS = [...PULSE_BOOL, ...PULSE_TEXT, ...PULSE_NUM, PULSE_SLOT];

export class NetClient {
  constructor({ onWelcome, onChat, onError, onStatus, onEvent, onSnapshot } = {}) {
    this.ws = null;
    this.id = null;
    this.seed = null;
    this.connected = false;
    this.others = new Map(); // id -> { id, name }
    this.buffer = []; // recent snapshots, oldest first
    this.ping = 0;
    this.lastSent = 0;
    // What a keypress asked for while the rate limiter was between packets.
    // See the long note on `sendIntent`.
    this.pulses = noPulses();
    this.onWelcome = onWelcome;
    this.onChat = onChat;
    this.onEvent = onEvent;
    this.onSnapshot = onSnapshot;
    this.onError = onError;
    this.onStatus = onStatus;
  }

  connect(url, name, pet = null, watching = false) {
    this.pet = pet;
    this.watching = !!watching;
    this.status('connecting');
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.status('failed');
      this.onError?.(err.message);
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      // The animal you walked in with. Said once, on the way in: the server
      // makes its own copy of it and everybody else's snapshots carry it from
      // then on. Before this, a companion was a thing only its owner could see.
      // ── AND WHETHER YOU CAME TO PLAY OR TO LOOK ──
      //
      // `?watch=1` has always stopped this end SENDING. It never told the
      // server, which went on holding a body for you at the spawn: freezing,
      // starving, and — the half that actually mattered — visible to every
      // mind in the world through `perceivableBy`. Models walked over to it,
      // hailed it, and waited. One word on the way in, and the server leaves
      // it out of the world instead.
      this.send(C_HELLO, {
        name, version: PROTOCOL_VERSION, pet: this.pet ?? undefined,
        ...(this.watching ? { w: true } : {}),
      });
      this.pingTimer = setInterval(() => this.send(C_PING, { t: performance.now() }), 2000);
    };

    this.ws.onmessage = (ev) => {
      const msg = decode(ev.data);
      if (!msg) return;
      switch (msg.type) {
        case S_WELCOME:
          this.id = msg.data.id;
          this.seed = msg.data.seed;
          // Normalised to { id, name }. The welcome sends `{ id, n }` on the
          // wire and S_JOIN sends the same, but this map is read by game code
          // rather than protocol code — storing the raw wire shape here meant
          // players known from the welcome had `.name` undefined while players
          // who joined later did not, so the roster showed nulls for whoever
          // was already in the world.
          for (const p of msg.data.players) {
            if (p.id !== this.id) this.others.set(p.id, { id: p.id, name: p.n });
          }
          this.status('connected');
          this.onWelcome?.(msg.data);
          break;

        case S_SNAPSHOT:
          // Stamped with local arrival time, because that is what the
          // interpolator needs — the server's tick number tells us the order
          // but not how long ago we heard it.
          this.buffer.push({ at: performance.now(), snap: msg.data });
          // ── things that HAPPENED ──
          // The server has always pushed deaths, hits and glances into `ev` and
          // the client has never read one. So an arrow that struck somebody, or
          // glanced off because the ground was too settled to fight on, was
          // indistinguishable from an arrow that passed through them: the world
          // knew, said so, and nobody was listening.
          //
          // Delivered as they arrive rather than through the interpolation
          // buffer — an event is a fact about the past, not a thing to draw
          // 110 ms late.
          for (const e of msg.data.ev ?? []) this.onEvent?.(e);
          // ── things that are TRUE OF YOU ──
          // Delivered raw and immediately, for the same reason as events and
          // for the opposite reason to `interpolated()`. Your health is not a
          // thing to draw a tenth of a second late and it is certainly not a
          // thing to blend: being half dead and half alive between two
          // snapshots is not a state, and a death arriving late is a death you
          // watched somebody else have. The interpolator exists to make OTHER
          // people move smoothly; this is the channel for facts about you.
          this.onSnapshot?.(msg.data);
          // Keep a second of history; anything older can never be drawn.
          const cutoff = performance.now() - 1000;
          while (this.buffer.length > 2 && this.buffer[0].at < cutoff) this.buffer.shift();
          break;

        case S_JOIN:
          this.others.set(msg.data.id, { id: msg.data.id, name: msg.data.n });
          this.onChat?.({ system: true, m: `${msg.data.n} is here` });
          break;

        case S_LEAVE: {
          const gone = this.others.get(msg.data.id);
          this.others.delete(msg.data.id);
          if (gone) this.onChat?.({ system: true, m: `${gone.name} has gone` });
          break;
        }

        case S_PONG:
          this.ping = performance.now() - msg.data.t;
          break;

        case S_CHAT:
          // The server sends your own line back to you along with everybody
          // else. The HUD already showed it the moment you pressed Enter — as
          // "you", which is what you want to read — so letting the echo through
          // printed every sentence twice, once as "you" and once as your name.
          // Dropped here rather than in the HUD because this is the only place
          // that knows which id is us.
          if (msg.data.id === this.id) break;
          this.onChat?.(msg.data);
          break;

        case S_ERROR:
          this.onError?.(msg.data.m);
          break;
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      clearInterval(this.pingTimer);
      this.status('disconnected');
    };
    this.ws.onerror = () => this.status('error');
  }

  status(s) {
    this.state = s;
    this.onStatus?.(s);
  }

  send(type, data) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encode(type, data));
  }

  say(text) {
    this.send(C_CHAT, { m: text });
  }

  /**
   * Push the local player's intent up.
   *
   * Rate-limited rather than sent every frame: at 144 fps that would be 144
   * packets a second to describe 60 ticks of simulation, most of them
   * identical. The server holds the last intent it was given, so sending less
   * often costs nothing except a little input latency.
   *
   * ── AND THAT LAST SENTENCE WAS ONLY HALF TRUE, WHICH IS WHY THIS LATCHES ──
   *
   * It holds for a LEVEL field. `forward` is a fact about right now, and a
   * dropped packet costs nothing because the next one carries the truth again.
   *
   * It is false for a PULSE — a field a keypress sets for exactly one frame,
   * which `PlayerInput.poll` then clears whether or not anybody sent it. The
   * frame loop runs on rAF and this gate is `NET.intentHz`, so most frames are
   * thrown away, and a pulse thrown away is a keypress that never happened.
   * Measured against the real gate with the real intent: at 60 fps **one
   * press in three reaches the server**, and at 120 fps one in five.
   *
   * This is not a new discovery so much as one nobody generalised. The note on
   * `aimYaw` in protocol.js already says the server "receives at most half" of
   * the look deltas, and `lightFire` has its own packet with a comment
   * explaining that `intent.place` "is edge-triggered for a single frame while
   * `sendIntent` is rate-limited, so the pulse is dropped whenever it falls
   * between two sends". Two fields were rescued one at a time; the other twelve
   * were left in the hole.
   *
   * WHAT IT COST. You press 3 for the branch, and the browser selects it
   * locally — so your hand holds a branch and the hotbar agrees. The server
   * never heard, so ITS idea of what you are holding is still slot two. Press
   * Q and the server drops what IT thinks you have: an arrow. That is Ben's
   * *"when i drop a branch it looks like an arrow"* — it looks like an arrow
   * because it IS one, and both ends were behaving exactly as written.
   *
   * So a pulse now waits for a packet instead of a frame. Nothing else changes:
   * level fields are still last-writer-wins and still allowed to be dropped.
   */
  sendIntent(intent, nowMs) {
    if (!this.connected || this.id === null) return;
    if (nowMs - this.lastSent < 1000 / NET.intentHz) {
      latchPulses(this.pulses, intent);
      return;
    }
    this.lastSent = nowMs;
    this.send(C_INTENT, { i: spendPulses(this.pulses, intent) });
  }

  /**
   * Tell the server you have lit a fire.
   *
   * ONE PACKET, ONCE, AT THE MOMENT IT CATCHES — not on a timer and not through
   * the intent. `intent.place` is already on the wire and the server could in
   * principle read it, but it is edge-triggered for a single frame while
   * `sendIntent` is rate-limited to `NET.intentHz`, so the pulse is dropped
   * whenever it falls between two sends and repeated whenever it does not. The
   * same one-shot problem, and the same answer, as `syncCompanion`'s `trick`.
   *
   * Sent AFTER the local light has succeeded, carrying the position the browser
   * actually used, so the two worlds put the fire in the same place rather than
   * each deriving a spot from a camera the other cannot see.
   */
  lightFire(x, z, fuel) {
    if (!this.connected || this.id === null) return false;
    this.send(C_FIRE, { p: [Math.round(x * 100) / 100, Math.round(z * 100) / 100], f: fuel });
    return true;
  }

  /**
   * Tell the server what your animal is like, when it changes.
   *
   * SENT ON CHANGE, NOT ON A TIMER, and the rate limiter is the rounding.
   * `Companion.relationship` quantises trust, food, play and warmth to two
   * decimals, so the slow decay produces a packet a second at its very worst
   * and a resting animal produces none at all. That is a better fit than a
   * fixed interval, because the interesting moments — a trick learned, `guard`
   * switched on — go up the instant they happen instead of up to a second late.
   *
   * `trick` is a one-shot: it is not part of the digest, so it always sends,
   * and it is what makes a trick something the rest of the server can watch
   * rather than a private event on the owner's screen.
   */
  syncCompanion(pet, trick = null) {
    if (!this.connected || this.id === null || !pet) return false;
    const digest = pet.relationship();
    const key = JSON.stringify(digest);
    if (key === this.lastPet && !trick) return false;
    this.lastPet = key;
    this.send(C_PET, trick ? { ...digest, a: trick } : digest);
    return true;
  }

  /**
   * The world as it was `NET.interpolationMs` ago, interpolated between the two
   * snapshots that bracket that moment.
   *
   * Returns null until two snapshots have arrived — there is nothing honest to
   * draw before that, and guessing is what produces the rubber-banding this is
   * designed to avoid.
   */
  interpolated(nowMs) {
    if (this.buffer.length < 2) return this.buffer.at(-1)?.snap ?? null;
    const target = nowMs - NET.interpolationMs;

    let a = this.buffer[0];
    let b = this.buffer[1];
    for (let i = 1; i < this.buffer.length; i++) {
      if (this.buffer[i].at <= target) {
        a = this.buffer[i];
        b = this.buffer[i + 1] ?? this.buffer[i];
      }
    }
    if (a === b) return b.snap;

    const span = b.at - a.at;
    const t = span > 0 ? Math.max(0, Math.min(1, (target - a.at) / span)) : 1;
    return blendSnapshots(a.snap, b.snap, t);
  }

  close() {
    clearInterval(this.pingTimer);
    this.ws?.close();
  }
}

/** Linear blend of the two things that move: players and creatures. */
function blendSnapshots(a, b, t) {
  const byId = new Map();
  for (const p of a.pl) byId.set(p.id, p);
  const pl = b.pl.map((p) => {
    const prev = byId.get(p.id);
    if (!prev) return p;
    return {
      ...p,
      p: [lerp(prev.p[0], p.p[0], t), lerp(prev.p[1], p.p[1], t), lerp(prev.p[2], p.p[2], t)],
      y: lerpAngle(prev.y, p.y, t),
      t: lerp(prev.t, p.t, t),
    };
  });

  const cById = new Map();
  for (const c of a.cr) cById.set(c.i, c);
  const cr = b.cr.map((c) => {
    const prev = cById.get(c.i);
    if (!prev) return c;
    return {
      ...c,
      p: [lerp(prev.p[0], c.p[0], t), lerp(prev.p[1], c.p[1], t), lerp(prev.p[2], c.p[2], t)],
      y: lerpAngle(prev.y, c.y, t),
    };
  });

  // Companions, keyed by their owner — an animal belongs to exactly one person,
  // so the owner id is its identity and no separate one is sent.
  const coById = new Map();
  for (const c of a.co ?? []) coById.set(c.o, c);
  const co = (b.co ?? []).map((c) => {
    const prev = coById.get(c.o);
    if (!prev) return c;
    return {
      ...c,
      p: [lerp(prev.p[0], c.p[0], t), lerp(prev.p[1], c.p[1], t), lerp(prev.p[2], c.p[2], t)],
      y: lerpAngle(prev.y, c.y, t),
    };
  });

  return { ...b, pl, cr, co };
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Blend angles the short way round, or a body spins 350 degrees to turn 10. */
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}
