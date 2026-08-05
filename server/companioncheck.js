// ── companioncheck.js ───────────────────────────────────────────────────────
// Six animals: does care still buy obedience, and is each one actually
// different?
//
//   npm run companioncheck
//
// The otter's checks carried over — trust gates commands, tricks are learned by
// repetition and forgotten under neglect, warmth is real, saving works. What is
// new is the thing the generalisation could most easily have got wrong:
//
//   EVERY ANIMAL MUST BE GENUINELY DIFFERENT. If two share a trick list or a
//   power, one of them is a skin, and the whole point of six was that they are
//   not skins.

import * as THREE from 'three';
import { Companion } from '../src/creatures/companion.js';
import { COMPANIONS, COMPANION_IDS } from '../src/creatures/companions.js';
import { OTTER as CARE } from '../src/config.js';
import { makeRandom, heightAt } from '../src/world/noise.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const STEP = 1 / 60;
const at = (x, z) => new THREE.Vector3(x, heightAt(x, z), z);
const owner = { position: at(300, 200) };
const mild = { airC: 14, nearFire: false, shelter: 0, night: 0, dayMinutes: 24 };
const make = (id) => new Companion(id, at(302, 200), makeRandom(`check:${id}`));
const run = (c, secs, ctx = mild) => {
  for (let i = 0; i < secs * 60; i++) c.update(STEP, owner, {}, ctx);
};

console.log('\n  Six animals, and what each is for.\n');

// ── they are all genuinely different ──
const trickLists = [];
const powers = [];
const bodies = [];
for (const id of COMPANION_IDS) {
  const c = make(id);
  trickLists.push(c.trickIds.join(','));
  powers.push(c.trickIds.map((t) => c.tricks[t].power).filter(Boolean).join(','));
  bodies.push(`${c.parts.legs.length}/${c.parts.arms?.length ?? 0}`);
  console.log(
    `    ${COMPANIONS[id].name.padEnd(10)} ${COMPANIONS[id].helps.padEnd(38)} ` +
      `${c.trickIds.map((t) => c.tricks[t].name).join(', ')}`
  );
}
console.log('');

check('every animal has its own trick list', new Set(trickLists).size === trickLists.length,
  `${trickLists.length} lists, ${new Set(trickLists).size} distinct`);

// ── and its own temperament ──
// These were one shared block, so a hippo trailed a human at four and a half
// metres and bit like an otter: six animals with one nature and a coat.
const temper = COMPANION_IDS.map((id) => {
  const c = make(id);
  return { id, follow: c.care_.followRange, bite: c.care_.biteDamage, hunger: c.care_.hungerPerHour };
});
console.log('');
for (const t of temper) {
  console.log(`    ${COMPANIONS[t.id].name.padEnd(10)} follows at ${String(t.follow).padStart(4)} m · bites ${String(t.bite).padStart(2)} · eats ${t.hunger}`);
}
console.log('');
check('every animal has its own temperament',
  new Set(temper.map((t) => `${t.follow}|${t.bite}|${t.hunger}`)).size === temper.length,
  `${new Set(temper.map((t) => t.bite)).size} distinct bites, ${new Set(temper.map((t) => t.follow)).size} distinct follow ranges`);
check('a hippo does not bite like an otter',
  temper.find((t) => t.id === 'hippo').bite > temper.find((t) => t.id === 'otter').bite * 4,
  `hippo ${temper.find((t) => t.id === 'hippo').bite} vs otter ${temper.find((t) => t.id === 'otter').bite}`);
check('every animal has its own power', new Set(powers).size === powers.length,
  powers.join(' · '));
// Counting legs is a crude proxy — three of them are four-legged animals, of
// course they are. What matters is that the GEOMETRY differs, so compare the
// actual vertex counts of the assembled bodies.
const shapes = COMPANION_IDS.map((id) => {
  const c = make(id);
  let n = 0;
  c.object.traverse((o) => (n += o.geometry?.attributes?.position?.count ?? 0));
  return n;
});
check('and its own body', new Set(shapes).size === shapes.length,
  `${new Set(shapes).size} distinct meshes from ${shapes.length} animals`);
check('every power is the hardest trick it knows', COMPANION_IDS.every((id) => {
  const c = make(id);
  const p = c.trickIds.find((t) => c.tricks[t].power);
  if (!p) return false;
  const needs = c.tricks[p].needs;
  return c.trickIds.every((t) => c.tricks[t].power || c.tricks[t].needs <= needs);
}), 'a working animal is the reward for looking after it');

