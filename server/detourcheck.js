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
function makeBody(commitDetour, x, z, quarryId = 7) {
  return Object.assign(Object.create(Agent.prototype), {
    _x: x,
    _y: heightAt(x, z),
    _z: z,
    commitDetour,
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
  for (const s of sites) {
    const off = makeBody(false, s.x, s.z);
    walk(off, mark(s.deer), 30);
    solvesOff += off._resolves;
    const on = makeBody(true, s.x, s.z);
    const { seen } = walk(on, mark(s.deer), 30);
    solvesOn += on._resolves;
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

  // ── 5-8. THE FOUR THINGS THAT END A HOLD, one at a time ──
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
