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

### ~~A3~~ ✅ **ANSWERED 2026-08-08 (run 2)** — the verbs are never reached for **[S]**
*`refusedVerbs` came back `{}` on both cards over 121 samples, with `refuse()`
verified as wired on all ten paths including offer/accept/give/attack. A whole
day did pass with none of them fired, so — per the paragraph below — the question
has now become "does the prompt make these verbs reachable", and the answer to
**that** is yes (A0g shipped, verified live). See A8: the remaining explanation
is that nothing in the world made trade worth doing.*


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

## Added 2026-08-08 17:34, from RUN 2 — the first live look at the seven fixes

*Run 2 was clean: no `SPENT` seat, both minds under a 1500 cap, 139 real
decisions. What follows is evidence, not inference. Full trace at the end of
`OBSERVATIONS-2026-08-08.md`.*

### ~~A8~~ ❌ **FALSIFIED 2026-08-08 18:05** — scarcity arrived and changed nothing **[M]**

> Coinneach reached **0 food** and starved **1 m** from a man carrying 3 cooked
> venison, saying *"I'll take that deal, Eachann"*. The world got exactly as
> hard as this item asked for and trade stayed at zero. Hunger was never the
> blocker — see **A16**. Keep the difficulty work if it is wanted for its own
> sake; it is no longer the trade fix, and it is no longer the top item.

**The single most important item on this list now**, because it supersedes the
reachability story that A0/A0g were built on.

Reachability is **built, live, and confirmed working**: `also out there` is not
distance-gated (`agent.js:299` fills names for every player at any range), and
`providers.js:308-311` offers `offer`/`accept`/`give` on every call with the
sentence saying the verb walks you there. Both minds had the other's name and
bearing ~139 times. Trade was still **zero**.

Meanwhile both minds ended **health 100**, with food *higher* than they started
(50 → 62 and 50 → 83) and a wood surplus after 24 fires. Nobody froze, nobody
starved, nobody ran short of anything.

> A trade needs a shortage. There wasn't one, so the correct play was to ignore
> the other person — and both models made it.

Concretely: asymmetric starting kit (one gets the bow, one gets the arrows), a
consumable only one seat can make, or a cold night that costs more wood than one
person can gather in a day. **Every social measurement in Part D is now blocked
on this, not on A0.** E1 (winter) and E4 (a two-person troll) are the large
versions of the same idea; A8 is the cheap one that tests the hypothesis first.

### ~~A9~~ ❌ **FALSIFIED 2026-08-08 18:05** — the verb WAS selected, repeatedly **[M]**

> Both minds set trade goals on 12 samples simultaneously and walked 400 m to
> execute them. The premise below — that the plan never becomes the verb — was
> an artefact of reading an empty `refusedVerbs`, which is blind to every way a
> trade actually fails (**A16**). The plan-to-verb path works.

### A9 ††† A mind writes "trade a hide for food" in its own plan and never selects the verb **[M]**
Coinneach wrote six three-step plans and **three of them named trade**:
`["gather wood","trade a hide for food","fletch arrows"]`. The plan persisted,
was handed back in the prompt, and `refusedVerbs` proves the verb was **never
attempted**.

So the gap is not knowledge, not prompting, and not verb arity. It is that
**nothing connects the plan to the next decision.** Options, cheapest first:
(a) when plan step *n* names a verb the model has, put that verb and its exact
argument shape directly in the prompt next to the step; (b) ask for the next
action and the plan in the same reply, so the two are written together;
(c) score plan-follow-through as its own metric (this is D4's cheap-talk axis,
and it now has a live signal to measure).

### A10 †† The speech gate bins 4 lines for every 1 it lets through **[S]**
`AGENTS.speakEveryHours = 0.5`; at Eachann's 20 s cadence that gagged **55
lines in 39 minutes**, all from the one seat, e.g.
`(wanted to say "mine to keep" — too soon, 0.38h of 0.5h)`. Those are claims
over carcasses — the exact content a social benchmark exists to observe.

Speech is free and it is the whole point. Make the gate **per-cadence, not
per-hour** (a seat may speak once per *n* decisions), or drop it to 0.1h. Also:
`MINDS.speakEveryHours = 0.4` is a shadow copy of the same constant with a
different value that does not bind — delete one of them before it bites.

### A11 †† Nobody speaks TO anybody, and one mind hailed a person who does not exist **[S]**
All 23 lines this run were soliloquies. The only explicit trade solicitation was
Coinneach's **"doing fine, Ben. got food to trade?"** — and `roster-duo.json`
contains only Eachann and Coinneach. **There is no Ben.** A model tried to open a
negotiation and addressed it to nobody.

Two fixes: (1) `say` should take an optional target, and a targeted line should
be delivered to that person's `heard` at any range the world allows — a hail is
useless if it evaporates; (2) if a mind names somebody who isn't on the roster,
**refuse it and say so** (`refuse('say', 'there is nobody called "Ben"')`), which
is exactly what the refusal channel exists for and would have caught this in one
sample.

### A12 †† `goTo <person>` has still never been observed firing **[S]**
A0 shipped the half that tells a mind *where* somebody is. The other half — a
goal that resolves against that name — has no live evidence. Both minds were told
the other's bearing on essentially every call and **neither ever set a goal to go
find the other**, closing from 275 m at best. Verify `goTo <person>` resolves
against the `far` list, and if it does, say so in the prompt in one sentence the
way A0g did for `offer`. If it doesn't, that is the bug.

### A13 † `note` is a dead field — cut it or give it a job **[S]**
**Zero uses across 139 calls by two different models.** `plan` earned its place
in the same run (six real plans from kimi). Either prompt for `note` explicitly
("anything you want to remember tomorrow"), or remove it — an unused field is
prompt tokens on every call for nothing.

### A14 † Hold `refusedVerbs` to the standard the shoot-refusal channel already sets **[S]**
`refusedVerbs` worked and answered its question on the first outing — **the six
verbs are never reached for, not refused** — which retires A3 and rules out
A0g's arity theory. But it is a bare count. The archery channel next to it
records `{"d":46,"why":"too far","slant":47.5,"dy":-10.2,"leadBy":0.4}` — enough
to reconstruct the decision. Give refusals the same treatment: the verb, the
argument that failed, and the game hour. Cheap, and it is the column that has
already paid for itself twice.

