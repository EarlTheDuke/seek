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
import { SEED, WATER_LEVEL, LOADOUT, TIME } from '../config.js';
import { heightAt } from '../world/noise.js';
import { Scatter } from '../world/scatter.js';
import { ColliderField } from '../world/colliders.js';
import { Weather } from '../world/weather.js';
import { solarPosition } from '../world/sky.js';
import { Wildlife } from '../creatures/manager.js';
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
  constructor(id, { name = 'someone', spawn, scene, projectiles, inventory } = {}) {
    this.id = id;
    this.name = name;
    this.ctrl = new Controller();
    this.stealth = new StealthProfile();
    this.body = new Body({});
    this.inventory = inventory ?? new Inventory(LOADOUT.slots, LOADOUT.equipped);
    this.intent = createIntent();
    this.primaryWasHeld = false;
    this.connected = true;
    // Rising every time anything about this player changes in a way another
    // client needs to know. Lets the server skip players who did nothing.
    this.dirty = true;

    if (spawn) this.ctrl.teleport(spawn.position, spawn.yaw);

    this.weapons = new WeaponHost({
      camera: makeAimProxy(this.ctrl),
      controller: this.ctrl,
      inventory: this.inventory,
      projectiles,
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

    // Creatures attack whoever is nearest; the manager reports the creature and
    // the world decides who wore it. Single-player had exactly one candidate,
    // which is why this was never a question before.
    this.wildlife = new Wildlife(this.scene, {
      stealth: null,
      onAttack: (creature) => this.resolveAttack(creature),
    });

    this.pickups = new Pickups(this.scene, { inventory: null, projectiles: null });
    this.projectiles = new Projectiles(this.scene, {
      colliders: [this.scatterColliders],
      wildlife: this.wildlife,
      onLanded: (p) => this.pickups.registerRecoverable(p),
      onRemoved: (p) => this.pickups.forgetProjectile(p),
      onCreatureHit: () => {},
    });
    this.pickups.deps.projectiles = this.projectiles;

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

  addPlayer(id, name) {
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
    });
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) {
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

  resolveAttack(creature) {
    const victim = this.nearestPlayer(creature.position, 6);
    if (!victim) return;
    victim.body.damage(creature.species.aggression?.damage ?? 0, creature);
    victim.dirty = true;
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
    p.body.update(dt);

    const after = p.ctrl.position.x + p.ctrl.position.z + p.ctrl.yaw;
    if (after !== before) p.dirty = true;
  }

  updateWildlife(dt, worldCtx) {
    const anchor = this.playersInOrder()[0];
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
    for (const p of this.playersInOrder()) {
      if (p.id === forId) continue; // you already know where you are
      players.push(p.snapshot());
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
      cr: creatures,
      pr: projectiles,
    };
  }

  /** Everything a client needs exactly once, on joining. */
  hello(id) {
    return {
      seed: this.seed,
      id,
      tick: this.tick,
      spawn: {
        p: [this.spawn.position.x, this.spawn.position.y, this.spawn.position.z],
        y: this.spawn.yaw,
      },
      players: this.playersInOrder().map((p) => ({ id: p.id, n: p.name })),
    };
  }

  get stats() {
    return {
      tick: this.tick,
      players: this.players.size,
      creatures: this.wildlife.creatures.length,
      projectiles: this.projectiles.items.length,
      hours: round2(this.clock.hours),
    };
  }
}

/**
 * The weapon system asks a camera for its aim. There is no camera on a server,
 * so this supplies the same interface from the body's own yaw and pitch — which
 * is what the camera was reporting anyway.
 */
function makeAimProxy(ctrl) {
  return {
    position: ctrl.position,
    up: new THREE.Vector3(0, 1, 0),
    getWorldDirection(out) {
      const cp = Math.cos(ctrl.pitch);
      return out.set(-Math.sin(ctrl.yaw) * cp, Math.sin(ctrl.pitch), -Math.cos(ctrl.yaw) * cp);
    },
  };
}