// ── the care model still holds, on a species that is not the otter ──
let c = make('kangaroo');
check('a wild companion takes no commands', !c.ask('stand').ok, c.ask('stand').why);

for (let i = 0; i < 4; i++) { c.fed = 0.4; c.feed('venison'); }
check('feeding earns trust', c.trust > 0.3, `trust ${c.trust.toFixed(2)}`);
check('and it gets a name', !!c.name, c.name ?? 'unnamed');
check('now it will work', c.ask('stand').ok);

c.trust = 0.7; c.fed = c.played = c.warmth = 0.9;
for (let i = 0; i < c.tricks.stand.reps; i++) c.ask('stand');
check('a trick is learned by repetition', c.learned.has('stand'),
  `${c.tricks.stand.reps} tries`);
check('and only that trick', !c.learned.has('thump'),
  `thump is ${c.progress.thump}/${c.tricks.thump.reps}`);

// ── a half-learned power does nothing ──
c = make('wolfcub');
c.trust = 0.9; c.fed = c.played = c.warmth = 1;
const halfway = c.ask('track');
check('a half-trained animal performs the shape and no more', halfway.ok && !halfway.power,
  `progress ${Math.round(halfway.progress * 100)}%, power fired: ${!!halfway.power}`);
for (let i = 0; i < c.tricks.track.reps; i++) c.ask('track');
// The LAST rep is the one that completes the learning, so the power fires on
// it and starts the cooldown. Asking again immediately is now correctly
// refused — which is what the next check is for, and why this one has to wait.
c.hours += c.care_.powerCooldownHours + 0.01;
const trained = c.ask('track');
check('a learned one actually does the job', trained.power === 'track', `power "${trained.power}"`);

// ── working costs the animal something ──
const tiredAfter = { played: c.played, fed: c.fed };
const tooSoon = c.ask('track');
check('and then it needs a rest', !tooSoon.ok && /rest/.test(tooSoon.why), tooSoon.why);
c.hours += c.care_.powerCooldownHours + 0.01;
const rested = c.ask('track');
check('after the cooldown it will work again', rested.power === 'track',
  `${Math.round(c.care_.powerCooldownHours * 60)} min for a wolf cub`);
check('using a power tires and hungers it', tiredAfter.played < 0.999 && tiredAfter.fed < 0.999,
  `played ${tiredAfter.played.toFixed(2)}, fed ${tiredAfter.fed.toFixed(2)} after one use`);
// A hippo carrying a person should tire far faster than a parrot taking a look.
const hip = make('hippo');
const par = make('parrot');
check('effort is per-species', hip.care_.powerTires > par.care_.powerTires * 2,
  `hippo ${hip.care_.powerTires} vs parrot ${par.care_.powerTires} per use`);

// ── EVERY power comes back, not just the one we happened to test ──
// This whole file passed 28/28 while the hippo's ferry was a dead no-op. The
// checks above only ever exercised `track`, and track is a plain trick. Ferry
// is a TOGGLE — a standing order AND a thing that has to happen — and the
// toggle branch returned early without its power, so the caller had nothing to
// dispatch. One species tested is one species tested; ask all six.
const powerless = [];
for (const id of COMPANION_IDS) {
  const a = make(id);
  a.trust = 1; a.fed = a.played = a.warmth = 1;
  const trick = a.trickIds.find((t) => a.tricks[t].power);
  for (let i = 0; i < a.tricks[trick].reps; i++) a.ask(trick);
  a.hours += a.care_.powerCooldownHours + 0.01;
  const r = a.ask(trick);
  if (r.power !== a.tricks[trick].power) powerless.push(`${id}:${trick}${r.toggled !== undefined ? ' (toggle)' : ''}`);
}
check('every species hands back its power when asked', powerless.length === 0,
  powerless.length ? `silent: ${powerless.join(' ')}` : `all ${COMPANION_IDS.length}, toggles included`);

// ── neglect ──
c = make('hippo');
c.trust = 0.8;
c.learned = new Set(['wallow', 'bellow', 'ferry']);
c.fed = c.played = c.warmth = 0.05;
run(c, CARE.forgetSeconds + 4, { airC: -6, nearFire: false, shelter: 0, night: 1, dayMinutes: 24 });
check('sustained neglect loses the hardest trick first', !c.learned.has('ferry'),
  `now knows ${[...c.learned].join(', ') || 'nothing'}`);

