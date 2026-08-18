# Trajectory — where this is going, and in what order

**[VISION.md](VISION.md)** says what the world IS. This says where the WORK is
going. **[STATE.md](STATE.md)** is where it is today; **[TODO.md](TODO.md)** is
the tiered backlog. When those disagree with this file, this file is the one
that decides what to build next.

## THE OBJECTIVE, in one sentence

**Interesting, human-like behaviour and interaction between models across many
kinds of play — in a world a human can discover, watch, and understand as it
happens.**

Everything below serves that. A feature that does not make the minds more
interesting, or their behaviour more legible, is not on the path.

## THE STANDING RULE

**A solid foundation first, then additions.** The temptation in a project like
this is always another feature, and this repo has a long record of features that
were built on something quietly broken — a bow no agent could draw, a verb that
deleted its own noun, a noun that made itself compulsory, a survival world whose
minds had no word for eating, a check green over a path no caller could reach.
When the foundation and a feature compete, the foundation wins. Every time.

Corollary: **nothing counts until an outcome test says so over a real socket.**
Not "did it deliberate" — did it eat.

**And a second corollary, bought on 2026-08-17: TEST THE GESTURE, NOT THE
FIELD.** Dropping was broken for every human player — the mouse wheel changed
the hand in the browser and never told the server, so the server stayed on slot
one and refused every drop by naming the bow. Three socket-level checks were
green over it the whole time, and green for the same reason: `dropcheck`,
`inventorycheck` and `pulsecheck` all set `selectSlot` by hand. **A check that
drives the protocol agrees with a client that never sends it.** The failure is
one layer above the one this repo learned to test, and no amount of socket
discipline reaches it. Where a gesture cannot be driven — a wheel is a DOM
event, there is no socket to press it over — assert it from the source and say
in the check that the assertion is the weak one. See `handcheck`.

---

## THE SIX ARCS

Roughly ordered. Later arcs are not blocked by earlier ones, but effort should
flow down this list, not up it.

### 1. Minds worth watching  ← THE CORE

Models that behave like people with intentions: they hunt, trade, lie, form
groups, hold grudges, and change their minds for reasons you can read.

- **Where we are.** The minds already talk, coordinate, negotiate, and deceive.
  A liar written as a liar suppressed five cooperative agents in one run.
  FEEDING THEMSELVES — the blocker since 2026-08-07 — is **fixed in the harness
  and unproven in a run**, and those are not the same claim. Four breaks, all
  found on 2026-08-11: `gather` deaf to the singular "branch" (82 of 98
  decisions refused), a bare gather turning into a wander, no verb for eating at
  all, and the server honouring one `eat` pulse twice. `npm run foodcheck` holds
  all four, 20/20, over a real socket with a control arm.
  **PROVEN IN A LIVE RUN, 2026-08-11 (late)** —
  [runs/FOODTEST-2026-08-11.md](runs/FOODTEST-2026-08-11.md). The chain
  completed: kill → gather → fire → cook → eat, three of four model seats, two
  vendors, 0 failed calls. **And the scripted control came last but one** — she
  out-foraged every model and starved anyway, because she cannot hunt. With
  gather fixed, THE BINDING CONSTRAINT MOVED UPSTREAM TO HUNTING.
  **AND FEEDING IS NOW ROUTINE, 2026-08-17** —
  [runs/GROK46DUO-2026-08-17.md](runs/GROK46DUO-2026-08-17.md). Two grok-4.6
  seats, 40 minutes, 55 calls, $0.66, **0 failed calls between them**. Both
  hunted, gathered, lit fires, cooked and ate; both finished at 100hp having
  also fletched arrows. That is the food chain running unremarkably rather than
  being demonstrated, which is the difference between a fix and a foundation.
- **Done looks like.** A model-driven seat survives a night unaided, and two
  seats reach an outcome neither could reach alone. **Neither has happened yet.**
  The 2026-08-17 pair got closest anything has: both converged on the same fire,
  one offering meat for the use of it. They still arrived as two individuals who
  wanted the same object. A green check is not this milestone and must never be
  reported as it, and neither is a friendly-looking transcript.
