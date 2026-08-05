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
import { SKY, TIME, Q, LAKE, WATER_LEVEL } from '../config.js';
import { clamp, lerp, smoothstep } from '../util/math.js';
import { makeRadialGlow, makeMistAlpha, makeSoftCircle } from '../util/textures.js';
import { makeRandom } from './noise.js';

const DEG = Math.PI / 180;

/**
 * Where the sun is, for a time of day, from real solar geometry.
 *
 * Worth doing properly rather than sliding a light along a tilted circle: this
 * gives an arc that rises in the east and sets in the west, and it makes
 * latitude and date mean something. At 57 degrees north in July you get the
 * long, low, raking light this world is built around, and short nights; move
 * `TIME.latitude` toward the equator and the sun climbs steeply overhead
 * instead, which looks like a completely different place.
 *
 * @returns {{altitude:number, azimuth:number}} both in degrees, azimuth from north
 */
export function solarPosition(hours, latitude = TIME.latitude, dayOfYear = TIME.dayOfYear) {
  // Axial tilt projected onto the date.
  const decl = 23.44 * Math.sin(DEG * ((360 * (284 + dayOfYear)) / 365));
  // 15 degrees of rotation per hour, zero at solar noon.
  const H = (hours - 12) * 15;

  const latR = latitude * DEG;
  const decR = decl * DEG;
  const hR = H * DEG;

  const sinAlt = Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(hR);
  const altitude = Math.asin(clamp(sinAlt, -1, 1));

  const cosAz =
    (Math.sin(decR) - Math.sin(altitude) * Math.sin(latR)) /
    (Math.cos(altitude) * Math.cos(latR) || 1e-6);
  let azimuth = Math.acos(clamp(cosAz, -1, 1)) / DEG;
  // Before solar noon the sun is in the east; after, mirror it into the west.
  if (H > 0) azimuth = 360 - azimuth;

  return { altitude: altitude / DEG, azimuth };
}

// Sun colour through the day. Low sun = red and weak, because its light is
// travelling through far more atmosphere.
const SUN_DUSK = new THREE.Color(0xff7326);
const SUN_GOLD = new THREE.Color(0xffc07a);
const SUN_DAY = new THREE.Color(0xfff4e2);

// Horizon haze colour, which the fog matches so distance reads as distance.
const FOG_NIGHT = new THREE.Color(0x141b2a);
const FOG_DUSK = new THREE.Color(0xd08c50);
const FOG_DAY = new THREE.Color(0xaebdcb);
const FOG_OVERCAST = new THREE.Color(0x9aa3ac);

