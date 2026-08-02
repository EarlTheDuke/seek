// ── headless.js ─────────────────────────────────────────────────────────────
// The simulation, with no browser attached.
//
//   npm run sim -- --ticks 4000
//
// This is the proof that Phase 1 actually happened. If the world can be
// advanced thousands of ticks in Node — no canvas, no DOM, no input — and
// produce the same numbers the browser does, then the simulation genuinely is
// separable from its presentation, and a dedicated server is a transport
// change rather than a rewrite.
//
// three.js is still imported: scene graph, vectors and geometry are all pure
// maths and work fine without a GL context. Only a WebGLRenderer would need one,
// and there isn't one here.

import * as THREE from 'three';
import { SEED, WATER_LEVEL } from '../config.js';
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
import { createIntent, sanitiseIntent } from './intents.js';
import { LOADOUT, TIME } from '../config.js';

/**
 * Everything that is simulation and nothing that is presentation.
 *
 * The browser builds this too (indirectly, through main.js) — the point is that
 * nothing here reaches for `window`, a renderer, or a frame.
 */
export function createSimWorld({ seed = SEED, hours = TIME.startHour } = {}) {
  const scene = new THREE.Scene(); // a container, never rendered here

  const scatterColliders = new ColliderField(14);
  const scatter = new Scatter(scene);
  scatter.colliders = scatterColliders;

  const landmarks = buildLandmarks(scene);
  scatter.setClearings(landmarks.clearings);

  const weather = new Weather();
  const clock = { hours, running: true };

  const inventory = new Inventory(LOADOUT.slots, LOADOUT.equipped);
  const ctrl = new Controller();
  const stealth = new StealthProfile();
  const vitals = new Body({});
  const fires = new Fires(scene, {});

  const wildlife = new Wildlife(scene, {
    stealth,
    onAttack: (creature) => vitals.damage(creature.species.aggression?.damage ?? 0, creature),
  });

  const pickups = new Pickups(scene, { inventory, projectiles: null });
  const projectiles = new Projectiles(scene, {
    colliders: [scatterColliders],
    wildlife,
    onLanded: (p) => pickups.registerRecoverable(p),
    onRemoved: (p) => pickups.forgetProjectile(p),
    onCreatureHit: () => {},
  });
  pickups.deps.projectiles = projectiles;

  const weapons = new WeaponHost({
    camera: makeAimProxy(ctrl),
    controller: ctrl,
    inventory,
    projectiles,
    rand: makeRandom('combat'),
    onDryFire: () => {},
  });
  weapons.sync(inventory);

  // Sun direction is the only thing the sim needs from the sky.
  const sunHorizontal = (out) => {
    const s = solarPosition(clock.hours);
    const phi = ((90 - s.altitude) * Math.PI) / 180;
    const theta = (s.azimuth * Math.PI) / 180;
    return out.set(Math.sin(phi) * Math.sin(theta), 0, Math.sin(phi) * Math.cos(theta)).normalize();
  };
  const spawn = pickSpawn(sunHorizontal(new THREE.Vector3()));
  ctrl.teleport(spawn.position, spawn.yaw);
  scatter.update(ctrl.position, 0);

  let primaryWasHeld = false;

  function step(dt, rawIntent) {
    const intent = sanitiseIntent(rawIntent);

    // The trigger is edge-detected FROM THE INTENT, not from an input event, so
    // this path is identical in the browser and here.
    if (intent.primary !== primaryWasHeld) {
      primaryWasHeld = intent.primary;
      if (intent.primary) weapons.beginPrimary();
      else weapons.endPrimary();
    }
    if (intent.selectSlot >= 0) inventory.select(intent.selectSlot);
    if (intent.interact) pickups.collect();

    if (clock.running) {
      clock.hours = (clock.hours + (dt / 60 / TIME.dayMinutes) * 24) % 24;
    }
    weather.update(dt);
    stealth.setWeather(weather);

    // The elements, exactly as the browser runs them.
    fires.update(dt, weather);
    const env = sampleEnvironment(ctrl.position, {
      hours: clock.hours,
      sunAltitude: solarPosition(clock.hours).altitude,
      weather,
      fires,
    });
    vitals.update(dt, {
      ctrl,
      env,
      insulationC: insulationOf(inventory),
      drawing: !!weapons.getState()?.drawing,
      enabled: true,
    });

    weapons.update(dt);
    ctrl.speedScale = weapons.moveScale * vitals.speedScale;
    if (vitals.sprintBlocked) intent.sprint = false;
    ctrl.update(dt, intent);

    scatter.update(ctrl.position, 0);
    stealth.update(dt, ctrl);
    // Identical context to the browser's, or the two would populate the world
    // with different species and the whole determinism proof would be void.
    wildlife.update(dt, ctrl.position, stealth, {
      hours: clock.hours,
      sunAltitude: solarPosition(clock.hours).altitude,
      weather,
    });
    projectiles.update(dt);
    pickups.update(dt, ctrl.position);
    vitals.update(dt);
  }

  return { scene, clock, weather, ctrl, stealth, vitals, fires, inventory, weapons, wildlife, projectiles, pickups, scatter, spawn, step };
}

