// ── audit.js ────────────────────────────────────────────────────────────────
// Has anything we added quietly removed the difficulty?
//
//   npm run audit
//
// Not a pass/fail suite — a set of readings. Every feature since Phase 2 has
// made the player stronger (a cloak, a camp, an axe, a companion, fish), and
// nothing has made the world harder. This measures whether the pressures the
// survival model is built on still exist.

import { SURVIVAL, OTTER, FISH, AXE, STRUCTURES } from '../src/config.js';
import { COMPANIONS, COMPANION_IDS } from '../src/creatures/companions.js';
import { SPECIES } from '../src/creatures/registry.js';

const row = (k, v) => console.log(`    ${String(k).padEnd(34)} ${v}`);

console.log('\n  ── COLD ──────────────────────────────────────────────────────\n');
// How many degrees of protection can you stack, and what is left to fear?
const cloak = 9;
const camp = 0.94;            // measured shelter from a full camp
const fire = SURVIVAL.fireWarmthC;
const spring = 15;
row('cloak', `${cloak} C of insulation`);
row('a full camp', `${Math.round(camp * 100)}% shelter (wind 0.79 -> 0.05)`);
row('a fire', `+${fire} C`);
row('a hot spring', `+${spring} C`);
row('a cave at 04:00', '+1.9 C and total shelter');
console.log('');
row('worst ground in the world', 'snow line, 1.3 C, exposure 0.92');
row('...with cloak + camp + fire', `${(1.3 + cloak + fire).toFixed(1)} C felt, wind ~0`);
console.log('\n    Verdict: cold is survivable ANYWHERE once you have a cloak and');
console.log('    a fire. The pressure now comes from being caught without them,');
console.log('    which is a first-hour problem only.\n');

console.log('  ── HUNGER ────────────────────────────────────────────────────\n');
const perDay = SURVIVAL.hungerRate ? SURVIVAL.hungerRate * 24 : null;
row('venison, cooked', `fills ${SURVIVAL.food.venison_cooked.fills}`);
row('trout, cooked', `fills ${SURVIVAL.food.fish_cooked.fills}`);
row('fishing, crouched + otter', `${Math.round(FISH.maxChance * 100)}% cap, ~79% typical`);
row('...and doubles', 'otter catches one too ~40% of the time');
row('otter seek range', `${OTTER.seekRangeMin}-${OTTER.seekRangeMax} m, never misses`);
console.log('\n    Verdict: with an otter, food is effectively solved. A shoal is a');
console.log('    renewable 19-fill meal at 79% a try, four seconds apart. Compare');
console.log('    a deer: one stalk, one arrow, 34 fill, and it can be lost.\n');

console.log('  ── WEAPONS ───────────────────────────────────────────────────\n');
const deerHp = SPECIES.deer.hitPoints;
const bearHp = SPECIES.bear.hitPoints;
row('deer hit points', deerHp);
row('axe, full blow to vitals', `${Math.round(AXE.damageFull * 1.9)} — a one-shot kill`);
row('axe reach / wind-up', `${AXE.reach} m / ${AXE.windupFull} s`);
row('bear hit points', bearHp);
row('axe blows to kill a bear', Math.ceil(bearHp / (AXE.damageFull * 1.7)));
console.log('\n    Verdict: the axe one-shots a deer at 2.9 m. The bow is still the');
console.log('    answer for anything that fights back, but the axe has quietly');
console.log('    become the better tool for the commonest kill in the game.\n');

console.log('  ── COMPANIONS ────────────────────────────────────────────────\n');
console.log('    Every companion shares the OTTER block:\n');
row('follow range (all six)', `${OTTER.followRange} m`);
row('bite damage (all six)', OTTER.biteDamage);
row('shy range (all six)', `${OTTER.shyRange} m`);
row('hunger per hour (all six)', OTTER.hungerPerHour);
console.log('');
for (const id of COMPANION_IDS) {
  const c = COMPANIONS[id];
  row(c.name, `walk ${c.walkSpeed} run ${c.runSpeed} — but follows at ${OTTER.followRange} m and bites for ${OTTER.biteDamage}`);
}
console.log('\n    Verdict: a hippo trails a human at four and a half metres and');
console.log('    bites like an otter. Six animals share one temperament.\n');

console.log('  ── POWERS: WHAT DOES IT COST? ────────────────────────────────\n');
row('seek / scout / track / dive', 'free, instant, unlimited');
row('pouch', `${10} slots, free, and NOT SAVED`);
row('ferry', 'toggles a variable nothing reads');
console.log('\n    Verdict: no power has a cost, a cooldown or a failure case, so');
console.log('    the answer to every problem is "press the button again".\n');
