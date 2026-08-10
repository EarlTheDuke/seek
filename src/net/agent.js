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
import { heightAt } from '../world/noise.js';
import { aimAt, sightline, clearSpotNear, predictLanding } from '../minds/marksman.js';
import { timberBlocker } from '../world/timber.js';
import { setScarcity, scarce } from '../world/scarcity.js';
// For `guard`: what counts as a threat is read off the species table rather
// than listed here, so a wolf added later is guarded against without an edit.
import { SPECIES } from '../creatures/registry.js';
import { bearingName, describePosition, findDistrict, nearbyDistricts } from '../world/placenames.js';
// What can be made, and out of what. Pure data and one pure predicate, shared
// with the browser's prompt and with the server that resolves the act — three
// callers, one table, which is the only way "cook" means the same thing in all
// three places.
import { RECIPES, canCraft } from '../items/recipes.js';
import { EDIBLE, getItem } from '../items/registry.js';
import { AGENTS, BOW, PLAYER, NET, SURVIVAL, PICKUP, MINDS, SOCIAL } from '../config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// How close a body walks to something it means to pick up. Inside
// `PICKUP.radius` with margin to spare, because the last word on where it is
// standing belongs to the server and dead reckoning is only ever nearly right.
const REACH = PICKUP.radius * 0.7;

/**
 * What an order may name as a quarry.
 *
 * Built from the world's own species list rather than written out, so a
 * creature added tomorrow is orderable tomorrow. The point is the REFUSAL: a
 * playtest produced 36 orders to hunt creatures called `is`, `from` and `to`,
 * because the parser took any word after the verb. Eight bodies walked after a
 * preposition and the reflex layer could only refuse it, silently, for ever.
 */
