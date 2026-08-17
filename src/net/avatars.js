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

// One pixel wide at any range, which is what a bowstring is.
const stringMaterial = new THREE.LineBasicMaterial({ color: 0xd8d0bb });

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

const BOWWOOD = new THREE.Color(0x6b4a2c);
let bowShared = null;

/**
 * A bow small enough to hang off a shoulder, in the same idiom as the figure.
 *
 * NOT `buildBow()` from the item registry, and the difference is the point.
 * That one is the object in YOUR hands, seen from thirty centimetres, and it
 * carries a real recurve profile, a laminate cross-section and a `Line` string
 * whose middle vertex moves as you draw. This one is seen at ten to a hundred
 * metres by somebody trying to work out whether the figure on the ridge is
 * about to shoot them, and at that distance the only things that survive are
 * the SILHOUETTE and whether the string is back.
 *
 * So: one merged arc, one straight string, two draw calls' worth of nothing.
 * The whole value is that the shape reads as a bow at a glance and reads as
 * DRAWN at a glance, and both of those are answered by the outline alone.
 */
// ── WHICH WAY ROUND A BOW GOES ──────────────────────────────────────────────
//
// Ben, watching a run on 2026-08-14: "the bow is backward when they pull it
// back to fire it." He was right, and it had been backward since the day it
// was added.
//
// The body is built facing +Z — see the arm code below, and the `rotation.y =
// p.y + Math.PI` that places these — so +Z is where the target is and -Z is the
// archer's own face. The old profile put the GRIP at z = -0.055 and the TIPS at
// z = +0.03: the bow bulged into the archer's chest while its tips reached out
// toward the target. That is a bow held back to front.
//
// A strung bow is the other way round, and the string is what forces it. The
// string is straight, it runs tip to tip, and it is drawn toward the archer's
// own face — so the string plane must lie BETWEEN the archer and the grip, and
// therefore the grip must be the part of the bow FURTHEST from the archer.
// Every number below follows from that one sentence:
//
//   grip   z = +0.08  the part the bow hand pushes against, furthest forward
//   limbs  z = -0.03  sweeping back toward the archer to meet the string
//   tips   z = +0.01  flicking forward again — that is what makes it a recurve
//   string z = +0.01  straight between the tips, so 7cm inside the grip. That
//                     gap is the brace height, and it is the thing that reads
//                     as "strung bow" at a hundred metres.
//
// Kept as plain numbers out here rather than buried in a geometry call so that
// `bowcheck` can assert the three facts that actually matter — grip forward of
// tips, string inside grip, nock travelling toward the archer — without having
// to stand up a browser. Any one of those three would have caught this on the
// day it was written.
export const BOW_MODEL = {
  /** Half-height: the y of both tips. */
  tipY: 0.46,
  /** [y, z] from the lower tip up. +Z is toward the target. */
  profile: [
    [-0.46, 0.01],
    [-0.34, -0.03],
    [-0.16, 0.045],
    [0, 0.08],
    [0.16, 0.045],
    [0.34, -0.03],
    [0.46, 0.01],
  ],
  /** Where the string sits at brace: level with the tips, by definition. */
  stringZ: 0.01,
  /** How far the nock travels toward the archer at full draw. */
  drawZ: 0.3,
  /**
   * ...and how far it comes ACROSS while it does.
   *
   * The bow is held in the left hand at x = +0.3 and the face is at x = 0, so a
   * nock that only moved in Z would be drawn to a point thirty centimetres to
   * the side of the archer's head. This brings it back toward the centreline as
   * it comes, which is the same motion the string arm is making.
   */
  drawX: 0.16,

  // ── AND THE POSE, WHICH IS THE OTHER HALF OF THE COMPLAINT ────────────────
  //
  // Ben, same sitting: "both arms are directly out straight but really only one
  // should be out and the other one back like it is pulling the bow back."
  //
  // Also correct, and the old numbers said so plainly once you worked out what
  // they meant. An arm hangs down at (0, -1, 0), and rotating it about X by an
  // angle t sends it to (0, -cos t, -sin t). The old pair was -1.62 and -0.95:
  //
  //   -1.62  ->  (0, +0.05, +1.00)   straight out toward the target
  //   -0.95  ->  (0, -0.58, +0.81)   ALSO out toward the target, and drooping
  //
  // Two arms forward is a man pushing a door. The string arm has to go the
  // other way, so it is now the exact mirror:
  //
  //   +1.62  ->  (0, +0.05, -1.00)   straight back, past the ribs
  //
  // The same angle on purpose. This figure has no elbow joint, so the only
  // thing a distant silhouette can say about an arm is which way it POINTS, and
  // one forward against one back IS the pose. The couple of degrees of lift
  // both get out of the +/-1.62 (cos 1.62 is -0.05) is what keeps it from
  // reading as a shrug.
  pose: {
    /** rotation.x at full draw: [bow arm, string arm]. */
    armAim: [-1.62, 1.62],
    /**
     * rotation.z at full draw: a tuck inward on the string arm so it passes
     * the ribs rather than sticking out square. Smaller than the 0.42 it
     * replaces, which was bringing the hand across a chest it is now behind.
     */
    armTuck: [0, 0.22],
    /** Where the bow itself sits, slung and drawn: position, then rotation. */
    slung: { pos: [-0.12, 1.28, -0.24], rot: [0.15, 0.35, 0.95] },
    drawn: { pos: [0.3, 1.42, 0.34], rot: [0, 0, 0] },
  },
};

