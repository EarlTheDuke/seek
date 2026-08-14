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

### 0a. There is no verb for MAKING anything **[S]** — arc 1 ✅ DONE 2026-08-12
`GOAL_IDS` has fifteen verbs and none of them is `craft`. A mind holding wood and
no arrows cannot say *"make arrows"*, and a mind holding raw venison at a fire
cannot say *"cook"*. **This is the `eat` bug exactly** — a channel that does not
exist, which reads from outside as a model too stupid to feed itself.
*Quoted from the run:* Fingal asked the group out loud, twice, *"Who has arrows?
Need arrows by dawn"* — while carrying six wood, which is three fletches.

### 0b. ~~Fletching is gated behind a fire it does not need~~ **WRONG — I misread the table** ✅ closed 2026-08-12
**EVERY recipe carries `requires: 'fire'`, arrows included.** The diagnostic that
said otherwise printed `r.station` — a field that does not exist on a recipe —
and reported "none" for all six. I shipped a branch for it before `craftcheck`'s
first sentinel caught the mistake. **Kept here rather than deleted, because the
cost of getting started IS the real problem and somebody will rediscover this
and re-fix it.** To arm itself, an unarmed body needs **ten branches for a fire
plus two more to fletch** — a design question about the entry cost of the arrow
economy, not a missing channel. Candidates if it needs solving: a cheaper first
fire, arrows off a carcass, or a `requires: null` recipe that genuinely has no
station. `craftcheck` now asserts the truth so the wrong fix cannot come back.

### 0c. A starving body will not spend fire-wood on arrows **[S]** — arc 1 ✅ DONE 2026-08-12
`AGENTS.spareWood: 14` protects ten branches for a fire before it will fletch —
*"a fire you cannot light is worse than a shot you cannot take, because the cold
does not miss."* Sound, until you starve: no arrows → no kills → no food, while
carrying the cure. Needs a starvation override. Related: **2.5d**.

### 0d. Deadfall never grows back, and now it matters **[S]** — arc 1, was 4a ✅ DONE 2026-08-13
With `SCARCE=on` the valley is strip-mined inside an hour and the death spiral
becomes structural rather than behavioural. *Quoted:* Eachann was refused **128
gathers** across ~375 decisions — a third of his run spent asking for wood that
no longer existed. 4b calls scarcity "the dial that makes them social"; without
regrowth it is a dial that makes them dead.

**DONE.** `Pickups.taken` was a plain `Set` with "never come back" written
beside it; it is now `TakenDeadfall`, a map of key → THE HOUR IT RETURNS, on the
same `STRUCTURES.regrowHours` (30) and the same shape `Harvest` already uses for
trees and rocks — one mechanism, not two. Duck-typed as a Set so every caller,
including `nearestDeadfall(..., taken)`, is untouched. A world that never passes
an hour keeps the old behaviour exactly.

**Fed the MONOTONIC hour** (`world.totalHours`), because `clock.hours` wraps at
24 and a regrow of `hours + 30` off a wrapping clock is a branch that came back
yesterday. `Harvest` carries a note saying this project has been caught by that
clock three times; this was the fifth place that needed it, and `regrowcheck`
now pins it with a taken-at-23 sentinel.

**And the body forgets too.** An agent's private "I already took that" memo was
a Set that never emptied — with wood regrowing, it would keep a body away from
branches standing in front of it. Expired on the agent's own monotonic clock,
never on `this.hours`, which is the wrapping one.

**A bug caught by writing the assertion honestly:** the first cut set
`forgetTakenSeconds: 1800` and guarded it with `>= 600`. At `TIME.dayMinutes` 26,
30 game hours is **1950 real seconds** — so the body would have forgotten 150
seconds BEFORE the wood returned, and since it re-adds the key on arrival that is
a loop, not a one-off. Now 2400, and `regrowcheck` does the conversion rather
than asserting a relationship it never computed.

### 0e. The `eat` verb is advertised and almost never used **[S]** — arc 1 ✅ DONE 2026-08-13
Used **once in the project's history** (Seònaid, kimi, 2026-08-12, at food 25 —
above the reflex's raw threshold of 18, so genuinely a decision). Meanwhile
Eachann spent a run at **food 28 holding three raw venison and nine wood**, one
branch short of a fire, with the verb in his prompt the whole time. Not *"the
models can't"* — **"the models don't."** The brief should say *"you are carrying
food you could eat now"* the way `lacking` already says *"no arrows"*.

**DONE.** `couldEat` — only when hungry (below the reflex's own `eatBelow`, so
the line cannot drift from the behaviour) AND holding something edible. Reads:
*"You are hungry and carrying 3 venisons — \"eat\" would fill you now."* Counted
and worded exactly as the `carrying` line words it; the first cut dropped the
number and read "carrying venisons" two lines under "3 venisons".

