// ── world.js ────────────────────────────────────────────────────────────────
// One authoritative world, holding any number of players.
//
// This is the piece Phase 1 was written for. The bet, from VISION.md:
//
//   > Do the ARCHITECTURE for multiplayer in Phase 1, while there is almost
//   > nothing to migrate. Ship the NETWORK LAYER in Phase 5, when there is a
//   > game worth sharing.
//
// The bet paid. Nothing below had to change how the simulation WORKS — the
// controller, the body, the stealth model, the weapons and the creatures are
// all untouched. What changed is that there is a list of players instead of
// one, and each of them owns the same bundle of state a single player always
// had. Every one of them is driven by an intent, and the simulation has never
// known or cared where an intent came from.
//
// The other half of the bet is why this is cheap on the wire: THE WORLD IS
// GENERATED FROM A SEED ON EVERY MACHINE. Terrain, trees, rocks, caves,
// barrows, place names and creature spawn sites are all pure functions. Clients
// never download any of it. Only things that MOVED or CHANGED cross the wire —
// which is a handful of kilobytes a second for a world of unbounded size.

import * as THREE from 'three';
import { SEED, WATER_LEVEL, LOADOUT, TIME, SOCIAL, SURVIVAL } from '../config.js';
import { placeStrangeness, darkness } from '../world/strangeness.js';
import { describePosition } from '../world/placenames.js';
import { findRegion } from '../world/regions.js';

/**
 * What you keep when you die. The bow, because a player who loses it is
 * stranded rather than set back, and there is no shop to buy another.
 */
const KEEP_ON_DEATH = new Set(['bow']);
import { heightAt } from '../world/noise.js';
import { Scatter } from '../world/scatter.js';
import { ColliderField } from '../world/colliders.js';
import { Weather } from '../world/weather.js';
import { solarPosition } from '../world/sky.js';
import { Wildlife, segmentCylinder } from '../creatures/manager.js';
import { Companion, ATTACK } from '../creatures/companion.js';
import { COMPANION_IDS } from '../creatures/companions.js';

// A person, as something an arrow can hit. The controller has no collider of
// its own — it is a capsule in the movement code and nothing anywhere else —
// so these are stated once, here, where the only thing that needs them lives.
const PLAYER_RADIUS = 0.42;
const PLAYER_HEIGHT = 1.8;
import { Projectiles } from '../world/projectiles.js';
import { Pickups } from '../world/pickups.js';
import { Controller } from '../player/controller.js';
import { StealthProfile } from '../player/stealth.js';
import { Body } from '../player/body.js';
import { Fires } from '../world/fires.js';
import { sampleEnvironment } from '../world/environment.js';
import { insulationOf } from '../items/registry.js';
import { Inventory } from '../items/inventory.js';
import { WeaponHost } from '../weapons/index.js';
import { pickSpawn, buildLandmarks } from '../world/landmarks.js';
import { makeRandom } from '../world/noise.js';
import { createIntent, sanitiseIntent, IDLE_INTENT } from './intents.js';

/**
 * Everything one person is, in the simulation's terms.
 *
 * Exactly the bundle single-player always had — controller, body, inventory,
 * stealth profile, weapons — with an id on it. That equivalence is the whole
 * reason this refactor was small: single-player is now literally "a server
 * with one player in it, running in the same process".
 */
class Player {
  constructor(id, { name = 'someone', spawn, scene, projectiles, inventory, onRespawn } = {}) {
    this.id = id;
    this.name = name;
    this.ctrl = new Controller();
    this.stealth = new StealthProfile();
    this.body = new Body({ onRespawn });
    /** The spot this player wakes on — the first time and every time after. */
    this.home = spawn ? { position: spawn.position.clone(), yaw: spawn.yaw } : null;
    this.inventory = inventory ?? new Inventory(LOADOUT.slots, LOADOUT.equipped);
    this.intent = createIntent();
    this.primaryWasHeld = false;
    this.connected = true;
    this.party = null;
    // The animal that came with you. Null for anyone who brought none — most
    // of the world, including every rival hunter.
    this.companion = null;
    // Rising every time anything about this player changes in a way another
    // client needs to know. Lets the server skip players who did nothing.
    this.dirty = true;

    if (spawn) this.ctrl.teleport(spawn.position, spawn.yaw);

    this.weapons = new WeaponHost({
      camera: makeAimProxy(this.ctrl),
      controller: this.ctrl,
      inventory: this.inventory,
      projectiles,
      ownerId: id, // whose arrows these are — see projectiles.spawn
      rand: makeRandom(`combat:${id}`),
      onDryFire: () => {},
    });
    this.weapons.sync(this.inventory);
  }

  /** The bytes another client actually needs. Kept small and flat on purpose. */
  snapshot() {
    const c = this.ctrl;
    return {
      id: this.id,
      n: this.name,
      p: [round2(c.position.x), round2(c.position.y), round2(c.position.z)],
      y: round3(c.yaw),
      t: round3(c.pitch),
      // Enough for another client to animate you plausibly without shipping a
      // full state machine: are you crouched, how fast are you going, are you
      // drawing, are you dead.
      c: c.crouching ? 1 : 0,
      s: round2(c.horizontalSpeed),
      d: this.weapons.getState()?.drawing ? 1 : 0,
      h: Math.round(this.body.health),
      x: this.body.dead ? 1 : 0,
      // Party tag, so a client can draw its own people differently. Sent as
      // the tag rather than a boolean because whether someone is "yours"
      // depends on who is asking.
      g: this.party ?? null,
    };
  }
}

