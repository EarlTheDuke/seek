// ── journal.js ──────────────────────────────────────────────────────────────
// The run, written down, and never overwritten.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// `deeds` and `intentions` are rings `AGENTS.logSize` (400) deep PER SEAT, and
// until now they were the only record a run left behind. That is fine for the
// board — a watcher wants the last few — and useless for everything after the
// fact:
//
//   * On 2026-08-12 a run's five TRANSFERS rolled off the ring within minutes.
//     They survive only because `board.json` happened to be snapshotted to a
//     file from outside the game every 45 seconds, by hand, three separate
//     times in one evening.
//   * `playreport` can only report what is still in the ring when the process
//     exits, so a two-hour run is summarised from its last few minutes.
//   * DEV-NOTES is written ONLY on a clean exit. Killing the window — which is
//     what STOP.cmd does, and what Windows does to a console process — skips it
//     entirely. Two runs' reports were lost that way in one day.
//
// So: append-only, flushed as it goes, one JSON object per line. A run that is
// killed mid-sentence still leaves everything up to that sentence.
//
// ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
//
// NOT the board, and not a replacement for it. The board answers "what is
// happening now" and is allowed to forget. This answers "what happened", and is
// not allowed to.
//
// NOT in the simulation. Nothing here is read back by the world, so it cannot
// affect a run — a seeded run reproduces whether or not anybody was writing it
// down. It is an observer, and observers must not have opinions.
//
// ── THE SEQUENCE NUMBER IS THE WHOLE TRICK ──────────────────────────────────
//
// Draining a ring safely needs a monotonic id, because "everything after index
// N" is wrong the moment the ring shifts — which is exactly when a busy seat is
// producing the events worth keeping. `Agent.did` and the decision recorder
// stamp `seq` on every entry, this remembers the highest it has written per
// seat, and nothing is written twice or missed.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Open a journal for one run.
 *
 * @param {string} file  where to write. Created if missing, APPENDED if not —
 *   two runs into one file is a legible mistake; a truncated first run is not.
 */
export function openJournal(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Opened once and kept, rather than `appendFileSync` per line: a fleet of
  // seven at 30 Hz would otherwise open and close a file handle thousands of
  // times a minute for no benefit.
  const fd = fs.openSync(file, 'a');
  const seen = new Map();               // agent name -> highest seq written
  let lines = 0;
  let closed = false;

  const put = (obj) => {
    if (closed) return;
    fs.writeSync(fd, JSON.stringify(obj) + '\n');
    lines++;
  };

  return {
    file,
    get lines() { return lines; },

    /** One header line, so a reader knows what world this was. */
    begin(meta) {
      put({ k: 'run', at: 0, ...meta });
    },

    /**
     * Write everything these agents have done since the last call.
     *
     * Deliberately PULLS rather than being pushed to: the agent stays ignorant
     * of the journal, which keeps the seam clean and means a check can drive
     * this against a plain object with the right two arrays.
     */
    drain(agents, elapsed = 0) {
      for (const a of agents) {
        if (!a) continue;
        const who = a.name;
        const from = seen.get(who) ?? 0;
        let high = from;
        const model = a.provider?.model ?? a.provider?.name ?? 'scripted';

        // ── A GAP IS DATA. A SILENT GAP IS THE DISEASE ──
        //
        // This drains a RING, so if a seat produced more entries between two
        // drains than the ring holds, the oldest are gone before anybody looked.
        // With `logSize` 400 against a once-a-second drain that needs 400 deeds
        // in a second and cannot happen — but "cannot happen" is what was said
        // about a stale server on port 8080, and this file exists BECAUSE the
        // last thing that quietly dropped events was believed to be complete.
        //
        // So when the oldest surviving entry is newer than the last one written,
        // say how many went missing and carry on. A journal with a hole in it
        // that admits the hole is worth more than one that reads as whole.
        const lowest = Math.min(
          ...[...(a.deeds ?? []), ...(a.intentions ?? [])]
            .map((e) => e?.seq).filter((n) => typeof n === 'number' && n > from),
        );
        if (Number.isFinite(lowest) && lowest > from + 1) {
          put({ k: 'gap', at: round(elapsed), who, model, missed: lowest - from - 1,
                why: 'more events than the ring holds happened between two drains' });
        }
        for (const d of a.deeds ?? []) {
          if (!d?.seq || d.seq <= from) continue;
          high = Math.max(high, d.seq);
          put({ k: 'deed', at: round(elapsed), h: d.h, who, model, what: d.what,
                text: d.text, ...(d.id ? { id: d.id } : {}), ...(d.n ? { n: d.n } : {}),
                ...(d.by ? { by: d.by } : {}), ...(d.filled ? { filled: d.filled } : {}) });
        }
        for (const t of a.intentions ?? []) {
          if (!t?.seq || t.seq <= from) continue;
          high = Math.max(high, t.seq);
          put({ k: 'decision', at: round(elapsed), h: t.h, who, model,
                goal: t.goal, why: t.why ?? null, where: t.where ?? null,
                ...(t.said ? { said: t.said } : {}) });
        }
        if (high > from) seen.set(who, high);
      }
    },

    /** A last line, so a reader can tell a finished run from a killed one. */
    end(meta = {}) {
      put({ k: 'end', ...meta });
      close();
    },

    close,
  };

  function close() {
    if (closed) return;
    closed = true;
    try { fs.closeSync(fd); } catch { /* already gone */ }
  }
}

const round = (n) => Math.round(n * 10) / 10;