/**
 * The weapon system asks a camera for its aim. Headless there isn't one, so
 * this supplies the same interface from the body's own yaw and pitch — which
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

/**
 * A stable summary of world state. Two runs that agree on this agree on
 * everything that matters; it is the thing the browser and Node compare.
 */
export function fingerprint(w) {
  const r = (n) => Math.round(n * 1000) / 1000;
  let creatureHash = 0;
  for (const c of w.wildlife.creatures) {
    creatureHash += c.position.x * 0.7 + c.position.z * 1.3 + c.hp * 0.11 + c.awareness * 3.1;
  }
  let projHash = 0;
  for (const p of w.projectiles.items) {
    projHash += p.pos.x * 0.9 + p.pos.y * 1.7 + p.pos.z * 0.3;
  }
  return {
    clock: r(w.clock.hours),
    player: [r(w.ctrl.position.x), r(w.ctrl.position.y), r(w.ctrl.position.z)],
    yaw: r(w.ctrl.yaw),
    distance: r(w.ctrl.distanceTravelled),
    weather: `${w.weather.stateName}>${w.weather.nextName}@${r(w.weather.blend)}`,
    windAngle: r(w.weather.windAngle),
    creatures: w.wildlife.creatures.length,
    creatureHash: r(creatureHash),
    projectiles: w.projectiles.items.length,
    projHash: r(projHash),
    noise: r(w.stealth.noise),
    arrows: w.inventory.countOf('arrow'),
    coreC: r(w.vitals.coreC),
    hunger: r(w.vitals.hunger),
    stamina: r(w.vitals.stamina),
    wetness: r(w.vitals.wetness),
  };
}

/**
 * A fixed, scripted sequence of intents. Deterministic by construction, so any
 * difference between two runs is a difference in the simulation, not the input.
 */
export function scriptedIntent(tick, out = createIntent()) {
  out.forward = tick % 600 < 420 ? 1 : 0;
  out.strafe = tick % 900 < 200 ? 1 : tick % 900 < 400 ? -1 : 0;
  out.sprint = tick % 1200 > 900;
  out.crouch = tick % 1500 > 1300;
  out.jump = tick % 700 === 0;
  out.lookYaw = Math.sin(tick * 0.013) * 0.02;
  out.lookPitch = Math.sin(tick * 0.007) * 0.006;
  out.primary = tick % 260 > 130; // draw, hold, loose
  out.interact = false;
  out.drop = false;
  out.selectSlot = -1;
  return out;
}

/** Advance a fresh world through `ticks` of scripted input. */
export function runSim(ticks, opts = {}) {
  const world = createSimWorld(opts);
  const dt = 1 / 60;
  const intent = createIntent();
  for (let t = 0; t < ticks; t++) world.step(dt, scriptedIntent(t, intent));
  return { world, fingerprint: fingerprint(world) };
}