### 0k. The brief says what you LACK — it should say what you can MAKE **[S]** — arc 1 ✅ DONE 2026-08-13
**NEW, from the first journal, 2026-08-13.** Fingal chose `craft` twice and was
refused both times because his pack was empty — correctly, and in words, and he
went and got wood on the very next decision, which is the refusal loop working
beautifully. But he should not have had to spend a decision finding out.

The brief already carries **`lacking`** — *"no arrows, you cannot shoot"* — added
because absence from a list is not a fact a model reliably notices, and one mind
hunted for an hour on an empty bow. The same argument applies exactly: a line
saying **"you have the makings of: arrows, a torch"** turns a wasted decision
into a made thing. `canCraft` over `RECIPES` against the pack is the whole
computation, and `recipeNamed('')` already ranks them by need.

Evidence it was worth it: of the first three chosen crafts, ONE produced
anything. The other two were a mind reaching for a verb it had no materials for.

**DONE.** `Agent.makeable()` ranks by the SAME need order `recipeNamed('')` uses
for a bare craft, so the head of the list is literally what a bare craft will
make and the brief cannot disagree with the verb. Rendered as
*"You could make: 4 arrows, torch — a fire must be in reach."* Named by the
OUTPUT, because that is the word `craft` takes; capped at four; and an empty
pack claims nothing rather than listing what it cannot afford — the rule
`lacking` and `full` were both written under. `craftcheck` 26/26 -> 31/31,
including one that the line reaches the TEXT a model reads and not merely the
brief object.

### 0f. An append-only event log **[M]** — arc 2, was 5b ✅ DONE 2026-08-13
`deeds` is a ring `AGENTS.logSize` (400) deep **per seat**, and it is the only
record. Run 2's transfers rolled off within minutes; the run survives at all only
because board.json was snapshotted to `runs/RUN2-timeline.jsonl` every 45 seconds
from outside the game. **Nothing can be analysed after the fact, and every
downstream thing — the report, a score, the recorder, computer vision — needs a
durable timeline.** Highest-value item in this tier for everything after it.

**DONE.** `server/journal.js` — append-only JSONL per run under `runs/`, flushed
as it goes, drained once a second off a monotonic `seq` stamped on every deed and
decision. Each line carries seat AND model; a decision keeps its `why`; a make
and a meal keep `by`, so chosen and reflex stay separable after the fact. A run
killed without a goodbye keeps everything up to that moment, and a reader can
tell a killed run from a finished one. `journalcheck` 17/17.

**And it admits its own holes.** The first assertion written for it — "a burst
bigger than the ring loses nothing" — FAILED, because a ring drain cannot be
lossless when a burst outruns the ring. Rather than soften the claim, the journal
writes a `gap` line saying how many it missed; the check holds it to *15 kept + 5
admitted = 20 accounted for*. Unreachable in practice at 400 deep against a
once-a-second drain, but "cannot happen" is what was said about a stale server
on port 8080.

### 0g. Spend, per seat, live, in the unit that matters **[S]** — arc 2 ✅ DONE 2026-08-13
Reasoning tokens were **not counted at all** until 2026-08-12: xAI reports
`completion_tokens: 23` beside `reasoning_tokens: 1507`, and only the first was
read, under-reporting real spend by ~45%. Fixed. What is still wrong is the
BUDGET: `budgetCalls` caps CALLS, and grok-4.6 costs about **9× per decision**
what grok-4.20-non-reasoning does. Cap spend, and show $/seat on the board while
it runs.

**DONE.** `PRICES` in config — USD per million tokens, in and out, read from
xAI's own `/v1/language-models` and dated. `Budget` now tallies PER MODEL,
prices each seat, and takes `maxUsd`: **`BUDGET_USD=5 npm run agents`**. The
15-second console line and `board.json` both carry the running total and the
per-model split, dearest first, because no invoice can tell you what a run is
costing while it is going.

**An unpriced model is NAMED, never silently costed at zero** — `costOf` returns
null and the line reads `UNPRICED: <model>`. A model priced at genuine zero
(kimi on your own box) is priced, not "unknown"; the two are different facts and
the difference is the whole point.

**The money cap is checked BEFORE a call and paid AFTER it**, so a fleet can
overshoot by at most one call per seat. Said plainly in the code rather than
papered over — the alternative is predicting a reasoning model's cost before
making the call, which is exactly the number you cannot know in advance.
`costcheck` 16/16, including a replay of the 2026-08-12 run shape that prices at
$1.63 against $0.69 — the same numbers reached by hand that day.

### 0h. A model cannot be told apart from its seat **[M]** — methodology ✅ DONE 2026-08-13
Runs 1 and 2 reached OPPOSITE verdicts on grok-4.6 (3 kills from 24 answers, then
1 from 135) because each model is pinned to one seat, one persona and one spawn.
**Rotate models across seats between runs** — the roster already carries
everything needed. Without this, no model claim from this project is worth
quoting.

