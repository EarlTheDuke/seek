// ── campcheck.js ────────────────────────────────────────────────────────────
// Phase 7's done-when: "build a camp, log off, and find it still standing next
// week — with your friend's additions to it."
//
//   npm run campcheck
//
// Headless, against the modules directly. The two claims worth proving are that
// a camp CHANGES SOMETHING (a structure that only looks like something is
// furniture) and that it SURVIVES (a mark that vanishes is not a mark).

import * as THREE from 'three';
import { Structures, Harvest, BUILDABLE } from '../src/world/structures.js';
import { Inventory } from '../src/items/inventory.js';
import { sampleEnvironment } from '../src/world/environment.js';
import { ColliderField } from '../src/world/colliders.js';
import { heightAt, slopeAt } from '../src/world/noise.js';
import { regionAt } from '../src/world/regions.js';
import { WATER_LEVEL, LOADOUT, STRUCTURES, FEEL, PLAYER, SURVIVAL } from '../src/config.js';
import { Soundscape } from '../src/audio/soundscape.js';
import { Fires } from '../src/world/fires.js';
import { readFileSync } from 'node:fs';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const scene = new THREE.Scene();
const colliders = new ColliderField(24);
const structures = new Structures(scene, { colliders });
const inv = new Inventory(LOADOUT.slots, LOADOUT.equipped);

// ── find somewhere buildable: exposed, flat, dry ──
let site = null;
for (let r = 40; r < 900 && !site; r += 17) {
  for (let a = 0; a < Math.PI * 2; a += 0.4) {
    const x = 300 + Math.cos(a) * r;
    const z = 130 + Math.sin(a) * r;
    const y = heightAt(x, z);
    if (y < WATER_LEVEL + 8 || y > 60) continue;
    if (slopeAt(x, z) > 0.2) continue;
    const reg = regionAt(x, z);
    if (reg.bog > 0.2 || reg.spring > 0.05 || reg.gorge > 0.2 || reg.wood > 0.5) continue;
    site = { x, z, y };
    break;
  }
}
if (!site) {
  console.error('  could not find open ground to build on');
  process.exit(1);
}

console.log(`\n  A camp on open ground at (${site.x.toFixed(0)}, ${site.z.toFixed(0)}), ${site.y.toFixed(0)} m up.\n`);

// ── a bad night, before and after ──
const storm = { wind: 1.9, cloud: 0.85, rain: 0.8, fog: 0 };
const night = { hours: 3, sunAltitude: -22, weather: storm, fires: null };
const at = (extra = {}) =>
  sampleEnvironment({ x: site.x, y: site.y, z: site.z }, { ...night, ...extra });

const bare = at();
console.log('  Before building anything, at three in the morning in a storm:');
console.log(`    exposure ${bare.exposure.toFixed(2)}   wind ${bare.windStrength.toFixed(2)}   rain ${bare.rain.toFixed(2)}   ${bare.describe()}\n`);

// ── build ──
inv.add('wood', 20);
inv.add('hide', 4);
inv.add('stone', 4);

const built = [];
for (const kind of ['windbreak', 'leanto', 'store', 'palisade']) {
  const afford = Structures.affordable(kind, inv);
  if (!afford.ok) {
    check(`can afford a ${kind}`, false, afford.why);
    continue;
  }
  // Ringed around the camp at a realistic spacing — close enough to shelter
  // the middle, far enough not to be inside one another.
  const i = built.length;
  const a = (i / 4) * Math.PI * 2;
  const res = structures.place(kind, site.x + Math.cos(a) * 2.9, site.z + Math.sin(a) * 2.9, a);
  if (!res.ok) {
    check(`can raise a ${kind}`, false, res.why);
    continue;
  }
  Structures.pay(kind, inv);
  built.push(res.structure);
}
check('a camp goes up', built.length === 4, `${built.length} structures: ${built.map((b) => b.kind).join(', ')}`);

const shelter = structures.shelterAt(site.x, site.z);
const roofed = structures.roofedAt(site.x, site.z);
const camped = at({ shelter, roofed });

