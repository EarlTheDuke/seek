// ── storycheck.js ───────────────────────────────────────────────────────────
// Does the director have taste?
//
//   npm run storycheck
//
// `story.js` is the first half of TRAJECTORY arc 3 — the camera already flies
// and `capture()` already writes frames, and neither could ever be driven
// because nothing could answer "where should it be looking, and when". This
// file holds the ANSWER to account, because a director that films the wrong
// thing is worse than none: it produces a watchable artefact that misrepresents
// the run.
//
// Both assertions below are failures the tool actually committed the first time
// it was pointed at a real journal:
//
//   1. IT FILMED TWELVE IDENTICAL DEER KILLS and cut all four chosen crafts —
//      the rarest and most interesting events in the file. A pure ranking always
//      does this: the commonest good event takes every slot.
//   2. IT TOLD THE STORY OUT OF ORDER, because it sorted on the world hour —
//      which is each agent's own `clock.hours` and WRAPS AT 24. `h1.37` at
//      1173 s came before `h16.67` at 608 s. The fifth time that clock has
//      caught this project.

import { tellStory, storyToMarkdown } from './story.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n  Storycheck — does the director have taste?\n');

const deed = (at, h, who, what, extra = {}) =>
  ({ k: 'deed', at, h, who, model: 'grok-4.6', what, text: `${what} at ${at}`, ...extra });

// ── 1. THE COMMONEST EVENT MUST NOT TAKE EVERY SLOT ─────────────────────────
{
  const lines = [{ k: 'run', roster: 'r.json' }];
  for (let i = 0; i < 12; i++) lines.push(deed(100 + i, 10 + i * 0.1, 'Ailsa', 'killed'));
  lines.push(deed(500, 7.8, 'Ailsa', 'craft', { by: 'choice', text: 'I chose to make 4 arrows' }));
  lines.push(deed(520, 7.9, 'Fingal', 'craft', { by: 'choice', text: 'I chose to make a torch' }));
  const s = tellStory(lines);
  const kills = s.moments.filter((m) => m.what === 'killed').length;
  const chosen = s.moments.filter((m) => m.by === 'choice').length;
  check('TWELVE KILLS AND TWO CHOSEN MAKES — the rare things survive the cut',
    chosen === 2, `${chosen}/2 chosen makes kept, alongside ${kills} kills`);
  check('  …and no single kind is allowed to fill the reel',
    kills <= 3, `${kills} kills of 12 made the cut`);
}

// ── 2. THE ORDER IS THE WALL, NEVER THE WORLD HOUR ──────────────────────────
{
  // The exact shape that broke it: a LATER wall time carrying an EARLIER world
  // hour, because the in-world clock wrapped past midnight between them.
  const lines = [
    { k: 'run', roster: 'r.json' },
    deed(608, 16.67, 'Fingal', 'killed'),
    deed(1173, 1.37, 'Ailsa', 'killed'),      // later in reality, "earlier" in the day
  ];
  const s = tellStory(lines);
  check('A STORY IS TOLD IN THE ORDER IT HAPPENED, not in the order of the wrapping clock',
    s.moments[0].at === 608 && s.moments[1].at === 1173,
    s.moments.map((m) => `${m.at}s/h${m.h}`).join(' then '));
  const md = storyToMarkdown(s, 'x.jsonl');
  check('  …and the printed time is the WALL time, with the world hour as flavour',
    /\*\*10:08\*\*/.test(md) && /world h16\.7/.test(md),
    (md.match(/- \*\*.*/) ?? ['no moment line'])[0].slice(0, 76));
}

// ── 3. AN ABSENCE IS A FINDING ──────────────────────────────────────────────
{
  const quiet = tellStory([{ k: 'run' }, deed(10, 1, 'A', 'gather')]);
  check('A RUN WHERE NOTHING CHANGED HANDS SAYS SO',
    quiet.absences.some((a) => /NOTHING CHANGED HANDS/.test(a)), quiet.absences.join(' | '));
  check('  …and one where nobody chose to eat says that too',
    quiet.absences.some((a) => /CHOSE to eat/.test(a)), `${quiet.absences.length} absences reported`);

  const busy = tellStory([
    { k: 'run' },
    deed(10, 1, 'A', 'give', { text: 'I gave wood to B' }),
    deed(20, 2, 'A', 'eat', { by: 'choice', text: 'I chose to eat a venison' }),
    deed(30, 3, 'A', 'craft', { by: 'choice', text: 'I chose to make 4 arrows' }),
    deed(40, 4, 'A', 'killed', { text: 'I brought down a deer' }),
  ]);
  check('  …and a run where all four happened claims NO absence',
    busy.absences.length === 0, JSON.stringify(busy.absences));
  check('  …while a TRANSFER outranks everything, because it is the rarest thing here',
    busy.moments[0].what === 'give' || busy.moments.some((m) => m.what === 'give'),
    busy.moments.map((m) => m.what).join(' '));
}

