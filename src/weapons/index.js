// ── weapons/index.js ────────────────────────────────────────────────────────
// Maps a registry entry's `behaviour` string to its class, and owns the single
// "what is currently in the player's hands" instance.
//
// Adding a weapon: write the class, add one line to BEHAVIOURS. Nothing else in
// the codebase needs to learn about it.

import { Bow } from './bow.js';

const BEHAVIOURS = {
  bow: Bow,
  // crossbow: Crossbow,
  // sling: Sling,
};

export class WeaponHost {
  constructor(ctx) {
    this.ctx = ctx;
    this.current = null;
    this.currentId = null;
    this.triggerHeld = false;
  }

  /** Called whenever the equipped slot changes. */
  sync(inventory) {
    const def = inventory.equippedItem;
    const id = def?.id ?? null;
    if (id === this.currentId) return false;

    this.current?.onUnequip();
    this.current = null;
    this.currentId = id;

    const Cls = def && def.kind === 'weapon' ? BEHAVIOURS[def.behaviour] : null;
    if (Cls) {
      this.current = new Cls(def, this.ctx);
      this.current.onEquip();
      // Carry a held trigger across a weapon swap rather than dropping it.
      if (this.triggerHeld) this.current.beginPrimary();
    }
    return true;
  }

  beginPrimary() {
    this.triggerHeld = true;
    this.current?.beginPrimary();
  }

  endPrimary() {
    this.triggerHeld = false;
    this.current?.endPrimary();
  }

  cancel() {
    this.triggerHeld = false;
    this.current?.cancel?.();
  }

  update(dt) {
    this.current?.update(dt);
  }

  getState() {
    return this.current?.getState() ?? null;
  }

  get moveScale() {
    return this.current?.moveScale ?? 1;
  }

  get fovOffset() {
    return this.current?.fovOffset ?? 0;
  }

  get spreadHint() {
    return this.current?.spreadHint ?? 0;
  }
}