function bowGeometry() {
  if (bowShared) return bowShared;

  // The arc, swept as a tube along the recurve in `BOW_MODEL.profile` — a plain
  // semicircle reads as a croquet hoop rather than a weapon.
  const curve = new THREE.CatmullRomCurve3(
    BOW_MODEL.profile.map(([y, z]) => new THREE.Vector3(0, y, z))
  );
  const limb = new THREE.TubeGeometry(curve, 14, 0.014, 5, false);
  bowShared = { limb: paint(limb, BOWWOOD) };
  return bowShared;
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

    // ── THE BOW, IN TWO PLACES ──
    //
    // Every figure in this world has carried a bow since the first day and not
    // one of them has ever shown it. You could not tell an archer from a
    // walker, which in a game whose entire threat model is "somebody on a ridge
    // with a bow" is the one thing the silhouette most needed to say.
    //
    // Two poses, blended by the same damped `draw` the arms already use:
    //
    //   SLUNG — across the back, diagonal, riding the left shoulder. This is
    //   the one you see 95% of the time and it exists to say "armed".
    //
    //   DRAWN — round into the left hand, upright, held out, with the string
    //   pulled back. This is the one that has to say "at YOU", now, from a
    //   distance where nothing else about the figure is legible.
    //
    // The string is a `Line` whose middle vertex moves, exactly as the
    // first-person bow's does. It is the single detail that makes this read as
    // archery rather than as a man holding a hoop, and it costs three numbers.
    const B = bowGeometry();
    const bowPivot = new THREE.Object3D();
    const bowMesh = new THREE.Mesh(B.limb, material);
    bowMesh.castShadow = true;
    bowPivot.add(bowMesh);

    // Straight between the tips, so its z IS the tips' z. Only the middle
    // vertex ever moves, and only when somebody draws.
    const stringGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, BOW_MODEL.tipY, BOW_MODEL.stringZ),
      new THREE.Vector3(0, 0, BOW_MODEL.stringZ),
      new THREE.Vector3(0, -BOW_MODEL.tipY, BOW_MODEL.stringZ),
    ]);
    const bowString = new THREE.Line(stringGeo, stringMaterial);
    bowPivot.add(bowString);
    g.add(bowPivot);

    const plate = nameplate(name);
    plate.position.y = 2.05;
    g.add(plate);

    this.object = g;
    this.parts = { body, neckPivot, headPivot, legs, arms, plate, bowPivot, bowString };
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
    const squash = lerp(1, 0.72, this.crouch);
    this.object.scale.y = squash;
    // ── ...BUT NOT THE HEAD, AND NOT THE NAME ──
    //
    // A root Y-scale is a cheap and perfectly good crouch for a TORSO and LEGS:
    // shorter legs and a settled body is roughly what crouching looks like, and
    // it costs one multiply. It is not a good anything for the two parts of this
    // figure that are not made of limbs. A head squashed to 72% is a head that
    // has been stood on, and the nameplate is a TEXT SPRITE — squashing that
    // squeezes the lettering itself, so the one thing on screen whose whole job
    // is to be read gets 28% harder to read exactly when somebody is sneaking up
    // on you and you most want to know who it is.
    //
    // So both are counter-scaled by the same factor. They still TRAVEL DOWN with
    // the figure, because they hang off parts that moved and that is the half of
    // the effect worth keeping; they just stop deforming. Two multiplies, and it
    // leaves the deliberate cheapness of the crouch itself alone.
    const unsquash = 1 / squash;
    this.parts.headPivot.scale.y = unsquash;
    // The sprite's own scale is (1.6, 0.4) — see `nameplate`. Only the Y is
    // corrected, or the name gets wider as it gets lower.
    this.parts.plate.scale.y = 0.4 * unsquash;

    const swing = clamp(speed / PLAYER.sprintSpeed, 0, 1.2);
    this.phase += speed * 1.35 * dt;
    for (let i = 0; i < 2; i++) {
      const off = i === 0 ? 0 : Math.PI;
      this.parts.legs[i].rotation.x = Math.sin(this.phase + off) * 0.72 * swing;
      // Arms counter-swing, unless the bow is up, in which case they come
      // forward together and hold still.
      const walk = Math.sin(this.phase + off + Math.PI) * 0.5 * swing;
      // ── ONE ARM OUT, ONE ARM BACK ──
      //
      // `arms[0]` is at x = +0.27 on a body built facing +Z, which is its LEFT
      // — the bow arm for a right-handed archer, and the side the bow swings
      // round to below. `arms[1]` at -0.27 is the right, and it is the one that
      // draws. The numbers, and why they are those numbers, are in `BOW_MODEL.pose`.
      this.parts.arms[i].rotation.x = lerp(walk, BOW_MODEL.pose.armAim[i], this.draw);
      this.parts.arms[i].rotation.z = lerp(0, BOW_MODEL.pose.armTuck[i], this.draw);
    }

    // ── AND THE BOW GOES ROUND WITH THEM ──
    //
    // Slung across the back at rest; round into the left hand and upright when
    // drawn. Lerped rather than switched, because the half-second of it coming
    // off the shoulder is the tell that somebody has decided to shoot — and at
    // range that half-second is the only warning you get.
    // Slung: tipped over the shoulder and lying flat against the back.
    // Drawn: upright and square to the way the body faces.
    const bp = this.parts.bowPivot;
    const A = BOW_MODEL.pose.slung, Z = BOW_MODEL.pose.drawn;
    bp.position.set(
      lerp(A.pos[0], Z.pos[0], this.draw),
      lerp(A.pos[1], Z.pos[1], this.draw),
      lerp(A.pos[2], Z.pos[2], this.draw)
    );
    bp.rotation.set(
      lerp(A.rot[0], Z.rot[0], this.draw),
      lerp(A.rot[1], Z.rot[1], this.draw),
      lerp(A.rot[2], Z.rot[2], this.draw)
    );

    // The nocking point comes back as the string is pulled. Three numbers, and
    // the whole reason this reads as archery rather than as a man with a hoop.
    const pos = this.parts.bowString.geometry.attributes.position;
    pos.setZ(1, BOW_MODEL.stringZ - this.draw * BOW_MODEL.drawZ);
    pos.setX(1, -this.draw * BOW_MODEL.drawX);
    pos.needsUpdate = true;
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
