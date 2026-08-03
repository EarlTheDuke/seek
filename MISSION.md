# Mission — fly the thing, and find out why nobody can eat

You are playing Highlands in a browser. Whoever wrote this is the one changing
the code, and cannot see your session. This file and `DEV-NOTES.md` are the
whole conversation between you.

## Before you start

```js
await highlands.mission()      // this file
highlands.danger('no-bears')   // do this — see "the world" below
```

Open the dev server's page (`npm run dev`, usually http://localhost:5173).
Pick **Survival**, and any companion.

## The world

Bears are the hardest thing in this game and they will end a run in seconds.
Turn them off with `?danger=no-bears` in the URL or `highlands.danger('no-bears')`
**unless the mission says to test them.** Nobody learns anything from you being
eaten on the way to testing something else.

## Mode: INSTRUMENTED

The opposite of the last mission. Read what you like, use the debug handles, go
straight at the mechanic.

Three sessions have now answered the old question — *can a player find out the
glider exists?* — and the answer was no, three times, in writing. Do not spend a
fourth night re-deriving it. Everything downstream of that question is still
completely unproven, because no run has ever got a wing off the ground: the
glider costs 10 hides, hides come from deer, and nobody has ever killed one. So
tonight you skip the queue.

## What to attack, in order

### 1. Fly it — the main event

Hand yourself the materials and go. The wing is the point, not the shopping:

```js
highlands.inventory.add('hide', 10)
highlands.inventory.add('wood', 20)
```

Then build it, launch it, and answer the three questions no session has ever
reached:

- **Launch.** The prompt says something like "160% downhill ahead of you". Did
  that number mean anything to you before you jumped? Did you know which way to
  face, or where you were allowed to put the wing down?
- **Stay up.** Wind blowing up a slope should lift you. Find a hillside facing
  into the wind and fly *along* it rather than straight off the front. Did you
  climb? **Could you tell you were climbing** — is there anything on screen
  saying "you are going up" other than the ground getting further away?
- **Land.** Did it survive? Did you keep the wing, and could you find it again?

Fly more than once. The first flight tells you whether it works; the third tells
you whether it is any good.

### 2. Then — why can nobody eat?

Ten minutes, and it unblocks every future session. Every food in this game is an
animal; nothing grows on the hill. Three runs have now starved without eating
once. Deer are a known problem. **Trout are not**, and they are meant to be the
reliable half of the food economy.

Wade into the loch and try to fish. Then:

```js
highlands.fishing()      // the odds on the nearest shoal, and why
highlands.nearestFood    // what "seek" would point your otter at
```

- Standing in open water, was there ever anything to press? Last session waded
  out for a full minute and reported no prompt at all.
- `highlands.fishing()` reports wade depth, crouch, your noise and how spooked
  the shoal is. **Could you have worked any of that out from the screen?**
- Try the otter's **Seek**. Last session the pet stalled at "33% there / it does
  not know you well enough" and never moved again — see whether you can tame one
  at all, and how long it takes.

## How to report

Little and often beats one summary at the end — a note costs you nothing and
you will forget the interesting bit.

```js
await highlands.report({
  verdict: 'confusing',            // works | broken | confusing | unreachable
  about: 'launching the glider',
  found: 'The prompt shows a percentage. I had no idea whether 160% was good.',
  steps: ['built it on the ridge north of the loch', 'pressed E', 'nose-dived'],
})
```

Where you are, what you are carrying, the weather and **the last twenty things
the game said to you** are attached automatically. You never need to write those
down. `highlands.heard()` shows them if you want to see what you are about to send.

Use `verdict: 'unreachable'` for anything you only found because this file told
you it existed. That is still the most damning verdict available.

## Do not

- Teleport to a hilltop, or use the debug handles to fly for free. You may
  **hand yourself the materials** — that is the whole point of tonight — but the
  flight has to be yours or it tells us nothing.
- Worry about dying. Dying is data. Report what killed you.
- Stand still for three hours. The last session spent 73% of its beats
  motionless, much of it re-reading a refusal message. If something will not let
  you act, file the note and walk away rather than nudging at it.

---

*Rewritten overnight by the triage watcher, 2026-08-02 22:20 PDT, after the
previous session had been silent for half an hour. The evidence behind every
claim above is in `FINDINGS.md`.*
