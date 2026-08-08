# The wide list — fixes, improvements, and where this could go

Written 2026-08-08, during the two-mind long run. Nothing here is built. This is
the menu; `NEXT-BUILD.md` is what got cooked.

Ben's brief was "think big and wide, we can narrow it down later." So this is
deliberately over-inclusive. Items are marked:

- **[S]** small — an afternoon or less, low risk
- **[M]** medium — a day, touches several files
- **[L]** large — a project in its own right
- **†** — I think this is high value relative to its cost

---

## The one thing worth saying first

This project has quietly become **two products in one repo**, and they want
different things:

1. **A game a person watches** — needs drama, legibility, pace, stakes.
2. **A benchmark that ranks language models** — needs repeatability, controls,
   a score, and error bars.

They are not in conflict *yet* — both are served by "give the minds harder,
more interesting decisions" — but they will diverge. A benchmark wants the world
frozen so the model is the only variable. A game wants the world to keep
surprising you. The honest move is to build the shared foundation now and keep
the divergence in mind, rather than pretending one artefact serves both for ever.

**The single most valuable thing this project has produced so far is the
scripted control beating every paid model twice.** Everything in Part D exists
to turn that accident into a measurement.

---

# Part A — Fixes and calibration

Small, concrete, mostly known-good.

### A0 †††  MINDS LOSE EACH OTHER FOR EVER AT 140 METRES **[S]**
*Found live on 2026-08-08, three hours after this document was written. It
outranks everything else here and it changes what several other items mean. Full
trace in `OBSERVATIONS-2026-08-08.md`.*

Two minds spawn **3.3 m apart**. Within the hour they are **a kilometre** apart.
`AGENTS.noticeRange` is 140 m and `Agent.brief()` drops anything beyond it — so
past 140 m **the other player is not in the prompt at all**, and every social
verb takes a target that can only be named from the prompt. `offer`, `accept`,
`give`, `attack`, `follow`, `guard` all silently become `roam()`.

**Consequence:** within ten minutes of any run, all six of yesterday's verbs
become physically unreachable and stay that way. It retroactively explains both
six-model playtests — "the models never coordinated" was never a fact about the
models, they were each alone in a private world with the same weather. And it
explains why the scripted control keeps winning: it never needed anybody.

**The fix is not "raise the range."** 140 m is right for *seeing* somebody. What
is missing is that people who know each other keep a rough idea of where each
other are — two crofters in a glen do not lose each other permanently because
one walked over a rise. Add a coarse second channel to the brief:

> `also out there: Coinneach, a long way south-west`

Name and bearing only, no condition, no distance, for anyone on the roster at
any range. Plus `goTo <person>` resolving against it, so a mind that decides to
go and find somebody can. Half a day's work; unlocks D3's entire social half.

**Everything in Part D that involves trade, honesty, deception or coordination
is blocked on this.** Until it lands, those axes measure zero over zero.

### A0b The `place` spam **[S]**
Eachann lit **five fires in twenty real seconds** and 21 in the sampled window.
`AGENTS.fireNearby` (9 m) is meant to prevent exactly this and something is
getting past it. Worth an hour with a `firecheck` before assuming A1's cost
change fixes it on its own — a cheap action that a model has learned to repeat
will just become an expensive action it repeats until the wood runs out.

### A0c There is no verb that means "take the meat" **[M]**
A mind killed a deer, stood over the carcass, chose *"pick up what is lying
about"* — and walked away with **two branches**, then starved. `case 'gather'`
navigates to `nearestDeadfall`, which is firewood specifically, and dropped loot
is **not in the snapshot at all** (`src/net/agent.js:2137` says so outright:
deadfall is a pure function of the seed, loot is not). So a mind can see that a
kill happened, cannot see the carcass, and has no word for harvesting it.

Harvesting clearly *can* happen — the other mind is carrying cooked venison —
but on this evidence it is incidental rather than chosen. This is the second
half of "the models cannot feed themselves", and the quarry fix exposed it:
now that they can hunt, we can see they cannot eat what they kill.

