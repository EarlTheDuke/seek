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
  // ── FROM THE MUZZLE, NOT THE EYE ──
  // `Bow.fire` spawns the shaft `BOW.muzzle` along the aim line so it clears
  // the archer's own capsule. Starting the integration at the eye gives every
  // model of this bow half a metre of free range, and — because the hold is
  // usually downward — a few centimetres of height it does not have. Measured
  // over a socket at twelve arrows long out of twelve. See `BOW.muzzle`.
  let x = BOW.muzzle * Math.cos(pitch);
  let y = BOW.muzzle * Math.sin(pitch);
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
export function sightline(fromX, eyeY, fromZ, toX, toY, toZ, groundAt, margin = 0.3, solidAt = null) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const dist = Math.hypot(dx, dz);
  let worst = Infinity;
  let at = 0;
  let blocked = false;
  // What stopped it, when something did. `'ground'` is a hill; `'timber'` is a
  // trunk or a crown, and the two want different answers from the body — you
  // walk round a tree, you climb out from behind a hill.
  let what = null;
  // Not from 0: the ground under your own feet is level with your feet, and
  // starting there reports every shot ever taken as blocked by the archer.
  for (let s = 0.05; s < 0.98; s += 0.02) {
    const px = fromX + dx * s;
    const pz = fromZ + dz * s;
    const py = eyeY + (toY - eyeY) * s;
    const gap = py - groundAt(px, pz);
    if (gap < worst) {
      worst = gap;
      at = dist * s;
    }
    // ── and the wood, which the height field cannot see ──
    // A hill is a shape in `groundAt`; a tree is not in it at all, so a line
    // straight through an oak read as open meadow. See world/timber.js.
    if (solidAt && what === null && solidAt(px, py, pz)) {
      blocked = true;
      what = 'timber';
    }
    // ── the margin TAPERS toward the animal ──
    //
    // A uniform clearance demand along the whole ray is wrong at the far end,
    // and wrong in the direction that costs shots. The ray finishes at the
    // deer's chest, roughly 0.75 m above the ground it is standing on, so the
    // last stretch is ALWAYS close to the ground by construction — that is the
    // ground the animal is standing on, not an obstacle between you and it.
    //
    // Demanding a full 0.3 m there made the body refuse shots it would have
    // made: measured at eight refusals to five taken, every one of them
    // "ground in the way". Requiring less clearance the nearer we get to the
    // mark keeps the honest rejections — a crest at mid-flight — and drops the
    // ones that were only ever the target's own hillside.
    const needed = margin * Math.min(1, (1 - s) / 0.2);
    if (gap < needed) {
      blocked = true;
      what ??= 'ground';
    }
  }
  return { clear: worst, at, dist, blocked, what };
}

/**
 * Does the ACTUAL ARC clear the ground, and where is it closest?
 *
 * `sightline` tests the straight chord from eye to mark, and an arrow does not
 * fly a chord. At any range worth shooting it leaves at a few degrees of
 * hold-over and spends the whole middle of its flight ABOVE the line — so a
 * crest that the chord clips is often a crest the shaft sails over, and the
 * body refused those shots. Measured: sixteen refusals to zero arrows in one
 * run, the worst of them reported as "ground in the way 1 m out" — which is
 * not a hill between archer and deer at all, it is the lip of ground under the
 * archer's own boots, one metre in front of a crouched eye 1.05 m up.
 *
 * The chord is still the right test for PERCEPTION — "can I see it" is a
 * question about a line — and it stays in the brief. This is the test for
 * whether to loose, and it is the trajectory the bow will actually fly,
 * integrated with the same drag and substep the projectile uses.
 *
 * @returns {{clear:number, at:number, blocked:boolean}}
 */
