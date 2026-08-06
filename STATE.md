# State of play — read this first, it is short on purpose

`FINDINGS.md` is 3400 lines and `DEV-NOTES.md` is 2900. Reading either cold costs
more context than the work does. This file is the current state. **Update it at
the end of every run**, and cut the closed section rather than letting this
become another archive.

**HOW TO READ IT.** Everything down to "The queue, ranked" is the state of play
and the next thing to do — that is the ~100 lines the brief asks for. Below it,
"Things that will waste your time" is a standing trap list rather than news, and
it is the most expensive knowledge in the repo: every entry cost somebody a
wrong diagnosis. **Skim it before you debug anything, not after.** It is kept
here rather than cut because a closed bug can be deleted and a trap cannot.

Last updated: 2026-08-06, by the run that BUILT queue item 1, proved it works,
and proved it does not matter — then found what actually ends a detour.

**THE DETOUR COMMITS NOW, AND THE KILL RATE DID NOT MOVE.** Queue item 1 is
built, flag-gated and measured on both arms. It does exactly what it promised
and the outcome is unchanged, because the flicker was never the main thing
ending a step aside. **`too far` is.** That is the new queue item 1.

## WHAT SHIPPED: `DETOUR=commit` — a step aside is a destination

`Agent.detourSpot` holds the spot in world coordinates and walks to it. Four
things end the hold and only four: **arrived** (2 m), **`resolve` picked another
animal**, **12 s**, or **one sightline from the FIXED spot** says it is no longer
clear. That last one is the "quarry moved materially" test, and it beats a
distance threshold because what matters is not how far the animal went but
whether it went behind the hill you were walking around. `endDetour` releases
the spot with the episode.

**Default OFF and byte-identical** — `detourcheck` asserts the control arm is
answer-for-answer identical to a bare `clearSpotNear` over 480 ticks.

## IT WORKS. Measured live, four runs an arm.

| | uncommitted | committed |
|---|---|---|
| `clearSpotNear` calls per detour | **14 - 44** | **1.0 - 1.3** |
| ticks spent walking to a remembered spot | **0** | 50 - 211 |
| ground/timber refusals entered, 4 runs | **46** | **15** |
| **deer killed** | **4 of 8** | **4 of 8** |
| metres walked per detour | 1 - 4 | 1 - 2 |
| inside `shootRange`, full-length runs | 16-19% | 10-18% |

Kills are pooled over both A/Bs (eight runs an arm). Dead level. And the number
the last run predicted would climb — **metres walked per detour, toward the 6-20
it asks for — did not climb.** It is still 1-2 m.

## AND HERE IS WHY: `too far` ENDS THE DETOUR, not the flicker

The outcome tally, which was sitting in huntcheck's output all along:

```
  uncommitted   9 of 14 closed detours ended `too far`   (64%)
  committed    15 of 28 closed detours ended `too far`   (54%)
```

**It is the commonest end of a step aside on BOTH arms, by a long way.** The
flicker ended 13-17% of detour TICKS; `too far` ends the MAJORITY of detour
EPISODES. Remembering where you were going does not survive a range check that
fires while you walk there.

The mechanism was written into huntcheck as a guess by the previous run and is
now measured: `clearSpotNear` only offers offsets **PERPENDICULAR** to the line
of sight, so a step aside never closes an inch. `AGENTS.shootRange` is 26 m and
the body is refused at 20-26 m, so the moment the animal drifts the slant
crosses 26, `aimAt` answers `too far` — which carries **no `blockedBy`**, so the
detour branch stops firing and the body turns and walks back at the hill.

## Theories that died, and the newest one was the QUEUE'S OWN

Every one measured, not argued. Print the number before you act on any of these.

| theory | what the instrument said |
|---|---|
| **committing to the detour will move the kill rate** | **4/8 both arms.** It fixed the flicker it was aimed at and changed nothing downstream |
| **the flicker is what stops the walk completing** | it stops 13-17% of TICKS. `too far` stops 54-64% of EPISODES |
| the detour walks sideways FOR EVER / orbits | walks **0-7 m**, 0-2 sign flips. No orbit, no livelock |
| `clearSpotNear` finds nowhere to go | finds a spot **87% on ground, 100% on timber** |
| ground in the way throttles the shot rate | blocked sightlines are **~10 s of a 150 s run** |
| it thrashes between deer (`resolve` picks NEAREST) | **0-5 swaps/run**, longest unbroken stalk **46-86 s** |
| it abandons the animal it wounded | stayed on it **65 of the 72 s after the arrow** |
| the lead is over-projecting (3 of 3 arrows LEFT) | `aimed 0.2 m ahead`. Velocity is already clamped at 14 m/s |

