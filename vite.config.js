import { defineConfig } from 'vite';
// `appendFileSync` is used by the flight recorder. It was dropped from here
// when the notes sink moved to server/notes.js, and the recorder was written
// later assuming it was still imported — so the FIRST request to /__beat threw
// ReferenceError and took the whole dev server down with it, which killed a
// live playtest session. Third time this project has shipped "used a function
// that was never imported"; the config parses, the build is clean, and nothing
// finds it until the line actually runs.
import { writeFileSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
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

/**
 * Dev-only mission board.
 *
 * `GET /__mission` returns MISSION.md. That is the whole mechanism, and it is
 * deliberately not more than that.
 *
 * The problem it solves: two Claudes work on this game — one writing the code,
 * one playing it in a browser — and they cannot talk to each other. Separate
 * sessions, separate contexts, no channel. The instinct is to want an
 * agent-to-agent protocol. The instinct is wrong: they already share a
 * FILESYSTEM, and the game is already a web page that can read from it.
 *
 * So the channel is a mailbox. The one writing code leaves a work order; the
 * one playing picks it up with `highlands.mission()` at the start of a session.
 * Asynchronous, durable, survives a reload, needs no coordination, and a human
 * can read the whole conversation by opening two files in an editor.
 */
/**
 * Dev-only flight recorder.
 *
 * The game POSTs one line of its own state every few seconds to `/__beat` and
 * it lands in `SESSION.log`. `tail -f SESSION.log` and you are watching the
 * run, from a machine that is not the one playing it.
 *
 * Why this rather than screenshots or asking: a playtester's report is what
 * they CHOSE to tell you, filtered through what they noticed. A session where
 * somebody quietly starves, or spends forty minutes stuck inside a rock, or
 * never once opens the thing you shipped last week, produces no report at all —
 * the most damning sessions are the quietest. This is the part they cannot
 * forget to mention.
 *
 * One line, human-readable, so a tail is legible without tooling:
 *
 *   12:52  -140,-220  under trees   hp100 food0 warm34.4  branch  "you are starving"
 */
function flightRecorder() {
  return {
    name: 'highlands-flight-recorder',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__beat', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const line = Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+/g, ' ').slice(0, 400);
          if (line.trim()) {
            appendFileSync(resolve(server.config.root, 'SESSION.log'), `${line}\n`, 'utf8');
          }
          res.end('ok');
        });
      });
    },
  };
}

function missionBoard() {
  return {
    name: 'highlands-mission-board',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__mission', (req, res) => {
        const file = resolve(server.config.root, 'MISSION.md');
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        // No cache, because the point is that it changes between sessions and
        // a stale mission is worse than none — you would test last week's build.
        res.setHeader('cache-control', 'no-store');
        try {
          res.end(readFileSync(file, 'utf8'));
        } catch {
          res.end('no mission set — nobody has left you any orders');
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [screenshotSink(), notesSink(), missionBoard(), flightRecorder()],
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
      // MISSION.md is here for the same reason: the next work order gets
      // written while the last session may still be running, and reloading a
      // tester to hand them their next job would be a poor way to hand it over.
      // FINDINGS.md too: the overnight triage appends to it on a timer, which
      // means it writes at the root while somebody is very likely playing.
      ignored: [
        '**/DEV-NOTES.md',
        '**/MISSION.md',
        '**/SESSION.log',
        '**/FINDINGS.md',
        '**/shots/**',
        '**/*.save.json',
      ],
    },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
