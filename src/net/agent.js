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
import { bearingName, describePosition } from '../world/placenames.js';
// What can be made, and out of what. Pure data and one pure predicate, shared
// with the browser's prompt and with the server that resolves the act — three
// callers, one table, which is the only way "cook" means the same thing in all
// three places.
import { RECIPES, canCraft } from '../items/recipes.js';
import { EDIBLE, getItem } from '../items/registry.js';
import { AGENTS, BOW, PLAYER, NET, SURVIVAL, PICKUP } from '../config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// How close a body walks to something it means to pick up. Inside
// `PICKUP.radius` with margin to spare, because the last word on where it is
// standing belongs to the server and dead reckoning is only ever nearly right.
const REACH = PICKUP.radius * 0.7;

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
                cadenceSeconds = AGENTS.cadenceSeconds }) {
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
            this.memory.add(this.hours, `${msg.data.n} said "${msg.data.m}"`);
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
        if (mine) this.memory.add(this.hours, `my arrow hit ${e.hit} ${e.d} m away — ${this.howItMissed(e)}`);
        break;
      case 'hit':
        if (mine) this.memory.add(this.hours, `my arrow struck someone for ${e.dmg}`);
        else if (atMe) this.memory.add(this.hours, `an arrow hit me for ${e.dmg}`);
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
            `my arrow went into the ${e.n.toLowerCase()} — ${e.dmg} damage, it is still up with ${e.hp} left`);
        }
        break;
      case 'glance':
        if (mine || atMe) this.memory.add(this.hours, `an arrow was refused — ${e.why}`);
        break;
      case 'kill':
        // Not gated on `mine`: a carcass on the ground is worth knowing about
        // however it got there. This is the entry that makes scavenging
        // somebody else's kill a thing a mind can decide to do.
        this.memory.add(this.hours, `a ${e.n.toLowerCase()} went down near ${Math.round(e.at[0])},${Math.round(e.at[2])}`);
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
        this.memory.add(this.hours, `${e.n} was killed by ${e.by} ${e.where ?? ''}`.trim());
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
        for (const c of seen) this.memory.add(this.hours, `${c.what} ${c.distance}, ${c.doing}`);
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
        // Only stated when it MATTERS — inside bow range. At 120 m "you have a
        // clear line" is not information, it is noise in the prompt.
        // ...and "inside bow range" is THIS body's bow range, not the constant.
        // A body raised to 40 m that is still told nothing about its line at 32
        // is being asked to decide with the old rule's information.
        sight: clear === null || d > this.shootRange ? null
          : clear ? 'a clear line' : 'no clear line — ground in the way',
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
        p.x ? 'down' : p.h < 45 ? 'badly hurt' : 'unhurt',
        p.p[1]
      );
    }
    for (const c of s?.cr ?? []) {
      add(`a ${c.k}`, c.p[0], c.p[2], c.s, c.h < 30 ? 'wounded' : 'unhurt', c.p[1]);
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
          this.onLog?.(`${this.name}: ${describeGoal(goal)}${goal.why ? ` — ${goal.why}` : ''}`);
          // ── the thread a watcher follows ──
          // Kept out of `Memory`'s forty-entry ring buffer, which fills with
          // noticing: an hour of walking past deer and a body has forgotten it
          // ever decided anything. `intentions` is the log of what it MEANT,
          // with the reason it gave, and it is what makes a session legible
          // afterwards — "three models disagreed about a carcass" is a story
          // you can only tell if each of them said why.
          this.intentions.push({
            h: +this.hours.toFixed(2),
            goal: describeGoal(goal),
            why: goal.why ?? null,
            where: this.where(),
          });
          if (this.intentions.length > AGENTS.logSize) this.intentions.shift();
          this.narrate(goal);
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
    i.interact = i.drop = i.place = i.eat = i.jump = i.letdown = false;
    i.craft = '';

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
    if (this.count('wood') > 0 && !near && this.placeCooling === 0) {
      i.place = true;
      i.forward = 0;
      this.placeCooling = AGENTS.relightSeconds;
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
  did(what, text = null) {
    this.acted[what] = (this.acted[what] ?? 0) + 1;
    if (!text) return;
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
          this.memory.add(this.hours, `standing up to see over the ground at ${Math.round(dist)} m`);
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
          this.memory.add(this.hours, `stepping ${Math.abs(detour.step)} m aside for a clear line`);
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
        this.memory.add(this.hours, `no shot at ${Math.round(dist)} m — ${shot.why}`);
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
        return wood ? { x: wood.x, z: wood.z, key: wood.key, act: 'interact', within: REACH } : this.roam();
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
      // ── the only goal that ends in a shot ──
      // Carries `y` and a `quarry` flag, which nothing else does. Height is not
      // decoration here: the whole difference between a shot and an arrow in a
      // hillside is how far above or below you the animal is standing, and
      // `find` throws that away. See `act` for what is done with it.
      case 'hunt': {
        const q = findFull((label) => label === (g.quarry ?? ''));
        return q ? { x: q.x, y: q.y, z: q.z, id: q.id, quarry: true } : this.roam();
      }
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
      persona: this.persona?.id ?? null,
      // What it is doing AND WHY, for anything drawing a live board.
      why: this.goal?.why ?? null,
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
