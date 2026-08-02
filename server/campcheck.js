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
import { WATER_LEVEL, LOADOUT, STRUCTURES } from '../src/config.js';

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
check('the palisade is solid', colliders.list.some((c) => c.tag === undefined || c.tag === null) || built.some((b) => b.collided),
  'a collider was added');

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

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
