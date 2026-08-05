// ── rendercheck.js ──────────────────────────────────────────────────────────
// Does the picture still fit the window after the window changes?
//
//   npm run rendercheck
//
// The bug this exists to stop coming back: `renderer.setPixelRatio` was called
// ONCE at boot, and `syncSize` — which runs every frame — re-fitted width and
// height but never the device pixel ratio, and took an early return whenever the
// CSS size was unchanged. So a DPR-only change (dragging the window to a monitor
// with different scaling, a browser zoom) slipped through completely and the
// renderer went on drawing at the backing-store scale it had booted with. No
// resize event could recover it, because the early return fired first.
//
// Measured live before the fix, at a forced 1280x720: DPR 2 still produced a
// 1280x720 buffer at pixelRatio 1. After: 1920x1080 at 1.5 (the POST cap), and
// back to 1280x720 when the DPR returned to 1.
//
// It is checked from the SOURCE because the thing being tested is a browser
// renderer and there is no GL context out here. That is a real limitation — it
// proves the wiring is present, not that it runs — so the live numbers above are
// the evidence, and this file is the guard against someone tidying it away.
// What it CAN prove for real is that the three.js calls it leans on exist, which
// is the trap this project falls into most often: a name used and never defined.

import { readFileSync } from 'node:fs';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { POST } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const compSrc = readFileSync(new URL('../src/fx/composer.js', import.meta.url), 'utf8');

// The body of syncSize, so a `setPixelRatio` sitting up at boot cannot satisfy
// any of these on its own — the whole point is that it is re-read every frame.
const sync = (mainSrc.match(/function syncSize\(\)[\s\S]*?\n  \}/) ?? [''])[0];

console.log('\n  the drawing buffer follows the window\n');

check('there is a syncSize to inspect', sync.length > 0,
  sync ? `${sync.split('\n').length} lines` : 'could not find function syncSize()');

check('syncSize re-reads devicePixelRatio', /devicePixelRatio/.test(sync),
  /devicePixelRatio/.test(sync) ? '' : 'only read once at boot — the original bug');

check('...and clamps it with POST.maxPixelRatio', /POST\.maxPixelRatio/.test(sync),
  `cap is ${POST.maxPixelRatio}`);

// The guard is the half everybody forgets: without the ratio in the early
// return, a DPR-only change never gets as far as the code that would fix it.
// Non-greedy to `) return;` — the condition itself contains a `()` call, so a
// `[^)]*` here never matches the very line it is meant to inspect.
const guard = (sync.match(/if \([\s\S]*?\) return;/) ?? [''])[0];
check('the early return also guards on the pixel ratio',
  /getPixelRatio\(\)/.test(guard),
  guard ? guard.trim() : 'no early return found');

check('syncSize sets the renderer pixel ratio', /renderer\.setPixelRatio\(/.test(sync),
  /renderer\.setPixelRatio\(/.test(sync) ? '' : 'the buffer never re-scales');

// EffectComposer caches the ratio it was CONSTRUCTED with, so being told the
// size alone leaves every post target at the old scale.
check('...and hands the ratio to the composer too',
  /composer\.setSize\(\s*w,\s*h,\s*pr\s*\)/.test(sync),
  /composer\.setSize\(\s*w,\s*h,\s*pr\s*\)/.test(sync) ? 'composer.setSize(w, h, pr)'
    : 'post targets stay at the boot scale');

check('Composer.setSize accepts a pixelRatio and forwards it',
  /setSize\(w, h, pixelRatio\)/.test(compSrc) && /composer\.setPixelRatio\(pixelRatio\)/.test(compSrc),
  '');

// composer.setSize already sizes every pass it owns, with the ratio-multiplied
// size. Sizing bloom again afterwards with the CSS size re-shrank it — invisible
// at DPR 1, half-resolution glow on any scaled display.
check('bloom is not re-sized with the CSS size afterwards',
  !/\bthis\.bloom\.setSize\(/.test(compSrc),
  /\bthis\.bloom\.setSize\(/.test(compSrc) ? 'bloom targets shrink by the pixel ratio' : '');

// ── the names actually exist ────────────────────────────────────────────────
// This project has shipped five crashes that built cleanly, every one a function
// used with no import. These two are the ones the fix above leans on.
check('EffectComposer really has setPixelRatio',
  typeof EffectComposer.prototype.setPixelRatio === 'function',
  typeof EffectComposer.prototype.setPixelRatio);

check('EffectComposer really has setSize',
  typeof EffectComposer.prototype.setSize === 'function',
  typeof EffectComposer.prototype.setSize);

check('the cap is a sane number', Number.isFinite(POST.maxPixelRatio) && POST.maxPixelRatio >= 1,
  `POST.maxPixelRatio = ${POST.maxPixelRatio}`);

// The clamp itself, which is the only piece of arithmetic in the fix.
const clamp = (dpr) => Math.min(dpr, POST.maxPixelRatio);
check('a hi-DPI monitor is clamped, a normal one is not',
  clamp(2) === POST.maxPixelRatio && clamp(1) === 1,
  `dpr 2 -> ${clamp(2)}, dpr 1 -> ${clamp(1)}`);

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
