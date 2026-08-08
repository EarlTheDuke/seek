// ── protocol.js ─────────────────────────────────────────────────────────────
// What crosses the wire, and nothing else.
//
// Shared verbatim by the server and the browser client, so the two can never
// disagree about a field name — which is the single commonest way a hand-rolled
// netcode rots.
//
// JSON, deliberately. A binary encoding would be perhaps four times smaller,
// and at the measured packet sizes that is a saving of a few kilobytes a second
// on a LAN, against a permanent cost in debuggability for every future feature.
// If this ever ships over the open internet the encoding is one module to swap;
// until then, being able to read the traffic is worth more.
//
// The reason the budget is small enough to afford that: the world is generated
// from a seed on every machine. Terrain, trees, rocks, caves, barrows and place
// names never cross the wire at all.

export const PROTOCOL_VERSION = 1;

// ── client -> server ──
export const C_HELLO = 'hello'; // { name, version, pet }
export const C_INTENT = 'i'; // { i: <intent>, t: clientTick }
export const C_PING = 'p'; // { t: clientTimeMs }
export const C_CHAT = 'c'; // { m: text }
export const C_PARTY = 'g'; // { with: playerId } or { leave: true }
export const C_PET = 'pet'; // the relationship digest — see cleanPetState
export const C_FIRE = 'fire'; // { p: [x, z], f: fuel } — see cleanFireClaim

// ── server -> client ──
export const S_WELCOME = 'welcome'; // { seed, id, tick, spawn, players }
export const S_SNAPSHOT = 's'; // a SimWorld.snapshot()
export const S_JOIN = 'j'; // { id, n }
export const S_LEAVE = 'l'; // { id }
export const S_PONG = 'q'; // { t: echoed clientTimeMs, s: serverTick }
export const S_CHAT = 'm'; // { id, n, m }
export const S_ERROR = 'e'; // { m: reason }

export const encode = (type, data) => JSON.stringify({ y: type, d: data });

/**
 * Decode a frame. Returns null rather than throwing on anything malformed —
 * a server that can be killed by a bad packet is not a server.
 */
export function decode(raw) {
  try {
    const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
    if (!msg || typeof msg.y !== 'string') return null;
    return { type: msg.y, data: msg.d ?? {} };
  } catch {
    return null;
  }
}

/**
 * Strip an incoming intent down to the fields the simulation knows about.
 *
 * `sanitiseIntent` clamps values into legal ranges; this decides which keys are
 * allowed to exist at all. Both matter: the first stops a client claiming to
 * move at 400 m/s, the second stops it setting properties nobody validates.
 */
const INTENT_KEYS = [
  'forward',
  'strafe',
  'jump',
  'crouch',
  'sprint',
  'lookYaw',
  'lookPitch',
  // Absolute facing. Without these two the server can only ever integrate the
  // deltas above, and it receives at most half of them — see the long note in
  // `intents.js`. They are what makes the server's copy of you point where you
  // are actually pointing, which is what makes arrows hit anything.
  'aimYaw',
  'aimPitch',
  'primary',
  'interact',
  'drop',
  'place',
  'eat',
  // Cooking, at last. It was the one act on the survival loop that had no field
  // here at all — so a body on the far side of a socket could gather, light a
  // fire and eat, and still never turn raw meat into a meal.
  'craft',
  // Easing the string down. The trigger is EDGE-DETECTED on the server, so
  // until this existed there was no way to stop drawing that did not launch an
  // arrow: a body that changed its mind mid-draw shot the hillside. Measured at
  // five strays to two aimed shots in one huntcheck run.
  'letdown',
  // ── HANDING SOMETHING TO SOMEBODY ──
  //
  // `give` is who, by name; `giveItem` is what, and may be empty for "you
  // choose". Both are strings and both are clamped in `sanitiseIntent`.
  //
  // THIS LIST IS AN ALLOW-LIST AND THAT IS THE TRAP. Adding a field to
  // `createIntent`, to `sanitiseIntent`, to the agent AND to the server is not
  // enough — anything missing from here is dropped silently at the socket, so
  // the feature works perfectly in-process and does nothing at all over the
  // wire. `givecheck` caught it because it drives a real socket; every
  // in-process test of the same code passed.
  'give',
  'giveItem',
  'selectSlot',
];

export function pickIntent(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of INTENT_KEYS) if (k in raw) out[k] = raw[k];
  return out;
}