console.log('\n  With a windbreak, a lean-to, a store and a palisade around you:');
console.log(`    exposure ${camped.exposure.toFixed(2)}   wind ${camped.windStrength.toFixed(2)}   rain ${camped.rain.toFixed(2)}   ${camped.describe()}\n`);

check('the camp takes the wind off', camped.windStrength < bare.windStrength * 0.4,
  `${bare.windStrength.toFixed(2)} -> ${camped.windStrength.toFixed(2)}`);
check('the roof stops the rain', camped.rain === 0 && bare.rain > 0,
  `${bare.rain.toFixed(2)} -> ${camped.rain.toFixed(2)}`);
check('shelter is high but never total', shelter > 0.8 && shelter < 1,
  `${shelter.toFixed(2)}`);
// ── ASSERT THE COLLIDER, NOT THE FLAG THAT CLAIMS ONE ──
//
// This read `colliders.list.some(untagged) || built.some((b) => b.collided)`,
// and the second half is a flag `Structures.place` sets on the line AFTER it
// tries to add the collider — unconditionally, and with no way to fail. So the
// check passed for months while `colliders.add?.()` silently did nothing,
// because `ColliderField` has no `add` method and never has. The palisade was a
// picture of a wall and its own test said it was a wall.
//
// Now it asserts the thing itself: a cylinder, in the field, tagged, at the
// radius the spec asked for. A flag that says work happened is not the work.
const wall = colliders.list.find((c) => c.tag === 'structure');
check('the palisade is solid', !!wall && wall.r > 0 && wall.h > 0,
  wall ? `a ${wall.r} m x ${wall.h} m cylinder is in the collider field` : 'NO collider was added');

// ── ...AND IT STOPS BEING SOLID WHEN IT COMES DOWN ──
//
// The bug the fix above would otherwise have INTRODUCED. While
// `colliders.add?.()` silently did nothing, taking a palisade down could not
// leave anything behind, because nothing was ever there. Now that a wall is
// real, a wall that outlives its own removal is an invisible barrier that stops
// arrows for the rest of the run — and it would be invisible in every sense.
//
// Asserted through a live segment query rather than off the list, because
// `retire` deliberately does NOT splice (the grid holds indices) and a check
// that counted list entries would read a retired wall as still present.
const throughWall = (field) => {
  const out = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), tag: null };
  return field.segmentHit(
    new THREE.Vector3(wall.x - 4, wall.y + 1, wall.z),
    new THREE.Vector3(wall.x + 4, wall.y + 1, wall.z),
    out
  );
};
const blockedBefore = !!throughWall(colliders);
const pi = built.findIndex((b) => b.kind === 'palisade');
structures.remove(built[pi]);
const blockedAfter = !!throughWall(colliders);
check('and it stops being solid when it comes down', blockedBefore && !blockedAfter,
  `an arrow across the wall line is ${blockedBefore ? 'STOPPED' : 'not stopped'} while it stands ` +
  `and ${blockedAfter ? 'STILL STOPPED — the wall outlived itself' : 'let through once it is gone'}`);

// Put it back exactly where the build loop had it, because everything below
// this line is about a camp of FOUR structures surviving a save and a reload.
// A check that quietly changes the world for the checks after it is how a
// passing suite starts describing a camp nobody built.
const wallAngle = (pi / 4) * Math.PI * 2;
const rebuilt = structures.place('palisade',
  site.x + Math.cos(wallAngle) * 2.9, site.z + Math.sin(wallAngle) * 2.9, wallAngle);
built[pi] = rebuilt.structure;
check('and it can be built again where it stood', rebuilt.ok && built.length === 4,
  `${built.length} structures back up: ${built.map((b) => b.kind).join(', ')}`);

// ── storage ──
const store = built.find((b) => b.kind === 'store');
store.contents.push({ item: 'venison', count: 5 }, { item: 'hide', count: 2 });
check('a store holds things', store.contents.length === 2, '2 stacks left at camp');