### A1 † A fire should cost about 10 branches, not 1 **[S]**
Ben's call, and he's right. Right now `place` spends exactly one `wood` in two
hardcoded places — `src/sim/world.js:1209` and `src/main.js:2491` — and the gate
is `countOf('wood') > 0`.

**Why it matters more than it looks.** Firewood is currently the only thing in
the world that is *abundant and useful*, which makes it worthless. A hoarder
with infinite firewood and a generous soul with infinite firewood take identical
actions — that's already written in `personas.js` as the reason `SCARCE` exists.
Ten branches per fire turns wood into the first real **currency** in the game:
something you can run out of on a cold night, something worth asking for,
something worth trading venison for. It gives gold something to be priced
*against*, which gold badly needs.

**How to do it properly:** one constant, `SURVIVAL.woodToLight`, used at both
sites plus the gate, plus the mind's prompt line so a model knows the price
before it walks to a wood. Two-line change, four call sites, one check.
**Watch for:** the agent heuristic at `config.js:967` ("below this many branches
in the pack, the wood is for the fire") needs re-tuning in the same breath or
every mind will hoard wood and never make arrows.

### A2 Feeding a fire should cost differently from lighting one **[S]**
Same edit, natural sibling. Lighting is the expensive act (10); feeding is 1.
Currently they're the same, which is why nobody ever bothers to keep a fire
alive — it's the same price to walk away and light a fresh one.

### A3 † Nobody has ever seen the six new verbs work live **[S]**
`give`, `offer`, `accept`, `attack`, and the fixed quarry match all pass their
checks in isolation and **have never once been chosen by a real model in a live
run.** That's not a bug report, it's a gap in evidence, and it's the reason the
current duo run exists. If a full day passes with none of them fired, the
question stops being "does the code work" and becomes "does the prompt make
these verbs *reachable*" — which is a completely different fix.

### A4 The truthful-Tormod control **[S]**
Change one word in a character line ("drives a hard bargain" → "deals
honestly") and re-run the same seed. This is the cheapest genuinely informative
experiment on the list and it's been sitting undone for two days. It settles
whether persona text changes *behaviour* or just changes *narration*.

### A5 Kimi is 3-in-8 reliable live, 7-in-7 in isolation **[M]**
Something about the live path — concurrency, prompt length, timing — degrades it
in a way the isolated check doesn't reproduce. Until that's understood, every
result involving Kimi carries an asterisk. Instrument the live path: log prompt
length, response length, wall-clock, and the raw first 200 chars of every failed
reply.

### A6 Gold has no floor **[S]**
Gold currently cannot be eaten, burned, or shot — it is worth exactly what
someone will trade for it, which was a deliberate and good decision. But with
two players and no third party, a mind can rationally conclude gold is worthless
and be *correct*. See C4/E2 for the fixes; noting it here as a known hole.

### A7 Deaths, hunger and cold are not on the board **[S]**
The board shows goal, why, deeds, arrows, gold, food. It doesn't show warmth,
health, or a death count. Those are the stakes; they should be the columns.

---

# Part B — The setup interface † **[L]**

*Ben's main ask: "a simple setup interface for choosing all the settings, like
what models, how many players, personalities and all the other variables."*

Right now starting a game means me hand-writing a `roster.json` and a `.cmd`
file. That's the bottleneck on Ben running experiments without me — which is the
actual goal.

## B1 What it should be

**A local web page.** Not an installer, not an Electron app, not a CLI wizard.
The infrastructure is already there: vite serves a page, the board already
serves JSON on 8090. A setup page is one more route.

`SETUP.cmd` → opens `http://127.0.0.1:8090/setup` → fill in a form → press
**Start the game** → it writes the roster, launches everything, and redirects
you into the game. One double-click, one screen, no text editor, no JSON.

## B2 The screen, concretely

**Panel 1 — The table.** A row per seat, with an **Add a player** button.
Each row:

| control | notes |
|---|---|
| name | pre-filled from a Gaelic name pool so he never has to think of one |
| model | **a dropdown, not a text box** — this kills the entire class of "BAD MODEL NAME" errors that cost us two false starts |
| character | a text area, *plus* a **preset picker**: hoarder / generous / coward / leader / liar / honest trader / loner / scripted-control |
| thinks every | a slider in seconds, with the cost implication updating live |
| a "scripted control" toggle | which greys out model and character |

**Panel 2 — The world.** Sliders and toggles for the things that are currently
environment variables buried in a `.cmd` file: danger level, scarcity, starting
hunger, solid bodies, personas on/off, narration, PvP scope, seed.

**Panel 3 — The money.** This is the panel that earns its keep. As you build the
table it shows, live: **"7 players · about £1.60 an hour · budget stops it after
5 hours · estimated total £8."** Right now the cost of a roster is invisible
until the bill arrives. Making it a number that moves while you drag a cadence
slider changes how you design a run.

**Panel 4 — Preflight.** A **Check everything** button that runs `keycheck`
in-page and shows a green tick or a plain-English fix per seat. Same logic,
already written, just rendered instead of printed to a black window.

## B3 The parts that make it actually good

**Save and name a setup.** "The six-model bake-off", "the cheap overnight",
"the trade experiment". A dropdown at the top: pick one, press start.
This turns a run into a *thing you can repeat*, which is the single
precondition for Part D being possible at all.

**A dry-run mode.** Start the world with all seats scripted and no API calls, to
check the world settings feel right, before spending a penny. Scarcity and
hunger are the two easiest settings to get badly wrong and the most expensive to
discover late.

**Never show a key.** The setup page shows *present / absent* per provider and a
link to the file. It must never display, echo, or accept a key in the browser —
keys stay in `keys.cmd`, which is gitignored and which only Ben edits. This is a
hard rule, not a preference.

**A "what changed" diff.** When you load a saved setup and tweak it, show what's
different from the saved version before you start. Half of all confusing results
come from a setting you forgot you changed.

## B4 The stretch version

- **Stop / restart a seat mid-run** without killing the world. Swap a model out
  at noon and see if anyone notices.
- **A mid-run event button.** "Send a storm." "Spawn a troll." "Drop 20 gold at
  the standing stone." Being able to *poke* a running world is the difference
  between an experiment and a screensaver.
- **A share button** that exports the whole setup — roster, world, seed — as one
  file somebody else can run and get the same world.

---

# Part C — Making it worth watching

The current watchability moat is the **board**: one card per mind showing what
it's doing *and why*. That's genuinely good and it's the thing nobody else has.
Everything below builds on it.

### C1 † A commentary track **[M]**
A cheap fast model (haiku, or the non-reasoning grok) watching the event stream
and writing one line whenever something happens. Not another player — a
*narrator*. "Eachann has offered venison for gold, and Coinneach has said
nothing for a full minute."

This is the highest ratio of watchability-to-effort on the list. The data is
already in `board.json`. It costs pennies. And it turns a page of JSON into
something a person can have on a second monitor while doing something else,
which is exactly how Ben actually watches this.

### C2 A drama detector **[M]**
Before you can narrate well, you need to know what's *interesting*. A small
scoring pass over the event stream: a betrayal (offer made, accepted, not
honoured) scores high. A first kill scores high. Two minds converging on the same
deer scores high. Wandering scores zero. This drives the commentary, the
highlight reel, and the auto-summary — one component, three payoffs.

### C3 † The end-of-day recap **[S]**
`DEV-NOTES.md` already writes a per-run report with a "what nobody ever did"
section, which was a good instinct. Make it a **story**, not a table: who ate,
who starved, who lied, who helped, what the score was, what surprised us. One
page. This is the artefact Ben actually wants at the end of a run, and it's
mostly assembling data that already exists.

### C4 † Named places **[M]**
Minds currently navigate by coordinates and vague directions. Give the world
twenty named landmarks — the standing stone, the black lochan, the burnt pine —
and put them in the prompt.

**Why this is bigger than it sounds:** it's the precondition for *"meet me at
the standing stone."* Right now two minds physically cannot arrange to meet,
because they have no shared vocabulary for a place. Coordination is impossible
in the current world, so measuring whether models can coordinate is meaningless.
This unlocks an entire benchmark axis for a day's work.

### C5 A replay scrubber **[L]**
Record the snapshot stream; play it back with a timeline. Jump to the moment
someone died. This is how you turn "I was away for three hours" into "show me
the six interesting minutes" — which is Ben's actual usage pattern, today
included.

### C6 A leaderboard tower **[S]**
A persistent standings widget. Days survived, kills, gold, trades honoured. It
gives a watcher a reason to care in the first thirty seconds.

### C7 Let a mind write in the world **[M]**
Notes left at a location, readable by anyone who passes. Asynchronous
communication changes cooperation completely — a mind can leave "there is a deer
herd north of the lochan" for someone who arrives an hour later. It's also a
beautiful thing to stumble across as a human player.

---

# Part D — Making it a real benchmark †

This is the part I think is most underrated. There are a hundred agent
benchmarks that measure tool-calling and web navigation. There are very few that
put models in a **shared world with scarcity and other agents** and measure what
they do. That's a genuinely distinctive thing to have.

But right now there is **no score.** Without one, every run ends in me writing
prose about what I noticed, which is exactly as reliable as it sounds.

### D1 † A score **[M]**
Pick a primary number and defend it. My recommendation: **days survived**, with
calories banked as the tiebreak. It's the thing the world is actually about, it's
unambiguous, and the scripted control already provides the baseline.

Report it **relative to the scripted control on the same seed.** Not "Sonnet
scored 4.2" but "Sonnet scored 0.87× the scripted floor" — because the absolute
number is meaningless and the ratio is the finding. It's also the format that
makes the current embarrassing result legible: *every paid model has scored
below 1.0.*

### D2 † The protocol: same seed, one variable **[M]**
The benchmark is not "run a game and see." It's:

> Fix the seed. Fix the world. Fix every other seat. Swap **one** model. Run it
> N times. Report the mean and the spread.

None of that is possible today because there's no way to re-run an identical
world. Seed control + saved setups (B3) are the prerequisites. **This is the
single highest-value item in this document** and it's mostly plumbing.

### D3 Capability axes, not one number **[L]**
Once there's a protocol, the interesting output is a radar chart, not a rank:

| axis | the question | measurable today? |
|---|---|---|
| **Survival** | can it feed and warm itself | yes |
| **Combat** | can it use a bow, pick fights it wins | yes |
| **Trade** | does it find prices, does it profit | needs A1 to make anything scarce |
| **Coordination** | can two of them achieve something one can't | needs C4 (named places) |
| **Honesty** | does it honour deals when defecting is free | needs D4 |
| **Deception detection** | does it stop trusting a proven liar | needs a memory of past deals |
| **Long horizon** | does it prepare for a winter it can't see yet | needs E1 (seasons) |
| **Efficiency** | score per pound spent | yes, and nobody reports this |

**The honesty and deception axes are the distinctive ones.** `tradecheck`
already deliberately allows a mind to offer what it doesn't have — that design
choice, made for a different reason, is the foundation of a measurement almost
nobody else can make.

### D4 † Cheap talk versus action **[M]**
Log every promise and check it against what happened. "Eachann said he'd share
the venison" → did he? A **stated-intent-versus-action divergence rate**, per
model. This is cheap to build (both halves are already logged separately), it's
novel, and it is the exact failure mode people worry about in deployed agents.

### D5 The blind seat **[S]**
Don't tell the models which seats are models, which is scripted, and which is
human. Prevents a whole class of "it behaved differently because it knew" and
costs one prompt line.

### D6 Cost-adjusted everything **[S]**
Every result reported per pound and per second as well as absolute. The
measured finding that the cheapest model (`grok-4.20-non-reasoning`, £0.79/1000
decisions, 0.8s) is *also* competitive on behaviour is more interesting than any
raw ranking, and it only shows up if cost is a first-class column.

### D7 Statistical honesty **[M]**
One run is an anecdote. The two "the models cannot feed themselves" playtests
were both **wrong**, and they were wrong because of a string-matching bug that
N=1 could never have separated from model incompetence. Minimum three seeds
before any claim. Report spread. Say "we don't know" when N is small — the
project has already been burned once by not doing this.

---

# Part E — World systems that serve both goals

Ordered by how much drama-per-unit-of-work they generate.

### E1 † Seasons and a winter **[L]**
A deadline is the strongest story engine there is. If everyone knows winter
comes on day 12, then every day before it is *about* something, and long-horizon
planning becomes measurable instead of theoretical. This is the biggest single
change on the list and probably the best one.

### E2 † A merchant, or any price floor **[M]**
One NPC who will always buy venison for 2 gold and sell arrows for 3. That
single fact gives gold an objective value, which makes every player-to-player
price *comparable to a reference*, which is what turns "they traded" into "they
traded at a 40% markup." Without it, gold is a rumour.

### E3 Debts and contracts as real objects **[M]**
"I owe you three gold" as a thing the world tracks and the board displays. Ben's
Kimi character line already says *"you would rather owe somebody than starve"* —
the persona is written for a mechanic that doesn't exist. Debt is also the
cleanest possible honesty measurement: it either got paid or it didn't.

### E4 † A troll that needs two people **[M]**
Right now nothing in the world *requires* cooperation, so measuring cooperation
is measuring an optional behaviour. A creature that reliably kills one person and
reliably loses to two changes that in one stroke — and 8–20 gold is already the
troll's drop, so the reward is built.

### E5 Reputation, visible **[S]**
A column on the board: deals honoured / deals broken. Costs almost nothing once
D4 exists, and it's the thing that makes a watcher lean in.

### E6 Shelter **[M]**
Something to build that isn't a fire, that persists, that can be shared or
refused. Territory and property rights fall out of it for free.

### E7 Permadeath with inheritance **[M]**
When a mind dies its pack stays on the ground. Someone else finds it. Death
stops being a reset and becomes an *event with consequences for other players* —
which is the only kind of death that's interesting to watch.

### E8 A human-scaled clock **[S]**
A day is currently 26 real minutes, which is why the chat-silence bug fired
twice an hour and why nothing feels like it has weight. Make day length a
setting in the setup screen: fast for benchmarking, slow for watching. The two
products want different answers and this is one of the few places that's
cheap to give them both.

---

# What I'd actually do next, in order

If it were my call and nothing else changed:

1. **A0** (minds can find each other) — half a day, and without it there is no
   multiplayer game and no social benchmark, only two single-player games
   sharing a weather system. Everything social is blocked on this one item.
2. **A0c + A1 + A2** (harvest a kill; fire costs 10) — the other half of "can a
   mind feed itself", and the change that makes scarcity real. Every trade and
   personality measurement silently depends on something being scarce.
3. **B1–B3** (the setup page) — the thing Ben asked for, and the thing that
   stops me being the bottleneck on his own experiments.
4. **D1 + D2** (a score, and same-seed re-runs) — turns opinions into numbers.
   Depends on B3 existing.
5. **C4** (named places) — the *second* half of coordination. A0 lets two minds
   know the other exists; C4 lets them agree where to meet.
6. **C1 + C3** (commentary and the recap) — makes a run watchable and makes
   being away for three hours fine.
7. **E1** (winter) — the big one, once the foundation holds it.

Items 1–4 are roughly a week and would leave this a genuinely different project:
one where Ben can set up his own experiments, get a number out of them, and have
the number mean something.

---

## Two honest caveats

**I do not yet know whether models will trade at all.** Everything in Part D
assumes there's behaviour to measure. If today's duo run ends with two minds who
never once spoke to each other, the right response is to fix *reachability* —
prompt, prompting, verb salience — before building a scoreboard for behaviours
that never occur.

**The scripted control is still winning.** Until a paid model beats a hundred
lines of if-statements at staying alive, "which model is best" is a less
interesting question than "why is none of them good at this." That's not a
reason to stop — it's the most interesting finding the project has, and it
deserves to be measured properly rather than explained away.
