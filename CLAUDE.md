# Highlands — read this first

This file loads automatically in every session opened in this folder. It is a
map, not an archive: it says where to look and what not to break. Keep it short.

## The two files that orient you

1. **[STATE.md](STATE.md)** — where the project is TODAY and what to do next.
   It opens with the next actions. Read it before anything else, and **update it
   at the end of every session**. Below its state section is a TRAP LIST: every
   entry cost somebody a wrong diagnosis. Skim it before you debug, not after.
2. **[TRAJECTORY.md](TRAJECTORY.md)** — where the work is GOING: the objective,
   six arcs in order, and the decisions that are not up for re-litigation. Read
   it whenever you are choosing WHAT to build rather than how.

`VISION.md` is the world's design and is stable. `TODO.md` is the tiered
backlog. `RUNNING.md` is how a human starts a game.

## What this is

A cold highland survival world, entirely procedural — no asset files, ever —
with an authoritative Node server, and LLM-driven players that hunt, trade, talk
and lie alongside humans. The point is **interesting, human-like behaviour
between models, in a world a human can watch and understand.**

## Non-negotiable

- **Determinism.** Seeded RNG only. No `Math.random`, no wall-clock in the sim.
  A run must reproduce from its seed.
- **Every mind is behind the seam.** Keyboard, network packet and language model
  all produce the same intent; the simulation never learns which.
- **The honesty rule.** A mind is given its body's SENSES, not the world's
  state. No coordinates, nothing behind a hill, nothing it has not perceived.
- **The world stays procedural.** Zero asset files. It is why clients download
  nothing and any seed is a new world.
- **Pets default to OFF.** They are an option. A companion that finds food or
  fights for you is a confounder in the measurement this project exists to take.
- **Flag-gate anything risky, and keep the default byte-identical.**

## Verify before every commit

```
npm run build
npm run <name>check      # the relevant ones — there are ~80
```

There is **no typecheck script** here. **A FAILING CHECK EXITS 0** — parse the
output, never the exit code.

## The rules this repo paid for

- **PREFER SOCKET-LEVEL CHECKS.** The bugs here live BETWEEN client and server.
  Every agent test passed for years while no agent could draw a bow. Copy
  `shotcheck`/`huntcheck`/`inventorycheck`: spawn a real server, connect real
  sockets, assert an OUTCOME — did it eat — not an intention.
- **INSTRUMENT, DO NOT GUESS. And check your instrument before believing it.**
  Most wrong diagnoses here came from reasoning about a bug instead of printing
  the state, or from a bad string filter reading zero and being believed.
- **A name used and never defined is invisible to the build** and only found by
  running the line. The single most repeated bug here. Grep every identifier.
- **WHEN A MODEL LOOKS INCAPABLE, SUSPECT THE HARNESS FIRST.** Nine times now
  the model was fine and had no channel for what it was trying to do: look sent
  as deltas that were half dropped, a `gather` noun deleted at the door, an
  inventory field the server never sent, a token ceiling truncating a reasoning
  model mid-thought, and a verb for eating that does not exist. **Check the mind
  can EXPRESS the thing before concluding it will not do it.**
- **ONE WRITER AT A TIME.** Pause the `highlands-triage` scheduled task before
  working here or before Ben plays — it edits source, and a dev-server reload
  throws a player back to the menu. Two writers in this tree have already cost
  more than any single bug.
- **Two check harnesses run back to back collide.** Re-run the loser alone.

## Never commit

- `keys.cmd` or any secret. Keys live there; it is gitignored and stays that way.
- `playthrough.save.json`, `play.command.json`, run logs.
- Stage files **by name**. Never `git add -A`.
- Delete throwaway probes before committing.

## Be honest

A red check that describes a real gap is worth more than a green one that lies —
a stale server on a port once made `bitecheck` report 3/10 and it was written up
as a product defect it never was. If you cannot finish something, say so in
STATE.md rather than half-landing it.
