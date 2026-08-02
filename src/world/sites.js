// ── sites.js ────────────────────────────────────────────────────────────────
// Barrows and stone circles: the two things in the world that were BUILT.
//
// Everything else out there is weather and geology and animals. These are the
// only evidence that anyone was ever here before you, which is most of what
// makes a landscape feel inhabited rather than merely generated — and it is
// why they get names, and why the names matter.
//
// Both follow the design rule the phase runs on: A PLACE MUST CHANGE A
// DECISION. Neither of these is scenery with a label.
//
//   STONE CIRCLE — a survey point. Standing inside one, you get your bearings:
//   the names, distances and directions of the country around you. That is the
//   non-magical answer to "give the circles a function", and it is the one that
//   makes the naming layer usable in play instead of only in the console. It
//   also breaks the wind, because a ring of standing stones does.
//
//   BARROW — a burial mound you can open, with consequences. It is the only
//   place in the world holding things nobody has to hunt for, and opening one
//   is loud, permanent, and wakes what was put in there to stay.
//
// Placement is hash-driven off the same coarse grid the wildlife uses, so a
// barrow is in the same place forever, on any machine, and two players on a
// seed can meet at one.
//
// NO MAGIC — the user's standing rule, and it holds here. A circle helps you
// because you can see a long way from it and the stones are a fixed reference.
// A barrow is dangerous because something large has been living in the dry
// stone chamber and does not want you in it.

import * as THREE from 'three';
import { SITES, WATER_LEVEL } from '../config.js';
import { heightAt, slopeAt, makeRandom } from './noise.js';
import { hash2i, clamp, smoothstep } from '../util/math.js';
import { placeStrangeness } from './strangeness.js';
import { regionAt } from './regions.js';
import { featureName } from './placenames.js';

const TURF = new THREE.Color(0x556234);
const TURF_DARK = new THREE.Color(0x3d4726);
const SLAB = new THREE.Color(0x6a6459);
const SLAB_DARK = new THREE.Color(0x3e3a34);
const DARKNESS = new THREE.Color(0x08080a);

let barrowGeo = null;
let circleGeo = null;

/** A grassed-over mound with a stone-framed mouth on one side. */
function barrowGeometry() {
  if (barrowGeo) return barrowGeo;
  const rand = makeRandom('barrow');
  const paint = (geo, color) => {
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
  };

  // The mound: a squashed dome, lumpy enough not to read as a golf bunker.
  const mound = new THREE.IcosahedronGeometry(SITES.barrowRadius, 2);
  const pos = mound.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // Flatten the underside — it is a mound on the ground, not a buried ball.
    pos.setY(i, Math.max(0, y) * SITES.barrowHeightScale);
    const n = 1 + (rand() - 0.5) * 0.14;
    pos.setX(i, pos.getX(i) * n);
    pos.setZ(i, pos.getZ(i) * n);
  }
  mound.computeVertexNormals();

  // Kerb stones around the base — the detail that says "made", not "hill".
  const kerbParts = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = SITES.barrowRadius * 0.97;
    const s = new THREE.BoxGeometry(0.5, 0.62 + rand() * 0.3, 0.34);
    s.rotateY(a + (rand() - 0.5) * 0.3);
    s.translate(Math.cos(a) * r, 0.22, Math.sin(a) * r);
    kerbParts.push(paint(s, SLAB));
  }

  // The mouth: two uprights and a lintel, facing +Z.
  const mouthParts = [];
  const upL = new THREE.BoxGeometry(0.44, 1.5, 0.42);
  upL.translate(0.62, 0.75, SITES.barrowRadius * 0.86);
  const upR = upL.clone();
  upR.translate(-1.24, 0, 0);
  const lintel = new THREE.BoxGeometry(1.9, 0.42, 0.5);
  lintel.translate(0, 1.66, SITES.barrowRadius * 0.86);
  mouthParts.push(paint(upL, SLAB), paint(upR, SLAB), paint(lintel, SLAB_DARK));

  // The blocking slab — removed when the barrow is opened.
  const seal = new THREE.BoxGeometry(1.3, 1.5, 0.22);
  seal.translate(0, 0.75, SITES.barrowRadius * 0.86 + 0.24);

  // What is behind the slab once it is gone. A dark hole reads as depth for
  // nothing; no geometry, no lighting, just an absence.
  const hole = new THREE.BoxGeometry(1.25, 1.42, 0.3);
  hole.translate(0, 0.71, SITES.barrowRadius * 0.86 - 0.1);

  barrowGeo = {
    mound: paint(mound, TURF),
    kerb: kerbParts,
    mouth: mouthParts,
    seal: paint(seal, SLAB),
    hole: paint(hole, DARKNESS),
    turfDark: TURF_DARK,
  };
  return barrowGeo;
}

