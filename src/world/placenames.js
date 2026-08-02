// ── placenames.js ───────────────────────────────────────────────────────────
// Somewhere, rather than somewhere.
//
// This is Phase 4's done-when, and it is not decoration: "you can tell another
// player where to go and they can find it". A world of coordinates is a world
// you cannot talk about. The moment the hollow you got caught in has a name,
// you can warn someone about it, agree to meet there, or come back — and none
// of that is possible with (-880, -920) however precisely it identifies the
// spot.
//
// In plain real-world terms: this is why every fold of ground in the Highlands
// has a name. People who live in a landscape need to be able to say where they
// mean, and the names they invent describe what the place IS — Beinn Dubh is
// the black hill, Loch an Eilein is the loch of the island. So the generator
// works the same way round: read what the ground actually does, then name it
// after that. A bog is never called a summit.
//
// Everything is derived from the seed and the coordinates. No table of names is
// stored, the whole infinite world is named, and two players on the same seed
// see identical names forever — which is what makes it a shared world rather
// than two private ones.

import { NAMES } from '../config.js';
import { hash2i } from '../util/math.js';
import { regionAt, dominantRegion, MOOR, WOOD, BOG, GORGE, SNOW, SPRING, WATER, SHORE } from './regions.js';
import { placeStrangeness } from './strangeness.js';

// ── vocabulary ──────────────────────────────────────────────────────────────
//
// Scots and Gaelic-derived, because that is the world's register (see the
// setting note in VISION.md). Kept as plain word lists rather than a grammar:
// a generator that can produce "Glen of the Black Cairn" is not obviously
// better than one that produces "Blackcairn Glen", and it is much easier to
// make the second one never produce nonsense.

// The thing itself. Chosen by what the ground DOES, which is why a bog can
// never come out as a summit.
const GENERIC = {
  [MOOR]: ['Moor', 'Muir', 'Heath', 'Rigg', 'Brae', 'Sward'],
  [WOOD]: ['Wood', 'Shaw', 'Coille', 'Holt', 'Thicket', 'Grove'],
  [BOG]: ['Moss', 'Mire', 'Flow', 'Slough', 'Quag', 'Fen'],
  [GORGE]: ['Cleugh', 'Gorge', 'Chasm', 'Linn', 'Scaur', 'Gash'],
  [SNOW]: ['Cairn', 'Beinn', 'Crown', 'Sgurr', 'Rime', 'Shoulder'],
  [SPRING]: ['Well', 'Spring', 'Fuaran', 'Steam', 'Warmth', 'Kettle'],
  [WATER]: ['Loch', 'Water', 'Tarn', 'Mere', 'Pool'],
  [SHORE]: ['Strand', 'Shore', 'Bank', 'Margin'],
};

// The qualifier. Split into three registers, and which one a place draws from
// is decided by the STRANGENESS GRADIENT — so the names themselves carry the
// warning. You can hear that Corrie Dubh is further out than Sunnybrae without
// being told, and by the time places are called things like the Unmaking you
// have gone a very long way indeed.
const SPECIFIC = {
  // settled and quiet
  mild: ['Sunny', 'Green', 'Fair', 'Broad', 'Kindly', 'Low', 'Nether', 'Hazel',
         'Rowan', 'Aiken', 'Bell', 'Heather', 'Sheiling', 'Fold', 'Byre'],
  // lonely and uneasy
  lonely: ['Lang', 'Cauld', 'Wind', 'Grey', 'Hollow', 'Far', 'Lost', 'Stane',
           'Raven', 'Corbie', 'Hunger', 'Whistling', 'Thrawn', 'Widow', 'Bare'],
  // wrong, and the deep places
  wrong: ['Dubh', 'Black', 'Ill', 'Weeping', 'Grinding', 'Sorrow', 'Wolf',
          'Barrow', 'Dread', 'Unmaking', 'Silent', 'Hollowed', 'Cold Iron',
          'Gallow', 'Winter'],
};

// Occasionally a place is named as a possession or an event rather than a
// description, which is what stops a list of adjectives sounding like a list of
// adjectives. Kept rare on purpose.
const OF_FORMS = [
  (spec, gen) => `${gen} of ${spec}`,
  (spec, gen) => `The ${spec} ${gen}`,
  (spec, gen) => `${spec}'s ${gen}`,
];

/** Which register of adjectives a place at this strangeness draws from. */
function registerFor(s) {
  if (s < 0.34) return SPECIFIC.mild;
  if (s < 0.62) return SPECIFIC.lonely;
  return SPECIFIC.wrong;
}

/** Deterministic pick from a list, driven by a hash value in [0,1). */
const pick = (list, r) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/**
 * The district containing a point.
 *
 * The world is divided into a coarse grid — big enough that a district is a
 * walk across rather than a step, small enough that "I'm in the Black Moss"
 * narrows you down usefully. Each cell is named after whatever its CENTRE
 * actually is, so the name always describes real ground somewhere inside it.
 *
 * Naming the centre rather than the point you happen to stand on is what makes
 * the name stable: walk twenty metres and you are still in the same district,
 * with the same name, rather than watching it rename itself under you.
 */
export function districtAt(x, z) {
  const cell = NAMES.districtSize;
  const ci = Math.floor(x / cell);
  const cj = Math.floor(z / cell);
  return districtOfCell(ci, cj);
}