const round2 = (v) => Math.round(v * 100) / 100;
const round3 = (v) => Math.round(v * 1000) / 1000;

export class SimWorld {
  constructor({ seed = SEED, hours = TIME.startHour, headless = true } = {}) {
    this.seed = seed;
    this.headless = headless;
    this.scene = new THREE.Scene(); // a container; never rendered server-side
    this.tick = 0;

    this.scatterColliders = new ColliderField(14);
    this.scatter = new Scatter(this.scene);
    this.scatter.colliders = this.scatterColliders;

    this.landmarks = buildLandmarks(this.scene);
    this.scatter.setClearings(this.landmarks.clearings);

    this.weather = new Weather();
    this.clock = { hours, running: true };

    this.fires = new Fires(this.scene, {});
    this.players = new Map();
    // Things that HAPPENED, drained by the server each snapshot. Deaths and
    // kills are social facts — "Morag was killed by a goblin, 300 m north of
    // the Black Moss" is what turns a shared world into a shared story.
    this.events = [];
    this.rules = { ...SOCIAL.defaults };

    // Creatures attack whoever is nearest; the manager reports the creature and
    // the world decides who wore it. Single-player had exactly one candidate,
    // which is why this was never a question before.
    this.wildlife = new Wildlife(this.scene, {
      stealth: null,
      onAttack: (creature) => this.resolveAttack(creature),
      // How many people are standing together near a point. A pack reads this
      // as the odds against it, which is what makes a warband a GROUP problem
      // rather than N separate ones. The creature manager never learns what a
      // player is; it just asks.
      opposition: (pos, range) => this.countPlayersNear(pos, range),
    });

    this.pickups = new Pickups(this.scene, { inventory: null, projectiles: null });
    this.projectiles = new Projectiles(this.scene, {
      colliders: [this.scatterColliders],
      wildlife: this.wildlife,
      onLanded: (p) => this.pickups.registerRecoverable(p),
      onRemoved: (p) => this.pickups.forgetProjectile(p),
      // ── killing an animal has to leave an animal behind ──
      //
      // This was `() => {}` — an explicit no-op — and everything downstream of
      // it followed. On a connected client every creature is a MIRROR, and
      // `Creature.applyDamage` returns `{ killed: false }` for a remote body on
      // purpose, because the server owns the kill. So the browser's own loot
      // path (`dropLootFor`, reached from `onCreatureHit`) could never fire in
      // multiplayer, and the server that DID own the kill dropped nothing.
      //
      // The result: you could hunt a deer down, watch it fall, and walk away
      // with no meat, no hide and not even your arrow back. Single player was
      // fine throughout, which is why it survived so long.
      //
      // Rolled HERE rather than on each client, because two players rolling
      // their own carcass would disagree about what came off it. The server
      // rolls once and says what it found.
      onCreatureHit: (creature, result) => {
        if (!result?.killed) return;
        const drops = [];
        for (const d of creature.species.drops ?? []) {
          const n = Math.round(d.min + this._lootRand() * (d.max - d.min));
          if (n > 0) drops.push({ item: d.item, count: n });
        }
        const at = creature.position;
        this.events.push({
          k: 'kill',
          sp: creature.species.id,
          n: creature.species.name,
          at: [round2(at.x), round2(at.y), round2(at.z)],
          d: drops,
        });
      },
    });
    // Its own stream, so the order animals happen to die in is the only thing
    // that moves it — matching how the browser names this stream.
    this._lootRand = makeRandom('drops');
    this.pickups.deps.projectiles = this.projectiles;

    // ── arrows can hit people ─────────────────────────────────────────────
    //
    // They never could. Projectiles were tested against terrain, colliders and
    // wildlife, and nothing else — so a shaft passed through every player, at
    // any range, in any country. It never reached `canHarm`, because nothing
    // noticed it had arrived. Reported as "the arrow goes directly through your
    // character model", and it did.
    this.projectiles.deps.playerHitTest = (from, to, exceptId) => {
      let best = null;
      for (const p of this.players.values()) {
        if (p.id === exceptId || p.body.dead || !p.connected) continue;
        const t = segmentCylinder(from, to, p.ctrl.position, PLAYER_RADIUS, PLAYER_HEIGHT);
        if (t !== null && (!best || t < best.t)) best = { t, player: p };
      }
      return best;
    };

    this.projectiles.deps.onPlayerHit = (target, damage, at, byId) => {
      const by = this.players.get(byId) ?? null;
      // The arrow STOPS either way — that happens in projectiles.js. Whether it
      // hurts is this rule, which already existed and had simply never been
      // reachable by an arrow.
      if (!this.canHarm(by, target)) {
        this.events.push({ k: 'glance', id: target.id, by: byId,
          why: by && by.party && by.party === target.party
            ? 'you are in the same party'
            : 'this ground is too settled to fight on' });
        return;
      }
      target.body.damage(damage, by ? { name: by.name } : null);
      target.dirty = true;
      this.events.push({ k: 'hit', id: target.id, by: byId, dmg: Math.round(damage) });
      if (target.body.dead) this.onPlayerDied(target, by);
    };

    this.spawn = pickSpawn(this.sunHorizontal(new THREE.Vector3()));
    this.scatter.update(this.spawn.position, 0);
  }