The 23-refusals-against-2-detours arithmetic that started the null-rate theory
was **two TRANSITION counts**, and a 90% null rate was read straight out of it.
Measured per tick it is 13%. Transition counts and tick counts are not the same
denominator and nothing in the output said which was which.

## What separates a green run from a red one

**Every green run put ONE arrow into ONE deer and ate** — kill in 61-72 s, one
animal, zero or one detour. **Every red run's arrows went HOME** — `vsModel`
0.0-0.5 m, lead 0.1-0.2 m, the aim is not the problem — and banked one or two
wounds without a kill. A deer takes two arrows and the body gets 1-4 away in
150 s, because it is inside `AGENTS.shootRange` for only **14-17%** of the run.

**Shot RATE is the whole tail.** Not aim, not ballistics, not target selection.

## `detourcheck` — 12/12, no port, no server, no wall clock

**The one check here that is not real-time, on purpose.** huntcheck stays the
outcome test, but a memory ACROSS TICKS is invisible in an outcome and perfectly
visible in isolation. It drives the real `Agent.prototype` over real terrain at
**24 sites found by scanning**, not pasted in as coordinates.

It reproduces the field measurement independently — **17% of ticks come back
NOWHERE TO GO mid-walk**, against the 13% measured in the game — and it asserts
each of the four things that end a hold by the WORD the method wrote, so a hold
ending for the wrong reason cannot pass as one ending for the right one.
**Committed 24/24 arrive; uncommitted 1/24.** The counterfactual (disable
`commitDetour` in the real code, re-run, `git checkout --`, grep to prove the
probe is gone) puts it at **4/12**.

Careful reading one number: the uncommitted arm walks 18 m there and 1 m in the
game. Same 17% flicker counted in two places — in the game a null tick also
CLOSES the episode, in the harness nothing does.

## The instruments, cumulative

- **detour episodes** (`openDetour`/`walkDetour`/`endDetour`): one obstruction,
  one decision, one named outcome, with ground WALKED against NET displacement
  and sign-flips. Prints its own arithmetic and says so out loud if the books do
  not balance. **Read the OUTCOME tally — it named this run's finding and it had
  been printing it for a run and a half before anybody read it.**
- **`resolves`/`held`/`dropped`** per episode: how many times it asked, how many
  ticks it walked to a remembered spot, and what ended the last hold.
- **`detourAsked`/`detourNone`** per TICK with the blocker named — built
  precisely because the transition-count inference above was wrong.
- **the wound event carries `i: creature.id`.** Nothing acts on it yet.
- **`leadBy`/`dropTo`** carry the aim's INPUTS into the miss table, so a wrong
  answer can be read against what it was asked.
- huntcheck prints **which arm is loaded** at the top and beside the detour
  table. It is red about a third of the time with nothing changed; a run that
  does not say which arm it was is a run nobody can read afterwards.

## CLOSED EARLIER, kept to three lines each

**The bow is understood** (`ballisticscheck` 7/7, port 8088): median **0.17 m**
from its own model out to 151 m, and the one real bias in it — `Bow.fire` spawns
the shaft 0.55 m down the aim line while every model launched from the eye — is
fixed as `BOW.muzzle`. The phantom "arrows land long" was geometry.

**A body can say it picked something up** (`Agent.notePack`) and **a craft deed
is no longer a keypress** (`Agent.noteMake`) — `World.update` refuses a craft in
total silence, so a body at a cold fire filled its report with meals it never
cooked. Both proved red as well as green; `survivalcheck` 12/12, 11/12 with the
old line put back.

**The miss table measured the wrong thing** for three sessions: `across` is
against the LEAD-ADJUSTED mark, so it structurally could not see a mis-lead.
`leadAcross`/`leadAlong` put the DEER's own position into the shot-line frame.

## THERE IS A BOARD. `BOARD=on npm run agents` -> http://127.0.0.1:8090

One card per mind, repainting once a second: who it is, what model, which
persona (hover the tag), what it is doing, WHY, how its body is, what is in its
pack — and four threads of which only the first was ever visible, through chat:

  meant · did · went astray · would not shoot

