// ── ambientLife.js ──────────────────────────────────────────────────────────
// Birds, butterflies and airborne dust. None of it does anything; all of it
// matters. A world where nothing moves except the grass reads as a photograph,
// and the motes in particular carry an absurd amount of weight for their cost —
// visible air is most of what people mean by "atmosphere".

import * as THREE from 'three';
import { LIFE, WIND, WATER_LEVEL } from '../config.js';
import { heightAt, makeRandom } from '../world/noise.js';
import { makeSoftCircle } from '../util/textures.js';
import { lerp } from '../util/math.js';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _size = new THREE.Vector2();

/** A shallow V — read as a bird from any distance, costs two triangles. */
function wingGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1.6, 0.12, -0.5, 1.5, 0.1, 0.55], 3)
  );
  g.computeVertexNormals();
  return g;
}

class Birds {
  constructor(scene, anchor) {
    const rand = makeRandom('birds');
    // Unlit and dark: birds this far up are silhouettes, and pretending
    // otherwise costs shading work for no visible gain.
    const mat = new THREE.MeshBasicMaterial({
      color: 0x1b1814,
      side: THREE.DoubleSide,
      fog: true,
    });
    const geo = wingGeometry();
    this.group = new THREE.Group();
    this.birds = [];
    this.anchor = anchor.clone();

    for (let i = 0; i < LIFE.birds; i++) {
      const body = new THREE.Group();
      const l = new THREE.Mesh(geo, mat);
      const r = new THREE.Mesh(geo, mat);
      r.scale.x = -1;
      body.add(l, r);
      const scale = lerp(0.8, 1.5, rand());
      body.scale.setScalar(scale);
      this.group.add(body);
      this.birds.push({
        body,
        left: l,
        right: r,
        radius: lerp(0.45, 1, rand()) * LIFE.birdRadius,
        speed: lerp(0.05, 0.1, rand()) * (rand() < 0.5 ? -1 : 1),
        phase: rand() * Math.PI * 2,
        flapPhase: rand() * Math.PI * 2,
        flapRate: lerp(5.5, 8.5, rand()),
        height: LIFE.birdHeight + lerp(-40, 45, rand()),
        bobRate: lerp(0.2, 0.45, rand()),
      });
    }
    scene.add(this.group);
  }

  update(time) {
    for (const b of this.birds) {
      const a = b.phase + time * b.speed;
      const x = this.anchor.x + Math.cos(a) * b.radius;
      const z = this.anchor.z + Math.sin(a) * b.radius;
      const y = b.height + Math.sin(time * b.bobRate + b.phase) * 12;
      b.body.position.set(x, y, z);
      // Face along the tangent of the circle.
      b.body.rotation.y = -a + (b.speed > 0 ? -Math.PI / 2 : Math.PI / 2);

      // Flap, with an occasional glide — a constant flap looks mechanical.
      const glide = Math.sin(time * 0.31 + b.phase) > 0.72;
      const flap = glide ? 0.12 : Math.sin(time * b.flapRate + b.flapPhase) * 0.75;
      b.left.rotation.z = flap;
      b.right.rotation.z = -flap;
      b.body.rotation.z = flap * 0.1;
    }
  }
}

