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

// The recipe table, for one job only: deciding whether a `craft` field names a
// real recipe. Data, no THREE, no DOM — it imports as cleanly here as it does
// into the browser's interaction prompt.
import { RECIPES } from '../items/recipes.js';

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
    drop: false, // edge-triggered: drop ONE of the equipped stack
    // Edge-triggered: drop HALF the equipped stack, rounded up. Twenty arrows
    // to ten in one press — the thing that could not be done at all when `drop`
    // took the whole stack for anything of kind 'ammo'.
    dropHalf: false,
    place: false, // edge-triggered: light a fire (later: build)
    eat: false, // edge-triggered: eat the best food you carry
    // Edge-triggered: work THIS recipe, at whatever station you are standing
    // at. `''` means "nothing"; anything else is an id out of the recipe table
    // and is rejected here if it is not.
    //
    // A NAMED RECIPE RATHER THAN A BARE "CRAFT SOMETHING", and the difference
    // matters. `bestAvailable` returns the first thing the table allows, so a
    // body carrying stone, hide and firewood that pressed a boolean would knap
    // an axe while its venison went raw and its fuel went into arrows. The
    // vocabulary is closed either way — this just lets the presser say which of
    // the closed words it meant. Same rule the goals table follows.
    //
    // It exists because cooking was BROWSER-ONLY. `bestAvailable`/`craft` are
    // pure and have always been shared, but the only caller was the interaction
    // prompt in main.js, so the act of cooking never crossed the wire. An agent
    // could kill a deer and carry raw venison for ever: raw venison fills 16 and
    // cooked fills 34, and the gap between those two numbers is most of a night.
    craft: '',

    // ── HANDING SOMETHING TO SOMEBODY ──
    //
    // `give` is WHO, by name, and empty means nobody. `giveItem` is WHAT, and
    // empty means "you choose" — the server picks something sensible rather
    // than refusing, because a mind that wants to be generous should not have
    // to also be right about item ids.
    //
    // A name rather than an id because that is all a mind has: it is told who
    // it can see in words and may answer in words. The same rule `hunt` and
    // `goTo` already follow.
    give: '',
    giveItem: '',

    // ── A BARGAIN, in four strings ──
    //
    // `offer` is who it is for; `offerItem` what is on the table; `offerWant`
    // what is wanted back. `accept` is whose offer is being taken. Nothing is
    // reserved by making an offer — it is a promise, and it is checked against
    // both packs only at the moment somebody accepts.
    offer: '',
    offerItem: '',
    offerWant: '',
    accept: '',
    // ── ease the string down without loosing ──
    //
    // Edge-triggered. The trigger above is EDGE-DETECTED — the shot happens on
    // `primary` going true -> false — so "stop drawing" and "shoot" were the
    // same signal, and a body that began a draw and then thought better of it
    // had no way to say so. It fired. At half draw an arrow leaves at a third
    // of the speed the solver assumed, in whatever direction the body had
    // started turning, and nothing counted it: measured at FIVE such arrows to
    // two aimed ones in a single huntcheck run, from a body whose own log said
    // it had loosed twice.
    //
    // This is what a person does with a bow they have decided not to shoot, and
    // the bow already knew how (`Bow.cancel`, which keeps the arrow). It just
    // had no word on the wire. Resolved BEFORE the trigger edge, so sending
    // `letdown` and dropping `primary` in the same tick is a let-down and not a
    // shot — which is exactly how a caller wants to spell "stop".
    letdown: false,
    // Edge-triggered: "I meant the OTHER thing here." E resolves by distance
    // and urgency; this takes the runner-up. Deliberately NOT in the protocol's
    // INTENT_KEYS: it picks between two LOCAL presentations of the same two
    // acts, and both of those — feeding a fire and crafting at it — now have
    // their own field on the wire.
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
  i.dropHalf = false;
  i.place = false;
  i.eat = false;
  i.craft = '';
  i.give = '';
  i.giveItem = '';
  i.offer = '';
  i.offerItem = '';
  i.offerWant = '';
  i.accept = '';
  i.letdown = false;
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
  to.dropHalf = from.dropHalf;
  to.place = from.place;
  to.eat = from.eat;
  to.craft = from.craft;
  to.give = from.give;
  to.giveItem = from.giveItem;
  to.offer = from.offer;
  to.offerItem = from.offerItem;
  to.offerWant = from.offerWant;
  to.accept = from.accept;
  to.letdown = from.letdown;
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
  i.dropHalf = !!i.dropHalf;
  i.place = !!i.place;
  i.eat = !!i.eat;
  // A closed vocabulary, checked against the table itself. Anything else — a
  // typo, a hallucinated recipe, a hostile string — becomes "nothing", which is
  // the same treatment `sanitiseGoal` gives a verb that does not exist.
  i.craft = typeof i.craft === 'string' && RECIPES[i.craft] ? i.craft : '';
  // A NAME off a socket ends up in front of other players, so it is capped and
  // stripped like any other. Not checked against the roster here — the server
  // has to look the person up anyway, and a name that matches nobody simply
  // gives to nobody, which is the same "refuse quietly" this file already does
  // for a hallucinated recipe.
  const name = (v, n) => (typeof v === 'string' ? v.replace(/[ -]/g, '').trim().slice(0, n) : '');
  i.give = name(i.give, 24);
  i.giveItem = name(i.giveItem, 24);
  i.offer = name(i.offer, 24);
  i.offerItem = name(i.offerItem, 24);
  i.offerWant = name(i.offerWant, 24);
  i.accept = name(i.accept, 24);
  i.letdown = !!i.letdown;
  i.alternate = !!i.alternate;
  i.selectSlot = Number.isInteger(i.selectSlot) ? i.selectSlot : -1;
  return i;
}

/** A shared do-nothing intent, for ticks with no controller attached. */
export const IDLE_INTENT = Object.freeze(createIntent());