// ── 4. A KILLED RUN IS NOT REPORTED AS A FINISHED ONE ───────────────────────
{
  const killed = tellStory([{ k: 'run', roster: 'r.json' }, deed(5, 1, 'A', 'gather')]);
  check('A RUN WITH NO END LINE IS REPORTED AS KILLED',
    killed.finished === false && /KILLED, not finished/.test(storyToMarkdown(killed, 'x')),
    'no end marker, and the story says so');
  const done = tellStory([{ k: 'run' }, deed(5, 1, 'A', 'gather'), { k: 'end', seconds: 4200 }]);
  check('  …and a finished one reports its length',
    done.finished === true && done.seconds === 4200, `${done.seconds}s`);
}

// ── 5. AND IT ADMITS THE HOLES THE JOURNAL ADMITTED ─────────────────────────
{
  const holed = tellStory([
    { k: 'run' },
    { k: 'gap', who: 'A', missed: 4 },
    { k: 'gap', who: 'B', missed: 1 },
    deed(5, 1, 'A', 'killed'),
  ]);
  check('GAPS THE JOURNAL ADMITTED ARE CARRIED INTO THE STORY, not quietly dropped',
    holed.gaps === 5 && /5 events are admitted missing/.test(storyToMarkdown(holed, 'x')),
    `${holed.gaps} missing events reported`);
}

// ── 6. THE SHOT LIST — what a camera can actually use ───────────────────────
//
// The prose is for a person; this is the same moments as coordinates. It is the
// half that was missing when the recorder was specified: the story could say
// WHEN a kill happened and WHO made it, and had no way to say WHERE, so nothing
// could be pointed at it. Deeds carry `x`/`z` from 2026-08-14.
{
  const s = tellStory([
    { k: 'run' },
    { ...deed(100, 1, 'Ailsa', 'killed'), x: 40.5, z: -12.25 },
    { ...deed(200, 2, 'Fingal', 'craft', { by: 'choice', text: 'I chose to make 4 arrows' }), x: -8, z: 3 },
  ]);
  check('EVERY PLACEABLE MOMENT BECOMES A SHOT — where, when, and whose',
    s.shots.length === 2 && s.shots[0].x === 40.5 && s.shots[0].who === 'Ailsa',
    JSON.stringify(s.shots[0]));
  check('  …and a chosen act is flagged, because it is the shot worth cutting to',
    s.shots.find((x) => x.chosen)?.who === 'Fingal',
    s.shots.map((x) => `${x.who}${x.chosen ? '*' : ''}`).join(' '));
  check('  …and each carries a hold, so a camera knows how long to stay',
    s.shots.every((x) => x.hold > 0), `hold ${s.shots[0].hold}s`);
}

// ── AND A MOMENT WITH NO POSITION IS DROPPED AND COUNTED ────────────────────
//
// Never included with a guessed one. Pointing a camera at 0,0 and calling it a
// kill is the silent-zero disease with a lens on it — and every journal written
// before 2026-08-14 is full of exactly these.
{
  const old = tellStory([{ k: 'run' }, deed(100, 1, 'Ailsa', 'killed')]);
  check('A MOMENT WITH NO POSITION IS DROPPED FROM THE SHOT LIST, NOT GUESSED AT',
    old.shots.length === 0 && old.unplaceable === 1,
    `${old.shots.length} shots, ${old.unplaceable} unplaceable`);
  check('  …and the story SAYS it dropped them, rather than reading as complete',
    /carry no position and were DROPPED/.test(storyToMarkdown(old, 'x.jsonl')),
    'the reader is told the file lacks the information');
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed\n`);
if (passed < results.length) {
  console.log('  FAILED:');
  for (const r of results.filter((x) => !x.pass)) console.log(`    - ${r.name}`);
  console.log('');
}