/** The district for a specific grid cell. Cheap enough to call in a loop. */
export function districtOfCell(ci, cj) {
  const cell = NAMES.districtSize;
  // Centre, nudged by the cell's own hash so districts are not all named after
  // a point on a perfect lattice — which would put every name on a hilltop or
  // every name in a hollow, depending on how the grid happened to land.
  const cx = (ci + 0.5) * cell + (hash2i(ci, cj, 501) - 0.5) * cell * 0.5;
  const cz = (cj + 0.5) * cell + (hash2i(ci, cj, 502) - 0.5) * cell * 0.5;

  const region = regionAt(cx, cz);
  const kind = dominantRegion(region);
  // Named for what the ground IS, not for the hour. A district must not rename
  // itself at sunset — but naming off the daylight value was worse, since
  // daylight caps the gradient near 0.41 and the two darker word registers
  // could then never be reached at all.
  const s = placeStrangeness(cx, cz);

  const generic = pick(GENERIC[kind] ?? GENERIC[MOOR], hash2i(ci, cj, 503));
  const specific = pick(registerFor(s), hash2i(ci, cj, 504));

  const roll = hash2i(ci, cj, 505);
  const name =
    roll < NAMES.ofFormChance
      ? pick(OF_FORMS, hash2i(ci, cj, 506))(specific, generic)
      : `${specific} ${generic}`;

  return { name, kind, strangeness: s, x: cx, z: cz, ci, cj, cell };
}

/**
 * Name a specific feature at a point — a spring you found, a warren mouth, a
 * barrow. Distinct from the district: a district is the country you are in, a
 * feature is the thing you came to see.
 *
 * Anchored on rounded coordinates so the same feature keeps its name even if
 * two systems ask about it from very slightly different positions.
 */
export function featureName(x, z, kindHint = null) {
  const gx = Math.round(x / NAMES.featureAnchor);
  const gz = Math.round(z / NAMES.featureAnchor);
  const kind = kindHint ?? dominantRegion(regionAt(x, z));
  const s = placeStrangeness(x, z);

  const generic = pick(GENERIC[kind] ?? GENERIC[MOOR], hash2i(gx, gz, 601));
  const specific = pick(registerFor(s), hash2i(gx, gz, 602));
  const roll = hash2i(gx, gz, 603);
  return roll < NAMES.ofFormChance * 1.6
    ? pick(OF_FORMS, hash2i(gx, gz, 604))(specific, generic)
    : `${specific} ${generic}`;
}

/** Bearings people actually use, rather than degrees. */
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

export function bearingName(fromX, fromZ, toX, toZ) {
  // World +Z is south-ish in this projection; what matters is that it is
  // CONSISTENT, so two players agree about which way east is.
  const a = Math.atan2(toX - fromX, -(toZ - fromZ));
  const deg = ((a * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

/**
 * "Where am I?", in the form a person would answer it.
 *
 * The whole point of the phase in one function: a sentence you could say out
 * loud to someone else and have them know where to walk.
 */
export function describePosition(x, z) {
  const d = districtAt(x, z);
  const region = regionAt(x, z);
  const local = dominantRegion(region);
  const dx = x - d.x;
  const dz = z - d.z;
  const dist = Math.hypot(dx, dz);

  // Close to the district's own centre: just name it.
  if (dist < d.cell * 0.22) return { name: d.name, phrase: `in ${d.name}`, district: d, local };

  const bearing = bearingName(d.x, d.z, x, z);
  return {
    name: d.name,
    district: d,
    local,
    phrase: `${Math.round(dist)} m ${bearing} of ${d.name}`,
  };
}

/**
 * Find a named district by name, searching outward from a point.
 *
 * This is the half that makes the names USEFUL rather than merely present: a
 * player who has been told to meet at the Black Moss needs some way of turning
 * that back into a direction. Searches the district grid — which is cheap,
 * since naming a cell is a handful of hashes — and returns the nearest match.
 */
export function findDistrict(query, fromX, fromZ, { radiusCells = 14 } = {}) {
  const cell = NAMES.districtSize;
  const ci0 = Math.floor(fromX / cell);
  const cj0 = Math.floor(fromZ / cell);
  const want = query.trim().toLowerCase();
  let best = null;

  for (let ring = 0; ring <= radiusCells; ring++) {
    for (let cj = cj0 - ring; cj <= cj0 + ring; cj++) {
      for (let ci = ci0 - ring; ci <= ci0 + ring; ci++) {
        // Only the ring's edge, so each cell is visited once.
        if (ring > 0 && Math.abs(ci - ci0) !== ring && Math.abs(cj - cj0) !== ring) continue;
        const d = districtOfCell(ci, cj);
        if (d.name.toLowerCase() !== want) continue;
        const dist = Math.hypot(d.x - fromX, d.z - fromZ);
        if (!best || dist < best.distance) {
          best = { ...d, distance: dist, bearing: bearingName(fromX, fromZ, d.x, d.z) };
        }
      }
    }
    // Found something in this ring — nothing further out can be nearer.
    if (best) break;
  }
  return best;
}

/** Every district within `radiusCells`, for a gazetteer or a map. */
export function nearbyDistricts(x, z, radiusCells = 3) {
  const cell = NAMES.districtSize;
  const ci0 = Math.floor(x / cell);
  const cj0 = Math.floor(z / cell);
  const out = [];
  for (let cj = cj0 - radiusCells; cj <= cj0 + radiusCells; cj++) {
    for (let ci = ci0 - radiusCells; ci <= ci0 + radiusCells; ci++) {
      const d = districtOfCell(ci, cj);
      out.push({
        name: d.name,
        kind: d.kind,
        distance: Math.round(Math.hypot(d.x - x, d.z - z)),
        bearing: bearingName(x, z, d.x, d.z),
      });
    }
  }
  return out.sort((a, b) => a.distance - b.distance);
}
