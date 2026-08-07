// ── solidcheck.js ───────────────────────────────────────────────────────────
// Can a body still walk through a tree?
//
//   npm run solidcheck            both legs
//   node server/solidcheck.js 8086
//
// Until now it could walk through everything. `controller.js` integrated x and
// z and NOTHING followed — no sweep, no push-out, no radius test — so a player
// or an agent passed through trunks, boulders, standing stones, every built
// structure and every other person. The only geometric test any body was ever
// subject to was the capsule an ARROW is checked against.
//
// TWO LEGS, ON PURPOSE, because they fail for different reasons.
//
//   THE MECHANISM, offline: no port, no server, no wall clock, so it can be run
//   on a busy box and believed. It drives the real `Controller.prototype` over
//   real terrain at real trees found by SCANNING, not at coordinates pasted in.
//
//   THE WIRING, over a socket: a real server, a real socket, a real body walked
//   at a real trunk. Every agent test in this project passed for years while no
//   agent could shoot, because the bugs live BETWEEN client and server. A flag
//   read in server.js and never handed to a controller would sail through the
//   offline leg.
//
// EVERY REACH ASSERTION HAS A SENTINEL BESIDE IT. "The body never got inside
// the trunk" is also true of a body that walked the other way, and this project
// has already shipped one instrument that could only see its arm when its arm
// FAILED. So each of these is a PAIR: it never got inside, AND it got to the
// surface. Neither half is worth anything alone.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import {
  PROTOCOL_VERSION, C_HELLO, C_INTENT, S_WELCOME, S_SNAPSHOT,
  encode, decode,
} from '../src/net/protocol.js';
import { PLAYER } from '../src/config.js';
import { Controller } from '../src/player/controller.js';
import { ColliderField } from '../src/world/colliders.js';
import { createIntent } from '../src/sim/intents.js';
import { treesNear, rocksNear } from '../src/world/timber.js';
import { heightAt } from '../src/world/noise.js';
import { requireFreePort } from './freeport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 8086);
const URL = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const R = PLAYER.bodyRadius;
const H = PLAYER.bodyHeight;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── the offline leg ─────────────────────────────────────────────────────────

/** A field holding one tree's trunk and its crown, exactly as the game builds them. */
function fieldFor(trees = [], rocks = []) {
  const f = new ColliderField(14);
  for (const t of trees) {
    f.addCylinder(t.x, t.y, t.z, t.trunkR, t.trunkH, 'tree');
    f.addSphere(t.x, t.crownCentreY, t.z, t.crownR, 'tree', true);
  }
  for (const r of rocks) f.addSphere(r.x, r.centreY, r.z, r.r, 'rock');
  return f;
}

/** A body standing at (x, z) facing `yaw`, with real methods and invented state. */
function bodyAt(x, z, yaw, solids = null) {
  const c = new Controller();
  c.teleport(new THREE.Vector3(x, heightAt(x, z), z), yaw);
  c.solids = solids;
  return c;
}

/**
 * Walk a body forward for `secs` at a fixed step and report what happened.
 *
 * `nearest` is the closest the body's CENTRE ever came to (tx, tz) — the number
 * both halves of every reach assertion are read off. Tracked every substep, not
 * at the end, because a body that passes clean through a trunk is outside it
 * again by the time the walk stops.
 */
function walk(ctrl, secs, target, { forward = 1, dt = 1 / 60 } = {}) {
  const intent = { ...createIntent(), forward };
  let nearest = Infinity;
  let feetAtNearest = ctrl.position.y;
  let pushedTotal = 0;
  let biggestStep = 0;
  const startX = ctrl.position.x;
  const startZ = ctrl.position.z;
  for (let i = 0; i < Math.round(secs / dt); i++) {
    const bx = ctrl.position.x;
    const bz = ctrl.position.z;
    ctrl.update(dt, intent);
    pushedTotal += ctrl.pushedOut;
    biggestStep = Math.max(biggestStep, Math.hypot(ctrl.position.x - bx, ctrl.position.z - bz));
    if (target) {
      const d = Math.hypot(ctrl.position.x - target.x, ctrl.position.z - target.z);
      // The FEET AT THAT MOMENT, not at the end and not at the obstacle. A
      // sphere's width depends on the height you meet it at, so an assertion
      // that reads the ground under the boulder is measuring a slice the body
      // never walked into — which is one boulder in ten, on a slope.
      if (d < nearest) { nearest = d; feetAtNearest = ctrl.position.y; }
    }
  }
  return {
    nearest,
    feetAtNearest,
    pushedTotal,
    biggestStep,
    travelled: Math.hypot(ctrl.position.x - startX, ctrl.position.z - startZ),
    x: ctrl.position.x,
    z: ctrl.position.z,
  };
}

