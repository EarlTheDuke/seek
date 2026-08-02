// ── main.js ─────────────────────────────────────────────────────────────────
// Bootstrap and the render loop. Everything interesting lives in the modules
// this file wires together; see README.md for the tour.

import * as THREE from 'three';
import { FEEL, POST, Q, QUALITY, SEED, SKY } from './config.js';
import { Terrain } from './world/terrain.js';
import { Atmosphere } from './world/sky.js';
import { Lake } from './world/water.js';
import { Scatter } from './world/scatter.js';
import { buildLandmarks, pickSpawn } from './world/landmarks.js';
import { heightAt } from './world/noise.js';
import { Composer } from './fx/composer.js';
import { AmbientLife } from './fx/ambientLife.js';
import { Controller } from './player/controller.js';
import { PlayerInput } from './player/input.js';
import { sanitiseIntent, IDLE_INTENT } from './sim/intents.js';
import { CameraFeel } from './player/cameraFeel.js';
import { ViewModel } from './player/viewmodel.js';
import { Soundscape } from './audio/soundscape.js';
import { Hud } from './ui/hud.js';
import { LOADOUT, LAKE, PLAYER, WATER_LEVEL, WEATHER, WILDLIFE } from './config.js';
import { Inventory } from './items/inventory.js';
import { getItem } from './items/registry.js';
import { WeaponHost } from './weapons/index.js';
import { Projectiles } from './world/projectiles.js';
import { Pickups } from './world/pickups.js';
import { ColliderField, addStaticGroup } from './world/colliders.js';
import { makeRandom } from './world/noise.js';
import { StealthProfile } from './player/stealth.js';
import { Body } from './player/body.js';
import { Fires } from './world/fires.js';
import { sampleEnvironment } from './world/environment.js';
import { insulationOf } from './items/registry.js';
import { RECIPES, bestAvailable, craft } from './items/recipes.js';
import { SURVIVAL } from './config.js';
import { Wildlife } from './creatures/manager.js';
import { Weather } from './world/weather.js';
import { Rain } from './fx/rain.js';
import { ActiveRuleset, RULESETS, DEFAULT_MODE } from './modes/ruleset.js';
import { captureSave, applySave, writeSave, readSave, describeSave, clearSave } from './persistence/save.js';

// ── renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  antialias: false, // SMAA runs in post; MSAA would not survive the composer
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, POST.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = SKY.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  FEEL.fovBase,
  window.innerWidth / window.innerHeight,
  0.1,
  6000
);

const hud = new Hud();
const _drop = new THREE.Vector3(); // scratch: which way a dropped item is tossed
const _lootRand = makeRandom('drops');
/** Inclusive integer in [a, b], from the seeded drop stream. */
const lerpRand = (a, b) => a + _lootRand() * (b - a);

let booted = false;

/** Never fail silently — a black screen with nothing in the console is the worst
 *  possible outcome, so surface a genuine startup failure on the page itself. */
function fatal(err) {
  console.error('Highlands failed to start:', err);
  const box = document.createElement('pre');
  box.style.cssText =
    'position:fixed;inset:24px;z-index:99;overflow:auto;padding:20px;' +
    'background:rgba(20,6,6,.94);color:#ffb4a0;border:1px solid #7a3a30;' +
    'border-radius:8px;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap';
  box.textContent = `Highlands failed to start\n\n${err?.stack || err}`;
  document.body.appendChild(box);
}

/**
 * Once the world is up, a stray error is NOT a startup failure and must not
 * throw a full-screen panel over a perfectly good view. Log it, mention it
 * quietly, and carry on.
 */