- **Also still open:** no mind has CHOSEN the `eat` verb — every meal in the
  proof run was the reflex. The verb is for eating early, above the threshold
  the reflex waits for, and it wants `SCARCE=on` to have a reason to exist.
- **AND THE NEW BINDING CONSTRAINT, 2026-08-17 — THEY BARGAIN IN WORDS AND
  NEVER REACH FOR THE VERB.** `offer`, `give`, `accept`, `attack` and `guard`
  have still never been used by a real model, and the duo run finally shows why
  that is not indifference. The pair argued over a carcass for twenty minutes
  from a consistent position — *"that deer is mine"* / *"that deer is no one's
  till it's down"* — and then bargained over a fire in plain, priced language:

      Fingal:  "need that fire. meat for the use of it"
      Fingal:  "mine. gold if you want a share"
      Ailsa:   "coming for your fire"

  A stated price, a counter, and a share put up for gold — **priced in a
  currency neither of them held a single coin of.** Both finished the run on
  gold 0, and there is no way in the world to earn one except from each other.
  **The intention is fully present and the execution is absent.** So the gap is
  not motivation, and it is not the brief failing to describe the world. It is
  the distance between saying a price and reaching for the verb that settles
  one — and the strong suspicion that talking is simply the cheaper move,
  because nothing in the world ever enforces or rewards a deal. A trade that
  changes nothing is a trade no rational seat needs a verb for.

  **This is arc 1's front now.** Feeding is behind us; trading is where
  "human-like interaction between models" is actually blocked. The next work is
  a fair test of that suspicion rather than another verb: make a deal worth
  striking, and see whether the verb gets reached for on its own. If it still
  does not, the fault is in how the brief offers the verb, and that is a
  different fix from making trade matter.

### 2. A world a human can read  ← THE MULTIPLIER

Watching must be as good as playing. If a run is not legible, it teaches nothing
and it is not worth the tokens it cost.

- **Where we are.** The board exists (one card per mind: what it means, does,
  shoots, refuses), and a mind's own brief now tells it when it was refused.
  **The OPERATOR's view is the half that is still broken** — see the debt below.
- **Done looks like.** A person who has never seen the code can watch a run and
  say why each mind did what it did — and an instrument that is broken says so
  rather than reading zero.
