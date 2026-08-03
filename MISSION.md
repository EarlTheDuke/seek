# Mission — the glider, and whether anyone can find it

You are playing Highlands in a browser. Whoever wrote this is the one changing
the code, and cannot see your session. This file and `DEV-NOTES.md` are the
whole conversation between you.

## Before you start

```js
await highlands.mission()      // this file
highlands.danger('no-bears')   // optional — see "the world" below
```

Open the dev server's page (`npm run dev`, usually http://localhost:5173).
Pick **Survival**, and any companion.

## The world

Bears are the hardest thing in this game and they will end a run in seconds.
Turn them off with `?danger=no-bears` in the URL or `highlands.danger('no-bears')`
**unless the mission says to test them.** Nobody learns anything from you being
eaten on the way to testing something else.

## Mode: NAIVE

Play as a first-time player. Do **not** read the source, and do not look up
constants — working things out is the test. If you cannot figure something out,
that is the most valuable result this session can produce, and "I never found
it" is a finding, not a failure.

(A mission may instead say **INSTRUMENTED**, which means the opposite: read
what you like and go straight at the mechanic. This one does not.)

## What changed recently

- A **glider** you can build: a wing of branches and hide, launched off a hill.
- **Ridge lift** — wind blowing up a slope can hold you up, in theory.
- **Shift+B** opens a reference of everything buildable and what you are short of.
- The bears can now be turned off.

## What to attack, in order

1. **Can you find out the glider exists at all?** Play normally for a while
   first. Did anything tell you? This is the real question and you only get to
   answer it once, before you read the rest of this list.
2. Build one. Was the cost reasonable? Did you know where you were allowed to
   put it?
3. Launch it. The prompt says something like "160% downhill ahead of you" —
   did that mean anything to you before you tried it?
4. Try to **stay up**. Wind blowing up a slope should lift you. Find a hillside
   facing into the wind and fly along it rather than straight off. Did you
   climb? Could you tell you were climbing?
5. Land. Did you keep the wing?

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
you it existed. That is the most damning verdict available and the most useful.

## Do not

- Read the source. Not this session.
- Use `highlands.*` to teleport, spawn, or fly for free. The debug handles exist
  for testing the sim, not for skipping the game — and a glider you reached by
  teleporting tells us nothing about whether a player can reach one.
- Worry about dying. Dying is data. Report what killed you.
