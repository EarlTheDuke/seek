// ── creatures/manager.js ────────────────────────────────────────────────────
// Who exists, where, and how often they get to think.
//
// Spawning is hash-placed on a coarse grid exactly like the trees and the loot,
// so herds live in consistent places rather than materialising at random behind
// you — but unlike the scenery, a creature that has been killed or has wandered
// off does not come back when you walk away and return.
//
// Distant creatures still run their full brain, just at a lower tick rate. A
// deer 200 m away does not need 60 decisions a second, but it does need to have
// actually moved when you next look at it.

import * as THREE from 'three';
import { WILDLIFE, WATER_LEVEL, ALARM } from '../config.js';
import { heightAt, slopeAt, clumpAt, makeRandom } from '../world/noise.js';
import { hash2i, lerp } from '../util/math.js';
import { SPECIES, getSpecies } from './registry.js';
import { Creature } from './creature.js';
import { strangenessAt, darkness, inBand } from '../world/strangeness.js';
import { updateMorale, reportDeath } from './morale.js';

const _player = new THREE.Vector3();

/**
 * Pick one species from a list by `spawn.weight`, driven by a value in [0,1)
 * that the caller derives from the cell hash — so the same site always holds
 * the same thing, in Node and in the browser, forever.
 */
function pickWeighted(list, roll) {
  let total = 0;
  for (const s of list) total += s.spawn.weight ?? 1;
  if (total <= 0) return null;
  let r = roll * total;
  for (const s of list) {
    r -= s.spawn.weight ?? 1;
    if (r <= 0) return s;
  }
  return list[list.length - 1];
}

export class Wildlife {
  constructor(scene, deps) {
    this.scene = scene;
    this.deps = deps; // { stealth, audio, onKilled }
    this.creatures = [];
    this.rand = makeRandom('wildlife');
    this.spawnedSites = new Set(); // herd sites already used
    this.clearedSites = new Set(); // sites whose herd is gone for good
    this.anchor = new THREE.Vector3(Infinity, 0, Infinity);
    this.accum = new Map(); // creature id -> time owed, for LOD ticking
    // What the world is doing. The sun in particular is no longer scenery: it
    // decides who is allowed to exist. Defaults to broad daylight so anything
    // that forgets to pass it gets the mundane world rather than a crash.
    this.ctx = { hours: 12, sunAltitude: 90, weather: null };
    this.wasNight = false;
  }

  // ── spawning ──────────────────────────────────────────────────────────────

  /** Is this a plausible place for `species` to be standing? */
  suits(species, x, z) {
    const s = species.spawn;
    const y = heightAt(x, z);
    if (y < s.minHeight || y > s.maxHeight) return false;
    if (slopeAt(x, z) > s.maxSlope) return false;
    if (y < WATER_LEVEL + 0.5) return false;
    if (s.preferClump) {
      const c = clumpAt(x, z);
      if (c < s.preferClump[0] || c > s.preferClump[1]) return false;
    }
    return true;
  }

  /**
   * Everything that could plausibly live at this site, right now.
   *
   * Three filters, and the difference between them matters for bookkeeping:
   *
   *   * TERRAIN (`suits`) is permanent. A site in the middle of the lake will
   *     never hold a deer, so once we know that we can stop asking.
   *   * The STRANGENESS BAND is semi-permanent — it moves with the sun, since
   *     darkness is a multiplier on the gradient.
   *   * The TIME GATE is openly conditional. A goblin site is empty all day and
   *     occupied all night, at the same coordinates.
   *
   * So this reports both lists: what could live here ever, and what could live
   * here now. A site that fails only the conditional tests is left unmarked and
   * asked again later, which is what makes "night only" a real thing rather
   * than a dice roll at world start.
   */
  candidatesFor(x, z, strangeness, night) {
    const everPossible = [];
    const now = [];
    for (const species of Object.values(SPECIES)) {
      const s = species.spawn;
      if (!this.suits(species, x, z)) continue;
      everPossible.push(species);
      if (!inBand(s.strangeness, strangeness)) continue;
      if (s.nightOnly && night < WILDLIFE.nightThreshold) continue;
      if (s.dayOnly && night >= WILDLIFE.nightThreshold) continue;
      now.push(species);
    }
    return { everPossible, now };
  }