**"would not shoot" is the best line on the page.** Off by default, loopback
only, cannot kill the run hosting it. `boardState` is pure (agents in, JSON out)
so the check builds boards from invented agents too. `boardcheck` **35/35, and
it discriminates — 27/31 with three fields broken.** It has lied twice and been
caught twice; fixture values now come out of REAL payloads.

## THE LADDER IS DONE. All six rungs green.

**1. SURVIVE** `survivalcheck` 12/12 — forage, light, cook, eat, live the night.
**2. HUNT** `huntcheck` kills in 60-102 s when it kills, on one arrow. The tail
is half understood — see the top of this file. **DO NOT TUNE CONSTANTS**: three
passes of that moved the failure around, and the two real mechanisms were both
found by measuring EPISODES and their named OUTCOMES instead of aggregates.
**3. MINDS & PROVIDERS** `providercheck` 25/25. One OpenAI-compatible provider
plus Anthropic; `MINDS_PROVIDER/BASE_URL/MODEL/API_KEY`, per-agent overrides in
a roster file. Proved against a local fake endpoint — no key needed to test.
**4. PERSONAS** `personacheck` 21/21. `PERSONAS=off|on|hoarder,liar,…`; OFF is
byte-identical to the old prompt and the check asserts the BYTES. **`SCARCE=0.7,0.5`
is the gentler setting if a full roster starves** — at full strength a spawning
player's 18 animals become 4.
**5. WATCHABLE — both miles.** `NARRATE=on` puts each mind's goal, reason and
persona in the chat column (`watchcheck` 10/10); `BOARD=on` gives a watcher the
whole fleet on one page (`boardcheck` 35/35).
**6. A FULL ROSTER** `MAX_PLAYERS` 16, measured: 60 Hz tick unmoved at 12 and
16, 56-65 KB/s per client. The TICK is not the ceiling, the WIRE is — everybody
is in everybody's snapshot, so the total grows with the SQUARE of the roster.
`node server/rostercheck.js 8091 24` before anybody promises thirty-two.

## For the evening itself

```
DANGER=no-bears SCARCE=on node server/server.js 8080
MINDS_ROSTER=roster.json PERSONAS=on NARRATE=on BOARD=on npm run agents  # keys in the ENVIRONMENT
npx vite --port 5173 --strictPort
```

**Put http://127.0.0.1:8090 on the second monitor** and play in the first. The
chat column tells you what, the board tells you why, and only the board keeps it
on screen long enough to read.

The header prints what is ACTUALLY about to play — a line per player, its model,
its character, and `(no XAI_API_KEY)` beside anyone who quietly fell back to
scripted. Read it. Other knobs, all off by default: `HOURS=1`, `RAID=6`,
`STOCK=venison:2`, `HUNGER=52`, `DETOUR=commit`.

**`DETOUR=commit` is safe to add for the evening and is not recommended yet.**
It works by every mechanism number and it did not change a single outcome, so it
buys nothing a watcher can see. Leave it off unless you want the hunting bodies
to walk more purposefully round hills on camera, which they measurably do.

## Checks

`firecheck` 57 · `companioncheck` 45 · `glidercheck` 42 · `campcheck` 36 ·
`boardcheck` 35 · `weathercheck` 27 · `providercheck` 25 · `netcheck` 24 ·
`personacheck` 21 · `mindcheck`/`clockcheck` 21 · `warmthcheck` 20 ·
`deathcheck` 19 · `bookcheck`/`reportcheck`/`raidcheck` 18 · `timbercheck` 17 ·
`agentcheck` 17 · `ordercheck` 17 · `dangercheck`/`herdcheck`/`rendercheck` 12 ·
`survivalcheck` 12 · `bitecheck` 10 · `spreadcheck` 10 · `watchcheck` 10 ·
`detourcheck` 12 · `refillcheck` 9 · `scarcecheck` 9 · `shotcheck` 8 ·
`huntcheck` 7 · `arrowcheck`/`woundcheck` 7 · `ballisticscheck` 7 ·
`rostercheck` 6.

**`detourcheck` needs NO port** — no server, no socket, no wall clock. It is the
only check here you can run on a busy box and believe.

