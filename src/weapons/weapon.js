// ── weapon.js ───────────────────────────────────────────────────────────────
// The contract every weapon implements.
//
// Everything outside this folder — input, HUD, viewmodel, movement — talks to
// weapons only through these members. A crossbow, a sling or a thrown spear can
// all be dropped in as a sibling class without any of those systems knowing.

export class Weapon {
  /**
   * @param {object} def  its entry in the item registry
   * @param {object} ctx  { camera, controller, inventory, projectiles, audio, rand }
   */
  constructor(def, ctx) {
    this.def = def;
    this.ctx = ctx;
  }

  onEquip() {}
  onUnequip() {}

  /** Trigger pressed / released. */
  beginPrimary() {}
  endPrimary() {}

  update(_dt) {}

  /**
   * Everything the viewmodel and HUD need, in one object so neither has to
   * know which weapon it is looking at.
   * @returns {{charge:number, ready:boolean, ammo:number, note:string|null}}
   */
  getState() {
    return { charge: 0, ready: true, ammo: 0, note: null };
  }

  /** Movement speed multiplier — a drawn bow should slow you down. */
  get moveScale() {
    return 1;
  }

  /** Degrees of FOV change, for a subtle "focusing" pull while aiming. */
  get fovOffset() {
    return 0;
  }

  /** How much the crosshair should open up, 0..1. */
  get spreadHint() {
    return 0;
  }
}
