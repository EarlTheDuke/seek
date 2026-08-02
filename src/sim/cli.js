// ── cli.js ──────────────────────────────────────────────────────────────────
// Entry point for `npm run sim`. Advances the world headless and prints a
// fingerprint, so a browser run and a Node run can be compared directly.
//
//   npm run sim
//   npm run sim -- 12000
//   npm run sim -- 3000 3          (ticks, repeats — self-determinism check)
//   node src/sim/cli.js --ticks 3000 --repeat 3
//
// Note the bare numbers. `npm run sim -- --ticks 3000` does NOT work: npm's own
// config parser swallows the unrecognised `--ticks` and forwards only `3000`,
// so the flag silently vanished and every run quietly used the default. It cost
// a confusing half hour of "why is the fingerprint identical at every tick
// count" — the answer being that it was the same run every time. Positional
// arguments survive npm intact, so those are the documented form; the flags
// still work when calling node directly.

import { runSim } from './headless.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] !== undefined) return Number(args[i + 1]);
  return fallback;
};

// Bare numbers, in order: ticks then repeat.
const positional = args.filter((a) => /^\d+$/.test(a)).map(Number);

const ticks = flag('ticks', positional[0] ?? 3600);
const repeat = flag('repeat', positional[1] ?? 1);

console.log(`\nheadless sim — ${ticks} ticks (${(ticks / 60).toFixed(1)}s of world time)`);
if (repeat > 1) console.log(`running ${repeat} times to check the sim agrees with itself\n`);

const results = [];
for (let i = 0; i < repeat; i++) {
  const t0 = process.hrtime.bigint();
  const { fingerprint } = runSim(ticks);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  results.push(fingerprint);
  if (repeat > 1) console.log(`  run ${i + 1}: ${ms.toFixed(0)} ms`);
  else console.log(`  ${ms.toFixed(0)} ms  (${(ticks / (ms / 1000)).toFixed(0)} ticks/sec)\n`);
}

console.log(JSON.stringify(results[0], null, 1));

if (repeat > 1) {
  const first = JSON.stringify(results[0]);
  const allMatch = results.every((r) => JSON.stringify(r) === first);
  console.log(`\ndeterministic across ${repeat} runs: ${allMatch ? 'YES' : 'NO'}`);
  if (!allMatch) process.exitCode = 1;
}
