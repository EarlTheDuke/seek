# PLAN — hit zones and the cloak, and what got built 2026-08-18

Ben: "can we have hit zones for PVP so a head shot is like x3 the damage or
something? Cloak should add double the hit points maybe." Both planned here,
both built the same evening. The follow-ups he added — the cloak changing how
a player LOOKS, and a real draw animation — are in TODO.md (arc 5), not here.

## What already existed

Creatures have had hit zones all along: `Creature.zoneAt(worldY)` buckets an
impact by height and `applyDamage` takes the zone. PLAYERS never got the same
courtesy — every arrow into a person dealt flat damage wherever it landed.
The impact point was always available (`_probe`, the exact position on the
body the segment test found); nothing read its height. So this is not a new
system — it is the creature pattern, finally applied to people.

## Hit zones (built)

- One boundary, stated in config (`COMBAT.headshotAbove`, 1.5 m): an impact
  at or above 1.5 m up a 1.8 m body — head and throat — is a **head shot,
  ×3** (`COMBAT.headshotMultiplier`). Everything below is the body, ×1.
- Two zones only, on purpose. A leg/arm system needs an armature the models
  do not have; a head line needs one number. Level close-range shots fly at
  eye height and eyes are on the head — a flat shot that is not dodged IS a
  head shot, for the minds exactly as for Jack. Arc drop at range naturally
  lands arrows lower, so distance makes head shots rare by physics, not by
  rule.
- The `hit` event now carries `zone`, so the chat column can say HEADSHOT,
  a mind can remember it was taken in the head, and a session report can
  count marksmanship.

## The cloak (built)

- "Double the hit points" is implemented as **incoming arrow damage halved**
  (`COMBAT.cloakDamageFactor`, 0.5) while a cloak is carried — the identical
  arithmetic (you survive twice the arrows), with no max-health plumbing, no
  heal-rate questions, no HUD change.
- CARRIED counts, not worn: that is the cloak's own convention already — its
  warmth reads "degrees added while carried". One rule for both effects.
- It halves AFTER the zone multiplier: a head shot through a cloak is ×1.5 —
  the cloak softens everything and excuses nothing.
- The `hit` event carries `cloaked`, so both ends can say the cloak took the
  worst of it.

## Order of application, stated once

    dealt = base × (head ? 3 : 1) × (cloaked ? 0.5 : 1)

`playerStrikeZone` and `playerDamage` are exported pure functions in
world.js — zonecheck holds the table (head ×3, body ×1, cloak halves each,
cloaked head shot = 1.5×) and the socket regressions ride shotcheck and
duelcheck, which exercise the one gate every player arrow passes through.

## Balance notes, for the next session that touches this

- 4.20-seat duels at close range will see more one-shot kills (eye-line =
  head). If matches turn into instant deletes, the knob is the boundary
  (raise 1.5 → 1.6) or the multiplier — both one number in COMBAT.
- The cloak costs 2 hides and warmth already made it worth crafting; now it
  is armour too. If everyone cloaks always, give arrows a chance to RUIN the
  cloak on a body hit — a real tradeoff, one event, later.
- Creature zones and player zones now rhyme; a future pass could unify the
  damage math into one table.