  refresh(px, pz) {
    const cell = WILDLIFE.spawnCell;
    const R = WILDLIFE.spawnRadius;
    const sunAltitude = this.ctx.sunAltitude ?? 90;
    const night = darkness(sunAltitude);

    for (let cj = Math.floor((pz - R) / cell); cj <= Math.ceil((pz + R) / cell); cj++) {
      for (let ci = Math.floor((px - R) / cell); ci <= Math.ceil((px + R) / cell); ci++) {
        const key = `${ci},${cj}`;
        if (this.spawnedSites.has(key) || this.clearedSites.has(key)) continue;
        if (this.creatures.length >= WILDLIFE.maxAlive) return;

        // Not every cell holds a herd.
        if (hash2i(ci, cj, 811) > 0.42) {
          this.spawnedSites.add(key);
          continue;
        }

        const x = ci * cell + hash2i(ci, cj, 812) * cell;
        const z = cj * cell + hash2i(ci, cj, 813) * cell;
        const d = Math.hypot(x - px, z - pz);
        if (d > R) continue;
        // Never appear in front of you at conversational distance.
        if (d < WILDLIFE.minSpawnDistance) continue;

        // ── the strangeness gradient decides WHO ──
        // Not a difficulty multiplier and not a dice roll: an eligibility band
        // per species. Deer live in the settled lowlands, goblins only where
        // the world has already gone wrong. Walking uphill in the dark changes
        // the cast, which is the entire point of the gradient.
        const s = strangenessAt(x, z, { sunAltitude, weather: this.ctx.weather });
        const { everPossible, now } = this.candidatesFor(x, z, s, night);

        if (!everPossible.length) {
          // Nothing could ever live here. Stop asking.
          this.spawnedSites.add(key);
          continue;
        }
        if (!now.length) continue; // conditions wrong — ask again later

        this.spawnedSites.add(key);
        const species = pickWeighted(now, hash2i(ci, cj, 815));
        if (!species) continue;

        const n = Math.round(lerp(species.herd.min, species.herd.max, hash2i(ci, cj, 814)));
        // Goes through the same placement as every other herd. This used to
        // have its own loop picking `radius = hash * spread`, which happily
        // returned near-zero for several members at once and stacked them.
        const born = this.spawnHerd(species.id, x, z, n, species.herd.spread, {
          siteKey: key,
          strict: true,
        });
        // Everything born together fights together. One pack, one morale.
        if (born.length) {
          const packId = `${key}:${species.id}`;
          for (const c of born) c.packId = packId;
        }
      }
    }
  }

  /**
   * Sites are marked as used the moment they spawn, so a site skipped because
   * it was the wrong time of day stays available — but only if something comes
   * back to ask. Refresh normally runs when you have walked 40 m, which means
   * standing still through sunset would never populate the night.
   */
  reconsiderSites() {
    this.anchor.set(Infinity, 0, Infinity);
  }

  spawn(speciesId, x, z, siteKey = null) {
    const species = getSpecies(speciesId);
    if (!species) return null;
    const pos = new THREE.Vector3(x, heightAt(x, z), z);
    const c = new Creature(species, pos, this.rand);
    c.siteKey = siteKey;
    this.scene.add(c.object);
    this.creatures.push(c);
    return c;
  }

