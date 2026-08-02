// ── fires.js ────────────────────────────────────────────────────────────────
// Campfires: warmth, light, cooking, and a reason to be somewhere.
//
// The first *placed* thing in the world, so it is deliberately built like the
// thing Phase 7 will generalise: a placement rule, a persistent entity with
// state that ticks, a footprint the environment query knows about, and a
// serialisable form for saves. When building arrives, a wall should be able to
// reuse all of this and change only what it does.
//
// A fire is also the first light source the player controls, which makes night
// navigable and — once goblins exist — makes announcing your position a real
// trade.

import * as THREE from 'three';
import { SURVIVAL, WATER_LEVEL } from '../config.js';
import { heightAt, slopeAt, makeRandom } from './noise.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

const STONE = new THREE.Color(0x565049);
const CHAR = new THREE.Color(0x1c1512);
const LOG = new THREE.Color(0x4a3626);

let sharedGeo = null;

/** Ring of stones, a few charred logs. Built once, instanced per fire. */
function firePitGeometry() {
  if (sharedGeo) return sharedGeo;
  const rand = makeRandom('firepit');
  const parts = [];
  const paint = (geo, color) => {
    const g = geo.toNonIndexed();
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = color.r;
      arr[i * 3 + 1] = color.g;
      arr[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  };

  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = 0.52;
    const s = new THREE.IcosahedronGeometry(0.13 + rand() * 0.06, 0);
    s.scale(1, 0.75, 1);
    s.translate(Math.cos(a) * r, 0.06, Math.sin(a) * r);
    parts.push(paint(s, STONE));
  }
  const ash = new THREE.CylinderGeometry(0.42, 0.46, 0.05, 12);
  ash.translate(0, 0.02, 0);
  parts.push(paint(ash, CHAR));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const l = new THREE.CylinderGeometry(0.045, 0.055, 0.62, 5);
    l.rotateZ(Math.PI / 2 - 0.45);
    l.rotateY(a);
    l.translate(0, 0.16, 0);
    parts.push(paint(l, LOG));
  }

  // Merge by hand — BufferGeometryUtils would do, but this keeps the module
  // free of an import it needs nowhere else.
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
    p.dispose();
  }
  sharedGeo = new THREE.BufferGeometry();
  sharedGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sharedGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sharedGeo.computeVertexNormals();
  sharedGeo.computeBoundingSphere();
  return sharedGeo;
}

const pitMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.95,
  metalness: 0,
});

/** The flame itself: a few additive billboards that flicker. */
function makeFlame() {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffb44a,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  for (let i = 0; i < 4; i++) {
    const h = 0.5 + i * 0.16;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.26 - i * 0.05, h, 6, 1, true), mat.clone());
    m.position.y = 0.16 + h * 0.4;
    m.material.opacity = 0.7 - i * 0.13;
    group.add(m);
  }
  return group;
}

export class Fires {
  constructor(scene, deps = {}) {
    this.scene = scene;
    this.deps = deps; // { audio }
    this.active = [];
    this.rand = makeRandom('fires');
    this.time = 0;
  }

  /**
   * Can a fire go here? Rules kept explicit and few, because the message when
   * it fails has to tell you exactly what to change.
   */
  canPlaceAt(x, z) {
    const y = heightAt(x, z);
    if (y < WATER_LEVEL + 0.4) return { ok: false, why: 'not in the water' };
    if (slopeAt(x, z) > 0.36) return { ok: false, why: 'the ground is too steep' };
    for (const f of this.active) {
      if (Math.hypot(f.position.x - x, f.position.z - z) < 3) {
        return { ok: false, why: 'too close to another fire' };
      }
    }
    return { ok: true, y };
  }

  light(x, z, fuel = SURVIVAL.fireFuelPerWood) {
    const check = this.canPlaceAt(x, z);
    if (!check.ok) return { ok: false, why: check.why };

    const group = new THREE.Group();
    group.position.set(x, check.y, z);

    const pit = new THREE.Mesh(firePitGeometry(), pitMaterial);
    pit.castShadow = true;
    pit.receiveShadow = true;
    group.add(pit);

    const flame = makeFlame();
    group.add(flame);

    // A real light, so the fire genuinely lights the ground and the trees
    // around it. This is most of why night stops being a black screen.
    const light = new THREE.PointLight(0xffa542, 0, SURVIVAL.fireLightRange, 1.8);
    light.position.y = 0.55;
    group.add(light);

    this.scene.add(group);

    const fire = {
      id: `${Math.round(x)}_${Math.round(z)}_${this.active.length}`,
      position: group.position,
      group,
      flame,
      light,
      fuel,
      maxFuel: SURVIVAL.fireMaxFuel,
      intensity: 1,
      lit: true,
      phase: this.rand() * 100,
      cookProgress: 0,
    };
    this.active.push(fire);
    this.deps.audio?.fireLit?.(group.position);
    return { ok: true, fire };
  }

  addFuel(fire, amount = SURVIVAL.fireFuelPerWood) {
    fire.fuel = Math.min(fire.maxFuel, fire.fuel + amount);
    fire.lit = true;
    return fire.fuel;
  }

  extinguish(fire) {
    this.scene.remove(fire.group);
    const i = this.active.indexOf(fire);
    if (i >= 0) this.active.splice(i, 1);
  }

  /** Nearest lit fire within `range`, or null. */
  nearest(pos, range = SURVIVAL.fireWarmRadius) {
    let best = null;
    let bestD = range;
    for (const f of this.active) {
      const d = Math.hypot(f.position.x - pos.x, f.position.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  update(dt, weather) {
    this.time += dt;
    // Rain drowns a fire, and wind makes it gutter.
    const rain = weather?.rain ?? 0;
    const wind = weather?.wind ?? 1;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];

      const burn = SURVIVAL.fireBurnPerSec * lerp(1, 2.2, rain) * lerp(0.85, 1.3, clamp(wind / 2, 0, 1));
      f.fuel = Math.max(0, f.fuel - burn * dt);
      if (f.fuel <= 0) f.lit = false;

      // Intensity ramps down as it dies, so it fades rather than snapping out.
      const target = f.lit ? clamp(0.35 + f.fuel / 60, 0.35, 1) * lerp(1, 0.45, rain) : 0;
      f.intensity = lerp(f.intensity, target, clamp(dt * 1.5, 0, 1));

      // Flicker. Two incommensurate frequencies so it never looks like a pulse.
      const flick =
        0.82 + 0.12 * Math.sin(this.time * 11 + f.phase) + 0.06 * Math.sin(this.time * 27 + f.phase * 2);
      f.light.intensity = f.intensity * 9 * flick;
      f.light.distance = SURVIVAL.fireLightRange * clamp(f.intensity, 0.2, 1);
      f.flame.visible = f.intensity > 0.02;
      f.flame.scale.setScalar(clamp(f.intensity, 0.15, 1) * flick);
      f.flame.rotation.y += dt * 1.7;

      if (!f.lit && f.intensity < 0.03) this.extinguish(f);
    }
  }

  /** Serialisable form, for saves. */
  serialise() {
    return this.active.map((f) => ({
      p: [
        Math.round(f.position.x * 100) / 100,
        Math.round(f.position.y * 100) / 100,
        Math.round(f.position.z * 100) / 100,
      ],
      fuel: Math.round(f.fuel),
    }));
  }

  restore(list) {
    for (const f of list ?? []) this.light(f.p[0], f.p[2], f.fuel);
  }

  get stats() {
    return { lit: this.active.filter((f) => f.lit).length, total: this.active.length };
  }
}
