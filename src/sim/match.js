// ── match.js — king of the hill, the whole mode in one file ─────────────────
//
// OFF IS THE DEFAULT AND OFF IS ABSENT. A world with no match constructs
// nothing from here, sends no match fields, and is byte-identical to the game
// before this file existed — the same discipline as personas, held by
// matchcheck's first arm. See PLAN-KOTH.md for the design and the decisions.
//
// DETERMINISM. No wall clock and no Math.random anywhere in here: the hill
// search walks a fixed seeded spiral, team auto-assignment is join-order
// balanced, scoring accumulates the same `dt` the simulation steps by, and the
// time cap is counted against `world.totalHours`. A seeded match replays.

import { placeStrangeness } from '../world/strangeness.js';
import { describePosition } from '../world/placenames.js';
import { SOCIAL, TIME } from '../config.js';

/** The two sides. Fixed on purpose: two is the smallest number that is a war. */
export const TEAMS = ['red', 'blue'];

/** A hello's team claim, tamed. Anything else means "assign me". */
export function cleanTeam(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  return TEAMS.includes(s) ? s : null;
}

export class KothMatch {
  /**
   * @param {object} opts
   *   hillAt          [x, z], or null to search for strange ground
   *   radius          metres — wider than a bowshot, or it is a camping contest
   *   pointsToWin     seconds of SOLE occupancy that end it
   *   capHours        game-hours on the world's monotonic clock, then best wins
   *   respawnSeconds  how long a death sits out
   */
  constructor({ hillAt = null, radius = 28, pointsToWin = 120, capHours = null, respawnSeconds = 25 } = {}) {
    this.radius = radius;
    this.pointsToWin = pointsToWin;
    this.capHours = capHours;       // absolute totalHours deadline, set on start()
    this.capAfterHours = null;      // relative, resolved against start()
    this.respawnSeconds = respawnSeconds;
    this.hillAt = hillAt;           // resolved in start()
    this.hillName = null;
    this.scores = { red: 0, blue: 0 };
    this.holder = null;             // team currently scoring, or null
    this.contested = false;
    this.state = 'on';              // 'on' | 'won'
    this.winner = null;
    this.startedAt = null;
    // Deaths waiting out their respawn: id -> seconds left. Sim seconds, so a
    // fast-forwarded world respawns fast-forward too, exactly like everything
    // else in it.
    this.waiting = new Map();
    // Muster points, one per team, opposite sides outside the ring — set in
    // start() once the hill is known.
    this.muster = {};
    // The last announced quarter of the target, per team, so `score` events
    // fire at 25/50/75% and not sixty times a minute.
    this._milestone = { red: 0, blue: 0 };
  }

  /**
   * Pick the ground and open the match. Called once by the server after the
   * world exists.
   *
   * THE HILL IS IN THE STRANGE COUNTRY, by search rather than by flag: walk a
   * fixed spiral out from the spawn until the ground is strange enough that
   * the EXISTING rule already permits fighting on it. The war zone reuses the
   * geography the world has instead of inventing a zone map — and the settled
   * lowland stays what it always was, the place you can run to.
   */
  start(world) {
    this.startedAt = world.totalHours;
    if (this.capAfterHours) this.capHours = world.totalHours + this.capAfterHours;

    if (!this.hillAt) {
      const s = world.spawn.position;
      const need = (world.rules?.pvpAboveStrangeness ?? SOCIAL.defaults.pvpAboveStrangeness) + 0.05;
      // A golden-angle spiral: fixed, seedless, and it lands somewhere
      // different on every WORLD because strangeness is the seed's own field.
      let found = null;
      for (let i = 8; i < 640 && !found; i++) {
        const r = 40 + i * 2.5;
        const a = i * 2.39996322972865332; // the golden angle
        const x = s.x + Math.cos(a) * r;
        const z = s.z + Math.sin(a) * r;
        if (placeStrangeness(x, z) >= need) found = [x, z];
      }
      // A world with no strange ground within 1.6 km would be a world this
      // search cannot serve — fall back to due-north rather than not starting.
      this.hillAt = found ?? [s.x, s.z - 300];
    }
    const [hx, hz] = this.hillAt;
    this.hillName = describePosition(hx, hz).phrase;

    // Muster points: opposite sides, one and a half radii OUTSIDE the ring, so
    // a respawn re-enters the fight by walking, visibly, from a direction the
    // other team can learn.
    const d = this.radius * 2.5;
    this.muster.red = [hx - d, hz];
    this.muster.blue = [hx + d, hz];
    return this;
  }

  /** Join-order balanced, honouring a hello's claim when it names a side. */
  assignTeam(world, player, wanted = null) {
    const count = (t) => [...world.players.values()]
      .filter((p) => p !== player && !p.watching && p.party === `team:${t}`).length;
    const team = wanted ?? (count('red') <= count('blue') ? 'red' : 'blue');
    player.party = `team:${team}`;
    player.dirty = true;
    return team;
  }

