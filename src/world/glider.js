// ── glider.js ───────────────────────────────────────────────────────────────
// A machine of branches and stitched hide, and the air it hangs in.
//
// WHAT THIS IS IN REAL TERMS. Nobody in these Highlands is building a Cessna.
// What they can build is what people actually did build first, out of exactly
// what is lying around: a braced frame of green wood with hide stretched over
// it, carried up a hill and run off the edge of it. That is a Wright 1902
// glider, and a Wright 1902 glider is an aeroplane — it has a wing, it has
// controls, it flies, and it will kill you if you stall it on the turn.
//
// So the cost is branches and hides, and the aircraft is a glider. It cannot
// take off from flat ground and there is no engine to look for. You carry it
// uphill and you jump off. Everything good about it follows from that: the
// terrain becomes the fuel, and a mountain you had no reason to climb becomes
// the most valuable thing on the map.
//
// THE MODEL IS THE REAL ONE, not a fudge. Two equations, the ones that describe
// every aircraft ever flown:
//
//     v' = −g·sin(γ) − D/m           along the flight path
//     γ' = (L·cos(bank)/m − g·cos(γ)) / v      across it
//
// with lift and drag from L = ½ρv²S·Cl(α) and a drag polar Cd = Cd0 + k·Cl².
// Writing it properly rather than faking a glide is not showing off — it is
// less code than a fake, and everything that makes flying interesting falls out
// of it for free rather than having to be scripted in:
//
//   * a stall. Pull too hard, Cl collapses past the critical angle, the nose
//     drops, you build speed and fly again — if you had the height.
//   * the phugoid. Trade height for speed for height. A real glider does this
//     and so does this one, because the same two lines produce it.
//   * a best glide speed you can find by feel. Too slow is draggy, too fast is
//     draggy, and somewhere between is the flattest glide you will get.
//   * banked turns that cost you height, because cos(bank) is right there in
//     the vertical equation. Turning is not free, and that is the whole of
//     mountain flying.
//
// The numbers are chosen so the machine is what it looks like: about a 6:1
// glide at 12 m/s. Six metres forward per metre down, which off a 200 m ridge
// is a bit over a kilometre — far enough to be a genuinely new way to cross
// this map, and short enough that you still have to think about where you land.
//
// No THREE and no DOM in the model, so `npm run glidercheck` can fly a hundred
// launches headlessly. On a project where the browser is often not available to
// play in, a flight model I could only test by flying would be a flight model I
// could not test.

import { GLIDER } from '../config.js';

const { rho, wingArea, mass, cl0, clAlpha, alphaStall, clStall, cd0, k,
        gravity, alphaTrim, pitchAuthority, pitchRate, rollRate, maxBank,
        launchSpeed, minLaunchSlope, crashSpeed, crashSink,
        liftEfficiency, liftBandHeight } = GLIDER;

/** Lift coefficient at an angle of attack, in radians. */
export function liftCoefficient(alpha) {
  if (alpha <= alphaStall) return cl0 + clAlpha * alpha;
  // Past the critical angle the flow separates and the wing stops working.
  // It does not vanish — a stalled wing still makes some lift, which is why a
  // stall is a descent and not a hole in the sky — but it falls off fast, and
  // the drag goes up at the same time, which is what makes it frightening.
  const over = alpha - alphaStall;
  return Math.max(clStall * 0.45, (cl0 + clAlpha * alphaStall) - over * clAlpha * 2.4);
}

/** The drag polar: parasite drag plus the drag you pay for making lift. */
export function dragCoefficient(cl, alpha) {
  const separated = alpha > alphaStall ? (alpha - alphaStall) * 1.9 : 0;
  return cd0 + k * cl * cl + separated;
}

/**
 * A fresh aircraft, in the air, pointed where you were looking.
 *
 * `theta` is the pitch ATTITUDE — where the nose points. `gamma` is the flight
 * PATH — where you are actually going. The difference between them is the
 * angle of attack, and the difference between those two things is the single
 * idea that everything else in flying is built on: the nose being up does not
 * mean you are going up.
 */
export function launch({ x, y, z, heading, speed = launchSpeed }) {
  return {
    x, y, z,
    heading,
    theta: 0.09,   // nose a little high, as you would hold it running off a hill
    gamma: -0.06,  // and sinking gently, because you have only just let go
    v: speed,
    bank: 0,
    airborne: true,
    stalled: false,
    // Kept for the HUD and for the check: the instruments a pilot would have
    // if this world had instruments, which it does not — so they are shown as
    // words, not gauges.
    alpha: 0.15,
    sink: 0,
  };
}

