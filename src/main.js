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
import { checkInput } from './player/inputCheck.js';
import { describeMorale } from './creatures/morale.js';
import { strangenessAt, describeStrangeness, darkness } from './world/strangeness.js';
import {
  districtAt,
  describePosition,
  findDistrict,
  nearbyDistricts,
  bearingName,
} from './world/placenames.js';
import { sanitiseIntent, IDLE_INTENT, createIntent, clearIntent } from './sim/intents.js';
import { setScarcity } from './world/scarcity.js';
import { CameraFeel } from './player/cameraFeel.js';
import { ViewModel } from './player/viewmodel.js';
import { Soundscape } from './audio/soundscape.js';
import { Hud } from './ui/hud.js';
import { LOADOUT, LAKE, PLAYER, WATER_LEVEL, WEATHER, WILDLIFE, SITES, STRUCTURES, TIME, OTTER, AXE, FISH } from './config.js';
import { Inventory } from './items/inventory.js';
import { getItem, EDIBLE } from './items/registry.js';
import { WeaponHost } from './weapons/index.js';
import { AimMark } from './weapons/aimMark.js';
import { Projectiles } from './world/projectiles.js';
import { Pickups } from './world/pickups.js';
import { ColliderField, addStaticGroup } from './world/colliders.js';
import { makeRandom } from './world/noise.js';
// `clamp` and `damp` are used by the riding code. main.js had never needed a
// maths helper before, so there was no import here at all and mounting the
// hippo threw ReferenceError inside the frame loop — every frame, with no
// recovery, which is a dead game rather than a glitch.
import { clamp, damp } from './util/math.js';
import { StealthProfile } from './player/stealth.js';
import { Body } from './player/body.js';
import { Fires } from './world/fires.js';
import { Sites } from './world/sites.js';
import { Caves } from './world/caves.js';
import { Structures, Harvest, BUILDABLE } from './world/structures.js';
import { Companion, ATTACK as COMPANION_ATTACK } from './creatures/companion.js';
import { COMPANIONS, COMPANION_IDS } from './creatures/companions.js';
import { Fish } from './world/fish.js';
import { buildBook, amountText } from './ui/book.js';
import { launch, stepGlide, canLaunch, flightReport, carryReport } from './world/glider.js';
import { DANGER_LEVELS, bannedSpecies, readDanger, writeDanger, getDangerLevel } from './modes/danger.js';
import { GLIDER } from './config.js';
import { NetClient } from './net/client.js';
import { Avatars } from './net/avatars.js';
import { RemoteLoot } from './net/remoteloot.js';
import { PetAvatars } from './net/petavatars.js';
import { sampleEnvironment } from './world/environment.js';
import { insulationOf } from './items/registry.js';
import { RECIPES, bestAvailable, craft } from './items/recipes.js';
// NET is read by the drift reconciliation in `onSnapshot`. IT WAS USED AND NOT
// IMPORTED, which a bundler does not catch — a bare identifier is assumed to be
// a global — so the build was green and EVERY SNAPSHOT threw
// "ReferenceError: NET is not defined", dropping the game to the title screen
// with the clock, the weather and the fires frozen. See `lockcheck`'s sibling
// `importcheck`, added in the same commit.
import { AUDIO, SURVIVAL, NET, SOCIAL } from './config.js';
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
const _kill = new THREE.Vector3(); // scratch: where the server says an animal fell
const _lootRand = makeRandom('drops');

/**
 * Everything you can eat, best meal first.
 *
 * Built once from SURVIVAL.food so that adding a food to that table is the
 * only thing anyone ever has to do. The alternative — a hand-written order
 * alongside the table — is what made trout inedible the moment they were added.
 */

// Its own stream, so poking at the sandbox tools never shifts the loot rolls.
const sandboxRand = makeRandom('sandbox');
/** Inclusive integer in [a, b], from the seeded drop stream. */
const lerpRand = (a, b) => a + _lootRand() * (b - a);

let booted = false;

/**
 * Which animal the player chose. Set by the start screen before boot runs, so
 * the companion exists from the first frame rather than being swapped in.
 */