  sunHorizontal(out) {
    const s = solarPosition(this.clock.hours);
    const phi = ((90 - s.altitude) * Math.PI) / 180;
    const theta = (s.azimuth * Math.PI) / 180;
    return out.set(Math.sin(phi) * Math.sin(theta), 0, Math.sin(phi) * Math.cos(theta)).normalize();
  }

  // ── players ───────────────────────────────────────────────────────────────

  addPlayer(id, name, { pet = null } = {}) {
    // Everyone opens their eyes on the same shore, spread just enough that two
    // people do not spawn inside each other.
    const spot = this.spawn.position.clone();
    const n = this.players.size;
    if (n > 0) {
      const a = n * 2.399963229728653;
      spot.x += Math.cos(a) * (2.5 + n * 0.8);
      spot.z += Math.sin(a) * (2.5 + n * 0.8);
      spot.y = heightAt(spot.x, spot.z);
    }
    const p = new Player(id, {
      name,
      spawn: { position: spot, yaw: this.spawn.yaw },
      scene: this.scene,
      projectiles: this.projectiles,
      /**
       * YOU WAKE ON THE SHORE, NOT WHERE YOU FELL.
       *
       * The server used to revive a body exactly where it died, because
       * `Vitals.revive` restores the health and nothing here ever moved the
       * feet. Standing in a warband, that is a loop rather than a respawn: a
       * player was watched dying every eight seconds, for ever, and the drop
       * from `onPlayerDied` piled up on the same square metre. It was invisible
       * until now only because the browser was not reading its own health.
       *
       * It also makes the death rule mean what it says. Dropping your gear
       * where you fell is "a problem with a location" — and there is no problem
       * and no location if you stand back up on top of it.
       */
      onRespawn: () => {
        // Looked up rather than closed over: `p` is still being assigned while
        // this function is being written, and a name used before it exists is
        // this project's most expensive recurring mistake.
        const self = this.players.get(id);
        if (!self?.home) return;
        self.ctrl.teleport(self.home.position, self.home.yaw);
        self.dirty = true;
      },
    });
    this.players.set(id, p);
    if (pet) this.giveCompanion(id, pet);
    return p;
  }

  /**
   * The animal that walked in with somebody.
   *
   * WHY THE SERVER KEEPS ITS OWN COPY. A companion used to be a purely local
   * object: `Companion` appeared nowhere in this file, so you could train an
   * otter for an hour, walk it onto a shared server, and be the only person
   * alive who could see it. It was not in the world — it was in your browser.
   * Now it is a thing standing on the hillside that everyone's snapshot
   * mentions, which is the difference between a pet and a picture of one.
   *
   * IT IS A MIRROR, AND THAT IS A FLAG. `mirrored` tells the brain to heel
   * regardless of trust: two copies of an untamed animal wandering on two
   * machines diverge without limit, so this copy's job is to stand where the
   * animal stands, not to have its own opinion about whether it likes anybody.
   *
   * The relationship it arrives with is a PLACEHOLDER, not a claim. Tame enough
   * to look right, fed and played enough that a session's decay does not eat it
   * — and overwritten wholesale by `setCompanionState` the first time the owner
   * says what the animal is actually like. An agent (`PET=hippo`) never says,
   * and lives on these numbers for ever, which is what they are for.
   */
  giveCompanion(id, speciesId) {
    const p = this.players.get(id);
    if (!p) return null;
    const at = p.ctrl.position.clone();
    at.x += 1.2;
    at.y = heightAt(at.x, at.z);
    const c = new Companion(speciesId, at, makeRandom(`pet:${id}:${speciesId}`));
    c.mirrored = true;
    c.trust = Math.max(c.care_.tameAt + 0.3, 0.6);
    c.fed = c.played = 0.85;
    p.companion = c;
    p.dirty = true;
    return c;
  }

  /**
   * The owner says what their animal is actually like.
   *
   * Before this, the copy above was permanently a stranger's idea of your pet:
   * trust 0.6, no name, no tricks, and `guard` off with nothing anywhere able
   * to turn it on — so `defend` and the bite it leads to were dead code on
   * every server that has ever run. This is the switch.
   *
   * `st.a` is a trick being performed right now. It is applied AFTER the
   * relationship, because the relationship is what says whether the animal
   * knows it — `perform` refuses anything not in the freshly-applied `learned`
   * set, so claiming to do a trick does not teach it one.
   */
  setCompanionState(id, st) {
    let c = this.players.get(id)?.companion;
    if (!c || !st) return false;
    // Changed their mind about which animal. The menu allows it after you have
    // already joined, and the copy has to be rebuilt rather than relabelled —
    // the body, the speeds and the trick table all belong to the species.
    // Checked against the real list rather than trusted: `getCompanion` falls
    // back to the otter for anything it does not know, so an unknown id would
    // build an otter, still not match, and rebuild the animal on every packet
    // for ever.
    if (st.k && st.k !== c.species.id && COMPANION_IDS.includes(st.k)) {
      c = this.giveCompanion(id, st.k) ?? c;
    }
    c.applyRelationship(st);
    if (st.a) c.perform(st.a);
    this.players.get(id).dirty = true;
    return true;
  }