**DONE.** `ROTATE=1 npm run agents`, implemented as `rotateMinds` in roster.js.
The split it rests on: a **SEAT** is a name, a character and a spawn; a **MIND**
is a provider, a model, and the operating parameters that model needs. Cadence,
timeout and token ceiling travel WITH the mind — grok-4.6 dropped into a
12-second seat is a queue, and a queue is how a good model is made to look
broken. `ROTATE=0` is byte-identical, the same control-arm discipline
`personacheck` holds personas to, and the startup line and journal header both
record the rotation so two runs cannot be confused. `rotatecheck` 21/21.

**It found a real bug on the way in, and only against the REAL roster.** Everything
passed against a hand-built fixture while the live thing was broken: `loadRoster`
fills an absent provider with the string `'scripted'` — truthy — so filtering on
`p.provider` swept the control into the rotation. At `ROTATE=1` Eachann went
scripted and **Iseabail acquired a kimi model**, which would have destroyed the
control arm in every rotated run. A seat has a mind when it NAMES A MODEL.
`rotatecheck` now loads the real file through the real loader.

**How to use it:** run the same roster at `ROTATE=0,1,2,…` and average a model's
score over seats. Nothing before 2026-08-13 was rotated, so every model claim in
`runs/` older than that is about a model-and-seat pair, not a model.

