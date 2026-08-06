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
import { hash2i, lerp, damp } from '../util/math.js';
import { richnessAt } from '../world/scarcity.js';
import { SPECIES, getSpecies } from './registry.js';
import { Creature, DEAD, GRAZE } from './creature.js';
import { strangenessAt, darkness, inBand } from '../world/strangeness.js';
import { caveAt } from '../world/caves.js';
import { updateMorale, reportDeath } from './morale.js';

const _player = new THREE.Vector3();

/**
 * Pick one species from a list by `spawn.weight`, driven by a value in [0,1)
 * that the caller derives from the cell hash — so the same site always holds
 * the same thing, in Node and in the browser, forever.
 *
 * Weight is ABSOLUTE rarity, not a share. That distinction matters and I got it
 * wrong once already: with a purely relative pick, a bear weighted 0.16 became
 * 42-64% of all encounters, because on the many sites where its habitat rules
 * admitted it and the deer's did not, it won by being the only candidate. A
 * "rare" animal was the commonest thing in the world.
 *
 * So the total eligible weight is compared against 1 first, and a site whose
 * candidates do not add up to a whole animal is often simply EMPTY. An empty
 * hillside is a perfectly good outcome — the world is mostly empty.
 */
function pickWeighted(list, roll) {
  let total = 0;
  for (const s of list) total += s.spawn.weight ?? 1;
  if (total <= 0) return null;
  // Thin candidates leave the site empty in proportion to how thin they are.
  if (roll * Math.max(1, total) > total) return null;
  let r = roll * Math.max(1, total);
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
    /** Species that may not spawn at all — see modes/danger.js. */
    this.banned = new Set();
    // Everyone else the world should populate around. Set by the server each
    // tick; empty in the browser, where there is only ever one of you.
    this.extraAnchors = [];
    this.anchors = new Map(); // key -> last position we spawned around
    // ── whose animals are these? ──
    // False everywhere except a connected multiplayer client, where this
    // manager stops being a simulation and becomes a mirror. See setRemote.
    this.remote = false;
    this.byServerId = new Map(); // server creature id -> our local Creature
  }

  /**
   * Change what is allowed to exist, and clear out anything that already does.
   *
   * The second half is the part that matters. Turning bears off and then being
   * stalked for ten minutes by the one that spawned before you changed your
   * mind is not "off", it is a setting that lies to you — and the person most
   * likely to turn bears off is the person least able to survive the bear that
   * was already there. Cleared sites are forgotten too, so the world can put
   * something harmless where the bear had been rather than leaving a hole.
   */
  setBanned(ids) {
    this.banned = new Set(ids);
    let removed = 0;
    for (const c of [...this.creatures]) {
      if (!this.banned.has(c.species.id)) continue;
      this.remove(c);
      removed++;
    }
    if (removed) this.spawnedSites.clear();
    return removed;
  }

  // ── spawning ──────────────────────────────────────────────────────────────

  /** Is this a plausible place for `species` to be standing? */
  suits(species, x, z) {
    const s = species.spawn;
    const y = heightAt(x, z);
    if (y < s.minHeight || y > s.maxHeight) return false;
    const slope = slopeAt(x, z);
    if (slope > s.maxSlope) return false;
    // Some things want broken ground. A minimum slope is how "gorges and crags"
    // gets expressed without any new terrain data — the steep places already
    // exist, nothing had ever asked for them.
    if (s.minSlope && slope < s.minSlope) return false;
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
      // The one chokepoint every spawn in the game passes through, which is why
      // the danger setting is enforced here and nowhere else — see modes/danger.js.
      if (this.banned?.has(species.id)) continue;
      if (!this.suits(species, x, z)) continue;
      everPossible.push(species);
      if (!inBand(s.strangeness, strangeness)) continue;
      if (s.nightOnly && night < WILDLIFE.nightThreshold) continue;
      if (s.dayOnly && night >= WILDLIFE.nightThreshold) continue;
      now.push(species);
    }
    return { everPossible, now };
  }

  /**
   * How many creatures may be alive at once.
   *
   * A budget per player rather than one shared total. The cull was fixed first
   * and it was not enough on its own: with everyone's animals finally surviving
   * they all came out of the same 26, the first two players took every one, and
   * six players spread a kilometre apart measured 15, 7, 0, 0, 0 and 0 within
   * sight. A shared cap makes the world emptier the more people are in it.
   *
   * One player is one budget, so single-player is exactly what it was.
   */
  aliveCap() {
    const players = 1 + (this.extraAnchors?.length ?? 0);
    return Math.min(WILDLIFE.maxAlive * players, WILDLIFE.maxAliveTotal);
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
        if (this.creatures.length >= this.aliveCap()) return;

        // Not every cell holds a herd — and under scarcity, fewer do, with the
        // ones that remain pulled into the good ground. `richnessAt` returns 1
        // everywhere until somebody turns it on, so this is the same world it
        // has always been by default. The site's own position has to be worked
        // out first, because WHERE it is decides how rich it is.
        const x = ci * cell + hash2i(ci, cj, 812) * cell;
        const z = cj * cell + hash2i(ci, cj, 813) * cell;
        if (hash2i(ci, cj, 811) > WILDLIFE.siteDensity * richnessAt(x, z)) {
          // NOT marked used: a site that failed only because the valley is thin
          // is not a site that can never hold anything. Marking it would bake
          // today's scarcity into the map for the rest of the session.
          continue;
        }

        const d = Math.hypot(x - px, z - pz);
        if (d > R) continue;
        // Never appear in front of you at conversational distance.
        if (d < WILDLIFE.minSpawnDistance) continue;

        // ── the strangeness gradient decides WHO ──
        // Not a difficulty multiplier and not a dice roll: an eligibility band
        // per species. Deer live in the settled lowlands, goblins only where
        // the world has already gone wrong. Walking uphill in the dark changes
        // the cast, which is the entire point of the gradient.
        // A cave is a WARREN. Goblins live in the holes in the ground, so a
        // site inside one admits them regardless of how tame the surrounding
        // country is — which is what turns a cave from scenery into a place
        // you approach carefully, and gives the player a reason to look at a
        // dark mouth in a hillside and decide something.
        const warren = caveAt(x, z);
        const s = warren
          ? Math.max(strangenessAt(x, z, { sunAltitude, weather: this.ctx.weather }), WILDLIFE.warrenStrangeness)
          : strangenessAt(x, z, { sunAltitude, weather: this.ctx.weather });
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

        // ...and a herd in poor country is a smaller herd. Never below one:
        // an empty herd is not scarcity, it is a site that silently did
        // nothing, and the site is already gone by this point.
        const rich = Math.min(1, richnessAt(x, z));
        const n = Math.max(1, Math.round(
          lerp(species.herd.min, species.herd.max, hash2i(ci, cj, 814)) * rich
        ));
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
      if (this.creatures.length >= this.aliveCap()) break;
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
    // Mirrored bodies are also indexed by the server's id. Dropping one without
    // clearing that would leave applySnapshot handing out a corpse that is no
    // longer in the scene, and the animal would never reappear.
    if (c.serverId !== undefined) this.byServerId.delete(c.serverId);
  }

  // ── somebody else's animals ───────────────────────────────────────────────

  /**
   * Stop simulating, and start mirroring — or the other way round.
   *
   * THE BUG THIS EXISTS FOR. A connected client ran its own full wildlife
   * simulation while the server ran another one, and the server's — the only
   * one anybody else could see — was decoded by `client.js`, interpolated, and
   * then dropped on the floor. Measured on one client at one instant:
   *
   *     my local world:   24 creatures, nearest deer   20 m
   *     the server's:     20 creatures, nearest deer 1390 m
   *
   * So every kill was private fiction, other people's arrows flew at nothing,
   * and two players standing shoulder to shoulder hunted different herds. The
   * fix is not to make the client's simulation agree with the server's — two
   * simulations never agree for long — it is to have only one, and draw it.
   *
   * Switching either way empties the list, because a local animal and a remote
   * one are not the same object and pretending otherwise would leave ghosts
   * standing on the hill. Going back to local also forgets which sites have
   * been used, so single-player repopulates instead of waking up empty.
   */
  setRemote(on) {
    if (this.remote === !!on) return;
    this.remote = !!on;
    for (const c of [...this.creatures]) this.remove(c);
    this.byServerId.clear();
    if (!this.remote) {
      this.spawnedSites.clear();
      this.clearedSites.clear();
      this.reconsiderSites();
    }
  }

  /**
   * Draw the server's animals, from one interpolated snapshot.
   *
   * The snapshot carries only what cannot be recomputed: id, species, position,
   * yaw, state and hit points. Everything else an animal needs to LOOK alive —
   * stride phase, head carriage, tail nerves, the way a carcass settles — is
   * derived here, because sending it would triple the packet to say things the
   * client can work out for itself.
   *
   * Speed in particular is MEASURED from how far the body actually travelled,
   * not sent. That keeps the gait honest against a late packet: an animal that
   * did not move does not paddle its legs, and one that was culled and replaced
   * elsewhere is clamped rather than sprinting across the map at 400 m/s.
   */
  applySnapshot(list, dt, ctx = null) {
    if (ctx) this.ctx = ctx;
    if (!this.remote) this.setRemote(true);
    if (!Array.isArray(list)) return;

    const seen = new Set();
    for (const e of list) {
      if (!e || e.i === undefined) continue;
      let c = this.byServerId.get(e.i);
      if (!c) {
        // `spawn` needs an x/z it can put on the ground; the exact height is
        // overwritten from the snapshot one line later, so it does not matter.
        c = this.spawn(e.k, e.p[0], e.p[2]);
        if (!c) continue; // a species this build does not know — skip, quietly
        c.serverId = e.i;
        c.remote = true;
        c.position.set(e.p[0], e.p[1], e.p[2]);
        this.byServerId.set(e.i, c);
      }
      seen.add(e.i);

      const travelled = Math.hypot(e.p[0] - c.position.x, e.p[2] - c.position.z);
      const ceiling = (c.species.speeds?.trot ?? 4) * 3;
      c.speed = dt > 1e-4 ? Math.min(travelled / dt, ceiling) : 0;

      c.position.set(e.p[0], e.p[1], e.p[2]);
      c.yaw = e.y;
      c.object.rotation.y = e.y;
      c.hp = e.h;

      if (e.s !== c.state) {
        // `die()` rather than `setState(DEAD)`: the death pose is a handful of
        // rolled numbers that animate() reads, and without them a carcass lies
        // perfectly flat with its legs out like a toppled toy.
        if (e.s === DEAD) c.die();
        else c.setState(e.s);
      }
      if (c.state === DEAD) c.deathTime += dt;

      // Head down to graze, up for everything else. Damped rather than snapped,
      // or a deer that notices you flicks its head like a switch.
      c.headDown = damp(c.headDown, e.s === GRAZE ? 1 : 0, 3.5, dt);
      // The only thing awareness drives in animate() is how fast the tail goes.
      c.awareness = e.s === GRAZE || e.s === 'wander' ? 0 : 1;

      c.animate(dt);
      // Still give it a voice. Vocalising is driven off the same state the
      // snapshot carries, so it survives the move to a mirror almost intact —
      // and a multiplayer world where the bear charges you in total silence
      // would be a worse game than the one with the private herd.
      if (c.state !== DEAD) this.vocalise(c, dt);
    }

    // Anything the server has stopped mentioning is gone — killed and cleared,
    // culled, or simply too far from anyone to be worth simulating.
    for (const [id, c] of this.byServerId) {
      if (seen.has(id)) continue;
      this.remove(c);
      this.byServerId.delete(id);
    }
  }

  // ── per frame ─────────────────────────────────────────────────────────────

  update(dt, playerPos, stealth, ctx = null) {
    // A mirror has nothing to think about. Guarded here as well as at the call
    // site, because one stray update() would restart local spawning and put the
    // private herd straight back.
    if (this.remote) return;
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

    // ── and around everybody else ──
    // Spawning followed ONE player — the first to join — so on a server every
    // other player walked through a world with no animals in it. Not a subtle
    // effect: six agents ran for three minutes and 88% of every decision they
    // made was "wander", because the scripted brain had nothing to hunt, avoid
    // or greet. It read like incurious minds and it was an empty hillside.
    //
    // A second HUMAN player had exactly the same experience, which is the part
    // that makes this a real bug rather than an agent-harness quirk.
    //
    // Cheap because `spawnedSites` already stops a site being used twice, so
    // extra callers only ever fill in ground the first one has not reached.
    for (const p of this.extraAnchors ?? []) {
      const prev = this.anchors.get(p.key);
      if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) <= 40) continue;
      this.anchors.set(p.key, { x: p.x, z: p.z });
      this.refresh(p.x, p.z);
    }

    this.updatePacks(dt, darkness(this.ctx.sunAltitude ?? 90));

    // ── who is this creature's nearest human? ──
    // Spawning learned to follow everybody (above) and culling did not, which
    // is worse than either bug alone: animals were born around the second
    // player and deleted on the same frame, and because their site stayed in
    // `spawnedSites` the ground never refilled. Printed live, two players 900 m
    // apart: 15 removals in four seconds, all 15 inside the second player's
    // spawn radius, leaving him 931 m from the nearest animal while the first
    // player had a herd at 110 m. That is why multiplayer looked empty — not
    // the population cap, which was 26 with only 18 alive.
    //
    // So every distance below is to the NEAREST player, and the creature senses
    // that player with THEIR stealth: a deer should startle at whoever is
    // actually creeping up on it, not at the first person who joined the
    // server. Single-player is one entry and the loop collapses to what it was.
    const watchers = [{ pos: playerPos, stealth }];
    for (const p of this.extraAnchors ?? []) {
      if (p.pos) watchers.push({ pos: p.pos, stealth: p.stealth ?? stealth });
    }

    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      let d = Infinity;
      let watcher = watchers[0];
      for (const w of watchers) {
        const wd = Math.hypot(c.position.x - w.pos.x, c.position.z - w.pos.z);
        if (wd < d) { d = wd; watcher = w; }
      }
      const nearPos = watcher.pos;
      const nearStealth = watcher.stealth;

      // Cull far creatures. A corpse you have walked away from is gone for
      // good; a live one just leaves the simulation and its site can refill.
      //
      // EXCEPT one you have wounded. A troll has 420 hit points, a 300 m leash
      // and a 400 m cull: a tester put five arrows into one, watched it walk
      // home, and found it whole again — because it left the simulation with
      // its wounds and came back rebuilt from the species table. There was no
      // way to bank damage on it, which made the fight not hard but impossible.
      //
      // So a hurt creature stays loaded. It is the only state in this world
      // that cannot be recomputed from the seed — everything else here is a
      // pure function of where you are standing, and that is exactly why this
      // one had to be an exception rather than a bigger radius.
      const wounded = c.hp < c.maxHp && c.state !== 'dead';
      if (d > WILDLIFE.despawnRadius && !wounded) {
        if (c.state === 'dead' && c.siteKey) this.clearedSites.add(c.siteKey);
        this.remove(c);
        continue;
      }
      // A wound does not last for ever, or the world fills with limping
      // survivors of fights you have forgotten. Out of sight and unhurt for a
      // while, it heals and becomes cullable again like anything else.
      if (wounded && d > WILDLIFE.despawnRadius) {
        c.healingSince = (c.healingSince ?? 0) + dt;
        if (c.healingSince > WILDLIFE.woundForgetSeconds) c.hp = c.maxHp;
      } else {
        c.healingSince = 0;
      }

      // Distance LOD: near = every frame, mid = 4/s, far = 2/s. The accumulator
      // means they still get the full elapsed time, so movement stays correct.
      const period = d < WILDLIFE.lodNear ? 0 : d < WILDLIFE.lodFar ? 0.25 : 0.5;
      if (period === 0) {
        c.update(dt, nearPos, nearStealth, this.ctx);
      } else {
        const owed = (this.accum.get(c.id) ?? 0) + dt;
        if (owed >= period) {
          this.accum.set(c.id, 0);
          c.update(owed, nearPos, nearStealth, this.ctx);
        } else {
          this.accum.set(c.id, owed);
        }
      }

      // Driven off by the light and now a long way gone. Retired quietly rather
      // than left jogging into the distance forever — and its site is marked
      // cleared, so the daylight hillside it left does not immediately refill
      // with something else strange.
      if (c.retreating && d > WILDLIFE.retreatDespawn) {
        if (c.siteKey) this.clearedSites.add(c.siteKey);
        this.remove(c);
        continue;
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

      // Vocalising. Something you can hear coming is far worse than something
      // you cannot — and for a pack it is load-bearing rather than decorative:
      // several voices from different bearings is how you learn you are
      // surrounded, without a single line of UI.
      if (c.state !== 'dead') this.vocalise(c, dt);
    }

    // After everyone has moved, push apart anything that ended up overlapping.
    this.separate();
  }

  /**
   * What this creature is saying, if anything.
   *
   * One place rather than a branch per species, and driven off the same state
   * the brain uses — so a thing that sounds like it is coming for you is in
   * fact coming for you. The intervals are staggered by id so a pack does not
   * bark in unison, which is the difference between a group of animals and a
   * metronome.
   */
  vocalise(c, dt) {
    const audio = this.deps.audio;
    if (!audio) return;

    c.voiceTimer = (c.voiceTimer ?? 0) - dt;
    const stagger = ((c.id * 2654435761) >>> 0) / 4294967296;

    if (c.species.behaviour === 'pack') {
      if (c.hurt) {
        c.hurt = false;
        audio.goblinCall?.(c.position, 1);
        c.voiceTimer = 0.9;
        return;
      }
      if (c.voiceTimer > 0) return;
      if (c.broken) {
        audio.goblinCall?.(c.position, 0.15); // a yelp on the way out
        c.voiceTimer = 2.2 + stagger * 2;
      } else if (c.state === 'charge' || c.state === 'attack') {
        audio.goblinCall?.(c.position, 1);
        c.voiceTimer = 1.1 + stagger * 0.9;
      } else if (c.state === 'alert') {
        // The chatter of a pack that has not made its mind up. Mood follows
        // morale, so a wavering ring genuinely sounds less certain.
        audio.goblinCall?.(c.position, 0.15 + c.morale * 0.45);
        c.voiceTimer = 2.4 + stagger * 2.6;
      }
      return;
    }

    if (c.species.behaviour !== 'aggressive') return;

    const troll = !!c.species.sunlight;
    const voice = troll
      ? (p, i) => audio.trollVoice?.(p, i)
      : (p, i) => audio.growl?.(p, i);

    if (c.hurt) {
      c.hurt = false;
      voice(c.position, 1); // a roar, not a whimper
      c.voiceTimer = troll ? 2.4 : 1.2;
      return;
    }
    if (c.voiceTimer > 0) return;

    if (c.retreating) {
      // Driven off by the light. It complains about it the whole way.
      voice(c.position, 0.2);
      c.voiceTimer = 5 + stagger * 4;
    } else if (c.state === 'charge' || c.state === 'attack') {
      voice(c.position, 1);
      c.voiceTimer = (troll ? 3.2 : 1.9) + stagger;
    } else if (c.state === 'alert') {
      voice(c.position, 0.3);
      c.voiceTimer = (troll ? 7 : 5.5) + stagger * 3;
    }
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

      // How many of THEM are near enough to matter. Counted from the pack's
      // centre rather than per-goblin, so every member reads the same odds —
      // the same reason morale is computed centrally at all.
      const opposition = centre ? this.countOpposition(centre, list[0]) : 1;

      for (const c of list) {
        c.pack = list;
        c.packCentre = centre;
        if (c.state === 'dead') continue;
        updateMorale(c, list, night, dt, opposition);
      }
    }
  }

  /**
   * How many people are standing close enough to a point to count as a group.
   *
   * `deps.opposition` is supplied by whoever owns the players — SimWorld in
   * multiplayer, and nothing at all in single-player, where the answer is
   * always one. Keeping it a dependency rather than a lookup means the
   * creature manager still knows nothing about what a player IS, which is the
   * property that let this file survive the multiplayer refactor untouched.
   */
  countOpposition(pos, near) {
    const range = near?.species?.morale?.cohesionRange ?? 30;
    return this.deps.opposition ? Math.max(1, this.deps.opposition(pos, range)) : 1;
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
export function segmentCylinder(a, b, base, r, h) {
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
