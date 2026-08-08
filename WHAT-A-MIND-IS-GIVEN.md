# What a mind is given — memory, perception, and what everyone else does

Written 2026-08-08, answering Ben's question: *"what do people normally give the
models so they have the info they need to play the game? I am wondering about
memory. Are they able to remember what happened in a mindful way?"*

Short answer to the memory question: **no, and it is worse than it looks. A
memory in this game has a half-life of exactly one decision.** Measured, below.

---

# Part 1 — What we actually give a mind today

Every decision, a model receives a `brief` — the whole of what it knows:

| field | what it is |
|---|---|
| `place` | *"379 m south-west of Rowan Moor"* — prose, not coordinates |
| `hour` / `light` / `weather` / `wind` | the world clock and sky |
| `goal` | what it decided last time |
| `health` / `hunger` / `cold` | its own body, in words |
| `carrying` | the pack — **filtered to `n > 0`** |
| `contacts` | up to 6 things it can see within 140 m, each with bearing, coarse distance, what they are doing, condition, and whether there is a clear shot |
| `shotBy` | who shot it, kept out of the ring buffer on purpose |
| `heard` | the last 8 lines of chat |
| `memory` | **5 lines** |

That is a genuinely good perception layer. Coarse words rather than numbers
(*"close"*, *"a little way off"*), bearings, a sightline flag — it is close to
what the field converged on. **The memory is the hole.**

## The measurement: a memory survives one decision

`Memory` is a 40-entry ring. `recent()` hands the model the **last 5** entries
inside a 24-game-hour window. The problem is what competes for those slots:

- **every 2 seconds** (`AGENTS.noticeSeconds`), up to **2 sightings** are written
- **every decision**, up to **6 more** sightings are written (`maxContacts`)

At a 20-second cadence that is **~26 writes between two thoughts, into a
40-entry ring, of which the model sees 5.**

Replaying that exact write pattern against the real `Memory` class, with three
real events injected:

```
decision  3 | events still visible: I brought down a deer
            "I brought down a deer"
            "a deer close, walking"
            "a deer a little way off, walking"
            "a deer close, running"
            "a deer far off, walking"
decision  4 | events still visible: Eachann offers me venison for wood
decision  5 | events still visible: I decided to say: that deer is mine
decision  6 | events still visible: NONE
decision  7 | events still visible: NONE
```

**Every event is visible for exactly one decision and then gone.** Four of the
five lines a model ever sees are *"a deer, somewhere, walking"*.

### This explains most of today's run

- **The repeated sentence.** Coinneach said *"Eachann, that deer is mine"* three
  times across three separate decisions with three different stated reasons. It
  had no memory of having said it — the line *"I decided to say…"* was evicted
  before the next decision.
- **The barter that never happened.** *"go toward Eachann — offer branches for
  some of that meat"* was a two-step plan. By step two the plan was gone.
- **Nobody ever follows up on anything.** There is nothing to follow up *from*.
- **The rivalry with Coinneach is re-derived from scratch every time** — Eachann
  sees him in `contacts`, not in memory. It looks like a sustained grudge and it
  is actually the same thought had forty times.

The code already half-knew this. A comment at `agent.js:986` says the intentions
log is *"kept out of `Memory`'s forty-entry ring buffer, which fills with
noticing: an hour of walking past deer and a body has forgotten it ever decided
anything."* The fix applied was to protect the **report**. What the **model**
sees was left alone.

---

# Part 2 — What the field does

## Generative Agents (Stanford "Smallville") — the canonical memory design

The reference architecture for exactly this kind of game. Three parts:

1. **A memory stream.** Every observation is a natural-language record with a
   timestamp — an append-only log, not a ring buffer. Nothing is evicted.
2. **Retrieval scored on three axes**, not one:
   - **recency** — exponential decay
   - **importance** — the model rates each memory 1–10 when it is written
     ("ate breakfast" = 1, "my partner left me" = 10)
   - **relevance** — embedding similarity to the current situation