  removePlayer(id) {
    // The animal goes with its person. It lives on the Player, so this is the
    // whole of it — but stated out loud, because a companion left ticking for
    // an owner who is no longer in the Map would follow a corpse for ever.
    this.players.delete(id);
  }

  /** Accept an intent from outside. Sanitised at the boundary, always. */
  setIntent(id, raw) {
    const p = this.players.get(id);
    if (!p) return false;
    // `sanitiseIntent` was written in Phase 1 with the comment "once intents
    // arrive over a socket this is the boundary that stops a malformed or
    // hostile packet doing anything interesting". This is that moment.
    Object.assign(p.intent, raw);
    sanitiseIntent(p.intent);
    return true;
  }

  /**
   * Somebody says they have lit a fire. Put it in the world.
   *
   * The other half of `cleanFireClaim`: that checked the packet had two finite
   * numbers in it, this checks the claim against the world. Two rules, and both
   * are about the ground rather than about the player:
   *
   * - it has to be somewhere you could have reached. `firePlaceDistance` is how
   *   far in front of you the browser lays the pit, so anything much beyond it
   *   did not come from a person standing where you are standing. The margin is
   *   generous on purpose — you are moving, the packet is a frame or two old,
   *   and a fire refused for being 3.4 m away when the rule says 3 would be an
   *   invisible, intermittent failure, which is worse than a permissive one.
   * - `canPlaceAt` has to agree. It is the same function, on the same seeded
   *   terrain, that the browser already ran before sending — so it agrees
   *   almost always, and the exception that matters is "too close to another
   *   fire", where the server can see somebody else's and the client cannot.
   *
   * Returns the same `{ ok, why }` shape as `Fires.light`, so a caller that
   * wants to answer the client can, and the server — which does not, yet —
   * simply drops it. The client keeps drawing its own fire either way; what
   * this fixes is the SERVER's copy of you being cold beside it.
   */
  lightFireFor(id, x, z, fuel = undefined) {
    const p = this.players.get(id);
    if (!p) return { ok: false, why: 'no such player' };
    const d = Math.hypot(p.ctrl.position.x - x, p.ctrl.position.z - z);
    if (d > SURVIVAL.firePlaceDistance + 3) return { ok: false, why: 'too far from you to be yours' };

    // ── a claim that lands ON a fire is FUEL, not a new fire ──
    //
    // The same packet does both, because from the player's end it is the same
    // sentence: "I have put a branch on the ground here and set light to it."
    // Placement already refuses anything within 3 m of another fire, so a claim
    // inside that radius could never have been a new fire anyway — and once the
    // server owns how long a fire burns, feeding one locally is a second
    // opinion that the next snapshot silently overwrites. Without this branch,
    // pressing E to feed a dying fire on a server would cost you the branch and
    // do nothing at all.
    for (const f of this.fires.active) {
      if (Math.hypot(f.position.x - x, f.position.z - z) < 3) {
        const before = f.fuel;
        const now = fuel === undefined ? this.fires.addFuel(f) : this.fires.addFuel(f, fuel);
        return { ok: true, fed: true, fuel: now, why: `fed — ${Math.round(before)} → ${Math.round(now)}` };
      }
    }

    return fuel === undefined ? this.fires.light(x, z) : this.fires.light(x, z, fuel);
  }