/** Names are shown to other players, so they are the one truly hostile field. */
export function cleanName(raw) {
  const s = String(raw ?? '').replace(/[^\p{L}\p{N} _'-]/gu, '').trim();
  return s.slice(0, 18) || 'wanderer';
}

/**
 * Which animal somebody says they brought.
 *
 * A bare species id, checked for SHAPE only. The list of what actually exists
 * lives in `companions.js`, which imports three.js and its geometry helpers —
 * far too much to drag into a module the server loads to parse a packet. The
 * simulation's own `getCompanion` already falls back to the otter for anything
 * it does not recognise, so shape here and meaning there is the right split.
 */
export function cleanPet(raw) {
  return typeof raw === 'string' && /^[a-z]{2,12}$/.test(raw) ? raw : null;
}

/**
 * The RELATIONSHIP, on its way up to the server's copy of somebody's animal.
 *
 * The body has crossed the wire since the last session; the thing that makes it
 * a pet rather than a walking prop had not. Trust, the name it earned, the
 * tricks it knows and the standing orders it is under all lived in exactly one
 * browser, so the server's copy sat at trust 0.6 for ever with `guard` off —
 * which meant `Companion.defend` and the bite behind it were wired to a switch
 * that nothing in the world was able to throw.
 *
 * WHY THE OWNER IS BELIEVED. This is a claim about your own animal, the same
 * class of assertion as your name and which species you brought, and it is
 * checked the same way: shape here, meaning in the simulation. A client cannot
 * name a trick its species does not have (`applyRelationship` filters against
 * the species' own list) and the only thing an inflated trust unlocks is its
 * animal biting something that already attacked its owner. The alternative —
 * the server re-earning a relationship it never saw a hand in — is a second,
 * divergent pet, which is the bug this replaces rather than a fix for it.
 *
 * `a` is the odd one out: a one-shot "it is doing this trick NOW", so the pose
 * shows up in everybody else's snapshot instead of only on the owner's screen.
 */
const TRICK_ID = /^[a-z]{2,16}$/;
const unitOr = (v, fallback) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

export function cleanPetState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const k of ['t', 'f', 'y', 'w']) {
    const v = unitOr(raw[k], null);
    if (v !== null) out[k] = v;
  }
  // WHICH ANIMAL. Said at the door too, but sayable again: the menu lets you
  // change your mind after you are already standing in the world, and until
  // this the server never heard — so a wolf cub at your heel was an otter to
  // everybody else, and worse, the digest below was being filtered against the
  // otter's trick table. A relationship applied to the wrong species is a
  // quieter wrong answer than a visibly wrong animal, which is why this is here
  // rather than in a queue.
  if ('k' in raw) out.k = cleanPet(raw.k);
  if ('n' in raw) out.n = raw.n === null ? null : cleanName(raw.n);
  if (Array.isArray(raw.l)) {
    out.l = raw.l.filter((id) => typeof id === 'string' && TRICK_ID.test(id)).slice(0, 24);
  }
  if (raw.o && typeof raw.o === 'object' && !Array.isArray(raw.o)) {
    out.o = {};
    for (const [k, v] of Object.entries(raw.o).slice(0, 24)) if (TRICK_ID.test(k)) out.o[k] = !!v;
  }
  if (typeof raw.a === 'string' && TRICK_ID.test(raw.a)) out.a = raw.a;
  return out;
}

/**
 * "I have just lit a fire, here."
 *
 * THE SERVER'S COPY OF YOU HAS NEVER HAD A FIRE. `fires.light` is called in
 * `main.js` and nowhere else, no fire is in the snapshot, and no intent handler
 * on the server lights one — so the body the server keeps for you stands in a
 * world with no fire in it, ever. Measured, standing 1.54 m from a burning
 * fire: the browser's own environment sampled `fireWarmth` 8.90 °C, and the
 * server's copy of the same spot, 8.90 °C colder. That is the whole reason
 * `me.c` — the core temperature the snapshot has always carried — cannot be
 * believed, and why reading it would have made sitting by a fire stop warming
 * you the moment you joined a server.
 *
 * WHY THE CLIENT IS BELIEVED, same as the pet digest above: the WOOD is yours,
 * the inventory it came out of is yours, and the client has already spent it.
 * The server is not in a position to second-guess a claim about a bag it does
 * not have a copy of. What it does check is the part that is about the WORLD
 * rather than about you — that the spot is near enough to be somewhere you
 * could actually have reached, and that the ground will take a fire — and both
 * of those are in the simulation, not here. Shape here, meaning there.
 */
export function cleanFireClaim(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.p) || raw.p.length !== 2) return null;
  const [x, z] = raw.p;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const fuel = Number.isFinite(raw.f) ? Math.min(600, Math.max(0, raw.f)) : undefined;
  return { x, z, fuel };
}

export function cleanChat(raw) {
  return String(raw ?? '')
    .replace(/[ -]/g, '')
    .trim()
    .slice(0, 160);
}
