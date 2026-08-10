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

  /**
   * Take the server's word for what you are carrying.
   *
   * ── WHY THIS EXISTS ──
   *
   * The pack was the last thing in the game that two machines both believed
   * they owned, and they disagreed constantly. A playtester's account of it:
   *
   *   - He fletched 36 arrows at a fire. The server's view of him stayed
   *     `{bow: 1}` — the browser called `craft` on its own inventory and never
   *     told anybody.
   *   - Ground pickups never reached the server either.
   *   - Then he died. Death zeroes the SERVER's copy of your ammo, while the
   *     browser cheerfully restored twelve arrows from its own save file — so
   *     he spent the rest of the session firing a full-looking quiver of
   *     arrows that did not exist and wondering why nothing was dying.
   *
   *   > The only reliable fix I found was rejoining under a different name,
   *   > which hands you a fresh, properly synced kit.
   *
   * `me.iv` has been in every snapshot for as long as `me.h` has. Nobody read
   * it. So: the server owns the pack while you are connected, exactly as it
   * already owns your health, your temperature and your position — and for the
   * same reason, which is that it is the copy that the world acts upon.
   *
   * ── WHAT IT PRESERVES ──
   *
   * The server sends `{id: count}` and nothing about arrangement, so slot
   * ORDER is ours. What must survive a reconcile is what the player has their
   * hand on: the equipped item is restored BY ID rather than by index, because
   * an index into a rebuilt list points at whatever happens to be there.
   * Losing your bow mid-draw because a branch stacked differently is the kind
   * of thing that would send us straight back to distrusting the server.
   *
   * Returns true if anything actually changed, so a caller can stay quiet
   * five times a second when nothing has.
   */
  applyRemote(counts) {
    if (!counts || typeof counts !== 'object') return false;

    // Cheap and order-independent, so a reshuffle that carries the same goods
    // does not read as a change and churn the HUD twenty times a second.
    const signature = (map) => Object.entries(map)
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, n]) => `${id}:${n}`)
      .join(',');

    const mine = {};
    for (const s of this.slots) mine[s.item] = (mine[s.item] ?? 0) + s.count;
    if (signature(mine) === signature(counts)) return false;

    const heldId = this.equippedSlot?.item ?? null;

    this.slots = [];
    // Rebuilt through `add` so stack limits are the registry's business and
    // not restated here. Ids the registry does not know are dropped rather
    // than trusted: a bad id from the wire must not become an undrawable slot.
    for (const [id, n] of Object.entries(counts)) {
      if (n > 0 && getItem(id)) this.add(id, n);
    }

    // Your hand, by id. Falls back to the first slot rather than to an index
    // that may now mean something else entirely.
    const at = heldId ? this.slots.findIndex((s) => s.item === heldId) : -1;
    this.equipped = at >= 0 ? at : 0;

    // You cannot wear what you are no longer carrying.
    for (const id of [...this.worn]) if (!this.countOf(id)) this.worn.delete(id);

    this.changed();
    return true;
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

    // ── WHAT A PERSON CAN ACTUALLY CARRY ──
    //
    // There was no limit at all. `stack` bounded a SLOT and `add` made new
    // slots for ever, so a body could hold any number of anything — and one
    // did: Morag finished a measured hour with 205 BRANCHES, twenty fires'
    // worth, having spent the hour picking up wood nobody needed.
    //
    // The cost was not the number, it was what it did to every decision in the
    // game. Across that hour, `pick up what is lying about` was 32 per cent of
    // all decisions and `gather` was 334 of 471 deeds. The most-chosen action
    // in this world was collecting things that had no use, because collecting
    // was free and there was nowhere for it to stop.
    //
    // It is also why the economy read so oddly. What they traded FOR was
    // arrows, venison and hides; what they paid WITH was wood. Wood was the
    // currency precisely because it was worthless — everybody had unlimited
    // amounts. A cap is what gives a branch a price.
    //
    // Per item rather than a total weight: a hunter carrying sixty arrows and
    // no food is a different and legible kind of body from one carrying twelve
    // of everything, and one number per line in the registry is a knob anybody
    // can turn without reading this file.
    const cap = def.carry;
    if (cap) {
      const room = cap - this.countOf(id);
      if (room <= 0) return 0;
      count = Math.min(count, room);
    }

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
  /**
   * Take some of what is equipped, for dropping.
   *
   * @param {number|'half'|'all'} [want=1]
   *
   * IT USED TO TAKE THE WHOLE STACK FOR AMMO. Ben: "what if i have 20 arrows
   * but i want to only drop 10?" — he could not, because `kind === 'ammo'`
   * meant one press of Q put all twenty on the ground. Every other item dropped
   * singly, so the one thing you carry in quantity was the one thing you could
   * not divide.
   *
   * Defaults to ONE, which is what every other game means by "drop", and what
   * the non-ammo path already did. `'half'` rounds UP so a stack of one still
   * moves rather than rounding to nothing.
   */
  takeEquipped(want = 1) {
    const s = this.equippedSlot;
    if (!s) return null;
    const id = s.item;
    const have = s.count;
    const count = want === 'all' ? have
      : want === 'half' ? Math.max(1, Math.ceil(have / 2))
      : Math.max(1, Math.min(have, Math.floor(want)));
    this.remove(id, count);
    return { item: id, count };
  }
}