  /** The team of a player, or null (watchers, the unassigned). */
  teamOf(player) {
    const g = player?.party ?? '';
    return g.startsWith('team:') ? g.slice(5) : null;
  }

  /**
   * A death in match mode sits out its respawn and walks back from the
   * muster. `onPlayerDied` has already dropped the pack where they fell —
   * that stays: death costs time, position and the walk, never the match.
   */
  noteDeath(player) {
    if (this.state !== 'on') return;
    if (!this.teamOf(player)) return;
    this.waiting.set(player.id, this.respawnSeconds);
  }

  /** One simulation step. The world calls this from its own step(). */
  step(dt, world) {
    if (this.state !== 'on') return;

    // ── respawns first, so a revived body can score this very tick ──
    for (const [id, left] of this.waiting) {
      const p = world.players.get(id);
      if (!p) { this.waiting.delete(id); continue; }
      const remain = left - dt;
      if (remain > 0) { this.waiting.set(id, remain); continue; }
      this.waiting.delete(id);
      const team = this.teamOf(p) ?? 'red';
      const [mx, mz] = this.muster[team];
      p.body.revive?.();
      p.ctrl.position.x = mx;
      p.ctrl.position.z = mz;
      p.dirty = true;
      world.events.push({ k: 'respawn', id: p.id, n: p.name, team, at: [mx, mz] });
    }

    // ── who is standing in the ring ──
    const present = new Set();
    for (const p of world.players.values()) {
      if (p.watching || p.body?.dead) continue;
      const team = this.teamOf(p);
      if (!team) continue;
      const dx = p.ctrl.position.x - this.hillAt[0];
      const dz = p.ctrl.position.z - this.hillAt[1];
      if (dx * dx + dz * dz <= this.radius * this.radius) present.add(team);
    }

    const holder = present.size === 1 ? [...present][0] : null;
    const contested = present.size > 1;

    // ── announce only TRANSITIONS — the match's voice is events, not a feed ──
    if (contested && !this.contested) {
      world.events.push({ k: 'hill', s: 'contested', n: this.hillName });
    } else if (holder && holder !== this.holder) {
      world.events.push({ k: 'hill', s: 'taken', party: holder, n: this.hillName });
    } else if (!holder && !contested && (this.holder || this.contested)) {
      world.events.push({ k: 'hill', s: 'clear', n: this.hillName });
    }
    this.holder = holder;
    this.contested = contested;

    // ── the score: one point per second of SOLE occupancy ──
    if (holder) {
      this.scores[holder] += dt;
      const q = Math.floor((this.scores[holder] / this.pointsToWin) * 4);
      if (q > this._milestone[holder] && q < 4) {
        this._milestone[holder] = q;
        world.events.push({
          k: 'score', party: holder,
          pts: Math.round(this.scores[holder]), target: this.pointsToWin,
        });
      }
      if (this.scores[holder] >= this.pointsToWin) return this.finish(world, holder);
    }

    // ── the clock cap: best standing when the hours run out ──
    if (this.capHours && world.totalHours >= this.capHours) {
      const best = this.scores.red === this.scores.blue
        ? null // a draw is a draw; say so rather than inventing a tiebreak
        : (this.scores.red > this.scores.blue ? 'red' : 'blue');
      return this.finish(world, best);
    }
  }

  finish(world, winner) {
    this.state = 'won';
    this.winner = winner; // null is a draw at the cap
    world.events.push({
      k: 'win', party: winner,
      red: Math.round(this.scores.red), blue: Math.round(this.scores.blue),
      n: this.hillName,
    });
  }

  /**
   * What the snapshot carries — small, flat, and only when a match exists.
   * `teams` names every body on each side so a mind can find ITSELF in the
   * match without the snapshot having to grow a `me.g` field.
   */
  wire(world) {
    const teams = { red: [], blue: [] };
    for (const p of world.players.values()) {
      const t = this.teamOf(p);
      if (t && !p.watching) teams[t].push(p.name);
    }
    return {
      mode: 'koth',
      hill: [Math.round(this.hillAt[0]), Math.round(this.hillAt[1])],
      r: this.radius,
      name: this.hillName,
      red: Math.round(this.scores.red),
      blue: Math.round(this.scores.blue),
      target: this.pointsToWin,
      holder: this.holder,
      contested: this.contested,
      state: this.state,
      winner: this.winner,
      teams,
      // Minutes of REAL time left at the cap, for a human reading a HUD.
      // Approximate by design — the authoritative cap is in game hours.
      left: this.capHours
        ? Math.max(0, Math.round((this.capHours - world.totalHours) * (TIME.dayMinutes / 24)))
        : null,
    };
  }
}
