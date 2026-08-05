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
import { AUDIO, SURVIVAL, WATER_LEVEL } from '../config.js';
import { heightAt, slopeAt, makeRandom } from './noise.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

const STONE = new THREE.Color(0x565049);
const CHAR = new THREE.Color(0x1c1512);
const LOG = new THREE.Color(0x4a3626);

let sharedGeo = null;

/**
 * How close a remote fire has to be to a local one to BE that local one, and
 * how long a fire you just lit is allowed to stand unanswered. See
 * `applyRemote` for why a metre and a half cannot be ambiguous.
 */
const REMOTE_MATCH = 1.5;
const REMOTE_GRACE = 2.5;

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
    // { audio, roofedAt }. `roofedAt(x, z)` is the same query main.js already
    // uses for the player — see the note in `update` about why a fire needs it
    // too. A host without structures (the headless sim, the server) does not
    // pass one, and then every fire is open to the sky, which is what those
    // worlds actually are.
    this.deps = deps;
    this.active = [];
    this.rand = makeRandom('fires');
    this.time = 0;
    /**
     * True once somebody else is keeping the fires — see `applyRemote`.
     *
     * While it is set this list is a COPY of the server's and the fuel clock
     * below stands aside, for the same reason and in the same shape as
     * `Vitals.remote` and `Atmosphere.remote`: two copies of one number is
     * every bug in this family. A fire you light yourself still appears
     * instantly — it is marked `pending` and adopted by the next packet — but
     * from the moment it is confirmed the server decides how long it burns and
     * when it goes out.
     */
    this.remote = false;
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
    const fire = this.spawn(x, z, fuel, { y: check.y });
    // Lit here, but the server has the last word while it is keeping the list.
    // Held as `pending` until a packet either adopts it or fails to, so that a
    // fire the server refused — it can see somebody else's 2 m away and this
    // browser cannot — stops being drawn instead of burning here for ever.
    if (this.remote) {
      fire.pending = true;
      fire.claimedAt = this.time;
    }
    return { ok: true, fire };
  }

  /**
   * Build the thing, no questions asked.
   *
   * Split out of `light` so that a fire the SERVER has already accepted can be
   * put on this screen without being re-judged here. `canPlaceAt` refuses
   * anything within 3 m of another fire, and a remote fire arriving beside a
   * local one that is about to be reconciled away would be refused by exactly
   * that rule — the client second-guessing an answer it was given. Same lesson
   * as `mirrorFight`: take the outcome, do not re-decide it.
   */
  spawn(x, z, fuel = SURVIVAL.fireFuelPerWood, { y = null, quiet = false } = {}) {
    const group = new THREE.Group();
    group.position.set(x, y ?? heightAt(x, z), z);

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
      nextPop: 0, // countdown to the next crackle; see `update`
      // Lit here and not yet answered for by the server. Always false in single
      // player and on the server itself; see `light` and `applyRemote`.
      pending: false,
      claimedAt: 0,
    };
    this.active.push(fire);
    // Quiet only for the fires that were ALREADY burning when we joined —
    // hearing somebody else's fire catch is the point, hearing five of them
    // catch at once because you walked through a door is not. See `applyRemote`.
    if (!quiet) this.deps.audio?.fireLit?.(group.position);
    return fire;
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

  /**
   * Take the server's word for what is burning in this world.
   *
   * NOBODY COULD SEE ANYBODY ELSE'S FIRE. A fire has reached the server since
   * the packet that fixed the cold body — so the server's copy of you is warm
   * beside your own — but it went no further: the snapshot did not carry the
   * fires, so a second player standing in your camp saw bare ground, was not
   * warmed, could not cook on it and could not feed it. Two people, one field,
   * one fire, and each of them alone with it.
   *
   * Reconciled by POSITION, not by id. The server's fire ids are built from a
   * rounded position and the length of its own list, so they are not stable
   * across two worlds and matching on them would spawn a duplicate every
   * packet. Position is unambiguous here for a reason worth stating: placement
   * already refuses any fire within 3 m of another, so nothing legal can be
   * closer than 3 m apart and a 1.5 m match can only ever find the same fire.
   *
   * Delivered RAW from `onSnapshot` rather than through the interpolation
   * buffer, like the health and the hour before it. The buffer exists to smooth
   * BODIES between packets; a fire that is burning is not a thing to draw a
   * tenth of a second late, and blending one halfway out is not a state.
   */
  applyRemote(list) {
    if (!Array.isArray(list)) return;
    const first = !this.remote;
    this.remote = true;

    const seen = new Set();
    for (const entry of list) {
      const x = entry?.p?.[0];
      const z = entry?.p?.[1];
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      const fuel = Number.isFinite(entry.f) ? entry.f : SURVIVAL.fireFuelPerWood;

      let match = null;
      let bestD = REMOTE_MATCH;
      for (const f of this.active) {
        if (seen.has(f)) continue;
        const d = Math.hypot(f.position.x - x, f.position.z - z);
        if (d < bestD) {
          bestD = d;
          match = f;
        }
      }
      // Not one of ours yet: somebody else lit it, or we have just joined a
      // world that was already burning.
      if (!match) match = this.spawn(x, z, fuel, { quiet: first });

      seen.add(match);
      match.pending = false;
      match.fuel = fuel;
      match.lit = fuel > 0;
    }

    // Anything the server did not mention is not burning. The exception is a
    // fire lit on this screen a moment ago: the packet that would confirm it
    // was already in flight when it caught, so it is given `REMOTE_GRACE` to be
    // answered for before it is taken away again.
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];
      if (seen.has(f)) continue;
      if (f.pending && this.time - f.claimedAt < REMOTE_GRACE) continue;
      this.extinguish(f);
    }
  }

  /**
   * Nobody is keeping the fires for us any more — go back to running our own.
   *
   * Called when the socket drops. Without it the fuel clock below would stay
   * stopped and every fire in the world would burn for ever at whatever level
   * the last packet left it.
   */
  takeOverLocally() {
    this.remote = false;
    for (const f of this.active) f.pending = false;
  }

  update(dt, weather) {
    this.time += dt;
    // Rain drowns a fire, and wind makes it gutter.
    const rain = weather?.rain ?? 0;
    const wind = weather?.wind ?? 1;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];

      // ── how much of that rain actually lands on THIS fire ──
      // It used to be all of it, always, because this loop only ever saw the
      // global weather. So you could build a lean-to, light a fire under the
      // roof, and the game would still half-drown it and burn the fuel twice as
      // fast — which is the exact opposite of why anybody builds a shelter over
      // a fire. `roofedAt` was already here; nothing had ever asked it.
      const rainOnIt = this.deps.roofedAt?.(f.position.x, f.position.z) ? 0 : rain;

      // Somebody else owns how long this burns while we are connected — see
      // `applyRemote`. Everything below the fuel is presentation (the flicker,
      // the light, the crackle) and stays local, because none of it is a fact
      // anybody else has to agree with.
      if (!this.remote) {
        const burn =
          SURVIVAL.fireBurnPerSec * lerp(1, 2.2, rainOnIt) * lerp(0.85, 1.3, clamp(wind / 2, 0, 1));
        f.fuel = Math.max(0, f.fuel - burn * dt);
        if (f.fuel <= 0) f.lit = false;
      }

      // Intensity ramps down as it dies, so it fades rather than snapping out.
      const target = f.lit ? clamp(0.35 + f.fuel / 60, 0.35, 1) * lerp(1, 0.45, rainOnIt) : 0;
      f.intensity = lerp(f.intensity, target, clamp(dt * 1.5, 0, 1));

      // Flicker. Two incommensurate frequencies so it never looks like a pulse.
      const flick =
        0.82 + 0.12 * Math.sin(this.time * 11 + f.phase) + 0.06 * Math.sin(this.time * 27 + f.phase * 2);
      f.light.intensity = f.intensity * 9 * flick;
      f.light.distance = SURVIVAL.fireLightRange * clamp(f.intensity, 0.2, 1);
      f.flame.visible = f.intensity > 0.02;
      f.flame.scale.setScalar(clamp(f.intensity, 0.15, 1) * flick);
      f.flame.rotation.y += dt * 1.7;

      // ── crackle ──
      // The interval is jittered by a HASH of the fire's own phase and the
      // clock, not by `this.rand()`. Drawing from the seeded stream here would
      // make the sequence depend on how many frames the client happened to
      // render, and the headless sim — which has no audio at all — would fall
      // out of step with it. A hash costs nothing and cannot drift.
      if (f.intensity > 0.05) {
        f.nextPop -= dt;
        if (f.nextPop <= 0) {
          const jitter = Math.abs(Math.sin(this.time * 37.13 + f.phase * 91.7));
          f.nextPop = (0.4 + jitter * 1.2) / Math.max(0.2, AUDIO.fireCracklePerSec * f.intensity);
          this.deps.audio?.fireCrackle?.(f.position, f.intensity);
        }
      }

      // And whether it is still there at all — `applyRemote` takes it away when
      // the server stops mentioning it, so removing it here as well would drop
      // a fire this client had merely stopped drawing brightly.
      if (!this.remote && !f.lit && f.intensity < 0.03) this.extinguish(f);
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
