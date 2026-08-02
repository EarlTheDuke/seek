// ── avatars.js ──────────────────────────────────────────────────────────────
// What another person looks like.
//
// The first time this world has had to draw a human being. Everything else in
// it — deer, bear, goblin, troll — was built to be looked at from a distance
// through a fading light, and got away with a silhouette. A person standing
// next to you is a harder problem, and the honest answer at this budget is not
// to pretend otherwise: a plain, sturdy, well-proportioned figure in the same
// procedural idiom as everything else, with a name over it.
//
// The name is the important part. In a world where you cannot see faces, the
// label floating above someone is what makes them a person rather than a shape,
// and it is what lets you say "meet me at the Black Moss" and know who agreed.
//
// RENDERING ONLY READS. These are driven entirely from interpolated snapshots.
// Nothing here can touch the simulation, and on a client there is no simulation
// of other players to touch.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYER } from '../config.js';
import { damp, lerp, clamp } from '../util/math.js';

const CLOAK = new THREE.Color(0x4a4335);
const CLOAK_DARK = new THREE.Color(0x2f2b23);
const SKIN = new THREE.Color(0x9a7b5e);
const LEATHER = new THREE.Color(0x5d4a33);

const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.88,
  metalness: 0,
});

let shared = null;

function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
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
}

function figureGeometry() {
  if (shared) return shared;

  const torso = new THREE.CylinderGeometry(0.19, 0.23, 0.62, 8);
  const chest = new THREE.IcosahedronGeometry(0.22, 1);
  chest.scale(1.15, 0.8, 0.75);
  chest.translate(0, 0.24, 0);
  // A cloak: one cone, and it does more for the silhouette than the body does.
  const cloak = new THREE.ConeGeometry(0.34, 0.78, 9, 1, true);
  cloak.translate(0, -0.02, -0.04);
  const body = mergeGeometries([
    paint(torso, LEATHER),
    paint(chest, LEATHER),
    paint(cloak, CLOAK),
  ]);
  body.computeVertexNormals();

  const neck = mergeGeometries([paint(new THREE.CylinderGeometry(0.07, 0.09, 0.1, 6), SKIN)]);

  const skull = new THREE.IcosahedronGeometry(0.125, 1);
  skull.scale(0.9, 1, 0.95);
  const hood = new THREE.IcosahedronGeometry(0.15, 1);
  hood.scale(1, 0.95, 1.05);
  hood.translate(0, 0.02, -0.03);
  const head = mergeGeometries([paint(skull, SKIN), paint(hood, CLOAK_DARK)]);
  head.computeVertexNormals();

  const legGeo = new THREE.CylinderGeometry(0.085, 0.07, 0.82, 6);
  legGeo.translate(0, -0.41, 0);
  const boot = new THREE.BoxGeometry(0.14, 0.1, 0.24);
  boot.translate(0, -0.85, 0.04);
  const leg = mergeGeometries([paint(legGeo, CLOAK_DARK), paint(boot, LEATHER)]);

  const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.6, 6);
  armGeo.translate(0, -0.3, 0);
  const hand = new THREE.IcosahedronGeometry(0.06, 0);
  hand.translate(0, -0.62, 0);
  const arm = mergeGeometries([paint(armGeo, LEATHER), paint(hand, SKIN)]);

  shared = { body, neck, head, leg, arm };
  return shared;
}

