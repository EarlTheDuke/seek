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
import { SEED, WATER_LEVEL, LOADOUT, TIME, SOCIAL, SURVIVAL, PLAYER, PICKUP, WILDLIFE, STRUCTURES, AXE } from '../config.js';
import { placeStrangeness, darkness } from '../world/strangeness.js';
import { describePosition } from '../world/placenames.js';
import { findRegion } from '../world/regions.js';

/**
 * What you keep when you die. The bow, because a player who loses it is
 * stranded rather than set back, and there is no shop to buy another.
 */
const KEEP_ON_DEATH = new Set(['bow']);
import { heightAt } from '../world/noise.js';
import { treesNear, rocksNear, setClearings as setTimberClearings } from '../world/timber.js';
import { scarcity } from '../world/scarcity.js';
import { ColliderField } from '../world/colliders.js';
import { Weather } from '../world/weather.js';
import { solarPosition } from '../world/sky.js';
import { Wildlife, segmentCylinder } from '../creatures/manager.js';
import { Companion, ATTACK } from '../creatures/companion.js';
import { COMPANION_IDS } from '../creatures/companions.js';

// A person, as something an arrow can hit — and now, behind `solid`, as
// something a body cannot walk through. The old note here said the controller
// was "a capsule in the movement code and nothing anywhere else"; it was a
// capsule NOWHERE, and these two numbers appeared in no other file in the repo.
// They live in PLAYER now so the arrow and the shoulder agree about one body.
const PLAYER_RADIUS = PLAYER.bodyRadius;
const PLAYER_HEIGHT = PLAYER.bodyHeight;
import { Projectiles } from '../world/projectiles.js';
import { Pickups } from '../world/pickups.js';
import { Controller } from '../player/controller.js';
import { StealthProfile } from '../player/stealth.js';
import { Body } from '../player/body.js';
import { Fires } from '../world/fires.js';
import { Harvest } from '../world/structures.js';
import { sampleEnvironment } from '../world/environment.js';
import { insulationOf, EDIBLE, getItem, resolveItemId, resolveItemCount } from '../items/registry.js';
import { Inventory } from '../items/inventory.js';
// Cooking, knapping, stitching and fletching, as data and two pure functions.
// Shared with the browser's interaction prompt rather than copied — the whole
// reason `bestAvailable` is a function and not a switch in main.js.
import { RECIPES, craft } from '../items/recipes.js';
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
// A carcass is not thrown anywhere; it falls where the animal stood.
const ZERO = new THREE.Vector3(0, 0, 0);

