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

    // ── look, in radians, ABSOLUTE — where the producer is actually pointing ──
    //
    // `null` means "I am not telling you, integrate the deltas above", which is
    // what a keyboard-and-mouse frame does locally. A NETWORK intent fills these
    // in, and it has to, because deltas cannot survive the trip.
    //
    // `lookYaw` is consumed and zeroed by `PlayerInput.poll` every frame at 60
    // Hz, while `Client.sendIntent` only transmits at `NET.intentHz` (30). Half
    // of every turn was therefore destroyed before it was ever sent, and the
    // server's copy of where you faced drifted from your own — permanently and
    // cumulatively, with no field in the protocol able to correct it. Arrows
    // launched along the server's stale facing, which is why they hit nothing
    // and why the server appeared to "shoot from the ankles": pitch deltas were
    // dropped the same way, so the server's pitch sat near zero for ever.
    //
    // The same "an accumulating value cannot go through a rate-limited channel"
    // bug was found twice before and patched locally each time — see the notes
    // on `Client.lightFire` and `syncCompanion`. This is the general fix.
    aimYaw: null,
    aimPitch: null,

    // ── actions ──
    primary: false, // trigger held (drawing / shooting)
    interact: false, // edge-triggered: pick up / cook / feed the fire
    drop: false, // edge-triggered: drop equipped
    place: false, // edge-triggered: light a fire (later: build)
    eat: false, // edge-triggered: eat the best food you carry
    // Edge-triggered: "I meant the OTHER thing here." E resolves by distance
    // and urgency; this takes the runner-up. Deliberately NOT in the protocol's
    // INTENT_KEYS: the actions it picks between — cooking, crafting — are
    // resolved in the browser, so the server has nothing to do with it. That is
    // also a standing limit on agents, which cannot cook at all for the same
    // reason.
    alternate: false,
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
  i.aimYaw = null;
  i.aimPitch = null;
  i.primary = false;
  i.interact = false;
  i.drop = false;
  i.place = false;
  i.eat = false;
  i.alternate = false;
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
  to.aimYaw = from.aimYaw;
  to.aimPitch = from.aimPitch;
  to.primary = from.primary;
  to.interact = from.interact;
  to.drop = from.drop;
  to.place = from.place;
  to.eat = from.eat;
  to.alternate = from.alternate;
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
  // Absolute look is NOT rate-clamped — clamping is what deltas need, and doing
  // it here would reintroduce exactly the drift this field exists to remove. It
  // is range-checked instead: yaw wrapped, pitch held off the poles by the same
  // margin `PlayerController` uses. Anything that is not a finite number becomes
  // `null`, which means "no absolute aim given" rather than "aim at zero".
  const angle = (v, limit) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return limit ? Math.max(-limit, Math.min(limit, v)) : Math.atan2(Math.sin(v), Math.cos(v));
  };
  i.aimYaw = angle(i.aimYaw, 0);
  i.aimPitch = angle(i.aimPitch, Math.PI / 2 - 0.02);
  i.jump = !!i.jump;
  i.crouch = !!i.crouch;
  i.sprint = !!i.sprint;
  i.primary = !!i.primary;
  i.interact = !!i.interact;
  i.drop = !!i.drop;
  i.place = !!i.place;
  i.eat = !!i.eat;
  i.alternate = !!i.alternate;
  i.selectSlot = Number.isInteger(i.selectSlot) ? i.selectSlot : -1;
  return i;
}

/** A shared do-nothing intent, for ticks with no controller attached. */
export const IDLE_INTENT = Object.freeze(createIntent());