/** A ring of rough standing stones. Smaller and commoner than the landmark. */
function circleGeometry() {
  if (circleGeo) return circleGeo;
  const rand = makeRandom('circles');
  const parts = [];
  const n = SITES.circleStones;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = SITES.circleRadius;
    const h = 1.5 + rand() * 1.3;
    const s = new THREE.BoxGeometry(0.52 + rand() * 0.3, h, 0.38 + rand() * 0.2);
    // Lean each one a little; a perfectly upright ring looks like fence posts.
    s.rotateZ((rand() - 0.5) * 0.16);
    s.rotateX((rand() - 0.5) * 0.12);
    s.rotateY(a + (rand() - 0.5) * 0.4);
    s.translate(Math.cos(a) * r, h * 0.42, Math.sin(a) * r);
    const g = s.toNonIndexed();
    g.deleteAttribute('uv');
    const c = rand() < 0.35 ? SLAB_DARK : SLAB;
    const cnt = g.attributes.position.count;
    const arr = new Float32Array(cnt * 3);
    for (let k = 0; k < cnt; k++) {
      arr[k * 3] = c.r;
      arr[k * 3 + 1] = c.g;
      arr[k * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    parts.push(g);
  }
  circleGeo = parts;
  return circleGeo;
}

const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.93,
  metalness: 0,
});

/**
 * Every built site in the world.
 *
 * Placement is a pure function of the grid cell, so this class holds only what
 * has CHANGED — which barrows have been opened. That is the same trick the
 * saves use: the world is free, the diffs are not.
 */
export class Sites {
  constructor(scene, deps = {}) {
    this.scene = scene;
    this.deps = deps; // { wildlife, pickups, audio, onDiscover }
    this.root = new THREE.Group();
    scene.add(this.root);
    this.active = []; // sites currently built as geometry
    this.opened = new Set(); // barrow keys the player has opened — save state
    this.known = new Set(); // sites the player has stood at, for the gazetteer
    this.anchor = new THREE.Vector3(Infinity, 0, Infinity);
    this.rand = makeRandom('sites');
  }

  /**
   * Is there a site in this cell, and what is it?
   *
   * Barrows want lonely ground — they are where people did NOT live — and
   * circles want a view, so they prefer high open ground. Both refuse steep
   * slopes and water, because you cannot build on either.
   */
  siteInCell(ci, cj) {
    const cell = SITES.cellSize;
    const roll = hash2i(ci, cj, 901);
    if (roll > SITES.density) return null;

    const x = ci * cell + hash2i(ci, cj, 902) * cell;
    const z = cj * cell + hash2i(ci, cj, 903) * cell;
    const y = heightAt(x, z);
    if (y < WATER_LEVEL + 2) return null;
    if (slopeAt(x, z) > SITES.maxSlope) return null;

    const s = placeStrangeness(x, z);
    const region = regionAt(x, z);
    // Nobody raised a barrow in a bog.
    if (region.bog > 0.4 || region.water > 0.3) return null;

    // Which of the two it is, by ground rather than by coin-flip: barrows out
    // in the lonely country, circles up where you can see.
    const wantBarrow = s >= SITES.barrowStrangeness && hash2i(ci, cj, 904) < 0.62;
    const kind = wantBarrow ? 'barrow' : 'circle';
    if (kind === 'circle' && y < SITES.circleMinHeight) return null;

    const key = `${ci},${cj}`;
    return {
      key,
      kind,
      x,
      z,
      y,
      strangeness: s,
      yaw: hash2i(ci, cj, 905) * Math.PI * 2,
      name: featureName(x, z, kind),
    };
  }

