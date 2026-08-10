// ── staggercheck.js ─────────────────────────────────────────────────────────
// Is a troll a fight, or a footrace you are guaranteed to lose?
//
//   npm run staggercheck
//
// THE ARITHMETIC A PLAYTESTER DID, after three sessions and one dead troll's
// worth of progress (420 hp down to 378):
//
//   > It charges at 7.2 metres per second, which is faster than a sprint, and
//   > it has 150m of aggro range against 11m of eyesight — it hunts you by ear.
//   > Three times I ended a call with the troll at a safe 84-95m and began the
//   > next one already dead.
//
// And the part he could not see from outside: `chargeStamina: 999`. It never
// tires. A player sprints at 8.6 m/s for about three seconds and then cannot.
// So there was no approach and no disengage — the whole encounter was decided
// the moment it heard you, 150 m away, through terrain you cannot see it
// through.
//
// A SOLID HIT NOW MAKES IT FLINCH. A second and a half standing still, once
// every four seconds at most, for a hit that actually landed. About twelve
// metres of ground back per good arrow: enough to open the range and loose
// another, not enough to make it harmless.
//
// The rule this file exists to protect is the SHAPE of that, not the numbers:
//
//   * ONE GOOD ARROW, not many bad ones. A stream of grazes must not pin it.
//   * NOT EVERY CREATURE. A goblin that flinches is a goblin that is no longer
//     frightening, and there are twenty-six of them.
//   * AND IT STILL WANTS YOU. Staggered is not stunned, tamed or blinded.

import * as THREE from 'three';
import { SPECIES } from '../src/creatures/registry.js';
import { Creature } from '../src/creatures/creature.js';
import { makeRandom } from '../src/world/noise.js';
import { PLAYER } from '../src/config.js';
import { SimWorld } from '../src/sim/world.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const rand = makeRandom('staggercheck');
const spawn = (sp) => new Creature(sp, new THREE.Vector3(0, 0, 0), rand);
const CHEST = { name: 'chest', multiplier: 1 };

