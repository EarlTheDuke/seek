import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
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

export default defineConfig({
  base: './',
  plugins: [screenshotSink()],
  server: { host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