const ORDERABLE_QUARRY = new Set(
  Object.entries(SPECIES).flatMap(([id, def]) => [id, String(def.name).toLowerCase()])
);

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
  constructor({ name, provider, rand, onLog = null, orders = 'decides', pet = null, persona = null, narrate = false,
                commitDetour = false, closeDetour = false, shootRange = AGENTS.shootRange,
                cadenceSeconds = AGENTS.cadenceSeconds,
                // ── the memory arm ──
                // `true` is the pre-2026-08-08 behaviour: one ring, recency
                // only, perception evicting everything. An OPTION and not a
                // constant because "how much is memory scaffolding worth" is a
                // question this project has to be able to answer with a run
                // rather than an opinion, and that needs both arms. Defaults to
                // the new behaviour; `MEMORY=flat` in the launcher restores the
                // old one exactly.
                memoryFlat = false }) {
    this.name = name;
    // ── HOW FAR THIS BODY WILL SHOOT, and why it is an option rather than a
    //    constant edited in config.js ──
    //
    // `AGENTS.shootRange` is 26 m of SLANT and the body is inside it for 5-14%
    // of a run, which is the whole remaining tail of the hunt. The constant was
    // cut from 45 to 26 on a DELIBERATION argument — at 45 the body considered
    // shots the ground would never allow, 19 refusals to 2 arrows — and that
    // argument is written out in `config.js`. It is not an accuracy argument,
    // and until now nobody had made the accuracy measurement.
    //
    // `server/rangecheck.js` has now made it: a standing deer is hit 21 of 21
    // over a real socket from 12 m to 52 m, median 0.10 m from the chest, and
    // led at a trot 11 of 12. THE BOW IS NOT WHY THERE ARE NO SHOTS. So the
    // number is worth moving — but this project has been told three times not
    // to tune a constant, and every time it did, the failure moved instead of
    // going away. So it moves behind a flag, defaulting to the exact value in
    // `config.js`, so `huntcheck` can run it as an A/B against itself and the
    // deliberation half of the argument gets measured too.
    //
    // Default is `AGENTS.shootRange`: every existing caller is byte-identical.
    this.shootRange = shootRange;
    // ── whether a step aside is a DESTINATION or a fresh opinion every tick ──
    //
    // Off by default and deliberately so: `huntcheck` is a real-time check that
    // came back six red in sixteen on a quiet box, and a behaviour change landed
    // without a flag could not be told apart from luck. See `detourSpot`, and
    // `AGENTS.detourArrive`/`detourHoldSeconds` for what ends the walk.
    this.commitDetour = commitDetour;
    // ── ...and whether that step also CLOSES THE RANGE ──
    //
    // Independent of the commitment, and aimed at a different mechanism: the
    // commitment stopped the body re-deciding every tick, and `too far` still
    // ended 54-64% of every step aside on BOTH arms, because a purely
    // perpendicular offset holds the range while the animal drifts out of it.
    // See `clearSpotNear` for the geometry and `AGENTS.detourAdvance` for how
    // far up the line of sight a candidate is allowed to walk.
    this.closeDetour = closeDetour;
    // How often THIS mind reconsiders. See the note at the deliberation gate:
    // the body keeps running at 30 Hz whatever this is set to.
    this.cadenceSeconds = cadenceSeconds;
    this.provider = provider;
    this.rand = rand;
    this.onLog = onLog;
    this.orders = orders;
    // ── WHO THIS ONE IS, kept where a report can read it ──
    //
    // The character itself goes into the provider's system prompt; this is the
    // label. Without it a session ends with six transcripts and no way to say
    // which of them was the liar, and the whole experiment is anecdote. Null
    // when personas are off, which is the control.
    this.persona = persona;
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

    this.memory = new Memory({ flat: memoryFlat });
    // ── WHAT YOUR LAST ACTION ACTUALLY DID ──
    //
    // `brief()` describes the world's PRESENT STATE and said nothing about the
    // consequences of the mind's own last action. A mind got senses and no
    // outcomes, and every failure mode in the 2026-08-08 run was the same shape
    // because of it:
    //
    //   94 fires, five in 20 s   — never told "there is already a fire here"
    //   400+ draws, no arrow     — never told "that shot was refused"
    //   an hour on an empty bow  — never told "you have no arrows"
    //   one sentence, said 3x    — never told "you said that already"
    //
    // An action that returns no signal is indistinguishable from one that did
    // nothing, so it happens again. This is the channel that closes the loop:
    // filled as things happen, drained into the brief at each decision.
    this.outcomes = [];
    // ── THE STANDING PLAN, AND THE PAGE ──
    //
    // Both are written by the mind and handed straight back to it, and neither
    // is ever read by the world. `plan` is up to three short lines; `note` is
    // one unstructured page. They exist because every decision used to start
    // from nothing but a one-line goal, so a mind that formed a two-step
    // intention — "go to Eachann, offer branches for meat" — had nowhere to
    // keep step two, and step two never happened.
    this.plan = [];
    this.note = '';
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
    // ...and WHAT it did, in words, hour-stamped and outside the mind's ring
    // buffer. See `did`. This is the thread a watcher follows.
    this.deeds = [];
    this.said = [];
    // What it MEANT, in order, with the reason it gave for it. See `narrate`.
    this.intentions = [];
    // Whether to say any of that out loud. Off unless somebody asks for it —
    // it is a watching aid, not something the world does on its own.
    this.narrating = narrate;
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
    // id -> count, straight off the snapshot. Empty until the first one lands.
    this.carrying = {};
    this.hours = 0;
    // Animals this body shot itself, off the `by` on the kill event. NOT the
    // ones it watched die.
    this.kills = [];
    // ...and the ones it hurt without putting down. See the 'wound' event.
    this.wounds = [];
    // ── every time the string went slack, meant or not ──
    //
    // `arrows` counts the shots the body DECIDED to take. The server does not
    // care what we decided: it edge-detects `intent.primary`, so ANY true ->
    // false looses an arrow, including the ones where the body changed its mind
    // mid-draw and quietly dropped the trigger on its way to doing something
    // else. Those fire at whatever charge had built — as low as `BOW.minCharge`,
    // which is a third of the launch speed the solver assumed — in whatever
    // direction the body happened to be facing, and nothing recorded them at
    // all. Counted HERE, at the edge, because that is where the arrow leaves.
    this.releases = [];
    this._held = 0;      // real seconds the trigger has been down
    this._looseWhy = null; // set by whoever meant it
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
            // ── how much this valley has ──
            // Firewood is worked out here from the seed, so a body that does
            // not take the server's word for it walks to branches that are not
            // there. Absent means the world as it always was. See scarcity.js.
            setScarcity(msg.data.scarcity ?? null);
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
            this.trackCreatures(msg.data);
            this.snapshot = msg.data;
            this.hours = msg.data.c ?? this.hours;
            // ── the server knows better ──
            // Dead reckoning between snapshots is fine; dead reckoning FOREVER
            // is what put a puppet 8 km from where it stood inside a minute,
            // after which it perceived nothing at all because every contact is
            // measured from here. Snap to the truth whenever it arrives.
            if (msg.data.me) {
              this._x = msg.data.me.p[0];
              // Height too, and only because of the bow: an arc is solved against
              // how far ABOVE or BELOW you the animal stands, and a body that
              // does not know how high it is standing cannot solve one.
              this._y = msg.data.me.p[1];
              this._z = msg.data.me.p[2];
              // Heading too. Position without facing is half a fix: a body that
              // integrates its own yaw against a server integrating it
              // differently walks confidently in the wrong direction.
              if (msg.data.me.y !== undefined) this.yaw = msg.data.me.y;
              this.health = msg.data.me.h;
              this.food = msg.data.me.f;
              this.coreC = msg.data.me.c;
              // ── what the server thinks is in our pack ──
              // Not what we think we picked up. An agent has no inventory of
              // its own — the server's copy is the one that eats, cooks and
              // burns wood, so it is the only honest answer to "am I carrying
              // meat", and until it was sent nobody could ask.
              if (msg.data.me.iv) this.notePack(msg.data.me.iv);
              // Where the string actually is. Crouching drops it 0.67 m and the
              // solver has to know — see `aimAt`.
              this.eye = msg.data.me.e ?? PLAYER.eyeHeight;
              // ── A DEAL ON THE TABLE IS ALSO A HAIL ──
              //
              // Somebody has stopped what they were doing and is walking over
              // to trade with you. Standing still while they arrive is both
              // the courteous reading and the only one that ever settles: in
              // the third melee hour three offers were accepted and only two
              // became trades, and the one that failed failed because the
              // counterparty had walked away between the offer and the answer.
              //
              // Only the RECIPIENT is held — `me.of` is set for nobody else —
              // so the offerer keeps closing and there is no deadlock of two
              // bodies politely waiting for each other.
              // ── ONCE PER OFFER, NOT TWENTY TIMES A SECOND ──
              //
              // This called `noteHail` on EVERY snapshot for as long as an
              // offer stood — and an offer used to stand for ever — so the
              // recipient was pinned in place permanently and could never walk
              // anywhere to settle anything. Together with the offer that never
              // lapsed, that live-locked a whole roster: 159 offers made, zero
              // trades settled, three of eight agents choosing `offer` every
              // tick to the end of the session.
              //
              // A new deal is news. The same deal, still there, is not.
              const deal = msg.data.me.of;
              const tag = deal ? `${deal.n}:${deal.item}:${deal.want}:${deal.gives}:${deal.asks}` : null;
              if (tag && tag !== this._dealSeen) this.noteHail(deal.n);
              this._dealSeen = tag;
            }
            // ── remember what HAPPENED, not only what you noticed while thinking ──
            //
            // Memory was written in exactly one place: `deliberate`, from the
            // contacts in the brief. So a mind only remembered the world at the
            // instants it happened to be thinking about it, and everything
            // between two thoughts — every arrow it loosed and every arrow that
            // hit it — was gone before the next one. `agentcheck` recorded that
            // as "0/0/0 memories" and it was read for a while as the check
            // being impatient. It was not: nothing was being remembered.
            //
            // These are the events a mind can actually LEARN from. A miss with
            // a distance on it is the difference between "I keep failing to
            // hunt" and "my arrows are burying themselves at 38 m while the
            // deer stands at 25, so there is ground in the way" — and the
            // second is a thought that can change what it does next.
            for (const e of msg.data.ev ?? []) this.remember(e);
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
            // ── LONG ENOUGH TO HOLD A CONVERSATION IN ──
            //
            // Was six here and three in the brief, which is less than ONE
            // exchange once six agents and a human share a channel: a mind
            // would answer a question that had already scrolled out of its own
            // memory, and two agents could never get past greeting each other.
            // A few dozen tokens a call is the cheapest thing in this design and
            // it is the difference between bodies near each other and bodies
            // talking to each other. See `AGENTS.hears`.
            if (this.heard.length > AGENTS.remembersHeard) this.heard.shift();
            // In 'obeys' mode a recognised instruction becomes a goal here and
            // now, without waiting for the next deliberation — which may be
            // seconds away and may cost a model call. In 'decides' mode this
            // does nothing at all and the sentence simply travels on into the
            // brief, which is the whole point of the mode.
            if (this.orders === 'obeys') this.takeOrder(msg.data.n, msg.data.m);
            this.memory.add(this.hours, `${msg.data.n} said "${msg.data.m}"`, MINDS.weight.heard);
            // ── AND STOP WALKING, IF THEY ARE NEAR ENOUGH TO BE TALKING TO YOU ──
            //
            // Not a decision and not the mind's business: it is what a body
            // does when somebody within earshot says something. The mind gets
            // the sentence in `heard` and answers in its own time; the legs
            // stop now, because by the time a model has answered, a body at
            // 4 m/s is forty metres away and the moment has gone.
            //
            // See `SOCIAL.hailRange`. This is the whole of the playtester's
            // "I could close to 0.02 m and then lose them".
            this.noteHail(msg.data.n);
            break;
          case S_ERROR:
            this.onLog?.(`${this.name}: server says ${msg.data.m}`);
            break;
        }
      };
    });
  }

  /**
   * How fast is each animal actually moving, and which way?
   *
   * MEASURED, because the wire does not carry it. A creature entry is id, kind,
   * position, yaw, state and hit points — deliberately small, and rightly so.
   * Velocity is the difference between two of those, which is a thing this end
   * can work out for itself, exactly as `Wildlife.applySnapshot` already derives
   * gait speed from how far a body actually travelled.
   *
   * Needed because an arrow is not instant. At 26 m the flight is about a third
   * of a second and a trotting deer covers three metres in that, so a shot aimed
   * where the animal IS lands where the animal WAS. Grazing deer died to the
   * first arrow; walking ones were effectively immortal, for players and agents
   * alike. See the lead solver in marksman.js.
   *
   * Smoothed rather than taken raw: snapshots arrive on a wobbly 20 Hz and a
   * single late packet reads as a deer teleporting, which would throw the lead
   * further off than having none at all.
   */
  trackCreatures(snap) {
    if (!snap?.cr) return;
    this.tracks ??= new Map();
    const now = snap.t ?? 0;
    const seen = new Set();
    for (const c of snap.cr) {
      seen.add(c.i);
      const prev = this.tracks.get(c.i);
      // `t` is the server tick, so the gap is in ticks at a known rate.
      const dt = prev ? (now - prev.t) / 60 : 0;
      if (prev && dt > 0.01 && dt < 1) {
        const vx = (c.p[0] - prev.x) / dt;
        const vz = (c.p[2] - prev.z) / dt;
        // A deer does not go faster than a deer. Anything wilder than this is a
        // cull-and-respawn elsewhere, not an animal, and leading it would send
        // the arrow into the next glen.
        const sp = Math.hypot(vx, vz);
        const ok = sp < 14;
        this.tracks.set(c.i, {
          x: c.p[0], z: c.p[2], t: now,
          vx: ok ? (prev.vx ?? 0) * 0.6 + vx * 0.4 : 0,
          vz: ok ? (prev.vz ?? 0) * 0.6 + vz * 0.4 : 0,
        });
      } else {
        this.tracks.set(c.i, { x: c.p[0], z: c.p[2], t: now, vx: prev?.vx ?? 0, vz: prev?.vz ?? 0 });
      }
    }
    for (const id of [...this.tracks.keys()]) if (!seen.has(id)) this.tracks.delete(id);
  }

  /**
   * Turn one thing the world just did into one line this mind can read later.
   *
   * Written in the FIRST PERSON and in plain words, because it is going into a
   * prompt beside "I decided to hunt" and "Morag said follow me". A mind reads
   * its own memory as a story about itself; a JSON blob in the middle of that
   * is a different kind of sentence and reads as noise.
   *
   * Only what happened to THIS agent, or what it would have seen happen. The
   * server sends every event to everyone, and a mind that remembers every arrow
   * anyone anywhere ever loosed has a memory full of other people's afternoons.
   */
  remember(e) {
    if (!e) return;
    const mine = e.by === this.id;
    const atMe = e.id === this.id;
    switch (e.k) {
      case 'miss':
        // The one event that carries a lesson in a number. Kept with the range
        // so a mind can compare it against how far off the quarry was — and,
        // when we know what the shot was aimed at, WHICH WAY it was wrong.
        if (mine) this.memory.add(this.hours, `my arrow hit ${e.hit} ${e.d} m away — ${this.howItMissed(e)}`, MINDS.weight.hurt);
        break;

      // ── being given something is a social fact, not an inventory event ──
      //
      // The pack arrives in the snapshot either way, so a body would notice it
      // had another arrow. What it would NOT know is WHO put it there, and that
      // is the only part worth remembering: generosity you cannot attribute
      // buys the giver nothing and teaches the taker nothing.
      //
      // Three arms because the three vantage points are genuinely different —
      // being given to, giving, and watching somebody else be generous. The
      // last one is what lets a mind form an opinion about a person it has
      // never traded with.
      // ── A PRICE IS PUBLIC ──
      //
      // Everybody hears every offer, which is what makes this a market rather
      // than six private conversations — and it is the only way one mind can
      // undercut another, or notice that somebody has promised the same venison
      // twice.
      case 'offer':
        if (e.to === this.id) this.memory.add(this.hours, `${e.from} offers me ${e.item} for ${e.want}`, MINDS.weight.trade);
        else if (mine) this.memory.add(this.hours, `I offered ${e.item} to ${e.n} for ${e.want}`, MINDS.weight.trade);
        else this.memory.add(this.hours, `${e.from} offers ${e.n} ${e.item} for ${e.want}`, MINDS.weight.trade);
        break;

      case 'trade':
        if (mine) this.did('trade', `I traded ${e.gave} to ${e.n} for ${e.got}`);
        else if (e.to === this.id) this.did('trade', `I got ${e.gave} from ${e.from} for ${e.got}`);
        else this.memory.add(this.hours, `${e.from} traded ${e.gave} to ${e.n} for ${e.got}`, MINDS.weight.trade);
        break;

      case 'gift':
        if (e.to === this.id) this.memory.add(this.hours, `${e.from} gave me ${e.id}`, MINDS.weight.trade);
        else if (mine) this.did('give', `I gave ${e.id} to ${e.n}`);
        else this.memory.add(this.hours, `${e.from} gave ${e.id} to ${e.n}`, MINDS.weight.trade);
        break;
      case 'hit':
        // ── AND WHO DID IT, WHICH IS THE WHOLE POINT ──
        //
        // This said "an arrow hit me for 11" and nothing else. A body knew it
        // had been shot and not by whom, so retaliation was impossible and no
        // duel could ever happen — the mind had no name to put in `attack`.
        // The event has carried the shooter's id all along; nobody resolved it.
        if (mine) this.memory.add(this.hours, `my arrow struck ${e.n ?? 'someone'} for ${e.dmg}`, MINDS.weight.hurt);
        else if (atMe) {
          const who = e.n ?? this.others.get(e.by) ?? 'someone';
          this.memory.add(this.hours, `${who} shot me for ${e.dmg}`, MINDS.weight.shot);
          this.shotBy = who;
        }
        break;
      case 'wound':
        // The one thing a hunting body could never hear. A miss was announced
        // and a kill was announced; an arrow that went home and left the animal
        // on its feet sounded exactly like never having fired.
        if (mine) {
          // `id` is the individual, not the species — see the wound event in
          // world.js. Recorded whether or not anything acts on it yet, because
          // the question "did this body go back and finish what it hit" cannot
          // be asked at all without it.
          this.wounds.push({ h: +this.hours.toFixed(2), what: e.n, dmg: e.dmg, hp: e.hp, id: e.i });
          this.lastShot = null; // it hit; there is no miss to measure
          this.memory.add(this.hours,
            `my arrow went into the ${e.n.toLowerCase()} — ${e.dmg} damage, it is still up with ${e.hp} left`,
            MINDS.weight.hurt);
        }
        break;
      // ── A WORD FOR SOMETHING THAT DOES NOT EXIST ──
      //
      // Two minds bargained over flint and feathers for most of an hour of a
      // live run, and neither could ever be paid, because nothing anywhere said
      // the word meant nothing. Told out loud so it can stop asking.
      case 'nosuch':
        if (mine) {
          this.refuse('offer', `there is no such thing as "${e.word}" in this country`);
          this.memory.add(this.hours, `there is no such thing as ${e.word}`, MINDS.weight.refused);
        }
        break;
      // ── AND THE ONE UNDER THE VERB THE WHOLE ECONOMY RUNS THROUGH ──
      //
      // `resolveAccept` had six quiet returns, and two measurements on one day
      // found the consequence independently: 64 trade intentions and ZERO
      // trades in one world, and a human getting "offering 10 branches to
      // Tormod…" with nothing ever accepted. The path was not broken — it
      // refused, correctly, for reasons nobody could see.
      //
      // Through `refuse` rather than straight to memory, so it reaches the
      // mind's OUTCOME channel at its next decision. A mind told "you are 9
      // short of the 12 branches it costs" can go and get nine branches. A mind
      // told nothing reaches for `accept` again from the same place for ever.
      case 'nodeal':
        if (mine) this.refuse('accept', e.why);
        break;
      case 'glance':
        if (mine || atMe) this.memory.add(this.hours, `an arrow was refused — ${e.why}`, MINDS.weight.refused);
        break;
      case 'kill':
        // Not gated on `mine`: a carcass on the ground is worth knowing about
        // however it got there. This is the entry that makes scavenging
        // somebody else's kill a thing a mind can decide to do.
        this.memory.add(this.hours, `a ${e.n.toLowerCase()} went down near ${Math.round(e.at[0])},${Math.round(e.at[2])}`, MINDS.weight.kill);
        // ...but WHOSE it was is now on the event, and a body should know the
        // difference between meat it earned and meat it found. Everything that
        // asks "can this thing hunt" has to read this rather than the sentence
        // above, which is equally true when a wolf did the work.
        if (mine) {
          this.kills.push({ h: +this.hours.toFixed(2), what: e.n, at: e.at });
          this.did('killed', `I brought down a ${e.n.toLowerCase()}`);
        }
        break;
      case 'death':
        this.memory.add(this.hours, `${e.n} was killed by ${e.by} ${e.where ?? ''}`.trim(), MINDS.weight.kill);
        break;
    }
  }

  /**
   * Where that arrow went WRONG, in the two directions that mean something.
   *
   * The whole point of the exercise. "Six misses at about 25 m" is compatible
   * with over-leading, under-leading, a low arc and a hill, and picking between
   * them by adjusting constants and re-counting is how three passes moved the
   * failure around without touching it.
   *
   *   ACROSS  the shot line — negative is left, positive is right. **THIS IS
   *           SPREAD, AND ONLY SPREAD.** The comment here used to say it was
   *           "spread and mis-lead" and that was the instrument's third lie:
   *           `mark` is the LEAD-ADJUSTED aim point that `aimAt` returns, so a
   *           mis-lead moves the ANIMAL off the mark and never moves the arrow
   *           off it. Measured over ten arrows from two live runs it read
   *           exactly 0.0 m every single time — a crouched, stationary body has
   *           almost no spread, and this number was structurally incapable of
   *           reporting the one failure that fits the evidence.
   *
   *   LEAD    across the shot line, and it is the number that was missing:
   *           where the QUARRY actually stood when the shaft came down, against
   *           where we aimed. Positive is the animal right of the mark, so the
   *           lead was too far left — an over-lead flips the sign against the
   *           animal's direction. A tenth of a metre of this is interpolation
   *           lag; a metre or more of it is the aim being wrong about where the
   *           deer was going to be.
   *
   *   VSMODEL along it, measured against `predicted` — where OUR OWN BALLISTICS
   *           said this exact shaft would come down. Negative is short of that,
   *           positive is past it. THIS is the along-the-line number worth
   *           reading, and `along` is not.
   *
   * ── why `along` is not, which cost this project a phantom bug ──
   *
   * `along` is measured against the MARK, and the mark is a deer's chest 0.75 m
   * above the ground it stands on. An arrow that passes exactly through that
   * chest does not stop: it carries on and buries itself in the dirt further
   * out. At 20 m the shaft is descending at barely two degrees, so shedding
   * that last 0.75 m takes it another THIRTEEN metres. A flawless archer reads
   * "+13 m long" — the number is geometry, and its sign is a foregone
   * conclusion for every shot that is not stopped by a bank.
   *
   * The board printed it as marksmanship anyway, and a run of consistent
   * "+3 m long at 20 m" was written up as a systematic ballistics bias whose
   * magnitude grew with range. It was neither. Every one of those arrows was
   * landing TEN METRES SHORT of where a perfect one would have. See
   * `server/ballisticscheck.js`, which measures the bow against its own model
   * with the deer, the lead and the terrain taken out of the way.
   *
   * Kept in `shots` for a report to total up, and said in the first person into
   * memory so the mind that has to decide what to do next can read it.
   */
  howItMissed(e) {
    const s = this.lastShot;
    if (!s || !e.at) return 'a miss';
    const dx = s.mark.x - s.from.x;
    const dz = s.mark.z - s.from.z;
    const d = Math.hypot(dx, dz) || 1;
    // Unit vector along the shot, and the one at right angles to it.
    const ux = dx / d;
    const uz = dz / d;
    const ix = e.at[0] - s.from.x;
    const iz = e.at[2] - s.from.z;
    const along = ix * ux + iz * uz - d;
    const across = ix * -uz + iz * ux;
    const high = e.at[1] - s.mark.y;
    // How far the arrow landed from where OUR OWN MODEL said it would. This is
    // the number that says whether the ballistics are understood at all.
    const model = s.predicted
      ? Math.hypot(e.at[0] - s.predicted.x, e.at[2] - s.predicted.z)
      : null;
    // Signed, and down the shot line: how much shorter or longer than the shaft
    // OUR OWN BOW MODEL promised. `along + d` is where it really came down;
    // `predicted.dist` is where a flawless one would have. The difference is
    // the only along-the-line error that is not mostly geometry.
    const vsModel = s.predicted ? along + d - s.predicted.dist : null;
    // ── AND WHERE THE DEER WAS, which nothing has ever asked ──
    //
    // Every column above is the arrow against OUR OWN AIM, and every one of
    // them has said the same thing on every red run: the shaft went exactly
    // where it was told, to within a tenth of a metre. That is a complete
    // answer to "is the bow understood" and no answer at all to "why did it
    // miss", because the aim point is lead-adjusted — if the lead is wrong the
    // arrow still flies true, straight through empty grass.
    //
    // So look up the animal this shot was FOR, in the snapshot as it stands
    // when the miss lands, and put it in the same shot-line frame as the
    // impact. `leadAcross` is the lead error and `leadAlong` is how much
    // nearer or further it is than we solved for.
    //
    // Honest about its own noise: the snapshot is `NET.interpolationMs` behind
    // and the miss event arrives a tick or two after the shaft does, so a deer
    // at walking pace carries a few tens of centimetres of lag in here. Read
    // metres, not decimals.
    const q = s.quarryId != null
      ? (this.snapshot?.cr ?? []).find((c) => c.i === s.quarryId)
      : null;
    let leadAcross = null;
    let leadAlong = null;
    if (q) {
      const qx = q.p[0] - s.from.x;
      const qz = q.p[2] - s.from.z;
      leadAlong = qx * ux + qz * uz - d;
      leadAcross = qx * -uz + qz * ux;
    }
    this.shots = this.shots ?? [];
    this.shots.push({
      dist: +d.toFixed(1),
      // How far this arrow was asked to fly, as the arrow flies. Carried
      // through from the release — see `lastShot`.
      slant: s.slant ?? null,
      along: +along.toFixed(1),
      across: +across.toFixed(1),
      high: +high.toFixed(1),
      pitch: +(s.pitch * 180 / Math.PI).toFixed(2),
      eye: s.eye,
      hit: e.hit,
      // Predicted range down the shot line, how far the real one was from it,
      // and the same gap SIGNED along the line — short is negative.
      pred: s.predicted ? +s.predicted.dist.toFixed(1) : null,
      model: model === null ? null : +model.toFixed(1),
      vsModel: vsModel === null ? null : +vsModel.toFixed(1),
      // The quarry against the mark, in the same frame. Null when the animal
      // has left the snapshot by the time the shaft lands — which is itself
      // worth seeing, because it means it ran clean out of the picture.
      leadAcross: leadAcross === null ? null : +leadAcross.toFixed(1),
      leadAlong: leadAlong === null ? null : +leadAlong.toFixed(1),
      // The two INPUTS to the aim, carried through from the release so a wrong
      // answer can be read against what it was asked. See `lastShot`.
      leadBy: s.leadBy ?? null,
      dropTo: s.dropTo ?? null,
    });
    this.lastShot = null; // one arrow, one verdict
    // ── said in the first person, and only in numbers that mean something ──
    // This sentence goes into `memory`, which goes into the PROMPT. Telling a
    // mind its arrow flew "3 m long" when it in fact fell ten metres short of a
    // perfect one is not a harmless bit of wording; it is feeding the thing
    // that has to decide what to do next a reading with the sign reversed.
    const bits = [];
    if (vsModel !== null && Math.abs(vsModel) >= 1.5) {
      bits.push(`${Math.abs(vsModel).toFixed(0)} m ${vsModel < 0 ? 'short of' : 'past'} where the bow promised`);
    }
    if (Math.abs(across) >= 1.5) bits.push(`${Math.abs(across).toFixed(0)} m ${across < 0 ? 'left' : 'right'}`);
    // The lesson the mind could never be taught, because nothing measured it.
    // "My arrow flew true and the deer was four metres left of where I aimed"
    // is an actionable sentence; "a miss, but barely" is not.
    if (leadAcross !== null && Math.abs(leadAcross) >= 1) {
      bits.push(`the deer was ${Math.abs(leadAcross).toFixed(0)} m to the ` +
        `${leadAcross < 0 ? 'left' : 'right'} of my mark when it landed`);
    }
    if (!bits.length) return `a miss, but barely — the shaft flew true and still went by at ${Math.round(d)} m`;
    return `${bits.join(' and ')}, at ${Math.round(d)} m`;
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

    // The window in which a cook or a craft owns the pack's changes — see
    // `notePack`. Counted in REAL seconds off `dt`, because the game clock
    // wraps at 24 and a body that cannot attribute a meal between 23:59 and
    // 00:01 would be wrong at exactly the hour it is most likely to be eating.
    if (this._made > 0) {
      this._made = Math.max(0, this._made - dt);
      // The window closed without the recipe's output ever arriving, so that
      // make never happened — forget it rather than let a stale recipe claim
      // the next thing that rises. `noteMake`.
      if (this._made === 0) this._making = null;
    }

    // ── noticing runs on its own clock, faster than thinking ──
    //
    // Deliberation costs a model call, so it is deliberately slow. Noticing
    // costs nothing, and tying the two together meant a mind's whole record of
    // the world was a series of stills taken seconds apart — a deer that walked
    // past between two thoughts was never there at all.
    //
    // `Memory.add` drops a line identical to the one before it, so standing
    // still and staring at the same deer writes one entry rather than a
    // hundred. That is what makes this safe to run at this rate.
    this.noticing = (this.noticing ?? 0) + dt;
    if (this.noticing >= AGENTS.noticeSeconds) {
      this.noticing = 0;
      try {
        const seen = this.brief().contacts.slice(0, 2);
        for (const c of seen) this.memory.add(this.hours, `${c.what} ${c.distance}, ${c.doing}`, MINDS.weight.sighting);
      } catch { /* a brief we cannot build is not worth a crash */ }
    }

    this.since += dt;
    // ── HOW OFTEN THIS PARTICULAR MIND RECONSIDERS ──
    //
    // Per-agent, because the bill and the character both live here. Six minds
    // on the six-second default is sixty model calls a minute, which empties a
    // 4000-call session budget in about an hour — and slowing deliberation
    // costs a watcher nothing, because THE BODY DOES NOT SLOW WITH IT. Reflex
    // runs at 30 Hz whatever the mind is doing: an agent that reconsiders every
    // twelve seconds still hunts, walks, aims and looses in between. That split
    // is the best property this architecture has and it was going unused.
    //
    // It is also free characterisation — a ponderous mind and a twitchy one on
    // the same hillside read as different people before either says a word.
    if (!this.thinking && this.since >= (this.cadenceSeconds ?? AGENTS.cadenceSeconds)) {
      this.since = 0;
      this.deliberate();
    }
    // ── THE ARROW LEAVES HERE, whatever the body thought it was doing ──
    // The trigger as the server will read it: held last tick, not held this
    // one, is an arrow. See `releases`.
    const heldBefore = this.intent.primary;
    this.act(dt);
    if (heldBefore && !this.intent.primary) {
      // ── if we did not MEAN this one, ease the string down ──
      //
      // One choke point for every path that stops drawing — a lost quarry, a
      // re-solve that now refuses the shot, standing up to see over a crest,
      // hunger taking the tick. Each of those simply drops the trigger, and
      // each of them was an arrow. `letdown` is resolved on the server before
      // the trigger edge, so the shaft stays in the quiver.
      if (this._looseWhy !== 'aimed') this.intent.letdown = true;
      this.releases.push({
        h: +this.hours.toFixed(2),
        held: +this._held.toFixed(2),
        // Whether an arrow actually left. `BOW.minCharge` of `BOW.drawTime` is
        // the point at which the string has enough tension to throw one — but a
        // release we did not mean now carries `letdown`, which cancels the draw
        // outright, so those keep their arrow whatever the charge.
        loosed: this._looseWhy === 'aimed' || (!this.intent.letdown && this._held >= BOW.drawTime * BOW.minCharge),
        why: this._looseWhy ?? 'let go without meaning to',
      });
      if (this.releases.length > AGENTS.logSize) this.releases.shift();
      this._looseWhy = null;
    }
    this._held = this.intent.primary ? this._held + dt : 0;
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
    const add = (what, x, z, doing, condition, y = null) => {
      const d = Math.hypot(x - this.x, z - this.z);
      if (d > AGENTS.noticeRange) return;
      // ── can it actually be shot, or is there a hill in the way? ──
      //
      // "A deer, close to the north-west" was the truth and was not enough. Six
      // arrows went into a slope at an animal that was in range, in the open and
      // unaware, standing 12.7 m above the archer over a crest — and nothing in
      // the brief distinguished that from a clear shot across a meadow.
      //
      // A mind that cannot tell those apart is not choosing between them, it is
      // guessing. One word fixes it.
      const clear = y === null ? null
        : !sightline(this.x, this._y + PLAYER.eyeHeight, this.z, x, y + AGENTS.aimAboveFeet, z,
                     heightAt, 0.3, this.timber()).blocked;
      contacts.push({
        what,
        how: 'seen',
        where: bearingName(this.x, this.z, x, z),
        distance: howFar(d),
        doing,
        condition,
        // ── ASYMMETRIC, AND THAT IS THE WHOLE TRICK ──
        //
        // This used to go silent entirely past bow range, on the argument that
        // at 120 m "you have a clear line" is not information, it is noise in
        // the prompt. THAT ARGUMENT IS RIGHT ABOUT THE POSITIVE AND WRONG ABOUT
        // THE NEGATIVE. "There is a hill between you and that deer" is useful at
        // any distance you might walk toward it; "you have a clear line" at
        // 120 m is not.
        //
        // Measured: between about 30 and 90 m a mind was handed a target and
        // NOTHING about whether it could be hit. It closed, drew, and the solver
        // refused — 400+ releases in one half-hour run with nothing leaving the
        // string, and a refusal log full of "ground in the way 11 m out".
        //
        // So: inside bow range, both halves as before. Beyond it, out to
        // `noticeRange`, say something ONLY when blocked. The prompt gains a
        // warning and no noise.
        //
        // "Inside bow range" is THIS body's range and not the constant — a body
        // raised to 40 m that is told nothing about its line at 32 is being
        // asked to decide with the old rule's information.
        sight: clear === null ? null
          : d <= this.shootRange
            ? (clear ? 'a clear line' : 'no clear line — ground in the way')
            : (clear ? null : 'the ground rises between you'),
        _m: d,
      });
    };

    // `s?.` and not `s.` — a mind can deliberate before its first snapshot
    // lands, and a brief that throws does not fail loudly: it lands in the
    // provider's catch and the agent silently falls back to its scripted brain
    // for ever. That exact shape has already cost this project a night, when
    // briefToText read a field an agent's brief does not have and every
    // model-driven player quietly never called the model once.
    // ── PEOPLE, AND THE ONES TOO FAR TO SEE ──
    //
    // `add` drops anything past `AGENTS.noticeRange` (140 m), and every social
    // verb resolves its target BY NAME OUT OF THE BRIEF — so past that range
    // the other player was not in the prompt in any form and `offer`, `accept`,
    // `give`, `attack`, `follow` and `guard` all silently became `roam()`.
    //
    // Measured 2026-08-08: two minds spawn 3.3 m apart, are a kilometre apart
    // within the hour, and every one of those verbs is unreachable for the rest
    // of the run. It retroactively explains both six-model playtests — "the
    // models never coordinated" was never a fact about the models, they were
    // each alone in a private world with the same weather.
    //
    // THE WIRE WAS NEVER THE PROBLEM. `SimWorld.snapshot` culls players by
    // nothing at all: every player, every tick, exact coordinates. The agent
    // already knew where everybody was and threw it away here.
    //
    // So: a second, deliberately coarser channel. Name and bearing, NO distance
    // and NO condition — those are what `contacts` is for, and repeating them
    // here would make 140 m mean nothing. Two crofters in a glen do not lose
    // each other permanently because one walked over a rise.
    const far = [];
    for (const p of s?.pl ?? []) {
      const who = this.others.get(p.id) ?? 'someone';
      const d = Math.hypot(p.p[0] - this.x, p.p[2] - this.z);
      if (d > AGENTS.noticeRange) {
        // Only people you can NAME. "Someone, a long way north" is a fact you
        // cannot act on — no verb takes it — and a prompt line that can only
        // produce a refused goal is worse than silence.
        if (who !== 'someone') far.push({ who, where: bearingName(this.x, this.z, p.p[0], p.p[2]) });
        continue;
      }
      add(
        who,
        p.p[0], p.p[2],
        p.c ? 'crouched' : p.s > 5 ? 'running' : 'walking',
        p.x ? 'down' : p.h < 45 ? 'badly hurt' : 'unhurt',
        p.p[1]
      );
    }
    // ── AND WHAT IS LYING ON THE GROUND ──
    //
    // A mind was told "a deer went down near 320,-140" by the kill event and
    // then had no way to SEE the carcass, because nothing shipped dropped loot.
    // `gather` navigates to `nearestDeadfall` — firewood specifically — so a
    // mind standing over its own kill that chose "pick up what is lying about"
    // walked off to a branch. One starved doing exactly that with three kills.
    //
    // No `y` passed, so no sightline is computed: you do not need a clear shot
    // at a dead deer, and asking for one on every carcass is work for nothing.
    for (const l of s?.lo ?? []) {
      add(`${l.n} ${itemWords(l.i, l.n)}`, l.p[0], l.p[2], 'on the ground', null);
    }
    for (const c of s?.cr ?? []) {
      // A creature that has broken and run itself out of breath is a DIFFERENT
      // proposition from a healthy one standing in a field, and saying
      // "unhurt" of it is true and useless. It is the difference between a
      // fight and a free kill, and a mind that cannot tell them apart walks
      // past meat or walks into a pack.
      add(`a ${c.k}`, c.p[0], c.p[2], c.g ? 'cowering, out of breath' : c.s,
        c.h < 30 ? 'wounded' : 'unhurt', c.p[1]);
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
      // Who else is out there, however far. See the comment where it is built.
      far,
      // ── PLACES THAT EXIST ──
      //
      // Minds arrange to meet at places they invent — two agents told a
      // playtester "meet me at the Black Moss", which is nowhere, and `goTo`
      // could only answer that it did not know the way. The gazetteer is a pure
      // function of the seed and both ends already compute it; naming the near
      // ones is the difference between agreeing on a spot and inventing one.
      places: nearbyDistricts(this.x, this.z, 1).slice(0, AGENTS.placesKnown).map((d) => d.name),
      // ── WHO SHOT YOU, kept out of the ring buffer ──
      //
      // It is in `memory` too, but memory is forty entries of noticing and an
      // hour of walking past deer scrolls a grudge straight out of it. The one
      // fact a body needs to return fire is who it should return it AT, and
      // that is worth a field of its own. Null for anybody nobody has shot.
      shotBy: this.shotBy ?? null,
      heard: this.heard.slice(-AGENTS.hears),
      memory: this.memory.recent(this.hours),
      // ── what is in the pack ──
      // Hard-coded empty until the snapshot started carrying it. A mind that
      // cannot tell whether it has meat, wood or a single arrow left is being
      // asked to plan an evening blindfolded — and every "why did it wander
      // instead of making camp" reading of a session log had this underneath it.
      carrying: Object.entries(this.carrying ?? {})
        .filter(([, n]) => n > 0)
        .map(([id, n]) => `${n} ${itemWords(id, n)}`),
      // ── AND THE PACK STATED IN THE NEGATIVE ──
      //
      // The line above filters to `n > 0`, so running out of something showed
      // up as an ABSENCE FROM A LIST. Inferring "I cannot shoot" from the
      // non-appearance of the word "arrows" is the single thing language models
      // are worst at, and one mind hunted for an hour on an empty bow without
      // ever concluding it.
      //
      // Only the three that stop you doing something, and only when they are
      // actually zero: a brief that lists everything you do not have is a brief
      // nobody reads.
      lacking: [
        this.count('arrow') <= 0 && 'no arrows — you cannot shoot',
        this.count('wood') <= 0 && 'no firewood — you cannot lay a fire or make arrows',
        !EDIBLE.some((id) => this.count(id) > 0) && 'no food',
      ].filter(Boolean),
      // ── AND WHAT YOU CANNOT CARRY ANY MORE OF ──
      //
      // The mirror of `lacking`, and it exists for the same reason: a mind that
      // is not told a thing is full will go on choosing to fill it. Across one
      // measured hour, `pick up what is lying about` was 32 per cent of every
      // decision made in this world and `gather` was 334 of 471 deeds — with
      // one body finishing on 205 branches. Capping the pack stops the
      // hoarding; SAYING SO is what stops the reaching.
      //
      // Only what is actually at its limit, and only things worth mentioning.
      // A brief that lists everything you are not short of is a brief nobody
      // reads — the same rule `lacking` was written under.
      full: Object.entries(this.pack ?? {})
        .filter(([id, n]) => getItem(id)?.carry && n >= getItem(id).carry)
        .map(([id, n]) => itemWords(id, n === 1 ? 1 : 2)),
      // What the last stretch of acting actually did. Drained by `deliberate`,
      // so each line is seen exactly once by exactly one decision.
      outcome: (this.outcomes ?? []).map((o) => (o.n > 1 ? `${o.text} (${o.n} times)` : o.text)),
      // ── A DEAL SOMEBODY IS HOLDING OPEN FOR YOU, RIGHT NOW ──
      //
      // `accept` was reached for ZERO times across three live hours and every
      // model in the roster, against 29 offers and 16 gifts. Not a verb they
      // dislike — a verb they were never in a position to use, because the
      // offer only ever reached them as a memory line that had faded by the
      // time they next chose.
      //
      // Stated as the sentence a person would say, and with the one fact that
      // makes it decidable rather than merely interesting: WHETHER YOU CAN
      // COVER IT. "Tormod offers you 12 branches for 2 cooked venison" is news;
      // "...and you have 3" is a decision.
      offered: (() => {
        const o = this.snapshot?.me?.of;
        if (!o) return null;
        const held = this.count(o.want);
        const gives = `${o.gives > 1 ? `${o.gives} ` : ''}${itemWords(o.item, o.gives)}`;
        const asks = `${o.asks > 1 ? `${o.asks} ` : ''}${itemWords(o.want, o.asks)}`;
        return {
          from: o.n, gives, asks, canPay: held >= o.asks,
          // Naming the shortfall means a mind can go and fix it rather than
          // simply not taking the deal, which is the difference between a
          // market and a series of missed appointments.
          short: held >= o.asks ? 0 : o.asks - held,
        };
      })(),
      // ── A FIGHT SOMEBODY ELSE IS HAVING, RIGHT NOW ──
      //
      // The last piece of the co-operation. A playtester recruited four models,
      // walked them a kilometre to the ground he had picked, and they stood
      // beside him narrating the hunt and choosing `hunt deer` every tick —
      // because the troll in front of them was in nobody's brief. He could not
      // hand them a shared objective, so there was never one to share.
      //
      // Stated with the two facts that make it a decision rather than news:
      // HOW FAR, so a mind can judge whether it can get there, and WHAT IS LEFT
      // IN IT, so it can judge whether that would matter. Nothing here tells it
      // what to do — the whole value is that it must now take a position.
      fight: (() => {
        const c = this.snapshot?.cl;
        if (!c || c.by === this.id) return null;
        const d = Math.hypot(c.at[0] - this._x, c.at[1] - this._z);
        if (d > AGENTS.noticeRange * 4) return null;   // too far to be your business
        return {
          who: c.byName,
          what: c.n.toLowerCase(),
          hurt: `${c.hp} of ${c.full} left in it`,
          where: bearingName(this._x, this._z, c.at[0], c.at[1]),
          distance: `${Math.round(d)} m`,
        };
      })(),
      // Handed back unchanged. The world neither reads nor acts on either of
      // these — they are a mind's own working memory, and the only thing that
      // makes a multi-step intention survive the decision that formed it.
      plan: this.plan ?? [],
      note: this.note ?? '',
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
      this.memory.add(this.hours, `${c.what} ${c.distance}, ${c.doing}`, MINDS.weight.sighting);
    }
    // Drained AFTER the brief is built and BEFORE the answer comes back, so
    // each outcome line is read by exactly one decision. Leaving them would
    // repeat "you laid a fire" for ever, which is the failure this channel was
    // built to cure rather than to reproduce in a new place.
    this.drainOutcomes();

    this.thinking = true;
    Promise.resolve(this.provider.decide(brief))
      .then((raw) => {
        const goal = sanitiseGoal(raw);
        if (!goal) {
          // NOT SILENT ANY MORE. A reply the door threw away used to vanish
          // without a trace in any log or counter, which is indistinguishable
          // from a decision that was never made.
          const kind = typeof raw?.kind === 'string' ? raw.kind.slice(0, 24) : null;
          this.refuse(kind ?? '(none)',
            kind ? `there is no verb called "${kind}"` : 'your last answer was not a decision');
          return;
        }
        if (goal.refused) this.refuse(goal.kind, goal.refused);

        // ── SPEECH AND ACTION ARE TWO ANSWERS, NOT ONE ──
        //
        // `this.goal = goal` used to run BEFORE the speech was handled, so a
        // mind that chose to talk had its plan replaced by the sentence. It
        // then sat on that sentence: one mind was pinned on "Eachann, that deer
        // is mine" for twenty-seven consecutive samples — nine real minutes —
        // saying it three times and doing nothing else.
        //
        // Now `say` rides on any verb, and the bare `say` KIND means "speak and
        // carry on", so the standing plan survives either way. A person talks
        // while they walk.
        const said = goal.say ?? (goal.kind === 'say' ? goal.text : null);
        const action = goal.kind === 'say' ? this.goal : goal;

        // OMITTED MEANS KEEP. `undefined` and `[]` mean different things here on
        // purpose: a decision that simply does not mention the plan must not
        // destroy it, or the plan lives exactly as long as the goal did and
        // nothing has been fixed.
        if (goal.plan !== undefined) this.plan = goal.plan;
        if (goal.note !== undefined) this.note = goal.note;

        const changed = action.kind !== this.goal.kind
          || describeGoal(action) !== describeGoal(this.goal);
        this.goal = action;
        // ── AN ORDER ENDS WHEN THE MIND MAKES ITS OWN CHOICE AGAIN ──
        //
        // `ordered` and `orderedTo` were set when the order landed and never
        // cleared, so the board went on reporting the last order EVER GIVEN as
        // though it were current. Ben saw all eight seats reading "told to hunt
        // a deer" while not one of them was hunting anything: they had each
        // deliberated since and moved on.
        //
        // The column is meant to answer "is this body under orders?" and it was
        // answering "was it ever?" — which is the same disease as every other
        // instrument this week, in the newest instrument in the game.
        //
        // Cleared HERE, at the moment the mind chooses for itself, because that
        // is exactly when the order stops being what the body is doing.
        this.ordered = false;
        this.orderedTo = null;
        this.orderedBy = null;
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
        this.goalCounts[action.kind] = (this.goalCounts[action.kind] ?? 0) + 1;
        if (said) this.goalCounts.say = (this.goalCounts.say ?? 0) + 1;

        // ── HOW LONG SINCE THIS ONE LAST SPOKE, ACROSS MIDNIGHT ──
        //
        // `hours` is the world clock and it is `% 24`. `spoke` is a stamp taken
        // off that same clock. A plain subtraction across midnight is NEGATIVE
        // — 0.6 minus 20.0 reads as minus nineteen hours — which is never
        // greater than the gate, so a mind that spoke in the evening was MUTE
        // FOR THE REST OF THE RUN and nothing anywhere said so.
        //
        // A day here is `TIME.dayMinutes` = 26 REAL minutes, so this was not an
        // edge case waiting for a long campaign: it fired twice an hour. It is
        // why a human sat in the game, asked four direct questions, and was
        // answered by nobody. See `chatcheck`.
        //
        // `spoke` starts at -999 to mean "never", and that sentinel must stay a
        // sentinel: feeding it through the modulo gives an arbitrary number in
        // [0,24) that lands under the gate for one hour of every day, which
        // would have silenced a fresh mind at nine in the morning.
        const sinceSpoke = this.spoke < 0 ? Infinity : (this.hours - this.spoke + 24) % 24;

        // ── TWO INDEPENDENT BLOCKS, AND THE INDEPENDENCE IS THE FIX ──
        //
        // This was one if/else chain, so speaking and deciding were mutually
        // exclusive: a mind that spoke could not also be recorded as having
        // decided anything, and its plan was replaced by its sentence. Now a
        // decision can do both, which is what a person does.
        if (said && sinceSpoke > AGENTS.speakEveryHours) {
          this.spoke = this.hours;
          this.send(C_CHAT, { m: said });
          // Kept because it is the only unprompted sentence anybody in this
          // world produces — the closest thing to a player telling you
          // something in their own words.
          this.said.push(said);
          // ...and into MEMORY, weighted, so it does not say the same thing
          // again three minutes later. A mind that cannot remember its own
          // voice repeats itself, which is exactly what was observed.
          this.memory.add(this.hours, `I said "${said}"`, MINDS.weight.spoke);
          this.noteOutcome(`you said "${said}" out loud`);
        } else if (said) {
          // GATED, AND SAID SO. This branch used to fall through to nothing:
          // the mind chose to speak, the gate refused, and the choice vanished
          // without a trace in any log or counter. An intention that is thrown
          // away silently is indistinguishable from one that was never had.
          this.gagged = (this.gagged ?? 0) + 1;
          // A mind said the same sentence three times over nine minutes because
          // the gate was silent to it. Now it is not.
          this.noteOutcome(`you have already spoken recently — "${said}" was not said`);
          this.onLog?.(`${this.name}: (wanted to say "${said}" — too soon, ${sinceSpoke.toFixed(2)}h of ${AGENTS.speakEveryHours}h)`);
        }

        if (changed) {
          this.memory.add(this.hours, `I decided to ${describeGoal(action)}`, MINDS.weight.decided);
          this.onLog?.(`${this.name}: ${describeGoal(action)}${action.why ? ` — ${action.why}` : ''}`);
          // ── the thread a watcher follows ──
          // Kept out of `Memory`'s forty-entry ring buffer, which fills with
          // noticing: an hour of walking past deer and a body has forgotten it
          // ever decided anything. `intentions` is the log of what it MEANT,
          // with the reason it gave, and it is what makes a session legible
          // afterwards — "three models disagreed about a carcass" is a story
          // you can only tell if each of them said why.
          this.intentions.push({
            h: +this.hours.toFixed(2),
            goal: describeGoal(action),
            why: action.why ?? null,
            where: this.where(),
            // What it said, if anything, alongside what it decided. The whole
            // point of splitting the two is that a decision can carry both, and
            // a log that records only one of them cannot show that it did.
            ...(said ? { said } : {}),
          });
          if (this.intentions.length > AGENTS.logSize) this.intentions.shift();
          this.narrate(action);
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
   * Somebody said something. Where are they, and are they talking to me?
   *
   * A chat message carries no position, so the speaker is looked up in the
   * snapshot by name — the server sends every player every tick. Out of
   * earshot means out of the conversation: somebody shouting from 400 m away
   * across the glen is not hailing you, and should not be able to stop you.
   */
  noteHail(who) {
    if (!who || who === this.name) return;
    for (const p of this.snapshot?.pl ?? []) {
      if (this.others.get(p.id) !== who) continue;
      const d = Math.hypot(p.p[0] - (this._x ?? 0), p.p[2] - (this._z ?? 0));
      if (d > SOCIAL.hailRange) return;
      this.hailedBy = who;
      this.hailFor = SOCIAL.hailHoldSeconds;
      this.hailAt = { x: p.p[0], z: p.p[2] };
      return;
    }
  }

  /**
   * Stand still and face whoever wants you. Returns true if it took the tick.
   *
   * ── WHY A BODY DOES THIS AND A MIND DOES NOT ──
   *
   * Because a mind is seconds away. The cadences on the roster run from 20 to
   * 75 seconds, and a body walking at 4 m/s covers eighty metres in twenty of
   * them. Waiting for the model to decide to stand still is waiting for it to
   * decide something about a situation that has already ended. So this is
   * reflex, like flinching, and every seat gets it — including the scripted
   * control, because it is the body's behaviour and not the brain's.
   *
   * TWO THINGS IT MUST NOT DO.
   *
   * It must not freeze somebody who is trying to reach YOU. If my own goal is
   * to hand you something, or take your offer, or walk to you, then stopping
   * is the exact opposite of what is wanted — and both of us holding still
   * three metres apart is the deadlock this was written to end, not start.
   *
   * And it must not hold a body still while something is eating it. `avoid` is
   * how the mind says "get away from that", and a hail cannot override it.
   */
  holdForHail(dt, i) {
    if (!(this.hailFor > 0)) return false;
    this.hailFor -= dt;

    // ── A BODY IN REAL TROUBLE DOES NOT STOP TO CHAT ──
    //
    // This runs BEFORE `upkeep`, so the emergencies `upkeep` exists for have to
    // be declined here or a starving body would stand politely while it died.
    //
    // NOT `AGENTS.eatBelow`/`warmBelow`, which was the first attempt and which
    // quietly swallowed the whole feature: those are the lines at which a body
    // decides to go and eat or walk to a fire, and an agent twenty minutes into
    // a run is below them almost permanently. See `SOCIAL.tooHungryToTalk`.
    const starving = this.food !== undefined && this.food < SOCIAL.tooHungryToTalk;
    const freezing = this.coreC !== undefined && this.coreC < SOCIAL.tooColdToTalk;
    if (starving || freezing) return false;

    const g = this.goal ?? {};
    const closing = g.kind === 'give' || g.kind === 'offer' || g.kind === 'accept'
      || g.kind === 'approach' || g.kind === 'follow';
    if (closing || g.kind === 'avoid') {
      this.hailFor = 0;
      return false;
    }

    // Face them, so it reads as being listened to rather than as a body that
    // happened to stop. `aimYaw` and not a `lookYaw` delta: an agent's look
    // deltas are rate-limited on the way out and the server integrates a
    // fraction of them — the same bug that made agents unable to aim.
    if (this.hailAt) {
      const dx = this.hailAt.x - (this._x ?? 0);
      const dz = this.hailAt.z - (this._z ?? 0);
      if (dx || dz) {
        this.yaw = Math.atan2(-dx, -dz);
        i.aimYaw = this.yaw;
      }
    }
    i.forward = 0;
    i.strafe = 0;
    i.sprint = false;
    i.crouch = false;
    this.trackSelf(dt, 0);
    return true;
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
    i.interact = i.drop = i.place = i.eat = i.jump = i.letdown = false;
    i.craft = '';
    i.give = '';
    i.giveItem = '';
    i.offer = '';
    i.offerItem = '';
    i.offerWant = '';
    i.accept = '';

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
    this._y ??= 0;
    this._z ??= 0;

    // ── the body's own business, before anybody's plans ──
    // Eating, cooking and getting a fire lit. It only takes the tick when
    // something is actually wrong; the rest of the time it returns straight
    // away and the goal drives, exactly as it always has.
    // ── SOMEBODY IS TALKING TO YOU ──
    //
    // BEFORE `upkeep`, and that placement is the whole fix rather than a
    // detail. `upkeep` does not only handle the instant emergencies — it also
    // WALKS TO A FIRE, up to `fireWalkRange` (45 m), returning true on every
    // tick of that walk. Put the hail after it and any agent that is cold or
    // hungry never reaches this line at all, which with `HUNGER=52` is most of
    // them most of the time.
    //
    // Measured, and it is why this comment exists: a freshly joined agent held
    // for the full six seconds while the scripted control — alive long enough
    // to be cold — walked straight past a man standing 3.6 m away saying her
    // name. The check passed; the game did not.
    //
    // `holdForHail` declines for a body that is actually in trouble, which is
    // the part `upkeep` was standing in for.
    if (this.holdForHail(dt, i)) return;

    if (this.upkeep(dt, i)) {
      this.trackSelf(dt, i.forward ? 4.1 : 0);
      return;
    }

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

    // ── a quarry is not a destination, it is a shot ──
    //
    // Everything else in this method is "walk there and use your hands". This
    // is the one target you are supposed to STOP short of, and before today
    // there was no code anywhere in this project that made an agent draw a bow:
    // `primary` appeared in neither agent.js nor hunter.js, so `hunt` meant
    // "follow the deer" and meant it for ever.
    //
    // The judgement stays upstairs — the mind chose the quarry. Everything from
    // here down is reflex: where the ground is, what the arc has to be, whether
    // to shoot at all or close the range first. See minds/marksman.js.
    if (this.target?.quarry) {
      this.act_shoot(dt, i);
      this.trackSelf(dt, i.forward ? (i.crouch ? 2.1 : 4.1) : 0);
      return;
    }
    // Not on a quarry any more, so a step-aside in progress is over and it did
    // not end in a shot. Closed HERE rather than left dangling, or the outcome
    // tally silently stops adding up to the number of detours attempted — which
    // is the one arithmetic that proves this instrument is not lying.
    this.endDetour('lost the quarry');

    if (this.target) {
      const dx = this.target.x - this._x;
      const dz = this.target.z - this._z;
      const dist = Math.hypot(dx, dz);
      // ── how close is "there" depends on what you came to do ──
      //
      // Six metres is close enough to have ARRIVED somewhere and nowhere near
      // close enough to TOUCH anything: `PICKUP.radius` is 2.2. So `gather`
      // walked to a branch, stopped four metres short, pressed E, marked the
      // branch as taken and walked off — thirty-five times in a row, with an
      // empty pack, and every existing check read that as gathering because it
      // counted the presses. A target that came to use its hands says how near
      // it needs to be.
      const stop = this.target.within ?? AGENTS.arriveWithin;
      if (dist > stop) {
        this.steerTo(this.target.x, this.target.z, dt, i);
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
          // Most acts are edge-triggered booleans (`interact`, `place`). Some
          // carry a value — `give` needs to say WHO, because the server cannot
          // read a mind's target off a keypress. `actAlso` carries the rest.
          i[this.target.act] = this.target.actValue ?? true;
          for (const [k, v] of Object.entries(this.target.actAlso ?? {})) i[k] = v;
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

  /**
   * Turn toward a point and walk at it. The one piece of steering everything
   * shares, so "which way is that" is answered in one place.
   */
  steerTo(x, z, dt, i) {
    const dx = x - this._x;
    const dz = z - this._z;
    const want = Math.atan2(-dx, -dz);
    const diff = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const turn = clamp(diff, -AGENTS.turnRate * dt, AGENTS.turnRate * dt);
    // The delta is what a keyboard would have sent; the absolute is what the
    // server actually reads. Both, for the reason in intents.js.
    i.lookYaw = -turn;
    this.yaw += turn;
    i.aimYaw = this.yaw;
    i.forward = 1;
    return Math.hypot(dx, dz);
  }

  /** How many of something the server says we are carrying. */
  count(id) {
    return this.carrying?.[id] ?? 0;
  }

  /** An `Inventory`-shaped view of that, for the shared recipe predicates. */
  get pack() {
    return { countOf: (id) => this.count(id) };
  }

  /** The nearest fire we know about, out of the snapshot. */
  nearestFire() {
    let best = null;
    for (const f of this.snapshot?.fi ?? []) {
      const d = Math.hypot(f.p[0] - this._x, f.p[1] - this._z);
      if (!best || d < best.d) best = { x: f.p[0], z: f.p[1], fuel: f.f, d };
    }
    return best;
  }

  /**
   * What is worth making at a fire right now, as a recipe id, or null.
   *
   * NOT `bestAvailable`. That returns the first thing the table permits, which
   * is the right answer for a person reading a prompt and the wrong one for a
   * body keeping itself alive: carrying stone, hide and firewood, it would knap
   * an axe while the venison stayed raw, then spend the rest of the night
   * turning the fuel into arrows. So this asks the two questions a body has —
   * is there food to cook, and is the quiver low — and asks them in that order.
   */
  recipeToWork() {
    for (const r of Object.values(RECIPES)) {
      if (r.requires !== 'fire' || r.verb !== 'cook') continue;
      if (canCraft(r, this.pack)) return r.id;
    }
    // Arrows, but never out of the last of the fuel: a fire you cannot light is
    // worse than a shot you cannot take, because the cold does not miss.
    const fletch = RECIPES.fletch_arrows;
    if (
      this.count('arrow') < AGENTS.lowArrows &&
      this.count('wood') >= AGENTS.spareWood &&
      canCraft(fletch, this.pack)
    ) {
      return fletch.id;
    }
    return null;
  }

  /**
   * Keeping the body alive. Reflex, not deliberation.
   *
   * NOBODY DECIDES TO BE HUNGRY. The mind runs every `AGENTS.cadenceSeconds`
   * and may be waiting on a model at the far end of a network call; a body that
   * asks permission to eat starves between two thoughts. This is the same split
   * the bow already uses — the mind names the deer, the reflex draws the string
   * — applied to the other half of survival.
   *
   * Order is the whole design, and it is the order a cold, hungry person would
   * actually take:
   *
   *   1. a cooked meal in the pack — eat it
   *   2. something to cook, or too cold to carry on — get to a fire
   *   3. no fire near enough — lay one, if there is a branch for it
   *   4. nothing worked and we are starving — eat it raw rather than die of it
   *
   * Anything it does not answer returns false, and the goal drives as before.
   * That matters: this must not turn an agent into a housekeeping loop. On a
   * fed, warm body it does nothing at all.
   *
   * @returns {boolean} whether it took this tick's body.
   */
  upkeep(dt, i) {
    if (this.food === undefined) return false; // no snapshot of ourselves yet

    // ── a swallow takes a moment ──
    // `me.f` is the server's answer and it arrives at 20 Hz while this runs at
    // 30, so for a tick or two after eating the body still believes it is
    // hungry — and it ate the second steak a third of a second after the first,
    // at 78 fed, throwing away most of a deer. Measured: two meals, 44 -> 100,
    // with a ceiling at 100. A pause is all it needs.
    this.eatCooling = Math.max(0, (this.eatCooling ?? 0) - dt);

    const hungry = this.food < AGENTS.eatBelow && this.eatCooling === 0;
    const cold = this.coreC !== undefined && this.coreC < AGENTS.warmBelow;

    // 1. A MEAL. `intent.eat` takes the best food in the pack, so all this has
    // to establish is that one of them is already cooked — otherwise it would
    // eat the raw venison it is standing at a fire to cook.
    if (hungry && COOKED.some((id) => this.count(id) > 0)) {
      i.eat = true;
      this.eatCooling = AGENTS.swallowSeconds;
      this.did('eat', 'I ate a cooked meal');
      return true;
    }

    const recipe = this.recipeToWork();
    if (!recipe && !cold) return this.eatRaw(i);

    // 2. A FIRE — somebody's, if there is one, because a fire already burning
    // costs no branch.
    const fire = this.nearestFire();
    if (fire && fire.d <= SURVIVAL.fireReach) {
      i.forward = 0;
      i.sprint = i.crouch = false;
      if (recipe) {
        i.craft = recipe;
        // ── A PRESS IS NOT A MAKE ──
        //
        // This used to write the deed right here, and the deed was a keypress
        // wearing an outcome's clothes — the same mistake `arriveWithin` vs
        // `PICKUP.radius` made one method down, and it went the same way. The
        // server resolves a craft INSTANTLY but the pack comes back at 20 Hz
        // against a body running at 30, so `recipeToWork` still sees the raw
        // venison for a tick or two and presses again at a fire that has
        // already cooked it. Measured live: `craft: 2` and two identical lines
        // stamped 1.27h for ONE steak, in a column five deep that a watcher
        // reads — which is the kill and the fire pushed off the end of it.
        //
        // And the duplicate was the mild half. The server refuses a craft with
        // no station in reach, no inputs, or `maxHeld` already met, and it
        // refuses silently: a body could stand at a cold fire pressing all
        // night and the report would say it cooked. So the deed moved to where
        // the gather deed already is — the pack RISING on the server's own
        // snapshot, which is a thing that happened rather than a thing wanted.
        // See `noteMake`.
        this.acted.craftTried = (this.acted.craftTried ?? 0) + 1;
        this._making = recipe;
        // ── this make owns the next change to the pack ──
        // A cook turns venison into venison_cooked and the cooked line RISES,
        // which is indistinguishable from picking one up if you only watch the
        // number. Held open for a second and a half of real time rather than
        // one snapshot, because the server resolves the craft on its own tick
        // and the new item can land several snapshots after the intent. See
        // `notePack`.
        this._made = AGENTS.makeOwnsPackFor;
      }
      // No recipe means we are here to get warm, so stand at it. Self-limiting:
      // the moment `coreC` climbs back over the line this returns false and the
      // agent gets on with whatever it was doing.
      return true;
    }
    if (fire && fire.d <= AGENTS.fireWalkRange) {
      this.steerTo(fire.x, fire.z, dt, i);
      i.sprint = i.crouch = false;
      return true;
    }

    // 3. LAY ONE. `place` puts it three metres in front, which is inside the
    // reach that cooks — so the next tick at this spot is step 2.
    // Counted in REAL seconds, not game hours: the clock wraps at midnight and
    // a body that cannot light a fire between 23:59 and 00:04 would be caught
    // out at exactly the hour it matters.
    this.placeCooling = Math.max(0, (this.placeCooling ?? 0) - dt);
    const near = fire && fire.d < AGENTS.fireNearby;
    // The two reasons a fire does not get laid, both previously invisible to
    // the mind. `near` is the one that mattered: 94 fires went down in a single
    // run, five inside twenty seconds.
    // ── THREE REASONS NOT TO LAY ONE, ALL OF THEM SAID OUT LOUD ──
    //
    // 106 fires went down in one seven-hour run, five of them inside twenty
    // real seconds. `fireNearby` is the guard and it has been widened; the
    // price has gone from one branch to `SURVIVAL.woodToLight`; and this body
    // now remembers where it laid its own, which is the part `nearestFire`
    // could not do — a fire that has not reached the snapshot yet is a fire
    // this body knows about and the world has not told it about.
    const mine = this.myFires ?? (this.myFires = []);
    const nearMine = mine.some((f) => Math.hypot(f.x - this._x, f.z - this._z) < AGENTS.fireNearby);
    const short = SURVIVAL.woodToLight - this.count('wood');

    if ((near || nearMine) && short <= 0) this.noteOutcome('there is already a fire burning here');
    else if (short > 0) {
      this.noteOutcome(`a fire takes ${SURVIVAL.woodToLight} branches and you have ${this.count('wood')}`);
    }
    if (short <= 0 && !near && !nearMine && this.placeCooling === 0) {
      i.place = true;
      i.forward = 0;
      this.placeCooling = AGENTS.relightSeconds;
      // Remembered here rather than waiting for the snapshot: the whole point
      // of `relightSeconds` was to cover that gap and it plainly did not.
      mine.push({ x: this._x, z: this._z });
      if (mine.length > AGENTS.firesRemembered) mine.shift();
      this.did('place', 'I set a fire going');
      return true;
    }

    // 4. Nothing to cook on and nothing to cook with. Fall back to the goal —
    // which is how `gather` and `makeCamp` get a chance to find the branch this
    // needed — unless we are far enough gone that raw is better than nothing.
    return this.eatRaw(i);
  }

  /** Raw meat, only when the alternative is dying with it in the pack. */
  eatRaw(i) {
    if (this.food === undefined || this.food >= AGENTS.eatRawBelow) return false;
    if (this.eatCooling > 0) return false;
    if (!EDIBLE.some((id) => this.count(id) > 0)) return false;
    i.eat = true;
    this.eatCooling = AGENTS.swallowSeconds;
    this.did('eat', 'I ate what I had, raw');
    return true;
  }

  /**
   * Say out loud what this mind is doing and why.
   *
   * ── the thing that turns NPCs into a broadcast ──
   *
   * Every agent has logged `{brief -> goal}` for replay since minds were added
   * and NOBODY COULD SEE IT. A watcher standing on the hill saw three bodies
   * walking and could not tell an ambush from a retreat from a wander, which
   * makes six models on one server "some NPCs are about" rather than "watch
   * three minds disagree about a carcass". Legibility matters more than
   * headcount, and the reason matters more than the act: all three of them are
   * hunting, and only the WHY tells them apart.
   *
   * Sent as ordinary chat, deliberately — it reaches every client and the HUD
   * already draws it, so this needs no protocol and no view code. Gated off by
   * default: it is a watching aid, and a world that narrates itself unasked is
   * a world nobody can play straight.
   *
   * The persona rides along when there is one, because the whole point of the
   * experiment is being able to attribute what you are watching.
   */
  narrate(goal) {
    if (!this.narrating) return;
    // Only when it CHANGES its mind — the caller has already established that —
    // and never twice in the same breath, or a fleet of six drowns the chat
    // column that people also talk in.
    if (this.hours - (this._narrated ?? -999) < AGENTS.speakEveryHours) return;
    this._narrated = this.hours;
    const tag = this.persona ? ` [${this.persona.id}]` : '';
    const why = goal.why ? ` — ${goal.why}` : '';
    this.send(C_CHAT, { m: `${describeGoal(goal)}${why}${tag}` });
  }

  /**
   * Tally a reach for something, and KEEP THE SENTENCE.
   *
   * `Memory` is a ring buffer forty entries deep and it fills with noticing —
   * a body that spends an hour walking past deer has forgotten it lit a fire.
   * That is right for a mind, which should be thinking about what is in front
   * of it, and wrong for a record of what happened: "did this thing ever cook"
   * is a question about a whole session. So the deed is kept here as well,
   * hour-stamped, and this is what a watcher and a report read.
   */
  /**
   * Something happened because of me. Goes into the next brief, once.
   *
   * Consecutive duplicates collapse — a body that laid four fires between two
   * thoughts should read as "you laid a fire", not as four lines saying so, and
   * the count is the thing worth knowing anyway. Capped, because an outcome
   * list longer than the rest of the brief is just noise with a new name.
   */
  noteOutcome(text) {
    if (!text) return;
    // Lazily, the same way `loosed` and `detourAsked` are — several checks call
    // the bookkeeping methods on a deliberate partial stub rather than a whole
    // Agent, which is a reasonable thing for a check to do and not worth
    // breaking to save one token. `survivalcheck` found this the moment `did`
    // started reporting outcomes.
    this.outcomes ??= [];
    const last = this.outcomes.at(-1);
    if (last?.text === text) { last.n++; return; }
    this.outcomes.push({ text, n: 1 });
    if (this.outcomes.length > AGENTS.outcomesKept) this.outcomes.shift();
  }

  /**
   * A verb was reached for and would not resolve. Say so, and COUNT it.
   *
   * The counter is the point as much as the sentence. Six of fifteen verbs went
   * unused across two days of runs and there was no way to tell "reached for
   * and refused" from "never wanted" — which are completely different findings
   * about a model, and only one of them is the model's fault.
   */
  refuse(verb, text) {
    this.refusedVerbs ??= {};
    this.refusedVerbs[verb] = (this.refusedVerbs[verb] ?? 0) + 1;
    this.noteOutcome(text);
  }

  /** The outcome lines for one decision, in words, then emptied. */
  drainOutcomes() {
    this.outcomes ??= [];
    const out = this.outcomes.map((o) => (o.n > 1 ? `${o.text} (${o.n} times)` : o.text));
    this.outcomes = [];
    return out;
  }

  did(what, text = null) {
    this.acted[what] = (this.acted[what] ?? 0) + 1;
    if (!text) return;
    // Every deed is an outcome by definition: it is the thing this body just
    // did. Hooking it here rather than at each call site means gathering,
    // crafting, eating, laying a fire and killing all report themselves for
    // free, and a deed added later cannot forget to.
    this.noteOutcome(text);
    this.memory.add(this.hours, text);
    this.deeds.push({ h: +this.hours.toFixed(2), what, text });
    if (this.deeds.length > AGENTS.logSize) this.deeds.shift();
  }

  /**
   * "3 branches", "2 stones", "3 trout" — a count and a noun that reads right.
   *
   * `id + 's'` gives "branchs", and the item whose id is `wood` is called a
   * Branch, so the naive version is wrong on the commonest pickup in the game.
   * Meat and fish do not take a plural at all.
   */
  static plural(noun, n) {
    if (n === 1) return noun;
    if (/(venison|trout|fish)$/.test(noun)) return noun;
    if (/(s|x|z|ch|sh)$/.test(noun)) return `${noun}es`;
    if (/[^aeiou]y$/.test(noun)) return `${noun.slice(0, -1)}ies`;
    return `${noun}s`;
  }

  /**
   * The pack, as the server sends it — and WHAT JUST WENT INTO IT.
   *
   * ── why this is driven off the delta and not off the keypress ──
   *
   * Until now `did()` had exactly five call sites: killed, ate, ate raw,
   * cooked, lit a fire. Gathering was not one of them, so the board's "did"
   * column honestly read "nothing worth telling yet" beside a pack that had
   * gained two branches, and the commonest thing a body does all session was
   * the one thing it could not say it had done.
   *
   * The obvious fix is to record it when the body reaches — and it is wrong.
   * `arriveWithin` is 6 m and `PICKUP.radius` is 2.2, so a body can press E
   * thirty-five times at a branch it is nowhere near, and every check that
   * counted intents read that as gathering. **The honest signal is the number
   * going UP on the server's own snapshot**, which is a confirmed outcome and
   * cannot be faked by wanting it.
   *
   * ── the two things that also make a number go up ──
   *
   * COOKING and CRAFTING. A cook turns venison into venison_cooked, and the
   * cooked line rising is not a pickup; both already announce themselves
   * through their own `did()`. So a make suppresses the next delta outright,
   * rather than being disentangled item by item — a rule that cannot get the
   * attribution subtly wrong.
   *
   * THE FIRST SNAPSHOT is the other one: `carrying` starts empty, so the whole
   * starting kit — twelve arrows, a bow — arrives as one enormous delta. The
   * first pack is adopted in silence.
   */
  notePack(iv) {
    const before = this.carrying;
    this.carrying = iv;
    // The starting kit is not a foraging triumph.
    if (!this._hadPack) { this._hadPack = true; return; }
    // A cook or a craft owns every change for `AGENTS.makeOwnsPackFor`, whatever
    // shape it takes. Conservative on purpose: the cost is a pickup that goes
    // unrecorded while standing at a fire, and the alternative is a cooked
    // steak announced as something the body found lying about.
    //
    // It is also the ONLY window in which a make can be confirmed, so the
    // craft's own deed is written here on the way past — see `noteMake`. The
    // suppression stays whether or not that fires.
    if ((this._made ?? 0) > 0) { this.noteMake(before, iv); return; }

    for (const [id, n] of Object.entries(iv)) {
      const gained = n - (before?.[id] ?? 0);
      if (gained <= 0) continue;
      this.acted.gather = (this.acted.gather ?? 0) + gained;
      const item = getItem(id);
      const noun = (item?.name ?? id).toLowerCase();
      // ── COALESCED, because a deed log is not a till roll ──
      // `deeds` is a ring buffer `AGENTS.logSize` deep and it is what a watcher
      // and the session report read. A body that picks up nine branches one at
      // a time would push the kill and the fire off the end of it with nine
      // near-identical lines. Consecutive pickups of the same thing grow one
      // line instead — which is also what a person would say.
      const last = this.deeds[this.deeds.length - 1];
      if (last && last.what === 'gather' && last.id === id) {
        last.n += gained;
        last.h = +this.hours.toFixed(2);
        last.text = `I picked up ${last.n} ${Agent.plural(noun, last.n)}`;
        continue;
      }
      const text = `I picked up ${gained > 1 ? `${gained} ${Agent.plural(noun, gained)}` : `a ${noun}`}`;
      // Memory only on the first of a run. It is a forty-entry ring shared with
      // everything the body notices, and re-stating a growing tally into it
      // would push out the deer and the wolf to say "and another branch".
      this.memory.add(this.hours, text);
      this.deeds.push({ h: +this.hours.toFixed(2), what: 'gather', id, n: gained, text });
      if (this.deeds.length > AGENTS.logSize) this.deeds.shift();
    }
  }

  /**
   * A make CONFIRMED — the thing the recipe promised, arriving in the pack.
   *
   * ── why this is not written where the button is pressed ──
   *
   * `notePack` already refuses to call a pickup a pickup unless the server's
   * own snapshot says the number went up. The craft deed had no such rule: it
   * was written the instant `i.craft` was set, so it counted presses. Two facts
   * make that wrong rather than merely untidy.
   *
   * A PRESS REPEATS. The pack arrives at 20 Hz and this body runs at 30, so
   * after the server has already cooked the steak `recipeToWork` still sees the
   * raw venison and asks again. One cook, two identical lines, same hour, in a
   * column five deep.
   *
   * A PRESS CAN FAIL IN SILENCE. `World.update` drops the craft if the fire is
   * out of its reach, if the inputs have gone, or if `maxHeld` is already met,
   * and says nothing to anybody. A body pressing at a dead fire all night read
   * as a body that cooked all night.
   *
   * So the recipe's own `outputs` are the test, and they run inside the window
   * the make already owns. Anything else that rises in that window stays
   * suppressed exactly as before — the conservative rule is untouched, this
   * only puts a name to the one rise it can actually account for.
   *
   * `_making` is cleared and `_made` is NOT: the window still has to swallow
   * whatever else the same snapshot brought, or the steak's own arrival could
   * be reported twice, once as a make and once as a find.
   */
  noteMake(before, iv) {
    const r = RECIPES[this._making ?? ''];
    if (!r) return;
    for (const id of Object.keys(r.outputs)) {
      const gained = (iv[id] ?? 0) - (before?.[id] ?? 0);
      if (gained <= 0) continue;
      this._making = null;
      const noun = (getItem(id)?.name ?? id).toLowerCase();
      // "I made", not the recipe's verb: the table's verbs are cook, fletch and
      // stitch, and conjugating them is a English problem this does not need to
      // have. What matters is that it does not read like "I picked up".
      const what = gained > 1 ? `${gained} ${Agent.plural(noun, gained)}` : `a ${noun}`;
      this.did('craft', `I made ${what} at the fire`);
      return;
    }
  }

  /**
   * Stalk, draw, loose. The body's half of hunting.
   *
   * The draw is a HELD state and the loose is its release: the server edge-
   * detects `intent.primary`, so an arrow leaves at the moment this goes from
   * true to false and at no other time. That makes the whole shot a small timer
   * rather than an event to schedule.
   *
   * `aimYaw`/`aimPitch` and not look deltas, for the reason in intents.js — an
   * agent is a network client and its deltas were being eaten by the send
   * throttle, so it believed it was facing its quarry while the server had it
   * pointing somewhere else. Absolute aim is what makes this possible at all.
   */
  /**
   * Everything solid near this body that is not the ground.
   *
   * Rebuilt only when we have walked out of the patch it was made for, because
   * the cell scan behind it is the expensive half and the arc walker calls the
   * result a few hundred times a shot. 90 m of timber around a body that will
   * not shoot past `AGENTS.shootRange` is generous on purpose: the arc, the
   * chord, and any spot we might step sideways to all have to be inside it.
   */
  timber() {
    const r = 90;
    const a = this._timberAt;
    if (!this._timber || !a || Math.hypot(this._x - a.x, this._z - a.z) > 25) {
      this._timber = timberBlocker(this._x, this._z, r);
      this._timberAt = { x: this._x, z: this._z };
    }
    return this._timber;
  }

  /**
   * A step aside has begun. Everything after this is measurement.
   *
   * WHY THIS EXISTS. `ground in the way` is the commonest refusal a hunting
   * body produces — twenty-four of them in one run, against a single arrow
   * loosed in two and a half minutes — and `clearSpotNear` was built precisely
   * to answer it. Nothing anywhere counted whether the answer was ever TRIED,
   * and nothing counted whether trying it ever produced a shot. So the fix and
   * the failure were indistinguishable: a body walking sideways for ever and a
   * body that never considered walking sideways both show up as silence.
   *
   * Worse, the detour branch RETURNS before the refusal log is written. Every
   * second spent stepping aside is therefore missing from the refusal table
   * too, which is why "24 x ground in the way" was only ever the refusals with
   * NO detour available — a different and much smaller thing than it read as.
   *
   * The episode is the unit, not the tick: one obstruction, one decision to go
   * round it, one outcome. See `endDetour` for the outcomes and `walkDetour`
   * for the number that matters.
   */
  openDetour(dist, step, blockedBy, along = 0) {
    this.detours ??= [];
    this._detour = {
      at: this.hours,
      d0: Math.round(dist),          // range to the quarry when we set off
      d: Math.round(dist),           // ...and at the last tick
      why: blockedBy ?? '?',         // ground or timber
      step,                          // the offset it first chose
      // ...and how far up the line of sight it went with it. Zero on the default
      // arm by construction, so a run that forgot to load the close arm says so
      // on every line rather than being inferred from a rate that moved.
      along: Math.round(along),
      x0: this._x, z0: this._z,
      lx: this._x, lz: this._z,
      lastStep: step,
      flips: 0,                      // sign changes: +6, then -6, then +6 again
      ticks: 0,
      secs: 0,
      walked: 0,                     // ground actually covered, integrated
      net: 0,                        // ...and how far that got us from where we began
      outcome: null,
      // ── the two numbers that say whether it COMMITTED ──
      // `resolves` is how many times `clearSpotNear` was asked during this one
      // episode: one is a body walking to a place it chose, a hundred and fifty
      // is a body having a fresh opinion every tick. It starts at 1 because the
      // solve that produced this episode has already happened by the time we get
      // here. `held` counts the ticks it walked to a remembered spot without
      // asking again, and `dropped` names what ended the last hold.
      resolves: 1,
      held: 0,
      dropped: null,
    };
    this.detours.push(this._detour);
    if (this.detours.length > AGENTS.logSize) this.detours.shift();
  }

  /**
   * One tick of walking sideways, measured.
   *
   * THE NUMBER THIS IS FOR IS `walked` AGAINST `net`. `clearSpotNear` is
   * re-solved every tick from wherever the body now stands, and its nearest
   * candidate is always six metres PERPENDICULAR to the current line of sight —
   * a line that rotates as the body moves. A spot six metres away that is still
   * six metres away after four seconds of walking is not a destination, it is an
   * orbit, and the body would circle the animal at constant range until the
   * check timed out. Path length over straight-line displacement says which of
   * those happened; neither number alone can.
   *
   * `flips` is the same failure seen from the other side: step right, re-solve,
   * find the best spot is now to the left, step back. That oscillation holds
   * `net` near zero while `walked` climbs.
   */
  walkDetour(dt, dist, step) {
    const ep = this._detour;
    if (!ep) return;
    ep.ticks++;
    ep.secs += dt;
    ep.walked += Math.hypot(this._x - ep.lx, this._z - ep.lz);
    ep.lx = this._x;
    ep.lz = this._z;
    ep.net = Math.hypot(this._x - ep.x0, this._z - ep.z0);
    ep.d = Math.round(dist);
    if (Math.sign(step) !== Math.sign(ep.lastStep)) ep.flips++;
    ep.lastStep = step;
  }

  /**
   * The step aside is over — and this is the half nobody had.
   *
   * `cleared the line` is the only outcome that means it worked. Everything
   * else is the body having walked for nothing, and they are worth telling
   * apart: still blocked by the same thing is a `clearSpotNear` that cannot
   * find a spot, `stood up instead` is the crouch fix getting there first, and
   * `lost the quarry` is the deer leaving while we walked — which on a long
   * enough orbit is what SHOULD happen.
   *
   * Idempotent, because it is called from four places and three of them are on
   * paths that also run when no detour was ever open.
   */
  /**
   * Where to step to — held across ticks instead of re-decided thirty times a
   * second.
   *
   * THE MEASURED BUG THIS IS FOR. `clearSpotNear` casts a twenty-metre probe
   * perpendicular to the line of sight, and that line rotates as the body walks.
   * Re-solved from scratch every tick, 13% of ground ticks came back null and
   * the body abandoned the walk a tenth of a second into it: sixteen episodes,
   * twenty metres walked in TOTAL, not one arrival. The answer was never a
   * better probe, it was remembering the answer.
   *
   * So: solve once, keep the spot in WORLD coordinates, and walk to it. Four
   * things end that walk, and only four —
   *
   *   arrived        within `AGENTS.detourArrive`; the walk did what it was for
   *   another animal `resolve` picks the nearest deer every 2.5 s and the spot
   *                  was chosen to see a specific one
   *   timed out      `AGENTS.detourHoldSeconds`; a walk that has not arrived
   *   no longer clear  one sightline from the FIXED spot to where the quarry is
   *                  NOW. This is the "the quarry moved materially" test and it
   *                  is better than a distance threshold, because what matters
   *                  is not how far the animal went but whether it went behind
   *                  the hill we were walking around.
   *
   * Everything else — the line clearing, standing up instead, losing the quarry
   * — comes through `endDetour`, which drops the held spot with the episode.
   *
   * `groundAt` and `solidAt` are arguments rather than module lookups so a check
   * can drive this against terrain it chose. The default is the real world.
   *
   * @returns {{x:number, z:number, step:number, held:boolean}|null}
   */
  detourSpot(dt, target, { groundAt = heightAt, solidAt = null } = {}) {
    const from = { x: this._x, y: this._y, z: this._z };
    // ── may a candidate close the range as well as step across it? ──
    // The second flag, and it is orthogonal to the commitment: it changes WHERE
    // the spots are, not how long the body remembers one. `advance: 0` is the
    // old candidate set, candidate for candidate. `minRange` is the floor the
    // stand-off already enforces on walking straight at an animal, applied to
    // the diagonal so a step aside cannot do what closing is forbidden to do.
    const shape = {
      solidAt,
      advance: this.closeDetour ? AGENTS.detourAdvance : 0,
      minRange: AGENTS.standOff,
    };
    // ── the control arm, and it must stay byte-identical ──
    // One call, no memory, exactly what the body did before any of this.
    if (!this.commitDetour) {
      const spot = clearSpotNear(from, target, groundAt, shape);
      if (spot) spot.held = false;
      this._resolves = (this._resolves ?? 0) + 1;
      // ── AND COUNTED ON THE EPISODE TOO, which it was not for one whole run ──
      // The first cut incremented only the body-global counter here, so every
      // uncommitted episode printed the `resolves: 1` that `openDetour` seeds —
      // "1.0 solves per detour" for an arm that re-solves thirty times a second.
      // The number was wrong in the direction that flattered the change, which
      // is the worst direction, and it is the fifth instrument in this project
      // to report something it had not measured.
      if (this._detour) this._detour.resolves = (this._detour.resolves ?? 0) + 1;
      return spot;
    }

    const qid = this.target?.id ?? null;
    const h = this._detourTo;
    if (h) {
      h.age += dt;
      const away = Math.hypot(h.x - this._x, h.z - this._z);
      const eyeY = groundAt(h.x, h.z) + PLAYER.eyeHeight;
      const stale =
        away <= AGENTS.detourArrive ? 'arrived'
          : h.qid !== qid ? 'another animal'
            : h.age > AGENTS.detourHoldSeconds ? 'timed out'
              : sightline(h.x, eyeY, h.z, target.x, target.y, target.z,
                          groundAt, 0.3, solidAt).blocked ? 'no longer clear'
                : null;
      if (!stale) {
        if (this._detour) this._detour.held = (this._detour.held ?? 0) + 1;
        return { x: h.x, z: h.z, step: h.step, along: h.along ?? 0, held: true };
      }
      // Named where the episode can print it: "walked 1 m, gave up because the
      // deer moved" and "walked 18 m and arrived" are the same abandonment to
      // every aggregate this project has.
      if (this._detour) this._detour.dropped = stale;
      this._detourTo = null;
    }

    const spot = clearSpotNear(from, target, groundAt, shape);
    this._resolves = (this._resolves ?? 0) + 1;
    if (this._detour) this._detour.resolves = (this._detour.resolves ?? 0) + 1;
    if (!spot) return null;
    this._detourTo = { x: spot.x, z: spot.z, step: spot.step, along: spot.along ?? 0, qid, age: 0 };
    return { ...spot, held: false };
  }

  endDetour(outcome) {
    // The episode and the held spot end together. Called on every path that
    // finishes a step aside — the line cleared, it stood up instead, it lost the
    // quarry, or there was nowhere to go — so a body never keeps walking to a
    // spot it chose for a situation that is over.
    this._detourTo = null;
    const ep = this._detour;
    if (!ep) return;
    this._detour = null;
    ep.outcome = outcome;
    ep.walked = Math.round(ep.walked);
    ep.net = Math.round(ep.net);
    ep.secs = Math.round(ep.secs * 10) / 10;
  }

  act_shoot(dt, i) {
    // ── AN EMPTY QUIVER, WHICH USED TO BE INVISIBLE FROM BOTH SIDES ──
    //
    // One mind spent an hour of a run drawing on a bow with no arrows in it —
    // its own `loosed` counter read 187 and climbing while nothing left the
    // string. Nothing stopped the body and nothing told the mind: `carrying`
    // filters to `n > 0`, so no arrows appeared as an ABSENCE IN A LIST, and a
    // model has to notice something missing to infer it cannot shoot.
    //
    // Both halves fixed here. The body stops miming the shot, and the mind is
    // told in words. Falling through to the goal is what gives `gather` and the
    // fire the chance to make more.
    if (this.count('arrow') <= 0) {
      this.noteOutcome('your quiver is empty — you cannot shoot until you make arrows');
      i.primary = false;
      this.drawFor = 0;
      return;
    }
    const t = this.target;
    const dx = t.x - this._x;
    const dz = t.z - this._z;
    const dist = Math.hypot(dx, dz);

    // Aim at the middle of the animal rather than the ground it stands on. Its
    // feet are a legal target and a wasted arrow.
    // Where it is GOING, not where the last packet drew it. The track is
    // measured here (see trackCreatures) and the interpolation lag is added on
    // top, because the position we are aiming from is already that far stale.
    const track = t.id != null ? this.tracks?.get(t.id) : null;
    const shot = aimAt(
      { x: this._x, y: this._y, z: this._z },
      { x: t.x, y: t.y + AGENTS.aimAboveFeet, z: t.z },
      heightAt,
      {
        maxRange: this.shootRange,
        velocity: track ? { x: track.vx, z: track.vz } : null,
        lag: NET.interpolationMs / 1000,
        // The body's own, off the snapshot. Not `PLAYER.eyeHeight`, which is
        // what a STANDING person's would be — and this one is crouched,
        // because it is stalking a deer.
        eye: this.eye ?? PLAYER.eyeHeight,
        // ...and the trees, which were invisible to every check the body made.
        solidAt: this.timber(),
      }
    );

    // Turn to it either way: walking toward something you are not facing is how
    // an agent ends up orbiting it.
    i.aimYaw = shot.yaw;
    this.yaw = shot.yaw;

    // ── if the ground is in the way, STAND UP before walking anywhere ──
    //
    // MEASURED, and it is the single biggest thing between this body and a
    // deer: thirty-two refusals in one run, every one of them "ground in the
    // way", at ranges of 15-27 m with the obstruction anywhere from 1 m to 26 m
    // out — and not one arrow loosed in two and a half minutes.
    //
    // The body stalks crouched, because `stalkWithin` is 45 m and a deer at 24
    // is inside that. Crouching drops the eye from 1.72 m to 1.05 m, and two
    // thirds of a metre of height is exactly what a lip of ground in front of
    // you costs. It was refusing shots that a standing archer has.
    //
    // So: solve it again from full height, and if THAT is clear, stand. It
    // takes about a fifth of a second for the eye to come up, the next tick
    // re-solves from the real height, and the ordinary path takes the shot. A
    // person on a slope does this without thinking about it.
    // ...and only for GROUND. Standing up clears a lip of turf and does
    // precisely nothing about an oak, so a body that answered every refusal by
    // straightening its knees would stand up in front of a tree and shoot it
    // again from four inches higher.
    const crouched = (this.eye ?? PLAYER.eyeHeight) < PLAYER.eyeHeight - 0.05;
    if (!shot.shoot && shot.blockedBy === 'ground' && crouched) {
      const standing = aimAt(
        { x: this._x, y: this._y, z: this._z },
        { x: t.x, y: t.y + AGENTS.aimAboveFeet, z: t.z },
        heightAt,
        {
          maxRange: this.shootRange,
          velocity: track ? { x: track.vx, z: track.vz } : null,
          lag: NET.interpolationMs / 1000,
          eye: PLAYER.eyeHeight,
          solidAt: this.timber(),
        }
      );
      if (standing.shoot) {
        i.crouch = false;
        i.forward = 0;
        i.sprint = false;
        i.primary = false;
        this.drawFor = 0;
        this.endDetour('stood up instead');
        if (this.shotWhy !== 'stand') {
          this.shotWhy = 'stand';
          this.memory.add(this.hours, `standing up to see over the ground at ${Math.round(dist)} m`, MINDS.weight.sighting);
        }
        return;
      }
    }

    if (!shot.shoot) {
      // Not a shot yet — so close the range, quietly. Whatever the reason is,
      // the answer is the same and it is the answer a person would reach for.
      this.drawFor = 0;
      i.primary = false;
      i.aimPitch = 0;
      // ── and never closer than this, however tempting ──
      //
      // Without a floor it walks until the sightline clears, and on rolling
      // ground that means walking onto the animal: measured misses reading "my
      // arrow hit ground 2 m away", which is an archer standing over a deer
      // shooting almost straight down at it while it bolts. A deer that lets
      // you get to 3 m has already decided to leave.
      //
      // If the line is still blocked at the stand-off, the honest answer is
      // that this is a bad place to shoot from. Holding here lets the animal
      // graze on, the ground change, or the mind pick another quarry — all of
      // which are better than closing until it runs.
      // ── if it is the GROUND, go round it rather than at it ──
      //
      // Closing was the only answer the body had, and against a crest closing
      // does not work: you walk until the deer bolts. A person steps sideways
      // and looks again. `clearSpotNear` finds the nearest place across the
      // line of sight that can actually see the animal, and we walk to that
      // instead — recomputed as we go, so it re-solves if the deer moves.
      // A tree is the case this was invented for, even more than a crest: you
      // do not shoot through it and you do not walk through it, you step round
      // it. `clearSpotNear` gets the blocker too, or "aside" just finds more
      // wood.
      // ...and once it has named a spot, GO TO IT. Re-solved from scratch every
      // tick this flickered null 13% of the time and the walk never completed;
      // `detourSpot` remembers the answer. Flag-gated — with `commitDetour` off
      // it is the same single `clearSpotNear` call it always was.
      const detour = shot.blockedBy
        ? this.detourSpot(dt, { x: t.x, y: t.y + AGENTS.aimAboveFeet, z: t.z },
                          { solidAt: this.timber() })
        : null;
      // ── WAS THERE ANYWHERE TO GO? ──
      //
      // Twenty-three ground refusals against two detours in one measured run
      // implies this returns null almost every time — but that is arithmetic on
      // two transition counts, and inferring a mechanism from two counts is how
      // three separate instruments in this project came to lie. So it is
      // counted where it happens, per tick, with the blocker named: `asked` is
      // how often the body wanted a way round and `none` is how often there was
      // not one. The RATIO is the finding. See huntcheck.
      if (shot.blockedBy) {
        this.detourAsked ??= { ground: 0, timber: 0 };
        this.detourNone ??= { ground: 0, timber: 0 };
        const k = shot.blockedBy === 'timber' ? 'timber' : 'ground';
        this.detourAsked[k]++;
        if (!detour) this.detourNone[k]++;
      }
      if (detour) {
        const bx = detour.x - this._x;
        const bz = detour.z - this._z;
        if (Math.hypot(bx, bz) > 2) {
          i.aimYaw = Math.atan2(-bx, -bz);
          this.yaw = i.aimYaw;
        }
        i.forward = 1;
        i.sprint = false;
        i.crouch = dist < AGENTS.stalkWithin;
        if (this.shotWhy !== 'detour') {
          this.shotWhy = 'detour';
          this.memory.add(this.hours, `stepping ${Math.abs(detour.step)} m aside for a clear line`, MINDS.weight.sighting);
          this.openDetour(dist, detour.step, shot.blockedBy, detour.along ?? 0);
        }
        this.walkDetour(dt, dist, detour.step);
        return;
      }
      this.endDetour(shot.why);
      i.forward = dist > AGENTS.standOff ? 1 : 0;
      i.sprint = false;
      i.crouch = dist < AGENTS.stalkWithin; // stop spooking it
      if (this.shotWhy !== shot.why) {
        this.shotWhy = shot.why;
        this.memory.add(this.hours, `no shot at ${Math.round(dist)} m — ${shot.why}`, MINDS.weight.sighting);
        // ...and SAID SO to the next decision. This fired 400+ times in one
        // half-hour run while the mind chose `hunt` again and again, because
        // nothing anywhere told it the shot had been refused.
        this.noteOutcome(`your shot was refused at ${Math.round(dist)} m — ${shot.why}`);
        // ── and kept where the ring buffer cannot lose it ──
        // A refusal is the commonest thing that happens to a hunting body and
        // the least visible: it produces no arrow, no event and no line anybody
        // reads. Counted by REASON with the range attached, because "eighteen
        // refusals" and "eighteen refusals, all of them ground at 1 m while the
        // deer stood at 24" are different bugs.
        this.refusals ??= [];
        // `d` is the range to the ANIMAL, horizontally. `slant`/`dy`/`leadBy`
        // come back only from `too far`, and they are the three numbers that
        // say why a deer standing at 20 m was out of range of a 26 m bow: how
        // far the arrow actually has to fly, how much of that is the climb, and
        // how much of it the body added itself by aiming ahead of a running
        // animal. Recorded, not acted on.
        this.refusals.push({
          d: Math.round(dist),
          why: shot.why,
          ...(shot.slant != null ? { slant: shot.slant, dy: shot.dy, leadBy: shot.leadBy } : {}),
        });
        if (this.refusals.length > AGENTS.logSize) this.refusals.shift();
      }
      return;
    }

    // ── a shot is on ──
    // ...and if we were stepping aside, the step is over. NOT "the detour
    // worked": the first live reading of this ended two episodes with a shot
    // after 0 m and 1 m of walking, which is the line clearing on its own while
    // a detour happened to be open. An outcome that names a CAUSE it cannot
    // observe is how `hit` and `along` both lied, so this one names only what
    // it saw — the walk is printed beside it and the reader can judge.
    this.endDetour('a shot came on');
    this.shotWhy = null;
    i.aimPitch = shot.pitch;
    i.forward = 0;            // spread opens up if you are moving; stand still
    i.sprint = false;
    i.crouch = true;

    this.drawFor = (this.drawFor ?? 0) + dt;
    if (this.drawFor < 0) { i.primary = false; return; } // still recovering

    // Past a full draw and comfortably under BOW.holdFatigue, where the aim
    // starts to shake.
    if (this.drawFor < BOW.drawTime + AGENTS.drawMargin) {
      i.primary = true;
      return;
    }
    i.primary = false; // release: THIS is the arrow
    this._looseWhy = 'aimed';
    this.arrows = (this.arrows ?? 0) + 1;
    // ── ...AND A RECORD OF EVERY ARROW, NOT ONLY THE ONES THAT MISSED ──
    //
    // `shots` is pushed by `howItMissed`, which only ever runs off a `miss`
    // event — and a `wound` sets `lastShot = null` because there is no miss
    // left to measure. So `shots` is the MISSES, and anything counting arrows
    // out of it is blind to every arrow that went home.
    //
    // That is not hypothetical. The reach sentinel in huntcheck counted slants
    // out of `shots` and printed *"0 of 0 arrows — no arrows, so this run says
    // nothing about the arm"* on a run that loosed one and wounded a deer with
    // it. An instrument that goes silent exactly when the treatment WORKS
    // reports the arm as unproven whenever it succeeds, which is the worst
    // direction for a sentinel to fail in.
    //
    // One entry per release, written before anything can happen to the shaft,
    // and holding the number the ceiling rule is written in. Bounded like
    // `refusals` so a long run cannot grow it without limit.
    const slant = shot.mark && shot.eyeY != null
      ? +Math.hypot(shot.dist, shot.mark.y - shot.eyeY).toFixed(1)
      : null;
    this.loosed ??= [];
    this.loosed.push({
      h: +this.hours.toFixed(2),
      dist: shot.dist == null ? null : +shot.dist.toFixed(1),
      slant,
      quarryId: t.id,
    });
    if (this.loosed.length > AGENTS.logSize) this.loosed.shift();
    // ── what this shot was FOR, kept until we hear where it went ──
    // The instrument. An aggregate miss count cannot tell an over-lead from an
    // under-lead from a systematically low arc; the same count comes out of all
    // three, which is how three passes of tuning constants moved the failure
    // around without fixing it. Held here and cashed in by `remember`.
    this.lastShot = {
      from: { x: this._x, y: this._y, z: this._z },
      mark: shot.mark,
      // WHICH ANIMAL this was for, so the miss can be measured against the deer
      // and not only against our own aim point. See `howItMissed`.
      quarryId: t.id,
      dist: shot.dist,
      // ── AND THE SLANT, which is the number the rule is actually written in ──
      //
      // `dist` is horizontal. `AGENTS.shootRange` is compared against the
      // SLANT — the range the arrow flies — and the difference is the climb,
      // which on this terrain runs 6-18 m. Nothing recorded it, so no
      // instrument downstream could say how far a loosed arrow had been asked
      // to fly, and an A/B on the ceiling had no number that is 0 above 26 on
      // one arm and non-zero on the other BY CONSTRUCTION. See `huntcheck`.
      slant,
      pitch: shot.pitch,
      yaw: shot.yaw,
      eye: this.eye ?? PLAYER.eyeHeight,
      // ── HOW FAR AHEAD OF THE ANIMAL WE AIMED, and how far below or above ──
      //
      // The first red-run reading of the LEAD column came back 3 arrows out of
      // 3 to the LEFT, mean 3.6 m — which is the sign split that column was
      // built to show, and it accuses the lead rather than the arc. But three
      // arrows is not a finding, and one of those three was solved at a 3.04°
      // pitch for a deer at 19.9 m with our own model saying it would come down
      // at 93.4 m. Neither a lead nor an arc explains a number like that on its
      // own, so record BOTH inputs at the moment of release: how far the mark
      // sat from the animal's actual position, and the height difference the
      // arc was solved against. A 9 m lead is the tracker; a 0.5 m lead with a
      // 3° pitch is the pitch solver, and no aggregate of misses tells them
      // apart.
      leadBy: shot.mark ? +Math.hypot(shot.mark.x - t.x, shot.mark.z - t.z).toFixed(1) : null,
      dropTo: +((t.y + AGENTS.aimAboveFeet) - (this._y + (this.eye ?? PLAYER.eyeHeight))).toFixed(1),
      // ...and where our own model of the bow says this arrow comes down. The
      // control for the whole measurement — see `predictLanding`.
      predicted: predictLanding(
        { x: this._x, y: this._y, z: this._z },
        this._y + (this.eye ?? PLAYER.eyeHeight),
        shot.pitch,
        shot.yaw,
        heightAt
      ),
    };
    this.memory.add(this.hours, `I loosed at ${Math.round(dist)} m`);
    // Negative, so the next few ticks are a pause rather than an instant redraw.
    this.drawFor = -(BOW.cooldown + AGENTS.betweenShots);
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
    // ── AN ORDER HAS TO LOOK LIKE AN ORDER ──
    //
    // This used to test the whole sentence for a keyword anywhere in it, and a
    // 199-step playtest showed what that costs. The tally from that session:
    //
    //     stay still and watch   156
    //     stay with Jack         120
    //     hunt a troll            16
    //     hunt a is/from/to       36
    //
    // He froze his own war band TEN TIMES more often than he pointed it at the
    // troll, using ordinary tactical chatter — "hold on, the troll is to the
    // north", "wait for me", "I will stop it with arrows" all matched the halt
    // rule. "shoot from the ridge" sent eight agents hunting a creature called
    // `from`. He then spent the session concluding, reasonably, that the order
    // path was switched off.
    //
    // So: an order must OPEN the sentence, optionally after somebody's name.
    // Anything else is talk, and talk goes to the mind as it always did — the
    // `decides` behaviour, so nothing is ever swallowed.
    const raw = String(text).trim();

    // ── WHO IT IS FOR ──
    //
    // "Ailsa, follow me" used to be taken by all eight, because the name was
    // never read. A leading name addresses ONE body; without one it is said to
    // the whole band, which is what you want for "kill the troll".
    const addressed = /^\s*([a-z][a-z'’-]{1,17})\s*[,:]\s*(.+)$/i.exec(raw);
    let body = raw;
    if (addressed) {
      const who = addressed[1];
      const forMe = who.toLowerCase() === this.name.toLowerCase();
      const known = forMe
        || [...(this.others?.values() ?? [])].some((n) => String(n).toLowerCase() === who.toLowerCase());
      if (known) {
        // Addressed to somebody in this world. If that is not me, it is not my
        // order — which is the whole point: "Ailsa, follow me" used to be taken
        // by all eight bodies at once.
        if (!forMe) return false;
        body = addressed[2];
      } else {
        // Not a name anybody answers to, so it is a filler — "Right, follow
        // me", "Ok, wait", "Listen, kill the troll". Drop it and read the rest
        // as the order it plainly is.
        body = addressed[2];
      }
    }

    const t = body.toLowerCase().trim();

    // "follow me", "stay with me", "come with me" — and only at the front.
    if (/^(follow|stay with|come with|stick with)\s+me\b/.test(t)) {
      this.setOrder({ kind: 'follow', target: from }, from);
      return true;
    }
    // "guard me", "cover me", "watch my back"
    if (/^(guard|cover|protect)\s+me\b/.test(t) || /^watch my back\b/.test(t)) {
      this.setOrder({ kind: 'guard', target: from }, from);
      return true;
    }
    // "wait", "hold", "stay here", "stop". Anchored, so "hold on, the troll is
    // north" and "wait for me" are conversation and not a halt for everybody.
    if (/^(wait|hold on|hold|stop)( (here|there|up|position|put))?\s*[.!]?$/.test(t)
      || /^(stay|hold) (here|put|there)\s*[.!]?$/.test(t)) {
      this.setOrder({ kind: 'hold' }, from);
      return true;
    }
    // "kill the troll", "attack that bear", "shoot the deer".
    //
    // The quarry must be a creature this world actually has. `hunt a from` was
    // eight bodies walking after a preposition, and the reflex layer can only
    // refuse it — quietly, for ever.
    const quarry = /^(kill|attack|shoot|hunt)\s+(?:the\s+|that\s+|a\s+|an\s+)?([a-z]+)\b/.exec(t);
    if (quarry && ORDERABLE_QUARRY.has(quarry[2])) {
      this.setOrder({ kind: 'hunt', quarry: `a ${quarry[2]}` }, from);
      return true;
    }
    // "go on", "carry on", "as you were" — hands them back to themselves
    if (/^(carry on|go on|as you were|you are free|do what you like)\b/.test(t)) {
      this.setOrder({ kind: 'wander' }, from);
      return true;
    }
    return false;
  }

  setOrder(goal, from = null) {
    this.goal = goal;
    this.goalCounts[goal.kind] = (this.goalCounts[goal.kind] ?? 0) + 1;
    // ── WHO IS UNDER ORDERS, AND WHOSE ──
    //
    // A playtester spent a whole session unable to tell whether the order path
    // was live, concluded from the SOURCE that it was off, and reported that —
    // while the log recorded 428 orders taken. Nothing on any screen said a
    // body was under orders, or what the order was, or who gave it. So the
    // board says it now, and it is worth more than the order itself: an order
    // you cannot see obeyed is indistinguishable from one nobody heard.
    this.ordered = true;
    this.orderedTo = describeGoal(goal);
    // WHO SAID IT, not who it is about. Read off `goal.target` first, which is
    // the speaker for `follow`/`guard` and UNDEFINED for a hunt — so the board
    // showed "under orders by None" for every hunt order given, which is the
    // one question the column exists to answer. Seen in the first live run
    // after shipping it: eight bodies under orders and no way to tell whose.
    this.orderedBy = from ?? goal.target ?? null;
    this.orderedAt = this.hours;
    // A HUMAN gave this order. Weighted like being shot, because the one thing
    // worse than a companion that ignores you is one that forgets you asked.
    this.memory.add(this.hours, `I was told to ${describeGoal(goal)}`, MINDS.weight.shot);
    this.onLog?.(`${this.name}: ${describeGoal(goal)} (ordered)`);

    // ── AND SAY SO, IN THE WORLD, WHERE THE PERSON WHO ASKED CAN HEAR IT ──
    //
    // The board knowing is not enough. A playtester ran a whole session unable
    // to tell whether anything he said was landing, and concluded from the
    // source that the order path was off — while 428 orders were being taken
    // around him. An order acknowledged out loud would have settled it in one
    // sentence, in the first minute.
    //
    // Safe against a feedback loop by construction: `takeOrder` only matches an
    // order at the START of a sentence, and none of these acknowledgements
    // begins with one. "right, following you" is not "follow me".
    const nod = goal.kind === 'follow' ? 'right, following you'
      : goal.kind === 'guard' ? 'right, watching your back'
        : goal.kind === 'hold' ? 'right, holding here'
          : goal.kind === 'hunt' ? `right, going for ${goal.quarry ?? 'it'}`
            : 'right, back to my own business';
    this.send(C_CHAT, { m: nod });
  }

  resolve(g) {
    const s = this.snapshot;
    // ── THE NEAREST ONE, not the first one in the packet ──
    //
    // These returned whatever the snapshot happened to list first, and a
    // snapshot is in creature-id order — so "hunt a deer" regularly meant a
    // particular deer three hundred and fifty metres away with four others
    // grazing at twenty. Measured in huntcheck's refusal log: "too far (deer at
    // 22-358 m)", over and over, while the body walked past the one it could
    // have shot. It also thrashes, because `resolve` re-runs every 2.5 s and
    // the answer flips with the id order as creatures spawn and cull.
    const nearestOf = (pred, withHeight) => {
      let best = null;
      let bestD = Infinity;
      const weigh = (label, thing, y, id) => {
        if (!pred(label, thing)) return;
        const d = Math.hypot(thing.p[0] - this._x, thing.p[2] - this._z);
        if (d >= bestD) return;
        bestD = d;
        best = withHeight
          ? { x: thing.p[0], y, z: thing.p[2], id }
          : { x: thing.p[0], z: thing.p[2] };
      };
      for (const c of s?.cr ?? []) weigh(`a ${c.k}`, c, c.p[1], c.i);
      for (const p of s?.pl ?? []) weigh(this.others.get(p.id) ?? 'someone', p, p.p[1], undefined);
      return best;
    };
    const find = (pred) => nearestOf(pred, false);
    // The same search, keeping the height. Anything that is going to be SHOT at
    // needs it; anything that is only going to be walked to does not, and the
    // ground answers for itself on the way.
    const findFull = (pred) => nearestOf(pred, true);
    // ── EVERY PLAYER, AT ANY RANGE ──
    //
    // `find` is bounded by what `brief()` reports, which stops at 140 m. This
    // is not: the server sends every player every tick with exact coordinates,
    // and a name you have been told is out there has to be a name you can walk
    // towards. Players only — you do not keep track of a deer over the horizon.
    const anyone = (pred) => {
      let best = null;
      let nearest = Infinity;
      for (const p of this.snapshot?.pl ?? []) {
        const label = this.others.get(p.id);
        if (!label || !pred(label)) continue;
        const d = Math.hypot(p.p[0] - this._x, p.p[2] - this._z);
        if (d < nearest) { nearest = d; best = { x: p.p[0], y: p.p[1], z: p.p[2], id: p.id }; }
      }
      return best;
    };
    switch (g.kind) {
      // Walk to the nearest branch and PRESS E when you get there.
      //
      // The snapshot carries players, creatures and arrows — no pickups, and it
      // never will, because deadfall is a pure function of the seed and both
      // ends compute it rather than shipping it. That is the same trick the
      // terrain and the place names already use, and it is why an agent can
      // walk to a branch it was never told about. See world/pickups.js.
      // ── gather: WHATEVER IS LYING ABOUT, not firewood specifically ──
      //
      // This used to go to `nearestDeadfall` and nothing else, so "pick up what
      // is lying about" meant "walk to the nearest branch" — even standing on a
      // fresh carcass. With an item named it goes to that; without one it goes
      // to whichever of the nearest drop and the nearest branch is ACTUALLY
      // nearer, which is what the English means.
      //
      // `makeCamp` is deliberately left alone below: it means "a place with fuel
      // in reach" and must not start walking to carcasses.
      case 'gather': {
        const want = typeof g.item === 'string' ? g.item : '';
        const drop = this.nearestDrop(want);
        const wood = want && !namesTheSame('wood', want) && !namesTheSame('branches', want)
          ? null
          : nearestDeadfall(this._x, this._z, undefined, this.taken);
        if (want && !drop && !wood) {
          this.refuse('gather', `there is no ${want} lying about that you can see`);
          return this.roam();
        }
        const dDrop = drop ? Math.hypot(drop.x - this._x, drop.z - this._z) : Infinity;
        const dWood = wood ? Math.hypot(wood.x - this._x, wood.z - this._z) : Infinity;
        if (drop && dDrop <= dWood) return { x: drop.x, z: drop.z, act: 'interact', within: REACH };
        if (wood) return { x: wood.x, z: wood.z, key: wood.key, act: 'interact', within: REACH };
        return this.roam();
      }
      // Camp is a place with fuel in reach, so this is gather with a reason.
      // It used to fall through to `roam()` — which meant an agent that decided
      // to make camp did precisely what an agent that decided to wander did,
      // and the report counted it as a distinct activity. It was not one.
      case 'makeCamp': {
        const wood = nearestDeadfall(this._x, this._z, 60, this.taken);
        return wood ? { x: wood.x, z: wood.z, key: wood.key, act: 'interact', within: REACH } : this.roam();
      }
      // ── standing orders ──
      // Both resolve to "be near them", and the difference is what happens when
      // something attacks: `guard` breaks off to deal with it (see update()),
      // `follow` does not. Keeping a respectful distance rather than standing
      // in their pocket — a companion that walks into your back while you draw
      // is worse company than one twelve metres away.
      case 'follow':
      case 'guard': {
        // `label === g.target` was a STRICT equality here — the same class of
        // bug as the original quarry mismatch, where `label === g.quarry`
        // against labels carrying their article meant five models fired zero
        // arrows across 400 decisions. "Follow Eachann" worked; anything a
        // model actually writes around a name did not.
        const who = find((label) => namesTheSame(label, g.target))
          ?? anyone((label) => namesTheSame(label, g.target));
        if (!who) {
          this.refuse(g.kind, `there is nobody called "${g.target}" to ${g.kind}`);
          return this.roam();
        }

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
      // ── the only goal that ends in a shot ──
      // Carries `y` and a `quarry` flag, which nothing else does. Height is not
      // decoration here: the whole difference between a shot and an arrow in a
      // hillside is how far above or below you the animal is standing, and
      // `find` throws that away. See `act` for what is done with it.
      case 'hunt': {
        const q = findFull((label) => namesTheSame(label, g.quarry));
        if (q) return { x: q.x, y: q.y, z: q.z, id: q.id, quarry: true };
        // Common and not an error — but the mind has to know the difference
        // between hunting and walking, or it will keep choosing `hunt` at an
        // empty hillside. Consecutive lines collapse to "(N times)".
        this.refuse('hunt', `there is no ${g.quarry ?? 'quarry'} in sight — you are searching, not hunting`);
        return this.roam();
      }
      // Walk to the person and hand it over. `within: REACH` and not the
      // six-metre `arriveWithin`, for the reason `gather` learned the hard way:
      // arriving somewhere and being able to touch something are different
      // distances, and a verb that uses its hands has to say which it means.
      case 'give': {
        const who = find((label) => namesTheSame(label, g.target)) ?? anyone((label) => namesTheSame(label, g.target));
        if (!who) {
          this.refuse('give', `there is nobody called "${g.target}" to give anything to`);
          return this.roam();
        }
        return {
          x: who.x, z: who.z, within: REACH,
          act: 'give', actValue: g.target, actAlso: { giveItem: g.item ?? '' },
        };
      }
      // Same shape as `hunt`, because from the body's point of view it IS hunt:
      // `quarry: true` is what routes a target into the shoot path, and the bow
      // does not care what it is pointed at. The judgement stays upstairs and
      // the world still has the last word — `canHarm` refuses on settled ground
      // and inside a party, and says so with a `glance`.
      case 'attack': {
        const who = findFull((label) => namesTheSame(label, g.target));
        if (who) return { x: who.x, y: who.y, z: who.z, id: who.id, quarry: true };
        this.refuse('attack', `there is nobody called "${g.target}" in sight to attack`);
        return this.roam();
      }
      // A bargain costs the same walk a gift does. `offer` could in principle be
      // shouted across a clearing, but making both halves of a trade require
      // arriving keeps the whole economy physical — you go to the market.
      case 'offer': {
        const who = find((label) => namesTheSame(label, g.target)) ?? anyone((label) => namesTheSame(label, g.target));
        if (!who) {
          this.refuse('offer', `there is nobody called "${g.target}" to make an offer to`);
          return this.roam();
        }
        return {
          x: who.x, z: who.z, within: REACH, act: 'offer', actValue: g.target,
          actAlso: { offerItem: g.item ?? '', offerWant: g.want ?? '' },
        };
      }
      case 'accept': {
        const who = find((label) => namesTheSame(label, g.target)) ?? anyone((label) => namesTheSame(label, g.target));
        if (!who) {
          this.refuse('accept', `there is nobody called "${g.target}" whose offer you could take`);
          return this.roam();
        }
        return { x: who.x, z: who.z, within: REACH, act: 'accept', actValue: g.target };
      }
      // ── approach: a person you can see, OR one you only know the way to ──
      //
      // `find` searches the CONTACTS, which stop at `AGENTS.noticeRange`. Past
      // that, `anyone` searches every player in the snapshot — which the server
      // sends unculled — so a mind that has been told "also out there:
      // Coinneach, a long way south-west" can actually set off south-west.
      //
      // The mind still only KNOWS the bearing; the body walks the line. That is
      // what setting off to find somebody is.
      case 'approach': {
        const who = find((label) => namesTheSame(label, g.target))
          ?? anyone((label) => namesTheSame(label, g.target));
        if (who) return who;
        this.noteOutcome(`there is nobody called "${g.target}" anywhere you know of`);
        return this.roam();
      }
      // ── goTo: A VERB THAT HAS NEVER ONCE WORKED ──
      //
      // `goTo` is in GOAL_IDS, the system prompt advertises it — "goTo takes
      // place" — and this switch had NO CASE FOR IT. It fell through to
      // `default: return this.roam()`, so every mind that ever decided to make
      // for a named place wandered at random instead. The 2026-08-08 run logged
      // "make for Hollowed Beinn" and "make for Sunny Muir" and I read the
      // convergence that followed as navigation; it was two bodies roaming near
      // the same hill.
      //
      // `findDistrict` is the exact inverse of `describePosition`, which is what
      // names a mind's own position for it — so the gazetteer it is already
      // being read out of is the one it can now walk to. A person first,
      // because "goTo Eachann" is a thing a model plainly means.
      case 'goTo': {
        // A string, defensively. `sanitiseGoal` guarantees one, but `resolve` is
        // also called straight from orders and from checks, and a throw in here
        // lands in the provider's catch and silently scripts the agent for ever.
        const target = typeof (g.place ?? g.target) === 'string' ? (g.place ?? g.target) : '';
        const who = find((label) => namesTheSame(label, target))
          ?? anyone((label) => namesTheSame(label, target));
        if (who) return who;
        const place = target && findDistrict(target, this._x, this._z);
        if (place) return { x: place.x, z: place.z };
        this.noteOutcome(`you do not know the way to "${target}"`);
        return this.roam();
      }
      case 'avoid': {
        const from = find((label) => namesTheSame(label, g.target));
        if (!from) {
          this.refuse('avoid', `there is no "${g.target}" near you to keep away from`);
          return this.roam();
        }
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

  /**
   * The nearest thing lying on the ground, optionally by name.
   *
   * Off `snapshot.lo`, which carries only DROPPED things — kill loot and what
   * people threw down. Deadfall is not in there and does not need to be: it is
   * a pure function of the seed and `nearestDeadfall` computes it locally.
   */
  nearestDrop(want = '') {
    let best = null;
    let nearest = Infinity;
    for (const l of this.snapshot?.lo ?? []) {
      if (want && !namesTheSame(itemWords(l.i, l.n), want) && !namesTheSame(l.i, want)) continue;
      const d = Math.hypot(l.p[0] - this._x, l.p[2] - this._z);
      if (d < nearest) { nearest = d; best = { x: l.p[0], z: l.p[2], item: l.i, count: l.n }; }
    }
    return best;
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
      persona: this.persona?.id ?? null,
      // What it is doing AND WHY, for anything drawing a live board.
      why: this.goal?.why ?? null,
      goal: describeGoal(this.goal),
      decisions: this.decisions,
      remembers: this.memory.all().length,
      others: this.others.size,
      thinking: this.thinking,
      lastError: this.lastError ?? null,
      tokens: this.tokensIn + this.tokensOut,
    };
  }
}

/**
 * Does what a mind SAID match what the world CALLS the thing?
 *
 * ── THIS WAS AN `===` AND IT WAS THE WHOLE BLOCKER ──
 *
 * Every contact is labelled with its article — `a deer`, `a goblin` (see the
 * `weigh(\`a ${c.k}\`, …)` calls in `resolve`). The goal came back from the
 * model as whatever the model felt like writing, and the two were compared with
 * `label === g.quarry`. Anything that did not match EXACTLY fell through to
 * `roam()`, silently: the mind had decided to hunt and the body wandered off,
 * with no refusal, no log line and no counter anywhere saying so.
 *
 * Measured over two live runs of six models and ~400 decisions:
 *
 *     "a deer"                      matched   -> 37 arrows   (kimi, the only one)
 *     "deer"                        no match  -> wandered
 *     "deer south-west"             no match  -> wandered
 *     "deer close to the north"     no match  -> wandered
 *     "deer 180 m north"            no match  -> wandered
 *
 * Five models, zero arrows, and it was one missing indefinite article. It broke
 * `avoid` the same way, so "keep away from goblin" was a body strolling about
 * near a goblin. This is why the SCRIPTED control out-hunted every model twice:
 * it calls `setOrder({ quarry: \`a ${…}\` })` and matched by construction.
 *
 * Matched on the WORD rather than by substring so `deer` cannot match
 * `deerhound` and `goblin` can never match a `deer`. A model that says
 * something genuinely unmatchable still falls through to `roam()` exactly as
 * before — this widens what counts as a match, it does not invent one.
 */
export function namesTheSame(label, said) {
  if (!label || !said) return false;
  const bare = (v) => String(v).toLowerCase().replace(/^(?:a|an|the)\s+/, '').trim();
  const l = bare(label);
  const s = bare(said);
  if (!l || !s) return false;
  if (l === s) return true;
  // Escape anything regex-special in a label before it becomes a pattern —
  // labels come from the species table and from player names, and a name with
  // a bracket in it should not be able to build a broken expression.
  const word = l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${word}\\b`).test(s);
}

// Which foods are already a meal, built from the same table `EDIBLE` is built
// from. A cooked thing is one that does not spoil — that is what cooking IS in
// this model, and hard-coding the two ids here would go stale the first time
// anybody smoked a fish.
const COOKED = Object.entries(SURVIVAL.food)
  .filter(([, f]) => !f.spoils)
  .map(([id]) => id);

/**
 * "2 branches", "1 cooked venison". The item table's own words, lower-cased,
 * because this ends up in the middle of a sentence in a prompt.
 */
function itemWords(id, n) {
  const name = (getItem(id)?.name ?? id.replace(/_/g, ' ')).toLowerCase();
  return n > 1 ? `${name}${/(s|x|ch)$/.test(name) ? 'es' : 's'}` : name;
}

function howFar(d) {
  if (d < 6) return 'right here';
  if (d < 20) return 'close';
  if (d < 55) return 'a little way off';
  if (d < 130) return 'far off';
  return 'a long way off';
}
