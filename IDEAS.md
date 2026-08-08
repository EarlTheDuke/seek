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

> **See also [WHAT-A-MIND-IS-GIVEN.md](WHAT-A-MIND-IS-GIVEN.md)** — what a mind
> is actually handed each decision, how that compares to Generative Agents,
> Voyager, Project Sid/PIANO and lmgame-Bench, and the measured finding that
> **a memory in this game has a half-life of exactly one decision.** Part 3 of
> that file is a memory/perception work list that partly supersedes the ordering
> below.

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

### ~~THE ONE FIX~~ ✅ **BUILT 2026-08-08** — A MIND IS NEVER TOLD WHAT ITS OWN LAST ACTION DID **[M]**
*The organising finding of 2026-08-08. Five separate pathologies turned out to
be one bug wearing five hats. Do this before anything else in Part A.*

| observed live | what the mind was never told |
|---|---|
| 94 fires laid, five in twenty real seconds | *"there is already a fire here"* |
| 400+ draws with no arrow released | *"that shot was refused — ground in the way"* |
| An hour of hunting with an empty quiver | *"you have no arrows"* |
| One sentence spoken three times over nine minutes | *"you said that already"* |
| Two minds lost for hours at 140 m | *"Coinneach is somewhere south-west"* |

`Agent.brief()` is a **description of the world's present state** — where you
are, what you see, how you feel, what you carry. It contains **nothing about
the consequences of your own last action.** A mind gets senses and no outcomes.

That is why every failure mode is a **repetition loop**. An action that returns
no signal cannot be distinguished from an action that did nothing, so it happens
again.

**Where the repeating actually happens — measured, and not where I first said.**
Neither model repeats its decisions: across 142 logged decisions, **0% were
identical to the previous one**, and not even the opening verb repeated. The
loops split in two:

- **Body-level** (fires, draws) — one standing goal drives the same action every
  tick until something changes. That is how 5 fires land in 20 seconds against a
  20-second cadence. **The body needs a guard**: do not lay a fire where one
  burns, do not draw on an empty quiver, do not re-press what was just refused.
- **Model-level** (the speech, said three times across three separate decisions
  with three different stated reasons) — **the model needs the feedback line.**

Same root cause, same work, two call sites.

**The fix is one mechanism:** every action a mind takes produces a line in its
next brief saying what happened.

```
you laid a fire
your shot was refused — no clear line
you said that already
you have no arrows left
you took 2 branches
```

A field on the brief, a handful of call sites, one check. It plausibly fixes
`A0b`, `A0c`, `A0d`, the speech loop and a large part of the accuracy problem
**at once**, and it is defensible in plain real-world terms: a person who lays a
fire knows they have laid it.

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

### ~~A0g~~ ✅ **BUILT (the prompt half)** — THE VERBS ARE REACHABLE AND STILL UNUSED **[S]**
*Found at 90 minutes, and it revises A0 above. Do this one first — it is two
prompt lines.*

They found each other. Both named the other. And one of them formed the exact
barter `offer` was built for and **still chose `approach`**:

```
Coinneach 13.94h  go toward Eachann  |  offer branches for some of that meat
```

**The models understand the social situation completely and simply do not select
the verbs.** Two causes, both trivial:

1. **The prompt never says `offer` and `give` include the walk.** They do —
   `case 'offer'` resolves to `{ x, z, within: REACH, act: 'offer' }`. The model
   treated "go to him" and "offer him something" as two decisions and only ever
   spent one. At a 75 s cadence with a 50% failure rate the second never landed.
   **One sentence in the prompt fixes this.**
2. **`approach` takes one argument; `offer` takes three** (target, item, want),
   and any one of them wrong makes it a silent no-op. Offered an easy verb and a
   hard verb that both move toward the goal, a model takes the easy one and gets
   no feedback that the hard one was the point. Consider making `offer`'s `want`
   optional, and logging every near-miss so a refused verb is visible.

This is the cheapest high-value item in the whole document.

### A0h †† Score the reasons, not just the outcomes **[M]**
Every sophisticated thing either model did today lives in the one-line `why` and
died before reaching an action: the barter plan, the rivalry over a carcass, the
avoidance, noticing the human player unprompted.

