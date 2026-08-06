// ── marksman.js ─────────────────────────────────────────────────────────────
// How to point a bow. NOT what to point it at.
//
// This is the line the whole minds architecture is drawn along: DELIBERATION
// decides who to shoot, REFLEX works out how. A mind reconsiders every eight
// seconds and costs a model call to do it; nobody should be spending one of
// those on trigonometry, and if they had to, every model would fail at it in
// the same way and the comparison between them would measure arithmetic instead
// of judgement.
//
// So the mind says "hunt the deer" and this file answers "hold 4.3° up, and no,
// not from here, there is a ridge in the way at 21 m".
//
// ── why an agent could not hunt at all before this ──
//
// `primary` appeared nowhere in agent.js or hunter.js. Not once. The `hunt`
// goal resolved to "walk toward the quarry", and that is all it had ever done:
// an agent could follow a deer across the map for an hour and had no way to
// end the chase. Every model-driven player in this game has been unable to
// kill anything since the day minds were added.
//
// Pure, deterministic and THREE-free — same rules as glider.js, and for the
// same reason: it has to be testable without a scene, from a socket check.

import { ARROW, BOW, PLAYER } from '../config.js';

/**
 * Fly a virtual arrow at `pitch` and report how far above the mark it passes.
 *
 * Integrated with the SAME quadratic drag and substep the real projectile uses,
 * rather than the schoolbook ½gt² — at 74 m/s the drag term is not a rounding
 * error, and a solver that ignores it shoots high at every range past about 40 m.
 * Reproduces the drop table written in ARROW's own comment: 20 m -> 0.5 m,
 * 40 m -> 2.0 m, 60 m -> 4.5 m.
 *
 * @returns {number} metres above (+) or below (-) the mark at `dist`
 */
export function arrowError(pitch, dist, dy, speed = BOW.maxSpeed) {
  const dt = ARROW.substep;
  let x = 0;
  let y = 0;
  let vx = Math.cos(pitch) * speed;
  let vy = Math.sin(pitch) * speed;
  for (let i = 0; i < 4096; i++) {
    const sp = Math.hypot(vx, vy);
    const k = ARROW.drag * sp * dt;
    vx -= vx * k;
    vy -= vy * k;
    vy -= ARROW.gravity * dt;
    x += vx * dt;
    y += vy * dt;
    if (x >= dist) return y - dy;
    if (y < dy - 80) break; // fallen well past it; no solution this way
  }
  return y - dy;
}

/**
 * The angle that puts an arrow through a mark `dist` away and `dy` above you.
 *
 * Bisected rather than solved in closed form, because with quadratic drag there
 * is no closed form. Forty-eight halvings of a 1.4 rad bracket is far finer than
 * `BOW.spreadFull`, so the search is never the limiting error.
 *
 * @returns {number|null} radians, or null if it cannot be reached even lobbed
 */
export function solvePitch(dist, dy, speed = BOW.maxSpeed) {
  if (!(dist > 0.5)) return null;
  let lo = -0.5;
  let hi = 0.9;
  if (arrowError(hi, dist, dy, speed) < 0) return null;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (arrowError(mid, dist, dy, speed) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Is there anything between an eye and a mark, and where is the worst of it?
 *
 * DISTANCE IS A BAD SHOOTING CRITERION ON A HILLSIDE, which is the single most
 * expensive thing learned in a day of playing this game by hand. Six arrows went
 * into a slope at a deer that was in range, in the open, and unaware, standing
 * 12.7 m above the archer over a crest. The brief said "a deer, close to the
 * north-west" and was telling the truth, and the shot was impossible.
 *
 * Walked in steps rather than solved: the height field is cheap, and a straight
 * line against rolling ground has no analytic answer either. `clear` is the
 * smallest gap between the sightline and the ground along the way — negative
 * means the hill is ABOVE the line, which is a hill you are shooting into.
 *
 * @param {(x:number,z:number)=>number} groundAt
 * @returns {{clear:number, at:number, dist:number, blocked:boolean}}
 */
export function sightline(fromX, eyeY, fromZ, toX, toY, toZ, groundAt, margin = 0.3) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const dist = Math.hypot(dx, dz);
  let worst = Infinity;
  let at = 0;
  // Not from 0: the ground under your own feet is level with your feet, and
  // starting there reports every shot ever taken as blocked by the archer.
  for (let s = 0.05; s < 0.98; s += 0.02) {
    const gap = eyeY + (toY - eyeY) * s - groundAt(fromX + dx * s, fromZ + dz * s);
    if (gap < worst) {
      worst = gap;
      at = dist * s;
    }
  }
  return { clear: worst, at, dist, blocked: worst < margin };
}

/**
 * Everything the body needs to take one shot at one mark, or the reason not to.
 *
 * The single call an agent makes. It answers with an ORDER — turn to this, hold
 * this, or do not shoot and here is why — so the calling code contains no
 * ballistics and no terrain reasoning at all.
 *
 * @returns {{shoot:boolean, yaw:number, pitch:number, dist:number, why:string}}
 */
export function aimAt(from, target, groundAt, { maxRange = 60 } = {}) {
  const eyeY = from.y + PLAYER.eyeHeight;
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const dist = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx, -dz);

  if (dist > maxRange) return { shoot: false, yaw, pitch: 0, dist, why: 'too far' };

  const line = sightline(from.x, eyeY, from.z, target.x, target.y, target.z, groundAt);
  if (line.blocked) {
    return {
      shoot: false, yaw, pitch: 0, dist,
      why: `ground in the way ${line.at.toFixed(0)} m out`,
    };
  }

  const pitch = solvePitch(dist, target.y - eyeY);
  if (pitch === null) return { shoot: false, yaw, pitch: 0, dist, why: 'cannot reach' };
  return { shoot: true, yaw, pitch, dist, why: 'clear' };
}
