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
import { CameraFeel } from './player/cameraFeel.js';
import { Soundscape } from './audio/soundscape.js';
import { Hud } from './ui/hud.js';

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

  const ctrl = new Controller(renderer.domElement);
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

  // If pointer lock is refused, say so once and switch to drag-look rather
  // than leaving the player unable to turn their head.
  ctrl.onLockUnavailable = () => hud.useDragLook();

  hud.wire(
    () => {
      audio.start();
      ctrl.requestLock();
    },
    () => ctrl.requestLock()
  );

  // ── action keys ──
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.code) {
      case 'KeyF':
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
        atmosphere.nudge(-1);
        hud.toast(`sun ${atmosphere.elevation.toFixed(1)}°`, 1);
        break;
      case 'BracketRight':
        atmosphere.nudge(1);
        hud.toast(`sun ${atmosphere.elevation.toFixed(1)}°`, 1);
        break;
      case 'Slash':
        if (e.shiftKey) hud.toggleKeys();
        break;
      case 'KeyB':
        hud.toast(`bloom ${composer.toggle('bloom') ? 'on' : 'off'}`);
        break;
      default:
        break;
    }
  });

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
  }
  window.addEventListener('resize', syncSize);

  // ── the loop ────────────────────────────────────────────────────────────
  let last = performance.now();
  let time = 0;

  /** One simulation + render step. Split out so it can be driven manually. */
  function stepWorld(dt) {
    syncSize();
    time += dt;

    ctrl.update(dt);
    feel.update(dt, ctrl, camera);

    terrain.update(ctrl.position.x, ctrl.position.z);
    scatter.update(ctrl.position, time);
    atmosphere.update(camera.position, time);
    lake.update(dt, camera.position, atmosphere.sun);
    life.update(dt, time, camera.position);
    audio.update(dt, ctrl, ctrl.position.y);

    const c = scatter.counts;
    hud.update(dt, `${terrain.chunkCount} chunks · ${(c.grass / 1000).toFixed(1)}k grass · ${c.trees} trees`);

    composer.render(dt, time);
    hud.captureIfPending(renderer);
  }

  function frame(now) {
    // Clamped so that returning from a background tab does not teleport you.
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    stepWorld(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  booted = true;

  // A small handle for poking at the world from the console. `stepWorld` is
  // exposed because rAF is suspended in a hidden tab, and being able to advance
  // and render one frame by hand makes the thing testable from a script.
  window.highlands = {
    scene, camera, renderer, ctrl, feel, atmosphere, terrain, scatter, lake,
    composer, life, audio, hud, spawn, landmarks, stepWorld, heightAt,
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
