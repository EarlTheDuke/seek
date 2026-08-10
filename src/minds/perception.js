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

/**
 * How a brief reads as text. Used by the LLM provider and by the debug view.
 *
 * TOLERANT OF A PARTIAL BRIEF, and that is not politeness. A creature's brief
 * is built from the world; an AGENT's is built from a network snapshot and
 * genuinely has less in it. The strict version read `b.carrying.length` and
 * threw on the agent's brief — inside the provider's try block, so it landed
 * in the catch and fell back to the scripted brain. Every model-driven agent
 * would have silently never called the model, and it would have looked like
 * the model being stupid rather than a missing field.
 */
export function briefToText(b) {
  const lines = [];
  const where = [b.place, b.ground].filter(Boolean).join(', ');
  const when = [b.hour, b.light, b.weather, b.wind && `wind ${b.wind}`].filter(Boolean).join(', ');
  if (where) lines.push(`You are ${where}. It is ${when}.`);
  else lines.push(`It is ${when}.`);
  // `cold` is the agent's word for what a creature calls `condition`. Both go
  // in — a mind that cannot tell it is freezing cannot decide to make a fire,
  // and until now neither number reached an agent at all.
  const body = [b.health, b.condition, b.cold, b.hunger].filter(Boolean).join(', ');
  if (body) lines.push(`You are ${body}.`);
  if (b.carrying?.length) lines.push(`You are carrying: ${b.carrying.join(', ')}.`);
  // Stated, not left to be inferred from a gap in the line above. See the
  // `lacking` comment in agent.js — one mind hunted for an hour on an empty bow.
  if (b.lacking?.length) lines.push(`You have ${b.lacking.join('; ')}.`);
  // The mirror of `lacking`. A mind not told a thing is full goes on choosing
  // to fill it — 32 per cent of every decision in one measured hour was picking
  // things up, by bodies already carrying more than they could ever use.
  if (b.full?.length) {
    const list = b.full.length > 1
      ? `${b.full.slice(0, -1).join(', ')} or ${b.full.at(-1)}`
      : b.full[0];
    lines.push(`You cannot carry any more ${list} — picking up more is wasted.`);
  }
  // ── SOMEBODY IS FIGHTING SOMETHING, AND IT IS TOO BIG FOR THEM ──
  //
  // Above everything, because it is the only line in this brief that another
  // person's life depends on, and because it EXPIRES twice over — the fight
  // ends, and the fighter can die.
  //
  // The whole reason this exists, from a playtester who did everything right
  // and still failed: he recruited four models, walked them a kilometre to the
  // ground he had picked, and they stood beside him narrating the hunt and
  // choosing `hunt deer` every tick. The troll in front of them was in nobody's
  // brief, so there was nothing to decide about.
  //
  // It NAMES THE CHOICE and does not make it. That is the point — a mind that
  // refuses to help has told you something real about itself, and a mind that
  // was never asked has told you nothing at all. Ailsa refusing ("too risky,
  // I'll pass") is a finding. Ailsa drifting back to deer is a bug.
  if (b.fight) {
    const f = b.fight;
    lines.push(`${f.who} is fighting a ${f.what} — ${f.hurt} — ${f.distance} to the ${f.where}.`);
    lines.push('  Nothing that size goes down to one person. Go and help, or do not, but decide.');
  }
  // ── A DEAL SOMEBODY IS HOLDING OPEN FOR YOU ──
  //
  // Above the outcome and above the world, because it EXPIRES: the other mind
  // is standing there waiting and will wander off. `accept` was chosen zero
  // times in three live hours by seven models, and this line is the reason —
  // the offer used to arrive as a memory among memories and had faded by the
  // next decision.
  //
  // Says the verb out loud. The rest of this prose describes the world and
  // lets the mind choose; this one names `accept` because the measurement is
  // unambiguous that the verb was not being connected to the situation, and a
  // deal nobody can see is not a market.
  if (b.offered) {
    const o = b.offered;
    lines.push(`${o.from} is offering you ${o.gives} for ${o.asks}, right now.`);
    lines.push(o.canPay
      ? `  You can pay that. Answer with \`accept\` and name ${o.from}, or ignore it and it lapses.`
      : `  You are ${o.short} short of paying it.`);
  }
  // ── WHAT YOUR LAST ACTION DID ──
  // High up, and before the world, because it is the one thing that tells a
  // mind whether what it decided last time worked. Everything below is the
  // world's state and would read identically whether the last decision did
  // anything at all.
  if (b.outcome?.length) {
    lines.push('Since your last decision:');
    for (const o of b.outcome) lines.push(`  - ${o}`);
  }
  // Stated plainly and above what it heard, because being shot outranks gossip.
  if (b.shotBy) lines.push(`${b.shotBy} shot you.`);
  if (b.heard?.length) {
    lines.push('You have heard:');
    for (const h of b.heard) lines.push(`  - ${h}`);
  }
  if (b.contacts?.length) {
    lines.push('You are aware of:');
    for (const c of b.contacts) {
      const bits = [`  - ${c.what}, ${c.how}, ${c.distance} to the ${c.where}`];
      if (c.doing) bits.push(`, ${c.doing}`);
      if (c.condition) bits.push(` (${c.condition})`);
      // Whether it can actually be SHOT, and only close enough for that to be a
      // real question. "A deer, close to the north-west" was true of an animal
      // standing over a crest with a hillside between you, and six arrows went
      // into that hillside before anybody worked out why.
      if (c.sight) bits.push(` — ${c.sight}`);
      lines.push(bits.join(''));
    }
  } else {
    lines.push('You are aware of nothing but the weather.');
  }
  // ── AND THE PEOPLE TOO FAR TO SEE ──
  //
  // Deliberately below `contacts` and deliberately thinner: a name and a
  // direction, no distance and no condition. Those belong to the near channel,
  // and repeating them here would make 140 m mean nothing.
  //
  // Without this, two minds that drifted apart were unable to name each other,
  // and every social verb takes a target that can only be named from the
  // prompt. They were each alone in a private world with the same weather.
  // Named ground, so two minds can agree on a spot instead of inventing one.
  if (b.places?.length) lines.push(`Places hereabouts: ${b.places.join(', ')}.`);
  if (b.far?.length) {
    lines.push('Also out there somewhere:');
    for (const f of b.far) lines.push(`  - ${f.who}, off to the ${f.where}`);
  }
  if (b.memory?.length) {
    lines.push('You remember:');
    for (const m of b.memory) lines.push(`  - ${m}`);
  }
  lines.push(`Your current intention is: ${b.goal ?? 'nothing in particular'}.`);
  // ── THE PLAN AND THE PAGE, last, next to the intention they belong with ──
  //
  // A mind's own words, handed straight back. Below the world because they are
  // what it does ABOUT the world, and immediately after the current intention
  // because "here is what you are doing / here is why / here is what comes
  // next" is one thought in three lines.
  if (b.plan?.length) {
    lines.push('Your plan:');
    b.plan.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`));
  }
  if (b.note) lines.push(`Your notes: ${b.note}`);
  return lines.join('\n');
}
