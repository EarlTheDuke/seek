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
deleted its own noun, a check green over a path no caller could reach. When the
foundation and a feature compete, the foundation wins. Every time.

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
  A liar written as a liar suppressed five cooperative agents in one run. What
  they cannot reliably do is FEED THEMSELVES — the blocker since 2026-08-07.
- **Done looks like.** A model-driven seat survives a night unaided, and two
  seats reach an outcome neither could reach alone.

### 2. A world a human can read  ← THE MULTIPLIER

Watching must be as good as playing. If a run is not legible, it teaches nothing
and it is not worth the tokens it cost.

- **Where we are.** The board exists (one card per mind: what it means, does,
  shoots, refuses). Miss events, refusal reasons and dropped goal fields are all
  surfaced rather than silent.
- **Done looks like.** A person who has never seen the code can watch a run and
  say why each mind did what it did — and an instrument that is broken says so
  rather than reading zero.
- **Standing debt.** Silent failure is the enemy here. An 11% call-failure rate
  hid below a 20% alarm; half of all speech was dropped by a gag whose units did
  not match the cadence. Both are instrument bugs, and both are arc-2 work.

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

## WHERE WE ACTUALLY ARE, 2026-08-10

Arc 1 is the live front. `gather` could not take its noun until tonight, which
is most of "the models cannot feed themselves" — three starving minds spent 83
minutes asking for meat and being handed branches. Fixed; **unproven in a live
run**, and that is the next measurement.

Arc 2 is second, and cheap: per-seat failure attribution, and a speech limit
counted in decisions rather than game hours.

Arcs 3-6 are open. Nothing in them should start while arc 1 is unproven.