// ── warmth ──
const cold = { airC: -4, nearFire: false, shelter: 0, night: 1, dayMinutes: 24 };
const exposed = make('wolfcub'); exposed.trust = 0.6; run(exposed, 25, cold);
const housed = make('wolfcub'); housed.trust = 0.6; housed.setHome(housed.position.x, housed.position.z); run(housed, 25, cold);
check('a home keeps it warm on a cold night', housed.warmth > exposed.warmth + 0.3,
  `${exposed.warmth.toFixed(2)} -> ${housed.warmth.toFixed(2)}`);

// ── a swimmer is not chilled by swimming ──
// At -4 C the cold term alone drives both to zero and the wet penalty is
// invisible, which is what the first version of this check measured: 0.00 vs
// 0.00. Cool rather than freezing is where being wet is the deciding factor.
const cool = { airC: 7, nearFire: false, shelter: 0, night: 1, dayMinutes: 24 };
const otterWet = make('otter');
const cubWet = make('wolfcub');
for (const a of [otterWet, cubWet]) a.trust = 0.6;
for (let i = 0; i < 20 * 60; i++) {
  otterWet.inWater = cubWet.inWater = true; // move() would clear it; hold them in
  otterWet.update(STEP, owner, {}, cool);
  cubWet.update(STEP, owner, {}, cool);
}
check('a swimmer is not punished for being wet', otterWet.warmth > cubWet.warmth + 0.05,
  `otter ${otterWet.warmth.toFixed(2)} vs wolf cub ${cubWet.warmth.toFixed(2)} at 7 C, both in the water`);

// ── standing orders ──
c = make('otter');
c.trust = 0.8; c.fed = c.played = c.warmth = 1;
for (let i = 0; i < c.tricks.guard.reps; i++) c.ask('guard');
const goblin = { position: at(304, 201), state: 'charge', species: { name: 'Goblin' } };
const on = c.isOn('guard');
check('a toggle is a standing order, not a pose', typeof on === 'boolean', `guard is ${on ? 'on' : 'off'}`);
if (!on) c.ask('guard');
check('a guarding animal answers what hurt you', c.defend(goblin) && c.state === 'attack', c.state);
const wild = make('otter');
check('a wild one will not', !wild.defend(goblin), `trust ${wild.trust.toFixed(2)}`);

// ── saving ──
c = make('octopus');
c.trust = 0.72; c.feed('fish');
c.learned = new Set(['furl', 'dive']);
c.progress.ink = 2;
c.setHome(310, 205);
c.toggles.furl = true;
const json = JSON.parse(JSON.stringify(c.toJSON()));
const loaded = new Companion(json.k, at(0, 0), makeRandom('reload'));
loaded.fromJSON(json);
check('a trained companion survives a save', loaded.name === c.name && loaded.species.id === 'octopus',
  `${loaded.name}, a ${loaded.species.name}`);
check('including which animal it was', json.k === 'octopus', `saved kind "${json.k}"`);
check('its tricks and home survive', loaded.learned.has('dive') && loaded.progress.ink === 2 && !!loaded.home);

// ── a copy of somebody else's animal ──
//
// What the server keeps so that everyone else can see your pet. It has to be
// able to BECOME your animal from a digest, do a trick it has been told it
// knows, and refuse everything else — including a trick belonging to another
// species, which is the one thing a packet could otherwise invent.
const mirror = make('wolfcub');
mirror.mirrored = true;
mirror.applyRelationship({ t: 0.9, f: 0.9, y: 0.9, w: 0.9, n: 'Fang', l: ['sit', 'guard'], o: { guard: true } });
check('a copy takes on a relationship it did not earn',
  mirror.name === 'Fang' && mirror.tame && mirror.learned.has('sit') && mirror.isOn('guard'),
  `${mirror.name}, trust ${mirror.trust.toFixed(2)}, guard ${mirror.isOn('guard') ? 'on' : 'off'}`);
check('and then it will fight for a person it has never met',
  mirror.defend(goblin) && mirror.state === 'attack', mirror.state);
mirror.setState('idle');
check('it performs a trick it was told it knows', mirror.perform('sit') && mirror.pose === 'sit', mirror.pose);
check('but not one it was not', !mirror.perform('lunge'), 'lunge was never in the digest');
mirror.applyRelationship({ l: ['perch', 'ferry', 'sit'] });
check('and a wolf cub still cannot perch',
  !mirror.learned.has('perch') && !mirror.learned.has('ferry') && mirror.learned.has('sit'),
  `it knows ${[...mirror.learned].join(', ') || 'nothing'}`);
