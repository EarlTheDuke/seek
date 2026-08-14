// ── story.js ────────────────────────────────────────────────────────────────
// Turn a journal into something a person would actually read.
//
//   npm run story                       the newest journal in runs/
//   npm run story -- runs/journal-X.jsonl
//   npm run story -- runs/journal-X.jsonl --md > runs/STORY.md
//
// ── WHY THIS IS THE FIRST HALF OF THE RECORDER ──────────────────────────────
//
// TRAJECTORY arc 3 wants "a camera that flies itself and films what is
// happening". The camera already exists — `?watch=1` flies and is never
// corrected, `capture()` writes frames — and nothing drives them, because
// nothing could answer the only question a director has: **where should it be
// looking, and when?**
//
// That question is unanswerable from the board, which forgets, and was
// unanswerable at all until the journal landed. It is answerable now, and the
// answer is a list of moments with times on them. So this is the director's
// BRAIN, built before its hands: get "what was worth watching" right first, and
// pointing a camera at it becomes a small job rather than a guess.
//
// It is also immediately useful on its own. A 400-line journal is a truthful
// record and an unreadable one; this is what a person reads afterwards, and what
// a vision experiment checks itself against — every moment carries the world
// hour, the wall second, the seat and the model.
//
// ── WHAT COUNTS AS A MOMENT ─────────────────────────────────────────────────
//
// Ranked, because a director with no ranking films everything and shows nothing.
// The weights are stated here rather than buried: a kill outranks a meal, a
// thing CHOSEN outranks the same thing done on reflex, and goods changing hands
// outranks both — because a transfer is the rarest event this world produces and
// the one arc 1 is actually about.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

// How much a moment is worth filming. Higher wins. Stated as a table so the
// director's taste is one thing you can read and argue with, rather than a
// scattering of if-statements.
const WORTH = {
  give: 100,        // goods changing hands — the rarest thing this world does
  trade: 100,
  offer: 45,
  accept: 60,
  killed: 70,
  craftChosen: 55,  // a MIND deciding to make something
  eatChosen: 55,    // …or deciding to eat, which has happened once, ever
  death: 90,
  craft: 25,
  place: 15,
  eat: 12,
  gather: 4,
};

function worthOf(line) {
  if (line.k !== 'deed') return 0;
  if (line.what === 'craft') return line.by === 'choice' ? WORTH.craftChosen : WORTH.craft;
  if (line.what === 'eat') return line.by === 'choice' ? WORTH.eatChosen : WORTH.eat;
  return WORTH[line.what] ?? 5;
}

/** Read a journal, tolerating the half-line a killed run can leave behind. */
export function readJournal(file) {
  const out = [];
  let broken = 0;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch { broken++; }
  }
  return { lines: out, broken };
}

/**
 * The story of a run: who was in it, what happened, and what was worth watching.
 *
 * Pure — takes lines, returns an object. A check can drive it with a handful of
 * fixtures and the CLI below is a thin wrapper, which is the split that keeps
 * "does the director have taste" testable.
 */
export function tellStory(lines, { top = 12 } = {}) {
  const head = lines.find((l) => l.k === 'run') ?? {};
  const end = lines.find((l) => l.k === 'end') ?? null;
  const deeds = lines.filter((l) => l.k === 'deed');
  const decisions = lines.filter((l) => l.k === 'decision');
  const gaps = lines.filter((l) => l.k === 'gap');

  const seats = new Map();
  for (const l of [...deeds, ...decisions]) {
    if (!l.who) continue;
    const s = seats.get(l.who) ?? { who: l.who, model: l.model, decisions: 0, deeds: {}, chosen: 0, said: [] };
    if (l.k === 'decision') { s.decisions++; if (l.said) s.said.push(l.said); }
    else {
      s.deeds[l.what] = (s.deeds[l.what] ?? 0) + 1;
      if (l.by === 'choice') s.chosen++;
    }
    seats.set(l.who, s);
  }

  // ── THE MOMENTS, AND A DIRECTOR NEEDS TASTE AND NOT JUST A RANKING ──
  //
  // The first cut took the top twelve by worth and filmed TWELVE IDENTICAL DEER
  // KILLS, crowding out all four of the chosen crafts — the rarest and most
  // interesting events in the file. A ranking alone always does this: the
  // commonest good event wins every slot.
  //
  // So each KIND is capped. Rare things survive the cut by construction, which
  // is the whole reason to have a director rather than a sort.
  const PER_KIND = 3;
  const seenKind = new Map();
  const ranked = deeds
    .map((d) => ({ ...d, worth: worthOf(d) }))
    .filter((d) => d.worth >= WORTH.craft)
    .sort((a, b) => b.worth - a.worth);
  const picked = [];
  for (const d of ranked) {
    const kind = `${d.what}${d.by === 'choice' ? ':chosen' : ''}`;
    const n = seenKind.get(kind) ?? 0;
    if (n >= PER_KIND) continue;
    seenKind.set(kind, n + 1);
    picked.push(d);
    if (picked.length >= top) break;
  }
  // ── ORDERED BY THE WALL, NEVER BY THE WORLD HOUR ──
  //
  // `h` is each agent's own `clock.hours`, which WRAPS AT 24. Sorting by it put
  // `h1.37` at 1173 s before `h16.67` at 608 s — a story told out of order, by
  // the same clock that has now caught this project five times. `at` is real
  // seconds since the run began and is the only monotonic thing in the file.
  const moments = picked.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));

  // ── AND THE THINGS THAT DID NOT HAPPEN ──
  //
  // The most useful line in `playreport` is "what nobody ever did", and it is
  // the same instinct: an absence is a finding, and a story that only lists
  // events cannot report one. Kept to the handful this project is actually
  // asking about.
  const counts = (what) => deeds.filter((d) => d.what === what).length;
  const chosen = (what) => deeds.filter((d) => d.what === what && d.by === 'choice').length;
  const absences = [];
  if (!counts('give') && !counts('trade')) absences.push('NOTHING CHANGED HANDS — no give, no trade, all run');
  if (!chosen('eat')) absences.push('no mind CHOSE to eat — every meal was the reflex');
  if (!chosen('craft')) absences.push('no mind CHOSE to make anything — every make was the reflex');
  if (!counts('killed')) absences.push('nothing was killed, so nothing was ever cooked from a hunt');

  return {
    roster: head.roster ?? 'unknown',
    rotate: head.rotate ?? 0,
    seats: [...seats.values()].sort((a, b) => b.decisions - a.decisions),
    listed: head.seats ?? [],
    decisions: decisions.length,
    deeds: deeds.length,
    moments,
    absences,
    gaps: gaps.reduce((n, g) => n + (g.missed ?? 0), 0),
    finished: !!end,
    seconds: end?.seconds ?? null,
  };
}