// ── gathering ──
const harvest = new Harvest();
const field = new ColliderField(14);
field.addCylinder(site.x + 2, site.y, site.z + 2, 0.4, 6, 'tree');
field.addSphere(site.x + 2, site.y + 4, site.z + 2, 2.5, 'tree'); // the crown
field.addSphere(site.x - 3, site.y, site.z + 1, 0.9, 'rock');

const tree = harvest.nearestSource(field, { x: site.x + 2.6, z: site.z + 2 }, 3.2, 0);
check('a tree can be cut', tree?.item === 'wood', tree ? `${tree.amount} wood, ${tree.seconds} s` : 'none found');
check('the crown is not a separate tree', tree?.tag === 'tree' && tree.distance < 1,
  'only the trunk is standable-at');

harvest.take(tree.x, tree.z, 0);
const again = harvest.nearestSource(field, { x: site.x + 2.6, z: site.z + 2 }, 3.2, 0);
check('a cut tree stays cut', again === null || again.tag === 'rock', 'not immediately re-cuttable');
const later = harvest.nearestSource(field, { x: site.x + 2.6, z: site.z + 2 }, 3.2, STRUCTURES.regrowHours + 1);
check('and grows back later', later?.tag === 'tree', `after ${STRUCTURES.regrowHours} in-game hours`);

const rock = harvest.nearestSource(field, { x: site.x - 3.5, z: site.z + 1 }, 3.2, 0);
check('a boulder can be quarried', rock?.item === 'stone', rock ? `${rock.amount} stone` : 'none found');

// ── a cut tree still answers you ──
// The bug this pair replaces: `nearestSource` skipped the tree you had just
// cut and returned null, so the prompt VANISHED where it had said something a
// second earlier. Nothing told the player why, and the regrow hour was known.
const stump = harvest.nearestTaken(field, { x: site.x + 2.6, z: site.z + 2 }, 3.2, 0);
check('a cut tree is still findable, and says when it is back',
  stump?.tag === 'tree' && Math.abs(stump.hoursLeft - STRUCTURES.regrowHours) < 0.01,
  stump ? `${stump.hoursLeft} in-game hours to regrow, ${stump.distance.toFixed(2)} m away` : 'nothing found');
check('and stops being "cut" once it has grown back',
  harvest.nearestTaken(field, { x: site.x + 2.6, z: site.z + 2 }, 3.2, STRUCTURES.regrowHours + 1) === null,
  'the two lookups are exact opposites');
check('an untouched boulder is not reported as quarried',
  harvest.nearestTaken(field, { x: site.x - 3.5, z: site.z + 1 }, 3.2, 0) === null,
  'only worked ground answers');

// ── a build refusal that names the shortfall ──
// "nothing you can build — gather wood" was a guess, and wrong the moment the
// thing you lacked was hide: it sent you for the one material you were holding.
const poor = new Inventory(LOADOUT.slots, LOADOUT.equipped);
poor.add('wood', 2);
const short = Structures.shortfall(poor);
check('a refusal names the cheapest next step',
  short?.spec.id === 'windbreak' && short.missing.length === 1 && short.missing[0].item === 'wood'
    && short.missing[0].n === 1,
  short ? `${short.spec.name}: short ${short.missing.map((m) => `${m.n} ${m.item}`).join(', ')}` : 'null');

// A windbreak costs nothing but wood, so `shortfall` can never be reduced to
// "you lack hide" — but the per-thing answer it is built from can, and that is
// the number the old message got wrong. Wood in hand, no hide: the lean-to is
// short hide and NOT short wood.
const woodOnly = new Inventory(LOADOUT.slots, LOADOUT.equipped);
woodOnly.add('wood', 40);
const leanto = Structures.missingFor('leanto', woodOnly);
check('and names HIDE, not wood, when hide is what you lack',
  leanto.length === 1 && leanto[0].item === 'hide' && leanto[0].n === 2,
  leanto.map((m) => `${m.n} ${m.item}`).join(', ') || 'nothing missing');