// Moonlight. Cool and weak, but never nothing — a moonlit night you cannot
// navigate is just a black screen, and this world is worth seeing at night.
const MOON_LIGHT = new THREE.Color(0x9fb6e0);

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

    // Preetham has no concept of night — even wound right down it renders a
    // grey dome. Rather than crush the exposure (which would take the moonlit
    // ground down with it), scale the dome's own output. This decouples "how
    // bright is the sky" from "how bright is the land", which is exactly the
    // control night needs.
    this.skyDim = { value: 1 };
    this.sky.material.onBeforeCompile = (shader) => {
      shader.uniforms.uSkyDim = this.skyDim;
      shader.fragmentShader =
        'uniform float uSkyDim;\n' +
        shader.fragmentShader.replace(
          'gl_FragColor = vec4( retColor, 1.0 );',
          'gl_FragColor = vec4( retColor * uSkyDim, 1.0 );'
        );
    };
    this.sky.material.customProgramCacheKey = () => 'sky-dimmable';
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

    // ── the moon ──
    // A second key light, opposite the sun. Astronomically that is a full moon,
    // which is both the prettiest case and the only one bright enough to walk
    // by — so it is the one we model.
    this.moon = new THREE.DirectionalLight(MOON_LIGHT, 0);
    this.moon.castShadow = true;
    const ms = this.moon.shadow;
    ms.mapSize.set(Q.shadowMap, Q.shadowMap);
    ms.camera.left = -Q.shadowExtent;
    ms.camera.right = Q.shadowExtent;
    ms.camera.top = Q.shadowExtent;
    ms.camera.bottom = -Q.shadowExtent;
    ms.camera.near = 10;
    ms.camera.far = 1200;
    ms.bias = -0.0008;
    ms.normalBias = 0.08;
    scene.add(this.moon);
    scene.add(this.moon.target);
    this.moonDir = new THREE.Vector3();

    this.moonDisc = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeRadialGlow(128),
        color: 0xdfe7f5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false,
        opacity: 0,
      })
    );
    this.moonDisc.scale.setScalar(260);
    scene.add(this.moonDisc);

    this.buildStars();
    this.buildMist();

    this.hours = TIME.startHour;
    this.running = TIME.running;
    /**
     * True once somebody else is keeping the hour — see `applyRemote`. While it
     * is set this clock does not advance itself: the server is already counting
     * and a second clock running against the first can only disagree. Same flag,
     * for the same reason, as `Vitals.remote`.
     */
    this.remote = false;
    /** Set from the weather system; 0 = clear sky, 1 = fully smothered. */
    this.cloudCover = 0;
    this.fogMul = 1;
    this.apply();
  }

  /** Take the current weather targets. Cheap; safe to call every frame. */
  setWeather(weather) {
    this.cloudCover = weather.cloud;
    this.fogMul = weather.fog;
  }

  /**
   * A seeded starfield on a large sphere. Points, one draw call, invisible by
   * day and faded in through twilight. Slightly varied sizes and colours so it
   * does not read as uniform noise.
   */
  buildStars() {
    const rand = makeRandom('stars');
    const count = 1400;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const R = 4000;
    for (let i = 0; i < count; i++) {
      // Even distribution over the sphere, then discard the lower half — we
      // only ever see the dome above the horizon.
      const u = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(theta) * r * R;
      pos[i * 3 + 1] = Math.abs(u) * R;
      pos[i * 3 + 2] = Math.sin(theta) * r * R;
      // Most stars are white; a few lean warm or blue.
      const t = rand();
      const warm = t > 0.86 ? 1 : 0;
      const cool = t < 0.16 ? 1 : 0;
      const b = lerp(0.45, 1, rand() ** 2);
      col[i * 3] = b * (1 - cool * 0.22);
      col[i * 3 + 1] = b * (1 - warm * 0.06 - cool * 0.06);
      col[i * 3 + 2] = b * (1 - warm * 0.24);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    this.stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        // Textured and small. An untextured point is a hard square, and at any
        // size big enough to see that reads as confetti rather than sky.
        map: makeSoftCircle(32),
        size: 5.5,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        // Never WRITE depth — a star must not occlude anything, including the
        // next star along.
        depthWrite: false,
        // But it must be depth TESTED, or it shines through mountains.
        //
        // This was `false`, which is a plausible-looking setting for a sky
        // dome and wrong here. A transparent material is drawn after every
        // opaque one regardless of renderOrder, so with the test off the stars
        // were painted over terrain and trees that were already in front of
        // them. The dome sits at 4000 m and the camera's far plane is 6000, so
        // it is comfortably inside the frustum and tests correctly.
        depthTest: true,
        fog: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
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

  /** Recompute every atmospheric quantity from the current time of day. */
  apply() {
    const solar = solarPosition(this.hours);
    this.elevation = solar.altitude;
    this.azimuth = solar.azimuth;

    // The sky shader breaks down below the horizon, so it is fed a clamped
    // elevation while the lighting below uses the true one. That keeps a
    // believable deep-twilight gradient overhead instead of a black void.
    const el = this.elevation;
    const skyEl = Math.max(el, -5.5);
    const phi = THREE.MathUtils.degToRad(90 - skyEl);
    const theta = THREE.MathUtils.degToRad(this.azimuth);
    this.sun.setFromSphericalCoords(1, phi, theta);
    // The moon rides opposite the sun.
    this.moonDir.copy(this.sun).multiplyScalar(-1);
    // True direction, unclamped, for the lighting maths below.
    const sunUp = Math.sin(el * DEG);

    // Preetham is a daylight model and has no idea what night is — held at its
    // daytime settings below the horizon it renders a muddy grey-brown. Winding
    // turbidity and rayleigh down as the sun sets drains that out and leaves a
    // deep blue the stars can sit against.
    const dayness = smoothstep(-7, 3, el);
    const u = this.sky.material.uniforms;
    // Cloud raises turbidity (more haze) and flattens rayleigh (less blue),
    // which is most of what "overcast" looks like from inside the model.
    u.turbidity.value = lerp(1.2, lerp(SKY.turbidity, 22, this.cloudCover), dayness);
    u.rayleigh.value = lerp(0.25, lerp(SKY.rayleigh, 0.5, this.cloudCover), dayness);
    u.mieCoefficient.value = lerp(0.0012, SKY.mieCoefficient, dayness);
    u.mieDirectionalG.value = SKY.mieDirectionalG;
    u.sunPosition.value.copy(this.sun);

    // ── how much of a day is this? ──
    // `daylight` fades out through civil twilight; `night` is its complement.
    const daylight = smoothstep(TIME.civilTwilight, 2.5, el);
    const night = 1 - daylight;
    this.daylight = daylight;

    // Colour: dusk red -> golden -> near-white daylight.
    if (el < 10) this.sunColor.copy(SUN_DUSK).lerp(SUN_GOLD, smoothstep(-2, 10, el));
    else this.sunColor.copy(SUN_GOLD).lerp(SUN_DAY, smoothstep(10, 34, el));
    this.light.color.copy(this.sunColor);
    // Large numbers because the exposure is low — see SKY.exposure in config.
    // Cloud smothers the direct sun hard: under heavy overcast almost all the
    // light arriving is skylight, which is why overcast days have no shadows.
    const cloud = this.cloudCover;
    this.light.intensity = lerp(0, 7.5, smoothstep(-1.5, 22, el)) * lerp(1, 0.12, cloud);
    this.light.visible = this.light.intensity > 0.01;

    // ── moon ──
    // Takes over the shadow-casting duty once the sun is down. Only one of the
    // two is ever enabled, so the cost is the same as a single key light.
    // Bright enough to actually see the land by. Moonlight is famously dim in
    // reality, but a night you cannot navigate is just a black screen, and the
    // exposure lift below is doing the rest of the work.
    const moonUp = this.moonDir.y > 0.02;
    const moonFade = smoothstep(0.02, 0.22, this.moonDir.y);
    this.moon.intensity = moonUp ? night * moonFade * 2.6 : 0;
    this.moon.visible = this.moon.intensity > 0.01;
    this.moonDisc.material.opacity = moonUp ? night * moonFade * 0.9 : 0;

    const day = smoothstep(0, 30, el);
    this.scene.fog.color.copy(FOG_DUSK).lerp(FOG_DAY, day).lerp(FOG_NIGHT, night);
    // Overcast greys the air out and pulls the horizon in.
    this.scene.fog.color.lerp(FOG_OVERCAST, cloud * 0.55 * daylight);
    this.scene.fog.density = SKY.fogDensity * this.fogMul;

    // Fill is the horizon colour pulled a long way toward cool skylight, so
    // shadows read blue against the warm sun rather than going black. At night
    // it becomes the only ambient there is, so it never falls to zero.
    this.hemi.color.copy(this.scene.fog.color).lerp(FILL_SKY, 0.62);
    this.hemi.groundColor.copy(FILL_GROUND);
    // Overcast LIFTS the ambient even as it kills the sun — an overcast day is
    // flat and shadowless, not dark.
    this.hemi.intensity = lerp(0.95, lerp(1.8, 3.0, day), daylight) * lerp(1, 1.5, cloud);
    // And the dome itself goes flat grey.
    this.skyGrey = cloud;

    for (const layer of this.mistLayers) layer.mat.color.copy(this.scene.fog.color);
    this.haze.material.color.copy(this.sunColor);
    this.haze.material.opacity = SKY.sunHazeOpacity * lerp(1.4, 0.5, day) * daylight;

    // Dim the dome itself through twilight into night. The range is wide on
    // purpose: twilight is the best-looking hour of the day and a narrow ramp
    // skips straight from evening to black.
    this.skyDim.value = lerp(0.05, 1, smoothstep(-13, 0.5, el));

    // Stars come out gradually through that same long twilight.
    this.stars.material.opacity = smoothstep(-3, -12, el);

    // Open the exposure at night. The sky is nearly black by then, so there is
    // nothing left to blow out, and it is the difference between a moonlit
    // valley and an unusable black screen.
    this.renderer.toneMappingExposure = lerp(SKY.exposure * 2.15, SKY.exposure, daylight);
  }

  /** Scrub time. Bound to [ and ]. */
  nudge(dir) {
    this.setHours(this.hours + dir * TIME.scrubStep);
  }

  setHours(h) {
    this.hours = ((h % 24) + 24) % 24;
    this.apply();
  }

  toggleClock() {
    this.running = !this.running;
    return this.running;
  }

  /**
   * Take the server's word for what hour it is.
   *
   * THE CLIENT DREW ITS OWN DAYLIGHT. The snapshot has carried the hour (`c`)
   * for as long as there have been snapshots and nothing in the browser ever
   * read one, so a client kept ticking the clock it started with: broad
   * daylight, photographed, on a server whose own clock said 01:00 — the sky,
   * the sun, the stars, the exposure and every wildlife rule keyed off the sun
   * all belonging to a different time of day than the world everybody else was
   * standing in. The goblins that only come out at night arrived at noon.
   *
   * Same shape as `Vitals.applyRemote` and the position fix before it: the
   * server is the authority and the client's job is to agree, not to keep a
   * second opinion. `apply()` runs from here, so the sun, the fog, the stars
   * and the exposure all follow the number without anything else being told.
   *
   * Correcting at snapshot rate is not a jolt: a day is `TIME.dayMinutes` of
   * real time, so a tenth of a second of drift is a few in-world seconds and
   * about a thousandth of a degree of sun. It is a nudge, not a jump — except
   * on the very first packet, which is where the whole error lives anyway.
   */
  applyRemote(hours) {
    if (!Number.isFinite(hours)) return;
    this.remote = true;
    this.setHours(hours);
  }

  /**
   * Nobody is keeping the hour for us any more — go back to running our own.
   *
   * Called when the socket drops. Without it a disconnected world would stop at
   * whatever hour the last packet carried and the sun would never move again.
   */
  takeOverLocally() {
    this.remote = false;
  }

  /** Advance the clock. `dt` is real seconds. */
  tick(dt) {
    // Somebody else owns the hour while we are connected — see `applyRemote`.
    if (this.remote) return;
    if (!this.running) return;
    // 24 in-world hours per TIME.dayMinutes of real time.
    this.setHours(this.hours + (dt / 60 / TIME.dayMinutes) * 24);
  }

  /** "06:42" for the HUD. */
  get clockText() {
    const h = Math.floor(this.hours);
    const m = Math.floor((this.hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Keep the sun's shadow box, the haze and the mist centred on the player. */
  update(target, time) {
    this.light.position.copy(target).addScaledVector(this.sun, 500);
    this.light.target.position.copy(target);
    this.light.target.updateMatrixWorld();

    this.moon.position.copy(target).addScaledVector(this.moonDir, 500);
    this.moon.target.position.copy(target);
    this.moon.target.updateMatrixWorld();
    this.moonDisc.position.copy(target).addScaledVector(this.moonDir, 2600);

    // The star dome rides with you; it is notionally at infinity.
    this.stars.position.copy(target);

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
