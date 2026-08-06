// ── landmarks.js ────────────────────────────────────────────────────────────
// The reason to walk.
//
// Random scatter never composes a view. These five landmarks are *sited*: we
// search the terrain for the ground each one wants — the highest ridge in a
// given direction, the deepest gully, the top of the world — and build there.
// Because the search reads the same deterministic height function, siting is
// reproducible without hand-typing coordinates that a seed change would break.
//
// The spawn point is then chosen so that standing still you see the lake with
// the sun's glint on it, a treeline, and landmarks at two different distances.
// That layered depth is what creates the urge to start walking.

import * as THREE from 'three';
import { LAKE, SKY, WATER_LEVEL } from '../config.js';
import { heightAt, slopeAt, makeRandom, noise4 } from './noise.js';
import { lerp } from '../util/math.js';
// The siting scan itself moved out, unchanged, so things with no scene can ask
// where the clear ground is. See landmarksites.js — and timber.js, which is why.
import { landmarkSites, CLEAR_RADIUS } from './landmarksites.js';

const STONE_A = new THREE.Color(0x6a6259);
const STONE_B = new THREE.Color(0x565049);
const STONE_C = new THREE.Color(0x7b7368);

/** Weathered stone: radial noise displacement, flat shaded. */
function weather(geo, amount, freq) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + noise4(v.x * freq, v.y * freq, v.z * freq, 3.7) * amount;
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function stoneMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.93, metalness: 0, flatShading: true });
}

// ── individual landmarks ────────────────────────────────────────────────────

/** A ring of leaning monoliths on a high ridge — the headline silhouette. */
function monolithRing(group, site, rand) {
  const n = 9;
  const radius = 13;
  const mat = stoneMaterial(STONE_A);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rand() * 0.1;
    const x = site.x + Math.cos(ang) * radius;
    const z = site.z + Math.sin(ang) * radius;
    const h = lerp(7.5, 13.5, rand());
    const w = lerp(1.5, 2.4, rand());

    const geo = new THREE.BoxGeometry(w, h, w * 0.62, 2, 4, 2);
    weather(geo, 0.1, 0.42);
    geo.translate(0, h * 0.5, 0);

    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, heightAt(x, z) - 0.6, z);
    m.rotation.y = rand() * Math.PI;
    // A couple of degrees of lean; perfectly upright reads as CG.
    m.rotation.z = (rand() - 0.5) * 0.1;
    m.rotation.x = (rand() - 0.5) * 0.1;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  // A fallen one, because a perfect ring looks staged.
  const fallen = new THREE.BoxGeometry(2.1, 11, 1.4, 2, 4, 2);
  weather(fallen, 0.1, 0.42);
  const fm = new THREE.Mesh(fallen, mat);
  fm.position.set(site.x + 3, heightAt(site.x + 3, site.z - 4) + 0.8, site.z - 4);
  fm.rotation.set(Math.PI / 2, 0.7, 0.1);
  fm.castShadow = true;
  fm.receiveShadow = true;
  group.add(fm);
}

/** One enormous tree alone on a hilltop. */
function greatTree(group, site, rand) {
  const height = 26;
  const bark = new THREE.MeshStandardMaterial({ color: 0x4a3a29, roughness: 0.9, flatShading: true });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4d5a24, roughness: 0.85, flatShading: true });

  const trunk = new THREE.CylinderGeometry(0.9, 2.2, height * 0.62, 8, 3);
  weather(trunk, 0.06, 0.3);
  trunk.translate(0, height * 0.31, 0);
  const t = new THREE.Mesh(trunk, bark);
  t.castShadow = true;
  t.receiveShadow = true;
  group.add(t);

  // Boughs
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 + rand();
    const len = lerp(5, 8, rand());
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.55, len, 6), bark);
    b.position.set(Math.cos(ang) * len * 0.32, height * 0.55, Math.sin(ang) * len * 0.32);
    b.rotation.z = Math.cos(ang) * -0.9;
    b.rotation.x = Math.sin(ang) * 0.9;
    b.castShadow = true;
    group.add(b);
  }

  for (let i = 0; i < 7; i++) {
    const r = lerp(4.5, 7.5, rand());
    const geo = new THREE.IcosahedronGeometry(r, 1);
    weather(geo, 0.24, 0.28);
    const c = new THREE.Mesh(geo, leaf);
    c.position.set(
      (rand() - 0.5) * 9,
      height * lerp(0.62, 0.95, rand()),
      (rand() - 0.5) * 9
    );
    c.scale.y = lerp(0.7, 1, rand());
    c.castShadow = true;
    c.receiveShadow = true;
    group.add(c);
  }

  group.position.set(site.x, heightAt(site.x, site.z) - 0.5, site.z);
}

