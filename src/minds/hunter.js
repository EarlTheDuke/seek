// ── hunter.js ───────────────────────────────────────────────────────────────
// A rival hunter: the first inhabitant with a mind.
//
// VISION.md picks this as the best first mind and gives the reason:
//
//   > Another hunter working the same valley, under identical rules — same bow,
//   > same hunger, same wind. Competes for your deer, leaves tracks you can
//   > read, may help, trade, follow or rob you. The single best fit: no
//   > special-casing, and it doubles as a live multiplayer test harness.
//
// "No special-casing" is the load-bearing part, and it is literally true here:
// a rival hunter is a `Player` in `SimWorld`, the exact class a person gets.
// It has the same body, the same inventory, the same bow, the same hunger and
// the same wind. The only difference is where its intent comes from — a Mind
// instead of a socket — and the simulation has never known the difference.
//
// So this file is small, and that smallness is the whole argument for the
// architecture. Everything hard was already done by the intent seam.

import { MINDS } from '../config.js';
import { createIntent } from '../sim/intents.js';
import { Mind } from './mind.js';
import { findDistrict } from '../world/placenames.js';
import { clamp } from '../util/math.js';

/**
 * Turn a standing GOAL into a tick's worth of INTENT.
 *
 * This is the reflex layer for a hunter — the equivalent of the creature state
 * machines, and the thing that keeps working when the mind is slow, absent or
 * wrong. It is deliberately dumb: face something, walk, occasionally draw. All
 * the judgement lives one layer up, on a cadence measured in seconds.
 */
export class HunterBody {
  constructor(player, mind) {
    this.player = player;
    this.mind = mind;
    this.intent = createIntent();
    this.target = null; // a world position it is currently making for
    this.retarget = 0;
    this.wanderAngle = 0;
    this.saidAt = -999;
  }

  /**
   * @param {object} world  the SimWorld, for perception and place lookup
   */
  update(dt, world, ctx) {
    const p = this.player;
    const goal = this.mind.goal ?? { kind: 'wander' };
    const i = this.intent;

    // Reset the edge-triggered bits; held bits are set below.
    i.interact = false;
    i.drop = false;
    i.place = false;
    i.eat = false;
    i.jump = false;

    // ── hunger is reflex, not deliberation ──
    // Nobody decides to eat. You eat because you are hungry and have food.
    if (p.body.hunger < 45 && p.inventory.countOf('venison_cooked') > 0) i.eat = true;

    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = MINDS.retargetSeconds;
      this.target = this.resolveTarget(goal, world, ctx);
    }

    // ── walk toward whatever the goal resolved to ──
    if (this.target) {
      const dx = this.target.x - p.ctrl.position.x;
      const dz = this.target.z - p.ctrl.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist > MINDS.arriveWithin) {
        // Turn toward it a little each tick rather than snapping — a body that
        // pivots instantly reads as a machine however good its reasoning is.
        const want = Math.atan2(-dx, -dz);
        let diff = ((want - p.ctrl.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        i.lookYaw = -clamp(diff, -MINDS.turnRate * dt, MINDS.turnRate * dt);
        i.forward = 1;
        // Run when it matters, walk when it does not. Sprinting everywhere is
        // both exhausting and, in a world where noise is a sense, stupid.
        i.sprint = goal.kind === 'avoid' && dist < 40;
        // Stalking is the one thing this world has always been about.
        i.crouch = goal.kind === 'hunt' && dist < MINDS.stalkWithin;
      } else {
        i.forward = 0;
        i.sprint = false;
        this.target = null;
      }
    } else {
      i.forward = goal.kind === 'hold' ? 0 : i.forward;
    }

    if (goal.kind === 'hold') {
      i.forward = 0;
      i.sprint = false;
    }

    // ── speech ──
    // Consumed by the caller, which knows how to broadcast it. The mind sets
    // a `say` goal; turning that into a message is not the body's business.
    if (goal.kind === 'say' && goal.text && ctx.hours - this.saidAt > MINDS.speakEveryHours) {
      this.saidAt = ctx.hours;
      this.pendingSpeech = goal.text;
      // Said is done. Otherwise a hunter repeats itself until the next thought.
      this.mind.goal = { kind: 'wander' };
    }

    world.setIntent(p.id, i);
  }

