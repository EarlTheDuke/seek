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
