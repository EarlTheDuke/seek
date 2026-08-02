// ── intents.js ──────────────────────────────────────────────────────────────
// The vocabulary of "what someone wants to do this tick".
//
// This is the seam the whole architecture turns on. Nothing mutates the world
// directly any more: a keyboard, a network packet and (later) a language model
// all produce one of these, and the simulation resolves it. The simulation has
// no idea which produced it, which is exactly the point — multiplayer and
// LLM-driven minds both become "another intent producer" rather than a rewrite.
//
// Deliberately a plain object with fixed fields rather than a class or a union
// of message types: it has to be trivially serialisable, diffable and cheap to
// send sixty times a second.

/** A fresh, entirely passive intent. */
export function createIntent() {
  return {
    // ── locomotion, -1..1 ──
    forward: 0,
    strafe: 0,
    jump: false,
    crouch: false,
    sprint: false,

    // ── look, in radians, applied as a delta this tick ──
    lookYaw: 0,
    lookPitch: 0,

    // ── actions ──
    primary: false, // trigger held (drawing / shooting)
    interact: false, // edge-triggered: pick up
    drop: false, // edge-triggered: drop equipped
    selectSlot: -1, // -1 = no change
  };
}

/** Wipe an intent in place, so the hot path allocates nothing. */
export function clearIntent(i) {
  i.forward = 0;
  i.strafe = 0;
  i.jump = false;
  i.crouch = false;
  i.sprint = false;
  i.lookYaw = 0;
  i.lookPitch = 0;
  i.primary = false;
  i.interact = false;
  i.drop = false;
  i.selectSlot = -1;
  return i;
}

/** Copy `from` onto `to`, returning `to`. */
export function copyIntent(to, from) {
  to.forward = from.forward;
  to.strafe = from.strafe;
  to.jump = from.jump;
  to.crouch = from.crouch;
  to.sprint = from.sprint;
  to.lookYaw = from.lookYaw;
  to.lookPitch = from.lookPitch;
  to.primary = from.primary;
  to.interact = from.interact;
  to.drop = from.drop;
  to.selectSlot = from.selectSlot;
  return to;
}

/**
 * Clamp anything that arrives from outside into a legal range.
 *
 * Called on every intent the simulation accepts. Today it only guards against
 * bugs; once intents arrive over a socket it is the boundary that stops a
 * malformed or hostile packet from doing anything interesting.
 */
export function sanitiseIntent(i, maxLookPerTick = 0.35) {
  const clamp1 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  const clampLook = (v) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.max(-maxLookPerTick, Math.min(maxLookPerTick, v))
      : 0;
  i.forward = clamp1(i.forward);
  i.strafe = clamp1(i.strafe);
  i.lookYaw = clampLook(i.lookYaw);
  i.lookPitch = clampLook(i.lookPitch);
  i.jump = !!i.jump;
  i.crouch = !!i.crouch;
  i.sprint = !!i.sprint;
  i.primary = !!i.primary;
  i.interact = !!i.interact;
  i.drop = !!i.drop;
  i.selectSlot = Number.isInteger(i.selectSlot) ? i.selectSlot : -1;
  return i;
}

/** A shared do-nothing intent, for ticks with no controller attached. */
export const IDLE_INTENT = Object.freeze(createIntent());
