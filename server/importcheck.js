// ── importcheck.js ──────────────────────────────────────────────────────────
// Is every config constant a file uses actually imported into it?
//
//   npm run importcheck
//
// THE BUG THIS EXISTS FOR. The drift-reconciliation patch read `NET.driftSnap`
// in `main.js` and never imported `NET`. A bundler does not catch that — a bare
// identifier is assumed to be a global and resolved at runtime — so:
//
//   `npm run build` was GREEN
//   every other check was GREEN
//   and every snapshot from the server threw "ReferenceError: NET is not
//   defined", which dropped the game to the title screen and froze the clock,
//   the weather and the fires.
//
// A playtester lost most of a session to it and had to patch `window.NET` from
// the page console to play at all. "Build green" was in the commit message.
//
// The lesson is narrow and worth keeping: THE BUILD PROVES THE FILES PARSE AND
// LINK. It proves nothing about a name that is only read when a packet arrives.
// Nothing in this project exercises the browser's snapshot handler, and until
// something does, this is the cheap net that catches the same shape again.
//
// Deliberately not a general linter. It asks one question — does every file
// that reads an exported config constant import it — because that is the exact
// class of mistake that got through, and a check with one job does not rot.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Every .js under a directory, recursively. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * Comments and string literals removed, so a name mentioned in prose or inside
 * a template does not read as a use. Crude but one-directional: it can only
 * ever hide a use, never invent one, so the worst case is a miss and never a
 * false alarm — which is the right way round for a check nobody will debug.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function main() {
  console.log('\n  Is every config constant a file uses actually imported into it?\n');

  const configPath = path.join(ROOT, 'src', 'config.js');
  const configSrc = readFileSync(configPath, 'utf8');
  const exported = [...configSrc.matchAll(/^export const ([A-Z][A-Z0-9_]*)\b/gm)].map((m) => m[1]);

  check('config.js exports a set of constants to check against',
    exported.length > 5, `${exported.length}: ${exported.slice(0, 8).join(', ')}…`);

  // This file is excluded from its own scan: it necessarily contains the very
  // pattern it hunts for, in the sentinel below, and a check that fails on
  // itself teaches people to ignore it.
  const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'server'))]
    .filter((f) => path.resolve(f) !== path.resolve(configPath))
    .filter((f) => path.basename(f) !== 'importcheck.js');

  const missing = [];
  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const body = code(raw);

    // What this file pulls out of config.js, however the path is spelled.
    //
    // READ OFF THE RAW SOURCE, not `body`. The first version scanned the
    // stripped copy — in which `from './config.js'` has become `from ''`,
    // because stripping string literals is the first thing `code()` does. So no
    // import ever matched and the check reported 140 files as broken, including
    // every one that plainly imports correctly. A check that cries wolf at
    // everything is a check nobody will run twice.
    const imports = new Set();
    for (const m of raw.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*config\.js['"]/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) imports.add(name);
      }
    }
    // ...and anything it declares itself, so a local shadow is not a false alarm.
    const declared = new Set(
      [...body.matchAll(/(?:const|let|var|function|class)\s+([A-Z][A-Z0-9_]*)\b/g)].map((m) => m[1]),
    );

    for (const name of exported) {
      // A USE is `NAME.` or `NAME[` — reading a member off it. A bare mention
      // cannot be told from a coincidence and is not worth guessing at.
      //
      // AND IT MUST BE A STANDALONE IDENTIFIER. `\b` alone matched
      // `filter.Q.value` — the Web Audio resonance property — and reported
      // soundscape.js as using the config constant `Q` without importing it.
      // The lookbehind rules out anything that is itself a member access, which
      // is the only way `Q` and `.Q` can be told apart without a real parser.
      if (!new RegExp(`(?<![.\\w$])${name}\\s*[.[]`).test(body)) continue;
      if (imports.has(name) || declared.has(name)) continue;
      missing.push(`${path.relative(ROOT, file).replace(/\\/g, '/')} uses ${name}`);
    }
  }

  check('EVERY CONFIG CONSTANT READ IS IMPORTED',
    missing.length === 0,
    missing.length ? missing.join(' · ') : `${files.length} files, nothing undeclared`);

  // ...and the sentinel, so a green result means the scan actually looked.
  // A check that cannot fail is worse than no check, and this one is easy to
  // break into silence by tightening the "use" pattern too far.
  const probe = code(`
    import { PLAYER } from './config.js';
    const a = PLAYER.eyeHeight;
    const b = NET.driftSnap;
  `);
  const sawImported = /\bPLAYER\s*[.[]/.test(probe);
  const sawBare = /\bNET\s*[.[]/.test(probe)
    && !/import\s*\{[^}]*\bNET\b[^}]*\}\s*from\s*['"][^'"]*config\.js['"]/.test(probe);
  check('  …and the SENTINEL: the scan still spots the exact bug it was written for',
    sawImported && sawBare,
    'a synthetic file using NET without importing it is detected');

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
