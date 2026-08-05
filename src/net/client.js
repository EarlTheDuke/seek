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

export class NetClient {
  constructor({ onWelcome, onChat, onError, onStatus, onEvent } = {}) {
    this.ws = null;
    this.id = null;
    this.seed = null;
    this.connected = false;
    this.others = new Map(); // id -> { id, name }
    this.buffer = []; // recent snapshots, oldest first
    this.ping = 0;
    this.lastSent = 0;
    this.onWelcome = onWelcome;
    this.onChat = onChat;
    this.onEvent = onEvent;
    this.onError = onError;
    this.onStatus = onStatus;
  }

  connect(url, name) {
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
      this.send(C_HELLO, { name, version: PROTOCOL_VERSION });
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
   */
  sendIntent(intent, nowMs) {
    if (!this.connected || this.id === null) return;
    if (nowMs - this.lastSent < 1000 / NET.intentHz) return;
    this.lastSent = nowMs;
    this.send(C_INTENT, { i: intent });
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

  return { ...b, pl, cr };
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Blend angles the short way round, or a body spins 350 degrees to turn 10. */
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}
