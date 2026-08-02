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
    // What is actually ON you, as opposed to in your pack.
    //
    // Clothing used to insulate from inside the bag, which is tidy to code and
    // nonsense to play: you stitch a cloak and nothing happens, because the
    // thing that changed was a number you cannot see. Wearing it is an act.
    this.worn = new Set();
    this.onChange = null; // set by the HUD
  }

  /** Is this item on your back right now? */
  isWorn(id) {
    return this.worn.has(id);
  }

  /**
   * Put something on or take it off. Returns what happened, so the caller can
   * say so — a toggle that reports nothing is a toggle you cannot trust.
   */
  toggleWorn(id) {
    const def = getItem(id);
    if (!def || def.kind !== 'clothing') return { ok: false, why: 'not something you can wear' };
    if (this.worn.has(id)) {
      this.worn.delete(id);
      this.changed();
      return { ok: true, wearing: false, name: def.name };
    }
    if (this.countOf(id) < 1) return { ok: false, why: `you have no ${def.name.toLowerCase()}` };
    this.worn.add(id);
    this.changed();
    return { ok: true, wearing: true, name: def.name };
  }

  /** Everything worn, as ids. */
  get wornItems() {
    return [...this.worn].filter((id) => this.countOf(id) > 0);
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
        // You cannot still be wearing something you no longer have. Dropping a
        // cloak you were wearing must actually take it off, or the insulation
        // outlives the garment.
        if (this.countOf(id) === 0) this.worn.delete(id);
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
