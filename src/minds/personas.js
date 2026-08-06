// ── personas.js ─────────────────────────────────────────────────────────────
// Who each mind is, when anybody is anybody.
//
// This is set up as an EXPERIMENT, not a costume box, and the shape follows
// from that:
//
//   OFF is the control, and it has to be a real control. With personas off the
//   system prompt must be BYTE-IDENTICAL to what it was before any of this
//   existed — not "similar". If the off-state quietly drifts, every comparison
//   made against it afterwards is worthless, which is why `personacheck`
//   asserts the bytes rather than the behaviour.
//
//   ON is deterministic. Assignment comes from the seed, so a run reproduces —
//   the same rule the rest of this project lives by. "Player three was the
//   liar" has to still be true tomorrow or the recording means nothing.
//
// A DISPOSITION, NOT A BACKSTORY. Each of these is two or three sentences of
// what this person DOES when it costs them something. A paragraph of history
// changes behaviour far less than one clear standing rule does — and the thing
// being measured is behaviour.
//
// They also only show under pressure. A hoarder with infinite firewood and a
// generous soul with infinite firewood take identical actions; see
// world/scarcity.js, which exists for this reason.

import { hash2i } from '../util/math.js';

/**
 * The table. `id` is what you type; `character` is what the model is told, and
 * it is written in the second person because it goes under "Who you are:".
 */
export const PERSONAS = [
  {
    id: 'hoarder',
    name: 'the hoarder',
    character:
      'You hoard. Wood you have gathered is yours, and you will not share a fire you built. ' +
      'You are not cruel about it — you are simply certain that nobody else would share theirs, ' +
      'and you would rather be the one with fuel left at midnight.',
  },
  {
    id: 'generous',
    name: 'the generous one',
    character:
      'You are generous and it costs you. You offer what you have before you have counted it, ' +
      'and you are slow to notice when somebody is taking advantage. When you do notice, you ' +
      'are hurt rather than angry, and you usually give again anyway.',
  },
  {
    id: 'coward',
    name: 'the coward',
    character:
      'You are a coward and you know it. Below half health you break off, whatever is at stake, ' +
      'and you say out loud that you are going. You would rather be thought honest than brave. ' +
      'You keep well clear of anything with teeth.',
  },
  {
    id: 'liar',
    name: 'the liar',
    character:
      'You mislead people about where the deer are — not out of malice, but because you mean to ' +
      'get there first. You are warm and friendly while you do it, and you never volunteer a ' +
      'correction afterwards.',
  },
  {
    id: 'loner',
    name: 'the loner',
    character:
      'You avoid people. You camp away from anybody else\'s fire, you answer briefly if spoken to, ' +
      'and you would rather walk an extra mile than share a valley. You are not hostile; you ' +
      'simply want to be left alone.',
  },
  {
    id: 'talker',
    name: 'the talker',
    character:
      'You talk constantly. You narrate the weather, the ground and your own plans to anyone ' +
      'within earshot, whether or not they answered. You are good company and you give away ' +
      'far more than you mean to.',
  },
];

const BY_ID = new Map(PERSONAS.map((p) => [p.id, p]));

/** @returns {object|null} */
export function personaById(id) {
  return BY_ID.get(String(id ?? '').trim().toLowerCase()) ?? null;
}

/** Every id, for a usage line. */
export const PERSONA_IDS = PERSONAS.map((p) => p.id);

/**
 * Work out who is who, for a whole fleet at once.
 *
 *   off / '' / null          nobody is anybody — the control
 *   on                       assigned from the seed, deterministically
 *   hoarder,liar,coward      explicit, in order, cycling if the fleet is longer
 *
 * @param {string|null} spec
 * @param {number} count
 * @param {string} seed  anything stable — the world seed, a run id
 * @returns {(object|null)[]} one entry per player, in join order
 */
export function assignPersonas(spec, count, seed = 'highlands') {
  const raw = String(spec ?? '').trim().toLowerCase();
  if (!raw || raw === 'off' || raw === 'none' || raw === '0' || raw === 'false') {
    return new Array(count).fill(null);
  }

  if (raw === 'on' || raw === 'yes' || raw === '1' || raw === 'true') {
    // ── deterministic, and NOT with replacement ──
    //
    // Picking each player's persona independently would happily deal three
    // hoarders and no liar, which wastes a six-player evening. Dealt from a
    // shuffled deck instead: everybody differs until the deck runs out, and the
    // shuffle is a pure function of the seed, so the same run comes back.
    const deck = [...PERSONAS];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(hash2i(i, hashSeed(seed), 91) * (i + 1)) % (i + 1);
      const t = deck[i];
      deck[i] = deck[j];
      deck[j] = t;
    }
    return Array.from({ length: count }, (_, i) => deck[i % deck.length]);
  }

  // Explicit. An id nobody recognises becomes nobody rather than throwing: a
  // typo in a fleet of six should cost you one character, not the evening.
  const wanted = raw.split(/[,\s]+/).filter(Boolean).map(personaById);
  if (!wanted.some(Boolean)) return new Array(count).fill(null);
  return Array.from({ length: count }, (_, i) => wanted[i % wanted.length] ?? null);
}

/** A stable small integer from a string, so the shuffle can be seeded by name. */
function hashSeed(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 9973;
}