3. **Reflection.** Periodically the agent reads its own recent memories and
   writes *higher-level* ones: *"Klaus is dedicated to his research."* Those
   reflections then compete for retrieval like any other memory.

**We have recency and nothing else, over a buffer that evicts.** The single
biggest gap between this project and the state of the art is not the model, the
world, or the verbs — **it is that importance does not exist**, so a deer
walking past outranks being offered a trade.

## Voyager (Minecraft) — the skill library

The finding that matters: **removing the skill library cost 15× in progress
speed.** Voyager writes successful behaviours to a library as code and retrieves
them later, so a solved problem stays solved. Our minds re-solve "how do I get
meat" every twenty seconds, for ever.

## Project Sid / PIANO (Altera, 1000+ agents in Minecraft)

The closest thing to what this project is becoming. Key ideas:

- **Multiple concurrent modules** — separate streams for reacting, speaking,
  planning — rather than one prompt doing everything at one cadence. Our single
  `decide()` has to choose between hunting and talking *with the same call*,
  which is very likely part of why nobody talks.
- **A "cognitive controller"** that keeps the parallel streams coherent, so an
  agent does not say one thing and do another.
- Emergent results that map directly onto our ambitions: **specialised roles, a
  merchant hub, and gems adopted as a common currency for trade** — the exact
  thing our gold is waiting to become.

## lmgame-Bench — the benchmarking lesson

The relevant design decision: **modular perception / memory / reasoning
scaffolds that can be switched on and off**, so you can tell whether a model
failed at seeing, remembering, or thinking. Also: symbolic state beats raw
pixels for LLMs by a wide margin — which our prose brief already gets right.

**This is directly applicable and cheap.** `MEMORY=off|recency|scored` as a run
setting turns "is this model bad at this" into "is this model bad at this
*given* memory", and the difference between the two arms is itself a result.

## Multi-agent social benchmarks — where this project could be distinctive

`Cattle Trade` (bluffing, bidding, hidden-information bargaining), `Werewolf` /
`Avalon` (deception and theory of mind), `Diplomacy` (negotiation with
opponent modelling), `Melting Pot` (mixed-motive cooperation), `DSGBench`
(six strategic games), `M3-Bench` (**process-aware** evaluation of social
behaviour in mixed-motive games).

**Two things stand out for us:**

- Almost all of them are **turn-based and text-only.** A real-time embodied world
  with scarcity, distance and a human in it is a genuinely different axis, and
  the fact that our minds must *walk to* a trade is a real constraint nobody
  else is testing.
- `M3-Bench`'s **"process-aware"** framing is the same conclusion today's run
  reached independently: score the reasoning, not just the outcome. We arrived
  at it by watching a model plan a barter and score zero on trade.

---

# Part 3 — What I would give a mind, in order

## F1 †††  Split the memory stream in two **[S]**
The cheapest fix with the largest effect. **Perception must not evict events.**
Two rings — `noticed` (sightings, small, disposable) and `happened` (kills,
trades, gifts, shots, speech, decisions — larger, protected). The brief takes
a few from each.

That alone raises the half-life of *"Eachann offered me venison"* from one
decision to dozens.

## F2 †††  An importance score **[M]**
Even a hand-written table beats nothing: being shot = 9, a trade offered = 8, a
kill = 7, a decision = 5, a sighting = 1. Retrieve by `importance × recency`.
The full Generative Agents version asks the model to rate its own memories,
which costs a call — the table is free and captures most of the benefit.

## F3 ††  Tell a mind what its own last action did **[M]**
Already the top item in `IDEAS.md` from this morning's run, and it is really a
memory problem wearing a different hat: *"you laid a fire"*, *"your shot was
refused — no clear line"*, *"you said that already"*, *"you have no arrows."*
Five observed pathologies collapse into this one fix.

