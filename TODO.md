# The list, 2026-08-09

Everything outstanding, in one place, in the order it is worth doing. Sources:
three computer-use playtest reports, three instrumented melee hours (see
[runs/](runs/README.md)), and what is left of `IDEAS.md` / `FIX-PLAN.md`.

**Agreed with Ben, 2026-08-09: Tier 1 first and alone, then work down the tiers
over time until it is all done.**

Sizes: **[S]** an afternoon · **[M]** a day · **[L]** more.

---

# TIER 0 — what two live runs proved, 2026-08-11 and 2026-08-12

**Added after the first runs in which minds actually fed themselves.** Everything
here is quoted from a run, not reasoned from the code. Ordered by what moves arc
1 (*minds worth watching*) and arc 2 (*a world a human can read*) soonest per
hour spent. See [runs/GROK46-2026-08-12.md](runs/GROK46-2026-08-12.md) and
[runs/FOODTEST-2026-08-11.md](runs/FOODTEST-2026-08-11.md).

**The one-line summary of both runs: the food chain works, and the ARROW chain
does not.** Every starving seat in both runs was a seat that could not shoot.

### 0a. There is no verb for MAKING anything **[S]** — arc 1
`GOAL_IDS` has fifteen verbs and none of them is `craft`. A mind holding wood and
no arrows cannot say *"make arrows"*, and a mind holding raw venison at a fire
cannot say *"cook"*. **This is the `eat` bug exactly** — a channel that does not
exist, which reads from outside as a model too stupid to feed itself.
*Quoted from the run:* Fingal asked the group out loud, twice, *"Who has arrows?
Need arrows by dawn"* — while carrying six wood, which is three fletches.

### 0b. Fletching is gated behind a fire it does not need **[S]** — arc 1
`fletch_arrows` is `station: none` and the SERVER honours that
(`recipe.requires !== 'fire' || …` in world.js). But `i.craft` is assigned in
exactly ONE place in agent.js — inside the `if (fire && fire.d <= fireReach)`
branch of `upkeep`. **So a body only ever fletches while standing at a fire it
does not require.** The world permits it; the body can never ask. One `if`.

### 0c. A starving body will not spend fire-wood on arrows **[S]** — arc 1
`AGENTS.spareWood: 14` protects ten branches for a fire before it will fletch —
*"a fire you cannot light is worse than a shot you cannot take, because the cold
does not miss."* Sound, until you starve: no arrows → no kills → no food, while
carrying the cure. Needs a starvation override. Related: **2.5d**.

### 0d. Deadfall never grows back, and now it matters **[S]** — arc 1, was 4a
With `SCARCE=on` the valley is strip-mined inside an hour and the death spiral
becomes structural rather than behavioural. *Quoted:* Eachann was refused **128
gathers** across ~375 decisions — a third of his run spent asking for wood that
no longer existed. 4b calls scarcity "the dial that makes them social"; without
regrowth it is a dial that makes them dead.

### 0e. The `eat` verb is advertised and almost never used **[S]** — arc 1
Used **once in the project's history** (Seònaid, kimi, 2026-08-12, at food 25 —
above the reflex's raw threshold of 18, so genuinely a decision). Meanwhile
Eachann spent a run at **food 28 holding three raw venison and nine wood**, one
branch short of a fire, with the verb in his prompt the whole time. Not *"the
models can't"* — **"the models don't."** The brief should say *"you are carrying
food you could eat now"* the way `lacking` already says *"no arrows"*.

### 0f. An append-only event log **[M]** — arc 2, was 5b, now urgent
`deeds` is a ring `AGENTS.logSize` (400) deep **per seat**, and it is the only
record. Run 2's transfers rolled off within minutes; the run survives at all only
because board.json was snapshotted to `runs/RUN2-timeline.jsonl` every 45 seconds
from outside the game. **Nothing can be analysed after the fact, and every
downstream thing — the report, a score, the recorder, computer vision — needs a
durable timeline.** Highest-value item in this tier for everything after it.

### 0g. Spend, per seat, live, in the unit that matters **[S]** — arc 2
Reasoning tokens were **not counted at all** until 2026-08-12: xAI reports
`completion_tokens: 23` beside `reasoning_tokens: 1507`, and only the first was
read, under-reporting real spend by ~45%. Fixed. What is still wrong is the
BUDGET: `budgetCalls` caps CALLS, and grok-4.6 costs about **9× per decision**
what grok-4.20-non-reasoning does. Cap spend, and show $/seat on the board while
it runs.

