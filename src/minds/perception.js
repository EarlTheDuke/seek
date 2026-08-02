// ── perception.js ───────────────────────────────────────────────────────────
// What this creature could actually know.
//
// THE HONESTY RULE, from VISION.md §6b, and the single most important line in
// the whole minds design:
//
//   > A mind is given its creature's SENSES, not the world's state.
//
// Never the player's coordinates. Never inventory it has not seen. Never a
// creature on the far side of a hill. The brief below is assembled only from
// things this body could genuinely have perceived — what is in its field of
// view and close enough to make out, what it heard, what the wind carried,
// what it remembers, and how it feels.
//
// This is the difference between an opponent that feels alive and one that
// feels like it is cheating, and it is nearly free here because the sense
// model that produces exactly this already exists and has since the deer.
//
// It is also, not incidentally, what makes the prompt SMALL. A mind that is
// only told what it can see needs a few hundred tokens, not the world.

import { STEALTH } from '../config.js';
import { regionAt, describeRegion } from '../world/regions.js';
import { describePosition, bearingName } from '../world/placenames.js';
import { sampleEnvironment } from '../world/environment.js';
import { placeStrangeness, darkness } from '../world/strangeness.js';
import { clamp } from '../util/math.js';

/** Rough, human distance words. A mind should not think in metres. */
function howFar(d) {
  if (d < 6) return 'right here';
  if (d < 20) return 'close';
  if (d < 55) return 'a little way off';
  if (d < 130) return 'far off';
  return 'a long way off';
}

function howHurt(fraction) {
  if (fraction > 0.95) return 'unhurt';
  if (fraction > 0.7) return 'scratched';
  if (fraction > 0.4) return 'hurt';
  if (fraction > 0.15) return 'badly hurt';
  return 'nearly finished';
}

/**
 * Can `self` (a body with position, yaw and a senses profile) perceive `other`?
 *
 * Returns null when it cannot, and otherwise HOW it noticed — because "I heard
 * something behind me" and "I can see a man on the ridge" should lead to
 * different decisions, and a mind that is told only "player at 40 m" cannot
 * tell them apart.
 */
export function perceive(self, other, ctx = {}) {
  const dx = other.position.x - self.position.x;
  const dz = other.position.z - self.position.z;
  const dist = Math.hypot(dx, dz);

  const S = self.senses ?? DEFAULT_SENSES;
  const noise = other.noise ?? 0;
  const visibility = other.visibility ?? 1;

  // ── sight ── needs range, a field of view, and something to see.
  let seen = false;
  if (dist < S.sightRange) {
    const fx = Math.sin(self.yaw);
    const fz = Math.cos(self.yaw);
    const facing = (dx / (dist || 1)) * fx + (dz / (dist || 1)) * fz;
    if (facing > Math.cos(S.sightFov / 2)) {
      // Darkness hides things. A mind out at night should be told less.
      const light = 1 - (ctx.night ?? 0) * 0.75;
      seen = (1 - dist / S.sightRange) * visibility * light > 0.12;
    }
  }

  // ── hearing ── omnidirectional, and entirely about how much noise they make.
  const hearRange = (S.hearingRange ?? STEALTH.hearingRange) * noise;
  const heard = noise > 0.02 && dist < hearRange;

  // ── scent ── only downwind.
  const smelled = (ctx.scentAt?.(other.position.x, other.position.z, self.position.x, self.position.z) ?? 0) > 0.05;

  if (!seen && !heard && !smelled) return null;

  return {
    what: other.label ?? 'someone',
    how: seen ? 'seen' : heard ? 'heard' : 'smelled',
    // A thing you have only HEARD gets a direction and no detail, which is
    // exactly as much as you would actually have.
    where: bearingName(self.position.x, self.position.z, other.position.x, other.position.z),
    distance: howFar(dist),
    // Withheld unless actually seen. This is the honesty rule in one line.
    doing: seen ? (other.doing ?? null) : null,
    condition: seen && other.healthFraction !== undefined ? howHurt(other.healthFraction) : null,
    _metres: dist, // for the scripted provider's arithmetic; never sent to a model
  };
}