/** Where you have to face to walk from (x,z) toward (tx,tz). Forward is (-sin, -cos). */
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

/** Does this collider's vertical span reach the band a body standing here fills? */
const inBand = (ground, lo, hi) => ground < hi && ground + H > lo;

/**
 * The widest horizontal slice a sphere presents to a body standing on `ground`.
 * The same arithmetic `pushOut` does, written out here on purpose: an assertion
 * that borrows the code it is testing proves the code agrees with itself.
 */
function sliceOf(sphere, ground) {
  const y = Math.min(Math.max(sphere.centreY, ground), ground + H);
  return Math.sqrt(Math.max(0, sphere.r ** 2 - (sphere.centreY - y) ** 2));
}

/**
 * Find real trees by SCANNING, the way detourcheck finds its sites.
 *
 * Wanted: a trunk taller than a body, standing on ground gentle enough that a
 * body walked at it actually arrives rather than sliding down a crag — AND a
 * trunk that reaches the ground the body is walking on.
 *
 * ── THAT LAST CONDITION IS NOT PEDANTRY, IT IS THE FIRST THING THIS CHECK
 * MEASURED WRONG ──
 *
 * Trees are planted at `latticeHeight`, an 8 m-smoothed sample of the terrain;
 * a body walks on `heightAt`. Over 2,431 real trees the two agree to a median
 * of -0.07 m, but the tail runs to 4.80 m, and on **0.7% of trees (18 of
 * 2,431)** the whole trunk ends up below the walker's feet or above their head.
 * Nothing can stop a body at those, and nothing should: the tree is drawn there
 * too, so what you walk through is a trunk buried in the hillside.
 *
 * Without this filter the check picked 2 such trees out of 24 and reported a
 * push-out bug that did not exist. `rejectedOffGround` is returned so the
 * artefact is stated on the page rather than rediscovered by the next person.
 */
function findTrunks(limit) {
  const out = [];
  let scanned = 0;
  let rejectedOffGround = 0;
  for (const [px, pz] of [[0, 0], [220, -180], [-360, 500], [90, 740], [-620, -240]]) {
    for (const t of treesNear(px, pz, 200)) {
      scanned++;
      const g = heightAt(t.x, t.z);
      if (!inBand(g, t.y, t.y + t.trunkH)) { rejectedOffGround++; continue; }
      if (out.length >= limit) continue;
      if (t.trunkH < H + 0.3) continue;
      // Approach from due south, and only take a site where the walk is not a
      // climb: within a metre and a half over the whole approach.
      const away = 9;
      const sx = t.x;
      const sz = t.z + away;
      if (Math.abs(heightAt(sx, sz) - g) > 1.5) continue;
      if (Math.abs(heightAt(sx, sz - away / 2) - g) > 1.5) continue;
      out.push({ tree: t, sx, sz, yaw: yawTo(sx, sz, t.x, t.z), ground: g });
    }
  }
  out.scanned = scanned;
  out.rejectedOffGround = rejectedOffGround;
  return out;
}