  /**
   * Drop a herd at an exact spot, bypassing the usual spawn rules.
   *
   * A testing aid, and the hook any future "scripted encounter" would use.
   * Each animal is nudged outward until it is on dry land, so a herd placed on
   * a shoreline does not end up standing in the lake.
   */
  spawnHerd(speciesId, x, z, count = 4, spread = 12, opts = {}) {
    const { siteKey = null, strict = false } = opts;
    const out = [];
    const placed = [];
    const species = getSpecies(speciesId);
    if (!species) return out;
    const apart = (species.personalSpace ?? 2) * 1.6;

    for (let i = 0; i < count; i++) {
      if (this.creatures.length >= WILDLIFE.maxAlive) break;
      // Walk the ring so members start spread around the site, and retry until
      // the spot is both out of the water and clear of the ones already placed
      // — the water nudge in particular used to pile several onto one point.
      let cx = null;
      let cz = null;
      for (let attempt = 0; attempt < 14 && cx === null; attempt++) {
        const a = (i / count) * Math.PI * 2 + (this.rand() - 0.5) * 1.1 + attempt * 0.7;
        const r = 3 + this.rand() * spread + attempt * 2.5;
        const tx = x + Math.cos(a) * r;
        const tz = z + Math.sin(a) * r;
        // Natural spawns obey the full habitat rules; a hand-placed test herd
        // only has to be on dry land.
        if (strict ? !this.suits(species, tx, tz) : heightAt(tx, tz) <= WATER_LEVEL + 0.4) continue;
        let clear = true;
        for (const p of placed) {
          if (Math.hypot(tx - p.x, tz - p.z) < apart) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;
        cx = tx;
        cz = tz;
      }
      if (cx === null) continue;
      placed.push({ x: cx, z: cz });
      const c = this.spawn(speciesId, cx, cz, siteKey);
      if (c) out.push(c);
    }
    return out;
  }

  remove(c) {
    this.scene.remove(c.object);
    const i = this.creatures.indexOf(c);
    if (i >= 0) this.creatures.splice(i, 1);
    this.accum.delete(c.id);
  }

  // ── per frame ─────────────────────────────────────────────────────────────

  update(dt, playerPos, stealth, ctx = null) {
    _player.copy(playerPos);
    if (ctx) this.ctx = ctx;

    // Nightfall and daybreak are events, not gradual states, as far as spawning
    // is concerned: the cast changes and every site deserves a fresh look. This
    // is what lets you sit by a fire and watch the hillside fill up.
    const night = darkness(this.ctx.sunAltitude ?? 90) >= WILDLIFE.nightThreshold;
    if (night !== this.wasNight) {
      this.wasNight = night;
      this.reconsiderSites();
    }

    if (Math.hypot(playerPos.x - this.anchor.x, playerPos.z - this.anchor.z) > 40) {
      this.anchor.copy(playerPos);
      this.refresh(playerPos.x, playerPos.z);
    }

    this.updatePacks(dt, darkness(this.ctx.sunAltitude ?? 90));

    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      const d = Math.hypot(c.position.x - playerPos.x, c.position.z - playerPos.z);

      // Cull far creatures. A corpse you have walked away from is gone for
      // good; a live one just leaves the simulation and its site can refill.
      if (d > WILDLIFE.despawnRadius) {
        if (c.state === 'dead' && c.siteKey) this.clearedSites.add(c.siteKey);
        this.remove(c);
        continue;
      }

      // Distance LOD: near = every frame, mid = 4/s, far = 2/s. The accumulator
      // means they still get the full elapsed time, so movement stays correct.
      const period = d < WILDLIFE.lodNear ? 0 : d < WILDLIFE.lodFar ? 0.25 : 0.5;
      if (period === 0) {
        c.update(dt, playerPos, stealth);
      } else {
        const owed = (this.accum.get(c.id) ?? 0) + dt;
        if (owed >= period) {
          this.accum.set(c.id, 0);
          c.update(owed, playerPos, stealth);
        } else {
          this.accum.set(c.id, owed);
        }
      }

      if (c.alarmed) {
        c.alarmed = false;
        this.deps.audio?.creatureAlarm?.(c.position);
        this.raiseAlarm(c);
      }

      // One of them has gone down. Everyone close enough to have seen it takes
      // it personally — this is the single lever the player has on a pack.
      if (c.justDied) {
        c.justDied = false;
        if (c.pack) reportDeath(c.pack, c);
      }

      // A predator that has closed to contact swings. The creature only raises
      // the flag; landing the blow is the manager's job, because the creature
      // has no business knowing what a player is.
      if (c.pendingAttack) {
        c.pendingAttack = false;
        this.deps.onAttack?.(c);
      }

      // Vocalising. A bear you can hear coming is far worse than one you can't.
      if (c.species.behaviour === 'aggressive' && c.state !== 'dead') {
        if (c.hurt) {
          c.hurt = false;
          this.deps.audio?.growl?.(c.position, 1); // a roar, not a whimper
          c.voiceTimer = 1.2;
        }
        c.voiceTimer = (c.voiceTimer ?? 0) - dt;
        if (c.voiceTimer <= 0) {
          if (c.state === 'charge' || c.state === 'attack') {
            this.deps.audio?.growl?.(c.position, 1);
            c.voiceTimer = 1.9;
          } else if (c.state === 'alert') {
            this.deps.audio?.growl?.(c.position, 0.3);
            c.voiceTimer = 5.5;
          }
        }
      }
    }

    // After everyone has moved, push apart anything that ended up overlapping.
    this.separate();
  }

