// ── scarcity.js ─────────────────────────────────────────────────────────────
// How much this valley has, and where the good ground is.
//
// WHY. Personas were built last run — a hoarder, someone generous, a coward, a
// liar — and in the world as it stands they are indistinguishable. Wood and
// deer are effectively infinite: whatever a mind's character says about
// sharing, there is another branch four metres away and another herd over the
// rise, so the hoarder and the saint take the same actions and the whole
// experiment measures nothing. A disposition is only visible when something is
// at stake, and nothing here was ever at stake.
//
// Two knobs, deliberately:
//
//   PLENTY   how much there is, overall. 1 is the world as it has always been.
//   PATCHY   how unevenly it is spread. 0 is uniform; higher pulls the same
//            amount of food and fuel into fewer, richer places.
//
// The second is the one that makes an evening. Halving everything everywhere
// just makes a poorer world that everyone forages slightly longer in. Pulling
// it into one good valley makes people MEET — three minds arriving at the same
// carcass is a story, and a thin uniform hillside is not.
//
// ── the number has to cross the wire ──
//
// Firewood is drawn by the client from `deadfallNear`, which is a pure function
// of the seed — so if the server thins the wood and says nothing, a browser
// paints branches that are not there and an agent walks to them and presses E
// on bare ground for ever. It rides in the welcome, and both ends call
// `setScarcity` with what the server said. Animals need no such thing: they
// live on the server and arrive in snapshots.

// Its own noise stream, named like every other one in noise.js — the richness
// field is a thing about this world, not a reuse of the terrain's clumping.
import { createNoise2D } from 'simplex-noise';
import { makeRandom } from './noise.js';

const nRich = createNoise2D(makeRandom('richness'));

const DEFAULT = { plenty: 1, patchy: 0 };
let _state = { ...DEFAULT };

/** The current settings, as the wire carries them. */
export function scarcity() {
  return _state;
}

/**
 * @param {{plenty?:number, patchy?:number}|null} next  null restores plenty.
 */
export function setScarcity(next) {
  if (!next) { _state = { ...DEFAULT }; return _state; }
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  _state = {
    plenty: Math.max(0, Math.min(2, num(next.plenty, DEFAULT.plenty))),
    patchy: Math.max(0, Math.min(1, num(next.patchy, DEFAULT.patchy))),
  };
  return _state;
}

/** Is anything at all different from the world as it was before this existed? */
export function scarce() {
  return _state.plenty !== 1 || _state.patchy !== 0;
}

/**
 * How rich this ground is, 0 (bare) to about 2 (the good valley).
 *
 * One low-frequency field, so a "rich" place is hundreds of metres across —
 * somewhere you can walk to, camp in, and argue over. Any smaller and it is
 * noise rather than geography.
 *
 * Multiplied into the chance of wood and the chance of a herd, so richness
 * moves BOTH together: the valley with the deer in it is the valley with the
 * fuel to cook them, which is what makes it worth holding.
 */
export function richnessAt(x, z) {
  const { plenty, patchy } = _state;
  if (!patchy) return plenty;
  // 1/520 m: a couple of these across the playable country.
  const n = nRich(x / 520, z / 520); // −1..1
  return plenty * (1 + patchy * n * 1.35);
}

/**
 * Read the knobs out of an environment. One string, because that is how every
 * other staging knob on the server is spelled.
 *
 *   SCARCE=on          a hard winter: less of everything, and clumped
 *   SCARCE=0.5         half as much, spread as evenly as ever
 *   SCARCE=0.5,0.8     half as much, and pulled hard into the good ground
 */
export function scarcityFromEnv(env = process.env) {
  const raw = env.SCARCE;
  if (!raw) return null;
  if (/^(on|hard|yes|1)$/i.test(raw)) return { plenty: 0.45, patchy: 0.75 };
  if (/^(off|no|0)$/i.test(raw)) return null;
  const [p, q] = String(raw).split(',').map(Number);
  if (!Number.isFinite(p)) return null;
  return { plenty: p, patchy: Number.isFinite(q) ? q : 0.6 };
}
