# The list, 2026-08-09

Everything outstanding, in one place, in the order it is worth doing. Sources:
three computer-use playtest reports, three instrumented melee hours (see
[runs/](runs/README.md)), and what is left of `IDEAS.md` / `FIX-PLAN.md`.

**Agreed with Ben, 2026-08-09: Tier 1 first and alone, then work down the tiers
over time until it is all done.**

Sizes: **[S]** an afternoon · **[M]** a day · **[L]** more.

---

# TIER 1 — the game lies about outcomes

One bug class does most of the damage. Three sessions have now been spent
debugging the game's own reporting instead of playing the game, and **every
future playtest report is unreliable until a toast means something**.

The playtester's own words, and he is right:

> A playtester cannot learn anything in a world that lies to them about whether
> their actions landed; every other bug below took me ten times longer to find
> because of this one.

### 1a. The client announces success the server refused † **[M]**

`main.js:701` toasts `hit — ${result.zone}` from the client's own raycast. The
comment beside it already admits the cost is not known there — the server owns
the arithmetic — so a graze, a mortal hit and **a shot the server threw away
entirely** all print the same line. He got "hit — head" on a goblin at 8 m with
a verified clear arc and the goblin took zero damage.

The give side is worse because it is silent as well as wrong: *"20 branches to
Coinneach"* five times in a row, standing 2 cm away, with nothing ever leaving
the pack.

**Nothing is announced until it arrives in a snapshot.** The client may say what
it ATTEMPTED; only the server may say what happened.

### 1b. The inventory is split between client and server † **[M]**

- Fletching never reaches the server: 36 arrows made at a fire, the server's
  view of him stayed `{bow: 1}`.
- Ground pickups never reach it either.
- Death zeroes the server's copy while the client restores twelve arrows from
  its own save, so you spend the rest of the run firing blanks.

The only recovery he found was **rejoining under a different name**, which hands
you a fresh, properly synced kit. That is a nasty thing to have to discover.

`me.iv` already ships the server's copy of the pack every snapshot. The client
should take its word. (This was on the list as "arrows desync"; it is much
bigger than that.)

### 1c. A single throw in `stepWorld` kills the world for ever † **[M]**

`main.js:3245`:

```js
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  stepWorld(dt);
  requestAnimationFrame(frame);   // <- never reached if stepWorld throws
}
```

Any exception ends the loop with no way back. And `requestAnimationFrame` is
parked in a background tab while the renderer's last image and the server clock
keep running, **so a dead world looks alive**. He had to drive `stepWorld` from
a Web Worker to play at all; `setTimeout` is clamped to a second in a hidden tab
too, so his timing had to move there as well.

Three parts: re-arm rAF whatever happens, say so on screen when the world has
stopped, and keep stepping when hidden.

---

# TIER 2 — trade is nearly wired

### 2a. Agents do not stop when you hail them † **[M]**

`SOCIAL.giveRange` is 3.0 m against a body moving at ~4 m/s that never pauses.
He closed to **0.02 m** and still could not complete a handover. Morag's five
arrows were always "at my fire tonight", and he re-planned before Ben could
arrive.

This is also what is still costing us agent-to-agent trades: run 3 produced
three accepts and only two settled trades, and the loss is the counterparty
walking off between the offer and the answer. **Being hailed should be a reason
to stand still and face the speaker.**

### 2b. A contract, rather than an item **[M]**

"Help me kill this thing and I'll pay you" is the natural shape of the request
and there is no verb for it. Payment on delivery needs an obligation the world
remembers.

### 2c. Nothing tells a mind that a person has gone **[S]**

They talked to Ben for an hour after he left the world — twelve lines, a
standing debt of five arrows, and three separate nights organised around "Ben's
fire". The memory work holds better than expected; the forgetting has not been
built at all.

---

# TIER 3 — the troll is unmeetable

### 3a. You cannot find one **[M]**
Night-only, on rare high-strangeness steep ground. He saw a troll four times
across three sessions and **never once with an agent nearby**. If troll hunting
is the headline, a player needs a way to find one: a rumour in the agent
chatter, tracks, distant noise, something.

### 3b. `maxAlive: 26` fills with goblins **[S]**
So there is no room for anything bigger. Two of three nights had nothing.

### 3c. 420 hp against a 26-damage arrow **[M]**
Five clean head shots inside one night with twelve arrows. Give it a reason to
be killable by three people rather than impossible for one — which is also what
makes it the thing worth hiring help for.

### 3d. The lake respawn drops you inside a goblin warren **[S]**
He died within seconds of waking, three times.

---

# TIER 4 — the world runs down

### 4a. Deadfall never grows back **[S]**
`pickups.js:33` — `this.taken = new Set(); // loot keys already collected —
never come back`. Trees regrow in 30 game hours and quarried rock does too; the
deadfall between them does not. Survivable when a fire cost one branch, not now
that it costs ten. `Harvest.taken` is already a Map of key → the hour it returns;
deadfall wants the same.

### 4b. Scarcity is the dial that makes them social **[S]**
From the runs, and worth holding as a design lever rather than a bug: **an
abundant gatherable is an anti-social force.** Nobody dealt with anybody while
there was enough wood lying about; the branches-for-venison market formed on its
own about eight game hours in, once the ten-branch fire had made wood scarce.

### 4c. Fire spam is better but not gone **[S]**
97 fires in 252 minutes before the cost fix; 21 vs 106 after. Watch it.

### 4d. "Something is wrong with this ground" **[S]**
A fall-through that cost the tester the one troll he had closed on.

---

# TIER 5 — instruments

### 5a. `offer` never calls `did()` **[S]**
So a landed offer cannot appear in `deeds` at all.

### 5b. An append-only event log of outcomes † **[M]**
**Six** defects now have come from the board being used as an instrument when it
is a dashboard. Every count has to be de-duplicated on a natural key by hand
because sampling a dashboard counts how often you looked.

### 5c. A score that survives contact **[M]**
`D1` was rewritten once already when survival turned out to be world-driven
(r = 0.686 between two very different minds).

### 5d. The setup screen † **[L]**
A local page to pick models, seats, characters, cadence and world settings, with
a live cost estimate and saved named setups. Still the thing that stops me being
the bottleneck on your own experiments.

---

# TIER 6 — discoverability, from the testers' own words

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

## Done

**2026-08-09, the melee day** — a roster entry could silently script a paid seat
(Haiku's `effort` 400; the provider now drops the field and retries) · an error
that blamed Kimi for our own token cap (`reply cut off at N tokens`) · counted
prices, so "twelve branches" is a price and not a refusal — seventeen of Morag's
offers had died on that in one hour · **a standing offer a mind can actually
see**, which took `accept` from zero across three hours to three in one · the
`keys.cmd.*` gitignore hole.

**Before that** — the 140 m blindness · silent verb refusals · `sight` beyond bow
range · loot on the wire · the ten-branch fire and the tree yield to match · the
memory split and importance · action feedback · the standing plan and notebook ·
speech as a channel · partial drop · the torch · pointer-lock recovery · the
arrow-damage readout · position reconciliation · the frozen-intent death crash ·
the missing `NET` import and `importcheck` · give/receive wiring · the death
loop · dropped items as shared world state · the chooser at the fire.