/**
 * Ridge lift: the air going up the windward side of a hill.
 *
 * WHAT THIS IS IN REAL TERMS. Wind hitting a hillside has nowhere to go but
 * over it, so the air on the windward face is rising — sometimes faster than a
 * glider sinks. That is not a trick, it is how people stay airborne for hours
 * on machines with no engine, and it has been how since the 1920s. Fly along
 * the windward face and you climb. Cross to the lee side and the same air is
 * coming DOWN, and you will be on the ground shortly.
 *
 * Why it is here rather than a bigger number somewhere: measured against this
 * world, the ground tops out at 80 m. A 6:1 glide off the highest point in the
 * Highlands lands you 130 m away, which is a hop, not an aeroplane — and no
 * amount of tuning the wing fixes that, because the wing is right. The height
 * was never going to come from the terrain. It comes from the weather, which
 * this world already has: wind with a direction that wanders, that the scent
 * model has been using to hunt you with since Phase 2.
 *
 * So the aircraft is worth its fourteen branches, and what makes it worth them
 * is a skill rather than a number: find an edge, and find one facing the wind.
 *
 * @param {number} slopeUpwind  how steeply the ground rises INTO the wind here,
 *   rise over run, from the terrain
 * @param {number} windSpeed    m/s
 * @param {number} heightAbove  metres above the ground beneath you
 */
export function ridgeLift(slopeUpwind, windSpeed, heightAbove) {
  if (slopeUpwind <= 0 || windSpeed <= 0) return 0;
  // The air deflects upward by roughly the slope it is climbing. Capped,
  // because a cliff does not give you infinite lift — past a point the flow
  // separates and it is turbulent rather than useful.
  const rise = windSpeed * Math.min(slopeUpwind, 1.1) * liftEfficiency;
  // And it fades with height: the band of usable lift is thin, which is what
  // makes ridge soaring a matter of staying close to a hillside rather than
  // circling comfortably above one.
  //
  // Linear, not squared. Squared was the first guess and it was measured at
  // giving 6 m of climb off a good ridge in a 12 m/s wind — technically lift,
  // practically nothing, because the falloff had already halved it by the
  // height you launch from. Linear climbs you about 40 m above the slope and
  // then stops, which is a ridge you can actually work.
  const fade = Math.max(0, 1 - heightAbove / liftBandHeight);
  return rise * fade;
}

/**
 * One step of flight.
 *
 * @param {object} s      state from launch(), mutated in place
 * @param {{pitch:number, roll:number}} c   −1..1 each
 * @param {number} dt
 * @param {(x:number,z:number)=>number} groundAt
 * @param {{angle:number, speed:number}} [wind]  where it blows TOWARD, and how hard
 * @returns {object} the same state, plus `landed` / `crashed` when it is over
 */