/** A name that hangs in the air above someone, drawn on a canvas texture. */
function nameplate(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.font = '500 30px ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Drawn twice: a dark blur behind, then the text. Without it a pale name
  // vanishes against a bright sky, and this world is mostly bright sky.
  g.shadowColor = 'rgba(0,0,0,0.85)';
  g.shadowBlur = 10;
  g.fillStyle = 'rgba(0,0,0,0.9)';
  g.fillText(text, 128, 34);
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(240,236,226,0.95)';
  g.fillText(text, 128, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
  );
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** One other person. Built once per player, then driven from snapshots. */
class Avatar {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    const P = figureGeometry();
    const g = new THREE.Group();

    const body = new THREE.Mesh(P.body, material);
    body.position.y = 1.05;
    body.castShadow = true;
    g.add(body);

    const neckPivot = new THREE.Object3D();
    neckPivot.position.set(0, 1.4, 0);
    neckPivot.add(new THREE.Mesh(P.neck, material));
    const headPivot = new THREE.Object3D();
    headPivot.position.y = 0.14;
    const head = new THREE.Mesh(P.head, material);
    head.castShadow = true;
    headPivot.add(head);
    neckPivot.add(headPivot);
    g.add(neckPivot);

    const legs = [];
    for (const ix of [0.1, -0.1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(ix, 0.86, 0);
      const m = new THREE.Mesh(P.leg, material);
      m.castShadow = true;
      pivot.add(m);
      g.add(pivot);
      legs.push(pivot);
    }

    const arms = [];
    for (const ix of [0.27, -0.27]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(ix, 1.36, 0);
      const m = new THREE.Mesh(P.arm, material);
      m.castShadow = true;
      pivot.add(m);
      g.add(pivot);
      arms.push(pivot);
    }

    const plate = nameplate(name);
    plate.position.y = 2.05;
    g.add(plate);

    this.object = g;
    this.parts = { body, neckPivot, headPivot, legs, arms, plate };
    this.phase = 0;
    this.crouch = 0;
    this.draw = 0;
  }

  /**
   * Drive from one interpolated snapshot entry.
   *
   * The gait is derived from the reported SPEED rather than from distance moved
   * between frames. Distance-based would stutter every time a packet is late,
   * which is exactly when you least want the legs to notice.
   */
  apply(p, dt) {
    this.object.position.set(p.p[0], p.p[1], p.p[2]);
    // Snapshot yaw is the player's look direction, whose forward is -Z; these
    // bodies are built facing +Z like the creatures, so they need turning
    // round. Getting this wrong is how you end up with everyone moonwalking.
    this.object.rotation.y = p.y + Math.PI;

    const speed = p.s ?? 0;
    this.crouch = damp(this.crouch, p.c ? 1 : 0, 10, dt);
    this.draw = damp(this.draw, p.d ? 1 : 0, 8, dt);

    // Crouched, the whole figure settles rather than the legs bending — at this
    // budget a believable crouch costs more than it returns.
    this.object.scale.y = lerp(1, 0.72, this.crouch);

    const swing = clamp(speed / PLAYER.sprintSpeed, 0, 1.2);
    this.phase += speed * 1.35 * dt;
    for (let i = 0; i < 2; i++) {
      const off = i === 0 ? 0 : Math.PI;
      this.parts.legs[i].rotation.x = Math.sin(this.phase + off) * 0.72 * swing;
      // Arms counter-swing, unless the bow is up, in which case they come
      // forward together and hold still.
      const walk = Math.sin(this.phase + off + Math.PI) * 0.5 * swing;
      this.parts.arms[i].rotation.x = lerp(walk, -1.35, this.draw);
    }
    this.parts.body.rotation.x = lerp(0, 0.18, this.draw) + Math.sin(this.phase * 2) * 0.03 * swing;
    // Head follows their pitch, so you can tell what someone is looking at.
    this.parts.headPivot.rotation.x = clamp(-(p.t ?? 0), -0.9, 0.9);

    // Down and out of the way when dead. Not a death animation — a state.
    const dead = p.x ? 1 : 0;
    this.object.rotation.z = damp(this.object.rotation.z, dead * Math.PI * 0.5, 4, dt);
    this.parts.plate.visible = !dead;
  }

  dispose() {
    this.parts.plate.material.map?.dispose();
    this.parts.plate.material.dispose();
  }
}

/** Everyone else, kept in sync with whatever the snapshots say exists. */
export class Avatars {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.byId = new Map();
  }

  update(dt, snapshot, names) {
    if (!snapshot) return;
    const seen = new Set();

    for (const p of snapshot.pl) {
      seen.add(p.id);
      let a = this.byId.get(p.id);
      if (!a) {
        a = new Avatar(p.id, p.n ?? names?.get(p.id)?.name ?? 'wanderer');
        this.byId.set(p.id, a);
        this.root.add(a.object);
      }
      a.apply(p, dt);
    }

    // Anyone the server has stopped mentioning has gone.
    for (const [id, a] of this.byId) {
      if (seen.has(id)) continue;
      this.root.remove(a.object);
      a.dispose();
      this.byId.delete(id);
    }
  }

  clear() {
    for (const [, a] of this.byId) {
      this.root.remove(a.object);
      a.dispose();
    }
    this.byId.clear();
  }

  get count() {
    return this.byId.size;
  }
}