function offlineLeg() {
  console.log('\n  ── the mechanism: real Controller, real terrain, no clock ──\n');

  const sites = findTrunks(24);
  check('found real trees to walk into, by scanning', sites.length >= 12,
    `${sites.length} sites, trunk radii ` +
      `${Math.min(...sites.map((s) => s.tree.trunkR)).toFixed(2)}-${Math.max(...sites.map((s) => s.tree.trunkR)).toFixed(2)} m`);
  if (!sites.length) return;

  // ── and the artefact that filter exists for, stated as a NUMBER ──
  //
  // Not a pass/fail about this feature — it predates it and applies to arrows
  // exactly as much — but a body walking through one of these is CORRECT
  // behaviour, and the next person to see it needs the number here rather than
  // spending a run on a push-out bug that is not there.
  const offGround = (100 * sites.rejectedOffGround) / sites.scanned;
  check('a few trees are planted off the ground a body walks on, and stop nobody',
    offGround < 3,
    `${sites.rejectedOffGround}/${sites.scanned} trees (${offGround.toFixed(1)}%) have their whole trunk ` +
      `below the feet or over the head — planted at latticeHeight, walked on heightAt`);

  // ── 1. THE COUNTERFACTUAL FIRST. If the old code does not walk through the
  // tree, nothing below this line means anything.
  let through = 0;
  let arrived = 0;
  for (const s of sites) {
    const w = walk(bodyAt(s.sx, s.sz, s.yaw, null), 4, s.tree);
    if (w.nearest < s.tree.trunkR) through++;
    if (w.nearest < s.tree.trunkR + R + 0.5) arrived++;
  }
  check('WITHOUT solids a body walks clean through the trunk',
    through >= sites.length * 0.8,
    `${through}/${sites.length} ended up inside the wood; ${arrived} reached the tree at all`);

  // ── 2. and with solids on, it does not. BOTH HALVES.
  let blocked = 0;
  let touched = 0;
  const worstIntrusion = [];
  for (const s of sites) {
    const w = walk(bodyAt(s.sx, s.sz, s.yaw, [fieldFor([s.tree])]), 4, s.tree);
    const surface = s.tree.trunkR + R;
    if (w.nearest >= surface - 0.02) blocked++;
    else worstIntrusion.push(surface - w.nearest);
    if (w.nearest <= surface + 0.4) touched++;
  }
  check('WITH solids the body never gets inside the trunk',
    blocked === sites.length,
    blocked === sites.length
      ? `${blocked}/${sites.length}`
      : `${blocked}/${sites.length}; deepest intrusion ${Math.max(...worstIntrusion).toFixed(3)} m`);
  check('  …and the SENTINEL: it actually reached the trunk (else the line above is vacuous)',
    touched >= sites.length * 0.9,
    `${touched}/${sites.length} came within 0.4 m of the surface`);

  // ── 3. it does not stop dead either — it goes ROUND.
  let slid = 0;
  for (const s of sites) {
    const w = walk(bodyAt(s.sx + 0.35, s.sz, s.yaw, [fieldFor([s.tree])]), 4, s.tree);
    if (w.travelled > 6) slid++;
  }
  check('a body that clips a trunk slides past it rather than sticking',
    slid >= sites.length * 0.75,
    `${slid}/${sites.length} covered more than 6 m in 4 s off a 0.35 m offset`);

  // ── 4. THE CROWN IS SOFT, and that is the 40% finding made into an assertion.
  const lowCrowns = sites.filter((s) => s.tree.crownCentreY - s.tree.crownR < s.ground + H);
  let walkedUnder = 0;
  for (const s of lowCrowns) {
    // Only the crown in the field — no trunk — and walk right through where it is.
    const f = new ColliderField(14);
    f.addSphere(s.tree.x, s.tree.crownCentreY, s.tree.z, s.tree.crownR, 'tree', true);
    const w = walk(bodyAt(s.sx, s.sz, s.yaw, [f]), 4, s.tree);
    if (w.pushedTotal === 0 && w.nearest < 1) walkedUnder++;
  }
  check('a CROWN never stops a body — it is foliage, and on 40% of trees it reaches the ground',
    lowCrowns.length > 0 && walkedUnder === lowCrowns.length,
    `${walkedUnder}/${lowCrowns.length} trees whose crown hangs into the walking band`);

  // …and the same crown still stops an arrow, or the fix has broken hunting.
  {
    const s = lowCrowns[0] ?? sites[0];
    const f = new ColliderField(14);
    f.addSphere(s.tree.x, s.tree.crownCentreY, s.tree.z, s.tree.crownR, 'tree', true);
    const a = new THREE.Vector3(s.tree.x, s.tree.crownCentreY, s.tree.z + 30);
    const b = new THREE.Vector3(s.tree.x, s.tree.crownCentreY, s.tree.z - 30);
    const out = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), tag: null };
    check('  …but an ARROW still hits that crown — `soft` is for bodies only',
      f.segmentHit(a, b, out) !== null, `tag ${out.tag}`);
  }

  // ── 5. rocks stop a body. A boulder is a boulder.
  const rocks = [];
  for (const [px, pz] of [[0, 0], [220, -180], [-360, 500]]) {
    for (const r of rocksNear(px, pz, 200)) {
      const g = heightAt(r.x, r.z);
      if (Math.abs(heightAt(r.x, r.z + 8) - g) > 1.5) continue;
      // Same precondition as the trunks, for the same reason: a boulder whose
      // sphere is entirely under the walked ground is not an obstacle.
      if (!inBand(g, r.centreY - r.r, r.centreY + r.r)) continue;
      // …and the slice it actually presents at knee-to-shoulder height has to
      // be worth walking into. A boulder sunk to its last 10 cm is a pebble.
      const slice = sliceOf(r, g);
      if (slice < 0.4) continue;
      rocks.push({ rock: r, sx: r.x, sz: r.z + 8, yaw: yawTo(r.x, r.z + 8, r.x, r.z), slice });
      if (rocks.length >= 10) break;
    }
    if (rocks.length >= 10) break;
  }
  let rockBlocked = 0;
  let rockTouched = 0;
  let rockThrough = 0;
  for (const s of rocks) {
    const solid = walk(bodyAt(s.sx, s.sz, s.yaw, [fieldFor([], [s.rock])]), 4, { x: s.rock.x, z: s.rock.z });
    const open = walk(bodyAt(s.sx, s.sz, s.yaw, null), 4, { x: s.rock.x, z: s.rock.z });
    // Read against the slice the body actually met, at the height its feet
    // were at when it got closest.
    const met = sliceOf(s.rock, solid.feetAtNearest);
    if (solid.nearest >= met + R - 0.05) rockBlocked++;
    if (solid.nearest <= met + R + 0.6) rockTouched++;
    if (open.nearest < sliceOf(s.rock, open.feetAtNearest)) rockThrough++;
  }
  check('a boulder stops a body', rocks.length > 0 && rockBlocked === rocks.length,
    `${rockBlocked}/${rocks.length} kept out; sentinel: ${rockTouched} reached it, ${rockThrough} walked through it without solids`);

  // ── 6. AN EMPTY FIELD IS THE OLD GAME, TO THE BIT. This is the byte-identical
  // assertion: the new branch, with nothing in it to hit, must change nothing.
  {
    const s = sites[0];
    const a = bodyAt(s.sx, s.sz, s.yaw, null);
    const b = bodyAt(s.sx, s.sz, s.yaw, [new ColliderField(14)]);
    let same = true;
    const intent = { ...createIntent(), forward: 1, strafe: 0.3 };
    for (let i = 0; i < 600; i++) {
      a.update(1 / 60, intent);
      b.update(1 / 60, intent);
      if (a.position.x !== b.position.x || a.position.z !== b.position.z || a.position.y !== b.position.y) {
        same = false;
        break;
      }
    }
    check('an EMPTY field is byte-identical to no field at all, 600 ticks',
      same && a.distanceTravelled === b.distanceTravelled,
      `${a.position.x.toFixed(6)} vs ${b.position.x.toFixed(6)}, ${a.footfalls.toFixed(6)} footfalls both`);
  }

  // ── 7. THE PUSH IS ORDER-INDEPENDENT, which is why it is a SUM and not a
  // sequence. The server builds its field from `refreshTimber`, a browser from
  // `Scatter`; the two orders differ, and an order-dependent solve would put one
  // body in two places at a corner.
  {
    const pair = sites.slice(0, 2).map((s) => s.tree);
    const a = fieldFor(pair);
    const b = fieldFor([...pair].reverse());
    const p1 = new THREE.Vector3(pair[0].x + 0.1, heightAt(pair[0].x, pair[0].z), pair[0].z + 0.1);
    const p2 = p1.clone();
    a.resolveBody(p1, R, H, PLAYER.maxPushPerStep);
    b.resolveBody(p2, R, H, PLAYER.maxPushPerStep);
    check('the push-out gives the same answer whichever order the colliders arrive in',
      p1.x === p2.x && p1.z === p2.z,
      `${p1.x.toFixed(9)} / ${p2.x.toFixed(9)}`);
  }

  // ── 8. NOTHING TELEPORTS. A body standing dead inside a trunk oozes out at
  // the capped rate rather than being flung across the hillside.
  {
    const t = sites[0].tree;
    const pos = new THREE.Vector3(t.x, heightAt(t.x, t.z), t.z);
    const f = fieldFor([t]);
    let biggest = 0;
    let steps = 0;
    for (; steps < 200; steps++) {
      const moved = f.resolveBody(pos, R, H, PLAYER.maxPushPerStep);
      biggest = Math.max(biggest, moved);
      if (moved === 0) break;
    }
    const d = Math.hypot(pos.x - t.x, pos.z - t.z);
    check('a body starting INSIDE a trunk oozes out — capped, not flung',
      biggest <= PLAYER.maxPushPerStep + 1e-9 && d >= t.trunkR + R - 0.02,
      `biggest single push ${biggest.toFixed(3)} m (cap ${PLAYER.maxPushPerStep}), out in ${steps} substeps, now ${d.toFixed(2)} m from the trunk`);
  }

  // ── 9. DETERMINISM. Two identical walks, identical to the bit.
  {
    const s = sites[0];
    const w1 = walk(bodyAt(s.sx, s.sz, s.yaw, [fieldFor([s.tree])]), 4, s.tree);
    const w2 = walk(bodyAt(s.sx, s.sz, s.yaw, [fieldFor([s.tree])]), 4, s.tree);
    check('the same walk twice is the same walk',
      w1.x === w2.x && w1.z === w2.z && w1.pushedTotal === w2.pushedTotal,
      `${w1.x.toFixed(9)} / ${w2.x.toFixed(9)}`);
  }

  // ── 10. A WOOD IS STILL CROSSABLE, AND NOBODY JAMS IN IT ──
  //
  // This is the assertion the whole feature lives or dies on. Everything above
  // proves a body is stopped by things; the risk of that is a body that stops
  // and never starts again — an agent pressed into a trunk for the rest of the
  // evening instead of hunting.
  //
  // THE BODY RE-AIMS EVERY TICK, and it has to. The first version of this set
  // the yaw once and walked in a straight line, so a body nudged 3 m sideways
  // by a trunk then marched off at a tangent for forty seconds and the check
  // called it stuck. That is not what an agent does: `resolve` re-solves its
  // heading every tick. Aiming once measured the check, not the game.
  {
    const patch = treesNear(0, 0, 130);
    const f = fieldFor(patch);
    let crossed = 0;
    let worstJam = 0;
    let pushedTicksTotal = 0;
    const tries = 12;
    const dt = 1 / 60;
    for (let i = 0; i < tries; i++) {
      const a = (i / tries) * Math.PI * 2;
      const sx = Math.cos(a) * 110;
      const sz = Math.sin(a) * 110;
      const c = bodyAt(sx, sz, yawTo(sx, sz, 0, 0), [f]);
      const intent = { ...createIntent(), forward: 1 };
      let jam = 0;
      for (let k = 0; k < 40 / dt; k++) {
        const bx = c.position.x;
        const bz = c.position.z;
        c.targetYaw = c.yaw = yawTo(c.position.x, c.position.z, 0, 0);
        c.update(dt, intent);
        if (c.pushedOut > 0) pushedTicksTotal++;
        // A "jam" is a tick that went nowhere while still trying to walk.
        if (Math.hypot(c.position.x - bx, c.position.z - bz) < 0.01) {
          jam += dt;
          worstJam = Math.max(worstJam, jam);
        } else jam = 0;
      }
      if (Math.hypot(sx, sz) - Math.hypot(c.position.x, c.position.z) > 100) crossed++;
    }
    check('a body can still cross a wood — 110 m through 218 real trees',
      crossed === tries,
      `${crossed}/${tries} walks closed the full 110 m; ${pushedTicksTotal} ticks were pushed out of something`);
    check('  …and nobody JAMS: the longest a body went nowhere while walking',
      worstJam < 2,
      `${worstJam.toFixed(1)} s — a wedged body would sit here for the whole 40`);
  }
}