export function arcClearance(from, eyeY, pitch, mark, groundAt, {
  speed = BOW.maxSpeed,
  margin = 0.25,
  // The shaft spawns `BOW.muzzle` along the aim line, so the ground nearer than
  // that is behind the arrow before it exists. The integration now starts there
  // too, so this is belt and braces — a little past it, to stay honest.
  ignoreWithin = 0.8,
  // ── everything solid that is not the ground ──
  //
  // `(x, y, z) => truthy` — see `timberBlocker` in world/timber.js. Without it
  // this walks the height field alone, and a trunk is not in the height field:
  // an arc that will end in an oak comes back "clear 2.1 m". Measured, not
  // supposed — huntcheck's instrument had both aimed arrows of a run landing
  // `hit tree`, 10 m and 6 m short of marks at 21 m and 17 m, while the body
  // patiently took the same shot again.
  solidAt = null,
} = {}) {
  const dx = mark.x - from.x;
  const dz = mark.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (!(dist > 0.5)) return { clear: Infinity, at: 0, blocked: false, what: null };
  const ux = dx / dist;
  const uz = dz / dist;

  const dt = ARROW.substep;
  // From the muzzle, like the bow — see `arrowError` and `BOW.muzzle`.
  let x = BOW.muzzle * Math.cos(pitch);
  let y = BOW.muzzle * Math.sin(pitch);
  let vx = Math.cos(pitch) * speed;
  let vy = Math.sin(pitch) * speed;
  let worst = Infinity;
  let at = 0;
  for (let i = 0; i < 4096 && x < dist; i++) {
    const sp = Math.hypot(vx, vy);
    const k = ARROW.drag * sp * dt;
    vx -= vx * k;
    vy -= vy * k;
    vy -= ARROW.gravity * dt;
    x += vx * dt;
    y += vy * dt;
    if (x < ignoreWithin || x > dist) continue;
    const wx = from.x + ux * x;
    const wz = from.z + uz * x;
    // The wood first: it is the one that ends the flight outright, and where it
    // is matters more than how much air was under the shaft at that moment.
    if (solidAt && solidAt(wx, eyeY + y, wz)) {
      return { clear: 0, at: x, blocked: true, what: 'timber' };
    }
    const gap = eyeY + y - groundAt(wx, wz);
    if (gap < worst) {
      worst = gap;
      at = x;
    }
  }
  return { clear: worst, at, blocked: worst < margin, what: worst < margin ? 'ground' : null };
}

/**
 * Where this shot will actually come down, according to our own model of it.
 *
 * THE CONTROL. Comparing an arrow against the animal tells you it missed;
 * comparing it against where your own ballistics said it would land tells you
 * WHOSE fault that was. If the two agree, the bow is understood and the error
 * is in the aim — the lead, the target, the spread. If they disagree, the model
 * is wrong, and no amount of adjusting the aim will ever fix it.
 *
 * That distinction is what three passes of constant-tuning never had, and it is
 * why the failure kept moving instead of going away.
 *
 * @returns {{x:number, z:number, dist:number, flight:number}}
 */
export function predictLanding(from, eyeY, pitch, yaw, groundAt, speed = BOW.maxSpeed) {
  // The bow's own convention, shared with `makeAimProxy` and the controller.
  const ux = -Math.sin(yaw);
  const uz = -Math.cos(yaw);
  const dt = ARROW.substep;
  // From the muzzle, like the bow — see `arrowError` and `BOW.muzzle`.
  let x = BOW.muzzle * Math.cos(pitch);
  let y = BOW.muzzle * Math.sin(pitch);
  let t = 0;
  let vx = Math.cos(pitch) * speed;
  let vy = Math.sin(pitch) * speed;
  for (let i = 0; i < 8192; i++) {
    const sp = Math.hypot(vx, vy);
    const k = ARROW.drag * sp * dt;
    vx -= vx * k;
    vy -= vy * k;
    vy -= ARROW.gravity * dt;
    x += vx * dt;
    y += vy * dt;
    t += dt;
    const wx = from.x + ux * x;
    const wz = from.z + uz * x;
    if (eyeY + y <= groundAt(wx, wz)) return { x: wx, z: wz, dist: x, flight: t };
  }
  return { x: from.x + ux * x, z: from.z + uz * x, dist: x, flight: t };
}

