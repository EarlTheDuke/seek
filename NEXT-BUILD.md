# Next build list

Asked for on 2026-08-07, after the first six-model run. **Nothing here is
started.** Each item says what already exists so the next session does not have
to go and find out — three of these are closer to done than they look, and one
is mostly built already.

Ordered by what unlocks what, not by what was asked first.

---

## 1. GOBLINS IN DAYLIGHT — at minimum, make them run

**The ask:** goblins are wrong in the day. They should at least flee.

**Where it lives:** `src/creatures/registry.js:783`. The goblin already has
everything needed — `speeds.flee: 7.6`, `behaviour: 'pack'`, and a morale system
the comment on `hitPoints: 34` says exists specifically so a pack is not "simply
a wall of hit points". There is a `daylightFloor: 0.12` in the same file and a
`sunAltitude` already threaded into `worldCtx` every tick in `SimWorld.step`, so
the light level is available where the decision would be made.

**THE DAYLIGHT TERM ALREADY EXISTS — this is a posture problem, not a courage
one.** `morale.daylightFloor: 0.12` multiplies their nerve down hard, and
`commitAt` is 0.5, so a pack at noon mathematically CANNOT reach the threshold
to attack. The comment says so outright: *"no number of goblins fights at
noon"*. Confirmed live — a player stood next to goblins in daylight and was
ignored.

So they are already fully suppressed by day. What is missing is what they do
INSTEAD: nothing. They stand about looking like a bug. `breakAt: 0.18` and
`speeds.flee: 7.6` are both there; a floor of 0.12 sits below breakAt already,
which suggests the rout path exists and simply is not reached, or is reached and
does not produce visible flight.

**BOTH ARMS NOW CONFIRMED IN PLAY, which narrows this to one thing.** Same
player, same session: stood among goblins in daylight and was ignored, went out
at night and was attacked. So the morale system is working end to end and the
daylight suppression is doing exactly what it was written to do.

That removes "goblins are broken" from the list entirely. What is left is
strictly a POSTURE bug: a pack that has decided not to fight has no behaviour
for it, so it mills about next to you looking like an AI that has crashed. The
courage maths is right; the animation of cowardice is missing.

**Shape:** find why a goblin below `breakAt` in daylight does not run, rather
than adding a second daylight rule beside the one already there. Nothing about
the thresholds needs touching — do not retune `daylightFloor`, `commitAt` or
`breakAt`, all three are demonstrably correct.

**AND THE SECOND REASON IT LOOKED PASSIVE, which is not about daylight at all:**
`countOpposition` counts every player within `cohesionRange` (34 m), and
`morale.oddsWeight` is 0.6. With six agents wandering near the human, a small
pack was reading seven-against-three and refusing the fight on numbers alone.
Both effects were live at once. A fix aimed only at daylight will still look
broken in a crowd.

**Watch for:** they hunt in packs and crowd (`personalSpace: 1.5`). A flee rule
that fires per-individual will scatter a pack into six separate chases and look
worse than the current behaviour, not better. The pack should break together.

**Prove it with:** `dangercheck` is the existing home. Assert an OUTCOME — a
goblin that starts within charge range at noon ends the tick further away, and
the same goblin at midnight ends it closer.

---

## 2. GOLD — an item with no use is not a currency

**The ask:** goblins and trolls drop gold; add gold to the game.

**Where it lives:** `src/items/registry.js` has no notion of value, price or
currency at all — checked. `SimWorld.onCreatureHit` already rolls loot on the
server and is the one place a carcass turns into items, so the drop hook exists.

**The real question is not the drop, it is the sink.** Gold that only piles up
is a score, not a currency, and a score changes nobody's behaviour. This item is
therefore **blocked behind item 3** in usefulness, even though it is buildable
on its own: until gold buys something from somebody, a hoarder and a spendthrift
behave identically — which is the same trap the roster's own notes flag about
scarcity and character.

**Shape:** one item id, a weight, a stack size, a drop table entry on goblin and
troll. Do it in the same commit as trading or accept that it does nothing yet
and say so.

---

## 3. TRADING, PLAYER TO PLAYER

**The ask:** add trading play-to-play.

**Where it lives:** nothing exists. `src/items/inventory.js` can drop a stack
(`:143`) and that is the whole of item movement — there is no give, no transfer,
no offer.

**This is the one that makes the personas mean something.** The roster is full
of characters written around exchange — a hoarder who "will trade for meat", a
generous soul "slow to notice she is being used", a liar. None of them can
currently trade anything with anyone, so three of six characters have no way to
express themselves. Of everything on this list, this unlocks the most.

**Shape, in rising order of cost:**
- **Give** — one-way, no negotiation. Almost free, and it already makes generous
  and hoarding visibly different.
- **Offer/accept** — a two-sided proposal on the wire, which needs new message
  types and an agent verb.
- **Price** — needs gold (item 2) and something worth arguing about.

**Do `give` first.** It is a fraction of the work and it turns four written
characters into observable behaviour immediately.

**The agents need a verb.** `GOAL_IDS` in `src/minds/goals.js` is a closed list
and a model cannot invent an action — so trading is invisible to every mind
until a verb is added there and described in the system prompt.

---

## 4. PvP DAMAGE — ALREADY BUILT, and worth knowing before anyone builds it again

**The ask:** add PvP damage between players, in future.

**It exists.** `SimWorld.canHarm` (`src/sim/world.js:669`) is a complete rule,
`playerHitTest` (`:325`) does the geometry, arrows already resolve against other
players, and a refusal comes back as a `glance` event with a reason. `shotcheck`
covers it end to end.

The rule is more interesting than a toggle: party members never hurt each other,
and between strangers it depends on **where you are standing** — off in settled
country, on out in the strange country, keyed to `placeStrangeness`. Danger from
people rises with the same gradient as danger from things.

**So this item is not "build PvP", it is "turn it on and see".** The knobs are
`rules.pvp`, `rules.pvpEverywhere` and `rules.pvpAboveStrangeness`, defaulted in
`SOCIAL.defaults`. Two things genuinely are missing:

- **No agent has a verb for attacking a person.** `hunt` takes a quarry, and a
  player is not quarry. A mind cannot currently choose to shoot someone.
- **Nothing tells a mind it was shot BY someone**, as opposed to hurt. Until it
  does, retaliation is impossible and a duel cannot happen.

---

## Ordering

```
give (3a)  ──▶ gold (2) ──▶ price/trade (3c)
                    ▲
goblin daylight (1) │  independent, ship any time
                    │
PvP verbs (4) ──────┘  needs a goal verb, same as trading does
```

**`give` first**, because it is small and it makes four of the six written
characters observable. **Goblin daylight** any time — it is self-contained and
it is a real complaint from play. **Gold** with or just after trading, never
before. **PvP** is a configuration question and two missing verbs, not a build.

---

## And the one from the data, which is not on the ask list

The first six-model run produced **zero arrows from five models across 128
decisions** while the scripted control loosed 34 and killed twice. Whatever gets
built next, that is the number that says the models are not really playing yet.
See `PLAYTEST-2026-08-07.md`.