class Butterflies {
  constructor(scene) {
    const rand = makeRandom('butterflies');
    const geo = new THREE.PlaneGeometry(0.14, 0.1);
    // A soft-edged sprite, not a bare quad: at this size an untextured plane
    // reads as a little white rectangle floating in the air, which is worse
    // than having no butterflies at all.
    const mat = new THREE.MeshBasicMaterial({
      map: makeSoftCircle(32),
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
      fog: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, LIFE.butterflies);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(LIFE.butterflies * 3),
      3
    );
    this.mesh.frustumCulled = false;
    const palette = [
      [0.95, 0.85, 0.35],
      [0.92, 0.92, 0.9],
      [0.55, 0.7, 0.95],
      [0.9, 0.55, 0.3],
    ];
    this.items = [];
    for (let i = 0; i < LIFE.butterflies; i++) {
      const c = palette[Math.floor(rand() * palette.length)];
      this.mesh.instanceColor.setXYZ(i, c[0], c[1], c[2]);
      this.items.push({
        offset: new THREE.Vector3(
          (rand() - 0.5) * 2 * LIFE.butterflyRadius,
          0,
          (rand() - 0.5) * 2 * LIFE.butterflyRadius
        ),
        phase: rand() * 100,
        speed: lerp(0.25, 0.6, rand()),
        flapRate: lerp(14, 22, rand()),
        height: lerp(0.4, 2.2, rand()),
      });
    }
    this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  update(time, playerPos) {
    // Butterflies belong near the grass. Once you are up in the air they are
    // just white specks hanging in the sky, so switch them off.
    const overGround = playerPos.y - Math.max(heightAt(playerPos.x, playerPos.z), WATER_LEVEL);
    this.mesh.visible = overGround < 14;
    if (!this.mesh.visible) return;

    const R = LIFE.butterflyRadius;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      // Wander on lissajous curves — cheap, smooth, and never repeats visibly.
      const t = time * it.speed + it.phase;
      let x = playerPos.x + it.offset.x + Math.sin(t * 0.9) * 4 + Math.sin(t * 0.37) * 7;
      let z = playerPos.z + it.offset.z + Math.cos(t * 0.75) * 4 + Math.cos(t * 0.29) * 7;

      // Keep the swarm loosely around the player without teleporting anyone.
      const dx = x - playerPos.x;
      const dz = z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d > R * 1.6) {
        it.offset.x -= (dx / d) * (d - R * 1.6);
        it.offset.z -= (dz / d) * (d - R * 1.6);
        x = playerPos.x + it.offset.x;
        z = playerPos.z + it.offset.z;
      }

      const ground = Math.max(heightAt(x, z), WATER_LEVEL);
      const y = ground + it.height + Math.sin(t * 2.1) * 0.35;

      // Flap by squashing the quad horizontally — reads correctly at this size.
      const flap = Math.abs(Math.sin(time * it.flapRate + it.phase));
      _s.set(0.25 + flap * 0.75, 1, 1);
      _q.setFromAxisAngle(_up, Math.atan2(Math.cos(t * 0.75), -Math.sin(t * 0.9)));
      _m.compose(_v.set(x, y, z), _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

class Motes {
  constructor(scene, renderer) {
    this.renderer = renderer;
    const rand = makeRandom('motes');
    this.count = LIFE.motes;
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    const alpha = new Float32Array(this.count);

    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] = (rand() - 0.5) * LIFE.moteBox;
      this.pos[i * 3 + 1] = rand() * LIFE.moteHeight;
      this.pos[i * 3 + 2] = (rand() - 0.5) * LIFE.moteBox;
      this.vel[i * 3] = WIND.dirX * lerp(0.25, 0.8, rand());
      this.vel[i * 3 + 1] = lerp(-0.05, 0.22, rand());
      this.vel[i * 3 + 2] = WIND.dirZ * lerp(0.25, 0.8, rand());
      alpha[i] = lerp(0.25, 1, rand());
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));

    // Additive, so motes only ever add light — dust in a sunbeam never darkens
    // what is behind it.
    //
    // A plain PointsMaterial will not do. Its size attenuation is `size *
    // scale / distance`, which has no upper bound, so the instant a mote drifts
    // within a metre of the lens it draws as a huge white blob across the
    // screen. This shader clamps the sprite size and fades anything closer than
    // a couple of metres, which is also physically sensible — you cannot focus
    // on a speck of dust touching your eye.
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: makeSoftCircle(64) },
        uColor: { value: new THREE.Color(0xffe6bd) },
        uSize: { value: LIFE.moteSize },
        uViewHeight: { value: 720 },
        uIntensity: { value: 0.55 },
      },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        uniform float uSize;
        uniform float uViewHeight;
        varying float vFade;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = -mv.z;
          float px = uSize * uViewHeight * projectionMatrix[1][1] * 0.5 / max(dist, 0.001);
          gl_PointSize = clamp(px, 1.0, 12.0);
          // Fade in past the near lens, out again toward the far haze.
          vFade = aAlpha * smoothstep(0.7, 3.5, dist) * (1.0 - smoothstep(45.0, 75.0, dist));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uIntensity;
        varying float vFade;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a;
          if (a * vFade < 0.002) discard;
          gl_FragColor = vec4(uColor * a * vFade * uIntensity, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
  }

  update(dt, playerPos) {
    const half = LIFE.moteBox / 2;
    const p = this.pos;
    // The cloud is stored in player-relative space and rendered by moving the
    // whole object, so drifting particles never need re-centring in world space.
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      p[k] += this.vel[k] * dt;
      p[k + 1] += this.vel[k + 1] * dt;
      p[k + 2] += this.vel[k + 2] * dt;

      // Wrap inside the box.
      if (p[k] > half) p[k] -= LIFE.moteBox;
      else if (p[k] < -half) p[k] += LIFE.moteBox;
      if (p[k + 2] > half) p[k + 2] -= LIFE.moteBox;
      else if (p[k + 2] < -half) p[k + 2] += LIFE.moteBox;
      if (p[k + 1] > LIFE.moteHeight) p[k + 1] = 0;
      else if (p[k + 1] < 0) p[k + 1] = LIFE.moteHeight;
    }
    this.geo.attributes.position.needsUpdate = true;

    // Anchor the box a little below eye level so motes fill the view.
    this.points.position.set(playerPos.x, playerPos.y - LIFE.moteHeight * 0.35, playerPos.z);

    // Sprite size is in pixels, so the shader needs the current buffer height.
    this.mat.uniforms.uViewHeight.value = this.renderer.getDrawingBufferSize(_size).y;
  }
}

export class AmbientLife {
  constructor(scene, birdAnchor, renderer) {
    this.birds = new Birds(scene, birdAnchor);
    this.butterflies = new Butterflies(scene);
    this.motes = new Motes(scene, renderer);
  }

  update(dt, time, playerPos) {
    this.birds.update(time);
    this.butterflies.update(time, playerPos);
    this.motes.update(dt, playerPos);
  }
}