  /** Rebuild the set of sites near the player. */
  refresh(px, pz) {
    const cell = SITES.cellSize;
    const R = SITES.visibleRange;
    const wanted = new Map();
    for (let cj = Math.floor((pz - R) / cell); cj <= Math.ceil((pz + R) / cell); cj++) {
      for (let ci = Math.floor((px - R) / cell); ci <= Math.ceil((px + R) / cell); ci++) {
        const site = this.siteInCell(ci, cj);
        if (!site) continue;
        if (Math.hypot(site.x - px, site.z - pz) > R) continue;
        wanted.set(site.key, site);
      }
    }

    // Drop what has gone out of range.
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      if (wanted.has(a.key)) {
        wanted.delete(a.key); // already built
        continue;
      }
      this.root.remove(a.object);
      this.active.splice(i, 1);
    }
    // Build what has come into it.
    for (const site of wanted.values()) this.build(site);
  }

  build(site) {
    const g = new THREE.Group();
    g.position.set(site.x, site.y, site.z);
    g.rotation.y = site.yaw;

    if (site.kind === 'barrow') {
      const P = barrowGeometry();
      const mound = new THREE.Mesh(P.mound, material);
      mound.castShadow = true;
      mound.receiveShadow = true;
      g.add(mound);
      for (const k of P.kerb) g.add(new THREE.Mesh(k, material));
      for (const m of P.mouth) {
        const mesh = new THREE.Mesh(m, material);
        mesh.castShadow = true;
        g.add(mesh);
      }
      const hole = new THREE.Mesh(P.hole, material);
      g.add(hole);
      const seal = new THREE.Mesh(P.seal, material);
      seal.castShadow = true;
      g.add(seal);
      site.seal = seal;
      // Already opened in this run? Show it that way.
      if (this.opened.has(site.key)) seal.visible = false;
    } else {
      for (const part of circleGeometry()) {
        const m = new THREE.Mesh(part, material);
        m.castShadow = true;
        g.add(m);
      }
    }

    site.object = g;
    this.root.add(g);
    this.active.push(site);
  }

  update(dt, playerPos) {
    if (Math.hypot(playerPos.x - this.anchor.x, playerPos.z - this.anchor.z) > 60) {
      this.anchor.copy(playerPos);
      this.refresh(playerPos.x, playerPos.z);
    }
  }

  /** The site you are close enough to use, if any. */
  nearest(pos, maxRange = SITES.useRange) {
    let best = null;
    let bestD = maxRange;
    for (const s of this.active) {
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best ? { site: best, distance: bestD } : null;
  }

  /** Are you inside a stone circle right now? Drives shelter and the survey. */
  circleAt(pos) {
    for (const s of this.active) {
      if (s.kind !== 'circle') continue;
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d <= SITES.circleRadius + 0.6) return s;
    }
    return null;
  }

  /**
   * Open a barrow.
   *
   * Permanent, loud, and it wakes what was put in there. The reward is real —
   * grave goods are the only items in the world you do not have to hunt for —
   * and so is the cost.
   */
  open(site) {
    if (site.kind !== 'barrow' || this.opened.has(site.key)) return null;
    this.opened.add(site.key);
    if (site.seal) site.seal.visible = false;

    // Grave goods, scaled by how far out the barrow is. The dangerous ground
    // pays better, which is the whole shape of the strangeness gradient
    // expressed as a reward rather than a threat.
    const rich = smoothstep(SITES.barrowStrangeness, 0.9, site.strangeness);
    const goods = [];
    const n = 1 + Math.floor(rich * SITES.barrowGoodsMax + this.rand() * 1.5);
    for (let i = 0; i < n; i++) {
      const roll = this.rand();
      goods.push(roll < 0.42 ? 'arrow' : roll < 0.72 ? 'hide' : roll < 0.9 ? 'wood' : 'venison_cooked');
    }

    this.deps.audio?.impact?.('rock', { x: site.x, y: site.y + 1, z: site.z });
    return { goods, site, guardian: rich > SITES.barrowGuardianAt };
  }

  /** Serialisable state: which barrows are open. The rest is derived. */
  toJSON() {
    return { opened: [...this.opened] };
  }

  fromJSON(data) {
    this.opened = new Set(data?.opened ?? []);
    // Anything already built needs its seal updating.
    for (const s of this.active) {
      if (s.kind === 'barrow' && s.seal) s.seal.visible = !this.opened.has(s.key);
    }
  }

  get stats() {
    let barrows = 0;
    let circles = 0;
    for (const s of this.active) (s.kind === 'barrow' ? barrows++ : circles++);
    return { barrows, circles, opened: this.opened.size, active: this.active.length };
  }
}