## F4 ††  State the pack in the negative **[S]**
`carrying` filters to `n > 0`, so an empty quiver is an **absence in a list**
rather than a fact. A model has to notice something missing to infer it cannot
shoot — the one thing language models are worst at. One mind hunted for an hour
with an empty bow.

## F5 ††  A standing plan that survives between decisions **[M]**
Every decision starts from nothing but a one-line goal. Give a mind two or three
lines of **its own plan**, carried forward and editable — *"1. get meat.
2. trade wood to Eachann for some. 3. camp at Hollowed Beinn."* This is the
missing half of the barter: the model formed the plan and had nowhere to put it.

Cheaper than Voyager's skill library and gets a lot of the same benefit.

## F6 †  Separate the speaking channel from the acting channel **[M]**
PIANO's core idea. Right now `say` **is a goal** — choosing to speak means not
choosing to hunt, and a spoken goal then pinned one mind's body for nine
minutes. Speech should be a second, cheap, fast stream running alongside the
action decision. **This is very likely the main reason six models across two
days have produced one sentence between them.**

## F7 †  A coarse "who else is out there" channel **[S]**
`A0` from `IDEAS.md`, restated as a perception item: name and bearing for anyone
on the roster at any range. People who know each other do not lose each other
permanently because one walked over a rise.

## F8  Named landmarks in the prompt, and `goTo <person>` **[M]**
Both minds already navigate to named places unprompted (*"make for Hollowed
Beinn"*, *"make for Sunny Muir"*), so the naming layer works. Make it possible
to **agree** on one: *"meet me at the standing stone."*

## F9  A private notebook **[M]**
One editable scratch field a mind writes and reads back — its own notes,
persisted across decisions and across a save. Costs almost nothing and gives a
model somewhere to keep a grudge, a price, or a promise. It is also the single
most *watchable* thing on this list: **a page you can read.**

---

# Part 4 — How this serves the two goals

## For watching

**The memory is the story.** A mind with a protected event stream and a
notebook has a narrative a person can read: *what it saw, what it decided, who
it blames.* The board already shows goal-and-reason, which is this project's
real moat. Memory turns a series of disconnected reasons into a plot.

Specifically watchable, in rough order of payoff:

- **A "what he remembers" panel** on the board, beside the goal and the reason.
  Free once F1 exists, and it is the most interesting thing on the screen.
- **The notebook (F9)** rendered as an actual page in the UI.
- **Grudges and debts as visible state** — once events survive, *"Eachann has
  refused me twice"* is a thing the world can display and a watcher can root
  for or against.
- **The commentary track** (`C1` in `IDEAS.md`) gets dramatically better with an
  event stream to narrate from.

## For benchmarking

**Every one of these is a switch, and a switch is an experiment.**

| setting | what the A/B measures |
|---|---|
| `MEMORY=off / recency / scored` | how much of a model's competence is memory scaffolding versus the model |
| `PLAN=off / on` | can it hold a multi-step intention at all |
| `SPEECH=goal / channel` | is the silence a capability limit or a harness limit |
| `FEEDBACK=off / on` | how much of the repetition is the world's fault |
| `PERSONAS=off / on` | already exists, and today it produced a real result |

This is exactly `lmgame-Bench`'s modular-scaffold design, and it is the honest
way to report anything: **"grok scored X *with this scaffold*"** rather than
"grok scored X". Two days of this project have already produced two findings —
the quarry bug and the memory half-life — where a model looked incompetent and
the harness was at fault. That is the failure mode to design against.

The differences between arms are also **more publishable than the absolute
numbers**. "Memory scaffolding is worth more than three model tiers" is a real
result. "Model A beat model B on our unvalidated survival metric" is not.

---

## The one-line version

We built a good pair of eyes and forgot to build a memory. Everything the field
learned in 2023 about memory streams — importance, relevance, reflection,
protection from perception noise — is missing, and today's run is a fairly clean
demonstration of what happens without it: **models that understand the situation
perfectly, one decision at a time, for ever.**