/**
 * A spot near here with a clear line to the mark, or null if there is none.
 *
 * WHAT A PERSON DOES WHEN A CREST IS IN THE WAY: steps sideways and looks
 * again. The body only knew how to walk straight at the animal, so a hill
 * between the two of them could only be solved by closing until the deer bolted
 * — and on rolling ground that is most hills.
 *
 * Tried across the line of sight rather than in a ring, because the obstruction
 * is on that line and the cheapest way past it is around its edge. Nearest
 * offsets first, so the answer is the shortest walk that works.
 *
 * ── AND A STEP ASIDE MUST ALSO CLOSE — `advance`, off by default ──
 *
 * THE MEASURED BUG. Offsets purely PERPENDICULAR to the line of sight hold the
 * range exactly, and a six-metre step at twenty-four metres actually LENGTHENS
 * the slant to 24.7. `AGENTS.shootRange` is 26 and the body is refused at 20-26,
 * so the moment the animal drifts the slant crosses 26 and `aimAt` answers
 * `too far` — which carries no `blockedBy`, so the detour branch stops firing
 * and the body turns and walks back at the hill it just left. Measured over
 * eight runs on both arms of the commitment flag: `too far` ends 54-64% of ALL
 * detour episodes. It is the commonest end of a step aside by a long way, and
 * it is pure geometry rather than anything the body decided.
 *
 * So a candidate may also move UP the line of sight: `along` metres toward the
 * quarry as well as `step` metres across it. That is what a person does walking
 * round a knoll at a deer — the sidestep closes ground, it does not preserve it.
 *
 * TWO PROPERTIES WORTH THE READING, because both are the difference between
 * this helping and this being the fourth failed pass at the same bug:
 *
 *   IT CANNOT WALK ONTO THE ANIMAL. `along` is clamped to `d - minRange`, and
 *   the range from the candidate is at least `d - along` whatever the offset
 *   across, so the clamp bounds the new range from below by `minRange`. The
 *   caller passes `AGENTS.standOff`; closing inside that is the bug the
 *   stand-off exists for (arrows landing 2 m from the archer).
 *
 *   THE RANGE CANNOT RISE ON THE WAY THERE. Distance to a point is convex along
 *   a straight line, so the maximum over the walk is at one of its two ends. A
 *   candidate whose range is below the current one therefore never lets the
 *   slant exceed where it already was — `too far` cannot fire mid-walk unless it
 *   was already firing when the body set off. That is the whole mechanism.
 *
 * The diagonals are tried first and the FLAT offsets are still tried after them,
 * so the candidate set here is a strict SUPERSET of the default one: turning
 * this on can only reduce how often there is nowhere to go, never increase it.
 * It does mean a twenty-metre diagonal is preferred to a six-metre flat step —
 * deliberate, since the flat step is the one that does not close, and the walk
 * is bounded by `AGENTS.detourHoldSeconds` either way.
 *
 * With `advance` at 0 the loop is the single flat pass it always was, candidate
 * for candidate and in the same order.
 *
 * @returns {{x:number, z:number, step:number, along:number}|null}
 */