- **Standing debt — silent failure is the enemy here, and all five of these are
  open.** Verified against the tree on 2026-08-11, with the mechanism named so
  nobody has to re-diagnose them:
  1. ✅ **CLOSED 2026-08-11 (late). Refusals now reach the report.**
     `playreport` splits *"never reached for"* from *"reached for and refused"* —
     opposite conclusions that looked identical for the life of the project, and
     the shape that hid "the models cannot feed themselves" through four fixes.
     The tally is also now **once per decision** rather than once per retarget:
     it read `gather: 73` against 50 decisions, from a mind holding 16 branches
     it had picked up, which reads as a broken verb when the verb was working.
  2. ✅ **CLOSED 2026-08-12. The fleet clock counts real time.** It did
     `elapsed += STEP` inside a `setInterval` — counting ticks and calling them
     seconds. Under load an interval fires late, so the clock ran 26% slow: 110
     minutes reported against 150 actual. It is also the clock `shutdown()`
     read, **which is why an hour run kept spending past the hour it was given.**
     Now `server/fleetclock.js`, extracted so it can be tested at all, with
     `fleetcheck` 13/13 — including the assertion that guards the budget.
     *The fixed `STEP` fed to `agent.update()` is untouched and must stay: a
     seeded run has to reproduce. Determinism forbids a wall clock in the SIM,
     not in the stopwatch.*
  3. ✅ **CLOSED 2026-08-12. The unwell alarm repeats.** `_warnedUnwell` was
     latched true forever, so a seat that degraded, recovered and degraded again
     reported only the first spell — and silence reads as recovery. The latch
     now resets on recovery and repeats every `AGENTS.unwellRepeatSeconds`.

  **AND A CORRECTION TO THIS LIST, which was written on 2026-08-11 claiming all
  five were "verified against the tree".** Three were. The two below were
  ALREADY FIXED when they were written down, and were carried over from
  STATE.md's account of the hour run without being re-checked — which is the
  exact failure this file was corrected for the day before. A closed bug listed
  as open costs somebody an afternoon proving it is not there.

  4. ✅ *Already closed when listed.* "A rate below the threshold is invisible" —
     `AGENTS.unwellAbove` is **0.08**, not the 0.2 the hour run sat under, and
     the console line already names failures per seat rather than aggregating.
  5. ✅ *Already closed when listed.* "Speech dropped by a gag whose units do not
     match" — the success branch reaches `onLog`, and the gate compares
     decisions against `speakEveryDecisions`, which is decisions. The 65-gagged /
     0-said figure is from the hour run, before that fix. Speech worked
     throughout the 2026-08-11 proof run.

  **So arc-2's standing debt list is EMPTY.** That is not the same as arc 2 being
  done — "a person who has never seen the code can watch a run and say why each
  mind did what it did" is the bar, and it has not been tested on a person.

  **TWO INSTRUMENTS SPOKE UP ON 2026-08-17, and both were working correctly.**
  Neither is a regression; both are findings, and both want tuning rather than
  fixing.
  - **The fleet clock warned that the run was 23% behind real time** — 1856 s of
    thinking inside 2404 s of wall clock. That is debt item 2 doing its job: the
    clock is honest now, and what it is honestly reporting is that a slow seat
    cannot hold a cadence. **Every cadence in that run was effectively a fifth
    longer than `roster-grok46duo.json` claims**, which quietly invalidates any
    comparison drawn against a run that kept up. A roster's cadence is a request,
    not a fact, and the write-up has to say which it got.
  - **The gag swallowed 11 of 29 lines as "too soon".** `speakEveryDecisions` was
    tuned against fast seats; against a 60–75 s thinker it throws away a third of
    the output of the very seats whose output costs the most. Arc 2 is about
    legibility, and a third of the talking discarded is a legibility problem.

### 3. The recorder — a camera that flies itself

An agent in free-fly that follows the action and films it, for videos and for
study.

- **Where we are.** `?watch=1` gives a camera that flies and is never corrected;
  free-fly no longer fights the server. `capture()` writes frames to disk. The
  pieces exist; nothing drives them.
- **Done looks like.** A run can be handed a director: it finds what is
  happening, frames it, records it, and leaves a watchable artefact behind
  without a human steering the camera.

### 4. Something a human can run without me

Today a session needs an AI to start it. That is a hard ceiling on who can use
this and how often.

- **Where we are.** `PLAY.cmd`, `keys.cmd`, `STOP.cmd` and `RUNNING.md` already
  hide most of it. `keycheck` proves a roster before a token is spent.
- **Done looks like.** Somebody who is not us downloads it, sets keys, runs one
  file, and has a server with minds in it — including on another machine.
- **The test.** If a step needs explaining in chat, it is not finished.

### 5. Everything you look at

Graphics, animation, the models, the world. Continuous, never "done".

- **Where we are.** Bows are visible on other players and read at a hundred
  metres. Deaths animate. The world is entirely procedural — zero asset files —
  and that constraint stays: it is what makes the whole thing cheap to ship.
- **Done looks like.** Nothing. This arc is a habit, not a milestone: every
  session leaves one thing better looking than it found it.

### 6. More world

More creatures, more weather, more places, more to do — and PvP, tribes, and
scenarios worth benchmarking.

- **Deliberately last.** Most of it is already half-built (parties are real, PvP
  is gated by geography, trolls exist and are unmeetable). Adding to a
  foundation that does not hold is how this project has lost weeks before.

---

## DECIDED, and not up for re-litigation

- **PETS DEFAULT TO OFF.** They are a fun option, not part of the core loop. A
  companion at every heel muddies every reading of what a MIND did — a pet that
  finds food or fights for you is a confounder in exactly the measurement this
  project exists to take. Opt in, never by default.
- **The world stays procedural.** No asset files, ever. It is why clients
  download nothing and why any seed is a new world.