  /**
   * Rebuild the pack rosters and recompute everyone's nerve.
   *
   * Done centrally, once per frame, before anybody thinks — so every member of
   * a pack decides against the SAME picture of how the fight is going. If each
   * goblin counted its own friends inside its own think() they would disagree
   * about whether they were winning, and the pack would half-commit.
   *
   * Rebuilt from scratch rather than maintained incrementally because packs are
   * small and creatures despawn behind you; a stale roster would have a goblin
   * drawing courage from a friend that no longer exists.
   */
  updatePacks(dt, night) {
    if (!this.packs) this.packs = new Map();
    this.packs.clear();

    for (const c of this.creatures) {
      if (!c.packId) continue;
      let list = this.packs.get(c.packId);
      if (!list) this.packs.set(c.packId, (list = []));
      list.push(c);
    }

    for (const list of this.packs.values()) {
      // Centre of the living members — the rally point, and what a prowling
      // pack loosely orbits.
      let cx = 0;
      let cz = 0;
      let n = 0;
      for (const c of list) {
        if (c.state === 'dead') continue;
        cx += c.position.x;
        cz += c.position.z;
        n++;
      }
      const centre = n ? { x: cx / n, z: cz / n } : null;

      for (const c of list) {
        c.pack = list;
        c.packCentre = centre;
        if (c.state === 'dead') continue;
        updateMorale(c, list, night, dt);
      }
    }
  }

  /**
   * One animal has panicked; tell the ones that would notice.
   *
   * In plain terms: you get one chance per hillside, not one chance per deer.
   * Blow a stalk and the whole herd is looking at where you are — because the
   * ones that never saw you saw *the deer that did*.
   *
   * Three properties make it behave rather than explode:
   *
   *   * It is a CHAIN. Each animal that panics from an alarm can pass it on,
   *     weaker (`generationDecay`) and only so far (`maxGenerations`). So the
   *     panic ripples outward through a herd instead of teleporting to every
   *     animal in range at once, and a strung-out herd genuinely does raise the
   *     alarm more slowly than a tight one.
   *   * It only ever RAISES awareness, and never past `ceiling`. Being told is
   *     not the same as seeing: the animal still has to confirm it, so freezing
   *     when a neighbour bolts is not automatically fatal to your stalk.
   *   * `hears` is per-species, so who listens to whom is data. Deer listen to
   *     deer. A bear listens to prey too — and that costs you nothing to write,
   *     but it means shooting a deer badly can bring something else to look at
   *     the carcass.
   */
  raiseAlarm(source) {
    const A = source.species.alarm;
    if (!A) return;
    if (source.alarmGen >= ALARM.maxGenerations) return;

    const carried = A.strength * ALARM.generationDecay ** source.alarmGen;
    if (carried < 0.05) return;

    for (const other of this.creatures) {
      if (other === source || other.state === 'dead') continue;
      const ear = other.species.alarm;
      if (!ear?.hears?.includes(source.species.faction)) continue;

      const d = Math.hypot(
        other.position.x - source.position.x,
        other.position.z - source.position.z
      );
      if (d > A.radius) continue;

      // Flat inside `core`, then falling away to nothing at `radius`.
      //
      // A plain linear falloff was wrong, and measurably so: at herd spacing
      // (~20 m) it delivered 0.59 against a panic threshold of 0.75, so a
      // bolting deer left its own herd merely *alert* and the chain died at one
      // hop. A herd that does not go up together is not a herd. Inside the
      // core the alarm is unmissable; outside it, it is a rumour.
      const near = d <= A.core ? 1 : 1 - (d - A.core) / Math.max(1e-3, A.radius - A.core);
      const gain = Math.min(ALARM.ceiling, carried * near * (ear.trust ?? 1));
      if (gain <= other.awareness) continue; // never talk an animal down

      other.awareness = gain;
      other.alarmGen = source.alarmGen + 1;
      // It looks where the panicking animal is looking, not at the panicking
      // animal — a herd that bolts toward the hunter is not a herd.
      other.lastKnownThreat.copy(source.lastKnownThreat);
    }
  }