// ── the socket leg ──────────────────────────────────────────────────────────

class WireClient {
  constructor(name) {
    this.name = name;
    this.id = null;
    this.me = null;
    this.intent = { forward: 0, strafe: 0, lookYaw: 0, lookPitch: 0, aimYaw: null, aimPitch: null };
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onerror = (e) => reject(new Error(`${this.name}: ${e.message ?? 'socket error'}`));
      this.ws.onopen = () => this.send(C_HELLO, { name: this.name, version: PROTOCOL_VERSION });
      this.ws.onmessage = (ev) => {
        const msg = decode(ev.data);
        if (!msg) return;
        if (msg.type === S_WELCOME) { this.id = msg.data.id; resolve(this); }
        else if (msg.type === S_SNAPSHOT) this.me = msg.data.me ?? this.me;
      };
    });
  }

  send(type, data) { if (this.ws.readyState === 1) this.ws.send(encode(type, data)); }
  close() { try { this.ws.close(); } catch { /* going anyway */ } }
}

/**
 * Start a server, walk one body at one real trunk, and report the closest its
 * CENTRE ever came to that trunk — sampled off the server's own snapshots.
 */
async function walkAtATreeOverTheWire(solid) {
  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0', SOLID: solid ? 'on' : '' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  try {
    let c = null;
    for (let i = 0; i < 40 && !c; i++) {
      await sleep(150);
      c = await new WireClient('Walker').connect(URL).catch(() => null);
    }
    if (!c) throw new Error(`no server answered on ${URL}`);
    for (let i = 0; i < 20 && !c.me; i++) await sleep(100);
    if (!c.me) throw new Error('the server never said where I was');

    // Pick the tree from the SPAWN the server actually gave us, not from a
    // constant — the spawn moves with HOURS and with the seed.
    const [x0, , z0] = c.me.p;
    const trees = treesNear(x0, z0, 70)
      .filter((t) => t.trunkH > H + 0.3)
      .map((t) => ({ t, d: Math.hypot(t.x - x0, t.z - z0) }))
      .filter((e) => e.d > 8 && e.d < 45)
      .sort((a, b) => a.d - b.d);
    if (!trees.length) throw new Error('no tree within reach of the spawn to walk into');
    const tree = trees[0].t;

    // Face it, absolutely — deltas do not survive a rate-limited link, which is
    // the single most expensive lesson in this repo.
    let nearest = Infinity;
    let samples = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 14000) {
      if (c.me) {
        const [x, , z] = c.me.p;
        const d = Math.hypot(x - tree.x, z - tree.z);
        if (samples > 4) nearest = Math.min(nearest, d);
        samples++;
        c.intent.aimYaw = yawTo(x, z, tree.x, tree.z);
        c.intent.aimPitch = -0.03;
        c.intent.forward = 1;
        // Walked past it? Turn round and come back at it.
        if (d < 0.9) c.intent.forward = 0;
      }
      c.send(C_INTENT, { i: c.intent });
      await sleep(1000 / 30);
    }
    const end = c.me ? Math.hypot(c.me.p[0] - tree.x, c.me.p[2] - tree.z) : Infinity;
    c.close();
    await sleep(200);
    return { nearest, end, tree, samples };
  } finally {
    stop();
    await sleep(300);
  }
}

