# The list, 2026-08-09

Everything outstanding, in one place. Sources: the two computer-use playtest
reports, the live two-mind run, and what's left of `IDEAS.md` / `FIX-PLAN.md`.

**Next up, agreed:** give/receive wiring, then the death loop.

---

## 1. Blocking — a run currently lasts about ninety seconds

### 1a. There is no way to hand anything to another player † **[M]**
The protocol has `give`, `offer` and `accept`. The **agents use them** — 29 gifts
in the current run. **The human client is wired to none of them**; the only
"offer" in the whole client offers food to your pet.

A playtester tried to pay two agents for help and could only drop eighteen
branches on the grass at their feet. Neither picked any up, and Eachann kept
asking for the nine branches he was standing on. **An agent that can bargain but
cannot receive will deadlock for ever, and both did.**

Two halves, and both are needed:
- **A player can give.** Look at someone, press a key, hand over the held stack
  (or half of it — the drop split already knows how).
- **An agent can take what is dropped.** Dropped loot now ships on the wire
  (`lo`) and agents can `gather` it by name, so this is close — but nothing
  tells a mind that a pile at its feet is *for it*.

### 1b. The death loop † **[S]**
Three facts that compound:
- **Hunger is not reset on respawn.** You wake starving.
- **Arrows are lost on death.** You wake unarmed.
- So you die again in about ninety seconds. The tester went round eight times.

Death should cost something — but not *everything*, and not in a way that makes
the next life unwinnable. Reset hunger to survivable, and leave the quiver
alone, or drop it as a recoverable pile where you fell (which is the more
interesting answer and uses `lo`).

### 1c. Arrows desync between client and server **[M]**
The HUD says twelve while the server count falls to zero; you fire an empty bow
at a full-looking quiver. Reloading resets the server to twelve.

Same family as the position drift, and the same shape of fix: **the server owns
the count and the client should take its word.** `me` already carries health and
core temperature; the pack belongs beside them.

---

## 2. The nouns are open while the verbs are closed † **[M]**

Models keep bargaining for things that cannot exist:

```
"got feathers or flint?"      flint and feathers are not items
"anyone trading flint?"        …so the trade can never settle
"meet me at the Black Moss"    a place 8.7 km from anywhere
```

`GOAL_IDS` is a closed vocabulary and a model cannot invent a verb. `offerItem`,
`offerWant`, `giveItem` and `place` are **free strings**. So a mind can name a
price in a currency the world has never heard of and then hold out for it — and
Eachann did, for most of an hour.

Fix: tell the mind what exists. A short item list and the nearby place names in
the prompt, and a refusal that names the problem — *"there is no such thing as
flint"* — through the outcome channel that already exists.

---

## 3. The torch — Ben's list **[M]**

Currently: 1.35 intensity at 11 m, 300 s, and it dies when you stow it.

- **Much brighter.** "I can hardly even see it." It is currently a candle next
  to a campfire's 26 m. It should read as a light you could travel by.
- **Thirty minutes**, not five.
- **A dropped torch keeps burning** — lighting the ground where it lies, and
  visible to walk back to and pick up.

That last one is the interesting one: a torch you can put down becomes a
*marker*. You can light a path, mark a cache, or leave one burning at a meeting
place — which is the first thing in this game that would let two minds agree on
a spot without either of them being there.

---

## 4. Discoverability — the tester's own words

- **Crafting is the worst hole.** `bestAvailable` picks one recipe and there is
  no way to reach the others. At a fire, `F` bound a torch every time. Capped
  the torch at two, but that is a patch: **the BUILD menu is a good chooser and
  the fire needs the same widget.** † **[M]**
- **Freezing to death has almost no feedback.** The warmth bar is on screen and
  nothing connects it to the health draining away. **[S]**
- **Nothing hints that goblins are nocturnal** or that they cluster near caves.
  The tester only found them by reading the source. **[S]**
- **`B` and `Shift+B` open the same chooser**, so the documented distinction is
  fiction. **[S]**
- **The say box placeholder** still reads "there is a troll on the ridge — keep
  back and shoot it". **[S]**
- **One item, four names**: `wood` internally, "BRANCH" on the hotbar, "8
  branch" in the pickup message, "3 branches" in a build cost. **[S]**

---

## 5. World and balance

### 5z † Deadfall never grows back **[S]**
`Pickups.taken` is a Set with the comment `// loot keys already collected —
never come back`, and it means it: every branch picked up is gone for the
session. Trees regrow in 30 game hours and quarried rock does too; the deadfall
lying between them does not.

That was survivable when a fire cost one branch. It is not now that a fire costs
ten — the near ground gets stripped permanently and the glen only ever gets
poorer. In the melee run, eight bodies had gathered so hard that one was
carrying FIFTY branches while the wood on the ground around them was gone for
good.

The mechanism already exists: `Harvest.taken` is a Map of key -> the hour it
comes back. Deadfall wants the same treatment, which turns the glen from
depleting into seasonal — which is both what a person would expect of fallen
wood and what makes a camp somewhere sustainable.

### 5y †† A ROSTER ENTRY CAN SILENTLY SCRIPT A SEAT **[S]**
Fingal ran the whole melee at 0 answered / 43 failed on
`http 400 — This model does not support the effort parameter`, so a paid seat
was the scripted brain for an hour and the board's model column still said
claude-haiku-4-5.

The cause was mine and providers.js had already written the warning: "`low`
unless told otherwise. NULL OMITS IT ENTIRELY, which is required for the older
models: `output_config.effort` is rejected by Haiku 4.5 and Sonnet 4.5. Set
`effort: null` in a roster entry for those." I wrote the roster without it.

Two fixes, and the second matters more: set `effort: null` on Haiku entries, AND
make the provider RETRY WITHOUT the parameter when a vendor rejects it. A
documented footgun that every roster author must remember is a footgun that will
be stepped on again — `keycheck` cannot catch this because it sends no prompt.



- **`maxAlive: 26`** — goblins fill the cap and there is no room for a troll.
  Two of three nights had nothing bigger available. **[S]**
- **A troll is 420 hp** against a 26-damage arrow. That is five clean head shots
  inside one night with twelve arrows, and it is why nobody has killed one. Give
  it a reason to be killable by three people rather than impossible for one. **[M]**
- **"Something is wrong with this ground"** — a fall-through that cost the
  tester the one troll he had closed on. **[S]**
- **Fire spam is better but not gone**: 97 fires in 252 minutes. **[S]**

---

## 6. Instruments — before any benchmarking

- **An append-only event log of outcomes.** Five separate defects have come from
  the board being used as an instrument when it is a dashboard. † **[M]**
- **Per-seat model share, prominently.** A seat below ~80% answered is measuring
  the scripted fallback, not the model. Kimi is at 55%. **[S]**
- **Nothing records whether one mind ever saw another.** **[S]**
- **A score that survives contact.** `D1` was rewritten once already when
  survival turned out to be world-driven (r = 0.686 between two very different
  minds). **[M]**

---

## 7. The setup screen † **[L]**

Unchanged from `IDEAS.md`: a local web page to pick models, seats, characters,
cadence and world settings, with a live cost estimate and saved named setups.
Still the thing that stops me being the bottleneck on your own experiments.

---

## Done since this list was last written

The 140 m blindness · silent verb refusals · `sight` beyond bow range · loot on
the wire · the ten-branch fire and the tree yield to match · the memory split and
importance · action feedback · the standing plan and notebook · speech as a
channel · partial drop · the torch · pointer-lock recovery · the arrow-damage
readout · position reconciliation · the frozen-intent death crash · the missing
`NET` import and `importcheck`.