- **Determinism is not negotiable.** Seeded RNG only. A run must reproduce.
- **Every mind is behind the seam.** Rules, scripted and model minds all produce
  the same intent, and the simulation never learns which.
- **Personas ship with an off switch, and off is byte-identical.** The control
  arm is what makes any personality result mean anything.

## WHERE WE ACTUALLY ARE, 2026-08-17

**Arc 1 is still the live front. The food chain is no longer the whole of it —
trade is.**

What changed since the entry below. Feeding stopped being the question: on the
17th two grok-4.6 seats hunted, cooked, ate and fletched for forty minutes with
0 failed calls and no intervention. Nobody had to prove it; it simply happened
while the run was doing something else. That is what a solved foundation looks
like, and this file should say so plainly having spent two entries refusing to.

**The blocker moved to trade, and for a reason worth writing down.** The same
pair bargained fluently — a stated price, a counter, an offer of a share — and
never once called `offer`, `give` or `accept`. Five verbs shipped, socket-tested
and unused. The evidence now says this is not a missing intention, so the next
move is NOT a sixth verb. It is to make a deal worth striking and see whether
the verb is reached for unprompted. **`SCARCE` hard, one fire between two, and
something only the other seat can give you** is the run that decides it.

**And a warning of the same shape the entry below carries.** On the 17th two
bugs turned up that had nothing to do with the minds, in a tree with a fully
green suite over both:

- **Dropping was broken for every human player** and had been for some time. The
  wheel never told the server; the server refused every drop by naming the bow.
  Three green socket checks sat over it because all three drove the protocol
  field directly instead of the gesture. Now `handcheck`, 17/17, with a
  counterfactual that drives the old behaviour and asserts it still puts down
  the wrong thing.
- **The 25-second autosave had been writing nothing at all**, throwing inside
  the world step where the loop's own fault tolerance swallowed it. Found by
  reading a console during a live run — there is no `savecheck`, and a silent
  `catch` around a step is exactly where this class of bug goes to live.

Both were found by STANDING THE GAME UP AND LOOKING AT IT, not by the suite.
The suite's job is to stop a fixed thing breaking again; it has never been the
thing that finds them. **Budget a look at the running game into every session,
and read the console while it runs.**

Arcs 3–6 stay shut. The rule that nothing in them starts while arc 1 is unproven
still holds — "unproven" now means *no two seats have reached an outcome neither
could reach alone*, which is a harder bar than the feeding one it replaces.

---

## PREVIOUS ENTRY, 2026-08-11 — kept as the warning it asks you to read it as

Arc 1 is still the live front, and the food chain is the whole of it.

**Read the previous entry as a warning, not as history.** On the 10th this file
said `gather` had learned its noun and the blocker was "Fixed; unproven in a
live run". The run came, and it was not fixed: **635 decisions, 0 items, 0
meals.** The noun fix had itself broken `gather` three new ways — the word
`none`, the singular `branch` (82 of 98 decisions, every one refused), and the
field left out entirely, which turned a bare gather into a wander. A fourth bug
sat under those: the server honoured one `eat` pulse on two consecutive ticks.
**"Fixed" written before an outcome test is a guess with a tick beside it**,
and this file believed one for a day.

All four are now fixed and covered by `npm run foodcheck` (20/20) — real bodies,
real socket, staged above both reflex thresholds with a control arm, asserting
the meat left the pack and the belly filled. Minds also have a word for eating
for the first time; note that bodies always ate by REFLEX, so the missing verb
was never what caused the 0 meals. The gather break was upstream of all of it.

**Still unproven in a live run, and arc 1's "done looks like" is not met:** no
model-driven seat has yet survived a night unaided, and no two seats have
reached an outcome neither could reach alone. The next thing is the FAIR trio
re-run — kimi's 3000-token ceiling made the hour run a two-model test wearing a
three-model label.

Arc 2 is second, and cheap: per-seat failure attribution, and a speech limit
counted in decisions rather than game hours.

Arcs 3-6 are open. Nothing in them should start while arc 1 is unproven — and
"unproven" now means *no live run has shown a mind feed itself*, not *no check
is green*.
