// ── playreport.js ───────────────────────────────────────────────────────────
// What a fleet of agents just told you about your game, without being asked.
//
// The temptation is to hand the transcript to a model and ask "what was
// confusing?". Don't. A mind asked to introspect produces opinion, and opinion
// from a thing that has read none of the game is worth very little. What is
// worth a great deal is BEHAVIOUR, which is free, unfakeable, and already
// happening: twelve independent minds each given senses and a closed list of
// verbs, and a record of which verbs they reached for.
//
// So every line in here is evidence rather than commentary, and the strongest
// section is the one nobody would think to write:
//
//   WHAT NOBODY EVER DID. If twelve minds play for twenty minutes and not one
//   of them ever makes camp, that is not twelve incurious agents. It is a verb
//   the game never gave anybody a reason to reach for, and no amount of playing
//   it yourself will show you that — you know where the camp is, so you build
//   one. The absence is the finding, and absences do not appear in logs unless
//   something goes looking for them.
//
// Pure: agents and some meta in, markdown out. No fs, no clock, no network, so
// `npm run reportcheck` can build a report from invented agents and check the
// findings are real rather than checking that a file got written.

import { GOAL_IDS, describeGoal } from '../src/minds/goals.js';

/** Metres travelled, from where they woke up to where they stopped. */
const travelled = (a) => Math.hypot((a.x ?? 0) - (a.startX ?? 0), (a.z ?? 0) - (a.startZ ?? 0));

/**
 * Turn a finished session into something worth reading.
 *
 * @param {object[]} agents  the Agent instances, after the run
 * @param {object} meta      { seconds, minds, model, spend }
 * @returns {{text:string, findings:string[]}}
 */
