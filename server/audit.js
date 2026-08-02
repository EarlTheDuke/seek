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
import { COMPANIONS, COMPANION_IDS, careOf } from '../src/creatures/companions.js';
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
const stacked = 1.3 + cloak + fire;
row('...with cloak + camp + fire', `${stacked.toFixed(1)} C felt, wind ~0`);
row('...with a fire alone', `${(1.3 + fire).toFixed(1)} C felt`);
row('...with nothing', '1.3 C, exposed — hypothermic in ~11 min');
console.log(
  stacked > 30
    ? '\n    Verdict: OVERSTACKED. A full camp is a sauna on the coldest ground\n    in the world, so nothing you build after the first fire matters.\n'
    : '\n    Verdict: a fire alone still saves you, and the cloak and camp are\n    worth having on top without making the mountain irrelevant. Being\n    caught out with neither is still what kills you.\n'
);

console.log('  ── HUNGER ────────────────────────────────────────────────────\n');
const perDay = SURVIVAL.hungerRate ? SURVIVAL.hungerRate * 24 : null;
row('venison, cooked', `fills ${SURVIVAL.food.venison_cooked.fills}`);
row('trout, cooked', `fills ${SURVIVAL.food.fish_cooked.fills}`);
// Computed from the config rather than asserted, so this stays true when the
// numbers move — the first version of this line said "79% typical" and went on
// saying it after the retune.
const odds = (crouched, otterTrust) => {
  let c = FISH.baseChance + (crouched ? FISH.crouchBonus : 0) + FISH.shoalBonus * 0.5;
  if (otterTrust !== null) c += FISH.otterBonusMin + (FISH.otterBonusMax - FISH.otterBonusMin) * otterTrust;
  return Math.min(FISH.maxChance, c);
};
row('fishing, standing, alone', `${Math.round(odds(false, null) * 100)}%`);
row('fishing, crouched, alone', `${Math.round(odds(true, null) * 100)}%`);
row('fishing, crouched + devoted otter', `${Math.round(odds(true, 0.95) * 100)}%`);
row('...and doubles', `${Math.round(0.95 * FISH.doubleChance * 100)}% of successes`);
row('otter seek', `${OTTER.seekRangeMin}-${OTTER.seekRangeMax} m, never misses, ${Math.round(0.75 * 60)} min rest`);
const solved = odds(true, 0.95) > 0.75;
console.log(
  solved
    ? '\n    Verdict: with an otter, food is effectively solved and the STALK\n    is the inefficient way to eat.\n'
    : '\n    Verdict: an otter makes fishing a good living rather than a solved\n    problem, and a deer is still the better meal if you can take one.\n'
);

console.log('  ── WEAPONS ───────────────────────────────────────────────────\n');
const deerHp = SPECIES.deer.hitPoints;
const bearHp = SPECIES.bear.hitPoints;
row('deer hit points', deerHp);
row('axe, full blow to vitals', `${Math.round(AXE.damageFull * 1.9)} — a one-shot kill`);
row('axe reach / wind-up', `${AXE.reach} m / ${AXE.windupFull} s`);
row('bear hit points', bearHp);
const axeBear = Math.ceil(bearHp / (AXE.damageFull * 1.7));
row('axe blows to kill a bear', axeBear);
row('bear charge speed vs your sprint', '11.5 vs 8.6 m/s — it reaches you');
console.log(
  axeBear <= 2
    ? '\n    Verdict: the axe trivialises the bear, which was built as the one\n    fight you have to stand and shoot your way out of.\n'
    : `\n    Verdict: a clean one-shot on a deer, but ${axeBear} exchanges with a bear\n` +
      '    at 62 damage a swing — so the bow is still the answer to anything\n' +
      '    that fights back, and the axe is the tool.\n'
);

console.log('  ── COMPANIONS ────────────────────────────────────────────────\n');
console.log('    kind        follow   bite   eats/h   power rest   tires\n');
for (const id of COMPANION_IDS) {
  const s = COMPANIONS[id];
  const c = careOf(s);
  console.log(
    `    ${s.name.padEnd(11)} ${String(c.followRange).padStart(5)} m ${String(c.biteDamage).padStart(5)} ` +
      `${String(c.hungerPerHour).padStart(8)} ${String(Math.round(c.powerCooldownHours * 60) + ' min').padStart(10)} ` +
      `${String(c.powerTires).padStart(7)}`
  );
}
const spread = (f) => new Set(COMPANION_IDS.map((id) => careOf(COMPANIONS[id])[f])).size;
console.log('');
row('distinct follow ranges', `${spread('followRange')} of ${COMPANION_IDS.length}`);
row('distinct bites', `${spread('biteDamage')} of ${COMPANION_IDS.length}`);
console.log('\n    Verdict: six temperaments. A hippo keeps its distance and hits');
console.log('    for 34; a parrot stays at your shoulder and hits for 2.\n');

console.log('  ── POWERS: WHAT DOES IT COST? ────────────────────────────────\n');
for (const id of COMPANION_IDS) {
  const s = COMPANIONS[id];
  const c = careOf(s);
  const power = Object.values(s.tricks).find((t) => t.power);
  row(`${s.name} — ${power?.name}`,
    `${Math.round(c.powerCooldownHours * 60)} min rest · -${c.powerTires} play · -${c.powerHungers} fed`);
}
console.log('\n    Verdict: working the animal is now part of caring for it. Spam a');
console.log('    power and it goes hungry and bored, which costs you trust.\n');