### 0i. They agree to share and then do not **[M]** — arc 1 ✅ DONE 2026-08-13
`offer` is one of the most-reached-for verbs (Ailsa's top goal in run 2), and
transfers are rare and late. Four minds across two vendors agreed a shared hunt
in words — *"camp now, south deer at dawn, we share"* — and executed none of it.
The plan survives in the `plan` field; it does not survive into the next
decision. Related: **2.5g** (`give` does not land at 1 m) and **2c**.

**DONE — and the mechanism was not personality.** A walk to another person takes
longer than a cadence (12-100 s against thirty or forty metres), so an errand
aimed at somebody was routinely replaced before it arrived, BY A MIND WITH NO WAY
OF KNOWING IT WAS HALFWAY THERE. The brief now carries `errand`: *"You are
part-way through something: give venison to Coinneach — about 40 m still to
walk."*

**It does not override the mind.** The body is not pinned and the goal is not
sticky — the mind is told, and may carry on or drop it. Same bargain `outcome`
strikes, and the opposite of making `give` a commitment a mind cannot escape.
Only verbs aimed at a PERSON are announced; `gather` and `hunt` re-resolve to
whatever is nearest and lose nothing by being re-decided.

Both lines are covered by the new **`briefcheck`** (13/13), which also asserts
they are MECHANICS and not strategy — no "should", "must" or "better to" anywhere
in a brief, which is the line `personacheck` exists to hold.

### 0j. Drive the recorder **[M]** — arc 3 ◐ FIRST HALF DONE 2026-08-13
`?watch=1` gives a camera that flies and is never corrected, and `capture()`
writes frames. Nothing drives them. `board.json` is ground truth — every mind's
position, goal and reason — so a recorder or a vision experiment has something to
check itself against. Blocked on **0f** for anything after the fact.

**THE DIRECTOR'S BRAIN IS DONE; ITS HANDS ARE NOT.** `npm run story` reads a
journal and answers the only question a director has — *where should it be
looking, and when* — as a ranked, time-stamped list of moments. That question was
unanswerable at all until 0f landed. Pointing the existing camera at those
timestamps is now a small job rather than a guess, and the list is immediately
useful on its own: it is what a person reads after a run, and what a vision
experiment checks itself against.

**Two faults it committed the first time it saw real data, both now asserted by
`storycheck` (11/11):**
1. It filmed **twelve identical deer kills** and cut all four chosen crafts — the
   rarest events in the file. A pure ranking always does this; each kind is now
   capped, so rare things survive by construction.
2. It told the story **out of order**, because it sorted on the world hour —
   which is each agent's `clock.hours` and WRAPS AT 24. `h1.37` at 1173 s came
   before `h16.67` at 608 s. **The fifth time that clock has caught this
   project.** Wall time is the only monotonic thing in a journal.

**Still to do for the second half:** drive `?watch=1` to those timestamps and
call `capture()`. Unblocked and specified.

---

# TIER 0.5 — what the eye and the hand find, 2026-08-14

Two different sources, kept apart on purpose. **The first is Ben's, from
watching the game.** The rest are mine, from the data and the code — and I have
**not been looking at the render at all**, so this list is honestly short on
visual bugs and long on papercuts. A pass with somebody actually watching would
find more in ten minutes than I found all day.

### 0.5a. THE BOW IS BACKWARD when drawn **[S]** — arc 5 · *Ben, watching*
Reported from the game; traced to `bowGeometry()` in `src/net/avatars.js`.

The avatar group is rotated `yaw + Math.PI` (avatars.js:264), so **+Z is forward**
for the figure. The bowstring agrees: its nock runs `0.03 → -0.23` as the draw
comes back, under a comment reading *"the nocking point comes back as the string
is pulled"*. So −Z is toward the archer, +Z toward the target.

The limb curve is the other way round:

    (0, -0.46,  0.03)   tip
    (0,  0,    -0.055)  belly  <-- bulges toward the ARCHER
    (0,  0.46,  0.03)   tip

A bow bulges AWAY from its string: tips near the archer, belly toward the target.
This has it mirrored, which is exactly what "backward" looks like.

**The likely fix is to negate Z on all five curve points** — tips to `-0.03`,
belly to `+0.055` — and move the string's rest nock to `-0.03` so it still spans
the tips, keeping the same `- draw * 0.26` pull. **Not applied**: I cannot see
the render, the analysis is from two independent readings of the code rather
than from an image, and a one-character sign error here would look identically
wrong. Worth ten seconds of eyes before and after.

### 0.5g. A WATCHER IS STILL A BODY IN THE WORLD **[M]** — arc 3 · *Ben, watching*
*"Make the fly option not vulnerable to the elements so we can watch only."*

**`?watch=1` is entirely client-side.** It makes the browser send no intents and
accept no position corrections, which is why the camera can fly at last. THE
SERVER IS NEVER TOLD. Grepped: there is no `spectator` or `watcher` concept in
`world.js`, `server.js` or the protocol — a watcher joins through the same
`players.set(id, p)` as anybody else and gets a full body.

So a watcher's body is standing in the valley the whole time, and:

1. **IT FREEZES AND STARVES.** Hunger decays and `coreC` falls on a body nobody
   is steering, so a long watch ends in the death screen. That is what Ben hit.
2. **AND — the larger problem — IT IS A PERSON THE MINDS CAN SEE.** It is in the
   snapshot, so it reaches every agent's `also out there` and contacts. Minds can
   walk to it, hail it, offer to it, and on unsettled ground shoot at it. **An
   observer other minds react to is not an observer**, and every run watched this
   way is quietly contaminated by a motionless stranger standing in it.

Point 2 matters more than point 1 for what this project is measuring, and
neither is fixable from the browser: both need the SERVER to know.

**Shape of the fix:** carry a `watch` flag on `C_HELLO`; the world then skips
hunger, cold and damage for that player, excludes it from `canHarm` and wildlife
aggro, and — the important half — **leaves it out of the snapshot other players
and agents receive**. It should be possible to watch a run without being in it.

Related: **0j**'s camera driver will BE a watcher, so it inherits both problems.
Doing this first makes the recorder possible; doing it after means every filmed
run has a ghost in it.

### 0.5b. "3 venisons" — the registry has no plural exception **[S]** — arc 2
`Agent.plural` knows venison, trout and fish take no plural. `itemWords` in the
item registry does not, so the brief says *"You are carrying: 3 venisons"* and,
since 0e, *"hungry and carrying 3 venisons"*. Two plural rules, one of them
wrong. Fixing `itemWords` touches every brief and several checks, so it wants
doing deliberately rather than in passing.

### 0.5c. `AGENT_SECONDS` stops the minds and leaves the world running **[S]**
Hit twice on 2026-08-14. The fleet ends cleanly at its hour and **the server
keeps port 8080**, which blocks the next run and makes `boardcheck` fail. The
minds process cannot politely stop a server it did not start, so this is either
a note in RUNNING.md or a `--stop-server` flag. Right now it is a trap.

### 0.5d. `boardcheck` does not use `requireFreePort` **[S]** — arc 2
It prints *"could not run: no board to check"* when a live run holds 8090, which
I misread as a regression once today and had to diagnose twice. `freeport.js`
exists in this repo BECAUSE a stale server on a port made `bitecheck` report a
product defect that did not exist. This is the same failure, in the file next
door.

### 0.5e. A craft can make several things off ONE decision **[S]** — arc 1
`eat` is now one meal per decision, after a body ate four venison in eight
seconds. `craft` still fires on every retarget: Ailsa made arrows AND a torch off
a single "make something useful". That is arguably RIGHT — she used spare
materials well — but the two verbs now behave differently for no stated reason.
**Decide it deliberately** rather than leaving it as an accident of which bug got
found first.

### 0.5f. Nothing changed hands in the rotated run **— watch, do not fix yet**
The 0i errand line was live and produced no transfer in an hour. Run 2 on
2026-08-12 produced five. One run each way is not a finding; it is a thing to
count over the next few.

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