function main() {
  console.log('\n  Is a troll a fight, or a footrace you cannot win?\n');

  // ── the numbers that made it a footrace ──────────────────────────────────
  {
    const t = SPECIES.troll;
    check('THE PROBLEM IS REAL: it is nearly as fast as a sprint and never tires',
      t.speeds.charge >= PLAYER.sprintSpeed * 0.8 && t.aggression.chargeStamina > 100,
      `charge ${t.speeds.charge} m/s vs sprint ${PLAYER.sprintSpeed} m/s, `
      + `chargeStamina ${t.aggression.chargeStamina} — and it hears you at `
      + `${t.aggression.aggroRange} m while seeing you at ${t.senses.sightRange}`);
  }

  // ── one good arrow ───────────────────────────────────────────────────────
  {
    const c = spawn(SPECIES.troll);
    c.charging = true;
    c.applyDamage(30, CHEST, null);
    check('A SOLID HIT MAKES A TROLL FLINCH',
      c.staggered > 0,
      `${(c.staggered ?? 0).toFixed(2)}s of standing still — about twelve metres back`);

    // ...and it actually stops, which is a different claim from the flag.
    c.sense = () => {};
    c.think = () => { c.targetSpeed = SPECIES.troll.speeds.charge; };
    c.move = () => {};
    c.animate = () => {};
    c.update(0.1, null, null);
    check('  …and while it flinches it does not close the distance',
      c.targetSpeed === 0,
      'the flag is not the fix; stopping is');

    // and it comes on again afterwards.
    for (let i = 0; i < 40; i++) c.update(0.1, null, null);
    check('  …and then it comes on again',
      c.staggered <= 0 && c.targetSpeed === SPECIES.troll.speeds.charge,
      'staggered is not stunned, tamed or blinded');
  }

  // ── ...and not many bad ones ─────────────────────────────────────────────
  {
    const c = spawn(SPECIES.troll);
    c.charging = true;
    c.applyDamage(6, CHEST, null);
    check('A GRAZE DOES NOT',
      !(c.staggered > 0),
      `6 damage against a minimum of ${SPECIES.troll.stagger.minDamage} — the answer is one good arrow`);
  }

  {
    const c = spawn(SPECIES.troll);
    c.charging = true;
    c.applyDamage(30, CHEST, null);
    const first = c.staggered;
    c.applyDamage(30, CHEST, null);
    check('  …and a second hit inside the cooldown cannot re-pin it',
      c.staggered === first,
      `a stream of arrows must not hold it still for ever — cooldown ${SPECIES.troll.stagger.cooldown}s`);
  }

  {
    // The cooldown really does expire, or the line above is just a dead flag.
    const c = spawn(SPECIES.troll);
    c.charging = true;
    c.sense = () => {}; c.think = () => {}; c.move = () => {}; c.animate = () => {};
    c.applyDamage(30, CHEST, null);
    for (let i = 0; i < 60; i++) c.update(0.1, null, null);   // six seconds
    c.applyDamage(30, CHEST, null);
    check('  …but once the cooldown has run, a fresh arrow flinches it again',
      c.staggered > 0,
      'three archers taking turns is the plan this is here to reward');
  }

  // ── not everything ───────────────────────────────────────────────────────
  {
    const soft = Object.entries(SPECIES).filter(([, sp]) => sp.stagger);
    check('ONLY THE TROLL CAN BE STAGGERED',
      soft.length === 1 && soft[0][0] === 'troll',
      soft.map(([id]) => id).join(', ')
      + ' — a goblin that flinches is not frightening, and there are twenty-six of them');

    const g = spawn(SPECIES.goblin);
    g.applyDamage(40, CHEST, null);
    check('  …and a goblin taking a heavy hit is unmoved',
      !g.staggered, 'the pack does not care');
  }

  // ── AND A FIGHT IS EVERYBODY'S BUSINESS ─────────────────────────────────
  //
  // The best idea in the third playtest, in his own words:
  //
  //   > if someone in your group is engaged with a creature, that creature
  //   > enters everyone's brief as a claimed target with a "help or refuse"
  //   > decision attached, so the model has to actually take a position rather
  //   > than drifting back to deer.
  //
  // He recruited four models, walked them a kilometre to the ground he had
  // picked, and they stood beside him narrating the hunt and choosing `hunt
  // deer` every tick. The troll in front of them was in nobody's brief.
  //
  // A mind that REFUSES to help has told you something real about itself. A
  // mind that was never asked has told you nothing at all.
  {
    const w = new SimWorld({ headless: true });
    const a = w.addPlayer(1, 'Jack');
    const b = w.addPlayer(2, 'Ailsa');

    // Trolls are rare by design — night, steep ground, high strangeness — so a
    // fresh headless world usually has none. Put one in beside Jack rather
    // than waiting for the spawner: this is a test of the CLAIM, not of the
    // spawn rules, which `dangercheck` already owns.
    const troll = new Creature(SPECIES.troll, a.ctrl.position.clone(), rand);
    troll.position.x += 40;
    w.wildlife.creatures.push(troll);

    // Through the world's own door — `onCreatureHit` belongs to the PROJECTILE
    // layer, not the wildlife one, which is where an arrow actually arrives.
    w.projectiles.deps.onCreatureHit(troll, { killed: false, damage: 30, zone: 'chest' }, null, a.id);

    check('A BIG QUARRY UNDER ATTACK BECOMES A CLAIM',
      !!w.claim && w.claim.by === a.id && w.claim.sp === 'troll',
      w.claim ? `${w.claim.byName} on a ${w.claim.n}, ${w.claim.hp}/${w.claim.full} left` : 'no claim at all');

    check('  …and it rides on the wire for EVERYBODY, not just the fighter',
      !!w.snapshot(b.id).cl && !!w.snapshot(a.id).cl,
      'a troll is a fight nobody can finish alone, so everybody has to see it');

    check('  …carrying what makes it a decision: how far, and what is left in it',
      w.claim?.hp > 0 && w.claim?.full > 0 && Array.isArray(w.claim?.at),
      `${w.claim?.hp}/${w.claim?.full} at ${JSON.stringify(w.claim?.at)}`);
  }

  {
    // A deer does not need a war band, and a claim on every rabbit is a claim
    // nobody reads.
    const w = new SimWorld({ headless: true });
    const a = w.addPlayer(1, 'Jack');
    const deer = new Creature(SPECIES.deer, a.ctrl.position.clone(), rand);
    w.wildlife.creatures.push(deer);
    w.projectiles.deps.onCreatureHit(deer, { killed: false, damage: 20, zone: 'chest' }, null, a.id);
    check('SMALL GAME MAKES NO CLAIM ON ANYBODY',
      !w.claim, w.claim ? JSON.stringify(w.claim.n) : 'a deer is your own business');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