let chosenCompanion = 'otter';

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

  /**
   * A creature has died; put its drop table on the ground.
   *
   * Extracted the moment there were two ways to kill something. It lived
   * inline in the arrow's hit handler, and an axe kill would have quietly
   * dropped nothing at all — the kind of bug that looks like a balance
   * decision for a week.
   */
  function dropLootFor(creature) {
    for (const d of creature.species.drops ?? []) {
      const n = Math.round(lerpRand(d.min, d.max));
      if (n > 0) pickups.drop(d.item, n, creature.position, _drop.set(0, 0, 0));
    }
  }
  const stealth = new StealthProfile();
  const weather = new Weather();
  const rain = new Rain(scene);

  // `roofedAt` is a lambda rather than a direct reference because `structures`
  // is built three lines below this one — it is only ever called from a tick,
  // by which time it exists. A fire under a lean-to is not rained on; see the
  // note in fires.js `update`.
  // ── the torch you carry ──
  // One light, made once and moved to the camera each frame rather than created
  // and destroyed as it is lit — a PointLight added mid-frame recompiles every
  // material that can see it, which is a visible hitch.
  const torch = {
    lit: false,
    left: 0,
    // Burn time carried in from a torch picked up off the ground, waiting for a
    // frame that finds one in hand.
    pending: 0,
    light: new THREE.PointLight(0xffb257, 0, SURVIVAL.torchRange, 1.7),
  };
  torch.light.visible = false;
  scene.add(torch.light);

  // ── TORCHES LYING ON THE GROUND, STILL BURNING ──
  //
  // Ben's ask, and the most interesting part of it: "when you drop them they
  // should stay burning and light the area they are in and be visible to pick
  // back up."
  //
  // A torch you can put down is a MARKER. It is the first thing in this world
  // that lets two people agree on a place without either of them being there —
  // you can light a path, mark a cache, or leave one burning where you said you
  // would meet. Everything else here is carried or consumed.
  //
  // Each one owns its own light and rides on the pickup entry `pickups.drop`
  // hands back, so "has somebody taken it" is a question with an exact answer:
  // `collect` splices that entry out of `pickups.dropped`, so if it is no longer
  // in the list, it is in somebody's pack.
  const ground = [];
  const dropTorch = (at, left) => {
    const entry = pickups.drop('torch', 1, at, _drop);
    if (!entry) return;
    const light = new THREE.PointLight(0xffb257, 0, SURVIVAL.torchRange, 1.7);
    light.position.copy(entry.obj.position);
    light.position.y += 0.25;
    scene.add(light);
    ground.push({ entry, light, left });
  };

  const fires = new Fires(scene, {
    audio,
    roofedAt: (x, z) => structures.roofedAt(x, z),
  });
  const sites = new Sites(scene, { audio });
  const caves = new Caves(scene);
  const structures = new Structures(scene, { audio, colliders: staticColliders });
  const harvest = new Harvest();

  // ── the pet ─────────────────────────────────────────────────────────────
  //
  // Placed near the water, because that is where otters are, and left wild.
  // It becomes yours by being looked after, not by being found.
  // Which animal you chose on the start screen. Defaults to the otter so a
  // reload straight into the world still has a companion.
  const pet = new Companion(chosenCompanion, new THREE.Vector3(0, 0, 0), makeRandom('pet'));
  scene.add(pet.object);
  const fish = new Fish(scene);
  let petTrick = 0; // which command Z has selected
  // The kangaroo's pouch and the hippo's back: both are state that belongs to
  // the player rather than to the animal, so they live here.
  const pouch = [];
  let riding = false;
  // How high you sit. A hippo's back is about a metre and a half up, and the
  // eye height on top of that is what makes riding one feel like riding one.
  const RIDE_HEIGHT = 1.55;

  /** Somewhere on the shore, in front of where you wake up. */
  function placeOtter() {
    const dx = spawn.position.x - LAKE.x;
    const dz = spawn.position.z - LAKE.z;
    const len = Math.hypot(dx, dz) || 1;
    for (let r = 6; r < 40; r += 2) {
      const x = spawn.position.x - (dx / len) * r + 3;
      const z = spawn.position.z - (dz / len) * r + 3;
      const y = heightAt(x, z);
      if (y > WATER_LEVEL - 0.2 && y < WATER_LEVEL + 2.5) {
        pet.position.set(x, y, z);
        return;
      }
    }
    pet.position.copy(spawn.position);
    pet.position.x += 6;
  }
  placeOtter();
  // A monotonically rising in-game hour count. The clock itself wraps at 24,
  // which is useless for "this tree regrows in thirty hours" — the expiry
  // would be in the past every morning.
  let totalHours = 0;

  // ── multiplayer ───────────────────────────────────────────────────────────
  //
  // Opt-in by URL, so single-player is byte-for-byte the game it was:
  //
  //   ?join=ws://192.168.1.20:8080&name=Ben
  //
  // When connected, the LOCAL player still simulates itself locally for a
  // responsive feel, but everything else on screen — other people, creatures,
  // arrows — is drawn from server snapshots, interpolated. The server remains
  // the only authority; the local prediction is a courtesy to the eye, not a
  // claim about the world.
  const params = new URLSearchParams(location.search);
  const joinUrl = params.get('join');

  // ── ?solid=on — the same switch the server takes as SOLID=on ──
  //
  // OFF by default and off is the movement path this game shipped with, to the
  // byte. On, this body cannot walk through a trunk, a boulder, a standing
  // stone or a palisade.
  //
  // MATCH THE SERVER OR DO NOT SET IT. This is the PREDICTION side: turning it
  // on here while the server has it off means the browser stops you at a tree
  // the server walked you through, and you get rubber-banded — which looks
  // exactly like lag and is not. Both fields go in, because a browser knows
  // about structures and standing stones and the server has never held either.
  if (/^(on|yes|1|true)$/i.test(params.get('solid') ?? '')) {
    ctrl.solids = [scatterColliders, staticColliders];
    console.log('  solid: trunks, boulders and stone stop this body');
  }
  const avatars = new Avatars(scene);
  // What everybody else has put on the ground. Presentation only — see the note
  // at the top of remoteloot.js.
  const remoteLoot = new RemoteLoot(scene);
  // Their animals as well as them. Six months of otter and nobody but its owner
  // could see it; this is the group that fixes that.
  const petAvatars = new PetAvatars(scene);
  let net = null;

  /**
   * The one set of handlers, for both ways of joining.
   *
   * WRITTEN TWICE ONCE, AND THE COPIES DRIFTED. There were two of these: this
   * one, for `?join=`, and a second inside `highlands.join()` for joining from
   * the console without reloading. The console copy toasted and did nothing
   * else — no `teleport` — so a client that joined that way kept the body its
   * own `pickSpawn` had chosen while the server walked a different one about,
   * and every distance either of them measured was between two coordinate
   * origins. Measured at 415.96 m against a server staged with `HOURS=1`, which
   * is where "your body is not where the server thinks it is" came from. One
   * function now, so the next thing added to it cannot land on only one path.
   */
  function netHandlers() {
    return {
      onWelcome: (data) => {
        hud.toast(`joined — ${data.players.length + 1} here`, 3);
        // ── how much this valley has, as the SERVER has it ──
        //
        // Firewood is drawn here from a pure function of the seed, so a lean
        // server and a plentiful client paint different branches: you would
        // walk to one and press E on bare ground. One number, taken on the way
        // in. Absent (an older server) means the world as it always was.
        setScarcity(data.scarcity ?? null);
        if (data.scarcity?.plenty !== undefined && data.scarcity.plenty !== 1) {
          hud.chat(null, 'the country here is lean — fuel and game are thin, and not evenly spread');
        }
        pickups.reconsider();
        // The server's spawn is authoritative; take it rather than the one
        // this client would have picked, or two people stand in different
        // places and each thinks the other is wrong.
        ctrl.teleport(
          new THREE.Vector3(data.spawn.p[0], data.spawn.p[1], data.spawn.p[2]),
          data.spawn.y
        );
        terrain.buildImmediate(ctrl.position.x, ctrl.position.z);
      },
      // Into the chat column, not the toast. A conversation needs several lines
      // at once and time to read them; the toast gives you one for four seconds
      // and the next speaker wipes the last.
      onChat: (m) => hud.chat(m.system ? null : m.n, m.m),
      // ── what just happened to somebody ──
      // Until now none of these reached a screen. An arrow that hit, or that
      // glanced off because you may not fight on settled ground, looked exactly
      // like an arrow that sailed through — which is how "arrows do not hit
      // people" was reported twice when the shot had in fact been refused, by a
      // rule, for a stated reason nobody could read.
      onEvent: (e) => {
        const mine = net && e.id === net.id;
        const byMe = net && e.by === net.id;
        if (e.k === 'hit') {
          if (mine) hud.chat(null, `an arrow hits you — ${e.dmg}`);
          else if (byMe) hud.chat(null, `your arrow strikes home — ${e.dmg}`);
        } else if (e.k === 'glance') {
          if (mine || byMe) hud.chat(null, `the arrow glances off — ${e.why}`);
        } else if (e.k === 'death') {
          hud.chat(null, `${e.n} was killed by ${e.by} ${e.where ?? ''}`.trim());
        } else if (e.k === 'miss') {
          // Where it ACTUALLY went, in the words a person would use. `hit` is
          // the surface the arrow found: ground, tree, rock.
          if (byMe) {
            const what = e.hit === 'ground' ? 'the ground' : e.hit === 'tree' ? 'a tree' : `the ${e.hit}`;
            hud.chat(null, `your arrow strikes ${what}, ${e.d} m out`);
          }
        } else if (e.k === 'wound') {
          // Your arrow landed and the animal is still up. Said only to the
          // archer, and it is the counterpart of "your arrow strikes a tree" —
          // between them there is no longer a shot you hear nothing about.
          // ── WITH THE NUMBERS, because "it runs" is not enough to hunt on ──
          //
          // Ben: "i hit deer in vitals a few times and it did not die."
          //
          // Arrow damage scales with IMPACT SPEED (`ARROW.damage` at
          // `ARROW.refSpeed`), so a vitals hit is a one-shot kill at full draw
          // and a flesh wound at sixty per cent of it. Both said "hit — vitals"
          // and neither said how hard, so there was no way to tell a mortal hit
          // from a graze, and no way to learn that the draw was the problem.
          //
          // The server has known all along — `dmg` and `hp` have been on this
          // event since it was added. AN AGENT ALREADY GETS THIS SENTENCE, in
          // almost these words, in `Agent.remember`. The human was the one
          // being kept in the dark.
          if (byMe) {
            hud.chat(null, `your arrow goes into the ${e.n.toLowerCase()} — ${e.dmg} damage, ${e.hp} left in it`);
          } else if (e.hp !== undefined && e.big) {
            // ── A BIG FIGHT IS EVERYBODY'S BUSINESS ──
            //
            // Said to the whole hillside, not just the archer. A troll has 420
            // hit points against a 26-damage arrow and a full quiver is twelve
            // — the arithmetic simply does not close for one person, which is
            // why nobody has ever killed one. It is meant to be three of you.
            //
            // Three people cannot pile on to something if only the one who
            // fired can see it weakening. This is the line that makes "it is
            // nearly down, keep at it" a thing anybody can know.
            hud.chat(null, `the ${e.n.toLowerCase()} is hit — ${e.hp} left in it`);
          }
        } else if (e.k === 'kill') {
          // ── an animal went down somewhere, and left something behind ──
          //
          // The server rolled the carcass (see `onCreatureHit` in world.js) and
          // we lay it out where it says. We do NOT roll our own: the whole point
          // of doing it up there is that everybody standing round the same deer
          // sees the same meat on the same ground.
          //
          // Laid out for anyone who walks up, not reserved for the shooter —
          // which is how a carcass has always worked on your own, and the
          // simplest thing that is not a lie about who owns it.
          _kill.set(e.at[0], e.at[1], e.at[2]);
          for (const d of e.d ?? []) pickups.drop(d.item, d.count, _kill, _drop.set(0, 0, 0));
          hud.toast(`${e.n} down`, 2.2);
        }
      },
      // ── what is true of YOU ──
      // The server has always sent this and the browser has never read it, on
      // the reasoning that a client running the whole simulation locally
      // already knows. It knows where it is walking. It does not know what the
      // world did to it: the goblins on the server take your health off the
      // server's copy of you, and this client's own copy was never touched, so
      // it kept reading 100 through two deaths. See `Vitals.applyRemote`.
      onSnapshot: (snap) => {
        if (snap.me) vitals.applyRemote(snap.me.h);
        // ── and how cold the world has made you ──
        // `me.c` has been in every snapshot as long as `me.h` has, and was left
        // unread for a real reason rather than an oversight: until the fire you
        // light reached the server, the server's copy of you stood in a world
        // with nothing burning in it, and taking its temperature would have told
        // you that you were freezing beside a fire you could see. Both halves of
        // that landed at 15:40. See `Body.applyRemoteCore` — and note `me.f` is
        // deliberately still NOT read, because nothing can yet feed that body.
        if (snap.me) vitals.applyRemoteCore(snap.me.c);
        // ── AND WHERE THE SERVER THINKS YOU ARE STANDING ──
        //
        // The server integrates YOUR intents through ITS OWN physics —
        // collisions, slopes, wading, the hunger slowdown, the speed scale a
        // drawn bow applies — and this client integrates the same intents
        // through its own. Two simulations, one input, and until now NOTHING
        // EVER COMPARED THEM. `me.p` has been in every snapshot and was read
        // only on death, for the respawn (see the note on the 417 m bug).
        //
        // So they drift, unboundedly, and every consequence lands on the
        // server's copy. A playtester measured 25 m: their arrows left from
        // where the ghost stood, so hits registered client-side and the
        // goblin's health never moved; and they lost 46 health to goblins
        // beating up a body they could not see. They only landed two kills by
        // measuring the offset by hand and aiming from the ghost's coordinates.
        //
        // Corrected in proportion to how wrong it is. Under `driftIgnore` it is
        // interpolation noise and touching it would fight the controller every
        // packet. Between that and `driftSnap` it is eased over — invisible at
        // a few per cent a packet, and it converges because the error stops
        // growing. Past `driftSnap` something has gone badly wrong and a hard
        // correction is kinder than a body that cannot shoot.
        //
        // OFFLINE IS UNTOUCHED: no server, no snapshots, no correction, so
        // single player stays byte-identical.
        if (snap.me?.p && !vitals.dead) {
          const dx = snap.me.p[0] - ctrl.position.x;
          const dz = snap.me.p[2] - ctrl.position.z;
          const off = Math.hypot(dx, dz);
          if (off > NET.driftSnap) {
            ctrl.teleport(new THREE.Vector3(snap.me.p[0], snap.me.p[1], snap.me.p[2]), ctrl.yaw);
            terrain.buildImmediate(ctrl.position.x, ctrl.position.z);
            hud.toast('caught up with the world', 1.4);
          } else if (off > NET.driftIgnore) {
            ctrl.position.x += dx * NET.driftEase;
            ctrl.position.z += dz * NET.driftEase;
          }
        }
        // ── and what time it is ──
        // Delivered RAW here rather than through the interpolator for the same
        // reason as the health and the events: the buffer exists to smooth
        // BODIES between two packets, and an hour that arrives 110 ms late is
        // still the right hour. The client used to tick its own clock from
        // whatever it started at, which is how a browser drew a blue midday sky
        // while the server it was connected to was at 01:00 and sending so.
        atmosphere.applyRemote(snap.c);
        // ── and what is burning ──
        // Same channel, same reason. Until this, a fire existed on exactly one
        // screen: you could stand in somebody's camp, in the dark, beside a
        // fire that was warming them and see bare ground. See
        // `Fires.applyRemote` — from here the server owns the whole list, so
        // the local fuel clock stands aside and there is one authority.
        fires.applyRemote(snap.fi);
        // ── and what the sky is doing ──
        // The last of the six. Same channel, same reason, and it matters more
        // now than it did an hour ago: your temperature became the server's at
        // 15:40, and the wind chill and rain the HUD explains it WITH were
        // still your browser's own invention — so the number could be right and
        // the reason beside it wrong. Wind also carries your scent. See
        // `Weather.applyRemote`.
        weather.applyRemote(snap.w);
      },
      onError: (m) => hud.toast(`server: ${m}`, 5),
      onStatus: (s) => {
        hud.toast(`network: ${s}`, 2);
        // Nobody is keeping your health — or your hour — for you once the
        // socket is gone.
        if (s !== 'connected') {
          vitals.takeOverLocally();
          atmosphere.takeOverLocally();
          fires.takeOverLocally();
          weather.takeOverLocally();
        }
      },
    };
  }

  const vitals = new Body({
    onWarning: (text) => hud.toast(text, 3),
    onDamage: (amount, from) => {
      audio.playerHurt(Math.min(1, amount / 40));
      feel.shake(0.75);
      weapons.cancel(); // a mauling makes you lose the draw
      // ── SAY WHAT IS KILLING YOU ──
      //
      // A playtester froze to death like this: "I pressed G, the log said 'a
      // fire', and yet there was no fire in reach... my core temperature sat at
      // 34.3° while I lost about one health every 1.5 seconds until I died. The
      // WARMTH bar was on screen the whole time but nothing connected it to the
      // health I was losing."
      //
      // The cause has been on the damage all along — `body.js` tags it
      // `{kind:'cold'}`, `{kind:'hunger'}`, `{kind:'heat'}` — and nothing ever
      // read it. Dying of the weather looked exactly like dying of nothing.
      //
      // Rate-limited to one line every few seconds: this fires per tick while
      // it is happening, and a warning that scrolls is a warning nobody reads.
      const why = from?.kind;
      if (why && time - (lastSlowDeath[why] ?? -99) > 6) {
        lastSlowDeath[why] = time;
        hud.toast(
          why === 'cold' ? 'the cold is killing you — get to a fire'
          : why === 'hunger' ? 'you are starving — eat something'
          : 'the heat is killing you — get out of the sun',
          3.5,
        );
      }
    },
    onDeath: () => {
      weapons.cancel();
      hud.setPrompt(null);
      // The most important event in any session, and the one every run so far
      // has produced. What they were CARRYING when it happened is most of the
      // finding — four sessions starved holding the branch that would have
      // lit the fire.
      const held = inventory.slots.filter((s) => s.item).map((s) => `${s.count} ${s.item}`).join(', ');
      logEvent('DIED', `food ${Math.round(vitals.hunger)}, core ${vitals.coreC.toFixed(1)}, ` +
        `carrying ${held || 'nothing'}`);
      shoot('death');
    },
    onRespawn: () => {
      // WHERE YOU WAKE IS THE SERVER'S CALL when there is a server. Its copy of
      // you has already stood up somewhere — see `world.addPlayer`'s `home` —
      // and teleporting to the shore THIS client picked would put the two
      // bodies in different places again the instant you died. That is the
      // 417 m bug, which took four sessions, and death is exactly the moment it
      // would come back: the same rule as the welcome, applied to the second
      // time you open your eyes.
      const home = net?.connected ? net.buffer.at(-1)?.snap?.me : null;
      if (home) {
        ctrl.teleport(new THREE.Vector3(home.p[0], home.p[1], home.p[2]), home.y);
        terrain.buildImmediate(ctrl.position.x, ctrl.position.z);
      } else {
        ctrl.teleport(spawn.position, spawn.yaw);
      }
      // Wake up unhunted — otherwise the bear is simply waiting for you.
      for (const c of wildlife.creatures) {
        c.awareness = 0;
        c.charging = false;
        c.chargeTime = 0;
      }
      hud.toast('you wake at the lake, shaken', 3);
    },
  });

  // Joined here rather than the moment the URL was read, because every handler
  // above talks about the world — your health, your body, your animal — and a
  // socket that opens before those exist calls back into names that do not.
  // `connect` reports its status SYNCHRONOUSLY, so this is not theoretical.
  if (joinUrl) {
    net = new NetClient(netHandlers());
    // Whichever animal is at your heel walks onto the server with you.
    net.connect(joinUrl, params.get('name') ?? 'wanderer', chosenCompanion);
  }

  // How much of the world is hunting you. Read from `?danger=` or from what you
  // chose last time, and applied to the manager below before anything spawns —
  // see modes/danger.js.
  let dangerLevel = readDanger();

  const wildlife = new Wildlife(scene, {
    stealth,
    audio,
    onAttack: (creature) => {
      const dmg = creature.species.aggression?.damage ?? 0;
      vitals.damage(dmg, creature);
      // ── the pet answers ──
      // Whatever hurt you is what it goes for, with no regard at all for how
      // big the thing is. That is correct for an pet and it is the reason
      // this is a DISTRACTION rather than a damage source: a goblin with an
      // pet attached to it is a goblin that is not swinging at you.
      if (pet.defend(creature)) {
        hud.toast(`${pet.name ?? 'the pet'} goes for it`, 2);
      }
    },
  });

  const projectiles = new Projectiles(scene, {
    colliders: [scatterColliders, staticColliders],
    wildlife,
    audio,
    onLanded: (p) => pickups.registerRecoverable(p),
    onRemoved: (p) => pickups.forgetProjectile(p),
    // ── your shot ended in the dirt, and you deserve to be told ──
    //
    // Only when nobody else is going to say it. On a server the authoritative
    // arrow is the SERVER'S, and it reports its own miss through the `miss`
    // event; this browser flies a predicted copy of the same shot, so wiring
    // both would say everything twice.
    onMiss: (p, surface, flown) => {
      if (net?.connected) return;
      const what = surface === 'ground' ? 'the ground' : surface === 'tree' ? 'a tree' : `the ${surface}`;
      hud.chat(null, `your arrow strikes ${what}, ${Math.round(flown)} m out`);
    },
    onCreatureHit: (creature, result, point) => {
      if (result.killed) {
        hud.toast(`${creature.species.name} down — ${result.zone}`, 2.2);
        dropLootFor(creature);
      } else {
        // The zone is the client's own raycast and is honest. The COST is not
        // known here on a connected client — `applyDamage` returns 0 for a
        // remote creature because the server owns the arithmetic — so the
        // number arrives a moment later on the `wound` event above. Saying the
        // zone alone made three grazes look identical to three mortal hits.
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
    // A melee weapon needs to know what is in front of it. The bow does not —
    // it launches a projectile and the projectile finds out — which is why
    // this only appears now, with the axe.
    wildlife,
    rand: makeRandom('combat'),
    onDryFire: () => {
      audio.dryFire();
      hud.toast('out of arrows — look for a quiver', 2);
    },
    /** Something was hit at arm's length. Same feedback an arrow gets. */
    onHit: ({ creature, killed, zone, damage }) => {
      feel.shake(0.35 + Math.min(0.5, damage / 90));
      if (killed) {
        hud.toast(`${creature.species.name} down — ${zone ?? 'a solid blow'}`, 2.4);
        dropLootFor(creature);
      } else if (zone === 'head') {
        hud.toast('a good blow', 1.4);
      }
    },
  });

  // Where the arrow would actually land, drawn on the world while you draw.
  // Reads the bow and the world; writes neither.
  const aimMark = new AimMark(scene);

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

  // ── a sense of place ──────────────────────────────────────────────────────
  //
  // The strangeness gradient decides what may exist around you, and until now
  // it was entirely invisible: the world got more dangerous with no
  // acknowledgement at all. This is the smallest honest fix — a line when the
  // ground under you changes character, and nothing the rest of the time.
  //
  // Deliberately NOT a meter. A number in the corner would turn "somewhere I
  // should not be" into "region difficulty 4/6", and reading a gauge is the
  // opposite of noticing where you are. It also stays quiet unless the change
  // holds for a few seconds, so walking along a boundary does not chatter.
  const PLACE_LINES = {
    settled: 'the ground is familiar here',
    quiet: 'quiet country',
    lonely: 'you are a long way from the water',
    uneasy: 'the hill does not want you here',
    wrong: 'something is wrong with this ground',
    'the deep places': 'you should not be here',
  };
  const PLACE_ORDER = ['settled', 'quiet', 'lonely', 'uneasy', 'wrong', 'the deep places'];
  let placeBand = null;
  let placeCandidate = null;
  let placeHold = 0;
  let districtName = null;

  function reportPlace(dt) {
    const s = strangenessAt(ctrl.position.x, ctrl.position.z, {
      sunAltitude: atmosphere.elevation,
      weather,
    });

    // ── where you are ──
    // Announced on entry and then left alone. A name you are told once is a
    // place; a name pinned permanently to the screen is a minimap.
    const d = districtAt(ctrl.position.x, ctrl.position.z);
    if (d.name !== districtName) {
      const first = districtName === null;
      districtName = d.name;
      if (!first) hud.toast(d.name, 3);
    }

    const band = describeStrangeness(s);
    if (band !== placeCandidate) {
      placeCandidate = band;
      placeHold = 0;
      return;
    }
    placeHold += dt;
    if (placeHold < 4 || band === placeBand) return;

    const worse = PLACE_ORDER.indexOf(band) > PLACE_ORDER.indexOf(placeBand ?? 'settled');
    const first = placeBand === null;
    placeBand = band;
    // Nothing on the way back down into safe ground, and nothing at all for
    // the opening moments — the first thing the game says should not be a
    // status report about a meadow.
    if (first || !worse) return;
    hud.toast(PLACE_LINES[band] ?? band, 3.4);
  }

  // ── the pet ─────────────────────────────────────────────────────────────

  /**
   * Where the nearest thing worth eating is.
   *
   * RELIABILITY IS THE POINT. The pet never rolls dice about whether it finds
   * something — it asks this, and this tells the truth. What varies with its
   * training and its condition is how far it can cast, which is a much better
   * knob than accuracy because it never makes the animal look stupid.
   */
  function nearestFood(x, z, range) {
    let best = null;
    const consider = (px, pz, what) => {
      const d = Math.hypot(px - x, pz - z);
      if (d > range || (best && d >= best.distance)) return;
      best = { x: px, z: pz, what, distance: d };
    };
    for (const c of wildlife.creatures) {
      if (c.species.faction !== 'prey') continue;
      consider(c.position.x, c.position.z, c.state === 'dead' ? `a dead ${c.species.id}` : `a ${c.species.id}`);
    }
    // Pickups keep three separate collections and there is no `items` — using
    // that name silently found nothing, so the pet would only ever have
    // pointed at live deer and never at the venison lying beside them. The kind
    // of bug that reads as a design choice until someone checks.
    const food = (pos, item) => {
      if (getItem(item)?.kind !== 'food') return;
      consider(pos.x, pos.z, itemName(item).toLowerCase());
    };
    for (const d of pickups.dropped) food(d.obj.position, d.item);
    for (const r of pickups.recovered) food(r.projectile.pos, r.item);
    for (const l of pickups.loot.values()) food(l.obj.position, l.item);
    return best;
  }

  /**
   * Feed it, or play with it.
   *
   * `want` is set from the menu; with no menu (a wild pet, which has no
   * menu) it picks whichever it needs more.
   */
  function tendPet(want = null) {
    const food = Object.keys(pet.species.foods).find((id) => inventory.countOf(id) > 0);
    if (want === 'play') {
      const res = pet.play();
      hud.toast(res.ok ? `${petName()} rolls about` : res.why, 2.2);
      return null;
    }
    // Something to eat beats a game, if it is hungry and you have any.
    if ((want === 'feed' || pet.fed < 0.85) && food) {
      const res = pet.feed(food);
      if (!res.ok) return hud.toast(res.why, 2), null;
      inventory.remove(food, 1);
      audio.pickup?.();
      if (res.named) hud.toast(`it takes the ${itemName(food).toLowerCase()} — you call it ${res.name}`, 4);
      else hud.toast(`${petName()} eats`, 2);
      return null;
    }
    const res = pet.play();
    if (!res.ok) {
      hud.toast(pet.fed < 0.85 ? 'it is hungry — you have nothing it wants' : res.why, 2.4);
      return null;
    }
    hud.toast(`${petName()} rolls about`, 2);
    return null;
  }

  const petName = () => pet.name ?? `the ${pet.species.name.toLowerCase()}`;

  // ── riding ────────────────────────────────────────────────────────────────
  //
  // The hippo's whole reason to exist, and for one commit it was a variable
  // nothing read: `riding` was toggled, a toast said "you climb onto the
  // hippo", and the player carried on walking. The toast was the only thing I
  // checked, which is exactly the wrong thing to check.
  //
  // What it actually does now: YOU BECOME THE ANIMAL. Your intent drives it
  // rather than your legs, so its speed, its reach into deep water and its
  // indifference to bog are yours. That is the whole point — the hippo is not
  // a faster walk, it is access to ground you could not previously cross.
  function dismount(why = 'you slide off') {
    if (!riding) return;
    riding = false;
    // Put you down beside it on standable ground rather than wherever the
    // camera happened to be, or you dismount into the middle of the loch.
    const side = pet.yaw + Math.PI / 2;
    const x = pet.position.x + Math.sin(side) * 1.6;
    const z = pet.position.z + Math.cos(side) * 1.6;
    const y = heightAt(x, z);
    if (y > WATER_LEVEL - PLAYER.maxWadeDepth) ctrl.teleport({ x, y, z }, ctrl.yaw);
    hud.toast(`${why} ${petName()}`, 2.2);
  }

  /**
   * Drive the animal from your intent, and sit on it.
   *
   * Called from the frame loop after the controller has run, so it overrides
   * the walk rather than fighting it. The rider's own collision is skipped
   * entirely — the hippo decides where it can go, and it can go anywhere.
   */
  function updateRiding(dt, intent) {
    if (!riding) return;

    // Getting hurt throws you off. A mauling while riding should not simply
    // continue.
    if (vitals.dead) return dismount('you fall from');

    const S = pet.species;
    const speed = intent.sprint ? S.runSpeed : S.walkSpeed;
    // Steering: you turn, and it goes where you are looking.
    if (intent.forward || intent.strafe) {
      const want = ctrl.yaw + Math.atan2(-intent.strafe, -intent.forward);
      const diff = ((want - pet.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      pet.yaw += clamp(diff, -2.2 * dt, 2.2 * dt);
      const move = speed * (intent.forward < 0 ? 0.45 : 1) * dt;
      pet.position.x += Math.sin(pet.yaw) * move;
      pet.position.z += Math.cos(pet.yaw) * move;
      pet.speed = speed;
      pet.legPhase += speed * S.anim.strideRate * dt;
    } else {
      pet.speed = damp(pet.speed, 0, 6, dt);
    }

    // It wades anything. This is the payload: the lake bed drops to 21 m and
    // a hippo simply walks along the bottom with you on its back.
    const ground = heightAt(pet.position.x, pet.position.z);
    pet.position.y = Math.max(ground, WATER_LEVEL - (S.wadeMax ?? 6));
    pet.object.rotation.y = pet.yaw;

    // And you sit on it, a little behind the shoulders.
    ctrl.position.set(
      pet.position.x - Math.sin(pet.yaw) * 0.35,
      pet.position.y + RIDE_HEIGHT,
      pet.position.z - Math.cos(pet.yaw) * 0.35
    );
    ctrl.velocity.set(0, 0, 0);
    ctrl.grounded = true;
    // Riding is not walking: no footfalls, no wading noise, no gait.
    ctrl.horizontalSpeed = 0;
    ctrl.wadeDepth = 0;
  }

  // ── flying ────────────────────────────────────────────────────────────────
  //
  // Same shape as riding, and for the same reason: your intent drives the
  // machine instead of your legs, and the machine goes where legs cannot. The
  // difference is that a hippo forgives you and a wing does not.
  //
  // W/S is the stick — forward is nose down, the way a stick has worked since
  // there were sticks — and A/D banks. There is no throttle to look for and no
  // key that makes you go up, because there is no such key on a glider. The
  // only altitude you will ever have is the altitude you carried up the hill.
  let flight = null;
  let wing = null;
  // The wing on your shoulder: the group being drawn, plus the throttled answer
  // to "where would this fly from", which is a terrain search and must not run
  // sixty times a second for a line of HUD text.
  let carried = null;
  let carryHint = { text: '', at: null };
  // Named in-memory checkpoints for testers — see `highlands.checkpoint`.
  const checkpoints = new Map();

  /**
   * The two halves of this game do not agree on which way a heading points.
   *
   * Walking forward moves you along (−sin yaw, −cos yaw) — measured in play at
   * three separate yaws, and the camera's own world matrix says the same — while
   * `glider.js` integrates position along (+sin h, +cos h). The flight module is
   * self-consistent; it was simply wired up with a raw camera yaw, so every
   * heading crossing that boundary arrived reversed.
   *
   * The cost was not subtle and was mis-filed for a long time as "the launch
   * check is wrong". It was not wrong, it was aimed at the ground BEHIND you:
   * stand on a 280% slope looking down it and the check honestly reports the
   * hill at your back, which climbs, and refuses with "not steep enough". Flown
   * from a spot it did accept, the wing carried me 45 m in the exact opposite
   * direction to the one I was facing, with the aircraft behind the camera the
   * whole way.
   *
   * One conversion, named, at every crossing — rather than a bare `+ Math.PI`
   * sprinkled at four call sites where the next reader would delete one.
   *
   * Declarations, not `const` arrows, and deliberately: these are called from
   * `resolveInteraction` six hundred lines below, and this file has already
   * paid for that once — see the note in `structures.js` about builders that
   * threw "Cannot access before initialization" the first time they ran, with
   * the bundler perfectly happy about it.
   */
  function flightHeading(yaw) { return yaw + Math.PI; }
  function viewYaw(heading) { return heading + Math.PI; }

  function beginFlight(s) {
    const heading = flightHeading(ctrl.yaw);
    const ok = canLaunch(ctrl.position.x, ctrl.position.z, heading, heightAt);
    if (!ok.ok) return ok.why;
    if (riding) dismount('you slide off');

    // Either it was leaning on the hill, or it was on your shoulder. Both leave
    // the world the same way — there is exactly one wing and it is now under
    // you — and the second path is why `s` is allowed to be null.
    if (s) structures.remove(s); // it is not on the hill any more, it is under you
    dropCarried();
    flight = launch({
      x: ctrl.position.x, y: ctrl.position.y + 0.6, z: ctrl.position.z, heading,
    });
    // The wing you are hanging from. Reusing the structure's own geometry means
    // the thing you fly is visibly the thing you built, which matters more than
    // it sounds — it is the difference between a vehicle and a state change.
    wing = new THREE.Group();
    BUILDABLE.glider.build(wing);
    wing.position.y = -1.2; // the parts are modelled standing on the ground
    const pivot = new THREE.Group();
    pivot.add(wing);
    scene.add(pivot);
    wing.pivot = pivot;
    hud.toast('you run, and the ground stops being there', 3);
    logEvent('LAUNCH', `${ok.drop ? `${(ok.drop * 100).toFixed(0)}% downhill` : ''} at ${Math.round(flight.y)} m`);
    shoot('launch', true);
    return null;
  }

  function endFlight(crashed) {
    if (!flight) return;
    const s = flight;
    flight = null;
    logEvent(crashed ? 'CRASHED' : 'LANDED',
      `after ${Math.hypot(s.x, s.z).toFixed(0)} m, at ${s.v.toFixed(1)} m/s sinking ${s.sink.toFixed(1)}`);
    shoot(crashed ? 'crash' : 'landed', true);
    if (wing?.pivot) scene.remove(wing.pivot);
    wing = null;
    hud.clearFlight();
    ctrl.teleport({ x: s.x, y: heightAt(s.x, s.z), z: s.z }, ctrl.yaw);
    if (crashed) {
      vitals.damage(GLIDER.crashDamage, 'the ground');
      hud.toast('you come down hard, and the wing does not get up again', 4);
    } else {
      // It survived, so it is still yours — put it back down. A glider you can
      // only use once is a glider nobody builds twice.
      //
      // And LOOK for somewhere to put it, out to twenty-odd metres, rather than
      // demanding the exact patch you stopped on. The first version tried only
      // the landing spot, and since the good landing spots are at the bottom of
      // steep ground it routinely announced the wing was lost — including on
      // the autosave that fires when you tab away mid-flight, which destroyed
      // the most expensive thing in the game for switching windows. A person
      // carrying a wing walks twenty metres to find somewhere to lean it.
      let put = null;
      for (let r = 0; r <= 24 && !put; r += 4) {
        for (let i = 0; i < (r ? 8 : 1); i++) {
          const a = (i / 8) * Math.PI * 2;
          const x = s.x + Math.sin(a) * r;
          const z = s.z + Math.cos(a) * r;
          if (structures.canPlaceAt('glider', x, z).ok) { put = { x, z, r }; break; }
        }
      }
      if (put) structures.place('glider', put.x, put.z, ctrl.yaw);
      hud.toast(put ? (put.r > 4 ? `you set down, and carry the wing ${put.r} m to level ground`
        : 'you set down, and the wing is still whole')
        : 'you set down in country too broken to leave a wing in, and it is lost', 3.4);
    }
  }

  // ── carrying the wing ──────────────────────────────────────────────────────
  //
  // A wing that lands somewhere it cannot take off from used to be over. Ten
  // hides and fourteen branches — the most expensive thing in the game, a
  // season's work by its own config comment — became scenery, permanently,
  // because the only verb a glider had was "fly" and the answer was no. The
  // structure's own blurb has said `carry it up a hill` since it was written.
  //
  // Landing somewhere you cannot launch from is realistic and stays. Having no
  // way to pick the thing back up is not realism, it is a missing verb.

  /** Take it off the hill and put it on your shoulder. */
  function shoulderWing(s) {
    if (carried) return null;
    structures.remove(s);
    const g = new THREE.Group();
    BUILDABLE.glider.build(g);
    g.position.y = -1.2; // as in flight: the parts are modelled standing up
    const pivot = new THREE.Group();
    pivot.add(g);
    scene.add(pivot);
    carried = { group: g, pivot };
    carryHint = { text: '', at: null };
    audio.impact?.('wood', { x: ctrl.position.x, y: ctrl.position.y + 1, z: ctrl.position.z });
    logEvent('WING', 'shouldered');
    hud.toast('the wing comes up onto your shoulders — nine metres of it, and you feel every one', 3.4);
    return null;
  }

  /**
   * Lean it against the ground here.
   *
   * Refuses rather than destroying: a wing you are holding can always be
   * carried one step further, and the one thing this whole feature exists to
   * prevent is losing it. `reach` opens up on the save path only, where the
   * alternative is a save with the wing in no world at all.
   */
  function setWingDown(reach = 24) {
    if (!carried) return null;
    let put = null;
    for (let r = 0; r <= reach && !put; r += 4) {
      for (let i = 0; i < (r ? 8 : 1); i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = ctrl.position.x + Math.sin(a) * r;
        const z = ctrl.position.z + Math.cos(a) * r;
        if (structures.canPlaceAt('glider', x, z).ok) { put = { x, z, r }; break; }
      }
    }
    if (!put) {
      return 'there is nowhere here to lean nine metres of wing — carry it on';
    }
    structures.place('glider', put.x, put.z, ctrl.yaw);
    dropCarried();
    logEvent('WING', `set down ${Math.round(put.r)} m off`);
    return put.r > 4 ? `you carry it ${Math.round(put.r)} m to level ground and lean it there`
      : 'you lean the wing against the ground';
  }

  /** Let go of the drawn object without deciding where the wing went. */
  function dropCarried() {
    if (carried?.pivot) scene.remove(carried.pivot);
    carried = null;
    carryHint = { text: '', at: null };
  }

  /**
   * Carry it where you are looking, and say where an edge is.
   *
   * The search is terrain sampling — a few hundred height lookups — so it runs
   * when you have MOVED, not every frame. Ten metres is well under the scale of
   * anything it can find and keeps the line honest while you walk.
   */
  function updateCarry() {
    if (!carried) return;
    // OVERHEAD AND AHEAD, and both numbers were photographed rather than
    // picked. The wing model spans 0..1.64 in its own space and hangs 1.2 below
    // the pivot, so a pivot at head height (the first attempt, 1.5) puts the
    // sail straight through the camera: it blacked out the top two thirds of
    // the screen with the horizon behind it. Raising it to 3.3 directly above
    // fixed that and lost the wing entirely — anything above eye level at zero
    // horizontal distance is at 90° up, outside the frustum, so you carried an
    // invisible glider. It has to be AHEAD of you to be in frame at all.
    // 1.6 m forward and 3.1 up puts the trailing edge about 12° above the
    // centre line: in shot, and nothing you need to see is behind it.
    const ahead = 1.6;
    carried.pivot.position.set(
      ctrl.position.x - Math.sin(ctrl.yaw) * ahead,
      ctrl.position.y + 3.1,
      ctrl.position.z - Math.cos(ctrl.yaw) * ahead
    );
    // Through the same seam the launch uses. Set from `ctrl.yaw` raw, the nose
    // rides backwards — the model is built to fly along a glider heading.
    carried.pivot.rotation.y = flightHeading(ctrl.yaw);
    const at = carryHint.at;
    if (!at || Math.hypot(at.x - ctrl.position.x, at.z - ctrl.position.z) > 10) {
      carryHint = {
        at: { x: ctrl.position.x, z: ctrl.position.z },
        text: carryReport(ctrl.position.x, ctrl.position.z, flightHeading(ctrl.yaw), heightAt,
          { maxRadius: GLIDER.carryFindRadius }).text,
      };
    }
  }

  function updateFlight(dt, intent) {
    if (!flight) return;
    if (vitals.dead) return endFlight(true);

    // W is nose down. The stick, not the aeroplane — see glider.js on why
    // commanding the nose rather than the flight path is the whole subject.
    // The same wind the deer have been smelling you on since Phase 2, now
    // holding you up. Nothing new was added to the weather for this — the
    // aircraft just reads what was already blowing.
    stepGlide(flight, { pitch: -intent.forward, roll: intent.strafe }, dt, heightAt, {
      angle: weather.windAngle,
      speed: weather.wind * WEATHER.windSpeedScale,
    });

    ctrl.position.set(flight.x, flight.y, flight.z);
    ctrl.velocity.set(0, 0, 0);
    ctrl.grounded = false;
    ctrl.horizontalSpeed = 0;
    ctrl.wadeDepth = 0;
    // The view turns with the aircraft. In first person with no cockpit around
    // you, a bank you cannot see is a bank you cannot fly. Back through the
    // same seam the launch came in by, so you are looking where you are going.
    ctrl.yaw = viewYaw(flight.heading);

    if (wing) {
      wing.pivot.position.set(flight.x, flight.y, flight.z);
      wing.pivot.rotation.set(0, flight.heading, 0);
      wing.rotation.set(-flight.theta, 0, -flight.bank);
    }

    hud.setFlight(flightReport(flight), flight);
    if (!flight.airborne) endFlight(!!flight.crashed);
  }

  /**
   * Swap which animal came with you.
   *
   * Only meaningful on the start screen — once you are playing, the
   * relationship IS the thing and you cannot trade it in. `pet` keeps the same
   * binding so nothing else in this file has to know it happened; only its
   * innards change.
   */
  function swapCompanion(id) {
    if (id === pet.species.id) return;
    scene.remove(pet.object);
    const fresh = new Companion(id, pet.position.clone(), makeRandom(`pet:${id}`));
    Object.assign(pet, fresh);
    scene.add(pet.object);
    petTrick = 0;
    placeOtter();
  }
  const petNear = () =>
    Math.hypot(pet.position.x - ctrl.position.x, pet.position.z - ctrl.position.z) < 8;

  // ── fishing ──────────────────────────────────────────────────────────────
  //
  // The odds are shown BEFORE you commit, which is the whole design. A hidden
  // dice roll teaches nothing; a visible percentage that climbs when you crouch
  // and collapses when you thrash about teaches the mechanic in one attempt.
  // It is the same lesson the deer have been teaching since the first hour,
  // and now the lake teaches it too.
  function fishOdds(shoal) {
    const helping = pet.tame && petNear();
    let c = FISH.baseChance;
    c += ctrl.crouching ? FISH.crouchBonus : 0;
    c -= stealth.noise * FISH.noisePenalty;
    c -= shoal.spooked * FISH.spookedPenalty;
    c += Math.max(0, Math.min(1, (shoal.size - FISH.shoalMin) / (FISH.shoalMax - FISH.shoalMin))) * FISH.shoalBonus;
    if (helping) c += FISH.otterBonusMin + (FISH.otterBonusMax - FISH.otterBonusMin) * pet.trust;
    return Math.max(0, Math.min(FISH.maxChance, c));
  }

  function goFishing(shoal) {
    const res = fish.tryCatch(shoal, {
      noise: stealth.noise,
      crouched: ctrl.crouching,
      pet: pet.tame && petNear() ? pet : null,
    });
    audio.impact?.('water', ctrl.position);

    if (!res.ok) {
      hud.toast(`${res.why} — wait for them to settle`, 2.4);
      return null;
    }
    inventory.add('fish', res.count);
    // The pet got one too. Feeding it back to her is the point of all this.
    if (res.count > 1) {
      hud.toast(`two trout — ${petName()} caught one as well`, 3.2);
      pet.says = 'chatter';
    } else {
      hud.toast(res.helped ? `a trout, with ${petName()}'s help` : 'a trout', 2.4);
    }
    return null;
  }

  /**
   * Everything you can ask of it, in one list.
   *
   * Six tricks plus feeding plus playing is far too much for a cycling
   * keybind — you end up pressing Z five times reading toasts to find the one
   * you wanted, which is worse than no shortcut at all. A list shows what it
   * knows, what it is part-way through, and what it will not do yet AND WHY,
   * which is the part that makes the trust model legible instead of mysterious.
   */
  function openPetMenu() {
    const items = [];

    const food = Object.keys(pet.species.foods).find((id) => inventory.countOf(id) > 0);
    items.push({
      label: 'Feed',
      value: { do: 'feed' },
      detail: food ? itemName(food) : '',
      disabled: !food || pet.fed > 0.96,
      why: !food ? 'nothing it wants' : 'it has eaten',
    });
    items.push({
      label: 'Play',
      value: { do: 'play' },
      detail: '',
      disabled: pet.played > 0.95,
      why: 'it has had enough',
    });

    // Built from THIS animal's own trick list. No two species share one, so
    // the menu is different for every companion in the game.
    for (const id of pet.trickIds) {
      const t = pet.tricks[id];
      const known = pet.learned.has(id);
      const prog = pet.progress[id] ?? 0;
      const lockedByTrust = !known && pet.trust < t.needs;
      const lockedByCare = !known && pet.care < OTTER.willWorkAbove;
      items.push({
        label: t.name,
        value: { do: 'trick', id },
        detail: known ? (t.toggle ? (pet.isOn(id) ? 'on' : 'off') : t.blurb) : `learning ${prog}/${t.reps}`,
        disabled: lockedByTrust || lockedByCare,
        why: lockedByTrust ? 'needs more trust' : `it is ${pet.mood}`,
      });
    }

    // Pointer lock has to go, or the mouse keeps turning you while you read.
    input.enabled = false;
    hud.openMenu(
      `${petName()} · ${pet.mood}`,
      items,
      (v) => {
        if (v.do === 'feed' || v.do === 'play') return tendPet(v.do);
        petTrick = pet.trickIds.indexOf(v.id);
        tellPet();
      },
      () => {
        input.enabled = true;
      }
    );
    return null;
  }

  /** Z picks a command; V gives it — the keyboard route past the menu. */
  function cycleTrick(dir = 1) {
    const ids = pet.trickIds;
    petTrick = (petTrick + dir + ids.length) % ids.length;
    const t = pet.tricks[ids[petTrick]];
    const known = pet.learned.has(ids[petTrick]);
    const prog = pet.progress[ids[petTrick]] ?? 0;
    hud.toast(`${t.name}${known ? '' : ` — learning ${prog}/${t.reps}`}: ${t.blurb}`, 2.2);
  }

  function tellPet() {
    const id = pet.trickIds[petTrick];
    const res = pet.ask(id);
    if (!res.ok) return hud.toast(res.why, 2.4), null;

    // Straight up the wire, so a trick is something the server can WATCH. A
    // toggle sends no `a` — there is no pose to show, only the standing order,
    // which the digest carries anyway.
    net?.syncCompanion(pet, res.toggled === undefined && res.learned ? id : null);

    if (res.toggled !== undefined) {
      // A toggle may carry a power too — ferry is both a standing order and a
      // thing that has to actually happen. Dispatching before the toast so the
      // power writes the message it wants.
      if (res.power) return usePower(res.power), null;
      hud.toast(
        `${petName()} ${res.toggled ? 'will' : 'no longer will'} ${res.trick.name.toLowerCase()}`,
        2.6
      );
      return null;
    }
    if (res.justLearned) hud.toast(`${petName()} has it — ${res.trick.name.toLowerCase()}!`, 3.4);
    else if (!res.learned) {
      hud.toast(`${petName()} half-understands — ${Math.round(res.progress * 100)}% there`, 2.6);
      return null;
    } else hud.toast(`${petName()} ${res.trick.blurb}`, 2.2);

    // ── the signature power ──
    // Only fires once the trick is genuinely LEARNED, which is what makes the
    // repetition mean something: a half-trained animal performs the shape of
    // it and nothing happens.
    if (res.power) usePower(res.power);
    return null;
  }

  /**
   * What each animal is actually FOR.
   *
   * Every one answers a different problem this world genuinely creates, and
   * that is the test any future companion has to pass — a power that duplicates
   * another one's makes the animal a skin.
   */
  function usePower(power) {
    const here = ctrl.position;
    switch (power) {
      // ── otter: you cannot find food ──
      case 'seek': {
        // OTTER.seekRange*, not FISH.* — I reached for the wrong config block
        // and invented two keys that do not exist, which made the range NaN.
        const { seekRangeMin: lo, seekRangeMax: hi } = OTTER;
        const range = (lo + (hi - lo) * pet.trust) * (0.6 + pet.care * 0.4);
        const found = nearestFood(here.x, here.z, range);
        pet.pointingAt = found;
        if (!found) {
          hud.toast(`${petName()} casts about and finds nothing within ${Math.round(range)} m`, 3);
          return;
        }
        hud.toast(
          `${petName()} points — ${found.what}, ${Math.round(found.distance)} m ` +
            bearingName(here.x, here.z, found.x, found.z),
          4.5
        );
        return;
      }

      // ── hippo: deep water and bog stop you ──
      case 'ferry': {
        if (riding) {
          dismount('you slide off');
          return;
        }
        if (pet.dist(ctrl.position) > 4.5) {
          hud.toast(`${petName()} is too far away to climb onto`, 2.2);
          return;
        }
        riding = true;
        hud.toast(`you climb onto ${petName()} — it will wade anything`, 3);
        return;
      }

      // ── parrot: you cannot see over the ridge ──
      case 'scout': {
        const lines = nearbyDistricts(here.x, here.z, 2)
          .filter((d) => d.distance > 60)
          .slice(0, 5)
          .map((d) => `${d.name} · ${d.distance} m ${d.bearing}`);
        // And what is moving out there, which is the half you cannot get from
        // a stone circle.
        const seen = [];
        for (const c of wildlife.creatures) {
          if (c.state === 'dead') continue;
          const d = Math.hypot(c.position.x - here.x, c.position.z - here.z);
          if (d > 220) continue;
          seen.push({ what: c.species.name, d: Math.round(d), b: bearingName(here.x, here.z, c.position.x, c.position.z) });
        }
        seen.sort((a, b) => a.d - b.d);
        for (const s of seen.slice(0, 4)) lines.push(`${s.what} · ${s.d} m ${s.b}`);
        hud.showSurvey(`${petName()} climbs and looks`, lines.length ? lines : ['nothing but weather'], 13);
        return;
      }

      // ── kangaroo: your pack is full ──
      case 'pouch': {
        if (!pouch.length) {
          let stored = 0;
          for (const slot of [...inventory.slots]) {
            if (!slot?.item || !slot.count) continue;
            if (slot.item === 'bow' || slot.item === 'axe') continue; // you would regret it
            if (pouch.length >= 10) break;
            pouch.push({ item: slot.item, count: slot.count });
            stored += slot.count;
            inventory.remove(slot.item, slot.count);
          }
          hud.toast(stored ? `${petName()} takes ${stored} things` : 'nothing to give it', 2.6);
        } else {
          let taken = 0;
          for (const s of pouch) {
            inventory.add(s.item, s.count);
            taken += s.count;
          }
          pouch.length = 0;
          hud.toast(`${petName()} gives back ${taken} things`, 2.6);
        }
        return;
      }

      // ── octopus: the deep lake is unreachable ──
      case 'dive': {
        // Anything you dropped in water you cannot stand in, plus fish from a
        // shoal too deep to wade to. Exactly the things the lake keeps.
        const shoal = fish.nearest(here, 60);
        const lost = pickups.dropped.find(
          (d) => heightAt(d.obj.position.x, d.obj.position.z) < WATER_LEVEL - 1.2
        );
        if (lost) {
          inventory.add(lost.item, lost.count);
          pickups.dropped.splice(pickups.dropped.indexOf(lost), 1);
          scene.remove(lost.obj);
          hud.toast(`${petName()} comes up with your ${itemName(lost.item).toLowerCase()}`, 3.4);
          return;
        }
        if (shoal) {
          const n = 1 + (this?.rand?.() > 0.5 ? 1 : 0);
          inventory.add('fish', n);
          shoal.shoal.spooked = 1;
          hud.toast(`${petName()} brings up ${n} trout from the deep water`, 3.4);
          return;
        }
        hud.toast(`${petName()} finds nothing down there`, 2.6);
        return;
      }

      // ── wolf cub: you shoot a deer and lose it ──
      case 'track': {
        // The actual hunting problem. A wounded animal that bolted is the one
        // thing this game reliably takes away from you.
        let best = null;
        for (const c of wildlife.creatures) {
          if (c.hp >= c.maxHp && c.state !== 'dead') continue; // unhurt and alive: not yours
          const d = Math.hypot(c.position.x - here.x, c.position.z - here.z);
          if (d > 320 || (best && d >= best.d)) continue;
          best = { c, d };
        }
        pet.pointingAt = best ? { x: best.c.position.x, z: best.c.position.z } : null;
        if (!best) {
          hud.toast(`${petName()} casts about — nothing wounded out there`, 3);
          return;
        }
        const dead = best.c.state === 'dead';
        hud.toast(
          `${petName()} has the scent — ${dead ? 'a dead' : 'a wounded'} ${best.c.species.name.toLowerCase()}, ` +
            `${Math.round(best.d)} m ${bearingName(here.x, here.z, best.c.position.x, best.c.position.z)}`,
          5
        );
        return;
      }
    }
  }

  // ── wearing ───────────────────────────────────────────────────────────────
  //
  // X puts on or takes off the warmest thing you are carrying and not already
  // wearing. One key, because there is one garment — and when there are five,
  // the rule "the warmest one you are not already in" still needs no menu.
  //
  // Taking a cloak OFF matters as much as putting it on: nine degrees of
  // insulation is a liability by a fire or in the afternoon sun, and the body
  // model has always cooked you for it. Previously there was no way to.
  function wearSomething() {
    const clothing = inventory.slots
      .filter((s) => s?.item && s.count && getItem(s.item)?.kind === 'clothing')
      .map((s) => getItem(s.item))
      .sort((a, b) => (b.insulation ?? 0) - (a.insulation ?? 0));

    if (!clothing.length) {
      hud.toast('you have nothing to wear', 2);
      return;
    }
    // Prefer putting something on; if it is all already on, take the top layer
    // off again. That makes X a genuine toggle rather than a one-way door.
    const target = clothing.find((d) => !inventory.isWorn(d.id)) ?? clothing[0];
    const res = inventory.toggleWorn(target.id);
    if (!res.ok) {
      hud.toast(res.why, 2);
      return;
    }
    hud.toast(
      res.wearing
        ? `${res.name.toLowerCase()} on — ${insulationOf(inventory).toFixed(0)}° of shelter`
        : `${res.name.toLowerCase()} off`,
      2.4
    );
  }

  // ── building ──────────────────────────────────────────────────────────────
  //
  // G places the best thing you can currently afford, a short way in front of
  // you. One key, no build menu, no ghost preview: at four buildable things
  // the menu would cost more than it saved, and the ordering in the table is
  // how you choose (cheapest useful thing first).
  //
  // G already lit fires in Phase 2. A fire is now just the cheapest structure
  // in the list conceptually, so the key keeps its meaning — put something
  // down here — and gains the rest.
  /**
   * Choose what to build, instead of the game choosing for you.
   *
   * `B` used to call `bestToBuild`, which returns the first AFFORDABLE thing
   * your camp is missing — and the table starts with the windbreak, which costs
   * three branches and is therefore always affordable and always first. So `B`
   * built a windbreak, unconditionally, forever. A tester handed itself 200
   * wood and 40 hide, sprinted between presses so nothing could be refused for
   * proximity, and got seven windbreaks out of seven presses. The store, the
   * lean-to, the holt, the palisade and the glider had no reachable route in
   * the game at all — four sessions never flew because of this, and it read as
   * a glider problem for three of them.
   *
   * The pieces to fix it both already existed and had never been introduced:
   * the HUD's chooser (whose own comment says "a fire's recipes or a store's
   * contents would want exactly the same thing") and the reference book's
   * costing. This is the introduction.
   */
  function openBuildMenu() {
    const items = Object.values(BUILDABLE).map((spec) => {
      const short = Object.entries(spec.cost)
        .filter(([id, n]) => inventory.countOf(id) < n)
        .map(([id, n]) => amountText(id, n - inventory.countOf(id)));
      return {
        label: spec.name,
        detail: Object.entries(spec.cost).map(([id, n]) => amountText(id, n)).join(', '),
        disabled: short.length > 0,
        why: `need ${short.join(' and ')}`,
        value: spec.id,
      };
    });
    hud.openMenu('Build', items, (kind) => placeStructure(kind));
  }

  /**
   * Everything you could make at this fire, as a chooser.
   *
   * ── THE WORST DISCOVERABILITY HOLE IN THE GAME, in a playtester's words:
   * "Crafting is the worst discoverability hole. There's a Fletch Arrows recipe
   * — 2 branches for 4 arrows — and I could find no way to reach it. At a fire,
   * F silently binds a torch every single time, even holding a stack of
   * branches, even with three torches already."
   *
   * `bestAvailable` returns the FIRST recipe it can make, so everything below
   * whatever you can currently afford is not merely unavailable, it is
   * INVISIBLE — there is no way to learn it exists short of reading the source.
   * That is the same fault the BUILD menu was written to fix for structures,
   * and the chooser's own comment already said so: "a fire's recipes or a
   * store's contents would want exactly the same thing". This is that.
   *
   * Shows what you CANNOT make too, greyed with what you are short of, because
   * a recipe you cannot afford yet is the one you most need to be told about.
   */
  function openFireMenu() {
    const items = Object.values(RECIPES)
      .filter((r) => r.requires === 'fire')
      .map((r) => {
        const short = Object.entries(r.inputs)
          .filter(([id, n]) => inventory.countOf(id) < n)
          .map(([id, n]) => amountText(id, n - inventory.countOf(id)));
        const capped = r.maxHeld
          && inventory.countOf(Object.keys(r.outputs)[0]) >= r.maxHeld;
        return {
          label: r.name,
          detail: Object.entries(r.inputs).map(([id, n]) => amountText(id, n)).join(', '),
          disabled: short.length > 0 || capped,
          why: capped ? 'you have enough of those' : `need ${short.join(' and ')}`,
          value: r.id,
        };
      });
    hud.openMenu('Make at the fire', items, (id) => {
      const r = RECIPES[id];
      if (!r) return;
      const made = craft(r, inventory);
      hud.toast(made ? `${r.verb} — ${made}` : 'nothing came of it', 1.8);
    });
  }

  function placeStructure(kind = null) {
    const x = ctrl.position.x - Math.sin(ctrl.yaw) * STRUCTURES.placeRange;
    const z = ctrl.position.z - Math.cos(ctrl.yaw) * STRUCTURES.placeRange;
    const spec = kind ? BUILDABLE[kind] : structures.bestToBuild(inventory, x, z);
    if (!spec) {
      // A refusal that states its condition. "gather wood" was a guess, and it
      // was wrong whenever the thing you were short of was hide or stone — you
      // could be holding six branches and be told to go and get branches.
      const want = Structures.shortfall(inventory);
      hud.toast(
        want
          ? `nothing you can build yet — the ${want.spec.name.toLowerCase()} is nearest: ` +
            `you need ${want.missing.map((m) => amountText(m.item, m.n)).join(' and ')}`
          : 'nothing you can build',
        3.4
      );
      return null;
    }

    const res = structures.place(spec.id, x, z, ctrl.yaw + Math.PI, net?.id ?? null);
    if (!res.ok) {
      hud.toast(res.why, 2.2);
      return null;
    }
    Structures.pay(spec.id, inventory);
    // The first of each kind gets a picture. This is the moment four sessions
    // never reached, and "they built one" is worth far less than seeing where
    // and what it looked like.
    logEvent('BUILT', spec.name);
    shoot(`built-${spec.id}`, true);
    // A holt is not a building, it is a gift. Telling the pet where it is is
    // the whole point of having dug it.
    if (spec.holt) {
      pet.setHome(x, z);
      hud.toast(
        pet.tame
          ? `a holt for ${petName()} — it will sleep here and stay warm`
          : 'a holt — now find something to put in it',
        4
      );
      return null;
    }
    hud.toast(`${spec.verb} a ${spec.name.toLowerCase()} — ${spec.blurb}`, 3);
    return null;
  }

  /**
   * A store: everything in, or everything out.
   *
   * Not an inventory screen. Two presses — one to empty your pack into it, one
   * to take it all back — cover the actual use, which is "leave the heavy
   * things at camp". A grid UI is a lot of work to make the same decision.
   */
  function useStore(s, spec) {
    if (s.contents.length > 0) {
      let taken = 0;
      for (const stack of s.contents) {
        inventory.add(stack.item, stack.count);
        taken += stack.count;
      }
      s.contents = [];
      hud.toast(`took ${taken} from the store`, 2.4);
      return null;
    }
    let stored = 0;
    for (const slot of inventory.slots) {
      if (!slot?.item || !slot.count) continue;
      if (slot.item === 'bow') continue; // you would only regret it
      if (s.contents.length >= spec.storage) break;
      s.contents.push({ item: slot.item, count: slot.count });
      stored += slot.count;
      inventory.remove(slot.item, slot.count);
    }
    hud.toast(stored ? `stored ${stored} things` : 'nothing to store', 2.4);
    return null;
  }

  // ── what a stone circle is FOR ────────────────────────────────────────────
  //
  // The non-magical answer to "give the circles a function". You are standing
  // on high open ground at a fixed, unmistakable reference point, so you can
  // see the country and work out where things are relative to it. That is what
  // a survey point IS, and it turns the naming layer from a console curiosity
  // into the thing you actually navigate by.
  //
  // No map screen: it tells you, you remember it or you do not. Which is also
  // how it worked for the people who put the stones up.
  function surveyFrom(site) {
    const found = nearbyDistricts(site.x, site.z, SITES.surveyRings)
      .filter((d) => d.distance > 60)
      .slice(0, SITES.surveyRings * 3);
    for (const d of found) sites.known.add(d.name);
    const lines = found.map((d) => `${d.name} · ${Math.round(d.distance)} m ${d.bearing}`);
    hud.showSurvey(`from ${site.name}`, lines);
    return null; // the panel is the feedback; a toast on top would be noise
  }

  // ── what a barrow costs ───────────────────────────────────────────────────
  //
  // The only items in the world you do not have to hunt for, and the deeper
  // out the barrow is the better it pays — the strangeness gradient expressed
  // as a reward instead of a threat. Past `barrowGuardianAt` something is
  // still in there, and it is awake now.
  function openBarrow(site) {
    const result = sites.open(site);
    if (!result) return null;
    for (const item of result.goods) inventory.add(item, 1);
    const counts = {};
    for (const g of result.goods) counts[g] = (counts[g] ?? 0) + 1;
    const list = Object.entries(counts)
      .map(([k, n]) => `${n} ${itemName(k)}`)
      .join(', ');

    if (result.guardian && ruleset.current.survival !== false) {
      // Something was put in there to stay. It comes out of the mouth you just
      // unblocked, not out of thin air behind you.
      const ang = site.yaw;
      const gx = site.x + Math.sin(ang) * (SITES.barrowRadius + 1.4);
      const gz = site.z + Math.cos(ang) * (SITES.barrowRadius + 1.4);
      const born = wildlife.spawnHerd('goblin', gx, gz, 3, 3);
      for (const c of born) {
        c.packId = `barrow:${site.key}`;
        c.awareness = 1;
        c.lastKnownThreat.copy(ctrl.position);
      }
      audio.creatureAlarm?.({ x: gx, y: site.y + 1, z: gz });
      hud.toast(`${list} — and you have woken something`, 4);
    } else {
      hud.toast(`${site.name}: ${list}`, 3);
    }
    return null;
  }

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
  /**
   * Put a branch on a fire, and tell the server you did.
   *
   * ONE PACKET AND THE SAME PACKET as lighting one — `lightFireFor` treats a
   * claim that lands on an existing fire as fuel for it, because from the
   * player's end the two actions are one sentence. Needed the moment the server
   * became the authority on how long a fire burns: without it `addFuel` here is
   * a number the next snapshot overwrites five times a second, and feeding a
   * dying fire on a server would cost you the branch and change nothing.
   */
  function feedFire(fire) {
    fires.addFuel(fire);
    net?.lightFire(fire.position.x, fire.position.z, SURVIVAL.fireFuelPerWood);
    return 'fed the fire';
  }

  function resolveInteraction() {
    const near = pickups.nearest; // set by pickups.update, carries .distance
    const fire = fires.nearest(ctrl.position, SURVIVAL.fireReach);
    const fireDist = fire
      ? Math.hypot(fire.position.x - ctrl.position.x, fire.position.z - ctrl.position.z)
      : Infinity;

    // ── your own structures, and the ground you can work ──
    // Everything competes on the same distance rule, so whatever you are
    // nearest to is what E does. That single rule is why the prompt and the
    // action can never disagree.
    //
    // THESE ARE WORKED OUT BEFORE THE PET AND THE WATER, not after. They used
    // to be computed below both, which meant neither could see them: the pet
    // and the shoal each compared themselves against only the loose pickups and
    // the fire, and won by default against a tree that was never entered in the
    // race. A pet FOLLOWS YOU, so it is within a few metres almost always —
    // which made "E" mean "pet the otter" for most of a session spent standing
    // in a wood. It is the single most-repeated report in FINDINGS.md, it cost
    // one tester six minutes and the conclusion that wood gathering was broken,
    // and it was reported again on the first hillside of this run.
    const mine = structures.nearest(ctrl.position);
    const source = harvest.nearestSource(scatterColliders, ctrl.position, STRUCTURES.useRange, totalHours);
    const mineDist = mine ? mine.distance : Infinity;
    const sourceDist = source ? source.distance : Infinity;
    const closest = Math.min(near?.distance ?? Infinity, fireDist, mineDist, sourceDist);

    // ── the wing on your shoulder ──
    // This one does NOT enter the distance race, and it is the only thing that
    // does not. Everything else in here is something you are standing near;
    // a carried wing is something you are holding, so there is no distance for
    // it to lose, and while you are holding it there is nothing else E could
    // sensibly mean. It also has to sit above the pet for the reason the note
    // below gives — an animal that follows you would take the key every time.
    if (carried) {
      const ok = canLaunch(ctrl.position.x, ctrl.position.z, flightHeading(ctrl.yaw), heightAt);
      if (ok.ok) {
        return {
          label: `<b>E</b>  run — ${(ok.drop * 100).toFixed(0)}% downhill ahead of you`,
          run: () => beginFlight(null),
        };
      }
      return {
        label: `<b>E</b>  set the wing down — ${carryHint.text || ok.why}`,
        run: () => setWingDown(),
      };
    }

    // ── fishing ──
    // Only when you are actually in the water. Standing on the bank pointing
    // at a shoal is not fishing, and the prompt should not pretend otherwise.
    const shoal = ctrl.wadeDepth > 0.25 ? fish.nearest(ctrl.position) : null;
    if (shoal && shoal.distance < closest) {
      const odds = fishOdds(shoal.shoal);
      return {
        label:
          `<b>E</b>  reach for the trout — ${Math.round(odds * 100)}%` +
          (pet.tame && petNear() ? ` <b>(${petName()})</b>` : ''),
        run: () => goFishing(shoal.shoal),
      };
    }

    // ── the pet ──
    // Care is a world interaction like any other, on the same distance rule,
    // so tending it never fights with picking something up — or, now, with the
    // tree you are standing at.
    const otterDist = Math.hypot(pet.position.x - ctrl.position.x, pet.position.z - ctrl.position.z);
    if (otterDist < OTTER.followRange * 0.8 && otterDist < closest) {
      // A wild pet has one thing you can do to it. A tame one has a dozen,
      // which is a menu rather than a keybind.
      const label = pet.tame
        ? `<b>E</b>  ${petName()}`
        : `<b>E</b>  offer the pet something`;
      return { label, run: () => (pet.tame ? openPetMenu() : tendPet()) };
    }

    if (mine && mineDist === closest) {
      const s = mine.structure;
      const spec = BUILDABLE[s.kind];
      if (spec.storage) {
        return {
          label: `<b>E</b>  ${spec.name.toLowerCase()} — ${s.contents.length}/${spec.storage} stored`,
          run: () => useStore(s, spec),
        };
      }
      if (spec.flyable) {
        // The prompt tells you whether this spot will fly BEFORE you commit,
        // which is the same courtesy the fishing odds pay you. Finding out that
        // a hilltop is not steep enough by running off it would be funny once.
        const ok = canLaunch(ctrl.position.x, ctrl.position.z, flightHeading(ctrl.yaw), heightAt);
        if (ok.ok) {
          return {
            label: `<b>E</b>  take the wing — ${(ok.drop * 100).toFixed(0)}% downhill ahead of you`,
            run: () => beginFlight(s),
          };
        }
        // No edge here. The refusal still says everything it measured, and now
        // it is a prompt with a verb behind it instead of a wall: pick it up
        // and go and find one.
        return {
          label: `<b>E</b>  shoulder the wing — ${ok.why}`,
          run: () => shoulderWing(s),
        };
      }
      return { label: `<b>E</b>  ${spec.name.toLowerCase()} — ${spec.blurb}`, run: () => null };
    }

    if (source && sourceDist === closest) {
      // An axe in your pack is worth more here than in a fight. Chopping by
      // hand is pulling at deadfall; with an axe it is chopping.
      const hasAxe = inventory.countOf('axe') > 0;
      const bonus = hasAxe ? (source.tag === 'tree' ? AXE.chopBonus : AXE.quarryBonus) : 0;
      const amount = source.amount + bonus;
      return {
        label:
          `<b>E</b>  ${source.verb} ${source.tag} — ${amount} ${itemName(source.item).toLowerCase()}` +
          (hasAxe ? ' <b>(axe)</b>' : ''),
        run: () => {
          harvest.take(source.x, source.z, totalHours);
          inventory.add(source.item, amount);
          audio.impact?.(source.tag === 'tree' ? 'wood' : 'rock', {
            x: source.x, y: ctrl.position.y + 1, z: source.z,
          });
          return `${source.verb} — ${amount} ${itemName(source.item).toLowerCase()}`;
        },
      };
    }

    // ── built sites ──
    // Resolved before loot and fire only when they are genuinely the closest
    // thing, by the same distance rule everything else obeys.
    const built = sites.nearest(ctrl.position);
    const builtDist = built ? built.distance : Infinity;
    if (built && builtDist < Math.min(near?.distance ?? Infinity, fireDist)) {
      const s = built.site;
      if (s.kind === 'circle') {
        return {
          label: `<b>E</b>  take your bearings at ${s.name}`,
          run: () => surveyFrom(s),
        };
      }
      if (!sites.opened.has(s.key)) {
        return { label: `<b>E</b>  open ${s.name}`, run: () => openBarrow(s) };
      }
      // Already open: say what it is, and do not pretend there is more in it.
      return { label: `<b>E</b>  ${s.name} — already opened`, run: () => null };
    }

    if (near && near.distance <= fireDist) {
      const label = `<b>E</b>  pick up ${itemName(near.item)}${near.count > 1 ? ` ×${near.count}` : ''}`;
      return { label, run: () => pickups.collect() };
    }

    // ── a tree you already cut ──
    // Only where the answer would otherwise be NOTHING. This deliberately does
    // not enter the distance race: a spent tree is not something you can do,
    // and it must never take the key off a fire you could feed. But vanishing
    // is the worst possible answer, and vanishing is what used to happen —
    // standing 2 m from the trunk you cut a second ago, `nearestSource` skips
    // a taken source, `setPrompt(null)` wiped the line, and the player was told
    // nothing at all where they had been told something a moment before. The
    // regrow hour was sitting in `harvest.taken` the whole time.
    if (!fire) {
      const spent = harvest.nearestTaken(scatterColliders, ctrl.position, STRUCTURES.useRange, totalHours);
      if (spent) {
        const left = spent.hoursLeft;
        const when =
          left >= 20 ? 'about a day' : left >= 1.5 ? `about ${Math.round(left)} hours` : 'less than an hour';
        const state = spent.tag === 'tree' ? 'cut' : 'quarried out';
        const back = spent.tag === 'tree' ? 'it regrows' : 'there is more to take';
        return {
          label: `<b>E</b>  this ${spent.tag} is already ${state} — ${when} until ${back}`,
          run: () => null,
        };
      }
      return null;
    }

    // ── a fire is two things at once, and you get to say which ──
    //
    // A fire burning down is the urgent thing; otherwise it is a workbench.
    // That ordering is right and it stays. What was wrong is that it was the
    // ONLY thing you could do: standing at a low fire holding raw venison, two
    // presses of E burned two branches before it would cook, and nothing on
    // screen offered the other action or admitted it existed.
    //
    // So both are built, the urgent one goes on E, and the other goes on F.
    // Whichever is offered, the label names both — a key you are not told about
    // is a key nobody presses.
    const feeding = inventory.countOf('wood') > 0
      ? {
          label: 'feed the fire',
          run: () => { inventory.remove('wood', 1); return feedFire(fire); },
        }
      : null;
    const recipe = bestAvailable('fire', inventory);
    const cooking = recipe
      ? {
          label: `${recipe.verb} · ${recipe.name.toLowerCase()}`,
          run: () => { const made = craft(recipe, inventory); return made ? `${recipe.verb} — ${made}` : null; },
        }
      : null;

    const urgent = feeding && fire.fuel < fire.maxFuel * 0.35;
    const first = urgent ? feeding : cooking ?? feeding;
    const second = first === feeding ? cooking : feeding;
    if (!first) return { label: '<b>E</b>  nothing to work with', run: () => null };
    return {
      label: `<b>E</b>  ${first.label}` + (second ? `　　<b>F</b>  ${second.label}` : ''),
      run: first.run,
      alt: second?.run ?? null,
    };
  }
  let interaction = null;

  /**
   * Paint the reference book from the tables and what you are actually holding.
   *
   * Called on open AND on every inventory change while it is open, which is the
   * bit that makes it worth having: you read "need 2 branches", walk five
   * metres, pick two up, and the line has already become "takes the wind off a
   * ridge" by the time you look back at it.
   */
  function refreshBook() {
    // `pet.species` is the species DEFINITION, not an id — see buildBook.
    hud.showBook(buildBook({ inventory, companion: pet?.species ?? null }));
  }

  /**
   * Everything a note needs in order to be actionable, in one line.
   *
   * This is the whole reason the notes box is worth building rather than just
   * asking people to keep a text file. "The cold is confusing" is a shrug;
   * "the cold is confusing — Rowan Moor, 03:12, rain, core 34.9°, no fire, 2
   * branches" is a bug report, and the player did not have to write, know or
   * care about any of the second half.
   *
   * Deliberately words and rounded numbers rather than a state dump. These get
   * read by a person, and a wall of JSON is a thing people stop reading.
   */
  function noteContext() {
    const p = ctrl.position;
    const env = sampleEnvironment(p, {
      hours: atmosphere.hours, sunAltitude: atmosphere.elevation, weather, fires,
    });
    const bits = [
      env.describe(),
      atmosphere.clockText,
      weather.label,
      `${vitals.dead ? 'DEAD' : `health ${Math.round(vitals.health)}`}`,
    ];
    if (ruleset.current.survival && !vitals.dead) {
      // `food`, not `hunger`. The number is how much you have LEFT (body.js:
      // "0 starving .. 100 full"), so a report saying "hunger 85%" read as
      // nearly starving when it meant nearly full — backwards in every note
      // filed, and the notes are the whole point. Matches the HUD, which has
      // always said FOOD, and the flight recorder.
      bits.push(`core ${vitals.coreC.toFixed(1)}°`, `food ${Math.round(vitals.hunger)}%`);
      if (vitals.wetness > 0.25) bits.push('soaked');
    }
    if (flight) bits.push(`flying, ${Math.round(flight.y)} m up`);
    else if (riding) bits.push(`riding the ${pet.species.name.toLowerCase()}`);
    const carrying = inventory.slots.filter((s) => s.item).map((s) => `${s.count} ${s.item}`);
    bits.push(carrying.length ? `carrying ${carrying.join(', ')}` : 'carrying nothing');
    const near = wildlife.creatures.filter(
      (c) => c.position.distanceTo(p) < 60 && !c.dead
    ).map((c) => c.species.id);
    if (near.length) bits.push(`near: ${[...new Set(near)].join(', ')}`);
    bits.push(`danger: ${dangerLevel}`);
    bits.push(`at ${p.x.toFixed(0)}, ${p.z.toFixed(0)} · seed ${SEED}`);
    return bits.join(' · ');
  }

  /** POST a note to the dev server. Returns whether it actually landed. */
  async function sendNote(text, context) {
    try {
      const res = await fetch('/__note', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, context, who: ruleset.current.name.toLowerCase() }),
      });
      return res.ok;
    } catch {
      // Almost always "this is a production build, there is no sink" — which is
      // correct behaviour, not a failure, but the box still has to say so.
      return false;
    }
  }

  hud.wireNotes(noteContext, sendNote);

  // Speaking. The whole party mechanic rests on this one call: an agent already
  // hears chat and hands it to its mind as "You have heard: …", so a sentence
  // typed here is the only channel by which a person directs a company.
  // The say box and the notes box both release the pointer lock so there is a
  // caret to type into. This is how they give it back — through the input
  // layer, which already knows what to do when a browser refuses.
  hud.onWantLock = () => input.requestLock();
  // ── SAY SO WHEN THE MOUSE IS NOT HELD ──
  //
  // The failure this covers was silent: the cursor turned into a hand, keys
  // kept working, and nothing on screen said what had happened or what to do.
  // It reads as the game breaking.
  input.onLockRefused = () => hud.toast('click to take the mouse back', 3);
  input.onLockUnavailable = () => hud.toast('hold the RIGHT mouse button to look around', 6);

  hud.wireSay((text) => {
    if (!net) {
      hud.toast('there is nobody to hear you — join a server with ?join=', 3.5);
      return;
    }
    net.say(text);
    // Shown locally, and the server's echo of this same line is dropped in
    // client.js — otherwise every sentence appeared twice, once as "you" and
    // once as your own name. Local wins because "you" is what you want to read
    // and because it appears the instant you press Enter rather than after a
    // round trip.
    hud.chat('you', text);
    logEvent('SAID', `"${text}"`);
  });

  // ── the flight recorder ───────────────────────────────────────────────────
  //
  // One line of state every few seconds into SESSION.log, so somebody on
  // another machine can `tail -f` a run they are not playing.
  //
  // The reason this exists rather than relying on the tester: a report is what
  // somebody CHOSE to tell you. A session where they quietly starve, or spend
  // forty minutes stuck inside a rock, or never once open the thing you shipped
  // last week, produces no report at all — the quietest sessions are the most
  // damning, and they are exactly the ones with nothing written down.
  //
  // Self-disabling. In a production build there is no sink, and a fetch into
  // the void every four seconds forever is not an acceptable thing to ship.
  let beating = true;
  let beatAt = 0;

  // ── the event log ─────────────────────────────────────────────────────────
  //
  // The heartbeat SAMPLES state; this records what HAPPENED. The difference is
  // not academic — it is the difference between a police report and a story,
  // and sampling has already misled me once. The beat logs the LAST toast, so
  // one stale message looked identical to a message firing six times in a row,
  // and I nearly reported a pickup loop that never existed. Anything that
  // happens between two samples simply is not in the record.
  //
  // So: every toast in order, every time the player reaches for something,
  // every refusal, every death, and anything that throws. That last one matters
  // most — a console error is currently invisible unless a tester happens to
  // mention it, and this project has shipped four crashes that only showed up
  // when a line actually ran.
  function logEvent(kind, detail = '') {
    if (!beating) return;
    const p = ctrl.position;
    const line = `${atmosphere.clockText}  ${p.x.toFixed(0)},${p.z.toFixed(0)}  ${kind}  ${detail}`;
    fetch('/__beat', { method: 'POST', body: line }).catch(() => { beating = false; });
  }

  // Every line the game says, in order and complete, rather than whichever one
  // happened to be showing when the sampler looked.
  hud.onToast = (text) => logEvent('SAY', `"${text}"`);

  // A throw becomes a line in the log instead of depending on somebody noticing
  // red text in a console they may not have open.
  window.addEventListener('error', (e) => logEvent('ERROR', `${e.message} @ ${e.filename?.split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => logEvent('ERROR', `unhandled: ${e.reason?.message ?? e.reason}`));

  /**
   * A picture, at the moment it mattered.
   *
   * `capture()` has worked since before any of this and nobody ever called it,
   * so every visual judgement made about this game has come from a human
   * pasting a screenshot by hand. A tester spent three separate reports
   * misdiagnosing a black band — sun, then bog water, then finally the carried
   * wing filling the bottom of the screen — and none of that could be helped
   * with, because the one thing nobody could see was the screen.
   *
   * Sparse on purpose: deaths, first-of-a-kind builds, flights, and anything
   * filed as a report. A picture of every four seconds would be unreadable.
   */
  const shotsTaken = new Set();
  function shoot(name, once = false) {
    if (once && shotsTaken.has(name)) return;
    if (shotsTaken.size > 24) return; // a session, not a film
    shotsTaken.add(name);
    captureFrame(`${shotsTaken.size}-${name}`.replace(/[^a-z0-9-]/gi, '-'));
  }

  /**
   * Render one frame and save it to `shots/<name>.jpg` via the dev server.
   *
   * Rendering and reading the pixels must happen in the same task — without
   * `preserveDrawingBuffer` the buffer is gone the moment we yield.
   */
  function captureFrame(name, quality = 0.82) {
    // ── a blind pane still has to be able to take a photograph ──
    //
    // An unattended run drives the game from a HIDDEN browser pane, because
    // that is the only way to hold a session open while nobody is watching. A
    // hidden pane reports `window.innerWidth` and `innerHeight` as 0, `syncSize`
    // clamps that to `Math.max(1, …)`, and the renderer sits at 1×1 — so every
    // screenshot taken this way was ONE GREY PIXEL, written out as a 761-byte
    // JPEG and reported as "saved". Measured on this run: `capture('stalk-25m')`
    // returned success and produced 761 bytes beside real shots of 200–370 KB.
    //
    // That is worth more than it looks. `capture()` is the only way anybody on
    // this project ever sees the game — the brief says so in as many words — and
    // it has been silently blind in exactly the workflow the brief prescribes.
    //
    // The size is forced only for the one frame the photograph needs, so a
    // visible window is completely unaffected and nothing pays for a resolution
    // it is not using.
    const el = renderer.domElement;
    const blind = el.width < 320 || el.height < 240;
    if (blind) shotSize = { w: 1280, h: 720 };
    try {
      stepWorld(1 / 60);
      const url = renderer.domElement.toDataURL('image/jpeg', quality);
      const bin = atob(url.slice(url.indexOf(',') + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: bytes })
        .then((r) => `${name}: ${r.ok ? 'saved' : 'failed'} (${bytes.length} bytes)`)
        .catch(() => `${name}: no sink`);
    } catch (err) {
      return Promise.resolve(`${name}: ${err.message}`);
    } finally {
      // Hand the window back its own size, whatever happened above.
      if (blind) {
        shotSize = null;
        syncSize();
      }
    }
  }

  async function beat() {
    const p = ctrl.position;
    const last = hud.heard[hud.heard.length - 1];
    const held = inventory.slots.filter((s) => s.item).map((s) => `${s.count}${s.item}`).join(' ');
    const line =
      `${atmosphere.clockText}  ${p.x.toFixed(0)},${p.z.toFixed(0)}  ` +
      `${vitals.dead ? 'DEAD' : `hp${Math.round(vitals.health)}`} ` +
      `food${Math.round(vitals.hunger)} warm${vitals.coreC.toFixed(1)}  ` +
      `${weather.label}  ${held || 'empty-handed'}` +
      (flight ? '  FLYING' : riding ? '  RIDING' : '') +
      (last ? `  "${last.text}"` : '');
    try {
      const res = await fetch('/__beat', { method: 'POST', body: line });
      if (!res.ok) beating = false;
    } catch {
      beating = false;
    }
  }

  /**
   * Turn the dangerous things on or off, now, including any already out there.
   *
   * Applied through the manager rather than by filtering the registry, because
   * a bear that has already spawned is the one actually chasing you — see
   * Wildlife.setBanned for why removing them matters more than not spawning
   * them.
   */
  function setDanger(id, announce = true) {
    dangerLevel = writeDanger(id);
    const level = getDangerLevel(dangerLevel);
    const removed = wildlife.setBanned(bannedSpecies(dangerLevel));
    if (announce) {
      hud.toast(
        removed ? `${level.name.toLowerCase()} — ${removed} sent away`
          : level.name.toLowerCase(), 2.6
      );
    }
    return { danger: dangerLevel, removed, banned: [...bannedSpecies(dangerLevel)] };
  }
  // Apply whatever was asked for before the first spawn pass runs.
  setDanger(dangerLevel, false);

  function refreshItemUi() {
    weapons.sync(inventory);
    viewmodel.setItem(inventory.equippedSlot?.item ?? null);
    hud.setHotbar(inventory, itemName);
    if (hud.bookOpen) refreshBook();
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
    atmosphere, weather, ctrl, inventory, vitals, projectiles, pickups, wildlife, fires, sites,
    structures, harvest, pet, pouch,
    get totalHours() {
      return totalHours;
    },
    onHoursRestored: (h) => {
      totalHours = h;
    },
    onPlayerMoved: (pos) => {
      // Stream the world in around wherever the save put us before the first
      // frame, so a loaded run never opens on empty ground.
      terrain.buildImmediate(pos.x, pos.z);
      scatter.update(pos, time);
      sites.refresh(pos.x, pos.z);
      caves.refresh(pos.x, pos.z, heightAt);
    },
  });

  let saveTimer = 0;
  function saveNow(reason = 'auto') {
    if (!ruleset.current.persist) return false;
    // Land before saving. Launching takes the wing OUT of the structure list —
    // it is under you, not on the hill — and flight state is not persisted, so
    // a save taken in the air would write a world with no glider anywhere in
    // it and quietly destroy the most expensive thing in the game. Tabbing away
    // mid-flight autosaves, so this is not a rare path, it is the obvious one.
    // Setting down where you are is a fair outcome: you keep the wing.
    if (flight) endFlight(false);
    // Same hazard, same answer, one step further along: a wing on your shoulder
    // is not in the structure list either, so a save taken while carrying it
    // would write a world with no glider in it. Set it down first. The reach is
    // opened right up here and only here — refusing to place it is the correct
    // answer when you are holding it and can walk on, and the wrong one when
    // the alternative is deleting it.
    if (carried) setWingDown(120);
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
    () => input.requestLock(),
    COMPANION_IDS.map((id) => ({
      id,
      name: COMPANIONS[id].name,
      helps: COMPANIONS[id].helps,
    })),
    (id) => swapCompanion(id),
    Object.values(DANGER_LEVELS).map((d) => ({ id: d.id, name: d.name, tagline: d.tagline })),
    dangerLevel,
    (id) => setDanger(id, false)
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
    // A menu owns the keyboard while it is up. It reports whether it consumed
    // the key, so nothing below fires as well — pressing E to choose must not
    // also re-open the thing you are choosing from.
    if (hud.menuKey(e)) {
      e.preventDefault();
      return;
    }
    // ── typing beats everything ──
    // These come FIRST, above even the controls shortcut. `?` used to be
    // checked before the say box got a look, so typing a question mark into a
    // sentence toggled the controls panel over the top of it. Anything that
    // reads a key before asking "is the player writing" will find a way to do
    // that eventually, so nothing reads a key before this point.
    if (hud.notesOpen) {
      if (e.code === 'Escape') hud.closeNotes();
      return;
    }
    // Handled before the Enter that OPENS it, or the first keystroke re-opens
    // the box you are already typing in.
    if (hud.sayKey(e)) return;
    if (e.code === 'Enter' && !hud.menuOpen && !hud.bookOpen) {
      hud.openSay();
      return;
    }
    // Match the CHARACTER as well as the physical key. On a non-US layout the
    // key at the `Slash` position is not `?` at all, so testing the code alone
    // leaves those keyboards with no way to open the controls.
    if (e.key === '?') {
      hud.toggleKeys();
      return;
    }
    // Esc closes the book. Nothing else wants Escape while it is open, and a
    // panel you can only shut with the key that opened it is a panel people
    // press Escape at and then conclude is stuck.
    if (e.code === 'Escape' && hud.bookOpen) {
      hud.closeBook();
      return;
    }
    switch (e.code) {
      // ── F WAS BOOKED THREE TIMES ──
      //
      // A playtester spotted the first two in the controls panel: "F the other
      // thing" and "F free-fly camera", both on the same key. In Survival that
      // was hidden because free-fly is refused there; in Sandbox a single press
      // did both. Adding Shift+F for the fire chooser made it three.
      //
      // Free-fly moves to Y — it is a sandbox camera toy, so of the three it is
      // the one whose mnemonic matters least. And the shift guard keeps the
      // chooser from also toggling the camera.
      case 'KeyY':
        if (!ruleset.allows('allowFly')) {
          hud.toast('you have only your legs here', 1.6);
          break;
        }
        hud.toast(ctrl.toggleFly() ? 'free-fly on — Space / C for up and down' : 'free-fly off');
        break;
      case 'KeyO':
        hud.openNotes();
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
        // Scrubbing a clock the server owns lasts until the next packet — a
        // tenth of a second — and looks like the key is broken. Say so instead.
        if (atmosphere.remote) {
          hud.toast('the server keeps the hours here', 1.6);
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
        if (atmosphere.remote) {
          hud.toast('the server keeps the hours here', 1.6);
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
        // Build. B took this key from the bloom toggle, which moved to N — a
        // core verb outranks a rendering nicety for the mnemonic letter, and
        // the toggle is still one press away.
        //
        // Shift+B is what you could build: the same mnemonic one modifier
        // along, rather than a fresh letter to remember. And while the book is
        // up, a bare B shuts it instead of building — you opened a panel about
        // building, and having it answer by dropping a windbreak at your feet
        // is the sort of thing that teaches people not to open panels.
        if (e.shiftKey || hud.bookOpen) {
          if (hud.bookOpen) hud.closeBook();
          else refreshBook();
          break;
        }
        openBuildMenu();
        break;
      case 'KeyN':
        hud.toast(`bloom ${composer.toggle('bloom') ? 'on' : 'off'}`);
        break;
      case 'KeyX':
        wearSomething();
        break;
      case 'KeyZ':
        cycleTrick(e.shiftKey ? -1 : 1);
        break;
      case 'KeyV':
        tellPet();
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
    // A click that only existed to take the mouse back must not also loose an
    // arrow. `input` flags it; this swallows exactly one.
    if (input.consumeRelockClick()) return;
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
  // While a shot is being taken this holds the size to render at, overriding a
  // window that has no size to report. See `captureFrame`.
  let shotSize = null;

  function syncSize() {
    const w = shotSize ? shotSize.w : Math.max(1, window.innerWidth);
    const h = shotSize ? shotSize.h : Math.max(1, window.innerHeight);
    // The device pixel ratio is re-read every frame, not just at boot. Dragging
    // the window to a monitor with different scaling — or a browser zoom —
    // changes DPR while leaving the CSS size completely alone, so a guard on
    // w/h only let that straight through and the renderer went on drawing at
    // the backing-store scale it booted with, forever. No resize event can
    // recover it, because the early return below fires first. Both directions
    // hurt: too many pixels for the window and the framerate collapses, too few
    // and the whole game goes soft.
    const pr = Math.min(window.devicePixelRatio, POST.maxPixelRatio);
    renderer.getSize(_size);
    if (_size.x === w && _size.y === h && renderer.getPixelRatio() === pr) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h);
    composer.setSize(w, h, pr);
    viewmodel.setSize(w, h);
  }
  window.addEventListener('resize', syncSize);

  // ── the loop ────────────────────────────────────────────────────────────
  let last = performance.now();
  let time = 0;
  // When each slow death last spoke, so a per-tick warning does not scroll.
  const lastSlowDeath = {};
  // The dead body's intent — mutable, because the network path writes aim onto
  // whatever it sends. See where it is used.
  const deadIntent = createIntent();

  /**
   * The nearest other person within arm's reach, by name.
   *
   * Straight off the last snapshot and `net.others`, because the avatars are
   * presentation and this is a fact about the world. Returns null offline,
   * where there is nobody to hand anything to.
   */
  function nearestPerson() {
    const snap = net?.buffer?.at(-1)?.snap;
    if (!snap?.pl) return null;
    let best = null;
    let bestD = SOCIAL.giveRange;
    for (const p of snap.pl) {
      const who = net.others.get(p.id);
      if (!who?.name) continue;
      const d = Math.hypot(p.p[0] - ctrl.position.x, p.p[2] - ctrl.position.z);
      if (d < bestD) { bestD = d; best = { name: who.name, distance: d }; }
    }
    return best;
  }

  /** One simulation + render step. Split out so it can be driven manually. */
  function stepWorld(dt) {
    syncSize();
    time += dt;

    // ── gather this tick's intent ──
    // The single place player will becomes simulation input. A network packet
    // or an LLM agent would substitute here and nothing below would notice.
    // ── A DEAD BODY STILL NEEDS A WRITEABLE INTENT ──
    //
    // This was `IDLE_INTENT`, which is `Object.freeze`d and SHARED. Further down
    // the frame the network path stamps `aimYaw`/`aimPitch` onto whatever intent
    // it is about to send — so dying WHILE CONNECTED threw
    // "TypeError: Cannot assign to read only property 'aimYaw'" straight out of
    // stepWorld, and the player got "something went wrong — see the console" at
    // the exact moment they died. Invisible in single player, which is where it
    // was tested; found by an agent playtesting over a real server.
    //
    // A private, mutable copy cleared each frame. `IDLE_INTENT` stays frozen and
    // stays the do-nothing default for callers that only READ it.
    const intent = vitals.dead ? clearIntent(deadIntent) : sanitiseIntent(input.poll());

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
    // The runner-up, for whatever you are standing at. Only a fire offers one
    // today; anything else simply has no `alt` and F does nothing.
    // Shift+F at a fire: everything you could make, not just the first one.
    if (intent.makeMenu) {
      if (fires.nearest(ctrl.position, SURVIVAL.fireReach)) openFireMenu();
      else hud.toast('you need to be at a fire to make anything', 2);
    }
    if (intent.alternate && interaction?.alt) {
      const msg = interaction.alt();
      if (msg) hud.toast(msg, 1.6);
    }

    // ── light a fire ──
    if (intent.place) {
      if (inventory.countOf('wood') < SURVIVAL.woodToLight) {
        // The NUMBER, and how short you are. "You need a branch" was true when a
        // fire cost one; a player carrying six and told they need "a branch" has
        // been told nothing they can act on.
        const short = SURVIVAL.woodToLight - inventory.countOf('wood');
        hud.toast(`a fire takes ${SURVIVAL.woodToLight} branches — ${short} more`, 2);
      } else {
        camera.getWorldDirection(_drop).setY(0).normalize();
        // `SURVIVAL.firePlaceDistance`, not a literal: at the old 1.6 m the pit
        // was laid below the bottom edge of the screen. See the note there.
        const fx = ctrl.position.x + _drop.x * SURVIVAL.firePlaceDistance;
        const fz = ctrl.position.z + _drop.z * SURVIVAL.firePlaceDistance;
        const result = fires.light(fx, fz);
        if (result.ok) {
          // `SURVIVAL.woodToLight`, and it MUST match the server's arithmetic
          // in world.js or the two ends disagree about what is in your pack.
          inventory.remove('wood', SURVIVAL.woodToLight);
          hud.toast('a fire', 1.6);
          // ── and tell the server, so ITS copy of you is beside it too ──
          // Until this the fire existed in exactly one browser. The server's
          // body for you — the one that owns your health, and that fills in the
          // `me.c` core temperature the snapshot has always carried — sampled a
          // world with no fire in it and cooled as if you were standing in the
          // open. Measured at 1.54 m from a burning fire: 8.90 °C of warmth on
          // this side and none at all on the other. See `Client.lightFire`.
          net?.lightFire(fx, fz, result.fire.fuel);
        } else {
          hud.toast(result.why, 2);
        }
      }
    }

    // ── eat ──
    if (intent.eat) {
      // Best meal first: it fills you more, and eating the good food last is a
      // mistake the interface should not let you make by accident.
      //
      // DERIVED FROM THE NUTRITION TABLE, not written out here. The hardcoded
      // list was ['venison_cooked', 'venison', 'berries'] — it still listed
      // `berries`, which has never existed, and it did not list fish, so
      // adding trout to the world silently made them inedible: R said
      // "nothing to eat" while you stood there holding one. A list that has to
      // be kept in step with a table will eventually not be, so now there is
      // only the table.
      const found = EDIBLE.find((id) => inventory.countOf(id) > 0);
      if (!found) hud.toast('nothing to eat', 1.4);
      else {
        const filled = vitals.eat(found);
        if (filled > 0) {
          inventory.remove(found, 1);
          hud.toast(`ate ${itemName(found)}`, 1.4);
        } else hud.toast('you are full', 1.2);
      }
    }
    // ── HAND IT OVER ──
    //
    // THE CLIENT WAS WIRED TO NONE OF THIS. `give`, `offer` and `accept` have
    // been in the protocol and resolved by the server for two days, the AGENTS
    // use them — 29 gifts in one run — and the only "offer" anywhere in this
    // file offered food to the otter.
    //
    // So a playtester who agreed a price with two minds could not pay them. He
    // dropped eighteen branches on the grass at their feet; neither could pick
    // them up, and Eachann went on asking for the nine branches he was standing
    // on. An agent that can bargain and cannot receive deadlocks, and both did.
    //
    // The server owns the whole act — range, conservation, the announcement —
    // so all this does is name who and how many. Offline there is nobody to
    // give to, and `net` is null, so single player is untouched.
    if ((intent.giveAll || intent.giveHalfPressed) && net) {
      const held = inventory.equippedSlot;
      const near = nearestPerson();
      if (!held) hud.toast('you are holding nothing to give', 1.6);
      else if (!near) hud.toast('nobody close enough to hand it to', 1.6);
      else {
        const n = intent.giveHalfPressed ? Math.max(1, Math.ceil(held.count / 2)) : held.count;
        intent.give = near.name;
        intent.giveItem = held.item;
        intent.giveCount = n;
        // `amountText` and not `itemName` — it pluralises. This world already
        // calls one thing `wood`, "BRANCH", "8 branch" and "3 branches"; a fifth
        // spelling is not what it needs.
        hud.toast(`${amountText(held.item, n)} to ${near.name}`, 1.8);
      }
    }
    if (intent.drop || intent.dropHalf) {
      // Q drops one, Shift+Q drops half the stack rounded up. It used to take
      // the WHOLE stack for anything of kind 'ammo', so twenty arrows left in
      // one press and there was no way to part with ten.
      // ── WHO OWNS THE DROP ──
      //
      // Connected, the SERVER does. It takes the item out of the pack, lays it
      // on the ground and sends it back in `lo`, where every player and every
      // agent can see it. Doing it here as well would put the same branch in
      // the world twice — once real and once local — and picking up both is
      // how a shared world gets a duplicator.
      //
      // The intent is already going out; `dropBurn` is the only thing the
      // server cannot work out for itself, because whether the torch in your
      // hand is alight is a fact about this client.
      if (net) {
        if (torch.lit && inventory.equippedSlot?.item === 'torch') {
          intent.dropBurn = torch.left;
          torch.lit = false;
          torch.left = 0;
        }
        // Nothing else to do: the pack changes when the server says it did.
      } else {
      const taken = inventory.takeEquipped(intent.dropHalf ? 'half' : 1);
      if (taken) {
        camera.getWorldDirection(_drop).setY(0).normalize();
        // A LIT TORCH GOES DOWN STILL BURNING, with the time it had left. Put
        // one at a meeting place and it is there when you both arrive.
        const left = inventory.countOf(taken.item);
        if (taken.item === 'torch' && torch.lit) {
          // The one in hand keeps the time it had left; any others in the stack
          // were unlit and take light from it as they go down.
          const each = torch.left;
          for (let i = 0; i < taken.count; i++) {
            dropTorch(ctrl.position, i === 0 ? each : getItem('torch').burnSeconds);
          }
          torch.lit = false;
          torch.left = 0;
          hud.toast(`${amountText('torch', taken.count)} left burning`, 2);
        } else {
          pickups.drop(taken.item, taken.count, ctrl.position, _drop);
          hud.toast(
            `dropped ${amountText(taken.item, taken.count)}${left ? ` — ${left} left` : ''}`,
            1.4,
          );
        }
      }
      }
    }

    // ── the elements ──
    // Sampled once per frame at the player, then handed to the body. Creatures
    // and, later, shelter placement will read the same query.
    // ── THE TORCH ──
    //
    // The first light you can CARRY. A fire is a place you go to; a torch is a
    // place you make wherever you stand.
    //
    // It lights itself when you hold it at a burning fire — no new key, and it
    // is what you would actually do. That also means an unlit torch away from a
    // fire stays unlit, which is the whole planning pressure: light it before
    // you leave, or walk the glen in the dark.
    //
    // The burn timer only runs while it is IN YOUR HAND. Stowing it smothers
    // it, which is forgiving and saves a player from losing a torch to a
    // rummage through the pack.
    {
      const held = inventory.equippedSlot?.item;
      const holding = held === 'torch';
      if (!holding && torch.lit) {
        torch.lit = false;
        hud.toast('you stow the torch', 1.2);
      }
      // ── AND SAY WHY IT IS NOT LIT, WHICH IS THE WHOLE PROBLEM ──
      //
      // Ben made a torch and it did not light. The torch was working: it lights
      // when you HOLD it at a fire, and his was in the pack. Nothing anywhere
      // said so — he had a torch, he was at a fire, and the game was silent.
      //
      // Rate-limited, because a hint that fires every frame is not a hint.
      const atFire = !!fires.nearest(ctrl.position, SURVIVAL.fireReach);
      if (holding && !torch.lit) {
        // Carried in from the ground, still alight.
        if (torch.pending > 0) {
          torch.lit = true;
          torch.left = torch.pending;
          torch.pending = 0;
          hud.toast('the torch is still burning', 1.6);
        } else if (atFire) {
          torch.lit = true;
          torch.left = getItem('torch')?.burnSeconds ?? 300;
          hud.toast('the torch catches', 1.6);
        } else if (time - (torch.toldAt ?? -99) > 6) {
          torch.toldAt = time;
          hud.toast('you need a fire to light it', 2);
        }
      }
      // The case that actually caught him: a torch in the pack, standing at a
      // fire, with something else in hand. It names the KEY, because "hold it"
      // is advice and "press 3" is an instruction.
      if (!holding && atFire && inventory.countOf('torch') > 0
          && time - (torch.toldAt ?? -99) > 8) {
        torch.toldAt = time;
        const slot = inventory.slots.findIndex((sl) => sl?.item === 'torch');
        hud.toast(
          slot >= 0 && slot < 5
            ? `press ${slot + 1} to hold your torch and light it here`
            : 'hold your torch at the fire to light it',
          3,
        );
      }
      if (holding && torch.lit) {
        torch.left -= dt;
        if (torch.left <= 0) {
          torch.lit = false;
          inventory.remove('torch', 1);
          hud.toast('your torch burns out', 2.2);
        }
      }
      // A real light, so it genuinely lifts the ground and the trees around
      // you rather than being a glow painted on the screen. Guttering, because
      // a steady lamp reads as electric.
      // ...and the ones on the ground, which burn on their own clock.
      for (let i = ground.length - 1; i >= 0; i--) {
        const g = ground[i];
        const taken = !pickups.dropped.includes(g.entry);
        g.left -= dt;
        if (taken || g.left <= 0) {
          // Picked up, or burnt out where it lay. The item itself is the
          // pickup system's business either way; this only owns the light.
          scene.remove(g.light);
          g.light.dispose?.();
          ground.splice(i, 1);
          // A BURNING TORCH YOU PICK UP IS STILL BURNING. Held here rather than
          // relit on the spot because the pickup may not be the equipped item
          // yet — the next frame that finds a torch in hand claims it.
          if (taken && g.left > 0) torch.pending = Math.max(torch.pending ?? 0, g.left);
          if (!taken && g.left <= 0) hud.toast('a torch gutters out', 1.6);
          continue;
        }
        g.light.position.copy(g.entry.obj.position);
        g.light.position.y += 0.25;
        const gut = 0.86 + 0.14 * Math.sin(time * 9.7 + i) * Math.sin(time * 3.3 + i);
        const fade = Math.min(1, g.left / SURVIVAL.torchGroundFade);
        g.light.intensity = SURVIVAL.torchLight * gut * (0.3 + 0.7 * fade);
      }

      torch.light.visible = torch.lit;
      if (torch.lit) {
        torch.light.position.copy(camera.position);
        const gutter = 0.86 + 0.14 * Math.sin(time * 11.3) * Math.sin(time * 4.1);
        // Dies down as it burns out, so you get a warning you can see.
        const fading = Math.min(1, torch.left / 25);
        torch.light.intensity = SURVIVAL.torchLight * gutter * (0.35 + 0.65 * fading);
      }
    }

    fires.update(dt, weather);
    // The fire bed follows whichever fire is nearest — the only one you could
    // pick out anyway. `nearest` is given the audible range, not the warm one,
    // because you hear a fire from a good deal further than you feel it.
    const heardFire = fires.nearest(ctrl.position, AUDIO.fireRange);
    audio.setFire(
      heardFire
        ? Math.hypot(heardFire.position.x - ctrl.position.x, heardFire.position.z - ctrl.position.z)
        : Infinity,
      heardFire ? heardFire.intensity : 0
    );
    sites.update(dt, ctrl.position);
    caves.update(dt, ctrl.position, heightAt);
    const env = sampleEnvironment(ctrl.position, {
      hours: atmosphere.hours,
      sunAltitude: atmosphere.elevation,
      weather,
      fires,
      // A ring of standing stones breaks the wind, which is the other half of
      // why anyone would walk to one. No folklore required. Anything you have
      // BUILT counts the same way — the hook was written for exactly this.
      shelter: Math.max(
        sites.circleAt(ctrl.position) ? SITES.circleShelter : 0,
        structures.shelterAt(ctrl.position.x, ctrl.position.z)
      ),
      roofed: structures.roofedAt(ctrl.position.x, ctrl.position.z),
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
      : weapons.moveScale * (ruleset.current.survival ? vitals.speedScale : 1)
        // Nine metres of braced wing on your shoulders. Outside survival too:
        // this is the size of the object, not a hardship rule.
        * (carried ? GLIDER.carrySpeed : 1);
    // Out of breath means no sprinting until you have some back.
    if (ruleset.current.survival && vitals.sprintBlocked) intent.sprint = false;

    ctrl.update(dt, intent);
    // Riding overrides the walk rather than fighting it, so it runs straight
    // after the controller and before anything reads a position.
    updateRiding(dt, intent);
    // And flying overrides both, for the same reason and more so — the wing
    // does not care what your legs wanted.
    updateFlight(dt, intent);
    // And the one you are only carrying goes wherever your legs took you.
    updateCarry();
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
    // Hours that never wrap, for anything with a duration longer than a day.
    totalHours += (dt / 60 / TIME.dayMinutes) * 24;
    atmosphere.update(camera.position, time);
    rain.update(dt, camera.position, weather.rain, weather.windDir, weather.wind);
    lake.update(dt, camera.position, atmosphere.sun);
    life.update(dt, time, camera.position);
    stealth.update(dt, ctrl);
    // The sun is handed to the wildlife because it is no longer scenery — it
    // decides which species are allowed to exist here at all.
    //
    // Unless somebody else is deciding. On a connected client the animals are
    // the SERVER's, mirrored below from the same interpolated snapshot the
    // other players are drawn from — see wildlife.applySnapshot. Running both
    // is what gave every player a private herd nobody else could see.
    if (!(net && net.connected)) {
      wildlife.update(dt, ctrl.position, stealth, {
        hours: atmosphere.hours,
        sunAltitude: atmosphere.elevation,
        weather,
      });
    }

    // ── the lake ──
    // Fish read the same stealth noise the deer do, so wading in loudly
    // scatters them and crouching still does not — one model, everywhere.
    fish.update(dt, ctrl.position, stealth.noise);

    // ── the pet ──
    // Updated after the wildlife, so a creature that swung this frame has
    // already registered and the pet can answer it in the same tick.
    // While you are on its back YOU are steering, so its own brain must not
    // also try to walk it somewhere — two things driving one body is how an
    // animal ends up vibrating.
    if (!riding) pet.update(dt, ctrl, { nearestFood }, {
      airC: env.airC,
      nearFire: !!env.nearFire,
      shelter: structures.shelterAt(pet.position.x, pet.position.z),
      night: darkness(atmosphere.elevation),
      dayMinutes: TIME.dayMinutes,
    });
    if (pet.pendingBite) {
      const victim = pet.pendingBite;
      pet.pendingBite = null;
      // On a server the bite has ALREADY landed — `stepCompanion` resolves it
      // there and the next snapshot brings the hit points back down. Doing it
      // here as well would take the damage off a mirrored body whose hp is
      // overwritten from the packet a frame later anyway, and could bury a
      // goblin the server still has standing. The teeth are real either way;
      // who does the arithmetic is the only question.
      if (!(net && net.connected)) {
        const zone = victim.species?.hitZones?.find((z) => z.name === 'body');
        victim.applyDamage?.(OTTER.biteDamage, zone, pet.position);
      }
    }
    if (pet.says) audio.otterCall?.(pet.position, pet.says);
    if (pet.forgot) {
      hud.toast(`${petName()} has forgotten how to ${pet.tricks[pet.forgot].name.toLowerCase()}`, 3.5);
      pet.forgot = null;
    }

    // ── the other people ──
    // Intent up, interpolated world down. Nothing here writes to the local
    // simulation: the avatars are pure presentation, exactly like the terrain.
    if (net) {
      // WHERE WE ARE ACTUALLY POINTING, attached here and nowhere else.
      //
      // Set AFTER `ctrl.update` has already consumed this intent, so the local
      // controller never sees it and keeps integrating the mouse the way it
      // always did — single player is byte-identical. `PlayerInput.poll` clears
      // both fields at the top of the next frame, so they cannot go stale.
      //
      // This is the whole fix for arrows that pass through people: the server
      // was integrating look deltas and only ever received half of them.
      intent.aimYaw = ctrl.yaw;
      intent.aimPitch = ctrl.pitch;
      net.sendIntent(intent, performance.now());
      const world = net.interpolated(performance.now());
      avatars.update(dt, world, net.others);
      remoteLoot.update(dt, net.buffer.at(-1)?.snap);
      // ── and their animals ──
      // Skipping our own owner id: the snapshot carries every companion
      // including ours, and the one at OUR heel is the real one, with the trust
      // we earned and the tricks it knows. Drawing the server's copy as well
      // would put a second otter half a metre behind the first.
      petAvatars.update(dt, world, net.id);
      // ── and what OURS is like ──
      // The body has gone up since it was first put on the wire; the trust, the
      // name, the tricks and the standing orders had not, so the server's copy
      // was a stranger's animal wearing our otter's coat. Sends only when one of
      // those actually changes — see `syncCompanion`.
      net.syncCompanion(pet);
      // ── and the animals, from the same packet ──
      // The comment at the top of this section has claimed since the day it was
      // written that creatures are drawn from server snapshots. Until now only
      // PEOPLE were: `cr` was decoded, interpolated and dropped. This is the
      // line that makes the claim true.
      if (net.connected && world) {
        wildlife.applySnapshot(world.cr, dt, {
          hours: atmosphere.hours,
          sunAltitude: atmosphere.elevation,
          weather,
        });
        // ── and OUR OWN animal's fight, from the same packet ──
        //
        // THE BUG. The owner was the one person in the world who could not see
        // their own animal defend them. `pet.defend` has exactly one caller,
        // `onAttack` above, and that lives in the local wildlife simulation —
        // which a connected client does not run, by the three paragraphs at the
        // top of this block. Measured: the server's copy held `attack` for eight
        // seconds and killed three goblins while the cub at the owner's heel sat
        // in `follow` the whole time. Everybody else watched the fight.
        //
        // The animals here are already the server's, mirrored one line above, so
        // the quarry is a body we are drawing — we look it up by the server id
        // the snapshot names and hand it to the real animal. It runs there on its
        // own legs; only the DECISION comes down the wire. See `mirrorFight`,
        // which refuses a quarry out of `giveUpRange` — and read the measurement
        // in that comment before trusting any of this in a browser, because the
        // fight happens where the SERVER thinks you are, and that was 417 m from
        // where this client thought it was.
        const mine = world.co?.find((c) => c.o === net.id);
        const quarry = mine?.g != null ? wildlife.byServerId.get(mine.g) : null;
        if (mine?.s === COMPANION_ATTACK && quarry) {
          if (pet.mirrorFight(quarry)) {
            hud.toast(`${petName()} goes for the ${quarry.species.name.toLowerCase()}`, 2);
          }
        } else if (pet.target?.remote) {
          // Only ever a MIRRORED target: a locally-decided fight is not ours to
          // end, and on a connected client there are none anyway.
          pet.stopMirroredFight();
        }
      }
      // Dropped the connection: the world is ours again, and repopulates.
      if (!net.connected && wildlife.remote) wildlife.setRemote(false);
    }
    projectiles.update(dt);

    pickups.update(dt, ctrl.position);
    interaction = resolveInteraction();
    hud.setPrompt(interaction ? interaction.label : null);

    const weaponState = weapons.getState();
    hud.setCrosshair(vitals.dead ? null : weaponState, weapons.spreadHint);
    hud.setVitals(vitals);
    hud.setNeeds(vitals, ruleset.current.survival);
    hud.setStance(ctrl.crouching && !vitals.dead, inventory.wornItems.map((id) => itemName(id)));
    // The pet's needs, but only once it is yours and only when something is
    // actually wrong — the same rule the body's own gauges follow.
    hud.setPet(
      pet.tame
        ? {
            name: petName(),
            mood: pet.mood,
            fed: pet.fed,
            played: pet.played,
            warmth: pet.warmth,
            trust: pet.trust,
            trick: pet.tricks[pet.trickIds[petTrick]].name,
            known: pet.learned.has(pet.trickIds[petTrick]),
          }
        : null
    );
    reportPlace(dt);
    viewmodel.update(dt, ctrl, weaponState, atmosphere.sun, camera.quaternion);
    // After the viewmodel, so it reads the camera the frame will actually use.
    aimMark.update(dt, vitals.dead ? null : weapons.current, camera);

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

    // Once every few seconds, say where we are. Cheap, and it is the only
    // record of a session nobody writes a report about.
    if (beating && hud.started && time - beatAt > 4) {
      beatAt = time;
      beat();
    }

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
    aimMark,
    /**
     * Pin the weather. `highlands.setWeather('rain')`, or omit the argument to
     * hand control back to the state machine.
     */
    setWeather(name) {
      if (!ruleset.allows('allowWeatherControl')) return 'the weather does as it likes in Survival';
      // OWNING A NUMBER ON THE SERVER BREAKS WHATEVER WROTE IT LOCALLY — the
      // fire's fuel taught this, so say so rather than doing nothing. Every
      // field below is overwritten by the next snapshot about five times a
      // second, and a pin that silently lasts 200 ms is worse than a refusal.
      if (weather.remote) return 'the server owns the sky while you are connected';
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
    // ── the pet ──
    pet,
    fish,
    /** The odds on the nearest shoal, and why they are what they are. */
    fishing: () => {
      const s = fish.nearest(ctrl.position, 40);
      if (!s) return 'no shoal within 40 m';
      return {
        shoal: `${s.shoal.size} trout, ${s.distance.toFixed(1)} m away`,
        depthHere: +ctrl.wadeDepth.toFixed(2),
        inTheWater: ctrl.wadeDepth > 0.25,
        crouched: ctrl.crouching,
        yourNoise: +stealth.noise.toFixed(2),
        spooked: +s.shoal.spooked.toFixed(2),
        petHelping: pet.tame && petNear(),
        chance: `${Math.round(fishOdds(s.shoal) * 100)}%`,
      };
    },
    /** Open the pet's menu, as standing next to it and pressing E does. */
    petMenu: () => (openPetMenu(), 'open'),
    /** What E would do right now. Exposed so the prompt can be tested. */
    whatWouldEDo: () => resolveInteraction()?.label ?? 'nothing in reach',
    /** Where the nearest thing worth eating is — what "seek" actually asks. */
    nearestFood,
    /** Ask it for something by name, without cycling to it. */
    tell: (trick) => {
      const i = pet.trickIds.indexOf(trick);
      if (i < 0) return `it knows: ${pet.trickIds.join(', ')}`;
      petTrick = i;
      tellPet();
      return pet.status;
    },
    /**
     * Assert the keyboard→intent path with events shaped like a real keyboard's.
     * Returns failures only, or 'input ok · N checks'.
     */
    checkInput: () => {
      const { pass, results } = checkInput(input);
      return pass ? `input ok · ${results.length} checks` : results.filter((r) => !r.ok);
    },
    // ── the gazetteer ──
    // The half that makes names USEFUL rather than merely present. A player
    // told to meet at the Black Moss needs to turn that back into a direction.
    /** Where you are, in the form a person would say it out loud. */
    whereAmI: () => {
      const p = describePosition(ctrl.position.x, ctrl.position.z);
      return `${p.phrase} — ${p.local}`;
    },
    /** Turn a place name back into a bearing and a distance. */
    findPlace: (name) => {
      if (!name) return 'give me a name — try highlands.nearby()';
      const hit = findDistrict(name, ctrl.position.x, ctrl.position.z);
      if (!hit) return `no ${name} within about ${Math.round((14 * 620) / 100) / 10} km`;
      return `${hit.name}: ${Math.round(hit.distance)} m ${hit.bearing}`;
    },
    sites,
    caves,
    structures,
    harvest,
    // Flying, exposed so it can be flown from the console. The browser pane is
    // frequently not displayed on this project, and the last thing that shipped
    // broken shipped because it had only ever been driven by hand rather than
    // flown in a live frame loop.
    get flight() { return flight; },
    fly: (s) => beginFlight(s ?? structures.nearest(ctrl.position, 60)?.structure),

    /**
     * How much of the world is hunting you.
     *
     *   highlands.danger()             what it is now, and the choices
     *   highlands.danger('no-bears')   change it, including anything already out
     *   highlands.danger('none')       nothing hostile spawns at all
     *
     * Also settable as `?danger=none` in the URL, which is the form that works
     * for something driving a browser: it needs no clicking and it survives a
     * reload, and a reload is how most automated sessions recover.
     */
    danger: (id) => {
      if (id === undefined) {
        return {
          now: dangerLevel,
          choices: Object.values(DANGER_LEVELS).map((d) => `${d.id} — ${d.tagline}`),
          alsoAsUrl: `${location.pathname}?danger=none`,
        };
      }
      if (!DANGER_LEVELS[id]) return `no such level — try ${Object.keys(DANGER_LEVELS).join(', ')}`;
      return setDanger(id);
    },

    /**
     * Write a note to DEV-NOTES.md without touching the UI at all.
     *
     *   await highlands.note('the cold is confusing, nothing told me I was wet')
     *
     * The context is attached automatically, exactly as it is from the box.
     * This is the form to use when something is playing the game rather than
     * someone: no panel to open, no focus to steal, no typing into a world that
     * is still running around you.
     */
    note: async (text) => {
      if (!text) return 'say something';
      const ok = await sendNote(text, noteContext());
      return ok ? 'written to DEV-NOTES.md' : 'could not write — is `npm run dev` running?';
    },

    /**
     * Your orders for this session, left by whoever last changed the code.
     *
     *   await highlands.mission()
     *
     * Read it FIRST. It says what changed, what is worth attacking, and
     * whether you are meant to play naive — working things out the way a new
     * player would, which is itself the test — or instrumented, where you may
     * read the constants and go straight at the mechanic.
     */
    mission: async () => {
      try {
        const res = await fetch('/__mission', { cache: 'no-store' });
        return res.ok ? await res.text() : 'no mission board — is `npm run dev` running?';
      } catch {
        return 'no mission board — is `npm run dev` running?';
      }
    },

    /**
     * File a finding, with the evidence stapled on.
     *
     *   await highlands.report({
     *     verdict: 'works',                      // works | broken | confusing | unreachable
     *     about: 'the glider',
     *     found: 'ridge lift only helps if you turn back along the face...',
     *     steps: ['built it on the ridge at 80 m', 'launched into wind', '...'],
     *   })
     *
     * Prose in a chat window dies when the window closes. This lands in
     * DEV-NOTES.md with where you were, what you were carrying, AND the last
     * twenty things the game said to you — which is the part you cannot
     * reconstruct afterwards and the part that turns "I was confused" into a
     * transcript of exactly what you were told.
     */
    report: async ({ verdict = 'note', about = '', found = '', steps = [] } = {}) => {
      if (!found) return 'say what you found';
      // A picture of what they were looking at when they filed it. Half the
      // reports in this project have been about something on screen, and the
      // one person who could fix it has never seen the screen.
      const shotName = `report-${verdict}-${(about || 'note').slice(0, 24)}`;
      shoot(shotName);
      const said = hud.heard.slice(-20).map((h) => `    ${h.t}s  "${h.text}"`).join('\n');
      const body = [
        `**${verdict.toUpperCase()}**${about ? ` — ${about}` : ''}`,
        '',
        found,
        steps.length ? `\nWhat I did:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
        said ? `\nWhat the game said:\n\n${said}` : '',
      ].join('\n');
      const ok = await sendNote(body, noteContext());
      return ok ? 'filed to DEV-NOTES.md' : 'could not write — is `npm run dev` running?';
    },

    /**
     * What the game just told you, in order. The last few seconds of its side
     * of the conversation, which is otherwise gone in about two seconds.
     */
    heard: (n = 20) => hud.heard.slice(-n).map((h) => `${h.t}s  ${h.text}`),

    /**
     * Named checkpoints, held in memory, for testing something risky twice.
     *
     *   highlands.checkpoint('on the ridge')   before you try the thing
     *   highlands.restore('on the ridge')      after it kills you
     *   highlands.checkpoints()                what you have
     *
     * A tester who dies loses the hour of play that got them to the interesting
     * bit, and then either spends another hour or — far more likely — stops
     * testing that thing. A real session was reported lost exactly this way.
     *
     * Separate from the ordinary save on purpose: the save file is the PLAYER'S
     * run and a test harness must never overwrite it. These live only as long
     * as the tab does, which is right — a checkpoint is scaffolding for one
     * session, not a second save system to keep working forever.
     */
    checkpoint: (name = 'here') => {
      checkpoints.set(name, JSON.parse(JSON.stringify(captureSave(saveContext()))));
      hud.toast(`checkpoint: ${name}`, 1.6);
      return `saved "${name}" — ${checkpoints.size} held`;
    },
    restore: (name = 'here') => {
      const data = checkpoints.get(name);
      if (!data) return `no checkpoint called "${name}" — have: ${[...checkpoints.keys()].join(', ') || 'none'}`;
      applySave(JSON.parse(JSON.stringify(data)), saveContext());
      hud.toast(`back to: ${name}`, 2);
      return `restored "${name}"`;
    },
    checkpoints: () => [...checkpoints.keys()],

    /**
     * Force one line into SESSION.log now, rather than waiting for the next
     * beat. Exposed because the automatic one fires from the RENDER loop, and
     * a hidden or backgrounded tab parks requestAnimationFrame — so on the
     * machine where this is usually verified, the thing being verified never
     * runs. Testing the endpoint proves the endpoint; this tests the line the
     * game actually writes.
     */
    beat: async () => {
      await beat();
      return beating ? 'wrote a line to SESSION.log' : 'no recorder — is `npm run dev` running?';
    },
    /** Build the best thing you can afford, as B does. */
    build: () => (placeStructure(), structures.stats),
    /** What you could put down right now, and what it would cost. */
    buildable: () =>
      Object.values(BUILDABLE).map((s) => ({
        name: s.name,
        cost: Object.entries(s.cost).map(([k, n]) => `${n} ${k}`).join(' + '),
        affordable: Structures.affordable(s.id, inventory).ok,
        does: s.blurb,
      })),
    get totalHours() {
      return +totalHours.toFixed(2);
    },
    // ── multiplayer ──
    get net() {
      return net;
    },
    avatars,
    petAvatars,
    /**
     * Connect to a server without reloading.
     *
     * Identical to joining through `?join=` now, teleport included — see
     * `netHandlers`. YOU WILL BE MOVED when the welcome lands: the server has
     * already decided where your body stands, and the alternative to accepting
     * it is not staying put, it is being desynced for the rest of the session.
     */
    join: (url, name = 'wanderer') => {
      if (net) net.close();
      avatars.clear();
      petAvatars.clear();
      net = new NetClient(netHandlers());
      net.connect(url, name, pet.species.id);
      return `connecting to ${url}`;
    },
    say: (text) => (net ? (net.say(text), 'sent') : 'not connected'),
    netStatus: () =>
      net
        ? {
            state: net.state,
            id: net.id,
            seed: net.seed,
            others: [...net.others.values()].map((o) => o.name),
            avatars: avatars.count,
            // Other people's animals, drawn. Yours is not counted: it is the
            // local one, standing behind you, and never came off the wire.
            theirPets: petAvatars.count,
            pingMs: +net.ping.toFixed(1),
            snapshotsBuffered: net.buffer.length,
          }
        : 'not connected — highlands.join("ws://host:8080", "name")',
    /** Every built site near you — the barrows and circles this seed made. */
    builtSites: () =>
      sites.active
        .map((s) => ({
          name: s.name,
          kind: s.kind,
          opened: sites.opened.has(s.key),
          strangeness: +s.strangeness.toFixed(2),
          distance: Math.round(Math.hypot(s.x - ctrl.position.x, s.z - ctrl.position.z)),
        }))
        .sort((a, b) => a.distance - b.distance),
    /** What is around you, nearest first. */
    nearby: (rings = 2) =>
      nearbyDistricts(ctrl.position.x, ctrl.position.z, rings).map(
        (d) => `${d.name} — ${d.distance} m ${d.bearing} (${d.kind})`
      ),
    /** What it is like where you are standing. */
    conditions: () => {
      const env = sampleEnvironment(ctrl.position, {
        hours: atmosphere.hours,
        sunAltitude: atmosphere.elevation,
        weather,
        fires,
      });
      const s = strangenessAt(ctrl.position.x, ctrl.position.z, {
        sunAltitude: atmosphere.elevation,
        weather,
      });
      return {
        where: env.describe(),
        strangeness: +s.toFixed(2),
        place: describeStrangeness(s),
        darkness: +darkness(atmosphere.elevation).toFixed(2),
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
        // Seeded, not Math.random. Determinism is a project invariant and a
        // sandbox tool is not exempt: a debug spawn that lands somewhere new
        // every time makes the bug you are chasing unreproducible.
        const a = sandboxRand() * Math.PI * 2;
        const x = ctrl.position.x + Math.cos(a) * distance;
        const z = ctrl.position.z + Math.sin(a) * distance;
        return wildlife.spawn('bear', x, z);
      },
      'spawning'
    ),
    /**
     * Drop a pack in front of you, already aware of you. The way to actually
     * look at morale rather than wander the high country at night hoping.
     */
    spawnPack: gate(
      'allowSpawning',
      (speciesId = 'goblin', count = 5, distance = 34) => {
        const a = ctrl.yaw;
        const x = ctrl.position.x - Math.sin(a) * distance;
        const z = ctrl.position.z - Math.cos(a) * distance;
        const born = wildlife.spawnHerd(speciesId, x, z, count, 7);
        const packId = `debug:${speciesId}:${Math.round(x)},${Math.round(z)}`;
        for (const c of born) {
          c.packId = packId;
          c.awareness = 1;
          c.lastKnownThreat.copy(ctrl.position);
        }
        return `${born.length} ${speciesId} at ${distance} m`;
      },
      'spawning'
    ),
    /** What a pack is thinking. The readout the morale model is tuned against. */
    packReport: () => {
      const out = [];
      for (const c of wildlife.creatures) {
        if (!c.species.morale) continue;
        out.push({
          id: c.id,
          state: c.state,
          hp: Math.round(c.hp),
          morale: +c.morale.toFixed(2),
          nerve: describeMorale(c.morale),
          broken: c.broken,
          blown: +Math.max(0, c.stamina ?? 0).toFixed(1), // seconds of run left in it
          gone: !!c.goneToGround,
          standing: c.packStanding,
          shock: +(c.shock ?? 0).toFixed(2),
          dist: +(c.distanceToPlayer ?? 0).toFixed(1),
        });
      }
      return out.length ? out : 'no pack creatures nearby';
    },
    colliders: { scatter: scatterColliders, static: staticColliders },
    get time() { return time; },

    /**
     * Render one frame and save it to `shots/<name>.jpg` via the dev server.
     * Rendering and reading the pixels must happen in the same task — without
     * `preserveDrawingBuffer` the buffer is gone the moment we yield.
     */
    capture: (name, quality) => captureFrame(name, quality),

    /**
     * Jump somewhere and have the world fully present, for tests and photos.
     *
     * `yaw` defaults to the facing you already had. It used to have no default
     * at all, sitting between two parameters that did, so the obvious
     * `warp(x, z)` set yaw to `undefined` — which NaN'd the camera quaternion,
     * then the camera's world position, and then everything downstream that
     * read it. The first symptom was an unrelated-looking throw from
     * `Soundscape.spatial` ("non-finite AudioParam") on the next arrow impact,
     * with the real cause three calls and one silent `undefined` away.
     */
    warp(x, z, yaw = ctrl.yaw, pitch = 0, y = null) {
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
