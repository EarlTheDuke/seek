// ── detourcheck.js ──────────────────────────────────────────────────────────
// When the ground is in the way, does the body WALK ROUND IT — or just keep
// having opinions about walking round it?
//
//   npm run detour-check      (npm run detourcheck)
//
// WHY THIS IS NOT A SOCKET CHECK, when every other check here is. `huntcheck`
// is the outcome test and it stays the outcome test: real server, real socket,
// a deer that has to actually die. But it is real-time on a wall clock, it comes
// back red about a third of the time with nothing changed, and the thing being
// fixed here is a MEMORY across ticks — whether the answer from one tick
// survives to the next. That is invisible in an outcome and it is perfectly
// visible in isolation, so this check drives the real `Agent.prototype`
// `detourSpot` over the real terrain and asks the question directly. No port, no
// server, no wall clock: same seed, same answer, forever.
//
// The body is built with `Object.assign(Object.create(Agent.prototype), {…})`
// so the METHODS are real and only the state is invented — a fake made of a
// plain object and two borrowed methods stops testing anything the moment the
// real method grows a third call, and this project has been bitten by that.
//
// And the sites are SEARCHED FOR at runtime rather than pasted in as
// coordinates. A fixture written from the same guess as the code does not test
// it, it ratifies it; a scan of real ground finds real hills.

import { Agent } from '../src/net/agent.js';
import { heightAt } from '../src/world/noise.js';
import { clearSpotNear, sightline } from '../src/minds/marksman.js';
import { AGENTS, PLAYER } from '../src/config.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// The eye a STALKING body looks from. `act_shoot` crouches inside
// `AGENTS.stalkWithin`, which every one of these sites is, and two thirds of a
// metre of height is exactly what a lip of ground in front of you costs — so a
// site found from a standing eye is not a site this bug ever happens at.
const CROUCH_EYE = 1.05;
const CHEST = AGENTS.aimAboveFeet;

/**
 * A body with real methods and invented state.
 */
function makeBody(commitDetour, x, z, quarryId = 7, closeDetour = false) {
  return Object.assign(Object.create(Agent.prototype), {
    _x: x,
    _y: heightAt(x, z),
    _z: z,
    commitDetour,
    closeDetour,
    target: { id: quarryId, quarry: true },
    // A live episode, so the bookkeeping `detourSpot` writes into it is exercised
    // too — `resolves`, `held` and `dropped` are what huntcheck prints.
    _detour: { resolves: 1, held: 0, dropped: null },
    _detourTo: null,
    _resolves: 0,
  });
}

const mark = (deer) => ({ x: deer.x, y: heightAt(deer.x, deer.z) + CHEST, z: deer.z });

/**
 * Places where a crouched body cannot see a deer, and stepping aside would fix
 * it. Scanned over real ground rather than pasted in.
 *
 * The site has to satisfy both halves or it tests nothing: a line that is
 * already clear never enters the detour branch at all, and a line with nowhere
 * to step to is the `nowhere to go` case, which is a different bug.
 */
function findSites(want) {
  const sites = [];
  for (let bx = -400; bx <= 400 && sites.length < want; bx += 37) {
    for (let bz = -400; bz <= 400 && sites.length < want; bz += 37) {
      const by = heightAt(bx, bz);
      for (let b = 0; b < 8 && sites.length < want; b++) {
        const ang = (b / 8) * Math.PI * 2;
        const dx = bx + Math.sin(ang) * 22;
        const dz = bz + Math.cos(ang) * 22;
        const m = mark({ x: dx, z: dz });
        const los = sightline(bx, by + CROUCH_EYE, bz, m.x, m.y, m.z, heightAt, 0.3, null);
        if (!los.blocked || los.what !== 'ground') continue;
        if (!clearSpotNear({ x: bx, y: by, z: bz }, m, heightAt, { solidAt: null })) continue;
        sites.push({ x: bx, z: bz, deer: { x: dx, z: dz }, out: Math.round(los.at ?? 0) });
      }
    }
  }
  return sites;
}