function report(err) {
  if (!booted) return fatal(err);
  console.error('Highlands:', err);
  hud.toast('something went wrong — see the console', 3);
}
window.addEventListener('error', (e) => report(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => report(e.reason));

// The heavy build is synchronous (~half a second of noise evaluation), so yield
// once first — otherwise the browser never paints the start screen.
//
// setTimeout rather than requestAnimationFrame on purpose: rAF does not fire at
// all in a hidden or background tab, so an rAF-gated boot leaves you with a
// blank page until the tab is focused. The render loop below *does* use rAF,
// which is correct — there is no reason to draw a world nobody is looking at.
setTimeout(() => {
  try {
    boot();
  } catch (err) {
    fatal(err);
  }
}, 0);

function boot() {
  // ── world ──
  const atmosphere = new Atmosphere(scene, renderer);
  const terrain = new Terrain(scene);
  const lake = new Lake(scene);
  const landmarks = buildLandmarks(scene);
  const scatter = new Scatter(scene);
  scatter.setClearings(landmarks.clearings);

  // ── compose the opening shot ──
  const sunH = atmosphere.sunHorizontal(new THREE.Vector3());
  const spawn = pickSpawn(sunH);

  const ctrl = new Controller();
  const input = new PlayerInput(renderer.domElement);
  ctrl.teleport(spawn.position, spawn.yaw);
  const feel = new CameraFeel();

  // Have the whole visible world present on frame one — no popping in.
  terrain.buildImmediate(spawn.position.x, spawn.position.z);
  scatter.update(spawn.position, 0);

  // Circle the birds over the monolith ridge if this seed sited one.
  const anchor = landmarks.sites.monoliths
    ? new THREE.Vector3(landmarks.sites.monoliths.x, 0, landmarks.sites.monoliths.z)
    : spawn.position.clone();
  const life = new AmbientLife(scene, anchor, renderer);

  const composer = new Composer(renderer, scene, camera);
  const audio = new Soundscape();

  // ── items, weapons, projectiles ─────────────────────────────────────────
  // Two collider fields: the scatter's is rebuilt every 55 m as vegetation
  // re-places, the landmarks' is built once and never changes.
  const scatterColliders = new ColliderField(14);
  const staticColliders = new ColliderField(24);
  scatter.colliders = scatterColliders;
  scatter.rebuildColliders();
  addStaticGroup(staticColliders, landmarks.root, 'stone');

  const inventory = new Inventory(LOADOUT.slots, LOADOUT.equipped);
  const viewmodel = new ViewModel();
  viewmodel.setSize(window.innerWidth, window.innerHeight);

  const pickups = new Pickups(scene, { inventory, audio, projectiles: null });
  const stealth = new StealthProfile();
  const weather = new Weather();
  const rain = new Rain(scene);

  const fires = new Fires(scene, { audio });

  const vitals = new Body({
    onWarning: (text) => hud.toast(text, 3),
    onDamage: (amount) => {
      audio.playerHurt(Math.min(1, amount / 40));
      feel.shake(0.75);
      weapons.cancel(); // a mauling makes you lose the draw
    },
    onDeath: () => {
      weapons.cancel();
      hud.setPrompt(null);
    },
    onRespawn: () => {
      ctrl.teleport(spawn.position, spawn.yaw);
      // Wake up unhunted — otherwise the bear is simply waiting for you.
      for (const c of wildlife.creatures) {
        c.awareness = 0;
        c.charging = false;
        c.chargeTime = 0;
      }
      hud.toast('you wake at the lake, shaken', 3);
    },
  });

  const wildlife = new Wildlife(scene, {
    stealth,
    audio,
    onAttack: (creature) => {
      const dmg = creature.species.aggression?.damage ?? 0;
      vitals.damage(dmg, creature);
    },
  });

  const projectiles = new Projectiles(scene, {
    colliders: [scatterColliders, staticColliders],
    wildlife,
    audio,
    onLanded: (p) => pickups.registerRecoverable(p),
    onRemoved: (p) => pickups.forgetProjectile(p),
    onCreatureHit: (creature, result, point) => {
      if (result.killed) {
        hud.toast(`${creature.species.name} down — ${result.zone}`, 2.2);
        // Drop table straight into the existing pickup system.
        for (const d of creature.species.drops) {
          const n = Math.round(lerpRand(d.min, d.max));
          if (n > 0) pickups.drop(d.item, n, creature.position, _drop.set(0, 0, 0));
        }
      } else {
        hud.toast(`hit — ${result.zone}`, 1.2);
      }
    },
  });
  pickups.deps.projectiles = projectiles;

  const weapons = new WeaponHost({
    camera,
    controller: ctrl,
    inventory,
    projectiles,
    audio,
    rand: makeRandom('combat'),
    onDryFire: () => {
      audio.dryFire();
      hud.toast('out of arrows — look for a quiver', 2);
    },
  });

  /**
   * Put a herd on the waterline in front of the spawn point.
   *
   * Walks outward from the lake centre toward the player until the ground rises
   * clear of the water, then places the herd just inland of that — so they are
   * standing at the water's edge, roughly 30 m ahead and in view on frame one.
   */
  function herdAtWater(count = WILDLIFE.testHerdAtLake) {
    if (!count) return [];
    const dx = spawn.position.x - LAKE.x;
    const dz = spawn.position.z - LAKE.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    for (let r = LAKE.radius * 0.15; r < LAKE.radius * 1.3; r += 2) {
      const x = LAKE.x + ux * r;
      const z = LAKE.z + uz * r;
      if (heightAt(x, z) > WATER_LEVEL + 0.5) {
        return wildlife.spawnHerd('deer', LAKE.x + ux * (r + 7), LAKE.z + uz * (r + 7), count, 11);
      }
    }
    return [];
  }
  /**
   * Put a bear near the spawn point, off to one side of the opening view.
   *
   * Deliberately not dead ahead and deliberately outside its aggro range: the
   * whole point of the encounter is seeing it first and choosing. Tries a
   * spread of bearings and takes the first that is on dry, standable ground.
   */
  function bearNearSpawn(distance = WILDLIFE.testBearAt) {
    if (!distance) return null;
    const eye = spawn.position.y + PLAYER.eyeHeight;
    let best = null;

    for (const deg of [30, -30, 46, -46, 62, -62, 14, -14, 78, -78, 100, -100, 130, -130]) {
      const a = spawn.yaw + THREE.MathUtils.degToRad(deg);
      const x = spawn.position.x - Math.sin(a) * distance;
      const z = spawn.position.z - Math.cos(a) * distance;
      const y = heightAt(x, z);
      if (y < WATER_LEVEL + 1.5) continue;

      // Reject spots hidden behind a rise: walk the sight line and check
      // nothing between here and there stands above it. A bear you cannot see
      // is useless for testing, however correctly it is placed.
      let blocked = false;
      for (let t = 0.15; t < 0.95; t += 0.08) {
        const sx = spawn.position.x + (x - spawn.position.x) * t;
        const sz = spawn.position.z + (z - spawn.position.z) * t;
        if (heightAt(sx, sz) > eye + (y + 1.4 - eye) * t + 1.2) {
          blocked = true;
          break;
        }
      }
      // Prefer visible, then open ground, then straight ahead of you.
      const score = (blocked ? -100 : 0) + y * 0.15 - Math.abs(deg) * 0.05;
      if (!best || score > best.score) best = { x, z, score, blocked, deg };
    }

    if (!best) return null;
    return wildlife.spawn('bear', best.x, best.z);
  }

  herdAtWater();
  bearNearSpawn();

  const itemName = (id) => getItem(id)?.name ?? id;

  /**
   * What would E do, standing here?
   *
   * One resolver, used for BOTH the prompt and the action, so the two can never
   * disagree — which they did when picking up was hardcoded to win: with
   * deadfall scattered everywhere there was almost always something in range,
   * and the fire beside you was unreachable.
   *
   * Resolution is by distance, so whatever you are closest to is what you get.
   */
  function resolveInteraction() {
    const near = pickups.nearest; // set by pickups.update, carries .distance
    const fire = fires.nearest(ctrl.position, 3.4);
    const fireDist = fire
      ? Math.hypot(fire.position.x - ctrl.position.x, fire.position.z - ctrl.position.z)
      : Infinity;

    if (near && near.distance <= fireDist) {
      const label = `<b>E</b>  pick up ${itemName(near.item)}${near.count > 1 ? ` ×${near.count}` : ''}`;
      return { label, run: () => pickups.collect() };
    }
    if (!fire) return null;

    // A fire burning down is the urgent thing; otherwise it is a workbench.
    if (inventory.countOf('wood') > 0 && fire.fuel < fire.maxFuel * 0.35) {
      return {
        label: '<b>E</b>  feed the fire',
        run: () => {
          inventory.remove('wood', 1);
          fires.addFuel(fire);
          return 'fed the fire';
        },
      };
    }
    const recipe = bestAvailable('fire', inventory);
    if (recipe) {
      return {
        label: `<b>E</b>  ${recipe.verb} · ${recipe.name.toLowerCase()}`,
        run: () => {
          const made = craft(recipe, inventory);
          return made ? `${recipe.verb} — ${made}` : null;
        },
      };
    }
    if (inventory.countOf('wood') > 0) {
      return {
        label: '<b>E</b>  feed the fire',
        run: () => {
          inventory.remove('wood', 1);
          fires.addFuel(fire);
          return 'fed the fire';
        },
      };
    }
    return { label: '<b>E</b>  nothing to work with', run: () => null };
  }
  let interaction = null;
  function refreshItemUi() {
    weapons.sync(inventory);
    viewmodel.setItem(inventory.equippedSlot?.item ?? null);
    hud.setHotbar(inventory, itemName);
  }
  inventory.onChange = refreshItemUi;
  refreshItemUi();

  // If pointer lock is refused, say so once and switch to drag-look rather
  // than leaving the player unable to turn their head.
  input.onLockUnavailable = () => hud.useDragLook();

  // ── game mode and persistence ───────────────────────────────────────────
  const ruleset = new ActiveRuleset(DEFAULT_MODE);

  const saveContext = () => ({
    seed: SEED,
    mode: ruleset.id,
    atmosphere, weather, ctrl, inventory, vitals, projectiles, pickups, wildlife, fires,
    onPlayerMoved: (pos) => {
      // Stream the world in around wherever the save put us before the first
      // frame, so a loaded run never opens on empty ground.
      terrain.buildImmediate(pos.x, pos.z);
      scatter.update(pos, time);
    },
  });

  let saveTimer = 0;
  function saveNow(reason = 'auto') {
    if (!ruleset.current.persist) return false;
    const ok = writeSave(captureSave(saveContext()));
    if (ok && reason === 'manual') hud.toast('saved', 1.2);
    return ok;
  }

  hud.wire(
    Object.values(RULESETS).map((r) => ({ id: r.id, name: r.name, tagline: r.tagline })),
    describeSave('survival', SEED),
    (mode, continuing) => {
      ruleset.set(mode);
      audio.start();

      if (continuing) {
        const data = readSave('survival');
        if (data) {
          applySave(data, saveContext());
          hud.toast(`resumed · ${atmosphere.clockText}`, 2.5);
        }
      } else if (ruleset.current.persist) {
        // A fresh run replaces whatever was saved for this mode.
        clearSave(mode);
      }

      hud.setMode(ruleset.current);
      input.requestLock();
    },
    () => input.requestLock()
  );

  // Last-ditch save when the tab goes away. `pagehide` fires in cases
  // `beforeunload` does not, notably on mobile and on tab discard.
  window.addEventListener('pagehide', () => saveNow('exit'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow('exit');
  });

  // ── action keys ──
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Match the CHARACTER as well as the physical key. On a non-US layout the
    // key at the `Slash` position is not `?` at all, so testing the code alone
    // leaves those keyboards with no way to open the controls.
    if (e.key === '?') {
      hud.toggleKeys();
      return;
    }
    switch (e.code) {
      case 'KeyF':
        if (!ruleset.allows('allowFly')) {
          hud.toast('you have only your legs here', 1.6);
          break;
        }
        hud.toast(ctrl.toggleFly() ? 'free-fly on — Space / Ctrl for up and down' : 'free-fly off');
        break;
      case 'KeyH':
        hud.toggleHidden();
        break;
      case 'KeyP':
        hud.requestScreenshot();
        break;
      case 'KeyM':
        hud.toast(audio.toggleMute() ? 'muted' : 'sound on');
        break;
      case 'BracketLeft':
      case 'BracketRight':
        if (!ruleset.allows('allowTimeControl')) {
          hud.toast('the sun keeps its own hours', 1.6);
          break;
        }
        atmosphere.nudge(e.code === 'BracketLeft' ? -1 : 1);
        hud.toast(`${atmosphere.clockText} · sun ${atmosphere.elevation.toFixed(0)}°`, 1);
        break;
      case 'KeyT':
        if (!ruleset.allows('allowTimeControl')) {
          hud.toast('the sun keeps its own hours', 1.6);
          break;
        }
        hud.toast(atmosphere.toggleClock() ? 'time running' : `time frozen at ${atmosphere.clockText}`, 2);
        break;
      case 'F5':
        // Manual save, for when you are about to do something ill-advised.
        if (ruleset.current.persist) {
          e.preventDefault();
          saveNow('manual');
        }
        break;
      case 'Tab':
        // The discoverable one. Prevented, or it walks browser focus instead.
        e.preventDefault();
        hud.toggleKeys();
        break;
      case 'Slash':
        if (e.shiftKey) hud.toggleKeys();
        break;
      case 'KeyB':
        hud.toast(`bloom ${composer.toggle('bloom') ? 'on' : 'off'}`);
        break;
      // E, Q and the number row are handled as intents now — see the tick.
      default:
        break;
    }
  });

  // ── weapon trigger ──
  // Left mouse only. Drag-look lives on the right button (see player/input.js),
  // so the trigger means the same thing with or without pointer lock. The held
  // state is stored on the input object and read into the intent each tick.
  let primaryWasHeld = false;
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.primaryHeld = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.primaryHeld = false;
  });
  // Releasing the mouse outside the window must not leave the bow drawn.
  window.addEventListener('blur', () => {
    input.primaryHeld = false;
    primaryWasHeld = false;
    weapons.cancel();
  });
  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      inventory.cycle(Math.sign(e.deltaY));
      e.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener('pointerlockchange', () => {
    hud.setLocked(document.pointerLockElement === renderer.domElement);
  });

  /**
   * Match the drawing buffer to the window.
   *
   * Polled every frame rather than driven only by the `resize` event, because
   * a page that loads in a background or not-yet-laid-out tab reports an inner
   * size of 0, and a renderer built at 0x0 produces an incomplete framebuffer
   * that never recovers — no resize event ever fires to fix it. Checking two
   * integers per frame is free, and it also covers devtools opening, zoom
   * changes and anything else that moves the viewport without an event.
   */
  const _size = new THREE.Vector2();
  function syncSize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    renderer.getSize(_size);
    if (_size.x === w && _size.y === h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    viewmodel.setSize(w, h);
  }
  window.addEventListener('resize', syncSize);

  // ── the loop ────────────────────────────────────────────────────────────
  let last = performance.now();
  let time = 0;

  /** One simulation + render step. Split out so it can be driven manually. */
  function stepWorld(dt) {
    syncSize();
    time += dt;

    // ── gather this tick's intent ──
    // The single place player will becomes simulation input. A network packet
    // or an LLM agent would substitute here and nothing below would notice.
    const intent = vitals.dead ? IDLE_INTENT : sanitiseIntent(input.poll());

    // The trigger is edge-detected from the INTENT rather than straight off the
    // mouse event, so this is the same code path the headless sim and (later) a
    // server take. The mouse only sets a flag; the tick decides what it means.
    if (intent.primary !== primaryWasHeld) {
      primaryWasHeld = intent.primary;
      if (intent.primary) weapons.beginPrimary();
      else weapons.endPrimary();
    }

    if (intent.selectSlot >= 0) inventory.select(intent.selectSlot);

    if (intent.interact && interaction) {
      const msg = interaction.run();
      if (msg) hud.toast(msg, 1.6);
    }

    // ── light a fire ──
    if (intent.place) {
      if (inventory.countOf('wood') < 1) {
        hud.toast('you need a branch to build a fire', 2);
      } else {
        camera.getWorldDirection(_drop).setY(0).normalize();
        const fx = ctrl.position.x + _drop.x * 1.6;
        const fz = ctrl.position.z + _drop.z * 1.6;
        const result = fires.light(fx, fz);
        if (result.ok) {
          inventory.remove('wood', 1);
          hud.toast('a fire', 1.6);
        } else {
          hud.toast(result.why, 2);
        }
      }
    }

    // ── eat ──
    if (intent.eat) {
      // Cooked first: it fills you more, and eating the good food last is a
      // mistake the interface should not let you make by accident.
      const order = ['venison_cooked', 'venison', 'berries'];
      const found = order.find((id) => inventory.countOf(id) > 0);
      if (!found) hud.toast('nothing to eat', 1.4);
      else {
        const filled = vitals.eat(found);
        if (filled > 0) {
          inventory.remove(found, 1);
          hud.toast(`ate ${itemName(found)}`, 1.4);
        } else hud.toast('you are full', 1.2);
      }
    }
    if (intent.drop) {
      const taken = inventory.takeEquipped();
      if (taken) {
        camera.getWorldDirection(_drop).setY(0).normalize();
        pickups.drop(taken.item, taken.count, ctrl.position, _drop);
        hud.toast(`dropped ${taken.count} ${itemName(taken.item)}`, 1.4);
      }
    }

    // ── the elements ──
    // Sampled once per frame at the player, then handed to the body. Creatures
    // and, later, shelter placement will read the same query.
    fires.update(dt, weather);
    const env = sampleEnvironment(ctrl.position, {
      hours: atmosphere.hours,
      sunAltitude: atmosphere.elevation,
      weather,
      fires,
    });
    const weaponState0 = weapons.getState();
    vitals.update(dt, {
      ctrl,
      env,
      insulationC: insulationOf(inventory),
      drawing: !!weaponState0?.drawing,
      enabled: ruleset.current.survival,
    });

    // Weapons run before movement so a drawn bow slows you this frame, not next.
    weapons.update(dt);
    // Dead men do not walk. Cold, hunger and exhaustion slow the living.
    ctrl.speedScale = vitals.dead
      ? 0
      : weapons.moveScale * (ruleset.current.survival ? vitals.speedScale : 1);
    // Out of breath means no sprinting until you have some back.
    if (ruleset.current.survival && vitals.sprintBlocked) intent.sprint = false;

    ctrl.update(dt, intent);
    feel.update(dt, ctrl, camera, weapons.fovOffset);

    // Weather first: the sky, the grass and the scent model all read from it.
    weather.update(dt);
    atmosphere.setWeather(weather);
    stealth.setWeather(weather);
    audio.setWeather(weather);
    scatter.setWind(weather.windDir.x, weather.windDir.y, weather.wind);

    terrain.update(ctrl.position.x, ctrl.position.z);
    scatter.update(ctrl.position, time);
    atmosphere.tick(dt);
    atmosphere.update(camera.position, time);
    rain.update(dt, camera.position, weather.rain, weather.windDir, weather.wind);
    lake.update(dt, camera.position, atmosphere.sun);
    life.update(dt, time, camera.position);
    stealth.update(dt, ctrl);
    wildlife.update(dt, ctrl.position, stealth);
    projectiles.update(dt);

    pickups.update(dt, ctrl.position);
    interaction = resolveInteraction();
    hud.setPrompt(interaction ? interaction.label : null);

    const weaponState = weapons.getState();
    hud.setCrosshair(vitals.dead ? null : weaponState, weapons.spreadHint);
    hud.setVitals(vitals);
    hud.setNeeds(vitals, ruleset.current.survival);
    viewmodel.update(dt, ctrl, weaponState, atmosphere.sun, camera.quaternion);

    audio.update(dt, ctrl, ctrl.position.y);

    // Autosave on a timer. Cheap — a save is a few kilobytes of diffs.
    if (ruleset.current.persist && ruleset.current.autosaveSeconds > 0) {
      saveTimer += dt;
      if (saveTimer >= ruleset.current.autosaveSeconds) {
        saveTimer = 0;
        saveNow('auto');
      }
    }

    const wl = wildlife.stats;
    const pr = projectiles.stats;
    hud.update(
      dt,
      `${atmosphere.clockText} · ${weather.label} · wind ${weather.bearingText} · ` +
        `${wl.alive} alive (${wl.alert} alert) · ${stealth.label}`
    );

    composer.render(dt, time);
    // The viewmodel draws last, onto a cleared depth buffer, so it can never
    // clip into the world and never picks up the bloom or grain.
    viewmodel.render(renderer);
    hud.captureIfPending(renderer);
  }

  function frame(now) {
    // Clamped so that returning from a background tab does not teleport you.
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    stepWorld(dt);
    requestAnimationFrame(frame);
  }
  /** Wrap a debug helper so it refuses in modes that disallow it. */
  function gate(capability, fn, what) {
    return (...args) =>
      ruleset.allows(capability) ? fn(...args) : `${what} is disabled in ${ruleset.current.name}`;
  }

  requestAnimationFrame(frame);
  booted = true;

  // A small handle for poking at the world from the console. `stepWorld` is
  // exposed because rAF is suspended in a hidden tab, and being able to advance
  // and render one frame by hand makes the thing testable from a script.
  window.highlands = {
    scene, camera, renderer, ctrl, input, feel, atmosphere, terrain, scatter, lake,
    composer, life, audio, hud, spawn, landmarks, stepWorld, heightAt,
    inventory, weapons, projectiles, pickups, viewmodel, wildlife, stealth, weather, rain,
    /**
     * Pin the weather. `highlands.setWeather('rain')`, or omit the argument to
     * hand control back to the state machine.
     */
    setWeather(name) {
      if (!ruleset.allows('allowWeatherControl')) return 'the weather does as it likes in Survival';
      const names = Object.keys(WEATHER.states);
      if (name === undefined) {
        weather.hold = 1;
        return `released — cycling again from ${weather.stateName}`;
      }
      if (!names.includes(name)) return `unknown state. try: ${names.join(', ')}`;
      const cfg = WEATHER.states[name];
      weather.stateName = name;
      weather.nextName = name;
      weather.blend = 1;
      weather.hold = Infinity; // held until released
      weather.cloud = cfg.cloud;
      weather.fog = cfg.fog;
      weather.wind = cfg.wind;
      weather.rain = cfg.rain;
      return `weather pinned to ${name}`;
    },
    vitals, body: vitals, ruleset, fires,
    /** What it is like where you are standing. */
    conditions: () => {
      const env = sampleEnvironment(ctrl.position, {
        hours: atmosphere.hours,
        sunAltitude: atmosphere.elevation,
        weather,
        fires,
      });
      return {
        where: env.describe(),
        airC: +env.airC.toFixed(1),
        feltC: +vitals.feltC.toFixed(1),
        effectiveC: +vitals.effectiveC.toFixed(1),
        coreC: +vitals.coreC.toFixed(2),
        hunger: +vitals.hunger.toFixed(1),
        stamina: +vitals.stamina.toFixed(1),
        wetness: +vitals.wetness.toFixed(2),
        insulation: +vitals.insulationC.toFixed(1),
        exposure: +env.exposure.toFixed(2),
        wind: +env.windStrength.toFixed(2),
        fires: fires.stats,
      };
    },

    // ── persistence ──
    save: () => (saveNow('manual') ? 'saved' : 'saving is off in this mode'),
    loadSave: () => {
      const data = readSave(ruleset.id);
      if (!data) return 'no save for this mode';
      applySave(data, saveContext());
      return `loaded · ${atmosphere.clockText}`;
    },
    wipeSave: () => (clearSave(ruleset.id), `cleared the ${ruleset.current.name} save`),
    peekSave: () => readSave(ruleset.id),

    // ── sandbox tools ──
    // Gated rather than hidden: in Survival these say no, which is far less
    // confusing than a function that appears to work and does nothing.
    herdAtWater: gate('allowSpawning', herdAtWater, 'spawning'),
    bearNearSpawn: gate('allowSpawning', bearNearSpawn, 'spawning'),
    spawnBear: gate(
      'allowSpawning',
      (distance = 45) => {
        const a = Math.random() * Math.PI * 2;
        const x = ctrl.position.x + Math.cos(a) * distance;
        const z = ctrl.position.z + Math.sin(a) * distance;
        return wildlife.spawn('bear', x, z);
      },
      'spawning'
    ),
    colliders: { scatter: scatterColliders, static: staticColliders },
    get time() { return time; },

    /**
     * Render one frame and save it to `shots/<name>.jpg` via the dev server.
     * Rendering and reading the pixels must happen in the same task — without
     * `preserveDrawingBuffer` the buffer is gone the moment we yield.
     */
    capture(name, quality = 0.9) {
      stepWorld(1 / 60);
      const url = renderer.domElement.toDataURL('image/jpeg', quality);
      const bin = atob(url.slice(url.indexOf(',') + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: bytes })
        .then((r) => `${name}: ${r.ok ? 'saved' : 'failed'} (${bytes.length} bytes)`);
    },

    /** Jump somewhere and have the world fully present, for tests and photos. */
    warp(x, z, yaw, pitch = 0, y = null) {
      if (!ruleset.allows('allowWarp')) return 'teleporting is disabled in Survival';
      ctrl.flying = y !== null;
      ctrl.position.set(x, y ?? heightAt(x, z), z);
      ctrl.velocity.set(0, 0, 0);
      ctrl.yaw = ctrl.targetYaw = yaw;
      ctrl.pitch = ctrl.targetPitch = pitch;
      terrain.buildImmediate(x, z);
      scatter.update(ctrl.position, time);
      for (let i = 0; i < 6; i++) stepWorld(1 / 60);
    },
  };
  console.info(
    `Highlands — seed "${SEED}", quality "${QUALITY}", ` +
      `${Q.viewChunks * 2 + 1}² chunks, spawn ${spawn.position.x.toFixed(0)}, ${spawn.position.z.toFixed(0)}`
  );
}
