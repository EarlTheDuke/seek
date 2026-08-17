// ── bowcheck.js ─────────────────────────────────────────────────────────────
// Which way round is the bow, and is the string arm actually pulling?
//
//   npm run bowcheck
//
// THE HOLE THIS CLOSES. Ben, watching a run on 2026-08-14:
//
//   "The bow is backward when they pull it back to fire it on the character
//    model."
//
//   "...when the bow is pulled back to shoot it looks odd as both arms are
//    directly out straight but really only one should be out and the other one
//    back like it is pulling the bow back."
//
// Both were true, both had been true since the day the avatar bow was written,
// and both were sitting in plain sight as literal numbers in `avatars.js`. The
// grip was at z = -0.055 and the tips at z = +0.03 on a body facing +Z, which
// is a bow held back to front. The two arms were at -1.62 and -0.95, which are
// both FORWARD.
//
// Nothing failed. Nothing could fail: it is geometry, and geometry only reports
// to an eye. Two builds, two hundred tests and a dozen runs went past it, and
// what finally caught it was somebody looking at the screen.
//
// ── SO WHAT CAN A TEST ACTUALLY SAY ABOUT A SHAPE? ──────────────────────────
//
// Not "does it look right" — that stays Ben's job and always will. But a strung
// bow is not only a shape, it is a MECHANISM, and a mechanism has facts:
//
//   * The string is straight and runs tip to tip.
//   * It is drawn toward the archer.
//   * So the string plane lies between the archer and the grip, and the grip is
//     therefore the part of the bow furthest from the archer.
//
// Those follow from each other. Any one of them, asserted, catches a mirrored
// profile immediately. Same for the arms: an archer's two arms point in
// OPPOSITE directions along the aim axis, and that is a dot product, not an
// opinion.
//
// This is the difference between a test that would have caught it and a test
// that would have re-stated the bug: assert the mechanism, not the numbers. A
// check that said `grip.z === -0.055` would have passed happily for months.
//
// ── AND IT RUNS IN NODE ─────────────────────────────────────────────────────
//
// `avatars.js` is browser code, but its numbers are exported as plain data and
// its imports (three, and one addon) resolve under node. So this needs no
// browser, no canvas and no server — it imports the real constants the real
// renderer uses. Not a copy. A copy would drift, and a drifted copy of the
// numbers is exactly how you get a green check over a backward bow.

import { BOW_MODEL } from '../src/net/avatars.js';