const DEFAULT_SENSES = { sightRange: 70, sightFov: 2.4, hearingRange: 60 };

/**
 * The full brief for one mind, one deliberation.
 *
 * Deliberately prose-shaped rather than a state dump: the consumer is either a
 * language model or a rule set, and both do better with "you are cold, on an
 * open ridge, at night, and you have heard something to the north" than with
 * forty numbered fields. VISION.md makes the same point about environment.js —
 * "a prompt saying you are cold and wet on an open ridge at night is worth a
 * hundred coordinates".
 */
export function buildBrief(self, world, ctx) {
  const pos = self.position;
  const region = regionAt(pos.x, pos.z);
  const env = sampleEnvironment(pos, ctx);
  const place = describePosition(pos.x, pos.z);
  const night = darkness(ctx.sunAltitude ?? 90);

  const contacts = [];
  for (const other of world.perceivableBy(self)) {
    const p = perceive(self, other, { night, scentAt: ctx.scentAt });
    if (p) contacts.push(p);
  }
  contacts.sort((a, b) => a._metres - b._metres);

  return {
    // ── where ──
    place: place.phrase,
    ground: describeRegion(region),
    strangeness: +placeStrangeness(pos.x, pos.z).toFixed(2),
    hour: `${String(Math.floor(ctx.hours ?? 12)).padStart(2, '0')}:00`,
    light: night > 0.8 ? 'dark' : night > 0.35 ? 'dusk' : 'daylight',
    weather: ctx.weather?.stateName ?? 'clear',
    wind: ctx.weather ? bearingFromAngle(ctx.weather.windAngle) : 'still',

    // ── how you are ──
    condition: env.describe(),
    health: howHurt((self.health ?? 100) / 100),
    hunger: self.hunger === undefined ? null : self.hunger > 70 ? 'fed' : self.hunger > 35 ? 'hungry' : 'starving',
    carrying: self.carrying ?? [],

    // ── what you know ──
    contacts: contacts.map(({ _metres, ...rest }) => rest),
    memory: self.mind?.memory?.recent(ctx.hours) ?? [],
    goal: self.mind?.goal?.kind ?? 'none',

    // Kept out of any prompt; the scripted provider uses it for arithmetic.
    _contacts: contacts,
  };
}

function bearingFromAngle(radians) {
  const dirs = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const deg = (((radians * 180) / Math.PI) % 360 + 360) % 360;
  return `from the ${dirs[Math.round(deg / 45) % 8]}`;
}

/** How a brief reads as text. Used by the LLM provider and by the debug view. */
export function briefToText(b) {
  const lines = [
    `You are ${b.place}, ${b.ground}. It is ${b.hour}, ${b.light}, ${b.weather}, wind ${b.wind}.`,
    `You are ${b.health} and ${b.condition}${b.hunger ? `, and ${b.hunger}` : ''}.`,
  ];
  if (b.carrying.length) lines.push(`You are carrying: ${b.carrying.join(', ')}.`);
  if (b.contacts.length) {
    lines.push('You are aware of:');
    for (const c of b.contacts) {
      const bits = [`  - ${c.what}, ${c.how}, ${c.distance} to the ${c.where}`];
      if (c.doing) bits.push(`, ${c.doing}`);
      if (c.condition) bits.push(` (${c.condition})`);
      lines.push(bits.join(''));
    }
  } else {
    lines.push('You are aware of nothing but the weather.');
  }
  if (b.memory.length) {
    lines.push('You remember:');
    for (const m of b.memory) lines.push(`  - ${m}`);
  }
  lines.push(`Your current intention is: ${b.goal}.`);
  return lines.join('\n');
}