**A benchmark that scores only outcomes would rank both models at zero on trade,
which is plainly the wrong answer.** Score the stated reasons as well, and score
the *gap* — "understood the situation but could not act on it" is a completely
different failure from "never understood it", and only the second belongs to the
model. This also gives Part D a second, cheaper signal that does not wait on
`A0f`'s event log.

### A0i †† Personas move behaviour — confirmed, so build on it **[S]**
The two written characters produced two visibly different animals, unprompted:

| written | did |
|---|---|
| *"asks for what he needs rather than going without"* | sought company, planned a barter |
| *"You hoard. What you pick up is yours"* | *"my meat now, not yours"*, then fled with the stores |

First hard evidence in this project that character text changes **behaviour**
rather than narration. It makes every personality axis in Part D worth
building — and it makes **A4** (the truthful-Tormod control) *more* valuable,
not less: the question is now how much and how reliably, which needs a proper
same-seed A/B.

### A0j ††† A FAILED CALL SILENTLY BECOMES THE SCRIPTED CONTROL **[S]**
*Found at two hours, and it contaminates every result this project has.*

`OpenAiProvider.decide` catches every failure and returns
`this.fallback.decide(brief)` — the scripted brain (`providers.js:364`). At
kimi's measured **48% failure rate**, the seat labelled `kimi-k2.6` on the board
is a **52/48 blend of kimi and the scripted control**.

This is correct for a *game* and the comment defending it is right: *"a mind
that can stop the world is not a mind, it is a dependency."* It is wrong for a
*benchmark*, where a seat present half the time cannot be measured — and it
means **the fallback gets silently credited to the model**, which is
particularly perverse given the fallback is the thing that keeps winning.

**Fix:** report per-seat **model share** (answered ÷ decisions) as a headline
number on the board and in every report, and **disqualify** any seat below a
threshold from a result rather than quietly publishing it. Add a `STRICT=on`
mode for benchmark runs where a failed call retries or the run aborts, rather
than substituting a different brain and saying nothing.

Nothing in Part D is valid without this. It sits alongside `A0f`.

### A0l ††† A SEAT RUNS OUT OF CALLS AND EVERY INDICATOR STAYS GREEN **[S]**
*Found at 210 minutes. The worst instrumentation defect of the day, because the
other five produced wrong numbers and this one produces a wrong experiment.*

`AGENTS.maxCallsPerAgent` is **400**. At the cap, `decide()` returns
`this.fallback.decide(brief)` for ever (`providers.js:348`). Eachann hit it at
174 minutes and spent the last 18% of the run as the scripted brain — while the
board reported:

```
"model": "grok-4.20-0309-non-reasoning",  "fellBack": false
"spend": { "exhausted": false }
```

**`fellBack` false. `exhausted` false. Model name still displayed.** Anybody
reading that board would report the control's behaviour as grok's.

Three fixes, all small:
1. **Set `fellBack` when the cap is hit** — the flag exists for this and does
   not fire.
2. **Surface the cap in the setup screen** (`B3`) as *"how long this seat can
   think for"*, converted to hours at the chosen cadence. The per-agent 400 is
   the binding limit, not the roster's shared `budgetCalls`, and it is seven
   times tighter — easy to plan a run around the wrong number.
3. **Turn the seat a visible colour** on the board and write a line to the event
   log the moment it goes dark.

### A0k † The sightline field IS being read — first evidence **[—]**
Not a fix; a result worth keeping. Two kimi reasons, both attributable
(scripted decisions come through with a null reason):

```
starving and too far for a clean shot
ground blocks line, need clear shot
```

`brief().sight` was added because six arrows went into a slope at an animal
standing in the open, and this is the first evidence any model uses it. It
argues for extending the same treatment — state the obstacle, not just the
target — to the other things a mind is currently left to infer from absence
(`A0`, `A0d`). It also shows the limit: the mind *knows* the line is blocked,
repositions, and still never gets a clean shot. Knowing and solving are
different problems, and `A0d`'s draw-and-abort loop is the unsolved half.

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

### ~~A0d~~ ✅ **BUILT** — An empty quiver is invisible, and fatal **[S]**
*Found at the 30-minute mark.* A mind carrying **one bow and nothing else** has
a `loosed` count of 187 and climbing. It is drawing on an empty bow for ever and
nothing tells it so: `brief().carrying` filters to `n > 0`, so no arrows shows
up as **absence in a list** rather than as a fact, and the shoot path never
checks ammunition before drawing. It cannot recover either — arrows need wood
and a fire, and it has neither.

