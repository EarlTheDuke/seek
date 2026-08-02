// ── sky.js ──────────────────────────────────────────────────────────────────
// Sun, sky, fog and mist — one coherent atmosphere.
//
// The important idea: a single sun elevation drives *everything*. The sky
// shader, the directional light's colour and strength, the fog tint, the
// hemisphere bounce and the water's specular all read from the same number, so
// they can never disagree with each other. Scrub the elevation and the whole
// world changes mood together.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { SKY, Q, LAKE, WATER_LEVEL } from '../config.js';
import { clamp, lerp, smoothstep } from '../util/math.js';
import { makeRadialGlow, makeMistAlpha } from '../util/textures.js';

// Sun colour through the day. Low sun = red and weak, because its light is
// travelling through far more atmosphere.
const SUN_DUSK = new THREE.Color(0xff7326);
const SUN_GOLD = new THREE.Color(0xffc07a);
const SUN_DAY = new THREE.Color(0xfff4e2);

// Horizon haze colour, which the fog matches so distance reads as distance.
const FOG_DUSK = new THREE.Color(0xd08c50);
const FOG_DAY = new THREE.Color(0xaebdcb);

// Skylight fill. Deliberately cool and deliberately strong: at golden hour the
// sun is warm and almost horizontal, so everything it misses is lit only by the
// blue dome overhead. Without this the shadow side crushes to solid black, and
// the warm/cool split is half of why golden hour looks the way it does.
const FILL_SKY = new THREE.Color(0x7593c4);
const FILL_GROUND = new THREE.Color(0x6b5334);

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.elevation = SKY.elevation;
    this.sun = new THREE.Vector3();
    this.sunColor = new THREE.Color();

    // ── sky dome ──
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    scene.add(this.sky);

    // ── the sun ──
    this.light = new THREE.DirectionalLight(0xffffff, 2);
    this.light.castShadow = true;
    const s = this.light.shadow;
    s.mapSize.set(Q.shadowMap, Q.shadowMap);
    // Tight frustum that follows the player. A world-sized shadow camera would
    // give a handful of texels per metre and turn everything to mud.
    s.camera.left = -Q.shadowExtent;
    s.camera.right = Q.shadowExtent;
    s.camera.top = Q.shadowExtent;
    s.camera.bottom = -Q.shadowExtent;
    s.camera.near = 10;
    s.camera.far = 1200;
    s.bias = -0.0006;
    s.normalBias = 0.06;
    scene.add(this.light);
    scene.add(this.light.target);

    // ── sky bounce ──
    this.hemi = new THREE.HemisphereLight(0xa8c4e0, 0x6a5636, 0.5);
    scene.add(this.hemi);

    // ── aerial perspective ──
    scene.fog = new THREE.FogExp2(0xc4834f, SKY.fogDensity);

    // ── glow disc around the sun (this is what the bloom pass latches onto) ──
    this.haze = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeRadialGlow(256),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false, // sits beyond the fog wall; let it through anyway
        opacity: SKY.sunHazeOpacity,
      })
    );
    this.haze.scale.setScalar(SKY.sunHazeSize);
    scene.add(this.haze);

    this.buildMist();
    this.apply();
  }

  /**
   * Low mist sheets. Flat translucent planes that the low-lying terrain pokes
   * through, which reads as fog pooling in the valleys and sitting on the lake.
   * Far cheaper than volumetrics and, at this sun angle, nearly as convincing.
   */
  buildMist() {
    const source = makeMistAlpha(256);
    this.mist = new THREE.Group();
    this.mistLayers = [];
    for (let i = 0; i < Q.mistPlanes; i++) {
      // Each layer needs its own texture object: repeat/offset live on the
      // texture, so sharing one would make every layer scroll identically.
      const tex = source.clone();
      tex.needsUpdate = true;
      tex.repeat.setScalar(2 + i * 0.6);

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        // Kept low because the layers stack: standing above all five, their
        // opacities multiply out into a haze that flattens the whole distance.
        opacity: 0.075 - i * 0.009,
        side: THREE.DoubleSide,
        fog: true,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1700, 1700), mat);
      mesh.rotation.x = -Math.PI / 2;
      const y = WATER_LEVEL + 1.5 + i * 4.5;
      mesh.position.y = y;
      mesh.renderOrder = 2;
      // Each layer scrolls at its own rate so they never drift as one slab.
      this.mistLayers.push({ mesh, mat, tex, y, base: mat.opacity, speed: 0.0026 + i * 0.0011 });
      this.mist.add(mesh);
    }
    this.scene.add(this.mist);
  }

  /** Recompute every atmospheric quantity from the current sun elevation. */
  apply() {
    const el = clamp(this.elevation, SKY.elevationMin, SKY.elevationMax);
    const phi = THREE.MathUtils.degToRad(90 - el);
    const theta = THREE.MathUtils.degToRad(SKY.azimuth);
    this.sun.setFromSphericalCoords(1, phi, theta);

    const u = this.sky.material.uniforms;
    u.turbidity.value = SKY.turbidity;
    u.rayleigh.value = SKY.rayleigh;
    u.mieCoefficient.value = SKY.mieCoefficient;
    u.mieDirectionalG.value = SKY.mieDirectionalG;
    u.sunPosition.value.copy(this.sun);

    // Colour: dusk red -> golden -> near-white daylight.
    if (el < 10) this.sunColor.copy(SUN_DUSK).lerp(SUN_GOLD, smoothstep(-2, 10, el));
    else this.sunColor.copy(SUN_GOLD).lerp(SUN_DAY, smoothstep(10, 34, el));
    this.light.color.copy(this.sunColor);
    // Large numbers because the exposure is low — see SKY.exposure in config.
    this.light.intensity = lerp(0.4, 7.5, smoothstep(-2, 22, el));

    const day = smoothstep(0, 30, el);
    this.scene.fog.color.copy(FOG_DUSK).lerp(FOG_DAY, day);

    // Fill is the horizon colour pulled a long way toward cool skylight, so
    // shadows read blue against the warm sun rather than going black.
    this.hemi.color.copy(this.scene.fog.color).lerp(FILL_SKY, 0.62);
    this.hemi.groundColor.copy(FILL_GROUND);
    this.hemi.intensity = lerp(1.8, 3.0, day);

    for (const layer of this.mistLayers) layer.mat.color.copy(this.scene.fog.color);
    this.haze.material.color.copy(this.sunColor);
    this.haze.material.opacity = SKY.sunHazeOpacity * lerp(1.4, 0.5, day);

    this.renderer.toneMappingExposure = SKY.exposure;
  }

  /** Nudge the time of day. Bound to [ and ]. */
  nudge(dir) {
    this.elevation = clamp(
      this.elevation + dir * SKY.elevationStep,
      SKY.elevationMin,
      SKY.elevationMax
    );
    this.apply();
  }

  /** Keep the sun's shadow box, the haze and the mist centred on the player. */
  update(target, time) {
    this.light.position.copy(target).addScaledVector(this.sun, 500);
    this.light.target.position.copy(target);
    this.light.target.updateMatrixWorld();

    this.haze.position.copy(target).addScaledVector(this.sun, 2000);

    // Snap the mist to a coarse grid so it follows without visibly sliding.
    this.mist.position.set(Math.round(target.x / 64) * 64, 0, Math.round(target.z / 64) * 64);
    for (const layer of this.mistLayers) {
      layer.tex.offset.set(time * layer.speed, time * layer.speed * 0.6);

      // A mist sheet above your eyeline is not mist, it is a grey ceiling. Hide
      // any layer you have climbed above the level of, and fade the one you are
      // standing in so you never walk face-first into a wall of alpha.
      const above = target.y - layer.y;
      layer.mesh.visible = above > 1.2;
      layer.mat.opacity = layer.base * smoothstep(1.2, 7, above);
    }
  }

  /** Where the sun is on the horizontal plane — used to compose the spawn view. */
  sunHorizontal(out) {
    return out.set(this.sun.x, 0, this.sun.z).normalize();
  }
}