const rich = new Inventory(LOADOUT.slots, LOADOUT.equipped);
rich.add('wood', 40);
rich.add('hide', 20);
check('and reports no shortfall when you can afford something',
  Structures.shortfall(rich)?.missing.length === 0, 'nothing missing');

// ── log off, come back ──
const saved = JSON.parse(JSON.stringify({
  structures: structures.serialise(),
  harvested: harvest.serialise(),
}));

const scene2 = new THREE.Scene();
const structures2 = new Structures(scene2, { colliders: new ColliderField(24) });
const harvest2 = new Harvest();
structures2.restore(saved.structures);
harvest2.restore(saved.harvested);

console.log('\n  Logging off and coming back.\n');
check('the camp is still standing', structures2.all.length === 4,
  `${structures2.all.length} structures: ${Object.entries(structures2.stats.byKind).map(([k, n]) => `${n} ${k}`).join(', ')}`);
check('it is in the same place', Math.hypot(structures2.all[0].x - built[0].x, structures2.all[0].z - built[0].z) < 0.02,
  'positions match to the centimetre');
check('the store kept its contents',
  structures2.all.find((s) => s.kind === 'store')?.contents?.length === 2,
  'venison and hide still there');
check('it still shelters you', Math.abs(structures2.shelterAt(site.x, site.z) - shelter) < 0.01,
  `${structures2.shelterAt(site.x, site.z).toFixed(2)}`);
check('the cut tree is still cut', harvest2.isTaken(tree.x, tree.z, 0), 'harvest state survived');

// ── a friend adds to it ──
const inv2 = new Inventory(LOADOUT.slots, LOADOUT.equipped);
inv2.add('wood', 6);
const friendSpot = { x: site.x + 6.6, z: site.z + 2.4 };
const friendRes = structures2.place('windbreak', friendSpot.x, friendSpot.z, 0, 99);
if (friendRes.ok) Structures.pay('windbreak', inv2);
check("a friend's addition joins the camp", friendRes.ok && structures2.all.length === 5,
  friendRes.ok ? `owner #${friendRes.structure.owner}` : friendRes.why);
check('ownership is recorded', structures2.all.some((s) => s.owner === 99) && structures2.all.some((s) => s.owner === null),
  'yours and theirs, distinguishable');

// ── and it refuses to be stacked ──
const tooClose = structures2.place('leanto', site.x + 0.2, site.z + 0.2, 0);
check('structures refuse to overlap', !tooClose.ok, tooClose.why ?? 'it allowed a stack');
const inWater = structures2.place('windbreak', 300, 130, 0);
check('and refuse to stand in the lake', !inWater.ok, inWater.why ?? 'it built on water');

// ── the fire you light has to be a fire you can SEE and HEAR ────────────────
//
// This is the geometry the queue's top item was about. A fire was laid 1.6 m in
// front of you with your eye 1.72 m up, which puts the ground it sits on 45
// degrees below level while the vertical half-FOV is 35 — so the pit was BELOW
// THE BOTTOM EDGE OF THE SCREEN, and the only thing you ever saw of the first
// thing you build in this world was the tip of the flame, behind the hotbar.
//
// Written as arithmetic on the config rather than a render, because that is the
// part that can silently drift: any of eye height, FOV or place distance can be
// tuned by someone who is not thinking about the other two.
console.log('\n  The fire you just lit, from where you stand.\n');

const HALF_FOV = (FEEL.fovBase / 2) * (Math.PI / 180); // three.js `fov` is vertical
// The frame the shots are taken at, and the hotbar measured in the live DOM:
// 54 px tall sitting 20 px off the bottom, centred on exactly the column a
// fire lands in.
const FRAME_H = 720;
const HOTBAR_TOP = FRAME_H - 20 - 54;
// Screen row, in a 720-high frame, of a point `up` metres above the fire's base.
const rowOf = (up) => {
  const drop = PLAYER.eyeHeight - up; // metres the point sits below the eye
  const ndc = -Math.tan(Math.atan2(drop, SURVIVAL.firePlaceDistance)) / Math.tan(HALF_FOV);
  return ((1 - ndc) / 2) * FRAME_H;
};