const results = [];
function check(what, pass, detail = '') {
  results.push({ what, pass });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`);
}

const r2 = (n) => Math.round(n * 1000) / 1000;

// The frame, stated once so every assertion below can lean on it: the figure is
// built facing +Z (`avatars.js` places it with `rotation.y = p.y + Math.PI`, and
// the drawn bow sits at z = +0.34 while the slung one sits at z = -0.24). So
// +Z is toward the target and -Z is the archer's own face.
const FORWARD = 1;

console.log('\n  Highlands — bowcheck: the shape of a drawn bow\n');

// ── the frame itself, before anything leans on it ───────────────────────────
{
  const { slung, drawn } = BOW_MODEL.pose;
  check('THE FRAME: +Z is forward — the drawn bow is out front, the slung one is behind',
    drawn.pos[2] * FORWARD > 0 && slung.pos[2] * FORWARD < 0,
    `drawn z ${drawn.pos[2]}, slung z ${slung.pos[2]}`);
  check('the drawn bow is held up, higher than it hangs slung',
    drawn.pos[1] > slung.pos[1],
    `${slung.pos[1]} -> ${drawn.pos[1]}`);
  check('the drawn bow is square to the body — no leftover tilt from being slung',
    drawn.rot.every((a) => a === 0) && slung.rot.some((a) => a !== 0),
    `drawn [${drawn.rot}], slung [${slung.rot}]`);
}

// ── the profile ─────────────────────────────────────────────────────────────
const zAt = (y) => BOW_MODEL.profile.find(([py]) => Math.abs(py - y) < 1e-9)?.[1];
const grip = zAt(0);
const upperTip = zAt(BOW_MODEL.tipY);
const lowerTip = zAt(-BOW_MODEL.tipY);
const zs = BOW_MODEL.profile.map(([, z]) => z);

check('the profile has a grip at y = 0 and a tip at each end',
  grip !== undefined && upperTip !== undefined && lowerTip !== undefined,
  `grip ${grip}, tips ${lowerTip} / ${upperTip}`);

// ── THE ONE THAT WOULD HAVE CAUGHT IT ───────────────────────────────────────
//
// Old numbers: grip -0.055, tips +0.03. This reads FAIL on those, which is the
// entire reason the file exists.
check('THE GRIP IS FORWARD OF THE TIPS — the bow bulges at the target, not at the archer',
  grip * FORWARD > upperTip * FORWARD && grip * FORWARD > lowerTip * FORWARD,
  `grip z ${grip} vs tips ${lowerTip} / ${upperTip}` +
    (grip * FORWARD > upperTip * FORWARD ? '' : ' — THIS IS THE BOW HELD BACK TO FRONT'));

check('the grip is the furthest-forward point on the whole limb',
  Math.max(...zs.map((z) => z * FORWARD)) === grip * FORWARD,
  `grip ${grip}, max ${r2(Math.max(...zs))}`);

check('the limbs sweep BACK toward the archer between grip and tip',
  Math.min(...zs) * FORWARD < upperTip * FORWARD,
  `throat ${r2(Math.min(...zs))} is behind the tip at ${upperTip}`);

check('the tips flick forward again — that is what makes it a recurve, not a hoop',
  upperTip * FORWARD > Math.min(...zs) * FORWARD,
  `throat ${r2(Math.min(...zs))} -> tip ${upperTip}`);

check('the limbs are a mirror pair — an asymmetric bow is a broken bow',
  BOW_MODEL.profile.every(([y, z]) => {
    const twin = BOW_MODEL.profile.find(([py]) => Math.abs(py + y) < 1e-9);
    return twin && Math.abs(twin[1] - z) < 1e-9;
  }),
  `${BOW_MODEL.profile.length} points`);

// ── the string ──────────────────────────────────────────────────────────────
check('THE STRING IS INSIDE THE GRIP — it is between the archer and the bow, always',
  BOW_MODEL.stringZ * FORWARD < grip * FORWARD,
  `string ${BOW_MODEL.stringZ} vs grip ${grip} — brace ${r2(Math.abs(grip - BOW_MODEL.stringZ))}`);

check('the string is straight tip to tip at brace — its z IS the tips z',
  Math.abs(BOW_MODEL.stringZ - upperTip) < 1e-9,
  `string ${BOW_MODEL.stringZ}, tip ${upperTip}`);

// Brace height on a real bow is roughly an eighth of its length. This is not
// asking for accuracy — it is asking that the gap be VISIBLE, because a string
// flush against the grip reads as a stick at any distance.
const brace = Math.abs(grip - BOW_MODEL.stringZ) / (BOW_MODEL.tipY * 2);
check('the brace gap is big enough to see — a flush string reads as a stick',
  brace > 0.04 && brace < 0.2,
  `${Math.round(brace * 100)}% of the bow's length`);

// ── the draw ────────────────────────────────────────────────────────────────
const nockAt = (draw) => ({
  x: -draw * BOW_MODEL.drawX,
  z: BOW_MODEL.stringZ - draw * BOW_MODEL.drawZ,
});
check('DRAWING PULLS THE NOCK TOWARD THE ARCHER, not toward the target',
  nockAt(1).z * FORWARD < nockAt(0).z * FORWARD,
  `${r2(nockAt(0).z)} -> ${r2(nockAt(1).z)}`);

check('at full draw the string is behind the whole bow — nothing to clip through',
  nockAt(1).z * FORWARD < Math.min(...zs) * FORWARD,
  `nock ${r2(nockAt(1).z)} vs deepest limb ${r2(Math.min(...zs))}`);

// The bow is in the left hand at x = +0.3; the face is at x = 0. So the nock
// must travel toward -x in the bow's own frame or it is drawn to a point beside
// the archer's head rather than to it.
check('the nock comes ACROSS toward the face as it comes back',
  nockAt(1).x < 0 && Math.abs(nockAt(1).x) < BOW_MODEL.pose.drawn.pos[0],
  `local x ${r2(nockAt(1).x)}, so world x ${r2(BOW_MODEL.pose.drawn.pos[0] + nockAt(1).x)} against a face at 0`);

check('the draw is long enough to read at distance',
  BOW_MODEL.drawZ > BOW_MODEL.tipY * 0.4,
  `${BOW_MODEL.drawZ} on a bow of half-height ${BOW_MODEL.tipY}`);

// ── the arms ────────────────────────────────────────────────────────────────
//
// An arm hangs at (0, -1, 0) and rotation.x by t sends it to (0, -cos t,
// -sin t). That is the only thing needed to turn the pose numbers back into
// directions, and directions are what the eye reads.
const armDir = (t) => ({ y: -Math.cos(t), z: -Math.sin(t) });
const [bowArm, stringArm] = BOW_MODEL.pose.armAim.map(armDir);

check('the BOW arm points at the target',
  bowArm.z * FORWARD > 0.9,
  `forward component ${r2(bowArm.z)}`);

// ── THE OTHER ONE THAT WOULD HAVE CAUGHT IT ─────────────────────────────────
//
// Old string arm: -0.95, whose forward component is +0.81. This reads FAIL.
check('THE STRING ARM POINTS BACK — one arm out and one arm back IS the pose',
  stringArm.z * FORWARD < -0.9,
  `forward component ${r2(stringArm.z)}` +
    (stringArm.z * FORWARD < 0 ? '' : ' — BOTH ARMS ARE POINTING FORWARD'));

check('the two arms are opposed, not merely different',
  bowArm.z * stringArm.z < 0 && Math.abs(bowArm.z + stringArm.z) < 0.05,
  `${r2(bowArm.z)} against ${r2(stringArm.z)}`);

check('neither arm droops — a drawn archer holds both at the shoulder',
  Math.abs(bowArm.y) < 0.2 && Math.abs(stringArm.y) < 0.2,
  `lift ${r2(bowArm.y)} / ${r2(stringArm.y)}`);

// arms[0] is at x = +0.27, the figure's left, and the bow swings to x = +0.3.
// If those ever disagree the bow is being held by the hand that is drawing it.
check('the bow is on the same side as the arm that holds it',
  BOW_MODEL.pose.drawn.pos[0] > 0 && BOW_MODEL.pose.armTuck[0] === 0,
  `bow at x ${BOW_MODEL.pose.drawn.pos[0]}, and arms[0] (x +0.27, the left) is the one with no tuck`);

check('only the string arm tucks in — the bow arm stays out on its side',
  BOW_MODEL.pose.armTuck[0] === 0 && BOW_MODEL.pose.armTuck[1] > 0,
  `[${BOW_MODEL.pose.armTuck}]`);

// ── the sentinels ───────────────────────────────────────────────────────────
//
// Every assertion above is a claim that a number is on a particular SIDE of
// something. That is exactly the kind of claim that passes when you have the
// sign backwards and the frame backwards at once, so: feed each of the two
// real bugs back in and require the check to reject them. A check that cannot
// fail on the bug it was written for is decoration.
{
  const oldProfileGrip = -0.055;
  const oldProfileTip = 0.03;
  check('SENTINEL: the ORIGINAL profile is rejected — grip behind tips',
    !(oldProfileGrip * FORWARD > oldProfileTip * FORWARD),
    `grip ${oldProfileGrip}, tips ${oldProfileTip} — the bug, as shipped`);

  const oldString = armDir(-0.95);
  check('SENTINEL: the ORIGINAL string arm is rejected — it pointed forward',
    !(oldString.z * FORWARD < -0.9),
    `forward component ${r2(oldString.z)} — the bug, as shipped`);

  const oldNock = 0.03 - 1 * 0.26;
  check('SENTINEL: the original nock DID travel the right way, so say so',
    oldNock * FORWARD < 0.03 * FORWARD,
    'the draw was never the broken part — only the shape it drew against');
}

const failed = results.filter((r) => !r.pass);
console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
if (failed.length) {
  console.log('  A bow that fails here will look wrong on the screen. Look at it.\n');
}
process.exit(failed.length ? 1 : 0);