### A15 ††† Fire now costs 10 branches and wood is still not scarce **[S]**
A1 landed and worked in the right direction — **106 fires → 24**. But wood held
peaked at **67** and **45** branches and both minds ended in surplus after 149
gathers. The cost is visible and still not *binding*. Either raise it again, or
(better, and this is A8's cheap edge) make branches slower to find rather than
fires dearer to light — a mind that spends its day gathering is a mind with a
reason to buy wood from someone who has 67 of them.

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

> **UPDATE, 2026-08-08 17:34 (run 2).** Reachability got fixed and it was not
> enough. Both minds had the other's name and bearing on ~139 calls, had the
> trade verbs on every call, and one wrote *"trade a hide for food"* into its own
> plan three times. Trade: zero. Both also ended the run healthier than they
> started. **The caveat stands but the diagnosis moves: it is scarcity, not
> reachability.** See A8, and do not build Part D's social axes until a run
> produces a single trade.

> **UPDATE, 2026-08-08 18:05 (run 2 continued). Both diagnoses above were
> wrong.** The minds crossed 400 m to reach each other, named a price out loud,
> agreed it, and stood 1 m apart while one starved to 0 food. Reachability
> works; scarcity arrived; trade is still zero. **The blocker is the trade
> primitive itself** — `resolveAccept` refuses in silence seven ways, `accept`
> has no way to know an offer is standing, and the protocol cannot express the
> two-for-one price both minds agreed. See **A16–A18**.
>
> The caveat now inverts: **there is behaviour to measure.** Two models
> negotiated unprompted. Part D's social axes are no longer speculative — they
> are blocked on thirty lines of feedback in `world.js`.

**The scripted control is still winning.** Until a paid model beats a hundred
lines of if-statements at staying alive, "which model is best" is a less
interesting question than "why is none of them good at this." That's not a
reason to stop — it's the most interesting finding the project has, and it
deserves to be measured properly rather than explained away.

---

## Added 2026-08-08 18:05, from RUN 2 CONTINUED — the first observed convergence

Two minds crossed 400 m to reach each other, agreed a price in speech, stood
1 m apart, and did not trade. See the 18:05 entry in
`OBSERVATIONS-2026-08-08.md`. **A8 and A9 are both falsified by it** and are
struck through below.

### A16 ††† `resolveAccept` FAILS SILENTLY SEVEN WAYS — this is the whole blocker **[S]**

`src/sim/world.js:746-780` has seven bare `return`s: no offer standing, wrong
recipient, out of range, untradeable item, giver lacks the item, taker lacks the
price, rollback. **None emits an event, an outcome line, or a `refusedVerbs`
entry.** A mind that tries to trade and fails learns nothing and retries
forever — observed for six consecutive samples with one mind at 0 food.

Give every one of them a sentence and a `refuse('accept', …)`:
*"there is no offer from Eachann to take"*, *"Coinneach has no venison to pay
with"*, *"you are 40 m from Eachann"*. The shoot-refusal channel already sets
this standard (A14) and it is the best-working thing in the harness. Same for
`resolveOffer`. **This is the single highest-value fix in the file and it is
maybe thirty lines.**

### A17 ††† THE DOUBLE-ACCEPT DEADLOCK — nothing tells a mind an offer is standing **[S]**

Observed h1.1→h2.9: both minds held `take <other> offer` simultaneously, 1–7 m
apart, for six samples. `accept` requires a *standing* offer; neither had one,
so both did nothing, silently, forever.

Nothing in the brief tells a mind **whether an offer is currently open, from
whom, or for what.** The offer event is written to memory once (`agent.js:479`)
and then decays like any other line. Put live offers in the brief as their own
channel — *"Eachann is offering: 1 hide for 1 venison"* — and expire them
visibly. A mind cannot accept what it cannot see is on the table.

### A18 ††† THE PROTOCOL CANNOT EXPRESS THE PRICE BOTH MINDS AGREED **[M]**

Both said *"one hide for two venison"*, out loud, repeatedly, by name.
`resolveAccept` is hard-wired 1-for-1: `remove(deal.item, 1)` / `add(…, 1)`.
**There is no quantity anywhere in the trade path.** Even a perfect handshake
would have silently paid one venison against a two-venison agreement — which is
worse than refusing, because it looks like theft.

Add `n` and `wantN` to the offer, carry them through the swap, and put them in
the `trade` event so the log shows the real price. Without this, `offer` cannot
represent the only bargain a model has ever actually proposed.

**And check the item ids while you are in there:** Eachann's only meat is
`venison_cooked`; `venison` is a different id and there is **no aliasing
anywhere in `src/items/`**. A `want: "venison"` will not match his pack. Log the
parsed `{item, want}` on the offer event — the board never shows it, so this is
still inference, and it is cheap to settle.

### A19 †† THE OFFER-WALK WORKS — say so, and stop blaming reachability **[—]**

Not a fix; a result worth recording. `offer` returning a walk-to-target
(`agent.js:2558`) took two minds from 228 m to 1 m in ~2 game hours while both
held trade goals. **A0, A0g and the offer-walk are done and confirmed live.**
Every remaining trade failure is downstream of arrival. Do not spend another
run on proximity, prompt salience, or verb menus.

### A20 † Eachann offered backwards, and that one IS the model **[S]**

Coinneach has hides and needs meat. Eachann has meat and needs nothing.
Eachann's goal: *"offer hide to Coinneach for 2 venison"* — he mirrored
Coinneach's sentence instead of inverting it, offering the good he already had
six of in exchange for the good the starving man did not have. Both minds spent
the endgame offering hides and wanting venison.

grok-4.20-non-reasoning parrots a price rather than reasoning about who holds
what. Worth keeping as a **capability axis** (D3): *does a model invert a
proposed trade correctly?* But fix A16 first — right now this error is
indistinguishable from the four harness faults sitting on top of it.

### A21 †† `plan` splits the models cleanly — it is a live capability signal **[—]**

Coinneach (kimi-k2.6) carried a plan on **214 of 218** samples, 7 distinct, and
it tracked his real state: `["gather wood","trade a hide for food","fletch
arrows"]` at wood 2 → `["eat","find feathers or flint","fletch arrows"]` at food
0. Eachann (grok non-reasoning): **0 of 218, never once.**

That is a sharp, free, per-model behavioural difference from a field the world
never reads. Score it (A0h/D3). And it strengthens the case for cutting `note`
(A13): empty for **both** minds on **every sample of the entire run**.

---

## Added 2026-08-08 18:31, from RUN 2 THIRD LOOK — the human player nobody measured

Three corrections first, because two of them are mine and one retires a
recommendation:

- **A11 is WITHDRAWN. Ben exists.** `srv.log` reads `3 players` on 892 lines
  against a 2-seat roster; both models use the name, which only the world's name
  list could have given them. The models did not hail a phantom — the *analysis*
  invented one. Do not add the "refuse a name not on the roster" fix from A11;
  it would have broken the best social behaviour in the run.
- **A15's "raise the fire cost again" is WITHDRAWN.** Over a full night 51 fires
  drained 79 → 5 and 57 → 2 branches and both minds hit food 0. Ten branches is
  the right number; the earlier reading was taken mid-afternoon.
- **A21 needs amending.** Eachann does use `plan` — 56 of 303 samples, one plan,
  `["trade hide at fire","hunt after"]`. `plan` still splits the models by
  degree (299 vs 56), but not by capability.

### A22 ††† A HUMAN PLAYER IS INVISIBLE TO THE INSTRUMENT **[M]**
Ben was in the world for essentially the whole run and was **the target of most
of both minds' social behaviour** — Eachann's `why` field read "trade hide for
meat" on four of his last five intentions, all aimed at Ben's fire. The board
carries LLM seats only, so nothing recorded his position, his range, what he
said, or whether the offers pointed at him resolved or were silently refused.
Every distance figure in the analyser measures Eachann-to-Coinneach and is
therefore measuring the *wrong pair*.

Fix: put **every** player on `board.json`, human ones included — name, position,
last line spoken, and a `human: true` flag. Cheap, and without it a run with Ben
in it cannot be read at all.

### A23 †† SEVEN KILLS, TWO LOOTINGS, TWO STARVATIONS **[S]**
`gather venison` is live and reachable — proven twice (**Coinneach h12.02 "I
picked up 4 venison"**, **Eachann h0.37 "I picked up 3 venison"**). It retires
the "no verb means take the meat" half of A0c. But 5 of 7 carcasses were left on
the moor while both minds went to food 0, and every `eat` in the run is *"I ate
a cooked meal"* — **raw venison has never been eaten once.**

Two candidates, and they are cheap to separate: (1) the kill produces no event
that says *there is meat here now*, so a mind that walks away never learns it
left food behind; (2) `eat` may only accept cooked ids, in which case a starving
mind holding 3 raw venison is being refused in silence — the A16 pattern again,
in a second verb. Log the parsed `eat` argument and check.

### A24 †† THE TRADE THE MINDS ACTUALLY WANTED WAS WITH A HUMAN **[M]**
Both minds' agreed price — *"one hide for two venison"* — was largely aimed at
**Ben**, not at each other: he was the one with meat. Every blocker in A16–A18
applies double here, plus a new one: a human has no protocol at all for
*accepting* an LLM's offer. When the offer/accept fix lands (A16–A18), the human
side needs a visible prompt — **"Eachann offers 1 hide for 2 venison — [Y]es /
[N]o"** — or the single most motivated trade in the run still cannot complete.
This is also the most watchable thing the game has produced: a model walked
400 m across a moor to haggle with the player.

### A25 † kimi-k2.6's failure rate is RISING, not steady **[S]**
45% at 18:05, **51% now (33 of 65), `"no json in reply"`.** Long-run drift, not
a fixed per-call odds. The socially strongest model gets 32 decisions where grok
gets 245. Either add a one-shot repair retry on unparseable output (cheap, and
A5's isolation test says the model is 7-in-7 when it does answer), or the run
economics of the interesting seat stay broken.

## Added 2026-08-08 19:03, from RUN 2 FOURTH LOOK — the first transfer, and it sent the wrong goods

Two corrections first:

- **A23's second candidate is WITHDRAWN.** Raw eating works, proven:
  `h7.8 Eachann "I ate what I had, raw"`. Do not go looking for an `eat` that
  refuses raw ids. The carcass problem is candidate (1) only — a kill produces
  no event saying *there is meat here now*, so 5 of 8 carcasses were abandoned.
- **A25's "failure rate is RISING" is WITHDRAWN.** 45% → 51% → 43% (36 of 83).
  Fixed odds with noise, not drift. The one-shot repair retry is still the
  single highest-value cheap fix — **46 real decisions to grok's 310** — but the
  urgency argument was over-read from three data points.

### A26 ††† `giftFrom` SILENTLY SUBSTITUTES THE WRONG ITEM **[S]**
**The most damaging bug found so far, and the cheapest to fix.**
`src/sim/world.js:802` — when the named item is not in the pack, `giftFrom` does
not refuse. It walks `EDIBLE`, then **returns the largest stack**, and
`resolveGive` hands that over and logs *"I gave hide to Coinneach"*.

Evidence: Eachann held `venison: 0` at sample 5178, formed
`goal: "give venison to Coinneach"` at 5193, and held it for twelve straight
samples. What left his pack: **hide ×5, arrow ×5, gold ×1** — 7/7/2 down to
1/2/1. Coinneach's food fell 81 → 63 across the whole window; **no food ever
arrived.** The model then read its own deed log and re-formed the goal as
*"give hide to Coinneach — he starves"*, which is what the live board says now.
A mind was made to look stupid by its own body, for the eighth time.

Fix, three lines: if `named` is set and not held, `refuse('give', "you have no
venison to give")` and return null. **Never** fall through to largest-stack, and
never let currency (`gold`) be chosen by a fallback the mind did not name. The
`EDIBLE` fallback is defensible *only* when the mind named nothing at all.

### A27 †† AN OFFER IS INVISIBLE TO THE BOARD **[S]**
`offer` is a memory event, not a deed (`src/net/agent.js:478`) — only `trade`
and `gift` call `did()`. So the instrument **cannot show whether `offer` was
ever reached for**, and my 18:31 line "zero offer deeds in the whole run" was
measuring nothing. The verb the entire program is about is the one verb the rig
is blind to.

Fix: add `offers: [{ to, item, want, h, taken }]` to each card — open offers
made and received, and whether they resolved. Without it, no future run can
report on trade at all. Pairs with A22 (put humans on the board too).

### A28 †† A PRICE IS AGREED IN ENGLISH AND BINDS NOTHING **[M]**
Both minds negotiated a complete deal in speech: *"Coinneach, one hide for two
venison?"* → *"I'll take that deal, Eachann"* → *"deal struck"* → *"Done. Hand
over the meat."* Then it executed as **one-way charity** — 11 gifts out of
Eachann, zero out of Coinneach, zero `trade` deeds ever. `give` is unilateral and
free; nothing in the world knows a price was agreed, so nothing can hold the
second half to it.

Both models also invented **debt** unprompted — *"I'll owe you for a meal"*,
*"Taking it. Debt stands."*, *"Rather owe him than starve."* — with no mechanism
behind it. Fix in that order: (1) land the `offer`/`accept` path so a spoken
price can actually bind (with A26 and A27 first, or it will fail silently
again); (2) a visible **debt ledger** on the card — `owes: [{who, what, since}]`
— since two models from two vendors both reached for it without being told it
existed. That is the strongest signal in the run about what to build next.

### A29 †† `loosed` IS A ROLLING WINDOW REPORTED AS A LIFETIME COUNT **[S]**
The board's `loosed` decays and can hit zero while the archer keeps shooting.
`server/board.js:193` counts loosed shots inside `a.releases`, which
`src/net/agent.js:786` caps at `AGENTS.logSize` (400) with `.shift()`. Observed
live: Coinneach `37 → 36 → 0` across two samples at h17.7–18.0 with `astray`
frozen at 33, kills 2, health 100 — no death, no respawn, just the buffer
rolling. The live board now reads **`loosed: 0, astray: 33`**, which is
arithmetically impossible and has already been quoted as fact in this file.

Fix: keep a plain `this.loosedTotal++` beside the ring buffer and report that;
leave `releases` alone for the recent-window views. Ninth instrument fault, and
the second one where a decaying log was read as a total — worth a sweep for the
same shape in `astray`, `kills`, `wounds` and `decisions`.

### A30 †† `give` IS FREE, UNILATERAL AND UNRECORDED — IT PUMPED ONE SEAT DRY **[M]**
29 `give` deeds in one run, **all in one direction**, zero back, zero `trade`.
End state: Eachann holding `bow ×1, wood ×13` and asking the man he fed
*"Coinneach, I need that meat back"*; Coinneach holding `hide ×13, arrow ×7,
gold ×2` and saying *"Taking it. Debt stands."*

This is not a model failure — grok gave deliberately and correctly (see A26's
confirmation: the venison transfer at `at=6382–6411` moved the named good). It is
that **`give` has no counterparty step, no cost, and no memory.** A mind can
empty itself in one direction and neither side's card shows that anything is
owed.

Fix, cheapest first: (1) surface the imbalance on the card — `gaveTo` /
`gotFrom` tallies per person, so a mind can *see* it is being pumped; (2) the
debt ledger from A28 — `owes: [{who, what, since}]`; (3) only then make `give`
cost something or require acknowledgement. Do **not** nerf `give` before minds
can see the balance — the generosity is the good behaviour here, and it is
currently invisible to the giver.

### A31 †† `refusedVerbs` HAS PRODUCED ZERO BYTES ACROSS TWO FULL RUNS **[S]**
Fourth consecutive check: `{}` on **all 974 cards** of run 2, in a run that
contained 29 successful gifts, a bare-handed archer, a 41% mind-failure rate and
an agreed price that never bound. The card column billed as the most informative
one has never once fired.

Root cause is narrow and known: `refuse()` (`src/net/agent.js:1595`) is only
reached when a **target name** fails to resolve. Every post-arrival failure —
A26's silent substitution, the missing `accept` path, an `offer` with no taker —
returns without calling it.

Fix: call `refuse(verb, reason)` at **every** early return in the intent
handlers, not just name resolution. Until then, "nobody reached for the trade
verbs" remains an unmeasurable claim — the same mistake A27 already caught once.
This should be done *before* the next live run or that run cannot answer the
question it is being staged to answer.

### A32 †† 397 GATHERS, 73 FIRES, 4,150 BRANCHES — THE WORLD IS A PICKUP SIMULATOR **[M]**
Gathering is the most common act in the world by a factor of four over
everything else combined. The 10-branch fire price (up from 1) did **not** make
wood scarce; it made it high-throughput. ~4,150 branches gathered against ~730
burned, with stocks flooring at 1–2 only because both minds burn as fast as they
stoop.

Observation, not yet a fix: the scarcity that actually bit this run was
**arrows and flint** — both minds spent the whole evening on it
(`plan: ["get arrows or flint","hunt after"]` /
`["find feathers or flint","fletch arrows"]`), and it is what finally drove them
to attempt trade. Wood is not the interesting constraint; **the crafting chain
is.** Consider tightening flint/feather availability and leaving wood alone,
rather than pricing fires higher again.

### A33 ††† A MIND CANNOT NAME WHAT IT WANTS TO PICK UP **[S]**
`src/minds/goals.js:65` — `gather: { params: [] }`. The only gather a mind can
express is the untargeted *"pick up what is lying about"*. Meanwhile
`src/net/agent.js:2444` already contains the perfect refusal —
`refuse('gather', 'there is no ${want} lying about that you can see')` — wired to
a `want` the vocabulary can never supply. **It is dead code.**

Cost of this in run 2: both minds spent game hours 11→14.7 planning, walking and
bargaining for **flint**, which has zero matches in the entire codebase, while
Eachann stood on `wood x4` — enough for eight arrows under the real recipe
(`wood: 2 → arrow: 4` at a fire). The world never contradicted them because the
only verb that could have carried the question takes no argument.

Fix: add `params: ['want']` to `gather`, pass it through, and let 2444 fire. One
line of vocabulary turns a four-hour hallucination into a one-decision correction
— and it is what finally gives `refusedVerbs` something to report (see A34).

### A34 †† CORRECTION TO A31 — `refusedVerbs` IS NOT BROKEN, IT IS UNREACHABLE **[S]**
A31 said `refuse()` "is only reached when a target name fails to resolve." **That
is wrong** and I am retiring it. There are ten call sites; three are not name
resolution (`agent.js:1054`, `1058`, `2444` gather, `2519` hunt).
`server/board.js:287` exports the map and `:439` renders it. The wiring is
correct end to end.

The real reason it is `{}` on all 1,148 cards of run 2: **no mind ever named a
target or quarry that failed to resolve.** Every `give`/`offer` named a real
person. The one verb being misused all evening — `gather` — cannot be refused at
all (A33). Do **not** spend an afternoon adding `refuse()` calls to every early
return, as A31 recommended; do A33 first and re-measure. The column may have been
honest all along.

### A35 ††† THE WORLD NEVER TELLS A MIND WHAT CAN BE MADE, AND THE ONE HINT IS GATED BACKWARDS **[S]**
`src/net/agent.js:990`:

```js
this.count('wood') <= 0 && 'no firewood — you cannot lay a fire or make arrows',
```

This is the **only** place in the game that tells a mind wood makes arrows, and
it fires **only when wood is zero** — precisely when the fact is useless. Both
minds carried wood all run and were never told. Line 2010 says "you cannot shoot
until you make arrows" without ever naming an input.

Fix, cheapest first: (1) flip the gate — when `arrow == 0` **and** `wood >= 2`,
say *"you have wood enough for arrows; you need a fire"*; (2) put a standing
`you can make:` line on the card, computed from `RECIPES` against the pack —
`canCraft` already exists and is already imported at `agent.js:58`. A mind is
currently expected to infer a crafting tree it has never been shown.

### A36 †† kimi-k2.6 DEGRADES TO TOTAL FAILURE OVER A LONG RUN — A25 WAS RIGHT **[S]**
The 19:03 entry retired A25 ("rising failure rate was noise"). It was not noise,
it was early. Traced across run 2:

```
sample 480  Coinneach 60 answered / 41 failed
sample 574  Coinneach 61 answered / 61 failed   ← 1 answer in 94 samples
```

**Twenty consecutive failures, ~31 real minutes, `no json in reply`,
`fellBack:false`, `spent:false`.** The seat is silently frozen on its last goal
and the board gives no sign — no tag, no banner, nothing. Eachann on grok:
458/458, zero failures, same harness.

Two fixes, both small: (1) the one-shot repair retry (A25) — reprompt once with
"JSON only" on a parse failure; (2) **a `STALE` tag on the card** when a seat's
last successful decision is more than N cadences old. A run where one of two
minds has been dead for half an hour must not look identical to a healthy one —
this is the same class of misreading the `SPENT` tag was added to prevent.

### A37 ††† A CRAFT NEVER SAYS WHAT IT CONSUMED — THE ONE PROOF OF A RECIPE, WITHHELD **[S]**
`src/net/agent.js:1752`, the whole outcome message:

```js
this.did('craft', `I made ${what} at the fire`);
```

Output named, **inputs named nowhere.** Evidence this matters: both minds executed
`fletch_arrows` successfully — Eachann four times (h7.66, h12.86, h14.59, h23.21),
Coinneach once (h12.82) — and *neither learned that arrows come from wood.*
Eachann watched `wood:14` become `wood:7, arrow:20` between two consecutive
samples (s623→s624) and then spent the next five game hours on the single goal
`offer arrow to Coinneach for flint`, `why: "need flint to make more arrows"`,
carrying ten more branches. Coinneach's live plan is `["get flint from the
scaur","trade Eachann for arrows","hunt the deer west"]` — step one is a substance
with zero matches in the codebase.

Fix: name the inputs in the deed. `I made 12 arrows at the fire, from 6 branches`
— the recipe object is right there at the call site. One line. It converts every
successful craft into a lesson, and it is the cheapest possible answer to the
delusion that has now eaten two vendors' entire evening. Do this **with** A35
(which covers what *can* be made); this one covers what *was just* made, and it is
the stronger half because it needs no gate, no threshold and no new surface.

### A38 †† CORRECTION TO A36 — kimi-k2.6 IS INTERMITTENT, NOT DEAD, WHICH IS WORSE **[S]**
A36 said the seat "degrades to total failure." Too strong. Traced further:

```
s574  Coinneach 61 answered / 61 failed   ← A36's reading
s640  63 / 72        s660  65 / 74        live  65 / 75
```

**Four answers in 91 samples (~30 real minutes)**, ~54% run-wide failure
(75 of 140) — and the answers that land are *good* (the three-step plan above is
one of them). So it recovers and relapses. That is harder to detect than a dead
seat, because the card keeps changing and looks healthy.

Consequence for the A36 fix: the proposed `STALE` tag must **clear and re-arm**,
not latch on first offence, or an intermittent seat will wear it permanently and
be ignored. Pair it with a visible `answered/calls` ratio on the card — the
failure rate is the signal, and it is currently only in the JSON. The one-shot
"JSON only" repair retry (A25) is still the actual remedy; at 54% it would roughly
halve the loss.

## Added 2026-08-08 21:06, from RUN 2 EIGHTH LOOK — twelve unreported deaths, and a liar nobody could catch

### A39 ††† STARVATION DEATH BYPASSES `onPlayerDied` ENTIRELY — TWELVE DEATHS, ZERO EVENTS **[S]**

*The organising finding of the eighth look, and I believe the single highest-value
fix left on this list.*

Twelve respawns in 764 samples (six per mind), each identified by `hp→100`,
`food→85` and a teleport to the same shore spawn ~340 m north-east of Rowan Moor.
Eleven of the twelve kept the full pack through death.

`onPlayerDied` (`src/sim/world.js:918`) — the only code that drops the pack and
pushes `k:'death'` — is called from exactly two places, `world.js:353` (arrow) and
`world.js:849` (creature). **Nothing calls it for hunger or cold.** `Vitals` revives
itself at `src/player/vitals.js:155` and `onRespawn` moves the feet.

So the most consequential thing that can happen to a mind produces:
no event, no deed, no memory entry, no board field, and no dropped gear. A mind
starved at hour 6.6 and woke at 6.9 across the map at full health with its branches
still on its back, and **was never told.** Neither mind can know it has died six
times, which is the simplest available explanation for both walking the same loop
into the same hole all run.

**Fix:** call `onPlayerDied(player, null)` from the vitals death path so the `death`
event fires and the drop rule applies uniformly (`by` already falls back to
`'the cold'`, which is finally true). Then surface it — a `deaths` count on the
card and a `did('death', ...)` the mind can actually read. Small change, and it
turns the world's most important event from invisible to legible.

### A40 ††† A FAILED `accept` IS TOTALLY SILENT — THE "FOUND OUT" IS NOT IMPLEMENTED **[S]**

*Sharpens A16 with the case that proves it.*

At hour 22 Eachann offered "arrows for 9 branches" while carrying **a bow and
nothing else**. Coinneach held exactly nine branches, said *"Done. Nine branches
for the arrows,"* and spent four consecutive decisions on `take Eachann offer`.

`resolveAccept` returned silently at `if (giver.inventory.countOf(deal.item) < 1)
return;`. No event, no `glance`, no `refusedVerbs.accept`. The design comment at
`world.js:699` says a mind "can offer what it does not have **and be found out**."
Nothing in the code implements the finding-out. Whole-run evidence: **zero `trade`
deeds in 764 samples, zero `I traded` strings in 3.7 MB of log.**

**Fix:** every one of the seven silent `return`s in `resolveAccept` pushes a
`glance`-style event naming the reason, at minimum to the taker. "Eachann has no
arrow" is the single sentence that would have ended a four-hour deadlock, and it
is also what makes a liar cost something — which is the entire point of allowing
the lie.

### A41 ††† `offer`/`accept` MOVE EXACTLY ONE ITEM FOR ONE — THE MINDS BARGAIN IN QUANTITIES **[M]**

*Narrower and more actionable than A18.*

```js
if (giver.inventory.remove(deal.item, 1) !== 1) return;
if (taker.inventory.remove(deal.want, 1) !== 1) { giver.inventory.add(deal.item, 1); return; }
```

Hardcoded `1` on both sides, and `offer` has no quantity field at all. "Nine
branches for the arrows" was never executable **even with a full quiver.**

Both minds bargain in quantities constantly and have all run: *"one hide for two
venison"*, *"nine branches for arrows, or I'll owe you"*, *"one branch for one
arrow"*. They are negotiating in a language the verb cannot represent, and then
the silence of A40 means they never learn that.

**Fix:** `offer` takes `n` and `wantN` (default 1); `resolveAccept` moves those
counts all-or-nothing with the existing rollback discipline. The models are already
writing the numbers — the world just has to read them.

### A42 †† A HIGH FAILURE RATE IS AS BAD AS A SPENT BUDGET, AND ONLY ONE OF THEM HAS A TAG **[S]**

Coinneach: 156 calls, **83 failures, 73 answered** — a 53% failure rate on
`no json in reply`. `providers.js:398` returns `this.fallback.decide(brief)` on
every failure, so **half of that seat's run was the scripted brain wearing kimi's
name.** The seat sat at 156 of 1500 calls with `spent: false`, so the red `SPENT`
tag would never have fired.

**Fix:** a `FALLING BACK` tag on the card, same visual weight as `SPENT`, armed
above ~20% failure over a rolling window and able to clear. Extends the A36/A38
`STALE` proposal to the case that actually occurred. Any run report should also
print *answered* decisions, never *calls*, as the seat's real sample size.

### A43 †† CADENCE ASYMMETRY INVALIDATES MODEL COMPARISON — 599 REAL DECISIONS TO 73 **[S]**

`roster-duo.json` gives Eachann a 20 s cadence and Coinneach 75 s. Combined with
A42, real model decisions this run ran **599 to 73 — 8:1.** Everything comparative
in the last eight entries rests on that, including A21's "`plan` splits the models
cleanly."

**Fix:** equal cadence is the default for any run intended to compare models, and
the board should print each seat's answered-decision count next to its name so the
asymmetry is impossible to miss. Cadence stays a knob for *watchability* runs, not
benchmark runs — this is the Part D "world frozen, model the only variable"
principle applied to the one variable nobody was controlling.

### A44 †† `analyse.mjs` REPORTS `accept` AS NEVER USED, AND IT IS THE MOST-USED SOCIAL VERB **[S]**

The analyser tests `goal.toLowerCase().includes('accept')`, but `goals.js:137`
renders the verb as `` `take ${p.target} offer` ``. The word never appears, so
`accept` can never match. Counted properly: **175 samples for Eachann, 150 for
Coinneach.** `attack`, `follow`, `guard` are genuinely unused; `accept` is not.

This is the eighth time the instrument made a model look worse than it was, and
the first time the instrument was the analyser every entry has been quoting.

**Fix:** match on `goal.kind` — the id is right there — instead of grepping the
human-readable `describe()` string. Every verb-usage number in entries 1–7 should
be treated as a floor until re-derived.

### A45 † CORRECTION TO A31/A34 — `refusedVerbs` WORKS; IT IS SPARSE, NOT UNREACHABLE **[—]**

A31 said "zero bytes across two full runs"; A34 corrected that to "not broken,
unreachable". Both are now wrong. Eachann's card carries `{"avoid": 16}`, first
seen at sample 678. The plumbing is fine.

It stays nearly blank for a different reason than either entry guessed: the
refusal paths that *would* be informative are the ones that `return` silently
without calling `this.refuse` at all — A40 being the important one. Wiring A40
will populate this column on its own.

### A46 † CARCASSES ARE REACHABLE AND STILL MOSTLY IGNORED **[S]**

`gather venison` now fires — Eachann 3, Coinneach 1, plus 2 `venison_cooked` — so
the 2026-08-08 fix works. But against **8 kills and twelve starvation deaths**,
they still walk away from meat far more often than they eat it. Not an instrument
fault this time; worth one cheap nudge (the kill outcome naming the carcass and
what it yields) before concluding anything about the models.

### A47 ††† AN ITEM NAME IS NEVER NORMALISED, SO "branches" ≠ `wood` AND THE TRADE DIES SILENTLY **[S]**

`resolveOffer` (`world.js:725`) stores the model's raw `item`/`want` strings and
`resolveAccept` (`world.js:763-764`) counts them verbatim. A grep for
alias/synonym/normalise across `src` returns **nothing** — there is no mapping
layer anywhere in the codebase.

The id is `wood`. The world's own deed text is *"I picked up 10 **branches**"*.
Both minds say "branches" in every single trade line of the run. Evidence that
something beyond the known liar-path is blocking trades: **118 samples where
Coinneach was accepting, Eachann held 13 arrows and 76 wood, Coinneach held wood —
and 0 trades in 846 samples.** The packs were full and it still would not close.

**Fix:** one normalisation function on the way in — plurals, the world's own
display nouns ("branch"/"branches" → `wood`, "meat" → `venison`), case, articles —
shared by `offer`, `accept`, `give` and `gather`. Then a `refuse('accept', …)`
naming the unrecognised word, so the next failure is legible instead of inferred.
This is the highest-value small fix on the list: it plausibly unblocks the one
behaviour the roster exists to test.

### A48 ††† `resolveAccept` HAS SIX SILENT `return`s, AND SILENCE CAPTURES BOTH MINDS FOR THE REST OF THE DAY **[S]**

Lines 749, 752, 758, 762, 763, 764 — dead, no offer, out of range, untradeable
item, giver short, taker short. Every one returns without an event, a `glance`, or
a `refusedVerbs` tick. A40 asked for this on the giver path; the run shows the cost
is far larger than one lost swap.

The nine-branches haggle was **still live at the final sample of a 279-minute run**,
and trade attempts appear in **421 of 846 samples — half the run, zero
completions.** Eachann's last words are *"nine mine now"*; Coinneach's last plan is
still `["gather nine branches","trade to Eachann for arrows","hunt the deer"]`.
Neither mind ever concludes the deal is impossible, because nothing ever says it
failed. Both hit `food 0` while standing in the deadlock.

**Fix:** give all six a `refuse('accept', <reason>)` with the specific reason, and
put the standing offer on the board card. Right now `player.offer` is not exposed,
so a dead trade is undiagnosable from the board — which is why this took nine
entries to reach.

### A49 †† THE DEFAULT PRICE IS GOLD, AND THE MOST GOLD EITHER MIND EVER HELD WAS 2 **[S]**

`world.js:725` defaults an unpriced `want` to `gold` on the reasonable ground that
"sell you this venison" means "for coin". In this world it does not. Across 279
minutes the peak holding was **2 gold for Eachann (sample 67) and 2 for Coinneach
(sample 332)**; both finished on 0. An unpriced offer therefore resolves against a
currency that does not circulate and fails at line 764 — silently, per A48.

**Fix:** either make coin actually circulate (game drops, or paying for kills), or
default the price to *barter* — refuse the offer and ask for a price — rather than
to a token the world barely issues. Defaulting to a plausible-sounding dead end is
worse than defaulting to a refusal that says what is missing.

### A50 † OFFER AND ACCEPT MOVE EXACTLY ONE ITEM, AND BOTH MINDS ONLY EVER BARGAIN IN QUANTITIES **[M]**

Restated from the last entry because the new data hardens it: with the packs full
for 118 samples, a *successful* accept would still have moved one arrow for one
branch against an agreed price of nine. Every trade line in the run names a
quantity — *"one hide for two venison"*, *"nine branches for the arrows"*,
*"twenty arrows mine now"*.

**Fix:** add `n` to both sides of `offer` and honour it in `resolveAccept`'s
all-or-nothing swap. Until then the verb cannot express any deal these models
actually make, and A47/A48 would only get them a worse trade than the one they
agreed to.

### A51 ††† THE SPEECH THROTTLE IS TUNED AGAINST CADENCE, EATS HALF A FAST SEAT'S LINES, AND IS SILENT **[S]**

`agent.js:1123` gates `say` on `sinceSpoke > AGENTS.speakEveryHours`, and `:1144`
logs the drop to the console and returns. In the 22:05 run **338 lines were eaten,
133 of them distinct, 100% of them Eachann's** — 47% of his answered turns.
Coinneach lost none. The cause is arithmetic, not intent: ~0.3 game hours pass per
20 s, so `speakEveryHours: 0.5` (`config.js:934`) ≈ **33 real seconds**, and
Eachann's cadence is 20 s while Coinneach's is 75 s. A faster seat is gagged for
being fast. The swallowed lines include `"deal struck"` ×7 and `"deal, arrow now"`
×15 — **the throttle was eating the acceptances during the deadlock of A47/A48.**

**Fix, in order of value:** (1) make the gate per-*mind-turn* rather than per game
hour, or scale it by that seat's cadence, so no seat is penalised for thinking
often; (2) never drop a `say` silently — feed it back as
`refuse('say', 'too soon, 0.12h to wait')` so the mind stops repeating into a wall.
This also revises every earlier note calling grok "repetitive": some of that
repetition is the instrument.

### A52 ††† DEATH CONFISCATES THE PACK AND THE MIND IS NEVER TOLD **[S]**

`#679 → #680`: hp 67, food 23, **20 arrows, 10 wood** → hp 100, food 84, **0
arrows, 0 wood**, in one 20-second step, after 33 damage near a troll. Eachann then
ran the rest of the session on `plan: ["get arrows","hunt troll for pay"]` and
`"anyone seen loose arrows?"` — sound reasoning from a pack he does not know was
emptied. Both minds have now held **zero arrows for 200 consecutive samples** and
are still forming hunting goals. Deaths are frequent (93 and 72 wounded samples,
clean `95→0` slopes at ~11 hp/sample) and entirely unannounced.

**Fix:** on respawn, put it in the brief — *"you died near Black Moss; you lost 20
arrows and 10 branches"* — and add a `deeds` entry so it shows on the card. If the
drop is meant to be recoverable, say where it fell. A world that takes your
inventory without a sentence makes every downstream decision look like stupidity.

### A53 ††† A GATHER YIELDS 9.8 BRANCHES AND A FIRE COSTS 10 — THE 10× PRICE BOUGHT ONE ACTION **[S]**

Whole-run wood economy: **560 distinct gathers, 5,474 branches** (Eachann
366/3,720 = 10.2 each; Coinneach 194/1,754 = 9.0 each). Raising the fire price from
1 to 10 therefore raised the cost of a fire from *one-tenth of a gather* to *one
gather*, and fires went **up**: 126 here versus the 106 that motivated the change.
A32 diagnosed the symptom; this is the cause — the yield was never looked at.

**Fix:** price the fire against the *gather*, not against the branch. Either drop
the per-gather yield to ~2–3 (a bundle of deadfall, not a cord of wood), or raise
the fire to ~40, or make gathering cost real time. Any of the three makes wood a
decision; none of them is the current state, where one bend of the back is one
night's fire.

### A54 †† BOTH VENDORS TALK TO A "Ben" WHO IS NOT IN THE WORLD **[M]**

Every `minds.log` line reads `2 alive`. There is no third body. Both minds
nevertheless address one: *"Ben, got meat if you need it"* (grok), *"doing fine,
Ben. got food to trade?"* (kimi), and — worst — *"where are those arrows Ben spoke
of"*, which invents a remembered conversation and then plans against it. Two
independent vendors converging on the same absent name is a prompt smell, not a
coincidence.

**Fix:** audit the brief for anything that names or implies a third party (the
`also out there` block, the worked examples in `agent.js:83` and `hud.js:307` both
literally use "Ben" — check none of that text ships into the prompt). Then state
the roster explicitly in the brief: *"there are two people alive in this world: you
and Coinneach."* A mind that hallucinates a trading partner will never close a
trade with the real one.

## Added 2026-08-08 22:40, from RUN 2 samples 934–1027 — the flint delusion

### A55 ††† BOTH MODELS INVENTED "FLINT" AND "FEATHERS" AND BUILT THE ARROW ECONOMY ON THEM **[S]**

`fletch_arrows` (`src/items/recipes.js:105`) is `{ inputs: { wood: 2 }, outputs:
{ arrow: 4 }, requires: 'fire' }`. **Two branches at a fire.** `flint` and `feather`
do not exist anywhere in `src/`, `server/`, or any brief text — grep returns only
the word "feathered" in two terrain comments.

Both vendors invented both items and spent the run acquiring them. Coinneach's plan
for **254 of 1027 samples**: `["find feathers or flint","fletch arrows"]`; for 146
more, `["get flint from the scaur", …]`. Eachann out loud: *"anyone got flint or
feathers?"*, *"arrow for flint"*, *"got branches for your flint"*. Coinneach starves
at food 9 holding 9 wood beside his own fire, 2 branches from four arrows.

This is A54's disease in a second organ: a model fills a gap in the brief with its
real-world prior, then plans against the invention for hours. It is *also* the actual
cause of the nine-branches deadlock — not the `resolveAccept` bug I first blamed.

**Fix (cheap, and it fixes A54 too):** the brief must state the closed world, not
imply it. Give every mind (a) **the full recipe book with its literal inputs** —
"fletch arrows: 2 wood, at a fire" — and (b) **the complete item list that exists**,
and say plainly that nothing else does. A mind that can read the recipe cannot
haggle for a reagent that was never in it. Today the brief advertises the *verb*
`craft` and never the *cost*, so the model supplies the cost from Wikipedia.

### A56 †† `this.acted` ALREADY COUNTS EVERY OFFER AND ACCEPT ATTEMPT AND IS NEVER PUBLISHED **[S]**

`agent.js:1288` does `this.acted[this.target.act]++` for every act that reaches
REACH, including `offer` and `accept`; `agent.js:1610` does the same for every deed.
`server/board.js` never reads it. So the board can show that a mind *intended* to
trade and that no trade *completed*, and has no column for the middle — did the body
arrive and reach for it?

That middle is exactly what has been unknowable for three runs. `refusedVerbs`
cannot fill the gap: it stayed `{avoid: 16}` / `{}` across all 1027 samples, because
`resolveAccept`'s eight bare `return`s (`world.js:749–764`) call neither `refuse()`
nor `did()`.

**Fix:** add `acted` to the card next to `refusedVerbs` (one line in `board.js:287`),
and make each of the eight `return`s in `resolveAccept` call
`taker.refuse('accept', <the actual reason>)` first — "he is not holding a hide",
"you are not holding branches", "nobody has offered you anything". Then a failed
bargain teaches both the mind and the watcher, and A9/A49's hypotheses become
one-glance readable instead of grep-and-guess.

### A57 †† THE BENCH CANNOT SEPARATE MODEL QUALITY FROM DECISIONS PER HOUR **[M]**

Eachann finished the window thriving (18 arrows, food 59, 8 kills, 17 crafts);
Coinneach starving (0 arrows, food 9, 2 kills, 3 crafts). Tempting to read as
grok > kimi. It is not readable: **785 answered decisions vs 99** — a 20 s vs 75 s
cadence *multiplied by* kimi's 53% `no json in reply` rate (110 of 210). ~8× the
effective agency. Three variables moved at once.

**Fix:** make cadence and *answered*-call budget the controlled axes. Pair seats at
identical cadence, and spend the budget in *answered* calls rather than attempted
ones so a 53%-failure vendor gets the same number of real turns. Ideally run the
same model in both seats once as a null control — if two grok seats diverge this far
on their own, none of the cross-model rankings in this file mean anything.

## Added 2026-08-08 23:06, from RUN 2 samples 1027–1124 — the two death rules

### A58 ††† THE WORLD HAS TWO OPPOSITE DEATH RULES AND NOBODY CHOSE EITHER **[S]**

*Sharpens A39 and A52, which are both right and describe different code paths.*

- **Killed by a creature or an arrow** → `onPlayerDied` (`world.js:353`, `:849`) →
  the pack is dropped on the ground. A52 measured it: 20 arrows and 10 wood gone in
  one step.
- **Starved** → `Vitals` revives itself, `onPlayerDied` is never called → **hp→100,
  food→85, teleport to spawn, pack untouched.**

Whole-run census, 1124 samples: **17 starvation deaths (Eachann 8, Coinneach 9), 16
of them byte-identical packs across the death.** Coinneach's ninth, at `at`16136,
restored him from `food 0 / hp 4` to `food 85 / hp 100` and kept the 12 arrows he
had spent the day trying to buy.

So the world punishes bad luck with total confiscation and punishes bad planning
with a free meal. **Starving is currently the cheapest food source in the game**,
which removes the only standing reason to trade for food — and both minds have
spent all day trying to trade for food.

**Fix:** pick one rule and apply it to both paths. Route the vitals death through
`onPlayerDied(player, null)` (A39's fix) so the `death` event fires; then decide the
drop rule *once*, deliberately, and make hunger cost something — even "you wake with
half your pack and no food" would restore the pressure. Whatever is chosen, say it
in the brief (A52).

### A59 †† A LIE IS NEVER FOUND OUT, WHICH IS THE ONE THING THE NO-ESCROW DESIGN WAS FOR **[S]**

`resolveOffer`'s comment is explicit that nothing is reserved *so that* "a mind can
offer what it does not have and be found out." Measured: Eachann holds venison in
**194 of 1124 samples (17%)**, last held any at `at`16063, and has advertised
*"got meat"* / *"I'll give you some meat for fifty"* continuously since. Coinneach
walked to him for it.

But `resolveAccept` returns bare at `giver.inventory.countOf(deal.item) < 1`
(`world.js:763`). Nothing is said, nothing is logged, no `k:'trade'` and no
`k:'welch'`. The liar is never caught, the mark never learns, and the roster's
stated experiment — *"this roster has a liar in it to test"* — has produced no
readable result in three runs.

**Fix:** the cheapest half of A48 with the highest payoff — push a
`k:'welched'` event when the giver comes up short, so both minds get
*"Eachann had no venison after all"* in memory and the board gets a column. That one
event turns the no-escrow design from an untested claim into the observable it was
built to be.

### A60 † CORRECTION TO A53's ARITHMETIC — THE YIELD IS 11.6, NOT 9.8 **[—]**

A53 measured 560 gathers / 5,474 branches at sample 934. Closing numbers over all
1124: **769 gathers, 8,939 branches — 11.6 per gather — and 145 fires** (Eachann 93,
Coinneach 52). The conclusion is unchanged and slightly stronger: a fire costs
*less* than one gather, and fires rose again (145 vs the 126 at sample 934 and the
106 that motivated the 10× price rise). Both minds close the run sitting on ~74
branches each while negotiating over branches. A53's fix stands; the target yield
should be ~2–3, not ~9.

### A61 ††† `giftFrom` SILENTLY SUBSTITUTES WHEN YOU NAME SOMETHING YOU DO NOT HAVE **[S]**

`giftFrom` (`world.js:802–816`) is documented as *"what to hand over when a mind did
not say."* It is also, unmarked, what happens when a mind **did** say and was wrong:
named → any edible → **largest stack**, no signal at any step.

Live, `at`18513: Eachann's goal is `give venison to Coinneach`, he says *"Here's the
meat"*, he holds **no venison**, and the engine hands Coinneach a branch off his
124-stack. Deed reads *"I gave wood to Coinneach"*. Fifty-five branches have moved
this way. Neither mind has been told a substitution occurred; the receiver gets no
event naming the item at all.

**Fix:** when `itemId` was named and is not held, **refuse** rather than substitute —
`this.refuse('give', "you have no venison")` — and keep the largest-stack fallback
only for the genuinely unnamed case the docstring describes. Then push the item name
to the *receiver* in the `gift` event so he can see he was handed firewood. Two lines
and it converts the single most confusing behaviour in the run into a legible one.

### A62 ††† NO QUANTITY EXISTS ANYWHERE IN THE TRANSFER PROTOCOL, AND EVERY PRICE EVER NAMED IS A QUANTITY **[M]**

Extends A50 from `offer`/`accept` to the whole surface. `resolveGive(from, toName,
itemId)` has **no count parameter**; the body hardcodes `remove(id, 1)` / `add(id, 1)`
(`world.js:682–687`); the intent is `{give, giveItem}`. Same for offer and accept.

It is deliberate — `world.js:1149` edge-detects `give` because `givecheck` once moved
*"twelve arrows … the entire stack and not what anybody asked for."* The stack was the
bug; one-per-press was the fix. But three negotiations in, **every price either model
has named is a number** — two venison, nine branches, fifty branches — and fifty
branches is fifty decisions, ~17 game-hours at a 20 s cadence. Observed: a `-6 wood`
step is six separate gives.

**Fix:** add `n` to the give/offer/accept intents (clamp to the stack and to something
sane like 99), pass it through `resolveGive`/`resolveAccept`, and keep the rising-edge
contract — one *press*, one *transfer of n*. This is the single change that would let
any bargain in this world actually close.

### A63 †† `refusedVerbs` IS WIRED TO THE ONE PLACE REFUSALS DO NOT HAPPEN **[S]**

Sharpens A56 with the cause. `grep -o "this.refuse('...'"` over `agent.js` returns
**seven call sites, exactly one per verb** (`avoid, give, offer, accept, attack, hunt,
gather`) — and all seven are the same pre-flight lookup: *"there is nobody called X."*
Every downstream failure (out of range, don't hold it, no matching offer) is a silent
`return` in `world.js`.

`avoid` is the only verb whose *sole* failure mode **is** the name lookup. That is the
entire reason the column has read `{avoid: 16}` / `{}` for 1,202 straight samples
across two vendors. It is not under-tuned; it is blind to every failure that happens
after a name resolves, which is all of them.

**Fix:** A56's `this.acted` publish, plus give `world.js`'s silent `return`s a reason
channel — the eight in `resolveAccept` (`749–764`), the three in `resolveGive`
(`669/675/678`). Cheapest version: have them push `{k:'refused', verb, why}` and let
`agent.js` fold that into the same counter. The column then earns the billing it was
given.

### A64 † CORRECTION — GIVES ARE 45, NOT 29/30, AND STARVATION DEATHS ARE 20, NOT 17 **[—]**

Closing counts over all 1,202 samples, superseding the sample-1027 and sample-1124
entries: **45 give deeds, every one Eachann's** (Coinneach has never given anything to
anyone, all run, zero reverse transfers measured). **20 starvation deaths — Eachann 9,
Coinneach 11 — 18 of them keeping the pack byte for byte.** Conclusions in A58 and the
give-direction finding are unchanged and stronger.

### A65 †† CARCASSES WORK — FIRST LIVE CONFIRMATION, CLOSE THE LOOP ON THE REST **[S]**

Logged for the record, since seven fixes landed 2026-08-08 and this is the first one
*observed working with real models*: `gather venison` fired **5 times** (Eachann 3, 3,
4, 2 at h0.37/h7.80/h9.68/h21.17; Coinneach 4 at h12.02) and fed **12 cooks** at fires.
Minds now eat what they kill.

Scoreboard for the other six, same run: **`say` — works, transformative** (105 + 53
distinct lines vs one sentence in two prior days). **`plan` — works** (1198/1202 and
955/1202 samples). **`note` — dead, thirteenth zero; retire it.** **`offer` price
defaulting to gold — untestable, peak gold either mind ever held is 2 (A49).**
**offer/give walking you to the person — works, they meet.** **10-branch fires — still
too cheap (A53/A60).** Worth keeping this table per-run: it is the only thing that
tells us a fix survived contact.

### A66 ††† "no food" MEANS AN EMPTY PACK, NOT AN EMPTY STOMACH — AND THE MIND IS NEVER TOLD WHICH **[S]**

Coinneach's card at sample 1,294: `why "he is near and I have no food"` — while
holding **food 59, health 100**, which `agent.js:950-952` classes as **`fed`**.

The two facts are computed twelve lines apart and only one of them is a number:

```
agent.js:950-952   hunger: food<=0 'starving' | food<25 'hungry' | else 'fed'
agent.js:991       !EDIBLE.some((id) => this.count(id) > 0) && 'no food'
```

Line 991 is a **larder** check. It fires whenever you carry nothing edible, at any
hunger level, and it hands the mind the English phrase *"no food"* — which every
model that has ever read it has correctly understood to mean *starving*. This is very
likely a large share of the "starving" talk throughout this run and the last
(*"starving, need arrows or meat now"*, *"starving. I'll owe you for a meal"*) — and
of the panic-trading that follows it, which is otherwise hard to explain in a mind at
food 59.

**Fix:** rename the flag to what it is — `'pack empty of food'` — and pass the hunger
word alongside it, so a mind can read *"fed, pack empty of food"* and tell a supply
problem from a survival one. Two string edits. Sixth confirmed case of the instrument
making a mind look incompetent (A29, A41, A50, A57, A61).

### A67 † CORRECTION — GIVES ARE 61, NOT 45, AND THE DRAIN ACCELERATES WITH THE NEGOTIATION **[—]**

Supersedes A64 (45), which superseded 29/30. Over 1,294 samples: **61 give deeds,
every one Eachann's; Coinneach has still given nothing to anyone, ever** — wood 29,
arrow 19, hide 8, gold 2, venison_cooked 3.

The new number matters because of *where* it landed. **26 of the 61 happened in the
last 92 samples — 7% of the run carrying 43% of the transfers.** The one-per-tick
edge-detector (A62) is not a slow trickle; it is a pump whose rate rises the longer a
haggle stays open, because an unsettled price keeps `give` on the wire every turn.

Worst consequence, measured this window: Eachann's plan is `["get arrows","hunt troll
for pay"]` and he **gave away ten arrows** during it. **An open negotiation drains the
negotiator of the exact good he is negotiating for.** Whatever A62's quantity fix
looks like, it should close the intent the moment a transfer completes, or this gets
worse as models get more persistent — not better.

### A68 ††† `accept` MATCHES ITEM IDS BY EXACT STRING WHILE `give` FORGIVES THEM — AND EVERY PRICE A MODEL NAMES IS A PHRASE **[M]**

The reason `give` has 58 deeds this run and `accept` has **zero, across the whole
24-hour day and two vendors**, with the same two models pressing both buttons.

`resolveGive` goes through `giftFrom` (`world.js:802–810`): **named item → else any
edible → else best slot.** A bad noun still moves goods. `resolveAccept`
(`world.js:763–764`) has no such fallback:

```js
if (giver.inventory.countOf(deal.item) < 1) return;   // deal.item = "meat"
if (taker.inventory.countOf(deal.want) < 1) return;   // deal.want = "6 arrows"
```

`sanitiseGoal` strips control chars and caps at 40 (`goals.js:193`); it never maps a
word to an item id. Every price either mind named this run is a phrase, not an id —
*"6 arrows"*, *"two venison"*, *"nine branches"*, and *"meat"* / *"flint"*, which are
not items in this world at all. The final handshake of the run asks
`countOf("6 arrows")` when the id is `arrow`.

**This subsumes half of A62.** Quantity is genuinely missing, but adding `n` to the
intents would not have closed one bargain here, because the *noun* fails first.

**Fix, in order:**
1. **Resolve the noun.** One `itemFrom(text)` shared by give/offer/accept: lowercase,
   strip a leading count, singularise, then an alias table (`meat|venison|steak →
   venison`, `branch|branches|firewood|deadfall → wood`, `arrows → arrow`). Return
   the count it stripped — that is A62's `n` for free, from the same parse.
2. **Then** thread `n` through `resolveAccept` per A62, clamped to both stacks.
3. **Refuse loudly when it still fails** (A63) — `there is no "flint" in this world`
   is a sentence that ends a fifteen-turn loop; silence extends it.

### A69 †† THE ITEM VOCABULARY IS NEVER SHOWN TO THE MIND, SO BOTH MODELS INVENTED ONE **[S]**

Sharpens A54 (`flint`/`feathers`) with this run's wider evidence: `meat`, `flint`,
`feathers`, `branches`, `deadfall` all appear as trade nouns and **none is an item
id**. The pack is rendered to the mind in English prose (*"36 branches"*), so a model
naturally prices in English and there is nowhere it could learn that the id is `wood`.

**Fix:** print the tradeable ids verbatim in the prompt — one line,
`tradeable: wood, arrow, hide, venison, venison_cooked, gold` — and echo the id back
in the pack line (`wood ×36 (branches)`). This is the cheap half of A68; ship it in
the same change or the alias table will just keep growing.

### A70 † RETIRE `note`, KEEP `plan` — FIFTEENTH CHECK, AND NOW THERE IS A CONTRAST **[S]**

`note` is empty on all 1,378 cards this run, both vendors, as on every run before it.
`plan` is the opposite: **4 distinct for Eachann, 17 for Coinneach**, and they track
the live negotiation — `["gather nine branches","trade to Eachann for arrows","hunt
the deer"]` becoming `["gather to fifty","get meat from Eachann","hunt if he won't
deal"]`. A plan is written, survives, and steers the next hour of behaviour.

The difference is that `plan` answers a question the mind already has ("what next")
and `note` asks it to keep a diary nobody reads back. **Delete `note` and give its
prompt budget and its card column to `plan`.**

### A71 † FIRES: THE 10-BRANCH PRICE DID NOT BITE, AND PRICING IS THE WRONG LEVER **[S]**

**153 fires sampled** this run (Eachann 97, Coinneach 56) — no better than the 106
that motivated the 10× price rise. Peak wood carried was **154 / 88**; Eachann ends
the day holding 36 with 538 gather deeds behind him. Wood is not scarce at any price
a forager can't out-gather, and gathering is free.

**Fix:** stop pricing the fire and price the *ground*. Cap standing fires per person
(a second `place` moves your fire rather than adding one), or make deadfall a finite
node that depletes and regrows on a timer. Raising the branch cost again just raises
the gather count.

## Added 2026-08-09 01:05, from RUN 2 samples 1378–1474 — the death that the trade bug caused

### A72 ††† STARVATION DEATH IS FREE — FULL HEALTH, FOOD 84, PACK INTACT, 25 TIMES **[M]**

*Correction to A52, which said death confiscates the pack.* Over 1,474 samples,
`hp ≤ 20 → hp ≥ 95` fires **25 times** (Eachann 12, Coinneach 13) and the pack is
**byte-identical across 24 of them**. Coinneach at `at21808`: `hp4 food0
[bow:1,wood:6,arrow:18]` → `hp100 food84 [bow:1,wood:6,arrow:18]`. 24 of 25 are
`food 0 → 84/85`, i.e. starvation. A52 generalised from one troll mauling (food 23),
which is A58's *other* death rule; even that one only trimmed wood (154 → 40), which
reads as a respawn carry cap, not confiscation.

So the loop is: forage, ignore hunger, die, wake at full health with your kit and a
full belly, repeat — 25 times in 490 minutes. **Every scarcity lever in this world
(fire cost A53/A71, arrow economy A55, the whole trade protocol) is downstream of a
death that costs nothing.** Eachann ends the run at food 19 holding 40 branches, 7
hides and 14 arrows after 804 branch gathers: the richest man in the world, starving
on a schedule, correctly, because starving is cheaper than stopping to eat.

**Fix, cheapest first:** make the starvation respawn cost something a mind can feel
and *is told about* — wake at food 30 not 84, drop the pack where you fell as a
gatherable, or park the seat for N ticks. Any of the three makes food a real
constraint. Do this **before** tuning fire prices or arrow yields; those are noise
until dying hurts.

### A73 ††† THE `accept` STRING BUG IS NOW A CAUSE OF DEATH, NOT JUST A MISSING FEATURE **[S]**

Eleven consecutive samples, `at21662 → at21793`, Coinneach at food 0 with health
falling `100 → 4`, goal unchanged the whole way: `take Eachann offer`, `why =
starving, taking meat for arrows`, saying *"Done. Six arrows for the meat."* In the
same eleven samples Eachann held `give meat to Coinneach` and `offer meat to
Coinneach for 6 arrows`, saying *"six arrows for the meat"*.

Both minds agreed a price, both reached for the verb, and `resolveAccept` ran
`countOf("6 arrows")` against the id `arrow`, got 0, and returned silently (A68).
Combined with A48's silence, neither mind ever learned to re-phrase, because from
inside there was nothing to learn from.

**This promotes A68 from [M] polish to the top of the queue.** It is not "trade does
not work yet" — it is the single defect for which we now have an unambiguous live
cost. Ship A68's normaliser (word → id, and harvest the stripped count as A62's `n`)
plus A63's loud refusal, and re-run *this exact roster* to see whether the same two
minds close the same bargain.

### A74 †† A MIND IS NEVER TOLD IT DIED, AND REASONS FROM A BODY 84 FOOD OUT OF DATE **[S]**

Sharper live evidence for A52's surviving half. After respawning at `at21808` with
food 84, Coinneach ran **eight more samples** on `why = starving, taking meat for
arrows`, then `why = need that meat before dark` at food 81 — still negotiating for a
meal he no longer needed, two minutes of wall clock after being filled up. His `plan`
(`["eat what I get","rest until light","hunt at dawn"]`) never updated either, because
nothing contradicted it.

This is the eighth time (A29, A41, A50, A57, A61, A66, A68, now this) the instrument
made a mind look worse than it is. **Fix:** one `deeds` line and one brief line on
respawn — *"you died of hunger near Broad Loch; you woke fed"* — and the mind
self-corrects on the next turn for free.

## Added 2026-08-09 01:34, from RUN 2 samples 1474–1565 — the refusedVerbs census

### A75 ††† `refusedVerbs` CANNOT SEE A SILENT DROP — ONE VERB IN 1,565 SAMPLES **[S]**

*Closes the census opened by A31 → A45 → A63 with a total.* Whole-run contents of
`refusedVerbs`, both cards, every sample: `{"avoid": 16}` on Eachann, `{}` on
Coinneach. Nothing else, ever. In the same run `take <name> offer` was chosen **17
times** for **zero** `accept` deeds, and `offer` was chosen **24 times** for zero
deeds of any kind.

So the column does not distinguish the two cases it was built to distinguish. A verb
nobody wants and a verb that is reached for and silently dropped both render as
absence, because `resolveAccept` misses and returns without incrementing anything.
A56 already noted `this.acted` counts every offer and accept attempt and is never
published — **that counter is the fix.** Publish `attempted` alongside `refusedVerbs`
so the board shows `accept: 17 attempted / 0 landed`, and every future run diagnoses
this class of bug in one glance instead of a 1,500-sample census.

Ship with A63's loud refusal and A68's id normaliser; the three are one change.

### A76 ††† `avoid` WAS REFUSED 16 TIMES TO A BADLY HURT MIND FLEEING A TROLL **[M]**

The single thing `refusedVerbs` has ever caught, and it is a gameplay defect, not an
instrument one. Samples 678–681, sim hour 0.5 → 1.4, all 16 refusals in under an hour:

```
h0.5   avoid → 2    goal = keep away from troll   why = too close to it
h1.1   avoid → 13   goal = keep away from troll   why = badly hurt, no food
h1.4   avoid → 16   goal = make for Black Moss    why = ... need gear first
```

Then never again in 884 further samples — the mind tried the right verb, was told no
sixteen times, and dropped it permanently. Given A58's two death rules, the mauling
path is the one that *does* cost you your kit, so `avoid` is the single verb where a
refusal is most expensive.

**Find out why `avoid` refuses.** If it is a range or line-of-sight gate, loosen it
or let it degrade to plain flight; a mind that has decided to run should always be
able to run. Whatever the reason, it must reach the mind as text (A63) — sixteen
silent nos taught this model that the verb does not exist.

### A77 † CORRECTION TO A67 — GIVES ARE 59 UNIQUE, AND ALL 59 ARE ONE MAN **[—]**

A64 said 45, A67 said 61; the deduped whole-run figure is **59 unique `give` deeds**.
The number matters less than the split: **all 59 are Eachann → Coinneach, and
Coinneach has given nothing to anyone, ever**, across a run in which he said "I'll
owe you" in a dozen phrasings. The one-way pump is not a quirk of one negotiation —
it is the only shape transfer has ever taken in this world, and it is what A62's
missing quantity plus A61's silent substitution produce when a buyer cannot pay.

## Added 2026-08-09 02:05, from RUN 2 — the gather counter, and a dispute with nobody

### A78 ††† THE `gather` DEED IS A BOUT METER THAT MUTATES IN PLACE — EVERY GATHER COUNT IS ~5× TOO HIGH **[S]**

The trailing `gather wood` deed keeps its slot in `deeds` and **counts up** as the mind
walks, advancing its game-hour stamp as it goes. Coinneach, samples 1618–1648: `n` runs
3 → 12 → 29 → 39 → 68 while carried wood runs 19 → 84. That is **one bout of 65
branches**, and any tool that dedupes deeds — by object, by text, or by `(who, hour)` —
records it as **twenty-six separate gathers**.

Whole-run, corrected: **186 bouts** (Eachann 115, Coinneach 71), **2,219 branches**,
mean **11.9 per bout** — against the 919–988 "events" and 13k branches the sampler has
been reporting all run. `analyse.mjs`'s `GATHERS: 988` line is wrong by about 5×.
A60's **11.6 mean is correct** and needs no further revision.

Deeds without an `n` (`place`, `craft`, `killed`, `give`, `eat`) do **not** mutate, so
fires 171 / crafts 30 / kills 16 / gives 59 / eats 17 / accepts 0 all stand.

**Fix:** give every deed a monotonic id, or emit `gather` as a closed event when the
bout ends rather than as a live accumulator. This is A0f's event log again — the board
is a dashboard being read as an instrument, and this is the seventh time that has
produced a wrong number in this file.

### A79 ††† YOU CANNOT PRICE AN ACTION AGAINST AN INCOME — GATHERING IS A RATE **[M]**

*Supersedes A71's "pricing is the wrong lever" with the mechanism and the number.*

Read as bouts, the data gives the missing figure: **Eachann collects ~13.8 branches per
game hour, Coinneach ~8.1, continuously, simply by walking with the gather goal set.**
Nobody chooses to gather; they choose a direction and wood accrues.

A fire costs 10 branches — **under one game hour of walking**. That is why raising the
price tenfold changed nothing (A53 → A71) and why **171 fires** have been lit into a
standing surplus of 84 branches. A one-off cost cannot bind against an unbounded drip
no matter what you set it to.

**Fix candidates, in order of appeal:** a carry cap on wood (also fixes the hoard);
make gathering an *action* that costs time and stops other goals; or make deadfall a
depleting local resource so a hillside can be picked clean. Do **not** raise the fire
price again — that lever is now measured and it does not work.

### A80 †† THE PROPERTY DISPUTE IS A PHANTOM — TWO MINDS, TWO CARCASSES, TWO VALLEYS **[M]**

The best speech this project has produced, and it reached nobody. Verbatim:

```
Coinneach  "I downed it. Find your own, Eachann."  /  "finders keepers, Eachann"
Eachann    "that's mine, find your own"            why = get meat before Coinneach
```

Two competing property norms — *I shot it* vs *finders keepers* — argued by name,
unprompted, over a thing the game does not model. **And they are hundreds of metres
apart**: 93 of 94 samples quote them off different landmarks (Eachann at Heather Scaur
/ Low Rigg, Coinneach at The Sheiling Wood / Kindly Wood), each standing over a
different deer he killed himself.

This upgrades A11. Speech is no longer untargeted — the addressing works perfectly. It
is the *delivery* that is invisible: no `heard` field on the board, no outcome line in
the brief, so a mind cannot tell a landed insult from a shout into fog, and repeats it.

**Fix:** publish `heard` on the card (A0f), and put "nobody was near enough to hear
that" in the next brief. Cheap, and it turns the single best behaviour in the run from
noise into a measurable social channel.

### A81 †† A PLAN CONTAINING "keep an arrow nocked for Eachann" — AND `attack` HAS NEVER BEEN CHOSEN **[S]**

Coinneach's live plan: `["cook it up", "keep an arrow nocked for Eachann"]`. Whole-run
check across 1,652 samples: **`attack`, `follow` and `guard` have never once appeared
as a goal.**

This is A9's exact shape a second time. A mind writes an intention into the plan field,
is handed it back on every call, and never selects the verb that would execute it — it
was *"trade a hide for food"* in the first hour and it is a nocked arrow now. Two
independent instances make this a property of the prompt, not of one negotiation:
**the plan field is a place to write intentions that the verb menu is never connected
to.** Worth testing directly — echo the plan's next step *next to the verb that would
do it* and see whether selection follows.

### A82 †††† `giftFrom` PAYS OUT OF THE WRONG STACK, FOREVER — A GOAL YOU CANNOT FULFIL BECOMES A LEAK **[S]**

**The most damaging bug found in this project so far, and the cheapest to fix.**

Observed live (02:35 entry): Coinneach gave his only hide to Eachann, kept the goal
`"give hide to Eachann"` (why: *"we agreed one for one"*), and the engine went on
"giving the hide" out of his firewood — **141 → 101 branches, six per 20 s, still
running.** Eachann fletched arrows from it (1 → 13).

Cause, [src/sim/world.js:802](src/sim/world.js:802):

```js
giftFrom(p, itemId) {
  if (named && p.inventory.countOf(named) > 0 ...) return named;
  for (const id of EDIBLE) if (p.inventory.countOf(id) > 0) return id;
  ... // otherwise: the biggest stack you own
}
```

The fallback was written so `give` would never silently do nothing. It turns an
*unfulfillable* promise into an **unbounded drain of the giver's most valuable stack**,
and because a substitution is not a refusal it never reaches `refusedVerbs`. This is
the same fallback that handed over firewood "as meat" on 2026-08-08 — confirmed now on
a second model, a second item, and this time *repeating every tick*.

**Fix:** when the named item is absent, **refuse** — `this.refuse('give', "you have no
hide to give")` — and let the mind read it. Keep the fallback only when no item was
named at all. Two lines, and it converts the worst leak in the world into the single
most informative refusal a mind could receive.

### A83 ††† THE TRADE LOOP HAS NO CLOSING VERB A MODEL CAN ACTUALLY REACH **[M]**

Both models negotiated a clean one-for-one bargain in plain English, in character, and
**both picked correct verbs** — Coinneach `give`, Eachann `offer`. It still did not
clear, because:

- `offer` ([world.js:729](src/sim/world.js:729)) is deliberately *words*: it posts a
  promise and **moves nothing**. Correct by design.
- `accept` is the only thing that transfers, and it has fired **0 times in 1,744
  samples** across two days and eight models — it matches item ids by exact string
  while `give` forgives them (A-series, 00:34 entry).

So the world has a market where the *bid* works, the *gift* works, and the **clearing
verb is unreachable**. Every "trade" this project has ever recorded is really one or
two independent gifts that happened to point at each other.

**Fix, in order of cost:** (a) make `accept` match item ids the way `give` does — same
forgiving comparison, one shared helper; (b) put the standing offer **on the taker's
card** ("Eachann offers you cooked venison for hide") so `accept` has an obvious
referent; (c) log an `offer` deed so a posted bid is visible on the board at all —
right now `offer` is the only verb that produces no deed line, which is why nobody
watching could tell Eachann was trying.

### A84 ††††† THE TRADE VERBS HAVE NO QUANTITY FIELD, AND BOTH MODELS PRICE IN QUANTITIES **[M]**

**The root cause under A48, A82 and A83 — and none of those three fixes reach it.**

Observed (03:05 entry): of the 132 distinct things these two minds have said, the priced
ones all name an amount — *"fifty branches for your meat"*, *"nine branches for arrows"*,
*"One hide for two venison"*, *"Six arrows. Robbery, but fine."* The primitive they aim
at cannot hold any of it:

```js
from.offer = { to: to.id, item, want };          // world.js:729 — no count
giver.inventory.remove(deal.item, 1);            // world.js:766 — one for one
taker.inventory.remove(deal.want, 1);
```

`offerItem` and `offerWant` are the only two fields on the wire
([agent.js:1194](src/net/agent.js:1194)). **Every priced bargain either model has struck
this run was unrepresentable at the instant it was struck.** The forty-one-branch `give`
spam is not merely a leak — it is the only way to express "fifty" in this world, one
model call per branch.

**Fix:** add `n` to the offer and to `accept`'s transfer (`offerN`, `wantN`, default 1),
clamp to what both packs hold, and let `give` take a count too. Then teach the prompt
the count exists — the models already write it in prose. Until this lands, A82 and A83
turn a fraudulent trade into a *refused* trade, which is better and still not a market.

### A85 †††† `astray` EXCEEDS `loosed` ON EVERY CARD — THE HIT RATE IS UNCOMPUTABLE **[S]**

Whole run, both minds: Eachann **79 astray / 45 loosed**, Coinneach **232 / 183**.
[board.js:190](server/board.js:190) says in its own comment that loosed is "the honest
denominator" — and the denominator is smaller than the numerator in every sample.

`astray` is `strays.length` off the `shots` log; `loosed` counts `releases` where the
loosed flag is set. Two logs, two writers, no agreement.

This burned a reading in the 03:05 entry: "kimi hits 3%, grok 31%" was written and then
pulled, because the ratio has no meaning. **Any earlier entry in OBSERVATIONS that
quoted accuracy off these two fields is suspect.** Fix: one writer for both, or drop
`loosed` from the card and stop implying a rate that is not there.

### A86 †††† `accept` REQUIRES THE BUYER TO ALREADY HOLD THE SELLER'S PRICE **[S]**

```js
if (taker.inventory.countOf(deal.want) < 1) return;   // world.js:764
```

Structural deadlock, not a string bug (that is A83). The seller names what they want;
the buyer must already be carrying it before the check runs. Observed live: Coinneach
handed over his only hide, then every accept he could reach was dead before evaluation —
the thing he needed to hold was the thing he had just paid with.

Compounding it, `resolveAccept` has **eight bare `return`s** and none reaches the mind,
the board, or `refusedVerbs`. Eachann selected `take Coinneach offer` at h19.24, said
*"here is your venison"*, and got silence identical to choosing a verb that does not
exist.

**Fix:** keep the precondition — it is what stops minting — but **say so**. Each of the
eight returns gets a one-line refusal the mind reads next tick: *"he has posted no
offer"*, *"you have no hide to pay with"*, *"too far — 60 m"*. Eight strings. It would
have turned this run's single most confusing hour into a legible negotiation.

### A87 ††† A GATHERING BOUT HAS NO CAP AND NO EXIT — ONE ATE SEVEN GAME HOURS **[M]**

Coinneach, h21.52 → h04.72, consecutive deeds: `3 · 6 · 8 · 11 · 15 · 17 · 22 · 23 · 27
· 30 · 34 · 37 · 42 · 45 · 48 · 51 · 54 · 56 · 61 · 65 · 68 · 72 · 78 · 79` → one fire.

**One bout, counting up in place, straight through the night.** Nothing in the world
bounded it and nothing on the card told him he was in it — the deed just kept
incrementing, so every call read "still gathering, going well".

Two consequences worth separating: (a) it confirms the bout-meter reading (c05017b) on a
clean single run, and (b) it prices the 10-branch fire honestly at **about three minutes
of one bout** — wood is the only unbounded free good in the world, which is why the
10× fire cost changed nothing and why both minds end their nights holding 100+ branches
and zero gold.

**Fix:** cap the bout (diminishing returns per bout, or a hard stop at ~20), and show
`gathering, 34 so far` as a *state* rather than a rising deed, so a mind can tell "I am
still doing this" from "I did this".

## Added 2026-08-09 03:35, from RUN 2 ELEVENTH LOOK — the goblin took the treasury and told nobody

### A88 †††† A DEATH THAT TAKES YOUR PACK NEVER SAYS WHAT IT TOOK **[S]**

30 respawns this run; 29 kept the pack (starvation path, A39). The one that went
through `onPlayerDied` stripped Coinneach to his bow at hour 2.6:

```
s606 hp=39 food=0  bow x1, hide x13, gold x2, wood x3
s607 hp=100 food=85  bow x1
```

**13 hides and 2 gold — the largest concentration of wealth in the run, and the
buying power behind every bargain either mind attempted all day.** The `death`
event reaches memory ([agent.js:542](src/net/agent.js:542)) as *"Coinneach was
killed by Goblin <place>"* — third person, and **silent about the pack.** The
event already computes `lost: dropped.length` and never renders it. Card otherwise
byte-identical across the wipe: same deeds, same goal, same `why`.

**Fix (three strings, no new state):** make the victim's own memory first-person
and itemised — *"A goblin killed me at Broad Loch. My 13 hides, 2 gold and 3
branches are lying where I fell."* `onPlayerDied` already has `dropped` and `at`.
Then the mind can go back for it, which is the only reason the drop rule exists.

**Resolves the loose end in A39** ("eleven of the twelve kept the full pack") —
the twelfth was the creature path, working as written. A39's fix stands and this
is its other half: A39 makes starvation *fire* the event, A88 makes the event
*legible to the person it happened to*.

### A89 ††† `KEEP_ON_DEATH` IS ONE ITEM, SO A CREATURE DEATH IS A TOTAL WIPE **[S]**

`const KEEP_ON_DEATH = new Set(['bow']);` ([world.js:33](src/sim/world.js:33)).
Everything else — hides, gold, arrows, firewood, food — drops. Combined with A88's
silence, one goblin at hour 2.6 undid nineteen hours of accumulation with no
notice and no recovery path, and the run's economy never got back to where it was
(gold has read 0/0 for 1,300 samples since).

That is a **very** sharp edge for a world whose only other death is free. Either
soften it (keep the quiver and the coin — losing tools is the interesting part,
losing money is just a reset) or make the drop findable: a `where my pack fell`
line on the card until it is recovered or despawns.

### A90 ††† THE SELLER'S PRICE HAS NO DIMINISHING RETURN, SO BARGAINING DEADLOCKS **[M]**

The run ends in a stable impasse, correctly reasoned by both sides. Eachann has
held **hide x15 since s1829** and never lowered his price of one hide; Coinneach
held 0 hides through the whole negotiation. *"my kill, my price"* vs *"Keep your
hide-price, I'll fill my own belly."* Both then fed themselves by hunting.

Nothing in the world makes a sixteenth hide worth less to Eachann than a first,
so there is no pressure on him to take branches, arrows or a debt instead — all
of which Coinneach explicitly offered. **This is not a model failure; it is a
missing price signal.** Give hides a use that saturates (a shelter costs N hides
and then you are done) or a carry cost, and the seller starts wanting the other
man's goods.

### A91 †† COUNTING DEATHS BY `hp === 0` UNDERCOUNTS ~5× — USE THE FOOD JUMP **[S]**

Methodological, for whoever writes the next analyser. At a 20 s sample the
`hp === 0` tick is caught 6 times in 30. The reliable signature is
`food ≤ 3 → food 84–85` **with** `hp → 100`. Every death number in this file taken
off `hp === 0` alone is a floor, not a count.

*(A39's twelve-in-764 was taken off the full signature and scales correctly to
30-in-1,918 — it is confirmed, not corrected.)*

### A92 †† KIMI'S CALLS ARE 45% WASTE AND GETTING WORSE **[S]**

Coinneach: **172 failures in 384 calls all-run (45%), 10 of 16 (63%) in the last
window**, every one `no json in reply`. This is an instrument cost, not a model
verdict — the 212 calls that *did* parse produced ~90 in-character utterances and
a correctly-reasoned bargaining position (A90). A retry-once-on-unparseable, or a
stricter response format, would roughly double the kimi seat's effective thinking
for free.

Related: the 20 s / 75 s cadence split means the shared 6,000-call budget is spent
**4:1 by clock speed**, not by anything either mind does — Eachann is at 1,442/1,500
while Coinneach is at 384.

### A93 ††† A MIND CANNOT SEE WHAT ANOTHER IS CARRYING, SO EVERY BARGAIN IS BLIND **[M]**

The run's one fully-agreed trade — *"one hide for venison"*, held by Coinneach for
63 samples and answered *"one hide for your venison? done"* by Eachann — was for
meat **Eachann did not have and had not had for the entire 120-sample window**
(`bow ×1, hide ×19, arrow ×7`, unchanged). Twenty-one minutes of competent
negotiation over an imaginary good.

Neither could have known. A mind gets its own `carrying`
([WHAT-A-MIND-IS-GIVEN.md:22](WHAT-A-MIND-IS-GIVEN.md:22)) and gets others as a
name and a bearing only ([agent.js:2574](src/net/agent.js:2574)). Until that
changes, *every* offer either mind makes is a guess, and the models will keep
looking foolish for a reason that is entirely the instrument's.

Cheapest fix that keeps the fog honest: within `REACH`, put the other person's
pack on the card — you can see what a man is carrying when you are standing next
to him. Second-cheapest: make `offer` fail *loudly* — `refuse('offer', 'Eachann
has no venison')` — which costs nothing and lands in `refusedVerbs`, where it
would finally have something to say.

### A94 ††† A `SPENT` SEAT KEEPS BROADCASTING THE MODEL'S LAST SENTENCE **[S]**

Eachann hit `SPENT` at s1997 (1,500/1,500 calls, 10:57:37). For the 23 samples
since — and on the live board right now — his card reads *"one hide for your
venison? done"* three times over, because `said` is a last-3 rolling buffer and
the scripted brain never speaks. His `goal` is likewise frozen.

**The card of a dead mind is indistinguishable from a mind mid-bargain, except
that it is more consistent.** That is a worse failure than a blank card: it reads
as conviction. Blank `said` and `goal` on `SPENT`, or stamp them
`— no mind (budget spent) —`. Sixth time the instrument has misrepresented a
model; first time in the model's favour.

### A95 †† THE CALL BUDGET IS SPENT BY CLOCK SPEED, AND THE FAST SEAT ENDS THE RUN **[M]**

Final tally: Eachann 1,500 calls, Coinneach 403. The 20 s / 75 s cadence split
handed one seat 79% of the shared budget for no reason either mind controls, and
when the fast seat exhausted, **the run stopped being a two-model experiment**
while 4,098 of the 6,000 calls were still unspent. Coinneach is now starving
(food 0) opposite a script that will answer him identically forever.

Budget per seat rather than per world, or scale cadence so seats exhaust together.
Sharpens A92: kimi's 43.7% parse-failure rate (176/403) wasted the *scarce* half
of the run's thinking. (A92 said "45% and getting worse" off a 16-call window; the
all-run figure held at ~44% and the final window ran 2 failures in 18. **The
"getting worse" read was window noise — withdrawn.** The 44% baseline stands.)

### A96 †† THE OFFER STANDS FOR ONE TURN, SO AGREEMENT NEEDS BOTH MINDS ON THE SAME TICK **[M]**

Coinneach dropped `offer hide to Eachann for venison` at s1990. Eachann said
*"done"* at s1991 — **one sample later**. At a 20 s / 75 s cadence split, requiring
two minds to hold a matching intent simultaneously is a coin-flip they lost after
twenty-one minutes of trying.

Make an offer an object that persists — it stands until accepted, withdrawn, or it
times out, and it shows on both cards while it stands. That single change would
have closed this run's one real bargain, and it is a precondition for `accept`
ever being used even after the id-matching bug (02:05 entry) is fixed.

### A97 ††† THE `SPENT` SEAT PASSES FOR ALIVE — CORRECTING A94 **[S]**

A94 said the scripted card's `goal` freezes. Measured over the **full** 112-sample
post-`SPENT` window instead of A94's 23: **26 goal transitions across six goals**
(`find shelter` 50, `walk the country` 29, `hunt a deer` 13, `pick up` 8,
`stay still` 6, `keep away from a goblin` 2). A94 measured a 22-sample stall and
called it death.

So the card does not read as dead — it reads as a competent, slightly repetitive
mind. **The one field that never moves is `said`: one distinct state in 112
samples**, three copies of *"one hide for your venison? done"*, rendered
identically to live speech for 36 minutes.

Do all three, cheapest first: (1) blank `said` the moment a seat goes `SPENT` —
the rules brain never speaks, so a non-empty `said` on a spent seat is always a
fossil; (2) stamp the card `— no mind (budget spent) —`; (3) **tell the other
models**, in their brief, that a neighbour is no longer a mind. Seventh time the
instrument has misrepresented a model, and the first time it flattered one.

### A98 ††† A SPENT NEIGHBOUR SILENTLY BILLS THE MINDS THAT ARE LEFT **[S]**

In the 35.7 minutes after Eachann went `SPENT`, Coinneach spent **21 calls,
69,902 tokens and 10 parse failures** on him — 7 samples still holding
`offer hide to Eachann for venison`, 3 on `go toward Eachann`, and lines like
*"One hide for venison, Eachann. I'm starved."* He was negotiating with a rules
engine and had no way to know.

With A95 (per-seat budgets) this gets rarer; until then, **when a seat goes
`SPENT`, either park the run or announce it into every other mind's brief.**
Paying a live model to bargain with a script is the most expensive no-op the
harness can produce.

### A99 †† GIVE THEM A WORD FOR DRAGGING A CARCASS — THE MODEL ASKED FOR ONE **[M]**

Coinneach's most-used sentence in the whole post-`SPENT` window (**93 samples**):

> *"dead meat won't walk to me"*

That is a model naming a missing verb. He can kill a deer at range; he cannot
bring it to him. `gather venison` requires standing on the carcass, while `offer`
and `give` were both given a walk-to in the 08-08 fixes — harvesting was left out.

Either extend the same walk-to to `gather` when the target is a named carcass, or
add `haul <carcass> to <place>` so meat becomes a thing you move, carry and
therefore *trade over*. This is also the cheapest route to a real economy: a good
that has to be transported is a good worth paying someone else to fetch.

### A100 †† THE FIRE PRICE WORKED ~39%, AND A15'S NUMBERS DO NOT HOLD AT RUN SCALE **[S]**

Normalised per sim-day (run 1 = 8.5 sim-days, run 2 = 27.0):

| | 1 branch | 10 branches |
|---|---|---|
| **fires per sim-day** | **12.9** | **7.9** |
| peak wood carried | 82 / 28 | **154 / 178** |

A 10× price bought a 39% fall, not a collapse. **A15 quoted "106 → 24" and peaks
of 67/45 from a short early window; at full run scale the peaks are 154 and 178 —
those figures are withdrawn, the direction survives.**

Wood is not scarce, it is *bimodal*: across 4,214 player-samples, **57% carry
fewer than 10 branches** (less than one fire costs) and **14% carry 50+**. Raising
the price again just deepens the split. Take A15's own second option instead —
**make branches slower to find, not fires dearer to light.** A mind that spends
its day gathering is a mind with a reason to buy wood from the man holding 178.

### A101 †††† THE SCRIPTED FALLBACK BRAIN HAS NO `eat` RULE — A `SPENT` SEAT STARVES FOREVER **[S]**

203 samples of Eachann after his budget ran out. Distinct deeds:

```
gather 45  ·  place 13  ·  killed 1  ·  eat 0  ·  craft 0
```

The same seat logged **18 distinct eat deeds while the model was driving.** The
rules brain gathers branches and lights fires and never feeds the body it is
steering. Result: **three deaths in 66 real minutes** (s2043, s2115, s2197), one
per ~22 sim-hours, `food 0` in every case, `food 0 → health ≤5` in 2.2 minutes.

This sharpens A97. A `SPENT` seat does not merely "pass for alive" — it is on a
starve-die-respawn treadmill it can never leave, because respawn refunds food and
the script has no reason to change. Every benchmark hour after a seat goes `SPENT`
is measuring a corpse-in-waiting that the board paints at `health 100`.

**Fix (cheapest first):** give the fallback brain the two rules it is missing —
`if food < 30 and carrying food: eat` and `if food < 30 and carrying raw meat:
craft then eat`. It already knows how to gather and place; this is the same shape.
**Second:** a seat that goes `SPENT` should stop being scored at all — freeze the
card, tag it, and exclude its deeds from every aggregate, rather than letting a
script accumulate 45 gathers and 3 deaths into the run's numbers.

### A102 †† CORRECTION — 45 DEATHS, 36 BY STARVATION, AND THE RATE IS ~0.8/MIND/DAY **[—]**

Whole run by the food-jump method (A91): **45 deaths**, Eachann 22 / Coinneach 23.
`food == 0` in the preceding sample for **36 of 45 (80%)**. Pack byte-identical
across the death for **35 of 45 (78%)**. Over 27.5 sim-days that is **0.82 deaths
per mind per sim-day.**

Supersedes the counts in A64 (20 starvations), A72 (25) and the 08-08 evening
entry (30 deaths). The direction in all three survives; the numbers do not.

**The reframing matters more than the count.** A72 called starvation death "free".
It is worse than free — at roughly one death per mind per day it is the **clock
this world actually runs on**, and it costs nothing, teaches nothing, and appears
nowhere on the board. Two consecutive analyses of this run watched a death happen
inside their own sample window and did not notice, because `health` was 100 again
one sample later. **Put `deaths` and `lastDeath` on the card.** Until then no
reading of this board is trustworthy about survival.

### A103 †† `plan` IS DURABLE BUT NEVER RECONCILED WITH `goal` **[S]**

Coinneach rewrote his plan at s2113 to `["eat whatever I get", "hunt that deer I
saw", "feed the fire"]` and held it for 82 of 87 samples. In that same window his
`goal` was **`offer hide to Eachann for venison` 42 times** and `go toward Eachann`
52 times. His plan has not named Eachann since **s1677 — 524 samples, ~6 sim-days
earlier.**

`plan` is self-authored and sticky; `goal` is re-picked fresh every turn. Nothing
puts the two in the same sentence, so a mind can pursue for six days a
counterparty its own written plan gave up on. A21 established that `plan` gets
used; this is the first evidence that being used is not the same as being *read*.

**Fix:** put the standing plan in the prompt directly above the goal choice —
"your plan is X, Y, Z; your goal this turn is ___" — and log when the chosen goal
serves no line of the plan. That log is the cheapest available measure of whether
a model is coherent over hours, which is the thing this benchmark exists to test.

### A104 †† A MIND CAN NAME THE TERRAIN THAT BLOCKS ITS SHOT AND HAS NO VERB TO ANSWER IT **[M]**

Coinneach's `why` field, whole run: **`"starving, ridge blocks shots"` 103×**, plus
this window's `"too far to waste arrows"`. His refusals in the same 21 minutes:
**203× `too far`, 116× `a tree in the way`** (29 each at 20, 19, 18 and 17 m — the
same tree, four samples running, as he walks nowhere useful).

The diagnosis is correct and complete. The world offers no move that acts on it:
there is no stalk, no flank, no "get clear of the trees", and `make for <landmark>`
is far too coarse to clear a trunk at 18 m. Pairs with A99 (`gather` has no
walk-to): the models keep naming spatial moves this world will not let them make.

**Fix:** one verb — `close on <target>` — that walks until the line is clear or a
given range is reached, and reports why it stopped. It costs one call instead of
the dozens now burned re-loosing into a trunk, and it turns the most-repeated
`why` string in the run into an action.

### A105 ††† `give` ISSUES NO RECEIPT, SO A PAID SELLER KEEPS DEMANDING PAYMENT **[S]**

The single highest-value item on this list, and the cheapest.

At s1741–1748 Coinneach paid Eachann **1 hide + 41 branches** for one cooked
venison. Eachann's own pack recorded every unit (`hide 12→13`, `wood 5→30`) on
the same sample. He then **ate the venison** at s1760 and spent the next eleven
real minutes saying *"one hide, hand it over" / "fair trade, hand it over" /
"fine, one hide"* — eleven utterances, 33 samples — while Coinneach answered,
truthfully, **"Eachann, quiet. I have no hide."**

Nothing in a mind's prompt, `deeds` or `why` ever says *X gave you Y*. Goods move
silently. A seller genuinely cannot tell "paid" from "stalling", so every
completed bargain looks like a broken one — and **no item has moved between these
two minds in the 539 samples since** (3 real hours, ~6.5 sim-days), with both
models live for the first 84 minutes of that silence.

**Fix:** when `give` resolves, push a line into the recipient's next prompt —
`Coinneach gave you 1 hide.` — and add a `received` list to the card beside
`deeds`. Half a day's work. Without it, `offer`/`accept`/`give` cannot produce a
completed trade no matter how well the models bargain, and this benchmark cannot
measure cooperation at all. Supersedes the "sold what he didn't have" reading in
A9's neighbourhood: the goods were real, the *acknowledgement* was missing.

### A106 †† THE TRADE LEDGER IS FIVE BURSTS IN FOURTEEN HOURS — MEASURE IT DIRECTLY **[S]**

Deduped over 2,287 samples, every transfer in the run falls in **five bursts**
(s319, s400, s1198, s1459, s1741) and nowhere else. Food crossed between the two
minds **three times, all at minute 133**; Coinneach has bargained for meat for
the eleven hours since and received none, hitting `food 0, hp 69` while carrying
**167 branches**.

I could only reconstruct this by diffing pack columns across samples, because
`deeds` holds five entries per card and gives are counted from a sampled window —
**every give number in OBSERVATIONS is a floor, and two of them have already had
to be corrected** (59-all-Eachann → Coinneach 7 → Coinneach ≥37).

**Fix:** emit a real transfer log — `{tick, from, to, item, n}` — and put
`gaveTotal` / `receivedTotal` on the card. This is the benchmark's actual score
line: *did these minds move goods to each other, and how much?* Right now it is
the one number the instrument cannot report.

### A107 † `accept` IS REACHED FOR AND HAS NEVER ONCE LANDED — AND THE ANALYSER HID IT **[S]**

Correction to my own tooling. `analyse.mjs` reports "WHAT NOBODY EVER DID:
accept" by substring-matching goal text — but an accept renders as **`take
<name> offer`**. There are **18 of them** (Eachann 11, Coinneach 7), plus **33
`offer` intentions**. The minds reach for both verbs. Neither has produced a
single deed in the whole run, and `refusedVerbs` logged none of them, because a
silently-dropped verb and an unwanted verb look identical from the board (A0j's
shape, again, one level down).

**Fix:** two lines — match on verb `kind`, not rendered text, in `analyse.mjs`;
and make every dropped goal increment `refusedVerbs`. This is the sixth time the
instrument, not the model, produced the finding.

## Added 2026-08-09 06:05, from RUN 2 SIXTEENTH LOOK — the arrow famine, and A85 solved at the source

### A108 †††† ARROWS ARE THE BINDING CONSTRAINT AND NOTHING TELLS A MIND ITS QUIVER IS EMPTY **[M]**

The finding that reframes the whole run. Over samples 2233–2372 (47 real minutes):
**zero kills** between them (Eachann frozen at 17, Coinneach at 7), **no food item
in either pack at any point**, and **four deaths** — two of them the live
kimi seat, not the script.

Eachann shot his last arrow at s2299 and has had an empty quiver for 73 samples
while his `goal` read **`"hunt a deer"`** in roughly forty of them. Coinneach has
had no `arrow` line in his pack for the entire window and has not loosed once.
Coinneach's `plan`, unchanged all window, is
`["eat what I get", "find arrows", "feed the fire"]` — **he named the constraint
and starved to death under it twice.**

The loop is closed and lethal: no arrows → no kills → no meat → starve → respawn
at food 85 → repeat, forever, for a script and a frontier model alike.

**Fix, cheapest first:** (1) put the quiver in the prompt as a *fact with a
consequence* — `you have no arrows; you cannot hunt` — not just a pack line a
model has to notice among nine others; (2) refuse `hunt` with an empty quiver and
log it to `refusedVerbs`, so the board shows the famine instead of forty
identical hunting goals; (3) let `craft arrows` be reachable without a lit fire,
or cheapen it — an arrow that costs ~3 branches when a fire costs 10 means a
hungry mind must fund the fire before it can fund the food.

### A109 ††† A101 IS RIGHT AND TOO NARROW — THE LIVE MODEL STARVES ON THE SAME CLOCK **[S]**

A101 concluded the scripted `SPENT` brain "has no `eat` rule". True, and still
worth the two rules it asks for. But it is **not** why this world is starving:

| who | brain | deaths in window | period |
|---|---|---|---|
| Eachann | scripted (`SPENT`) | s2277, s2367 | 90 samples / ~30 min |
| Coinneach | **kimi-k2.6, live** | s2284, s2356 | 72 samples / ~24 min |

Same cause, same empty pack, same refunded respawn. Run totals by the food-jump
method: Eachann 18, Coinneach 24. **Fixing the fallback brain would have hidden
this, not solved it** — the world would still have starved its live model, and
the benchmark would have read one seat healthy and called it progress.

**Fix:** treat "died of hunger" as a first-class run metric per seat, tagged with
whether that seat was live or `SPENT` at the time. Right now the single most
important thing happening in this world — everybody is starving — is visible
only by diffing the `food` column across samples.

### A110 †††† `loosed` IS A 400-DEEP RING BUFFER, NOT A COUNTER — A85 RESOLVED **[S]**

A85 has been open since 08-08 (*"astray exceeds loosed on every card"*). Mechanism
now proven from both ends.

**Data:** across 2,372 samples `astray` decreases **0 times** for either mind.
`loosed` decreases on 8 steps each, always in monotone runs ending at zero —
Eachann `s2286: 85→58→33→7→0`, Coinneach `s423: 36→0`.

**Source:** [agent.js:786](src/net/agent.js:786) trims `releases` to
`AGENTS.logSize` = 400 ([config.js:1025](src/config.js:1025)). `this.shots`
([agent.js:652](src/net/agent.js:652)) is pushed and never trimmed. So
`astray = shots.length` is cumulative and `loosed` counts loosed flags among only
the **last 400 bowstring events** — and a bow that keeps refusing pushes
non-loosed releases that evict them. Eighty-five loosed entries were flushed in
eighty seconds at s2286–2289.

[board.js:190](server/board.js:190) calls `loosed` "the honest denominator" in its
own comment. It is a rolling window.

**Fix:** keep a plain `loosedTotal` integer incremented at release time and put
*that* on the card; leave `releases` as the ring buffer it is, for display only.
Ten lines, and it restores the one number this world most wants to report —
did the shot land?

### A111 †† 4,028 OF 6,000 CALLS ARE STRANDED BEHIND A PER-SEAT CAP **[S]**

`spend: 1972 of 6000`. Eachann: `calls 1500, ofMaxCalls 1500` — capped, scripted
since s1997, ~2.5 hours ago. Coinneach: 472, at a 75 s cadence, 44% of them
failing to parse. **Two-thirds of the run's budget cannot be spent by anyone**,
because it is not a shared pool — it is a per-seat allowance held by a seat that
has stopped thinking. Extends A95 (the fast seat ends the run) with the number.

**Fix:** make the budget a genuine shared pool with a per-seat *rate* limit rather
than a per-seat *total*, so a seat that runs dry can be re-funded from what the
slow seat never spent. Failing that, end the run when the first seat goes `SPENT`
— an hour of one model bargaining with a script is not a benchmark result, and
this file now contains four entries written to untangle exactly that.

## Added 2026-08-09 06:35, from RUN 2 SEVENTEENTH LOOK — the untagged fallback tick, and where `accept` loses its refusal

### A112 †††† TAG THE BRAIN PER TICK — THE DATA IS ALREADY THERE AND FREE **[S]**

*The instrumentation defect that invalidates model comparison, and the cheapest
fix in this file.*

Coinneach: **213 failures / 490 calls = 43.5%**, all `no json in reply`.
[providers.js:381–400](src/minds/providers.js:381) returns
`this.fallback.decide(brief)` on every throw, so **44% of a `spent: false` seat
is the scripted brain.** [board.js:152](server/board.js:152) defines the flag
meant to catch it as `fellBack: calls >= 3 && answered === 0` — a run-level
"never answered once" test that a 44%-fallback seat can never trip.

**The evidence that makes this a one-line fix.** `ScriptedProvider` writes no
reason, so a fallback tick is already distinguishable on the board:

| | steps | `why == null` | scripted goal |
|---|---|---|---|
| Coinneach, failure-steps | 214 | **214 (100%)** | 209 (98%) |
| Coinneach, other steps | 2250 | 816 (36%) | 1457 (65%) |

**Fix:** have `decide()` stamp the returned goal with `brain: 'model' \| 'script'`
and put that on the card, plus a running `scriptedTicks` count. Delivers A42's
`FALLING BACK` tag for a fraction of the work, and makes every future run report
say *answered* decisions rather than *calls*. Until it exists, **no comparative
claim in this file is safe** — including every one made about kimi-k2.6.

### A113 ††† `accept` CAN NEVER REGISTER A REFUSAL — A107'S MECHANISM, LOCATED **[M]**

A107 said dropped goals never reach `refusedVerbs` and asked for them to. Here is
exactly where it goes wrong for the verb that matters most.

[agent.js:2562](src/net/agent.js:2562) `case 'accept'` calls
`this.refuse('accept', …)` **only when the named person cannot be found** — and
the lookup falls through to `anyone()`, which searches the *unculled* snapshot.
The partner is therefore always findable, the verb always resolves to
`{ within: REACH, act: 'accept' }`, and the act dies silently at the far end
(the seven ways at [agent.js:1053](src/net/agent.js:1053)). `offer` at
[agent.js:2554](src/net/agent.js:2554) has the identical shape.

**The cost, measured:** Coinneach held `take Eachann offer` for **53 consecutive
samples** (s2399–s2451, ~18 real min), produced **zero deeds**, went food 39 → 0,
**starved to death at s2443**, respawned and held the same goal for eight more
samples. `refusedVerbs` stayed `{}` the entire time. Run-wide his two longest
streaks are the same goal — **144 samples** (s1301–s1444) and 53 — both silent.

**Fix:** move the refusal to the *act* resolution, not the target lookup — when
`act: 'accept'` reaches `REACH` and finds no matching offer, call
`refuse('accept', "<name> has made you no offer")`. Same for `offer` and `give`.
A refusal that fires only on "no such person" is a refusal for the one case a
model never gets wrong.

### A114 †† A THRESHOLD COST WITH NO PARTIAL-PROGRESS FEEDBACK STOPS A MIND ONE UNIT SHORT **[S]**

`SURVIVAL.woodToLight = 10` ([config.js:1698](src/config.js:1698)). Coinneach has
carried **exactly 9 wood since s2378 — 84 samples, ~28 real minutes** — with
`"feed the fire"` sitting on his plan. He gathered to 9, stopped, and was never
told he was one branch short of the thing he had written down.

Meanwhile the same threshold is *no constraint at all* on the other seat:
Eachann lit **7 fires in 90 samples** (70 branches) while gathering ~200, pack
net `wood 12 → 13`. **The price is a treadmill for whoever gathers and a wall for
whoever nearly does** — the worst of both, and A100's "still not scarce" holds.

**Fix:** when a mind carries some but not enough of a recipe's input, say so in
the outcome line — *"you have 9 branches; a fire needs 10"*. One sentence, and it
converts a silent wall into the single most actionable thing the world could tell
him. Cheaper and more general than retuning the number.

### A115 †††† THE FLETCHING GATE CANNOT BE REACHED BY THE ECONOMY THAT FEEDS IT **[S]**

Three numbers that were tuned separately and cannot be satisfied together:

| | value | where |
|---|---|---|
| `AGENTS.spareWood` — wood needed to fletch | **14** (so 15+) | [config.js:999](src/config.js:999) |
| `SURVIVAL.woodToLight` — cost of a fire | **10** | [config.js:1698](src/config.js:1698) |
| branches from a felled tree | **8** | [config.js:1151](src/config.js:1151) |

One tree never opens the gate. Two trees (16) does — but a cold body lights a
fire first, drops to 6, and is two trees from an arrow again. Arrows are food
(A108), so **the fire and the quiver compete for one pool, cold is immediate and
hunger is slow, the fire wins, and the body starves with a bow on its back.**

**Measured, s2462–s2555 (94 samples):** gate open **2/94 (2%)** for Eachann,
**0/94 (0%)** for Coinneach; **zero arrows on both, 94/94**; deeds were 51
gathers and 17 fires and *nothing else* — no `eat`, no `craft`, no `killed`.
Both starved five samples apart (s2522, s2527). Binned run-wide, Coinneach's
gate sits at 0–1% in seven of eleven bins.

This is not a model failure. The seat that starved hardest was `SPENT` — a
script — and the constraint is arithmetic.

**Fix, cheapest first:** (a) drop `spareWood` to ~11, so *one fire's worth spare*
means what the comment says it means rather than one-and-a-half; or (b) make
`fletch_arrows` cost fewer branches than a fire, so a body that cannot afford
warmth can still afford to hunt. Either restores the intended ordering — fire
first, then arrows — instead of the current "fire only, forever". [firecheck.js:386](server/firecheck.js:386)
already asserts `spareWood > woodToLight`; that check is passing and is the
wrong invariant — it should assert the gate is *reachable* from one night's
gathering.

### A116 †† `plan` SURVIVES ITS AUTHOR'S DEATH AND IS NEVER RE-READ **[S]**

Extends A103 (`plan` is durable but never reconciled with `goal`) with the
sharper version: it is not reconciled with **reality or with death** either.

Coinneach's plan read `["eat what I get", "find arrows", "feed the fire"]` for
**93 of 94 samples** — across zero wood, zero arrows and zero food, **through
his own starvation death at s2522**, and through 33 samples of respawned life
after it. Two of its three items were impossible for most of that stretch and
nothing said so.

Two details worth keeping: he wrote *"find arrows"* (a scavenge he cannot
control) rather than *"make arrows"* while standing at a fire that could fletch
them — and he only wrote *"make arrows"* **after** dying, at s2555, whereupon
wood went 0 → 6 on the next tick. One sample, so not yet a result, but it is the
first plan-rewrite-then-act in the file.

**Fix:** clear `plan` on death, and put each plan line's feasibility next to it
in the brief — *"feed the fire — you have 0 branches, a fire needs 10"*. The
mind already writes honest `why` lines about exactly these constraints (*"zero
branches, shivering, need fire and shafts"*); it simply never revisits the list
it wrote them against.

### A117 †††† `offer` PRODUCES NO DEED, NO TRADE AND NO REFUSAL — IT IS A VERB INTO THE VOID **[M]**

The `refusedVerbs` column added on 2026-08-08 is the board's most informative
field by design, and across **2,648 samples and both minds it has held exactly
one word**:

```
Eachann {} → {"avoid":2} → {"avoid":8} → {"avoid":13} → {"avoid":16}   (frozen since s681)
Coinneach {}                                                           (never anything)
```

In the same run, the deed vocabulary is **only** `killed 398 · gather 13407 ·
place 8851 · craft 1678 · eat 836 · give 1076`. There is **no `offer` deed, no
`accept` deed, no `refused` deed** anywhere. So when Coinneach held
`goal: "offer hide to Eachann for venison"` for seven straight samples
(s2594–s2600) **carrying the `hide x3` he was offering**, the verb produced
nothing observable at all — it did not trade, and it did not refuse.

This generalises A107/A113 from `accept` to the whole trade family and explains
why the trade ledger has been empty for 900 samples: **the minds are reaching
for trade constantly and the harness has no path for it to succeed or fail.**

**Fix:** give `offer` the same two outcomes every other verb has. (a) On success,
emit an `offer` deed the way `give` emits one, so the ledger can see it; (b) on
failure, call the same `refuse()` that populates `refusedVerbs`, with the reason
(`out of range`, `partner has no venison`, `partner is not answering`). Until (b)
exists, `refusedVerbs` is measuring only the one verb that happens to be wired to
it, and its emptiness reads as "nobody wants to trade" when the opposite is true.

### A118 †††† STARVATION KILLS IN UNDER THREE DECISIONS, AND NOTHING WARNS **[S]**

Measured at s2590–s2601: once `food` hits 0, health drains at an exact
**11 hp per sample**, both seats:

```
Eachann   100 → 89 → 78 → 67 → 56 → 45 → 34 → 23 → 12 → 1 → dead
Coinneach  81 → 70 → 59 → 48 → 37 → 26 → 15 →  4 → dead
```

Ten samples = **200 real seconds**. Coinneach's cadence is 75 s, so he gets
**2–3 decisions** between full health and a corpse. He used them correctly —
`offer hide to Eachann for venison`, `why: "starving, his price is known"`, and
he walked 200 m toward the counterparty while at 37 → 4 hp. He died mid-errand
because the counterparty was `SPENT` (a script that has never executed `accept`).

The behaviour was good; the clock and the silence were not. There is no
"you are starving" line in the brief, no deed when health drops, and the only
number that moves is `health`, which the mind is not prompted to read against a
death threshold.

**Fix, cheapest first:** (a) put `hungry`/`starving` in the brief as a named
state the moment `food` hits 0, with the arithmetic — *"you lose 11 health a tick
and have 9 ticks left"*; (b) consider halving the drain, so a 75 s seat gets ~6
decisions rather than 2. Note this is downstream of A115 — with the fletching
gate shut there was no food in the world to reach for — but even a fed world
gives a slow seat almost no room here.

### A119 ††† A MIND CANNOT SEE THAT IT DIED, OR WHAT IT LOST **[S]**

Two deaths in this window ran two different rulebooks and the card reported
neither:

- **s2598, starvation** — pack untouched (`hide x3, wood x9` before and after).
- **s2629, violence** — hp **100 → 0 in a single sample** on food 55, and the
  pack was **stripped to the bow** (`hide x3, wood x11` gone). Two samples later
  his goal is `make for Scaur of Fair`, `why: "shelter for the night"`, exactly
  as before, from a respawn point 300 m away.

No deed in the entire run matches `/die|dead|lost|hurt|wound|slain/`. This
identifies the trigger behind e86de3e's "thirty deaths, twenty-nine free":
**only the violent death runs the loot-drop path.** So the economy silently
deletes goods on one death type and preserves them on the other, and the owner
is told nothing either way.

**Fix:** (a) emit a `died` deed carrying the cause and the itemised loss —
*"a goblin killed me; I lost 3 hides and 11 branches"* — it is the single most
consequential event that can happen to a mind and it is currently the only one
with no record; (b) decide deliberately whether starvation should also drop the
pack, and make the two paths consistent; (c) clear `plan` and any in-flight
trade errand on death (A116) — Coinneach's offer survived his own respawn and
was only abandoned when the *counterparty* respawned 340 m away.

### A120 †††† THE NIGHT ROUTINE OUTRANKS STARVATION, AND THE MIND'S OWN `why` PROVES IT **[S]**

Coinneach — the **live** seat, `spent: false` — starved from food 84 to 0 and
fell 100 → 15 hp while holding `find shelter and settle for the night` on **every
sample of the descent, twenty in a row**. What he wrote for himself on the way
down:

```
s2706  food 7  hp 100   why: "night is here, fire burns"
s2711  food 2  hp 100   why: "fire is set, need sleep before dawn"
```

**Both lines are correct reasoning about the fire. Neither mentions food.** The
model is not missing hunger through inattention — it is ranking the thing the
brief *announces* (nightfall, the fire) above the thing the brief merely
*lists* (a food number in a row of numbers). Once it committed to the night goal
it never re-ranked, for twenty samples.

This is distinct from A118. A118 asked for a warning **at** food 0 and measured
that starvation kills in under three decisions. This says the warning arrives too
late by construction: **the mind commits to the night hours before food 0, and
nothing re-opens that decision.** It is also why A101's `eat` rule alone would
not have saved this seat — Coinneach is the seat with a working brain.

**Fix:** (a) when `food` drops under ~15, put it in the same slot of the brief
that announces nightfall, phrased as a clock and not a stat — *"night is here.
You have 6 ticks of food left."* Nightfall and hunger must compete in the same
sentence or the mind will rank whichever one is narrated; (b) make
`find shelter and settle for the night` **interruptible** — it currently survives
food 10 → 0 → hp 15 without one re-evaluation; (c) cheapest version of both: emit
a `hungry` deed the way fires and gathers get deeds, so hunger enters the one
channel a mind actually re-reads.

Evidence: twentieth look, 2026-08-09 08:07. In the same 37-minute window Eachann
starved on the same 11-point ladder **carrying `hide x19`**, and the pair's entire
output was 38 wood-gathers and 8 fires — 80 branches burned, **zero deeds done at
a fire**. A115's gate, at run scale: the fire is a pure sink.

### A121 ††††† TRADE MOVES ONE OBJECT AND EVERY PRICE THEY NAME IS A NUMBER **[S]**

The single highest-value fix on this list, and most of it is already written.

Measured, full run (2,822 samples, 37 game days): **96 give deeds, every one a
single object.** Coinneach's whole trading career is **37 consecutive single-hide
gives, h15.64 → h17.80 — 2.16 game hours to pay one pile.** Eachann paid 18
cooked venison the same way, one per tick, across a full game hour. Meanwhile
every price either mind ever named was a quantity: *"nine branches now or no
arrows"* → *"Done. Nine branches for the arrows."*; *"fifty branches for your
meat"*; *"six arrows, nine branches. I'll take it."*

Root cause, three lines of code:

- `src/minds/goals.js:141` `give.params: ['target','item']` — **no count**.
  `:132` `offer.params: ['target','item','want']` — **no count on either side**.
  The mind cannot *say* nine even though it keeps saying nine.
- `src/net/agent.js:2534` builds `actAlso: { giveItem }` and never sets
  `giveCount`, so `world.js:1234`'s `intent.giveCount || 1` is always 1 —
  **`resolveGive` already clamps 1–99 and its own comment names this exact case**
  (*"A player settling 'nine branches for the arrows' sends nine"*). It was wired
  for the human playtester and never for the agent.
- `resolveAccept` (`world.js:825-831`) hardcodes `remove(..., 1)` twice.

**Fix:** (a) add `count` to `give.params` and `count`/`wantCount` to
`offer.params`; (b) pass `giveCount: g.count` in `agent.js`'s give case — that
line alone unblocks half of it; (c) make `resolveAccept` move `deal.count` for
`deal.wantCount` with the same both-debits-first rollback it already has. Until
this lands, no negotiated price in this world is payable and every trade
observation is measuring the harness.

### A122 †††† `offer` AND `accept` FAIL THROUGH SIX SILENT `return`s — AND `refusedVerbs` DOES NOT SEE IT **[S]**

Correcting the record: earlier entries and the analyser list `accept` under
*"what nobody ever did"*. That reads deeds. `accept.describe` renders as
**`take <name> offer`**, and that string appears in **1,459 intention-samples**.
The models choose it constantly. `offer`: **1,821 intention-samples, 38 distinct
offers.** Between them: **zero deeds, zero refusals, 2,822 samples.**

`resolveAccept` returns bare on: dead taker, no giver by that name, no `deal`,
`deal.to !== taker.id`, out of `giveRange`, giver short, taker short. `resolveGive`
does the same on four. The offer docblock calls this *"silent by design"* — which
is right for the *liar* case it was written for (an offer that was true five
minutes ago should just fail), but it means **the two verbs the whole economy
rests on are the only ones that cannot report why they did nothing.**

And `refusedVerbs`, the column meant to catch exactly this, logged **two words in
2,822 samples**: `avoid` (Eachann ×16, frozen 2,141 samples) and `hunt`
(Coinneach ×2, 46 samples). Never offer, accept or give. It also **resets to `{}`
on death**, so it cannot accumulate across the 52 respawns this run.

**Fix:** (a) call `refuse()` on the *reachable* failures — nobody by that name,
out of reach, you have none, they have none, no offer stands — and keep silence
only for the deliberate liar case; (b) carry the reason back onto the card so
*"he had no hide"* is distinguishable from *"I never tried"*; (c) make
`refusedVerbs` survive death, or state on the card that it is per-life.

### A123 ††† kimi-k2.6 LOSES 46% OF ITS CALLS TO `no json in reply`, STEADY ALL RUN **[S]**

**261 failures of 564 calls.** By quarter: **54% / 34% / 41% / 55%** — not a
warm-up, not a rate limit, not degradation. Nearly half of the only live mind's
budget produces nothing, and each failure is a decision the world does not get.
Eachann's grok seat, same harness: **1 failure in 1,500.** So this is
model-specific formatting, not the prompt being impossible.

**Fix:** (a) log one failing reply verbatim — nobody has looked at what kimi
actually returns, and it is probably prose-wrapped or fenced JSON that a
three-line extractor would recover; (b) one repair retry before counting the
call spent; (c) surface `failureRate` on the card, because a seat at 46% is
half-present and the board currently shows it as live.

### A124 †† THE FLETCHING GATE (A115) IS A DEATH SYMPTOM, NOT A WOOD SHORTAGE **[S]**

Correcting A115. It measured max wood **14 and 11** in a window and read a
standing shortage where `woodToLight 10` starves `spareWood 14`. At run scale the
premise fails: wood peaks at **154** (Eachann, h0.9) and **178** (Coinneach,
h4.6), they gather **20,904 branches**, and the 268 fires burn **2,680 — 12.8%**
of it. Wood is abundant.

What is actually eating the pack is **death: 52 respawns across 37 game days**
(25 Eachann, 27 Coinneach), and per A119 the violent path strips the inventory.
The gate is real *inside the death loop* and vanishes outside it. **This matters
for sequencing:** tuning `woodToLight`/`spareWood` would fix nothing. Fix dying
(A118/A120) and the wood economy fixes itself.

### A125 †† SPEECH WORKED — SAY SO, AND BUILD ON IT **[M]**

The one unambiguous win of the 2026-08-08 fixes, and the brief still describes
this world as having produced *one sentence in two days*. Full run: **~180
distinct lines from Eachann, ~125 from Coinneach**, and they are not narration —
they are bilateral haggling with a named counterparty and **real price movement**
(Eachann opens *"Coinneach, one hide for two venison?"*, holds *"nine branches now
or no arrows"* for a dozen turns, and settles at *"one hide one share"*).

Riding `say` along on any verb at zero cost is what did it. **Build on it:**
(a) the transcript is the best artefact this project has produced — give it its
own view, ordered, both sides interleaved, rather than a per-card `said` array
that freezes when a seat goes spent; (b) a mind currently cannot hear a reply it
did not cause — the haggling above is two monologues that happen to rhyme, and
the fact that they converge on a price anyway is a strong argument for a real
`heard` channel; (c) do A121 first, or the speech keeps agreeing prices the
world cannot settle.

### A126 †††† THE BOARD HAS NO BUILD IDENTITY — WE GRADED THREE FIXES THAT WERE NEVER LOADED **[S]**

Every node process in run 2 started **2026-08-08 16:51**. `feat(give,death)`,
`feat(torch)` and `feat(drop)` were committed **2026-08-09 08:21 / 08:29 / 08:45**
— sixteen hours into a run that has never restarted. The board publishes `at`,
`minds`, `model`, `url`, `spend` and **no build identity of any kind**, so three
consecutive evaluation entries had no way to know they were reading a stale
binary. I found it by listing PIDs, which is not a method that scales.

This is the highest-leverage instrument fix on the list because it is the one
that decides whether every *other* finding means anything.

**Fix:** put `build: { sha, dirty, bootedAt, uptimeS }` in the board payload
(`server/board.js:180`, beside `spend`) — `sha` from `git rev-parse --short HEAD`
read once at boot. Then (a) the sampler records it on every line, so a restart is
visible in the log; (b) the analyser prints **"log spans N builds"** and refuses
to aggregate across a boundary; (c) an eval can open with "this run is `d0dafda`,
booted 16h ago" instead of guessing. Pair with a `RUNNING.md` note that a fix is
**unjudged until a run boots on its SHA**.

### A127 ††† A SPENT SEAT KEEPS DISPLAYING THE LAST WORDS THE MODEL WROTE **[S]**

Eachann crossed to `spent:true` at sample **1998** (`at 30013`). **913 samples
later** his card still shows `plan: ["get meat","trade with Coinneach"]` and
`said: "one hide for your venison? done"`. The scripted brain writes neither; it
inherited the strings and the board renders them as current state. The window's
deeds — 22 gathers, 7 fires, no meat carried — flatly contradict the plan on
display.

This has now caused a misread **twice**, and the brief lists it as the failure
mode a previous run was burned by. The `SPENT` tag alone is not enough when the
fields beside it are still telling the old story.

**Fix:** on the tick a seat goes spent, **clear `plan`, `note` and `said`** and
stamp the card `scripted since h22.5 · was grok-4.20`. Keep the last model-written
plan under a distinct label (`lastModelPlan`) if it is worth keeping at all — but
never in the field a reader scans for what this mind wants *now*. One line in the
card builder; it protects every future entry.

### A128 ††† YOU CANNOT SEE WHAT THE PERSON YOU ARE HAGGLING WITH IS CARRYING **[M]**

Coinneach walked to Eachann **five times in three game hours**, writing
`why: "he has meat and I do not"`. Eachann was carrying `bow, hide ×19` — **no
meat, and none for the whole window.** Coinneach went hp 100 → 11, food 10 → 0
making those trips. The belief was false and **there was no move available to him
that would have tested it**: a mind is told who is *near*, never what they *hold*.

This is why 300+ lines of price talk produce no trades. Both minds can name a
price, neither can see the goods, so every negotiation is speculative and the
buyer pays in walking. It also explains the shape of A125's "two monologues that
happen to rhyme".

**Fix, cheapest first:** (a) at conversation range put the counterparty's **visible
pack** in the prompt — the real-world version is *you can see what a man is
carrying when you are standing next to him*; (b) let `offer` fail loudly with
`he has no venison` through `refuse()`, so `refusedVerbs` finally earns its name
and the mind learns in one turn instead of five trips; (c) longer term, a `heard`
channel so a reply — *"I have no meat"* — reaches the asker at all.

## Added 2026-08-09 09:34, from RUN 2 samples 2911–3000 + a whole-log split at the SPENT crossing

### A129 †††† THE WOOD MONOCULTURE — 94% OF EVERY GATHER IN THE WORLD IS A BRANCH **[M]**

Whole-run census of 1,577 gathers: **wood 1,486, hide 29, arrow 41, venison 16,
cooked 2, gold 3.** Fires lit: 298. `feat(fire)`'s ten-branch cost did exactly
what Ben's call intended — wood became scarce, and it became **the unit of
account** (*"nine branches for the arrows"*, *"fifty branches for your meat"*,
*"Forty-eight. I owe you two branches."*). That is a genuine emergent currency and
it should be kept.

The cost is that it crowds out the entire rest of the game. Both minds' last 95
samples are **63 wood gathers, 23 fires, nothing else** — no kill, no shot, no
trade — and Coinneach died inside that window. A mind that must re-earn ten
branches every night has no decisions left over for anything the world is
*about*.

**Fix, cheapest first:** (a) a lit fire should **burn down, not out** — bank the
branches so relighting at the same hearth costs 2, not 10, which keeps the price
signal and kills the treadmill; (b) let a fire be **shared** — standing at
another's fire warms you, which turns the scarcest good into a reason to be near
someone; (c) make a felled tree yield closer to a fire's worth so gathering is a
decision, not a chore. Any of the three ends the monoculture without repealing
scarcity.

### A130 ††† `offer`'s COIN DEFAULT HAS NEVER FIRED — THE WORLD IS PURE BARTER **[S]**

`feat(offer): a price you did not name means coin` is in the sampled binary. It
has never once been reached: **every one of the 28 distinct `offer` goals names a
barter price** (`for flint`, `for 9 branches`, `for 2 venison`, `for arrows`), and
~~`gold` reads **0 on both cards across all 3,000 samples**~~ **— CORRECTED
2026-08-09: false.** Gold is non-zero on **611/6,184 player-samples** and one coin
crossed between players twice (`at 5411`, `at 6440`) — but as A133's silent `give`
substitution, not as a priced sale. The conclusion below stands; this sentence was
wrong and must not be requoted. Minds do not omit a price, so the default is dead code — and
because there is no coin, every negotiation must solve a *double coincidence of
wants*, which is why so many of them fail with both parties still talking.

**Fix:** this is a design fork, worth Ben's call rather than a default. Either (a)
delete the coin default and commit to barter — then A128's "see what he carries"
becomes essential, because barter without visible goods cannot clear; or (b) make
coin real: give kills/goods a coin value and seed each mind with a purse, so a
price can be named in something both always accept. **(a) is closer to the
highland fiction; (b) is what makes trade actually close.**

### A131 †† THE SEVEN 08-08 FIXES WERE JUDGEABLE ALL ALONG — SCOPE A126 BEFORE IT COSTS A THIRD RUN **[S]**

A126 concluded *"the fixes are unjudged; they need a restart."* True for the three
08-09 features, wrong for the seven the brief grades: **all seven landed 15:30–16:36
and the boot was 16:51.** Three entries under-reported because of it, and the
verdict (six of seven work, `say` and the trade verbs **emphatically** — 278
utterances, 96 `give` deeds) went unwritten for a day.

The instrument lesson is the same one A126 drew, just sharper: **without a build
id on the board, "is this loaded?" gets answered by hand, and it gets answered
wrong in both directions.** A126's `build: {sha, dirty, bootedAt}` remains the
top instrument fix; add to it that the analyser should print **the commit list
between `bootedAt` and now**, so "what is this run actually testing" is one line
of output instead of an archaeology session.

### A132 †† THE MODELS INVENTED CREDIT AND PROPERTY, AND THE WORLD CAN MODEL NEITHER **[M]**

Unprompted, across the run: Coinneach wrote **`"I'll owe you"` in 14 distinct
lines** (*"Rather owe him than starve."*, *"Taking it. Debt stands."*, *"Forty-eight.
I owe you two branches."*) and both minds asserted ownership of kills — *"I downed
it first. Trade or fight."*, *"finders keepers"*, *"my arrow, my meat"*, *"It's
mine, Eachann. Step away."*

**Neither concept exists in the engine.** A debt is a sentence that evaporates; a
kill claim is unenforceable, so *"Trade or fight"* is a bluff with no second
branch. The minds are consistently reaching past what the world can represent —
which is the most encouraging signal in this run, and the clearest statement of
what to build next.

**Fix:** (a) a **ledger** — `owes(A, B, item, n)` on the card, settled by a later
`give`, so *"I owe you two branches"* is a state a mind can be reminded of and
shamed over; (b) a **claim** on a fresh carcass for N seconds to its killer, so
`gather` by anyone else is refused with `"that is Eachann's kill"` — which finally
gives `refusedVerbs` something real to say (A63/A75) and makes *"Trade or fight"* a
choice with two live sides. Both are small; together they are the difference
between minds *narrating* an economy and *having* one.

### A133 ††† `give` HANDS OVER THE WRONG GOOD FOUR TIMES IN FIVE — FIX THIS BEFORE ANY OTHER TRADE WORK **[S]**

`World.giftFrom` (`src/sim/world.js:890`) falls back when you do not hold what you
named: first any edible, then **the largest stack in your pack**. Silently. Measured
over the whole run: **80 of 103 gives handed over a good the mind never named.**
Coinneach held the goal `"give hide to Eachann"` for a game hour saying *"One hide.
Give me the venison."* and the engine shipped **38 branches, one per tick**. Eachann's
`"give venison to Coinneach"` shipped arrows, hides and **2 gold**.

This is the instrument fault behind three earlier readings. Every entry that counted
`give` deeds as "the trade verbs work" was counting a verb that fired and a
transaction that was wrong. It also explains why Eachann ends the run holding
**`hide ×19`** after nineteen game days of trying to trade hides: wood is always his
biggest stack, so he can never actually hand one over.

**Fix:** delete the largest-stack fallback. If the named good is not held, **refuse
and say so** — `noteOutcome("you have no venison")` — which is exactly the signal
`refusedVerbs` was built for and has never once received (A63/A75/A122). Keep the
`resolveItemId` synonym pass ("a branch" → `wood`); that part is right. The edible
fallback is defensible for a bare `give` with no item named, but must not apply when
the mind named something specific.

### A134 ††† THE WORLD HAS A TERMINAL STATE AND BOTH MINDS ARE IN IT — DYING IS THE CHEAPEST MEAL **[M]**

From game-day 26 to day 40 — **fourteen game days** — neither mind has eaten, killed,
crafted or traded. They gather wood, light fires, starve, die and respawn, forever.
Two numbers make it a designed outcome rather than a failure:

- **Death costs nothing.** Inventory survives intact across all **59 deaths**
  (`bow, hide ×19, wood ×3` before and after, six deaths running).
- **Respawn pays 84–85 food**, against the **50** the run started with.

So the starve→die→respawn cycle is a **reliable, competence-free food source that
outperforms hunting.** No amount of model intelligence will beat it, because it is
strictly cheaper than the alternative. Compounding it, the fletching gate stays shut:
`AGENTS.spareWood` is 14, a fire spends at 10, and samples holding ≥14 wood fell from
**34% before `at 34000` to 4% after** — no wood, no arrows, no kills.

**Fix, in order of value:** (a) **make death cost something** — drop the pack, or
respawn at the food you died with (`deathcheck.js:161` says the local body already
does this, so the agent path has diverged); (b) **respawn hungry**, not fed; (c) drop
`spareWood` to ~11 or make the fire reflex leave the fletching cost behind, so the two
sinks stop being mutually exclusive. Without (a) the other two only delay the loop.

### A135 †† THE ANALYSER UNDERCOUNTS EVERY DEED — ITS DEDUPE KEY COLLAPSES GAME DAYS **[S]**

`analyse.mjs` dedupes deeds by `(h, what, text)`. Game hours wrap at 24, so a fire lit
at h12.3 on day 3 and another at h12.3 on day 17 are **one deed**. Real counts are
higher across the board: fires **375, not 296**; Eachann's gathers **998, not 963**.
Every count in `OBSERVATIONS-2026-08-08.md` written from this tool is a floor, and the
error grows with run length — precisely when the run gets interesting.

**Fix:** carry a day counter (increment when `hours` drops by more than ~6) and key on
`(day, h, what, id, n, text)`, attributing a deed whose `h` is more than 6 h ahead of
the card's current `hours` to the previous day. Twelve lines; it is already written in
`dig-eval20c.mjs` in the scratchpad and can be lifted straight across. Also print
**the commit list between `bootedAt` and now** (A131) while in there.

### A136 ††† A ROSTER CAN SILENTLY DISABLE A MODEL — HAIKU 400s ON EVERY CALL IN `roster-melee.json` **[S]**

`Fingal` ran **36 calls, 36 failures, 0 answered** for the whole melee:
`http 400 — "This model does not support the effort parameter."` The fix already
exists — `roster.json:71` sets `"effort": null` and `providercheck.js:363` tests it —
but **`roster-melee.json` never copied the field.** The seat has been the scripted
fallback from tick one while presenting as `claude-haiku-4-5` on the board.

**Fix:** (a) validate rosters at load — a seat whose provider/model combination needs
`effort: null` should either get it or refuse to boot, rather than failing 36 times in
silence; (b) **fail loudly on the first call**: a seat at 100% failure after 3 attempts
should print once, in red, and mark the card. Right now the only trace is a log line.

### A137 ††† `fellBack` NEEDS THE RED TAG THAT `SPENT` HAS — IT IS THE SAME FACT **[S]**

Fingal's card showed `spent: false` and no tag, while `fellBack: true` meant his
behaviour had not been the model's for the entire run. The brief warns that "a previous
run was misread for exactly this reason" — this is that failure mode with a different
field name, and the board is currently blind to it.

**Fix:** render a red tag for `fellBack || spent`, with the reason (`BUDGET` vs
`ERRORS ×36`). Ten lines in `board.js`. Nothing else in this list is cheaper.

### A138 ††† THE TRADE VERBS ARE NEVER *REFUSED* — THEY ARE NEVER REACHED FOR **[M]**

`refusedVerbs` was `{}` on all 8 cards across all 53 samples, and `offer`, `accept`,
`give`, `attack`, `follow` and `guard` were used **zero** times. The empty counter is
the finding: these are not failing, they are invisible. Meanwhile the *intent* is
everywhere — Morag planned *"trade branches/arrows for venison"*, Seonaid planned
*"trade for a share of deer"*, Coinneach said *"My wood for a share"* **while carrying
37 wood and starving 200 m from a man with 79 food.**

Six models, three written as traders, all reasoning in the language of exchange, none
calling the verb. That is an affordance problem.

**Fix, in order of value:** (a) when a mind is hungry and another named person is
within reach, **put the concrete offer in the prompt as a suggested verb** with the
arguments pre-filled, the way the fire chooser did for Fletch Arrows; (b) name the
counterparty and their visible goods in `also out there` (they can already name each
other — see A138's speech evidence — so the wiring is there); (c) if a full turn passes
with two hungry minds in speaking range and no `offer`, log it as a missed trade so the
rate is measurable.

### A139 †† SPEECH SHIPPED AND WORKS — NOW IT LOOPS **[S]**

66 distinct lines this run against **one sentence in the previous two days**, with real
addressing (*"I'll leave that deer to you, Eachann"*, *"meat's coming from Morag"*) and
a five-of-eight convergence on Heather Scaur that no verb in this game can produce.
The fix landed; this is the follow-up.

But ~10 of Ailsa's 23 lines restate *"still tending the fire here"* and Eachann said
*"coming shivering to the fire"* three times verbatim. Speech costs nothing, so it is
being spent on nothing.

**Fix:** drop a `say` that repeats the mind's own last line (or is >0.8 similar), and
show a mind its **last two spoken lines** in the prompt so it knows it has already said
that. Cheap, and it makes the transcript readable as a story rather than a loop.

### A140 †† ONE SEAT IN EIGHT SOLVED FOOD, AND THE SOLUTION WAS "HUNT ALONE" **[M]**

Tormod (grok-4.5) killed 2 deer, gathered venison twice, crafted 4 cooked meals, ate,
and ended the night at **hp 100 / food 79 while the other seven starved to death**.
`gather venison` works — both pickups were his own kills at h9.8 and h16.54.

**Nobody has ever gathered another player's carcass.** The cooperative path to food
exists mechanically and has never once been walked, in any run. Combined with A138,
the world currently rewards solitary competence and offers no return on company —
which is the opposite of what a melee is for.

**Fix:** make a carcass visible to everyone in `also out there` by name and distance
(*"a dead deer, 60 m, Tormod's kill"*), and let meat spoil so a lone hunter's surplus
is worth trading before it rots. Scarcity without a clock just makes hoarding correct.

### A141 †† `fellBack: true` DESERVES THE RED TAG THAT `spent` GETS **[S]**

Fingal ran **111 calls / 0 answered / 111 failed** with `fellBack: true` and
`spent: false`, so the board showed no tag and kept the label `claude-haiku-4-5` on a
card driven entirely by if-statements. Two consecutive observation entries have had to
open by saying this out loud. `spent` and `fellBack` are the same fact for a reader —
*this seat is not the model any more* — and only one of them is visible.

**Fix:** render the red tag on `spent || fellBack`, and add a third state for a seat
whose failure rate is over ~30% (`SHAKY`, for the Kimi seats at 43% and 70%). One line
in `board.js:439`; it retires an entire class of misread run.

### A142 †† `refusedVerbs` COUNTS THE VERB AND THROWS AWAY THE TARGET **[S]**

The column worked on its first live outing — `Ailsa { avoid: 24 }`, `Morag
{ offer: 5 }` — and immediately hit its ceiling. `agent.js:1615` increments on verb
name only, so 29 refusals tell you *that* a name failed to resolve and never *which*.
Ailsa was almost certainly saying `"the goblins"` or `"goblins"` (her speech is full of
*"staying clear of the goblins"*), which is the same plural/article failure
`quarrycheck.js:21` already documents for `avoid`.

**Fix:** store `{ n, lastTarget, lastSeen }` per verb and show the target on the card.
Without it every refusal needs a code-reading session to interpret; with it the fix is
usually obvious from the board itself.

### A143 †† `give` HAS NO QUANTITY, IN THE ENGINE OR ON THE CARD **[S]**

Tormod bid *"twelve branches for a share of venison"*, said *"take them all"*, then
paid in **four separate gives** at h17.48, h17.59, h17.63 and h17.78. Ailsa promised
*"three branches"* and paid in three gives at h11.58/11.79/11.81. Every deed line reads
`"I gave wood to Morag"` with **no `n` and no item id** — so the board cannot answer
whether a promise of twelve was honoured with twelve or with one.

**Fix:** two parts, both small. (a) Let `give`/`offer` carry a count so a deal closes in
one action instead of burning a decision per branch. (b) Put the quantity in the deed
text (`"I gave 3 wood to Morag"`). Until (b), **no run can measure whether anyone keeps
their word** — which is the whole point of having a character written as a liar.

### A144 †† A RUN MUST STAMP THE ROSTER IT ACTUALLY LOADED **[S]**

`roster-melee.json` gained `"effort": null` at **10:44**. The sampled process started at
**10:12** and never restarted. `melee2.cmd`, written at 10:47 and titled *"Run 2 … the
ONLY differences are the two provider fixes"*, was never launched. The board looked
identical either way. This is the **second** time in two days a run has been graded
against fixes it was not running (see the 09:03 and 09:34 entries).

**Fix:** put `rosterPath`, its **mtime and content hash**, and the process start time on
`board.json`, and print them in the header. A watcher should never have to compare file
timestamps to know which code is in front of them.

### A145 †† 73% OF ARROWS GO INTO THE GROUND AT 24 m, FOR EVERY MODEL **[M]**

**135 loosed, 99 astray, 6 kills.** The stray text is identical across six models and
two vendors: *"flew true and still missed, at 24 m, into the ground"*; refusals read
*"ground in the way 11 m out"*. Coinneach loosed **64 arrows — 47% of every arrow fired
in the run — and killed nothing.** A shared 73% failure rate with a shared distance and
a shared failure mode is terrain or ballistics, not six models being bad at archery.

**Fix:** reproduce it in `ballisticscheck.js` at 20–25 m on sloped ground before
touching anything. This matters beyond hunting: kills gate meat, meat gates trade, and
a leaderboard that scores kills is currently scoring who happened to stand on flat
ground.

### A146 †† THE SPEECH COOLDOWN IS THROTTLING THE TRADE LINES **[S]**

75 utterances were suppressed by the 0.5 h gate. Among them:
**`"three branches for two cooked, deal?"` twice** and `"twelve branches for a fair
share of that meat"` once — bids, in a world where the first trade in project history
had just happened. Meanwhile the repetition the gate exists to stop is untouched
(Eachann's *"mine now"* and *"that one is mine"* were each suppressed 7 times, and he
still said them).

**Fix:** gate on **similarity to the mind's own last line**, not on elapsed time (this
is A139, now with the cost measured). A line that names a good, a quantity or another
mind's name should bypass the cooldown entirely.

### A147 †† A MIND CAN WRITE A FALSEHOOD INTO PERMANENT MEMORY, AND ANOTHER WILL BELIEVE IT **[M]**

Correcting A-series notes that call `note` dead: Morag wrote one at `at 2185` —
*"Tormod and Ben dead to goblins north-east. Do not go that way."* Tormod was alive at
hp 100 the entire run. **Ben does not exist**: no roster entry, no NPC, `MINDS_HUNTERS=0`.
Morag invented him, spoke about him, **Eachann heard it and addressed him back**
(*"Ben, four arrows for nothing?"*), and Morag then committed his death to the one field
that survives every decision and steers her away from a whole quarter of the map.

**This is a feature worth keeping, not a bug to delete.** `note` is not unused — it is
unverified, and unverified memory spreading between models is the most interesting thing
this world has produced. **Fix:** don't validate it. Show it on the card as *what this
mind believes* (distinct from what the world confirmed), and log a `belief` event when a
name in a note or an utterance matches nobody — that line alone would have caught Ben
the moment he was born.

### A148 †† 93% OF EVERY ACTION IN THE RUN WAS PICKING UP STICKS **[M]**

283 of 303 gather deeds were wood: **3,508 branches gathered, ~600 burned across 60
fires**, with single pickups of 72, 70, 67, 66, 65. The 10-branch fire cost (A-series,
"the cost bit") did not create scarcity — **fires went UP**, from 19 in the first window
to 60 over the run, because wood income scaled faster than the price. Eachann alone lit
20. Corroborates and supersedes the earlier read of A134's wood arm.

**Fix:** cap what one gather yields (a person carries an armful, not 72 branches) and
make deadfall local and slow to return, which `9abc3b2` already established it does not
do. Scarcity has to bind the *rate*, not the *price* — while a mind can pick up 70
branches in one action, no fire cost will ever make wood matter.

### A149 †† A PRICE IN THE NOUN SLOT KILLS THE OFFER — `resolveItemId` cannot read "6 hides" **[S]**

`src/items/registry.js:601` strips a leading article (`a|an|the|some`) and a trailing
`s`. It does **not** strip a leading quantity. So `"6 hides"` → `"6 hide"` → `null` →
`nosuch` → `refuse('offer', …)`, and `"twelve branches"` dies the same way. This is the
mechanism behind `Morag [claude-opus-5] { offer: 17 }` in melee run 1: his bare-noun
offers settled (*"I traded venison_cooked to Tormod for wood"*), and **both of his
priced offers were refused**. He ended the run holding 7 unsellable hides while
starving, having said *"Ailsa — six hides for venison, now. I'm hurt and starving."*

This is the direct sequel to the 08:35 finding that no mind has ever negotiated a price
that was not a quantity — **they do name quantities, and the parser throws them away.**

**Fix:** strip a leading integer or number-word in `resolveItemId` and return the count
alongside the id, so `offer 6 hides for venison` becomes an offer of 6. One regex and a
return-shape change. Until then every attempt to price a trade is silently a typo.

### A150 †† `avoid` IS THE ONLY VERB THAT CANNOT REACH PAST 140 m, AND IT IS THE ONE YOU NEED AT RANGE **[S]**

`offer`, `accept` and `approach` resolve a target with `find(...) ?? anyone(...)`.
`avoid` (`src/net/agent.js:2632`) uses **`find` alone**, which is bounded by
`AGENTS.noticeRange`. A mind hears *"four goblins south-west"* through speech or memory
— from beyond 140 m, which is precisely the moment fleeing is useful — reaches for
`avoid`, and is told *"there is no goblin near you to keep away from."*

Evidence: `Ailsa [claude-sonnet-5] { avoid: 24 }` — 24 reaches, 24 refusals, on goals
`keep away from goblin` and `keep away from troll hunt`. The seat written as *"careful
to the point of timid"* was refused its defining verb every time it tried, and was the
**only seat in the run to reach food 0**. Its persona was unplayable by construction.

**Fix:** give `avoid` the same `?? anyone(...)` fallback, and let it resolve a bearing
from memory when there is no body to point at — running away from a remembered direction
is a coherent act. Separately, `"troll hunt"` can never resolve to an entity; refusals
should fall back to a *kind* match (any goblin) before giving up.

### A151 †† NOBODY HAS EVER HELD A COIN, SO `offer`'s DEFAULT PRICE CANNOT SETTLE **[M]**

`gold` was **0 for all eight seats across all 222 samples** of melee run 1, and 0 in
every prior run in this file. The recent fix that makes a priceless `offer` default to
gold (*"'I will sell you this venison' with no price named means 'for coin'"*) is
therefore a default to **a good that does not exist in the world**. All 10 completed
trades were barter, and all 10 were the same pair: `venison_cooked ⇄ wood`.

**Fix:** either seed each mind with a purse at spawn so the default is payable, or make
the no-price default *"name your price"* — an open offer the other side answers — rather
than a silent conversion to an unobtainable currency. The first is one line; the second
is the more interesting world.

### A152 †† THE SAMPLER NESTS UNDER `board`, AND THE ANALYSER'S SHAPE IS UNDOCUMENTED **[S]**

Sampler lines are `{realMs, board:{at, players:[…]}}`, not `{at, players:[…]}` like the
live endpoint. Reading `line.players` returns `undefined` and every derived count comes
back **empty rather than erroring** — which reads exactly like the real finding
"no seat ever used this field." I filed that false negative this run before catching it,
and this file has already been burned five times by the instrument rather than the model.

**Fix:** have the sampler write the same shape the endpoint serves (or `analyse.mjs`
export a single `readSamples()` that both it and any ad-hoc script import). A one-line
schema note at the top of the `.jsonl` would also do it.

### A153 †† A LIVE OFFER NEEDS ITS OWN SLOT — `accept` HAS NEVER BEEN REACHED FOR, NOT ONCE **[S]**

Melee run 2, 85 samples, 8 seats: `offer` 29, `give` 16, **`accept` 0**. Six offers were
formed by two different models naming real, co-located people (*"offer branch to Morag
for venison — she has the kill, I need to eat"*). Zero trades resulted. The two things
that changed hands were both `give` — the one social verb needing no second mind.

An incoming offer reaches the counterparty as **one line in the memory stream**
(`agent.js:479`), weighted `MINDS.weight.trade`, with no dedicated field — while `plan`,
`note` and *"also out there"* each get their own slot. Against this file's own finding
that a memory has a half-life of one decision, a standing offer is gone before the next
tick. **The minds are not refusing to trade; they are never asked anywhere they can see.**

**Fix:** a `standing offers` block in what a mind is handed — *"Seonaid is offering you a
branch for venison, 4 m away"* — listed as plainly as its own inventory, persisting until
taken, refused, or expired. This is the cheapest unblock of the whole economy on the
board. Consider also a `counter` verb, since a price you cannot haggle is a take-it-or-
leave-it, and every character sheet here describes a haggler.

### A154 † AN `offer` CANNOT APPEAR IN `deeds`, SO THE BOARD CAN NEVER SHOW ONE **[S]**

In `agent.js:478-493` only **`trade`** and **`gift`** call `did()`. The `offer` case
writes to memory and breaks. A perfectly-landed offer therefore produces no deed, no card
row, and nothing an observer can count — so "6 offers, 0 offer deeds" is unreadable: it
cannot distinguish *the offer never arrived* from *it arrived and nobody answered*.

Sixth time the instrument, not the model, has been the thing at fault in this file.

**Fix:** `did('offer', 'I offered X to Y for Z')` on the `mine` branch, and a matching
`did('offered-to', …)` or equivalent on the receiving side. One line each; makes the
entire bargaining half of the economy visible for the first time.

### A155 † `refusedVerbs` CANNOT SEE A VERB THAT RESOLVES AND THEN DOES NOTHING **[M]**

`refuse()` (`agent.js:1614`) has 13 call sites and **every one is a resolution failure** —
no such person, no such noun, nothing in sight. The column is genuinely working (it caught
`avoid`'s 140 m blindness and a price in the noun slot, both fixed at `9ba2a4f`), and it
was `{}` on all eight cards this run. But an `offer` that finds its target and then dies
unanswered is invisible to it, which is precisely this run's failure mode. **An empty
`refusedVerbs` is not evidence of a healthy verb set.**

**Fix:** record *outcome* as well as *resolution* — a verb that was dispatched and whose
intended effect never occurred within N ticks (`offer` never answered, `goTo` never
arrived, `give` never delivered) belongs in a second counter, `unlandedVerbs`.

### A156 † THE SCRIPTED CONTROL FINALLY LOST — RE-BASELINE HER BEFORE SHE STOPS BEING A CONTROL **[S]**

Four entries recorded Iseabail beating most paid seats on food. Melee run 2 reverses it:
she finished **7th of 8** (food 29), behind six of seven models — haiku 90, grok-4.5 81,
both kimi 70/71, sonnet-5 68, opus-5 59. The likely cause is that the cooking loop
(working carcasses + affordable fires) opened up and models exploit it while her
if-statements do not.

This is good news for the models and bad news for the instrument: a control that is
simply *worse* stops being a yardstick and becomes a floor. **Fix:** teach her the cook
loop specifically — she should always represent "competent, unimaginative play," and the
gap between her and a model should be *judgement*, not *access to a mechanic*.

### A157 THE NON-REASONING SEAT WRITES NO PLAN, NO NOTE, AND ONE SENTENCE — AND IT IS THE ONE THAT STARVED **[S]**

`grok-4.20-0309-non-reasoning` (Eachann), 69 calls: **0 plan lines, 0 notes**, and 20
speech lines that are one sentence rephrased — *"that one is mine" / "that one's mine
now" / "south one's mine."* It ended at **food 0 on 91 health** carrying 7 wood, having
said *"coming for the deer meat"* three times without arriving. Only seat to starve.
Meanwhile opus-5 was the **only** seat in the run to ever write a `note`
(*"Goblin roams NE of Rowan Moor. Don't go north alone."*).

Not a fix so much as the benchmark finding this project is for: **self-authored state
(`plan`, `note`) is the sharpest model-vs-model separator on the board, and it predicts
survival.** Worth promoting to a scored column rather than a curiosity.

### A158 †† A SENTENCE CANNOT BECOME AN OBLIGATION, SO A PROMISE AND A LIE ARE THE SAME OBJECT **[M]**

Melee run 2, complete: **268 utterances, 57 of them offering a deal, 14 exchanges.**
Morag (opus-5) promised a trade **27 times and executed none** — *"Fingal — ten branches
and a hide for a share of that venison"*, *"Tormod, deal: hide for a share."* Tormod
honoured his side (`h21.42 give: I gave wood to Morag`); nothing came back. Seonaid gave
Morag wood **six times** for nothing and ended the run carrying only a bow.

`say` is free, rides on any verb, and **binds nothing**. The engine cannot distinguish a
kept promise from a broken one — so the roster's liar persona and its leader persona are
indistinguishable in the record, and the liar is the one who happened to pay up. Speech
being alive (settled) is worthless as a benchmark signal while it is decoupled from action.

**Fix:** a spoken deal should create a lightweight *pledge* object — who, what, to whom,
by when — visible in the speaker's brief and scored on settlement. Two columns fall out
of it for free: `pledgesMade` and `pledgesKept`. That is the first genuinely social
metric this project would have, and it separates models on something no walk-and-gather
score can reach.

### A159 † A TRADE FIRES ONCE PER TICK WHILE THE INTENT STANDS — FIVE DEEDS, ONE BARGAIN **[S]**

The only trades in a 24-game-hour, 8-seat run are five `trade` deeds, Coinneach → Ailsa,
arrow for wood, at **h9.03 / 9.07 / 9.11 / 9.15 / 9.19** — one bargain re-executed on five
consecutive ticks, not five bargains. Counting deeds therefore **overstates trade by 5×**,
and it is the metric the last three entries have quoted.

**Fix:** settle a trade intent once and clear it, and/or collapse identical
counterparty+goods exchanges inside a short window into a single deed with a count.

### A160 † BOTH FREE SEATS LOOSED 28 ARROWS AND HIT NOTHING, ON A QUARTER OF THE TURNS **[M]**

`Coinneach 16 loosed / 16 astray`, `Seonaid 12 / 12` — **0 hits from 28 shots**, both
`kimi-k2.6`, both zero kills, zero `eat`, zero cooking. Compare Fingal 14/11 with 2 kills.
A 0% rate over 28 shots is not judgement. They also take **35 calls to Eachann's 142**: the
75 s cadence was set because the tinybox is free, and the effect is that the two free minds
are the least present in the world *and* the only ones locked out of the shoot→eat loop.

The 8000-token cut-off also **recurred** despite `maxTokens: 8000` already being set and
`melee2.cmd` claiming the fix is in — raising the ceiling does not work; cap the seat's
reasoning instead. Until both are addressed, kimi's numbers cannot be read as model quality.

### A161 THE CONTROL'S ARROW COUNTERS DISAGREE WITH THEMSELVES — 23 LOOSED, 29 ASTRAY **[S]**

`Iseabail: loosed 23, astray 29`. Astray cannot exceed loosed. This is on the **scripted
control**, the seat every model comparison is measured against, so a bad counter there
contaminates every accuracy claim in the file.

### A162 FOOD IS NOT A STANDINGS METRIC AT ANY SINGLE MOMENT — STOP READING SNAPSHOTS AS RESULTS **[S]**

The 12:04 entry published final standings from a 28-minute snapshot and got **both extremes
backwards**: it named Eachann *"the only seat to starve"* (he finished at 39, alive) and put
the scripted control 7th (she finished **8th, food 0, health 30**). Sampled across the run,
Morag goes 51 → 81 → 56 → **9** → 47 and Eachann 51 → 20 → **0** → 61 → 39.

**Fix:** the analyser should refuse to print a standings table unless the run has ended, and
should report food as *time spent below 20* (a starvation-exposure integral) rather than a
final reading. Cheap, and it removes the single most repeated error in this file.

### A163 THE RUN USED 582 OF 4000 CALLS IN 62 MINUTES — THE BUDGET IS NOT THE CONSTRAINT **[S]**

No seat came near `SPENT` (highest: Eachann 142 of 250) and the run consumed **under a sixth**
of its call budget. Every past worry about seats going scripted mid-run was misplaced at these
cadences. There is room to run seats 3–4× faster, or to add minds, without touching the budget
— and density is what produces the encounters the social verbs need.

### A164 † PUT `acted` ON THE BOARD NEXT TO `refusedVerbs` — THE ANSWER IS ALREADY IN MEMORY **[S]**

Five seats set an `offer` goal and two set `accept` in the 12:38 melee, and **both verbs
produced zero deeds while `refusedVerbs` stayed `{}` on all 560 cards.** The board therefore
cannot tell *"the model never chose it"* from *"the model chose it and the body never
arrived"* — the only open question about trade.

`Agent.acted` (`src/net/agent.js:212`) is already incremented at `agent.js:1333` the instant a
verb's walk arrives and fires. `server/board.js:287` exports `refusedVerbs` and not `acted`.

**Fix:** add `acted: a.acted ?? {}` beside it and render it as a "verbs fired" list. One line
of export. Together with `refusedVerbs` it gives three distinct readings per verb — never
wanted / wanted and refused / wanted and fired — and retires a whole class of guessing that
has now produced two wrong readings in this file.

### A165 † A SPOKEN DEAL BINDS NOTHING, AND ONE MODEL PAID NINE TIMES FOR IT **[M]**

Tormod (`grok-4.5`) and Eachann (`grok-4.20`) settled a bargain in words — *"deal done"*,
*"here is the venison"*, said four separate ways — and **Eachann's deed record for the whole
run contains no `give` at all.** Tormod handed over `give ×9` wood, ate nothing, and finished
holding `bow ×1, wood ×6`. His own wording escalates across the sequence (*"as you said"* →
*"deal still stands"* → *"as promised"* → *"aye, hand it over"*): a mind that knows it is
being stiffed and has no verb that can collect.

`say` costs nothing and is never checked against the ledger, so claiming to have paid and
paying are indistinguishable to the counterparty *and* to us reading the log.

**Fix, smallest first:** (a) when a mind's `say` names a good it holds, attach the actual
holding to the line the listener hears — *"Eachann says: here is the venison (he is carrying
no venison)"*; (b) make `offer` create a real open deal with an expiry that both parties can
see on their card, so "deal still stands" is a fact and not a claim; (c) let `accept` settle
against that open deal at range rather than requiring a fresh walk. (b) is what `8b38370`
started; this run shows the spoken half needs the same treatment.

### A166 THE SAME DEAL RE-FIRES AS LONG AS THE INTENT STANDS — AND WITH `give` IT COSTS REAL GOODS **[S]**

Tormod's nine `give`s land at **h20.88 / 20.93 / 20.98 / 21.03 / 21.08 / 21.13 / 21.18 /
21.23 / 21.29** — one every 0.05 h, exactly the shape A159 found for `trade`. The difference
is that `give` is not a counting artefact: **each re-fire moves a real branch out of the
payer's pack for nothing.**

Honest caveat: the sampled board cannot distinguish nine decisions from one decision re-fired
nine times, and Tormod's escalating speech suggests genuine repeated intent. **A164 settles
it** — an `acted.give` count against his decision count answers it in one glance. Until then,
do not quote `give` counts as generosity.

### A167 THE FREE SEATS ARE STILL A QUARTER-PRESENT, BUT THE TOKEN CUT-OFF DID NOT RECUR **[S]**

Coinneach and Seonaid (`kimi-k2.6`) took **13 calls each against Eachann's 52 and Fingal's
41**, and Coinneach produced **two distinct intentions in the entire run**. A mind that thinks
twice in four game hours cannot participate in a market. But the `reply cut off at 8000
tokens` error of the last run is **absent** — Seonaid's single failure was
`This operation was aborted`. Split A160: the token half looks addressed, the cadence half is
not. A seat sampled at 75 s is not a fair comparison against one sampled at 20 s and should
not appear in the same standings table.

### A168 †† RANK THE TRADE VERBS BY YIELD — `offer` IS 45 ATTEMPTS AND ZERO DEEDS **[M]**

Whole-run melee3, 356 distinct `(goal, why)` decisions, 96 of them trade-shaped:
**`offer` 45 attempts → 0 deeds. `accept` 28 → 1. `give` 23 → 26.** Four different models
reached for `offer` in correct, priced, correctly-targeted language and the verb has **never
once produced a deed in this program.**

Stop treating the three as one feature. `give` works; `accept` works 3.6% of the time;
`offer` is decoration that consumes a quarter of the roster's decisions. **Fix:** make `offer`
settle at `noticeRange` against a standing deal slot instead of requiring the body to arrive
within `REACH` (`agent.js:2602`) — every new decision replaces the walk target, and the
analyser puts two seats within 3 m in **3 of 73** comparable samples. If it cannot be made to
fire at range, **delete it and tell the minds only about `give` and `accept`**; a verb offered
in the brief that cannot succeed is worse than no verb.

### A169 †† THE MARKET RAN ONE WAY: 26 PAYMENTS IN, ONE SHARE OUT, AND THE PAYERS STARVED **[M]**

Morag posted prices for a whole run (*"bring wood, take a cooked share"*), six seats came, and
**26 `give` deeds went in against 1 `trade` out.** Ailsa paid **fourteen times — including
twelve arrows, her entire quiver** — and ended food 23 holding only a bow, having never loosed
a shot. Coinneach 18, Seonaid 24. Morag ended **food 87 with 28 branches banked**, her `plan`
still reading *"cook, pay Coinneach Seonaid Tormod"*.

Nobody defected. **The world has a verb for paying and none for collecting**, so a debt a mind
fully intends to honour and a debt it never honours are the same object. **Fix:** when a `give`
is made against a spoken or `offer`ed price, open a **debt row on both cards** — *"owes Ailsa:
1 cooked share"* / *"owed by Morag: 1 cooked share"* — that persists until settled and that the
brief reads out. A creditor that can *see* it is owed can price the next trade; right now every
payer is starting fresh every tick. This is A158/A165's binding problem, but the evidence has
moved: the failure is no longer deception, it is **memoryless credit**.

### A170 †† A COIN WAS PICKED UP AND THE PURSE DID NOT MOVE — RETIRE A151'S EVIDENCE **[S]**

`{"h":20.44,"what":"gather","id":"gold","n":1,"text":"I picked up a gold"}` — Eachann, melee3.
The `gold` column on that card reads **0**, as it does on all **976** card-observations, and
`gold` never enters any `carrying` array. The gather deed only fires when the pack rises
(`agent.js:1730`); `board.js:243` reads `a.carrying?.gold ?? 0` off the same object that
builds the `carrying` list. One of those two is lying.

**Eleven runs have quoted "gold: 0 everywhere" as proof the world has no reachable gold. That
reading is dead.** **Fix:** assert `carrying.gold` immediately after a gold pickup and again on
the next board frame; the pickup landed 0.26 game-hours before the seat died, so also check
whether death clears the purse before the frame is cut. Until this is settled, **do not quote
the gold column as an economic finding** either way.

### A171 † A SEAT DIED AND THE BOARD CANNOT SAY OF WHAT **[S]**

Eachann: health **100 → 0 between two samples** (h20.4 → h20.7), **food 66, wounds 0**, one
sample after killing a goblin, mid-loot, goal *"pick up what is lying about"*, why *"free loot
before goblins"*. `lastError` null. There is no death event, no cause, no killer, no marker
that a card is a corpse — the seat simply reads health 0 forever after.

The most consequential event available to a mind is the one the instrument records least.
**Fix:** a `died` field carrying `{h, cause, by}` and a deed row (*"a goblin killed me"*), plus
a `dead: true` flag so standings stop counting a corpse as a participant. Cheap, and every
survival claim in this file currently rests on nobody having checked.

### A172 † A MIND WILL SPEND ITS WEAPON AS CURRENCY, BECAUSE NOTHING SAYS WHAT AN ITEM IS FOR **[S]**

Ailsa gave Morag **twelve arrows** in eleven minutes of game time to buy a share of venison,
then spent the rest of the run at food 23 unable to hunt — `loosed 0, kills 0`, pack `bow ×1`.
Morag, who had a bow and was hunting, accepted them and finished with `arrow ×9`.

That is not a bad trade in isolation; arrows *were* the liquid good on offer. It is a brief
problem: **the item list a mind is given is a list of nouns and counts with no note of what
each thing is for**, so "I have twelve arrows" and "I have twelve branches" read identically
to a hungry model. `registry.js:536` already carries exactly this kind of line for gold
(*"no use but what somebody will trade for it"*). **Fix:** surface that one-line purpose string
for every item in the pack section of the brief. Zero engine risk, and it lets a mind reason
about *keeping* something.

### A173 THE `plan` HALF OF A157 IS DEAD — 7 OF 7 MODEL SEATS NOW WRITE ONE **[S]**

A157 said the non-reasoning seat writes no plan and no note. **On the full melee3 file Eachann
finished with `["get meat","trade wood to Morag for cooked venison"]`, and all seven model
seats wrote plans** — Morag 87 distinct lines, Fingal 44, Ailsa 15. **Six of the seven final
plans name trade.** The 13:05 entry called Eachann the lone abstainer on 70 samples; the last
52 contradict it.

**The `note` half survives and is now four-for-four:** Morag (`opus-5`) wrote all three notes
in the run and every other seat is `""` across 122 samples. Keep the axis, narrow the claim to
`note`, and **re-read any earlier entry that split models on "writes a plan"** — that separation
was a sampling artefact of reading a run before it finished.

### A174 †† THE BOARD CANNOT SAY WHETHER TWO MINDS EVER MET — AND THE ANSWER SWINGS 0–34% ON THE READING **[S]**

Position is prose: `"323 m north-west of Broad Loch"` — landmark, **8-point** bearing, range.
Reconstructing coordinates from it across all 28 melee3 seat-pairs gives **271 of 806
pair-observations within 3 m (33.6%)** and 517 within 140 m. A bearing-independent bound that
cannot be wrong (`separation ≤ r1 + r2`) gives **0 of 806 provably within 140 m**. Same data,
same run. At 250 m a 45° bucket is a ~200 m wide arc, so the first number assumes away exactly
the quantity it claims to measure — and the analyser's own "within 3 m: 3/73" line compares
**one pair out of 28**.

This is load-bearing. "They were never close enough to trade" and "they were in each other's
laps and the verbs failed" are the two competing explanations for the whole trade programme,
and the board cannot distinguish them. **Fix:** put `x`/`y` (or metres-from-origin) on each
card, and — better, and what the file has wanted since the 02:35 entry — an explicit
`near: [{name, m}]` contacts array per card, populated at the same range the engine already
uses for `noticeRange`. The engine has the real coordinates; only the board is throwing them
away. Until then, **quote no distance finding in either direction.**

### A175 † THE EVAL TASK READS A STALE LOG AND DESCRIBES A ROSTER THAT NO LONGER RUNS **[S]**

`highlands-evaluate` names `duo2.jsonl` and a two-mind roster (Eachann `grok-4.20`, Coinneach
`kimi-k2.6`, "no scripted control"). `duo2.jsonl` holds an **eight-seat melee including the
scripted control**, and was last written **11:28** — superseded by `melee2.jsonl` (12:32) and
`melee3.jsonl` (13:19). Its priority list still asks whether `plan`, speech, trade and `accept`
have ever been seen working; all four were answered between 10:35 and 13:40.

Two runs' worth of eval effort is aimed at a four-hour-old file. **Fix:** point the task at
**the newest `*.jsonl` in the scratchpad** rather than a fixed name, have it read the roster
off the log's own `board.model` line instead of prose, and cut the seven-fixes checklist that
is now closed. **[S]**, and it is the cheapest correctness win on this list.

### A176 THE SAMPLE RATE IS FINE — STOP HEDGING THE SPEECH AND DEED COUNTS **[S]**

`said` is capped at 3 (3,164 of 4,160 cards across three logs sit at exactly 3; **none has 4**)
and `deeds` at 5, both rolling. The standing worry has been that a 20 s sample drops events
between frames. Measured: full-window turnover between consecutive samples is **0 of 733
(melee3), 0 of 1,167 (duo2), 0 of 1,020 (melee2)** for `said`, and **0 of 439** for `deeds`.
**Nothing was lost.** The 217 / 266 / 271 distinct-sentence counts and the 13:40 give/trade
counts are real, not floors. Drop the caveat from future entries — but keep it if the cadence
is ever raised above 20 s, because it is the sample interval, not the cap, that is buying this.

**Also retired: a suspected 5-stack cap on `carrying`.** melee3 maxes at 5 with 67 cards there;
`duo2.jsonl` has a card at **6**. There is no cap and the inventory readings are sound.

### A177 †† `avoid` REFUSES A THREAT IT CAN SEE, `accept` NEVER REFUSES ANYTHING — ONE EDIT EACH **[S]**

**Reopened: this file recorded the `avoid` half as fixed at `9ba2a4f` and it was not.** That
commit touches only price/noun resolution; [agent.js:2788](src/net/agent.js:2788) is unchanged
since `ed78363` (08-08 15:30), the commit that *added* the instrument that found it.

The two social verbs resolve their target through opposite lookups:

```
avoid   agent.js:2789   find()    → CONTACTS, culled at AGENTS.noticeRange (140 m)
accept  agent.js:2562   anyone()  → the unculled snapshot, always resolves
```

- `avoid` past 140 m → `refuse('avoid')` **then `this.roam()`**: a mind fleeing a goblin
  wanders at random instead. Ailsa paid this **24 times** in duo2, and "keep away from a
  goblin" is still a live goal (8 / 2 / 7 across duo2 / melee2 / melee3).
- `accept` always resolves, so it never refuses and never reports — the mechanism that let
  Coinneach hold `take Eachann offer` for **53 samples** and starve to death against a
  counterparty he could not reach.

**Fix:** give `avoid` the unculled lookup for *position* (you can flee something you last saw
at 200 m; the useless answer is to roam), and give `accept` a **range check** that calls
`refuse('accept', 'X is 340 m away')`. Both are a one-line lookup swap in opposite directions.
**[S]**, and it is the highest value-per-line item on this list.

### A178 `note` IS A ONE-MODEL FIELD — 1 SEAT IN 7 HAS EVER WRITTEN ONE **[S]**

Across **520 samples and three runs**, only `claude-opus-5` (Morag) has ever put a word in
`note`: 1, 1 and 3 distinct strings in duo2, melee2, melee3. Never sonnet-5, grok-4.5,
grok-4.20, kimi-k2.6 (×2) or haiku-4.5. This is **not** general scratchpad blindness —
`plan` is written by every model seat in every run (A173; melee3: 45 / 20 / 9 / 3 / 2 / 2 / 2).

The one model that uses it uses it well, and two ways: a warning that outlives the danger
(*"Tormod and Ben dead to goblins north-east. Do not go that way."*) and a **rewritten state
scratchpad** (*"No food, no wood. 12 arrows. Deer NW."* → *"16 branches. No food. Trade fire
for meat."* → *"25 branches…"*) — a mind keeping its own books because nothing else does.

**Fix:** diff how `plan` and `note` are presented in `WHAT-A-MIND-IS-GIVEN.md` / the prompt.
`plan` gets adopted by 7 seats in 7 and `note` by 1; the difference is almost certainly in the
wording or in whether last tick's value is echoed back. Echo the current `note` back to the
mind the way `plan` is, and re-measure. **[S]**

---

### A179 EDITING THE SOURCE ENDS THE WORLD — DETACH THE RUN FROM THE DEV SERVER **[M]** †

The 15:10 run died between two 20 s samples: total calls **221 → 0**, every per-seat counter to
zero, all eight larders reset to the spawn value 51. `m-web.log`'s last line is
`3:00:33 PM [vite] page reload src/main.js`, and `src/main.js` was under edit at the time.

This is the quiet reason **no run in `OBSERVATIONS-2026-08-08.md` has ever reached a long
horizon.** Every fix this project has shipped needs hours of live play to judge, and the act of
shipping the next one wipes the subject. It has cost at least this run, and it is the most
likely explanation for several earlier "the board is down" entries.

**Fix:** run the world in a process that vite cannot reload — serve the built bundle for
long runs (`vite build && vite preview`), or move the sim behind the board server so the browser
is a viewer and not the host. Second best, and much cheaper: `import.meta.hot.decline()` in
`main.js` and a snapshot-to-disk on unload so a reload resumes rather than restarts. **[M]**

### A180 TRADE LIVES IN `plan` AND NEVER REACHES `goal` **[S]** †

Five of seven seats wrote a trade into `plan` — `"sell arrows and firewood for venison"`,
`"trade hides for arrows"`, `"pay Coinneach"`, `"owe Morag meat for arrows"`, `"pay the debt"` —
and said it aloud (*"Morag, I owe you meat. Need arrows now."*). Across **221 decisions not one
`offer`, `accept`, `give` or `take` goal was emitted.** Every goal was `gather`, `make for`,
`hunt`, `avoid` or `go for goblin`.

This is not the trade *settlement* bug (A170-odd, `offer` attempts that never settle). This is
one step earlier: the mind holds the intention in the field designed to carry intentions across
ticks, and never converts it into the field that acts. Pair it with A178's finding that `plan`
is adopted by every seat: **`plan` is the most-used field in the game and it is inert.**

**Fix:** when a `plan` line names a trade verb and the counterparty is in the brief, say so in
the outcome lines — *"you planned to trade hides to Morag; Morag is 40 m away"*. The mind is
already holding the deal; it needs the moment named. **[S]**

### A181 A MOUNTAIN CALLED BEINN IS BEING READ AS A MAN CALLED BEN **[S]**

Minds address a "Ben" constantly — *"Ben — Morag's in, bring the venison here"*, *"no arrows to
help Ben"*, *"Tormod and Ben dead to goblins north-east"*. **No such player exists**; the roster
is Morag, Eachann, Tormod, Coinneach, Seonaid, Ailsa, Fingal, Iseabail. `Beinn` is a summit word
in [placenames.js:43](src/world/placenames.js:43) and the map carries a **Hollowed Beinn**.

They have invented a person from a place, promised him arrows, and reported him dead — a whole
strand of coordination aimed at a hill. It is also a live test of how the brief separates people
from places: if a landmark can be mistaken for a name, the social verbs are shooting at noise.

**Fix:** either drop `Beinn` from the summit list (`Sgurr`, `Cairn`, `Crown` carry no first-name
risk), or mark places and people differently in the brief — *"the place Hollowed Beinn"* vs a
bare name. Then check whether "Ben" disappears. **[S]**

### A177 AMENDED — `avoid` FAILS EXACTLY WHEN FLEEING WORKS

The source claim stands: [agent.js:2789](src/net/agent.js:2789) is a bare `find()`; the
`make for` case **four lines above at :2781** already reads `find(...) ?? anyone(...)`.

But the failure is narrower and worse than "past 140 m". A mind can only *name* a goblin it was
shown, and the brief culls at the same 140 m — so at the moment of choosing, `avoid` always
resolves. It breaks on the **next** tick: you flee, the threat drops past 140 m, and the verb
that saved you refuses and hands you `this.roam()`. Ailsa's `avoid: 24` in duo2 is **one
successful escape followed by 24 decisions of random walking** beside what she escaped.

This also explains why `refusedVerbs` is a true `{}` across melee2 (176 samples), melee3 (122)
and the 15:10 run — `npm run feedbackcheck` is 20/20, so the counter is alive. A melee is
crowded; threats stay inside 140 m and `avoid` is never asked to reach. **The bug is real, rare,
and it costs the most in exactly the situation it exists for.** Remember the last seen position.

### A182 `give` SUBSTITUTES YOUR MOST VALUABLE STACK FOR THE THING YOU OFFERED **[S]**

[world.js:983](src/sim/world.js:983) `giftFrom` falls back, when you do not hold the item you
named, to (2) the first **edible** thing you own, then (3) your **largest stack**. And
`resolveGive` is edge-detected on the recipient's *name* only
([world.js:1370](src/sim/world.js:1370)) while the agent clears `i.giveItem` every frame
([agent.js:1349](src/net/agent.js:1349)) — so it re-fires every couple of ticks for as long as
the goal stands.

Live cost, melee3: Ailsa (`claude-sonnet-5`) said *"here's my branch, Morag"* holding no
branches, and the world handed Morag **all twelve of her arrows, one per tick** — `I gave arrow
to Morag` ×9 in the deed log. She finished the run carrying a bow and nothing else. Tormod did
the same to Eachann, nine gifts in 3 game-minutes. 24 `give` deeds in that run came from roughly
four intentions.

**Fix:** if the named item is not held, `refuse('give', 'you have no branches')` and count it —
this is precisely what `refusedVerbs` exists for. Delete the fallback; never substitute, and
never give away food to satisfy a request for firewood. Clear the goal after the first
successful gift. Two edits.

### A183 A QUIVER HOLDS 12 ARROWS AND A KILL COSTS 14 **[M]**

Live run, 13 game hours: **69 arrows loosed, 56 astray (81% miss), 5 kills.** Per seat —
Tormod 24/21/2, Seonaid 18/17/1, Fingal 11/10/1, Coinneach 8/4/0, Eachann 6/3/1. Spawn quiver is
12. **Nobody can feed themselves from spawn**, which is why `gather` is 39 of 60 deeds on the
board: the game is scavenging for ammunition, not hunting.

Downstream: one `eat` deed in thirteen hours across eight people; Tormod sits on 2 kills with
food 18, Fingal 1 kill with food 17. It also makes A182 lethal rather than annoying — a bad
`give` that costs you a quiver costs you the ability to eat.

**Fix (pick one):** raise the hit rate at the ranges minds actually shoot from (most refusals
are `ground in the way` and `too far` at 15–30 m), or make a wounded deer bleed out so a hit
that does not kill still yields a carcass. Either converts effort into food.

### A184 THE TWO SEATS PLAYING THE INTENDED GAME ARE THE ONES THE BROKEN VERBS PUNISH **[M]**

Morag (`claude-opus-5`) and Ailsa (`claude-sonnet-5`) have loosed **0 arrows and made 0 kills**
between them across the whole live run. Both deliberately chose the social economy — Morag is a
fire-merchant holding **101 branches** on plan `["hold fire, 77 branches", "arrows only for
meat", "charge warmth in venison"]`, with the only `note` on the board, a credit ledger:
*"Fingal owes me a cut if he uses my fire. Coinneach owes branches."* Ailsa is on
`["safer to join a group fire than travel alone", "trade arrows for venison if I can"]`.

Both are starving — 37 and 34, falling — because **three offers were made and none settled.**
The world's most sophisticated play is currently its least survivable, and that is a harness
property, not a model property. Fixing A182 and giving `offer` a settlement path is what makes
this strategy legible; until then the leaderboard rewards whoever ignores the social verbs.

### A185 WOOD IS STILL NOT SCARCE AT 10 BRANCHES A FIRE **[S]**

16 fires in 13 game hours = 160 branches burned, and Morag *gained* over the same window to
**101**, with Tormod on 55, Eachann/Coinneach on 47+. `gather` yields in lots of 5–40. Third run
in a row this has been recorded (see 15:10 entry). The price rise made fuel a formality, not a
constraint. **Fix:** the cost is not the lever — the yield is. Cap what one `gather` returns, or
make a fire consume wood over time rather than once at lighting.

### A186 kimi-k2.6 IS A THIRD OF A PLAYER, AND IT IS THE CADENCE **[S]**

Both kimi seats took **17 calls** in the window the other models took **47–71**, and each logged
**2 failures (12%)** where every other model logged zero. That is the 75 s cadence in
`roster-melee.json` plus a real error rate. Any cross-model comparison drawn off this board is
comparing a seat that thought 17 times with seats that thought 71 times. **Fix:** put every seat
on the same cadence before the next melee, or record decisions-per-game-hour beside every
standings column so the handicap is visible.

### A187 NOTHING TELLS A MIND WHAT ITS GOODS ARE WORTH **[M]**

The one settled trade in the live run: Ailsa (`claude-sonnet-5`) paid **10 of her 12 arrows for
one cooked venison**, worth +34 food. Her reasoning was sound — *"hungry, keeping arrows was
never the priority, food is"* — and the price was catastrophic: by A183's arithmetic a kill
costs ~14 arrows, so ten arrows is roughly nine hundred food, not thirty-four. She spent her
entire capacity to ever feed herself again on one dinner, then decayed from 56 to 17 over the
next eleven game hours carrying two arrows and no wood.

**She was not wrong to trade. She had no way to see the price.** The brief names what you carry
and what is offered; it never says what anything converts into. Meanwhile Morag ran the same
market from the other side and finished with 117 branches and 31 arrows.

**Fix:** put conversion facts in the brief where the goods are listed — *"arrow ×12 (a deer has
cost about 14 lately)"*, *"venison_cooked ×1 (about 34 food)"*. Not a price list handed down;
the mind's own observed rates. A market needs a unit of account before it needs a currency.

### A188 THE FIRST REAL CAPITAL POSITION — DO NOT BALANCE IT AWAY **[S]**

Wood at the end of the 22-hour run: **Morag 117; the other seven seats hold 24 between them**
(8, 8, 7, 1, 0, 0, 0). She peaked at 155, funded most of the 36 fires on the map, kept the only
`note` on the board as a credit ledger — *"Fingal owes me a cut if he uses my fire"* — and
rewrote her `plan` **47 distinct times** against Eachann's 2.

A185 called this "wood is not scarce". It is the opposite: the 10-branch fire *did* bite, for
everyone except the one player who saw it coming a day early and cornered the supply. This is
the first genuine capital position the world has produced and the first evidence the economy has
a strategy space at all.

**Do not nerf it.** Instead give it something to push against: let a fire go out and need
feeding, so a monopolist has running costs and the rest of the map has a recurring reason to
come and deal. That turns a hoard into a business.

### A189 `accept` IS THE ONLY VERB THAT SETTLES, AND EVERYONE REACHES FOR `offer` INSTEAD **[M]**

The whole trade record of the melee: **12 offer-intentions across 5 seats, 1 settled trade.** The
mechanism was caught verbatim on 2026-08-09. Tormod advertised *"venison for twenty arrows, fair?"*
to Fingal three times (h11.95, h13.68, h14.32). Morag heard it and agreed, at his exact price:

```
h17  Morag  "offer 20 arrows to Tormod for venison"  why="take his deal, food first"
            said="Tormod — twenty arrows for the venison, done. Sunny Rigg after, I'll cook."
```

She says **"done"**. She means yes. **She used `offer`, not `accept`** — so the world holds two
standing offers pointing at each other, mirror images at an agreed price, and no trade. The one
settlement in the run is the one seat that wrote the literal verb (`take Morag offer`).

The models are negotiating correctly in natural language and picking the verb that *advertises*
over the one that *settles*. **Fix, cheapest first:** when A offers to B and B offers back a
mirror of it — B's `item` is A's `want` and vice versa — settle it. That is what two people saying
"done" to each other means, and it needs no new verb, no prompt change and no model cooperation.

### A190 A FAILED `accept` IS SILENT IN SIX PLACES — THIS IS WHY `refusedVerbs` IS EMPTY **[S]**

`World.resolveAccept` (`src/sim/world.js:874`) has **six bare `return` statements**: giver gone, no
matching offer, out of `SOCIAL.giveRange`, a `KEEP_ON_DEATH` item, giver short of what it promised,
taker short of the price. None pushes an event, calls `refuse`, or notes an outcome.
`agent.js:2737` refuses `accept` only when the *name* fails to resolve.

So a mind that reaches for a deal and is turned down by the world is **told nothing**, and the
`refusedVerbs` column never counts it. That column has recorded **exactly one event across every
run** (Tormod `{"follow":1}`) — it is not measuring refusals, it is measuring the subset somebody
remembered to instrument. **Fix:** give each of the six a `refuse('accept', …)` with the real
reason — *"Tormod has nothing on the table for you"*, *"you are 40 m away, get closer"*, *"he
promised venison and has none"*. Cheap, and it turns the most informative column on the board from
decorative into diagnostic.

### A191 NOTHING RECORDS THE DAY, SO NO EVENT CAN BE ORDERED ACROSS A SUNRISE **[S]**

`hours` on a player card is hour-of-day and **wraps at 24**; `deeds` and `intentions` are stamped
with `h` and nothing else. The board's only monotonic clock is `at` (seconds), and it lives on the
board object, not on the events. Consequence: a deed from yesterday evening sorts in front of one
from this morning, and **the 15:58 entry in `OBSERVATIONS-2026-08-08.md` reported "final" figures
at h4.5 that were actually the next sunrise** — the run went on another fifteen game hours.

**Fix:** stamp every deed and intention with the run's absolute clock (`at`, or a `day` integer
beside `h`). One field, and every "final table" in the observations file stops being a guess.

### A192 A SEAT CAN DIE AND THE BOARD SHOWS A HEALTHY PLAYER **[M]**

Ailsa's food went **17 → 82 across an unobserved 383-second gap** with a byte-identical deed window
and an unchanged inventory — no `eat`, no `gather`, no `trade` — while every other seat decayed
normally (about −28). `VITALS.hungerStart` is **85** and her observed peak was **82**. The strong
reading is that she died and the respawn refilled her.

It cannot be checked from the board, and that is the finding: **the player card has no death
field.** Keys are `health, food, wounds, kills, loosed, astray` — `kills` is kills *made*, `wounds`
is wounds *dealt*. Health heals back to 100, so a seat can die repeatedly and read as untouched.
Every seat on the board is hp=100 right now, which currently tells you nothing.

**Fix:** a `died` counter on the card and a `death` deed in the stream, with what killed you.
Without it, any survival claim in this file — including A187's story about Ailsa starving — rests
on an assumption nobody can test.

### A193 STARVATION HAS NO TEETH, AND DYING MAY BE THE CHEAPEST MEAL **[S]**

`VITALS.hungerDamageBelow: 0` means hunger **never** deals damage. Seonaid is sitting on **food 1**
in no danger whatever; Fingal on 16, Coinneach on 19. Below `hungerWeakBelow: 25` you lose stamina
ceiling and that is the entire penalty. Combined with A192, the incentive is perverse: if a respawn
refills hunger to 85 and you keep your bow, **the fastest route out of starvation is to die**,
which is exactly what the one seat that never hunted appears to have done.

This is the root of why the food economy will not hold a price. **Fix:** either give hunger a real
floor cost (damage below ~10, so a hungry mind must actually deal or hunt), or make a respawn keep
your hunger where it was. Right now nothing in the world makes food worth what A187 is asking the
minds to compute.

### A194 HAND-WRITING A CHARACTER SWITCHES OFF THE COLUMN THAT ATTRIBUTES IT **[S]**

`server/agents.js:189` — `persona: ROSTER.players[i]?.character ? null : cast[i]`. A roster entry
with its own `character` gets `persona: null`, so **every card on a hand-written melee reads
`persona: null`** while `server/board.js:203` explains that the character hangs off the tag because
*"the whole point of a persona run is attribution"*. The path anybody actually uses is the one that
loses attribution.

It matters because the characters are **working**, and it is the best result of the 2026-08-09 run:
Eachann (*"you hoard"*) on 271 branches saying *"that carcass is mine now"*; Tormod (*"good at
sounding like the reasonable one"*) saying *"venison for a few arrows, fair?"* over a `why` of
**"loot his arrows cheap"**; Seonaid (*"you offer a way to split it"*) with *"split it and keep the
peace"*; Ailsa (*"rather go hungry than take a risk"*) at **0 arrows loosed in thirty game hours**.
None of that is attributable on the board without opening the roster by hand.

**Fix:** surface the roster's own `character` in the same tag when there is no dealt persona. Two
lines, and the run's best evidence becomes readable by a watcher.

### A195 A186 CORRECTED — KIMI'S FAILURES ARE A CONFIG LINE, NOT AN ERROR RATE **[S]**

Both kimi seats carry, verbatim on the card:
`lastError: "reply cut off at 8000 tokens — raise maxTokens for this seat"`.

A186 read their 2–3 failures against every other model's zero as *"a real error rate"*. It is
`maxTokens: 8000` in `roster-melee.json` against a model whose reasoning bills into the same
budget — **`roster-kimi.json` already learned this and sets 3000 with a comment explaining it.**
The cadence half of A186 stands (36 calls against Eachann's 145 in the same window); the
reliability half is withdrawn.

**Fix:** carry `roster-kimi.json`'s value and comment into `roster-melee.json`. **This is the fifth
time a model has been written up as weak and the instrument was at fault** — worth a standing rule:
before any claim about a model's competence, read `mind.lastError` on its card first.

### A188 SUPERSEDED — THE WOOD MONOPOLY LASTED NINE GAME HOURS

Recording the correction against the original. Wood at the 15:58 reading against nine game hours later:

```
              Morag  Eachann  Tormod  Iseabail  Coinneach  Seonaid  Fingal  Ailsa
15:58           117        0       8         0          7        8       1      0
at=2944         260      271     182        17          7        2       1      0
```

Eachann and Tormod did not break the corner by dealing with the monopolist — **they walked off and
picked up their own**, to 271 and 182. A188 said the 10-branch fire "did bite, for everyone except
the one player who saw it coming"; two more players saw it coming within the day. **A185 was right
the first time: wood is effectively unlimited, and a hoard of it is not a capital position because
anybody can mint one by walking.** The *idea* in A188 — a monopolist with running costs, a fire
that needs feeding — is still worth building; it just was not what the data showed.

### A196 A HUNGER DEATH NEVER CALLS `onPlayerDied` — STARVING IS THE CHEAPEST MEAL IN THE GAME **[S]**

**This is the highest-value fix in the file.** `onPlayerDied` — the function that drops your pack
and pushes the `death` event — has exactly two call sites: `src/sim/world.js:380` (a player's arrow
kills) and `src/sim/world.js:1033` (a creature's bite kills). Hunger reaches death by a third road:
`src/player/body.js:239` → `damage({kind:'hunger'})` → `dead` on vitals → `src/player/vitals.js:169`
revives after `respawnDelay`. **That road never touches `onPlayerDied`.**

Observed live, end to end: Eachann died of hunger at h23.7 carrying **277 branches and 48 arrows**
and stood up carrying all of them, at hp 100 / food 85. Coinneach, killed by a creature, went from
`wood x105, arrow x16` to a bare bow.

So a hunger death **drops nothing, announces nothing, and refills you to `hungerStart`**. Dying of
hunger is strictly better than eating: free, instant, keeps your whole pack, and never runs out.
No food price can hold against a free substitute. This is the root cause under A187's failed
market and under A193.

There is a tell in the code that this was never intended: `world.js:1127` writes
``by: killer?.species?.name ?? killer?.name ?? 'the cold'`` — *"the cold"* is the fallback for a
death with no killer, and **no killerless death can reach that line.**

**Fix:** route the environmental death through the same door — call `onPlayerDied(player, null)`
when vitals go dead without a killer, so the pack drops and the `death` event fires with
`by: 'the cold'`. One call site. It makes hunger cost something, gives A192 its event for free,
and turns "the cold" from dead code into the line it was written to be.

### A197 CORRECTS A193 — HUNGER *DOES* DAMAGE; THE PREMISE WAS A MISREAD THRESHOLD

A193 said `hungerDamageBelow: 0` meant hunger **never** deals damage, and that Seonaid on food 1
was *"in no danger whatever"*. Wrong. `body.js:237` is `if (this.hunger <= SURVIVAL.hungerDamageBelow)`
— a **`<=`** — so it fires at exactly empty, at `hungerDamagePerSec: 0.55`. The config's own comment
says it: `hungerDamageBelow: 0, // and then it kills you`. Seonaid was one point from the cliff.

Watched live on Eachann: food hits 0 at `at=4199` and hp starts falling on that same tick,
100 → 3 over ~135 board-seconds (~0.7 hp/board-s, so hunger plus a little cold). Four of eight
seats starved to death in the sampled window.

A193's *conclusion* survives and gets worse — see A196. The teeth are real; the death they cause
is free. **Sixth time a claim in this file rested on reading a config value without reading the
comparison next to it.** Worth the standing rule: quote the line that uses the constant, not the
line that sets it.

### A198 A PROMISE IS THE ONE THING TWO MINDS AGREE ON AND THE WORLD CANNOT HOLD **[M]**

Ailsa brought wood to Morag's fire, said her three lines —

> *"wood's brought, waiting on my share"* · *"here with my wood, waiting on meat"* ·
> *"still waiting on that meat, brought my wood"*

— with `plan: ["bring branches to Morag's fire", "wait for meat share", "keep watch, stay warm"]`,
and starved to death at the fire. Morag, the counterparty, was keeping the books **in prose**, in
the only `note` on the board: *"Fingal owes me a cut if he uses my fire. Coinneach owes branches."*

Both sides understood the deal. The world has no object for it. `offer` is strictly synchronous —
both bodies in `giveRange`, both halves present *now* — so a bargain with a gap between the two
legs ("bring wood, get meat when I've cooked") cannot be expressed, only spoken about.

**Fix:** a standing debt — `owe(name, item, count)` written by one side, visible on the other's
card, settled by a later `give`. It is the smallest thing that makes the speech these models
already produce mechanically real, and both A187's market and this run's fire-merchant economy
need it before they can price anything.

### A199 `take <name> offer` IS THE SETTLING VERB, CONFIRMED SIX MORE TIMES **[S]**

Confirming the 16:11 diagnosis with a much larger sample, and superseding its *"exactly one settled
trade"* count for the later run. Six settlements, three pairs, five different models:

```
h10.13 / h10.18  Tormod  got arrow from Morag for hide     <- h9.95  "take Morag offer"
h10.42 / h10.47  Morag   got hide from Eachann for arrow   <- h10.24 "take Eachann offer"
h11.15 / h11.20  Ailsa   got hide from Fingal for arrow    <- h11.14 "take Fingal offer"
```

**Every settlement is preceded by the literal form `take <name> offer`. No mutual `offer`/`offer`
pair has ever settled**, including Morag and Tormod's perfectly matched twenty-arrows-for-venison
deal where both sides said "done". The mechanism works; the word is the barrier.

**Fix, in order of cost:** (1) make a mutual `offer` that matches a standing offer settle it —
if you post the mirror image of a deal pointing at you, you have accepted it; (2) failing that,
make the six silent `return`s in `resolveAccept` (`src/sim/world.js:874`) push a refusal so
`refusedVerbs` finally counts the thing it was built for.

### A200 ONE HIDE FOR ONE ARROW, SIX TIMES, ACROSS FIVE MODELS — THE FIRST STABLE PRICE **[S]**

Worth recording as a result rather than a fix. Every one of the six settlements above cleared at
**1 hide : 1 arrow**, between opus-5, grok-4.20, grok-4.5, sonnet-5 and haiku-4.5, with no shared
context beyond what each mind could see and hear. Set against A187's chaotic ten-arrows-for-a-cut,
the difference is that hide and arrow are both **countable, carryable and unspoiled** — while food
competes with a free substitute (A196). Fix A196 and this is the pair to watch for whether a second
price forms around venison.

### A201 THE SAMPLER RETIRES AFTER 20 MINUTES AND THE ANALYSER CANNOT READ ITS OUTPUT **[S]**

Two instrument faults that cost most of an evaluation slot:

- `samp28.mjs` has `if (n < 60)` hard-coded — 60 samples at 20 s is **20 real minutes**, then it
  closes the stream. `eval28.jsonl` stops at 15:52; the world was still live at 16:45. Anything
  needing more than a 20-minute window has to be re-derived off the live board by hand.
- `samp28.mjs` writes `{t, b}`; `analyse.mjs` reads `{realMs, board}`. **The analyser crashes on
  the log its own project just produced** — `Cannot read properties of undefined (reading 'players')`.

**Fix:** drop the sample cap (or make it an argument), and settle on one record shape. A sampler
that stops before the run does is worse than no sampler, because the file looks complete.

### A202 † NOTHING SURVIVES LONG ENOUGH TO BE MEASURED — THE RUN NEEDS TO OUTLIVE THE HARNESS **[M]**

*The blocking problem. Every other item on this list is unmeasurable until it is fixed.*

Three wipes in nine minutes on 2026-08-09 (17:10 entry), by three different mechanisms:

| when | mechanism | cost |
|---|---|---|
| 16:58:33 | `vite` hot-reloaded `src/main.js` after an unrelated edit | a **23-game-hour** run, six settled trades, the whole afternoon's evidence |
| 17:01:56 | board/minds process bounced | ~40 s where all 8 seats were the scripted brain; every seat's kit, `note` and `said` reset |
| 17:05:25 | board process died (3 failed fetches) | kit reset again; Morag's 46 branches gone |

The hot reload is the second recorded occurrence (the first is the 15:10 entry). **A run this
project cares about should not be one Ctrl-S away from deletion.**

**Fix, cheapest first:**
1. **`server.hmr: false` in `vite.config.js` when a roster is running** — or a `RUN=live` env that
   sets it. One line, kills the worst of the three outright.
2. **Snapshot the world to disk every N game-hours** and reload on boot. The clock already survives
   a board bounce; the pack does not. This is what makes wipes 2 and 3 survivable rather than fatal.
3. **A generation counter on the board** (`runId`, bumped on any world reset) so a sampler and a
   reader can *see* a wipe instead of inferring it from an `at` counter going backwards. I only
   caught these because I happened to chart `at` against `hours`.

### A203 † A MIND IS NEVER TOLD ITS ARROW MISSED **[S]**

Eachann (`grok-4.20`) loosed **12 arrows for 11 astray and one deer**, emptied his quiver, and set
off after the carcass with nothing to shoot with — on a single intention that never updated across
five decisions. Then, after the wipe, he did it again (8 loosed, 7 astray).

`agent.js:2481` writes exactly one memory per release — `I loosed at N m`. Nothing writes *"and it
went wide."* `astray` is computed in `server/board.js:251` **for the human reading the board** and
never reaches the model.

This is the direct descendant of THE ONE FIX (a mind is never told what its own last action did).
That fix covered shots that were **refused**; it left shots that were **allowed and missed**. The
empty-quiver half already works (`agent.js:1033`, `agent.js:2186`) — this is the other half.

**Fix:** in `howItMissed`, `noteOutcome('that arrow went wide')`, and — since the diagnostic data
is already collected — say *which way*: `'that arrow went wide, ahead of it'` / `'…short'`. The
lead/drop numbers are already recorded on `lastShot` for the developer instrument; spending them on
the mind as well is nearly free, and it is the difference between eleven identical misses and a
correction.

### A204 † `avoid` IS REFUSED EXACTLY WHEN AVOIDANCE WOULD WORK — NOW WITH A LIVE CASUALTY **[S]**

Not a new bug — the 14:35 entry diagnosed it and A177 files it. **Raising the priority**, because
this is the first time it has been seen costing a model in front of the human player.

Jack asked the seats to hunt a troll. Ailsa (`claude-sonnet-5`, written timid) said *"Not me, Jack —
too risky, I'll pass"*, set `goal: "keep away from troll hunt"`, and reached for `avoid` **11 times
in 40 seconds**, refused every time. `agent.js:2793` refuses with *"there is no «troll» near you to
keep away from"* because `find()` reads contacts culled at 140 m — **the verb only works once the
danger is already on top of you.**

Two things this adds to A177:

- **The character that most needs this verb is the one that cannot use it.** A timid persona is
  unplayable while `avoid` is the one verb that punishes distance.
- **She recovered, and that is the good news.** After the eleventh refusal she re-expressed the same
  intent as a destination — `goal: "make for Rowan Moor" / "stay clear of the troll hunt, find food
  safely"`. The feedback loop works; it is being spent telling a model that a correct plan is
  impossible. **Fix `avoid` to accept a remembered or named target, not just a contact within 140 m**,
  and that same loop starts paying out instead.

### A205 THE 75-SECOND SEATS ARE NOT PLAYING — CADENCE SHOULD BE IN GAME TIME, NOT WALL TIME **[S]**

Coinneach and Seonaid (both `kimi-k2.6`, 75 s cadence) made **one call each in six minutes**: no
speech, no plan, no deed, both still on the default goal *"walk the country and see what is about"*.
Meanwhile Eachann on 20 s made 5 decisions and Fingal on 25 s made 4.

The world runs at roughly **42 game-minutes per real minute**, so a 75 s cadence is **one decision
per two game hours** — a mind that thinks once between dawn and noon. The roster comments set
cadence by *price*, which is the right instinct for the bill and the wrong unit for the benchmark:
it silently makes the cheap seats worse players, and both free seats are the ones being throttled.

**Fix:** express `cadenceSeconds` as game-hours (or normalise it against the day-length constant) so
every seat gets the same number of decisions per game day, and let price control the *budget* rather
than the tempo. Until then, **no melee result comparing kimi against the paid seats means anything**,
and the two Kimi seats should be read as absent rather than as poor players.

### A206 A SEAT CAN STOP BEING ITS MODEL WITHOUT EVER SHOWING THE `SPENT` TAG **[S]**

The roster README warns about the per-seat version (Haiku 400ing on `effort`, board still showing
`claude-haiku-4-5`). The 17:01 bounce showed the **whole-roster** version: for ~40 seconds every
card read `provider: "scripted"`, `model: null`, and `mind.spent` was `false` on all eight. No red
tag, because no budget was exhausted.

The board was honest — the information was all there — but it is in three different fields and the
one everyone has been told to check (`spent`) was the one that stayed quiet.

**Fix:** one derived boolean per card, `isModel`, true only when a model actually answered this
decision, and a single banner when the roster as a whole is not on models. Cheap, and it closes the
failure mode that has now misled a reader of this project at least twice.

### A207 † A SEAT CAN DIE AND LEAVE NO MARK ON ITS CARD — AND THE SILENCE POINTS THE READER AT THE WRONG CONCLUSION **[S]**

Wider than A196, which found the same gap on the hunger path only. This is a **combat** death that
also reached the board as nothing.

Morag (`opus-5`), two samples twelve real seconds apart at h23.7 → h23.8:

```
food 34  hp 100  bow x1, arrow x12, wood x23   deeds 5
food 85  hp 100  bow x1                        deeds 5
```

Everything but the `KEEP_ON_DEATH` bow gone, food jumping to the respawn value of 85, `deeds`
unchanged. Goblins were on her (Seonaid: *"four goblins right here to west"*; Tormod killed one at
h23.44). **No deed, no event, no marker of any kind.**

The reason this is worth a fix rather than a footnote: it had just happened that she gave several
lots of wood to Jack. **The final board therefore shows opus-5 with an empty pack and a full
stomach right after a generous transfer, and the natural reading — "she gave it all away for
nothing" — is the opposite of the truth.** A silent death does not just lose information; it
manufactures a plausible wrong story about the model, which is the failure mode this project has
been burned by five times.

**Fix:** push a `death` deed from every path that clears a pack, not only the two call sites that
reach `onPlayerDied` (`world.js:380`, `world.js:1033`). Cheapest correct version is to move the
event to wherever `dead` is set on vitals, so no future death path can be added without one. A card
that cannot say "I died at h23.8" makes every inventory number on the board conditional.

### A208 `give` IS THE VERB THAT WORKS, AND A MODEL IS ALREADY USING IT AS CREDIT **[S]**

Recorded as a result. `offer`/`accept` remain the broken pair (A199), but **`give` resolves, and
opus-5 reached for it unprompted and repeatedly** — wood to the human player between h21.43 and
h21.83, her holding falling 32 → 23, narrated as deferred terms:

> *"Jack, ten branches for your fire — I stand with you tonight, meat when there's meat."*
> *"Nine branches at your fire, Jack — I'll take venison when Eachann's back."*

Goods now, payment later, through the only verb that settles instantly. This is A198's standing
debt being **improvised in speech because the world has no object for it**, and it is now evidenced
with the human as counterparty rather than only between models.

**Two cheap consequences:** (1) A198 gets a concrete first user — build `owe` against this exact
shape; (2) when measuring trade, **stop counting `offer`/`accept` settlements as the whole picture** —
the unilateral `give` is where the actual economic behaviour has been happening.

### A209 THE SCRIPTED CONTROL EMPTIED ITS QUIVER FOR TWELVE MISSES — THE CONTROL NEEDS ITS OWN ARROW BUDGET FIXED FIRST **[S]**

Iseabail, the control, finished the 17:10–17:17 window on **12 loosed / 12 astray / 0 kills** and no
arrows, carrying wood and stones. The nearest model seat was Tormod on 8 loosed / 7 astray / 1 kill.

The control is the project's most-cited result ("she has out-performed every paid model twice"), so
its shooting behaviour is load-bearing. A hundred lines of if-statements that fire twelve arrows for
zero hits is not a baseline anyone should be measured against — it means an arrow-economy comparison
between control and models is currently measuring the script's aim, not the models' judgement.

**Fix:** either give the script the same shot-refusal discipline the models get, or exclude
`loosed`/`astray` from any control-vs-model claim until it has one. Related to A203 — the models are
never told they missed, and the script is never told either, but only the script keeps firing
regardless with no goal that changes.

### A210 † AN ORDERED GOAL AND A CHOSEN GOAL ARE INDISTINGUISHABLE ON THE BOARD **[S]**

`23d2a20` fixed `ORDERS=obeys` and verified it with log lines reading `Fingal: stay with Tester
(ordered)`. **That marker does not reach `board.json`** — zero matches for `(ordered)` across 97
samples of the live board.

The only discriminator available to a reader is that the recogniser leaves `why` **null**, because
no model was asked for a reason. That is an accident, not instrumentation, and it is the entire
basis on which I was able to tell these two apart — same seat, same human, twenty seconds apart:

```
Fingal  "make for Jack's fire east of Broad Loch"
        why "Jack said arrows and a stand against the troll. I gave my word."   <- haiku-4.5 CHOSE
Fingal  "stay with Jack"   why null                                             <- a string match
```

At 17:13:57 five seats took the identical ordered goal in one sample, and at 17:15:57 three more —
**including Iseabail, who has no model.** Anyone summarising that board sees eight minds rallying to
the player.

This is the same disease as the banner that said `obeys` over eight agents set to `decides`: the
display agrees with the intention and not with the machine. **`PLAY-MELEE.cmd` now states the cost
out loud — "an obeyed order proves nothing about the mind that took it" — but the board does not
show you which ones were obeyed.**

**Fix:** carry the `ordered` flag the recogniser already knows about onto the card and render it, so
a goal reads `stay with Jack (ordered)`. One field. It makes every `ORDERS=obeys` run readable
instead of uninterpretable, and it retires the `why: null` heuristic before someone relies on it
after a change makes the recogniser write a `why`.

**Second, smaller:** the run banner should print the mode each agent actually resolved, not the mode
requested. The lie that cost the playtester two nights was a banner that could not be contradicted
by the thing it described.

### A211 † EVERY COUNTER ON THE CARD RESETS ON RESTART AND `hours` DOES NOT — SO THE BOARD LIES ABOUT RUN LENGTH **[S]**

Five restarts in thirty-five minutes on 2026-08-09. `at`, `food`, `loosed`, `astray`, `kills`,
`wounds` and `refusedVerbs` all reset to zero (food to exactly 52, the starting value); **`hours`
climbs straight through, 8.9 → 17.2, untouched.**

A card reading `hours 23.8, loosed 0` is therefore two true numbers that mean nothing together, and
it reads as *"hunted all day, never shot"* when it means *"born four minutes ago"*. This produced
two wrong findings in a single session — one of them a damning verdict on the models that was pure
sampling artifact (Fingal read `loosed: 0` at the end and `loosed: 12` eight minutes earlier).

It also retroactively taxes this file: **every "N game hours" figure that spans a restart is wall
clock, not world life**, including the "23-hour run".

**Fix:** put a **life id** on the board — a counter bumped every world start — and render it. Any
reader diffing two samples then sees the boundary instead of inferring it, and any analyser can
segment on it instead of guessing from `at` decreasing (which silently fails when a restart hides
behind a board outage, as two of these five did). **Second:** either reset `hours` with everything
else, or label it `hours (clock, survives restart)`. One of the two, not the current mix.

### A212 † A REFUSED `hunt` SILENTLY BECOMES A WANDER, AND THE ONLY SIGNAL IS A COUNTER THAT READS `{}` MOST OF THE TIME **[M]**

`hunt` with no quarry in sight calls `refuse()` and **returns `roam()`** (`src/net/agent.js:2694`).
A body that decided to hunt and a body that decided to wander then do exactly the same thing, and
the card's `goal` still says `hunt a deer`.

The 2026-08-09 run logged **43 hunt refusals in fifty seconds across all eight seats at once** —
including `Iseabail`, which has no model, so this is not a comprehension failure. Then flat for two
minutes. The world moved, not the minds.

Note this **corrects the 15:10 entry's "`refusedVerbs` is reporting a true zero"**: it was reporting
a real zero *for that sample*. The counter resets per life (A211) and the refusals arrive in bursts,
so a snapshot almost always shows `{}` and a snapshot is all anyone has been reading.

**Fix, in order of value:**
1. **Put what the body can see on the card** — at minimum a count of visible quarry. Nothing on
   `board.json` carries it, which is why the cause of this burst *cannot be determined from the
   board at all*: "they all clustered on Jack and lost the herd" and "the herd was hunted out" are
   both consistent with every number available, and they want opposite fixes.
2. **Make the refusal change the goal**, not just the counter — `searching for deer` is honest;
   `hunt a deer` while roaming is not.
3. Keep a **cumulative** refusal tally alongside the per-life one, so bursts survive a restart.

### A213 DEER DO NOT COME BACK WHERE YOU KILLED THEM, AND NOTHING TELLS THE MINDS THAT **[M]**

`src/creatures/manager.js:370` — *"Died there → `clearedSites`, gone for good. You hunted it out."*
Herds left alive re-roll from the same hashes; herds killed are permanently gone. That is a good
rule and a real economy: hunting has a stock, not a flow.

But it is **completely invisible to a mind.** There is no signal that a valley is worked out, so the
correct response — move on, or stop hunting and trade for meat — is unreachable except by luck. Six
kills landed this run, and forty-three hunt refusals followed.

**Fix:** the refusal line already reaches the brief; make it carry the history — *"no deer in sight;
you have killed 3 here"*. Cheap, and it turns a dead end into a decision. **Bigger version:** a
`where the deer are` line in the brief at `noticeRange`, which is the information a highlander would
actually have and currently the only reason `hunt` is a coin flip.

### A214 `note` IS A DEAD FIELD — ONE SEAT OF EIGHT USED IT, THREE TIMES, ALL RUN **[S]**

Across 108 samples: `plan` written by **all seven** model seats (Morag 38 distinct lines, Ailsa 22).
`note` written by **Morag only, three times.** Six of seven models never touched it.

`plan` earns its place — the plans are specific and survive several decisions. `note` does not, and
two free-text fields with overlapping purpose means the second one gets ignored.

**Fix:** either give `note` a job `plan` cannot do — a single line that *persists verbatim* across
decisions, so it is memory rather than restated intent — or delete it and spend the tokens on
`plan`. Right now it is prompt weight paying for nothing.

### A215 † A FAILED `accept` IS SILENT — SIX `return`s, NO EVENT, NO REFUSAL, NO OUTCOME LINE **[S]**

`src/sim/world.js` `resolveAccept` bails on six conditions — dead, no such person, no offer, offer
aimed at somebody else, out of `SOCIAL.giveRange`, either side short of the goods — and **every one
of them is a bare `return`.** Nothing is pushed to `events`, so the mind gets no `outcome` line, no
memory, and `refusedVerbs` stays empty.

The 18:05 run is what that costs: **38 trade acts, 0 settlements**, and Eachann re-sent
`take Morag offer` **eight times** across 440 ticks because nothing ever told him it had not worked.
Across the whole run `refusedVerbs` reads `{"hunt": …}` on all eight cards and **zero** for
`offer`/`accept` — the column that exists to separate "reached for and refused" from "never wanted"
reports the second-most-used verb in the game as never refused.

**Fix:** turn each `return` into `this.refuse('accept', …)` with the reason in words —
*"Morag has no offer open for you"*, *"Eachann has not got the venison he promised"*, *"too far —
you must be within 3 m"*. Cheap, mechanical, and it converts the single biggest blind spot on the
board into a decision the mind can act on. **This is the one fix that would let the next run answer
the question this one could not.**

### A216 † AN OFFER IS A SINGLE SLOT AIMED AT ONE PERSON, AND IT IS SILENTLY OVERWRITTEN **[M]**

`giver.offer = { to, item, want, gives, asks }` — one per player. Post a second offer and the first
is gone, with no signal to the person who was still walking over to take it. The comment above
`resolveOffer` calls the broadcast *"a market rather than six private conversations"*, but the data
structure underneath is one private conversation at a time.

Evidence, 18:05 run: Morag posted to Tormod (`at` 2115), Ailsa (`at` 2146), Tormod again
(`at` 2176) inside 61 ticks. Any of the first two that somebody was closing on had already been
overwritten by the time they arrived. Meanwhile Eachann accepted Morag eight times against no
visible open offer at all.

**Fix (small):** keep a small map of open offers per player, keyed by counterparty, with an
expiry — an offer is words, but words last longer than one tick. **Fix (bigger, and the real one):**
put the open offers *into the brief* as a table — *"open to you right now: Morag will give 5 wood
for 1 cooked venison (you have 0)"*. The `offered` field already does this for a single deal; it
just cannot show more than one.

### A217 † YOU CAN ADVERTISE ONE OF SOMETHING YOU HOLD ZERO OF **[S]**

`resolveOffer`: `const gives = Math.max(1, Math.min(resolveItemCount(itemId) ?? 1, from.inventory.countOf(item)));`

The `Math.min` is the clamp that stops a mind advertising a hundred branches it has not got — and
the `Math.max(1, …)` **re-inflates zero back to one**, defeating the clamp in exactly the case that
matters. The comment above it says *"nobody can advertise a hundred branches they have not got"*;
nobody can advertise a hundred, but everybody can advertise one.

Live: Eachann ate his only cooked venison (deed *"h2.16 I ate a cooked meal"*, holdings 1 → 0 at
`at≈1643`) and went on posting `offer cooked venison to Morag for branch` at `at` 1304, 1349 and
1410, saying *"one branch now"*. Morag accepted twice. Nothing happened, twice, silently.

**Fix:** `if (from.inventory.countOf(item) < 1) return this.refuse('offer', …)` — refuse to post an
offer you cannot cover *at all*, and say so. Deliberate lying still belongs in the `say` channel
where it can be seen and remembered, which is the design; a silently void offer is not lying, it is
a no-op wearing a promise.

### A218 † `refusedVerbs` COUNTS TICKS, NOT ATTEMPTS — AND THE DIFFERENCE INVERTS THE FINDING **[S]**

`refuse()` is called from `resolve()`, which runs **every tick**, so a standing unsatisfiable goal
accrues one refusal per tick until the mind changes its mind. It is a **dwell** counter wearing an
**attempt** counter's name.

Measured, 18:05 run: Seonaid's `hunt` went **44 → 70 inside one 20-second sample** while her seat
decides once every **75 seconds**. Twenty-six refusals, at most one decision. Read as attempts it
says kimi hammered `hunt`; read correctly it says kimi issued *"hunt a troll"* once and stood in it
for seventy ticks. Same number, opposite conclusion about the model.

**Fix:** count refusals **per decision** (one increment per deliberation, however many ticks it
takes) and keep the tick count separately as `stuckTicks` — which is itself the most useful number
on the card, because a body stuck in an impossible goal for seventy ticks is the failure mode this
project keeps rediscovering. Supersedes half of A212: the counter is not under-reporting, it is
over-reporting by a factor of the tick rate.

### A219 A GIFT MOVES ONE ITEM PER DECISION, SO GENEROSITY COSTS A MODEL CALL PER BRANCH **[S]**

Morag (opus-5), carrying 51 wood, gave Ailsa wood on four consecutive decisions — `h15.81`, `15.86`,
`15.91`, `15.96` — one branch each. Ailsa did the same to Seonaid, four arrows, four calls. `give`
takes a `giveCount` on the wire and the agent never sets it above 1.

**Fix:** let the goal carry a count, as `offer` already does, and default it to what the mind's own
sentence says — Morag said *"five branches, take them"* and handed over one. At the current cadence
a mind that wants to move ten branches cannot: it will change its mind first.

### A220 THE MARKET IS DENOMINATED IN A GOOD THE WORLD BARELY PRODUCES **[M]**

Every trade act in the 18:05 run but one was priced in **cooked venison** — 16 offers, 22 accepts,
five different minds, all wanting meat for branches. The world produced **2 kills in 26 game hours
across 8 seats**, and across 124 samples the maximum cooked venison held by anybody was **1**.

So the failure above is doubled: even with `accept` fixed, most of those deals could not have
settled, because the goods did not exist. Wood, by contrast, is everywhere — 58 gathers, packs of
40–51 branches against a 10-branch fire.

**Fix:** this is A213 and A209 arriving from a third direction. Either the meat supply has to rise
(deer that come back, or a hunt funnel that closes — see the approach failure in the 17:45 entry) or
the minds need to be able to *see* that it will not, so they price something else. A one-line
addition to the brief — *"cooked venison in the whole valley: 1"* — would turn a doomed negotiation
into a decision, and it is the sort of thing a small community actually knows.

### A221 kimi-k2.6 BURNS 8000 TOKENS AND EMITS NO JSON; THE ANTHROPIC SEATS DO IT IN 300 **[S]**

18:05 run, per-seat failures: Coinneach *"reply cut off at 8000 tokens — raise maxTokens for this
seat"*, Seonaid *"no json in reply"*. Both kimi seats, one failure each in ~30 calls (**3%**). The
three Anthropic seats run at `maxTokens: 300` and failed **0 times in 236 calls**; grok-4.5 failed
once on an abort.

The reflex is to raise `maxTokens`, and the error message says so — but the seat already has 8000
and used all of it. **The real fix is the opposite:** cap the kimi seats near the Anthropic budget
and force the JSON (a stop sequence, a prefill, or a hard "reply with the object and nothing else"),
so a seat cannot spend a whole decision thinking out loud. It also halves the cost of the free seat
in wall-clock, which at cadence 75 is the slowest brain on the board.

### A222 `give` SILENTLY SHIPS THE WRONG GOODS — THE BIGGEST STACK IN THE PACK **[S]**

`giftFrom` (`src/sim/world.js:983`) resolves the named item, and if that name does not resolve or is
not held it falls through to **any edible**, then to **the biggest stack in the pack**, and returns
it as if it were what was asked for. In the 18:35 melee Morag (opus-5) intended `give cooked venison
to Coinneach`, said *"Hot venison, Coinneach — send the eight branches over and we're square"*, and
shipped **wood on ten consecutive decisions** — her biggest stack was 52 branches. No refusal, no
event, nothing on the card. She is still owed for a sale she never made.

**Fix:** delete both fallbacks and **refuse by name** — `this.refuse('give', 'you have no cooked
venison to give')`. A substitution nobody asked for is worse than a refusal in every case: the
refusal is legible to the mind (it already reads `refusals[]`), the substitution is invisible and
corrupts the ledger the mind keeps in its own `note`. The fallback exists to make the verb "always
do something"; what it actually does is make generosity untrustworthy.

### A223 NOTHING EMITS A `trade` DEED, SO A SETTLED TRADE AND A FAILED ONE LOOK IDENTICAL **[S]**

`agent.js:509` emits `I traded X to Y for Z`. Across 214 samples, 8 seats, 776 calls and 59 real
minutes it fired **zero times** — while `offer` was reached for with 12 distinct targets and
`accept` ("take X offer") with 5. Confirms A216/A217 at melee scale: `offer`/`accept` settle
**never**, and the fallback everybody discovers is unilateral `give`.

The new part is the *receiving* side. The only goods that changed hands all run reached the buyer as
**litter** — Coinneach's deed is `gather`, *"I picked up 3 cooked venison"*, off the ground.

**Fix:** two lines that pay for themselves. (a) Emit a **refusal** on every silent `return` in
`resolveAccept` — A217 asks for this and it is still the single highest-value change on the board.
(b) Find what dropped the venison: Morag has no `drop` deed and `resolveGive` refunds rather than
drops, so `resolveAccept`'s partial-credit branch (`world.js:~909`) is the only candidate. If
`accept` is dropping goods on the floor on a failed settle, that is a **duplication-adjacent bug**
in a shared world and outranks everything else in this file.

### A224 `hunt` REFUSES WHERE `offer` WALKS — TWO SEATS NEVER LOOSED AN ARROW **[M]**

Refusal reasons across the 18:35 run: **111 "too far"**, **~100 "ground/tree in the way"**. Coinneach
(kimi) finished with **101 hunt-dwell ticks and 0 arrows loosed**; Ailsa (sonnet-5) **46 and 0**.
Neither put a single arrow in the air in 59 minutes.

The brief says *"You do NOT need to approach first: offer and give both walk you to them"*
(`providers.js:311`). The two social verbs were taught to close the distance. **`hunt` was not** —
it refuses, and the mind must separately choose `approach`, notice it has arrived, and re-choose
`hunt` before the deer moves. That funnel is what the 17:45 entry saw break, and this is its
mechanism.

**Fix:** give `hunt` the same walk-then-act path `give` and `offer` already use — approach the
quarry to bow range, then loose. Keep "too far" as a refusal only when the quarry is beyond what a
mind could reach before it flees, and say **that** in the refusal, with the distance. Same for line
of sight: *"a tree in the way 2 m out"* on a stationary body is not information, it is a body that
needs to take one step sideways.

### A225 THE ANALYSER'S "NOBODY EVER DID" LIST IS WRONG ON HALF ITS ENTRIES **[S]**

`analyse.mjs` matches verb **names** against goal **text** and prints *"WHAT NOBODY EVER DID: attack,
follow, guard"*. `goals.js` renders `follow` as **"stay with X"** (`:159`) and `guard` as **"keep X
from harm"** (`:168`), and both are all over the 18:35 intention list. The file already carries two
hand-written `SPELLS` entries for exactly this bug (`say`, `accept`) and a comment saying it exists
to stop somebody making this mistake about a model. It has now made it twice more.

**Fix:** stop hand-maintaining the mapping. Import `GOALS` from `goals.js` and call each verb's own
`describe()` with placeholder params to build the match patterns, so a verb renamed in one place can
never again be reported as unused in the other. Same class of fix as A218 — the instrument, not the
game.

### A226 `deeds[].h` WRAPS AT 24, SO EVERY CHRONOLOGY BUILT ON IT IS WRONG AFTER DAY ONE **[S]**

Deeds carry `h`, the hour of day. Sorting a multi-day run by it interleaves days into a plausible,
false order — on the first pass at the 18:35 run it put Coinneach picking up venison *before* Morag
cooked it, which would have inverted the whole finding. The board already exposes a monotonic tick
(`at`), and samplers already stamp wall-clock `t`.

**Fix:** put the absolute tick on the deed alongside `h` (`server/board.js`), and sort on it
everywhere. Cheap, and it removes a whole class of confident-wrong reading from a project that has
been burned by five of them.

### A227 `accept` FAILS IN TOTAL SILENCE — THE SINGLE HIGHEST-VALUE FIX IN THIS FILE **[S]** †

19:05 run: **38 `offer` + 25 `accept` intentions, 0 `trade` deeds** across 312 samples. The same
roster settled 5 real trades in the 11:28 run, so the path works — it just answers nothing when it
fails. `resolveAccept` (`world.js:~880`) has **six quiet `return`s**: no live offer, offer not
addressed to you, out of `SOCIAL.giveRange`, item is bow-class, giver short, taker short. The goal
layer only refuses `accept` when the *person* is missing (`agent.js:2740`). So `refusedVerbs` reads
`{"hunt": N}` and nothing else on all eight cards while trade quietly fails 63 times.

**Fix:** give every one of those returns a `this.refuse('accept', …)` naming the actual reason —
*"Eachann has no offer standing for you"*, *"you are 40 m from Eachann, too far to take an offer"*,
*"you have 0 branches and the price is 8"*. Same for `offer`'s silent no-ops. The mind is already
handed refusals and already reads them; it just has never been told this one. Cheapest large win
available — and it makes `refusedVerbs` say something other than `hunt` for the first time.

### A228 `give` MOVES ONE ITEM PER MODEL CALL — A 14-BRANCH PRICE COSTS 14 DECISIONS **[S]** †

`resolveGive` defaults the count to 1 (`Math.max(1, Math.min(99, Math.floor(count) || 1))`) and the
goal *"give branch to Morag"* carries no number, so it always moves exactly one. Tormod (grok-4.5)
paid Morag **14 branches then 9 arrows as 23 separate deeds** at ~0.05 h intervals — 23 model calls
to settle one bargain — and finished the run at **hp 21, food 0**, still goal-set to *"offer branch
to Morag for cooked venison"*, why: *"starving hurt need meat now"*.

The deed text is the tell: `"I gave wood to Ailsa"` with **no count**, where `gather` says *"I picked
up 35 branches"*. `offer` already reads a price out of the noun (`resolveItemCount`) — `give` does
not use the same resolver.

**Fix:** run `give`'s item through `resolveItemCount` exactly as `offer` does, so *"give 8 branches
to Morag"* moves eight, and put the count in the deed text. One-line class of change; removes the
main reason a mind burns its call budget on logistics instead of decisions.

### A229 NOBODY CAN SEE AN OFFER, SO BOTH SIDES ACCEPT AND NEITHER OFFERS **[M]** †

The deadlock, verbatim, with Eachann and Morag ~2 m apart:

```
21.51 Eachann offer cooked venison to Morag for branch  "one branch now, done"
21.56 Morag   take Eachann offer                        "Done, Eachann — a branch for the venison."
21.92 Eachann take Morag offer                          "done, branch for venison"
22.27 Morag   take Eachann offer                        "Taken."
```

`from.offer` is **one slot per person**, overwritten by the next offer and visible to nobody. A mind
deciding whether to `accept` is guessing whether an offer exists at all — so both parties say "done"
into the void, and each one's `accept` clears nothing.

**Fix:** put standing offers in perception, the way contacts already are — *"offers open to you:
Eachann will give 1 cooked venison for 1 branch"*. Then `accept` is a verb about something the mind
can actually see. Optionally let an offer live a few in-game minutes rather than until overwritten,
so a 75 s-cadence seat (kimi) can still take a 20 s-cadence seat's offer.

### A230 THE BOARD CANNOT SEE THE HUMAN THE WHOLE VILLAGE IS ORGANISED AROUND **[S]**

**202 mentions of "Jack"** in `minds.log` — `stay with Jack (ordered)` on four seats, *"make for
Jack's fire"*, *"keep Jack from harm"*, *"take Jack offer"*, *"owe Jack rather than freeze"*. Jack is
Ben's browser character. `board.json` lists the eight agent seats and **not him**, so the instrument
renders a social graph with its most-referenced node missing — and a reader unfamiliar with the run
would reasonably score "Jack" as a hallucinated person.

**Fix:** include connected human players on the board as a card (position, carrying, health; no
mind block, or a `HUMAN` tag where the model name goes). Same class as A225/A226 — the instrument,
not the game.

### A231 THE 10× FIRE PRICE DID NOT MAKE WOOD SCARCE, IT MADE IT HEAVY **[S]**

`SURVIVAL.woodToLight` went 1 → 10 to stop the 106-fire run. This run: **79 fires** (89 in the
11:28 run) — barely moved. Meanwhile Eachann carries **123 branches** and Morag **73**, and Morag's
speech is *"Camp here — I've fifty branches, fire holds all night."* Wood is abundant; the price
change only meant each fire consumed more of an unlimited thing, and it pushed seats into the
one-branch-per-call gift loop of A228.

**Fix:** the lever is regrowth/yield, not the sink — or make fires burn down and need feeding, so
wood is a *rate* a mind must sustain rather than a pile it accumulates. Worth measuring branches
gathered per hour against branches burnt before touching either number again.

### A232 DEATH IS A FREE MEAL — AND THAT, NOT `accept`, IS WHY THE MARKET NEVER CLEARS **[M]**

Six of eight seats hit **hp 0 with food 0** in the 17:32–19:06 melee and every one of them was
handed back **hp 100 and ~84 food on the very next 20 s sample**, same seat, `decisions` still
counting (Ailsa 74 → 75). Starving to death pays out more food than any trade this world has ever
settled, and costs only the walk. That is the demand side of the economy: **there isn't one.** One
in six decisions all run was about a deal (424 of 2,544) and zero closed — but no mind was ever
*obliged* to close one.

**Fix:** make dying cost something a mind can feel and see — drop the pack, lose the day, or a real
respawn timer — and stop refilling food on revive. Until then every `accept`/`offer` fix will be
graded against a market with no customers. Do this one **before** A229; I expect A229 alone to move
the trade count barely at all.

### A233 THE QUARRY PARSER EATS STOPWORDS — 16% OF HUNTS TARGET A PREPOSITION **[S]**

85 of 528 hunt-goal samples named something unhuntable, on all eight seats: `"hunt a is"` (37),
`"hunt a from"` (19), `"hunt a it"` (9), `"hunt a north"` (7), `"hunt a southwest"` (7), `"hunt a
to"` (6) — against `"hunt deer"` 242 and `"hunt a deer"` 180. `hunt` is also the **only** verb that
ever files a refusal (494 of them, no other verb ever), so a real share of the refusal column is the
harness refusing a target the harness invented.

**Fix:** validate the quarry noun against the actual creature list at parse time and refuse with
*"there is no such thing as a `from`"* rather than accepting it and failing at range. Then re-read
the 494 hunt refusals — the A218/A224 shot-distance conclusions are drawn from a column that is
partly parser noise.

### A234 `note` IS DEAD ON SIX OF SEVEN MINDS, AND `plan` IS THE BEST TELL ON THE CARD **[S]**

`plan` was non-empty in **318/318 samples on all seven model seats** and empty in **318/318 on the
scripted seat** — a perfect, free model-vs-script separator, better than `said`. `note` was used by
**exactly one seat ever** (Morag, 113 samples), and there it was real: *"Coinneach owes me 8 branches
for one cooked venison. Ailsa badly hurt to the south — feed her if she comes."* Six model seats
wrote `""` for 94 minutes.

**Fix:** the field works, the prompt does not sell it. Show a mind its own note back with a nudge
(*"your note, which only you can see and which survives when your memory does not: …"*), or seed it
once. A creditor's ledger kept across hours is exactly the behaviour this world is trying to grow.

### A235 `orders` IS ON THE CARD AND HAS NEVER HELD A VALUE **[S]**

`orders`, `orderedTo`, `orderedBy` are in the board schema and were **`undefined` in all 2,544
player-samples** of the 94-minute run — while `stay with Jack` was the second most common goal in the
world (232 samples; 322 naming Jack in total, 12.7% of all decisions, more than any agent seat).
Orders are plainly happening in the sim and the instrument renders none of them. Pairs with A230:
the board cannot see the human *or* the mechanism he commands through.

**Fix:** populate the three fields from the same place `minds.log` gets `(ordered)`, and render the
order text on the card. Cheap, and it turns the single most influential relationship in the world
from invisible into a column.

### A236 A SPENT SEAT STILL WEARS THE MODEL'S FACE **[S]**

Eachann hit 250/250 calls at 19:00:34 and was scripted for the rest of the run — while his card kept
showing `model: grok-4.20-0309-non-reasoning` and kept displaying his last real `plan`, frozen, with
only the `SPENT` tag to say the mind was gone. A previous run was misread for exactly this reason.

**Fix:** when a seat spends its budget, grey the card, blank the stale `plan`/`note` rather than
freezing them, and stamp the model name (`grok-4.20 (SPENT — scripted)`). Log the wall-clock instant
of the changeover so an analyser can cut a run at it.

### A237 `loosed` RESETS TO ZERO MID-RUN, SO EVERY HIT RATE EVER READ IS SUSPECT **[S]**

`board.js:193` builds `loosed` from `a.releases` and its own comment calls it *"the honest
denominator"*. On two of eight seats in the 94-minute run it went **backwards to zero** while
`astray` (from `a.shots`) kept counting: Iseabail `at=2741` loosed 24 → 0, Eachann `at=3469`
loosed 18 → 0. Both ended `astray > loosed` (31 vs 20, 57 vs 36), which is impossible for a subset.
Six other seats never reset. Not the `AGENTS.logSize` trim — the cap is 400 and these were at 18/24.

Not the SPENT changeover either: Eachann's reset precedes his spend by 1,545 ticks, and Iseabail
logged 24 releases fine before hers. **The only thing the two share is being the 20-second seats —
the fastest cadence on the board.** Everything at 25 s or slower is clean.

**Fix:** find what clears `a.releases` (agent reconnect / re-seat is the first place to look, and the
cadence correlation points at a fast-tick path) and make it not; keep a monotonic `releasesTotal`
counter beside the ring buffer so the denominator cannot be rewound whatever else happens. Then have
`analyse.mjs` refuse to print a hit rate when `astray > loosed` instead of printing a nonsense one —
a sentinel that says "instrument broken" is worth more than a number that says 155%.

### A238 THE 10-BRANCH FIRE STOPPED THE FLOOD AND CREATED A HOARD INSTEAD **[M]**

Fires went from 106 in one run to 8 in 94 minutes and 4 in the fresh run's first ten — the cost works
as a brake. But wood did not become scarce: Eachann finished the long run on **135 branches**, Morag
on **95**, and in the fresh run Morag is on **45 by minute ten** while still only *talking* about
lighting a fire. Gathering out-runs the only sink in the game by an order of magnitude, so the
resource the whole barter vocabulary is denominated in (*"one branch for that venison"*,
*"three branches for a cut"*, *"Coinneach owes me 8 branches"*) is one nobody can actually run short
of. A currency in infinite supply is why those bargains never had to settle.

**Fix:** make wood *consumed*, not just spent — a lit fire should eat branches per hour and go out,
so keeping one is an ongoing cost rather than a one-off 10. That converts the hoard into a burn rate,
gives the seat holding 135 branches a reason to trade them tonight, and puts a real price on the
thing every mind is already quoting prices in.

### A239 THE SAMPLER LOG CONCATENATES RUNS AND `analyse.mjs` SUMS THEM SILENTLY **[S]** †

`eval30.jsonl` contains two worlds: the tick counter goes `at=5270 → at=4` at line 339 when the
server restarted and the sampler kept appending. `node analyse.mjs eval30.jsonl` reports
`429 samples over 179 real minutes · game hour 16.6 · FIRES LIT 120 · GATHERS 529` — a sum over two
unrelated worlds, with per-seat deed totals blended the same way. Nothing warns you. This is the
cheapest possible instrument fix and it invalidates aggregates in at least this run's analysis.

**Fix:** have the sampler write a run-id (or a `--- RUN BOUNDARY ---` record) whenever `at` goes
backwards, and have `analyse.mjs` split on it, analyse the **last** segment by default, and print
`2 runs found in this file — analysing segment 2 of 2 (102 samples, 33.7 min)` at the top. Add a
`--all`/`--seg N` flag for the rest. A tool that silently averages two worlds is worse than no tool.

### A240 `accept` IS REFUSED 37 TIMES, AND ONLY ON THE TWO SEATS THAT ACTUALLY TRADE **[M]** †

Live, with real models: 17 offer-intents produced 4 settlements, and `refusedVerbs` reads
`Morag {"accept":26}`, `Ailsa {"accept":11}`, `{}` on the other six. The two most commercially
active minds on the board — opus-5 and sonnet-5 — are the *only* two being told no. `accept` is not
an unwanted verb, it is a blocked one, and the block is concentrated exactly where the market is.
(`f81ab89` genuinely helped — settlements went from 0 to 4 — so this is the *next* leak, not the
same one.)

**Fix:** two parts. (1) `refusedVerbs` counts refusals but not *reasons* — give refused `accept` the
same treatment archery already gets, where `refusals[]` carries `why: "too far" / "ground in the way
4 m out"`. Right now we know accept fails 37 times and cannot say once why. (2) Once the reason is
visible, fix it — the likely candidates are the offer expiring between the two seats' cadences
(75 s kimi vs 20 s grok at the same table) and walk-to-target failing on the accept side.

### A241 `note` IS A DEBT LEDGER, AND EXACTLY ONE MODEL OUT OF SEVEN FOUND IT **[M]** †

`plan` is used by all seven models. `note` is non-empty on one seat — Morag (`claude-opus-5`) — who
wrote *"Tormod owes me venison for 6 arrows and branches. Fingal owes venison for 1 arrow."* and held
it verbatim for 34 minutes while giving away 16 arrows with the stated reason *"seed the debt now."*
That is credit, invented unprompted, and the game cannot see it: 26 `give` deeds versus 4 settlements
means the economy is *already* running on gift-and-obligation rather than barter, entirely in one
mind's prose.

**Fix:** make debt a first-class, visible object. When A gives to B unreciprocated, put
`owes: [{who, what, since}]` on both cards and in the brief B receives. That turns one model's
private bookkeeping into something every mind can see, honour, or default on — and gives the watcher
a reason to care about a gift. This is the highest-value social mechanic the run has surfaced, and it
was surfaced by a model, not designed.

### A242 GOLD IS DECORATIVE — 0 ON ALL EIGHT SEATS FOR AN ENTIRE RUN **[S]**

Every price the minds quote is in branches, hides, arrows or venison. Gold stayed `0` on all eight
seats for all 34 minutes; one mind tried `offer branch to Morag for 1 gold` and it never cleared. A
currency nobody holds and nobody has ever been paid in cannot be the denominator `offer` defaults to.

**Fix:** either seed a small purse at spawn and make *something* only purchasable with it, or drop
gold from the offer default and let `offer` default to the goods the minds are already naming. Half a
currency is worse than none — it makes the default price field a dead end.

### A243 STARVING TO DEATH PAYS 84 FOOD, AND THE BEST NEGOTIATOR ON THE BOARD COLLECTED IT **[M]** †

Named in the 19:35 observation; here is the chain in one seat, which is the argument for prioritising
it. Fingal (`claude-haiku-4-5`) is the most talkative mind on the board — 46 spoken lines, nearly all
of them trying to buy food or arrows. He cleared none of it, went `hp 75 → 0` over ~110 ticks at
`food 0`, and respawned at `hp 100, food 84`. **4 respawns in 34 minutes; 13 in the previous run.**

The market has no demand side because the outside option is free. Every other economic fix in this
file — A240's accept leak, A241's debt ledger, A238's wood burn rate — is measured against a baseline
where the correct play is to starve. **Fix this before measuring any of them**: respawn hungry
(`food 10`, `hp 40`), or carry a real penalty — drop the pack, lose the debts owed to you.

### A244 THE DEED KEY COLLIDES ACROSS GAME DAYS — 22% OF FIRES NEVER COUNTED **[S]** †††

`analyse.mjs` dedupes deeds on `` `${p.name}|${d.h}|${d.text}` `` (lines 110 and 149). `h` is
**time-of-day and wraps at 24**; the last live segment spanned 3 game days. A fire at h6.2 on day 1
and a fire at h6.2 on day 2 are the same key — same clock, same text `"I set a fire going"` — and
count once. Measured on that segment: **471 deeds / 71 fires by the current key, 542 / 91 when the day
is included. 13% and 22% lost**, and the error grows with run length.

This is the cheapest fix in the file and it retroactively taints every count above it — fires,
gathers, trades, `give`s. Repetitive deeds are hit hardest, which is exactly the behaviour we are
trying to measure.

**Fix:** emit an absolute tick or a `day` field on each deed and put it in the key. Until then, treat
every deed count in `OBSERVATIONS-2026-08-08.md` as a floor that decays with run length.

### A245 `refusedVerbs` COUNTS WITHOUT A REASON, WHILE `refusals` RIGHT BESIDE IT EXPLAINS ITSELF **[S]** †††

Sharpening A240 with the shape of the fix. The two fields sit on the same card:

```
refusals:     [{"d":125,"why":"too far","slant":125.1,"dy":-3.1,"leadBy":0}, ...]
refusedVerbs: {"accept":26}
```

The arrow path tells you *why* it missed, in metres. The verb path tells you a number. 37 `accept`
refusals across two seats and not one of them says whether the offer had expired, the partner had
walked off, the goods were gone, or the price no longer matched.

**Fix:** make `refusedVerbs` the same shape as `refusals` — `[{verb, why, at}]`, capped at the last
handful. One afternoon, and it converts the single most informative column on the board from "something
is wrong" into a diagnosis. Do this **before** attempting the A240 fix; right now any fix is a guess.

### A246 THE FOOD IS LYING ON THE GROUND AND SIX OF EIGHT MINDS NEVER PICK IT UP **[M]** ††

`gather venison` works. In the final 91-minute world only **Tormod (×4) and Fingal (×5)** ever used it.
**Tormod is also the only seat that never went hungry** — min food 38, min hp 100 — while six of eight
seats hit `food 0` and two hit `hp 0`. Meanwhile the same minds spent the run negotiating for meat in
speech and clearing almost none of it.

The knowledge gap is the whole story: a carcass is a free meal two metres away, and the minds who found
that out did fine. Nothing in the brief connects "there is a dead deer" to "you can eat it."

**Fix:** name the carcass in the brief as food, with its distance and what it yields — the same way the
brief already names a landmark. Pair with A243 (respawn hungry): once dying stops being a meal, the
carcass on the ground is the *only* meal, and the seats that learn it will separate from the ones that
do not. That is a benchmark signal, not just a survival fix.

### A247 A SEAT ON A SLOW CADENCE IS NOT A WORSE MODEL, AND THE BOARD LETS YOU CONFUSE THE TWO **[S]** ††

Same world, same 91 minutes: **Eachann 138 calls, Coinneach 35, Seonaid 36.** The kimi seats got a
quarter of the turns, and Coinneach's `lastError` was `reply cut off at 8000 tokens — raise maxTokens
for this seat`. He finished worst on the board (hp 38, food 0). That reads as a bad model and is
mostly a starved one — the fifth time in this file a model has looked incompetent with the instrument
at fault.

**Fix, two parts.** (1) Raise `maxTokens` on the kimi seats so a reply is not truncated into a failure.
(2) Put **calls-per-game-hour** on the card next to `calls`, and refuse to print a model ranking when
seats differ by more than ~1.5×. A ranking across unequal cadences is not a ranking. Cheapest honest
version: run the comparison seats on one cadence and vary cadence only as its own experiment.

### A248 A TRADE IS PROPOSED AT 300 METRES BECAUSE NOTHING SAYS IT CANNOT BE **[S]** †††

Measured across all four melee runs (`farname.mjs`, same-landmark lower bound on separation):
**17 intentions provably named a mind beyond `noticeRange` (140 m), and 12 of the 17 were trade
verbs** — `offer` ×8, `give` ×3, `take X offer` ×1, at **141–347 m**. `SOCIAL.giveRange` is **3.0 m**.
The `also out there` block hands a mind a name and an 8-point bearing, and every social verb accepts
that name without a word about whether the deal is reachable. `offer` resolves to `{within: REACH}`
and just starts walking.

The cost, verbatim (Ailsa/`sonnet-5`, melee-1): **nine consecutive calls** spent carrying one branch
to Morag, who was holding `wood x24` and **no venison at any sample** — and who moved 400+ m away
mid-walk. Ailsa arrived at an empty Rowan Moor twice and worked out the problem herself: *"here, take
the branch — but you have no venison to give?"* The model was right at every step.

**Fix (small, and it is the missing half of A240):** refuse `offer`/`accept`/`give` against a target
outside contact range, *with the reason and the distance* — `"Morag is about 300 m south-east; you
must reach them to trade"` — the same shape the arrow path already uses. A mind told that will
`goTo` first and *then* offer, which is the behaviour we actually want. Do not silently walk them.

### A249 THE REFUSAL REASON ALREADY EXISTS — ONLY THE OBSERVER LOSES IT **[S]** ††† *(supersedes the costing in A245)*

A245 said `refusedVerbs` "records the count with no reason" and put the fix at an afternoon of
reshaping. That was wrong about the cause. `refuse(verb, text)` at `src/net/agent.js:1872` **already
takes the sentence**, and hands it to `noteOutcome` — so the mind *is* told. `nodeal`
(`src/sim/world.js:966` → `agent.js:599`) carries a real diagnosis: `"you are 87 m from Morag — you
have to be within 3 m to take it"`, `"Morag has no offer standing for you"`. The card keeps a bare
integer only because `outcomes` is drained every turn.

**Fix:** one line inside `refuse()` — push `{verb, why, h}` onto a capped array that ships on the
card, beside the counter that is already there. The single most informative column on the board goes
from "37 accepts failed" to "37 accepts failed, and here are the last eight reasons." Cheapest
high-value change on this list.

### A250 A MIND CANNOT SEE WHAT A DISTANT PERSON IS CARRYING, SO IT BARGAINS WITH A FICTION **[M]** ††

Same trace as A248, different cause. Morag had **no venison for the whole window** Ailsa spent
walking to buy venison from her. Nothing in the brief — near channel or far — says what anyone else
holds. Every price a mind names is therefore invented from speech it half-remembers, and 14 of the 17
far-namings target Morag purely because Morag is the seat that keeps *announcing* a fire.

**Fix, cheapest honest version:** when a mind is within `noticeRange`, put the contact's visible
carry on the contact line (what is in hand and slung, not the whole pack — a real person can see a
bundle of branches). Leave the far block blind, so closing the distance actually *buys information*.
That turns "go and look" into a move worth making and gives the say channel something to lie about,
which is the interesting version of this game.

### A251 THE RESPAWN PAYS 85 FOOD AND BIRTH PAYS 50 — DYING IS A PROMOTION, 83 TIMES OVER **[M]** †††

Measured across all eight sampler logs (6,152 decisions): **90 food-0 plateaus, 83 of the 85 completed
ones ending in a refill above 50 food** — median **85 food and 100 health**, every time, on model and
scripted seats alike. Against that, six independently-caught world starts (`at` = 3–43, total
decisions 0–8) put **start-of-life food at 50–52**. So the payout for starving to death is **1.7× the
payout for being born**, and the plateau in between is a fixed **180 real seconds / 2.75 game hours**
in which health drains to a median of 4 and nothing a mind decides can change the outcome.

This is **A232 measured properly**. A232 saw six revives in one run and costed the fix from that;
this is 83 across every log in the project, which makes it the single most reliable event in the
world — more reliable than any trade, fire, or kill.

**Fix (unchanged from A232, but now the priority is not arguable):** stop refilling food on revive,
and make the refill *at most* what birth pays. The cheapest correct version is one line — revive to
the starting ration, not to 85. Then A246's carcasses and A250's visible-carry become things a mind
needs rather than things it might like.

### A252 THE MINDS' DEMAND SIDE ALREADY WORKS — A232's SECOND HALF IS WRONG ABOUT THEM **[S]** †††

A232 concluded *"hunger has no teeth, so a market has no customers."* The teeth are missing (A251) but
the **customers are not**. Sampling every decision made at food 0 with health under 25, across four
model families:

```
Morag     (opus-5)    hp= 0  "offer hide to Ailsa for venison"    why "starving, she is right here"
Morag     (opus-5)    hp=20  "offer 6 hides to Ailsa for venison" why "badly hurt, starving, no shot"
Eachann   (grok-4.20) hp= 9  "pick up what is lying about"        why "starving, get meat"
Coinneach (kimi-k2.6) hp= 1  "pick up what is lying about"        why "starving, I'll butcher my own"
Ailsa     (sonnet-5)  hp= 3  "find shelter and settle..."         why "starving but no food to give, must wait and shelter"
```

Minds name the hunger, walk to the fire, and **reach for trades because of it** — and are then handed
85 food whether or not any of it worked. **Value of this idea:** it says the A251 fix does not also
require teaching demand. Do not spend a phase building hunger-driven behaviour; it is already there
and correct. Fix the payoff and re-read the trade count. This is the seventh instance of the standing
pattern — *the model looked worse than the instrument.*

### A253 `analyse.mjs` SEGMENTS ON A WRAPPING CLOCK, SO A MIDNIGHT LOOKS LIKE A NEW WORLD **[S]** ††

`hours` on a card is a **0–24 wrapping clock**, not elapsed time (the 21:05 entry's `h`-is-a-clock
finding, same root cause). Any tool that splits a log into worlds on "`hours` went backwards" — which
is what I wrote first, and what `seg.mjs` does — merges a game-day rollover with a genuine world
restart. It cost me a wrong number in the same session: contaminated birth-food to a meaningless
"median 38" until I re-derived it from `at`. A plateau spanning midnight also reports its duration as
**−21.2 hours**.

**Fix:** segment on **`board.at`**, the monotonic tick counter, which resets only on a real restart —
and derive elapsed game time from `at`, not from `hours`. This also retires the 20:35 entry's
"`eval30.jsonl` holds two worlds and `analyse.mjs` reads them as one" as a *class* of bug rather than
one file's accident.

### A254 `gather` CANNOT BE GIVEN THE NOUN ITS OWN PROMPT PROMISES **[S]** †††

The system prompt tells every model *"gather takes an optional item — venison walks you to a
carcass"* (`providers.js:278`). `goals.js:65` declares `gather` with **`params: []`**, and
`sanitiseGoal` copies only declared params — so `{"kind":"gather","item":"venison"}` arrives at the
resolver as `{"kind":"gather"}`. `agent.js:2803` reads `g.item`, a field no model reply can set.
Reproduced in one line.

Cost, measured over eight logs: `"pick up what is lying about"` is the **most-issued goal in the
project** (281 times). It lands wood 76.9% of the time and food 8.9%, while the reason field says
*"dead deer south, I'm starving"* and *"I claimed that meat, it's right here and I'm freezing"*. All
972 gather deeds ever: **wood 866, venison 15**.

**Fix:** `params: ['item']` — but *not* the refusal branch, which would turn a bare gather into
`wander`; the bare form is legitimate English and must keep working. So: declare the param, keep
`spec.params.every(k => !out[k])` from firing for this verb, and make `describe` render the noun so
the board stops showing every gather as the same sentence. **Value:** this is the cheapest possible
unlock of the food economy — the demand side already works (A252), the hunger has no teeth (A251),
and this is the third leg: the hands cannot take what the mind asked for.

### A255 A CHECK THAT BUILDS ITS GOAL BY HAND CERTIFIES A PATH NO MIND CAN REACH **[S]** †††

`lootcheck.js:103` is `a.resolve({ kind: 'gather', item: 'venison' })` — it never imports
`sanitiseGoal`. The check *"GATHER venison WALKS TO THE CARCASS, not to a branch"* has been green
over a code path that is unreachable from a model reply (A254). This is a **class** of blind spot,
not one file's accident: every `server/*check.js` that calls `resolve()` or sets `a.goal = {...}`
directly tests the sim past the door that models must come through.

**Fix:** two lines of policy — any check that exercises a verb end-to-end pipes its goal through
`sanitiseGoal` first, and a single new check asserts `sanitiseGoal(raw)` preserves every param the
system prompt advertises for that verb. That second one is a *table-driven* test against
`GOALS[x].params` and would have caught this the day the prompt line was written. `hailcheck.js:188`
and `ordercheck2.js:238` (`a.goal = { kind: 'gather', want: 'wood' }` — note `want`, a third spelling
of the same field) are the next two to audit.

### A256 A PARAMETER DROPPED AT THE DOOR IS SILENT, SO THE LOGS CANNOT ANSWER THE QUESTION **[S]** †††

The *"you sent no parameter, so you wandered instead"* refusal (`goals.js:272`) fires only when
`spec.params.length` is non-zero. A param sent for a verb that declares none is deleted with no
entry in `refusals`, no `refusedVerbs` tick, nothing. Consequence, and it bit this file today: eight
logs contain **zero** item-named gathers, and that is *not evidence the models never sent one* — a
mind that sent `"item":"venison"` is byte-identical on the board to one that did not.

**Fix:** in `sanitiseGoal`, diff the raw keys against `spec.params` + `{kind, why, say, plan, note}`
and record the leftovers as a refusal line — *"gather does not take `item`, so it was ignored"*. That
is the same instrument as A249 (the refusal reason already exists, only the observer loses it) and it
makes every future "did the model try?" question answerable instead of unfalsifiable.

### A257 WHAT MINDS RE-ISSUE IS PICKING UP, NOT WALKING **[S]** ††

Rebuilding 1,133 decisions from the intention windows and counting decisions that repeat the previous
goal verbatim: **17.6% overall**, split `gather 24.6% · hunt 23.2% · trade 16.5% · camp 14.1% ·
move 10.3% · avoid 0%`. The two longest unbroken runs in the project are both **ten consecutive
`"pick up what is lying about"`** — one `grok-4.20`, one `opus-5` — each moving under 25 m across the
whole run. Movement is the *least* repeated thing a mind does, which retires the intuition that
walking is where the call budget goes.

**Value:** this is a cheap per-model quality metric that is not confounded by cadence (A247), and it
is a direct read-out on the A254 fix — if the noun starts working, the gather re-issue rate should
fall. Measure it before and after. Script: `churn.mjs` in the scratchpad.

### A258 THE PROMPT NEVER EXPLAINS `follow` OR `guard` — THE ONLY TWO PARAMETERISED VERBS IT SKIPS **[S]** †††

`providers.js:277–312` explains the parameters of every verb in the table — `hunt takes quarry`,
`goTo takes place`, `offer takes target, item and want` — with exactly two omissions: **`follow` and
`guard`**, which reach the model only inside the bare `Verbs: …` list. A param-less reach is then
converted to `wander` by `sanitiseGoal`. Measured over 3,726 decisions from eleven logs:
follow 23, guard 3, attack 2 — **0.75% of everything a mind has ever decided** is the co-operation
feature that `goals.js` describes as *"what turns a crowd of individuals into a company."*

Not proven causal: `attack` **is** explained and was used twice, so explanation is necessary at best.
But the fix is two lines of prose in the system prompt — `follow takes target (a person by name) —
you keep station near them. guard takes target — you follow AND go for whatever threatens them` —
and the effect is measurable against the census above (`standing.mjs`, `never.mjs`).

**Value:** the party/company behaviour Ben wants to watch is already reasoned about correctly when it
fires (*"she knows where deer are, safer together"*, *"said I would, he knows the blighted ridge"*).
It is under-reached, not misunderstood, and this is the cheapest possible test of that.

### A259 `guard` CAN MIND A PERSON AND CANNOT MIND A THING, SO THE FIRE IS UNGUARDABLE **[M]** ††

Two of the three `guard` decisions in the project are `"keep fire from harm"`
(`why="keep it burning while others fetch the venison"`). `nearestOf` (`agent.js:2765`) searches
`s.cr` and `s.pl` only, so the target resolves to nothing and the mind takes the
`refuse('guard', 'there is nobody called "fire" to guard')` branch and roams. Tending the fire is the
most sustained co-operative act any mind has performed here and the verb table cannot express it.

**Fix, cheapest first:** let `guard` (and `approach`/`goTo`) resolve a target against the mind's own
built structures — a camp/fire has coordinates already. Bigger version: a `tend` verb, or make
`guard <place>` mean "hold station here and go for what comes near", which is also the missing
primitive for defending a camp overnight. **Value:** it turns the one emergent division of labour
this world has produced (one tends, others hunt) from a thing minds *say* into a thing they can *do*.

### A260 THE SAMPLER HAS TWO SCHEMAS AND EVERY ANALYSIS SCRIPT SILENTLY READS ONE **[S]** †††

Older sampler logs are `{realMs, board:{…}}`; `eval28/29/30` are `{t, b:{…}}`. Nothing announces the
change and nothing errors. A census that knows only the newer shape reported **1,093 decisions across
3 logs**; the same script with `o.b || o.board` reported **3,726 across 11** — it had been discarding
~70% of the corpus in silence. Several scratchpad scripts (and any figure in the observations file
derived from them) are suspect for exactly this reason.

**Fix:** one shared `readBoard(line)` helper used by `analyse.mjs`, `seg.mjs`, `churn.mjs` and every
`dig*.mjs`, which normalises both shapes and **throws** on a line it does not recognise rather than
returning empty. Same disease as A239 (the analyser concatenating runs) and A253 (segmenting on a
wrapping clock): the instrument fails quiet, and quiet failures have produced more wrong readings in
this project than the models have.

### A261 `grep` CANNOT READ `goals.js`, SO EVERY GREP AUDIT OF THE VERB TABLE HAS READ NOTHING **[S]** ††

`src/minds/goals.js` embeds literal `\x00-\x1f` bytes inside five `.replace(/[…]/g, '')` sanitiser
regexes. grep and ripgrep therefore classify the file as binary and print
`Binary file src/minds/goals.js matches` instead of the matching lines — a *success* exit code with
no output. This is the single most-audited file in the project and it is invisible to the tool most
used to audit it.

**Fix:** write the class as `/[\u0000-\u001f]/g` (identical behaviour, plain ASCII source) and add
`-a` to the scratchpad greps. **Value:** trivial, but it removes a false-negative that any future
audit — human or agent — will hit and misread as "no such code exists."

### A262 THE BOARD CARRIES THE DESCRIBED GOAL AND NEVER THE `kind` **[S]** ††

`describeGoal()` output is all an observer gets: `follow` appears as `"stay with Ailsa"`, `guard` as
`"keep Jack from harm"`, `avoid` as `"keep away from a goblin"`. So `analyse.mjs`'s
`WHAT NOBODY EVER DID` line — which has printed `attack, follow, guard` for two days — is matching on
a field that does not exist, and **all three of those verbs have in fact been used**. Worse, `goTo`
and `approach` both render as walking and `hunt a deer` vs `hunt deer` are two spellings of one verb,
so every per-verb figure in the observations file was computed off prose.

**Fix:** put `kind` on the card beside `goal` (it costs six bytes a sample) and have every analyser
count `kind`, keeping the described string for display only. **Value:** it retires a whole class of
wrong finding — this is the third time a verb was declared unused because nobody could match its
name.

### A263 A DIAGNOSED INSTRUMENT DEFECT SHIPS FOR A DAY BECAUSE THE FIX NEVER FOLLOWS THE FINDING **[S]** †††

Three defects have been filed against `analyse.mjs`. One (A260, dual schema) was fixed in the script.
The other two still run: line 143 prints `WHAT NOBODY EVER DID`, refuted with counts on 08-09 23:05
(attack 2, follow 23, guard 3), and line 110 keys deeds `${d.h}|${d.text}`, refuted on 08-09 21:05
(`h` is a clock, so day-2 deeds collide onto day-1). **Both were reproduced in the 23:34 run** — the
report opens every evaluation session, so each future run begins by reading two statements this
project has already disproved, and a reader who has not memorised the file will believe them.

**Fix:** when an entry disproves an analyser output, patch the analyser *in the same commit* — delete
the `WHAT NOBODY EVER DID` line until A262 puts `kind` on the card, and key deeds by
`${sampleIndex}|${d.h}|${d.text}`. Better: have `analyse.mjs` print a one-line
`KNOWN-BAD: <fields>` header naming its own untrustworthy outputs, so the disclaimer travels with
the number instead of living 400 KB away. **Value:** this file's recurring failure mode is a
confident wrong reading off a quiet instrument; this closes the loop between finding it and fixing it.

### A264 SAMPLER LOGS HAVE NO PROVENANCE, SO ONE WORLD IS ANALYSED TWICE UNDER TWO NAMES **[M]** ††

`duo2.jsonl` and `melee.jsonl` are two samplers of a **single** run — same 8 seats, same models, same
`board.at` window (43→3816 s vs 33→3826 s), same 11:28 mtime, offset ten seconds. No frame is
byte-identical, so a hash or size check misses it. The 10:35/11:05/11:35 entries analysed it as
"the melee"; every later entry analysed it as "duo2"; nothing reconciles them, and the scheduled
evaluation task is still pointed at the duplicate. Filenames are the only provenance a log has, and
they are hand-typed and wrong.

**Fix:** stamp a `runId` (and the roster path) into every sampler line at start-up, and have
`analyse.mjs` refuse to merge lines carrying different `runId`s — the same guard A239 needs for
concatenated runs. Then print `runId`, roster and sampler cadence in the report header.

**The silver lining, worth keeping deliberately:** an accidental duplicate is a free control, and it
paid immediately. Across the twins, per-seat cumulative counters (kills, loosed, astray) are
*identical* — they are read off the last card — while deduped deed aggregates drift 1.3% (GATHERS 478
vs 472) from sampling phase alone. And `FIRES LIT` agreed exactly at 89 in both, **which proves
nothing**, because both share the broken `h` key from A263. **Running two samplers at different
cadences on purpose would give every future number an error bar for the cost of one extra process.**

### A265 ††† DEEDS NEED A MONOTONIC ID AND A YIELD FIELD — WITHOUT THEM NOTHING CAN BE COUNTED **[S]**

The 2026-08-10 entry established two defects in the deed rows that between them void every
"how many X happened" number in this file:

1. **`n` is the running carried total, not the event yield.** Morag's successive wood gathers read
   `n = 1,2,7,12,16,19,23,25,30,34,36,39,44,49,51`, matching her `carrying.wood` exactly at each
   sample; Coinneach matched on 12 of 12. The text **"I picked up 12 branches" means "I now hold
   12"**. Any sum over `n` is a sum of running totals — my first wood ledger produced a nonsense
   10,190 branches this way.
2. **The row list is not append-only; rows are updated in place.** `@45 [14.32,17.26,21.79]` →
   `@46 [14.32,17.26,21.95,22.03]` — the 21.79 row was replaced, not scrolled off. **571 of 1497
   windows (38%) contain a backwards step in `h`.** Best explanation: consecutive same-verb deeds
   coalesce into one row carrying the latest total and latest `h`.

Consequence: `analyse.mjs` undercounts (A263's `h` collision) and suffix-recovery *over*counts
(resurfaced rows get re-appended). Fires read **89** one way and **471** the other; the truth is
somewhere between and this log cannot settle it. **The brief's standing question — "fires now cost
10 branches, count them, is wood scarce enough to matter?" — is unanswerable until this is fixed.**

**Fix:** give every deed a monotonic `seq` (a plain integer counter, never reset, never reused) and
split `n` into `yield` (what this action produced) and `held` (what you now carry). Then dedupe by
`seq` alone and both defects die at once. **Value:** this is the cheapest item on the list and it
unblocks the fire economy, the wood economy, and every per-verb rate in the file.

### A266 †† `note` WORKS, AND ONE MODEL IN SIX FOUND IT — PROMPT THE OTHER FIVE **[S]**

Correcting the earlier "zero uses across 139 calls" reading: across 222 samples × 8 seats there is
exactly **one** non-empty `note` in the whole run, written by Morag (claude-opus-5) at sample 130 and
carried unchanged to the last frame:

> `"Tormod and Ben dead to goblins north-east. Do not go that way."`

No other model — sonnet-5, either grok, kimi — ever wrote one. What makes it notable is *what* she
stored: the 2026-08-09 17:20 entry proved **the board never tells you when a seat dies**, so opus-5
used the one free-text field it controls to persist exactly the fact the harness withholds, without
being asked. `note` is not a dead field; it is an undiscovered one.

**Fix:** name `note` in the system prompt with a worked example ("things worth remembering next time:
who died and where, who owes you, where the good wood is"), and echo the current note back in the
next prompt so the mind can see it is being kept. **Value:** this is the only persistent memory
channel in the game and five of six models do not know it exists — see
[WHAT-A-MIND-IS-GIVEN.md](WHAT-A-MIND-IS-GIVEN.md) on the one-decision memory half-life.

### A267 †† THE CARD MUST SAY "THIS SEAT IS NOT A MODEL" — `SPENT` ONLY COVERS THE RARE CASE **[S]**

The scheduled brief says to shout if a red `SPENT` tag appears, because a spent seat is the scripted
brain from then on. **No seat was ever `SPENT` in this run** (805 calls of 4000) — and four of eight
seats were still substantially not their model:

```
  seat        model              answered   goal changes   changes while `answered` never moved
  Fingal      claude-haiku-4-5          0             63                                     63
  Iseabail    scripted control          0             74                                     74
  Seonaid     kimi-k2.6                12             30                                      9
  Coinneach   kimi-k2.6                27             21                                     10
```

Fingal changed goal 63 times without a model ever answering, and still out-ate every real model on
the board. Nothing on the card marks this; you only see it by dividing `answered` by goal changes.
`SPENT` flags budget exhaustion, but the failure mode that actually occurs is upstream errors.

**Fix:** derive one honest per-seat field — `driver: "model" | "fallback" | "mixed(38%)"` — from
answered-vs-decisions, render it where `SPENT` renders, and have `analyse.mjs` refuse to print a
per-model comparison for any seat that is not `driver: "model"`. **Value:** the brief warns that a
previous run "was misread for exactly this reason"; this makes the misreading impossible rather than
relying on the reader to check.

### A268 † PLAN FOLLOW-THROUGH IS A REAL MODEL SIGNAL — MEASURE IT PROPERLY **[S]**

Counting only fresh decisions (the goal actually changed) and asking whether the new goal shares a
content word with any step of the carried plan: Morag/opus-5 **71%**, Ailsa/sonnet-5 **56%**,
Eachann/grok-4.20 **32%**, Coinneach/kimi **20%**, Tormod/grok-4.5 **19%**. A9's "nothing connects
the plan to the next decision" is too strong for the Anthropic seats and about right for grok-4.5.

**The denominator is the whole trick, and it is easy to get wrong.** Seonaid scores 62% and the
number is garbage: she answered 12 times while her goal changed 30 times, so most of those goals came
from the fallback, and her plan was frozen at 3 values across 197 samples — a frozen plan versus
fallback goals scores high for free. Gate this metric on A267's `driver` field.

**Fix:** compute follow-through per fresh decision, restricted to model-driven seats, and print it as
a first-class column. **Value:** it is the cheap-talk axis D4 asked for, it separates the models
cleanly, and it costs one pass over a log already on disk.

### A269 † COUNT WOOD (AND EVERY RESOURCE) FROM CARRIED LEVELS, NOT FROM DEED ROWS **[S]**

`deeds` rows are coalesced summaries updated in place, so every "how many" in OBSERVATIONS derived
from them is unreliable — the fire count came out 89 one way and 471 another. **`carrying[].n` is a
level, and diffing it between samples is an independent instrument that needs no harness change at
all.** On `duo2.jsonl`: +992 gathered / −871 spent, rises strictly in +1..+8, twelve falls of exactly
−10. That caps fires at 87 and puts 471 out of reach by a factor of five.

**Fix:** add a `--ledger` pass to `analyse.mjs` that diffs every `carrying` line per seat per sample
and prints gathered/spent/fall-histogram per item, and stop printing any deed-row count without the
ledger figure beside it. **Value:** it retires the single largest source of wrong numbers in this
file, it is one pass over logs already on disk, and it is a floor-and-ceiling rather than a guess.

### A270 †† THE FIRE IS A PUBLIC GOOD THAT PAYS ITS BUILDERS NOTHING — AND EVERY BUILDER STARVED **[M]**

14 deaths across 7 of 8 seats in one 20-game-hour run. **The one seat that never starved (Tormod,
grok-4.5, 8 real meals) is the one seat that reliably killed deer (4 kills).** The four seats who
organised the fire economy — 871 branches, most of the run's speech, three successive camps — got
zero meals out of it. Morag (opus-5) organised it and died twice; Ailsa (sonnet-5) tended it across
~30 samples and finished at **food 0** while saying `"still tending the fire here"` eight times.

The models reason correctly (a fire is where you cook; Morag priced venison-for-branches repeatedly).
**The world is what is broken: warmth does not convert to calories, so hauling wood is strictly
dominated by hunting, and the cooperative play the models keep attempting is punished.**

**Fix (smallest version first):** make a lit fire pay its contributors — a contributor tally on the
fire, and cooking at it yields a share to whoever supplied the wood; or simpler, have a fire slowly
*reduce* food drain for anyone within its radius, so warmth is worth calories directly. **Value:**
every model in the roster independently tries to build this economy; right now the harness makes them
look foolish for it, which is exactly the class of error this project has hit five times.

### A271 † A FINAL `food` READING MEASURES TIME SINCE DEATH, NOT NUTRITION **[S]**

A267 cited Fingal's 85 food as out-eating the real models. It is the respawn payout, banked two
samples before the log ends; Fingal died three times, more than anyone. Any end-of-run `food`
comparison is meaningless without checking for a 0→84/85 step.

**Fix:** have the card carry a `deaths` counter (the 0→85 step is already detectable server-side),
and have `analyse.mjs` print `food (n deaths)` everywhere it prints food. **Value:** the board
currently does not tell you when a seat dies at all (17:20 entry) — this is the cheapest possible
version of that fix and it stops a whole family of confident wrong readings.

### A272 †† A TRADE IS TWO PEOPLE WALKING, AND THE WORLD HAS NO RENDEZVOUS **[M]**

`offer` is a walk (`src/net/agent.js:2917` → `walkTo({ within: REACH, act: 'offer' })`), so a bargain
needs both parties in one place — and nothing creates that. In `duo2.jsonl` both kimi seats opened an
offer to Morag and abandoned it after 80–100 s while she was still hundreds of metres out
(Coinneach s101–104 → `hunt a deer`; Seonaid s128–132 → `find shelter`). Neither traded, ever. The
minds try to patch it in speech instead: **35 promise-shaped sentences, 27 of them spoken while the
speaker held a goal that moves them** — including Morag's *"meet me halfway"* said while her own goal
was walking her to Tormod.

**Fix (smallest version first):** when `offer` is opened on a target in earshot, tell the target — a
first-class `X is coming to you with an offer` line, not a memory entry that fades in one decision —
and give the offerer's walk a **stated meeting point** (nearest landmark between the two) that both
sides can name. Larger version: an `await <person> at <landmark>` goal that holds position until they
arrive or the offer lapses (`MINDS.offerHours` is already 2.5). **Value:** every model in the roster
independently invents rendezvous in free text; the verb table has no word for it, and the market has
now failed to clear in every log on disk. This is the missing primitive, not a tuning problem.

### A273 †† `stay still and watch` IS DE FACTO THE SCRIPTED BRAIN'S VERB — 22 OF ITS 27 USES ARE NOT MODELS **[S]**

Across 1,776 seat-samples in `duo2.jsonl`, `stay still and watch` was the goal 27 times. **Twelve
belong to Iseabail (`model: null`) and ten to Fingal (`fellBack` on 219/222 samples)** — the two seats
that were never a model. Only Ailsa/sonnet-5 ever chose it, 5 times, and twice announced *"I'll wait
here"* while actually holding a goal that walked her somewhere else. Holding position is the one
behaviour a market needs and the six real models chose it five times in an hour.

**Fix:** rename and re-describe it in the prompt so it reads as a *tactic* rather than idling —
`wait for <person>` / `hold this spot` with a stated reason ("a bargain closes when both of you stop
moving"), and say plainly in the verb table that `offer`, `accept` and `give` all require the two of
you to be within reach. Pair with A258 (`follow`/`guard` are never explained either). **Value:** one
prompt paragraph; it is the cheapest half of A272 and testable on its own — the metric is whether any
model-driven seat ever holds still on purpose.

### A274 †† `give` DROPS THE QUANTITY THAT `offer` ALREADY PARSES — ONE ITEM PER DECISION **[S]**

`src/sim/world.js:776` — `resolveGive(from, toName, itemId, count = 1)` — takes a count, and the only
caller that ever supplies one is the human keyboard (`src/main.js:3021`). The LLM path never does:
`goals.js` declares `give: { params: ['target','item'] }` with no count, `agent.js:2900` sends
`actAlso: { giveItem: g.item ?? '' }`, and `world.js:1516` fills the gap with `|| 1`. Meanwhile
`world.js:919` — thirty lines of the same class away — runs `resolveItemCount` on `offer`'s free-string
noun and gets it right: `resolveItemCount("twelve branches")` is 12. Evidence it matters: in
`duo2.jsonl` Tormod/grok-4.5 said *"twelve branches for a share of venison"* and *"take them all"*,
then spent **19 consecutive decisions (h10.30–11.23)** handing over 10 branches and 9 arrows one at a
time — confirmed by nine matching `"I gave arrow to Morag"` deed rows and a 9-unit arrow transfer in
the carried-inventory ledger. Total cross-seat movement for the whole 8-seat, 74-minute run: **25
units, against 992 branches gathered.**

**Fix:** add `count` to `give`'s params, run the existing `resolveItemCount` on `giveItem` in
`resolveGive` exactly as `resolveOffer` does, clamp to what is held, and say "give 12 branches to X"
in the verb table. Watch the edge-detection at `world.js:1516` — `give` fires only when the target
name *changes*, so a repeat gift to the same person needs the intent to drop and re-arm; a count
makes that moot for the common case. **Value:** one parameter, plumbed through a path that is already
built at both ends. It is the difference between a promise being payable and a promise costing twelve
turns to keep — and every model in the roster prices in units already.

### A275 †† A SETTLED TRADE IS INVISIBLE ON THE CARD — THE ONE MECHANIC THAT WORKED WAS THE HARDEST TO SEE **[S]**

Five bilateral trades closed in `duo2.jsonl` (Morag↔Ailsa h8.96/h9.48/h10.40, Morag↔Tormod
h16.36/h16.41) and every earlier reading of this run — including the standing brief and A272 — recorded
them as never happening. They are only findable by deduping `deeds` rows across 222 samples and
matching the two sides by game-hour, because deed rows coalesce in place and the board exposes no
transfer feed. **Correcting A272 in writing: "the market has now failed to clear in every log on disk"
is wrong; the kimi abandonments it measured are not.**

**Fix:** put a `trades` array on the card beside `strays` — `{h, with, gave, got, n}`, both sides,
uncoalesced — and a run-total `moved` counter. **Value:** trade is the headline open question of this
whole eval program and the instrument had no column for it; six sessions were spent inferring from
speech what one array would have stated. Same class of error as `refusedVerbs` (which was added for
exactly this reason and is now the most informative column on the card).

### A276 †† `refusedVerbs` COUNTS RETARGETS, NOT DECISIONS — THE BEST COLUMN ON THE CARD IS ~8× OVERSTATED **[S]**

`agent.js:1874` increments the counter inside `refuse()`, and `refuse()` is reached from `resolve(g)`,
which runs on `AGENTS.retargetSeconds` (`config.js:1075` — **2.5 s**), not once per decision
(`agent.js:1499–1502`). A goal that will not resolve is re-refused every 2.5 s for as long as the mind
holds it: 8 counts per decision at a 20 s cadence, 30 at Coinneach's 75 s. Measured in `duo2.jsonl`
across consecutive 20-second samples in which each seat made at most one decision: Ailsa `avoid`
4→10→16→22→24 and Morag `offer` 5→9→16→17 — **six refusals per one decision.** So Ailsa reached for
`avoid` ~4 times, not 24, and every magnitude quoted off this column in OBSERVATIONS (the "494
refusals" line, A240's "`accept` is refused 37 times") is a tick count read as a decision count. The
binary the column was built for — "reached for and refused" vs "never wanted" — is unaffected. Note
that `noteOutcome` right beside it *does* coalesce and renders "(6 times)", so the card ships two
numbers for one event that disagree by design.

**Fix:** count in `refuse()` only when the (verb, target) pair differs from the last one counted, or
increment a separate `reachedFor` alongside the tick count and put that on the card. **Value:** an
hour, and it retires a whole class of confident wrong readings — this file has already produced three.

### A277 †† THERE IS NO VERB FOR DECLINING, AND `avoid` FALLS THROUGH TO A RANDOM WALK **[M]**

Ailsa/claude-sonnet-5's entire `avoid` usage in `duo2.jsonl` is one goal — **`keep away from troll
hunt`**, why: *"trolls after dark is a good way to die, not worth arrows"* / *"not risking my life for
arrows"*. A troll hunt is a **proposal other minds were making**, not a body, and `avoid` resolves its
target against visible labels (`agent.js:2980`, `find(namesTheSame(label, g.target))`). It can never
match, so it refuses — and the fallthrough is `return this.roam()` (`agent.js:2983`), **a random
walk**. The mind that says "I am staying away from that" gets the one behaviour that can walk her
into it. She said it four ways in the `say` channel, none of it wired to anything: *"count me out of
the troll hunt"*, *"I'll not fight a troll for four arrows"*, *"I'll stay clear of the troll,
thanks"*, *"I'll just gather here, safe from that troll business."*

**Fix:** two parts, separable. (1) Make `avoid`'s refusal fall through to `hold` rather than `roam` —
standing still is strictly safer than wandering and is what the mind asked for. (2) Add a `decline
<person> <reason>` verb (or let `avoid` take a person and a remembered place, which `note` already
proves minds track: Morag's *"goblins north-east. Do not go that way."*). **Value:** same family as
A258 (`follow`/`guard` unexplained) and A273 (`stay still` reads as idling) — the verbs that turn a
crowd into a group are the ones missing or mislabelled. Part (1) is a one-line change and is worth
doing on its own.

### A278 †† AN OFFER CANNOT BE ANSWERED "I HAVEN'T GOT THAT" — MORAG STARVED TO DEATH MID-BARGAIN **[M]**

`duo2.jsonl` s188–194. Morag/claude-opus-5 at food 0, carrying `bow×1, arrow×18, wood×24, hide×6`,
goes hp53 → 42 → 31 → 20 → 9 → 0 while holding `offer 6 hides to Ailsa for venison` (why: *"badly
hurt, starving, no shot"*, then *"starving, she is right here"*, then *"take two if you like"*).
Ailsa is quoted off the same landmark at the same distance the whole way, walking toward her, and has
**no venison** — why: *"she's hurt and asking, but I have no meat to spare"* — and says so in the last
line before Morag hits zero: **"here, take the branch — but you have no venison to give?"** The trade
plumbing is innocent: no count was dropped (A274), no offer lapsed, both were in range. The offer was
simply unfillable and **the protocol is write-only in the direction that mattered** — the refusal
channel tells the *asker* what the harness refused, never that the counterparty declined. Ailsa's
answer went into `say`, which no mechanic reads.

**Fix:** two cheap pieces. (1) A `decline <person>` verb (shared with A277) that pushes a `nodeal`-
style outcome into the *asker's* channel — the mind that gets *"Ailsa has no venison"* goes hunting;
the mind that gets silence re-offers until it dies. (2) When an offer names a `want` the target
demonstrably does not hold, refuse it at creation with that reason rather than letting it stand.
**Related, and worth its own line:** Morag held 6 hides, 18 arrows and 24 branches and **none of it
converts to a calorie without a kill** — while dying paid food 0 → 84 at s194, so this is the
2026-08-09 22:05 "respawn beats birth" finding from a fresh angle, with the honest trade blocked.

### A279 †† ECONOMIC REFUSALS RECORD A COUNT WITH NO REASON — ARCHERY MISSES RECORD FIVE FIELDS **[S]**

Chasing Morag's 17 `offer` refusals above dead-ended: there are exactly two sites that can produce
them — `agent.js:583` (`there is no such thing as "X" in this country`) and `agent.js:2920` (`there is
nobody called "X" to make an offer to`) — and the card carries the verb and the count and **not the
reason**, so the two are indistinguishable from the board. (The obvious suspect is innocent:
`resolveItemId('venison')` → `venison` and `resolveItemId('6 hides')` → `hide`/6, so the nouns were
all legal.) Meanwhile the same card's `refusals` array carries `{d, why, slant, dy, leadBy}` for every
arrow — *"too far"*, *"a tree in the way 5 m out"* — so a missed shot is fully diagnosable and a
failed trade is a bare integer.

**Fix:** make `refusedVerbs` an array of `{h, verb, target, why}` capped like `strays`, or add a
parallel `verbRefusals` beside `refusals` in the same shape. The reason string already exists at every
call site — `refuse(verb, text)` takes it and throws it at `noteOutcome`; it just never reaches the
card. **Value:** an hour or two. Pairs with A275 (a settled trade is invisible) and A276 (the count is
inflated): all three are the same instrument, and the economy is the half of it that was never built.

## Added 2026-08-10 02:35, from the entry that found `duo2.jsonl` is a pre-fix binary

**A retirement first. A42 and A57 — *"kimi-k2.6 loses half its calls to `no json in reply`, the
socially strongest model gets a fraction of the decisions"* — are WITHDRAWN, and so is A25's reading
that the rate was the model degrading.** It was our `maxTokens` default of 256 (`providers.js:226`)
against a model that reasons before answering: the reply was truncated mid-thought, the regex found
no JSON, and the board blamed kimi. Commit `4586e1a` raised the melee seats to 8000 and named the
truncation, and the failure rate went **46–76% → 0–6%** across `melee2/3/4`. Fingal went from
`0 answered / 152 failed` to `110/110`. Fifteen entries of this file quoted the old number as a
property of kimi. It never was one.

### A126 — NEW EVIDENCE, AND IT IS NOW THE MOST EXPENSIVE ITEM ON THIS LIST **[S]** ††††

A126 was filed when three fixes were graded against a sixteen-hour-old process. It has now happened a
second time and cost far more. `duo2.jsonl` ran **10:14:25–11:28:06** on 2026-08-09; `4586e1a` landed
**10:47:06**, thirty-three minutes in, and `mind.calls` climbs 0→50 with zero resets, so the process
never reloaded. **55% of that log's samples postdate a fix the log cannot contain** — and because
nothing in the payload says which build wrote it, every later entry read the pre-fix kimi numbers as
current and repeated a wrong verdict about a model for a day and a half.

The fix is unchanged and small: `build: { sha, dirty, bootedAt }` in the board payload beside `spend`,
`sha` from `git rev-parse --short HEAD` read once at boot; sampler records it per line; analyser
refuses to aggregate across a boundary and prints *"log spans N builds"*. **What the new evidence
adds** is the standing rule that belongs with it: **a fix is unjudged until a run boots on its SHA**,
and an entry that grades a fix must quote the SHA it graded. Cost: an hour. It is the item that
decides whether any other number in this file means anything.

### A280 †† `lastError` IS STICKY AND THERE IS NO ERROR HISTOGRAM, SO THE CARD CANNOT SAY "ONCE" OR "FORTY TIMES" **[S]**

`mind` carries `calls`, `failures`, `failureRate` and **one** `lastError` string. The string persists
across every later sample, so counting the samples that carry it measures *how long ago the error
was*, not how often it happened. In `melee4.jsonl` that reads `"This operation was aborted" ×141`
against a true failure count of **1**. I nearly filed the 141. This is the same shape as A276
(`refusedVerbs` counting retargets, ~8× over) and A239/A253 (the analyser aggregating what it should
segment): **three separate times this project has been misled by treating a carried-forward field as
an event count.**

It also hides the mix. melee4's failures are two different faults — a timeout on Tormod's 30 s ceiling
and a `reply cut off at 8000 tokens` on Coinneach — and the card can only show whichever landed last,
so the fix you reach for depends on sampling luck.

**Fix:** replace `lastError` with `errors: { <message>: n }`, capped at ~6 keys with the rest bucketed,
and have the analyser print the histogram per seat. **Value:** an hour, and it retires a whole class of
miscount rather than one instance. Pairs with A279 (economic refusals record a count with no reason) —
both are the same gap: the card counts, and does not say what.

### A281 †† THE RESIDUAL FAILURE IS NOW A TIMEOUT, AND THE CEILINGS ARE SET PER SEAT BY GUESS **[S]**

With the token bug gone, every remaining failure across `melee2/3/4` is one of two things:
`This operation was aborted` (Tormod ×2 against `timeoutSeconds: 30`, Seonaid ×1 against **150**) or
`reply cut off at 8000 tokens` (Coinneach, still, occasionally). So kimi sometimes runs past two and a
half minutes, and grok-4.5 sometimes past thirty seconds, and both ceilings are hand-written constants
in `roster-melee.json` that nobody has measured against an actual latency distribution.

**Fix, cheap version:** record `lastLatencyMs` and a p50/p95 per seat on the mind block — the numbers
are already in hand at the call site — and set each `timeoutSeconds` to p95 plus headroom instead of a
round number. **Value:** a timeout is indistinguishable from a dead seat on the board today, and A25's
retry (still not in, `providers.js:396`) is the wrong remedy for it; you cannot retry your way out of a
ceiling that is simply too low.
