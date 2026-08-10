// ── bowcheck.js ─────────────────────────────────────────────────────────────
// Can you see that the figure on the ridge is holding a bow?
//
//   npm run bowcheck
//
// Every figure in this world has carried a bow since the first day and not one
// of them ever showed it. You could not tell an archer from a walker — which,
// in a game whose entire threat model is "somebody on a ridge with a bow", is
// the one thing the silhouette most needed to say.
//
// TWO POSES, and the whole design is that they are legible AS SILHOUETTES,
// because at the range this matters nothing else about the figure is:
//
//   SLUNG — across the back, diagonal, riding a shoulder. Seen 95% of the time
//   and it exists only to say "armed".
//
//   DRAWN — round into the leading hand, upright, held out, string pulled. It
//   has to say "at YOU", now, from a hundred metres.
//
// WHY THIS IS A CHECK AND NOT A SCREENSHOT. A screenshot proves one frame on
// one machine and rots the moment anybody moves a number. These assertions are
// about the RELATIONSHIPS that make the poses readable — in front versus
// behind, string back versus straight, arms asymmetric versus matched — and
// those are what would actually break if somebody tuned a constant.
//
// The pose maths lives in `Avatar.apply`, which needs a WebGL context to
// construct. So this drives the same arithmetic directly: it is a check of the
// intent, and it fails loudly if the intent is edited away.

import { lerp } from '../src/util/math.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * The pose, exactly as `Avatar.apply` computes it. Kept in step by hand, and
 * asserted against the source below so it cannot drift silently.
 */
function pose(draw) {
  return {
    bow: {
      x: lerp(-0.12, 0.3, draw),
      y: lerp(1.28, 1.42, draw),
      z: lerp(-0.24, 0.34, draw),
    },
    rot: {
      x: lerp(0.15, 0, draw),
      y: lerp(0.35, 0, draw),
      z: lerp(0.95, 0, draw),
    },
    // The nocking point. 0.03 at rest, pulled back toward the cheek as it draws.
    stringZ: 0.03 - draw * 0.26,
    arms: [lerp(0, -1.62, draw), lerp(0, -0.95, draw)],
  };
}

function main() {
  console.log('\n  Can you see that the figure on the ridge is holding a bow?\n');

  const slung = pose(0);
  const drawn = pose(1);

  // ── SLUNG: behind the body, and lying across it ──────────────────────────
  check('AT REST THE BOW IS ON THEIR BACK',
    slung.bow.z < -0.15,
    `z ${slung.bow.z.toFixed(2)} — behind the spine, where a slung bow rides`);

  check('  …and lies DIAGONALLY, which is what makes it read as slung',
    Math.abs(slung.rot.z) > 0.6,
    `rolled ${slung.rot.z.toFixed(2)} rad — upright on the back reads as a plank`);

  check('  …with the string relaxed',
    Math.abs(slung.stringZ - 0.03) < 1e-9,
    `nock at ${slung.stringZ.toFixed(3)}`);

  // ── DRAWN: in front, upright, string back ────────────────────────────────
  check('DRAWN, IT COMES ROUND IN FRONT OF THEM',
    drawn.bow.z > 0.2,
    `z ${drawn.bow.z.toFixed(2)} — out where a bow at full draw is`);

  check('  …and stands UPRIGHT, square to the way they face',
    Math.abs(drawn.rot.z) < 0.02 && Math.abs(drawn.rot.y) < 0.02,
    'no roll, no yaw — the limbs vertical, the way you hold one');

  check('  …and the string is PULLED, which is the whole tell',
    drawn.stringZ < -0.2,
    `nock at ${drawn.stringZ.toFixed(3)} against ${slung.stringZ.toFixed(2)} at rest — `
    + 'a bow with a straight string is a man holding a hoop');

  // ── AND THE ARMS ─────────────────────────────────────────────────────────
  check('AN ARCHER\'S ARMS ARE NOT SYMMETRICAL',
    Math.abs(drawn.arms[0] - drawn.arms[1]) > 0.4,
    `bow arm ${drawn.arms[0].toFixed(2)}, string arm ${drawn.arms[1].toFixed(2)} — `
    + 'matched arms read as a man pushing a door');

  check('  …the bow arm is the straighter of the two',
    drawn.arms[0] < drawn.arms[1],
    'it locks out; the string arm folds back toward the ear');

  // ── THE TRAVEL BETWEEN THEM IS THE WARNING ───────────────────────────────
  //
  // Lerped rather than switched, because the half-second of a bow coming off a
  // shoulder is the only warning anybody gets at range.
  {
    const half = pose(0.5);
    const between = half.bow.z > slung.bow.z && half.bow.z < drawn.bow.z;
    check('THE BOW TRAVELS, rather than teleporting between poses',
      between,
      `z goes ${slung.bow.z.toFixed(2)} -> ${half.bow.z.toFixed(2)} -> ${drawn.bow.z.toFixed(2)} — `
      + 'that half-second is the only warning you get at a hundred metres');
  }

  // ── AND THE SOURCE STILL SAYS ALL OF THIS ────────────────────────────────
  //
  // The arithmetic above is a copy. This is what stops the copy drifting away
  // from the real thing without anybody noticing.
  {
    const src = readFileSync(new URL('../src/net/avatars.js', import.meta.url), 'utf8');
    const has = (frag) => src.includes(frag);
    check('THE SOURCE STILL COMPUTES THESE EXACT POSES',
      has('lerp(-0.12, 0.3, this.draw)') && has('lerp(-0.24, 0.34, this.draw)')
        && has('lerp(0.95, 0, this.draw)') && has('0.03 - this.draw * 0.26'),
      'if this fails, the numbers above are a fiction and the check is worthless');

    check('  …and the bow is still on the figure at all',
      has('bowPivot') && has('bowString') && has('bowGeometry'),
      'the thing this file exists to protect');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

import { readFileSync } from 'node:fs';
main();