### 0h. A model cannot be told apart from its seat **[M]** — methodology
Runs 1 and 2 reached OPPOSITE verdicts on grok-4.6 (3 kills from 24 answers, then
1 from 135) because each model is pinned to one seat, one persona and one spawn.
**Rotate models across seats between runs** — the roster already carries
everything needed. Without this, no model claim from this project is worth
quoting.

### 0i. They agree to share and then do not **[M]** — arc 1
`offer` is one of the most-reached-for verbs (Ailsa's top goal in run 2), and
transfers are rare and late. Four minds across two vendors agreed a shared hunt
in words — *"camp now, south deer at dawn, we share"* — and executed none of it.
The plan survives in the `plan` field; it does not survive into the next
decision. Related: **2.5g** (`give` does not land at 1 m) and **2c**.

### 0j. Drive the recorder **[M]** — arc 3
`?watch=1` gives a camera that flies and is never corrected, and `capture()`
writes frames. Nothing drives them. `board.json` is ground truth — every mind's
position, goal and reason — so a recorder or a vision experiment has something to
check itself against. Blocked on **0f** for anything after the fact.

---

# TIER 1 — the game lies about outcomes  ✅ DONE 2026-08-09

All three landed and all three were verified in a live browser against a live
server, not only in checks — which mattered, because the browser found two bugs
in my own fixes that the checks and the build could not see.

- **1a. Nothing is announced until the server confirms it.** The client's own
  raycast no longer claims a hit; the honest lines (`wound`, `kill`, `glance`
  with its reason) already come from the server. A handover now says
  *"offering 12 arrows to Wanderer..."* and only *"— done"* when the `gift`
  event comes back. And `gift`, `trade`, `offer` and `nosuch` are read by the
  browser at last, so there is something true to say instead of a guess.
  `honestcheck`, 11.
- **1b. The server owns the pack.** Crafting and pickups go through the intent;
  `me.iv` is read and reconciled, keeping what is in your hand by id.
  `packcheck`, 12.
- **1c. A frame loop that cannot die**, cannot stop silently, and keeps running
  in a hidden tab — including a tab that was hidden before the page loaded, so
  `visibilitychange` never fires. `loopcheck`, 17.

**Live proof of 1a, which is also a live demo of 2a below.** Chasing the
wandering bot with the give key, fourteen presses: three *"offering 12 arrows
to Wanderer..."* and eleven *"nobody close enough"*, and **no `— done` ever
arrived** because the server never landed one. Both packs unchanged. That is
the playtester's *"20 branches to Coinneach, five times, nothing left my pack"*
— now saying so.

---

# TIER 2 — trade is nearly wired

### 2a. Agents do not stop when you hail them  ✅ DONE 2026-08-09

Being spoken to within `SOCIAL.hailRange` (16 m) now stops a body for six
seconds and turns it to face the speaker, and a standing offer does the same to
the person it was made to. A reflex, not a decision: the cadences run 20-75
seconds and a body at 4 m/s is eighty metres away by the time a model has
answered. Every seat gets it, including the scripted control.

It declines for a body that is genuinely in trouble, for one already walking
towards you (`give`/`offer`/`accept`/`approach`/`follow` — both of us waiting
politely is the deadlock this ends, not starts), and for `avoid`.

**Live proof, two real agents on a real server:** the caller walked at her and
spoke from inside earshot; she stood still for 89 consecutive samples (~4.5 s)
and the caller closed **24.9 m → 5.5 m** during it. `hailcheck`, 20.

Two bugs of mine on the way, both of which passed every assertion before the
game disagreed. The reflex was first placed after `upkeep`, which does not only
handle instant emergencies but WALKS TO A FIRE, returning true on every tick of
that walk — so a cold or hungry agent never reached it. Then the carve-out
reused `AGENTS.eatBelow` (45) and `warmBelow`, which are maintenance lines
rather than emergencies, and an agent twenty minutes in is below them almost
permanently, which swallowed the feature again. `hailcheck` now asserts the
source order, and `SOCIAL.tooHungryToTalk` / `tooColdToTalk` name the real ones.

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

# TIER 2.5 — from the third playtest  ✅ MOSTLY DONE 2026-08-09 evening

**Done.**

- **The order parser was reading ordinary talk as commands.** 156 halts against
  16 troll orders in one session: "hold on, the troll is to the north", "wait
  for me" and "I will stop it with arrows" all froze the whole band, and "shoot
  from the ridge" sent eight bodies after a preposition. An order must now OPEN
  the sentence, may be addressed to one body by name (the name was never read,
  so "Ailsa, follow me" was obeyed by all eight), and may only name a creature
  this world has. `ordercheck2`, 13.
- **An order you can see taken.** The agent answers out loud — "right,
  following you" — and the board says the mode and the last order. He had to
  read `agent.js` to guess, and guessed wrong. Asserted free of feedback loops.
- **The offer spiral**, which was mine: 159 offers, zero trades, everyone frozen
  offering each other things nobody could accept. Offers now lapse, and the hail
  fires once per deal rather than once per packet.
- **`resolveAccept`'s six silent returns** — the last quiet refusal in the game,
  under the verb the whole economy runs through. Now says how short you are, how
  far you walked, or that nobody is there.
- **A refused craft says why**, and a full pack leaves the tree standing. Both
  mine, from the Tier 1 work.
- **The claimed target** — the report's best idea, and the last piece of the
  co-operation. A big quarry under attack enters everybody's brief with the
  choice named: *"Nothing that size goes down to one person. Go and help, or do
  not, but decide."*
- **The troll flinches** on a solid hit, which is what turns a footrace into a
  fight and makes three archers better than one.

**Still open from that report.**

### 2.5c Crafting could take time — and `seconds` currently lies **[S]**  ⚠ partly done
He was wrong about the cause and right that something was wrong. `RECIPES.seconds`
is DEAD DATA — crafting is instant on both sides and that field has never been
read by anything. He read it, believed a craft took ten seconds, and lost an
evening; his branches were actually vanishing into the pack desync, and the
presses were silent because a refused craft said nothing. **Both of those are
fixed, and the field is now labelled** so nobody else loses the time.

What is left is the good idea underneath: a craft that TAKES time, with a
progress bar. The values in `recipes.js` are sensible ones to implement it with.

### 2.5d Starvation has no escalation **[S]**
> Hunger killed me once outright and I never saw it coming. I lost about
> eighty-five health in roughly a minute, dying ten metres from a carcass.

### 2.5e Reloading under the same name desyncs the quiver **[M]**
Still true after the pack fix. Rejoining under a fresh name is the workaround.

### 2.5f The dev server dumps you to the title screen **[S]**
Hot reload cost him his position and kit about six times mid-task.

### 2.5g The give still does not land at 1 m **[M]**
He had Tormod at 1 m and the handover never completed. `resolveGive` needs no
acceptance and should simply land — unchased, and the most valuable thing left
on this list now that every refusal says why.

---

# TIER 2.75 — gold is a decoy, and it is a FORK not a bug

Every seat finished the measured hour with **0 gold** and every trade was
barter. That is not the models failing to use a currency — it is the models
being right.

**Gold has sources and no sink.** Goblins drop 0-3, trolls 8-20, barrows pay
out. Nothing in this world consumes it: no shop, no toll, no smith, no ferry.
`grep` finds two producers and zero consumers. A thing you can only accumulate
is not money, it is a souvenir, and a mind that declines to sell venison for
souvenirs has understood the situation.

It matters more than it looks, because `resolveOffer` already treats a price
nobody names as a price in gold — "I will sell you this venison" becomes an
offer for coin. In a world where coin buys nothing, that manufactures offers
that can never settle. (Since tonight they at least SAY why: *"you are 3 short
of the 3 gold it costs"*.)

**Three ways out, and they are genuinely different games.**

1. **Give it a sink.** Something to buy — a barrow that opens for coin, a smith,
   a toll. Makes gold real, and adds a place in the world that is not a hillside.
2. **Make it the score.** Ben's PvP/king-of-the-hill/tribes work is the obvious
   home: gold as what you are playing FOR, taken off the dead. That turns every
   existing drop into a reason to fight rather than a reason to shrug.
3. **Delete it.** Barter is honest for a world of eight people on a hillside,
   and a currency nobody needs is one more noun for a model to hallucinate about.

**My recommendation: (2), folded into tomorrow's PvP work.** It costs nothing to
build — the drops already exist — and it is the only one of the three that makes
the existing goblins and trolls MORE interesting rather than adding a shop to a
wilderness.

Do not do (1) and (2) both without deciding which the game is about.

---

# TIER 3 — the troll is unmeetable

### 3a. You cannot find one **[M]**
Night-only, on rare high-strangeness steep ground. He saw a troll four times
across three sessions and **never once with an agent nearby**. If troll hunting
is the headline, a player needs a way to find one: a rumour in the agent
chatter, tracks, distant noise, something.

### 3b. `maxAlive: 26` fills with goblins **[S]**
So there is no room for anything bigger. Two of three nights had nothing.

### 3c-i. A troll charges at 7.2 m/s, which is faster than a sprint **[M]**
With 150 m of aggro against 11 m of eyesight — it hunts you by ear. So the
fight is a footrace you are guaranteed to lose:

> Three times I ended a call with the troll at a safe 84-95 m and began the next
> one already dead.

Give it a wind-up, or a slower charge, or both. A bow fight against something
strictly faster than you is not a fight.

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