Ports: **ballisticscheck 8088**, boardcheck 8093 (plus 8090 for its own board and
8089 for the fleet's), rostercheck 8091, watchcheck 8092, scarcecheck 8094,
survivalcheck 8095, huntcheck 8096, refillcheck 8097, herdcheck 8098,
shotcheck/bitecheck 8099. The board's own default is **8090**. `refillcheck`
walks a real body about 1.3 km and takes roughly four minutes — the distances
ARE the test. `netcheck` and `survivalcheck` want a quiet box. **ballisticscheck
spends the whole twelve-arrow quiver and takes about three minutes.**

## Known red, and honestly so

- `netcheck` "it went with her" (a companion trailing a continuously moving
  owner) is the long-known load-sensitive one.
- `huntcheck` — **8 green of 16 across this run's two A/Bs**, four runs an arm
  each, on a box that was NOT quiet: five `node.exe` were already running and one
  of them owns 8080. They were left alone rather than killed, so read the rate
  accordingly. Sixteen earlier runs on a quiet box gave ten green. **The rate is
  not the finding; the mechanism at the top is.**

## The queue, ranked

1. **A STEP ASIDE MUST ALSO CLOSE.** The measured bug — see the top of this
   file. `too far` ends **54-64% of all detour episodes on both arms**, and it is
   a pure consequence of geometry: `clearSpotNear` offers candidates ONLY
   perpendicular to the line of sight, so a step aside holds the range exactly
   while the animal drifts. `AGENTS.shootRange` is 26 m and the body is refused
   at 20-26 m, so the slant crosses 26 almost immediately, `aimAt` answers
   `too far`, that answer carries **no `blockedBy`**, the detour branch stops
   firing and the body walks straight back at the hill.

   **PLAN — two candidates, and the first is much smaller.** (a) Give
   `clearSpotNear` DIAGONAL candidates: offset perpendicular AND a few metres
   toward the quarry, so stepping aside closes range instead of preserving it.
   Nearest-first still holds. This is what a person does and it is a change to
   one function with one caller. (b) Alternatively, do not let `too far` end a
   committed detour — a detour IS a walk to a firing position, and being briefly
   out of range mid-walk is not a reason to abandon it. Cheaper still, but it
   papers over the geometry rather than fixing it. **Prefer (a); consider (b) if
   (a) does not take.** Flag-gate either way.

   **HOW IT WILL BE PROVEN.** The instrument is built and the numbers to move
   are: the `too far` share of detour OUTCOMES (54-64% today) falling, and
   `deer N m -> M m` on the per-detour lines showing M **smaller** than N — today
   a detour holds the range or loses it. Metres-walked per detour should also
   finally climb off 1-2 m. **Run four times an arm minimum:** kills are 4 of 8
   on both arms today and a single run proves nothing whatsoever.

   **DO NOT expect the kill rate to move on its own evidence.** This run's fix
   worked perfectly by every mechanism number and left kills at 4/8 vs 4/8.
   Shot RATE is still the tail, and the body is inside `shootRange` for only
   10-19% of a run.

2. **`p.lastCraft`** (world.js:911) is written on every successful craft and read
   by nothing anywhere — a confirmed-make signal already sitting on the server,
   if anyone wants it on the wire rather than inferred from the pack.
3. `glider.js` samples ridge lift upwind with `(−sin, −cos)` while integrating
   flight in `(+sin, +cos)`. **Half answered: a BODY walks along `(−sin yaw,
   −cos yaw)`, measured on the server four ways.** So `(−sin, −cos)` is this
   project's forward and the glider's integration is the odd one out — but
   whether `wind.angle` means "blowing toward" or "coming from" is still
   unestablished, and that is the half that decides the sign.
4. **Arrows fired at ~0 m all miss.** Unexamined since the aim fix.
5. **Nothing comes back DOWN about your own animal** — hurt, fed, killed.
6. **Crouch is a uniform Y squash of the whole avatar.**
7. **An arrow that outlives `ARROW.maxFlightTime` is spliced out with NO
   `onMiss`** (projectiles.js:205). Nothing observed it — ballisticscheck waits
   past 12 s so a silence there is real — but a mind that shoots into the sky
   would never learn that it did.
8. **A shot solved at 3.04° pitch for a deer 19.9 m away**, our own model saying
   it would come down at 93.4 m, and it hit a tree 37.8 m from there. Seen ONCE,
   on a steep downhill shot (`dropTo` is in the miss table now to catch the
   next). Neither a lead nor an arc explains it alone. Not chased because one
   arrow is not a finding — but if `dropTo` shows up large on the next few, it
   is `solvePitch` on steep ground.
9. **The 68 → 37 creature drift — measured, and BENIGN.** It tracks how spread
   out people are, not a leak. 11-19 animals within 320 m of EVERY body, all
   run. Only reopen if somebody sees a hillside go quiet in play.

## Things that will waste your time if you do not know them

- **ASSERT THE COUNTER THAT REACHES A HUMAN, NOT THE ONE YOU FIND CONVENIENT.**
  `detourSpot` kept two: a body-global tally and a per-episode one. The check
  asserted the global; huntcheck PRINTS the episode's. The uncommitted path
  incremented only the global, so a live A/B reported **"1.0 solves per detour"
  for the arm that re-solves thirty times a second** — the seed value, wrong in
  the direction that flattered the change, which is the worst direction. Fifth
  instrument in this project to report something it had not measured.
- **RUN THE COUNTERFACTUAL BEFORE YOU BELIEVE YOUR OWN GREEN.** Disabling
  `commitDetour` in the real code took `detourcheck` from 12/12 to 4/12 and
  caught two assertions that were **passing on nothing**: "every held tick names
  the same place" was true of ZERO held ticks, and the arrival test was an `||`
  a body that never arrives satisfies. Neither would ever have failed on its own.
- **THE OUTCOME TALLY WAS PRINTING THE ANSWER FOR A RUN AND A HALF.** This run's
  whole finding — `too far` ends the majority of detours — came out of a block
  huntcheck had been printing since the previous run. Nobody read it, because
  everybody was reading the averages above it. **Read every line of your own
  instrument's output before you build anything to add to it.**
- **A TRANSITION COUNT IS NOT A TICK COUNT.** "23 ground refusals against 2
  detours" reads as a 90% null rate and is nothing of the kind: both numbers
  count STATE CHANGES, and measured per tick the null rate is 13%. An inference
  from two counts with different denominators cost a whole theory this run, in a
  session whose entire lesson was not to infer mechanisms from aggregates.
- **A GROUND IMPACT IS NOT A MISS DISTANCE.** The mark is a chest 0.75 m up; the
  shaft lands on the dirt. At a two-degree descent that is **ten to fourteen
  metres of overshoot built into every honest shot**, and it SHRINKS with range
  as the descent steepens. Read `vsModel`. The yardstick is printed at the end of
  `ballisticscheck` so nobody has to re-derive it.
- **AN EMPTY QUIVER IS COMPLETELY SILENT.** The starting kit is twelve arrows,
  and `Bow.fire` calls `cancel()` and returns when `consumeAmmo` fails: no
  shaft, no event, no complaint on the wire. **Count your arrows before you
  believe a range effect.**
- **A TOLERANCE ON THE MEAN CANNOT SEE A BIAS.** ballisticscheck's first verdict
  passed +0.31 m as "no systematic error" while every one of twelve arrows erred
  the SAME WAY. Test the SIGN SPLIT.
- **DO NOT LET A PRINT STATEMENT ASSERT A CAUSE.** The "did it stay on that
  animal" line editorialised — "an animal it then walked away from" — and
  printed that over its own numbers showing the body stayed for 68 of 133
  seconds. That is FOUR instruments in this project that claimed something they
  had not measured (`hit` as a boolean, `along` as marksmanship, the board
  twice, this). Outcomes name what was SEEN; the reader judges the cause.
- **AND CHECK THE ARGUMENT IS USED.** The same block took the wound's timestamp
  and never referenced it, counting the whole run instead of the part after the
  arrow. It looked right, it read right, and it was measuring something else.
- **PROVE WHICH ARM IS LOADED BEFORE YOU BELIEVE A NUMBER.** `git stash push
  <file>` AFTER committing stashes nothing, and `git checkout -- <file>` on an
  UNTRACKED file restores nothing. Both are silent, both exit 0. **The
  counterfactual that works:** commit first, mutate, run, `git checkout --
  <file>`, then grep to prove the probe is gone AND the real code is back.
- **FORWARD IS `(−sin yaw, −cos yaw)`.** Measured on the server four ways, not
  assumed. Walking a body with `(+sin, +cos)` marches it briskly in the opposite
  direction and yields a beautifully consistent set of numbers about a journey it
  never made.
- **A probe that never revisits ground cannot see a refill bug.** Four bodies
  walking outward in straight lines gave identical numbers with the bug and
  without it. The movement has to come BACK.
- **A `//` COMMENT PUT INSIDE `boardHtml()`'s TEMPLATE LITERAL IS NOT A COMMENT**
  — it is page text, and any backtick in it ENDS THE STRING. **And `npm run
  build` was green**, because vite never compiles `server/` at all. The only
  gate on a server file is running it. **But NOT on a `*check.js` file** — every
  one ends in `main().catch(…)`, so importing it RUNS it. Use `node --check
  <file>`; it is instant and it does not play the game.
- **`| head -N` ON A CHECK LOOKS EXACTLY LIKE THE CHECK DYING EARLY.** `head`
  closes the pipe; exit code 0 and the run was fine.
- **A FED-IN FAKE MADE OF A PLAIN OBJECT AND TWO BORROWED METHODS STOPS TESTING
  ANYTHING THE MOMENT THE REAL METHOD GROWS A THIRD CALL.** Build the body with
  `Object.assign(Object.create(Agent.prototype), {…state})` so the METHODS are
  real and only the state is invented.
- **`server.close()` NEVER CALLS BACK while a keep-alive socket is open**, and
  both a watching browser and `fetch` hold one. It reads exactly like a spin
  loop somewhere else. Track the connections and `destroy()` them.
- **CHECK YOUR INSTRUMENT BEFORE BELIEVING IT.** timbercheck's first pass
  compared collider positions at 1e-6 and reported 2048 of 2149 trees "wrong".
  The colliders come back out of a **Float32Array**. The bug was the check.
- **A tally of intents is not evidence of an outcome.** `arriveWithin` is 6 m and
  `PICKUP.radius` is 2.2: a body pressed E thirty-five times at nothing and every
  check read it as gathering.
- **A FIXTURE WRITTEN FROM THE SAME GUESS AS THE CODE DOES NOT TEST IT, IT
  RATIFIES IT.** Copy fixture values out of a real payload.
- **`me.f` arrives at 20 Hz against a body running at 30** — anything the server
  confirms needs a cooldown on this side.
- **The agent's game clock wraps at 24.** Count real seconds off `dt`. And the
  wound log keeps GAME hours while huntcheck's trace keeps REAL seconds — do not
  compare them without picking one.
- **`highlands.capture()` RUNS A FRAME.** Tune in the source, not the console.
- **`ctrl.yaw = x` is the same trap as `ctrl.position.set` and `warp`.**
- **Sandbox pins `feltC`/`effectiveC`/`wetness`** — `ruleset.current.survival`.
- **`highlands.build()` takes NO argument.** `structures.place('glider', …)`.
- **`HOURS=1` moves the spawn to the other side of the lake** (~420 m).
- **A number that reproduces exactly is a CONFIGURATION, not a drift.**
- **Kill stray processes at the END of your run** — `netstat -ano | grep
  LISTENING` then `taskkill //PID n //F`. 8080 belongs to somebody else's server.
- **A KEY RELEASE YOU DO NOT STEP IS NEVER SENT**; keys go on `window`;
  `javascript_tool` gives up at 30 s and `const` leaks between calls.
- **NEGATIVE `ctrl.pitch` LOOKS DOWN**; `flightHeading(yaw) = yaw + PI`.
- **Two check harnesses run back to back collide.** Re-run the loser alone.
- **Scatter colliders are `highlands.scatter.colliders`**; a creature's Object3D
  is `c.object`; lit fires are `highlands.fires.active`; `hud.heard` holds
  objects — read `h.text`.

## How to play it

Join at `http://localhost:5173/?join=ws://127.0.0.1:8080&name=Claude&danger=no-bears`,
click a mode button (**Sandbox** for `warp`/`spawnPack`), then drive with
`window.highlands.stepWorld(1/60)` in REAL time. **The pane does not composite
when it is not displayed**, so `requestAnimationFrame` never fires and the world
looks frozen-but-connected. It also reports a **0×0 viewport**, so click the mode
button from the page rather than by element ref and check
`highlands.ruleset.current.id`. `highlands.capture('name')` writes a JPEG to
`shots/` — **read those images**; under ~5 KB means the blind-pane bug is back.

## The trap this project falls into

**A name used and never defined** — invisible to build, only found by running the
line. Grep every identifier your new code uses. **And a clean build proves
nothing**: one run's build was green while `gather` had never once put a branch
in a pack. Verify by driving the game, and make the check assert an OUTCOME.
