// ── morale.js ───────────────────────────────────────────────────────────────
// Whether a thing that hunts in packs still fancies its chances.
//
// The first enemy in the game whose danger is not a number on its own sheet.
// A goblin is trivial. Six goblins are a real problem. The gap between those
// two facts is this file.
//
// In plain real-world terms: nothing that hunts in a group is brave. It is
// CONFIDENT, which is a different thing and a much more fragile one. Wolves,
// hyenas and street muggers all work the same way — they commit when the odds
// look good and evaporate when they stop. The interesting consequence for a
// player is that you do not have to kill a pack to beat it. You have to
// convince it it is losing.
//
// Which gives the fight a shape that is not a health bar:
//
//   * Kill one and the rest waver. Kill two quickly and they break.
//   * Hurt several without killing any and nothing happens — wounds only make
//     an individual coward, and a coward inside a winning pack still comes.
//   * Sunrise beats them outright, because they will not fight in daylight.
//     Surviving until dawn is a real tactic rather than a figure of speech.
//   * A broken pack RALLIES if you let it regroup out of sight. Chasing a
//     routed pack into the dark is exactly as bad an idea as it sounds.
//
// Nothing here is random and nothing here reads the clock directly, so two
// runs of the same fight play out identically.

import { clamp, lerp, smoothstep } from '../util/math.js';

/**
 * Recompute one creature's morale, 0..1.
 *
 * @param {object} c        the creature
 * @param {object[]} pack   everything sharing its packId, alive or dead
 * @param {number} night    darkness 0..1
 * @param {number} dt
 */
export function updateMorale(c, pack, night, dt, opposition = 1) {
  const M = c.species.morale;
  if (!M) return;

  // ── numbers ── the dominant term, and the one the player can act on.
  //
  // Counted as "how many of us are still standing NEARBY", not merely alive:
  // a pack strung out across a hillside is not a pack. That is what makes
  // breaking them up a tactic in its own right, and what makes a doorway or a
  // narrow gully worth standing in.
  let standing = 0;
  for (const other of pack) {
    if (other.state === 'dead') continue;
    if (other === c) {
      standing++;
      continue;
    }
    const d = Math.hypot(other.position.x - c.position.x, other.position.z - c.position.z);
    if (d <= M.cohesionRange) standing++;
  }
  c.packStanding = standing;

  // ── the odds, which now cut both ways ──
  //
  // A pack counts YOUR numbers as well as its own. That single term is what
  // makes a warband a group problem rather than N separate problems: five
  // goblins are terrifying to one person and merely dangerous to four, and
  // they know it before you do. It also means the most useful thing you can do
  // for a friend who is surrounded is to walk over and be visible.
  //
  // Expressed as an effective pack size rather than as a penalty, so the same
  // confidentAt threshold governs both sides and there is only one curve to
  // reason about.
  c.opposition = opposition;
  const effective = standing / Math.max(1, opposition ** M.oddsWeight);
  const strength = smoothstep(1, M.confidentAt, effective);

  // ── its own skin ── a wounded individual is a worse individual, but this is
  // deliberately a small term. Wounds make cowards; only deaths break packs.
  const health = c.hp / c.maxHp;
  const hurt = (1 - health) * M.woundPenalty;

  // ── the sun ── goblins do not fight in daylight, and no amount of numbers
  // fixes that. A hard multiplier rather than another term, so dawn is
  // decisive instead of merely discouraging.
  const daylight = lerp(M.daylightFloor, 1, night);

  // ── shock ── seeing one of your own go down. Decays, so a pack that takes a
  // loss and survives the next few seconds recovers its nerve.
  c.shock = Math.max(0, (c.shock ?? 0) - dt * M.shockRecovery);

  const target = clamp((strength - hurt - c.shock) * daylight, 0, 1);

  // Morale moves fast downward and slowly upward: losing your nerve is a
  // moment, getting it back is a decision. Without the asymmetry a pack
  // flickers between charging and routing every few frames.
  const rate = target < c.morale ? M.fallRate : M.riseRate;
  c.morale = c.morale + (target - c.morale) * clamp(rate * dt, 0, 1);

  // ── the latch ── hysteresis, so a pack commits or breaks rather than
  // dithering on the boundary. Once broken it takes a genuinely better
  // position to rally, not a rounding error.
  if (c.broken) {
    if (c.morale >= M.rallyAt) c.broken = false;
  } else if (c.morale <= M.breakAt) {
    c.broken = true;
  }
}

/** Tell every member of a pack that one of them has just died. */
export function reportDeath(pack, victim) {
  for (const other of pack) {
    if (other === victim || other.state === 'dead') continue;
    const M = other.species.morale;
    if (!M) continue;
    const d = Math.hypot(other.position.x - victim.position.x, other.position.z - victim.position.z);
    if (d > M.witnessRange) continue;
    // Closer is worse. Watching one die at your elbow is not the same as
    // hearing it happen across the hill.
    other.shock = Math.min(1, (other.shock ?? 0) + M.deathShock * (1 - d / M.witnessRange));
  }
}

/** A plain-language read on a pack's nerve, for the debug view. */
export function describeMorale(m) {
  if (m > 0.75) return 'emboldened';
  if (m > 0.5) return 'confident';
  if (m > 0.3) return 'wavering';
  if (m > 0.15) return 'afraid';
  return 'routed';
}