/**
 * Two real bodies, one real server, walked head-on into each other.
 *
 * This is the one that shows on camera. Six models and a human share a valley
 * tomorrow night and until now they all walked through one another, so
 * "standing round a fire" and "standing INSIDE two other people" were the same
 * picture. It cannot be tested from one socket, and it cannot be tested from
 * SimWorld directly — the separation runs on the server tick and the evidence
 * is in the snapshot each of them receives about the other.
 */
async function twoBodiesOverTheWire(solid) {
  const server = spawn(process.execPath, [path.join(HERE, 'server.js'), String(PORT)], {
    env: { ...process.env, DANGER: 'none', MINDS_HUNTERS: '0', SOLID: solid ? 'on' : '' },
    stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  try {
    let one = null;
    for (let i = 0; i < 40 && !one; i++) {
      await sleep(150);
      one = await new WireClient('Ailsa').connect(URL).catch(() => null);
    }
    if (!one) throw new Error(`no server answered on ${URL}`);
    const two = await new WireClient('Morag').connect(URL);
    for (let i = 0; i < 20 && !(one.me && two.me); i++) await sleep(100);
    if (!one.me || !two.me) throw new Error('the server never said where they were');

    // Read the gap off the SERVER's own snapshots, on both sockets, so a
    // disagreement between the two would show rather than be averaged away.
    let nearest = Infinity;
    let samples = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      for (const [me, them] of [[one, two], [two, one]]) {
        if (!me.me || !them.me) continue;
        const [x, , z] = me.me.p;
        me.intent.aimYaw = yawTo(x, z, them.me.p[0], them.me.p[2]);
        me.intent.aimPitch = -0.03;
        me.intent.forward = 1;
        me.send(C_INTENT, { i: me.intent });
      }
      if (one.me && two.me) {
        const d = Math.hypot(one.me.p[0] - two.me.p[0], one.me.p[2] - two.me.p[2]);
        if (samples > 8) nearest = Math.min(nearest, d);
        samples++;
      }
      await sleep(1000 / 30);
    }
    one.close();
    two.close();
    await sleep(200);
    return { nearest, samples };
  } finally {
    stop();
    await sleep(300);
  }
}

async function socketLeg() {
  console.log('\n  ── the wiring: a real server, a real socket, a real trunk ──\n');
  await requireFreePort(PORT, 'solidcheck');

  const off = await walkAtATreeOverTheWire(false);
  check('SOLID off — the body walks into the wood, as it always has',
    off.nearest < off.tree.trunkR,
    `closest approach ${off.nearest.toFixed(2)} m to a trunk of radius ${off.tree.trunkR.toFixed(2)} ` +
      `(${off.samples} snapshots)`);

  const on = await walkAtATreeOverTheWire(true);
  const surface = on.tree.trunkR + R;
  check('SOLID=on — the server keeps the body OUT of the trunk',
    on.nearest >= surface - 0.05,
    `closest approach ${on.nearest.toFixed(2)} m, surface at ${surface.toFixed(2)} m ` +
      `(trunk ${on.tree.trunkR.toFixed(2)} + body ${R})`);
  check('  …and the SENTINEL: it walked all the way up to the trunk',
    on.nearest <= surface + 0.6,
    `${on.nearest.toFixed(2)} m against a surface at ${surface.toFixed(2)} m — ` +
      `a body that wandered off would also "never get inside"`);
  check('  …and the two arms were provably different worlds',
    on.nearest - off.nearest > 0.3,
    `off got to ${off.nearest.toFixed(2)} m, on stopped at ${on.nearest.toFixed(2)} m`);

  // ── and two PEOPLE, which is the picture the evening actually shows ──
  console.log('');
  const pOff = await twoBodiesOverTheWire(false);
  check('SOLID off — two people walk clean through each other',
    pOff.nearest < 0.3,
    `closest the server ever had them: ${pOff.nearest.toFixed(2)} m apart (${pOff.samples} snapshots)`);

  const pOn = await twoBodiesOverTheWire(true);
  check('SOLID=on — the server will not let two people stand inside each other',
    pOn.nearest >= PLAYER.personalSpace - 0.08,
    `closest ${pOn.nearest.toFixed(2)} m, personal space ${PLAYER.personalSpace} m`);
  check('  …and the SENTINEL: they actually walked into each other',
    pOn.nearest <= PLAYER.personalSpace + 0.5,
    `${pOn.nearest.toFixed(2)} m — two people who never met would also never overlap`);
}

async function main() {
  console.log('\n  Is a body still a point?');
  offlineLeg();
  await socketLeg();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  could not run: ${err.message}\n`);
  process.exit(1);
});