export function clearSpotNear(
  from,
  target,
  groundAt,
  { steps = [6, -6, 12, -12, 20, -20], solidAt = null, advance = 0, minRange = 0 } = {}
) {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  // Perpendicular to the line of sight, normalised.
  const px = -dz / d;
  const pz = dx / d;
  // ...and along it, toward the quarry. Only used when `advance` says so.
  const fx = dx / d;
  const fz = dz / d;

  // Diagonals first, flats after — see the superset argument above. Built as a
  // list rather than branching inside the loop so the `advance = 0` case is
  // visibly the same six candidates in the same order.
  const cands = [];
  if (advance > 0) {
    const room = Math.max(0, d - minRange);
    for (const step of steps) cands.push({ step, along: Math.min(advance * Math.abs(step), room) });
  }
  for (const step of steps) cands.push({ step, along: 0 });

  for (const { step, along } of cands) {
    const x = from.x + px * step + fx * along;
    const z = from.z + pz * step + fz * along;
    const eyeY = groundAt(x, z) + PLAYER.eyeHeight;
    // A spot with a hill out of the way and a tree in it is not a spot. The
    // blocker goes in here too, or stepping aside just finds different wood.
    if (!sightline(x, eyeY, z, target.x, target.y, target.z, groundAt, 0.3, solidAt).blocked) {
      return { x, z, step, along };
    }
  }
  return null;
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
export function aimAt(
  from,
  target,
  groundAt,
  { maxRange = 60, velocity = null, lag = 0, eye = PLAYER.eyeHeight, solidAt = null } = {}
) {
  // ── how high the string actually is, not how high a standing person's is ──
  //
  // `PLAYER.eyeHeight` is 1.72 and `PLAYER.crouchHeight` is 1.05, and a body
  // stalking a deer is crouched — so the arc was solved for a launch two thirds
  // of a metre above the one the bow took. The whole trajectory arrives that
  // much low, and the mark is a deer's chest 0.75 m off the ground, so a
  // perfectly solved shot passed under its belly and into the turf. The caller
  // knows its own eye height; it just had no way to say so.
  const eyeY = from.y + eye;

  // ── shoot where it is GOING to be ──
  //
  // An arrow is not instant and a deer does not wait. At 26 m the flight is
  // about 0.35 s and a trotting deer covers 3 m in that; a client also draws
  // remote creatures `NET.interpolationMs` in the past, which is another metre.
  // Against a body half a metre wide that is not a near miss, it is a different
  // postcode — and it is why a moving animal was effectively unhittable for
  // players and agents alike while a grazing one died to the first arrow.
  //
  // Solved by iterating rather than algebraically: the flight time depends on
  // the range, the range depends on where it will be, and where it will be
  // depends on the flight time. Two passes is plenty — the correction to the
  // correction is centimetres.
  let aim = target;
  if (velocity && (velocity.x || velocity.z)) {
    for (let pass = 0; pass < 2; pass++) {
      const d = Math.hypot(aim.x - from.x, aim.z - from.z);
      // Horizontal speed only. The arc is already accounted for by the pitch
      // solver; what matters here is how long the shaft is in the air.
      const flight = d / BOW.maxSpeed + lag;
      aim = {
        x: target.x + velocity.x * flight,
        y: target.y,
        z: target.z + velocity.z * flight,
      };
    }
  }

  const dx = aim.x - from.x;
  const dz = aim.z - from.z;
  const dist = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx, -dz);

  // ── how far away it is, counting the climb ──
  //
  // Horizontal range alone says a deer standing seventeen metres up a crag at
  // eighteen metres of ground distance is "eighteen metres away". It is
  // twenty-five, and it is a forty-three degree lob rather than a shot — this
  // body took exactly that one, and the shaft sailed past the shoulder of the
  // hill and came down two hundred and forty-one metres out. A bow is not a
  // mortar; the range that matters is the one the arrow flies.
  const slant = Math.hypot(dist, target.y - eyeY);
  if (slant > maxRange) return { shoot: false, yaw, pitch: 0, dist, why: 'too far' };

  // Solve the arc BEFORE asking whether the ground is in the way, because the
  // arc is what has to clear it. The old order asked the chord first and threw
  // away shots the shaft would have made.
  const pitch = solvePitch(dist, target.y - eyeY);
  if (pitch === null) return { shoot: false, yaw, pitch: 0, dist, why: 'cannot reach' };

  const mark = { x: aim.x, y: target.y, z: aim.z };
  const arc = arcClearance(from, eyeY, pitch, mark, groundAt, { solidAt });
  if (arc.blocked) {
    return {
      shoot: false, yaw, pitch: 0, dist,
      // NAMED, because the two want opposite things from the body. Standing up
      // clears a lip of ground and does nothing whatever about an oak, and for
      // as long as every refusal said "ground" the body answered a tree by
      // straightening its knees and taking the shot again.
      why: arc.what === 'timber'
        ? `a tree in the way ${arc.at.toFixed(0)} m out`
        : `ground in the way ${arc.at.toFixed(0)} m out`,
      blockedBy: arc.what,
    };
  }
  // WHERE THIS SHOT IS MEANT TO ARRIVE, handed back rather than kept.
  //
  // The lead correction happens in here, so until now nobody outside could say
  // where the body had actually aimed — only where the animal had been. That
  // makes an over-lead and an under-lead indistinguishable from a pile of miss
  // counts, which is exactly the state three passes of constant-tuning left
  // this in. A shot that reports its own intended impact point can be measured
  // against where the arrow really landed. See `Agent.remember`.
  return { shoot: true, yaw, pitch, dist, why: 'clear', mark, eyeY };
}
