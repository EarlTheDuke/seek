// ── notes.js ────────────────────────────────────────────────────────────────
// The one thing that knows how to write DEV-NOTES.md.
//
// Two entirely different things file notes — a person typing into a box in the
// browser, and a fleet of agents finishing a session in Node — and they must
// produce the same file, or reading it means holding two formats in your head
// and the second one to be written will drift from the first. So the format
// lives here, once, and both callers import it.
//
// Appended, never rewritten, and the handle is closed after every write, so you
// can `tail -f DEV-NOTES.md` and watch notes land while somebody is still
// playing. That is the whole point of it being a file rather than a log window.

import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const NOTES_FILE = 'DEV-NOTES.md';

/**
 * Append one note.
 *
 * @param {object} note
 * @param {string} note.text     what happened, in words
 * @param {string} [note.who]    who is speaking — a player, or an agent's name
 * @param {string} [note.context] where they were and what was happening
 * @param {string} [note.when]   ISO-ish stamp; defaults to now
 * @param {string} [root]        project root
 * @returns {string} the path written to
 */
export function appendNote({ text, who = 'player', context = '', when = null }, root = process.cwd()) {
  const body = String(text ?? '').trim();
  if (!body) throw new Error('a note with nothing in it is not a note');
  const stamp = when ?? new Date().toISOString().replace('T', ' ').slice(0, 19);
  // Markdown, because these get read by a person and pasted into issues. The
  // context sits in a blockquote UNDER the note so your eye lands on the words
  // somebody chose rather than on the telemetry.
  const ctx = String(context ?? '').trim();
  const entry = `\n## ${stamp} — ${String(who).slice(0, 60)}\n\n${body}\n${ctx ? `\n> ${ctx}\n` : ''}`;
  const file = resolve(root, NOTES_FILE);
  appendFileSync(file, entry, 'utf8');
  return file;
}
