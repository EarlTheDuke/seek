import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { appendNote } from './server/notes.js';

/**
 * Dev-only screenshot sink.
 *
 * The page can POST raw JPEG bytes to `/__shot?name=foo` and they land in
 * `shots/foo.jpg`. This exists so the world can be photographed from a script
 * (see `capture()` on `window.highlands`) instead of by hand — handy for
 * checking that a change to the terrain or the light did what you expected.
 *
 * `apply: 'serve'` means it never exists in a production build.
 */
function screenshotSink() {
  return {
    name: 'highlands-screenshot-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        const name = (new URL(req.url, 'http://localhost').searchParams.get('name') || 'shot')
          .replace(/[^a-z0-9_-]/gi, '')
          .slice(0, 64);
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const dir = resolve(server.config.root, 'shots');
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, `${name}.jpg`), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

/**
 * Dev-only notes sink.
 *
 * The page POSTs a note to `/__note` and it is APPENDED to `DEV-NOTES.md` in
 * the project root, immediately, with the file closed after every write — so
 * you can `tail -f` it, or leave it open in an editor, and watch notes arrive
 * while somebody is still playing.
 *
 * The point is feedback with its context attached. "I am stuck" is not worth
 * reading; "I am stuck at Rowan Moor, 03:12, freezing, no fire, 14 m up" is
 * something you can act on without asking a single follow-up question — and
 * the player never has to think about supplying any of it, because the game
 * knows all of it already and staples it on.
 *
 * Same `apply: 'serve'` as the screenshot sink: it does not exist in a build.
 */
function notesSink() {
  return {
    name: 'highlands-notes-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__note', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          let note;
          try {
            note = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            res.statusCode = 400;
            return res.end('bad json');
          }
          // The FORMAT lives in server/notes.js, not here. A person typing in
          // the browser and a fleet of agents finishing a session both write
          // this file, and two writers means two formats the moment either one
          // is touched — so there is exactly one, and this is a caller.
          try {
            appendNote(note, server.config.root);
          } catch (err) {
            res.statusCode = 400;
            return res.end(err.message);
          }
          server.config.logger.info(
            `  note from ${note.who ?? 'player'}: ${String(note.text).split('\n')[0].slice(0, 70)}`
          );
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [screenshotSink(), notesSink()],
  server: {
    host: '127.0.0.1',
    watch: {
      // Vite watches the project root, and a full page reload throws a player
      // back to the menu and rolls the world to its last save. Two things in
      // this repo write files WHILE somebody is playing — the notes box and
      // the agent session report — and both of them live at the root, so
      // filing a note used to cost you your run.
      //
      // Reported from a real session: "the dev server kept doing full page
      // reloads every minute or two, which bounced the game back to the menu
      // and rolled the world back to the last save."
      //
      // Note this does NOT cover the other cause of that report, which was
      // somebody editing source while somebody else played. Nothing can fix
      // that but not doing it.
      ignored: ['**/DEV-NOTES.md', '**/shots/**', '**/*.save.json'],
    },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