// The round trip the wire actually makes.
const source = make('hippo');
source.trust = 0.8; source.name = 'Bess'; source.learned = new Set(['wallow', 'guard']); source.toggles.guard = true;
const copy = make('hippo');
copy.applyRelationship(JSON.parse(JSON.stringify(source.relationship())));
check('a digest survives the round trip',
  copy.name === 'Bess' && copy.learned.has('wallow') && copy.isOn('guard') && Math.abs(copy.trust - 0.8) < 0.01,
  `${copy.name}, trust ${copy.trust.toFixed(2)}, knows ${[...copy.learned].join(', ')}`);
// ── the owner watching their OWN animal fight ──
//
// The other half of the same bug. The copy above fights for a person it has
// never met, so everybody on the server sees the fight — except the owner, who
// draws the real animal from their own simulation and never ran the line that
// starts a fight. `defend` cannot be that line: it is a DECISION, and it refuses
// on trust and on standing orders, so on a connected client it would be asked a
// second question the server has already answered. `mirrorFight` is the answer
// being delivered instead of asked for.
const own = make('wolfcub');                       // untamed, guard off
const boar = { position: at(310, 200), state: 'charge', species: { name: 'Boar' }, remote: true };
check('the gate that stops `defend` does not stop the server\'s word',
  !own.defend(boar) && own.mirrorFight(boar) === true && own.state === 'attack',
  `defend refused at trust ${own.trust.toFixed(2)}, mirrorFight did not`);
check('and the animal is pointed at the body the packet named', own.target === boar,
  `target is the ${own.target?.species?.name?.toLowerCase() ?? 'nothing'}`);
const wasAway = own.dist(boar.position);
run(own, 1.2);
const nowAway = own.dist(boar.position);
check('it closes on the quarry under its own legs', nowAway < wasAway - 1,
  `${wasAway.toFixed(1)} m -> ${nowAway.toFixed(1)} m in 1.2 s`);
check('saying the same thing twice does not restart the lunge', own.mirrorFight(boar) === false,
  `still ${own.state}, stateTime ${own.stateTime.toFixed(2)} s`);
// Reaching it must draw blood, or this is a mime.
run(own, 4);
check('and it bites when it gets there', own.pendingBite === boar || own.dist(boar.position) < own.care_.biteRange + 0.5,
  own.pendingBite ? `pendingBite is the ${boar.species.name.toLowerCase()}` : `${own.dist(boar.position).toFixed(2)} m away`);
// And when the server lets go, so does this — otherwise the owner's animal
// chases a mirrored body on its own authority and the two disagree again.
check('the server calling it off calls it off here', own.stopMirroredFight() && own.state === 'follow' && own.target === null,
  `state ${own.state}`);
check('and calling off a fight that is not happening is not an event', own.stopMirroredFight() === false, own.state);
check('a dead quarry is never taken up', own.mirrorFight({ ...boar, state: 'dead' }) === false, own.state);
// The one that cost a browser run: the fight was 417 m away, because a client
// keeps its own position and the server's copy of the same body was elsewhere.
// Five toasts, five lunges, nothing within sight.
const overTheHorizon = { position: at(710, 200), state: 'charge', species: { name: 'Goblin' }, remote: true };
check('a fight over the horizon is not this animal\'s fight',
  own.mirrorFight(overTheHorizon) === false && own.state !== 'attack',
  `${own.dist(overTheHorizon.position).toFixed(0)} m away, giveUpRange is ${own.care_.giveUpRange}`);

// A mirror heels whether or not it likes you: two untamed copies wandering on
// two machines diverge without limit, and the owner would watch their animal
// stand still while everyone else watched it walk into the next glen.
const shy = make('otter');
shy.mirrored = true;
shy.trust = 0;
const far = { position: at(340, 200) };
for (let i = 0; i < 60 * 6; i++) shy.update(STEP, far, {}, mild);
check('an untamed copy still follows its owner',
  Math.hypot(shy.position.x - far.position.x, shy.position.z - far.position.z) < 30,
  `${Math.hypot(shy.position.x - far.position.x, shy.position.z - far.position.z).toFixed(1)} m away, trust 0`);

// ── they all animate without throwing ──
let animated = 0;
for (const id of COMPANION_IDS) {
  const a = make(id);
  a.trust = 0.9; a.fed = a.played = a.warmth = 1;
  for (const t of a.trickIds) {
    a.learned.add(t);
    a.ask(t);
    for (let i = 0; i < 30; i++) a.update(STEP, owner, {}, mild);
  }
  animated++;
}
check('every animal performs every one of its tricks', animated === COMPANION_IDS.length,
  `${animated} animals, all poses stepped`);

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