/**
 * One walk, tick by tick, exactly as `act_shoot` drives it: ask where to go,
 * take one step toward it at the speed a crouched body moves, repeat.
 *
 * `PLAYER.crouchSpeed / 30` is about seven centimetres a tick. That is the
 * whole bug: seven centimetres was enough to change the answer.
 */
function walk(body, m, ticks, { dt = 1 / 30 } = {}) {
  const seen = [];
  let walked = 0;
  for (let k = 0; k < ticks; k++) {
    const spot = body.detourSpot(dt, m, {});
    seen.push(spot ? { x: spot.x, z: spot.z, step: spot.step, held: spot.held } : null);
    if (!spot) continue;
    const dx = spot.x - body._x;
    const dz = spot.z - body._z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-9) continue;
    const len = Math.min(PLAYER.crouchSpeed * dt, d);
    body._x += (dx / d) * len;
    body._z += (dz / d) * len;
    body._y = heightAt(body._x, body._z);
    walked += len;
  }
  return { seen, walked };
}

function main() {
  console.log('\n  Does a step aside ever arrive anywhere?\n');

  const sites = findSites(24);
  check('there is ground in the way to test against', sites.length >= 8,
    `${sites.length} places where a crouched body cannot see a deer at 22 m and stepping aside would fix it` +
    (sites.length ? `, obstruction ${Math.min(...sites.map((s) => s.out))}-${Math.max(...sites.map((s) => s.out))} m out` : ''));
  if (!sites.length) {
    console.log('\n  nothing to measure\n');
    process.exit(1);
  }

  // ── 1. THE CONTROL ARM MUST NOT HAVE MOVED ──
  //
  // House style, and the reason this is a flag: with `commitDetour` off,
  // `detourSpot` must be the single `clearSpotNear` call it replaced and nothing
  // else. Asserted over a real walk rather than one call, because a memory that
  // leaks would show up on tick two, not tick one.
  let sameEvery = true;
  let compared = 0;
  for (const s of sites.slice(0, 8)) {
    const body = makeBody(false, s.x, s.z);
    const m = mark(s.deer);
    for (let k = 0; k < 60; k++) {
      const want = clearSpotNear({ x: body._x, y: body._y, z: body._z }, m, heightAt, { solidAt: null });
      const got = body.detourSpot(1 / 30, m, {});
      compared++;
      const agrees = (!want && !got) || (want && got && want.x === got.x && want.z === got.z && want.step === got.step);
      if (!agrees) sameEvery = false;
      if (!got) continue;
      const dx = got.x - body._x;
      const dz = got.z - body._z;
      const d = Math.hypot(dx, dz) || 1;
      const len = Math.min(PLAYER.crouchSpeed / 30, d);
      body._x += (dx / d) * len;
      body._z += (dz / d) * len;
      body._y = heightAt(body._x, body._z);
    }
  }
  check('with the flag off it is the old code, answer for answer', sameEvery,
    `${compared} ticks across 8 sites, every one identical to a bare clearSpotNear`);

  // ── 2. THE BUG, REPRODUCED ──
  //
  // If the uncommitted answer did NOT move under the body there would be nothing
  // to fix and the flag would be theatre. Measured the same way it was measured
  // in the field: how often it comes back null mid-walk, and how far the named
  // spot jumps from one tick to the next.
  let nulls = 0;
  let ticks = 0;
  let jumps = [];
  for (const s of sites) {
    const body = makeBody(false, s.x, s.z);
    const { seen } = walk(body, mark(s.deer), 120);
    for (let k = 0; k < seen.length; k++) {
      ticks++;
      if (!seen[k]) { nulls++; continue; }
      if (k && seen[k - 1]) jumps.push(Math.hypot(seen[k].x - seen[k - 1].x, seen[k].z - seen[k - 1].z));
    }
  }
  jumps.sort((a, b) => a - b);
  const nullPc = Math.round((nulls / ticks) * 100);
  const median = jumps.length ? jumps[Math.floor(jumps.length / 2)] : 0;
  check('the uncommitted answer really does move under the body', nulls > 0 || median > 0.5,
    `${nullPc}% of ${ticks} ticks came back NOWHERE TO GO mid-walk, and the named spot ` +
    `moved a median ${median.toFixed(2)} m per tick`);

  // ── 3. COMMITTED, IT ASKS ONCE ──
  let solvesOff = 0;
  let solvesOn = 0;
  let stillEvery = true;
  // ── counted, because "they were all the same" is TRUE OF NOTHING ──
  // The first cut of this assertion passed with the fix disabled: there were no
  // held ticks at all, so none of them disagreed. A vacuous green is the exact
  // shape of lie four instruments in this project have already told, and the
  // counterfactual run is the only reason it was caught here.
  let heldTicks = 0;
  // ── the SAME number off the EPISODE, which is the one huntcheck prints ──
  //
  // These two counters are written in different places and only one of them
  // reaches a human. The first cut incremented the body-global one on the
  // uncommitted path and not the episode's, so a live A/B printed "1.0 solves
  // per detour" for an arm that re-solves thirty times a second — a number
  // wrong in the direction that flattered the change. Asserting only the
  // counter nobody reads is how that got out.
  let epOff = 0;
  let epOn = 0;
  for (const s of sites) {
    const off = makeBody(false, s.x, s.z);
    walk(off, mark(s.deer), 30);
    solvesOff += off._resolves;
    epOff += off._detour.resolves;
    const on = makeBody(true, s.x, s.z);
    const { seen } = walk(on, mark(s.deer), 30);
    solvesOn += on._resolves;
    epOn += on._detour.resolves;
    const first = seen.find(Boolean);
    // Held ticks must name the SAME PLACE. A commitment that returns a
    // different point every tick is the bug wearing the fix's clothes.
    for (const sp of seen) {
      if (!sp?.held) continue;
      heldTicks++;
      if (sp.x !== first.x || sp.z !== first.z) stillEvery = false;
    }
  }
  check('committed, it asks once instead of thirty times a second', solvesOn < solvesOff / 4,
    `${solvesOn} solves committed against ${solvesOff} uncommitted, over ${sites.length} sites x 1 s`);
  // `epOff` is seeded at 1 per episode by `openDetour`, so an arm that re-solves
  // every tick reads as ticks, not ticks+1. What matters is that it TRACKS the
  // body-global count instead of sitting at its seed.
  check("and the episode's own counter says so too", epOff === solvesOff + sites.length && epOn < epOff / 4,
    `episodes recorded ${epOn} solves committed against ${epOff} uncommitted — the number huntcheck prints`);
  check('and every held tick names the same place', stillEvery && heldTicks > 0,
    `${heldTicks} ticks walked to a remembered spot, all naming the same world coordinate` +
    (heldTicks ? '' : ' — NONE, so this assertion had nothing to be true of'));

  // ── 4. THE NUMBER THE QUEUE ASKED FOR: DOES IT ARRIVE? ──
  //
  // Metres WALKED per detour was 1 m in the field, toward a spot 6-20 m away.
  // This is that number, on both arms, over the same ground.
  let arrivedOn = 0;
  let arrivedOff = 0;
  let walkedOn = 0;
  let walkedOff = 0;
  const budget = Math.ceil(AGENTS.detourHoldSeconds * 30);
  for (const s of sites) {
    const m = mark(s.deer);
    const on = makeBody(true, s.x, s.z);
    const a = walk(on, m, budget);
    walkedOn += a.walked;
    // It arrived if a hold ever ended in `arrived` — the method's own word for
    // it, not a distance this check re-derives and could get wrong.
    if (on._detour.dropped === 'arrived') arrivedOn++;
    const off = makeBody(false, s.x, s.z);
    const b = walk(off, m, budget);
    walkedOff += b.walked;
    // The uncommitted arm has no memory to arrive at, so ask the same question
    // the only way it can be asked of it: did it ever get within
    // `detourArrive` of the spot it named on the FIRST tick?
    const target = b.seen.find(Boolean);
    if (target && Math.hypot(off._x - target.x, off._z - target.z) <= AGENTS.detourArrive) arrivedOff++;
  }
  console.log(`\n      ${AGENTS.detourHoldSeconds} s of walking at each of ${sites.length} sites:`);
  console.log(`        committed    ${arrivedOn}/${sites.length} arrived, ${(walkedOn / sites.length).toFixed(1)} m walked each`);
  console.log(`        uncommitted  ${arrivedOff}/${sites.length} arrived, ${(walkedOff / sites.length).toFixed(1)} m walked each`);
  // ── AND THIS IS NOT THE 1 m PER DETOUR THE FIELD SAW, read it carefully ──
  // The uncommitted arm walks a LONG way here and arrives nowhere, because this
  // harness keeps asking for twelve seconds. In the game the same null tick that
  // moves the spot also closes the EPISODE — `act_shoot` falls through to
  // `endDetour(shot.why)` — so huntcheck's books show a 1 m detour and then
  // another one. Same 17%, counted at two different places. Neither reading
  // contradicts the other and neither is a distance the body chose.
  console.log('        (the field saw 1 m per detour because a null tick also CLOSES the episode;');
  console.log('         here nothing closes it, so the same flicker reads as walking in circles)');
  check('committing gets the body to the spot it chose', arrivedOn > arrivedOff,
    `${arrivedOn} arrivals against ${arrivedOff} — this is the 1-metre-per-detour number from the field`);

  // ── 5. DOES A STEP ASIDE CLOSE THE RANGE? ──
  //
  // THE SECOND MECHANISM, and it is the one the commitment did not touch.
  // Everything above proves the body now walks to the place it chose. It does —
  // and the kill rate did not move, because `too far` ends 54-64% of every step
  // aside on BOTH arms. `clearSpotNear` offered candidates only PERPENDICULAR to
  // the line of sight, so a step aside holds the range exactly (a six-metre step
  // at twenty-four metres actually LENGTHENS the slant to 24.7); the animal
  // drifts, the slant crosses `AGENTS.shootRange`, `aimAt` answers `too far`,
  // and that answer carries no `blockedBy` so the detour branch stops firing.
  //
  // Measured here rather than in the game for the same reason as everything
  // else in this file: the geometry is deterministic and the outcome is not.
  const range = (b, m) => Math.hypot(m.x - b._x, m.z - b._z);

  let closer = 0;
  let sameOrFurther = 0;
  let diagonals = 0;
  let nearest = Infinity;
  let foundOn = 0;
  let foundOff = 0;
  let deltaSum = 0;
  for (const s of sites) {
    const m = mark(s.deer);
    const off = makeBody(true, s.x, s.z);
    const on = makeBody(true, s.x, s.z, 7, true);
    const a = off.detourSpot(1 / 30, m, {});
    const b = on.detourSpot(1 / 30, m, {});
    if (a) foundOff++;
    if (!b) continue;
    foundOn++;
    if (b.along > 0) diagonals++;
    const was = range(on, m);
    const now = Math.hypot(m.x - b.x, m.z - b.z);
    deltaSum += was - now;
    if (now < was - 1e-9) closer++; else sameOrFurther++;
    nearest = Math.min(nearest, now);
  }
  console.log(`\n      the spot it picks, at ${sites.length} sites where a crouched body cannot see a 22 m deer:`);
  console.log(`        closing   ${closer} closer, ${sameOrFurther} no nearer, ` +
    `mean ${(deltaSum / Math.max(1, foundOn)).toFixed(1)} m closed, nearest spot ${nearest.toFixed(1)} m from the deer`);
  check('the closing arm picks a spot NEARER the animal than where it stands',
    closer > sameOrFurther && closer >= sites.length / 2,
    `${closer} of ${foundOn} spots close the range, ${diagonals} of them by stepping up the line of sight`);

  // ── IT MUST NOT WALK ONTO THE ANIMAL ──
  //
  // `AGENTS.standOff` exists because closing was once the body's only answer and
  // it closed until the deer bolted — measured misses reading "my arrow hit
  // ground 2 m away", which is an archer standing over a deer. A diagonal that
  // ignored that floor would reintroduce the exact bug the stand-off was built
  // to stop, wearing a fix's clothes.
  check('and never one inside the stand-off', nearest >= AGENTS.standOff,
    `nearest spot offered is ${nearest.toFixed(1)} m from the deer, floor is ${AGENTS.standOff} m`);

  // ── AND IT MUST NEVER FIND FEWER PLACES TO GO ──
  //
  // The flat offsets are still tried after the diagonals, so the closing arm's
  // candidate set is a strict superset of the default one and `nowhere to go`
  // can only fall. Asserted rather than argued, because "it is a superset by
  // construction" is exactly the kind of reasoning this project keeps getting
  // wrong in a way only a printed number catches.
  check('and never fewer places to go than the default arm', foundOn >= foundOff,
    `${foundOn} sites had somewhere to step to closing, ${foundOff} by default — the flats are still tried after the diagonals`);

  // ── THE RANGE CANNOT RISE ON THE WAY THERE ──
  //
  // The mechanism claim in one number. Distance to a point is convex along a
  // straight line, so the greatest range over a walk is at one of its two ends:
  // a spot nearer than where the body stands means the slant never exceeds where
  // it already was, and `too far` cannot fire mid-walk unless it was already
  // firing when the body set off. That is WHY this is expected to help, and an
  // argument from convexity is worth nothing here until something walks it.
  let roseOn = 0;
  let roseOff = 0;
  let endOn = 0;
  let endOff = 0;
  const budget2 = Math.ceil(AGENTS.detourHoldSeconds * 30);
  for (const s of sites) {
    const m = mark(s.deer);
    for (const close of [false, true]) {
      const body = makeBody(true, s.x, s.z, 7, close);
      const start = range(body, m);
      let peak = start;
      for (let k = 0; k < budget2; k++) {
        const spot = body.detourSpot(1 / 30, m, {});
        if (!spot) continue;
        const dx = spot.x - body._x;
        const dz = spot.z - body._z;
        const d = Math.hypot(dx, dz);
        if (d < 1e-9) continue;
        const len = Math.min(PLAYER.crouchSpeed / 30, d);
        body._x += (dx / d) * len;
        body._z += (dz / d) * len;
        body._y = heightAt(body._x, body._z);
        peak = Math.max(peak, range(body, m));
      }
      const rose = peak > start + 0.5;
      if (close) { if (rose) roseOn++; endOn += range(body, m); }
      else { if (rose) roseOff++; endOff += range(body, m); }
    }
  }
  console.log(`\n      ${AGENTS.detourHoldSeconds} s of walking the step aside, deer standing still:`);
  console.log(`        default   range rose on ${roseOff}/${sites.length} walks, ` +
    `${(endOff / sites.length).toFixed(1)} m from the deer at the end`);
  console.log(`        closing   range rose on ${roseOn}/${sites.length} walks, ` +
    `${(endOn / sites.length).toFixed(1)} m from the deer at the end`);
  check('walking the step aside never opens the range up', roseOn < roseOff || roseOn === 0,
    `${roseOn} of ${sites.length} closing walks ever got further from the deer than they began, against ${roseOff} by default`);
  check('and it ends the walk nearer the animal than the default arm does',
    endOn < endOff,
    `${(endOn / sites.length).toFixed(1)} m against ${(endOff / sites.length).toFixed(1)} m — the deer never moved, so this is the step aside alone`);

  // ── AND THE FLAG OFF IS THE OLD CANDIDATE SET, CANDIDATE FOR CANDIDATE ──
  //
  // Section 1 asserts `detourSpot` with the commitment off; this asserts the
  // OPTION, because the plumbing that carries `advance` through is a second
  // place the default arm could drift, and a default that drifts quietly makes
  // every A/B after it worthless.
  let sameSpot = true;
  let compared2 = 0;
  for (const s of sites) {
    const m = mark(s.deer);
    const from = { x: s.x, y: heightAt(s.x, s.z), z: s.z };
    const bare = clearSpotNear(from, m, heightAt, { solidAt: null });
    const zeroed = clearSpotNear(from, m, heightAt, { solidAt: null, advance: 0, minRange: AGENTS.standOff });
    compared2++;
    const agrees = (!bare && !zeroed) ||
      (bare && zeroed && bare.x === zeroed.x && bare.z === zeroed.z && bare.step === zeroed.step);
    if (!agrees) sameSpot = false;
  }
  check('`advance: 0` is the old candidate set, spot for spot', sameSpot,
    `${compared2} sites, every one identical to a bare clearSpotNear`);

  // ── 6-9. THE FOUR THINGS THAT END A HOLD, one at a time ──
  //
  // Each asserted by the WORD the method wrote into the episode, so a hold that
  // ends for the wrong reason cannot pass as one that ended for the right one.
  const s0 = sites[0];
  const m0 = mark(s0.deer);

  const arrive = makeBody(true, s0.x, s0.z);
  walk(arrive, m0, budget);
  // Not `|| held > 0`, which was the first cut: a body that walks to a spot and
  // never gets there would have passed that, and never getting there is the
  // entire bug this file exists for.
  check('a hold ends when the body ARRIVES', arrive._detour.dropped === 'arrived',
    `dropped: ${arrive._detour.dropped ?? 'never'} after ${arrive._detour.held} held ticks`);

  const swap = makeBody(true, s0.x, s0.z);
  swap.detourSpot(1 / 30, m0, {});
  swap.target = { id: 99, quarry: true };
  swap.detourSpot(1 / 30, m0, {});
  check('a hold ends when `resolve` picks a different animal', swap._detour.dropped === 'another animal',
    `dropped: ${swap._detour.dropped ?? 'never'} — the spot was chosen to see one specific deer`);

  const slow = makeBody(true, s0.x, s0.z);
  slow.detourSpot(1 / 30, m0, {});
  // Age it past the ceiling without moving it: a walk that has not arrived in
  // twelve seconds is a walk that is not going to.
  slow.detourSpot(AGENTS.detourHoldSeconds + 1, m0, {});
  check('a hold ends when it TIMES OUT', slow._detour.dropped === 'timed out',
    `dropped: ${slow._detour.dropped ?? 'never'} after ${AGENTS.detourHoldSeconds} s`);

  // The quarry moving materially — asserted as what actually matters, which is
  // not how far the animal went but whether it went behind the hill we were
  // walking round. Searched for rather than assumed.
  const moved = makeBody(true, s0.x, s0.z);
  const held = moved.detourSpot(1 / 30, m0, {});
  let blockedMark = null;
  const heldEye = heightAt(held.x, held.z) + PLAYER.eyeHeight;
  for (let b = 0; b < 64 && !blockedMark; b++) {
    const ang = (b / 64) * Math.PI * 2;
    const cand = mark({ x: s0.x + Math.sin(ang) * 24, z: s0.z + Math.cos(ang) * 24 });
    if (sightline(held.x, heldEye, held.z, cand.x, cand.y, cand.z, heightAt, 0.3, null).blocked) blockedMark = cand;
  }
  if (blockedMark) {
    moved.detourSpot(1 / 30, blockedMark, {});
    check('a hold ends when the spot STOPS BEING CLEAR', moved._detour.dropped === 'no longer clear',
      `dropped: ${moved._detour.dropped ?? 'never'} — one sightline from the FIXED spot, not six from a moving body`);
  } else {
    check('a hold ends when the spot STOPS BEING CLEAR', false,
      'could not find a position the held spot cannot see — the test could not be run, not that it passed');
  }

  const ended = makeBody(true, s0.x, s0.z);
  ended.detours = [];
  ended._detour = null;
  ended.openDetour(22, 6, 'ground');
  ended.detourSpot(1 / 30, m0, {});
  const hadSpot = !!ended._detourTo;
  ended.endDetour('a shot came on');
  check('and `endDetour` releases the spot with the episode', hadSpot && ended._detourTo === null,
    'the line cleared, it stood up, or it lost the quarry — the walk is over either way');

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n  ${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
