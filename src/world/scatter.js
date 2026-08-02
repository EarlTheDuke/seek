// ── scatter.js ──────────────────────────────────────────────────────────────
// Grass, reeds, trees and rocks. All instanced, all placed from a positional
// hash so nothing ever swims or pops as the field is re-centred on the player.
//
// Two things here are worth reading properly:
//
//  1. `HeightGrid` — placement needs the ground height and slope for tens of
//     thousands of candidates. Calling the noise stack for each one costs tens
//     of milliseconds. Instead we sample a coarse local grid once and
//     interpolate, which is ~20x cheaper and visually identical at this scale.
//
//  2. `attachWind` — the wind lives in the vertex shader. The subtle part is
//     that each blade has its own Y rotation, so the world-space wind direction
//     must be rotated into each instance's local space, or every blade bends
//     its own way and the field never reads as a coherent gust.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Q, SCATTER, WIND, WATER_LEVEL } from '../config.js';
import { heightAt, clumpAt, makeRandom, noise4 } from './noise.js';
import { hash2i, clamp, lerp, smoothstep } from '../util/math.js';

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color();

// ── shared wind shader patch ────────────────────────────────────────────────

const WIND_GLSL = /* glsl */ `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    vec3 iOrigin = instanceMatrix[3].xyz;
    vec3 iAxisX  = instanceMatrix[0].xyz;
    vec3 iAxisZ  = instanceMatrix[2].xyz;
  #else
    vec3 iOrigin = vec3(0.0);
    vec3 iAxisX  = vec3(1.0, 0.0, 0.0);
    vec3 iAxisZ  = vec3(0.0, 0.0, 1.0);
  #endif

  // Rotate the world wind direction into this instance's local frame.
  vec3 wWorld = vec3(uWindDir.x, 0.0, uWindDir.y);
  vec2 wLocal = vec2(dot(wWorld, normalize(iAxisX)), dot(wWorld, normalize(iAxisZ)));

  // Bend scales with height up the stem, and uStiff shapes the curve: a high
  // exponent keeps the base planted and whips only the tip.
  float up = clamp(transformed.y / uSpanY, 0.0, 1.0);
  float bend = pow(up, uStiff);

  // Phase from world position => the gust travels across the field rather than
  // every plant pulsing in unison. This is the whole trick.
  float phase = dot(iOrigin.xz, uWindDir) * uPhase + uTime * uFreq;
  float gust = 0.66 * sin(phase) + 0.34 * sin(phase * 2.17 + iOrigin.x * 0.07);

  float amt = gust * uStrength * bend * uSpanY;
  transformed.x += wLocal.x * amt;
  transformed.z += wLocal.y * amt;
  transformed.y -= abs(amt) * 0.22; // bending shortens it, like a real stem
}`;

const WIND_DECL = /* glsl */ `
uniform float uTime;
uniform vec2  uWindDir;
uniform float uStrength;
uniform float uSpanY;
uniform float uFreq;
uniform float uPhase;
uniform float uStiff;
`;

/**
 * Patch a material so its geometry sways. Returns the uniform block — bump
 * `uTime.value` every frame.
 *
 * Materials sharing a `key` share one compiled program but keep independent
 * uniform values, so all five tree variants cost a single shader compile.
 */
function attachWind(material, opts) {
  const uniforms = {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(WIND.dirX, WIND.dirZ).normalize() },
    uStrength: { value: opts.strength },
    uSpanY: { value: opts.spanY },
    uFreq: { value: opts.freq },
    uPhase: { value: opts.phaseScale },
    uStiff: { value: opts.stiff },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = WIND_DECL + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', WIND_GLSL);
  };
  material.customProgramCacheKey = () => `wind-${opts.key}`;
  return uniforms;
}

/**
 * A depth material carrying the same sway, so a swaying tree's *shadow* sways
 * with it. Without this the shadow stays rigid and the illusion breaks.
 */
function windDepthMaterial(opts) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const u = attachWind(mat, { ...opts, key: `${opts.key}-depth` });
  return { mat, u };
}