  /**
   * Where a goal points, on the ground.
   *
   * A mind names things in WORDS — "hunt the deer", "make for the Black Moss" —
   * because words are all it was given. This turns a word back into a place,
   * using only what the body can perceive or already knows, which is the
   * honesty rule surviving the round trip.
   */
  resolveTarget(goal, world, ctx) {
    const p = this.player;
    const here = p.ctrl.position;

    switch (goal.kind) {
      case 'hunt':
      case 'approach': {
        const want = goal.quarry ?? goal.target;
        const seen = world.perceivableBy(p).find((o) => o.label === want);
        return seen ? { x: seen.position.x, z: seen.position.z } : this.roam(here, ctx);
      }

      case 'avoid': {
        const seen = world.perceivableBy(p).find((o) => o.label === goal.target);
        if (!seen) return this.roam(here, ctx);
        // Directly away, at a distance worth having.
        const dx = here.x - seen.position.x;
        const dz = here.z - seen.position.z;
        const len = Math.hypot(dx, dz) || 1;
        return { x: here.x + (dx / len) * 60, z: here.z + (dz / len) * 60 };
      }

      case 'goTo': {
        const found = goal.place ? findDistrict(goal.place, here.x, here.z) : null;
        return found ? { x: found.x, z: found.z } : this.roam(here, ctx);
      }

      case 'makeCamp': {
        // The nearest shelter it could plausibly know about. Caves and gorges
        // are things you can see from a distance, so looking for one is fair.
        const spot = world.shelterNear?.(here.x, here.z);
        return spot ?? this.roam(here, ctx);
      }

      case 'hold':
        return null;

      default:
        return this.roam(here, ctx);
    }
  }

  /** A slowly turning walk, so an aimless hunter still goes somewhere. */
  roam(here, ctx) {
    this.wanderAngle += (((ctx.tick ?? 0) % 97) / 97 - 0.5) * 0.6;
    return {
      x: here.x + Math.cos(this.wanderAngle) * MINDS.roamDistance,
      z: here.z + Math.sin(this.wanderAngle) * MINDS.roamDistance,
    };
  }

  takeSpeech() {
    const s = this.pendingSpeech;
    this.pendingSpeech = null;
    return s;
  }
}

/**
 * Put a rival hunter into a world.
 *
 * Returns the pieces rather than hiding them, because the server wants to tick
 * them and the tests want to look at them.
 */
export function addRivalHunter(world, provider, { id, name = 'a hunter' } = {}) {
  const player = world.addPlayer(id, name);
  // It is a person in every respect the simulation cares about.
  player.isMind = true;
  player.label = 'a hunter';

  const mind = new Mind(mindView(player), provider, { name });
  const body = new HunterBody(player, mind);
  return { player, mind, body };
}

/**
 * The face a Player shows to a mind: senses, condition, and nothing else.
 *
 * Not the Player object itself — that has an inventory, a controller, a
 * position it could write to. A mind gets a read-only view of what it is like
 * to BE this body, which keeps the honesty rule structural rather than a thing
 * everyone has to remember.
 */
function mindView(player) {
  return {
    get position() {
      return player.ctrl.position;
    },
    get yaw() {
      return player.ctrl.yaw;
    },
    get health() {
      return player.body.health;
    },
    get hunger() {
      return player.body.hunger;
    },
    get carrying() {
      return player.inventory.slots
        .filter((s) => s?.item && s.count)
        .map((s) => `${s.count} ${s.item.replace(/_/g, ' ')}`);
    },
    senses: MINDS.hunterSenses,
    label: 'a hunter',
  };
}
