# Mission — the door is unlocked, so walk in through it

You are playing Highlands in a browser. Whoever wrote this is the one changing
the code, and cannot see your session. This file and `DEV-NOTES.md` are the
whole conversation between you.

## Before you start

```js
await highlands.mission()      // this file
highlands.danger('no-bears')   // do this — see "the world" below
await highlands.beat()         // want: "wrote a line to SESSION.log"
```

If `beat()` says `no recorder`, **reload and start again** — the recorder
switches itself off the first time it cannot reach the dev server and does not
switch back on by itself. Re-check it after any reload.

**Keep this tab in the foreground.** The recorder rides on the animation frame,
so a hidden or backgrounded tab silently stops writing. If you have to hand-step
the world with `highlands.stepWorld`, say so in a note — the log cannot tell.

Pick **Survival**, and any companion.

## The world

Bears will end a run in seconds. `highlands.danger('no-bears')` unless the
mission says otherwise. Nobody learns anything from you being eaten en route to
testing something else.

## What changed since last night — both because of your reports

**1. `B` now asks what to build.** It used to call "build whatever the camp is
missing", which evaluated to a windbreak unconditionally, forever — which is why
four sessions never flew, and why it looked like a glider problem for three of
them. B opens a chooser listing all six, with costs, and greys out what you
cannot afford saying what you are short of.

**2. The wing buffets before it stalls.** Measured, it used to say "stalled" at
the exact instant it stalled and be unrecoverable a second later. It now
complains at 72% of the critical angle, and that message outranks everything
else on screen.

**3. The book's build hint said "hold E where you want it".** That was simply
wrong — building was never an E interaction. It now says "press B and choose".

## Mode: NAIVE first, then INSTRUMENTED

The order matters. Do leg 1 before you read anything at all.

### 1. NAIVE — is the door findable, or just unlocked?

**Read nothing. No source, no `FINDINGS.md`, no debug handles except `report`
and `beat`.** Play a fresh run as someone who has never seen this game.

The fix above makes building *possible*. It does not obviously make it
*discoverable*, and that is a different question that only a cold run answers.

- Gather, get cold, and try to make yourself a shelter. **How did you find out
  that B was the verb?** Controls list, the book, guessing, or not at all?
- When the chooser opens, is it obvious what to do with it? Did you know the
  number keys work?
- Did you find out the glider exists this time? Say when, and from what.
- How long from spawn to your first built structure?

Report that leg before reading on. It is the only cold run we will get on this
change.

### 2. INSTRUMENTED — fly it, and see whether the warning is any use

Now read what you like. Hand yourself materials — that part is not the test:

```js
highlands.inventory.add('hide', 10)
highlands.inventory.add('wood', 20)
```

Build the wing from the menu, carry it to a hill, and fly. Then the real
question:

- **Pull back until it buffets.** Does "buffeting — ease off" arrive in time for
  a *person* to act on? My harness recovers from it with 2.0 m/s of sink, but my
  harness reacts in one frame and you do not. If it is still effectively fatal,
  say so with the timing — that is a finding and I will widen the margin.
- Does the message read as a warning, or as flavour you would ignore?
- Fly at least three times. The first tells you it works; the third tells you
  whether it is any good.
- Work a ridge in a headwind and try to climb. **Can you tell you are going up**
  without watching the ground?

### 3. If there is time — the chain nobody has walked

**bow → deer → hide → wing**, with nothing handed to you. Earlier sessions
reported only 8 deer in the world, never closer than ~227 m, and zero hides
across two and a half days. A wing costs 10. If a link is impassable, stop there
and report it with the arithmetic — a broken link IS the finding.

## How to report

Little and often. A note costs you one line and you will forget the interesting
part by the end.

```js
await highlands.report({
  verdict: 'confusing',            // works | broken | confusing | unreachable
  about: 'the build chooser',
  found: 'I only found B because the controls list mentions it.',
  steps: ['got cold', 'opened Shift+B', 'pressed B'],
})
```

Where you are, what you are carrying, the weather and **the last twenty things
the game said to you** are attached automatically. Never write those down.

`verdict: 'unreachable'` for anything you only found because this file told you
it existed. Still the most damning verdict available.

## Do not

- Read anything during leg 1. That leg is worthless if contaminated.
- Teleport, or fly for free. Materials may be handed to you on leg 2; the flight
  has to be yours.
- Worry about dying. Dying is data — report what killed you, then restore a
  checkpoint or start a fresh run and carry on.
- Stand still for an hour. Last night 64% of beats were motionless and 42% of
  the session was one spot in a lake. If something will not let you act, file
  the note and walk away rather than nudging at it.
