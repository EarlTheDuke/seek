// ── save.js ─────────────────────────────────────────────────────────────────
// Saving a world that generates itself.
//
// Terrain, trees, rocks, landmarks and loot sites are all pure functions of the
// seed, so none of them are written down. A save is the seed, the clock, and
// the short list of ways this run has DIVERGED from what the seed would produce
// on its own: what you are carrying, what you killed, what you took, and where
// your arrows ended up.
//
// That keeps saves in the low kilobytes no matter how far you have walked, and
// it is the same property that will let clients skip downloading terrain when
// multiplayer arrives.

const VERSION = 2;
const KEY_PREFIX = 'highlands.save.';

const keyFor = (mode) => `${KEY_PREFIX}${mode}`;
const r3 = (n) => Math.round(n * 1000) / 1000; // keep the JSON readable

// ── writing ─────────────────────────────────────────────────────────────────

export function captureSave(ctx) {
  const { seed, mode, atmosphere, weather, ctrl, inventory, vitals, projectiles, pickups, wildlife } = ctx;

  return {
    version: VERSION,
    seed,
    mode,
    savedAt: Date.now(),

    clock: { hours: r3(atmosphere.hours), running: atmosphere.running },

    weather: {
      stateName: weather.stateName,
      nextName: weather.nextName,
      blend: r3(weather.blend),
      hold: Number.isFinite(weather.hold) ? r3(weather.hold) : 0,
      windAngle: r3(weather.windAngle),
      windWander: r3(weather.windWander),
    },

    player: {
      position: [r3(ctrl.position.x), r3(ctrl.position.y), r3(ctrl.position.z)],
      yaw: r3(ctrl.yaw),
      pitch: r3(ctrl.pitch),
      health: r3(vitals.health),
      // The body. Written flat rather than nested so a new need is one more
      // key with a sensible default on load, never a migration.
      coreC: r3(vitals.coreC ?? 37),
      hunger: r3(vitals.hunger ?? 100),
      stamina: r3(vitals.stamina ?? 100),
      wetness: r3(vitals.wetness ?? 0),
      distanceTravelled: r3(ctrl.distanceTravelled),
      inventory: {
        slots: inventory.slots.map((s) => ({ item: s.item, count: s.count })),
        equipped: inventory.equipped,
      },
    },

    world: {
      // Arrows still standing in the ground or a tree. The literal test case
      // for this whole phase.
      arrows: projectiles.items
        .filter((p) => p.landed)
        .map((p) => ({
          t: p.typeId,
          p: [r3(p.pos.x), r3(p.pos.y), r3(p.pos.z)],
          q: [r3(p.quat.x), r3(p.quat.y), r3(p.quat.z), r3(p.quat.w)],
          s: p.surface ?? 'ground',
        })),

      // Things you threw down and have not picked back up.
      dropped: pickups.dropped.map((d) => ({
        item: d.item,
        count: d.count,
        p: [r3(d.obj.position.x), r3(d.obj.position.y), r3(d.obj.position.z)],
      })),

      // Loot sites emptied, and creature sites whose occupants are gone. Both
      // are "this seed would put something here, but it is not here any more".
      lootTaken: [...pickups.taken],
      creatureSitesCleared: [...wildlife.clearedSites],
      // Fires are the first thing the player PUTS in the world, and the shape
      // Phase 7's buildings will follow.
      fires: ctx.fires ? ctx.fires.serialise() : [],
    },
  };
}

export function writeSave(data) {
  try {
    localStorage.setItem(keyFor(data.mode), JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('Could not write save:', err);
    return false;
  }
}

// ── reading ─────────────────────────────────────────────────────────────────

export function readSave(mode) {
  try {
    const raw = localStorage.getItem(keyFor(mode));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== VERSION) {
      console.info(`Ignoring save from format v${data.version}; current is v${VERSION}.`);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Could not read save:', err);
    return null;
  }
}

export function hasSave(mode, seed) {
  const s = readSave(mode);
  // A save from a different seed describes a different world entirely.
  return !!s && s.seed === seed;
}

export function clearSave(mode) {
  try {
    localStorage.removeItem(keyFor(mode));
  } catch {
    /* nothing sensible to do */
  }
}

/** Human-readable summary for the start screen. */
export function describeSave(mode, seed) {
  const s = readSave(mode);
  if (!s || s.seed !== seed) return null;
  const h = Math.floor(s.clock.hours);
  const m = Math.floor((s.clock.hours - h) * 60);
  const arrows = s.world.arrows.length;
  const ago = Math.max(0, Date.now() - s.savedAt);
  const mins = Math.round(ago / 60000);
  const when = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${arrows} arrow${arrows === 1 ? '' : 's'} out there · saved ${when}`;
}

// ── restoring ───────────────────────────────────────────────────────────────

/**
 * Apply a save over a freshly built world.
 *
 * Order matters: the player is moved first so terrain and scatter stream in
 * around the right place, then the diffs are laid back down on top.
 */
export function applySave(data, ctx) {
  const { atmosphere, weather, ctrl, inventory, vitals, projectiles, pickups, wildlife, onPlayerMoved } = ctx;

  // ── clock and sky ──
  atmosphere.running = data.clock.running;
  atmosphere.setHours(data.clock.hours);

  // ── weather ──
  const w = data.weather;
  weather.stateName = w.stateName;
  weather.nextName = w.nextName;
  weather.blend = w.blend;
  weather.hold = w.hold;
  weather.windAngle = w.windAngle;
  weather.windWander = w.windWander;
  weather.windDir.set(Math.cos(w.windAngle), Math.sin(w.windAngle));
  weather.update(0); // settle the blended values without advancing anything

  // ── player ──
  const p = data.player;
  ctrl.position.set(p.position[0], p.position[1], p.position[2]);
  ctrl.yaw = ctrl.targetYaw = p.yaw;
  ctrl.pitch = ctrl.targetPitch = p.pitch;
  ctrl.velocity.set(0, 0, 0);
  ctrl.distanceTravelled = p.distanceTravelled ?? 0;
  ctrl.footfalls = 0;
  ctrl.grounded = true;
  vitals.health = p.health;
  vitals.dead = false;
  if (vitals.coreC !== undefined) {
    vitals.coreC = p.coreC ?? 37;
    vitals.hunger = p.hunger ?? 100;
    vitals.stamina = p.stamina ?? 100;
    vitals.wetness = p.wetness ?? 0;
  }

  inventory.slots = p.inventory.slots.map((s) => ({ item: s.item, count: s.count }));
  inventory.equipped = Math.min(p.inventory.equipped, Math.max(0, inventory.slots.length - 1));
  inventory.changed();

  onPlayerMoved?.(ctrl.position);

  // ── world diffs ──
  // Emptied and cleared sites go in BEFORE anything streams, so the spawners
  // never briefly repopulate somewhere the player already looted.
  for (const k of data.world.lootTaken) pickups.taken.add(k);
  for (const k of data.world.creatureSitesCleared) wildlife.clearedSites.add(k);

  for (const a of data.world.arrows) {
    projectiles.restoreLanded(a.t, a.p, a.q, a.s);
  }
  for (const d of data.world.dropped) {
    pickups.restoreDrop(d.item, d.count, d.p);
  }
  ctx.fires?.restore(data.world.fires);

  return true;
}