Two fixes, both small: **state the pack in the negative when it matters**
("your quiver is empty", "you have no fuel"), and **refuse the draw upstairs**
instead of miming it. Same principle as the `sight` field — a mind that cannot
tell two situations apart is not choosing between them, it is guessing.

### A0e †† `loosed` counts draws, not arrows **[S]**
The board's arrow count comes from the agent's own `releases` log filtered on
"did I mean it" (`src/net/agent.js:747`), not on whether a shaft left the bow.
For a body with an empty quiver every entry is a phantom, which is how one mind
reached 187.

**This invalidates every accuracy number this project has produced**, including
the "5% hit rate" in the first version of today's observations. Any combat axis
in Part D is blocked on making this counter mean what its name says.

### A0f ††† A run must emit an event log, because the board is a bad instrument **[M]**
*The theme of 2026-08-08. Three separate defects, one cause.*

1. `loosed` counts **draws the mind meant to make**, not arrows that left.
2. `loosed` is also a **sliding window over a 400-entry ring**, so it rolls over
   silently and can go **down**. One mind's count read 187, then 0, with no
   respawn — it had let the string down 400+ times in between.
3. **Nothing records whether one mind ever saw another.** `brief()` builds a
   `contacts` list; the board does not serve it. The single most important
   question in a multi-agent run has no answer in any artefact produced.

Plus the one I inflicted on myself: position is served as **prose**
(*"379 m south-west of Rowan Moor"*), so any tool that wants a distance has to
invent coordinates — and mine did, and I quoted the results twice before
catching it.

**The board is a good live dashboard and a bad instrument.** Every ranking and
every axis in Part D is built on exactly these numbers. Before any benchmarking
work: a run emits an **append-only JSONL event log** of *outcomes* — arrow
released with a real shaft, contact seen at range R, item changed hands, deal
offered, deal honoured, death — with raw coordinates, and the dashboard becomes
a **view** of that log rather than the only place the data exists.

Nothing else in Part D is worth starting before this.

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
**Rewritten 2026-08-08 after three hours of data killed the first version.**

*My original recommendation was **days survived**, with calories banked as the
tiebreak. The run disproved it.* Over 544 samples the two minds' food levels
correlate at **r = 0.686** with a **median absolute difference of 3 points out
of 100** — despite one being a pure paid model making 393 decisions and the
other being 62% scripted fallback on 68. Food follows a clean diurnal sawtooth
(trough 14:00, peak 18:00): **the world drives survival, not the mind.**

A survival-scored benchmark would report grok, kimi and a hundred lines of
if-statements as a three-way tie — not because they are equal but because the
metric is blind. That is the worst failure available to a benchmark: a
confident number measuring the wrong thing.

**What a score has to measure instead** — things the world does not hand out for
free:

| candidate | why it discriminates |
|---|---|
| kills per arrow **that actually left the bow** | needs `A0e` fixed first |
| meat harvested per kill | one mind starved on top of its own carcass |
| **decisions that changed the world** ÷ decisions taken | the single best signal seen today — a mind can spend an hour achieving nothing |
| distinct verbs reached | 6 of 15 used in 510 decisions |
| deals struck, and deals honoured | needs `A0`/`A0g` |
| score per pound, per second | already measurable, and nobody reports it |

Still report everything **relative to the scripted control on the same seed** —
"0.87× the scripted floor" rather than an absolute — because the ratio is the
finding. But pick metrics the control can actually lose at.

**Every one of these needs `A0f`'s event log before it can be computed.**

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

0. **THE ONE FIX** (tell a mind what its last action did) — one mechanism that
   dissolves five observed pathologies. Everything else in Part A gets cheaper
   once it lands.
1. **A0 + A0g** (minds can find each other; the prompt admits that `offer`
   walks you there) — without A0 there is no multiplayer game and no social
   benchmark, only two single-player games sharing a weather system. A0g is two
   sentences and is the best-evidenced item in the document: **both** minds have
   now named trade in their own reasoning and **neither** has ever selected a
   trade verb.
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