export function stepGlide(s, c, dt, groundAt, wind = null) {
  if (!s.airborne) return s;

  // ── the pilot ──
  // Pitch moves the NOSE, not the flight path. Wanting to go up and pulling
  // back are the same gesture and different outcomes, and a model that let you
  // steer the velocity directly would quietly delete the entire subject.
  //
  // But an aircraft is STABLE in pitch, and leaving that out is not a
  // simplification, it is a different machine. A tail exists to hold the wing
  // at the angle it was trimmed for: disturb it and it comes back. Without
  // that, hands off the controls, the nose stays where it is while the flight
  // path falls away underneath it, the angle between them grows, and the thing
  // deep-stalls into the ground from a thousand metres. Which is exactly what
  // the first version of this file did — 1:1 glide, straight down, hands off.
  //
  // So the stick commands an ANGLE OF ATTACK, not a pitch rate, and the
  // airframe flies it. That is what a trimmed glider does, and it is why you
  // can let go of a real one.
  const alphaTarget = alphaTrim + c.pitch * pitchAuthority;
  const wanted = s.gamma + alphaTarget;
  s.theta += Math.max(-pitchRate * dt, Math.min(pitchRate * dt, wanted - s.theta));
  s.theta = Math.max(-1.6, Math.min(0.8, s.theta));
  s.bank += (c.roll * maxBank - s.bank) * Math.min(1, rollRate * dt);

  const alpha = s.theta - s.gamma;
  s.alpha = alpha;
  s.stalled = alpha > alphaStall;

  const cl = liftCoefficient(alpha);
  const cd = dragCoefficient(cl, alpha);
  const q = 0.5 * rho * s.v * s.v * wingArea; // dynamic pressure × area
  const lift = q * cl;
  const drag = q * cd;

  // ── the air ──
  s.v += (-gravity * Math.sin(s.gamma) - drag / mass) * dt;
  // Below a walking pace the equations stop meaning anything — you are not
  // flying, you are falling — so hold a floor and let gravity have you.
  s.v = Math.max(1.5, s.v);
  s.gamma += ((lift * Math.cos(s.bank)) / mass - gravity * Math.cos(s.gamma)) / s.v * dt;
  s.gamma = Math.max(-1.45, Math.min(1.0, s.gamma));

  // A banked wing pulls you round. This is the only way to turn — there is no
  // rudder pedal on a machine you are hanging underneath by your armpits.
  s.heading += (lift * Math.sin(s.bank)) / (mass * Math.max(s.v, 4)) * dt;

  // ── where that puts you ──
  const horizontal = s.v * Math.cos(s.gamma);
  s.x += Math.sin(s.heading) * horizontal * dt;
  s.z += Math.cos(s.heading) * horizontal * dt;
  const climb = s.v * Math.sin(s.gamma);

  // ── the air itself ──
  // The aircraft flies through a parcel of air, and if the parcel is going up
  // then so are you. Adding the air's own vertical speed to yours is not an
  // approximation of soaring, it IS soaring — there is nothing else to it.
  const ground = groundAt(s.x, s.z);
  let air = 0;
  if (wind && wind.speed > 0) {
    // How steeply the ground rises into the wind, sampled upwind of you.
    const ux = -Math.sin(wind.angle), uz = -Math.cos(wind.angle);
    const upwind = groundAt(s.x + ux * 30, s.z + uz * 30);
    air = ridgeLift((ground - upwind) / 30, wind.speed, s.y - ground);
  }
  s.lift = air;

  s.y += (climb + air) * dt;
  // What a pilot feels and the HUD reports: your sink through the AIR is one
  // thing, and whether the ground is getting closer is another. On a good ridge
  // the second one is negative while the first never changes.
  s.sink = -(climb + air);

  // ── the ground ──
  if (s.y <= ground + 0.4) {
    s.y = ground + 0.4;
    s.airborne = false;
    // Arriving fast or arriving hard breaks it. Both, because they are
    // different mistakes: too much speed is a bad approach, too much sink is a
    // stall you did not recover from, and a person should be able to tell
    // which one they just made.
    s.crashed = s.v > crashSpeed || s.sink > crashSink;
    s.landed = !s.crashed;
  }
  return s;
}

/**
 * Is this a place you could run off?
 *
 * A glider needs a hill and it needs the hill to fall away in front of you.
 * Checking the ground ahead rather than the slope underfoot is the difference
 * between "steep enough" and "downhill from here", and only the second one
 * flies. Standing on a steep slope facing UP it correctly refuses.
 */
export function canLaunch(x, z, heading, groundAt) {
  const here = groundAt(x, z);
  const near = (here - groundAt(x + Math.sin(heading) * 14, z + Math.cos(heading) * 14)) / 14;
  // And SUSTAINED, out to 45 m. Checking only the ground immediately ahead
  // cannot tell a hillside from a hollow, and on rolling terrain that is most
  // of the map: measured against this world, a single 14 m probe called 59% of
  // it launchable, which makes an aeroplane something you can take off in
  // anywhere and takes the hill out of hill flying. Both probes together, at
  // this threshold, leave about 6% — a real edge, that you have to go and find.
  const far = (here - groundAt(x + Math.sin(heading) * 45, z + Math.cos(heading) * 45)) / 45;
  if (near < minLaunchSlope || far < minLaunchSlope * 0.6) {
    return {
      ok: false,
      why: near < 0.08 ? 'you need a hill, and it has to fall away in front of you'
        : near < minLaunchSlope ? 'not steep enough — find a proper edge'
        : 'it drops away and then flattens — you would land in seconds',
    };
  }
  return { ok: true, drop: near };
}

/** What a person would say about how it is going. No instruments in 3000 BC. */
export function flightReport(s) {
  if (s.stalled) return 'stalled — nose down';
  if (s.v > 19) return 'too fast — ease back';
  if (s.v < 8.5) return 'slow — nose down';
  // Climbing comes above the sink warnings on purpose. Finding lift is the
  // skill the whole aircraft is built around, and a pilot who has just found
  // some needs to be told NOW so they can turn back into it — a second of
  // "gliding" while you fly out the other side of a thermal is a second too
  // many. It is also the only good news the machine ever gives you.
  if (s.sink < -0.3) return 'rising — hold the ridge';
  if (s.sink > 3.2) return 'sinking fast';
  if (s.sink < 1.4) return 'flying well';
  return 'gliding';
}

/** Metres forward per metre down, right now. Six is a good day. */
export const glideRatio = (s) => (s.sink > 0.05 ? (s.v * Math.cos(s.gamma)) / s.sink : Infinity);