/** A natural arch spanning a gully. */
function stoneArch(group, site, rand) {
  const mat = stoneMaterial(STONE_B);
  const span = 30;
  const rise = 17;
  const blocks = 15;
  for (let i = 0; i < blocks; i++) {
    const t = i / (blocks - 1);
    const ang = Math.PI * t;
    const x = -Math.cos(ang) * (span / 2);
    const y = Math.sin(ang) * rise;
    // Thick at the abutments, slimmer at the crown — how an arch actually wears.
    const thick = lerp(5.5, 2.8, Math.sin(ang));
    const geo = new THREE.BoxGeometry(thick, thick * lerp(1.4, 0.9, t), lerp(7, 4.5, Math.sin(ang)), 2, 2, 2);
    weather(geo, 0.13, 0.3);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, (rand() - 0.5) * 1.2);
    m.rotation.z = -ang + Math.PI / 2;
    m.rotation.y = (rand() - 0.5) * 0.2;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  // Sink it so the feet meet the ground rather than floating over the gully.
  const footL = heightAt(site.x - span / 2, site.z);
  const footR = heightAt(site.x + span / 2, site.z);
  group.position.set(site.x, Math.min(footL, footR) - 1.5, site.z);
  group.rotation.y = rand() * Math.PI;
}

/** A cairn at the highest point, with a real panoramic payoff. */
function cairn(group, site, rand) {
  const mat = stoneMaterial(STONE_C);
  let y = 0;
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const r = lerp(2.3, 0.42, t);
    const geo = new THREE.IcosahedronGeometry(r, 1);
    weather(geo, 0.34, 1.1);
    geo.scale(1, lerp(0.5, 0.72, rand()), 1);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((rand() - 0.5) * r * 0.5, y + r * 0.3, (rand() - 0.5) * r * 0.5);
    m.rotation.y = rand() * Math.PI;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    y += r * 0.72;
  }
  group.position.set(site.x, heightAt(site.x, site.z) - 0.3, site.z);
}

/** A monolith half-drowned in the shallows, to give the lake a focal point. */
function sunkenStone(group, site, rand) {
  const mat = stoneMaterial(STONE_A);
  const h = 12;
  const geo = new THREE.BoxGeometry(2.6, h, 1.9, 2, 4, 2);
  weather(geo, 0.12, 0.4);
  geo.translate(0, h * 0.5, 0);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.set(0.34, rand() * Math.PI, 0.12); // listing, as if it sank
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  group.position.set(site.x, WATER_LEVEL - 3.4, site.z);
}

// ── siting and assembly ─────────────────────────────────────────────────────

export function buildLandmarks(scene) {
  const rand = makeRandom('landmarks');
  const root = new THREE.Group();
  scene.add(root);

  // Look toward the sun from the lake: that is the direction the player will be
  // facing at spawn, so the biggest silhouette belongs there, backlit. The scan
  // itself lives in landmarksites.js — the ONE definition of where these stand,
  // shared with everything that needs the answer without a scene.
  const sites = landmarkSites();

  const builders = [
    ['monoliths', monolithRing],
    ['greatTree', greatTree],
    ['arch', stoneArch],
    ['cairn', cairn],
    ['sunken', sunkenStone],
  ];

  const built = {};
  const clearings = [];
  for (const [name, build] of builders) {
    const site = sites[name];
    const clear = CLEAR_RADIUS[name];
    if (!site) continue; // this seed had no suitable ground; skip rather than float one
    const g = new THREE.Group();
    build(g, site, rand);
    root.add(g);
    built[name] = { ...site, clear };
    clearings.push({ x: site.x, z: site.z, r: clear });
  }

  return { root, sites: built, clearings };
}

/**
 * Choose where the player opens their eyes.
 *
 * Stand on the shore *opposite* the sun so the specular streak runs across the
 * water straight at you, then face the lake — which also faces the monolith
 * ridge beyond it. One position, three layers of depth.
 */
export function pickSpawn(sunHorizontal) {
  const back = sunHorizontal.clone().multiplyScalar(-1);
  let best = null;

  // Walk outward from the shoreline until we find dry, gently sloping ground.
  for (let d = LAKE.radius * 0.78; d < LAKE.radius * 1.5; d += 4) {
    for (let side = -22; side <= 22; side += 11) {
      const a = THREE.MathUtils.degToRad(side);
      const dx = back.x * Math.cos(a) - back.z * Math.sin(a);
      const dz = back.x * Math.sin(a) + back.z * Math.cos(a);
      const x = LAKE.x + dx * d;
      const z = LAKE.z + dz * d;
      const h = heightAt(x, z);
      if (h < WATER_LEVEL + 1.2) continue;
      const s = slopeAt(x, z);
      if (s > 0.3) continue;
      // Prefer a little elevation — a viewpoint, not a ditch — but stay close.
      const score = h * 0.5 - d * 0.05 - s * 40;
      if (!best || score > best.score) best = { x, z, h, score };
    }
  }

  // Fallback: the world always has *somewhere* dry. Should never be needed.
  if (!best) {
    const x = LAKE.x + back.x * LAKE.radius * 1.4;
    const z = LAKE.z + back.z * LAKE.radius * 1.4;
    best = { x, z, h: heightAt(x, z) };
  }

  // Face the lake centre. With the camera's YXZ rotation order its forward
  // vector is (-sin yaw, 0, -cos yaw), hence the negated arguments here.
  const yaw = Math.atan2(-(LAKE.x - best.x), -(LAKE.z - best.z));
  return { position: new THREE.Vector3(best.x, best.h, best.z), yaw };
}