export function buildReport(agents, meta = {}) {
  const minutes = (meta.seconds ?? 0) / 60;
  const live = agents.filter(Boolean);
  const findings = [];
  const out = [];

  const totalDecisions = live.reduce((n, a) => n + (a.decisions ?? 0), 0);
  out.push(`${live.length} agent${live.length === 1 ? '' : 's'}, ` +
    `${minutes < 1 ? `${Math.round(meta.seconds ?? 0)} seconds` : `${minutes.toFixed(0)} minutes`}, ` +
    `${meta.minds ?? 'scripted'} minds, ${totalDecisions} decisions between them.`);

  // ── what they reached for ──
  const tally = {};
  for (const a of live) {
    for (const [goal, n] of Object.entries(a.goalCounts ?? {})) tally[goal] = (tally[goal] ?? 0) + n;
  }
  const ranked = Object.entries(tally).sort((x, y) => y[1] - x[1]);
  if (ranked.length) {
    out.push('\n**What they spent their time on**\n');
    for (const [goal, n] of ranked) {
      out.push(`- ${goal} — ${n} time${n === 1 ? '' : 's'} (${Math.round((n / totalDecisions) * 100)}%)`);
    }
  }

  // ── the finding, and the honesty that makes it worth anything ──
  //
  // An absence only means something if there was a real chance to observe the
  // thing. The first live run of this reported "nobody ever hunted, made camp,
  // or spoke" off TWELVE decisions in thirty seconds, which is not a finding
  // about the game, it is a finding about the run being too short — and a
  // report that cries wolf on its first outing teaches you to stop reading it.
  //
  // So there is a floor, and below it the report says what it does not know.
  // Roughly enough decisions for every verb in the vocabulary to have had a
  // fair few chances, and long enough for hunger and dark to start pushing.
  const never = GOAL_IDS.filter((id) => !tally[id]);
  const enough = totalDecisions >= GOAL_IDS.length * 5 && (meta.seconds ?? 0) >= 180;
  if (!enough) {
    out.push(`\n_Too short to conclude anything from what is missing — ` +
      `${totalDecisions} decisions over ${Math.round(meta.seconds ?? 0)}s. ` +
      `Needs ${GOAL_IDS.length * 5}+ decisions and 3+ minutes before an absence means much._`);
  } else if (never.length) {
    out.push('\n**What nobody ever did**\n');
    for (const id of never) out.push(`- \`${id}\` — not once, by anybody`);
    out.push('\nA verb no independent mind ever reached for is a verb the game ' +
      'never gave anyone a reason to want. Worth asking whether it is discoverable, ' +
      'whether it is useful, or whether it should exist.');
    findings.push(`never used: ${never.join(', ')}`);
  }

  // ── stuck ──
  // Two different kinds of stuck, and they mean different things. Somebody who
  // decided a hundred times and went nowhere is being defeated by the world;
  // somebody who never decided at all is being failed by the harness.
  const stuck = live.filter((a) => (a.decisions ?? 0) >= 4 && travelled(a) < 12);
  if (stuck.length) {
    out.push('\n**Went nowhere**\n');
    for (const a of stuck) {
      out.push(`- ${a.name} — ${a.decisions} decisions, moved ${travelled(a).toFixed(0)} m`);
    }
    findings.push(`${stuck.length} went nowhere`);
  }

  const thrash = live
    .map((a) => {
      const counts = Object.entries(a.goalCounts ?? {}).sort((x, y) => y[1] - x[1])[0];
      return counts && counts[1] >= 6 && counts[1] / (a.decisions || 1) > 0.8 ? { a, goal: counts[0], n: counts[1] } : null;
    })
    .filter(Boolean);
  if (thrash.length) {
    out.push('\n**Set the same goal over and over**\n');
    for (const t of thrash) {
      out.push(`- ${t.a.name} — chose \`${t.goal}\` ${t.n} times and kept choosing it`);
    }
    out.push('\nA mind that keeps re-deciding the same thing is a mind whose goal ' +
      'is not being satisfied. Either it cannot tell it is failing, or it can and ' +
      'has nothing better to reach for.');
    findings.push(`${thrash.length} looping on one goal`);
  }

  // ── did they ever touch anything ──
  // Separate from the goal tally on purpose. Deciding to gather and actually
  // arriving at a branch are different events with a walk in between, and for
  // most of this project's life the second number was zero for every verb —
  // the agent had no hands and nothing said so.
  const hands = {};
  for (const a of live) {
    for (const [k, n] of Object.entries(a.acted ?? {})) hands[k] = (hands[k] ?? 0) + n;
  }
  const touched = Object.entries(hands);
  if (touched.length) {
    out.push('\n**What they actually touched**\n');
    for (const [what, n] of touched.sort((x, y) => y[1] - x[1])) {
      out.push(`- ${what} — ${n} time${n === 1 ? '' : 's'}`);
    }
  } else if (totalDecisions > 0) {
    out.push('\n**They never touched anything**\n');
    out.push('Not one interact, place or eat in the whole run. Either nothing ' +
      'was ever in reach, or the goals they chose do not lead to the hands.');
    findings.push('never touched anything');
  }

  // ── what they said ──
  // The only unprompted words in the whole run, and the closest thing to a
  // player telling you something in their own voice.
  const said = live.flatMap((a) => (a.said ?? []).map((t) => `${a.name}: ${t}`));
  if (said.length) {
    out.push('\n**What they said out loud**\n');
    for (const s of said.slice(0, 20)) out.push(`- ${s}`);
  }

  // ── what broke ──
  const errors = live.filter((a) => a.lastError);
  if (errors.length) {
    out.push('\n**Errors**\n');
    for (const a of errors) out.push(`- ${a.name} — ${a.lastError}`);
    findings.push(`${errors.length} agents hit errors`);
  }

  if (meta.spend?.calls) {
    out.push(`\n> ${meta.spend.calls} model calls · ${meta.spend.tokensIn} in / ` +
      `${meta.spend.tokensOut} out tokens${meta.model ? ` · ${meta.model}` : ''}`);
  }

  return { text: out.join('\n'), findings };
}

/** One line for the console, so a run says what it found before you go looking. */
export function summarise(findings) {
  return findings.length ? findings.join(' · ') : 'nothing worth flagging';
}

export { describeGoal };
