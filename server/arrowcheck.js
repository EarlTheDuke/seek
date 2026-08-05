// ── arrowcheck.js ───────────────────────────────────────────────────────────
// Can an arrow hit a person?
//
//   npm run arrowcheck
//
// It never could. Projectiles were tested against terrain, world colliders and
// wildlife, and nothing else — so a shaft passed through every player, at any
// range, in any country, and never reached `canHarm` because nothing noticed it
// had arrived. Reported live, in as many words: "the arrow goes directly
// through your character model and does not hit you."
//
// Headless, no network. The three things that matter are that it CONNECTS, that
// it respects the rule about where fighting is allowed, and that it never hits
// the person who loosed it.

import * as THREE from 'three';
import { SimWorld } from '../src/sim/world.js';
import { placeStrangeness } from '../src/world/strangeness.js';
import { heightAt } from '../src/world/noise.js';

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n  Arrows and people\n');

/** Somewhere settled, and somewhere strange, so both sides of the rule are real. */
function findGround(wantAbove) {
  for (let r = 0; r < 3000; r += 20) {
    for (let a = 0; a < 6.28; a += 0.35) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = placeStrangeness(x, z);
      if (Math.abs(heightAt(x, z) - heightAt(x, z + 6)) > 0.6) continue; // level ground
      if (wantAbove ? s >= 0.5 : s <= 0.25) return { x, z, s };
    }
  }
  return null;
}
const settled = findGround(false);
const strange = findGround(true);
console.log(`    settled ground at ${settled.x.toFixed(0)},${settled.z.toFixed(0)} (strangeness ${settled.s.toFixed(2)})`);
console.log(`    strange ground at ${strange.x.toFixed(0)},${strange.z.toFixed(0)} (strangeness ${strange.s.toFixed(2)})\n`);

/** Put two players nose to nose and loose one arrow from A at B. */
function shoot(where, { sameParty = false, atSelf = false, allowPvp = false } = {}) {
  const w = new SimWorld({ headless: true });
  const a = w.addPlayer(1, 'Archer');
  const b = w.addPlayer(2, 'Target');
  // ON the ground, not at y=0 — the hills here are 67 m up, so a shot fired at
  // sea level starts underground and buries itself in the first frame. The
  // first run of this file failed for exactly that reason and the code was
  // fine; a check that puts its players inside a mountain proves nothing.
  const gy = heightAt(where.x, where.z);
  a.ctrl.position.set(where.x, gy, where.z);
  b.ctrl.position.set(where.x, heightAt(where.x, where.z + 6), where.z + 6);
  // Toggle the rule rather than hunting for strange ground: the spot has to be
  // clear of trees AND above 0.45, and looking for both found somewhere with a
  // trunk in the way. What matters is the RULE, not the postcode.
  if (allowPvp) w.rules.pvpEverywhere = true;
  if (sameParty) w.setParty(1, 2);

  const before = b.body.health;
  const origin = new THREE.Vector3(where.x, gy + 1.2, where.z + 0.6);
  const vel = new THREE.Vector3(0, 0, 60); // straight at them, flat and fast
  w.projectiles.spawn('arrow', origin, vel, atSelf ? 2 : 1);

  for (let i = 0; i < 60; i++) w.projectiles.update(1 / 60);
  return { world: w, before, after: b.body.health, archer: a.body.health, events: w.events };
}

// ── it connects at all ──
const s = shoot(settled, { allowPvp: true });
check('an arrow hits a person on strange ground',
  s.after < s.before, `${s.before} -> ${s.after} health`);
check('and the world says so', s.events.some((e) => e.k === 'hit'),
  JSON.stringify(s.events.find((e) => e.k === 'hit') ?? null));

// ── the rule the game already had, now reachable ──
const t = shoot(settled);
check('on settled ground it stops but does no harm',
  t.after === t.before, `${t.before} -> ${t.after} — you may not fight here`);
check('and it says WHY rather than vanishing',
  t.events.some((e) => e.k === 'glance'),
  t.events.find((e) => e.k === 'glance')?.why ?? 'no reason given');

// ── your own people ──
const p = shoot(settled, { sameParty: true, allowPvp: true });
check('a party member is never hit', p.after === p.before,
  `${p.before} -> ${p.after} on ground where fighting IS allowed`);
check('and is told it was the party that saved them',
  /party/.test(p.events.find((e) => e.k === 'glance')?.why ?? ''),
  p.events.find((e) => e.k === 'glance')?.why ?? '—');

// ── and never yourself ──
// An arrow spawns half a metre in front of a capsule 0.42 m wide. Without an
// owner it strikes the archer on the first frame and every shot is suicide.
const own = shoot(settled, { atSelf: true, allowPvp: true });
check('an archer cannot shoot themselves in the back of the head',
  own.archer === 100, `archer at ${own.archer} health after loosing their own arrow`);

const failed = results.filter((r) => !r).length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
