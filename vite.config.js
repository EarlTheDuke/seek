import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
          const when = new Date().toISOString().replace('T', ' ').slice(0, 19);
          const who = String(note.who ?? 'player').slice(0, 40);
          const body = String(note.text ?? '').trim();
          if (!body) {
            res.statusCode = 400;
            return res.end('empty');
          }
          // Markdown, because these get read by a person and pasted into
          // issues. The context goes in a blockquote under the note so the
          // note itself is what your eye lands on.
          const ctx = String(note.context ?? '').trim();
          const entry = `\n## ${when} — ${who}\n\n${body}\n${ctx ? `\n> ${ctx}\n` : ''}`;
          const file = resolve(server.config.root, 'DEV-NOTES.md');
          appendFileSync(file, entry, 'utf8');
          server.config.logger.info(`  note from ${who}: ${body.split('\n')[0].slice(0, 70)}`);
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [screenshotSink(), notesSink()],
  server: { host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
