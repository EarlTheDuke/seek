// ── inventory.js ────────────────────────────────────────────────────────────
// Slots, stacks and what is currently in your hand.
//
// Deliberately knows nothing about bows, arrows or shooting — it only moves
// {item, count} pairs between slots. Every weapon added later gets equipping,
// hotbar display and dropping for free because none of that logic lives here.

import { getItem } from './registry.js';

export class Inventory {
  constructor(slots = [], equipped = 0) {
    /** @type {{item: string, count: number}[]} */
    this.slots = slots.map((s) => ({ item: s.item, count: s.count }));
    this.equipped = equipped;
    this.onChange = null; // set by the HUD
  }

  changed() {
    this.onChange?.(this);
  }

  get equippedSlot() {
    return this.slots[this.equipped] ?? null;
  }

  get equippedItem() {
    const s = this.equippedSlot;
    return s ? getItem(s.item) : null;
  }

  /** Total count of an item id across every slot. */
  countOf(id) {
    let n = 0;
    for (const s of this.slots) if (s.item === id) n += s.count;
    return n;
  }

  /**
   * Add items, filling existing stacks before opening a new slot.
   * Returns how many actually fitted, so a pickup can leave the remainder in
   * the world rather than silently vanishing it.
   */
  add(id, count = 1) {
    const def = getItem(id);
    if (!def || count <= 0) return 0;
    let left = count;

    for (const s of this.slots) {
      if (s.item !== id || s.count >= def.stack) continue;
      const room = def.stack - s.count;
      const take = Math.min(room, left);
      s.count += take;
      left -= take;
      if (left === 0) break;
    }
    while (left > 0) {
      const take = Math.min(def.stack, left);
      this.slots.push({ item: id, count: take });
      left -= take;
    }

    this.changed();
    return count - left;
  }

  /** Remove up to `count`, returning how many were actually removed. */
  remove(id, count = 1) {
    let left = count;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s.item !== id) continue;
      const take = Math.min(s.count, left);
      s.count -= take;
      left -= take;
      if (s.count === 0) {
        this.slots.splice(i, 1);
        if (this.equipped >= this.slots.length) this.equipped = Math.max(0, this.slots.length - 1);
        else if (i < this.equipped) this.equipped--;
      }
    }
    this.changed();
    return count - left;
  }

  /** Consume one round of a weapon's ammo. */
  consumeAmmo(weaponDef, count = 1) {
    if (!weaponDef?.ammo) return true; // weapon needs no ammo
    return this.remove(weaponDef.ammo, count) === count;
  }

  select(index) {
    if (index < 0 || index >= this.slots.length || index === this.equipped) return false;
    this.equipped = index;
    this.changed();
    return true;
  }

  cycle(dir) {
    if (this.slots.length === 0) return false;
    const n = this.slots.length;
    return this.select((((this.equipped + dir) % n) + n) % n);
  }

  /**
   * Take the equipped stack out for dropping. Ammo drops the whole stack,
   * everything else drops one.
   */
  takeEquipped() {
    const s = this.equippedSlot;
    if (!s) return null;
    const def = getItem(s.item);
    const count = def?.kind === 'ammo' ? s.count : 1;
    const id = s.item;
    this.remove(id, count);
    return { item: id, count };
  }
}