const baseRow = rowOf(0);
const flameRow = rowOf(1); // the flame stands about a metre out of the pit
check('the fire is laid where you can see it', baseRow < FRAME_H,
  `the pit sits at row ${baseRow.toFixed(0)} of ${FRAME_H}` +
    (baseRow < FRAME_H ? '' : ` — ${(baseRow - FRAME_H).toFixed(0)} px below the screen`));
check('and its flame is not hidden behind the hotbar', flameRow < HOTBAR_TOP,
  `flame from row ${flameRow.toFixed(0)}, hotbar starts at ${HOTBAR_TOP}`);
check('you can still tend it without taking a step', SURVIVAL.firePlaceDistance < SURVIVAL.fireReach,
  `laid at ${SURVIVAL.firePlaceDistance} m, E reaches ${SURVIVAL.fireReach} m`);
check('and it warms you where you stood to light it', SURVIVAL.firePlaceDistance < SURVIVAL.fireWarmRadius,
  `warm radius ${SURVIVAL.fireWarmRadius} m`);

// ── every sound the fire asks for has to exist ──
//
// The reason a fire was silent for its entire life is that `fires.js` called
// `this.deps.audio?.fireLit?.()` and no such method was ever written: the
// optional call swallowed it without a murmur. That is this project's signature
// failure — a name used and never defined — and it is checkable. Read the call
// sites out of the source and confirm the soundscape answers to each one.
const fireSrc = readFileSync(new URL('../src/world/fires.js', import.meta.url), 'utf8');
const asked = [...fireSrc.matchAll(/audio\?\.(\w+)\?\./g)].map((m) => m[1]);
const missing = asked.filter((name) => typeof Soundscape.prototype[name] !== 'function');
check('the fire asks for sounds that exist', asked.length > 0 && missing.length === 0,
  asked.length === 0
    ? 'no audio call sites found — the pattern moved, fix this check'
    : missing.length
      ? `Soundscape has no ${missing.join(', ')}`
      : `${asked.join(', ')} — all defined`);
check('and something drives the fire bed', typeof Soundscape.prototype.setFire === 'function',
  'Soundscape.setFire');

// ── a fire under a roof is not rained on ──
//
// Same failure, one floor down. `Fires.update` dimmed every fire by the GLOBAL
// weather, so building a lean-to and lighting a fire under the roof still cost
// you 44% of its warmth and burned the fuel twice as fast — the exact opposite
// of the reason anyone roofs a fire. `roofedAt` already existed and nothing had
// ever asked it. Measure both fires rather than trusting the constant.
{
  const storm = { rain: 0.8, wind: 1.9 };
  const settle = (roofed) => {
    const f = new Fires(new THREE.Scene(), { roofedAt: () => roofed });
    const lit = f.light(site.x + 40, site.z + 40, 1e6);
    if (!lit.ok) return null;
    for (let i = 0; i < 300; i++) f.update(1 / 30, storm); // let intensity settle
    return f.active[0];
  };
  const open = settle(false);
  const under = settle(true);
  check('a fire in the open is drowned by rain', open && open.intensity < 0.7,
    open ? `intensity ${open.intensity.toFixed(2)} in rain 0.8` : 'could not light one');
  check('a fire under a roof is not', under && under.intensity > 0.95,
    under ? `intensity ${under.intensity.toFixed(2)} under a lean-to` : 'could not light one');
  check('...and its fuel lasts longer for it', under && open && under.fuel > open.fuel,
    under && open ? `${under.fuel.toFixed(0)} vs ${open.fuel.toFixed(0)} after 10 s` : '');

  // And the browser must actually WIRE it, or the whole thing is decoration.
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const wired = /new Fires\([^)]*\{[\s\S]{0,240}?roofedAt/.test(mainSrc);
  check('and main.js hands the fires a roofedAt', wired,
    wired ? 'new Fires(scene, { audio, roofedAt })' : 'fires.js asks, nothing answers');
}

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