export class SimWorld {
  constructor({ seed = SEED, hours = TIME.startHour, headless = true, solid = false } = {}) {
    this.seed = seed;
    this.headless = headless;
    // ── SOLID: bodies stop being points ──
    //
    // Default OFF, and off is the game byte for byte: `Controller.solids` stays
    // null, so the horizontal step is the same two lines it has always been.
    // On, a body cannot walk through a trunk, a boulder, or another person.
    //
    // What the SERVER has to be solid against is `scatterColliders`, which
    // holds trunks and rocks. It has never held a structure — `Structures` is
    // not instantiated on this side at all — so a palisade stops arrows in a
    // browser and stops nobody here. Stated rather than discovered later.
    this.solid = !!solid;
    this.scene = new THREE.Scene(); // a container; never rendered server-side
    this.tick = 0;

    // ── everything solid that is not the ground ──
    //
    // Built here from the seed rather than harvested off a `Scatter`'s instance
    // matrices, and that is a fix, not a tidy-up. `Scatter` places one patch,
    // centred on ONE position, and this class called it with the first player in
    // the map — so the trees an arrow could hit existed only around whoever
    // joined first. Everybody else was shooting through a world made of
    // hillside: no trunk stopped their arrows, and none of the trees their own
    // browser was drawing were in the server's copy at all. Invisible in single
    // player, and precisely wrong for a fleet of agents spread over a valley.
    // `refreshTimber` covers every player, and the server no longer allocates
    // instanced grass it will never draw.
    this.scatterColliders = new ColliderField(14);
    this._timberAnchors = new Map(); // player id -> where their patch was built

    this.landmarks = buildLandmarks(this.scene);
    setTimberClearings(this.landmarks.clearings);

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
    // ── THE TREES AND THE ROCK, ON THE SERVER ──
    //
    // They were browser-only, and that was survivable for exactly as long as
    // the browser also owned the pack. It stopped being survivable the moment
    // the server did: `inventory.applyRemote` overwrites the client's pack five
    // times a second, so wood cut locally appeared for a frame and vanished.
    // Reported within the hour — "I am cutting branches but they are not going
    // into my inventory" — and it was mine.
    //
    // The server already knows where every trunk is: `scatterColliders` is
    // built from the seed for exactly this reason. `Harvest` is pure logic over
    // that field, so it runs here unchanged.
    this.harvest = new Harvest();
    // ── AND A CLOCK THAT DOES NOT WRAP ──
    //
    // `clock.hours` is `% 24`, and a regrow time of `hours + 30` computed from
    // a wrapping clock is a tree that comes back yesterday. This project has
    // been caught by that clock three times; this is the fourth place that
    // needs the monotonic one.
    this.totalHours = hours;
    this.projectiles = new Projectiles(this.scene, {
      colliders: [this.scatterColliders],
      wildlife: this.wildlife,
      onLanded: (p) => this.pickups.registerRecoverable(p),
      onRemoved: (p) => this.pickups.forgetProjectile(p),
      // ── tell the archer their shot ended in the dirt ──
      //
      // A browser can at least SEE the shaft standing in the hillside. An agent
      // has no eyes at all: every miss was indistinguishable from every other
      // miss, and from not having fired. A mind that cannot tell "short" from
      // "wide" from "there was a hill there" cannot learn to hunt, and the
      // whole point of the seam is that a mind gets senses.
      //
      // Only to the person who loosed it. Everyone else hearing about every
      // arrow that ever hit a tree would be noise.
      onMiss: (p, surface, flown) => {
        if (p.ownerId == null) return;
        this.events.push({
          k: 'miss',
          by: p.ownerId,
          hit: surface,
          d: Math.round(flown),
          at: [round2(p.pos.x), round2(p.pos.y), round2(p.pos.z)],
        });
      },
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
      onCreatureHit: (creature, result, _at, byId = null) => {
        // ── an arrow that DID land is news too ──
        //
        // Only a miss was ever announced, so hitting an animal and killing it
        // outright were the only two things an archer could hear about. A shaft
        // that went home and left the deer running produced silence — the same
        // silence as a shot that never happened — and a mind reading its own
        // memory afterwards had no way to know it had ever connected. It is
        // also the only signal that says "keep after THAT one".
        if (!result?.killed && result?.damage > 0 && byId != null) {
          this.events.push({
            k: 'wound',
            by: byId,
            // ── WHICH animal, and the comment above has wanted this all along ──
            //
            // "It is also the only signal that says 'keep after THAT one'" —
            // except that it named a SPECIES and never an individual, so there
            // was no THAT one to keep after. A body could hear that it had hurt
            // "a deer" while eighteen to twenty-six of them stood on the same
            // hillside, and `resolve` went straight back to picking the NEAREST
            // one. Measured over four red huntcheck runs: two wounds spread
            // across three different animals and nothing killed, while every
            // green run put its one arrow into one deer and ate.
            //
            // Same field name as the snapshot's `c.i`, so the two can be
            // compared without a translation nobody would remember to write.
            i: creature.id,
            sp: creature.species.id,
            n: creature.species.name,
            dmg: Math.round(result.damage),
            // Worth telling the whole hillside about. A troll cannot be killed
            // by one person with one quiver — the arithmetic does not close —
            // so a fight with one in it is a fight everybody has to be able to
            // follow. Read off the table rather than a list of names, so a
            // heavier creature added later is public for free.
            ...(creature.species.hitPoints >= WILDLIFE.bigQuarry ? { big: 1 } : {}),
            // What is left in it, so a body can tell a graze from a mortal hit.
            hp: Math.max(0, Math.round(creature.hp)),
            at: [round2(creature.position.x), round2(creature.position.y), round2(creature.position.z)],
          });
        }
        if (!result?.killed) return;
        const drops = [];
        for (const d of creature.species.drops ?? []) {
          const n = Math.round(d.min + this._lootRand() * (d.max - d.min));
          if (n > 0) drops.push({ item: d.item, count: n });
        }
        const at = creature.position;
        // ── and the meat has to be ON THE GROUND, here ──
        //
        // Rolling the drop table and announcing it is half the job. The browser
        // lays the carcass out from that announcement, so a person watching saw
        // venison — but the SERVER's own world had nothing there, and the
        // server's world is the only one an agent can reach. It could stalk a
        // deer, kill it, walk onto the body and press E on bare ground for
        // ever. The same numbers, laid where everybody's E can find them.
        for (const d of drops) this.pickups.drop(d.item, d.count, at, ZERO);
        this.events.push({
          k: 'kill',
          sp: creature.species.id,
          n: creature.species.name,
          at: [round2(at.x), round2(at.y), round2(at.z)],
          d: drops,
          // ── and WHOSE it was ──
          //
          // The carcass stays public — anyone who walks up can take from it,
          // which is how it has always worked — but the announcement now names
          // the archer. It was anonymous, and that one gap made "can an agent
          // kill a deer" a question nothing could answer: huntcheck watched hit
          // points fall and a carcass appear, and both are equally true when a
          // wolf did it. Null for anything a person did not shoot.
          by: byId ?? null,
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
      // `n` is the SHOOTER'S NAME. The id has always been here and nothing on
      // the far side could turn it into a name — a body knew it had been shot
      // and not by whom, which is why no agent could ever return fire.
      this.events.push({ k: 'hit', id: target.id, by: byId, n: by?.name ?? null, dmg: Math.round(damage) });
      if (target.body.dead) this.onPlayerDied(target, by);
    };

    this.spawn = pickSpawn(this.sunHorizontal(new THREE.Vector3()));
    this.refreshTimber(true);
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
    // Assigned once, not per tick: `refreshTimber` clears and refills this
    // field IN PLACE, so the reference stays good for the life of the world.
    if (this.solid) p.ctrl.solids = [this.scatterColliders];
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
   * Hand something to somebody standing next to you.
   *
   * SERVER-SIDE ONLY, and that is not a style choice: this is the one place
   * that holds both inventories, so it is the only place that can move a thing
   * out of one and into the other without two clients disagreeing about who has
   * it. Same argument as rolling loot here rather than on each client.
   *
   * BY NAME, because a name is all a mind has — it is told who it can see in
   * words and may answer in words, the rule `hunt` and `goTo` already follow.
   * Matched case-insensitively and nothing else: a name is not a sentence.
   *
   * The item is OPTIONAL and that is the interesting part. A mind that wants to
   * be generous should not also have to be right about item ids, so an unnamed
   * gift falls to `bestGift` — food first, because food is what a hungry person
   * needs and what a generous character is written to hand over. Naming the
   * item is how a mind is specific, not how it is correct.
   *
   * Refusals are silent by design in every direction EXCEPT the one that
   * matters: out of reach, nobody by that name, nothing to give, all just do
   * nothing. A gift that lands pushes an event, because two people need to know
   * and a watcher wants to see it.
   */
  /**
   * Put something on the ground where everybody can see it.
   *
   * The counterpart of `resolveGive`: giving is aimed at a person, dropping is
   * aimed at a place. Both had to become the server's business for the same
   * reason — a shared world where half the objects exist in one browser is not
   * a shared world.
   *
   * `burn` is only read for a lit torch, and is what makes one left at a
   * meeting place still burning for whoever arrives.
   */
  resolveDrop(p, want = 1, burn = 0) {
    if (p.body.dead) return;
    // ── NOT THE BOW ──
    //
    // `giftFrom` already refuses it — "the thing that makes you a hunter is not
    // tradeable" — and `KEEP_ON_DEATH` keeps it through dying. Dropping is the
    // third door to the same mistake, and the worst of the three, because the
    // bow sits in slot ONE: it is what you are holding unless you chose
    // otherwise, so the very first press of the drop key would throw away the
    // only thing you cannot make again.
    const holding = p.inventory.equippedSlot?.item;
    if (!holding || KEEP_ON_DEATH.has(holding)) return;
    const taken = p.inventory.takeEquipped(want);
    if (!taken) return;
    // A metre or so in front, so it lands where you are looking rather than
    // inside your own feet. `yawTo`'s convention, the same one `place` uses.
    const at = new THREE.Vector3(
      p.ctrl.position.x - Math.sin(p.ctrl.yaw) * PICKUP.dropForward,
      p.ctrl.position.y + PICKUP.dropUp,
      p.ctrl.position.z - Math.cos(p.ctrl.yaw) * PICKUP.dropForward,
    );
    const entry = this.pickups.drop(taken.item, taken.count, at, ZERO);
    if (!entry) {
      // Nothing landed, so nothing may be lost. Put it back.
      p.inventory.add(taken.item, taken.count);
      return;
    }
    // A torch that was alight goes on burning where it lies. Clamped to what
    // the item is actually worth, because this number came off a socket.
    const def = getItem(taken.item);
    if (def?.burnSeconds && burn > 0) entry.burn = Math.min(burn, def.burnSeconds);
    p.dirty = true;
    this.events.push({ k: 'drop', by: p.id, n: p.name, id: taken.item, count: taken.count });
  }

  resolveGive(from, toName, itemId, count = 1) {
    if (from.body.dead) return;
    const want = String(toName).trim().toLowerCase();
    if (!want) return;

    let to = null;
    for (const q of this.playersInOrder()) {
      if (q === from || q.body.dead || !q.connected) continue;
      if (String(q.name).trim().toLowerCase() !== want) continue;
      to = q;
      break;
    }
    if (!to) return;

    const d = Math.hypot(
      to.ctrl.position.x - from.ctrl.position.x,
      to.ctrl.position.z - from.ctrl.position.z
    );
    if (d > SOCIAL.giveRange) return;

    const id = this.giftFrom(from, itemId);
    if (!id) return;
    // ── HOW MANY, CLAMPED TO WHAT IS ACTUALLY THERE ──
    //
    // Defaults to one, so every mind that has ever called this is unchanged. A
    // player settling "nine branches for the arrows" sends nine, because
    // pressing a key nine times at somebody is not a thing anyone will do — a
    // playtester tried to pay two agents and ended up dropping eighteen
    // branches on the grass that neither of them could pick up.
    const asked = Math.max(1, Math.min(99, Math.floor(count) || 1));
    const held = from.inventory.countOf(id);
    // `howMany`, not `want` — `want` is already the recipient's name in this
    // function, thirty lines up.
    const howMany = Math.min(asked, held);
    if (howMany < 1) return;

    // `remove` returns HOW MANY it actually took, not a boolean. Checking it
    // against what was asked is the whole safety here: if the stack changed
    // between the look-up and the removal, this takes fewer than expected and
    // only that many are credited. Nothing is ever created.
    const moved = from.inventory.remove(id, howMany);
    if (moved < 1) return;
    // Only credit the receiver once the giver has ACTUALLY lost it. Doing this
    // the other way round would mint an item on any inventory that refused the
    // removal, and money you can print is the one bug a shared world cannot
    // recover from.
    //
    // AND ONLY WHAT FITS. `add` returns how many it took; a full pack would
    // otherwise swallow the remainder into nothing. What will not fit goes
    // back, so the total across both packs is the same before and after.
    const taken = to.inventory.add(id, moved);
    if (taken < moved) from.inventory.add(id, moved - taken);
    if (taken < 1) return;

    from.dirty = true;
    to.dirty = true;
    this.events.push({ k: 'gift', by: from.id, to: to.id, n: to.name, id, n2: taken, from: from.name });
  }

  /**
   * Say what you will take for something. A promise, not an escrow.
   *
   * NOTHING IS RESERVED, and that is the design rather than a shortcut. An
   * offer is words: it is checked against both packs only at the instant
   * somebody accepts it, so a mind can offer what it does not have and be found
   * out, and a hoarder can promise the same venison to three people and deliver
   * it once. Reserving the goods would make every offer honest by construction,
   * which is exactly the thing this roster has a liar in it to test.
   *
   * Broadcast, not whispered. The whole table hears a price — that is what
   * makes it a market rather than six private conversations, and it is the only
   * way a watcher can see one mind undercut another.
   */
  resolveOffer(from, toName, itemId, wantId) {
    if (from.body.dead) return;
    const to = this.playerNamed(toName, from);
    if (!to) return;
    // ── WHAT THEY MEANT, AS AN ID ──
    //
    // The nouns are a free string where the verbs are a closed list, so a mind
    // can offer "flint" — which does not exist — or "branches", which does but
    // is spelled `wood`. Both used to fail in the same silent way. Two minds
    // spent most of an hour of a live run bargaining over flint.
    const item = resolveItemId(itemId) ?? '';
    if (!item && String(itemId ?? '').trim()) {
      this.events.push({ k: 'nosuch', by: from.id, n: from.name, word: String(itemId).slice(0, 24) });
      return;
    }
    // ── WHAT YOU WANT BACK DEFAULTS TO COIN ──
    //
    // `offer` took three arguments where `approach` takes one, and any one of
    // them wrong made it a silent no-op — a missing `want` returned here having
    // done nothing at all. Offered an easy verb and a hard verb that both move
    // toward the goal, a model takes the easy one, and one did: it worked out a
    // barter in plain English, wrote it in its reason, and then chose
    // `approach`. Six of fifteen verbs have never been used.
    //
    // Gold is the money in this world, so "I will sell you this venison" with no
    // price named means "for coin", which is what it means anywhere. An offer
    // with no ITEM is still nothing — that half cannot be guessed.
    const want = resolveItemId(wantId) ?? (String(wantId ?? '').trim() ? '' : 'gold');
    if (!want) {
      this.events.push({ k: 'nosuch', by: from.id, n: from.name, word: String(wantId).slice(0, 24) });
      return;
    }
    if (!item) return;

    // ── AND HOW MANY, WHICH IS THE PRICE ──
    //
    // A model negotiating writes the number into the noun, because that is how
    // a person names a price: "twelve branches for the venison". The resolver
    // reads it back out. Null means the mind did not say, and one is the honest
    // reading of an unnumbered noun — "venison for branches" is one of each.
    //
    // Clamped to what is actually held at the moment of OFFERING, so nobody can
    // advertise a hundred branches they have not got. A liar in this game has
    // to lie in the say channel, where it can be seen and remembered, rather
    // than in a field nobody reads.
    const gives = Math.max(1, Math.min(resolveItemCount(itemId) ?? 1, from.inventory.countOf(item)));
    const asks = Math.max(1, resolveItemCount(wantId) ?? 1);

    from.offer = { to: to.id, item, want, gives, asks };
    this.events.push({
      k: 'offer', by: from.id, from: from.name, to: to.id, n: to.name,
      item, want, gives, asks,
    });
  }

  /**
   * Take somebody up on it. THIS is the transaction, and it is all-or-nothing.
   *
   * Checked at THIS moment, not at the moment of the offer: both people have to
   * still be here, still be in reach, and still be holding what they said. An
   * offer that was true five minutes ago and is not true now simply fails, and
   * fails quietly — the mind that promised has already been seen to promise, in
   * the event log, which is the part that matters for a liar.
   *
   * The swap is ordered so nothing can be minted: both removals are attempted
   * first and rolled back together if either falls short. Crediting anybody
   * before both debits have succeeded is how a shared world gets a money
   * printer, and there is no recovering from one of those.
   */
  resolveAccept(taker, fromName) {
    if (taker.body.dead) return;
    const giver = this.playerNamed(fromName, taker);
    if (!giver) return;

    const deal = giver.offer;
    if (!deal || deal.to !== taker.id) return;

    const d = Math.hypot(
      taker.ctrl.position.x - giver.ctrl.position.x,
      taker.ctrl.position.z - giver.ctrl.position.z
    );
    if (d > SOCIAL.giveRange) return;

    // Neither side may hand over the bow, by the same rule `giftFrom` follows:
    // the thing that makes you a hunter is not tradeable.
    if (KEEP_ON_DEATH.has(deal.item) || KEEP_ON_DEATH.has(deal.want)) return;

    // ── THE PRICE IS PART OF THE DEAL, AND IT IS ALL OR NOTHING ──
    //
    // Older offers on a loaded save carry no counts; one of each is what they
    // always meant. A deal you cannot cover in full simply does not happen —
    // half-paying a bargain is a way to lose things quietly, and the whole
    // point of this path is that nobody ever loses anything to a failed trade.
    const gives = Math.max(1, deal.gives ?? 1);
    const asks = Math.max(1, deal.asks ?? 1);
    if (giver.inventory.countOf(deal.item) < gives) return;
    if (taker.inventory.countOf(deal.want) < asks) return;

    if (giver.inventory.remove(deal.item, gives) !== gives) return;
    if (taker.inventory.remove(deal.want, asks) !== asks) {
      giver.inventory.add(deal.item, gives); // put it back; nobody loses a thing
      return;
    }
    // A pack can be full. Anything that will not fit goes back where it came
    // from, both ways, so the invariant holds however the bargain was priced.
    const tookIn = taker.inventory.add(deal.item, gives);
    const gaveIn = giver.inventory.add(deal.want, asks);
    if (tookIn < gives) giver.inventory.add(deal.item, gives - tookIn);
    if (gaveIn < asks) taker.inventory.add(deal.want, asks - gaveIn);

    giver.offer = null;
    giver.dirty = true;
    taker.dirty = true;
    this.events.push({
      k: 'trade', by: giver.id, from: giver.name, to: taker.id, n: taker.name,
      gave: deal.item, got: deal.want, gaveN: tookIn, gotN: gaveIn,
    });
  }

  /**
   * Cut the nearest tree or quarry the nearest rock within reach.
   *
   * The browser has done this since the beginning and the server never did,
   * which was invisible while the browser owned its own pack. It stopped being
   * invisible the hour the server took the pack over: wood cut locally was
   * wiped by the next snapshot, one frame later.
   *
   * The yield matches the browser's exactly — `STRUCTURES.chopYield` for a
   * tree, `quarryYield` for rock, plus the axe bonus if one is carried — so a
   * player who cuts a tree gets the same eight branches whether or not anybody
   * is connected. An axe is worth more here than in a fight.
   *
   * @returns {boolean} whether anything was actually taken.
   */
  harvestFor(p) {
    const source = this.harvest.nearestSource(
      this.scatterColliders, p.ctrl.position, STRUCTURES.useRange, this.totalHours
    );
    if (!source) return false;

    const hasAxe = p.inventory.countOf('axe') > 0;
    const bonus = hasAxe ? (source.tag === 'tree' ? AXE.chopBonus : AXE.quarryBonus) : 0;
    const amount = source.amount + bonus;

    // Marked taken BEFORE the pack is credited, so a pack that turns out to be
    // full cannot be retried against the same trunk for free.
    this.harvest.take(source.x, source.z, this.totalHours);
    const took = p.inventory.add(source.item, amount);
    if (!took) return false;

    this.events.push({
      k: 'cut', by: p.id, n: p.name, tag: source.tag,
      id: source.item, count: took, verb: source.verb,
      // Where the stump is, so the browser can grey out the prompt on the same
      // trunk the server actually spent — rather than guessing, and rather than
      // marking it spent for a cut that may have been refused.
      at: [round2(source.x), round2(source.z)],
    });
    return true;
  }

  /** The one person of that name who is not you, or null. */
  playerNamed(name, notThis = null) {
    const want = String(name ?? '').trim().toLowerCase();
    if (!want) return null;
    for (const q of this.playersInOrder()) {
      if (q === notThis || q.body.dead || !q.connected) continue;
      if (String(q.name).trim().toLowerCase() === want) return q;
    }
    return null;
  }

  /**
   * What to hand over when a mind did not say.
   *
   * Food first — it is what a hungry person needs, and "generous" in this world
   * means feeding somebody. Never the bow: handing over the thing that makes
   * you a hunter is not generosity, it is a bug, and no character in the roster
   * was written to do it.
   */
  giftFrom(p, itemId) {
    // Through `resolveItemId`, so "a branch" finds `wood` — the id nobody in
    // this world ever says out loud, because the game calls it a branch
    // everywhere a person can read it.
    const named = resolveItemId(itemId) ?? '';
    if (named && p.inventory.countOf(named) > 0 && !KEEP_ON_DEATH.has(named)) return named;
    for (const id of EDIBLE) if (p.inventory.countOf(id) > 0) return id;
    // A slot is `{item, count}` — NOT `{id}`. Getting that wrong reads fine and
    // silently gives nothing, which is the failure mode this whole verb exists
    // to avoid.
    let best = null;
    for (const slot of p.inventory.slots ?? []) {
      const sid = slot?.item;
      if (!sid || KEEP_ON_DEATH.has(sid)) continue;
      if (!best || slot.count > best.count) best = { id: sid, count: slot.count };
    }
    return best?.id ?? null;
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
      // ── A PERSON HAS A NAME; A DEER HAS A SPECIES ──
      //
      // This read `killer?.species?.name ?? 'the cold'`, and the arrow path
      // hands it a PLAYER — which carries `.name` and no `.species` at all. So
      // every kill one player ever landed on another was announced, in the chat
      // column and in the report, as "killed by the cold". The one death in this
      // game that has a story behind it was the one death it could not tell.
      //
      // Creature first because that is the common case and a creature's own
      // `.name` is its individual name, not its kind.
      by: killer?.species?.name ?? killer?.name ?? 'the cold',
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
      const advance = (dt / 60 / TIME.dayMinutes) * 24;
      this.clock.hours = (this.clock.hours + advance) % 24;
      this.totalHours += advance;   // never wraps; what `Harvest` needs
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

    // ── and then people stop standing inside each other ──
    if (this.solid) this.separatePlayers();

    // ── the shared world ──
    // Creatures sense the NEAREST player, and the stealth profile they read is
    // that player's. A crouching player and a sprinting one standing together
    // should not make each other invisible.
    const anchor = this.playersInOrder()[0];
    const anchorPos = anchor ? anchor.ctrl.position : this.spawn.position;
    this.wildlife.deps.stealth = anchor ? anchor.stealth : null;
    this.refreshTimber();
    this.updateWildlife(dt, worldCtx);

    this.projectiles.update(dt);
    this.pickups.update(dt, anchorPos);
    // ── TORCHES BURNING ON THE GROUND ──
    //
    // The server owns the flame, so everybody sees the same one go out at the
    // same moment. A spent torch stays where it is as an ordinary unlit torch:
    // it is still a torch, and taking the item away because the flame died
    // would be taking something a player put there.
    for (const d of this.pickups.dropped) {
      if (!(d.burn > 0)) continue;
      d.burn -= dt;
      if (d.burn <= 0) {
        d.burn = 0;
        this.events.push({ k: 'guttered', at: [round2(d.obj.position.x), round2(d.obj.position.z)] });
      }
    }
  }

  playersInOrder() {
    return [...this.players.values()];
  }

  /**
   * Nobody ends a tick standing inside anybody else.
   *
   * Only behind SOLID, and only on the server: this is the one place in the
   * game that knows where everybody is. The client-side push-out in
   * `Controller` handles the SCENERY, which is generated from a seed and so is
   * identical on every machine; other people are not, and predicting a shove
   * against a body you only hear about at 20 Hz would rubber-band both of you.
   * So the browser walks through people, the server pushes them apart, and the
   * correction arrives with the next snapshot. For a shoulder brush at walking
   * pace that reads as contact, which is what it is.
   *
   * ── THE THINGS THIS DELIBERATELY DOES NOT DO ──
   *
   * A DEAD BODY IS NOT AN OBSTACLE. You can walk over someone who has fallen.
   * Shoving a corpse around the hillside is a worse picture than stepping
   * through it, and `onRespawn` teleports them anyway.
   *
   * ANIMALS ARE NOT IN THIS PASS. Deer, goblins and companions still walk
   * through people and each other; the creature manager runs its own separation
   * over `this.creatures`, which has never contained a player. Out of scope
   * here rather than half-done — it wants the same treatment and its own check.
   *
   * ONLY XZ MOVES. The ground owns `y`, and the next tick's `damp` to the
   * surface settles a few centimetres of sideways step without anybody seeing
   * it.
   *
   * Deterministic: `playersInOrder` is the Map's insertion order, which is join
   * order, which is the same on the server and in any replay. The pairs are
   * walked i < j so each pair is considered exactly once, and both bodies move
   * half the overlap so the answer does not depend on who joined first.
   */
  separatePlayers() {
    const people = this.playersInOrder();
    if (people.length < 2) return;
    const want = PLAYER.personalSpace;
    const cap = PLAYER.maxPushPerStep;

    for (let i = 0; i < people.length; i++) {
      const a = people[i];
      if (a.body.dead) continue;
      for (let j = i + 1; j < people.length; j++) {
        const b = people[j];
        if (b.body.dead) continue;
        const dx = b.ctrl.position.x - a.ctrl.position.x;
        const dz = b.ctrl.position.z - a.ctrl.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= want * want) continue;

        let nx;
        let nz;
        if (d2 < 1e-8) {
          // Standing in exactly the same spot — two arrivals on one square
          // metre. Any direction will do and none is derivable from the
          // bodies, so take one that is the same on every machine, and make it
          // depend on the PAIR so a crowd does not all leave the same way.
          const a0 = ((i * 7 + j * 13) % 16) * (Math.PI / 8);
          nx = Math.cos(a0);
          nz = Math.sin(a0);
        } else {
          const d = Math.sqrt(d2);
          nx = dx / d;
          nz = dz / d;
        }
        const overlap = want - Math.sqrt(d2);
        const step = Math.min(overlap / 2, cap);
        a.ctrl.position.x -= nx * step;
        a.ctrl.position.z -= nz * step;
        b.ctrl.position.x += nx * step;
        b.ctrl.position.z += nz * step;
        a.dirty = true;
        b.dirty = true;
      }
    }
  }

  /**
   * Keep a patch of solid world around EVERY player, not around the first one.
   *
   * The radius is the distance a shaft can travel from anywhere inside the
   * patch before its owner has walked far enough to trigger a rebuild — 45 m of
   * drift plus a bow's whole useful range, with room to spare. Rebuilt only
   * when somebody has actually left their patch, so a fleet standing about
   * costs nothing.
   *
   * Deduplicated by cell key: two agents hunting the same copse must not put
   * the same trunk in twice, or an arrow tests it twice for no reason.
   */
  refreshTimber(force = false) {
    const R = 160;
    const MOVED = 45;
    const everyone = this.playersInOrder();
    const spots = everyone.length
      ? everyone.map((p) => ({ key: p.id, x: p.ctrl.position.x, z: p.ctrl.position.z }))
      : [{ key: 'spawn', x: this.spawn.position.x, z: this.spawn.position.z }];

    let stale = force || this._timberAnchors.size !== spots.length;
    if (!stale) {
      for (const s of spots) {
        const a = this._timberAnchors.get(s.key);
        if (!a || Math.hypot(s.x - a.x, s.z - a.z) > MOVED) { stale = true; break; }
      }
    }
    if (!stale) return;

    const field = this.scatterColliders;
    field.clear();
    this._timberAnchors.clear();
    const seen = new Set();
    for (const s of spots) {
      this._timberAnchors.set(s.key, { x: s.x, z: s.z });
      for (const t of treesNear(s.x, s.z, R)) {
        if (seen.has(t.key)) continue;
        seen.add(t.key);
        field.addCylinder(t.x, t.y, t.z, t.trunkR, t.trunkH, 'tree');
        // `soft`: an arrow hits the crown, a body walks through it. Measured —
        // see `ColliderField.resolveBody`.
        field.addSphere(t.x, t.crownCentreY, t.z, t.crownR, 'tree', true);
      }
      for (const r of rocksNear(s.x, s.z, R)) {
        if (seen.has(r.key)) continue;
        seen.add(r.key);
        field.addSphere(r.x, r.centreY, r.z, r.r, 'rock');
      }
    }
  }

  stepPlayer(p, dt, worldCtx) {
    const intent = p.intent;

    // ── letting the string down, BEFORE the trigger edge is read ──
    //
    // Order is the whole point. A caller that has decided not to shoot sets
    // `letdown` and drops `primary` in the same tick — the natural way to spell
    // "stop" — and if the edge below ran first that would loose the arrow it
    // was trying not to loose. Cancelling first leaves the bow out of DRAWING,
    // so `endPrimary` finds nothing to release and the arrow stays in the
    // quiver. See the note on `letdown` in intents.js.
    if (intent.letdown) p.weapons.cancel?.();

    // Edge-detected FROM THE INTENT rather than from an input event, so this
    // path is byte-identical in the browser, in Node, and over a socket.
    if (intent.primary !== p.primaryWasHeld) {
      p.primaryWasHeld = intent.primary;
      if (intent.primary) p.weapons.beginPrimary();
      else p.weapons.endPrimary();
    }
    if (intent.selectSlot >= 0) p.inventory.select(intent.selectSlot);
    // ── EDGE-DETECTED, like the trigger and for the same reason ──
    //
    // The intent PERSISTS on the server between packets, and packets arrive at
    // 30 Hz against a 60 Hz tick. A held `give` therefore handed over one item
    // per tick: `givecheck` held it for eight packets and twelve arrows changed
    // hands, which is the entire stack and not what anybody asked for.
    //
    // Firing on the RISING EDGE makes one press one item no matter how long the
    // field stays set or how the rates drift — the same contract `primary`
    // already has, and the reason a bow fires once when you let go.
    // ── DROPPING, WHICH THE SERVER HAS NEVER DONE ──
    //
    // `drop` has been on the wire's allow-list since the beginning and NOTHING
    // HERE EVER READ IT. Every drop happened in one browser: invisible to the
    // other players, invisible to the agents, and gone the moment you
    // reloaded. It is why a playtester who agreed a price could not pay — he
    // put eighteen branches on the grass and neither mind could see them — and
    // why a torch left at a meeting place was a torch only you could see.
    //
    // Edge-detected like `give`, and for the same reason: the field persists
    // between packets and packets arrive at half the tick rate, so a held key
    // would empty a pack.
    const wantsDrop = !!(intent.drop || intent.dropHalf);
    if (wantsDrop && !p.dropWasHeld) {
      this.resolveDrop(p, intent.dropHalf ? 'half' : 1, intent.dropBurn);
    }
    p.dropWasHeld = wantsDrop;

    const wantsGive = intent.give || '';
    if (wantsGive && wantsGive !== p.giveWasHeld) {
      this.resolveGive(p, wantsGive, intent.giveItem, intent.giveCount || 1);
    }
    p.giveWasHeld = wantsGive;

    // Both edge-detected for the same reason `give` is: the intent persists
    // between packets and packets arrive at half the tick rate.
    const wantsOffer = intent.offer || '';
    if (wantsOffer && wantsOffer !== p.offerWasHeld) {
      this.resolveOffer(p, wantsOffer, intent.offerItem, intent.offerWant);
    }
    p.offerWasHeld = wantsOffer;

    const wantsAccept = intent.accept || '';
    if (wantsAccept && wantsAccept !== p.acceptWasHeld) {
      this.resolveAccept(p, wantsAccept);
    }
    p.acceptWasHeld = wantsAccept;
    // ── E picks up what is at YOUR feet, not what is at the anchor's ──
    //
    // `Pickups.collect` takes whatever `update` last found, and `update` is
    // called once a tick with ONE position — the first player in the map. So
    // everybody's E resolved against that person's surroundings: player two
    // pressing E collected a branch lying beside player one, two hundred metres
    // away, and if nothing was near player one then nobody in the world could
    // pick anything up at all. Invisible in single player, which is the only
    // place it was ever exercised, and fatal to a fleet of agents all foraging
    // at once. `collectFor` asks the question per person.
    if (intent.interact) {
      const got = this.pickups.collectFor(p.ctrl.position, p.inventory);
      if (got) p.dirty = true;
      // ── ...AND IF THERE WAS NOTHING LYING THERE, WORK WHAT IS STANDING ──
      //
      // `E` has always meant "use the thing in front of you", and for a player
      // that has always included cutting a tree and quarrying rock. Both were
      // resolved in the browser against its own inventory, which the server now
      // overwrites — so this is where they have to happen instead.
      //
      // Pickup first because loot on the ground is the more perishable thing;
      // a tree is not going anywhere.
      else if (this.harvestFor(p)) p.dirty = true;
    }

    // ── two intents that crossed the wire for a year and were never read ──
    //
    // `eat` and `place` are in the protocol's INTENT_KEYS, are sanitised on
    // arrival, and are sent by every client. Nothing here ever looked at them.
    // For a browser that did not matter, because the browser resolves both
    // locally against its own inventory and its own fire.
    //
    // For an AGENT it mattered completely: it could hunt, gather and walk, and
    // then starve holding venison and freeze beside branches it had carried all
    // day. No amount of intelligence upstream can survive a body that cannot
    // eat or make fire, so every model-driven player was playing a game it was
    // not possible to win.
    if (intent.eat) {
      // Best meal first, from the shared table — the same order the browser
      // uses, out of the same list, so nobody has to keep two in step.
      const found = EDIBLE.find((id) => p.inventory.countOf(id) > 0);
      if (found && p.body.eat(found) > 0) {
        p.inventory.remove(found, 1);
        p.dirty = true;
      }
    }

    // A fire costs `SURVIVAL.woodToLight` branches to LAY and one to feed. See
    // the note on the constant: at one apiece, `place` was the cheapest action
    // in the game and 106 of them went down in a single run.
    if (intent.place && p.inventory.countOf('wood') >= SURVIVAL.woodToLight) {
      // In front of them, at the same reach the browser uses. Facing is
      // (-sin, -cos) — the convention `yawTo` and the controller share.
      const fx = p.ctrl.position.x - Math.sin(p.ctrl.yaw) * SURVIVAL.firePlaceDistance;
      const fz = p.ctrl.position.z - Math.cos(p.ctrl.yaw) * SURVIVAL.firePlaceDistance;
      // `lightFireFor` already does the whole job, including treating a claim
      // that lands on an existing fire as fuel for it. This is simply its first
      // caller that is not a packet from a browser.
      if (this.lightFireFor(p.id, fx, fz).ok) {
        p.inventory.remove('wood', SURVIVAL.woodToLight);
        p.dirty = true;
      }
    }

    // ── and the third: cooking ──
    //
    // The station is whatever you are standing at, and there is exactly one
    // kind of station in the game — a lit fire, within the same reach the
    // browser's E obeys. `bestAvailable` picks from the recipe table in table
    // order, so what an agent cooks is decided by the same data that decides
    // what the prompt offers you, and neither end holds a second opinion.
    //
    // Instant, like the browser's. `RECIPES.seconds` is presentation today —
    // main.js does not run a timer either — and a server-side craft timer is a
    // thing to add on both sides at once or not at all.
    if (intent.craft) {
      // Already checked against the table by `sanitiseIntent`; what is checked
      // HERE is everything the table cannot know — that the station it needs is
      // actually within reach, that the inputs are in the pack, and that you do
      // not already own as many as the recipe is worth making. `craft` itself
      // refuses politely if the inputs are gone, so a stale press costs nothing.
      const recipe = RECIPES[intent.craft];
      const station = recipe.requires !== 'fire' || this.fires.nearest(p.ctrl.position, SURVIVAL.fireReach);
      const out = Object.keys(recipe.outputs)[0];
      const enough = recipe.maxHeld && p.inventory.countOf(out) >= recipe.maxHeld;
      if (station && !enough && craft(recipe, p.inventory)) {
        p.lastCraft = recipe.id;
        p.dirty = true;
      }
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
        // ── and WHAT YOU ARE CARRYING ──
        //
        // The same argument as the position, one step further on. A browser
        // holds its own inventory and does not need this; a body on the far
        // side of a socket has NO inventory of its own, so "am I carrying meat"
        // was a question no agent could answer about itself. It could not
        // decide to cook, could not decide to eat, and could not tell a mind
        // what was in its pack — `brief.carrying` was a hard-coded empty list.
        //
        // A plain id → count map, and only what is actually held, so an empty
        // pack costs two bytes. This is the server's copy of you, which is the
        // one that eats, cooks and burns wood.
        const iv = {};
        for (const s of p.inventory.slots) iv[s.item] = (iv[s.item] ?? 0) + s.count;
        me = { p: [round2(p.ctrl.position.x), round2(p.ctrl.position.y), round2(p.ctrl.position.z)],
               y: round3(p.ctrl.yaw), t: round3(p.ctrl.pitch),
               h: Math.round(p.body.health), f: Math.round(p.body.hunger), c: round2(p.body.coreC),
               // How high off the ground your eye is RIGHT NOW. Crouching drops
               // it from 1.72 to 1.05 over a tenth of a second, and an arrow
               // leaves from there — so a body solving its own arc without this
               // number is solving for a launch two thirds of a metre above the
               // one it takes. Sent rather than modelled locally, for the same
               // reason the aim is: the copy that fires the bow is this one.
               e: round2(p.ctrl.eyeHeight),
               iv };
        // ── AND WHETHER SOMEBODY HAS A DEAL ON THE TABLE FOR YOU ──
        //
        // Measured over three live hours: `offer` reached for 29 times, `give`
        // 16, `accept` ZERO. Not once, by any model, in any run. It reads as a
        // verb nobody wants and it is nothing of the kind — an offer made TO a
        // mind arrived only as one line in its memory stream, weighted like any
        // other thing that happened, decaying against a measured half-life of
        // about one decision. By the time that mind next chose, the deal it was
        // being asked to take had already faded out of the six lines it is
        // shown.
        //
        // Nobody was refusing to trade. THEY WERE NEVER ASKED ANYWHERE THEY
        // COULD SEE. Same shape as the 140 m blindness and the empty quiver
        // before it: the world knew something and did not tell the mind.
        //
        // So a standing offer is state, not history, and it rides with health
        // and hunger where a mind cannot miss it. Costs nothing when there is
        // no offer, which is almost always.
        for (const q of this.playersInOrder()) {
          if (q === p || q.body.dead || !q.connected) continue;
          if (q.offer?.to !== p.id) continue;
          me.of = {
            n: q.name, item: q.offer.item, want: q.offer.want,
            gives: q.offer.gives ?? 1, asks: q.offer.asks ?? 1,
          };
          break;
        }
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
        // ── IT HAS GIVEN UP, AND NOBODY COULD TELL ──
        //
        // A goblin routed in daylight runs until its breath is gone and then
        // hunkers where it stands. That is correct and tested (`raidcheck`:
        // 109 m in 40 s, then 0 m/s) — but `goneToGround` lived only on the
        // server, so from outside a pack that had given up was indistinguishable
        // from one that had crashed. Reported from play as "I am standing by
        // goblins, why are they not killing me?"
        //
        // One bit, and only when true, so a world full of ordinary animals pays
        // nothing for it.
        ...(c.goneToGround ? { g: 1 } : {}),
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
      // ── WHAT IS LYING ON THE GROUND BECAUSE SOMETHING PUT IT THERE ──
      //
      // Only `pickups.dropped` — kill drops and things people threw down. The
      // hash-placed deadfall and quivers stay off the wire because they are a
      // pure function of the seed and both ends already compute them; sending
      // them would be a few hundred entries a tick to say what the receiver
      // could work out for itself.
      //
      // Bounded by `PICKUP.wireRadius` around the viewer. `dropped` is a handful
      // of entries in practice, but it is unbounded in principle — a long run
      // with a lot of dying in it should not turn the snapshot into a landfill.
      lo: this.pickups.dropped
        .filter((d) => !me || Math.hypot(d.obj.position.x - me.p[0], d.obj.position.z - me.p[2]) <= PICKUP.wireRadius)
        .map((d) => ({
          // The id lets a viewer tell "the same branch, moved" from "a
          // different branch", which is what makes it renderable at all rather
          // than rebuilt and flickering every packet.
          d: d.id,
          i: d.item,
          n: d.count,
          p: [round2(d.obj.position.x), round2(d.obj.position.y), round2(d.obj.position.z)],
          // Seconds of flame left, for a torch somebody put down still alight.
          // Absent on everything else, which is most things.
          ...(d.burn > 0 ? { b: Math.round(d.burn) } : {}),
        })),
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
      // ── how much this valley has ──
      // Firewood is drawn by the client from a pure function of the seed, so a
      // server that thins the wood and says nothing leaves every browser
      // painting branches that are not there and every agent walking to them.
      // See world/scarcity.js.
      scarcity: scarcity(),
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