/** The story as something a person reads. */
export function storyToMarkdown(s, file) {
  const L = [];
  L.push(`# The run — ${path.basename(file)}`);
  L.push('');
  L.push(`**${s.roster}**${s.rotate ? ` · rotated by ${s.rotate}` : ''} · ` +
    `${s.decisions} decisions · ${s.deeds} deeds` +
    (s.seconds ? ` · ${Math.round(s.seconds / 60)} minutes` : '') +
    (s.finished ? '' : ' · **KILLED, not finished**'));
  if (s.gaps) L.push(`\n> ⚠ ${s.gaps} events are admitted missing — the ring outran the drain.`);
  L.push('');
  L.push('## Who was in it');
  L.push('');
  L.push('| seat | model | decisions | chose | did |');
  L.push('|---|---|---|---|---|');
  for (const p of s.seats) {
    const did = Object.entries(p.deeds).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`).join(', ') || '—';
    L.push(`| ${p.who} | ${p.model ?? 'scripted'} | ${p.decisions} | ${p.chosen} | ${did} |`);
  }
  L.push('');
  L.push('## What was worth watching');
  L.push('');
  if (!s.moments.length) L.push('_Nothing rose above the noise._');
  for (const m of s.moments) {
    // Wall time FIRST, because it is the one a camera and a video seek to, and
    // the one that is monotonic. The world hour rides along in brackets for
    // flavour and is explicitly not the sort key.
    const mm = Math.floor((m.at ?? 0) / 60);
    const ss = String(Math.round((m.at ?? 0) % 60)).padStart(2, '0');
    L.push(`- **${mm}:${ss}** *(world h${(m.h ?? 0).toFixed(1)})* — **${m.who}** ` +
      `(${m.model ?? 'scripted'}) ${m.text}${m.by === 'choice' ? ' — **CHOSEN**' : ''}`);
  }
  if (s.absences.length) {
    L.push('');
    L.push('## What never happened');
    L.push('');
    L.push('_An absence is a finding. `playreport` has said so since it was written._');
    L.push('');
    for (const a of s.absences) L.push(`- ${a}`);
  }
  const talk = s.seats.filter((p) => p.said.length);
  if (talk.length) {
    L.push('');
    L.push('## In their own words');
    L.push('');
    for (const p of talk) {
      for (const line of p.said.slice(-3)) L.push(`- **${p.who}:** "${line}"`);
    }
  }
  return L.join('\n') + '\n';
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('story.js')) {
  const args = process.argv.slice(2).filter((a) => a !== '--md');
  let file = args[0];
  if (!file) {
    const dir = path.join(ROOT, 'runs');
    const found = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => /^journal-.*\.jsonl$/.test(f)).sort().pop()
      : null;
    if (!found) {
      console.error('  no journal given and none in runs/ — run the fleet first, or pass a path');
      process.exit(1);
    }
    file = path.join(dir, found);
  }
  const { lines, broken } = readJournal(file);
  const story = tellStory(lines);
  process.stdout.write(storyToMarkdown(story, file));
  if (broken) console.error(`\n  (${broken} unreadable line(s) — a killed run can leave half a line behind)`);
}