// ── local height cache ──────────────────────────────────────────────────────

/**
 * Coarse grid of terrain heights around a point, with bilinear lookup and
 * gradient-based slope. Cheap stand-in for the full noise stack during
 * placement — the terrain has no features below ~40 m wavelength, so an 2–8 m
 * grid loses nothing you can see.
 */
class HeightGrid {
  constructor(spacing, radius) {
    this.s = spacing;
    this.n = Math.ceil((radius * 2) / spacing) + 3;
    this.h = new Float32Array(this.n * this.n);
    this.ox = 0;
    this.oz = 0;
  }

  rebuild(cx, cz) {
    const { s, n, h } = this;
    this.ox = cx - ((n - 1) * s) / 2;
    this.oz = cz - ((n - 1) * s) / 2;
    for (let j = 0; j < n; j++) {
      const z = this.oz + j * s;
      const row = j * n;
      for (let i = 0; i < n; i++) h[row + i] = heightAt(this.ox + i * s, z);
    }
  }

  /** Grid-space clamped fetch. */
  at(i, j) {
    const n = this.n;
    const ci = i < 0 ? 0 : i > n - 1 ? n - 1 : i;
    const cj = j < 0 ? 0 : j > n - 1 ? n - 1 : j;
    return this.h[cj * n + ci];
  }