  /** Nearest living player to a point — how a creature picks a target. */
  nearestPlayer(pos, maxRange = Infinity) {
    let best = null;
    let bestD = maxRange;
    for (const p of this.players.values()) {
      if (p.body.dead || !p.connected) continue;
      const d = Math.hypot(p.ctrl.position.x - pos.x, p.ctrl.position.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  // ── what a mind may ask ───────────────────────────────────────────────────

  /**
   * Everything `self` could POSSIBLY perceive — the candidate list, not the
   * answer. `perception.perceive` then decides what actually got through the
   * eyes, ears and nose.
   *
   * Two steps rather than one because the honesty rule needs a chokepoint: if
   * anything ever wants to know what a mind knows, it goes through here, and
   * here is where "no, it cannot see that" lives.
   */
  perceivableBy(self) {
    const out = [];
    for (const p of this.players.values()) {
      if (p.ctrl.position === self.position) continue; // itself
      if (!p.connected || p.body.dead) continue;
      out.push({
        position: p.ctrl.position,
        label: p.isMind ? 'a hunter' : 'someone',
        noise: p.stealth.noise,
        visibility: p.stealth.visibility,
        healthFraction: p.body.health / 100,
        doing: p.ctrl.crouching ? 'crouched' : p.ctrl.horizontalSpeed > 5 ? 'running' : 'walking',
      });
    }
    for (const c of this.wildlife.creatures) {
      if (c.state === 'dead') continue;
      out.push({
        position: c.position,
        label: `a ${c.species.id}`,
        // A creature's own noise is not modelled, so movement stands in for it
        // — which is honest enough: a bolting deer IS the loud one.
        noise: Math.min(1, c.speed / 8),
        visibility: 1,
        healthFraction: c.hp / c.maxHp,
        doing: c.state,
      });
    }
    return out;
  }

  /** The nearest place a body could shelter, if it can find one nearby. */
  shelterNear(x, z, radius = 220) {
    const gorge = findRegion('gorge', x, z, { radius, step: 26, minStrength: 0.55 });
    const wood = findRegion('wood', x, z, { radius: radius * 0.6, step: 24, minStrength: 0.7 });
    const best = gorge && (!wood || gorge.distance < wood.distance * 1.4) ? gorge : wood;
    return best ? { x: best.x, z: best.z } : null;
  }

  /** How strongly a scent carries from one point to another, for perception. */
  scentAt(fromX, fromZ, toX, toZ) {
    const anchor = this.playersInOrder()[0];
    return anchor ? anchor.stealth.scentAt(fromX, fromZ, toX, toZ) : 0;
  }

  /** How many living people are within `range` of a point. */
  countPlayersNear(pos, range) {
    let n = 0;
    for (const p of this.players.values()) {
      if (p.body.dead || !p.connected) continue;
      if (Math.hypot(p.ctrl.position.x - pos.x, p.ctrl.position.z - pos.z) <= range) n++;
    }
    return n;
  }

  /**
   * A creature swings. Who wears it?
   *
   * Nearest, but only among the people actually in reach — and a creature that
   * has been hitting the same person keeps at it for a moment rather than
   * re-choosing every swing. Without that stickiness a pack surrounded by four
   * players spreads its damage perfectly evenly, which sounds fair and plays
   * as mush: nobody is ever in trouble, so nobody is ever worth saving.
   */
  resolveAttack(creature) {
    const reach = (creature.species.aggression?.attackRange ?? 3) + 1;
    let victim = null;

    const held = creature.targetId != null ? this.players.get(creature.targetId) : null;
    if (held && !held.body.dead && held.connected) {
      const d = Math.hypot(
        held.ctrl.position.x - creature.position.x,
        held.ctrl.position.z - creature.position.z
      );
      if (d <= reach) victim = held;
    }
    if (!victim) victim = this.nearestPlayer(creature.position, reach);
    if (!victim) return;

    creature.targetId = victim.id;
    // Whatever just hit you now has your animal's attention — if you ever
    // taught it to guard. `defend` refuses on its own when the order is off or
    // the trust is not there, so this is one line and no conditions.
    victim.companion?.defend(creature);
    victim.body.damage(creature.species.aggression?.damage ?? 0, creature);
    victim.dirty = true;
    if (victim.body.dead) this.onPlayerDied(victim, creature);
  }

  // ── company ───────────────────────────────────────────────────────────────

  /**
   * Can `a` hurt `b` right now?
   *
   * Two rules, and the second is the interesting one.
   *
   *   1. Party members never hurt each other. Obvious, and it makes a party a
   *      real commitment rather than a label.
   *   2. Otherwise it depends on WHERE YOU ARE STANDING. Friendly fire between
   *      strangers is off in the settled country and on out in the strange
   *      country — "danger from other people belongs where danger already
   *      lives", which is the vision's own phrasing and reuses a gradient the
   *      world already has rather than inventing a flag-coloured zone map.
   *
   * The consequence is that the same walk that gets more dangerous because of
   * what lives out there also gets more dangerous because of who does. You do
   * not need a PvP toggle; you need to know how far from the lake you are, and
   * the place names already tell you that.
   */
  canHarm(a, b) {
    if (!a || !b || a === b) return false;
    if (a.party && a.party === b.party) return false;
    if (!this.rules.pvp) return false;
    if (this.rules.pvpEverywhere) return true;
    const s = placeStrangeness(b.ctrl.position.x, b.ctrl.position.z);
    return s >= this.rules.pvpAboveStrangeness;
  }

  /** Put two players in a party together. Symmetric, and it merges groups. */
  setParty(idA, idB) {
    const a = this.players.get(idA);
    const b = this.players.get(idB);
    if (!a || !b) return false;
    const tag = a.party ?? b.party ?? `party:${idA}`;
    // Everyone already with either of them comes too, so joining a friend
    // joins their whole group rather than splitting it in half.
    for (const p of this.players.values()) {
      if (p === a || p === b || (p.party && (p.party === a.party || p.party === b.party))) {
        p.party = tag;
        p.dirty = true;
      }
    }
    return tag;
  }

  leaveParty(id) {
    const p = this.players.get(id);
    if (!p) return false;
    p.party = null;
    p.dirty = true;
    return true;
  }

  /**
   * What dying costs, socially.
   *
   * You drop what you were carrying where you fell. Not a punishment — a
   * PROBLEM WITH A LOCATION, which is the only kind of loss that makes a group
   * do anything interesting. Someone has to go and get it, and the place it is
   * lying is exactly the place that just killed you. A party that abandons the
   * spot loses the gear; a party that goes back has to fight for it.
   *
   * Nothing is destroyed, so this costs a solo player time rather than
   * progress, and the world's total wealth is unchanged.
   */
  onPlayerDied(player, killer) {
    const dropped = [];
    for (let i = 0; i < player.inventory.slots.length; i++) {
      const slot = player.inventory.slots[i];
      if (!slot?.item || !slot.count) continue;
      if (KEEP_ON_DEATH.has(slot.item)) continue;
      dropped.push({ item: slot.item, count: slot.count });
    }
    for (const d of dropped) player.inventory.remove(d.item, d.count);

    const at = player.ctrl.position.clone();
    for (const d of dropped) this.pickups.restoreDrop?.(d.item, d.count, [at.x, at.y + 0.3, at.z]);

    this.events.push({
      k: 'death',
      id: player.id,
      n: player.name,
      by: killer?.species?.name ?? 'the cold',
      at: [round2(at.x), round2(at.y), round2(at.z)],
      lost: dropped.length,
      where: describePosition(at.x, at.z).phrase,
    });
    return dropped;
  }

  // ── the tick ──────────────────────────────────────────────────────────────

  step(dt) {
    this.tick++;

    if (this.clock.running) {
      this.clock.hours = (this.clock.hours + (dt / 60 / TIME.dayMinutes) * 24) % 24;
    }
    this.weather.update(dt);
    this.fires.update(dt, this.weather);

    const sunAltitude = solarPosition(this.clock.hours).altitude;
    const worldCtx = { hours: this.clock.hours, sunAltitude, weather: this.weather };

    // ── every player, in id order ──
    // Iteration order is the Map's insertion order, which is join order, which
    // is the same on the server and in any replay. Determinism is not a nicety
    // here: two machines that disagree about the order players are resolved in
    // will diverge within seconds.
    for (const p of this.playersInOrder()) {
      this.stepPlayer(p, dt, worldCtx);
      if (p.companion) this.stepCompanion(p, dt, worldCtx);
    }

    // ── the shared world ──
    // Creatures sense the NEAREST player, and the stealth profile they read is
    // that player's. A crouching player and a sprinting one standing together
    // should not make each other invisible.
    const anchor = this.playersInOrder()[0];
    const anchorPos = anchor ? anchor.ctrl.position : this.spawn.position;
    this.wildlife.deps.stealth = anchor ? anchor.stealth : null;
    this.scatter.update(anchorPos, 0);
    this.updateWildlife(dt, worldCtx);

    this.projectiles.update(dt);
    this.pickups.update(dt, anchorPos);
  }

  playersInOrder() {
    return [...this.players.values()];
  }

  stepPlayer(p, dt, worldCtx) {
    const intent = p.intent;

    // Edge-detected FROM THE INTENT rather than from an input event, so this
    // path is byte-identical in the browser, in Node, and over a socket.
    if (intent.primary !== p.primaryWasHeld) {
      p.primaryWasHeld = intent.primary;
      if (intent.primary) p.weapons.beginPrimary();
      else p.weapons.endPrimary();
    }
    if (intent.selectSlot >= 0) p.inventory.select(intent.selectSlot);
    if (intent.interact) {
      this.pickups.deps.inventory = p.inventory;
      this.pickups.collect();
    }

    const env = sampleEnvironment(p.ctrl.position, {
      ...worldCtx,
      fires: this.fires,
    });
    p.body.update(dt, {
      ctrl: p.ctrl,
      env,
      insulationC: insulationOf(p.inventory),
      drawing: !!p.weapons.getState()?.drawing,
      enabled: true,
    });

    p.weapons.update(dt);
    p.ctrl.speedScale = p.body.dead ? 0 : p.weapons.moveScale * p.body.speedScale;
    if (p.body.sprintBlocked) intent.sprint = false;

    const before = p.ctrl.position.x + p.ctrl.position.z + p.ctrl.yaw;
    p.ctrl.update(dt, p.body.dead ? IDLE_INTENT : intent);
    p.stealth.setWeather(this.weather);
    p.stealth.update(dt, p.ctrl);
    // THE BODY IS TICKED ONCE, ABOVE. There was a second `p.body.update(dt)`
    // here, with no context, and a bare `Body.update` still runs the whole of
    // `Vitals.update` inside it — so on the server every regen tick counted
    // twice and every death was half as long as it says on the tin. Measured
    // against a warband: a player who died at tick 2046 stood up at 2142, 1.6
    // seconds, where `VITALS.respawnDelay` is 3.4. Single player has always
    // called it once; this is the server agreeing with it.

    const after = p.ctrl.position.x + p.ctrl.position.z + p.ctrl.yaw;
    if (after !== before) p.dirty = true;
  }

  /**
   * One person's animal, one tick.
   *
   * The weather is sampled at the ANIMAL's feet rather than its owner's — it is
   * standing somewhere else, and being cold is the thing that sends it home. No
   * structures on a server yet, so shelter is whatever the ground gives.
   */
  stepCompanion(p, dt, worldCtx) {
    const c = p.companion;
    const env = sampleEnvironment(c.position, { ...worldCtx, fires: this.fires });
    const before = c.position.x + c.position.z;
    c.update(dt, { position: p.ctrl.position }, this, {
      airC: env.airC,
      nearFire: !!env.nearFire,
      shelter: 0,
      night: darkness(worldCtx.sunAltitude),
      dayMinutes: TIME.dayMinutes,
    });

    // ── it bites for you ──
    // Only under a standing `guard` order, which is off until its owner turns
    // it on — so this is dead quiet for an animal nobody has trained, and a
    // real participant for one somebody has.
    if (c.pendingBite) {
      const victim = c.pendingBite;
      c.pendingBite = null;
      const zone = victim.species?.hitZones?.find((z) => z.name === 'body') ?? null;
      victim.applyDamage?.(c.care_.biteDamage, zone, c.position);
    }
    if (c.position.x + c.position.z !== before) p.dirty = true;
  }

  updateWildlife(dt, worldCtx) {
    const everyone = this.playersInOrder();
    // Populate the world around ALL of them, not just the first to join. See
    // the note in creatures/manager.js — this is why the second player onto a
    // server used to find an empty hillside.
    // `pos` and `stealth` ride along so the manager can cull and sense against
    // the nearest player rather than this one. Without them the world spawned
    // animals around everybody and then deleted every animal that was not near
    // player #1.
    this.wildlife.extraAnchors = everyone.slice(1).map((p) => ({
      key: p.id, x: p.ctrl.position.x, z: p.ctrl.position.z,
      pos: p.ctrl.position, stealth: p.stealth,
    }));
    const anchor = everyone[0];
    if (!anchor) return;
    this.wildlife.update(dt, anchor.ctrl.position, anchor.stealth, worldCtx);
  }

  // ── snapshots ─────────────────────────────────────────────────────────────

  /**
   * What a client needs to draw this instant.
   *
   * Everything here either MOVED or CHANGED. Terrain, trees, rocks, caves,
   * barrows and place names are all absent, because the client generates them
   * from the seed — which is the entire reason a world of unbounded size fits
   * in a few kilobytes a second.
   */
  snapshot(forId = null) {
    const players = [];
    let me = null;
    for (const p of this.playersInOrder()) {
      if (p.id === forId) {
        // ── where YOU are ──
        // "You already know where you are" is true of a browser, which runs the
        // whole physics locally and stays in step. It is not true of an agent,
        // which runs no physics at all — it integrates its own velocity and
        // never hears about anything the server did to it. Collisions, slopes,
        // wading, hunger slowdown, the speed scale a drawn bow applies: all
        // invisible, and the error only ever accumulates.
        //
        // Measured: a puppet driven for under a minute believed it was 8 km
        // from where it stood. Everything downstream is computed from that
        // position, so its brief said "you are aware of nothing but the
        // weather" while it stood among four players and twenty-one creatures.
        // An agent that does not know where it is perceives nothing and can
        // decide nothing, and that is most of why they have looked so passive.
        //
        // Six numbers a second. Cheaper than the bug.
        // Yaw and pitch belong here for exactly the same reason as position.
        // Leaving them out left a client integrating its own facing against a
        // server that integrates it differently, and the two drift: a body
        // told to walk toward somebody 240 m west walked 80 m east instead.
        // Position without heading is half a fix.
        me = { p: [round2(p.ctrl.position.x), round2(p.ctrl.position.y), round2(p.ctrl.position.z)],
               y: round3(p.ctrl.yaw), t: round3(p.ctrl.pitch),
               h: Math.round(p.body.health), f: Math.round(p.body.hunger), c: round2(p.body.coreC) };
        continue;
      }
      players.push(p.snapshot());
    }

    // ── everybody's animals ──
    //
    // Sent for EVERY player including the one asking, which is the opposite of
    // how `pl` works, and deliberate. Your own body is drawn from your own
    // simulation because you are running it; your own companion is too. But a
    // client that is watching rather than playing — the smoketest, a spectator,
    // an agent — has no local pet at all, so leaving yours out would mean the
    // only animal missing from the snapshot is the one you brought. The owner
    // id is on every entry; a browser skips its own.
    const companions = [];
    for (const p of this.playersInOrder()) {
      const c = p.companion;
      if (!c) continue;
      companions.push({
        o: p.id,
        k: c.species.id,
        n: c.name,
        p: [round2(c.position.x), round2(c.position.y), round2(c.position.z)],
        y: round3(c.yaw),
        s: c.state,
        q: c.pose ?? null,
        v: round2(c.speed),
        // One word for the whole relationship — 'wary' through 'devoted'. It is
        // derived from trust, food, play and warmth, so it is also the cheapest
        // proof from outside that an owner's sync actually landed.
        m: c.mood,
        // WHAT IT IS FIGHTING, by creature id, and only while it is fighting.
        //
        // The state `s` already said 'attack', and for everybody else that is
        // enough — a mirrored body lunging is all a spectator needs. It is not
        // enough for the OWNER, who is drawing the real animal from their own
        // simulation and needs something to point it AT. One integer for a few
        // seconds of a fight, against the alternative of the owner being the
        // only person in the world who cannot see their animal defend them.
        ...(c.state === ATTACK && c.target ? { g: c.target.id } : {}),
      });
    }

    const creatures = [];
    for (const c of this.wildlife.creatures) {
      creatures.push({
        i: c.id,
        k: c.species.id,
        p: [round2(c.position.x), round2(c.position.y), round2(c.position.z)],
        y: round3(c.yaw),
        s: c.state,
        h: Math.round(c.hp),
      });
    }

    // ── what is burning ──
    //
    // NOBODY COULD SEE ANYBODY ELSE'S FIRE. The fire reached the server one fix
    // ago, so the server's copy of you is finally warm beside your own — and
    // there it stopped, because nothing carried it back down. A second player
    // walking into your camp saw bare ground, stood in the cold beside a fire
    // that was heating somebody else, and could not cook on it or feed it.
    //
    // Position and fuel, and no height: the client has the same terrain from the
    // same seed and computes `heightAt` itself, so sending y would be sending a
    // number the other end already knows. Three numbers per fire, and there are
    // never many — this is the cheapest entry in the whole snapshot.
    const fires = [];
    for (const f of this.fires.active) {
      fires.push({ p: [round2(f.position.x), round2(f.position.z)], f: Math.round(f.fuel) });
    }

    const projectiles = [];
    for (const pr of this.projectiles.items) {
      if (pr.landed) continue; // landed arrows are pickups, not flight
      projectiles.push({
        p: [round2(pr.pos.x), round2(pr.pos.y), round2(pr.pos.z)],
        v: [round2(pr.vel.x), round2(pr.vel.y), round2(pr.vel.z)],
      });
    }

    return {
      t: this.tick,
      c: round3(this.clock.hours),
      w: {
        s: this.weather.stateName,
        n: this.weather.nextName,
        b: round3(this.weather.blend),
        a: round3(this.weather.windAngle),
      },
      pl: players,
      // You. Position, health, food and core temperature — the four things you
      // cannot work out for yourself without running the simulation. Three of
      // the four are now read by the browser too: the position, the health and
      // (see `Body.applyRemoteCore`) the warmth. Only `f` is still ignored, and
      // only because nothing can yet feed the body this is taken from.
      me,
      cr: creatures,
      co: companions,
      // What is burning, for everybody. See the note where it is built.
      fi: fires,
      pr: projectiles,
      // Drained by the caller, not here — snapshot() is called once per client
      // and clearing inside it would deliver each event to exactly one person.
      ev: this.events,
    };
  }

  /** Called once per broadcast, after every client has had the snapshot. */
  clearEvents() {
    if (this.events.length) this.events = [];
  }

  /**
   * Everything a client needs exactly once, on joining.
   *
   * THE SPOT THIS PLAYER WAS ACTUALLY PUT ON, not the shore everybody shares.
   * `addPlayer` fans people out around `this.spawn` so that two bodies do not
   * open their eyes inside each other — so the base spawn is the truth for
   * exactly one player, the first, and is 3.3 m out for the second and further
   * for the fourth. Everyone downstream starts from this number: a browser
   * teleports its body to it, an agent begins its dead reckoning from it. So
   * sending the shared shore made a PERMANENT offset between where you are and
   * where the server says you are — measured at 3.30 m for player #2, and it
   * never closed, because nothing afterwards ever revisits it.
   */
  hello(id) {
    const joiner = this.players.get(id);
    const at = joiner ? joiner.ctrl.position : this.spawn.position;
    const yaw = joiner ? joiner.ctrl.yaw : this.spawn.yaw;
    return {
      seed: this.seed,
      id,
      tick: this.tick,
      spawn: { p: [at.x, at.y, at.z], y: yaw },
      players: this.playersInOrder().map((p) => ({ id: p.id, n: p.name })),
    };
  }

  get stats() {
    return {
      tick: this.tick,
      players: this.players.size,
      companions: this.playersInOrder().filter((p) => p.companion).length,
      creatures: this.wildlife.creatures.length,
      // Fires, because until `lightFireFor` this was always zero and nobody
      // could have noticed. It is the cheapest proof from outside that a
      // client's fire reached the machine that keeps its body warm.
      fires: this.fires.active.length,
      projectiles: this.projectiles.items.length,
      hours: round2(this.clock.hours),
    };
  }
}

/**
 * The weapon system asks a camera for its aim. There is no camera on a server,
 * so this supplies the same interface from the body's own yaw and pitch — which
 * is what the camera was reporting anyway.
 *
 * THE EYE, NOT THE FEET. `ctrl.position` is the ground under you; the browser's
 * real camera sits `ctrl.eyeHeight` above it, and a bow loosed from the ankles
 * puts its arrow into the hill 0.55 m in front of the archer on the very first
 * frame. Measured, in exactly those terms: archer standing on ground at 46.85,
 * arrow spawned at 46.85, landed at 45.90 — buried, `landed: true`, dropped
 * from the snapshot's `pr`, no hit, no glance, no event of any kind.
 *
 * That one missing 1.72 m is the whole of "a browser client's shot never
 * reaches the server". It reached the server perfectly. The server shot the
 * ground. It applied to every remote player, every rival hunter and every
 * agent — everyone whose weapons are driven by this proxy instead of a camera —
 * which is also the likeliest reason a fleet of agents has never brought home
 * a single hide.
 */
function makeAimProxy(ctrl) {
  const eye = new THREE.Vector3();
  return {
    // A live view rather than a copy: weapons read this at the moment they
    // fire, and the body has usually moved since the proxy was built.
    get position() {
      return eye.copy(ctrl.position).setY(ctrl.position.y + ctrl.eyeHeight);
    },
    up: new THREE.Vector3(0, 1, 0),
    getWorldDirection(out) {
      const cp = Math.cos(ctrl.pitch);
      return out.set(-Math.sin(ctrl.yaw) * cp, Math.sin(ctrl.pitch), -Math.cos(ctrl.yaw) * cp);
    },
  };
}