  /**
   * Keep bodies out of one another.
   *
   * A hard positional resolve rather than a steering force, because steering
   * cannot recover once two animals already overlap — and they reliably do,
   * since a whole herd fleeing a single threat all runs on near-parallel
   * headings and converges. O(n^2) over a couple of dozen creatures is nothing.
   *
   * Only the overlap is corrected, and only a fraction of it per frame, so the
   * herd settles smoothly instead of jittering apart.
   */
  separate() {
    const list = this.creatures;
    const RELAX = 0.5;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const minD = (a.personalSpace + b.personalSpace) * 0.5;
        let dx = b.position.x - a.position.x;
        let dz = b.position.z - a.position.z;
        let d = Math.hypot(dx, dz);
        if (d >= minD) continue;

        if (d < 1e-4) {
          // Exactly coincident. Pick a stable direction from their ids so they
          // do not shimmer against each other frame to frame.
          const ang = (((a.id * 2654435761) >>> 0) % 1000) / 1000 * Math.PI * 2;
          dx = Math.cos(ang);
          dz = Math.sin(ang);
          d = 1;
        }

        const ux = dx / d;
        const uz = dz / d;
        const overlap = (minD - d) * RELAX;
        // A carcass is immovable; the living step around it.
        const aDead = a.state === 'dead';
        const bDead = b.state === 'dead';
        if (aDead && bDead) continue;
        const aShare = aDead ? 0 : bDead ? 1 : 0.5;
        const bShare = bDead ? 0 : aDead ? 1 : 0.5;
        if (aShare) a.nudge(-ux * overlap * aShare * 2, -uz * overlap * aShare * 2);
        if (bShare) b.nudge(ux * overlap * bShare * 2, uz * overlap * bShare * 2);
      }
    }
  }

  /**
   * Nearest creature whose body a world-space point falls inside. Used by the
   * projectile system; kept here so creatures own their own collision.
   */
  hitTest(from, to) {
    let best = null;
    let bestT = Infinity;
    for (const c of this.creatures) {
      if (c.state === 'dead') continue;
      const r = c.species.radius * c.scale;
      const h = c.species.height * c.scale;
      // Vertical capsule approximated as a cylinder — fine at this scale.
      const t = segmentCylinder(from, to, c.position, r, h);
      if (t !== null && t < bestT) {
        bestT = t;
        best = c;
      }
    }
    return best ? { creature: best, t: bestT } : null;
  }

  get stats() {
    let alive = 0;
    let dead = 0;
    let alert = 0;
    for (const c of this.creatures) {
      if (c.state === 'dead') dead++;
      else {
        alive++;
        if (c.awareness > c.species.senses.alertAt) alert++;
      }
    }
    return { alive, dead, alert, total: this.creatures.length };
  }
}

/** Segment vs vertical cylinder standing on `base`. Returns t in [0,1] or null. */
function segmentCylinder(a, b, base, r, h) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const ox = a.x - base.x;
  const oz = a.z - base.z;
  const A = dx * dx + dz * dz;
  if (A < 1e-9) {
    if (ox * ox + oz * oz > r * r) return null;
    const dy = b.y - a.y;
    if (Math.abs(dy) < 1e-9) return null;
    const t = (base.y + (dy > 0 ? 0 : h) - a.y) / dy;
    return t >= 0 && t <= 1 ? t : null;
  }
  const B = 2 * (ox * dx + oz * dz);
  const C = ox * ox + oz * oz - r * r;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
    if (t < 0 || t > 1) continue;
    const y = a.y + (b.y - a.y) * t;
    if (y >= base.y && y <= base.y + h) return t;
  }
  return null;
}