  height(x, z) {
    const fx = (x - this.ox) / this.s;
    const fz = (z - this.oz) / this.s;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const a = this.at(i, j);
    const b = this.at(i + 1, j);
    const c = this.at(i, j + 1);
    const d = this.at(i + 1, j + 1);
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  /** 0 = flat, 1 = cliff. */
  slope(x, z) {
    const s = this.s;
    const dx = (this.height(x - s, z) - this.height(x + s, z)) / (2 * s);
    const dz = (this.height(x, z - s) - this.height(x, z + s)) / (2 * s);
    return 1 - 1 / Math.sqrt(dx * dx + dz * dz + 1);
  }
}

// ── geometry builders ───────────────────────────────────────────────────────

/** One grass blade, built at unit height so instance scale sets its size. */
function bladeGeometry(segments = 4) {
  // 2.2 cm across. Real grass is nearer 5 mm, but at 5 mm a blade is thinner
  // than a pixel at any distance and just aliases into noise; this is the
  // smallest width that still reads as a blade rather than sparkle.
  const halfW = 0.011;
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = halfW * lerp(1, 0.12, t);
    const curve = 0.075 * t * t; // natural resting droop
    pos.push(-w, t, curve, w, t, curve);
    // Normals biased hard upward. Grass lit like soft turf reads far better
    // than grass lit like a field of tiny vertical billboards.
    nor.push(0, 0.87, 0.5, 0, 0.87, 0.5);
    const shade = lerp(0.42, 1, t); // dark at the root, bright at the tip
    col.push(shade, shade, shade, shade, shade, shade);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/**
 * Push vertices out along `normalize(position)` by position-derived noise.
 *
 * Displacing along the *vertex normal* would tear this geometry apart: an
 * icosahedron is non-indexed, so corner vertices are duplicated with different
 * normals and would move apart, opening cracks. Deriving both the direction and
 * the amount purely from position keeps duplicates locked together.
 */
function roughen(geo, amount, freq = 0.55) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // Scaling radially by a position-derived factor is exactly "displace along
    // normalize(position)", and is duplicate-vertex safe by construction.
    const k = 1 + noise4(v.x * freq, v.y * freq, v.z * freq, 0.5) * amount;
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  p.needsUpdate = true;
  return geo;
}

/** Flat-shaded, uniform-attribute, ready to merge. */
function prep(geo, color, jitter, rand) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    // Per-face jitter — one value for all three verts keeps facets crisp.
    const k = 1 + (rand() - 0.5) * jitter;
    for (let v = 0; v < 3; v++) {
      arr[(i + v) * 3] = color.r * k;
      arr[(i + v) * 3 + 1] = color.g * k;
      arr[(i + v) * 3 + 2] = color.b * k;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

const BARK = new THREE.Color(0x4b3b2b);
const LEAF = [0x4f5d22, 0x5e6528, 0x3f5320, 0x6c6b2c, 0x445b26].map((h) => new THREE.Color(h));
const STONE = [0x50483e, 0x5c5348, 0x453f37].map((h) => new THREE.Color(h));

function makeTree(rand, variant) {
  const height = lerp(5.5, 11, rand());
  const trunkR = lerp(0.28, 0.5, rand());

  // A short bare trunk with a broad crown starting low reads as a real
  // broadleaf. A thin tall stick under a sphere reads as a lollipop.
  const trunk = new THREE.CylinderGeometry(trunkR * 0.62, trunkR, height * 0.58, 6, 1);
  trunk.translate(0, height * 0.29, 0);
  const parts = [prep(trunk, BARK, 0.22, rand)];

  // The crown is a cluster of blobs packed around ONE centre, offset mostly
  // sideways. Spreading them up the trunk instead — which is the obvious thing
  // to do — stacks them into a pile of separate discs that reads as pancakes,
  // not foliage. They have to overlap enough to merge into a single mass.
  const leaf = LEAF[variant % LEAF.length];
  const crownY = height * 0.72;
  const crownR = lerp(2.1, 3.1, rand());
  const blobs = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < blobs; i++) {
    const canopy = new THREE.IcosahedronGeometry(crownR * lerp(0.64, 1, rand()), 1);
    roughen(canopy, 0.32, 0.5);
    canopy.scale(1.1, 0.84, 1.1);
    const a = (i / blobs) * Math.PI * 2 + rand() * 0.9;
    const rad = i === 0 ? 0 : crownR * lerp(0.3, 0.62, rand());
    canopy.translate(
      Math.cos(a) * rad,
      crownY + (rand() - 0.5) * crownR * 0.55,
      Math.sin(a) * rad
    );
    parts.push(prep(canopy, leaf, 0.3, rand));
  }

  const merged = mergeGeometries(parts);
  merged.computeVertexNormals(); // non-indexed => flat, faceted, low-poly
  merged.computeBoundingSphere();
  // Recorded so the collision layer can build a cheap proxy for this tree
  // without re-deriving it from the mesh. See world/colliders.js.
  merged.userData.height = height;
  merged.userData.trunkR = trunkR;
  merged.userData.trunkH = height * 0.58;
  merged.userData.crownY = crownY;
  merged.userData.crownR = crownR * 1.15;
  for (const p of parts) p.dispose();
  return merged;
}

function makeRock(rand, variant) {
  const r = lerp(0.4, 1.25, rand());
  const geo = new THREE.IcosahedronGeometry(r, 1);
  roughen(geo, 0.42, 0.9);
  geo.scale(lerp(0.8, 1.5, rand()), lerp(0.4, 0.8, rand()), lerp(0.8, 1.5, rand()));
  const g = prep(geo, STONE[variant % STONE.length], 0.24, rand);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ── the scatter field ───────────────────────────────────────────────────────

export class Scatter {
  constructor(scene) {
    const rand = makeRandom('scatter');

    // ── grass ──
    const grassMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.grassWind = attachWind(grassMat, {
      key: 'stem',
      strength: WIND.grassStrength,
      spanY: 1,
      freq: WIND.grassFreq,
      phaseScale: WIND.grassPhaseScale,
      stiff: 1.9,
    });
    this.grass = new THREE.InstancedMesh(bladeGeometry(4), grassMat, Q.grassMax);
    this.grass.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(Q.grassMax * 3),
      3
    );
    this.grass.receiveShadow = true;
    this.grass.frustumCulled = false;
    this.grass.count = 0;
    scene.add(this.grass);

    // ── reeds (same stem shader, stiffer and taller, only at the waterline) ──
    const reedMax = Math.floor(Q.grassMax * 0.14);
    const reedMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.reedWind = attachWind(reedMat, {
      key: 'stem',
      strength: WIND.grassStrength * 0.55,
      spanY: 1,
      freq: WIND.grassFreq * 0.7,
      phaseScale: WIND.grassPhaseScale * 0.6,
      stiff: 2.6,
    });
    this.reeds = new THREE.InstancedMesh(bladeGeometry(4), reedMat, reedMax);
    this.reeds.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(reedMax * 3), 3);
    this.reeds.receiveShadow = true;
    this.reeds.frustumCulled = false;
    this.reeds.count = 0;
    scene.add(this.reeds);

    // ── trees ──
    this.trees = [];
    for (let v = 0; v < 5; v++) {
      const geo = makeTree(rand, v);
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0,
      });
      const wind = attachWind(mat, {
        key: 'tree',
        strength: WIND.treeStrength,
        spanY: geo.userData.height,
        freq: WIND.treeFreq,
        phaseScale: WIND.treePhaseScale,
        stiff: 1.5,
      });
      const depth = windDepthMaterial({
        strength: WIND.treeStrength,
        spanY: geo.userData.height,
        freq: WIND.treeFreq,
        phaseScale: WIND.treePhaseScale,
        stiff: 1.5,
        key: 'tree',
      });
      const mesh = new THREE.InstancedMesh(geo, mat, Q.treeMax);
      mesh.customDepthMaterial = depth.mat;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      this.trees.push({ mesh, wind, depthWind: depth.u, height: geo.userData.height });
    }

    // ── rocks ──
    this.rocks = [];
    for (let v = 0; v < 3; v++) {
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0,
      });
      const geo = makeRock(rand, v);
      const mesh = new THREE.InstancedMesh(geo, mat, Q.rockMax);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.userData.radius = geo.boundingSphere ? geo.boundingSphere.radius : 1;
      scene.add(mesh);
      this.rocks.push(mesh);
    }

    /** Filled in by placeLarge(); consumed by the projectile system. */
    this.colliders = null;

    this.grassGrid = new HeightGrid(2, Q.grassRadius + 4);
    this.bigGrid = new HeightGrid(8, Q.scatterRadius + 16);
    // Where each field was last centred. Infinity forces a build on frame one.
    this.grassAnchor = new THREE.Vector3(Infinity, 0, Infinity);
    this.bigAnchor = new THREE.Vector3(Infinity, 0, Infinity);

    /** Circles kept clear of trees and rocks — see landmarks.js. */
    this.clearings = [];
  }

  setClearings(list) {
    // Pre-square the radii so the placement loop stays sqrt-free.
    this.clearings = list.map((c) => ({ x: c.x, z: c.z, r2: c.r * c.r }));
    this.bigAnchor.set(Infinity, 0, Infinity); // force a re-place
  }

  inClearing(x, z) {
    for (let i = 0; i < this.clearings.length; i++) {
      const c = this.clearings[i];
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < c.r2) return true;
    }
    return false;
  }

  // ── grass + reeds ─────────────────────────────────────────────────────────
  placeGround(px, pz) {
    this.grassGrid.rebuild(px, pz);
    const grid = this.grassGrid;
    const cell = SCATTER.grassCell;
    const R = Q.grassRadius;
    const R2 = R * R;

    const gm = this.grass.instanceMatrix.array;
    const gc = this.grass.instanceColor.array;
    const rm = this.reeds.instanceMatrix.array;
    const rc = this.reeds.instanceColor.array;
    let g = 0;
    let r = 0;
    const gMax = this.grass.instanceMatrix.count;
    const rMax = this.reeds.instanceMatrix.count;

    const ci0 = Math.floor((px - R) / cell);
    const ci1 = Math.ceil((px + R) / cell);
    const cj0 = Math.floor((pz - R) / cell);
    const cj1 = Math.ceil((pz + R) / cell);

    for (let cj = cj0; cj <= cj1; cj++) {
      const bz = cj * cell;
      const dz = bz - pz;
      for (let ci = ci0; ci <= ci1; ci++) {
        const bx = ci * cell;
        const dx = bx - px;
        const d2 = dx * dx + dz * dz;
        if (d2 > R2) continue;
        const dist = Math.sqrt(d2);

        // Two separate falloffs doing two separate jobs:
        //  * `near` spends the blade budget where you can actually resolve
        //    blades — thick underfoot, thinning with distance.
        //  * `fall` takes density to zero at the ring edge, so the field does
        //    not end in a visible circle of stubble around you.
        const near = 1 - smoothstep(10, R, dist) * 0.78;
        const fall = 1 - dist / R;
        const want = Q.grassDensity * cell * cell * near * smoothstep(0, 0.3, fall);
        const whole = Math.floor(want);
        const n = whole + (hash2i(ci, cj, 991) < want - whole ? 1 : 0);
        if (n === 0) continue;

        // Height and slope come from the cell corner — a 1 m cell on terrain
        // this smooth means per-blade sampling would be wasted work.
        const ch = grid.height(bx, bz);
        if (ch > SCATTER.grassMaxHeight) continue;
        const slope = grid.slope(bx, bz);

        const nearWater = ch > WATER_LEVEL - 1.1 && ch < WATER_LEVEL + 1.3;

        if (ch >= SCATTER.grassMinHeight && slope <= SCATTER.grassMaxSlope && g < gMax) {
          // Gold on the dry uplands, green in the damp lowlands.
          const dry = smoothstep(16, 62, ch);
          for (let b = 0; b < n && g < gMax; b++) {
            const h1 = hash2i(ci, cj, b * 7 + 1);
            const h2 = hash2i(ci, cj, b * 7 + 2);
            const h3 = hash2i(ci, cj, b * 7 + 3);
            const h4 = hash2i(ci, cj, b * 7 + 4);
            const x = bx + h1 * cell;
            const z = bz + h2 * cell;
            const hgt = lerp(0.22, 0.5, h3) * lerp(1, 0.45, slope / SCATTER.grassMaxSlope);
            _pos.set(x, grid.height(x, z) - 0.06, z);
            _q.setFromAxisAngle(_up, h4 * Math.PI * 2);
            _scale.set(lerp(0.8, 1.25, h1), hgt, 1);
            _m4.compose(_pos, _q, _scale);
            _m4.toArray(gm, g * 16);
            _col
              .setRGB(lerp(0.30, 0.62, dry), lerp(0.42, 0.55, dry), lerp(0.16, 0.20, dry))
              .multiplyScalar(lerp(0.78, 1.18, h2));
            gc[g * 3] = _col.r;
            gc[g * 3 + 1] = _col.g;
            gc[g * 3 + 2] = _col.b;
            g++;
          }
        }

        if (nearWater && r < rMax) {
          const reeds = 1 + (hash2i(ci, cj, 733) < 0.5 ? 1 : 0);
          for (let b = 0; b < reeds && r < rMax; b++) {
            const h1 = hash2i(ci, cj, b * 11 + 51);
            const h2 = hash2i(ci, cj, b * 11 + 52);
            const h3 = hash2i(ci, cj, b * 11 + 53);
            const x = bx + h1 * cell;
            const z = bz + h2 * cell;
            _pos.set(x, grid.height(x, z) - 0.1, z);
            _q.setFromAxisAngle(_up, h3 * Math.PI * 2);
            _scale.set(lerp(0.7, 1.1, h2), lerp(1.5, 2.6, h1), 1);
            _m4.compose(_pos, _q, _scale);
            _m4.toArray(rm, r * 16);
            _col.setRGB(0.17, 0.3, 0.12).multiplyScalar(lerp(0.8, 1.25, h3));
            rc[r * 3] = _col.r;
            rc[r * 3 + 1] = _col.g;
            rc[r * 3 + 2] = _col.b;
            r++;
          }
        }
      }
    }

    this.grass.count = g;
    this.reeds.count = r;
    this.grass.instanceMatrix.needsUpdate = true;
    this.grass.instanceColor.needsUpdate = true;
    this.reeds.instanceMatrix.needsUpdate = true;
    this.reeds.instanceColor.needsUpdate = true;
  }

  // ── trees + rocks ─────────────────────────────────────────────────────────
  placeLarge(px, pz) {
    this.bigGrid.rebuild(px, pz);
    const grid = this.bigGrid;
    const R = Q.scatterRadius;
    const R2 = R * R;

    const treeCounts = this.trees.map(() => 0);
    const rockCounts = this.rocks.map(() => 0);

    // ── trees ──
    const tc = SCATTER.treeCell;
    for (let cj = Math.floor((pz - R) / tc); cj <= Math.ceil((pz + R) / tc); cj++) {
      for (let ci = Math.floor((px - R) / tc); ci <= Math.ceil((px + R) / tc); ci++) {
        const h1 = hash2i(ci, cj, 11);
        const h2 = hash2i(ci, cj, 12);
        const x = ci * tc + h1 * tc;
        const z = cj * tc + h2 * tc;
        const dx = x - px;
        const dz = z - pz;
        if (dx * dx + dz * dz > R2) continue;

        // Copses, not confetti.
        if (hash2i(ci, cj, 13) > clumpAt(x, z) * 0.92) continue;
        if (this.inClearing(x, z)) continue;

        const h = grid.height(x, z);
        if (h < SCATTER.treeMinHeight || h > SCATTER.treeMaxHeight) continue;
        if (grid.slope(x, z) > SCATTER.treeMaxSlope) continue;

        const v = Math.floor(hash2i(ci, cj, 14) * this.trees.length) % this.trees.length;
        const entry = this.trees[v];
        const i = treeCounts[v];
        if (i >= entry.mesh.instanceMatrix.count) continue;

        // Thin and shrink toward the treeline, as real forests do.
        const alt = 1 - smoothstep(SCATTER.treeMaxHeight - 22, SCATTER.treeMaxHeight, h) * 0.45;
        _pos.set(x, h - 0.3, z);
        _q.setFromAxisAngle(_up, hash2i(ci, cj, 15) * Math.PI * 2);
        _scale.setScalar(lerp(0.75, 1.3, hash2i(ci, cj, 16)) * alt);
        _m4.compose(_pos, _q, _scale);
        _m4.toArray(entry.mesh.instanceMatrix.array, i * 16);
        treeCounts[v] = i + 1;
      }
    }

    // ── rocks ──
    const rc = SCATTER.rockCell;
    for (let cj = Math.floor((pz - R) / rc); cj <= Math.ceil((pz + R) / rc); cj++) {
      for (let ci = Math.floor((px - R) / rc); ci <= Math.ceil((px + R) / rc); ci++) {
        const h1 = hash2i(ci, cj, 21);
        const h2 = hash2i(ci, cj, 22);
        const x = ci * rc + h1 * rc;
        const z = cj * rc + h2 * rc;
        const dx = x - px;
        const dz = z - pz;
        if (dx * dx + dz * dz > R2) continue;

        const h = grid.height(x, z);
        const slope = grid.slope(x, z);
        // Rocks like steep ground and shorelines; grass covers the gentle flats.
        const shore = smoothstep(3.5, 0.6, Math.abs(h - WATER_LEVEL)) * SCATTER.rockShoreBonus;
        const chance = smoothstep(0.2, 0.62, slope) * 0.7 + shore + 0.09;
        if (hash2i(ci, cj, 23) > chance) continue;
        if (this.inClearing(x, z)) continue;

        const v = Math.floor(hash2i(ci, cj, 24) * this.rocks.length) % this.rocks.length;
        const mesh = this.rocks[v];
        const i = rockCounts[v];
        if (i >= mesh.instanceMatrix.count) continue;

        _pos.set(x, h - 0.25, z);
        _q.setFromAxisAngle(_up, hash2i(ci, cj, 25) * Math.PI * 2);
        _scale.setScalar(lerp(0.55, 1.35, hash2i(ci, cj, 26)));
        _m4.compose(_pos, _q, _scale);
        _m4.toArray(mesh.instanceMatrix.array, i * 16);
        rockCounts[v] = i + 1;
      }
    }

    this.trees.forEach((t, v) => {
      t.mesh.count = treeCounts[v];
      t.mesh.instanceMatrix.needsUpdate = true;
    });
    this.rocks.forEach((m, v) => {
      m.count = rockCounts[v];
      m.instanceMatrix.needsUpdate = true;
    });

    this.rebuildColliders();
  }

  /**
   * Publish a cheap analytic proxy for every placed instance so projectiles can
   * hit them: a cylinder for each trunk, a sphere for each crown and each rock.
   * Rebuilt only when the scatter is re-placed, i.e. every 55 m of travel.
   */
  rebuildColliders() {
    const field = this.colliders;
    if (!field) return;
    field.clear();

    for (const t of this.trees) {
      const geo = t.mesh.geometry.userData;
      const arr = t.mesh.instanceMatrix.array;
      for (let i = 0; i < t.mesh.count; i++) {
        const o = i * 16;
        const x = arr[o + 12];
        const y = arr[o + 13];
        const z = arr[o + 14];
        // Uniform scale, so column 0's length is the scale factor.
        const s = Math.hypot(arr[o], arr[o + 1], arr[o + 2]) || 1;
        field.addCylinder(x, y, z, geo.trunkR * s * 1.5, geo.trunkH * s, 'tree');
        field.addSphere(x, y + geo.crownY * s, z, geo.crownR * s, 'tree');
      }
    }

    for (const m of this.rocks) {
      const r0 = m.userData.radius ?? 1;
      const arr = m.instanceMatrix.array;
      for (let i = 0; i < m.count; i++) {
        const o = i * 16;
        const s = Math.hypot(arr[o], arr[o + 1], arr[o + 2]) || 1;
        field.addSphere(arr[o + 12], arr[o + 13] + r0 * s * 0.45, arr[o + 14], r0 * s * 0.85, 'rock');
      }
    }

    this.onCollidersRebuilt?.(field);
  }

  /**
   * Point every wind-driven shader at the current wind.
   *
   * All the stems and canopies share one direction and one strength multiplier,
   * so weather can swing the whole landscape at once — which is the point: when
   * the wind turns, you can see it turn.
   */
  setWind(dirX, dirZ, strength = 1) {
    const blocks = [this.grassWind, this.reedWind];
    for (const t of this.trees) blocks.push(t.wind, t.depthWind);
    for (const b of blocks) {
      b.uWindDir.value.set(dirX, dirZ).normalize();
      if (b.uBaseStrength === undefined) b.uBaseStrength = b.uStrength.value;
      b.uStrength.value = b.uBaseStrength * strength;
    }
  }

  /** Re-centre the fields on the player if they have walked far enough. */
  update(pos, time) {
    // Re-placing on a travel threshold rather than every frame: the grass pass
    // costs a couple of milliseconds, and at 10 m that is once per ~1.5 s.
    if (Math.hypot(pos.x - this.grassAnchor.x, pos.z - this.grassAnchor.z) > SCATTER.grassRebuildDist) {
      this.grassAnchor.set(pos.x, 0, pos.z);
      this.placeGround(pos.x, pos.z);
    }
    if (Math.hypot(pos.x - this.bigAnchor.x, pos.z - this.bigAnchor.z) > SCATTER.treeRebuildDist) {
      this.bigAnchor.set(pos.x, 0, pos.z);
      this.placeLarge(pos.x, pos.z);
    }

    this.grassWind.uTime.value = time;
    this.reedWind.uTime.value = time;
    for (const t of this.trees) {
      t.wind.uTime.value = time;
      t.depthWind.uTime.value = time;
    }
  }

  get counts() {
    return {
      grass: this.grass.count,
      reeds: this.reeds.count,
      trees: this.trees.reduce((s, t) => s + t.mesh.count, 0),
      rocks: this.rocks.reduce((s, m) => s + m.count, 0),
    };
  }
}
