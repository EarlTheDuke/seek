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
- **Done looks like.** A model-driven seat survives a night unaided, and two
  seats reach an outcome neither could reach alone. **Neither has happened yet** —
  the proof run was 17 minutes, not a night, and nothing was achieved jointly.
  A green check is not this milestone and must never be reported as it.
- **Also still open:** no mind has CHOSEN the `eat` verb — every meal in the
  proof run was the reflex. The verb is for eating early, above the threshold
  the reflex waits for, and it wants `SCARCE=on` to have a reason to exist.

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
  2. **The fleet clock counts ticks, not time.** `agents.js` does
     `elapsed += STEP` inside a `setInterval` — nominal 30 Hz. Under real load
     the interval slips, so `elapsed` drifts behind the wall: 110 minutes
     reported against 150 actual, 26% slow. It is also the clock `shutdown()`
     reads, which is why an hour run did not stop at the hour. *Fix it with the
     wall clock, and note this is the RUNNER, not the sim — determinism forbids
     wall-clock inside the simulation, not in the thing measuring how long a
     session took.*
  3. **The unwell alarm fires once per agent, ever.** `_warnedUnwell` is set and
     never cleared, so a seat that degrades, recovers and degrades again is
     reported once. Paired with (4) below, a failing model can look quiet.
  4. **A rate below the threshold is invisible.** An 11% call-failure rate sat
     under a 20% alarm for 83 minutes. A threshold with no trend behind it only
     catches disasters.
  5. **Speech is dropped by a gag whose units do not match the cadence** — 65
     sentences gagged, 0 logged as spoken, in a run whose whole point was
     model-to-model talk.

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

## WHERE WE ACTUALLY ARE, 2026-08-11

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
